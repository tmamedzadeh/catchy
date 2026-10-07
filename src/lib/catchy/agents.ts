// Mutable simulation state. Nothing here is stored in React at frame rate.
import { GAME_CONFIG } from "./config";
import { getActiveMap, setActiveMap } from "./maps";
import { getAssetHeight } from "./maps/catalog";
import type { InteractiveMapObject, MapDefinition, MapObject } from "./maps/types";
import { getCameraBasis, NEUTRAL_CAMERA_INPUT, type CameraBasis, type CameraInput } from "./camera";

export type Agent = {
  id: string;
  role: "player" | "runner";
  state: "player" | "flee" | "respawning";
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  phase: number;
  /** Positive while this runner is unavailable and hidden before respawn. */
  hidden: number;
  stuckTime: number;
  routeTimer: number;
  routeInterval: number;
  routePhaseOffset: number;
  routeDecisionCount: number;
  routeSeed: number;
  routeX: number;
  routeZ: number;
  routeGoalX: number;
  routeGoalZ: number;
  routeFirstStep: number;
  route: number[];
  routeIndex: number;
  lastX: number;
  lastZ: number;
  respawns: number;
  radius: number;
  dashState: DashState;
  dashCooldownRemaining: number;
  dashDurationRemaining: number;
  dashBounceMultiplier: number;
  dashDirectionX: number;
  dashDirectionZ: number;
  dashActivationId: number;
  dashStartX: number;
  dashStartZ: number;
  dashCameraRemaining: number;
  /** Fixed-step arcade jump; it changes only the rendered height, never XZ collision. */
  jumpElapsed: number;
  jumpHeight: number;
  previousJumpHeight: number;
  jumpActivationId: number;
  /** Shared movement effect, regardless of whether the player or a pad granted it. */
  boostEffectRemaining: number;
  /** Player button state has its own timer, independent from pad grants. */
  playerBoostActiveRemaining: number;
  playerBoostCooldownRemaining: number;
  slowMultiplier: number;
  onSpeedPad: boolean;
  onSlowZone: boolean;
  onElasticBounce: boolean;
  turnRate: number;
  previousX: number;
  previousZ: number;
  previousHeading: number;
};

export type DashState = "ready" | "active" | "cooldown";
export type BoostState = "ready" | "active" | "cooldown";
type Obstacle = MapObject;

function positionsForMap() {
  return [
    { id: "player", role: "player" as const, x: 0, z: 0, heading: -1.2, phase: 0 },
    {
      id: "pink",
      role: "runner" as const,
      x: 0,
      z: 0,
      heading: 1,
      phase: 1.3,
    },
    {
      id: "purple",
      role: "runner" as const,
      x: 0,
      z: 0,
      heading: 2,
      phase: 2.6,
    },
    {
      id: "orange",
      role: "runner" as const,
      x: 0,
      z: 0,
      heading: -2,
      phase: 4.1,
    },
    {
      id: "green",
      role: "runner" as const,
      x: 0,
      z: 0,
      heading: 0.6,
      phase: 5.2,
    },
    {
      id: "yellow",
      role: "runner" as const,
      x: 0,
      z: 0,
      heading: -0.7,
      phase: 0.8,
    },
  ];
}

let activeWorld = getActiveMap();
const initialPositions = positionsForMap();
let OBSTACLES: Obstacle[] = activeWorld.objects;
let INTERACTIVE_OBJECTS: InteractiveMapObject[] = activeWorld.interactiveObjects;

function makeAgent(index: number): Agent {
  const initial = initialPositions[index]!;
  const radius = initial.role === "player" ? GAME_CONFIG.player.radius : GAME_CONFIG.npc.radius;
  const navigation = GAME_CONFIG.npc.navigation;
  const runnerSlot = initial.role === "runner" ? index - 1 : 0;
  const runnerCount = initialPositions.length - 1;
  const runnerRatio = runnerCount > 1 ? runnerSlot / (runnerCount - 1) : 0;
  const routePhaseOffset = navigation.replanPhaseSpreadSeconds * runnerRatio;
  return {
    ...initial,
    state: initial.role === "player" ? "player" : "flee",
    x: initial.x,
    z: initial.z,
    vx: 0,
    vz: 0,
    speed: 0,
    hidden: 0,
    stuckTime: 0,
    routeTimer: initial.role === "runner" ? routePhaseOffset : 0,
    routeInterval:
      navigation.replanIntervalMin +
      (navigation.replanIntervalMax - navigation.replanIntervalMin) * runnerRatio,
    routePhaseOffset,
    routeDecisionCount: 0,
    routeSeed: (runnerSlot + 1) * 2.399963229728653,
    routeX: 0,
    routeZ: 0,
    routeGoalX: initial.x,
    routeGoalZ: initial.z,
    routeFirstStep: -1,
    route: [],
    routeIndex: 0,
    lastX: initial.x,
    lastZ: initial.z,
    respawns: 0,
    radius,
    dashState: "ready",
    dashCooldownRemaining: 0,
    dashDurationRemaining: 0,
    dashBounceMultiplier: 1,
    dashDirectionX: 0,
    dashDirectionZ: 1,
    dashActivationId: 0,
    dashStartX: initial.x,
    dashStartZ: initial.z,
    dashCameraRemaining: 0,
    jumpElapsed: 0,
    jumpHeight: 0,
    previousJumpHeight: 0,
    jumpActivationId: 0,
    boostEffectRemaining: 0,
    playerBoostActiveRemaining: 0,
    playerBoostCooldownRemaining: 0,
    slowMultiplier: 1,
    onSpeedPad: false,
    onSlowZone: false,
    onElasticBounce: false,
    turnRate: 0,
    previousX: initial.x,
    previousZ: initial.z,
    previousHeading: initial.heading,
  };
}

export const AGENTS: Agent[] = initialPositions.map((_, index) => makeAgent(index));
export const PLAYER = AGENTS[0]!;
export const RUNNERS = AGENTS.slice(1);

export function installMapForSimulation(map: MapDefinition) {
  activeWorld = setActiveMap(map);
  OBSTACLES = activeWorld.objects;
  obstacleIndex = buildObstacleIndex(OBSTACLES);
  INTERACTIVE_OBJECTS = activeWorld.interactiveObjects;
  SPEED_PAD = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
  SLOW_ZONE = INTERACTIVE_OBJECTS.find((item) => item.kind === "slowZone")!;
  ELASTIC_BOUNCE = INTERACTIVE_OBJECTS.find((item) => item.kind === "elasticBounce")!;
  TEMPORARY_BARRIER = INTERACTIVE_OBJECTS.find((item) => item.kind === "temporaryBarrier")!;
  WORLD_STATE.barrierClosed = false;
  delete navigationGraphCache.open;
  delete navigationGraphCache.closed;
  rebuildNavigationGraph();
  resetSimulation();
}

export function getSimulationMap() {
  return activeWorld;
}

/** Normalized flee and boundary bands scale with arena radius, including small maps. */
export function getArenaNavigationTuning(radius = activeWorld.arena.radius) {
  const navigation = GAME_CONFIG.npc.navigation;
  const arenaScale = radius / 30;
  return {
    minFleeDistance: navigation.minFleeDistance * arenaScale,
    preferredFleeDistance: navigation.preferredFleeDistance * arenaScale,
    maxFleeDistance: navigation.maxFleeDistance * arenaScale,
    preferredRunnerRadius: navigation.preferredRunnerRadius * arenaScale,
    boundarySteeringStartRadius: navigation.boundarySteeringStartRadius * arenaScale,
    boundarySteeringFullRadius: navigation.boundarySteeringFullRadius * arenaScale,
  };
}

export type InteractionKind = "speedPad" | "slowZone" | "elasticBounce" | "dash";

let SPEED_PAD = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
let SLOW_ZONE = INTERACTIVE_OBJECTS.find((item) => item.kind === "slowZone")!;
let ELASTIC_BOUNCE = INTERACTIVE_OBJECTS.find((item) => item.kind === "elasticBounce")!;
let TEMPORARY_BARRIER = INTERACTIVE_OBJECTS.find((item) => item.kind === "temporaryBarrier")!;

export const WORLD_STATE = {
  cameraYaw: PLAYER.heading,
  previousCameraYaw: PLAYER.heading,
  cameraPitch: 0,
  /** Movement-only grace before heading follow resumes; frozen while the player is still. */
  cameraManualRemaining: 0,
  /** Distance is mutable simulation state so pinch never needs React renders. */
  cameraDistance: Number(GAME_CONFIG.camera.distance),
  cameraFollowYawSpeed: Number(GAME_CONFIG.camera.followYawSpeed),
  cameraTurnAnticipation: Number(GAME_CONFIG.camera.turnAnticipation),
  cameraFollowResumeSpeed: Number(GAME_CONFIG.camera.followResumeSpeed),
  cameraFollowBlend: 1,
  barrierClosed: false,
  barrierRemaining: GAME_CONFIG.barrier.openSeconds,
  speedPadPulseRemaining: 0,
  boostCueId: 0,
  interactionCueId: 0,
  interactionCueKind: null as InteractionKind | null,
  interactionCueX: 0,
  interactionCueZ: 0,
  bounceImpactId: 0,
  bounceNormalX: 0,
  bounceNormalZ: 1,
  renderAlpha: 0,
};

function emitInteractionCue(kind: InteractionKind, normalX = 0, normalZ = 1) {
  WORLD_STATE.interactionCueId++;
  WORLD_STATE.interactionCueKind = kind;
  WORLD_STATE.interactionCueX = PLAYER.x;
  WORLD_STATE.interactionCueZ = PLAYER.z;
  if (kind === "elasticBounce") {
    WORLD_STATE.bounceImpactId++;
    WORLD_STATE.bounceNormalX = normalX;
    WORLD_STATE.bounceNormalZ = normalZ;
  }
}

