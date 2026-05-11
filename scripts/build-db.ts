/**
 * Build the local SQLite database from raw sources:
 *   1. data/bg_pop.csv         (Census ACS B01003 block-group centroids + pop)
 *   2. data/raw/sfmta.zip      (GTFS — Muni bus + light rail + cable car)
 *   3. data/raw/bart.zip       (GTFS — heavy rail subway/metro)
 *   4. data/raw/caltrain.zip   (GTFS — commuter rail)
 *
 * Output: db/circle.sqlite
 *
 * Schema highlights:
 *   - block_groups      regular table (geoid, lat, lng, pop, county)
 *   - block_groups_rtree  R*Tree spatial index (degenerate bbox per centroid)
 *   - stops             regular table (stop_id, name, lat, lng, category)
 *   - stops_rtree       R*Tree spatial index
 *   - stops_fts         FTS5 contentless index for prefix name search
 */
import Database from "better-sqlite3";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const RAW = path.join(DATA, "raw");
const DB_PATH = path.join(ROOT, "db", "circle.sqlite");

const REFRESH_CENSUS = process.argv.includes("--refresh-census");
const BG_CSV = path.join(DATA, "bg_pop.csv");

// California Bay Area + a few adjacent counties (FIPS).
const COUNTIES: Record<string, string> = {
  "001": "Alameda",
  "013": "Contra Costa",
  "041": "Marin",
  "055": "Napa",
  "075": "San Francisco",
  "081": "San Mateo",
  "085": "Santa Clara",
  "095": "Solano",
  "097": "Sonoma",
  "067": "Sacramento",
  "099": "San Joaquin",
  "113": "Yolo",
};

// GTFS route_type → category mapping (route_type 5 cable car & ferry 4 excluded).
function categorize(routeTypes: Set<number>): "bus" | "tram" | "rail" | null {
  if (routeTypes.has(1) || routeTypes.has(2)) return "rail";
  if (routeTypes.has(0)) return "tram";
  if (routeTypes.has(3) || routeTypes.has(11)) return "bus";
  return null;
}

