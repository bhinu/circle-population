import type { LngLat, QueryResult, SearchHit, StopHit } from "../types";

async function jsonFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export function fetchQuery(center: LngLat, radiusKm: number) {
  const params = new URLSearchParams({
    lat: String(center.lat),
    lng: String(center.lng),
    radius: String(radiusKm),
  });
  return jsonFetch<QueryResult>(`/api/query?${params}`);
}

export function fetchStops(center: LngLat, radiusKm: number) {
  const params = new URLSearchParams({
    lat: String(center.lat),
    lng: String(center.lng),
    radius: String(radiusKm),
  });
  return jsonFetch<{ stops: StopHit[] }>(`/api/stops?${params}`);
}

export function fetchSearch(query: string) {
  const params = new URLSearchParams({ q: query });
  return jsonFetch<{ hits: SearchHit[] }>(`/api/search?${params}`);
}
