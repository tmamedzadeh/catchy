import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { AGENTS, PLAYER, nearestRunner, respawn, step } from "@/lib/sprout/agents";
import { GAME_CONFIG } from "@/lib/sprout/config";
import { inputVector } from "@/lib/sprout/input";
import { useGameStore } from "@/store/gameStore";

const CAPTURE_PRESENTATION = 0.43;
const AFTER_PRESENTATION = 0.31;

/** Camera-relative controls, deterministic player-only capture, and HUD telemetry. */
export function Director() {
  const { camera } = useThree();
  const captureTimer = useRef(0);
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
    step(dt, frameInput, presentation, state.state === "timeup");

    if (state.state === "capture" || state.state === "after") {
      captureTimer.current -= dt;
      if (captureTimer.current <= 0) {
        if (state.state === "capture") {
          useGameStore.getState().setState("after");
          captureTimer.current = AFTER_PRESENTATION;
        } else {
          useGameStore.getState().setState("chase");
        }
      }
    } else if (state.state !== "timeup") {
      const target = nearestRunner();
      if (target && target.dist <= GAME_CONFIG.captureDistance) {
        // The only capture path is Player -> nearest active Runner.
        useGameStore.getState().setState("capture");
        useGameStore.getState().addCatch();
        captureTimer.current = CAPTURE_PRESENTATION;
        respawn(target.agent);
      } else {
        const nextState = target && target.dist < GAME_CONFIG.nearbyDistance ? "nearby" : "chase";
        if (nextState !== state.state) useGameStore.getState().setState(nextState);
      }
    }

    telemetryAcc.current += dt;
    if (telemetryAcc.current >= 0.1) {
      telemetryAcc.current = 0;
      const target = nearestRunner();
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
