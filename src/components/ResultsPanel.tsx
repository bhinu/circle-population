import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Bus, TramFront, TrainFront, Users, MapPin } from "lucide-react";
import { useAppStore } from "../lib/store";
import { fetchQuery } from "../lib/api";
import { fmtNumber, fmtCoord } from "../lib/format";

export function ResultsPanel({ slot }: { slot: "A" | "B" }) {
  const point = useAppStore((s) => (slot === "A" ? s.pointA : s.pointB));
  const radiusKm = useAppStore((s) => s.radiusKm);
  const compareMode = useAppStore((s) => s.compareMode);

  const query = useQuery({
    enabled: !!point,
    queryKey: ["query", slot, point?.lng, point?.lat, radiusKm],
    queryFn: () => fetchQuery(point!, radiusKm),
  });

  const accent = slot === "A" ? "teal" : "blue";
  const accentColor = accent === "teal" ? "#2dd4bf" : "#60a5fa";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={slot + (point ? "p" : "e")}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="rounded-xl border border-(--color-border) bg-(--color-surface)/90 p-4 backdrop-blur-md"
      >
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold"
              style={{
                background: `${accentColor}22`,
                color: accentColor,
                border: `1px solid ${accentColor}55`,
              }}
            >
              {slot}
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wide">
                {compareMode ? `Location ${slot}` : "Location"}
              </div>
              {point ? (
                <div className="flex items-center gap-1 font-mono text-[10px] text-(--color-text-mute)">
                  <MapPin className="h-3 w-3" />
                  {fmtCoord(point.lat, point.lng)}
                </div>
              ) : (
                <div className="text-[10px] text-(--color-text-mute)">
                  {slot === "A"
                    ? "Click the map to place a point"
                    : "Click again to place the comparison point"}
                </div>
              )}
            </div>
          </div>
          {query.data?.areaLabel && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-(--color-text-mute)">
                Area
              </div>
              <div className="text-xs text-(--color-text-dim)">
                {query.data.areaLabel}
              </div>
            </div>
          )}
        </header>

        {!point && <EmptyState />}

        {point && query.isPending && <LoadingState />}

        {point && query.error && (
          <div className="rounded-md border border-(--color-danger)/40 bg-(--color-danger)/10 px-3 py-2 text-xs text-(--color-danger)">
            {(query.error as Error).message}
          </div>
        )}

        {point && query.data && <Metrics data={query.data} accent={accentColor} />}
      </motion.div>
    </AnimatePresence>
  );
}

function Metrics({
  data,
  accent,
}: {
  data: import("../types").QueryResult;
  accent: string;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg) p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-(--color-text-mute)">
          <Users className="h-3 w-3" />
          Estimated Population
        </div>
        <div
          className="mt-1 font-mono text-3xl font-semibold tabular-nums"
          style={{ color: accent }}
        >
          {fmtNumber(data.population)}
        </div>
        <div className="mt-0.5 text-[10px] text-(--color-text-mute)">
          within {data.radiusKm.toFixed(1)} km
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StopTile icon={<Bus className="h-3.5 w-3.5" />} label="Bus" value={data.stops.bus} />
        <StopTile icon={<TramFront className="h-3.5 w-3.5" />} label="Tram" value={data.stops.tram} />
        <StopTile icon={<TrainFront className="h-3.5 w-3.5" />} label="Rail" value={data.stops.rail} />
      </div>

      <div className="flex items-center justify-between rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 text-[11px]">
        <span className="text-(--color-text-mute)">People per rapid-transit stop</span>
        <span className="font-mono tabular-nums text-(--color-text)">
          {data.peoplePerRapidStop === null
            ? "—"
            : fmtNumber(data.peoplePerRapidStop)}
        </span>
      </div>
    </div>
  );
}

function StopTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-(--color-border) bg-(--color-bg) px-2 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-(--color-text-mute)">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-lg tabular-nums">{fmtNumber(value)}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="h-20 animate-pulse rounded-lg bg-(--color-surface-2)" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-14 animate-pulse rounded-md bg-(--color-surface-2)" />
        <div className="h-14 animate-pulse rounded-md bg-(--color-surface-2)" />
        <div className="h-14 animate-pulse rounded-md bg-(--color-surface-2)" />
      </div>
      <div className="h-7 animate-pulse rounded-md bg-(--color-surface-2)" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-(--color-border) bg-(--color-bg) px-3 py-5 text-center text-[11px] text-(--color-text-mute)">
      No location selected.
    </div>
  );
}
