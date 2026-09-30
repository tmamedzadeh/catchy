import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { AGENTS, PLAYER, RUNNERS, respawn, selectTarget, step } from "@/lib/sprout/agents";
import { GAME_CONFIG } from "@/lib/sprout/config";
import { inputVector } from "@/lib/sprout/input";
import { useGameStore } from "@/store/gameStore";

/** Camera-relative controls, deterministic player-only capture, and HUD telemetry. */
export function Director() {
  const { camera } = useThree();
  const captureTimer = useRef(0);
  const targetId = useRef<string | null>(null);
  const telemetryAcc = useRef(0);
  const lastRestartCount = useRef(useGameStore.getState().restartCount);
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const input = useRef({ x: 0, z: 0 });

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
    const dt = Math.min(rawDelta, 0.05);
    let state = useGameStore.getState();
    if (state.restartCount !== lastRestartCount.current) {
      lastRestartCount.current = state.restartCount;
      captureTimer.current = 0;
      targetId.current = null;
      telemetryAcc.current = 0;
    }
    state.tick(dt);
    state = useGameStore.getState();

    const raw = inputVector();
    if (raw) {
      camera.getWorldDirection(forward.current);
      forward.current.y = 0;
      forward.current.normalize();
      right.current.set(-forward.current.z, 0, forward.current.x);
      input.current.x = right.current.x * raw.x - forward.current.x * raw.z;
      input.current.z = right.current.z * raw.x - forward.current.z * raw.z;
    }
    const frameInput = raw ? input.current : null;
    const presentation = state.state === "capture" || state.state === "after";
    step(
      dt,
      frameInput,
      presentation || state.state === "timeup",
      presentation || state.state === "timeup",
    );
    let target = selectTarget(targetId.current, state.capture?.runnerId ?? null);
    targetId.current = target?.agent.id ?? null;

    if (presentation) {
      captureTimer.current -= dt;
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
    } else if (state.state !== "timeup") {
      if (target && target.dist <= GAME_CONFIG.captureDistance) {
        // Snapshot the live runner before the capture presentation takes control.
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

    telemetryAcc.current += dt;
    if (telemetryAcc.current >= 0.1) {
      telemetryAcc.current = 0;
      const latest = useGameStore.getState();
      target = selectTarget(targetId.current, latest.capture?.runnerId ?? null);
      targetId.current = target?.agent.id ?? null;
      camera.getWorldDirection(forward.current);
      forward.current.y = 0;
      forward.current.normalize();
      right.current.set(-forward.current.z, 0, forward.current.x).normalize();
      let bearing = 0;
      if (target) {
        direction.current.set(target.agent.x - PLAYER.x, 0, target.agent.z - PLAYER.z).normalize();
        bearing = Math.atan2(
          direction.current.dot(right.current),
          direction.current.dot(forward.current),
        );
      }

      useGameStore.getState().setTelemetry({
        distance: target?.dist ?? null,
        bearing,
        targetId: target?.agent.id ?? null,
        cameraYaw: Math.atan2(forward.current.x, forward.current.z),
        playerX: PLAYER.x,
        playerZ: PLAYER.z,
        playerSpeed: PLAYER.speed,
        runners: AGENTS.slice(1).map((runner) => ({
          id: runner.id,
          state: runner.state === "respawning" ? "respawning" : "flee",
          x: runner.x,
          z: runner.z,
          speed: runner.speed,
          active: runner.hidden <= 0,
        })),
      });
    }
  });

  return null;
}
