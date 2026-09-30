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
const ROUTE_RECHECK = 0.24;
const ROUTE_OFFSETS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 2.1, -2.1, Math.PI];
const ROUTE_LOOKAHEAD = [1.4, 2.8, 4.2];

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
    agent.lastX = spawn.x;
    agent.lastZ = spawn.z;
    agent.respawns = 0;
  }
}

const nearestTarget = { agent: PLAYER, dist: Infinity };

export function nearestRunner(): { agent: Agent; dist: number } | null {
  let best: Agent | null = null;
  let bestD = Infinity;
  for (const runner of RUNNERS) {
    if (runner.hidden > 0) continue;
    const d = Math.hypot(runner.x - PLAYER.x, runner.z - PLAYER.z);
    if (d < bestD) {
      bestD = d;
      best = runner;
    }
  }
  if (!best) return null;
  nearestTarget.agent = best;
  nearestTarget.dist = bestD;
  return nearestTarget;
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

function directionBlocked(agent: Agent, dx: number, dz: number) {
  const look = 1.4 + agent.radius;
  const x = agent.x + dx * look;
  const z = agent.z + dz * look;
  if (Math.hypot(x, z) + agent.radius > GAME_CONFIG.arenaRadius - 0.08) return true;
  for (const obstacle of OBSTACLES) {
    if (overlapsObstacle(x, z, agent.radius * 0.9, obstacle)) return true;
  }
  return false;
}

function chooseRoute(agent: Agent, goalX: number, goalZ: number) {
  const goalLength = Math.hypot(goalX, goalZ) || 1;
  goalX /= goalLength;
  goalZ /= goalLength;
  let bestScore = -Infinity;
  let bestX = goalX;
  let bestZ = goalZ;
  const baseAngle = Math.atan2(goalZ, goalX);
  for (const offset of ROUTE_OFFSETS) {
    const angle = baseAngle + offset;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    let score = x * goalX + z * goalZ;
    for (const distance of ROUTE_LOOKAHEAD) {
      const tx = agent.x + x * distance;
      const tz = agent.z + z * distance;
      if (Math.hypot(tx, tz) + agent.radius > GAME_CONFIG.arenaRadius - 0.08) {
        score -= 3.5;
      }
      for (const obstacle of OBSTACLES) {
        if (overlapsObstacle(tx, tz, agent.radius, obstacle)) score -= distance === 1.4 ? 3 : 1.4;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
      bestZ = z;
    }
  }
  agent.routeX = bestX;
  agent.routeZ = bestZ;
  agent.routeTimer = ROUTE_RECHECK;
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
  if (freezeWorld) return nearestRunner();

  if (!freezePlayer) {
    const facingX = Math.sin(PLAYER.heading);
    const facingZ = Math.cos(PLAYER.heading);
    const movingBackward = input
      ? input.x * facingX + input.z * facingZ < -0.5
      : PLAYER.vx * facingX + PLAYER.vz * facingZ < -0.4;
    move(PLAYER, input?.x ?? 0, input?.z ?? 0, GAME_CONFIG.player.speed, dt, movingBackward);
  }

  const now = performance.now() * 0.001;
  for (const runner of RUNNERS) {
    if (!advanceRunner(runner, dt)) continue;

    const awayX = runner.x - PLAYER.x;
    const awayZ = runner.z - PLAYER.z;
    const distance = Math.hypot(awayX, awayZ) || 1;
    const urgency = distance < 12 ? 2.6 : 1.4;
    let steerX = (awayX / distance) * urgency + (-awayZ / distance) * 1.5;
    let steerZ = (awayZ / distance) * urgency + (awayX / distance) * 1.5;
    steerX += Math.sin(now * 0.8 + runner.phase * 3) * 0.6;
    steerZ += Math.cos(now * 0.7 + runner.phase * 2) * 0.6;

    for (const other of RUNNERS) {
      if (other === runner || other.hidden > 0) continue;
      const dx = runner.x - other.x;
      const dz = runner.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.2 && d > 0.001) {
        const push = (4.2 - d) / 4.2;
        steerX += (dx / d) * push * 2.2;
        steerZ += (dz / d) * push * 2.2;
      }
    }

    const moved = Math.hypot(runner.x - runner.lastX, runner.z - runner.lastZ);
    if (moved < 0.025 && runner.speed > 1.2) runner.stuckTime += dt;
    else runner.stuckTime = Math.max(0, runner.stuckTime - dt * 1.5);
    runner.lastX = runner.x;
    runner.lastZ = runner.z;

    runner.routeTimer -= dt;
    if (
      runner.routeTimer <= 0 ||
      runner.stuckTime > 0.28 ||
      (runner.routeTimer < 0.08 &&
        directionBlocked(
          runner,
          steerX / (Math.hypot(steerX, steerZ) || 1),
          steerZ / (Math.hypot(steerX, steerZ) || 1),
        ))
    ) {
      chooseRoute(runner, steerX, steerZ);
      runner.stuckTime = 0;
    }
    // Keep a little of the direct flee vector while following a clear route.
    steerX = steerX * 0.32 + runner.routeX * 0.68;
    steerZ = steerZ * 0.32 + runner.routeZ * 0.68;
    move(runner, steerX, steerZ, GAME_CONFIG.npc.speed, dt);
  }

  separateRunners();
  return nearestRunner();
}

resetSimulation();
