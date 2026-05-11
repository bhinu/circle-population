import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { bbox, getDB, haversineKm, DB_FILE } from "./db.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const isProd = process.env.NODE_ENV === "production";

if (!existsSync(DB_FILE)) {
  console.error(
    `\n[server] Database not found at ${DB_FILE}\n` +
      `         Run \`npm run data:all\` first to download data and build the DB.\n`,
  );
  process.exit(1);
}

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(0.5).max(50),
});

const searchSchema = z.object({
  q: z.string().trim().min(1).max(64),
});

const app = new Hono();

app.get("/api/health", (c) =>
  c.json({ ok: true, db: path.basename(DB_FILE), time: new Date().toISOString() }),
);

app.get("/api/query", (c) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { lat, lng, radius } = parsed.data;
  const db = getDB();
  const box = bbox(lat, lng, radius);

  // Population: bbox via R*Tree, then precise Haversine filter.
  const bgRows = db
    .prepare<
      [number, number, number, number],
      { geoid: string; lat: number; lng: number; pop: number; county: string | null }
    >(
      `SELECT bg.geoid, bg.lat, bg.lng, bg.pop, bg.county
       FROM block_groups_rtree rt
       JOIN block_groups bg ON bg.id = rt.id
       WHERE rt.min_lat >= ? AND rt.max_lat <= ?
         AND rt.min_lng >= ? AND rt.max_lng <= ?`,
    )
    .all(box.minLat, box.maxLat, box.minLng, box.maxLng);

  let population = 0;
  let nearest: { d: number; county: string | null } = { d: Infinity, county: null };
  for (const r of bgRows) {
    const d = haversineKm(lat, lng, r.lat, r.lng);
    if (d <= radius) population += r.pop;
    if (d < nearest.d) nearest = { d, county: r.county };
  }

  // Stops by category: bbox via R*Tree, then precise filter.
  const stopRows = db
    .prepare<
      [number, number, number, number],
      { category: "bus" | "tram" | "rail"; lat: number; lng: number }
    >(
      `SELECT s.category, s.lat, s.lng
       FROM stops_rtree rt
       JOIN stops s ON s.id = rt.id
       WHERE rt.min_lat >= ? AND rt.max_lat <= ?
         AND rt.min_lng >= ? AND rt.max_lng <= ?`,
    )
    .all(box.minLat, box.maxLat, box.minLng, box.maxLng);

  const counts = { bus: 0, tram: 0, rail: 0 };
  for (const r of stopRows) {
    if (haversineKm(lat, lng, r.lat, r.lng) <= radius) counts[r.category] += 1;
  }
  const total = counts.bus + counts.tram + counts.rail;
  const rapid = counts.tram + counts.rail;
  const peoplePerRapidStop = rapid === 0 ? null : Math.round(population / rapid);

  return c.json({
    center: { lat, lng },
    radiusKm: radius,
    population,
    stops: { ...counts, total },
    peoplePerRapidStop,
    areaLabel: nearest.county,
  });
});

app.get("/api/stops", (c) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { lat, lng, radius } = parsed.data;
  const db = getDB();
  const box = bbox(lat, lng, radius);

  const rows = db
    .prepare<
      [number, number, number, number],
      {
        id: string;
        name: string;
        category: "bus" | "tram" | "rail";
        lat: number;
        lng: number;
      }
    >(
      `SELECT s.stop_id AS id, s.name, s.category, s.lat, s.lng
       FROM stops_rtree rt
       JOIN stops s ON s.id = rt.id
       WHERE rt.min_lat >= ? AND rt.max_lat <= ?
         AND rt.min_lng >= ? AND rt.max_lng <= ?`,
    )
    .all(box.minLat, box.maxLat, box.minLng, box.maxLng);

  const filtered = rows.filter(
    (r) => haversineKm(lat, lng, r.lat, r.lng) <= radius,
  );
  // Cap to keep payload light when zoomed out
  return c.json({ stops: filtered.slice(0, 2000) });
});

app.get("/api/search", (c) => {
  const parsed = searchSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const q = parsed.data.q;
  const db = getDB();
  // FTS5 prefix match on the last token, AND the others.
  const tokens = q.split(/\s+/).filter(Boolean).map(escapeFts);
  if (tokens.length === 0) return c.json({ hits: [] });
  const lastIdx = tokens.length - 1;
  const ftsExpr = tokens
    .map((t, i) => (i === lastIdx ? `${t}*` : t))
    .join(" AND ");

  const rows = db
    .prepare<
      [string],
      {
        stop_id: string;
        name: string;
        category: "bus" | "tram" | "rail";
        lat: number;
        lng: number;
      }
    >(
      `SELECT s.stop_id, s.name, s.category, s.lat, s.lng
       FROM stops_fts f
       JOIN stops s ON s.stop_id = f.stop_id
       WHERE f.name MATCH ?
       ORDER BY rank
       LIMIT 20`,
    )
    .all(ftsExpr);

  return c.json({
    hits: rows.map((r) => ({
      id: r.stop_id,
      name: r.name,
      category: r.category,
      lat: r.lat,
      lng: r.lng,
    })),
  });
});

function escapeFts(s: string): string {
  // FTS5 expressions: wrap tokens with non-alphanumeric chars in quotes.
  if (/^[a-z0-9]+$/i.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

if (isProd) {
  const distDir = path.resolve(__dirname, "..", "dist");
  app.use("/*", serveStatic({ root: path.relative(process.cwd(), distDir) }));
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`\n  api  ready at http://localhost:${info.port}\n`);
});
