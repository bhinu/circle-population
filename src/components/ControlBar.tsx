import { Layers, GitCompareArrows, Search, X } from "lucide-react";
import { useAppStore } from "../lib/store";

export function ControlBar() {
  const radiusKm = useAppStore((s) => s.radiusKm);
  const setRadius = useAppStore((s) => s.setRadius);
  const compareMode = useAppStore((s) => s.compareMode);
  const toggleCompare = useAppStore((s) => s.toggleCompare);
  const showStopMarkers = useAppStore((s) => s.showStopMarkers);
  const toggleStopMarkers = useAppStore((s) => s.toggleStopMarkers);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);
  const clearAll = useAppStore((s) => s.clearAll);
  const hasPoint = useAppStore((s) => !!s.pointA || !!s.pointB);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-(--color-border) bg-(--color-surface)/85 p-2 backdrop-blur-md">
      <div className="flex items-center gap-3 px-2">
        <label className="text-[11px] uppercase tracking-[0.18em] text-(--color-text-mute)">
          Radius
        </label>
        <input
          type="range"
          min={3}
          max={25}
          step={0.5}
          value={radiusKm}
          onChange={(e) => setRadius(parseFloat(e.target.value))}
          className="w-44"
        />
        <span className="w-14 text-right font-mono text-sm text-(--color-teal)">
          {radiusKm.toFixed(1)} km
        </span>
      </div>

      <div className="mx-1 h-6 w-px bg-(--color-border)" />

      <ToggleButton
        active={compareMode}
        onClick={toggleCompare}
        title="Compare Mode: pin a second location to compare metrics"
      >
        <GitCompareArrows className="h-3.5 w-3.5" />
        Compare
      </ToggleButton>
      <ToggleButton
        active={showStopMarkers}
        onClick={toggleStopMarkers}
        title="Toggle individual stop markers inside the circle"
      >
        <Layers className="h-3.5 w-3.5" />
        Stops
      </ToggleButton>
      <button
        onClick={() => setPaletteOpen(true)}
        title="Search stops (⌘K)"
        className="flex items-center gap-1.5 rounded-md border border-(--color-border) bg-(--color-bg) px-2.5 py-1.5 text-xs text-(--color-text-dim) transition hover:border-(--color-teal) hover:text-(--color-text)"
      >
        <Search className="h-3.5 w-3.5" />
        Search
        <kbd className="ml-1 rounded bg-(--color-surface-2) px-1.5 py-0.5 font-mono text-[10px] text-(--color-text-mute)">
          ⌘K
        </kbd>
      </button>

      {hasPoint && (
        <>
          <div className="mx-1 h-6 w-px bg-(--color-border)" />
          <button
            onClick={clearAll}
            title="Clear points"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-(--color-text-mute) transition hover:text-(--color-danger)"
          >
            <X className="h-3.5 w-3.5" />
            Reset
          </button>
        </>
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition ${
        active
          ? "border-(--color-teal) bg-(--color-teal-glow) text-(--color-teal)"
          : "border-(--color-border) bg-(--color-bg) text-(--color-text-dim) hover:border-(--color-border-strong) hover:text-(--color-text)"
      }`}
    >
      {children}
    </button>
  );
}
