import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import MapGL, {
  Layer,
  MapRef,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import { useAppStore } from "../lib/store";
import { circlePolygon, inBounds, NORCAL_MAP_BOUNDS } from "../lib/geo";
import { fetchStops } from "../lib/api";
import type { LngLat, Stop } from "../types";

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

const SF_CENTER: LngLat = { lng: -122.4194, lat: 37.7749 };

export function MapView() {
  const pointA = useAppStore((s) => s.pointA);
  const pointB = useAppStore((s) => s.pointB);
  const radiusKm = useAppStore((s) => s.radiusKm);
  const compareMode = useAppStore((s) => s.compareMode);
  const showStopMarkers = useAppStore((s) => s.showStopMarkers);
  const setPointA = useAppStore((s) => s.setPointA);
  const setPointB = useAppStore((s) => s.setPointB);
  const mapRef = useRef<MapRef | null>(null);

  const handleClick = (e: MapLayerMouseEvent) => {
    const { lng, lat } = e.lngLat;
    const point = { lng, lat };
    if (!inBounds(point)) return;
    if (compareMode && pointA) setPointB(point);
    else setPointA(point);
  };

  const circleA = useMemo(
    () => (pointA ? circlePolygon(pointA, radiusKm) : null),
    [pointA, radiusKm],
  );
  const circleB = useMemo(
    () => (pointB ? circlePolygon(pointB, radiusKm) : null),
    [pointB, radiusKm],
  );

  // One stops query per circle; the second only fires in Compare Mode.
  // Stops in the A∩B overlap will appear in both responses and are de-duped
  // by stop id when merging.
  const stopsQueryA = useQuery({
    enabled: showStopMarkers && !!pointA,
    queryKey: ["stops", pointA?.lng, pointA?.lat, radiusKm],
    queryFn: () => fetchStops(pointA!, radiusKm),
  });
  const stopsQueryB = useQuery({
    enabled: showStopMarkers && compareMode && !!pointB,
    queryKey: ["stops", pointB?.lng, pointB?.lat, radiusKm],
    queryFn: () => fetchStops(pointB!, radiusKm),
  });

  const mergedStops = useMemo<Stop[]>(() => {
    if (!showStopMarkers) return [];
    const byId = new Map<string, Stop>();
    for (const s of stopsQueryA.data?.stops ?? []) byId.set(s.id, s);
    for (const s of stopsQueryB.data?.stops ?? []) byId.set(s.id, s);
    return [...byId.values()];
  }, [showStopMarkers, stopsQueryA.data, stopsQueryB.data]);

  return (
    <MapGL
      ref={mapRef}
      mapStyle={STYLE_URL}
      initialViewState={{
        longitude: SF_CENTER.lng,
        latitude: SF_CENTER.lat,
        zoom: 11,
      }}
      maxBounds={NORCAL_MAP_BOUNDS}
      onClick={handleClick}
      cursor={compareMode && pointA && !pointB ? "crosshair" : "pointer"}
      attributionControl={false}
    >
      <NavigationControl position="bottom-right" showCompass={false} />

      {circleA && (
        <Source id="circle-a" type="geojson" data={circleA}>
          <Layer
            id="circle-a-fill"
            type="fill"
            paint={{ "fill-color": "#2dd4bf", "fill-opacity": 0.1 }}
          />
          <Layer
            id="circle-a-line"
            type="line"
            paint={{
              "line-color": "#2dd4bf",
              "line-width": 2,
              "line-opacity": 0.95,
            }}
          />
        </Source>
      )}

      {circleB && (
        <Source id="circle-b" type="geojson" data={circleB}>
          <Layer
            id="circle-b-fill"
            type="fill"
            paint={{ "fill-color": "#60a5fa", "fill-opacity": 0.1 }}
          />
          <Layer
            id="circle-b-line"
            type="line"
            paint={{
              "line-color": "#60a5fa",
              "line-width": 2,
              "line-opacity": 0.95,
              "line-dasharray": [2, 2],
            }}
          />
        </Source>
      )}

      {pointA && (
        <Marker longitude={pointA.lng} latitude={pointA.lat} anchor="center">
          <PointPin color="#2dd4bf" label="A" />
        </Marker>
      )}
      {pointB && (
        <Marker longitude={pointB.lng} latitude={pointB.lat} anchor="center">
          <PointPin color="#60a5fa" label="B" />
        </Marker>
      )}

      {mergedStops.map((s) => (
        <Marker key={s.id} longitude={s.lng} latitude={s.lat} anchor="center">
          <span
            title={`${s.name} · ${s.category}`}
            className="block h-2 w-2 rounded-full ring-2 ring-(--color-bg)"
            style={{
              background:
                s.category === "rail"
                  ? "#f87171"
                  : s.category === "tram"
                    ? "#fbbf24"
                    : "#94a3b8",
            }}
          />
        </Marker>
      ))}
    </MapGL>
  );
}

function PointPin({ color, label }: { color: string; label: string }) {
  return (
    <div className="relative">
      <span
        className="absolute -inset-2 rounded-full"
        style={{ background: color, opacity: 0.25, filter: "blur(4px)" }}
      />
      <div
        className="relative grid h-7 w-7 place-items-center rounded-full border-2 text-[11px] font-bold"
        style={{
          borderColor: color,
          background: "#06090b",
          color,
        }}
      >
        {label}
      </div>
    </div>
  );
}
