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
    const imported = mapRepository.importMap(mapRepository.exportMap(DEFAULT_MAP));
    expect(imported.id).not.toBe(DEFAULT_MAP.id);
    expect(imported.name).toContain("Imported");
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
});
