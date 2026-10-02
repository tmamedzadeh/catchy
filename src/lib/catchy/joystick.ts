export type JoystickRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type JoystickGeometry = {
  /** Neutral knob center, in the coordinate space of the provided sizes. */
  centerX: number;
  centerY: number;
  /** Symmetric maximum knob-center travel per axis and radially. */
  maxTravelX: number;
  maxTravelY: number;
  maxTravelRadius: number;
  /** @deprecated Legacy alias for {@link maxTravelRadius}. */
  maxRadius: number;
  diameter: number;
};

export type JoystickVector = {
  knobX: number;
  knobY: number;
  x: number;
  y: number;
};

/**
 * Measure symmetric knob travel from a live outer rect, its inner (border- and
 * padding-free) size, and the rendered knob size.
 *
 * @deprecated Use {@link getJoystickGeometry} with explicit border and padding
 * values; this wrapper exists for the shared simulation helpers that receive
 * the client-measured inner size instead of style thickness.
 */
export function measureJoystickGeometry(
  rect: JoystickRect,
  innerWidth: number,
  innerHeight: number,
  knobWidth: number,
  knobHeight: number,
): JoystickGeometry {
  const geometry = getJoystickGeometry({
    baseWidth: rect.width,
    baseHeight: rect.height,
    knobWidth,
    knobHeight,
    // The inner sizes are the border-free client box: the symmetric difference
    // is the border thickness, and this element has no padding.
    border: Math.max(0, (rect.width - innerWidth) / 2),
    padding: 0,
  });
  return {
    centerX: rect.left + geometry.centerX,
    centerY: rect.top + geometry.centerY,
    maxTravelX: geometry.maxTravelX,
    maxTravelY: geometry.maxTravelY,
    maxTravelRadius: geometry.maxTravelRadius,
    maxRadius: geometry.maxRadius,
    diameter: geometry.diameter,
  };
}

export type JoystickShape = {
  /** Border-box size of the rendered outer joystick circle. */
  baseWidth: number;
  baseHeight: number;
  /** Rendered border-box size of the knob. */
  knobWidth: number;
  knobHeight: number;
  /** Border and padding thickness of the outer joystick, in pixels. */
  border?: number;
  padding?: number;
};

/**
 * Pure knob travel geometry derived from the rendered outer joystick.
 *
 * The neutral knob center is the center of the outer (border-box) circle, and
 * the maximum knob center travel is outer radius minus knob radius minus any
 * border/padding, so the knob never visually escapes the drawn outer circle.
 */
export function getJoystickGeometry({
  baseWidth,
  baseHeight,
  knobWidth,
  knobHeight,
  border = 0,
  padding = 0,
}: JoystickShape): JoystickGeometry {
  const diameter = Math.min(baseWidth, baseHeight);
  const outerRadius = diameter / 2;
  const innerRadius = Math.max(0, outerRadius - Math.max(0, border) - Math.max(0, padding));
  const knobRadius = Math.min(knobWidth, knobHeight) / 2;
  const maxTravel = Math.max(0, innerRadius - knobRadius);
  return {
    centerX: outerRadius,
    centerY: outerRadius,
    maxTravelX: maxTravel,
    maxTravelY: maxTravel,
    maxTravelRadius: maxTravel,
    maxRadius: maxTravel,
    diameter,
  };
}

/** Clamp pointer travel to a circular, symmetric radius and normalize by that radius. */
export function calculateJoystickVector(
  clientX: number,
  clientY: number,
  geometry: JoystickGeometry,
  vector: JoystickVector = { knobX: 0, knobY: 0, x: 0, y: 0 },
): JoystickVector {
  const rawX = clientX - geometry.centerX;
  const rawY = clientY - geometry.centerY;
  const distance = Math.hypot(rawX, rawY);
  const scale = distance > geometry.maxRadius && distance > 0 ? geometry.maxRadius / distance : 1;
  const knobX = rawX * scale;
  const knobY = rawY * scale;
  const inverseRadius = geometry.maxRadius > 0 ? 1 / geometry.maxRadius : 0;
  vector.knobX = knobX;
  vector.knobY = knobY;
  vector.x = knobX * inverseRadius;
  vector.y = knobY * inverseRadius;
  return vector;
}
