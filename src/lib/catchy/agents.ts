// Mutable simulation state. Nothing here is stored in React at frame rate.
import {
  GAME_CONFIG,
  INTERACTIVE_OBJECTS,
  OBSTACLES,
  type InteractiveMapObject,
  type Obstacle,
} from "./config";

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
  routeX: number;
  routeZ: number;
  route: number[];
  routeIndex: number;
  lastX: number;
  lastZ: number;
  respawns: number;
  radius: number;
  dashState: DashState;
  dashCooldownRemaining: number;
  dashDurationRemaining: number;
  dashDirectionX: number;
  dashDirectionZ: number;
  dashActivationId: number;
  dashStartX: number;
  dashStartZ: number;
  dashCameraRemaining: number;
  boostState: BoostState;
  boostDurationRemaining: number;
  boostCooldownRemaining: number;
  slowMultiplier: number;
  onSpeedPad: boolean;
  jumpRemaining: number;
  jumpCooldownRemaining: number;
  jumpHeight: number;
  slideRemaining: number;
  slideDirectionX: number;
  slideDirectionZ: number;
  turnRate: number;
  previousX: number;
  previousZ: number;
  previousHeading: number;
  previousJumpHeight: number;
};

export type DashState = "ready" | "active" | "cooldown";
export type BoostState = "ready" | "active" | "cooldown";

const initialPositions = [
  { id: "player", role: "player" as const, ...GAME_CONFIG.player.spawn, heading: -1.2, phase: 0 },
  { id: "pink", role: "runner" as const, ...GAME_CONFIG.npc.spawns[0], heading: 1, phase: 1.3 },
  { id: "purple", role: "runner" as const, ...GAME_CONFIG.npc.spawns[1], heading: 2, phase: 2.6 },
  { id: "orange", role: "runner" as const, ...GAME_CONFIG.npc.spawns[2], heading: -2, phase: 4.1 },
];

function makeAgent(index: number): Agent {
  const initial = initialPositions[index]!;
  const radius = initial.role === "player" ? GAME_CONFIG.player.radius : GAME_CONFIG.npc.radius;
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
    routeTimer: 0,
    routeX: 0,
    routeZ: 0,
    route: [],
    routeIndex: 0,
    lastX: initial.x,
    lastZ: initial.z,
    respawns: 0,
    radius,
    dashState: "ready",
    dashCooldownRemaining: 0,
    dashDurationRemaining: 0,
    dashDirectionX: 0,
    dashDirectionZ: 1,
    dashActivationId: 0,
    dashStartX: initial.x,
    dashStartZ: initial.z,
    dashCameraRemaining: 0,
    boostState: "ready",
    boostDurationRemaining: 0,
    boostCooldownRemaining: 0,
    slowMultiplier: 1,
    onSpeedPad: false,
    jumpRemaining: 0,
    jumpCooldownRemaining: 0,
    jumpHeight: 0,
    slideRemaining: 0,
    slideDirectionX: Math.sin(initial.heading),
    slideDirectionZ: Math.cos(initial.heading),
    turnRate: 0,
    previousX: initial.x,
    previousZ: initial.z,
    previousHeading: initial.heading,
    previousJumpHeight: 0,
  };
}

export const AGENTS: Agent[] = initialPositions.map((_, index) => makeAgent(index));
export const PLAYER = AGENTS[0]!;
export const RUNNERS = AGENTS.slice(1);

const SPEED_PAD = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
const SLOW_ZONE = INTERACTIVE_OBJECTS.find((item) => item.kind === "slowZone")!;
const ELASTIC_BOUNCE = INTERACTIVE_OBJECTS.find((item) => item.kind === "elasticBounce")!;
const TEMPORARY_BARRIER = INTERACTIVE_OBJECTS.find((item) => item.kind === "temporaryBarrier")!;

export const WORLD_STATE = {
  cameraYaw: PLAYER.heading,
  previousCameraYaw: PLAYER.heading,
  barrierClosed: false,
  barrierRemaining: GAME_CONFIG.barrier.openSeconds,
  speedPadPulseRemaining: 0,
  boostCueId: 0,
  renderAlpha: 0,
};

function effectiveSpeedMultiplier(agent: Agent) {
  return (
    (agent.boostState === "active" ? GAME_CONFIG.player.speedBoost.multiplier : 1) *
    agent.slowMultiplier
  );
}

