// Sprout! Tiny Tag Arena — world configuration.
// Single source of truth for arena scale, prop placement and obstacle volumes
// so the visual language can be reproduced in another engine later.

export const ARENA = {
  radius: 30,
  rimHeight: 1.15,
  rimThickness: 1.1,
  grassRing: 3.4,
};

export const SCALE = {
  character: 1.0, // character height ~1.75 world units
  prop: 1.0,
};

export type PropDef = {
  m: string;
  p: [number, number];
  r?: number;
  s?: number;
  y?: number;
};

export type Obstacle = { x: number; z: number; r: number };

const props: PropDef[] = [];
const obstacles: Obstacle[] = [];

function add(m: string, x: number, z: number, r = 0, s = 1, y = 0) {
  props.push({ m, p: [x, z], r, s, y });
}

function block(x: number, z: number, r: number) {
  obstacles.push({ x, z, r });
}

/** A run of stone blocks forming a low tactical wall. */
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
    add(model, px, pz, -angle, scale);
    block(px, pz, scale * 0.62);
  }
}

function hedgeRun(x: number, z: number, angle: number, count: number, scale = 1.7) {
  const step = scale * 0.96;
  for (let i = 0; i < count; i++) {
    const px = x + Math.cos(angle) * step * i;
    const pz = z + Math.sin(angle) * step * i;
    add("hedge-large", px, pz, -angle, scale);
    block(px, pz, scale * 0.5);
  }
}

/** Decorative garden cluster: bushes + flowers + grass tufts. */
function garden(x: number, z: number, spread = 2.2, seed = 1) {
  const rnd = mulberry(seed);
  const bushes = ["plant_bushDetailed", "plant_bushLarge", "plant_bush"];
  const flowers = ["flower_redA", "flower_purpleB", "flower_yellowA"];
  for (let i = 0; i < 3; i++) {
    add(
      bushes[Math.floor(rnd() * bushes.length)],
      x + (rnd() - 0.5) * spread,
      z + (rnd() - 0.5) * spread,
      rnd() * 6.28,
      2.6 + rnd() * 1.2,
    );
  }
  for (let i = 0; i < 3; i++) {
    add(
      flowers[Math.floor(rnd() * flowers.length)],
      x + (rnd() - 0.5) * spread * 1.4,
      z + (rnd() - 0.5) * spread * 1.4,
      rnd() * 6.28,
      2.4 + rnd(),
    );
  }
  add("grass_large", x + (rnd() - 0.5) * spread, z + (rnd() - 0.5) * spread, rnd() * 6.28, 2.6);
  block(x, z, spread * 0.55);
}

