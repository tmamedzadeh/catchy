import { create } from "zustand";
import {
  PLAYER,
  cancelPlayerDash,
  resetPlayerDash,
  resetSimulation,
  type DashState,
} from "@/lib/sprout/agents";
import { clearInput } from "@/lib/sprout/input";
import { GAME_CONFIG } from "@/lib/sprout/config";

export type GameState = "chase" | "nearby" | "capture" | "after" | "timeup";

export type CaptureSnapshot = {
  runnerId: string;
  position: { x: number; y: number; z: number };
  capturedAt: number;
};

export type Telemetry = {
  distance: number | null;
  bearing: number;
  targetId: string | null;
  cameraYaw: number;
  playerX: number;
  playerZ: number;
  playerSpeed: number;
  runners: {
    id: string;
    state: "flee" | "respawning";
    x: number;
    z: number;
    speed: number;
    active: boolean;
  }[];
};

type Store = {
  camHeight: number;
  camAngle: number;
  setCamHeight: (value: number) => void;
  setCamAngle: (value: number) => void;
  resetCamera: () => void;

  state: GameState;
  setState: (state: GameState) => void;
  capture: CaptureSnapshot | null;
  beginCapture: (capture: CaptureSnapshot) => void;
  enterAfter: () => void;
  finishCapture: () => void;
  caught: number;
  time: number;
  distance: number | null;
  bearing: number;
  targetId: string | null;
  cameraYaw: number;
  playerX: number;
  playerZ: number;
  playerSpeed: number;
  runners: Telemetry["runners"];
  restartCount: number;
  dashStatus: DashState;
  setDashStatus: (status: DashState) => void;
  setTelemetry: (telemetry: Telemetry) => void;
  tick: (dt: number) => void;
  addCatch: () => void;
  restart: () => void;
};

export const CAM_DEFAULTS = { height: 22.5, angle: 38 };
let roundTimeRemaining: number = GAME_CONFIG.roundSeconds;

const initialTelemetry: Telemetry = {
  distance: null,
  bearing: 0,
  targetId: null,
  cameraYaw: 0,
  playerX: PLAYER.x,
  playerZ: PLAYER.z,
  playerSpeed: 0,
  runners: [],
};

export const useGameStore = create<Store>((set, get) => ({
  camHeight: CAM_DEFAULTS.height,
  camAngle: CAM_DEFAULTS.angle,
  setCamHeight: (value) =>
    set({ camHeight: Math.round(Math.max(14, Math.min(32, value)) * 2) / 2 }),
  setCamAngle: (value) => set({ camAngle: Math.round(Math.max(10, Math.min(75, value))) }),
  resetCamera: () => set({ camHeight: CAM_DEFAULTS.height, camAngle: CAM_DEFAULTS.angle }),

  state: "chase",
  setState: (state) => {
    if (state !== "chase" && PLAYER.dashState === "active") cancelPlayerDash();
    set({ state, dashStatus: PLAYER.dashState });
  },
  capture: null,
  beginCapture: (capture) => {
    cancelPlayerDash();
    set({ state: "capture", capture, dashStatus: PLAYER.dashState });
  },
  enterAfter: () => {
    cancelPlayerDash();
    set({ state: "after", dashStatus: PLAYER.dashState });
  },
  finishCapture: () =>
    set((state) => ({
      state: state.time <= 0 ? "timeup" : "chase",
      capture: null,
      dashStatus: PLAYER.dashState,
    })),
  caught: 0,
  time: GAME_CONFIG.roundSeconds,
  ...initialTelemetry,
  restartCount: 0,
  dashStatus: "ready",
  setDashStatus: (status) =>
    set((state) => (state.dashStatus === status ? state : { dashStatus: status })),
  setTelemetry: (telemetry) => set(telemetry),
  tick: (dt) => {
    const { time, state } = get();
    if (state === "timeup") return;
    if (roundTimeRemaining === 0) return;
    roundTimeRemaining = Math.max(0, roundTimeRemaining - dt);
    if (roundTimeRemaining === 0) {
      resetPlayerDash();
      clearInput();
      // Let a capture presentation finish before showing the round-over overlay.
      const presentingCapture = state === "capture" || state === "after";
      set(
        presentingCapture
          ? { time: 0, dashStatus: "ready" }
          : { time: 0, state: "timeup", dashStatus: "ready" },
      );
    } else if (Math.ceil(roundTimeRemaining) !== Math.ceil(time)) {
      // The HUD only needs whole seconds; keep React out of the 60fps loop.
      set({ time: roundTimeRemaining });
    }
  },
  addCatch: () => set((state) => ({ caught: state.caught + 1 })),
  restart: () => {
    resetSimulation();
    clearInput();
    roundTimeRemaining = GAME_CONFIG.roundSeconds;
    set((state) => ({
      caught: 0,
      time: GAME_CONFIG.roundSeconds,
      state: "chase",
      capture: null,
      ...initialTelemetry,
      playerX: PLAYER.x,
      playerZ: PLAYER.z,
      restartCount: state.restartCount + 1,
      dashStatus: "ready",
    }));
  },
}));
