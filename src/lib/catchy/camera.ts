export type CameraBasis = {
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
};

export type CameraInput = {
  yawDelta: number;
  pitchDelta: number;
  zoomDelta: number;
  manual: boolean;
};

export const NEUTRAL_CAMERA_INPUT: CameraInput = {
  yawDelta: 0,
  pitchDelta: 0,
  zoomDelta: 0,
  manual: false,
};

/** Basis for the camera's rendered view: forward is its look direction and right is screen-right. */
export function getCameraBasis(
  yaw: number,
  basis: CameraBasis = { forwardX: 0, forwardZ: 0, rightX: 0, rightZ: 0 },
): CameraBasis {
  basis.forwardX = Math.sin(yaw);
  basis.forwardZ = Math.cos(yaw);
  basis.rightX = -basis.forwardZ;
  basis.rightZ = basis.forwardX;
  return basis;
}

const bearingBasis: CameraBasis = { forwardX: 0, forwardZ: 1, rightX: -1, rightZ: 0 };

/** Signed screen-space bearing from the camera's rendered forward direction. */
export function getCameraRelativeBearing(dx: number, dz: number, yaw: number) {
  const basis = getCameraBasis(yaw, bearingBasis);
  return Math.atan2(
    dx * basis.rightX + dz * basis.rightZ,
    dx * basis.forwardX + dz * basis.forwardZ,
  );
}
