import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Bus, TramFront, TrainFront, MapPin } from "lucide-react";
import { useAppStore } from "../lib/store";
import { fetchSearch } from "../lib/api";

export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen);
  const setOpen = useAppStore((s) => s.setPaletteOpen);
  const setPointA = useAppStore((s) => s.setPointA);
  const setPointB = useAppStore((s) => s.setPointB);
  const compareMode = useAppStore((s) => s.compareMode);
  const pointA = useAppStore((s) => s.pointA);

  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const search = useQuery({
    enabled: open && q.trim().length >= 2,
    queryKey: ["search", q],
    queryFn: () => fetchSearch(q.trim()),
    staleTime: 60_000,
  });

  const onPick = (lng: number, lat: number) => {
    const point = { lng, lat };
    if (compareMode && pointA) setPointB(point);
    else setPointA(point);
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ y: -12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -12, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="mt-32 w-full max-w-xl overflow-hidden rounded-xl border border-(--color-border) bg-(--color-surface) shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-(--color-border) px-4 py-3">
              <Search className="h-4 w-4 text-(--color-text-mute)" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search transit stops (e.g. Powell, Embarcadero, 24th)…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-(--color-text-mute)"
              />
              <kbd className="rounded bg-(--color-bg) px-1.5 py-0.5 font-mono text-[10px] text-(--color-text-mute)">
                ESC
              </kbd>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {q.trim().length < 2 && (
                <div className="px-4 py-6 text-center text-xs text-(--color-text-mute)">
                  Type at least 2 characters to search.
                </div>
              )}
              {search.isPending && q.trim().length >= 2 && (
                <div className="px-4 py-6 text-center text-xs text-(--color-text-mute)">
                  Searching…
                </div>
              )}
              {search.data?.hits.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-(--color-text-mute)">
                  No matches.
                </div>
              )}
              {search.data?.hits.map((hit) => (
                <button
                  key={hit.id}
                  onClick={() => onPick(hit.lng, hit.lat)}
                  className="flex w-full items-center gap-3 border-b border-(--color-border)/60 px-4 py-2.5 text-left transition hover:bg-(--color-surface-2)"
                >
                  <CatIcon cat={hit.category} />
                  <div className="flex-1 truncate">
                    <div className="truncate text-sm">{hit.name}</div>
                    <div className="font-mono text-[10px] text-(--color-text-mute)">
                      {hit.lat.toFixed(4)}, {hit.lng.toFixed(4)}
                    </div>
                  </div>
                  <MapPin className="h-3.5 w-3.5 text-(--color-text-mute)" />
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CatIcon({ cat }: { cat: "bus" | "tram" | "rail" }) {
  const cls = "h-3.5 w-3.5";
  if (cat === "rail") return <TrainFront className={`${cls} text-(--color-danger)`} />;
  if (cat === "tram") return <TramFront className={`${cls} text-amber-400`} />;
  return <Bus className={`${cls} text-(--color-text-dim)`} />;
}
