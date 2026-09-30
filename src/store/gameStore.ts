import { create } from "zustand";
import {
  PLAYER,
  WORLD_STATE,
  cancelPlayerActions,
  resetSimulation,
  type BoostState,
  type DashState,
} from "@/lib/catchy/agents";
import { clearInput } from "@/lib/catchy/input";
import { GAME_CONFIG } from "@/lib/catchy/config";

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
  camLookAhead: number;
  camCompositionOffset: number;
  setCamHeight: (value: number) => void;
  setCamAngle: (value: number) => void;
  setCamLookAhead: (value: number) => void;
  setCamCompositionOffset: (value: number) => void;
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
  speedBoostStatus: BoostState;
  boostCueId: number;
  setDashStatus: (status: DashState) => void;
  setSpeedBoostStatus: (status: BoostState) => void;
  setBoostCueId: (id: number) => void;
  setTelemetry: (telemetry: Telemetry) => void;
  tick: (dt: number) => void;
  addCatch: () => void;
  restart: () => void;
};

export const CAM_DEFAULTS = {
  distance: GAME_CONFIG.camera.distance,
  angle: GAME_CONFIG.camera.angle,
  lookAhead: GAME_CONFIG.camera.lookAhead,
  compositionOffset: GAME_CONFIG.camera.compositionOffset,
};

function snapCameraValue(value: number, range: { min: number; max: number; step: number }) {
  const bounded = Math.max(range.min, Math.min(range.max, value));
  const stepped = range.min + Math.round((bounded - range.min) / range.step) * range.step;
  return Number(stepped.toFixed(4));
}

let roundTimeRemaining: number = GAME_CONFIG.roundSeconds;

const initialTelemetry: Telemetry = {
  distance: null,
  bearing: 0,
  targetId: null,
  cameraYaw: WORLD_STATE.cameraYaw,
  playerX: PLAYER.x,
  playerZ: PLAYER.z,
  playerSpeed: 0,
  runners: [],
};

export const useGameStore = create<Store>((set, get) => ({
  camHeight: CAM_DEFAULTS.distance,
  camAngle: CAM_DEFAULTS.angle,
  camLookAhead: CAM_DEFAULTS.lookAhead,
  camCompositionOffset: CAM_DEFAULTS.compositionOffset,
  setCamHeight: (value) =>
    set({ camHeight: snapCameraValue(value, GAME_CONFIG.camera.tuningRanges.distance) }),
  setCamAngle: (value) =>
    set({ camAngle: snapCameraValue(value, GAME_CONFIG.camera.tuningRanges.angle) }),
  setCamLookAhead: (value) =>
    set({ camLookAhead: snapCameraValue(value, GAME_CONFIG.camera.tuningRanges.lookAhead) }),
  setCamCompositionOffset: (value) =>
    set({
      camCompositionOffset: snapCameraValue(
        value,
        GAME_CONFIG.camera.tuningRanges.compositionOffset,
      ),
    }),
  resetCamera: () => {
    WORLD_STATE.cameraYaw = PLAYER.heading;
    WORLD_STATE.previousCameraYaw = PLAYER.heading;
    set({
      camHeight: CAM_DEFAULTS.distance,
      camAngle: CAM_DEFAULTS.angle,
      camLookAhead: CAM_DEFAULTS.lookAhead,
      camCompositionOffset: CAM_DEFAULTS.compositionOffset,
      cameraYaw: WORLD_STATE.cameraYaw,
    });
  },

  state: "chase",
  setState: (state) => {
    if (state !== "chase" && state !== "nearby") cancelPlayerActions();
    set({ state, dashStatus: PLAYER.dashState, speedBoostStatus: PLAYER.boostState });
  },
  capture: null,
  beginCapture: (capture) => {
    cancelPlayerActions();
    set({
      state: "capture",
      capture,
      dashStatus: PLAYER.dashState,
      speedBoostStatus: PLAYER.boostState,
    });
  },
  enterAfter: () => {
    cancelPlayerActions();
    set({ state: "after", dashStatus: PLAYER.dashState, speedBoostStatus: PLAYER.boostState });
  },
  finishCapture: () =>
    set((state) => ({
      state: state.time <= 0 ? "timeup" : "chase",
      capture: null,
      dashStatus: PLAYER.dashState,
      speedBoostStatus: PLAYER.boostState,
    })),
  caught: 0,
  time: GAME_CONFIG.roundSeconds,
  ...initialTelemetry,
  restartCount: 0,
  dashStatus: "ready",
  speedBoostStatus: "ready",
  boostCueId: 0,
  setDashStatus: (status) =>
    set((state) => (state.dashStatus === status ? state : { dashStatus: status })),
  setSpeedBoostStatus: (status) =>
    set((state) => (state.speedBoostStatus === status ? state : { speedBoostStatus: status })),
  setBoostCueId: (id) => set((state) => (state.boostCueId === id ? state : { boostCueId: id })),
  setTelemetry: (telemetry) => set(telemetry),
  tick: (dt) => {
    const { time, state } = get();
    if (state === "timeup") return;
    if (roundTimeRemaining === 0) return;
    roundTimeRemaining = Math.max(0, roundTimeRemaining - dt);
    if (roundTimeRemaining === 0) {
      cancelPlayerActions(true);
      clearInput();
      // Let a capture presentation finish before showing the round-over overlay.
      const presentingCapture = state === "capture" || state === "after";
      set(
        presentingCapture
          ? { time: 0, dashStatus: "ready", speedBoostStatus: "ready" }
          : { time: 0, state: "timeup", dashStatus: "ready", speedBoostStatus: "ready" },
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
      speedBoostStatus: "ready",
      boostCueId: 0,
    }));
  },
}));
