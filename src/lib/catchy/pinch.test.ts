import { describe, expect, it } from "vitest";
import { distanceBetweenPointers, pinchZoomDelta } from "./pinch";

describe("mobile camera pinch deltas", () => {
  it("records the initial distance without producing a zoom impulse", () => {
    const result = pinchZoomDelta(null, { x: 10, y: 10 }, { x: 110, y: 10 });
    expect(result.distance).toBe(100);
    expect(result.delta).toBe(0);
  });

  it("reports zoom-out as an outward positive distance change", () => {
    expect(pinchZoomDelta(100, { x: 0, y: 0 }, { x: 130, y: 0 })).toEqual({
      distance: 130,
      delta: 30,
    });
  });

  it("reports zoom-in as an inward negative distance change", () => {
    expect(pinchZoomDelta(100, { x: 0, y: 0 }, { x: 72, y: 0 })).toEqual({
      distance: 72,
      delta: -28,
    });
  });

  it("keeps coincident and invalid baselines finite", () => {
    expect(distanceBetweenPointers({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0);
    expect(pinchZoomDelta(0, { x: 3, y: 4 }, { x: 3, y: 4 })).toEqual({
      distance: 0,
      delta: 0,
    });
    expect(pinchZoomDelta(Number.NaN, { x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({
      distance: 10,
      delta: 0,
    });
    expect(distanceBetweenPointers({ x: Number.NaN, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(pinchZoomDelta(100, { x: Number.NaN, y: 0 }, { x: 10, y: 0 })).toEqual({
      distance: 0,
      delta: 0,
    });
  });
});
