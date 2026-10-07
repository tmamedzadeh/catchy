import type { InteractiveMapObject, MapDefinition, MapObject } from "./types";

const props: MapObject[] = [];

function add(
  model: string,
  x: number,
  z: number,
  rotation: number,
  scale: number,
  collision: MapObject["collision"],
  id?: string,
) {
  props.push({
    id: id ?? `default-prop-${props.length + 1}`,
    model,
    position: { x, z },
    rotation,
    scale,
    y: 0,
    collision,
  });
}

const PALM_TRUNK: MapObject["collision"] = { type: "circle", radius: 0.2 };
const WALL: MapObject["collision"] = { type: "box", width: 0.98, depth: 0.52 };

/** Place connected, readable wall sections while leaving broad running gaps. */
function wallRun(x: number, z: number, angle: number, count: number, scale = 2, idPrefix = "wall") {
  const step = scale * 0.98;
  for (let i = 0; i < count; i++) {
    add(
      "wall-block",
      x + Math.cos(angle) * step * i,
      z + Math.sin(angle) * step * i,
      -angle,
      scale,
      WALL,
      `default-${idPrefix}-${props.length + 1}`,
    );
  }
}

// Central fountain plaza and its small lantern ring form the main orientation point.
add("fountain-round", 0, 0, 0, 4.5, { type: "circle", radius: 1.3 }, "fountain-plaza");
for (const [id, x, z] of [
  ["plaza-lantern-north", 0, 8],
  ["plaza-lantern-east", 8, 0],
  ["plaza-lantern-south", 0, -8],
  ["plaza-lantern-west", -8, 0],
] as const) {
  add("lantern", x, z, 0, 2.2, { type: "circle", radius: 0.24 }, id);
}

// West Market: two open-ended wall rows, clustered cargo and a clear plaza entrance.
wallRun(-62, -10, 0, 5, 2, "market-south-wall");
wallRun(-62, 10, 0, 5, 2, "market-north-wall");
add("crate", -58, -3.2, 0.2, 1.45, { type: "box", width: 0.72, depth: 0.72 });
add("crate-bottles", -55.9, -3.1, -0.25, 1.4, { type: "box", width: 0.72, depth: 0.72 });
add("crate", -58.2, 0.1, 0.4, 1.4, { type: "box", width: 0.72, depth: 0.72 });
add("barrel", -54.6, 2.2, 0.1, 1.3, { type: "circle", radius: 0.38 });
add("barrel", -55.8, 3.5, 0.6, 1.3, { type: "circle", radius: 0.38 });
add("cart", -47.8, 4.6, 1.9, 2, { type: "box", width: 0.82, depth: 0.52 });
add("lantern", -51, -11.8, 0, 2.2, { type: "circle", radius: 0.24 });
add("lantern", -45, -7.2, 0, 2.2, { type: "circle", radius: 0.24 });

// North-east Palm Grove: grouped silhouettes around a broad, open interior loop.
const grovePalms: [string, number, number, number][] = [
  ["tree_palmDetailedTall", 34, 42, 3.8],
  ["tree_palmBend", 41, 34, 3.6],
  ["tree_palmDetailedShort", 53, 36, 3.5],
  ["tree_palmDetailedTall", 61, 45, 3.8],
  ["tree_palmBend", 55, 57, 3.7],
  ["tree_palmDetailedShort", 42, 59, 3.5],
];
for (const [model, x, z, scale] of grovePalms) add(model, x, z, (x + z) * 0.17, scale, PALM_TRUNK);
add("rock-wide", 48, 45, 0.6, 1.9, { type: "circle", radius: 0.48 });
add("rock-small", 50.4, 47.1, 1.1, 1.6, { type: "circle", radius: 0.36 });
add("lantern", 31, 48, -0.3, 2.2, { type: "circle", radius: 0.24 });

