import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Scene } from "./Scene";

export function GameCanvas() {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.75]}
      camera={{ position: [0, 22, 24], fov: 48, near: 0.5, far: 400 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.95;
        scene.background = new THREE.Color("#bfe3ff");
      }}
    >
      <Scene />
    </Canvas>
  );
}
