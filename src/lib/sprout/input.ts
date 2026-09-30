// Shared, allocation-free input state read by the frame loop.
const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);
const keys = new Set<string>();

export const joystick = { x: 0, z: 0, active: false };
const vector = { x: 0, z: 0 };

function isTextControl(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

export function clearInput() {
  keys.clear();
  joystick.x = 0;
  joystick.z = 0;
  joystick.active = false;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (!GAME_CODES.has(event.code) || isTextControl(event.target)) return;
    if (event.code.startsWith("Arrow")) event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInput();
  });
}

/** WASD, arrows, and the joystick all return normalized camera-local axes. */
export function inputVector(): { x: number; z: number } | null {
  if (joystick.active && (joystick.x !== 0 || joystick.z !== 0)) {
    vector.x = joystick.x;
    vector.z = joystick.z;
    return vector;
  }
  let x = 0;
  let z = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (x === 0 && z === 0) return null;
  const length = Math.hypot(x, z);
  vector.x = x / length;
  vector.z = z / length;
  return vector;
}
