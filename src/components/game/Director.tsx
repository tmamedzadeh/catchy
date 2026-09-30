import { useFrame } from "@react-three/fiber";
import { advanceSimulationFrame } from "@/lib/catchy/runtime";

/** Fixed-step gameplay runtime, camera-relative input, capture flow and HUD telemetry. */
export function Director() {
  useFrame((_, rawDelta) => {
    if (import.meta.env["VITE_CATCHY_E2E"] === "true") return;
    advanceSimulationFrame(rawDelta);
  }, -1);

  return null;
}
