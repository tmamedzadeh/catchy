// Mutable simulation state. Nothing here is stored in React at frame rate.
import { GAME_CONFIG, OBSTACLES, type Obstacle } from "./config";

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
};

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
  };
}

export const AGENTS: Agent[] = initialPositions.map((_, index) => makeAgent(index));
export const PLAYER = AGENTS[0]!;
export const RUNNERS = AGENTS.slice(1);

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

const NAV_NODES = buildNavigationGraph();
const navDistance = new Float64Array(NAV_NODES.length);
const navPrevious = new Int32Array(NAV_NODES.length);
const navFirstStep = new Int32Array(NAV_NODES.length);
const navVisited = new Uint8Array(NAV_NODES.length);
const navReversePath = new Int32Array(NAV_NODES.length);

function isSafeSpawn(agent: Agent, x: number, z: number) {
  if (Math.hypot(x, z) + agent.radius > GAME_CONFIG.arenaRadius - WALL_MARGIN) return false;
  for (const obstacle of OBSTACLES) {
    if (overlapsObstacle(x, z, agent.radius, obstacle)) return false;
  }
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
  }
}

const selectedTarget = { agent: PLAYER, dist: Infinity };

/** Stable target selection shared by chase, capture feedback, and HUD telemetry. */
export function selectTarget(
  currentTargetId: string | null,
  lockedTargetId: string | null = null,
): { agent: Agent; dist: number } | null {
  if (lockedTargetId) {
    const locked = RUNNERS.find((runner) => runner.id === lockedTargetId);
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

  const current = RUNNERS.find((runner) => runner.id === currentTargetId && runner.hidden <= 0);
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
    removeNormalVelocity(agent, nx, nz);
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
  const distance = Math.max(Math.abs(agent.vx * dt), Math.abs(agent.vz * dt));
  const substeps = Math.max(1, Math.ceil(distance / 0.18));
  const stepX = (agent.vx * dt) / substeps;
  const stepZ = (agent.vz * dt) / substeps;
  for (let i = 0; i < substeps; i++) {
    agent.x += stepX;
    resolveWorld(agent);
    agent.z += stepZ;
    resolveWorld(agent);
  }

  agent.speed = Math.hypot(agent.vx, agent.vz);
  if (!preserveHeading && agent.speed > 0.4) {
    const wantedHeading = Math.atan2(agent.vx, agent.vz);
    let difference = wantedHeading - agent.heading;
    while (difference > Math.PI) difference -= TAU;
    while (difference < -Math.PI) difference += TAU;
    agent.heading += difference * (1 - Math.exp(-10 * dt));
  }
  agent.phase += agent.speed * dt * 0.85;
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

/** Update all mutable agents. `input` is a camera-relative unit vector. */
export function step(
  dt: number,
  input: { x: number; z: number } | null,
  freezePlayer: boolean,
  freezeWorld = false,
) {
  if (freezeWorld) {
    for (const agent of AGENTS) {
      agent.vx = 0;
      agent.vz = 0;
      agent.speed = 0;
    }
    return;
  }

  if (!freezePlayer) {
    const facingX = Math.sin(PLAYER.heading);
    const facingZ = Math.cos(PLAYER.heading);
    const movingBackward = input
      ? input.x * facingX + input.z * facingZ < -0.5
      : PLAYER.vx * facingX + PLAYER.vz * facingZ < -0.4;
    move(PLAYER, input?.x ?? 0, input?.z ?? 0, GAME_CONFIG.player.speed, dt, movingBackward);
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
    move(runner, steerX, steerZ, GAME_CONFIG.npc.speed, dt);
  }

  separateRunners();
}

resetSimulation();