export function effectiveSpeedMultiplier(agent: Agent) {
  return (
    (agent.boostEffectRemaining > 0 ? GAME_CONFIG.player.speedBoost.multiplier : 1) *
    agent.slowMultiplier
  );
}

export function getPlayerBoostState(): BoostState {
  if (PLAYER.playerBoostActiveRemaining > 0) return "active";
  if (PLAYER.playerBoostCooldownRemaining > 0) return "cooldown";
  return "ready";
}

export function canActivatePlayerBoost() {
  return getPlayerBoostState() === "ready" && PLAYER.boostEffectRemaining <= 0;
}

export function clearPlayerJump() {
  PLAYER.jumpElapsed = 0;
  PLAYER.jumpHeight = 0;
  PLAYER.previousJumpHeight = 0;
}

/** Start one buffered jump if the player is grounded. */
export function startPlayerJump() {
  if (PLAYER.jumpElapsed > 0) return false;
  PLAYER.jumpElapsed = Number.EPSILON;
  PLAYER.jumpHeight = 0;
  PLAYER.previousJumpHeight = 0;
  PLAYER.jumpActivationId++;
  return true;
}

function advancePlayerJump(dt: number) {
  if (PLAYER.jumpElapsed <= 0) {
    PLAYER.jumpHeight = 0;
    return;
  }
  const jump = GAME_CONFIG.player.jump;
  PLAYER.jumpElapsed = Math.min(jump.durationSeconds, PLAYER.jumpElapsed + dt);
  if (PLAYER.jumpElapsed >= jump.durationSeconds) {
    clearPlayerJump();
    return;
  }
  const progress = PLAYER.jumpElapsed / jump.durationSeconds;
  PLAYER.jumpHeight = jump.height * Math.sin(Math.PI * progress);
}

/** V1 boost sources share one effect timer and never stack or extend it. */
export function applyBoostEffect(agent: Agent) {
  if (agent.boostEffectRemaining > 0) return false;
  agent.boostEffectRemaining = GAME_CONFIG.player.speedBoost.durationSeconds;
  return true;
}

/** Personal Speed Up starts its own cooldown at activation; pads never touch that timer. */
export function activatePlayerBoost() {
  if (!canActivatePlayerBoost() || !applyBoostEffect(PLAYER)) return false;
  PLAYER.playerBoostActiveRemaining = GAME_CONFIG.player.speedBoost.durationSeconds;
  PLAYER.playerBoostCooldownRemaining = GAME_CONFIG.player.speedBoost.cooldownSeconds;
  WORLD_STATE.boostCueId++;
  return true;
}

export function cancelPlayerActions(resetCooldown = false) {
  clearPlayerJump();
  if (PLAYER.dashState === "active") cancelPlayerDash();
  if (resetCooldown) {
    resetPlayerDash();
    PLAYER.boostEffectRemaining = 0;
    PLAYER.playerBoostActiveRemaining = 0;
    PLAYER.playerBoostCooldownRemaining = 0;
  }
}

/** Begin the player's short burst; the caller enforces the current game phase. */
export function startPlayerDash(direction: { x: number; z: number }) {
  if (PLAYER.dashState !== "ready") return false;
  const length = Math.hypot(direction.x, direction.z);
  const inverseLength = length > 0.001 ? 1 / length : 0;
  const dash = GAME_CONFIG.player.dash;
  PLAYER.dashDirectionX = length > 0.001 ? direction.x * inverseLength : Math.sin(PLAYER.heading);
  PLAYER.dashDirectionZ = length > 0.001 ? direction.z * inverseLength : Math.cos(PLAYER.heading);
  PLAYER.heading = Math.atan2(PLAYER.dashDirectionX, PLAYER.dashDirectionZ);
  PLAYER.dashStartX = PLAYER.x;
  PLAYER.dashStartZ = PLAYER.z;
  PLAYER.dashDurationRemaining = dash.durationSeconds;
  PLAYER.dashBounceMultiplier = 1;
  PLAYER.dashCooldownRemaining = dash.cooldownSeconds;
  PLAYER.dashCameraRemaining = dash.cameraImpulseSeconds;
  PLAYER.dashState = "active";
  PLAYER.dashActivationId++;
  emitInteractionCue("dash");
  return true;
}

/** Cancel any active burst and optionally clear the full cooldown for a new round. */
export function resetPlayerDash(clearCooldown = true) {
  PLAYER.dashDurationRemaining = 0;
  PLAYER.dashBounceMultiplier = 1;
  PLAYER.dashCameraRemaining = 0;
  if (clearCooldown) PLAYER.dashCooldownRemaining = 0;
  PLAYER.dashState = PLAYER.dashCooldownRemaining > 0 ? "cooldown" : "ready";
}

export function cancelPlayerDash() {
  resetPlayerDash(false);
  const speed = Math.hypot(PLAYER.vx, PLAYER.vz);
  const maxSpeed = GAME_CONFIG.player.speed * effectiveSpeedMultiplier(PLAYER);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    PLAYER.vx *= scale;
    PLAYER.vz *= scale;
    PLAYER.speed = maxSpeed;
  }
}

const TAU = Math.PI * 2;
const WALL_MARGIN = GAME_CONFIG.obstacleMargin;
const COLLISION_EPSILON = 0.0001;
let spawnRandomSource = Math.random;
const NAV_SAMPLE_SPACING = 0.3;
const OBSTACLE_GRID_CELL_SIZE = 8;

type ColliderCache = {
  cos: number;
  sin: number;
  circleRadius: number;
  halfWidth: number;
  halfDepth: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type ObstacleIndex = {
  obstacles: Obstacle[];
  bounds: ColliderCache[];
  buckets: Map<string, number[]>;
  seen: Uint32Array;
  queryId: number;
};

type NavigationGraph = {
  nodes: NavNode[];
  grid: Int32Array;
  width: number;
  extent: number;
  spacing: number;
};

const colliderCache = new WeakMap<Obstacle, ColliderCache>();
let obstacleIndex: ObstacleIndex = buildObstacleIndex(OBSTACLES);
const obstacleCandidates: number[] = [];

function getColliderCache(obstacle: Obstacle): ColliderCache {
  let cached = colliderCache.get(obstacle);
  if (cached) return cached;

  const scale = scaleOf(obstacle);
  const shape = obstacle.collision;
  const cos = Math.cos(obstacle.rotation);
  const sin = Math.sin(obstacle.rotation);
  const circleRadius = shape.type === "circle" ? shape.radius * scale + WALL_MARGIN : 0;
  const halfWidth = shape.type === "box" ? (shape.width * scale) / 2 + WALL_MARGIN : 0;
  const halfDepth = shape.type === "box" ? (shape.depth * scale) / 2 + WALL_MARGIN : 0;
  const extentX =
    shape.type === "circle" ? circleRadius : Math.abs(cos) * halfWidth + Math.abs(sin) * halfDepth;
  const extentZ =
    shape.type === "circle" ? circleRadius : Math.abs(sin) * halfWidth + Math.abs(cos) * halfDepth;
  cached = {
    cos,
    sin,
    circleRadius,
    halfWidth,
    halfDepth,
    minX: obstacle.position.x - extentX,
    maxX: obstacle.position.x + extentX,
    minZ: obstacle.position.z - extentZ,
    maxZ: obstacle.position.z + extentZ,
  };
  colliderCache.set(obstacle, cached);
  return cached;
}

function obstacleCellKey(x: number, z: number) {
  return `${x},${z}`;
}

function buildObstacleIndex(obstacles: Obstacle[]): ObstacleIndex {
  const index: ObstacleIndex = {
    obstacles,
    bounds: obstacles.map(getColliderCache),
    buckets: new Map(),
    seen: new Uint32Array(obstacles.length),
    queryId: 0,
  };
  obstacles.forEach((_, obstacleId) => {
    const bounds = index.bounds[obstacleId]!;
    const minCellX = Math.floor(bounds.minX / OBSTACLE_GRID_CELL_SIZE);
    const maxCellX = Math.floor(bounds.maxX / OBSTACLE_GRID_CELL_SIZE);
    const minCellZ = Math.floor(bounds.minZ / OBSTACLE_GRID_CELL_SIZE);
    const maxCellZ = Math.floor(bounds.maxZ / OBSTACLE_GRID_CELL_SIZE);
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const key = obstacleCellKey(cellX, cellZ);
        const bucket = index.buckets.get(key);
        if (bucket) bucket.push(obstacleId);
        else index.buckets.set(key, [obstacleId]);
      }
    }
  });
  return index;
}

function queryObstacleIndex(minX: number, maxX: number, minZ: number, maxZ: number) {
  obstacleCandidates.length = 0;
  if (obstacleIndex.obstacles.length <= 8) {
    for (let i = 0; i < obstacleIndex.obstacles.length; i++) obstacleCandidates.push(i);
    return obstacleCandidates;
  }

  obstacleIndex.queryId = (obstacleIndex.queryId + 1) >>> 0;
  if (obstacleIndex.queryId === 0) {
    obstacleIndex.seen.fill(0);
    obstacleIndex.queryId = 1;
  }
  const queryId = obstacleIndex.queryId;
  const minCellX = Math.floor(minX / OBSTACLE_GRID_CELL_SIZE);
  const maxCellX = Math.floor(maxX / OBSTACLE_GRID_CELL_SIZE);
  const minCellZ = Math.floor(minZ / OBSTACLE_GRID_CELL_SIZE);
  const maxCellZ = Math.floor(maxZ / OBSTACLE_GRID_CELL_SIZE);
  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      const bucket = obstacleIndex.buckets.get(obstacleCellKey(cellX, cellZ));
      if (!bucket) continue;
      for (const obstacleId of bucket) {
        if (obstacleIndex.seen[obstacleId] === queryId) continue;
        obstacleIndex.seen[obstacleId] = queryId;
        const bounds = obstacleIndex.bounds[obstacleId]!;
        if (bounds.maxX < minX || bounds.minX > maxX || bounds.maxZ < minZ || bounds.minZ > maxZ)
          continue;
        obstacleCandidates.push(obstacleId);
      }
    }
  }
  obstacleCandidates.sort((a, b) => a - b);
  return obstacleCandidates;
}

