import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { PLAYER, respawn, step } from "@/lib/sprout/agents";
import { useGameStore } from "@/store/gameStore";
import { inputVector } from "@/lib/sprout/input";

const CAPTURE_RADIUS = 2.0;
const NEARBY_RADIUS = 9;

/** Drives the simulation, game state transitions and HUD telemetry. */
export function Director() {
  const { camera } = useThree();
  const captureTimer = useRef(0);
  const telemetryAcc = useRef(0);
  const v = useRef(new THREE.Vector3());

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const s = useGameStore.getState();
    const frozen = s.state === "capture" || s.state === "timeup";

    s.tick(dt);

    // make the stick/keys camera-relative: up always runs away from the camera
    const raw = inputVector();
    let input: { x: number; z: number } | null = null;
    if (raw) {
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      f.y = 0;
      f.normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      input = {
        x: r.x * raw.x + f.x * -raw.z,
        z: r.z * raw.x + f.z * -raw.z,
      };
    }
    const target = step(dt, input, frozen, s.autopilot);

    if (!s.manualState) {
      if (s.state === "capture" || s.state === "after") {
        captureTimer.current -= dt;
        if (captureTimer.current <= 0) {
          if (s.state === "capture") {
            useGameStore.getState().setState("after");
            captureTimer.current = 1.1;
          } else {
            useGameStore.getState().setState("chase");
          }
        }
      } else if (s.state !== "timeup" && target) {
        if (target.dist < CAPTURE_RADIUS) {
          useGameStore.getState().setState("capture");
          useGameStore.getState().addCatch();
          captureTimer.current = 1.2;
          respawn(target.agent);
        } else {
          const next = target.dist < NEARBY_RADIUS ? "nearby" : "chase";
          if (next !== s.state) useGameStore.getState().setState(next);
        }
      }
    }

    // telemetry for the HUD at ~10hz
    telemetryAcc.current += dt;
    if (telemetryAcc.current > 0.1 && target) {
      telemetryAcc.current = 0;
      const dx = target.agent.x - PLAYER.x;
      const dz = target.agent.z - PLAYER.z;
      // convert world direction into screen-space angle using the camera basis
      v.current.set(dx, 0, dz).normalize();
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const bearing = Math.atan2(v.current.dot(right), v.current.dot(fwd));
      useGameStore.getState().setTelemetry({ distance: target.dist, bearing });
    }
  });

  return null;
}
