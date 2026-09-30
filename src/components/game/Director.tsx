import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
  AGENTS,
  PLAYER,
  RUNNERS,
  WORLD_STATE,
  respawn,
  selectTarget,
  step,
} from "@/lib/catchy/agents";
import { GAME_CONFIG } from "@/lib/catchy/config";
import { cameraTurnInput, consumePlayerActionCommands, inputVector } from "@/lib/catchy/input";
import { useGameStore } from "@/store/gameStore";

const FIXED_DT = 1 / GAME_CONFIG.simulation.tickHz;
const MAX_FRAME_DELTA = FIXED_DT * GAME_CONFIG.simulation.maxCatchUpSteps;

/** Fixed 60 Hz gameplay, camera-relative controls, capture flow and sparse HUD telemetry. */
export function Director() {
  const captureTimer = useRef(0);
  const targetId = useRef<string | null>(null);
  const telemetryAcc = useRef(0);
  const accumulator = useRef(0);
  const lastRestartCount = useRef(useGameStore.getState().restartCount);
  const debugTelemetry = useRef(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "true",
  ).current;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      if (event.repeat) return;
      useGameStore.getState().restart();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useFrame((_, rawDelta) => {
    accumulator.current = Math.min(
      accumulator.current + Math.max(0, Math.min(rawDelta, MAX_FRAME_DELTA)),
      MAX_FRAME_DELTA,
    );

    let ticks = 0;
    while (accumulator.current >= FIXED_DT && ticks < GAME_CONFIG.simulation.maxCatchUpSteps) {
      accumulator.current -= FIXED_DT;
      ticks++;

      let state = useGameStore.getState();
      if (state.restartCount !== lastRestartCount.current) {
        lastRestartCount.current = state.restartCount;
        captureTimer.current = 0;
        targetId.current = null;
        telemetryAcc.current = 0;
      }

      state.tick(FIXED_DT);
      state = useGameStore.getState();
      const input = inputVector();
      const commands = consumePlayerActionCommands();
      const presentation = state.state === "capture" || state.state === "after";
      const roundEnded = state.state === "timeup";

      step(
        FIXED_DT,
        input,
        commands,
        presentation || roundEnded,
        presentation || roundEnded,
        cameraTurnInput(),
      );

      const store = useGameStore.getState();
      if (store.dashStatus !== PLAYER.dashState) store.setDashStatus(PLAYER.dashState);
      if (store.speedBoostStatus !== PLAYER.boostState)
        store.setSpeedBoostStatus(PLAYER.boostState);
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

      let target = selectTarget(targetId.current, state.capture?.runnerId ?? null);
      targetId.current = target?.agent.id ?? null;

      if (presentation) {
        captureTimer.current -= FIXED_DT;
        if (captureTimer.current <= 0) {
          if (state.state === "capture") {
            useGameStore.getState().enterAfter();
            captureTimer.current = GAME_CONFIG.capturePresentation.afterSeconds;
          } else {
            const snapshot = state.capture;
            const capturedRunner =
              snapshot && RUNNERS.find((runner) => runner.id === snapshot.runnerId);
            if (capturedRunner) respawn(capturedRunner);
            useGameStore.getState().finishCapture();
            captureTimer.current = 0;
            state = useGameStore.getState();
            target = selectTarget(targetId.current);
            targetId.current = target?.agent.id ?? null;
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
          captureTimer.current = GAME_CONFIG.capturePresentation.captureSeconds;
        } else {
          const nextState = target && target.dist < GAME_CONFIG.nearbyDistance ? "nearby" : "chase";
          if (nextState !== state.state) useGameStore.getState().setState(nextState);
        }
      }

      telemetryAcc.current += FIXED_DT;
      if (telemetryAcc.current >= 0.1) {
        telemetryAcc.current %= 0.1;
        const latest = useGameStore.getState();
        const cameraAnticipation = Math.max(
          -GAME_CONFIG.camera.turnAnticipationMaxRadians,
          Math.min(
            GAME_CONFIG.camera.turnAnticipationMaxRadians,
            PLAYER.turnRate * GAME_CONFIG.camera.turnAnticipationPerRadianPerSecond,
          ),
        );
        const viewYaw = WORLD_STATE.cameraYaw + cameraAnticipation;
        const forwardX = Math.sin(viewYaw);
        const forwardZ = Math.cos(viewYaw);
        const rightX = Math.cos(viewYaw);
        const rightZ = -Math.sin(viewYaw);
        let bearing = 0;
        if (target) {
          const dx = target.agent.x - PLAYER.x;
          const dz = target.agent.z - PLAYER.z;
          const length = Math.hypot(dx, dz) || 1;
          bearing = Math.atan2(
            (dx * rightX + dz * rightZ) / length,
            (dx * forwardX + dz * forwardZ) / length,
          );
        }

        useGameStore.getState().setTelemetry({
          distance: target?.dist ?? null,
          bearing,
          targetId: target?.agent.id ?? null,
          cameraYaw: WORLD_STATE.cameraYaw,
          playerX: debugTelemetry ? PLAYER.x : latest.playerX,
          playerZ: debugTelemetry ? PLAYER.z : latest.playerZ,
          playerSpeed: debugTelemetry ? PLAYER.speed : latest.playerSpeed,
          runners: debugTelemetry
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

    WORLD_STATE.renderAlpha = accumulator.current / FIXED_DT;
  }, -1);

  return null;
}
