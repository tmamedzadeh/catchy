import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { useCallback, useLayoutEffect, useState } from "react";
import * as THREE from "three";
import { Scene } from "./Scene";
import { detectInitialQualityTier, getTierDpr, type QualityTier } from "./quality";

export function GameCanvas({ gameReady }: { gameReady: boolean }) {
  const initialTier = detectInitialQualityTier();

  return (
    <Canvas
      className="game-canvas"
      shadows="soft"
      dpr={getTierDpr(initialTier)}
      camera={{ position: [0, 22, 24], fov: 48, near: 0.5, far: 400 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        scene.background = new THREE.Color("#a9ddff");
      }}
    >
      <AdaptiveQuality initialTier={initialTier} gameReady={gameReady} />
    </Canvas>
  );
}

function AdaptiveQuality({
  initialTier,
  gameReady,
}: {
  initialTier: QualityTier;
  gameReady: boolean;
}) {
  const [tier, setTier] = useState(initialTier);
  const setDpr = useThree((state) => state.setDpr);

  useLayoutEffect(() => {
    setDpr(getTierDpr(tier));
  }, [setDpr, tier]);

  const onDecline = useCallback(() => {
    setTier((current) => (current === "high" ? "medium" : "low"));
  }, []);
  const onIncline = useCallback(() => {
    setTier((current) => (current === "low" ? "medium" : "high"));
  }, []);
  const onFallback = useCallback(() => setTier("low"), []);

  return (
    <>
      <PerformanceMonitor
        iterations={6}
        ms={600}
        threshold={0.8}
        flipflops={4}
        bounds={(refreshRate) => (refreshRate > 100 ? [48, 78] : [42, 58])}
        onDecline={onDecline}
        onIncline={onIncline}
        onFallback={onFallback}
      />
      <Scene qualityTier={tier} gameReady={gameReady} />
    </>
  );
}
