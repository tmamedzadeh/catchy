export type PinchPoint = { x: number; y: number };

export function distanceBetweenPointers(a: PinchPoint, b: PinchPoint) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return Number.isFinite(distance) ? distance : 0;
}

export function pinchZoomDelta(previousDistance: number | null, a: PinchPoint, b: PinchPoint) {
  const distance = distanceBetweenPointers(a, b);
  if (
    previousDistance === null ||
    !Number.isFinite(previousDistance) ||
    previousDistance <= 0 ||
    distance === 0
  ) {
    return { distance, delta: 0 };
  }
  return { distance, delta: distance - previousDistance };
}
