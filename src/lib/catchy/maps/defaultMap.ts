import {
  GAME_CONFIG,
  PROPS as LEGACY_PROPS,
  INTERACTIVE_OBJECTS as LEGACY_INTERACTIVES,
} from "../config";
import type { MapDefinition, MapObject, InteractiveMapObject } from "./types";

const props: MapObject[] = LEGACY_PROPS.map((object, index) => ({
  ...object,
  id: object.id ?? `default-prop-${index + 1}`,
}));
const interactiveObjects: InteractiveMapObject[] = LEGACY_INTERACTIVES.map((object) => ({
  ...object,
}));

/** The V1 layout, copied from the original descriptors without changing coordinates or tuning. */
export const DEFAULT_MAP: MapDefinition = {
  schemaVersion: 1,
  id: "default",
  name: "Default",
  description:
    "The original Catchy arena: an open running plain with a fountain loop and eastern choke point.",
  arena: { radius: GAME_CONFIG.arenaRadius },
  playerSpawn: { ...GAME_CONFIG.player.spawn },
  runnerSpawns: GAME_CONFIG.npc.spawns.map((spawn, index) => ({
    id: ["pink", "purple", "orange"][index]!,
    ...spawn,
  })),
  objects: props,
  interactiveObjects,
  decorations: [
    {
      id: "wear-mark-north-west",
      kind: "island",
      position: { x: -12, z: 9 },
      radius: 5.4,
      color: "#d88f43",
      y: 0.062,
    },
    {
      id: "wear-mark-north-east",
      kind: "island",
      position: { x: 10, z: 11 },
      radius: 4.8,
      color: "#f1c875",
      y: 0.063,
    },
    {
      id: "wear-mark-south",
      kind: "island",
      position: { x: -2, z: -15 },
      radius: 4.2,
      color: "#e4a552",
      y: 0.064,
    },
  ],
};

export function cloneMap(map: MapDefinition): MapDefinition {
  return structuredClone(map);
}
