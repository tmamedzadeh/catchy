export type FixedStepResult = {
  accumulator: number;
  alpha: number;
  ticks: number;
};

/** Clamp render stalls and advance at most maxSteps fixed gameplay ticks. */
export function consumeFixedSteps(
  accumulator: number,
  frameDelta: number,
  fixedDelta: number,
  maxSteps: number,
  tick: (delta: number) => void,
): FixedStepResult {
  const maxFrameDelta = fixedDelta * maxSteps;
  let remaining = Math.min(
    Math.max(0, accumulator) + Math.max(0, Math.min(frameDelta, maxFrameDelta)),
    maxFrameDelta,
  );
  let ticks = 0;

  while (remaining >= fixedDelta && ticks < maxSteps) {
    remaining -= fixedDelta;
    ticks++;
    tick(fixedDelta);
  }

  return { accumulator: remaining, alpha: remaining / fixedDelta, ticks };
}
