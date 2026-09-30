import { beforeEach, describe, expect, it } from "vitest";
import {
  cameraJoystick,
  cameraModeInput,
  cameraTurnInput,
  clearInput,
  consumePlayerActionCommands,
  inputVector,
  joystick,
  pressInputKey,
  releaseInputKey,
  setCameraJoystick,
} from "./input";

beforeEach(() => clearInput());

describe("keyboard movement, camera modes, and action buffer", () => {
  it("reads camera-local WASD axes and normalizes diagonals", () => {
    pressInputKey("KeyW");
    pressInputKey("KeyA");
    expect(inputVector()!.x).toBeCloseTo(-Math.SQRT1_2, 8);
    expect(inputVector()!.z).toBeCloseTo(-Math.SQRT1_2, 8);
    releaseInputKey("KeyA");
    expect(inputVector()).toEqual({ x: 0, z: -1 });
  });

  it("uses the most recently pressed of opposite movement keys", () => {
    pressInputKey("KeyA");
    pressInputKey("KeyD");
    expect(inputVector()!.x).toBe(1);
    releaseInputKey("KeyD");
    expect(inputVector()!.x).toBe(-1);
  });

  it("uses arrows only for camera control and buffers Dash and Speed Boost", () => {
    pressInputKey("ArrowLeft");
    expect(cameraTurnInput()).toBe(-1);
    releaseInputKey("ArrowLeft");
    pressInputKey("ArrowRight");
    expect(cameraTurnInput()).toBe(1);
    releaseInputKey("ArrowRight");

    expect(pressInputKey("ArrowUp")).toBe(true);
    expect(cameraModeInput()).toBe("recenter");
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false });
    releaseInputKey("ArrowUp");
    expect(pressInputKey("ArrowDown")).toBe(true);
    expect(cameraModeInput()).toBe("tactical");
    releaseInputKey("ArrowDown");
    expect(cameraModeInput()).toBe("normal");

    expect(pressInputKey("ShiftLeft")).toBe(true);
    expect(pressInputKey("ShiftLeft")).toBe(false);
    expect(pressInputKey("KeyE")).toBe(true);
    expect(consumePlayerActionCommands()).toEqual({ dash: true, speedBoost: true });
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false });
  });

  it("gives Tactical priority and leaves Space without a gameplay binding", () => {
    pressInputKey("ArrowUp");
    pressInputKey("ArrowDown");
    expect(cameraModeInput()).toBe("tactical");
    expect(cameraTurnInput()).toBe(0);
    releaseInputKey("ArrowDown");
    expect(cameraModeInput()).toBe("recenter");
    expect(pressInputKey("Space")).toBe(false);
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false });
  });

  it("clears held keys and queued actions on recovery", () => {
    expect(pressInputKey("KeyQ")).toBe(false);
    pressInputKey("KeyW");
    pressInputKey("ShiftRight");
    clearInput();
    expect(inputVector()).toBeNull();
    expect(cameraModeInput()).toBe("normal");
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false });
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

  it("uses right-stick horizontal movement for yaw and vertical thresholds for held modes", () => {
    setCameraJoystick(-0.5, 0, true);
    expect(cameraTurnInput()).toBe(-0.5);
    setCameraJoystick(0, -0.69, true);
    expect(cameraModeInput()).toBe("recenter");
    expect(cameraTurnInput()).toBe(0);
    setCameraJoystick(0.3, -0.5, true);
    expect(cameraModeInput()).toBe("recenter");
    setCameraJoystick(0.3, -0.2, true);
    expect(cameraModeInput()).toBe("normal");
    expect(cameraTurnInput()).toBe(0.3);
    setCameraJoystick(0, 0.7, true);
    expect(cameraModeInput()).toBe("tactical");
    setCameraJoystick(0, 0.2, true);
    expect(cameraModeInput()).toBe("normal");
    expect(consumePlayerActionCommands()).toEqual({ dash: false, speedBoost: false });
  });

  it("keeps small vertical stick movement neutral and clears all camera state on release", () => {
    setCameraJoystick(0.2, 0.1, true);
    expect(cameraModeInput()).toBe("normal");
    expect(cameraTurnInput()).toBe(0.2);
    setCameraJoystick(0, 0, false);
    expect(cameraJoystick).toEqual({ x: 0, y: 0, active: false });
    expect(cameraModeInput()).toBe("normal");
    expect(cameraTurnInput()).toBe(0);
  });
});
