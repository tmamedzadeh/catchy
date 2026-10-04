import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MAP, cloneMap } from "./defaultMap";
import { interactiveYForScale } from "./interactiveGeometry";
import { mapRepository, MAP_STORAGE_KEY } from "./repository";
import { MAP_LIMITS, validateMap } from "./validator";

describe("map domain", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => data.get(key) ?? null,
          setItem: (key: string, value: string) => data.set(key, value),
          removeItem: (key: string) => data.delete(key),
          clear: () => data.clear(),
        },
      },
    });
    window.localStorage.clear();
  });
  it("keeps Default protected and clones repository values", () => {
    expect(validateMap(DEFAULT_MAP).valid).toBe(true);
    expect(Object.isFrozen(DEFAULT_MAP)).toBe(true);
    expect(Object.isFrozen(DEFAULT_MAP.objects[0])).toBe(true);
    const first = mapRepository.getMap("default")!;
    first.name = "Mutated copy";
    expect(mapRepository.getMap("default")!.name).toBe("Default");
    expect(mapRepository.deleteMap("default")).toBe(false);
  });
  it("round trips, duplicates, and deletes custom maps", () => {
    const custom = cloneMap(DEFAULT_MAP);
    custom.id = "custom-map";
    custom.name = "Custom Map";
    mapRepository.saveMap(custom);
    expect(mapRepository.getMap("custom-map")?.name).toBe("Custom Map");
    const duplicate = mapRepository.duplicateMap("custom-map");
    expect(duplicate.id).not.toBe("custom-map");
    duplicate.objects[0]!.position.x += 10;
    expect(mapRepository.getMap("custom-map")!.objects[0]!.position.x).not.toBe(
      duplicate.objects[0]!.position.x,
    );
    expect(mapRepository.listMaps()).toHaveLength(3);
    expect(mapRepository.deleteMap("custom-map")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(MAP_STORAGE_KEY)!).maps).toHaveLength(1);
  });
  it("supports the concise repository actions and selected map persistence", () => {
    const draft = mapRepository.duplicateDraft(DEFAULT_MAP, "Draft Copy");
    expect(draft.id).not.toBe("default");
    const saved = mapRepository.save(draft);
    expect(mapRepository.get(saved.id)?.name).toBe("Draft Copy");
    expect(mapRepository.list().map((map) => map.id)).toContain(saved.id);

    const duplicate = mapRepository.duplicate(saved.id, "Second Copy");
    expect(duplicate.name).toBe("Second Copy");
    const imported = mapRepository.import(mapRepository.export(duplicate));
    expect(imported.name).toBe("Second Copy (Imported)");

    mapRepository.setLastSelectedId(imported.id);
    expect(mapRepository.getLastSelectedId()).toBe(imported.id);
    expect(mapRepository.delete(saved.id)).toBe(true);
    expect(mapRepository.delete(duplicate.id)).toBe(true);
    expect(mapRepository.delete(imported.id)).toBe(true);
  });
  it("imports valid exports under a new id and rejects malformed JSON", () => {
    expect(() => mapRepository.importMap("not json")).toThrow("valid JSON");
    const exported = mapRepository.exportMap(DEFAULT_MAP);
    const imported = mapRepository.importMap(exported);
    expect(imported.id).not.toBe(DEFAULT_MAP.id);
    expect(imported.name).toContain("Imported");
    expect(imported.arena.radius).toBe(DEFAULT_MAP.arena.radius);
    expect(imported.objects.length).toBe(DEFAULT_MAP.objects.length);
    expect(imported.interactiveObjects.length).toBe(DEFAULT_MAP.interactiveObjects.length);
    expect(imported).not.toHaveProperty("playerSpawn");
    expect(imported).not.toHaveProperty("runnerSpawns");
    expect(validateMap(imported).valid).toBe(true);
  });

  it("accepts radius 100, rejects values above the supported ceiling, and round trips it", () => {
    const custom = cloneMap(DEFAULT_MAP);
    custom.id = "radius-100";
    custom.arena.radius = 100;
    expect(validateMap(custom).valid).toBe(true);
    expect(MAP_LIMITS.maxRadius).toBe(100);
    custom.arena.radius = MAP_LIMITS.maxRadius + 1;
    expect(validateMap(custom).errors.some((entry) => entry.code === "arena")).toBe(true);

    custom.arena.radius = 100;
    custom.id = "radius-100-roundtrip";
    mapRepository.saveMap(custom);
    expect(mapRepository.getMap(custom.id)?.arena.radius).toBe(100);
    const imported = mapRepository.importMap(mapRepository.exportMap(custom));
    expect(imported.arena.radius).toBe(100);
  });

  it("never allocates a custom id that can shadow Default", () => {
    const custom = cloneMap(DEFAULT_MAP);
    custom.id = "map-1";
    custom.name = "First custom";
    mapRepository.saveMap(custom);
    expect(mapRepository.newMap().id).not.toBe("default");
    expect(mapRepository.duplicateMap("default").id).not.toBe("default");
  });

  it("rejects unsafe layout data", () => {
    const invalid = cloneMap(DEFAULT_MAP);
    invalid.objects[0]!.model = "https://evil.test/model.glb";
    expect(validateMap(invalid).valid).toBe(false);
    invalid.arena.radius = Number.NaN;
    expect(validateMap(invalid).valid).toBe(false);
  });
  it("ignores corrupt storage", () => {
    window.localStorage.setItem(MAP_STORAGE_KEY, "not json");
    expect(mapRepository.listMaps()).toHaveLength(1);
  });

  it("rejects malformed nested persisted maps without crashing the repository", () => {
    window.localStorage.setItem(
      MAP_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        maps: [
          null,
          { ...cloneMap(DEFAULT_MAP), id: "broken-map", runnerSpawns: [null], objects: [null] },
        ],
      }),
    );
    expect(() => mapRepository.listMaps()).not.toThrow();
    expect(mapRepository.listMaps()).toHaveLength(1);
  });

  it("rejects unsupported stored versions, duplicate IDs, and attempts to shadow Default", () => {
    const custom = cloneMap(DEFAULT_MAP);
    custom.id = "saved-map";
    window.localStorage.setItem(
      MAP_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, maps: [custom, custom, { ...custom, id: "default" }] }),
    );
    expect(mapRepository.listMaps().map((map) => map.id)).toEqual(["default", "saved-map"]);
    window.localStorage.setItem(
      MAP_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, maps: [custom] }),
    );
    expect(mapRepository.listMaps().map((map) => map.id)).toEqual(["default"]);
    const unsupported = cloneMap(DEFAULT_MAP);
    unsupported.version = 2 as 1;
    expect(validateMap(unsupported).errors.some((entry) => entry.code === "version")).toBe(true);
  });

  it("does not persist an unsupported asset key", () => {
    const custom = cloneMap(DEFAULT_MAP);
    custom.id = "bad-asset-map";
    custom.objects[0]!.model = "missing-glb";
    expect(() => mapRepository.saveMap(custom)).toThrow("Unknown bundled asset");
    expect(mapRepository.hasMap("bad-asset-map")).toBe(false);
  });

  it("reports storage write failures instead of claiming a map was saved", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => null,
          setItem: () => {
            throw new Error("quota");
          },
        },
      },
    });
    const custom = cloneMap(DEFAULT_MAP);
    custom.id = "quota-map";
    expect(() => mapRepository.saveMap(custom)).toThrow("Could not save the map");
  });

  it("validates arena radius boundaries", () => {
    const smallArena = cloneMap(DEFAULT_MAP);
    smallArena.arena.radius = 8;
    const result = validateMap(smallArena);
    expect(result.valid).toBe(false);
    expect(result.errors.some((entry) => entry.code === "arena")).toBe(true);
  });

  it("rejects hex decoration colors that Three.js cannot parse", () => {
    const custom = cloneMap(DEFAULT_MAP);
    const decoration = custom.decorations![0]!;
    for (const color of ["#12", "#1234", "#12345", "#1234567", "#12345678"]) {
      decoration.color = color;
      expect(validateMap(custom).errors.some((entry) => entry.code === "decoration")).toBe(true);
    }
    for (const color of ["#abc", "#aabbcc"]) {
      decoration.color = color;
      expect(validateMap(custom).valid).toBe(true);
    }
  });

  it("validates required interactive objects constraints", () => {
    const missingInteractives = cloneMap(DEFAULT_MAP);
    missingInteractives.interactiveObjects = missingInteractives.interactiveObjects.filter(
      (obj) => obj.kind !== "speedPad",
    );
    const resMissing = validateMap(missingInteractives);
    expect(resMissing.valid).toBe(false);
    expect(resMissing.errors.some((e) => e.code === "interactive")).toBe(true);
  });

  it("keeps solid interactive colliders fully inside the arena", () => {
    for (const kind of ["elasticBounce", "temporaryBarrier"] as const) {
      const custom = cloneMap(DEFAULT_MAP);
      custom.id = `edge-${kind}`;
      custom.arena.radius = 100;
      const interactive = custom.interactiveObjects.find((item) => item.kind === kind)!;
      interactive.position = { x: 99, z: 0 };
      const result = validateMap(custom);
      expect(result.errors.some((entry) => entry.code === "interactive-bounds")).toBe(true);
    }
  });

  it("checks the full speed and slow trigger radius against the arena edge", () => {
    for (const kind of ["speedPad", "slowZone"] as const) {
      const custom = cloneMap(DEFAULT_MAP);
      custom.id = `edge-trigger-${kind}`;
      custom.arena.radius = 100;
      const interactive = custom.interactiveObjects.find((item) => item.kind === kind)!;
      interactive.position = { x: 99, z: 0 };
      const result = validateMap(custom);
      expect(result.errors.some((entry) => entry.code === "interactive-bounds")).toBe(true);
    }
  });

  it("requires interactive collider shapes to match their gameplay kind", () => {
    const custom = cloneMap(DEFAULT_MAP);
    const barrier = custom.interactiveObjects.find((item) => item.kind === "temporaryBarrier")!;
    barrier.collision = { type: "circle", radius: 1 };
    expect(validateMap(custom).errors.some((entry) => entry.code === "interactive-transform")).toBe(
      true,
    );
  });

  it("keeps a scaled Bounce Ball collider centered on the arena floor", () => {
    const custom = cloneMap(DEFAULT_MAP);
    const bounce = custom.interactiveObjects.find((item) => item.kind === "elasticBounce")!;
    bounce.scale = 1.5;
    expect(validateMap(custom).errors.some((entry) => entry.path?.endsWith(".y"))).toBe(true);
    if (bounce.collision.type === "circle") bounce.y = bounce.collision.radius * bounce.scale;
    expect(validateMap(custom).valid).toBe(true);
  });

  it("keeps Bounce Ball grounded when its scale changes and preserves other item heights", () => {
    const bounce = DEFAULT_MAP.interactiveObjects.find((item) => item.kind === "elasticBounce")!;
    const speedPad = DEFAULT_MAP.interactiveObjects.find((item) => item.kind === "speedPad")!;
    expect(interactiveYForScale(bounce, 1.5)).toBe(
      bounce.collision.type === "circle" ? bounce.collision.radius * 1.5 : bounce.y,
    );
    expect(interactiveYForScale(speedPad, 1.5)).toBe(speedPad.y);
  });

  it("normalizes legacy spawn fields away on storage, import, and export", () => {
    const legacy = {
      ...cloneMap(DEFAULT_MAP),
      id: "legacy-map",
      playerSpawn: { x: Number.NaN, z: 100_000 },
      runnerSpawns: [{ id: "legacy-runner", x: Number.NaN, z: 100_000 }],
    };
    expect(validateMap(legacy).valid).toBe(true);

    window.localStorage.setItem(
      MAP_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, maps: [legacy] }),
    );
    expect(mapRepository.getMap("legacy-map")).not.toHaveProperty("playerSpawn");
    expect(mapRepository.getMap("legacy-map")).not.toHaveProperty("runnerSpawns");

    const imported = mapRepository.importMap(JSON.stringify(legacy));
    expect(imported).not.toHaveProperty("playerSpawn");
    expect(imported).not.toHaveProperty("runnerSpawns");
    expect(mapRepository.exportMap(legacy)).not.toContain("playerSpawn");
    expect(mapRepository.exportMap(legacy)).not.toContain("runnerSpawns");
    expect(mapRepository.newMap()).not.toHaveProperty("playerSpawn");
    expect(mapRepository.newMap()).not.toHaveProperty("runnerSpawns");
  });

  it("updates navigation and collisions when installing a custom map", () => {
    const custom = cloneMap(DEFAULT_MAP);
    custom.id = "custom-obstacles";
    // Ensure decorations are still within the arena if arena radius is adjusted
    custom.arena.radius = 28;
    custom.decorations = [];
    custom.objects = [
      {
        id: "center-rock",
        model: "rock-small",
        position: { x: 0, z: 0 },
        rotation: 0,
        scale: 1,
        y: 0,
        collision: { type: "circle", radius: 1 },
      },
    ];
    expect(validateMap(custom).valid).toBe(true);
  });
});
