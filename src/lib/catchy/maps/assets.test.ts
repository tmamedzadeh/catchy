import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSET_CATALOG, DEFAULT_MAP, validateMap } from "./index";

describe("bundled model catalog", () => {
  it("maps every palette asset to one real public GLB", () => {
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const asset of ASSET_CATALOG) {
      expect(ids.has(asset.id), `duplicate asset key ${asset.id}`).toBe(false);
      expect(paths.has(asset.modelPath), `duplicate model URL ${asset.modelPath}`).toBe(false);
      ids.add(asset.id);
      paths.add(asset.modelPath);
      expect(asset.modelPath).toMatch(/^\/models\/(nature|town|pirate)\/[^/]+\.glb$/);
      const filePath = resolve(process.cwd(), "public", asset.modelPath.slice(1));
      expect(filePath.startsWith(`${resolve(process.cwd(), "public")}${sep}`)).toBe(true);
      expect(existsSync(filePath), `${asset.id} must resolve to ${asset.modelPath}`).toBe(true);
    }
  });

  it("keeps the rocks in the town kit and validates all bundled maps against the catalog", () => {
    for (const id of ["rock-large", "rock-wide", "rock-small"]) {
      expect(ASSET_CATALOG.find((asset) => asset.id === id)?.modelPath).toBe(
        `/models/town/${id}.glb`,
      );
    }
    expect(validateMap(DEFAULT_MAP).valid).toBe(true);
    expect(new Set(DEFAULT_MAP.objects.map((object) => object.model)).size).toBeGreaterThan(1);
  });
});
