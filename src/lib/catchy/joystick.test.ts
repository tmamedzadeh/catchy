import { describe, expect, it } from "vitest";
import { calculateJoystickVector, getJoystickGeometry, measureJoystickGeometry } from "./joystick";

const rect = { left: 10, top: 20, width: 100, height: 100 };
const geometry = measureJoystickGeometry(rect, 96, 96, 40, 40);

describe("joystick geometry", () => {
  it("has equal left/right and top/bottom limits and keeps the knob inside the border", () => {
    const left = calculateJoystickVector(geometry.centerX - 200, geometry.centerY, geometry);
    const right = calculateJoystickVector(geometry.centerX + 200, geometry.centerY, geometry);
    const top = calculateJoystickVector(geometry.centerX, geometry.centerY - 200, geometry);
    const bottom = calculateJoystickVector(geometry.centerX, geometry.centerY + 200, geometry);

    expect(left.knobX).toBeCloseTo(-geometry.maxRadius, 8);
    expect(right.knobX).toBeCloseTo(geometry.maxRadius, 8);
    expect(Math.abs(left.knobX)).toBe(Math.abs(right.knobX));
    expect(top.knobY).toBeCloseTo(-geometry.maxRadius, 8);
    expect(bottom.knobY).toBeCloseTo(geometry.maxRadius, 8);
    expect(Math.abs(top.knobY)).toBe(Math.abs(bottom.knobY));
    expect(2 + Math.abs(left.knobX) + 20).toBe(50);
    expect(left.x).toBe(-1);
    expect(right.x).toBe(1);
    expect(top.y).toBe(-1);
    expect(bottom.y).toBe(1);
  });

  it("clamps diagonals to the same circular radius and normalizes movement", () => {
    const diagonal = calculateJoystickVector(
      geometry.centerX + 100,
      geometry.centerY + 100,
      geometry,
    );
    expect(Math.hypot(diagonal.knobX, diagonal.knobY)).toBeCloseTo(geometry.maxRadius, 8);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 8);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 8);
    expect(diagonal.y).toBeCloseTo(Math.SQRT1_2, 8);
  });

  it("re-measures travel after the joystick or knob is resized", () => {
    const resized = measureJoystickGeometry(
      { left: 0, top: 0, width: 140, height: 140 },
      136,
      136,
      56,
      56,
    );
    expect(resized.maxRadius).toBe(40);
    expect(resized.maxRadius).not.toBe(geometry.maxRadius);
  });
});

describe("getJoystickGeometry (canonical knob travel model)", () => {
  const base = {
    baseWidth: 100,
    baseHeight: 100,
    knobWidth: 40,
    knobHeight: 40,
    border: 2,
    padding: 0,
  };

  it("centers the neutral knob exactly on the outer circle center", () => {
    const geometry = getJoystickGeometry(base);
    expect(geometry.centerX).toBe(base.baseWidth / 2);
    expect(geometry.centerY).toBe(base.baseHeight / 2);
  });

  it("keeps left and right knob travel distances equal", () => {
    const geometry = getJoystickGeometry(base);
    const left = calculateJoystickVector(geometry.centerX - 500, geometry.centerY, geometry);
    const right = calculateJoystickVector(geometry.centerX + 500, geometry.centerY, geometry);
    // Distance from the neutral center to the clamped left and right centers.
    expect(Math.abs(left.knobX)).toBe(Math.abs(right.knobX));
    expect(left.knobX).toBe(-geometry.maxTravelRadius);
    expect(right.knobX).toBe(geometry.maxTravelRadius);
  });

  it("keeps top and bottom knob travel distances equal", () => {
    const geometry = getJoystickGeometry(base);
    const top = calculateJoystickVector(geometry.centerX, geometry.centerY - 500, geometry);
    const bottom = calculateJoystickVector(geometry.centerX, geometry.centerY + 500, geometry);
    expect(Math.abs(top.knobY)).toBe(Math.abs(bottom.knobY));
    expect(top.knobY).toBe(-geometry.maxTravelRadius);
    expect(bottom.knobY).toBe(geometry.maxTravelRadius);
  });

  it("subtracts border, padding, and knob radius from the outer radius", () => {
    const geometry = getJoystickGeometry(base);
    const outerRadius = Math.min(base.baseWidth, base.baseHeight) / 2;
    const knobRadius = Math.min(base.knobWidth, base.knobHeight) / 2;
    expect(geometry.maxTravelRadius).toBe(outerRadius - knobRadius - base.border - base.padding);
  });

  it("clamps diagonals to the same circular radius", () => {
    const geometry = getJoystickGeometry(base);
    const diagonal = calculateJoystickVector(
      geometry.centerX + 900,
      geometry.centerY + 900,
      geometry,
    );
    expect(Math.hypot(diagonal.knobX, diagonal.knobY)).toBeCloseTo(geometry.maxTravelRadius, 8);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 8);
  });

  it("keeps the knob inside the intended travel area at maximum travel", () => {
    const geometry = getJoystickGeometry(base);
    const outerRadius = geometry.diameter / 2;
    const knobRadius = Math.min(base.knobWidth, base.knobHeight) / 2;
    for (const point of [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
      { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
      { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
    ]) {
      const vector = calculateJoystickVector(
        geometry.centerX + point.x * 900,
        geometry.centerY + point.y * 900,
        geometry,
      );
      expect(Math.hypot(vector.knobX, vector.knobY) + knobRadius).toBeLessThanOrEqual(
        outerRadius + 1e-9,
      );
    }
  });

  it("works at different joystick sizes", () => {
    for (const size of [44, 88, 136, 200]) {
      const geometry = getJoystickGeometry({ ...base, baseWidth: size, baseHeight: size });
      expect(geometry.centerX).toBe(size / 2);
      expect(geometry.centerY).toBe(size / 2);
      expect(geometry.maxTravelRadius).toBe(size / 2 - 20 - 2);
    }
  });

  it("responds to knob size changes while staying concentric", () => {
    const small = getJoystickGeometry({ ...base, knobWidth: 20, knobHeight: 20 });
    const large = getJoystickGeometry({ ...base, knobWidth: 60, knobHeight: 60 });
    expect(small.centerX).toBe(large.centerX);
    expect(small.centerY).toBe(large.centerY);
    expect(small.maxTravelRadius).toBe(38);
    expect(large.maxTravelRadius).toBe(18);
    expect(large.maxTravelRadius).toBeLessThan(small.maxTravelRadius);
  });

  it("keeps the single movement joystick neutral center on its visual center", () => {
    const movementStick = getJoystickGeometry(base);
    const measured = measureJoystickGeometry(
      { left: 44, top: 28, width: base.baseWidth, height: base.baseHeight },
      base.baseWidth - base.border * 2,
      base.baseHeight - base.border * 2,
      base.knobWidth,
      base.knobHeight,
    );
    expect(measured.centerX).toBe(44 + movementStick.centerX);
    expect(measured.centerY).toBe(28 + movementStick.centerY);
    expect(measured.maxTravelRadius).toBe(movementStick.maxTravelRadius);
  });

  it("stays consistent with the DOM-measured wrapper", () => {
    const measured = measureJoystickGeometry(
      { left: 12, top: 30, width: 100, height: 100 },
      96,
      96,
      40,
      40,
    );
    const canonical = getJoystickGeometry(base);
    expect(measured.maxRadius).toBe(canonical.maxTravelRadius);
    expect(measured.centerX).toBe(12 + canonical.centerX);
    expect(measured.centerY).toBe(30 + canonical.centerY);
  });
});
