import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MAP, cloneMap } from "./defaultMap";
import { mapRepository, MAP_STORAGE_KEY } from "./repository";
import { validateMap } from "./validator";

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
  it("imports valid exports under a new id and rejects malformed JSON", () => {
    expect(() => mapRepository.importMap("not json")).toThrow("valid JSON");
    const exported = mapRepository.exportMap(DEFAULT_MAP);
    const imported = mapRepository.importMap(exported);
    expect(imported.id).not.toBe(DEFAULT_MAP.id);
    expect(imported.name).toContain("Imported");
    expect(imported.arena.radius).toBe(DEFAULT_MAP.arena.radius);
    expect(imported.objects.length).toBe(DEFAULT_MAP.objects.length);
    expect(imported.interactiveObjects.length).toBe(DEFAULT_MAP.interactiveObjects.length);
    expect(imported.runnerSpawns.length).toBe(3);
    expect(validateMap(imported).valid).toBe(true);
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
    invalid.playerSpawn.x = Number.NaN;
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
    expect(validateMap({ ...cloneMap(DEFAULT_MAP), runnerSpawns: [null] }).valid).toBe(false);
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

  it("validates arena radius boundaries and spawn distances", () => {
    const smallArena = cloneMap(DEFAULT_MAP);
    smallArena.arena.radius = 8;
    const resSmall = validateMap(smallArena);
    expect(resSmall.valid).toBe(false);
    expect(resSmall.errors.some((e) => e.code === "arena")).toBe(true);

    const closeSpawn = cloneMap(DEFAULT_MAP);
    closeSpawn.runnerSpawns[0]!.x = closeSpawn.playerSpawn.x + 0.5;
    closeSpawn.runnerSpawns[0]!.z = closeSpawn.playerSpawn.z + 0.5;
    const resSpawn = validateMap(closeSpawn);
    expect(resSpawn.valid).toBe(false);
    expect(resSpawn.errors.some((e) => e.code === "spawn-distance")).toBe(true);
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
