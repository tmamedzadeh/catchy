import { beforeEach, describe, expect, it } from "vitest";
import {
  cameraModeInput,
  cameraDrag,
  cameraTurnInput,
  clearInput,
  consumePlayerActionCommands,
  inputVector,
  movementInputFrameToken,
  installInputEventListeners,
  joystick,
  pressInputKey,
  claimTouchPointer,
  getTouchPointerOwner,
  getTouchPointerOwners,
  releaseTouchPointer,
  requestPlayerJump,
  releaseInputKey,
  setPlayerJumpInputEnabled,
  addCameraDrag,
  consumeCameraDrag,
  endCameraDrag,
} from "./input";

beforeEach(() => {
  setPlayerJumpInputEnabled(true);
  clearInput();
});

describe("keyboard movement, camera modes, and action buffer", () => {
  it("maps A to left and D to right (regression: not inverted)", () => {
    pressInputKey("KeyA");
    expect(inputVector()!.x).toBe(-1);
    releaseInputKey("KeyA");

    pressInputKey("KeyD");
    expect(inputVector()!.x).toBe(1);
    releaseInputKey("KeyD");
  });

  it("reads camera-local WASD axes and normalizes diagonals", () => {
    pressInputKey("KeyW");
    pressInputKey("KeyA");
    expect(inputVector()!.x).toBeCloseTo(-Math.SQRT1_2, 8);
    expect(inputVector()!.z).toBeCloseTo(Math.SQRT1_2, 8);
    releaseInputKey("KeyA");
    expect(inputVector()).toEqual({ x: 0, z: 1 });
  });

  it("uses the most recently pressed of opposite movement keys", () => {
    pressInputKey("KeyA");
    pressInputKey("KeyD");
    expect(inputVector()!.x).toBe(1);
    releaseInputKey("KeyD");
    expect(inputVector()!.x).toBe(-1);
  });

  it("keeps one keyboard movement frame until a movement key transition", () => {
    pressInputKey("KeyA");
    const firstFrame = movementInputFrameToken();
    expect(firstFrame).not.toBeNull();
    expect(movementInputFrameToken()).toBe(firstFrame);
    pressInputKey("KeyW");
    expect(movementInputFrameToken()).not.toBe(firstFrame);
    releaseInputKey("KeyW");
    expect(movementInputFrameToken()).not.toBe(firstFrame);
  });

  it.each(["KeyA", "KeyD", "ArrowLeft", "ArrowRight"])("does not map %s to camera yaw", (code) => {
    pressInputKey(code);
    expect(cameraTurnInput()).toBe(0);
    releaseInputKey(code);
  });

  it("uses arrows only for camera control and buffers Dash and Speed Boost", () => {
    expect(pressInputKey("ArrowUp")).toBe(true);
    expect(cameraModeInput()).toBe("recenter");
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: false });
    releaseInputKey("ArrowUp");
    expect(pressInputKey("ArrowDown")).toBe(true);
    expect(cameraModeInput()).toBe("tactical");
    releaseInputKey("ArrowDown");
    expect(cameraModeInput()).toBe("normal");

    expect(pressInputKey("ShiftLeft")).toBe(true);
    expect(pressInputKey("ShiftLeft")).toBe(false);
    expect(pressInputKey("KeyE")).toBe(true);
    expect(consumePlayerActionCommands()).toEqual({ dash: true, speedBoost: true, jump: false });
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: false });
  });

  it("gives Tactical priority and buffers Space as a one-shot Jump action", () => {
    pressInputKey("ArrowUp");
    pressInputKey("ArrowDown");
    expect(cameraModeInput()).toBe("tactical");
    expect(cameraTurnInput()).toBe(0);
    releaseInputKey("ArrowDown");
    expect(cameraModeInput()).toBe("recenter");
    expect(pressInputKey("Space")).toBe(true);
    expect(pressInputKey("Space")).toBe(false);
    expect(inputVector()).toBeNull();
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: true });
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: false });
    releaseInputKey("Space");
    expect(pressInputKey("Space")).toBe(true);
    expect(consumePlayerActionCommands().jump).toBe(true);
  });

  it("does not trigger Jump from text controls or while the game is not ready", () => {
    const originalHTMLElement = globalThis.HTMLElement;
    class TextControl extends EventTarget {
      closest() {
        return this;
      }
    }
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: TextControl,
    });
    try {
      expect(pressInputKey("Space", new TextControl())).toBe(false);
      expect(consumePlayerActionCommands().jump).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: originalHTMLElement,
      });
    }

    setPlayerJumpInputEnabled(false);
    requestPlayerJump();
    expect(consumePlayerActionCommands().jump).toBe(false);
    setPlayerJumpInputEnabled(true);
  });

  it("clears held keys and queued actions on recovery", () => {
    expect(pressInputKey("KeyQ")).toBe(false);
    pressInputKey("KeyW");
    pressInputKey("ShiftRight");
    pressInputKey("Space");
    expect(consumePlayerActionCommands().jump).toBe(true);
    clearInput();
    expect(inputVector()).toBeNull();
    expect(cameraModeInput()).toBe("normal");
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: false });
  });
});

