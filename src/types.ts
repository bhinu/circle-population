export type LngLat = { lng: number; lat: number };

export type StopCategory = "bus" | "tram" | "rail";

export type QueryResult = {
  center: LngLat;
  radiusKm: number;
  population: number;
  stops: Record<StopCategory, number> & { total: number };
  /** Derived: people per rapid-transit (tram + rail) stop. null if zero rapid stops. */
  peoplePerRapidStop: number | null;
  /** Best-known nearest neighborhood / city label, derived from the closest block group. */
  areaLabel: string | null;
};

/** A single transit stop — used for both spatial lookups and name search. */
export type Stop = {
  id: string;
  name: string;
  category: StopCategory;
  lng: number;
  lat: number;
};
