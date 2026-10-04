import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  EDITOR_FREE_ROTATION_STEP,
  EDITOR_SCALE_STEP,
  nudgeEditorPoint,
  nudgeEditorRotation,
  nudgeEditorScale,
  snapEditorScale,
  writeUniformScale,
} from "./editorTransforms";

describe("editor keyboard transforms", () => {
  it("moves in map X/Z directions with deterministic nudges", () => {
    const point = { x: 2, z: 3 };
    expect(nudgeEditorPoint(point, "w", 0.5)).toEqual({ x: 2, z: 2.5 });
    expect(nudgeEditorPoint(point, "s", 0.5)).toEqual({ x: 2, z: 3.5 });
    expect(nudgeEditorPoint(point, "a", 0.5)).toEqual({ x: 1.5, z: 3 });
    expect(nudgeEditorPoint(point, "d", 0.5)).toEqual({ x: 2.5, z: 3 });
  });

  it("uses the configured rotation snap or a five degree free step", () => {
    expect(nudgeEditorRotation(0, -1, true, Math.PI / 12)).toBeCloseTo(-Math.PI / 12);
    expect(nudgeEditorRotation(0, 1, false, Math.PI / 12)).toBeCloseTo(EDITOR_FREE_ROTATION_STEP);
  });

  it("nudges scale by 0.1 and clamps it to the safe range", () => {
    expect(nudgeEditorScale(1, 1)).toBeCloseTo(1 + EDITOR_SCALE_STEP);
    expect(nudgeEditorScale(0.1, -1)).toBe(0.1);
    expect(nudgeEditorScale(12, 1)).toBe(12);
  });

  it("snaps gizmo scale in 0.1 increments instead of using the position snap step", () => {
    expect(snapEditorScale(1.26, true)).toBe(1.3);
    expect(snapEditorScale(1.26, false)).toBe(1.26);
  });

  it("keeps gizmo scale uniform across all axes", () => {
    const scale = new Vector3(1, 2, 3);
    writeUniformScale(scale, 1.7);
    expect(scale.toArray()).toEqual([1.7, 1.7, 1.7]);
  });
});
