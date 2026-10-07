import type { Vector3 } from "three";
import type { Point2 } from "./types";

export const EDITOR_FREE_MOVE_STEP = 0.5;
export const EDITOR_FREE_ROTATION_STEP = (5 * Math.PI) / 180;
export const EDITOR_SCALE_STEP = 0.1;
export const EDITOR_MIN_SCALE = 0.1;
export const EDITOR_MAX_SCALE = 12;
export const EDITOR_MIN_DECORATION_RADIUS = 0.5;

export type EditorMoveKey = "w" | "a" | "s" | "d";

export function nudgeEditorPoint(point: Point2, key: EditorMoveKey, step: number): Point2 {
  switch (key) {
    case "w":
      return { x: point.x, z: point.z - step };
    case "s":
      return { x: point.x, z: point.z + step };
    case "a":
      return { x: point.x - step, z: point.z };
    case "d":
      return { x: point.x + step, z: point.z };
  }
}

export function nudgeEditorRotation(
  rotation: number,
  direction: -1 | 1,
  snap: boolean,
  rotationSnap: number,
) {
  const step = snap ? rotationSnap : EDITOR_FREE_ROTATION_STEP;
  const next = rotation + direction * step;
  return snap ? Math.round(next / rotationSnap) * rotationSnap : next;
}

export function nudgeEditorScale(scale: number, direction: -1 | 1) {
  return Math.max(
    EDITOR_MIN_SCALE,
    Math.min(EDITOR_MAX_SCALE, Number((scale + direction * EDITOR_SCALE_STEP).toFixed(4))),
  );
}

export function snapEditorScale(scale: number, snap: boolean) {
  const value = snap ? Math.round(scale / EDITOR_SCALE_STEP) * EDITOR_SCALE_STEP : scale;
  return Math.max(EDITOR_MIN_SCALE, Math.min(EDITOR_MAX_SCALE, Number(value.toFixed(4))));
}

export function nudgeEditorRadius(
  radius: number,
  direction: -1 | 1,
  step: number,
  snap: boolean,
  maxRadius = 100,
) {
  return snapEditorRadius(radius + direction * step, step, snap, maxRadius);
}

export function snapEditorRadius(radius: number, step: number, snap: boolean, maxRadius = 100) {
  const value = snap && step > 0 ? Math.round(radius / step) * step : radius;
  return Math.max(EDITOR_MIN_DECORATION_RADIUS, Math.min(maxRadius, Number(value.toFixed(4))));
}

export function writeUniformScale(target: Vector3, scale: number) {
  target.setScalar(scale);
}
