import { describe, expect, it } from "vitest";
import { getCameraRenderDistance } from "./camera";

describe("camera distance framing", () => {
  it("keeps the configured base distance on a normal landscape display", () => {
    expect(getCameraRenderDistance(27, 16 / 9, false)).toBe(27);
  });

  it("applies only the existing aspect and capture framing adjustments", () => {
    expect(getCameraRenderDistance(27, 0.75, false)).toBeCloseTo(27 * 1.42);
    expect(getCameraRenderDistance(27, 16 / 9, true)).toBeCloseTo(27 * 0.78);
  });
});
