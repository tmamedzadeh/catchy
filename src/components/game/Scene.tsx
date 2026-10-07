import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Lightformer } from "@react-three/drei";
import { PLAYER } from "@/lib/catchy/agents";
import { EnvironmentCapture } from "./EnvironmentCapture";
import { Arena, SkyDome } from "./Arena";
import { Props } from "./Prop";
import { ArenaInteractions } from "./ArenaInteractions";
import { Characters } from "./Characters";
import { CaptureBurst, DashStreak, Dust, TargetBeacon } from "./Effects";
import { FollowCamera } from "./FollowCamera";
import { Director } from "./Director";
import { QUALITY_LEVELS, type QualityTier } from "./quality";

/** Keep the high quality shadow window around the active play area on R100. */
function FollowSunLight({ qualityTier }: { qualityTier: QualityTier }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const mapSize = QUALITY_LEVELS[qualityTier].shadowMapSize;
  const texelSize = 80 / mapSize;

  useFrame(() => {
    const focusX = Math.round(PLAYER.x / texelSize) * texelSize;
    const focusZ = Math.round(PLAYER.z / texelSize) * texelSize;
    target.position.set(focusX, 0, focusZ);
    light.current?.position.set(focusX + 24, 30, focusZ + 12);
  });

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        position={[24, 30, 12]}
        intensity={3.55}
        color="#ffdca3"
        castShadow
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-bias={-0.00045}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={110}
      />
    </>
  );
}

export function Scene({
  qualityTier,
  gameReady,
  onSceneReady,
}: {
  qualityTier: QualityTier;
  gameReady: boolean;
  onSceneReady: () => void;
}) {
  return (
    <>
      <fog attach="fog" args={["#bde6ff", 88, 205]} />
      <SkyDome />

      <hemisphereLight args={["#a9dcff", "#bd743e", 0.52]} />
      <ambientLight intensity={0.14} color="#fff0d2" />
      <FollowSunLight qualityTier={qualityTier} />
      {/* cool bounce from the opposite side */}
      <directionalLight position={[-20, 15, -24]} intensity={0.46} color="#8fd4ff" />

      <EnvironmentCapture>
        <Lightformer intensity={2.6} position={[0, 8, 0]} scale={[12, 12, 1]} color="#ffe8bd" />
        <Lightformer
          intensity={1.1}
          color="#9fd4ff"
          position={[-8, 3, -6]}
          rotation-y={Math.PI / 2}
          scale={[24, 3, 1]}
        />
      </EnvironmentCapture>

      <Arena />
      <Props />
      <ArenaInteractions />
      <Characters />
      <Dust />
      <DashStreak />
      <CaptureBurst />
      <TargetBeacon />

      <FollowCamera />
      <Director gameReady={gameReady} onSceneReady={onSceneReady} />
    </>
  );
}