function scaleOf(obstacle: Obstacle) {
  return Math.abs(obstacle.scale);
}

/** Test a body circle against the same transformed shape used by its GLB. */
export function overlapsObstacle(x: number, z: number, radius: number, obstacle: Obstacle) {
  const dx = x - obstacle.position.x;
  const dz = z - obstacle.position.z;
  const cached = getColliderCache(obstacle);
  const shape = obstacle.collision;
  if (shape.type === "circle") {
    return dx * dx + dz * dz < (cached.circleRadius + radius) ** 2;
  }

  const localX = dx * cached.cos + dz * cached.sin;
  const localZ = -dx * cached.sin + dz * cached.cos;
  const halfWidth = cached.halfWidth;
  const halfDepth = cached.halfDepth;
  const nearestX = Math.max(-halfWidth, Math.min(halfWidth, localX));
  const nearestZ = Math.max(-halfDepth, Math.min(halfDepth, localZ));
  const ex = localX - nearestX;
  const ez = localZ - nearestZ;
  if (ex * ex + ez * ez > 0.000001) return ex * ex + ez * ez < radius * radius;
  return Math.abs(localX) < halfWidth + radius && Math.abs(localZ) < halfDepth + radius;
}

type NavLink = { node: number; cost: number };
type NavNode = { x: number; z: number; links: NavLink[]; goalCandidate: boolean };

function isWalkablePointWithCandidates(
  x: number,
  z: number,
  radius: number,
  candidates: number[],
  barrierClosed = WORLD_STATE.barrierClosed,
) {
  if (Math.hypot(x, z) + radius > activeWorld.arena.radius - WALL_MARGIN) return false;
  for (const obstacleId of candidates) {
    const obstacle = OBSTACLES[obstacleId]!;
    if (overlapsObstacle(x, z, radius, obstacle)) return false;
  }
  if (overlapsObstacle(x, z, radius, ELASTIC_BOUNCE)) return false;
  if (barrierClosed && overlapsObstacle(x, z, radius, TEMPORARY_BARRIER)) return false;
  return true;
}

export function isWalkablePoint(
  x: number,
  z: number,
  radius: number,
  barrierClosed = WORLD_STATE.barrierClosed,
) {
  const candidates = queryObstacleIndex(x - radius, x + radius, z - radius, z + radius);
  return isWalkablePointWithCandidates(x, z, radius, candidates, barrierClosed);
}

/** Check waypoint links with the same body radius and obstacle colliders used by movement. */
export function isWalkableSegment(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  radius: number,
  barrierClosed = WORLD_STATE.barrierClosed,
) {
  const length = Math.hypot(x2 - x1, z2 - z1);
  const samples = Math.max(1, Math.ceil(length / NAV_SAMPLE_SPACING));
  const candidates = queryObstacleIndex(
    Math.min(x1, x2) - radius,
    Math.max(x1, x2) + radius,
    Math.min(z1, z2) - radius,
    Math.max(z1, z2) + radius,
  );
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    if (
      !isWalkablePointWithCandidates(
        x1 + (x2 - x1) * t,
        z1 + (z2 - z1) * t,
        radius,
        candidates,
        barrierClosed,
      )
    )
      return false;
  }
  return true;
}

/** Keep small maps precise, then coarsen the R100 grid modestly to bound route-search cost. */
function getNavigationGridSpacing(arenaRadius: number) {
  const navigation = GAME_CONFIG.npc.navigation;
  const normalizedLargeArena = Math.max(0, Math.min(1, (arenaRadius - 60) / 40));
  return navigation.gridSpacing * (1 + normalizedLargeArena * 0.2);
}

/** Static grid graph: its nodes and edges are admitted only when free under the live colliders. */
function buildNavigationGraph(barrierClosed: boolean): NavigationGraph {
  const spacing = getNavigationGridSpacing(activeWorld.arena.radius);
  const extent = Math.floor(
    (activeWorld.arena.radius - GAME_CONFIG.npc.radius - WALL_MARGIN) / spacing,
  );
  const width = extent * 2 + 1;
  const grid = new Int32Array(width * width);
  grid.fill(-1);
  const nodes: NavNode[] = [];

  for (let row = 0; row < width; row++) {
    const z = (row - extent) * spacing;
    for (let column = 0; column < width; column++) {
      const x = (column - extent) * spacing;
      if (!isWalkablePoint(x, z, GAME_CONFIG.npc.radius, barrierClosed)) continue;
      const node = nodes.length;
      grid[row * width + column] = node;
      nodes.push({
        x,
        z,
        links: [],
        // Keep full precision on small maps; a checkerboard sample bounds R60+ scoring work.
        goalCandidate: activeWorld.arena.radius < 60 || (row + column) % 2 === 0,
      });
    }
  }

  // Each undirected edge is considered once. Segment checks prevent diagonal corner cuts.
  const offsets = [
    [1, 0],
    [0, 1],
    [1, 1],
    [-1, 1],
  ] as const;
  for (let row = 0; row < width; row++) {
    for (let column = 0; column < width; column++) {
      const nodeId = grid[row * width + column]!;
      if (nodeId < 0) continue;
      const node = nodes[nodeId]!;
      for (const [dc, dr] of offsets) {
        const nextColumn = column + dc;
        const nextRow = row + dr;
        if (nextColumn < 0 || nextColumn >= width || nextRow < 0 || nextRow >= width) continue;
        const nextId = grid[nextRow * width + nextColumn]!;
        if (nextId < 0) continue;
        const next = nodes[nextId]!;
        if (
          !isWalkableSegment(node.x, node.z, next.x, next.z, GAME_CONFIG.npc.radius, barrierClosed)
        )
          continue;
        const cost = Math.hypot(next.x - node.x, next.z - node.z);
        node.links.push({ node: nextId, cost });
        next.links.push({ node: nodeId, cost });
      }
    }
  }

  return { nodes, grid, width, extent, spacing };
}

let NAV_NODES: NavNode[] = [];
let NAV_GRID: Int32Array<ArrayBufferLike> = new Int32Array(0);
let NAV_GRID_WIDTH = 0;
let NAV_GRID_EXTENT = 0;
let NAV_GRID_SPACING: number = GAME_CONFIG.npc.navigation.gridSpacing;
const navigationGraphCache: { open?: NavigationGraph; closed?: NavigationGraph } = {};
let navDistance = new Float64Array(0);
let navPrevious = new Int32Array(0);
let navFirstStep = new Int32Array(0);
let navVisited = new Uint8Array(0);
let navReversePath = new Int32Array(0);
let navHeapNodes = new Int32Array(0);
let navHeapCosts = new Float64Array(0);
let navRouteCrowding = new Float32Array(0);
const goalSectorBestNode = new Int32Array(GAME_CONFIG.npc.navigation.candidateDirections);
const goalSectorBestScore = new Float64Array(GAME_CONFIG.npc.navigation.candidateDirections);
const poppedNavigationEntry = { node: 0, cost: 0, heapSize: 0 };

function rebuildNavigationGraph() {
  const key = WORLD_STATE.barrierClosed ? "closed" : "open";
  let graph = navigationGraphCache[key];
  if (!graph) {
    graph = buildNavigationGraph(WORLD_STATE.barrierClosed);
    navigationGraphCache[key] = graph;
  }
  NAV_NODES = graph.nodes;
  NAV_GRID = graph.grid;
  NAV_GRID_WIDTH = graph.width;
  NAV_GRID_EXTENT = graph.extent;
  NAV_GRID_SPACING = graph.spacing;
  navDistance = new Float64Array(NAV_NODES.length);
  navPrevious = new Int32Array(NAV_NODES.length);
  navFirstStep = new Int32Array(NAV_NODES.length);
  navVisited = new Uint8Array(NAV_NODES.length);
  navReversePath = new Int32Array(NAV_NODES.length);
  navHeapNodes = new Int32Array(Math.max(1, NAV_NODES.length * 8 + 1));
  navHeapCosts = new Float64Array(navHeapNodes.length);
  navRouteCrowding = new Float32Array(NAV_NODES.length * RUNNERS.length);
  for (const runner of RUNNERS) {
    runner.route.length = 0;
    runner.routeIndex = 0;
    runner.routeTimer = runner.routePhaseOffset;
    runner.routeGoalX = runner.x;
    runner.routeGoalZ = runner.z;
    runner.routeFirstStep = -1;
    runner.stuckTime = 0;
  }
}

export function getNavigationSummary() {
  const visited = new Uint8Array(NAV_NODES.length);
  const queue = new Int32Array(NAV_NODES.length);
  let components = 0;
  let directedLinks = 0;

  for (let start = 0; start < NAV_NODES.length; start++) {
    if (visited[start]) continue;
    components++;
    let head = 0;
    let tail = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const node = NAV_NODES[queue[head++]!]!;
      directedLinks += node.links.length;
      for (const link of node.links) {
        if (visited[link.node]) continue;
        visited[link.node] = 1;
        queue[tail++] = link.node;
      }
    }
  }

  return { nodes: NAV_NODES.length, directedLinks, components };
}

rebuildNavigationGraph();

