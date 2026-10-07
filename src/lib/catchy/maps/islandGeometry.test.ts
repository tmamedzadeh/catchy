import { describe, expect, it } from "vitest";
import { createIslandGeometry } from "./islandGeometry";

describe("island ground geometry", () => {
  it("builds a deterministic closed patch with the requested footprint", () => {
    const first = createIslandGeometry(5);
    const second = createIslandGeometry(5);
    const larger = createIslandGeometry(10);

    first.computeBoundingBox();
    larger.computeBoundingBox();

    expect(first.getAttribute("position").count).toBeGreaterThan(0);
    expect(Array.from(first.getAttribute("position").array)).toEqual(
      Array.from(second.getAttribute("position").array),
    );
    expect(first.boundingBox!.max.x).toBeGreaterThan(4.5);
    expect(first.boundingBox!.max.y).toBeGreaterThan(4.5);
    expect(first.boundingBox!.min.x).toBeLessThan(-4.5);
    expect(first.boundingBox!.min.y).toBeLessThan(-4.5);
    expect(larger.boundingBox!.max.x).toBeGreaterThan(first.boundingBox!.max.x * 1.9);

    first.dispose();
    second.dispose();
    larger.dispose();
  });
});
