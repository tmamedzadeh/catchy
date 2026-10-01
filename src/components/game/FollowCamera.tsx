import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { PLAYER, WORLD_STATE } from "@/lib/catchy/agents";
import { GAME_CONFIG } from "@/lib/catchy/config";
import { cameraModeInput } from "@/lib/catchy/input";
import { useGameStore } from "@/store/gameStore";

/** Smooth follow camera with independent yaw and subtle turn anticipation. */
export function FollowCamera() {
  const { camera } = useThree();
  const position = useRef(new THREE.Vector3(0, 20, 20));
  const lookAt = useRef(new THREE.Vector3());
  const desiredPosition = useRef(new THREE.Vector3());
  const desiredLookAt = useRef(new THREE.Vector3());
  const cameraOffset = useRef(new THREE.Vector3());
  const composedLookAt = useRef(new THREE.Vector3());
  const currentDistance = useRef(GAME_CONFIG.camera.distance * 0.9);
  const currentAngle = useRef(GAME_CONFIG.camera.angle);
  const currentLookAhead = useRef(GAME_CONFIG.camera.lookAhead);
  const currentCompositionOffset = useRef(GAME_CONFIG.camera.compositionOffset);
  const activeMode = useRef<ReturnType<typeof cameraModeInput>>("normal");
  const modeTransitionRemaining = useRef(0);
  const baseFov = useRef((camera as THREE.PerspectiveCamera).fov);
  const fov = useRef(baseFov.current);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const { camHeight, camAngle, camLookAhead, camCompositionOffset, state } =
      useGameStore.getState();
    const mode = cameraModeInput();
    if (mode !== activeMode.current) {
      activeMode.current = mode;
      modeTransitionRemaining.current = GAME_CONFIG.camera.modeTransitionSeconds;
    }
    const transitioning = modeTransitionRemaining.current > 0;
    const blend =
      1 - Math.exp(-(transitioning ? GAME_CONFIG.camera.modeTransitionSpeed : 3.2) * dt);
    modeTransitionRemaining.current = Math.max(0, modeTransitionRemaining.current - dt);
    const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.6;
    const portrait = aspect < 1 ? 1.42 : aspect < 1.4 ? 1.14 : 1;
    const tactical = mode === "tactical";
    const captureZoom = !tactical && (state === "capture" || state === "after") ? 0.78 : 1;
    const normalDistance = camHeight * 0.9 * portrait * captureZoom;
    const targetDistance = tactical
      ? GAME_CONFIG.camera.tacticalDistance * 0.9 * portrait
      : normalDistance;
    const targetAngle = tactical ? GAME_CONFIG.camera.tacticalAngle : camAngle;
    const targetLookAhead = tactical ? GAME_CONFIG.camera.tacticalLookAhead : camLookAhead;
    const targetComposition = tactical
      ? GAME_CONFIG.camera.tacticalCompositionOffset
      : camCompositionOffset;
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
      mode === "normal"
        ? THREE.MathUtils.clamp(
            PLAYER.turnRate * GAME_CONFIG.camera.turnAnticipationPerRadianPerSecond,
            -GAME_CONFIG.camera.turnAnticipationMaxRadians,
            GAME_CONFIG.camera.turnAnticipationMaxRadians,
          )
        : 0;
    const lookYaw = yaw + anticipation;
    const back = yaw + Math.PI;
    const anchorX = tactical ? 0 : playerX;
    const anchorZ = tactical ? 0 : playerZ;

    desiredPosition.current.set(
      anchorX + Math.sin(back) * distance,
      Math.max(2.5, distance * Math.tan(angle)),
      anchorZ + Math.cos(back) * distance,
    );
    desiredLookAt.current.set(
      anchorX + Math.sin(lookYaw) * currentLookAhead.current,
      0.9,
      anchorZ + Math.cos(lookYaw) * currentLookAhead.current,
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
  });

  return null;
}
