// Shared input state sampled by the fixed-step simulation.
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
const MOVEMENT_CODES = ["KeyW", "KeyA", "KeyS", "KeyD"] as const;
const keys = new Set<string>();
let movementInputRevision = 0;
const actionQueue = new Uint8Array(32);
let queueHead = 0;
let queueTail = 0;

export const joystick = { x: 0, z: 0, active: false, gestureId: 0 };
export const cameraDrag = { x: 0, y: 0, active: false };
const pendingCameraDrag = { x: 0, y: 0 };
let pendingCameraZoom = 0;
const movement = { x: 0, z: 0 };
const consumedActions = { dash: false, speedBoost: false, jump: false };
const pointerOwners = new Map<number, TouchPointerOwner>();
let jumpActionEnabled = true;
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

function discardQueuedAction(actionToDiscard: number) {
  const retained: number[] = [];
  while (queueHead !== queueTail) {
    const action = actionQueue[queueHead]!;
    queueHead = (queueHead + 1) % actionQueue.length;
    if (action !== actionToDiscard) retained.push(action);
  }
  queueHead = 0;
  queueTail = 0;
  for (const action of retained) enqueueAction(action);
}

export function requestPlayerDash() {
  enqueueAction(1);
}

export function requestPlayerSpeedBoost() {
  enqueueAction(2);
}

export function requestPlayerJump() {
  if (!jumpActionEnabled) return;
  enqueueAction(3);
}

/** Jump input is enabled only after Play and once the game is ready. */
export function setPlayerJumpInputEnabled(enabled: boolean) {
  jumpActionEnabled = enabled;
  if (!enabled) {
    discardQueuedAction(3);
    consumedActions.jump = false;
  }
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
  if (!INPUT_CODES.has(code) || isTextControl(target) || keys.has(code)) return false;
  keys.add(code);
  if (code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD")
    movementInputRevision++;
  if (code === "ShiftLeft" || code === "ShiftRight") requestPlayerDash();
  else if (code === "KeyE") requestPlayerSpeedBoost();
  else if (code === "Space") requestPlayerJump();
  return true;
}

export function releaseInputKey(code: string) {
  if (
    keys.delete(code) &&
    (code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD")
  )
    movementInputRevision++;
}

/**
 * Identifies a held movement gesture so camera follow cannot rotate the world
 * basis underneath unchanged WASD input. Joystick angle changes keep one frame
 * until that pointer gesture ends.
 */
export function movementInputFrameToken() {
  if (joystick.active) return `joystick:${joystick.gestureId}`;
  if (!MOVEMENT_CODES.some((code) => keys.has(code))) return null;
  return `keyboard:${movementInputRevision}`;
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
  pendingCameraZoom += Number.isFinite(deltaDistance) ? deltaDistance : 0;
}

export function consumeCameraZoom() {
  const zoom = pendingCameraZoom;
  pendingCameraZoom = 0;
  return zoom;
}

export function consumeCameraDrag() {
  cameraDrag.x = pendingCameraDrag.x;
  cameraDrag.y = pendingCameraDrag.y;
  pendingCameraDrag.x = 0;
  pendingCameraDrag.y = 0;
  return cameraDrag;
}

export function clearInput() {
  keys.clear();
  movementInputRevision++;
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
    if (!INPUT_CODES.has(event.code) || isTextControl(event.target)) return;
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

/** Camera-local movement axes. World-space direction is resolved at the current camera yaw. */
export function inputVector(): { x: number; z: number } | null {
  if (joystick.active) {
    if (joystick.x === 0 && joystick.z === 0) return null;
    movement.x = joystick.x;
    movement.z = joystick.z;
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

/** Desktop camera rotation is intentionally independent from WASD. */
export function cameraTurnInput() {
  return 0;
}

/** Desktop special camera actions remain held keyboard state. */
export function cameraModeInput(): "normal" | "recenter" | "tactical" {
  if (keys.has("ArrowDown")) return "tactical";
  if (keys.has("ArrowUp")) return "recenter";
  return "normal";
}