export function isSafeSpawn(agent: Agent, x: number, z: number) {
  if (Math.hypot(x, z) + agent.radius > activeWorld.arena.radius - WALL_MARGIN) return false;
  const candidates = queryObstacleIndex(
    x - agent.radius,
    x + agent.radius,
    z - agent.radius,
    z + agent.radius,
  );
  for (const obstacleId of candidates) {
    if (overlapsObstacle(x, z, agent.radius, OBSTACLES[obstacleId]!)) return false;
  }
  if (overlapsObstacle(x, z, agent.radius, ELASTIC_BOUNCE)) return false;
  if (WORLD_STATE.barrierClosed && overlapsObstacle(x, z, agent.radius, TEMPORARY_BARRIER))
    return false;
  for (const other of AGENTS) {
    if (other === agent || other.hidden > 0) continue;
    const minDistance = agent.radius + other.radius + GAME_CONFIG.npc.spawnSeparation;
    if (Math.hypot(x - other.x, z - other.z) < minDistance) return false;
  }
  if (
    agent !== PLAYER &&
    Math.hypot(x - PLAYER.x, z - PLAYER.z) < GAME_CONFIG.npc.minSpawnDistanceFromPlayer
  ) {
    return false;
  }
  return true;
}

/** Finds a clear in-bounds point away from the player and active runners. */
export function findSafeSpawn(
  agent: Agent,
  random: () => number = spawnRandomSource,
): { x: number; z: number } {
  const maxRadius = activeWorld.arena.radius - agent.radius - WALL_MARGIN;
  for (let i = 0; i < 96; i++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * maxRadius;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isSafeSpawn(agent, x, z)) return { x, z };
  }

  // The navigation graph already excludes the current solid colliders. Check
  // its nodes with the same live rules so tight maps still get a safe fallback.
  const length = NAV_NODES.length;
  const offset = (Math.max(0, AGENTS.indexOf(agent)) * 137 + agent.respawns * 97) % length;
  for (let i = 0; i < length; i++) {
    const node = NAV_NODES[(offset + i) % length]!;
    if (isSafeSpawn(agent, node.x, node.z)) return { x: node.x, z: node.z };
  }
  throw new Error(`No safe spawn is available for ${agent.id}`);
}

/** Full mutable-world reset used by the restart UI. */
export function resetSimulation(random: () => number = Math.random) {
  spawnRandomSource = random;
  const barrierWasClosed = WORLD_STATE.barrierClosed;
  WORLD_STATE.barrierClosed = false;
  WORLD_STATE.barrierRemaining = GAME_CONFIG.barrier.openSeconds;
  WORLD_STATE.speedPadPulseRemaining = 0;
  WORLD_STATE.boostCueId = 0;
  WORLD_STATE.interactionCueId = 0;
  WORLD_STATE.interactionCueKind = null;
  WORLD_STATE.interactionCueX = 0;
  WORLD_STATE.interactionCueZ = 0;
  WORLD_STATE.bounceImpactId = 0;
  WORLD_STATE.bounceNormalX = 0;
  WORLD_STATE.bounceNormalZ = 1;
  WORLD_STATE.cameraYaw = PLAYER.heading;
  WORLD_STATE.previousCameraYaw = PLAYER.heading;
  WORLD_STATE.cameraPitch = 0;
  WORLD_STATE.cameraManualRemaining = 0;
  WORLD_STATE.cameraDistance = GAME_CONFIG.camera.distance;
  WORLD_STATE.cameraFollowYawSpeed = GAME_CONFIG.camera.followYawSpeed;
  WORLD_STATE.cameraTurnAnticipation = GAME_CONFIG.camera.turnAnticipation;
  WORLD_STATE.cameraFollowResumeSpeed = GAME_CONFIG.camera.followResumeSpeed;
  WORLD_STATE.cameraFollowBlend = 1;
  WORLD_STATE.renderAlpha = 0;
  if (barrierWasClosed) rebuildNavigationGraph();
  for (const agent of AGENTS) agent.hidden = 1;
  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i]!;
    const initial = initialPositions[i]!;
    const spawn = findSafeSpawn(agent, random);
    agent.x = spawn.x;
    agent.z = spawn.z;
    agent.vx = 0;
    agent.vz = 0;
    agent.speed = 0;
    agent.heading = initial.heading;
    agent.phase = initial.phase;
    agent.hidden = 0;
    agent.state = initial.role === "player" ? "player" : "flee";
    agent.stuckTime = 0;
    agent.routeTimer = agent.role === "runner" ? agent.routePhaseOffset : 0;
    agent.routeDecisionCount = 0;
    agent.routeX = 0;
    agent.routeZ = 0;
    agent.routeGoalX = spawn.x;
    agent.routeGoalZ = spawn.z;
    agent.routeFirstStep = -1;
    agent.route.length = 0;
    agent.routeIndex = 0;
    agent.lastX = spawn.x;
    agent.lastZ = spawn.z;
    agent.respawns = 0;
    agent.dashState = "ready";
    agent.dashCooldownRemaining = 0;
    agent.dashDurationRemaining = 0;
    agent.dashBounceMultiplier = 1;
    agent.dashDirectionX = 0;
    agent.dashDirectionZ = 1;
    agent.dashStartX = spawn.x;
    agent.dashStartZ = spawn.z;
    agent.dashCameraRemaining = 0;
    agent.jumpElapsed = 0;
    agent.jumpHeight = 0;
    agent.previousJumpHeight = 0;
    agent.jumpActivationId = 0;
    agent.boostEffectRemaining = 0;
    agent.playerBoostActiveRemaining = 0;
    agent.playerBoostCooldownRemaining = 0;
    agent.slowMultiplier = 1;
    agent.onSpeedPad = false;
    agent.onSlowZone = false;
    agent.onElasticBounce = false;
    agent.turnRate = 0;
    agent.previousX = spawn.x;
    agent.previousZ = spawn.z;
    agent.previousHeading = initial.heading;
  }
  WORLD_STATE.cameraYaw = PLAYER.heading;
  WORLD_STATE.previousCameraYaw = PLAYER.heading;
  WORLD_STATE.cameraPitch = 0;
  WORLD_STATE.cameraManualRemaining = 0;
  WORLD_STATE.cameraFollowYawSpeed = GAME_CONFIG.camera.followYawSpeed;
  WORLD_STATE.cameraTurnAnticipation = GAME_CONFIG.camera.turnAnticipation;
  WORLD_STATE.cameraFollowResumeSpeed = GAME_CONFIG.camera.followResumeSpeed;
  WORLD_STATE.cameraFollowBlend = 1;
}

const selectedTarget = { agent: PLAYER, dist: Infinity };

/** Stable target selection shared by chase, capture feedback, and HUD telemetry. */
export function selectTarget(
  currentTargetId: string | null,
  lockedTargetId: string | null = null,
): { agent: Agent; dist: number } | null {
  if (lockedTargetId) {
    let locked: Agent | undefined;
    for (const runner of RUNNERS) {
      if (runner.id === lockedTargetId) {
        locked = runner;
        break;
      }
    }
    if (locked) {
      selectedTarget.agent = locked;
      selectedTarget.dist = Math.hypot(locked.x - PLAYER.x, locked.z - PLAYER.z);
      return selectedTarget;
    }
  }

  let nearest: Agent | null = null;
  let nearestDistance = Infinity;
  for (const runner of RUNNERS) {
    if (runner.hidden > 0) continue;
    const d = Math.hypot(runner.x - PLAYER.x, runner.z - PLAYER.z);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = runner;
    }
  }
  if (!nearest) return null;

  let current: Agent | undefined;
  for (const runner of RUNNERS) {
    if (runner.id === currentTargetId && runner.hidden <= 0) {
      current = runner;
      break;
    }
  }
  if (current) {
    const currentDistance = Math.hypot(current.x - PLAYER.x, current.z - PLAYER.z);
    if (
      nearest.id === current.id ||
      nearestDistance >= currentDistance * GAME_CONFIG.targetSwitchRatio
    ) {
      selectedTarget.agent = current;
      selectedTarget.dist = currentDistance;
      return selectedTarget;
    }
  }

  selectedTarget.agent = nearest;
  selectedTarget.dist = nearestDistance;
  return selectedTarget;
}

export function respawn(agent: Agent) {
  if (agent.role !== "runner") return;
  agent.hidden = GAME_CONFIG.npc.respawnDelay;
  agent.state = "respawning";
  agent.vx = 0;
  agent.vz = 0;
  agent.speed = 0;
  agent.stuckTime = 0;
  agent.routeTimer = agent.routePhaseOffset;
  agent.routeGoalX = agent.x;
  agent.routeGoalZ = agent.z;
  agent.routeFirstStep = -1;
  agent.route.length = 0;
  agent.routeIndex = 0;
  agent.boostEffectRemaining = 0;
  agent.playerBoostActiveRemaining = 0;
  agent.playerBoostCooldownRemaining = 0;
  agent.slowMultiplier = 1;
  agent.onSpeedPad = false;
  agent.onSlowZone = false;
  agent.onElasticBounce = false;
  agent.respawns++;
}

function removeNormalVelocity(agent: Agent, nx: number, nz: number) {
  const into = agent.vx * nx + agent.vz * nz;
  if (into < 0) {
    agent.vx -= nx * into;
    agent.vz -= nz * into;
  }
}

function decreaseTimer(remaining: number, dt: number) {
  const next = Math.max(0, remaining - dt);
  return next < 1e-9 ? 0 : next;
}

