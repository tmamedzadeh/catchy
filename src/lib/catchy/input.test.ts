import { beforeEach, describe, expect, it } from "vitest";
import {
  addCameraDrag,
  addCameraZoom,
  cameraDrag,
  claimTouchPointer,
  clearInput,
  consumeCameraInput,
  consumePlayerActionCommands,
  endCameraDrag,
  getTouchPointerOwner,
  getTouchPointerOwners,
  inputVector,
  installInputEventListeners,
  joystick,
  pressInputKey,
  releaseInputKey,
  releaseTouchPointer,
  requestPlayerDash,
  requestPlayerJump,
  requestPlayerSpeedBoost,
  setGameplayInputEnabled,
} from "./input";
import { GAME_CONFIG } from "./config";

const DT = 1 / GAME_CONFIG.simulation.tickHz;

beforeEach(() => {
  setGameplayInputEnabled(true);
  clearInput();
});

describe("movement input", () => {
  it("maps WASD to semantic camera-local axes and keeps keyboard input digital", () => {
    pressInputKey("KeyA");
    expect(inputVector()).toEqual({ x: -1, z: 0 });
    releaseInputKey("KeyA");
    pressInputKey("KeyD");
    expect(inputVector()).toEqual({ x: 1, z: 0 });
    releaseInputKey("KeyD");

    pressInputKey("KeyW");
    pressInputKey("KeyA");
    expect(inputVector()!.x).toBeCloseTo(-Math.SQRT1_2, 8);
    expect(inputVector()!.z).toBeCloseTo(Math.SQRT1_2, 8);
    releaseInputKey("KeyA");
    expect(inputVector()).toEqual({ x: 0, z: 1 });
  });

  it("lets the most recently pressed opposing movement key win", () => {
    pressInputKey("KeyA");
    pressInputKey("KeyD");
    expect(inputVector()!.x).toBe(1);
    releaseInputKey("KeyD");
    expect(inputVector()!.x).toBe(-1);
  });

  it("applies a radial dead zone and remaps analog stick strength", () => {
    const deadZone = GAME_CONFIG.player.joystick.radialDeadZone;
    joystick.active = true;
    joystick.x = deadZone * 0.7;
    joystick.z = deadZone * 0.7;
    expect(inputVector()).toBeNull();

    joystick.x = 0.55;
    joystick.z = 0;
    const half = inputVector()!;
    const expectedHalf = Math.pow((0.55 - deadZone) / (1 - deadZone), 1.08);
    expect(half.x).toBeCloseTo(expectedHalf, 8);
    expect(half.z).toBe(0);

    joystick.x = 1;
    expect(inputVector()!.x).toBe(1);
  });

  it("preserves joystick direction and clamps diagonal magnitude to full speed", () => {
    joystick.active = true;
    joystick.x = Math.SQRT1_2;
    joystick.z = Math.SQRT1_2;
    const vector = inputVector()!;
    expect(vector.x).toBeCloseTo(vector.z, 8);
    expect(Math.hypot(vector.x, vector.z)).toBeCloseTo(1, 8);
    joystick.x = 1;
    joystick.z = 1;
    expect(Math.hypot(...Object.values(inputVector()!))).toBeCloseTo(1, 8);
  });
});

describe("shared camera input", () => {
  it.each([
    { code: "ArrowLeft", yaw: 1, pitch: 0 },
    { code: "ArrowRight", yaw: -1, pitch: 0 },
    { code: "ArrowUp", yaw: 0, pitch: -1 },
    { code: "ArrowDown", yaw: 0, pitch: 1 },
  ])("maps held $code into a continuous camera delta", ({ code, yaw, pitch }) => {
    pressInputKey(code);
    const first = { ...consumeCameraInput(DT) };
    const second = { ...consumeCameraInput(DT) };
    expect(first.manual).toBe(true);
    expect(first.yawDelta).toBeCloseTo(yaw * (yaw ? GAME_CONFIG.camera.manualYawSpeed : 0) * DT, 8);
    expect(first.pitchDelta).toBeCloseTo(
      pitch * (pitch ? GAME_CONFIG.camera.manualPitchSpeed : 0) * DT,
      8,
    );
    expect(second.yawDelta).toBeCloseTo(first.yawDelta, 8);
    expect(second.pitchDelta).toBeCloseTo(first.pitchDelta, 8);
    releaseInputKey(code);
    expect(consumeCameraInput(DT).manual).toBe(false);
  });

  it("merges pointer drag into the same camera input and keeps pinch out of yaw/pitch", () => {
    addCameraDrag(-12, -5);
    addCameraZoom(20);
    const camera = { ...consumeCameraInput(DT) };
    expect(camera.yawDelta).toBeCloseTo(0.144, 8);
    expect(camera.pitchDelta).toBeCloseTo(-0.4, 8);
    expect(camera.zoomDelta).toBe(20);
    expect(camera.manual).toBe(true);
    const empty = { ...consumeCameraInput(DT) };
    expect(empty).toMatchObject({ yawDelta: 0, pitchDelta: 0, zoomDelta: 0, manual: false });
    endCameraDrag();
    expect(cameraDrag.active).toBe(false);
  });

  it("uses the most recently pressed arrow on opposed camera axes", () => {
    pressInputKey("ArrowLeft");
    pressInputKey("ArrowRight");
    expect(consumeCameraInput(DT).yawDelta).toBeLessThan(0);
    releaseInputKey("ArrowRight");
    expect(consumeCameraInput(DT).yawDelta).toBeGreaterThan(0);
  });

  it("clears held camera deltas and all pending pointer state on recovery", () => {
    pressInputKey("ArrowLeft");
    addCameraDrag(5, 8);
    addCameraZoom(14);
    clearInput();
    expect(consumeCameraInput(DT)).toMatchObject({
      yawDelta: 0,
      pitchDelta: 0,
      zoomDelta: 0,
      manual: false,
    });
    expect(cameraDrag).toMatchObject({ x: 0, y: 0, active: false });
  });
});