type CsvRow = Record<string, string>;
function parseCsv(buf: Buffer | string): CsvRow[] {
  return parse(typeof buf === "string" ? buf : buf.toString("utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as CsvRow[];
}

function loadGtfs(zipPath: string) {
  if (!existsSync(zipPath)) return null;
  const zip = new AdmZip(zipPath);
  const files: Record<string, CsvRow[]> = {};
  for (const name of ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]) {
    const e = zip.getEntry(name);
    if (!e) {
      console.warn(`  ! ${path.basename(zipPath)} missing ${name}`);
      continue;
    }
    files[name] = parseCsv(e.getData());
  }
  return files;
}

/**
 * Pull block-group centroids from TIGERweb and population from the Census ACS
 * API. The Census API allows 500 requests/IP/day without a key; supply
 * CENSUS_API_KEY to remove the cap.
 */
async function refreshCensus() {
  const key = process.env.CENSUS_API_KEY;
  console.log(`==> Refreshing Census ACS data via API${key ? " (with key)" : " (no key)"}…`);
  const all: string[] = ["geoid,county,lat,lng,pop"];

  for (const [fips, name] of Object.entries(COUNTIES)) {
    let apiUrl =
      `https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E` +
      `&for=block%20group:*&in=state:06%20county:${fips}`;
    if (key) apiUrl += `&key=${encodeURIComponent(key)}`;

    const resp = await fetch(apiUrl);
    if (!resp.ok) {
      console.warn(`  ! ${name} (${fips}) ACS failed: ${resp.status}`);
      continue;
    }
    const data = (await resp.json()) as string[][];
    const [header, ...rows] = data ?? [];
    if (!header) continue;
    const idx = {
      pop: header.indexOf("B01003_001E"),
      state: header.indexOf("state"),
      county: header.indexOf("county"),
      tract: header.indexOf("tract"),
      bg: header.indexOf("block group"),
    };

    // TIGERweb layer 8 = "Census Block Groups". The ArcGIS server caps results
    // per query (default 2000), so we paginate with resultOffset until done.
    const centroids = new Map<string, { lat: number; lng: number }>();
    let offset = 0;
    const PAGE = 2000;
    // Safety bound: 50 pages = 100k features, well above any county's count.
    for (let page = 0; page < 50; page++) {
      const tigerUrl =
        `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022/MapServer/8/query` +
        `?where=STATE%3D%2706%27+AND+COUNTY%3D%27${fips}%27` +
        `&outFields=GEOID,CENTLAT,CENTLON&returnGeometry=false&f=json` +
        `&outSR=4326&resultOffset=${offset}&resultRecordCount=${PAGE}`;
      const tigerResp = await fetch(tigerUrl);
      if (!tigerResp.ok) {
        console.warn(`  ! ${name} TIGER failed: ${tigerResp.status}`);
        break;
      }
      const tigerJson = (await tigerResp.json()) as {
        features?: { attributes: { GEOID: string; CENTLAT: string; CENTLON: string } }[];
        exceededTransferLimit?: boolean;
      };
      const feats = tigerJson.features ?? [];
      for (const f of feats) {
        const a = f.attributes;
        centroids.set(a.GEOID, { lat: parseFloat(a.CENTLAT), lng: parseFloat(a.CENTLON) });
      }
      if (feats.length < PAGE && !tigerJson.exceededTransferLimit) break;
      offset += feats.length;
    }

    let written = 0;
    for (const row of rows) {
      const geoid = `${row[idx.state]}${row[idx.county]}${row[idx.tract]}${row[idx.bg]}`;
      const c = centroids.get(geoid);
      const pop = parseInt(row[idx.pop] ?? "0", 10);
      if (!c || !pop) continue;
      all.push(`${geoid},${name},${c.lat},${c.lng},${pop}`);
      written++;
    }
    console.log(`  ✓ ${name}: ${written.toLocaleString()} block groups`);
  }
  writeFileSync(BG_CSV, all.join("\n"));
  console.log(`  → wrote data/bg_pop.csv (${all.length - 1} rows)\n`);
}

async function main() {
  // Auto-refresh if the CSV is missing, or on explicit --refresh-census.
  if (REFRESH_CENSUS || !existsSync(BG_CSV)) await refreshCensus();

  // Ensure db dir exists, wipe prior file.
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (existsSync(DB_PATH)) rmSync(DB_PATH);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  console.log("==> Creating schema…");
  db.exec(`
    CREATE TABLE block_groups (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      geoid     TEXT UNIQUE NOT NULL,
      county    TEXT,
      lat       REAL NOT NULL,
      lng       REAL NOT NULL,
      pop       INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE block_groups_rtree USING rtree(
      id,
      min_lat, max_lat,
      min_lng, max_lng
    );

    CREATE TABLE stops (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      stop_id   TEXT UNIQUE NOT NULL,
      agency    TEXT NOT NULL,
      name      TEXT NOT NULL,
      lat       REAL NOT NULL,
      lng       REAL NOT NULL,
      category  TEXT NOT NULL CHECK(category IN ('bus','tram','rail'))
    );

    CREATE VIRTUAL TABLE stops_rtree USING rtree(
      id,
      min_lat, max_lat,
      min_lng, max_lng
    );

    CREATE VIRTUAL TABLE stops_fts USING fts5(
      name,
      stop_id UNINDEXED,
      tokenize = 'porter unicode61'
    );

    CREATE INDEX idx_stops_category ON stops(category);
  `);

  // ----- Block groups -----
  console.log("==> Ingesting block-group population…");
  if (!existsSync(BG_CSV)) {
    console.error(`  ! ${BG_CSV} not found.`);
    process.exit(1);
  }
  const bgRows = parseCsv(readFileSync(BG_CSV));
  const insertBG = db.prepare(
    `INSERT INTO block_groups (geoid, county, lat, lng, pop) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertBGRtree = db.prepare(
    `INSERT INTO block_groups_rtree (id, min_lat, max_lat, min_lng, max_lng) VALUES (?, ?, ?, ?, ?)`,
  );
  const txBG = db.transaction((rows: CsvRow[]) => {
    let n = 0;
    for (const r of rows) {
      const lat = parseFloat(r.lat ?? "");
      const lng = parseFloat(r.lng ?? "");
      const pop = parseInt(r.pop ?? "0", 10);
      if (!isFinite(lat) || !isFinite(lng) || !pop) continue;
      const info = insertBG.run(r.geoid, r.county ?? null, lat, lng, pop);
      insertBGRtree.run(info.lastInsertRowid as number, lat, lat, lng, lng);
      n++;
    }
    return n;
  });
  const bgCount = txBG(bgRows);
  console.log(`  ✓ ${bgCount.toLocaleString()} block groups indexed`);

  // ----- GTFS feeds -----
  console.log("==> Ingesting GTFS feeds…");
  const feeds = [
    { agency: "sfmta", zip: path.join(RAW, "sfmta.zip") },
    { agency: "bart", zip: path.join(RAW, "bart.zip") },
    { agency: "caltrain", zip: path.join(RAW, "caltrain.zip") },
  ];

  const insertStop = db.prepare(
    `INSERT OR IGNORE INTO stops (stop_id, agency, name, lat, lng, category)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertStopRtree = db.prepare(
    `INSERT INTO stops_rtree (id, min_lat, max_lat, min_lng, max_lng) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertFts = db.prepare(
    `INSERT INTO stops_fts (stop_id, name) VALUES (?, ?)`,
  );

  for (const feed of feeds) {
    const gtfs = loadGtfs(feed.zip);
    if (!gtfs) {
      console.warn(`  ! ${feed.agency}: feed not found at ${feed.zip} (skipping)`);
      continue;
    }
    const stops = gtfs["stops.txt"] ?? [];
    const routes = gtfs["routes.txt"] ?? [];
    const trips = gtfs["trips.txt"] ?? [];
    const stopTimes = gtfs["stop_times.txt"] ?? [];

    // route_id → route_type
    const routeType = new Map<string, number>();
    for (const r of routes) {
      routeType.set(r.route_id ?? "", parseInt(r.route_type ?? "-1", 10));
    }
    // trip_id → route_type
    const tripType = new Map<string, number>();
    for (const t of trips) {
      const rt = routeType.get(t.route_id ?? "");
      if (rt !== undefined) tripType.set(t.trip_id ?? "", rt);
    }
    // stop_id → set of route_types served by trips visiting it
    const stopTypes = new Map<string, Set<number>>();
    for (const st of stopTimes) {
      const tt = tripType.get(st.trip_id ?? "");
      if (tt === undefined) continue;
      const sid = st.stop_id ?? "";
      let set = stopTypes.get(sid);
      if (!set) {
        set = new Set();
        stopTypes.set(sid, set);
      }
      set.add(tt);
    }

    // Map each stop_id to its row for O(1) lookup.
    const byId = new Map<string, CsvRow>();
    for (const s of stops) if (s.stop_id) byId.set(s.stop_id, s);

    // Propagate child stop types up to parent_station so stations inherit
    // the route_types of their platforms.
    for (const s of stops) {
      const parent = s.parent_station;
      const sid = s.stop_id ?? "";
      if (!parent || !sid) continue;
      const childTypes = stopTypes.get(sid);
      if (!childTypes) continue;
      let pset = stopTypes.get(parent);
      if (!pset) {
        pset = new Set();
        stopTypes.set(parent, pset);
      }
      for (const t of childTypes) pset.add(t);
    }

    // Choose which logical "stop" to emit: if a stop has a parent_station, we
    // emit the parent (de-duping platforms). Otherwise emit the stop itself.
    const emitted = new Set<string>();
    const tx = db.transaction(() => {
      for (const s of stops) {
        const sid = s.stop_id ?? "";
        if (!sid) continue;
        const parent = s.parent_station;
        const emitId = parent && parent.length > 0 ? parent : sid;
        if (emitted.has(emitId)) continue;

        const emitRow = byId.get(emitId) ?? s;
        const lat = parseFloat(emitRow.stop_lat ?? "");
        const lng = parseFloat(emitRow.stop_lon ?? "");
        if (!isFinite(lat) || !isFinite(lng)) continue;

        const types = stopTypes.get(emitId);
        if (!types || types.size === 0) continue;
        const cat = categorize(types);
        if (!cat) continue;

        const fullId = `${feed.agency}:${emitId}`;
        const name = (emitRow.stop_name ?? emitId).trim();
        const info = insertStop.run(fullId, feed.agency, name, lat, lng, cat);
        if (info.changes === 0) continue;
        const rowid = info.lastInsertRowid as number;
        insertStopRtree.run(rowid, lat, lat, lng, lng);
        insertFts.run(fullId, name);
        emitted.add(emitId);
      }
    });
    tx();
    const cnt = db.prepare(`SELECT COUNT(*) AS n FROM stops WHERE agency = ?`).get(feed.agency) as {
      n: number;
    };
    console.log(`  ✓ ${feed.agency}: ${cnt.n.toLocaleString()} stops`);
  }

  console.log("==> Optimizing…");
  db.exec(`INSERT INTO stops_fts(stops_fts) VALUES ('optimize');`);
  db.exec(`ANALYZE;`);
  db.exec(`VACUUM;`);
  db.close();

  const sizeMB = (statSync(DB_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\n  ✓ Wrote ${path.relative(ROOT, DB_PATH)} (${sizeMB} MB)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
