import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "./config";
import { getCameraRenderDistance } from "./camera";

describe("camera distance framing", () => {
  it("keeps the intended production defaults and semantic framing behavior", () => {
    expect(GAME_CONFIG.camera.distance).toBe(19);
    expect(GAME_CONFIG.camera.pitch).toBe(20);
    expect(getCameraRenderDistance(GAME_CONFIG.camera.distance, 16 / 9, false)).toBe(19);
    expect(getCameraRenderDistance(GAME_CONFIG.camera.distance, 0.75, false)).toBeCloseTo(
      19 * 1.42,
    );
    expect(getCameraRenderDistance(GAME_CONFIG.camera.distance, 16 / 9, true)).toBeCloseTo(
      19 * 0.78,
    );
  });
});
