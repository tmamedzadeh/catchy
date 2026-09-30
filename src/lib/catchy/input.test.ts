import { beforeEach, describe, expect, it } from "vitest";
import {
  actionJoystick,
  cameraTurnInput,
  clearInput,
  consumePlayerActionCommands,
  inputVector,
  joystick,
  pressInputKey,
  releaseInputKey,
  setActionJoystick,
} from "./input";

beforeEach(() => clearInput());

describe("keyboard input and one-shot command buffer", () => {
  it("reads camera-local WASD axes and normalizes diagonals", () => {
    pressInputKey("KeyW");
    pressInputKey("KeyA");
    expect(inputVector()!.x).toBeCloseTo(-Math.SQRT1_2, 8);
    expect(inputVector()!.z).toBeCloseTo(-Math.SQRT1_2, 8);
    releaseInputKey("KeyA");
    expect(inputVector()).toEqual({ x: 0, z: -1 });
  });

  it("uses the most recently pressed of opposite keys", () => {
    pressInputKey("KeyA");
    pressInputKey("KeyD");
    expect(inputVector()!.x).toBe(1);
    releaseInputKey("KeyD");
    expect(inputVector()!.x).toBe(-1);
  });

  it.each([
    ["ShiftLeft", "dash"],
    ["ArrowUp", "jump"],
    ["ArrowDown", "slide"],
    ["KeyE", "speedBoost"],
  ] as const)("buffers one %s action press", (code, action) => {
    expect(pressInputKey(code)).toBe(true);
    expect(pressInputKey(code)).toBe(false);
    expect(consumePlayerActionCommands()[action]).toBe(true);
    expect(consumePlayerActionCommands()[action]).toBe(false);
  });

  it("buffers quick button presses and drains multiple commands together", () => {
    releaseKeyForAction("ShiftLeft");
    releaseKeyForAction("ArrowUp");
    releaseKeyForAction("ArrowDown");
    releaseKeyForAction("KeyE");
    expect(pressInputKey("ShiftLeft")).toBe(true);
    releaseInputKey("ShiftLeft");
    expect(pressInputKey("ArrowUp")).toBe(true);
    releaseInputKey("ArrowUp");
    expect(pressInputKey("ArrowDown")).toBe(true);
    releaseInputKey("ArrowDown");
    expect(pressInputKey("KeyE")).toBe(true);
    releaseInputKey("KeyE");
    expect(consumePlayerActionCommands()).toEqual({
      dash: true,
      jump: true,
      slide: true,
      speedBoost: true,
    });
  });

  it("ignores unrelated keys and clears held keys plus queued commands on recovery", () => {
    expect(pressInputKey("KeyQ")).toBe(false);
    pressInputKey("KeyW");
    pressInputKey("ShiftRight");
    clearInput();
    expect(inputVector()).toBeNull();
    expect(consumePlayerActionCommands()).toEqual({
      dash: false,
      jump: false,
      slide: false,
      speedBoost: false,
    });
  });
});

describe("touch joystick input", () => {
  it("uses the left stick as movement input and clears it on neutral release", () => {
    joystick.x = -0.65;
    joystick.z = 0.2;
    joystick.active = true;
    expect(inputVector()).toEqual({ x: -0.65, z: 0.2 });
    clearInput();
    expect(inputVector()).toBeNull();
  });

  it("fires Jump and Slide only when crossing their action-stick thresholds", () => {
    setActionJoystick(0, -0.7, true);
    expect(consumePlayerActionCommands().jump).toBe(true);
    setActionJoystick(0.2, -1, true);
    expect(consumePlayerActionCommands().jump).toBe(false);
    setActionJoystick(0, 0, true);
    setActionJoystick(0, 0.7, true);
    expect(consumePlayerActionCommands().slide).toBe(true);
    setActionJoystick(0, 0.1, true);
    expect(actionJoystick.active).toBe(true);
    expect(cameraTurnInput()).toBe(0);
  });

  it("uses the action stick for camera turning and neutral re-arms the next action", () => {
    setActionJoystick(-0.5, 0, true);
    expect(cameraTurnInput()).toBe(-0.5);
    setActionJoystick(0, 0.69, true);
    expect(consumePlayerActionCommands().slide).toBe(true);
    setActionJoystick(0, 0.2, true);
    setActionJoystick(0, 0.7, true);
    expect(consumePlayerActionCommands().slide).toBe(true);
    clearInput();
    expect(actionJoystick).toEqual({ x: 0, y: 0, active: false });
  });
});

function releaseKeyForAction(code: string) {
  releaseInputKey(code);
}