/** Resolve circle and rotated-box collisions, removing only inward velocity. */
export function resolveObstacle(agent: Agent, obstacle: Obstacle) {
  // Jump only clears authored low props; tall obstacles and interactives retain
  // the existing ground collision behavior.
  if (
    agent.role === "player" &&
    agent.jumpHeight > 0 &&
    agent.jumpHeight >= getAssetHeight(obstacle.model, obstacle.scale)
  )
    return false;

  const dx = agent.x - obstacle.position.x;
  const dz = agent.z - obstacle.position.z;
  const shape = obstacle.collision;
  const cached = getColliderCache(obstacle);

  if (shape.type === "circle") {
    const minDistance = cached.circleRadius + agent.radius;
    const d = Math.hypot(dx, dz);
    const isElasticBounce = "kind" in obstacle && obstacle.kind === "elasticBounce";
    const bounceReleaseDistance = GAME_CONFIG.elasticBounce.releaseDistance;
    if (d >= minDistance) {
      if (isElasticBounce && d >= minDistance + bounceReleaseDistance)
        agent.onElasticBounce = false;
      return false;
    }
    const speedBeforeImpact = Math.hypot(agent.vx, agent.vz);
    const nx = d > 0.0001 ? dx / d : speedBeforeImpact > 0.0001 ? -agent.vx / speedBeforeImpact : 1;
    const nz = d > 0.0001 ? dz / d : speedBeforeImpact > 0.0001 ? -agent.vz / speedBeforeImpact : 0;
    agent.x = obstacle.position.x + nx * minDistance;
    agent.z = obstacle.position.z + nz * minDistance;
    if (isElasticBounce) {
      const into = agent.vx * nx + agent.vz * nz;
      const alreadyInContact = agent.onElasticBounce;
      agent.onElasticBounce = true;
      if (into < 0 && !alreadyInContact) {
        const normalVelocity = agent.vx * nx + agent.vz * nz;
        agent.vx = agent.vx - 2 * normalVelocity * nx;
        agent.vz = agent.vz - 2 * normalVelocity * nz;
        if (agent.role === "player") {
          // Keep the reflected impact angle, then add a player-only speed kick.
          const bounceMultiplier = GAME_CONFIG.elasticBounce.playerSpeedMultiplier;
          const currentDashMultiplier =
            agent.dashState === "active" ? agent.dashBounceMultiplier : 1;
          const impactMultiplier = bounceMultiplier / currentDashMultiplier;
          agent.vx *= impactMultiplier;
          agent.vz *= impactMultiplier;
          if (agent.dashState === "active") {
            agent.dashBounceMultiplier = bounceMultiplier;
            const speed = Math.hypot(agent.vx, agent.vz) || 1;
            agent.dashDirectionX = agent.vx / speed;
            agent.dashDirectionZ = agent.vz / speed;
          }
        }
        if (agent.role === "player") emitInteractionCue("elasticBounce", nx, nz);
        agent.routeTimer = 0;
      } else if (alreadyInContact) removeNormalVelocity(agent, nx, nz);
    } else removeNormalVelocity(agent, nx, nz);
    return true;
  }

  const c = cached.cos;
  const s = cached.sin;
  const localX = dx * c + dz * s;
  const localZ = -dx * s + dz * c;
  const halfWidth = cached.halfWidth;
  const halfDepth = cached.halfDepth;
  const nearestX = Math.max(-halfWidth, Math.min(halfWidth, localX));
  const nearestZ = Math.max(-halfDepth, Math.min(halfDepth, localZ));
  let nx = localX - nearestX;
  let nz = localZ - nearestZ;
  const d = Math.hypot(nx, nz);
  let penetration: number;

  if (d > 0.0001) {
    if (d >= agent.radius) return false;
    nx /= d;
    nz /= d;
    penetration = agent.radius - d + COLLISION_EPSILON;
  } else {
    const faceX = halfWidth - Math.abs(localX);
    const faceZ = halfDepth - Math.abs(localZ);
    if (faceX < faceZ) {
      nx = localX < 0 ? -1 : 1;
      nz = 0;
      penetration = faceX + agent.radius + COLLISION_EPSILON;
    } else {
      nx = 0;
      nz = localZ < 0 ? -1 : 1;
      penetration = faceZ + agent.radius + COLLISION_EPSILON;
    }
  }

  const worldNX = nx * c - nz * s;
  const worldNZ = nx * s + nz * c;
  agent.x += worldNX * penetration;
  agent.z += worldNZ * penetration;
  removeNormalVelocity(agent, worldNX, worldNZ);
  return true;
}

export function resolveWorld(agent: Agent) {
  for (let pass = 0; pass < 2; pass++) {
    const candidates = queryObstacleIndex(
      agent.x - agent.radius,
      agent.x + agent.radius,
      agent.z - agent.radius,
      agent.z + agent.radius,
    );
    for (const obstacleId of candidates) resolveObstacle(agent, OBSTACLES[obstacleId]!);
    resolveObstacle(agent, ELASTIC_BOUNCE);
    if (WORLD_STATE.barrierClosed) resolveObstacle(agent, TEMPORARY_BARRIER);
  }

  const d = Math.hypot(agent.x, agent.z);
  const maxRadius = activeWorld.arena.radius - agent.radius;
  if (d > maxRadius) {
    const nx = agent.x / d;
    const nz = agent.z / d;
    agent.x = nx * maxRadius;
    agent.z = nz * maxRadius;
    const outward = agent.vx * nx + agent.vz * nz;
    if (outward > 0) {
      agent.vx -= nx * outward;
      agent.vz -= nz * outward;
    }
  }
}

function nearestReachableNode(agent: Agent) {
  let bestNode = -1;
  const localDistance = NAV_GRID_SPACING * 2.4;
  let bestDistanceSquared = localDistance * localDistance;
  const centerColumn = Math.round(agent.x / NAV_GRID_SPACING) + NAV_GRID_EXTENT;
  const centerRow = Math.round(agent.z / NAV_GRID_SPACING) + NAV_GRID_EXTENT;
  const cellRadius = Math.ceil(localDistance / NAV_GRID_SPACING);
  for (
    let row = Math.max(0, centerRow - cellRadius);
    row <= Math.min(NAV_GRID_WIDTH - 1, centerRow + cellRadius);
    row++
  ) {
    for (
      let column = Math.max(0, centerColumn - cellRadius);
      column <= Math.min(NAV_GRID_WIDTH - 1, centerColumn + cellRadius);
      column++
    ) {
      const nodeId = NAV_GRID[row * NAV_GRID_WIDTH + column]!;
      if (nodeId < 0) continue;
      const node = NAV_NODES[nodeId]!;
      const dx = node.x - agent.x;
      const dz = node.z - agent.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= bestDistanceSquared) continue;
      if (!isWalkableSegment(agent.x, agent.z, node.x, node.z, agent.radius)) continue;
      bestNode = nodeId;
      bestDistanceSquared = distanceSquared;
    }
  }
  if (bestNode >= 0) return bestNode;

  // Recovery fallback for bodies pushed out of the local navigation neighborhood.
  let bestDistance = Infinity;
  for (let i = 0; i < NAV_NODES.length; i++) {
    const node = NAV_NODES[i]!;
    const distance = Math.hypot(node.x - agent.x, node.z - agent.z);
    if (distance >= bestDistance) continue;
    if (!isWalkableSegment(agent.x, agent.z, node.x, node.z, agent.radius)) continue;
    bestNode = i;
    bestDistance = distance;
  }
  return bestNode;
}

/** Cache local route crowding once per decision instead of rescanning every route for every node. */
function cacheRouteCrowding(agent: Agent) {
  const nodeCount = NAV_NODES.length;
  navRouteCrowding.fill(0);
  if (nodeCount === 0) return;

  const separation = GAME_CONFIG.npc.navigation.preferredGoalSeparation;
  const cellRadius = Math.ceil(separation / NAV_GRID_SPACING);
  for (let runnerIndex = 0; runnerIndex < RUNNERS.length; runnerIndex++) {
    const other = RUNNERS[runnerIndex]!;
    if (other === agent || other.hidden > 0 || other.routeIndex >= other.route.length) continue;

    const offset = runnerIndex * nodeCount;
    for (let routeIndex = other.routeIndex; routeIndex < other.route.length; routeIndex++) {
      const routeNode = NAV_NODES[other.route[routeIndex]!]!;
      const centerColumn = Math.round(routeNode.x / NAV_GRID_SPACING) + NAV_GRID_EXTENT;
      const centerRow = Math.round(routeNode.z / NAV_GRID_SPACING) + NAV_GRID_EXTENT;
      const minRow = Math.max(0, centerRow - cellRadius);
      const maxRow = Math.min(NAV_GRID_WIDTH - 1, centerRow + cellRadius);
      const minColumn = Math.max(0, centerColumn - cellRadius);
      const maxColumn = Math.min(NAV_GRID_WIDTH - 1, centerColumn + cellRadius);

      for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
          const candidate = NAV_GRID[row * NAV_GRID_WIDTH + column]!;
          if (candidate < 0) continue;
          const node = NAV_NODES[candidate]!;
          const distance = Math.hypot(node.x - routeNode.x, node.z - routeNode.z);
          if (distance >= separation) continue;
          const crowding = 1 - distance / separation;
          const index = offset + candidate;
          if (crowding > navRouteCrowding[index]!) navRouteCrowding[index] = crowding;
        }
      }
    }
  }
}

function heapLess(costA: number, nodeA: number, costB: number, nodeB: number) {
  return costA < costB || (costA === costB && nodeA < nodeB);
}

function pushNavigationHeap(node: number, cost: number, heapSize: number) {
  let index = heapSize++;
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    const parentCost = navHeapCosts[parent]!;
    const parentNode = navHeapNodes[parent]!;
    if (!heapLess(cost, node, parentCost, parentNode)) break;
    navHeapCosts[index] = parentCost;
    navHeapNodes[index] = parentNode;
    index = parent;
  }
  navHeapCosts[index] = cost;
  navHeapNodes[index] = node;
  return heapSize;
}