function mulberry(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- composition
// Asymmetric layout: open running plain in the south-west, a fountain loop in
// the middle, a choke point east, a risk zone north and a shortcut lane.

// Central fountain island (LOOP)
add("fountain-round-detail", 2, -1, 0, 3.1);
add("fountain-round", 2, -1, 0, 3.1);
add("statue_obelisk", 2, -1, 0, 2.1, 1.35);
block(2, -1, 4.0);
garden(6.4, -4.2, 2.6, 11);
garden(-2.2, 2.6, 2.4, 12);
add("lantern", 6.6, 1.8, 0, 2.2);
add("lantern", -2.6, -4.4, 0, 2.2);

// CHOKE POINT — two wall stubs east of the fountain
wallRun(11.5, -7.5, Math.PI / 2, 4);
wallRun(11.5, 3.4, Math.PI / 2, 3);
add("lantern", 13.4, -1.6, 0, 2.2);

// LOOP wall north-west
wallRun(-14, -9, 0, 5);
wallRun(-14, -9, Math.PI / 2, 3);
garden(-9.5, -12.5, 2.6, 21);

// RISK ZONE fence north
hedgeRun(-6, -17.5, 0, 6);
add("banner-red", -7.4, -17.6, 0, 2.6);
add("banner-red", 4.6, -17.6, Math.PI, 2.6);

// SHORTCUT lane south-east, framed by crates and barrels
add("crate", 15.5, 9.5, 0.3, 1.5);
add("crate", 16.8, 10.6, -0.4, 1.5);
add("crate-bottles", 15.2, 11.4, 0.9, 1.5);
block(15.9, 10.4, 2.0);
add("barrel", 12.2, 13.4, 0, 1.3);
add("barrel", 13.4, 14.1, 0.6, 1.3);
block(12.8, 13.7, 1.4);
add("cart", 8.6, 12.4, 2.1, 2.0);
block(8.6, 12.4, 1.2);
add("lantern", 11.0, 9.0, 0, 2.2);

// OPEN ZONE south-west stays clear — only ground detail
add("grass_leafsLarge", -12, 8, 0.4, 3);
add("grass_leafsLarge", -17, 12, 1.4, 3);
add("grass_large", -8.5, 14.5, 2.4, 3);
add("stone_largeC", -19.5, 4.5, 0.6, 2.2);
add("stone_smallB", -16.8, 6.2, 1.2, 2.4);

// Rocky accents and stone spines
add("rock-large", 20.5, -10.5, 0.7, 2.1);
add("rock-wide", 19.0, -13.2, 2.2, 1.8);
add("rock-small", 22.2, -7.6, 1.1, 1.7);
block(20.3, -10.6, 2.2);
add("stone_tallD", -21.5, -13.5, 0.4, 2.6);
add("stone_largeC", -19.2, -15.6, 1.9, 2.4);
block(-20.4, -14.5, 2.0);

// Palms + trees around the rim for silhouette depth
const palmSpots: [number, number, string, number][] = [
  [-24, 9, "tree_palmDetailedTall", 3.4],
  [-21, 17, "tree_palmBend", 3.1],
  [-4, 24, "tree_palmDetailedTall", 3.2],
  [9, 22, "tree_palmDetailedShort", 3.0],
  [21, 14, "tree_palmBend", 3.3],
  [25, -3, "tree_palmDetailedTall", 3.4],
  [17, -20, "tree_palmDetailedShort", 3.0],
  [-2, -25, "tree_palmDetailedTall", 3.2],
  [-16, -21, "tree_palmBend", 3.1],
  [-26, -4, "tree_palmDetailedTall", 3.3],
];
for (const [x, z, m, s] of palmSpots) {
  add(m, x, z, (x + z) * 0.3, s);
  block(x, z, 1.2);
}

// Rim greenery pockets
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2 + 0.31;
  const r = ARENA.radius - 2.4;
  garden(Math.cos(a) * r, Math.sin(a) * r, 2.6, 100 + i);
}

// Flag poles on the rim
add("flag-high-pennant", -6, -27.4, 0.4, 1.4);
add("flag-high-pennant", 14, -24.2, -0.9, 1.4);

export const PROPS: PropDef[] = props;
export const OBSTACLES: Obstacle[] = obstacles;

export const PROP_MODELS = Array.from(new Set(PROPS.map((p) => p.m)));

// -------------------------------------------------------------- interactives
export type Trap = {
  kind: "spike" | "slow" | "speed" | "portal" | "mystery";
  x: number;
  z: number;
  rot?: number;
};

export const TRAPS: Trap[] = [
  { kind: "spike", x: -1.5, z: -13.5 },
  { kind: "spike", x: 4.5, z: -14.8 },
  { kind: "slow", x: -13.5, z: 2.5 },
  { kind: "speed", x: 9.5, z: 7.5, rot: -0.7 },
  { kind: "speed", x: -18, z: -6, rot: 1.9 },
  { kind: "portal", x: 20, z: 4.5 },
  { kind: "mystery", x: -9, z: 18 },
];

export type PowerUp = { kind: "boost" | "key" | "energy" | "warp"; x: number; z: number };

export const POWERUPS: PowerUp[] = [
  { kind: "boost", x: -6.5, z: 8.5 },
  { kind: "key", x: 14.5, z: -12.5 },
  { kind: "energy", x: -16.5, z: -2.5 },
  { kind: "warp", x: 3.5, z: 16.5 },
];
