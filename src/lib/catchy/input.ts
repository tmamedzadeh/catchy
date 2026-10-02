// Shared input state sampled by the fixed-step simulation.
import { GAME_CONFIG } from "./config";
import { NEUTRAL_CAMERA_INPUT, type CameraInput } from "./camera";

const INPUT_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "Space",
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

export const joystick = { x: 0, z: 0, active: false, gestureId: 0 };
export const cameraDrag = { x: 0, y: 0, active: false };
const pendingCameraDrag = { x: 0, y: 0 };
let pendingCameraZoom = 0;
const movement = { x: 0, z: 0 };
const sampledCameraInput: CameraInput = { ...NEUTRAL_CAMERA_INPUT };
const consumedActions = { dash: false, speedBoost: false, jump: false };
const pointerOwners = new Map<number, TouchPointerOwner>();
let gameplayInputEnabled = false;
let inputResetHandler: (() => void) | null = null;

export type PlayerActionCommands = typeof consumedActions;
export type TouchPointerOwner = "movement" | "camera" | "jump" | "dash" | "speedBoost";

/** A pointer is claimed by one control domain until it is released or input resets. */
export function claimTouchPointer(pointerId: number, owner: TouchPointerOwner) {
  const currentOwner = pointerOwners.get(pointerId);
  if (currentOwner) return currentOwner === owner;
  pointerOwners.set(pointerId, owner);
  return true;
}

export function releaseTouchPointer(pointerId: number, owner?: TouchPointerOwner) {
  if (owner && pointerOwners.get(pointerId) !== owner) return false;
  return pointerOwners.delete(pointerId);
}

export function getTouchPointerOwner(pointerId: number) {
  return pointerOwners.get(pointerId) ?? null;
}

export function getTouchPointerOwners() {
  return [...pointerOwners.entries()];
}

export function clearTouchPointers() {
  pointerOwners.clear();
}

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
  if (!gameplayInputEnabled) return;
  enqueueAction(1);
}

export function requestPlayerSpeedBoost() {
  if (!gameplayInputEnabled) return;
  enqueueAction(2);
}

export function requestPlayerJump() {
  if (!gameplayInputEnabled) return;
  enqueueAction(3);
}

/** Gameplay input is enabled only after Play and once the assets are ready. */
export function setGameplayInputEnabled(enabled: boolean) {
  if (gameplayInputEnabled === enabled) return;
  gameplayInputEnabled = enabled;
  if (!enabled) {
    clearInput();
    consumedActions.jump = false;
  }
}

export function isGameplayInputEnabled() {
  return gameplayInputEnabled;
}

/** Let the simulation clear transient player animation state on input loss. */
export function registerInputResetHandler(handler: () => void) {
  inputResetHandler = handler;
  return () => {
    if (inputResetHandler === handler) inputResetHandler = null;
  };
}

/** Apply a physical key transition; exported so held-key behavior is directly testable. */
export function pressInputKey(code: string, target: EventTarget | null = null) {
  if (!gameplayInputEnabled || !INPUT_CODES.has(code) || isTextControl(target) || keys.has(code))
    return false;
  keys.add(code);
  if (code === "ShiftLeft" || code === "ShiftRight") requestPlayerDash();
  else if (code === "KeyE") requestPlayerSpeedBoost();
  else if (code === "Space") requestPlayerJump();
  return true;
}

export function releaseInputKey(code: string) {
  keys.delete(code);
}

/** Drain buffered button/key presses once per simulation tick. */
export function consumePlayerActionCommands(): PlayerActionCommands {
  consumedActions.dash = false;
  consumedActions.speedBoost = false;
  consumedActions.jump = false;
  while (queueHead !== queueTail) {
    const command = actionQueue[queueHead]!;
    queueHead = (queueHead + 1) % actionQueue.length;
    if (command === 1) consumedActions.dash = true;
    else if (command === 2) consumedActions.speedBoost = true;
    else if (command === 3) consumedActions.jump = true;
  }
  return consumedActions;
}

/** Accumulate touch/mouse movement until the next fixed simulation tick. */
export function addCameraDrag(deltaX: number, deltaY: number) {
  if (!gameplayInputEnabled) return;
  cameraDrag.active = true;
  pendingCameraDrag.x += deltaX;
  pendingCameraDrag.y += deltaY;
}

export function endCameraDrag() {
  cameraDrag.active = false;
}

/** Discard unconsumed pointer deltas when a gesture is canceled or reset. */
export function discardPendingCameraInput() {
  cameraDrag.active = false;
  cameraDrag.x = 0;
  cameraDrag.y = 0;
  pendingCameraDrag.x = 0;
  pendingCameraDrag.y = 0;
  pendingCameraZoom = 0;
}