function popNavigationHeap(heapSize: number) {
  const node = navHeapNodes[0]!;
  const cost = navHeapCosts[0]!;
  const lastNode = navHeapNodes[--heapSize]!;
  const lastCost = navHeapCosts[heapSize]!;
  if (heapSize > 0) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heapSize) break;
      const right = left + 1;
      let child = left;
      if (
        right < heapSize &&
        heapLess(
          navHeapCosts[right]!,
          navHeapNodes[right]!,
          navHeapCosts[left]!,
          navHeapNodes[left]!,
        )
      )
        child = right;
      if (!heapLess(navHeapCosts[child]!, navHeapNodes[child]!, lastCost, lastNode)) break;
      navHeapCosts[index] = navHeapCosts[child]!;
      navHeapNodes[index] = navHeapNodes[child]!;
      index = child;
    }
    navHeapCosts[index] = lastCost;
    navHeapNodes[index] = lastNode;
  }
  poppedNavigationEntry.node = node;
  poppedNavigationEntry.cost = cost;
  poppedNavigationEntry.heapSize = heapSize;
  return poppedNavigationEntry;
}

/** Dijkstra on the collision-checked graph, then score one reachable goal per escape sector. */
function chooseNavigationRoute(agent: Agent, avoidPreviousFirstStep: boolean) {
  const navigation = GAME_CONFIG.npc.navigation;
  const arenaTuning = getArenaNavigationTuning();
  const weights = navigation.goalWeights;
  const directionCount = navigation.candidateDirections;
  const directionStep = TAU / directionCount;
  const decision = agent.routeDecisionCount++;
  const personalLateralBias = Math.sin(agent.routeSeed + decision * 2.399963229728653);
  const start = nearestReachableNode(agent);
  if (start < 0) {
    agent.route.length = 0;
    agent.routeIndex = 0;
    agent.routeGoalX = agent.x;
    agent.routeGoalZ = agent.z;
    agent.routeFirstStep = -1;
    agent.routeTimer = agent.routeInterval;
    return;
  }

  navDistance.fill(Infinity);
  navPrevious.fill(-1);
  navFirstStep.fill(-1);
  navVisited.fill(0);
  goalSectorBestNode.fill(-1);
  goalSectorBestScore.fill(-Infinity);
  navDistance[start] = 0;
  cacheRouteCrowding(agent);

  const currentPlayerDistance = Math.hypot(agent.x - PLAYER.x, agent.z - PLAYER.z);
  const escapeX = (agent.x - PLAYER.x) / (currentPlayerDistance || 1);
  const escapeZ = (agent.z - PLAYER.z) / (currentPlayerDistance || 1);
  const previousFirstStep = agent.routeFirstStep;

  let heapSize = pushNavigationHeap(start, 0, 0);
  while (heapSize > 0) {
    const popped = popNavigationHeap(heapSize);
    heapSize = popped.heapSize;
    const current = popped.node;
    const currentCost = popped.cost;
    if (navVisited[current] || currentCost !== navDistance[current]) continue;
    navVisited[current] = 1;

    const node = NAV_NODES[current]!;
    const playerDistance = Math.hypot(node.x - PLAYER.x, node.z - PLAYER.z);
    if (current !== start && node.goalCandidate) {
      const goalDX = node.x - agent.x;
      const goalDZ = node.z - agent.z;
      const goalDistance = Math.hypot(goalDX, goalDZ) || 1;
      const directionCos = (goalDX * escapeX + goalDZ * escapeZ) / goalDistance;
      const directionSin = (escapeX * goalDZ - escapeZ * goalDX) / goalDistance;
      const relativeAngle = Math.atan2(directionSin, directionCos);
      let sector = Math.round(relativeAngle / directionStep);
      sector = ((sector % directionCount) + directionCount) % directionCount;

      const distanceError = Math.abs(playerDistance - arenaTuning.preferredFleeDistance);
      let distanceGainTarget = 0;
      let fleePressure = 0;
      if (currentPlayerDistance < arenaTuning.minFleeDistance) {
        distanceGainTarget = arenaTuning.minFleeDistance - currentPlayerDistance;
        fleePressure = weights.urgentFleeDistance;
      } else if (currentPlayerDistance < arenaTuning.preferredFleeDistance) {
        distanceGainTarget = arenaTuning.preferredFleeDistance - currentPlayerDistance;
        fleePressure = weights.moderateFleeDistance;
      }
      const distanceProgress = Math.min(
        Math.max(0, playerDistance - currentPlayerDistance),
        distanceGainTarget,
      );
      let score = -distanceError * weights.distanceBand + distanceProgress * fleePressure;
      score -=
        Math.max(0, playerDistance - arenaTuning.maxFleeDistance) * weights.maxFleeDistancePenalty;
      score -= currentCost * weights.routeQuality;
      score -= Math.max(0, currentCost - goalDistance) * weights.routeDetour;
      score += (node.links.length / 8) * weights.openSpace;
      score += Math.max(0, directionCos) * weights.awayDirection;
      score += Math.abs(directionSin) * weights.lateralEscape;
      score += directionSin * personalLateralBias * weights.personalLateralBias;

      const boundaryExcess = Math.max(
        0,
        Math.hypot(node.x, node.z) - arenaTuning.preferredRunnerRadius,
      );
      score -= boundaryExcess * boundaryExcess * weights.boundaryPenalty;

      for (let otherIndex = 0; otherIndex < RUNNERS.length; otherIndex++) {
        const other = RUNNERS[otherIndex]!;
        if (other === agent || other.hidden > 0) continue;
        const runnerDistance = Math.hypot(node.x - other.x, node.z - other.z);
        const separationRatio = Math.min(runnerDistance / navigation.preferredRunnerSeparation, 1);
        score += separationRatio * weights.runnerSeparation;
        const crowding = Math.max(0, 1 - separationRatio);
        score -= crowding * crowding * weights.crowdingPenalty;

        const otherHasRoute = other.routeIndex < other.route.length;
        const otherGoalX = otherHasRoute ? other.routeGoalX : other.x;
        const otherGoalZ = otherHasRoute ? other.routeGoalZ : other.z;
        const goalSeparation = Math.hypot(node.x - otherGoalX, node.z - otherGoalZ);
        score +=
          Math.min(goalSeparation / navigation.preferredGoalSeparation, 1) * weights.goalSeparation;

        if (otherHasRoute) {
          const routeCrowding = Math.max(
            Math.max(0, 1 - goalSeparation / navigation.preferredGoalSeparation),
            navRouteCrowding[otherIndex * NAV_NODES.length + current]!,
          );
          score -= routeCrowding * routeCrowding * weights.crowdingPenalty;
        }
      }

      if (avoidPreviousFirstStep && navFirstStep[current] === previousFirstStep) {
        score -= weights.previousRoutePenalty;
      }
      if (score > goalSectorBestScore[sector]!) {
        goalSectorBestScore[sector] = score;
        goalSectorBestNode[sector] = current;
      }
    }

    for (const link of node.links) {
      if (navVisited[link.node]) continue;
      const nextCost = currentCost + link.cost;
      if (nextCost >= navDistance[link.node]!) continue;
      navDistance[link.node] = nextCost;
      navPrevious[link.node] = current;
      navFirstStep[link.node] = current === start ? link.node : navFirstStep[current]!;
      heapSize = pushNavigationHeap(link.node, nextCost, heapSize);
    }
  }

  let bestGoal = -1;
  let bestScore = -Infinity;
  for (let sector = 0; sector < directionCount; sector++) {
    const candidate = goalSectorBestNode[sector]!;
    const score = goalSectorBestScore[sector]!;
    if (candidate < 0 || score <= bestScore) continue;
    bestGoal = candidate;
    bestScore = score;
  }

  if (bestGoal < 0) {
    agent.route.length = 0;
    agent.routeIndex = 0;
    agent.routeGoalX = agent.x;
    agent.routeGoalZ = agent.z;
    agent.routeFirstStep = -1;
    agent.routeTimer = agent.routeInterval;
    return;
  }

  let pathLength = 0;
  let pathNode = bestGoal;
  while (pathNode !== start && pathNode >= 0 && pathLength < navReversePath.length) {
    navReversePath[pathLength++] = pathNode;
    pathNode = navPrevious[pathNode]!;
  }
  if (pathNode !== start || pathLength === 0) {
    agent.route.length = 0;
    agent.routeIndex = 0;
    agent.routeGoalX = agent.x;
    agent.routeGoalZ = agent.z;
    agent.routeFirstStep = -1;
    agent.routeTimer = agent.routeInterval;
    return;
  }

  agent.routeGoalX = NAV_NODES[bestGoal]!.x;
  agent.routeGoalZ = NAV_NODES[bestGoal]!.z;
  agent.routeFirstStep = navFirstStep[bestGoal]!;
  agent.route.length = 0;
  for (let i = pathLength - 1; i >= 0; i--) agent.route.push(navReversePath[i]!);
  agent.routeIndex = 0;

  // Smooth clear portions of the grid path into direct segments while keeping colliders authoritative.
  for (let i = 1; i < agent.route.length; i++) {
    const node = NAV_NODES[agent.route[i]!]!;
    if (isWalkableSegment(agent.x, agent.z, node.x, node.z, agent.radius)) agent.routeIndex = i;
  }
  const waypoint = NAV_NODES[agent.route[agent.routeIndex]!]!;
  agent.routeX = waypoint.x;
  agent.routeZ = waypoint.z;
  agent.routeTimer = agent.routeInterval;
}

