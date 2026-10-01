// Shared input state sampled by the fixed-step simulation.
import { GAME_CONFIG } from "./config";

const INPUT_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);
const keys = new Set<string>();
const actionQueue = new Uint8Array(32);
let queueHead = 0;
let queueTail = 0;
let rightStickMode: "normal" | "recenter" | "tactical" = "normal";

export const joystick = { x: 0, z: 0, active: false };
export const cameraJoystick = { x: 0, y: 0, active: false };
const movement = { x: 0, z: 0 };
const consumedActions = { dash: false, speedBoost: false };

export type PlayerActionCommands = typeof consumedActions;

function isTextControl(target: EventTarget | null) {
  return (
    typeof HTMLElement !== "undefined" &&
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

function enqueueAction(action: number) {
  const next = (queueTail + 1) % actionQueue.length;
  if (next === queueHead) return;
  actionQueue[queueTail] = action;
  queueTail = next;
}

export function requestPlayerDash() {
  enqueueAction(1);
}

export function requestPlayerSpeedBoost() {
  enqueueAction(2);
}

/** Apply a physical key transition; exported so held-key behavior is directly testable. */
export function pressInputKey(code: string, target: EventTarget | null = null) {
  if (!INPUT_CODES.has(code) || isTextControl(target) || keys.has(code)) return false;
  keys.add(code);
  if (code === "ShiftLeft" || code === "ShiftRight") requestPlayerDash();
  else if (code === "KeyE") requestPlayerSpeedBoost();
  return true;
}

export function releaseInputKey(code: string) {
  keys.delete(code);
}

/** Drain buffered button/key presses once per simulation tick. */
export function consumePlayerActionCommands(): PlayerActionCommands {
  consumedActions.dash = false;
  consumedActions.speedBoost = false;
  while (queueHead !== queueTail) {
    const command = actionQueue[queueHead]!;
    queueHead = (queueHead + 1) % actionQueue.length;
    if (command === 1) consumedActions.dash = true;
    else if (command === 2) consumedActions.speedBoost = true;
  }
  return consumedActions;
}

/** Right-stick vertical position continuously selects a camera mode with hysteresis. */
export function setCameraJoystick(x: number, y: number, active: boolean) {
  cameraJoystick.x = x;
  cameraJoystick.y = y;
  cameraJoystick.active = active;

  if (!active) {
    rightStickMode = "normal";
  } else if (rightStickMode === "recenter") {
    if (y > -GAME_CONFIG.camera.rightStickModeReleaseThreshold) rightStickMode = "normal";
  } else if (rightStickMode === "tactical") {
    if (y < GAME_CONFIG.camera.rightStickModeReleaseThreshold) rightStickMode = "normal";
  } else if (y <= -GAME_CONFIG.camera.rightStickModeThreshold) {
    rightStickMode = "recenter";
  } else if (y >= GAME_CONFIG.camera.rightStickModeThreshold) {
    rightStickMode = "tactical";
  }
}

export function clearInput() {
  keys.clear();
  joystick.x = 0;
  joystick.z = 0;
  joystick.active = false;
  cameraJoystick.x = 0;
  cameraJoystick.y = 0;
  cameraJoystick.active = false;
  rightStickMode = "normal";
  queueHead = 0;
  queueTail = 0;
}

/** When opposite keys are held together, the most recently pressed one wins. */
function opposedKeyInput(positiveKey: string, negativeKey: string) {
  let axis = 0;
  for (const code of keys) {
    if (code === positiveKey) axis = 1;
    else if (code === negativeKey) axis = -1;
  }
  return axis;
}

/** Camera-local movement axes. World-space direction is resolved at the current camera yaw. */
export function inputVector(): { x: number; z: number } | null {
  if (joystick.active) {
    if (joystick.x === 0 && joystick.z === 0) return null;
    movement.x = joystick.x;
    movement.z = joystick.z;
    return movement;
  }
  const x = opposedKeyInput("KeyD", "KeyA");
  const z = opposedKeyInput("KeyS", "KeyW");
  if (x === 0 && z === 0) return null;
  const length = Math.hypot(x, z);
  movement.x = x / length;
  movement.z = z / length;
  return movement;
}

/** Positive yaw input rotates right; yaw remains horizontal. */
export function cameraTurnInput() {
  if (cameraModeInput() !== "normal") return 0;
  let axis = 0;
  if (keys.has("ArrowLeft")) axis += 1;
  if (keys.has("ArrowRight")) axis -= 1;
  if (cameraJoystick.active) axis += cameraJoystick.x;
  return Math.max(-1, Math.min(1, axis));
}

/** Camera modes are continuous held state; Down/Tactical has priority over Up/Recenter. */
export function cameraModeInput(): "normal" | "recenter" | "tactical" {
  if (keys.has("ArrowDown") || rightStickMode === "tactical") return "tactical";
  if (keys.has("ArrowUp") || rightStickMode === "recenter") return "recenter";
  return "normal";
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (!INPUT_CODES.has(event.code) || isTextControl(event.target)) return;
    if (event.code.startsWith("Arrow")) event.preventDefault();
    pressInputKey(event.code, event.target);
  });
  window.addEventListener("keyup", (event) => releaseInputKey(event.code));
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInput();
  });
}
