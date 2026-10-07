export * from "./types";
export * from "./catalog";
export * from "./defaultMap";
export * from "./validator";
export * from "./repository";
export * from "./interactiveGeometry";
export * from "./islandGeometry";

import { DEFAULT_MAP, cloneMap } from "./defaultMap";
import type { MapDefinition } from "./types";

function freezeSnapshot<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeSnapshot(child);
  return Object.freeze(value);
}

// The running match owns one immutable snapshot. Editor/repository objects can never
// mutate this value while a match is in progress.
let activeMap: MapDefinition = freezeSnapshot(cloneMap(DEFAULT_MAP));

export function setActiveMap(map: MapDefinition) {
  activeMap = freezeSnapshot(cloneMap(map));
  return activeMap;
}

export function getActiveMap(): MapDefinition {
  return activeMap;
}

export function resetActiveMap() {
  return setActiveMap(DEFAULT_MAP);
}