function integrateMovement(agent: Agent, dt: number) {
  const distance = Math.max(Math.abs(agent.vx * dt), Math.abs(agent.vz * dt));
  const substeps = Math.max(1, Math.ceil(distance / 0.18));
  const substepDt = dt / substeps;
  for (let i = 0; i < substeps; i++) {
    agent.x += agent.vx * substepDt;
    resolveWorld(agent);
    agent.z += agent.vz * substepDt;
    resolveWorld(agent);
  }
}

function getDesiredFacingAngle(movementX: number, movementZ: number) {
  return Math.atan2(movementX, movementZ);
}

function updateMovementPresentation(agent: Agent, dt: number, preserveHeading: boolean) {
  agent.speed = Math.hypot(agent.vx, agent.vz);
  if (!preserveHeading && agent.speed > 0.4) {
    const wantedHeading = getDesiredFacingAngle(agent.vx, agent.vz);
    let difference = wantedHeading - agent.heading;
    while (difference > Math.PI) difference -= TAU;
    while (difference < -Math.PI) difference += TAU;
    const rotationSpeed = agent.role === "player" ? GAME_CONFIG.player.facingRotationSpeed : 10;
    const headingDelta = difference * (1 - Math.exp(-rotationSpeed * dt));
    agent.heading += headingDelta;
    agent.turnRate = headingDelta / dt;
  } else agent.turnRate *= Math.exp(-8 * dt);
  agent.phase += agent.speed * dt * 0.85;
}

function move(
  agent: Agent,
  ax: number,
  az: number,
  maxSpeed: number,
  dt: number,
  preserveHeading = false,
) {
  const length = Math.hypot(ax, az);
  if (length > 0.001) {
    const inputMagnitude = agent.role === "player" ? Math.min(1, length) : 1;
    ax = (ax / length) * maxSpeed * inputMagnitude;
    az = (az / length) * maxSpeed * inputMagnitude;
  } else {
    ax = 0;
    az = 0;
  }

  const acceleration = 1 - Math.exp(-9 * dt);
  agent.vx += (ax - agent.vx) * acceleration;
  agent.vz += (az - agent.vz) * acceleration;
  integrateMovement(agent, dt);
  updateMovementPresentation(agent, dt, preserveHeading);
}

function movePlayerDash(dt: number) {
  const dashSpeed =
    (GAME_CONFIG.player.dash.distance / GAME_CONFIG.player.dash.durationSeconds) *
    effectiveSpeedMultiplier(PLAYER) *
    PLAYER.dashBounceMultiplier;
  PLAYER.vx = PLAYER.dashDirectionX * dashSpeed;
  PLAYER.vz = PLAYER.dashDirectionZ * dashSpeed;
  integrateMovement(PLAYER, dt);
  updateMovementPresentation(PLAYER, dt, false);
}

function advancePlayerDashTimers(dt: number) {
  PLAYER.dashCooldownRemaining = decreaseTimer(PLAYER.dashCooldownRemaining, dt);
  PLAYER.dashCameraRemaining = decreaseTimer(PLAYER.dashCameraRemaining, dt);
  if (PLAYER.dashState === "cooldown" && PLAYER.dashCooldownRemaining === 0)
    PLAYER.dashState = "ready";
}

export function advanceAgentActionTimers(agent: Agent, dt: number) {
  agent.boostEffectRemaining = decreaseTimer(agent.boostEffectRemaining, dt);
  if (agent.role === "player") {
    agent.playerBoostActiveRemaining = decreaseTimer(agent.playerBoostActiveRemaining, dt);
    agent.playerBoostCooldownRemaining = decreaseTimer(agent.playerBoostCooldownRemaining, dt);
  }
}

export function advanceBarrier(dt: number) {
  WORLD_STATE.barrierRemaining -= dt;
  if (WORLD_STATE.barrierRemaining > 0) return;
  WORLD_STATE.barrierClosed = !WORLD_STATE.barrierClosed;
  WORLD_STATE.barrierRemaining += WORLD_STATE.barrierClosed
    ? GAME_CONFIG.barrier.closedSeconds
    : GAME_CONFIG.barrier.openSeconds;
  rebuildNavigationGraph();
  if (WORLD_STATE.barrierClosed) {
    // A runner or player may be standing in the passage as it closes. Eject it
    // through the nearest face before it can move again.
    for (const agent of AGENTS) resolveWorld(agent);
  }
}

export function updateSlowZone(agent: Agent, dt: number) {
  const inside =
    Math.hypot(agent.x - SLOW_ZONE.position.x, agent.z - SLOW_ZONE.position.z) <=
    (SLOW_ZONE.triggerRadius ?? 0) * SLOW_ZONE.scale;
  if (inside) {
    if (agent.role === "player" && !agent.onSlowZone) emitInteractionCue("slowZone");
    agent.slowMultiplier = GAME_CONFIG.slowZone.movementMultiplier;
  } else {
    const recovery = Math.max(0.01, GAME_CONFIG.slowZone.recoverySeconds);
    agent.slowMultiplier = 1 + (agent.slowMultiplier - 1) * Math.exp(-dt / recovery);
    if (Math.abs(1 - agent.slowMultiplier) < 0.002) agent.slowMultiplier = 1;
  }
  agent.onSlowZone = inside;
}

export function onSpeedPadEnter(agent: Agent, inside: boolean) {
  const entered = inside && !agent.onSpeedPad;
  agent.onSpeedPad = inside;
  if (!entered || !applyBoostEffect(agent)) return false;
  if (agent.role === "player") emitInteractionCue("speedPad");
  WORLD_STATE.speedPadPulseRemaining = GAME_CONFIG.interactiveObjects.speedPad.pulseSeconds;
  return true;
}

export function updateSpeedPad(agent: Agent) {
  const inside =
    Math.hypot(agent.x - SPEED_PAD.position.x, agent.z - SPEED_PAD.position.z) <=
    (SPEED_PAD.triggerRadius ?? 0) * SPEED_PAD.scale;
  return onSpeedPadEnter(agent, inside);
}

const playerWorldInput = { x: 0, z: 0 };
const playerCameraBasis: CameraBasis = { forwardX: 0, forwardZ: 1, rightX: -1, rightZ: 0 };

export function resolveCameraRelativeInput(
  input: { x: number; z: number } | null,
  cameraYaw = WORLD_STATE.cameraYaw,
) {
  if (!input) {
    playerWorldInput.x = 0;
    playerWorldInput.z = 0;
    return null;
  }
  const basis = getCameraBasis(cameraYaw, playerCameraBasis);
  playerWorldInput.x = basis.forwardX * input.z + basis.rightX * input.x;
  playerWorldInput.z = basis.forwardZ * input.z + basis.rightZ * input.x;
  return playerWorldInput;
}

function advanceRunner(runner: Agent, dt: number) {
  if (runner.hidden <= 0) return true;
  runner.hidden = Math.max(0, runner.hidden - dt);
  runner.speed = 0;
  if (runner.hidden > 0) return false;

  const spawn = findSafeSpawn(runner);
  runner.x = spawn.x;
  runner.z = spawn.z;
  runner.lastX = spawn.x;
  runner.lastZ = spawn.z;
  runner.vx = 0;
  runner.vz = 0;
  runner.routeTimer = runner.routePhaseOffset;
  runner.routeGoalX = spawn.x;
  runner.routeGoalZ = spawn.z;
  runner.routeFirstStep = -1;
  runner.route.length = 0;
  runner.routeIndex = 0;
  runner.state = "flee";
  return true;
}

function separateRunners() {
  for (let i = 0; i < RUNNERS.length; i++) {
    const a = RUNNERS[i]!;
    if (a.hidden > 0) continue;
    for (let j = i + 1; j < RUNNERS.length; j++) {
      const b = RUNNERS[j]!;
      if (b.hidden > 0) continue;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const distance = Math.hypot(dx, dz);
      const minimum = a.radius + b.radius + 0.18;
      if (distance >= minimum) continue;
      const nx = distance > 0.001 ? dx / distance : i % 2 ? -1 : 1;
      const nz = distance > 0.001 ? dz / distance : 0;
      const push = (minimum - distance) * 0.5;
      a.x += nx * push;
      a.z += nz * push;
      b.x -= nx * push;
      b.z -= nz * push;
      resolveWorld(a);
      resolveWorld(b);
    }
  }
}

