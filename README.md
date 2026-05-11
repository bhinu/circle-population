# Circle Population — SF Bay Area

Click a point on the map, pick a radius, and instantly see the estimated population and the number of bus / tram / rail stops inside that circle. Inspired by Tom Forth's [Population around a point](https://www.tomforth.co.uk/circlepopulations/), scoped to the SF Bay Area and powered by a local SQLite database with proper spatial indexes.

![Hero](docs/screenshots/01-hero.png)

---

## Highlights

- **Sub-millisecond spatial queries** via SQLite **R\*Tree** indexes on both transit stops and Census block-group centroids — not a linear scan.
- **FTS5 full-text search** on stop names, served as a `⌘K` command palette.
- **Three real GTFS feeds** ingested and unified: SFMTA (Muni bus + light rail), BART (subway/metro), Caltrain (commuter rail). Stops are de-duplicated against `parent_station` so a multi-platform BART station counts once.
- **My chosen feature — Compare Mode**: pin two locations side-by-side with a derived **Transit Equity Score** (people per rapid-transit stop). See the rationale below.
- **Mariana-inspired** dark theme (`black / teal / white / blue`), WebGL vector basemap.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript | Fast, modern, ergonomic |
| Styling | Tailwind CSS v4 (CSS-first theme) | Tokens map cleanly onto the Mariana palette |
| Map | MapLibre GL JS + `react-map-gl` | WebGL vector tiles, smooth pan/zoom, free OSM-style data via OpenFreeMap |
| Data fetching | TanStack Query v5 | Caching, loading/error states, request de-dup |
| Client state | Zustand | Minimal global state for points / radius / modes |
| Animation | Framer Motion | Subtle panel transitions |
| Backend | Hono on `@hono/node-server` | Tiny, fast, TS-first |
| Validation | Zod | Runtime guards on query params |
| Database | SQLite via `better-sqlite3` | Synchronous, no IO overhead; ships native bindings |
| Spatial index | SQLite **R\*Tree** module | Built-in, no extension needed |
| Stop search | SQLite **FTS5** | Built-in, prefix-aware ranking |
| ETL | `csv-parse` + `adm-zip` + `tsx` | Plain TS scripts, no build step |

## Quick start

```bash
git clone <repo>
cd circle-population
npm install

# One-shot: fetch data + build DB.
# The repo already commits the GTFS zips + Census CSV so this works offline.
npm run build:db        # Generates db/circle.sqlite (~1.6 MB) in ~12 s

# Dev server (Vite on :5173, Hono API on :8787; Vite proxies /api → 8787)
npm run dev
# → http://localhost:5173
```

That's it. Click the map.

### Refreshing the data from upstream

If you want to re-pull the source data:

```bash
# Re-download GTFS feeds (~9 MB total)
rm -rf data/raw
npm run download:data

# Re-pull Census ACS centroids + population via the public no-key API
# (500 requests/day per IP). Add CENSUS_API_KEY=... to remove the cap.
rm -f data/bg_pop.csv
npm run build:db        # auto-refreshes if bg_pop.csv is missing
# or force a refresh:
npm run build:db -- --refresh-census
```

### Production build

```bash
npm run build && npm start
# Hono serves both /api and the built static UI on :8787
```

## Screenshots

**Compare Mode** — drop two pins, see side-by-side metrics and the transit-equity ratio:

![Compare](docs/screenshots/02-compare-mode.png)

**Command Palette** (`⌘K`) — FTS5 search across all transit stop names; jump straight to a known stop:

![Palette](docs/screenshots/03-command-palette.png)

## Data sources

