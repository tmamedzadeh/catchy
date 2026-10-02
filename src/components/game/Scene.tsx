import { Lightformer } from "@react-three/drei";
import { EnvironmentCapture } from "./EnvironmentCapture";
import { Arena, SkyDome } from "./Arena";
import { Props } from "./Prop";
import { ArenaInteractions } from "./ArenaInteractions";
import { Characters } from "./Characters";
import { CaptureBurst, DashStreak, Dust, TargetBeacon } from "./Effects";
import { FollowCamera } from "./FollowCamera";
import { Director } from "./Director";
import { QUALITY_LEVELS, type QualityTier } from "./quality";

export function Scene({
  qualityTier,
  gameReady,
}: {
  qualityTier: QualityTier;
  gameReady: boolean;
}) {
  return (
    <>
      <fog attach="fog" args={["#bde6ff", 88, 205]} />
      <SkyDome />

      <hemisphereLight args={["#a9dcff", "#bd743e", 0.52]} />
      <ambientLight intensity={0.14} color="#fff0d2" />
      <directionalLight
        position={[24, 30, 12]}
        intensity={3.55}
        color="#ffdca3"
        castShadow
        shadow-mapSize-width={QUALITY_LEVELS[qualityTier].shadowMapSize}
        shadow-mapSize-height={QUALITY_LEVELS[qualityTier].shadowMapSize}
        shadow-bias={-0.00045}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
        shadow-camera-near={1}
        shadow-camera-far={110}
      />
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
      <Director gameReady={gameReady} />
    </>
  );
}
