export type PinchPoint = { x: number; y: number };

export function distanceBetweenPointers(a: PinchPoint, b: PinchPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pinchZoomDelta(previousDistance: number | null, a: PinchPoint, b: PinchPoint) {
  const distance = distanceBetweenPointers(a, b);
  if (!previousDistance || !Number.isFinite(previousDistance) || distance === 0) {
    return { distance, delta: 0 };
  }
  return { distance, delta: distance - previousDistance };
}
