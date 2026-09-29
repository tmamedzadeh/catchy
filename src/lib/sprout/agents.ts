// Lightweight (non-physical) movement simulation for the prototype.
// Runs entirely outside React state so the 60fps loop never re-renders the HUD.

import { ARENA, OBSTACLES } from "./config";

export type Agent = {
  id: string;
  role: "player" | "runner";
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  phase: number;
  hidden: number; // >0 means respawning
};

export const AGENTS: Agent[] = [
  { id: "player", role: "player", x: -4, z: 12, vx: 0, vz: 0, heading: -1.2, speed: 0, phase: 0, hidden: 0 },
  { id: "a", role: "runner", x: -13, z: -2, vx: 0, vz: 0, heading: 1, speed: 0, phase: 1.3, hidden: 0 },
  { id: "b", role: "runner", x: 9, z: -12, vx: 0, vz: 0, heading: 2, speed: 0, phase: 2.6, hidden: 0 },
  { id: "c", role: "runner", x: 17, z: 6, vx: 0, vz: 0, heading: -2, speed: 0, phase: 4.1, hidden: 0 },
];

export const PLAYER = AGENTS[0]!;
export const RUNNERS = AGENTS.slice(1);

const PLAYER_SPEED = 9.2;
const RUNNER_SPEED = 8.2;

function avoid(a: Agent, outX: { v: number }, outZ: { v: number }) {
  for (const o of OBSTACLES) {
    const dx = a.x - o.x;
    const dz = a.z - o.z;
    const d = Math.hypot(dx, dz);
    const safe = o.r + 1.1;
    if (d < safe && d > 0.0001) {
      const push = (safe - d) / safe;
      outX.v += (dx / d) * push * 2.4;
      outZ.v += (dz / d) * push * 2.4;
    }
  }
  // keep inside the arena
  const dist = Math.hypot(a.x, a.z);
  const edge = ARENA.radius - 2.6;
  if (dist > edge) {
    outX.v -= (a.x / dist) * ((dist - edge) / 2) * 3;
    outZ.v -= (a.z / dist) * ((dist - edge) / 2) * 3;
  }
}

export function nearestRunner(): { agent: Agent; dist: number } | null {
  let best: Agent | null = null;
  let bestD = Infinity;
  for (const r of RUNNERS) {
    if (r.hidden > 0) continue;
    const d = Math.hypot(r.x - PLAYER.x, r.z - PLAYER.z);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best ? { agent: best, dist: bestD } : null;
}

export function respawn(a: Agent) {
  const angle = Math.random() * Math.PI * 2;
  const r = 14 + Math.random() * 12;
  a.x = Math.cos(angle) * r;
  a.z = Math.sin(angle) * r;
  a.vx = 0;
  a.vz = 0;
  a.hidden = 0.9;
}

/** input: normalised joystick / keyboard vector, or null for auto-chase. */
export function step(dt: number, input: { x: number; z: number } | null, frozen: boolean) {
  const target = nearestRunner();

  // -- player ---------------------------------------------------------------
  const px = { v: 0 };
  const pz = { v: 0 };
  if (!frozen) {
    if (input && (input.x !== 0 || input.z !== 0)) {
      px.v = input.x * 2.2;
      pz.v = input.z * 2.2;
    } else if (target) {
      const dx = target.agent.x - PLAYER.x;
      const dz = target.agent.z - PLAYER.z;
      const d = Math.hypot(dx, dz) || 1;
      px.v = (dx / d) * 2.2;
      pz.v = (dz / d) * 2.2;
    }
  }
  avoid(PLAYER, px, pz);
  integrate(PLAYER, px.v, pz.v, PLAYER_SPEED, dt, frozen);

  // -- runners --------------------------------------------------------------
  for (const r of RUNNERS) {
    if (r.hidden > 0) {
      r.hidden = Math.max(0, r.hidden - dt);
      r.speed = 0;
      continue;
    }
    const fx = { v: 0 };
    const fz = { v: 0 };
    if (!frozen) {
      const dx = r.x - PLAYER.x;
      const dz = r.z - PLAYER.z;
      const d = Math.hypot(dx, dz) || 1;
      const urgency = d < 12 ? 2.6 : 1.4;
      fx.v += (dx / d) * urgency;
      fz.v += (dz / d) * urgency;
      // orbit component so they circle instead of hugging the wall
      fx.v += (-dz / d) * 1.5;
      fz.v += (dx / d) * 1.5;
      // wander
      const t = performance.now() * 0.001;
      fx.v += Math.sin(t * 0.8 + r.phase * 3) * 0.6;
      fz.v += Math.cos(t * 0.7 + r.phase * 2) * 0.6;
      // separation from each other
      for (const o of RUNNERS) {
        if (o === r) continue;
        const ox = r.x - o.x;
        const oz = r.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od < 5 && od > 0.001) {
          fx.v += (ox / od) * 1.2;
          fz.v += (oz / od) * 1.2;
        }
      }
    }
    avoid(r, fx, fz);
    integrate(r, fx.v, fz.v, RUNNER_SPEED, dt, frozen);
  }

  return target;
}

function integrate(a: Agent, ax: number, az: number, maxSpeed: number, dt: number, frozen: boolean) {
  const len = Math.hypot(ax, az);
  if (len > 0.001 && !frozen) {
    ax = (ax / len) * maxSpeed;
    az = (az / len) * maxSpeed;
  } else {
    ax = 0;
    az = 0;
  }
  const k = 1 - Math.exp(-6 * dt);
  a.vx += (ax - a.vx) * k;
  a.vz += (az - a.vz) * k;
  a.x += a.vx * dt;
  a.z += a.vz * dt;
  a.speed = Math.hypot(a.vx, a.vz);
  if (a.speed > 0.4) {
    const want = Math.atan2(a.vx, a.vz);
    let diff = want - a.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    a.heading += diff * (1 - Math.exp(-10 * dt));
  }
  a.phase += a.speed * dt * 1.5;
}
