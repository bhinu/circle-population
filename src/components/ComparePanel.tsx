import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useAppStore } from "../lib/store";
import { fetchQuery } from "../lib/api";
import { fmtNumber } from "../lib/format";
import type { QueryResult } from "../types";

export function ComparePanel() {
  const pointA = useAppStore((s) => s.pointA);
  const pointB = useAppStore((s) => s.pointB);
  const radiusKm = useAppStore((s) => s.radiusKm);

  const qa = useQuery({
    enabled: !!pointA,
    queryKey: ["query", "A", pointA?.lng, pointA?.lat, radiusKm],
    queryFn: () => fetchQuery(pointA!, radiusKm),
  });
  const qb = useQuery({
    enabled: !!pointB,
    queryKey: ["query", "B", pointB?.lng, pointB?.lat, radiusKm],
    queryFn: () => fetchQuery(pointB!, radiusKm),
  });

  if (!pointA || !pointB || !qa.data || !qb.data) {
    return (
      <div className="rounded-xl border border-dashed border-(--color-border) bg-(--color-surface)/70 p-4 text-xs text-(--color-text-mute) backdrop-blur-md">
        Drop a second point to compare.
      </div>
    );
  }

  const a = qa.data;
  const b = qb.data;

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface)/90 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="grid h-5 w-5 place-items-center rounded text-[10px] font-bold"
          style={{
            color: "#2dd4bf",
            background: "#2dd4bf22",
            border: "1px solid #2dd4bf55",
          }}
        >
          A
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-(--color-text-mute)" />
        <span
          className="grid h-5 w-5 place-items-center rounded text-[10px] font-bold"
          style={{
            color: "#60a5fa",
            background: "#60a5fa22",
            border: "1px solid #60a5fa55",
          }}
        >
          B
        </span>
        <div className="ml-2 text-xs font-semibold tracking-wide">
          Side-by-side
        </div>
      </div>

      <div className="space-y-1.5">
        <CompareRow label="Population" a={a.population} b={b.population} />
        <CompareRow label="Bus stops" a={a.stops.bus} b={b.stops.bus} />
        <CompareRow label="Tram stops" a={a.stops.tram} b={b.stops.tram} />
        <CompareRow label="Rail stops" a={a.stops.rail} b={b.stops.rail} />
        <CompareRow
          label="Transit equity *"
          a={a.peoplePerRapidStop ?? Infinity}
          b={b.peoplePerRapidStop ?? Infinity}
          inverted
        />
      </div>

      <div className="mt-3 text-[10px] leading-relaxed text-(--color-text-mute)">
        * People per rapid-transit (tram + rail) stop. Lower is better access.
      </div>
    </div>
  );
}

function CompareRow({
  label,
  a,
  b,
  inverted = false,
}: {
  label: string;
  a: number;
  b: number;
  /** When true, lower is "better" — affects which side is highlighted. */
  inverted?: boolean;
}) {
  const winner =
    !isFinite(a) && !isFinite(b)
      ? null
      : !isFinite(a)
        ? "B"
        : !isFinite(b)
          ? "A"
          : (inverted ? a < b : a > b)
            ? "A"
            : a === b
              ? null
              : "B";

  const aColor = winner === "A" ? "#2dd4bf" : "var(--color-text-dim)";
  const bColor = winner === "B" ? "#60a5fa" : "var(--color-text-dim)";

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 text-right font-mono text-sm tabular-nums"
        style={{ color: aColor }}
      >
        {isFinite(a) ? fmtNumber(a) : "—"}
      </div>
      <div className="w-32 text-center text-[10px] uppercase tracking-wider text-(--color-text-mute)">
        {label}
      </div>
      <div
        className="flex-1 text-left font-mono text-sm tabular-nums"
        style={{ color: bColor }}
      >
        {isFinite(b) ? fmtNumber(b) : "—"}
      </div>
    </div>
  );
}

export type _Hidden = QueryResult;
