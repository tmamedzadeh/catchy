import { cloneMap, DEFAULT_MAP } from "./defaultMap";
import { validateMap } from "./validator";
import type { MapDefinition } from "./types";

export const MAP_STORAGE_KEY = "catchy.maps.v1";
export const LAST_MAP_STORAGE_KEY = "catchy.last-map.v1";

type StoragePayload = { schemaVersion: 1; maps: MapDefinition[] };
const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

function readCustomMaps(): MapDefinition[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(MAP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoragePayload>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.maps)) return [];
    return parsed.maps.filter((map) => validateMap(map).valid).map(cloneMap);
  } catch {
    return [];
  }
}
function writeCustomMaps(maps: MapDefinition[]) {
  if (canUseStorage())
    window.localStorage.setItem(
      MAP_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, maps } satisfies StoragePayload),
    );
}
function newId(existing: MapDefinition[] = []) {
  const used = new Set(existing.map((map) => map.id));
  let index = 0;
  let id = "map-1";
  while (used.has(id)) {
    index += 1;
    id = `map-${index + 1}`;
  }
  return id;
}

export const mapRepository = {
  listMaps(): MapDefinition[] {
    return [cloneMap(DEFAULT_MAP), ...readCustomMaps()];
  },
  getMap(id: string) {
    return this.listMaps().find((map) => map.id === id);
  },
  hasMap(id: string) {
    return !!this.getMap(id);
  },
  saveMap(map: MapDefinition) {
    const copy = cloneMap(map);
    if (copy.id === DEFAULT_MAP.id) throw new Error("Default is protected. Duplicate it to edit.");
    const result = validateMap(copy);
    if (!result.valid) throw new Error(result.errors.map((error) => error.message).join(" "));
    const existing = readCustomMaps();
    const maps = existing.some((item) => item.id === copy.id)
      ? existing.map((item) => (item.id === copy.id ? copy : item))
      : [...existing, copy];
    writeCustomMaps(maps);
    return copy;
  },
  deleteMap(id: string) {
    if (id === DEFAULT_MAP.id) return false;
    const before = readCustomMaps();
    const after = before.filter((map) => map.id !== id);
    writeCustomMaps(after);
    return after.length !== before.length;
  },
  duplicateMap(id: string, name?: string) {
    const source = this.getMap(id);
    if (!source) throw new Error("Map not found.");
    const copy = cloneMap(source);
    copy.id = newId(readCustomMaps());
    copy.name = name ?? `${source.name} Copy`;
    return this.saveMap(copy);
  },
  newMap(name = "New Map"): MapDefinition {
    return {
      schemaVersion: 1,
      id: newId(readCustomMaps()),
      name,
      description: "A clean Catchy map.",
      arena: { radius: 30 },
      playerSpawn: { x: -4, z: 12 },
      runnerSpawns: [
        { id: "pink", x: -13, z: -2 },
        { id: "purple", x: 9, z: -12 },
        { id: "orange", x: 17, z: 6 },
      ],
      objects: [],
      interactiveObjects: cloneMap(DEFAULT_MAP).interactiveObjects,
    };
  },
  getLastSelectedId() {
    try {
      return canUseStorage() ? window.localStorage.getItem(LAST_MAP_STORAGE_KEY) : null;
    } catch {
      return null;
    }
  },
  setLastSelectedId(id: string) {
    try {
      if (canUseStorage()) window.localStorage.setItem(LAST_MAP_STORAGE_KEY, id);
    } catch {
      /* storage is optional */
    }
  },
  exportMap(map: MapDefinition) {
    return JSON.stringify(map, null, 2);
  },
  importMap(input: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new Error("Import is not valid JSON.");
    }
    const result = validateMap(parsed);
    if (!result.valid) throw new Error(result.errors.map((error) => error.message).join(" "));
    const copy = cloneMap(parsed as MapDefinition);
    copy.id = newId(readCustomMaps());
    copy.name = `${copy.name} (Imported)`;
    return this.saveMap(copy);
  },
};