export function startSpeedBoost(agent: Agent) {
  if (agent.boostState !== "ready") return false;
  agent.boostState = "active";
  agent.boostDurationRemaining = GAME_CONFIG.player.speedBoost.durationSeconds;
  WORLD_STATE.boostCueId++;
  return true;
}

function finishSpeedBoost(agent: Agent) {
  agent.boostDurationRemaining = 0;
  agent.boostCooldownRemaining = GAME_CONFIG.player.speedBoost.cooldownSeconds;
  agent.boostState = "cooldown";
}

export function cancelPlayerActions(resetCooldown = false) {
  if (PLAYER.dashState === "active") cancelPlayerDash();
  if (PLAYER.boostState === "active") finishSpeedBoost(PLAYER);
  PLAYER.jumpRemaining = 0;
  PLAYER.jumpHeight = 0;
  PLAYER.slideRemaining = 0;
  if (resetCooldown) {
    resetPlayerDash();
    PLAYER.boostState = "ready";
    PLAYER.boostDurationRemaining = 0;
    PLAYER.boostCooldownRemaining = 0;
    PLAYER.jumpCooldownRemaining = 0;
  }
}

/** Begin the player's short burst; the caller enforces the current game phase. */
export function startPlayerDash(direction: { x: number; z: number }) {
  if (PLAYER.dashState !== "ready" || PLAYER.jumpRemaining > 0 || PLAYER.slideRemaining > 0)
    return false;
  const length = Math.hypot(direction.x, direction.z);
  const inverseLength = length > 0.001 ? 1 / length : 0;
  const dash = GAME_CONFIG.player.dash;
  PLAYER.dashDirectionX = length > 0.001 ? direction.x * inverseLength : Math.sin(PLAYER.heading);
  PLAYER.dashDirectionZ = length > 0.001 ? direction.z * inverseLength : Math.cos(PLAYER.heading);
  PLAYER.heading = Math.atan2(PLAYER.dashDirectionX, PLAYER.dashDirectionZ);
  PLAYER.dashStartX = PLAYER.x;
  PLAYER.dashStartZ = PLAYER.z;
  PLAYER.dashDurationRemaining = dash.durationSeconds;
  PLAYER.dashCooldownRemaining = dash.cooldownSeconds;
  PLAYER.dashCameraRemaining = dash.cameraImpulseSeconds;
  PLAYER.dashState = "active";
  PLAYER.dashActivationId++;
  return true;
}

/** Cancel any active burst and optionally clear the full cooldown for a new round. */
export function resetPlayerDash(clearCooldown = true) {
  PLAYER.dashDurationRemaining = 0;
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
const NAV_SAMPLE_SPACING = 0.3;

function scaleOf(obstacle: Obstacle) {
  return Math.abs(obstacle.scale);
}

/** Test a body circle against the same transformed shape used by its GLB. */
function overlapsObstacle(x: number, z: number, radius: number, obstacle: Obstacle) {
  const dx = x - obstacle.position.x;
  const dz = z - obstacle.position.z;
  const scale = scaleOf(obstacle);
  const shape = obstacle.collision;
  if (shape.type === "circle") {
    return Math.hypot(dx, dz) < shape.radius * scale + radius + WALL_MARGIN;
  }

  const c = Math.cos(obstacle.rotation);
  const s = Math.sin(obstacle.rotation);
  const localX = dx * c + dz * s;
  const localZ = -dx * s + dz * c;
  const halfWidth = (shape.width * scale) / 2 + WALL_MARGIN;
  const halfDepth = (shape.depth * scale) / 2 + WALL_MARGIN;
  const nearestX = Math.max(-halfWidth, Math.min(halfWidth, localX));
  const nearestZ = Math.max(-halfDepth, Math.min(halfDepth, localZ));
  const ex = localX - nearestX;
  const ez = localZ - nearestZ;
  if (ex * ex + ez * ez > 0.000001) return ex * ex + ez * ez < radius * radius;
  return Math.abs(localX) < halfWidth + radius && Math.abs(localZ) < halfDepth + radius;
}

type NavLink = { node: number; cost: number };
type NavNode = { x: number; z: number; links: NavLink[] };

function isWalkablePoint(x: number, z: number, radius: number) {
  if (Math.hypot(x, z) + radius > GAME_CONFIG.arenaRadius - WALL_MARGIN) return false;
  for (const obstacle of OBSTACLES) {
    if (overlapsObstacle(x, z, radius, obstacle)) return false;
  }
  if (overlapsObstacle(x, z, radius, ELASTIC_BOUNCE)) return false;
  if (WORLD_STATE.barrierClosed && overlapsObstacle(x, z, radius, TEMPORARY_BARRIER)) return false;
  return true;
}

/** Check waypoint links with the same body radius and obstacle colliders used by movement. */
function isWalkableSegment(x1: number, z1: number, x2: number, z2: number, radius: number) {
  const length = Math.hypot(x2 - x1, z2 - z1);
  const samples = Math.max(1, Math.ceil(length / NAV_SAMPLE_SPACING));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    if (!isWalkablePoint(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, radius)) return false;
  }
  return true;
}

