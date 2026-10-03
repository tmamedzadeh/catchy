import { cloneMap, DEFAULT_MAP } from "./defaultMap";
import { isMapDefinition, validateMap } from "./validator";
import type { MapDefinition } from "./types";

export const MAP_STORAGE_KEY = "catchy.maps.v1";
export const LAST_MAP_STORAGE_KEY = "catchy.last-map.v1";

type StoragePayload = { schemaVersion: 1; maps: MapDefinition[] };

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readCustomMaps(): MapDefinition[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(MAP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoragePayload>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.maps)) return [];
    const ids = new Set([DEFAULT_MAP.id]);
    const maps: MapDefinition[] = [];
    for (const candidate of parsed.maps) {
      if (!isMapDefinition(candidate) || ids.has(candidate.id)) continue;
      ids.add(candidate.id);
      maps.push(cloneMap(candidate));
    }
    return maps;
  } catch {
    return [];
  }
}
function writeCustomMaps(maps: MapDefinition[]) {
  const storage = getStorage();
  if (!storage) throw new Error("Local storage is unavailable. This map cannot be saved.");
  try {
    storage.setItem(
      MAP_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, maps } satisfies StoragePayload),
    );
  } catch {
    throw new Error("Could not save the map. Check available browser storage and try again.");
  }
}
function newId(existing: MapDefinition[] = [], reserved: string[] = []) {
  const used = new Set([DEFAULT_MAP.id, ...reserved, ...existing.map((map) => map.id)]);
  let index = 0;
  let id = "map-1";
  while (used.has(id)) {
    index += 1;
    id = `map-${index + 1}`;
  }
  return id;
}

export const mapRepository = {
  /** Repository API: all returned maps are detached from storage and from DEFAULT_MAP. */
  list(): MapDefinition[] {
    return this.listMaps();
  },
  listMaps(): MapDefinition[] {
    return [cloneMap(DEFAULT_MAP), ...readCustomMaps()];
  },
  get(id: string) {
    return this.getMap(id);
  },
  getMap(id: string) {
    const map = this.listMaps().find((item) => item.id === id);
    return map ? cloneMap(map) : undefined;
  },
  hasMap(id: string) {
    return !!this.getMap(id);
  },
  save(map: MapDefinition) {
    return this.saveMap(map);
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
  delete(id: string) {
    return this.deleteMap(id);
  },
  deleteMap(id: string) {
    if (id === DEFAULT_MAP.id) return false;
    const before = readCustomMaps();
    const after = before.filter((map) => map.id !== id);
    writeCustomMaps(after);
    return after.length !== before.length;
  },
  duplicate(id: string, name?: string) {
    return this.duplicateMap(id, name);
  },
  duplicateMap(id: string, name?: string) {
    const source = this.getMap(id);
    if (!source) throw new Error("Map not found.");
    const copy = cloneMap(source);
    copy.id = newId(readCustomMaps());
    copy.name = name ?? `${source.name} Copy`;
    return this.saveMap(copy);
  },
  duplicateDraft(source: MapDefinition, name?: string) {
    const copy = cloneMap(source);
    copy.id = newId(readCustomMaps(), [source.id]);
    copy.name = name ?? `${source.name} Copy`;
    return copy;
  },
  newMap(name = "New Map"): MapDefinition {
    return {
      version: 1,
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
      return getStorage()?.getItem(LAST_MAP_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  },
  setLastSelectedId(id: string) {
    try {
      getStorage()?.setItem(LAST_MAP_STORAGE_KEY, id);
    } catch {
      /* storage is optional */
    }
  },
  export(map: MapDefinition) {
    return this.exportMap(map);
  },
  exportMap(map: MapDefinition) {
    const copy = cloneMap(map);
    return JSON.stringify(copy, null, 2);
  },
  import(input: string) {
    return this.importMap(input);
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
