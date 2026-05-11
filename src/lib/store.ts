import { create } from "zustand";
import type { LngLat } from "../types";

type State = {
  pointA: LngLat | null;
  pointB: LngLat | null;
  radiusKm: number;
  compareMode: boolean;
  showStopMarkers: boolean;
  paletteOpen: boolean;

  setPointA: (p: LngLat | null) => void;
  setPointB: (p: LngLat | null) => void;
  setRadius: (r: number) => void;
  toggleCompare: () => void;
  toggleStopMarkers: () => void;
  setPaletteOpen: (open: boolean) => void;
  clearAll: () => void;
};

export const useAppStore = create<State>((set) => ({
  pointA: null,
  pointB: null,
  radiusKm: 5,
  compareMode: false,
  showStopMarkers: false,
  paletteOpen: false,

  setPointA: (p) => set({ pointA: p }),
  setPointB: (p) => set({ pointB: p }),
  setRadius: (r) => set({ radiusKm: r }),
  toggleCompare: () =>
    set((s) => ({
      compareMode: !s.compareMode,
      pointB: !s.compareMode ? s.pointB : null,
    })),
  toggleStopMarkers: () => set((s) => ({ showStopMarkers: !s.showStopMarkers })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  clearAll: () => set({ pointA: null, pointB: null }),
}));
