import { AGENTS, PLAYER, WORLD_STATE } from "./agents";
import { GAME_CONFIG } from "./config";
import { clearInput, requestPlayerDash, requestPlayerSpeedBoost } from "./input";
import { advanceSimulationFrame, resetSimulationRuntime } from "./runtime";
import { useGameStore } from "@/store/gameStore";

export type CatchyE2EApi = {
  reset: () => void;
  step: (milliseconds: number) => void;
  getState: () => Record<string, unknown>;
  getPlayer: () => Record<string, number | string>;
  getRunners: () => Record<string, number | string>[];
  getWorld: () => Record<string, number | boolean>;
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
        boostState: PLAYER.boostState,
        jumpRemaining: PLAYER.jumpRemaining,
        slideRemaining: PLAYER.slideRemaining,
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
        speedPadPulseRemaining: WORLD_STATE.speedPadPulseRemaining,
        bounceImpactId: WORLD_STATE.bounceImpactId,
      };
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