/** Static grid graph: its nodes and edges are admitted only when free under the live colliders. */
function buildNavigationGraph() {
  const spacing = GAME_CONFIG.npc.navigation.gridSpacing;
  const extent = Math.floor(
    (GAME_CONFIG.arenaRadius - GAME_CONFIG.npc.radius - WALL_MARGIN) / spacing,
  );
  const width = extent * 2 + 1;
  const grid = new Int32Array(width * width);
  grid.fill(-1);
  const nodes: NavNode[] = [];

  for (let row = 0; row < width; row++) {
    const z = (row - extent) * spacing;
    for (let column = 0; column < width; column++) {
      const x = (column - extent) * spacing;
      if (!isWalkablePoint(x, z, GAME_CONFIG.npc.radius)) continue;
      const node = nodes.length;
      grid[row * width + column] = node;
      nodes.push({ x, z, links: [] });
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
        if (!isWalkableSegment(node.x, node.z, next.x, next.z, GAME_CONFIG.npc.radius)) continue;
        const cost = Math.hypot(next.x - node.x, next.z - node.z);
        node.links.push({ node: nextId, cost });
        next.links.push({ node: nodeId, cost });
      }
    }
  }

  return nodes;
}

let NAV_NODES: NavNode[] = [];
let navDistance = new Float64Array(0);
let navPrevious = new Int32Array(0);
let navFirstStep = new Int32Array(0);
let navVisited = new Uint8Array(0);
let navReversePath = new Int32Array(0);

function rebuildNavigationGraph() {
  NAV_NODES = buildNavigationGraph();
  navDistance = new Float64Array(NAV_NODES.length);
  navPrevious = new Int32Array(NAV_NODES.length);
  navFirstStep = new Int32Array(NAV_NODES.length);
  navVisited = new Uint8Array(NAV_NODES.length);
  navReversePath = new Int32Array(NAV_NODES.length);
  for (const runner of RUNNERS) {
    runner.route.length = 0;
    runner.routeIndex = 0;
    runner.routeTimer = 0;
    runner.stuckTime = 0;
  }
}

rebuildNavigationGraph();

