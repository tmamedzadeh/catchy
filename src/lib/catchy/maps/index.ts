export * from "./types";
export * from "./catalog";
export * from "./defaultMap";
export * from "./validator";
export * from "./repository";

import { DEFAULT_MAP, cloneMap } from "./defaultMap";
import type { MapDefinition } from "./types";
let activeMap: MapDefinition = cloneMap(DEFAULT_MAP);
export function setActiveMap(map: MapDefinition) {
  activeMap = cloneMap(map);
  return activeMap;
}
export function getActiveMap() {
  return activeMap;
}
