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

/** Northern California / Bay Area bounding box for click validation. */
export const NORCAL_BOUNDS = {
  minLat: 36.5,
  maxLat: 39.5,
  minLng: -123.5,
  maxLng: -121.0,
};

export function inBounds({ lat, lng }: LngLat): boolean {
  return (
    lat >= NORCAL_BOUNDS.minLat &&
    lat <= NORCAL_BOUNDS.maxLat &&
    lng >= NORCAL_BOUNDS.minLng &&
    lng <= NORCAL_BOUNDS.maxLng
  );
}