function isSafeSpawn(agent: Agent, x: number, z: number) {
  if (Math.hypot(x, z) + agent.radius > GAME_CONFIG.arenaRadius - WALL_MARGIN) return false;
  for (const obstacle of OBSTACLES) {
    if (overlapsObstacle(x, z, agent.radius, obstacle)) return false;
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
  preferred?: { x: number; z: number },
): { x: number; z: number } {
  if (preferred && isSafeSpawn(agent, preferred.x, preferred.z)) return preferred;

  const origin = preferred ?? { x: 0, z: 0 };
  const phase = agent.respawns * 1.61803398875 + AGENTS.indexOf(agent) * 2.39996322973;
  for (let i = 0; i < 240; i++) {
    const ring = i === 0 ? 0 : 3 + (Math.floor((i - 1) / 16) % 8) * 2.35;
    const angle = phase + i * 2.39996322973;
    const x = origin.x + Math.cos(angle) * ring;
    const z = origin.z + Math.sin(angle) * ring;
    if (isSafeSpawn(agent, x, z)) return { x, z };
  }

  // Deterministic whole-map fallback; the open south-west patch guarantees
  // that a valid spawn exists even when a preferred spot is blocked.
  for (let z = -GAME_CONFIG.arenaRadius + 2; z < GAME_CONFIG.arenaRadius - 2; z += 1.5) {
    for (let x = -GAME_CONFIG.arenaRadius + 2; x < GAME_CONFIG.arenaRadius - 2; x += 1.5) {
      if (isSafeSpawn(agent, x, z)) return { x, z };
    }
  }
  return { x: -12, z: 12 };
}

/** Full mutable-world reset used by both the UI button and Space key. */
export function resetSimulation() {
  const barrierWasClosed = WORLD_STATE.barrierClosed;
  WORLD_STATE.barrierClosed = false;
  WORLD_STATE.barrierRemaining = GAME_CONFIG.barrier.openSeconds;
  WORLD_STATE.speedPadPulseRemaining = 0;
  WORLD_STATE.boostCueId = 0;
  WORLD_STATE.cameraYaw = PLAYER.heading;
  WORLD_STATE.previousCameraYaw = PLAYER.heading;
  WORLD_STATE.renderAlpha = 0;
  if (barrierWasClosed) rebuildNavigationGraph();
  for (const agent of AGENTS) agent.hidden = 1;
  for (let i = 0; i < AGENTS.length; i++) {
    const agent = AGENTS[i]!;
    const initial = initialPositions[i]!;
    const spawn = findSafeSpawn(agent, { x: initial.x, z: initial.z });
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
    agent.routeTimer = 0;
    agent.routeX = 0;
    agent.routeZ = 0;
    agent.route.length = 0;
    agent.routeIndex = 0;
    agent.lastX = spawn.x;
    agent.lastZ = spawn.z;
    agent.respawns = 0;
    agent.dashState = "ready";
    agent.dashCooldownRemaining = 0;
    agent.dashDurationRemaining = 0;
    agent.dashDirectionX = 0;
    agent.dashDirectionZ = 1;
    agent.dashStartX = spawn.x;
    agent.dashStartZ = spawn.z;
    agent.dashCameraRemaining = 0;
    agent.boostState = "ready";
    agent.boostDurationRemaining = 0;
    agent.boostCooldownRemaining = 0;
    agent.slowMultiplier = 1;
    agent.onSpeedPad = false;
    agent.jumpRemaining = 0;
    agent.jumpCooldownRemaining = 0;
    agent.jumpHeight = 0;
    agent.slideRemaining = 0;
    agent.slideDirectionX = Math.sin(initial.heading);
    agent.slideDirectionZ = Math.cos(initial.heading);
    agent.turnRate = 0;
    agent.previousX = spawn.x;
    agent.previousZ = spawn.z;
    agent.previousHeading = initial.heading;
    agent.previousJumpHeight = 0;
  }
  WORLD_STATE.cameraYaw = PLAYER.heading;
  WORLD_STATE.previousCameraYaw = PLAYER.heading;
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
  agent.routeTimer = 0;
  agent.route.length = 0;
  agent.routeIndex = 0;
  agent.boostState = "ready";
  agent.boostDurationRemaining = 0;
  agent.boostCooldownRemaining = 0;
  agent.slowMultiplier = 1;
  agent.onSpeedPad = false;
  agent.jumpRemaining = 0;
  agent.jumpHeight = 0;
  agent.slideRemaining = 0;
  agent.respawns++;
}

function removeNormalVelocity(agent: Agent, nx: number, nz: number) {
  const into = agent.vx * nx + agent.vz * nz;
  if (into < 0) {
    agent.vx -= nx * into;
    agent.vz -= nz * into;
  }
}

/** Resolve circle and rotated-box collisions, removing only inward velocity. */
function resolveObstacle(agent: Agent, obstacle: Obstacle) {
  const dx = agent.x - obstacle.position.x;
  const dz = agent.z - obstacle.position.z;
  const shape = obstacle.collision;
  const scale = scaleOf(obstacle);

  if (shape.type === "circle") {
    const minDistance = shape.radius * scale + agent.radius + WALL_MARGIN;
    const d = Math.hypot(dx, dz);
    if (d >= minDistance) return false;
    const nx = d > 0.0001 ? dx / d : 1;
    const nz = d > 0.0001 ? dz / d : 0;
    agent.x = obstacle.position.x + nx * minDistance;
    agent.z = obstacle.position.z + nz * minDistance;
    if (obstacle.kind === "elasticBounce") {
      const into = agent.vx * nx + agent.vz * nz;
      if (into < 0) {
        const bounce = GAME_CONFIG.elasticBounce;
        agent.vx -= (1 + bounce.restitution) * into * nx;
        agent.vz -= (1 + bounce.restitution) * into * nz;
        agent.vx += nx * bounce.outwardImpulse;
        agent.vz += nz * bounce.outwardImpulse;
        if (agent.role === "player" && agent.dashState === "active") {
          const speed = Math.hypot(agent.vx, agent.vz) || 1;
          agent.dashDirectionX = agent.vx / speed;
          agent.dashDirectionZ = agent.vz / speed;
        }
        agent.routeTimer = 0;
      }
    } else removeNormalVelocity(agent, nx, nz);
    return true;
  }

  const c = Math.cos(obstacle.rotation);
  const s = Math.sin(obstacle.rotation);
  const localX = dx * c + dz * s;
  const localZ = -dx * s + dz * c;
  const halfWidth = (shape.width * scale) / 2 + WALL_MARGIN;
  const halfDepth = (shape.depth * scale) / 2 + WALL_MARGIN;
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
    penetration = agent.radius - d;
  } else {
    const faceX = halfWidth - Math.abs(localX);
    const faceZ = halfDepth - Math.abs(localZ);
    if (faceX < faceZ) {
      nx = localX < 0 ? -1 : 1;
      nz = 0;
      penetration = faceX + agent.radius;
    } else {
      nx = 0;
      nz = localZ < 0 ? -1 : 1;
      penetration = faceZ + agent.radius;
    }
  }

  const worldNX = nx * c - nz * s;
  const worldNZ = nx * s + nz * c;
  agent.x += worldNX * penetration;
  agent.z += worldNZ * penetration;
  removeNormalVelocity(agent, worldNX, worldNZ);
  return true;
}

