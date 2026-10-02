import { create } from "zustand";
import {
  PLAYER,
  WORLD_STATE,
  cancelPlayerActions,
  getPlayerBoostState,
  resetSimulation,
  type InteractionKind,
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
  camDistance: number;
  camPitch: number;
  camLookAhead: number;
  camCompositionOffset: number;
  camFollowYawSpeed: number;
  camTurnAnticipation: number;
  camFollowResumeSpeed: number;
  setCamDistance: (value: number) => void;
  setCamPitch: (value: number) => void;
  setCamLookAhead: (value: number) => void;
  setCamCompositionOffset: (value: number) => void;
  setCamFollowYawSpeed: (value: number) => void;
  setCamTurnAnticipation: (value: number) => void;
  setCamFollowResumeSpeed: (value: number) => void;
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
  boostEffectActive: boolean;
  boostCueId: number;
  interactionCueId: number;
  interactionCueKind: InteractionKind | null;
  setDashStatus: (status: DashState) => void;
  setSpeedBoostStatus: (status: BoostState) => void;
  setBoostEffectActive: (active: boolean) => void;
  setSimulationFeedbackCues: (
    boostCueId: number,
    interactionCueId: number,
    interactionCueKind: InteractionKind | null,
  ) => void;
  setTelemetry: (telemetry: Telemetry) => void;
  tick: (dt: number) => void;
  addCatch: () => void;
  restart: () => void;
};

