import {
  AGENTS,
  PLAYER,
  WORLD_STATE,
  getPlayerBoostState,
  type Agent,
  type BoostState,
} from "./agents";
import { GAME_CONFIG } from "./config";
import {
  clearInput,
  getTouchPointerOwners,
  requestPlayerDash,
  requestPlayerSpeedBoost,
} from "./input";
import { advanceSimulationFrame, isSimulationEnabled, resetSimulationRuntime } from "./runtime";
import { useGameStore } from "@/store/gameStore";

type E2EState = Pick<
  ReturnType<typeof useGameStore.getState>,
  | "state"
  | "caught"
  | "time"
  | "capture"
  | "dashStatus"
  | "speedBoostStatus"
  | "boostEffectActive"
  | "boostCueId"
  | "interactionCueId"
  | "interactionCueKind"
  | "targetId"
  | "restartCount"
>;
type E2EPlayer = Pick<
  Agent,
  | "x"
  | "z"
  | "vx"
  | "vz"
  | "heading"
  | "speed"
  | "dashState"
  | "boostEffectRemaining"
  | "playerBoostCooldownRemaining"
  | "jumpElapsed"
  | "jumpHeight"
  | "jumpActivationId"
  | "slowMultiplier"
> & { boostState: BoostState };
type E2ERunner = Pick<Agent, "id" | "x" | "z" | "hidden" | "state" | "respawns">;
type E2EWorld = {
  barrierClosed: boolean;
  barrierRemaining: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraDistance: number;
  cameraManualRemaining: number;
  cameraFollowBlend: number;
  speedPadPulseRemaining: number;
  bounceImpactId: number;
};
type E2ERenderedCamera = {
  x: number;
  y: number;
  z: number;
  forwardX: number;
  forwardY: number;
  forwardZ: number;
};

export type CatchyE2EApi = {
  isReady: () => boolean;
  reset: () => void;
  step: (milliseconds: number) => void;
  getState: () => E2EState;
  getPlayer: () => E2EPlayer;
  getRunners: () => E2ERunner[];
  getWorld: () => E2EWorld;
  getRenderedCamera: () => E2ERenderedCamera | null;
  getTouchPointerOwners: () => Array<[number, string]>;
  activateDash: () => void;
  activateBoost: () => void;
  placePlayer: (x: number, z: number, vx?: number, vz?: number) => void;
  placeRunner: (id: string, x: number, z: number) => void;
  turnCamera: (yaw: number) => void;
  endRound: () => void;
};

declare global {
  interface Window {
    __CATCHY_E2E__?: CatchyE2EApi;
  }
}

function syncAgentPosition(agent: (typeof AGENTS)[number], x: number, z: number) {
  agent.x = x;
  agent.z = z;
  agent.previousX = x;
  agent.previousZ = z;
  agent.lastX = x;
  agent.lastZ = z;
  agent.vx = 0;
  agent.vz = 0;
  agent.speed = 0;
}

/** This module is dynamically imported only by the dedicated E2E build. */
export function installCatchyE2EBridge() {
  const api: CatchyE2EApi = {
    isReady: isSimulationEnabled,
    reset() {
      useGameStore.getState().restart();
      clearInput();
      resetSimulationRuntime();
    },
    step(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 600_000)
        throw new RangeError("E2E step must be between 0 and 600000 milliseconds");
      let remaining = milliseconds / 1000;
      const maxFrame = GAME_CONFIG.simulation.maxCatchUpSteps / GAME_CONFIG.simulation.tickHz;
      while (remaining > 0) {
        const frame = Math.min(remaining, maxFrame);
        advanceSimulationFrame(frame);
        remaining -= frame;
      }
    },
    getState() {
      const state = useGameStore.getState();
      return {
        state: state.state,
        caught: state.caught,
        time: state.time,
        capture: state.capture,
        dashStatus: state.dashStatus,
        speedBoostStatus: state.speedBoostStatus,
        boostEffectActive: state.boostEffectActive,
        boostCueId: state.boostCueId,
        interactionCueId: state.interactionCueId,
        interactionCueKind: state.interactionCueKind,
        targetId: state.targetId,
        restartCount: state.restartCount,
      };
    },
    getPlayer() {
      return {
        x: PLAYER.x,
        z: PLAYER.z,
        vx: PLAYER.vx,
        vz: PLAYER.vz,
        heading: PLAYER.heading,
        speed: PLAYER.speed,
        dashState: PLAYER.dashState,
        boostState: getPlayerBoostState(),
        boostEffectRemaining: PLAYER.boostEffectRemaining,
        playerBoostCooldownRemaining: PLAYER.playerBoostCooldownRemaining,
        jumpElapsed: PLAYER.jumpElapsed,
        jumpHeight: PLAYER.jumpHeight,
        jumpActivationId: PLAYER.jumpActivationId,
        slowMultiplier: PLAYER.slowMultiplier,
      };
    },
    getRunners() {
      return AGENTS.slice(1).map((runner) => ({
        id: runner.id,
        x: runner.x,
        z: runner.z,
        hidden: runner.hidden,
        state: runner.state,
        respawns: runner.respawns,
      }));
    },
    getWorld() {
      return {
        barrierClosed: WORLD_STATE.barrierClosed,
        barrierRemaining: WORLD_STATE.barrierRemaining,
        cameraYaw: WORLD_STATE.cameraYaw,
        cameraPitch: WORLD_STATE.cameraPitch,
        cameraDistance: WORLD_STATE.cameraDistance,
        cameraManualRemaining: WORLD_STATE.cameraManualRemaining,
        cameraFollowBlend: WORLD_STATE.cameraFollowBlend,
        speedPadPulseRemaining: WORLD_STATE.speedPadPulseRemaining,
        bounceImpactId: WORLD_STATE.bounceImpactId,
      };
    },
    getRenderedCamera() {
      return (
        (window as Window & { __CATCHY_RENDER_CAMERA__?: E2ERenderedCamera })
          .__CATCHY_RENDER_CAMERA__ ?? null
      );
    },
    getTouchPointerOwners() {
      return getTouchPointerOwners();
    },
    activateDash() {
      requestPlayerDash();
    },
    activateBoost() {
      requestPlayerSpeedBoost();
    },
    placePlayer(x, z, vx = 0, vz = 0) {
      syncAgentPosition(PLAYER, x, z);
      PLAYER.vx = vx;
      PLAYER.vz = vz;
    },
    placeRunner(id, x, z) {
      const runner = AGENTS.find((agent) => agent.id === id && agent.role === "runner");
      if (!runner) throw new RangeError(`Unknown runner: ${id}`);
      syncAgentPosition(runner, x, z);
      runner.hidden = 0;
      runner.state = "flee";
      runner.route.length = 0;
      runner.routeIndex = 0;
      runner.routeTimer = 0;
    },
    turnCamera(yaw) {
      WORLD_STATE.cameraYaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      WORLD_STATE.previousCameraYaw = WORLD_STATE.cameraYaw;
      WORLD_STATE.cameraManualRemaining = GAME_CONFIG.camera.manualPersistenceSeconds;
      WORLD_STATE.cameraFollowBlend = 0;
    },
    endRound() {
      useGameStore.getState().tick(GAME_CONFIG.roundSeconds);
    },
  };

  window.__CATCHY_E2E__ = api;
  return () => {
    if (window.__CATCHY_E2E__ === api) delete window.__CATCHY_E2E__;
  };
}
