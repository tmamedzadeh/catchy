import { create } from "zustand";

export type GameState = "chase" | "nearby" | "capture" | "after" | "timeup";

type Store = {
  /** camera demo controls */
  camHeight: number;
  camAngle: number;
  setCamHeight: (v: number) => void;
  setCamAngle: (v: number) => void;
  resetCamera: () => void;

  state: GameState;
  setState: (s: GameState) => void;
  manualState: boolean;
  setManualState: (v: boolean) => void;

  caught: number;
  time: number;
  distance: number;
  bearing: number; // radians, screen-space direction to nearest runner
  setTelemetry: (d: { distance: number; bearing: number }) => void;
  tick: (dt: number) => void;
  addCatch: () => void;
  restart: () => void;
};

export const CAM_DEFAULTS = { height: 16, angle: 54 };

export const useGameStore = create<Store>((set, get) => ({
  camHeight: CAM_DEFAULTS.height,
  camAngle: CAM_DEFAULTS.angle,
  setCamHeight: (v) => set({ camHeight: v }),
  setCamAngle: (v) => set({ camAngle: v }),
  resetCamera: () => set({ camHeight: CAM_DEFAULTS.height, camAngle: CAM_DEFAULTS.angle }),

  state: "chase",
  setState: (s) => set({ state: s }),
  manualState: false,
  setManualState: (v) => set({ manualState: v }),

  caught: 0,
  time: 45,
  distance: 0,
  bearing: 0,
  setTelemetry: ({ distance, bearing }) => set({ distance, bearing }),
  tick: (dt) => {
    const { time, state, manualState } = get();
    if (manualState || state === "timeup") return;
    const next = Math.max(0, time - dt);
    set({ time: next });
    if (next === 0) set({ state: "timeup" });
  },
  addCatch: () => set((s) => ({ caught: s.caught + 1 })),
  restart: () => set({ caught: 0, time: 45, state: "chase", manualState: false }),
}));