export const CAM_DEFAULTS = {
  distance: GAME_CONFIG.camera.distance,
  pitch: GAME_CONFIG.camera.pitch,
  lookAhead: GAME_CONFIG.camera.lookAhead,
  compositionOffset: GAME_CONFIG.camera.compositionOffset,
  followYawSpeed: GAME_CONFIG.camera.followYawSpeed,
  turnAnticipation: GAME_CONFIG.camera.turnAnticipation,
  followResumeSpeed: GAME_CONFIG.camera.followResumeSpeed,
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
  camDistance: CAM_DEFAULTS.distance,
  camPitch: CAM_DEFAULTS.pitch,
  camLookAhead: CAM_DEFAULTS.lookAhead,
  camCompositionOffset: CAM_DEFAULTS.compositionOffset,
  camFollowYawSpeed: CAM_DEFAULTS.followYawSpeed,
  camTurnAnticipation: CAM_DEFAULTS.turnAnticipation,
  camFollowResumeSpeed: CAM_DEFAULTS.followResumeSpeed,
  setCamDistance: (value) => {
    const distance = snapCameraValue(value, GAME_CONFIG.camera.tuningRanges.distance);
    WORLD_STATE.cameraDistance = distance;
    set({ camDistance: distance });
  },
  setCamPitch: (value) =>
    set({ camPitch: snapCameraValue(value, GAME_CONFIG.camera.tuningRanges.pitch) }),
  setCamLookAhead: (value) =>
    set({ camLookAhead: snapCameraValue(value, GAME_CONFIG.camera.tuningRanges.lookAhead) }),
  setCamCompositionOffset: (value) =>
    set({
      camCompositionOffset: snapCameraValue(
        value,
        GAME_CONFIG.camera.tuningRanges.compositionOffset,
      ),
    }),
  setCamFollowYawSpeed: (value) => {
    const followYawSpeed = snapCameraValue(value, GAME_CONFIG.camera.tuningRanges.followYawSpeed);
    WORLD_STATE.cameraFollowYawSpeed = followYawSpeed;
    set({ camFollowYawSpeed: followYawSpeed });
  },
  setCamTurnAnticipation: (value) => {
    const turnAnticipation = snapCameraValue(
      value,
      GAME_CONFIG.camera.tuningRanges.turnAnticipation,
    );
    WORLD_STATE.cameraTurnAnticipation = turnAnticipation;
    set({ camTurnAnticipation: turnAnticipation });
  },
  setCamFollowResumeSpeed: (value) => {
    const followResumeSpeed = snapCameraValue(
      value,
      GAME_CONFIG.camera.tuningRanges.followResumeSpeed,
    );
    WORLD_STATE.cameraFollowResumeSpeed = followResumeSpeed;
    set({ camFollowResumeSpeed: followResumeSpeed });
  },
  resetCamera: () => {
    WORLD_STATE.cameraYaw = PLAYER.heading;
    WORLD_STATE.previousCameraYaw = PLAYER.heading;
    WORLD_STATE.cameraPitch = 0;
    WORLD_STATE.cameraDistance = CAM_DEFAULTS.distance;
    WORLD_STATE.cameraManualRemaining = 0;
    WORLD_STATE.cameraFollowYawSpeed = CAM_DEFAULTS.followYawSpeed;
    WORLD_STATE.cameraTurnAnticipation = CAM_DEFAULTS.turnAnticipation;
    WORLD_STATE.cameraFollowResumeSpeed = CAM_DEFAULTS.followResumeSpeed;
    WORLD_STATE.cameraFollowBlend = 1;
    set({
      camDistance: CAM_DEFAULTS.distance,
      camPitch: CAM_DEFAULTS.pitch,
      camLookAhead: CAM_DEFAULTS.lookAhead,
      camCompositionOffset: CAM_DEFAULTS.compositionOffset,
      camFollowYawSpeed: CAM_DEFAULTS.followYawSpeed,
      camTurnAnticipation: CAM_DEFAULTS.turnAnticipation,
      camFollowResumeSpeed: CAM_DEFAULTS.followResumeSpeed,
      cameraYaw: WORLD_STATE.cameraYaw,
    });
  },

  state: "chase",
  setState: (state) => {
    if (state !== "chase" && state !== "nearby") cancelPlayerActions();
    set({ state, dashStatus: PLAYER.dashState, speedBoostStatus: getPlayerBoostState() });
  },
  capture: null,
  beginCapture: (capture) => {
    cancelPlayerActions();
    set({
      state: "capture",
      capture,
      dashStatus: PLAYER.dashState,
      speedBoostStatus: getPlayerBoostState(),
    });
  },
  enterAfter: () => {
    cancelPlayerActions();
    set({ state: "after", dashStatus: PLAYER.dashState, speedBoostStatus: getPlayerBoostState() });
  },
  finishCapture: () =>
    set((state) => ({
      state: state.time <= 0 ? "timeup" : "chase",
      capture: null,
      dashStatus: PLAYER.dashState,
      speedBoostStatus: getPlayerBoostState(),
    })),
  caught: 0,
  time: GAME_CONFIG.roundSeconds,
  ...initialTelemetry,
  restartCount: 0,
  dashStatus: "ready",
  speedBoostStatus: "ready",
  boostEffectActive: false,
  boostCueId: 0,
  interactionCueId: 0,
  interactionCueKind: null,
  setDashStatus: (status) =>
    set((state) => (state.dashStatus === status ? state : { dashStatus: status })),
  setSpeedBoostStatus: (status) =>
    set((state) => (state.speedBoostStatus === status ? state : { speedBoostStatus: status })),
  setBoostEffectActive: (active) =>
    set((state) => (state.boostEffectActive === active ? state : { boostEffectActive: active })),
  setSimulationFeedbackCues: (boostCueId, interactionCueId, interactionCueKind) =>
    set((state) =>
      state.boostCueId === boostCueId &&
      state.interactionCueId === interactionCueId &&
      state.interactionCueKind === interactionCueKind
        ? state
        : { boostCueId, interactionCueId, interactionCueKind },
    ),
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
          ? { time: 0, dashStatus: "ready", speedBoostStatus: "ready", boostEffectActive: false }
          : {
              time: 0,
              state: "timeup",
              dashStatus: "ready",
              speedBoostStatus: "ready",
              boostEffectActive: false,
            },
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
      camDistance: CAM_DEFAULTS.distance,
      camPitch: CAM_DEFAULTS.pitch,
      camLookAhead: CAM_DEFAULTS.lookAhead,
      camCompositionOffset: CAM_DEFAULTS.compositionOffset,
      camFollowYawSpeed: CAM_DEFAULTS.followYawSpeed,
      camTurnAnticipation: CAM_DEFAULTS.turnAnticipation,
      camFollowResumeSpeed: CAM_DEFAULTS.followResumeSpeed,
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
      boostEffectActive: false,
      boostCueId: 0,
      interactionCueId: 0,
      interactionCueKind: null,
    }));
  },
}));
