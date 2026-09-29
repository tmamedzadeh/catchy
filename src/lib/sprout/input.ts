// Shared input vector written by the on-screen joystick and keyboard,
// read every frame by the simulation without triggering React renders.

const keys = new Set<string>();
export const joystick = { x: 0, z: 0, active: false };

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
}

export function inputVector(): { x: number; z: number } | null {
  if (joystick.active && (joystick.x !== 0 || joystick.z !== 0)) {
    return { x: joystick.x, z: joystick.z };
  }
  let x = 0;
  let z = 0;
  if (keys.has("w") || keys.has("arrowup")) z -= 1;
  if (keys.has("s") || keys.has("arrowdown")) z += 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (x === 0 && z === 0) return null;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
}
