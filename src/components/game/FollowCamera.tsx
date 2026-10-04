import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { PLAYER, WORLD_STATE } from "@/lib/catchy/agents";
import { getCameraBasis, getCameraRenderDistance, type CameraBasis } from "@/lib/catchy/camera";
import { GAME_CONFIG } from "@/lib/catchy/config";
import { useGameStore } from "@/store/gameStore";

const orbitBasis: CameraBasis = { forwardX: 0, forwardZ: 1, rightX: -1, rightZ: 0 };
const lookAheadBasis: CameraBasis = { forwardX: 0, forwardZ: 1, rightX: -1, rightZ: 0 };

/** Smooth follow camera with independent yaw and subtle turn anticipation. */
export function FollowCamera() {
  const { camera } = useThree();
  const position = useRef(new THREE.Vector3(0, 20, 20));
  const lookAt = useRef(new THREE.Vector3());
  const desiredPosition = useRef(new THREE.Vector3());
  const desiredLookAt = useRef(new THREE.Vector3());
  const cameraOffset = useRef(new THREE.Vector3());
  const composedLookAt = useRef(new THREE.Vector3());
  const renderedDirection = useRef(new THREE.Vector3());
  const currentDistance = useRef(GAME_CONFIG.camera.distance);
  const currentAngle = useRef(GAME_CONFIG.camera.pitch);
  const currentLookAhead = useRef(GAME_CONFIG.camera.lookAhead);
  const currentCompositionOffset = useRef(GAME_CONFIG.camera.compositionOffset);
  const baseFov = useRef((camera as THREE.PerspectiveCamera).fov);
  const fov = useRef(baseFov.current);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const { camDistance, camPitch, camLookAhead, camCompositionOffset, state } =
      useGameStore.getState();
    const blend = 1 - Math.exp(-3.2 * dt);
    const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.6;
    const targetDistance = getCameraRenderDistance(
      WORLD_STATE.cameraDistance,
      aspect,
      state === "capture" || state === "after",
    );
    const targetAngle = camPitch;
    const targetLookAhead = camLookAhead;
    const targetComposition = camCompositionOffset;
    currentDistance.current += (targetDistance - currentDistance.current) * blend;
    currentAngle.current += (targetAngle - currentAngle.current) * blend;
    currentLookAhead.current += (targetLookAhead - currentLookAhead.current) * blend;
    currentCompositionOffset.current +=
      (targetComposition - currentCompositionOffset.current) * blend;
    const distance = currentDistance.current;
    const angle = ((currentAngle.current + WORLD_STATE.cameraPitch) * Math.PI) / 180;
    const alpha = WORLD_STATE.renderAlpha;
    const playerX = PLAYER.previousX + (PLAYER.x - PLAYER.previousX) * alpha;
    const playerZ = PLAYER.previousZ + (PLAYER.z - PLAYER.previousZ) * alpha;
    const yawDelta = Math.atan2(
      Math.sin(WORLD_STATE.cameraYaw - WORLD_STATE.previousCameraYaw),
      Math.cos(WORLD_STATE.cameraYaw - WORLD_STATE.previousCameraYaw),
    );
    const yaw = WORLD_STATE.previousCameraYaw + yawDelta * alpha;
    const anticipation =
      THREE.MathUtils.clamp(PLAYER.turnRate, -1, 1) *
      WORLD_STATE.cameraTurnAnticipation *
      (Math.PI / 180);
    const lookYaw = yaw + anticipation;
    const anchorX = playerX;
    const anchorZ = playerZ;
    const cameraBasis = getCameraBasis(yaw, orbitBasis);

    desiredPosition.current.set(
      anchorX - cameraBasis.forwardX * distance,
      Math.max(2.5, distance * Math.tan(angle)),
      anchorZ - cameraBasis.forwardZ * distance,
    );
    const lookBasis = getCameraBasis(lookYaw, lookAheadBasis);
    desiredLookAt.current.set(
      anchorX + lookBasis.forwardX * currentLookAhead.current,
      0.9,
      anchorZ + lookBasis.forwardZ * currentLookAhead.current,
    );

    const perspective = camera as THREE.PerspectiveCamera;
    const dash = GAME_CONFIG.player.dash;
    const fovPulse = Math.min(PLAYER.dashCameraRemaining / dash.cameraImpulseSeconds, 1);
    const desiredFov = baseFov.current + dash.cameraFovIncrease * fovPulse;
    fov.current += (desiredFov - fov.current) * (1 - Math.exp(-12 * dt));
    if (Math.abs(perspective.fov - fov.current) > 0.01) {
      perspective.fov = fov.current;
      perspective.updateProjectionMatrix();
    }
    position.current.lerp(desiredPosition.current, blend);
    // Linear interpolation cuts inside the orbit during turns, which looks like a zoom.
    const offsetX = position.current.x - anchorX;
    const offsetZ = position.current.z - anchorZ;
    const horizontalDistance = Math.hypot(offsetX, offsetZ);
    if (horizontalDistance > 0.001) {
      const distanceCorrection = distance / horizontalDistance;
      position.current.x = anchorX + offsetX * distanceCorrection;
      position.current.z = anchorZ + offsetZ * distanceCorrection;
    }
    lookAt.current.lerp(desiredLookAt.current, blend);
    camera.position.copy(position.current);
    camera.lookAt(lookAt.current);

    // Translate the camera rig along its own up axis to keep the requested
    // percentage of the viewport between the player and screen center.
    cameraOffset.current
      .set(0, 1, 0)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(
        currentCompositionOffset.current *
          2 *
          camera.position.distanceTo(lookAt.current) *
          Math.tan((perspective.fov * Math.PI) / 360),
      );
    camera.position.add(cameraOffset.current);
    composedLookAt.current.copy(lookAt.current).add(cameraOffset.current);
    camera.lookAt(composedLookAt.current);

    if (import.meta.env.MODE === "e2e" && typeof window !== "undefined") {
      camera.getWorldDirection(renderedDirection.current);
      (window as Window & { __CATCHY_RENDER_CAMERA__?: object }).__CATCHY_RENDER_CAMERA__ = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        forwardX: renderedDirection.current.x,
        forwardY: renderedDirection.current.y,
        forwardZ: renderedDirection.current.z,
      };
    }
  });

  return null;
}