| Source | What | URL |
|---|---|---|
| US Census ACS 5-yr 2022, table B01003 | Block-group population | [api.census.gov](https://api.census.gov/data/2022/acs/acs5) |
| US Census TIGERweb | Block-group centroids (CENTLAT/CENTLON) | TIGERweb ACS2022 MapServer, layer 8 |
| SFMTA Muni GTFS | Bus + light rail (Muni Metro) stops | `https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip` (canonical per Mobility Database #2886) |
| BART GTFS | Subway/metro stations | `https://www.bart.gov/dev/schedules/google_transit.zip` |
| Caltrain GTFS (Trillium-hosted) | Commuter rail stations | `https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip` |
| OpenFreeMap | Vector basemap tiles (no API key) | `https://tiles.openfreemap.org/styles/dark` |

Coverage: **12 California counties** — the 9 Bay Area counties + Sacramento, San Joaquin, Yolo. **6,664 block groups**, **3,209 transit stops** (2,836 bus / 293 tram / 80 rail).

## Database schema

```
block_groups        (id, geoid, county, lat, lng, pop)
block_groups_rtree  R*Tree virtual table over (lat, lng) for fast bbox queries

stops               (id, stop_id, agency, name, lat, lng, category)
stops_rtree         R*Tree virtual table over (lat, lng)
stops_fts           FTS5 contentless index on stop name (porter+unicode61 tokenizer)
```

**Query pattern** — for a circle (lat, lng, radius_km):

1. Compute an equirectangular bbox around the center.
2. Hit the R\*Tree: `WHERE min_lat ≥ ? AND max_lat ≤ ? AND min_lng ≥ ? AND max_lng ≤ ?`
3. Refine with **Haversine** distance per candidate row.

This collapses a 6.7k-row table scan into ~10–500 candidates at typical radii, then does the trig in JS. End-to-end query is well under 5 ms on commodity hardware.

## Technical decisions & tradeoffs

**Schema & population approximation.** The most defensible "fast & local" approach to population queries is Census ACS block-group **centroids** with R\*Tree-indexed bboxes plus a Haversine refinement. This is far lighter than ingesting a WorldPop GeoTIFF raster (>250 MB just for CA), still indexable in a single SQLite file (1.6 MB), and accurate enough at the 3–25 km radii the brief requires. The known tradeoff: a block-group's population is treated as a point at its centroid, so a 3 km circle that *partially* contains a large outer block group will under- or over-count by that group's pop. For dense areas like SF this is invisible (small groups, many of them); for sprawl it gets noisier. A pragmatic improvement would be partial area-weighting against the block-group polygon, but that needs polygon ingest and clipping — out of scope for ~2–3 hours. Stops are de-duplicated via `parent_station` so a BART station with multiple platforms counts as one stop, but a Muni surface light-rail line that has a separate `stop_id` for each block (no parent) still counts each platform — I left that "raw" rather than spatially clustering, because the user-facing number ("tram stops within X km") matches how the agency itself reports its network.

**Why Compare Mode as the custom feature.** Skimming r/urbanplanning, r/sanfrancisco housing threads, and the comments under Tom Forth's tool, the single most recurring ask is *"can I compare two places?"* — real-estate buyers want to weigh neighborhoods, policy folks want to surface inequity, and urbanists want quick visual proof of transit gaps. So Compare Mode lets a user pin location A (teal solid), drop B (blue dashed), and see both panels plus a derived **Transit Equity Score** = `population / (tram_stops + rail_stops)`, i.e. people per rapid-transit stop. Lower is better access. In the demo screenshots, downtown SF clocks ~3,100 people/rapid-stop while the Alameda waterfront clocks ~22,000 — a ~7× gap that surfaces a real, recognizable Bay Area transit-equity story in one click. The `⌘K` command palette (a Cmd-K stop search backed by FTS5) is a smaller bonus, motivated by the same forum feedback ("let me jump to a stop I already know about"). I considered isochrones, demographics breakdowns, and a shareable URL state — all interesting, but Compare Mode was the highest-signal feature I could ship cleanly in the time budget.

## Known limitations

- **Cable cars** (GTFS `route_type = 5`) and **ferries** (`route_type = 4`) are not counted. They don't fit cleanly into bus/tram/rail.
- **East Bay buses** (AC Transit, etc.), VTA light rail, and SamTrans are not ingested — only SFMTA / BART / Caltrain. Easy to add by extending `feeds` in `scripts/build-db.ts`.
- The "Area" label is the county containing the closest block-group centroid, not a true reverse-geocode (no city / neighborhood resolution).
- The bbox-then-Haversine approach over-includes by up to ~1.5% at the bbox corners; the Haversine pass corrects that exactly.

## Project layout

```
.
├── data/
│   ├── bg_pop.csv          # Census block-group centroids + pop (committed)
│   └── raw/                # GTFS zips (committed, ~9 MB)
├── db/                     # Generated SQLite (.gitignored)
├── docs/screenshots/       # Screenshots used in this README
├── scripts/
│   ├── download-data.sh    # Pulls GTFS feeds from upstream
│   └── build-db.ts         # ETL → SQLite with R*Tree + FTS5
├── server/
│   ├── db.ts               # SQLite open + geo helpers
│   └── index.ts            # Hono API (/api/query, /api/stops, /api/search)
└── src/
    ├── App.tsx
    ├── components/
    │   ├── MapView.tsx
    │   ├── ControlBar.tsx
    │   ├── ResultsPanel.tsx
    │   ├── ComparePanel.tsx
    │   └── CommandPalette.tsx
    └── lib/                # store, api, geo, format
```

## License

MIT for code. All transit and Census data are publicly licensed under their respective terms (CC0 / public-domain / GTFS Open Data).