function resolveWorld(agent: Agent) {
  for (let pass = 0; pass < 2; pass++) {
    for (const obstacle of OBSTACLES) resolveObstacle(agent, obstacle);
    resolveObstacle(agent, ELASTIC_BOUNCE);
    if (WORLD_STATE.barrierClosed) resolveObstacle(agent, TEMPORARY_BARRIER);
  }

  const d = Math.hypot(agent.x, agent.z);
  const maxRadius = GAME_CONFIG.arenaRadius - agent.radius;
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
  let bestDistance = GAME_CONFIG.npc.navigation.gridSpacing * 2.4;
  for (let i = 0; i < NAV_NODES.length; i++) {
    const node = NAV_NODES[i]!;
    const distance = Math.hypot(node.x - agent.x, node.z - agent.z);
    if (distance >= bestDistance) continue;
    if (!isWalkableSegment(agent.x, agent.z, node.x, node.z, agent.radius)) continue;
    bestNode = i;
    bestDistance = distance;
  }
  if (bestNode >= 0) return bestNode;

  // Fall back to the nearest visible node when a runner is pushed outside the local grid neighborhood.
  bestDistance = Infinity;
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

/** Dijkstra on the small static graph, scored toward reachable points farther from the player. */
function chooseNavigationRoute(agent: Agent, avoidPreviousFirstStep: boolean) {
  const start = nearestReachableNode(agent);
  if (start < 0) {
    agent.route.length = 0;
    agent.routeIndex = 0;
    agent.routeTimer = GAME_CONFIG.npc.navigation.stuckRecheck;
    return;
  }

  navDistance.fill(Infinity);
  navPrevious.fill(-1);
  navFirstStep.fill(-1);
  navVisited.fill(0);
  navDistance[start] = 0;

  let bestGoal = -1;
  let bestScore = -Infinity;
  const currentPlayerDistance = Math.hypot(agent.x - PLAYER.x, agent.z - PLAYER.z);
  const previousFirstStep = agent.route[0];

  for (let iteration = 0; iteration < NAV_NODES.length; iteration++) {
    let current = -1;
    let currentCost = Infinity;
    for (let i = 0; i < NAV_NODES.length; i++) {
      if (navVisited[i] || navDistance[i]! >= currentCost) continue;
      current = i;
      currentCost = navDistance[i]!;
    }
    if (current < 0) break;
    navVisited[current] = 1;

    const node = NAV_NODES[current]!;
    const playerDistance = Math.hypot(node.x - PLAYER.x, node.z - PLAYER.z);
    if (current !== start) {
      const gain = playerDistance - currentPlayerDistance;
      let score = playerDistance - currentCost * 0.58 + Math.min(gain, 0) * 0.9;
      if (avoidPreviousFirstStep && navFirstStep[current] === previousFirstStep) {
        score -= GAME_CONFIG.npc.navigation.gridSpacing * 2.2;
      }
      if (score > bestScore) {
        bestScore = score;
        bestGoal = current;
      }
    }

    for (const link of node.links) {
      if (navVisited[link.node]) continue;
      const nextCost = currentCost + link.cost;
      if (nextCost >= navDistance[link.node]!) continue;
      navDistance[link.node] = nextCost;
      navPrevious[link.node] = current;
      navFirstStep[link.node] = current === start ? link.node : navFirstStep[current]!;
    }
  }

  if (bestGoal < 0) {
    agent.route.length = 0;
    agent.routeIndex = 0;
    agent.routeTimer = GAME_CONFIG.npc.navigation.stuckRecheck;
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
    agent.routeTimer = GAME_CONFIG.npc.navigation.stuckRecheck;
    return;
  }

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
  agent.routeTimer = GAME_CONFIG.npc.navigation.routeRecheck;
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
    ax = (ax / length) * maxSpeed;
    az = (az / length) * maxSpeed;
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
    effectiveSpeedMultiplier(PLAYER);
  PLAYER.vx = PLAYER.dashDirectionX * dashSpeed;
  PLAYER.vz = PLAYER.dashDirectionZ * dashSpeed;
  integrateMovement(PLAYER, dt);
  updateMovementPresentation(PLAYER, dt, false);
}

function advancePlayerDashTimers(dt: number) {
  PLAYER.dashCooldownRemaining = Math.max(0, PLAYER.dashCooldownRemaining - dt);
  PLAYER.dashCameraRemaining = Math.max(0, PLAYER.dashCameraRemaining - dt);
  if (PLAYER.dashState === "cooldown" && PLAYER.dashCooldownRemaining === 0)
    PLAYER.dashState = "ready";
}

function advanceAgentActionTimers(agent: Agent, dt: number) {
  if (agent.boostState === "active") {
    agent.boostDurationRemaining = Math.max(0, agent.boostDurationRemaining - dt);
    if (agent.boostDurationRemaining === 0) finishSpeedBoost(agent);
  } else if (agent.boostState === "cooldown") {
    agent.boostCooldownRemaining = Math.max(0, agent.boostCooldownRemaining - dt);
    if (agent.boostCooldownRemaining === 0) agent.boostState = "ready";
  }

  agent.jumpCooldownRemaining = Math.max(0, agent.jumpCooldownRemaining - dt);
  agent.jumpRemaining = Math.max(0, agent.jumpRemaining - dt);
  if (agent.jumpRemaining === 0) agent.jumpHeight = 0;
  else {
    const jump = GAME_CONFIG.player.jump;
    const progress = 1 - agent.jumpRemaining / jump.durationSeconds;
    agent.jumpHeight = Math.sin(progress * Math.PI) * jump.height;
  }
  agent.slideRemaining = Math.max(0, agent.slideRemaining - dt);
}

function advanceBarrier(dt: number) {
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

function updateSlowZone(agent: Agent, dt: number) {
  const inside =
    Math.hypot(agent.x - SLOW_ZONE.position.x, agent.z - SLOW_ZONE.position.z) <=
    (SLOW_ZONE.triggerRadius ?? 0) * SLOW_ZONE.scale;
  if (inside) agent.slowMultiplier = GAME_CONFIG.slowZone.movementMultiplier;
  else {
    const recovery = Math.max(0.01, GAME_CONFIG.slowZone.recoverySeconds);
    agent.slowMultiplier = 1 + (agent.slowMultiplier - 1) * Math.exp(-dt / recovery);
    if (Math.abs(1 - agent.slowMultiplier) < 0.002) agent.slowMultiplier = 1;
  }
}

function updateSpeedPad(agent: Agent) {
  const inside =
    Math.hypot(agent.x - SPEED_PAD.position.x, agent.z - SPEED_PAD.position.z) <=
    (SPEED_PAD.triggerRadius ?? 0) * SPEED_PAD.scale;
  if (inside && !agent.onSpeedPad && startSpeedBoost(agent)) {
    WORLD_STATE.speedPadPulseRemaining = GAME_CONFIG.interactiveObjects.speedPad.pulseSeconds;
  }
  agent.onSpeedPad = inside;
}

const playerWorldInput = { x: 0, z: 0 };

function resolvePlayerInput(input: { x: number; z: number } | null) {
  if (!input) {
    playerWorldInput.x = 0;
    playerWorldInput.z = 0;
    return null;
  }
  const forwardX = Math.sin(WORLD_STATE.cameraYaw);
  const forwardZ = Math.cos(WORLD_STATE.cameraYaw);
  const rightX = Math.cos(WORLD_STATE.cameraYaw);
  const rightZ = -Math.sin(WORLD_STATE.cameraYaw);
  playerWorldInput.x = -forwardX * input.z + rightX * input.x;
  playerWorldInput.z = -forwardZ * input.z + rightZ * input.x;
  return playerWorldInput;
}

function beginPlayerJump() {
  if (
    PLAYER.jumpRemaining > 0 ||
    PLAYER.jumpCooldownRemaining > 0 ||
    PLAYER.dashState === "active" ||
    PLAYER.slideRemaining > 0
  )
    return false;
  PLAYER.jumpRemaining = GAME_CONFIG.player.jump.durationSeconds;
  PLAYER.jumpCooldownRemaining =
    GAME_CONFIG.player.jump.durationSeconds + GAME_CONFIG.player.jump.groundedSeconds;
  return true;
}

function beginPlayerSlide(input: { x: number; z: number } | null) {
  if (PLAYER.slideRemaining > 0 || PLAYER.jumpRemaining > 0 || PLAYER.dashState === "active")
    return false;
  const length = input ? Math.hypot(input.x, input.z) : 0;
  PLAYER.slideDirectionX = length > 0.001 ? input!.x / length : Math.sin(PLAYER.heading);
  PLAYER.slideDirectionZ = length > 0.001 ? input!.z / length : Math.cos(PLAYER.heading);
  PLAYER.slideRemaining = GAME_CONFIG.player.slide.durationSeconds;
  return true;
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
  runner.routeTimer = 0;
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
  commands: { dash: boolean; jump: boolean; slide: boolean; speedBoost: boolean },
  freezePlayer: boolean,
  freezeWorld = false,
  cameraTurnAxis = 0,
) {
  for (const agent of AGENTS) {
    agent.previousX = agent.x;
    agent.previousZ = agent.z;
    agent.previousHeading = agent.heading;
    agent.previousJumpHeight = agent.jumpHeight;
  }
  WORLD_STATE.previousCameraYaw = WORLD_STATE.cameraYaw;
  WORLD_STATE.cameraYaw += cameraTurnAxis * GAME_CONFIG.camera.yawSpeed * dt;
  WORLD_STATE.cameraYaw = Math.atan2(
    Math.sin(WORLD_STATE.cameraYaw),
    Math.cos(WORLD_STATE.cameraYaw),
  );
  advancePlayerDashTimers(dt);

  if (freezeWorld) {
    if (PLAYER.dashState === "active") cancelPlayerDash();
    for (const agent of AGENTS) advanceAgentActionTimers(agent, dt);
    for (const agent of AGENTS) {
      agent.vx = 0;
      agent.vz = 0;
      agent.speed = 0;
    }
    return;
  }

  advanceBarrier(dt);
  const worldInput = resolvePlayerInput(input);
  if (!freezePlayer) {
    if (commands.speedBoost) startSpeedBoost(PLAYER);
    let actionStarted =
      commands.dash &&
      startPlayerDash(
        worldInput ?? {
          x: Math.sin(PLAYER.heading),
          z: Math.cos(PLAYER.heading),
        },
      );
    if (!actionStarted && commands.jump) actionStarted = beginPlayerJump();
    if (!actionStarted && commands.slide) beginPlayerSlide(worldInput);

    let movementDt = dt;
    if (PLAYER.dashState === "active") {
      const dashDt = Math.min(dt, PLAYER.dashDurationRemaining);
      if (dashDt > 0) movePlayerDash(dashDt);
      PLAYER.dashDurationRemaining = Math.max(0, PLAYER.dashDurationRemaining - dashDt);
      movementDt -= dashDt;
      if (PLAYER.dashDurationRemaining === 0) {
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
      if (PLAYER.slideRemaining > 0) {
        move(
          PLAYER,
          PLAYER.slideDirectionX,
          PLAYER.slideDirectionZ,
          GAME_CONFIG.player.speed *
            GAME_CONFIG.player.slide.movementMultiplier *
            effectiveSpeedMultiplier(PLAYER),
          movementDt,
        );
      } else {
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
  }

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
    const steerX = waypointX * 0.84 + (awayX / distance) * 0.16 + separationX;
    const steerZ = waypointZ * 0.84 + (awayZ / distance) * 0.16 + separationZ;
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

resetSimulation();
