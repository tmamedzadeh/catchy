/** Shared world, collision, and movement settings for Catchy. */
export const GAME_CONFIG = {
  arenaRadius: 30,
  simulation: {
    tickHz: 60,
    maxCatchUpSteps: 6,
  },
  player: {
    radius: 0.55,
    speed: 9.2,
    facingRotationSpeed: 18,
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
    speedBoost: {
      durationSeconds: 5,
      cooldownSeconds: 30,
      multiplier: 1.5,
      hapticMs: 16,
    },
    jump: {
      durationSeconds: 0.48,
      height: 2.05,
      groundedSeconds: 0.12,
    },
    slide: {
      durationSeconds: 0.7,
      movementMultiplier: 1.18,
      bodyHeightMultiplier: 0.62,
      bodyLowering: 0.16,
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
  slowZone: {
    movementMultiplier: 0.55,
    recoverySeconds: 0.38,
  },
  elasticBounce: {
    releaseDistance: 0.14,
    playerSpeedMultiplier: 2.2,
  },
  barrier: {
    openSeconds: 5,
    closedSeconds: 5,
  },
  camera: {
    distance: 22,
    angle: 24,
    lookAhead: 5,
    compositionOffset: 0.15,
    tuningRanges: {
      distance: { min: 14, max: 32, step: 0.5 },
      angle: { min: 10, max: 75, step: 1 },
      lookAhead: { min: 0, max: 5, step: 0.1 },
      compositionOffset: { min: -0.2, max: 0.25, step: 0.01 },
    },
    yawSpeed: 2.25,
    turnAnticipationPerRadianPerSecond: 0.045,
    turnAnticipationMaxRadians: 0.16,
  },
  interactiveObjects: {
    speedPad: {
      x: -16,
      z: 12,
      rotation: -0.45,
      scale: 1,
      triggerRadius: 2.15,
      pulseSeconds: 0.42,
    },
    slowZone: { x: 5, z: -20, rotation: 0, scale: 1, triggerRadius: 3.3 },
    elasticBounce: { x: -19, z: 3, rotation: 0, scale: 1, collisionRadius: 1.35 },
    temporaryBarrier: {
      x: 11.5,
      z: 0.8,
      rotation: 0,
      scale: 1,
      width: 0.78,
      depth: 4.25,
      height: 1.55,
    },
  },
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
};

export const SCALE = {
  character: 1,
  prop: 1,
};

export type CollisionShape =
  { type: "box"; width: number; depth: number } | { type: "circle"; radius: number };

/** A single map descriptor drives both GLB placement and its collider. */
export type MapObject = {
  id?: string;
  kind?: "prop" | "speedPad" | "slowZone" | "elasticBounce" | "temporaryBarrier";
  model: string;
  position: { x: number; z: number };
  rotation: number;
  scale: number;
  y: number;
  collision: CollisionShape;
};

export type InteractiveMapObject = MapObject & {
  id: string;
  kind: "speedPad" | "slowZone" | "elasticBounce" | "temporaryBarrier";
  model: "";
  triggerRadius?: number;
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
  const object: MapObject = {
    kind: "prop",
    model,
    position: { x, z },
    rotation,
    scale,
    y,
    collision,
  };
  objects.push(object);
}

const STONE_WALL: CollisionShape = { type: "box", width: 0.98, depth: 0.52 };

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

// Asymmetric layout: open running plain, fountain loop, eastern choke point,
// and a short southern shortcut.
add("fountain-round", 2, -1, 0, 3.1, 0, { type: "circle", radius: 1.3 });
add("lantern", 6.6, 1.8, 0, 2.2, 0, { type: "circle", radius: 0.24 });
add("lantern", -2.6, -4.4, 0, 2.2, 0, { type: "circle", radius: 0.24 });

// CHOKE POINT — two wall stubs east of the fountain.
wallRun(11.5, -7.5, Math.PI / 2, 4);
wallRun(11.5, 3.4, Math.PI / 2, 3);
add("lantern", 13.4, -1.6, 0, 2.2, 0, { type: "circle", radius: 0.24 });

// Loop wall north-west.
wallRun(-14, -9, 0, 5);
wallRun(-14, -9, Math.PI / 2, 3);
add("crate", -10.4, -5.3, 0.5, 1.35, 0, { type: "box", width: 0.72, depth: 0.72 });
add("barrel", -8.9, -5.9, -0.2, 1.15, 0, { type: "circle", radius: 0.38 });

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

export const PROPS: MapObject[] = objects;
export const OBSTACLES: Obstacle[] = objects;
export const PROP_MODELS = Array.from(new Set(PROPS.map((object) => object.model)));

/** Interactive world descriptors share the same position, transform and collision data model as props. */
export const INTERACTIVE_OBJECTS: InteractiveMapObject[] = [
  {
    id: "speed-pad",
    kind: "speedPad",
    model: "",
    position: {
      x: GAME_CONFIG.interactiveObjects.speedPad.x,
      z: GAME_CONFIG.interactiveObjects.speedPad.z,
    },
    rotation: GAME_CONFIG.interactiveObjects.speedPad.rotation,
    scale: GAME_CONFIG.interactiveObjects.speedPad.scale,
    y: 0.035,
    collision: { type: "circle", radius: GAME_CONFIG.interactiveObjects.speedPad.triggerRadius },
    triggerRadius: GAME_CONFIG.interactiveObjects.speedPad.triggerRadius,
  },
  {
    id: "slow-zone",
    kind: "slowZone",
    model: "",
    position: {
      x: GAME_CONFIG.interactiveObjects.slowZone.x,
      z: GAME_CONFIG.interactiveObjects.slowZone.z,
    },
    rotation: GAME_CONFIG.interactiveObjects.slowZone.rotation,
    scale: GAME_CONFIG.interactiveObjects.slowZone.scale,
    y: 0.018,
    collision: { type: "circle", radius: GAME_CONFIG.interactiveObjects.slowZone.triggerRadius },
    triggerRadius: GAME_CONFIG.interactiveObjects.slowZone.triggerRadius,
  },
  {
    id: "elastic-bounce",
    kind: "elasticBounce",
    model: "",
    position: {
      x: GAME_CONFIG.interactiveObjects.elasticBounce.x,
      z: GAME_CONFIG.interactiveObjects.elasticBounce.z,
    },
    rotation: GAME_CONFIG.interactiveObjects.elasticBounce.rotation,
    scale: GAME_CONFIG.interactiveObjects.elasticBounce.scale,
    y:
      GAME_CONFIG.interactiveObjects.elasticBounce.collisionRadius *
      GAME_CONFIG.interactiveObjects.elasticBounce.scale,
    collision: {
      type: "circle",
      radius: GAME_CONFIG.interactiveObjects.elasticBounce.collisionRadius,
    },
  },
  {
    id: "temporary-barrier",
    kind: "temporaryBarrier",
    model: "",
    position: {
      x: GAME_CONFIG.interactiveObjects.temporaryBarrier.x,
      z: GAME_CONFIG.interactiveObjects.temporaryBarrier.z,
    },
    rotation: GAME_CONFIG.interactiveObjects.temporaryBarrier.rotation,
    scale: GAME_CONFIG.interactiveObjects.temporaryBarrier.scale,
    y: 0,
    collision: {
      type: "box",
      width: GAME_CONFIG.interactiveObjects.temporaryBarrier.width,
      depth: GAME_CONFIG.interactiveObjects.temporaryBarrier.depth,
    },
  },
];

export const WORLD_OBJECTS: MapObject[] = [...PROPS, ...INTERACTIVE_OBJECTS];
