import { describe, expect, it } from "vitest";
import { consumeFixedSteps } from "./fixedStep";

const FIXED = 1 / 60;
const MAX_STEPS = 6;

describe("fixed step accumulator", () => {
  it("waits for a whole fixed tick and advances in fixed-sized steps", () => {
    const deltas: number[] = [];
    const first = consumeFixedSteps(0, FIXED / 2, FIXED, MAX_STEPS, (dt) => deltas.push(dt));
    expect(first.ticks).toBe(0);
    const second = consumeFixedSteps(first.accumulator, FIXED / 2, FIXED, MAX_STEPS, (dt) =>
      deltas.push(dt),
    );
    expect(second.ticks).toBe(1);
    expect(deltas).toEqual([FIXED]);
    expect(second.alpha).toBeCloseTo(0, 8);
  });

  it("catches up through the configured number of ticks", () => {
    const deltas: number[] = [];
    const result = consumeFixedSteps(0, FIXED * 4.5, FIXED, MAX_STEPS, (dt) => deltas.push(dt));
    expect(result.ticks).toBe(4);
    expect(deltas.every((dt) => dt === FIXED)).toBe(true);
    expect(result.alpha).toBeCloseTo(0.5, 8);
  });

  it("clamps long and negative frame deltas to a bounded number of ticks", () => {
    const results: number[] = [];
    const stalled = consumeFixedSteps(0, 10_000, FIXED, MAX_STEPS, (dt) => results.push(dt));
    const negative = consumeFixedSteps(0, -1, FIXED, MAX_STEPS, (dt) => results.push(dt));
    expect(stalled.ticks).toBe(MAX_STEPS);
    expect(stalled.accumulator).toBeLessThan(FIXED);
    expect(negative.ticks).toBe(0);
    expect(results).toHaveLength(MAX_STEPS);
  });

  it("produces equivalent tick counts for equivalent elapsed render time", () => {
    const countTicks = (frames: number, delta: number) => {
      let accumulator = 0;
      let ticks = 0;
      for (let i = 0; i < frames; i++) {
        const result = consumeFixedSteps(accumulator, delta, FIXED, MAX_STEPS, () => ticks++);
        accumulator = result.accumulator;
      }
      return { ticks, accumulator };
    };
    const sixtyHz = countTicks(60, 1 / 60);
    const oneTwentyHz = countTicks(120, 1 / 120);
    expect(sixtyHz.ticks).toBe(60);
    expect(oneTwentyHz.ticks).toBe(60);
    expect(sixtyHz.accumulator).toBeCloseTo(oneTwentyHz.accumulator, 8);
  });
});