describe("touch joystick input", () => {
  it("uses the left stick only for movement and treats its center as neutral", () => {
    joystick.x = -0.65;
    joystick.z = 0.2;
    joystick.active = true;
    expect(inputVector()).toEqual({ x: -0.65, z: 0.2 });
    joystick.x = 0;
    joystick.z = 0;
    pressInputKey("KeyW");
    expect(inputVector()).toBeNull();
    clearInput();
    expect(inputVector()).toBeNull();
  });

  it("accumulates camera drag independently from movement input", () => {
    addCameraDrag(-12, 5);
    expect(consumeCameraDrag()).toMatchObject({ x: -12, y: 5, active: true });
    expect(consumeCameraDrag()).toMatchObject({ x: 0, y: 0 });
    endCameraDrag();
    expect(cameraDrag.active).toBe(false);
  });

  it("preserves final pointer deltas until the next fixed step consumes them", () => {
    addCameraDrag(-32, 9);
    endCameraDrag();
    expect(cameraDrag.active).toBe(false);
    expect(consumeCameraDrag()).toMatchObject({ x: -32, y: 9, active: false });
  });

  it("keeps one joystick gesture as a stable movement frame", () => {
    joystick.active = true;
    joystick.gestureId = 4;
    const frame = movementInputFrameToken();
    joystick.x = -0.4;
    joystick.z = 0.8;
    expect(movementInputFrameToken()).toBe(frame);
    joystick.active = false;
    expect(movementInputFrameToken()).toBeNull();
    expect(cameraTurnInput()).toBe(0);
    expect(cameraModeInput()).toBe("normal");
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: false });
  });

  it("assigns each pointer to exactly one touch-control domain", () => {
    expect(claimTouchPointer(10, "movement")).toBe(true);
    expect(claimTouchPointer(10, "camera")).toBe(false);
    expect(claimTouchPointer(11, "camera")).toBe(true);
    expect(claimTouchPointer(12, "jump")).toBe(true);
    expect(getTouchPointerOwner(10)).toBe("movement");
    expect(getTouchPointerOwner(11)).toBe("camera");
    expect(getTouchPointerOwner(12)).toBe("jump");
    expect(getTouchPointerOwners()).toEqual([
      [10, "movement"],
      [11, "camera"],
      [12, "jump"],
    ]);
    expect(releaseTouchPointer(10, "camera")).toBe(false);
    expect(releaseTouchPointer(10, "movement")).toBe(true);
    expect(getTouchPointerOwner(10)).toBeNull();
    clearInput();
    expect(getTouchPointerOwners()).toEqual([]);
  });

  it("keeps small vertical stick movement neutral and clears all camera state on release", () => {
    addCameraDrag(8, 2);
    expect(cameraTurnInput()).toBe(0);
    clearInput();
    expect(cameraDrag).toMatchObject({ x: 0, y: 0, active: false });
  });

  it("keeps camera rotation independent from movement and arrow keys", () => {
    pressInputKey("KeyD");
    pressInputKey("ArrowRight");
    expect(cameraTurnInput()).toBe(0);
  });
});

describe("browser keyboard event lifecycle", () => {
  it("maps key events, clears held input on blur/hidden state, and removes its listeners", () => {
    const browserWindow = new EventTarget() as unknown as Window;
    let hidden = false;
    const browserDocument = new EventTarget() as unknown as Document;
    Object.defineProperty(browserDocument, "hidden", { get: () => hidden });
    const removeListeners = installInputEventListeners(browserWindow, browserDocument);
    claimTouchPointer(90, "camera");
    const key = (type: string, code: string) => {
      const event = new Event(type, { cancelable: true });
      Object.defineProperty(event, "code", { value: code });
      return event;
    };

    const movementKey = key("keydown", "KeyW");
    browserWindow.dispatchEvent(movementKey);
    expect(inputVector()).toEqual({ x: 0, z: 1 });
    const cameraKey = key("keydown", "ArrowLeft");
    browserWindow.dispatchEvent(cameraKey);
    expect(cameraKey.defaultPrevented).toBe(true);
    expect(cameraTurnInput()).toBe(0);

    const jumpKey = key("keydown", "Space");
    browserWindow.dispatchEvent(jumpKey);
    expect(jumpKey.defaultPrevented).toBe(true);
    expect(consumePlayerActionCommands().jump).toBe(true);
    browserWindow.dispatchEvent(key("keydown", "Space"));
    expect(consumePlayerActionCommands().jump).toBe(false);
    browserWindow.dispatchEvent(key("keyup", "Space"));
    browserWindow.dispatchEvent(key("keydown", "Space"));
    expect(consumePlayerActionCommands().jump).toBe(true);

    browserWindow.dispatchEvent(new Event("blur"));
    expect(inputVector()).toBeNull();
    expect(cameraTurnInput()).toBe(0);
    expect(consumePlayerActionCommands().jump).toBe(false);
    expect(getTouchPointerOwners()).toEqual([]);
    browserWindow.dispatchEvent(key("keydown", "KeyD"));
    claimTouchPointer(91, "movement");
    hidden = true;
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    expect(inputVector()).toBeNull();
    expect(getTouchPointerOwners()).toEqual([]);

    removeListeners();
    hidden = false;
    browserWindow.dispatchEvent(key("keydown", "KeyA"));
    expect(inputVector()).toBeNull();
  });
});