// South-west Ruins: broken walls and stones shape two ways through the zone.
wallRun(-62, -57, 0, 4, 2.05, "ruin-west-wall");
wallRun(-62, -57, Math.PI / 2, 3, 2.05, "ruin-south-wall");
wallRun(-52, -57, 0, 3, 2.05, "ruin-east-wall");
add("stone_tallD", -56, -47, 0.6, 2.8, { type: "circle", radius: 0.4 });
add("stone_largeC", -51.3, -51.8, 1.2, 2.5, { type: "circle", radius: 0.46 });
add("rock-large", -44, -54, 2.1, 2, { type: "circle", radius: 0.42 });
add("rock-small", -44.5, -40, 0.3, 1.6, { type: "circle", radius: 0.36 });
// This low wall block is a real collider and is short enough to clear with Jump.
add(
  "wall-block",
  -49,
  -41.5,
  0.2,
  0.55,
  { type: "box", width: 0.9, depth: 0.56 },
  "jumpable-ruin-step",
);
add("lantern", -42.4, -47, 0, 2.2, { type: "circle", radius: 0.24 });

// South-east Sun Garden: the warm open route carries the Slow Down field.
for (const [model, x, z, scale] of [
  ["tree_palmDetailedTall", 40, -39, 3.5],
  ["tree_palmBend", 57, -40, 3.4],
  ["tree_palmDetailedShort", 59, -55, 3.3],
  ["tree_palmDetailedTall", 43, -59, 3.5],
] as const)
  add(model, x, z, (x - z) * 0.13, scale, PALM_TRUNK);
add("rock-large", 51, -51, 1.1, 1.9, { type: "circle", radius: 0.42 });
add("rock-wide", 38, -49, 2.3, 1.7, { type: "circle", radius: 0.48 });
add("lantern", 65, -47, 0.2, 2.2, { type: "circle", radius: 0.24 });

// A light perimeter rhythm makes the outer ring easy to read without closing the route.
for (const [index, angle] of [0, 45, 90, 135, 180, 225, 270, 315].entries()) {
  const radians = (angle * Math.PI) / 180;
  const radius = 82;
  const x = Math.cos(radians) * radius;
  const z = Math.sin(radians) * radius;
  const model = index % 2 === 0 ? "tree_palmDetailedTall" : "tree_palmBend";
  add(model, x, z, -radians, 3.2, PALM_TRUNK, `outer-palm-${index + 1}`);
}

const interactiveObjects: InteractiveMapObject[] = [
  {
    id: "speed-pad",
    kind: "speedPad",
    model: "",
    position: { x: -43, z: -1 },
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
    position: { x: 49, z: -46 },
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
    position: { x: -40, z: -43 },
    rotation: 0,
    scale: 1,
    y: 1.35,
    collision: { type: "circle", radius: 1.35 },
  },
  {
    id: "temporary-barrier",
    kind: "temporaryBarrier",
    model: "",
    position: { x: 4, z: 43 },
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

/** Authored R100 world: plaza, market, palm grove, ruins, sun garden, and outer loop. */
export const DEFAULT_MAP: MapDefinition = freezeTree({
  version: 1,
  schemaVersion: 1,
  id: "default",
  name: "Default",
  description:
    "An R100 island with a fountain plaza, west market, palm grove, old ruins, and a sun-warmed outer route.",
  arena: { radius: 100 },
  objects: props,
  interactiveObjects,
  decorations: [
    {
      id: "plaza-stonework",
      kind: "island",
      position: { x: 0, z: 0 },
      radius: 16,
      color: "#d5a45f",
      y: 0.062,
    },
    {
      id: "market-earth",
      kind: "island",
      position: { x: -52, z: 0 },
      radius: 19,
      color: "#d2914b",
      y: 0.063,
    },
    {
      id: "palm-grove-ground",
      kind: "island",
      position: { x: 46, z: 47 },
      radius: 21,
      color: "#9cb36a",
      y: 0.064,
    },
    {
      id: "ruin-ground",
      kind: "island",
      position: { x: -48, z: -47 },
      radius: 22,
      color: "#aa987d",
      y: 0.065,
    },
    {
      id: "sun-garden-ground",
      kind: "island",
      position: { x: 50, z: -47 },
      radius: 22,
      color: "#e3b76b",
      y: 0.066,
    },
    {
      id: "north-route-wear",
      kind: "island",
      position: { x: 0, z: 38 },
      radius: 9,
      color: "#ddb56d",
      y: 0.061,
    },
    {
      id: "east-route-wear",
      kind: "island",
      position: { x: 42, z: 0 },
      radius: 8,
      color: "#dfb56b",
      y: 0.061,
    },
  ],
});

export function cloneMap(map: MapDefinition): MapDefinition {
  const copy = structuredClone(map);
  delete copy.playerSpawn;
  delete copy.runnerSpawns;
  return copy;
}
