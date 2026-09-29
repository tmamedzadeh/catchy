import { Suspense } from "react";
import { Environment, Lightformer } from "@react-three/drei";
import { Arena, SkyDome } from "./Arena";
import { Props } from "./Prop";
import { Characters } from "./Characters";
import { Interactives } from "./Interactives";
import { CaptureBurst, Dust, TargetBeacon } from "./Effects";
import { FollowCamera } from "./FollowCamera";
import { Director } from "./Director";

export function Scene() {
  return (
    <>
      <fog attach="fog" args={["#cfe9ff", 80, 190]} />
      <SkyDome />

      <hemisphereLight args={["#bfe0ff", "#b2864f", 0.45]} />
      <ambientLight intensity={0.18} color="#fff4de" />
      <directionalLight
        position={[26, 34, 16]}
        intensity={2.9}
        color="#fff1cf"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0006}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
        shadow-camera-near={1}
        shadow-camera-far={110}
      />
      {/* cool bounce from the opposite side */}
      <directionalLight position={[-20, 16, -24]} intensity={0.35} color="#a9d8ff" />

      <Environment resolution={64}>
        <Lightformer intensity={2.2} position={[0, 8, 0]} scale={[12, 12, 1]} color="#fff3d6" />
        <Lightformer
          intensity={1.1}
          color="#9fd4ff"
          position={[-8, 3, -6]}
          rotation-y={Math.PI / 2}
          scale={[24, 3, 1]}
        />
      </Environment>

      <Arena />
      <Suspense fallback={null}>
        <Props />
      </Suspense>
      <Interactives />
      <Characters />
      <Dust />
      <CaptureBurst />
      <TargetBeacon />

      <FollowCamera />
      <Director />
    </>
  );
}