describe("gameplay input readiness and action buffer", () => {
  it("keeps keyboard, pointer, and actions inactive until the game is ready", () => {
    setGameplayInputEnabled(false);
    expect(pressInputKey("KeyW")).toBe(false);
    requestPlayerDash();
    requestPlayerSpeedBoost();
    requestPlayerJump();
    addCameraDrag(20, 0);
    expect(inputVector()).toBeNull();
    expect(consumeCameraInput(DT).manual).toBe(false);
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: false });
    setGameplayInputEnabled(true);
    expect(pressInputKey("KeyW")).toBe(true);
  });

  it("buffers one-shot keyboard actions once per press", () => {
    pressInputKey("ShiftLeft");
    expect(pressInputKey("ShiftLeft")).toBe(false);
    pressInputKey("KeyE");
    pressInputKey("Space");
    expect(inputVector()).toBeNull();
    expect(consumePlayerActionCommands()).toEqual({ dash: true, speedBoost: true, jump: true });
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: false });
  });

  it("does not trigger actions from text controls", () => {
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
  });

  it("clears held keys and queued actions when input loses focus", () => {
    pressInputKey("KeyW");
    pressInputKey("ShiftRight");
    pressInputKey("Space");
    clearInput();
    expect(inputVector()).toBeNull();
    expect(consumeCameraInput(DT).manual).toBe(false);
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false, jump: false });
  });
});

describe("touch pointer ownership", () => {
  it("assigns each pointer to one control domain until release", () => {
    expect(claimTouchPointer(10, "movement")).toBe(true);
    expect(claimTouchPointer(10, "camera")).toBe(false);
    expect(claimTouchPointer(11, "camera")).toBe(true);
    expect(claimTouchPointer(12, "jump")).toBe(true);
    expect(getTouchPointerOwner(10)).toBe("movement");
    expect(getTouchPointerOwner(11)).toBe("camera");
    expect(getTouchPointerOwners()).toEqual([
      [10, "movement"],
      [11, "camera"],
      [12, "jump"],
    ]);
    expect(releaseTouchPointer(10, "camera")).toBe(false);
    expect(releaseTouchPointer(10, "movement")).toBe(true);
    clearInput();
    expect(getTouchPointerOwners()).toEqual([]);
  });
});

describe("browser keyboard event lifecycle", () => {
  it("clears held input on blur/hidden state and removes listeners", () => {
    const browserWindow = new EventTarget() as unknown as Window;
    let hidden = false;
    const browserDocument = new EventTarget() as unknown as Document;
    Object.defineProperty(browserDocument, "hidden", { get: () => hidden });
    const removeListeners = installInputEventListeners(browserWindow, browserDocument);
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
    expect(consumeCameraInput(DT).yawDelta).toBeGreaterThan(0);

    browserWindow.dispatchEvent(new Event("blur"));
    expect(inputVector()).toBeNull();
    expect(consumeCameraInput(DT).manual).toBe(false);
    browserWindow.dispatchEvent(key("keydown", "KeyD"));
    hidden = true;
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    expect(inputVector()).toBeNull();

    removeListeners();
    hidden = false;
    browserWindow.dispatchEvent(key("keydown", "KeyA"));
    expect(inputVector()).toBeNull();
  });
});
