import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { PLAYER } from "@/lib/sprout/agents";
import { useGameStore } from "@/store/gameStore";

/**
 * Elevated third-person follow camera. Height 14..32, pitch 45..75 degrees.
 * Never frames the whole arena, so the map keeps feeling big.
 */
export function FollowCamera() {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(0, 20, 20));
  const look = useRef(new THREE.Vector3());

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const { camHeight, camAngle, state } = useGameStore.getState();
    const rad = (camAngle * Math.PI) / 180;
    // horizontal distance derives from the height slider only
    const dist = camHeight * 0.9;

    // portrait screens see less width, so pull back to keep the arena readable
    const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.6;
    const portrait = aspect < 1 ? 1.45 : aspect < 1.4 ? 1.15 : 1;
    const zoom = (state === "capture" ? 0.72 : 1) * portrait;
    // angle sets elevation above the player; the camera always looks at the
    // avatar's feet, so it stays in frame at any angle
    const h = Math.max(2.5, dist * zoom * Math.tan(rad)) * (state === "capture" ? 0.8 : 1) * portrait;

    // trail behind the player's heading
    const back = PLAYER.heading + Math.PI;
    const tx = PLAYER.x + Math.sin(back) * dist * zoom;
    const tz = PLAYER.z + Math.cos(back) * dist * zoom;

    const k = 1 - Math.exp(-3.2 * dt);
    pos.current.lerp(new THREE.Vector3(tx, h, tz), k);
    look.current.lerp(
      new THREE.Vector3(
        PLAYER.x + Math.sin(PLAYER.heading) * 2,
        0.9,
        PLAYER.z + Math.cos(PLAYER.heading) * 2,
      ),
      k,
    );

    camera.position.copy(pos.current);
    camera.lookAt(look.current);
  });

  return null;
}
