import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { advanceSimulationFrame } from "@/lib/catchy/runtime";
import { useGameStore } from "@/store/gameStore";

/** Fixed-step gameplay runtime, camera-relative input, capture flow and HUD telemetry. */
export function Director() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      if (event.repeat) return;
      useGameStore.getState().restart();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useFrame((_, rawDelta) => {
    if (import.meta.env.VITE_CATCHY_E2E === "true") return;
    advanceSimulationFrame(rawDelta);
  }, -1);

  return null;
}
