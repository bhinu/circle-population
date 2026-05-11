export type LngLat = { lng: number; lat: number };

export type QueryResult = {
  center: LngLat;
  radiusKm: number;
  population: number;
  stops: {
    bus: number;
    tram: number;
    rail: number;
    total: number;
  };
  /** Derived: people per rapid-transit (tram + rail) stop. null if zero rapid stops. */
  peoplePerRapidStop: number | null;
  /** Best-known nearest neighborhood / city label, derived from the closest block group. */
  areaLabel: string | null;
};

export type StopHit = {
  id: string;
  name: string;
  category: "bus" | "tram" | "rail";
  lng: number;
  lat: number;
};

export type SearchHit = {
  id: string;
  name: string;
  category: "bus" | "tram" | "rail";
  lng: number;
  lat: number;
};