/** Accumulate pinch distance changes until the next fixed simulation tick. */
export function addCameraZoom(deltaDistance: number) {
  if (!gameplayInputEnabled) return;
  pendingCameraZoom += Number.isFinite(deltaDistance) ? deltaDistance : 0;
}

/** Merge pointer deltas and held arrows into one camera-control stream per tick. */
export function consumeCameraInput(dt: number) {
  const leftRight = opposedKeyInput("ArrowLeft", "ArrowRight");
  const upDown = opposedKeyInput("ArrowDown", "ArrowUp");
  sampledCameraInput.yawDelta =
    -pendingCameraDrag.x * 0.012 + leftRight * GAME_CONFIG.camera.manualYawSpeed * dt;
  sampledCameraInput.pitchDelta =
    pendingCameraDrag.y * 0.08 + upDown * GAME_CONFIG.camera.manualPitchSpeed * dt;
  sampledCameraInput.zoomDelta = pendingCameraZoom;
  sampledCameraInput.manual =
    sampledCameraInput.yawDelta !== 0 ||
    sampledCameraInput.pitchDelta !== 0 ||
    sampledCameraInput.zoomDelta !== 0;
  cameraDrag.x = pendingCameraDrag.x;
  cameraDrag.y = pendingCameraDrag.y;
  pendingCameraDrag.x = 0;
  pendingCameraDrag.y = 0;
  pendingCameraZoom = 0;
  if (!gameplayInputEnabled) {
    sampledCameraInput.yawDelta = 0;
    sampledCameraInput.pitchDelta = 0;
    sampledCameraInput.zoomDelta = 0;
    sampledCameraInput.manual = false;
  }
  return sampledCameraInput;
}

export function clearInput() {
  keys.clear();
  clearTouchPointers();
  joystick.x = 0;
  joystick.z = 0;
  joystick.active = false;
  joystick.gestureId++;
  endCameraDrag();
  discardPendingCameraInput();
  queueHead = 0;
  queueTail = 0;
  consumedActions.dash = false;
  consumedActions.speedBoost = false;
  consumedActions.jump = false;
  inputResetHandler?.();
}

/** Install and clean up keyboard/visibility handlers for the lifetime of the game. */
export function installInputEventListeners(targetWindow?: Window, targetDocument?: Document) {
  const browserWindow = targetWindow ?? (typeof window === "undefined" ? undefined : window);
  const browserDocument =
    targetDocument ?? (typeof document === "undefined" ? undefined : document);
  if (!browserWindow || !browserDocument) return () => undefined;

  const onKeyDown = (event: KeyboardEvent) => {
    if (!gameplayInputEnabled || !INPUT_CODES.has(event.code) || isTextControl(event.target))
      return;
    if (event.code.startsWith("Arrow") || event.code === "Space") event.preventDefault();
    pressInputKey(event.code, event.target);
  };
  const onKeyUp = (event: KeyboardEvent) => releaseInputKey(event.code);
  const onBlur = () => clearInput();
  const onVisibilityChange = () => {
    if (browserDocument.hidden) clearInput();
  };

  browserWindow.addEventListener("keydown", onKeyDown);
  browserWindow.addEventListener("keyup", onKeyUp);
  browserWindow.addEventListener("blur", onBlur);
  browserDocument.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    browserWindow.removeEventListener("keydown", onKeyDown);
    browserWindow.removeEventListener("keyup", onKeyUp);
    browserWindow.removeEventListener("blur", onBlur);
    browserDocument.removeEventListener("visibilitychange", onVisibilityChange);
  };
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

/**
 * Semantic movement axes: positive x is RIGHT and positive z is FORWARD.
 * Physical A/D/W/S key mapping stays here; the simulation resolves those
 * semantics against the rendered camera basis.
 */
export function inputVector(): { x: number; z: number } | null {
  if (!gameplayInputEnabled) return null;
  if (joystick.active) {
    const length = Math.hypot(joystick.x, joystick.z);
    const { radialDeadZone, responseExponent } = GAME_CONFIG.player.joystick;
    if (length <= radialDeadZone) return null;
    const remapped = Math.min(1, (length - radialDeadZone) / (1 - radialDeadZone));
    const magnitude = Math.pow(remapped, responseExponent);
    const scale = magnitude / length;
    movement.x = joystick.x * scale;
    movement.z = joystick.z * scale;
    return movement;
  }
  const x = opposedKeyInput("KeyD", "KeyA");
  const z = opposedKeyInput("KeyW", "KeyS");
  if (x === 0 && z === 0) return null;
  const length = Math.hypot(x, z);
  movement.x = x / length;
  movement.z = z / length;
  return movement;
}
