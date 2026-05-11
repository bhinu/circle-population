import type { LngLat } from "../types";

/**
 * Build a circle polygon (GeoJSON) around a center point.
 * Uses an equirectangular approximation since circles are small (≤25 km).
 */
export function circlePolygon(center: LngLat, radiusKm: number, steps = 96) {
  const coords: [number, number][] = [];
  const earthRadiusKm = 6371;
  const lat = (center.lat * Math.PI) / 180;
  const dLat = (radiusKm / earthRadiusKm) * (180 / Math.PI);
  const dLng = (radiusKm / (earthRadiusKm * Math.cos(lat))) * (180 / Math.PI);

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    coords.push([
      center.lng + dLng * Math.cos(theta),
      center.lat + dLat * Math.sin(theta),
    ]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coords] },
  };
}

/**
 * Single source of truth for the data envelope: the geographic area that the
 * SQLite DB has population + transit coverage for (9 Bay Area counties plus
 * Sacramento / San Joaquin / Yolo, with a small padding so clicks near the
 * coastline and county edges still resolve).
 *
 * Used for BOTH:
 *   1. MapLibre `maxBounds` — constrains the camera, so the user can only
 *      pan to areas we actually have data for.
 *   2. `inBounds()` — validates clicks before issuing a query.
 *
 * Keeping these in lockstep prevents the "panned-here-but-can't-click" bug.
 */
export const NORCAL_BOUNDS = {
  minLat: 36.3,
  maxLat: 39.1,
  minLng: -123.7,
  maxLng: -120.9,
} as const;

/** MapLibre/react-map-gl `maxBounds` format: [[swLng, swLat], [neLng, neLat]]. */
export const NORCAL_MAP_BOUNDS: [[number, number], [number, number]] = [
  [NORCAL_BOUNDS.minLng, NORCAL_BOUNDS.minLat],
  [NORCAL_BOUNDS.maxLng, NORCAL_BOUNDS.maxLat],
];

export function inBounds({ lat, lng }: LngLat): boolean {
  return (
    lat >= NORCAL_BOUNDS.minLat &&
    lat <= NORCAL_BOUNDS.maxLat &&
    lng >= NORCAL_BOUNDS.minLng &&
    lng <= NORCAL_BOUNDS.maxLng
  );
}
