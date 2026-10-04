import type { InteractiveMapObject, MapDefinition, MapObject } from "./types";

const props: MapObject[] = [];

function add(
  model: string,
  x: number,
  z: number,
  rotation: number,
  scale: number,
  y: number,
  collision: MapObject["collision"],
) {
  props.push({
    id: `default-prop-${props.length + 1}`,
    model,
    position: { x, z },
    rotation,
    scale,
    y,
    collision,
  });
}

const STONE_WALL: MapObject["collision"] = { type: "box", width: 0.98, depth: 0.52 };

/** Default's low stone walls share their transform with their colliders. */
function wallRun(
  x: number,
  z: number,
  angle: number,
  count: number,
  scale = 1.9,
  model = "wall-block",
) {
  const step = scale * 0.98;
  for (let i = 0; i < count; i++) {
    const px = x + Math.cos(angle) * step * i;
    const pz = z + Math.sin(angle) * step * i;
    add(model, px, pz, -angle, scale, 0, STONE_WALL);
  }
}

// The original layout stays entirely inside Default's MapDefinition.
add("fountain-round", 2, -1, 0, 3.1, 0, { type: "circle", radius: 1.3 });
add("lantern", 6.6, 1.8, 0, 2.2, 0, { type: "circle", radius: 0.24 });
add("lantern", -2.6, -4.4, 0, 2.2, 0, { type: "circle", radius: 0.24 });

// Choke point: two wall stubs east of the fountain.
wallRun(11.5, -7.5, Math.PI / 2, 4);
wallRun(11.5, 3.4, Math.PI / 2, 3);
add("lantern", 13.4, -1.6, 0, 2.2, 0, { type: "circle", radius: 0.24 });

// Loop wall north-west.
wallRun(-14, -9, 0, 5);
wallRun(-14, -9, Math.PI / 2, 3);
add("crate", -10.4, -5.3, 0.5, 1.35, 0, { type: "box", width: 0.72, depth: 0.72 });
add("barrel", -8.9, -5.9, -0.2, 1.15, 0, { type: "circle", radius: 0.38 });

// Short south-east lane framed by crates and barrels.
add("crate", 15.5, 9.5, 0.3, 1.5, 0, { type: "box", width: 0.72, depth: 0.72 });
add("crate", 16.8, 10.6, -0.4, 1.5, 0, { type: "box", width: 0.72, depth: 0.72 });
add("crate-bottles", 15.2, 11.4, 0.9, 1.5, 0, { type: "box", width: 0.72, depth: 0.72 });
add("barrel", 12.2, 13.4, 0, 1.3, 0, { type: "circle", radius: 0.38 });
add("barrel", 13.4, 14.1, 0.6, 1.3, 0, { type: "circle", radius: 0.38 });
add("cart", 8.6, 12.4, 2.1, 2, 0, { type: "box", width: 0.82, depth: 0.52 });
add("lantern", 11, 9, 0, 2.2, 0, { type: "circle", radius: 0.24 });

// Loose rocks and stone spines remain real obstacles.
add("rock-large", 20.5, -10.5, 0.7, 2.1, 0, { type: "circle", radius: 0.42 });
add("rock-wide", 19, -13.2, 2.2, 1.8, 0, { type: "circle", radius: 0.48 });
add("rock-small", 22.2, -7.6, 1.1, 1.7, 0, { type: "circle", radius: 0.36 });
add("stone_tallD", -21.5, -13.5, 0.4, 2.6, 0, { type: "circle", radius: 0.4 });
add("stone_largeC", -19.2, -15.6, 1.9, 2.4, 0, { type: "circle", radius: 0.46 });

// Palm trunks around the rim provide silhouette depth and small round colliders.
const palmSpots: [number, number, string, number][] = [
  [-24, 9, "tree_palmDetailedTall", 3.4],
  [-21, 17, "tree_palmBend", 3.1],
  [-4, 24, "tree_palmDetailedTall", 3.2],
  [9, 22, "tree_palmDetailedShort", 3],
  [21, 14, "tree_palmBend", 3.3],
  [25, -3, "tree_palmDetailedTall", 3.4],
  [17, -20, "tree_palmDetailedShort", 3],
  [-2, -25, "tree_palmDetailedTall", 3.2],
  [-16, -21, "tree_palmBend", 3.1],
  [-26, -4, "tree_palmDetailedTall", 3.3],
];
for (const [x, z, model, scale] of palmSpots) {
  add(model, x, z, (x + z) * 0.3, scale, 0, { type: "circle", radius: 0.2 });
}

const interactiveObjects: InteractiveMapObject[] = [
  {
    id: "speed-pad",
    kind: "speedPad",
    model: "",
    position: { x: -16, z: 12 },
    rotation: -0.45,
    scale: 1,
    y: 0.035,
    collision: { type: "circle", radius: 2.15 },
    triggerRadius: 2.15,
  },
  {
    id: "slow-zone",
    kind: "slowZone",
    model: "",
    position: { x: 5, z: -20 },
    rotation: 0,
    scale: 1,
    y: 0.018,
    collision: { type: "circle", radius: 3.3 },
    triggerRadius: 3.3,
  },
  {
    id: "elastic-bounce",
    kind: "elasticBounce",
    model: "",
    position: { x: -19, z: 3 },
    rotation: 0,
    scale: 1,
    y: 1.35,
    collision: { type: "circle", radius: 1.35 },
  },
  {
    id: "temporary-barrier",
    kind: "temporaryBarrier",
    model: "",
    position: { x: 11.5, z: 0.8 },
    rotation: 0,
    scale: 1,
    y: 0,
    collision: { type: "box", width: 0.78, depth: 4.25 },
  },
];

function freezeTree<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

/** The protected V1 layout; its geometry is defined only by this MapDefinition. */
export const DEFAULT_MAP: MapDefinition = freezeTree({
  version: 1,
  schemaVersion: 1,
  id: "default",
  name: "Default",
  description:
    "The original Catchy arena: an open running plain with a fountain loop and eastern choke point.",
  arena: { radius: 30 },
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
});

export function cloneMap(map: MapDefinition): MapDefinition {
  const copy = structuredClone(map);
  delete copy.playerSpawn;
  delete copy.runnerSpawns;
  return copy;
}
