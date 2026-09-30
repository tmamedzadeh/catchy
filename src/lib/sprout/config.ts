/** Shared world, collision, and movement settings for Catchy. */
export const GAME_CONFIG = {
  arenaRadius: 30,
  player: {
    radius: 0.55,
    speed: 9.2,
    spawn: { x: -4, z: 12 },
    dash: {
      durationSeconds: 0.18,
      distance: 4.2,
      cooldownSeconds: 2.5,
      cameraImpulseSeconds: 0.34,
      cameraFovIncrease: 5,
      trailSeconds: 0.22,
      hapticMs: 18,
    },
  },
  npc: {
    radius: 0.48,
    speed: 8.2,
    respawnDelay: 0.7,
    minSpawnDistanceFromPlayer: 8,
    spawnSeparation: 1.8,
    navigation: {
      gridSpacing: 1.9,
      routeRecheck: 0.62,
      stuckRecheck: 0.32,
      stuckMovementThreshold: 0.025,
      stuckSpeedThreshold: 1.2,
    },
    spawns: [
      { x: -13, z: -2 },
      { x: 9, z: -12 },
      { x: 17, z: 6 },
    ],
  },
  captureDistance: 2,
  nearbyDistance: 9,
  targetSwitchRatio: 0.78,
  capturePresentation: {
    captureSeconds: 0.43,
    afterSeconds: 0.31,
  },
  roundSeconds: 5 * 60,
  obstacleMargin: 0.12,
} as const;

export const ARENA = {
  radius: GAME_CONFIG.arenaRadius,
  rimHeight: 1.15,
  rimThickness: 1.1,
  grassRing: 3.4,
};

export const SCALE = {
  character: 1,
  prop: 1,
};

export type CollisionShape =
  { type: "box"; width: number; depth: number } | { type: "circle"; radius: number };

/** A single map descriptor drives both GLB placement and its collider. */
export type MapObject = {
  model: string;
  position: { x: number; z: number };
  rotation: number;
  scale: number;
  y: number;
  collision: CollisionShape;
};

export type Obstacle = MapObject;

const objects: MapObject[] = [];

function add(
  model: string,
  x: number,
  z: number,
  rotation: number,
  scale: number,
  y: number,
  collision: CollisionShape,
) {
  const object: MapObject = { model, position: { x, z }, rotation, scale, y, collision };
  objects.push(object);
}

const STONE_WALL: CollisionShape = { type: "box", width: 0.98, depth: 0.52 };
const HEDGE_WALL: CollisionShape = { type: "box", width: 1, depth: 0.68 };

/** A run of low stone blocks. Rotation is shared by the mesh and collider. */
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

function hedgeRun(x: number, z: number, angle: number, count: number, scale = 1.7) {
  const step = scale * 0.96;
  for (let i = 0; i < count; i++) {
    const px = x + Math.cos(angle) * step * i;
    const pz = z + Math.sin(angle) * step * i;
    add("hedge-large", px, pz, -angle, scale, 0, HEDGE_WALL);
  }
}

/** Decorative clusters keep collision volumes attached to the actual bushes. */
function garden(x: number, z: number, spread = 2.2, seed = 1) {
  const rnd = mulberry(seed);
  const bushes = ["plant_bushDetailed", "plant_bushLarge", "plant_bush"];
  for (let i = 0; i < 3; i++) {
    const scale = 2.6 + rnd() * 1.2;
    add(
      bushes[Math.floor(rnd() * bushes.length)]!,
      x + (rnd() - 0.5) * spread,
      z + (rnd() - 0.5) * spread,
      rnd() * 6.28,
      scale,
      0,
      { type: "circle", radius: 0.22 },
    );
  }
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

// Asymmetric layout: open running plain, fountain loop, eastern choke point,
// northern risk zone, and a short southern shortcut.
add("fountain-round", 2, -1, 0, 3.1, 0, { type: "circle", radius: 1.3 });
garden(6.4, -4.2, 2.6, 11);
garden(-2.2, 2.6, 2.4, 12);
garden(-7.2, 7.2, 2, 13);
add("lantern", 6.6, 1.8, 0, 2.2, 0, { type: "circle", radius: 0.24 });
add("lantern", -2.6, -4.4, 0, 2.2, 0, { type: "circle", radius: 0.24 });

// CHOKE POINT — two wall stubs east of the fountain.
wallRun(11.5, -7.5, Math.PI / 2, 4);
wallRun(11.5, 3.4, Math.PI / 2, 3);
add("lantern", 13.4, -1.6, 0, 2.2, 0, { type: "circle", radius: 0.24 });
garden(15.8, 3.7, 2, 31);

// Loop wall north-west.
wallRun(-14, -9, 0, 5);
wallRun(-14, -9, Math.PI / 2, 3);
garden(-9.5, -12.5, 2.6, 21);
add("crate", -10.4, -5.3, 0.5, 1.35, 0, { type: "box", width: 0.72, depth: 0.72 });
add("barrel", -8.9, -5.9, -0.2, 1.15, 0, { type: "circle", radius: 0.38 });

// RISK ZONE fence north.
hedgeRun(-6, -17.5, 0, 6);

// SHORTCUT lane south-east, framed by crates and barrels.
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

// Rim greenery pockets remain passable between their individual bushes.
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2 + 0.31;
  const r = GAME_CONFIG.arenaRadius - 2.4;
  garden(Math.cos(a) * r, Math.sin(a) * r, 2.6, 100 + i);
}

export const PROPS: MapObject[] = objects;
export const OBSTACLES: Obstacle[] = objects;
export const PROP_MODELS = Array.from(new Set(PROPS.map((object) => object.model)));
