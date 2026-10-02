import {
  AGENTS,
  PLAYER,
  RUNNERS,
  WORLD_STATE,
  clearPlayerJump,
  getPlayerBoostState,
  respawn,
  selectTarget,
  step,
} from "./agents";
import { GAME_CONFIG } from "./config";
import { getActiveMap } from "./maps";
import { installMapForSimulation } from "./agents";
import { getCameraRelativeBearing } from "./camera";
import { consumeFixedSteps } from "./fixedStep";
import {
  consumeCameraInput,
  consumePlayerActionCommands,
  inputVector,
  registerInputResetHandler,
} from "./input";
import { useGameStore } from "@/store/gameStore";

const FIXED_DT = 1 / GAME_CONFIG.simulation.tickHz;

const runtime = {
  accumulator: 0,
  captureTimer: 0,
  targetId: null as string | null,
  telemetryAcc: 0,
  simulationEnabled: false,
  lastRestartCount: useGameStore.getState().restartCount,
};

registerInputResetHandler(clearPlayerJump);

function simulateTick(dt: number) {
  let state = useGameStore.getState();
  if (state.restartCount !== runtime.lastRestartCount) {
    runtime.lastRestartCount = state.restartCount;
    runtime.captureTimer = 0;
    runtime.targetId = null;
    runtime.telemetryAcc = 0;
  }

  state.tick(dt);
  state = useGameStore.getState();
  const cameraYawForTick = WORLD_STATE.cameraYaw;
  const input = inputVector();
  const cameraInput = consumeCameraInput(dt);
  const commands = consumePlayerActionCommands();
  const jumpAllowed = state.state === "chase" || state.state === "nearby";
  if (!jumpAllowed) commands.jump = false;
  const presentation = state.state === "capture" || state.state === "after";
  const roundEnded = state.state === "timeup";

  step(
    dt,
    input,
    commands,
    presentation || roundEnded,
    presentation || roundEnded,
    cameraYawForTick,
    cameraInput,
  );

  const store = useGameStore.getState();
  if (store.dashStatus !== PLAYER.dashState) store.setDashStatus(PLAYER.dashState);
  const playerBoostState = getPlayerBoostState();
  if (store.speedBoostStatus !== playerBoostState) store.setSpeedBoostStatus(playerBoostState);
  const boostEffectActive = PLAYER.boostEffectRemaining > 0;
  if (store.boostEffectActive !== boostEffectActive) store.setBoostEffectActive(boostEffectActive);
  if (
    store.boostCueId !== WORLD_STATE.boostCueId ||
    store.interactionCueId !== WORLD_STATE.interactionCueId ||
    store.interactionCueKind !== WORLD_STATE.interactionCueKind
  ) {
    store.setSimulationFeedbackCues(
      WORLD_STATE.boostCueId,
      WORLD_STATE.interactionCueId,
      WORLD_STATE.interactionCueKind,
    );
  }

  let target = selectTarget(runtime.targetId, state.capture?.runnerId ?? null);
  runtime.targetId = target?.agent.id ?? null;

  if (presentation) {
    runtime.captureTimer -= dt;
    if (runtime.captureTimer <= 0) {
      if (state.state === "capture") {
        useGameStore.getState().enterAfter();
        runtime.captureTimer = GAME_CONFIG.capturePresentation.afterSeconds;
      } else {
        const snapshot = state.capture;
        const capturedRunner =
          snapshot && RUNNERS.find((runner) => runner.id === snapshot.runnerId);
        if (capturedRunner) respawn(capturedRunner);
        useGameStore.getState().finishCapture();
        runtime.captureTimer = 0;
        state = useGameStore.getState();
        target = selectTarget(runtime.targetId);
        runtime.targetId = target?.agent.id ?? null;
      }
    }
  } else if (!roundEnded) {
    if (target && target.dist <= GAME_CONFIG.captureDistance) {
      useGameStore.getState().beginCapture({
        runnerId: target.agent.id,
        position: { x: target.agent.x, y: 0, z: target.agent.z },
        capturedAt: performance.now(),
      });
      useGameStore.getState().addCatch();
      runtime.captureTimer = GAME_CONFIG.capturePresentation.captureSeconds;
    } else {
      const nextState = target && target.dist < GAME_CONFIG.nearbyDistance ? "nearby" : "chase";
      if (nextState !== state.state) useGameStore.getState().setState(nextState);
    }
  }

  runtime.telemetryAcc += dt;
  if (runtime.telemetryAcc >= 0.1) {
    runtime.telemetryAcc %= 0.1;
    const latest = useGameStore.getState();
    const cameraAnticipation =
      Math.max(-1, Math.min(1, PLAYER.turnRate)) *
      WORLD_STATE.cameraTurnAnticipation *
      (Math.PI / 180);
    const viewYaw = WORLD_STATE.cameraYaw + cameraAnticipation;
    let bearing = 0;
    if (target) {
      const dx = target.agent.x - PLAYER.x;
      const dz = target.agent.z - PLAYER.z;
      bearing = getCameraRelativeBearing(dx, dz, viewYaw);
    }

    useGameStore.getState().setTelemetry({
      distance: target?.dist ?? null,
      bearing,
      targetId: target?.agent.id ?? null,
      cameraYaw: WORLD_STATE.cameraYaw,
      playerX: import.meta.env.DEV ? PLAYER.x : latest.playerX,
      playerZ: import.meta.env.DEV ? PLAYER.z : latest.playerZ,
      playerSpeed: import.meta.env.DEV ? PLAYER.speed : latest.playerSpeed,
      runners: import.meta.env.DEV
        ? AGENTS.slice(1).map((runner) => ({
            id: runner.id,
            state: runner.state === "respawning" ? "respawning" : "flee",
            x: runner.x,
            z: runner.z,
            speed: runner.speed,
            active: runner.hidden <= 0,
          }))
        : latest.runners,
    });
  }
}

/** Advance game state from elapsed render time while keeping gameplay at a fixed rate. */
export function advanceSimulationFrame(frameDelta: number) {
  if (!runtime.simulationEnabled) return { accumulator: 0, alpha: 0, ticks: 0 };
  const result = consumeFixedSteps(
    runtime.accumulator,
    frameDelta,
    FIXED_DT,
    GAME_CONFIG.simulation.maxCatchUpSteps,
    simulateTick,
  );
  runtime.accumulator = result.accumulator;
  WORLD_STATE.renderAlpha = result.alpha;
  return result;
}

/** Simulation startup is tied to the same asset-ready state as the loading UI. */
export function setSimulationEnabled(enabled: boolean) {
  if (enabled) installMapForSimulation(getActiveMap());
  if (runtime.simulationEnabled === enabled) return;
  runtime.simulationEnabled = enabled;
  runtime.accumulator = 0;
  if (!enabled) WORLD_STATE.renderAlpha = 0;
}

export function isSimulationEnabled() {
  return runtime.simulationEnabled;
}

/** Used after an explicit test reset so the next manual tick starts from a clean clock. */
export function resetSimulationRuntime() {
  runtime.accumulator = 0;
  runtime.captureTimer = 0;
  runtime.targetId = null;
  runtime.telemetryAcc = 0;
  runtime.lastRestartCount = useGameStore.getState().restartCount;
  WORLD_STATE.renderAlpha = 0;
}

export const SIMULATION_FIXED_DT = FIXED_DT;
