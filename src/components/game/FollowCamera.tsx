import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { PLAYER } from "@/lib/sprout/agents";
import { useGameStore } from "@/store/gameStore";

/** Smooth perspective follow camera trailing behind the player's heading. */
export function FollowCamera() {
  const { camera } = useThree();
  const position = useRef(new THREE.Vector3(0, 20, 20));
  const lookAt = useRef(new THREE.Vector3());
  const desiredPosition = useRef(new THREE.Vector3());
  const desiredLookAt = useRef(new THREE.Vector3());

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const { camHeight, camAngle, state } = useGameStore.getState();
    const angle = (camAngle * Math.PI) / 180;
    const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.6;
    const portrait = aspect < 1 ? 1.42 : aspect < 1.4 ? 1.14 : 1;
    const captureZoom = state === "capture" || state === "after" ? 0.78 : 1;
    const distance = camHeight * 0.9 * portrait * captureZoom;
    const back = PLAYER.heading + Math.PI;

    desiredPosition.current.set(
      PLAYER.x + Math.sin(back) * distance,
      Math.max(2.5, distance * Math.tan(angle)),
      PLAYER.z + Math.cos(back) * distance,
    );
    desiredLookAt.current.set(
      PLAYER.x + Math.sin(PLAYER.heading) * 1.8,
      0.9,
      PLAYER.z + Math.cos(PLAYER.heading) * 1.8,
    );

    const blend = 1 - Math.exp(-3.2 * dt);
    position.current.lerp(desiredPosition.current, blend);
    // Linear interpolation cuts inside the orbit during turns, which looks like a zoom.
    const offsetX = position.current.x - PLAYER.x;
    const offsetZ = position.current.z - PLAYER.z;
    const horizontalDistance = Math.hypot(offsetX, offsetZ);
    if (horizontalDistance > 0.001) {
      const distanceCorrection = distance / horizontalDistance;
      position.current.x = PLAYER.x + offsetX * distanceCorrection;
      position.current.z = PLAYER.z + offsetZ * distanceCorrection;
    }
    lookAt.current.lerp(desiredLookAt.current, blend);
    camera.position.copy(position.current);
    camera.lookAt(lookAt.current);
  });

  return null;
}
