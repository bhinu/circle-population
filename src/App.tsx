import { useEffect } from "react";
import { MapView } from "./components/MapView";
import { ControlBar } from "./components/ControlBar";
import { ResultsPanel } from "./components/ResultsPanel";
import { ComparePanel } from "./components/ComparePanel";
import { CommandPalette } from "./components/CommandPalette";
import { useAppStore } from "./lib/store";

export default function App() {
  const compareMode = useAppStore((s) => s.compareMode);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-(--color-bg) text-(--color-text)">
      <MapView />

      <header className="pointer-events-none absolute top-0 left-0 right-0 z-20 flex items-start justify-between gap-4 p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-(--color-border) bg-(--color-surface)/85 px-4 py-2.5 backdrop-blur-md">
          <div className="grid h-8 w-8 place-items-center rounded-md border border-(--color-border-strong) bg-(--color-bg)">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
              <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" className="text-(--color-teal)"/>
              <circle cx="12" cy="12" r="2" fill="currentColor" className="text-(--color-teal)"/>
            </svg>
          </div>
          <div className="whitespace-nowrap">
            <div className="text-sm font-semibold tracking-tight">Circle Population</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-(--color-text-mute)">
              SF Bay Area · Local SQLite
            </div>
          </div>
        </div>
        <div className="pointer-events-auto">
          <ControlBar />
        </div>
      </header>

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 flex items-end gap-3">
        <div className="pointer-events-auto w-full max-w-sm">
          <ResultsPanel slot="A" />
        </div>
        {compareMode && (
          <div className="pointer-events-auto w-full max-w-sm">
            <ResultsPanel slot="B" />
          </div>
        )}
        {compareMode && (
          <div className="pointer-events-auto ml-auto w-full max-w-md">
            <ComparePanel />
          </div>
        )}
      </div>

      <CommandPalette />
    </div>
  );
}