/** Advance all mutable gameplay state by exactly one fixed simulation tick. */
export function step(
  dt: number,
  input: { x: number; z: number } | null,
  commands: { dash: boolean; speedBoost: boolean; jump?: boolean },
  freezePlayer: boolean,
  freezeWorld = false,
  cameraYawForTick = WORLD_STATE.cameraYaw,
  cameraInput: CameraInput = NEUTRAL_CAMERA_INPUT,
) {
  for (const agent of AGENTS) {
    agent.previousX = agent.x;
    agent.previousZ = agent.z;
    agent.previousHeading = agent.heading;
  }
  PLAYER.previousJumpHeight = PLAYER.jumpHeight;
  WORLD_STATE.previousCameraYaw = WORLD_STATE.cameraYaw;
  advancePlayerDashTimers(dt);

  if (freezeWorld) {
    clearPlayerJump();
    if (PLAYER.dashState === "active") cancelPlayerDash();
    for (const agent of AGENTS) advanceAgentActionTimers(agent, dt);
    for (const agent of AGENTS) {
      agent.vx = 0;
      agent.vz = 0;
      agent.speed = 0;
    }
    updateCameraAfterMovement(dt, cameraInput, false, null, null);
    return;
  }

  advanceBarrier(dt);
  const worldInput = resolveCameraRelativeInput(input, cameraYawForTick);
  if (freezePlayer) clearPlayerJump();
  if (!freezePlayer) {
    if (commands.speedBoost) activatePlayerBoost();
    if (commands.jump) startPlayerJump();
    advancePlayerJump(dt);
    if (commands.dash) {
      startPlayerDash(
        worldInput ?? {
          x: Math.sin(PLAYER.heading),
          z: Math.cos(PLAYER.heading),
        },
      );
    }
    let movementDt = dt;
    if (PLAYER.dashState === "active") {
      const dashDt = Math.min(dt, PLAYER.dashDurationRemaining);
      if (dashDt > 0) movePlayerDash(dashDt);
      PLAYER.dashDurationRemaining = Math.max(0, PLAYER.dashDurationRemaining - dashDt);
      movementDt -= dashDt;
      if (PLAYER.dashDurationRemaining === 0) {
        PLAYER.dashBounceMultiplier = 1;
        PLAYER.dashState = PLAYER.dashCooldownRemaining > 0 ? "cooldown" : "ready";
        const speed = Math.hypot(PLAYER.vx, PLAYER.vz);
        const maxSpeed = GAME_CONFIG.player.speed * effectiveSpeedMultiplier(PLAYER);
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed;
          PLAYER.vx *= scale;
          PLAYER.vz *= scale;
          PLAYER.speed = maxSpeed;
        }
      }
    }
    if (movementDt > 0 && PLAYER.dashState !== "active") {
      move(
        PLAYER,
        worldInput?.x ?? 0,
        worldInput?.z ?? 0,
        GAME_CONFIG.player.speed * effectiveSpeedMultiplier(PLAYER),
        movementDt,
        worldInput === null,
      );
    }
  }

  // Camera follow is updated after player movement. The yaw used above remains
  // the stable start-of-tick snapshot, and the next tick samples the new yaw.
  const playerIsMovingForCameraFollow =
    Math.hypot(PLAYER.vx, PLAYER.vz) > GAME_CONFIG.camera.followMovementSpeedThreshold;
  updateCameraAfterMovement(dt, cameraInput, playerIsMovingForCameraFollow, input, worldInput);

  for (const runner of RUNNERS) {
    if (!advanceRunner(runner, dt)) continue;

    const awayX = runner.x - PLAYER.x;
    const awayZ = runner.z - PLAYER.z;
    const distance = Math.hypot(awayX, awayZ) || 1;
    let separationX = 0;
    let separationZ = 0;

    for (const other of RUNNERS) {
      if (other === runner || other.hidden > 0) continue;
      const dx = runner.x - other.x;
      const dz = runner.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.2 && d > 0.001) {
        const push = (4.2 - d) / 4.2;
        separationX += (dx / d) * push * 2.2;
        separationZ += (dz / d) * push * 2.2;
      }
    }

    const moved = Math.hypot(runner.x - runner.lastX, runner.z - runner.lastZ);
    const navigation = GAME_CONFIG.npc.navigation;
    if (
      moved < navigation.stuckMovementThreshold &&
      runner.speed > navigation.stuckSpeedThreshold
    ) {
      runner.stuckTime += dt;
    } else runner.stuckTime = Math.max(0, runner.stuckTime - dt * 1.5);
    runner.lastX = runner.x;
    runner.lastZ = runner.z;

    runner.routeTimer -= dt;
    const stuck = runner.stuckTime >= navigation.stuckRecheck;
    if (runner.routeTimer <= 0 || stuck) {
      chooseNavigationRoute(runner, stuck);
      runner.stuckTime = 0;
    }

    while (runner.routeIndex < runner.route.length) {
      const node = NAV_NODES[runner.route[runner.routeIndex]!]!;
      if (Math.hypot(node.x - runner.x, node.z - runner.z) > 0.95) {
        runner.routeX = node.x;
        runner.routeZ = node.z;
        break;
      }
      runner.routeIndex++;
    }

    if (runner.routeIndex >= runner.route.length)
      runner.routeTimer = Math.min(runner.routeTimer, 0);
    const waypointX =
      runner.routeIndex < runner.route.length ? runner.routeX - runner.x : awayX / distance;
    const waypointZ =
      runner.routeIndex < runner.route.length ? runner.routeZ - runner.z : awayZ / distance;
    // The graph owns obstacle routing; fleeing and the existing separation field remain responsive.
    let steerX = waypointX * 0.84 + (awayX / distance) * 0.16 + separationX;
    let steerZ = waypointZ * 0.84 + (awayZ / distance) * 0.16 + separationZ;
    const runnerRadius = Math.hypot(runner.x, runner.z);
    const arenaTuning = getArenaNavigationTuning();
    if (runnerRadius > arenaTuning.boundarySteeringStartRadius) {
      const radialX = runner.x / runnerRadius;
      const radialZ = runner.z / runnerRadius;
      const pressure = Math.min(
        1,
        (runnerRadius - arenaTuning.boundarySteeringStartRadius) /
          (arenaTuning.boundarySteeringFullRadius - arenaTuning.boundarySteeringStartRadius),
      );
      const outwardSteering = steerX * radialX + steerZ * radialZ;
      if (outwardSteering > 0) {
        const dampedOutward = outwardSteering * pressure * navigation.boundaryOutwardDamping;
        steerX -= radialX * dampedOutward;
        steerZ -= radialZ * dampedOutward;
      }
      steerX -= radialX * pressure * navigation.boundaryInwardSteeringWeight;
      steerZ -= radialZ * pressure * navigation.boundaryInwardSteeringWeight;
    }
    move(runner, steerX, steerZ, GAME_CONFIG.npc.speed * effectiveSpeedMultiplier(runner), dt);
  }

  separateRunners();
  for (const agent of AGENTS) {
    updateSlowZone(agent, dt);
    updateSpeedPad(agent);
    advanceAgentActionTimers(agent, dt);
  }
  WORLD_STATE.speedPadPulseRemaining = Math.max(0, WORLD_STATE.speedPadPulseRemaining - dt);
}

function updateCameraAfterMovement(
  dt: number,
  cameraInput: CameraInput,
  playerIsMoving: boolean,
  input: { x: number; z: number } | null,
  worldInput: { x: number; z: number } | null,
) {
  if (cameraInput.zoomDelta !== 0) {
    WORLD_STATE.cameraDistance = Math.max(
      GAME_CONFIG.camera.tuningRanges.distance.min,
      Math.min(
        GAME_CONFIG.camera.tuningRanges.distance.max,
        WORLD_STATE.cameraDistance - cameraInput.zoomDelta * 0.045,
      ),
    );
  }
  WORLD_STATE.cameraYaw += cameraInput.yawDelta;
  WORLD_STATE.cameraPitch = Math.max(
    -10,
    Math.min(10, WORLD_STATE.cameraPitch + cameraInput.pitchDelta),
  );

  if (cameraInput.manual) {
    WORLD_STATE.cameraManualRemaining = GAME_CONFIG.camera.manualPersistenceSeconds;
    WORLD_STATE.cameraFollowBlend = 0;
  } else if (playerIsMoving) {
    WORLD_STATE.cameraManualRemaining = Math.max(0, WORLD_STATE.cameraManualRemaining - dt);
    if (WORLD_STATE.cameraManualRemaining <= 0) {
      // Use current camera-local intent, and wait for smoothed velocity to
      // travel with it before heading-driven follow can turn the movement basis.
      let forwardCameraRelativeMovement = false;
      if (input !== null && input.z > 0 && worldInput !== null) {
        const inputMagnitude = Math.min(1, Math.hypot(input.x, input.z));
        const worldInputMagnitude = Math.hypot(worldInput.x, worldInput.z);
        const forwardSpeedAlongInput =
          worldInputMagnitude === 0
            ? 0
            : (PLAYER.vx * worldInput.x + PLAYER.vz * worldInput.z) / worldInputMagnitude;
        const minimumFollowSpeed = Math.max(
          GAME_CONFIG.camera.followMovementSpeedThreshold,
          GAME_CONFIG.player.speed * effectiveSpeedMultiplier(PLAYER) * inputMagnitude * 0.4,
        );
        const velocityMagnitude = Math.hypot(PLAYER.vx, PLAYER.vz);
        const velocityAlignment =
          velocityMagnitude > 0.001 && worldInputMagnitude > 0.001
            ? (PLAYER.vx * worldInput.x + PLAYER.vz * worldInput.z) /
              (velocityMagnitude * worldInputMagnitude)
            : 0;
        const headingAlignment = Math.cos(PLAYER.heading - Math.atan2(worldInput.x, worldInput.z));
        // Do not hand the camera basis back to automatic follow while the
        // avatar is still reversing. Waiting for both velocity and facing to
        // agree prevents S → W from turning the movement basis mid-transition.
        forwardCameraRelativeMovement =
          forwardSpeedAlongInput > minimumFollowSpeed &&
          velocityAlignment > 0.92 &&
          headingAlignment > 0.92;
      }
      const followTarget = forwardCameraRelativeMovement ? 1 : 0;
      WORLD_STATE.cameraFollowBlend +=
        (followTarget - WORLD_STATE.cameraFollowBlend) *
        (1 - Math.exp(-WORLD_STATE.cameraFollowResumeSpeed * dt));
      if (forwardCameraRelativeMovement) {
        const followDifference = Math.atan2(
          Math.sin(PLAYER.heading - WORLD_STATE.cameraYaw),
          Math.cos(PLAYER.heading - WORLD_STATE.cameraYaw),
        );
        WORLD_STATE.cameraYaw +=
          followDifference *
          (1 - Math.exp(-WORLD_STATE.cameraFollowYawSpeed * WORLD_STATE.cameraFollowBlend * dt));
      }
      WORLD_STATE.cameraPitch *= Math.exp(-2.8 * dt);
    } else {
      WORLD_STATE.cameraFollowBlend = 0;
    }
  }

  WORLD_STATE.cameraYaw = Math.atan2(
    Math.sin(WORLD_STATE.cameraYaw),
    Math.cos(WORLD_STATE.cameraYaw),
  );
}

resetSimulation();
