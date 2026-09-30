import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENTS,
  PLAYER,
  RUNNERS,
  WORLD_STATE,
  advanceAgentActionTimers,
  advanceBarrier,
  beginPlayerJump,
  beginPlayerSlide,
  cancelPlayerActions,
  effectiveSpeedMultiplier,
  findSafeSpawn,
  getNavigationSummary,
  isSafeSpawn,
  isWalkablePoint,
  isWalkableSegment,
  overlapsObstacle,
  resetSimulation,
  resolveCameraRelativeInput,
  resolveObstacle,
  resolveWorld,
  respawn,
  selectTarget,
  startPlayerDash,
  startSpeedBoost,
  step,
  updateSlowZone,
  updateSpeedPad,
  type Agent,
} from "./agents";
import { GAME_CONFIG, INTERACTIVE_OBJECTS, OBSTACLES, type Obstacle } from "./config";

const DT = 1 / GAME_CONFIG.simulation.tickHz;
const noCommands = { dash: false, jump: false, slide: false, speedBoost: false };

function obstacle(
  type: "box" | "circle",
  x = 0,
  z = 0,
  rotation = 0,
): Obstacle {
  return {
    kind: "prop",
    model: "test",
    position: { x, z },
    rotation,
    scale: 1,
    y: 0,
    collision:
      type === "box" ? { type, width: 2, depth: 1 } : { type, radius: 0.7 },
  };
}

function put(agent: Agent, x: number, z: number) {
  agent.x = x;
  agent.z = z;
  agent.previousX = x;
  agent.previousZ = z;
  agent.lastX = x;
  agent.lastZ = z;
  agent.vx = 0;
  agent.vz = 0;
  agent.speed = 0;
}

function activeRunners() {
  for (const runner of RUNNERS) {
    runner.hidden = 0;
    runner.state = "flee";
  }
}

beforeEach(() => resetSimulation());

describe("collision resolution", () => {
  it("resolves a player against a box obstacle without penetration", () => {
    const box = obstacle("box");
    put(PLAYER, 0.4, 0);
    PLAYER.vx = -2;
    expect(resolveObstacle(PLAYER, box)).toBe(true);
    expect(overlapsObstacle(PLAYER.x, PLAYER.z, PLAYER.radius, box)).toBe(false);
    expect(PLAYER.vx).toBeGreaterThanOrEqual(0);
  });

  it("uses the rotated collider transform for a box", () => {
    const box = obstacle("box", 0, 0, Math.PI / 4);
    put(PLAYER, 0.5, 0.45);
    expect(overlapsObstacle(PLAYER.x, PLAYER.z, PLAYER.radius, box)).toBe(true);
    resolveObstacle(PLAYER, box);
    expect(overlapsObstacle(PLAYER.x, PLAYER.z, PLAYER.radius, box)).toBe(false);
  });

  it("resolves circle obstacles and preserves non-inward tangential velocity", () => {
    const circle = obstacle("circle");
    const runner = RUNNERS[0]!;
    put(runner, 0.5, 0);
    runner.vx = -2;
    runner.vz = 1;
    resolveObstacle(runner, circle);
    expect(overlapsObstacle(runner.x, runner.z, runner.radius, circle)).toBe(false);
    expect(runner.vx).toBeGreaterThanOrEqual(0);
    expect(runner.vz).toBe(1);
  });

  it("keeps a body within the arena boundary and removes outward velocity", () => {
    put(PLAYER, GAME_CONFIG.arenaRadius + 10, 0);
    PLAYER.vx = 8;
    resolveWorld(PLAYER);
    expect(Math.hypot(PLAYER.x, PLAYER.z)).toBeLessThanOrEqual(
      GAME_CONFIG.arenaRadius - PLAYER.radius,
    );
    expect(PLAYER.vx).toBeCloseTo(0, 8);
  });

  it("does not drift or oscillate after repeated contact resolution", () => {
    const circle = obstacle("circle");
    const runner = RUNNERS[0]!;
    put(runner, 0.2, 0.1);
    runner.vx = -1;
    resolveObstacle(runner, circle);
    const stable = { x: runner.x, z: runner.z };
    for (let i = 0; i < 8; i++) resolveObstacle(runner, circle);
    expect(runner.x).toBeCloseTo(stable.x, 8);
    expect(runner.z).toBeCloseTo(stable.z, 8);
  });

  it("stops a Dash at a solid obstacle without tunneling", () => {
    const fountain = OBSTACLES.find((item) => item.model === "fountain-round")!;
    const minDistance = fountain.collision.type === "circle"
      ? fountain.collision.radius * fountain.scale + PLAYER.radius + GAME_CONFIG.obstacleMargin
      : 0;
    put(PLAYER, fountain.position.x + minDistance + 1.35, fountain.position.z);
    expect(startPlayerDash({ x: -1, z: 0 })).toBe(true);
    for (let i = 0; i < 12; i++) step(DT, null, noCommands, false);
    expect(overlapsObstacle(PLAYER.x, PLAYER.z, PLAYER.radius, fountain)).toBe(false);
    expect(PLAYER.dashState).not.toBe("active");
  });

  it("resolves collision while Speed Boost is active", () => {
    const circle = obstacle("circle");
    const runner = RUNNERS[0]!;
    put(runner, 0.5, 0);
    runner.boostState = "active";
    runner.vx = -3;
    resolveObstacle(runner, circle);
    expect(overlapsObstacle(runner.x, runner.z, runner.radius, circle)).toBe(false);
  });

  it("resolves collision with the player slowed", () => {
    const circle = obstacle("circle");
    put(PLAYER, 0.5, 0);
    PLAYER.slowMultiplier = GAME_CONFIG.slowZone.movementMultiplier;
    PLAYER.vx = -2;
    resolveObstacle(PLAYER, circle);
    expect(overlapsObstacle(PLAYER.x, PLAYER.z, PLAYER.radius, circle)).toBe(false);
    expect(effectiveSpeedMultiplier(PLAYER)).toBe(GAME_CONFIG.slowZone.movementMultiplier);
  });
});

describe("safe spawning", () => {
  it("accepts a valid preferred point and rejects points in obstacles or outside the arena", () => {
    const runner = RUNNERS[0]!;
    const valid = { x: -13, z: -2 };
    expect(isSafeSpawn(runner, valid.x, valid.z)).toBe(true);
    expect(findSafeSpawn(runner, valid)).toEqual(valid);
    expect(isSafeSpawn(runner, OBSTACLES[0]!.position.x, OBSTACLES[0]!.position.z)).toBe(false);
    expect(isSafeSpawn(runner, 100, 100)).toBe(false);
  });

  it("rejects points that are too close to the player or another active runner", () => {
    const [first, second] = RUNNERS;
    expect(isSafeSpawn(first!, PLAYER.x + 1, PLAYER.z)).toBe(false);
    put(first!, -20, 0);
    put(second!, -19, 0);
    expect(isSafeSpawn(first!, -19.1, 0)).toBe(false);
  });

  it("searches for a safe fallback when the preferred spawn is blocked", () => {
    const runner = RUNNERS[0]!;
    const blocked = OBSTACLES[0]!.position;
    const spawn = findSafeSpawn(runner, blocked);
    expect(spawn).not.toEqual(blocked);
    expect(isSafeSpawn(runner, spawn.x, spawn.z)).toBe(true);
  });

  it("places multiple active runners with configured separation", () => {
    const active = RUNNERS;
    for (const runner of active) runner.hidden = 1;
    for (const runner of active) {
      const spawn = findSafeSpawn(runner);
      runner.x = spawn.x;
      runner.z = spawn.z;
      runner.hidden = 0;
    }
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]!;
        const b = active[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
          a.radius + b.radius + GAME_CONFIG.npc.spawnSeparation,
        );
      }
    }
  });
});

describe("runner navigation and temporary barrier", () => {
  it("builds a connected graph with collision-blocked links omitted", () => {
    const open = getNavigationSummary();
    expect(open.nodes).toBeGreaterThan(500);
    expect(open.directedLinks).toBeGreaterThan(open.nodes);
    expect(open.components).toBe(1);
    const crate = OBSTACLES.find((item) => item.model === "crate")!;
    expect(
      isWalkableSegment(
        crate.position.x - 3,
        crate.position.z,
        crate.position.x + 3,
        crate.position.z,
        GAME_CONFIG.npc.radius,
      ),
    ).toBe(false);
  });

  it("selects a route, replans it, and recovers from a stuck state", () => {
    activeRunners();
    const runner = RUNNERS[0]!;
    step(DT, null, noCommands, true);
    expect(runner.route.length).toBeGreaterThan(0);
    const routeBefore = [...runner.route];
    runner.routeTimer = 0;
    step(DT, null, noCommands, true);
    expect(runner.routeTimer).toBeGreaterThan(0);
    runner.stuckTime = GAME_CONFIG.npc.navigation.stuckRecheck;
    runner.speed = 2;
    runner.lastX = runner.x;
    runner.lastZ = runner.z;
    step(DT, null, noCommands, true);
    expect(runner.stuckTime).toBeLessThan(GAME_CONFIG.npc.navigation.stuckRecheck);
    expect(runner.route.length).toBeGreaterThan(0);
    expect(routeBefore).not.toHaveLength(0);
  });

  it("removes stale runner routes when a barrier closes and restores graph access when open", () => {
    const open = getNavigationSummary();
    RUNNERS[0]!.route.push(1, 2, 3);
    const barrier = INTERACTIVE_OBJECTS.find((item) => item.kind === "temporaryBarrier")!;
    expect(isWalkablePoint(barrier.position.x, barrier.position.z, GAME_CONFIG.npc.radius)).toBe(
      true,
    );
    advanceBarrier(GAME_CONFIG.barrier.openSeconds);
    const closed = getNavigationSummary();
    expect(WORLD_STATE.barrierClosed).toBe(true);
    expect(RUNNERS[0]!.route).toEqual([]);
    expect(closed.nodes).toBeLessThan(open.nodes);
    expect(closed.components).toBe(1);
    expect(isWalkablePoint(barrier.position.x, barrier.position.z, GAME_CONFIG.npc.radius)).toBe(
      false,
    );
    advanceBarrier(GAME_CONFIG.barrier.closedSeconds);
    expect(WORLD_STATE.barrierClosed).toBe(false);
    expect(getNavigationSummary().nodes).toBe(open.nodes);
  });

  it("ejects an agent caught in the barrier at closure and prevents a permanent dead end", () => {
    const runner = RUNNERS[0]!;
    const barrier = INTERACTIVE_OBJECTS.find((item) => item.kind === "temporaryBarrier")!;
    put(runner, barrier.position.x, barrier.position.z);
    runner.hidden = 0;
    advanceBarrier(GAME_CONFIG.barrier.openSeconds);
    expect(overlapsObstacle(runner.x, runner.z, runner.radius, barrier)).toBe(false);
    expect(getNavigationSummary().components).toBe(1);
  });
});

describe("target hysteresis and capture target lock", () => {
  it("selects the nearest active runner and ignores inactive runners", () => {
    activeRunners();
    put(PLAYER, 0, 0);
    put(RUNNERS[0]!, 8, 0);
    put(RUNNERS[1]!, 5, 0);
    put(RUNNERS[2]!, 2, 0);
    RUNNERS[2]!.hidden = 1;
    expect(selectTarget(null)?.agent.id).toBe(RUNNERS[1]!.id);
  });

  it("keeps the current target until the nearer runner passes the hysteresis threshold", () => {
    activeRunners();
    put(PLAYER, 0, 0);
    put(RUNNERS[0]!, 10, 0);
    put(RUNNERS[1]!, 8, 0);
    put(RUNNERS[2]!, 20, 0);
    expect(selectTarget(RUNNERS[0]!.id)?.agent.id).toBe(RUNNERS[0]!.id);
    put(RUNNERS[1]!, 7, 0);
    expect(selectTarget(RUNNERS[0]!.id)?.agent.id).toBe(RUNNERS[1]!.id);
  });

  it("keeps a captured runner locked and returns no target when all runners are inactive", () => {
    activeRunners();
    const locked = RUNNERS[0]!;
    put(PLAYER, 0, 0);
    put(locked, 12, 4);
    RUNNERS[1]!.hidden = 0;
    put(RUNNERS[1]!, 1, 0);
    expect(selectTarget(RUNNERS[1]!.id, locked.id)?.agent.id).toBe(locked.id);
    RUNNERS.forEach((runner) => (runner.hidden = 1));
    expect(selectTarget(null)).toBeNull();
  });
});

describe("runner respawn", () => {
  it("hides a captured runner, clears its action state, and restores safe movement after delay", () => {
    const runner = RUNNERS[0]!;
    runner.boostState = "active";
    runner.boostDurationRemaining = 2;
    runner.slowMultiplier = 0.55;
    runner.onSlowZone = true;
    runner.jumpRemaining = 0.2;
    runner.slideRemaining = 0.2;
    respawn(runner);
    expect(runner.hidden).toBe(GAME_CONFIG.npc.respawnDelay);
    expect(runner.state).toBe("respawning");
    expect(runner.boostState).toBe("ready");
    expect(runner.slowMultiplier).toBe(1);
    expect(runner.jumpRemaining).toBe(0);
    expect(runner.slideRemaining).toBe(0);
    for (let i = 0; i < 43; i++) step(DT, null, noCommands, true);
    expect(runner.hidden).toBe(0);
    expect(runner.state).toBe("flee");
    expect(isSafeSpawn(runner, runner.x, runner.z)).toBe(true);
  });
});

describe("Dash and Speed Boost", () => {
  it("activates Dash, follows its requested direction, and observes duration and cooldown", () => {
    put(PLAYER, -4, 12);
    expect(startPlayerDash({ x: 1, z: 0 })).toBe(true);
    expect(PLAYER.dashState).toBe("active");
    expect(PLAYER.heading).toBeCloseTo(Math.PI / 2, 8);
    const startX = PLAYER.x;
    for (let i = 0; i < 11; i++) step(DT, null, noCommands, false);
    expect(PLAYER.x).toBeGreaterThan(startX);
    expect(PLAYER.dashState).toBe("cooldown");
    expect(startPlayerDash({ x: 1, z: 0 })).toBe(false);
    for (let i = 0; i < 139; i++) step(DT, null, noCommands, true, true);
    expect(PLAYER.dashState).toBe("ready");
  });

  it("uses heading when Dash starts without a direction and rejects jump/slide overlap", () => {
    PLAYER.heading = Math.PI / 3;
    expect(startPlayerDash({ x: 0, z: 0 })).toBe(true);
    expect(PLAYER.dashDirectionX).toBeCloseTo(Math.sin(Math.PI / 3), 8);
    resetSimulation();
    PLAYER.jumpRemaining = 0.2;
    expect(startPlayerDash({ x: 1, z: 0 })).toBe(false);
    PLAYER.jumpRemaining = 0;
    PLAYER.slideRemaining = 0.2;
    expect(startPlayerDash({ x: 1, z: 0 })).toBe(false);
  });

  it("runs a single 5-second active boost on a 30-second recharge cycle", () => {
    expect(startSpeedBoost(PLAYER)).toBe(true);
    expect(startSpeedBoost(PLAYER)).toBe(false);
    expect(PLAYER.boostState).toBe("active");
    expect(PLAYER.boostDurationRemaining).toBe(5);
    expect(PLAYER.boostCooldownRemaining).toBe(30);
    advanceAgentActionTimers(PLAYER, 5);
    expect(PLAYER.boostState).toBe("cooldown");
    expect(PLAYER.boostDurationRemaining).toBe(0);
    expect(PLAYER.boostCooldownRemaining).toBe(25);
    advanceAgentActionTimers(PLAYER, 25);
    expect(PLAYER.boostState).toBe("ready");
  });

  it("combines Dash with Boost and Slow Zone multipliers without stacking activation", () => {
    expect(startSpeedBoost(PLAYER)).toBe(true);
    PLAYER.slowMultiplier = GAME_CONFIG.slowZone.movementMultiplier;
    expect(effectiveSpeedMultiplier(PLAYER)).toBeCloseTo(0.825, 8);
    expect(startPlayerDash({ x: 0, z: 1 })).toBe(true);
    step(DT, null, noCommands, false);
    expect(PLAYER.speed).toBeGreaterThan(GAME_CONFIG.player.speed * 0.55);
    expect(startSpeedBoost(PLAYER)).toBe(false);
  });

  it("cancels active player actions and clears cooldowns on a full reset", () => {
    startSpeedBoost(PLAYER);
    startPlayerDash({ x: 1, z: 0 });
    PLAYER.jumpCooldownRemaining = 3;
    advanceAgentActionTimers(PLAYER, 0.04);
    // The store uses this same method for capture and round end.
    cancelPlayerActions(true);
    expect(PLAYER.dashState).toBe("ready");
    expect(PLAYER.boostState).toBe("ready");
    expect(PLAYER.jumpCooldownRemaining).toBe(0);
  });
});

describe("Speed Pad and Slow Zone", () => {
  it("activates the shared Boost state once on Speed Pad entry and respects cooldown", () => {
    const pad = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
    put(PLAYER, pad.position.x, pad.position.z);
    updateSpeedPad(PLAYER);
    expect(PLAYER.boostState).toBe("active");
    expect(PLAYER.onSpeedPad).toBe(true);
    expect(WORLD_STATE.interactionCueKind).toBe("speedPad");
    const cueId = WORLD_STATE.boostCueId;
    updateSpeedPad(PLAYER);
    expect(WORLD_STATE.boostCueId).toBe(cueId);
    PLAYER.onSpeedPad = false;
    PLAYER.boostState = "cooldown";
    updateSpeedPad(PLAYER);
    expect(PLAYER.boostState).toBe("cooldown");
  });

  it("applies the slow multiplier on entry, recovers smoothly, and clears after exit", () => {
    const zone = INTERACTIVE_OBJECTS.find((item) => item.kind === "slowZone")!;
    put(PLAYER, zone.position.x, zone.position.z);
    updateSlowZone(PLAYER, DT);
    expect(PLAYER.slowMultiplier).toBe(GAME_CONFIG.slowZone.movementMultiplier);
    expect(WORLD_STATE.interactionCueKind).toBe("slowZone");
    put(PLAYER, 0, 12);
    updateSlowZone(PLAYER, DT);
    expect(PLAYER.slowMultiplier).toBeGreaterThan(0.55);
    expect(PLAYER.slowMultiplier).toBeLessThan(1);
    for (let i = 0; i < 120; i++) updateSlowZone(PLAYER, DT);
    expect(PLAYER.slowMultiplier).toBe(1);
    expect(PLAYER.onSlowZone).toBe(false);
  });

  it("applies the same pad and slow interactions to runners", () => {
    const runner = RUNNERS[0]!;
    const pad = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
    const zone = INTERACTIVE_OBJECTS.find((item) => item.kind === "slowZone")!;
    put(runner, pad.position.x, pad.position.z);
    updateSpeedPad(runner);
    expect(runner.boostState).toBe("active");
    put(runner, zone.position.x, zone.position.z);
    updateSlowZone(runner, DT);
    expect(runner.slowMultiplier).toBe(0.55);
  });
});

describe("Elastic Bounce", () => {
  const bounce = INTERACTIVE_OBJECTS.find((item) => item.kind === "elasticBounce")!;

  function bounceVector(inX: number, inZ: number, normalX: number, normalZ: number) {
    const runner = RUNNERS[0]!;
    runner.onElasticBounce = false;
    const normalLength = Math.hypot(normalX, normalZ);
    const nx = normalX / normalLength;
    const nz = normalZ / normalLength;
    const radius = bounce.collision.type === "circle"
      ? bounce.collision.radius * bounce.scale + runner.radius + GAME_CONFIG.obstacleMargin
      : 0;
    put(runner, bounce.position.x + nx * (radius - 0.05), bounce.position.z + nz * (radius - 0.05));
    runner.vx = inX;
    runner.vz = inZ;
    resolveObstacle(runner, bounce);
    return { runner, nx, nz };
  }

  it.each([
    { incoming: [-4, 0] as const, normal: [1, 0] as const },
    { incoming: [-3, -4] as const, normal: [1, 1] as const },
    { incoming: [1, 5] as const, normal: [1, -1] as const },
  ])("reflects an incoming vector using the elastic collision formula", ({ incoming, normal }) => {
    const { runner, nx, nz } = bounceVector(incoming[0], incoming[1], normal[0], normal[1]);
    const dot = incoming[0] * nx + incoming[1] * nz;
    expect(runner.vx).toBeCloseTo(incoming[0] - 2 * dot * nx, 7);
    expect(runner.vz).toBeCloseTo(incoming[1] - 2 * dot * nz, 7);
    expect(Math.hypot(runner.vx, runner.vz)).toBeCloseTo(
      Math.hypot(incoming[0], incoming[1]),
      7,
    );
    expect(overlapsObstacle(runner.x, runner.z, runner.radius, bounce)).toBe(false);
  });

  it("produces angle-dependent reflection and does not repeatedly amplify contact speed", () => {
    const straight = bounceVector(-4, 0, 1, 0).runner;
    const diagonal = bounceVector(-3, -4, 1, 1).runner;
    expect(Math.atan2(straight.vz, straight.vx)).not.toBeCloseTo(
      Math.atan2(diagonal.vz, diagonal.vx),
      2,
    );
    const initialSpeed = Math.hypot(diagonal.vx, diagonal.vz);
    for (let i = 0; i < 6; i++) resolveObstacle(diagonal, bounce);
    expect(Math.hypot(diagonal.vx, diagonal.vz)).toBeCloseTo(initialSpeed, 7);
  });

  it("bounces a player Dash, including when Boost is active, without tunneling", () => {
    const minDistance = bounce.collision.type === "circle"
      ? bounce.collision.radius + PLAYER.radius + GAME_CONFIG.obstacleMargin
      : 0;
    for (const withBoost of [false, true]) {
      resetSimulation();
      put(PLAYER, bounce.position.x + minDistance + 1.2, bounce.position.z);
      if (withBoost) startSpeedBoost(PLAYER);
      expect(startPlayerDash({ x: -1, z: 0 })).toBe(true);
      for (let i = 0; i < 12; i++) step(DT, null, noCommands, false);
      expect(WORLD_STATE.bounceImpactId).toBe(1);
      expect(overlapsObstacle(PLAYER.x, PLAYER.z, PLAYER.radius, bounce)).toBe(false);
    }
  });
});

describe("Jump, Slide, camera-relative movement, and reset", () => {
  it("advances Jump through its vertical arc and grounded cooldown", () => {
    expect(beginPlayerJump()).toBe(true);
    expect(beginPlayerJump()).toBe(false);
    advanceAgentActionTimers(PLAYER, GAME_CONFIG.player.jump.durationSeconds / 2);
    expect(PLAYER.jumpHeight).toBeCloseTo(GAME_CONFIG.player.jump.height, 6);
    advanceAgentActionTimers(PLAYER, GAME_CONFIG.player.jump.durationSeconds / 2);
    expect(PLAYER.jumpHeight).toBe(0);
    expect(PLAYER.jumpCooldownRemaining).toBeCloseTo(GAME_CONFIG.player.jump.groundedSeconds, 8);
    expect(beginPlayerJump()).toBe(false);
  });

  it("starts Slide in movement direction and moves horizontally at the configured multiplier", () => {
    expect(beginPlayerSlide({ x: 1, z: 0 })).toBe(true);
    expect(PLAYER.slideRemaining).toBe(GAME_CONFIG.player.slide.durationSeconds);
    const x = PLAYER.x;
    step(DT, { x: 1, z: 0 }, noCommands, false);
    expect(PLAYER.x).toBeGreaterThan(x);
    expect(PLAYER.slideRemaining).toBeLessThan(GAME_CONFIG.player.slide.durationSeconds);
    expect(beginPlayerSlide(null)).toBe(false);
  });

  it.each([
    { name: "W at zero yaw", yaw: 0, input: { x: 0, z: -1 }, world: { x: 0, z: -1 } },
    { name: "S at zero yaw", yaw: 0, input: { x: 0, z: 1 }, world: { x: 0, z: 1 } },
    { name: "A at zero yaw", yaw: 0, input: { x: -1, z: 0 }, world: { x: -1, z: 0 } },
    { name: "D at zero yaw", yaw: 0, input: { x: 1, z: 0 }, world: { x: 1, z: 0 } },
    {
      name: "W at 90 degree yaw",
      yaw: Math.PI / 2,
      input: { x: 0, z: -1 },
      world: { x: 1, z: 0 },
    },
    {
      name: "arbitrary yaw",
      yaw: 0.37,
      input: { x: 0.4, z: -0.9 },
      world: { x: 0.4 * Math.cos(0.37) + 0.9 * Math.sin(0.37), z: -0.4 * Math.sin(0.37) - 0.9 * Math.cos(0.37) },
    },
  ])("maps $name into world movement", ({ yaw, input, world: expected }) => {
    const world = resolveCameraRelativeInput(input, yaw);
    expect(world).not.toBeNull();
    expect(world!.x).toBeCloseTo(expected.x, 7);
    expect(world!.z).toBeCloseTo(expected.z, 7);
  });

  it("rotates W, S, A and D at right-angle and arbitrary camera yaw", () => {
    const wAt90 = { ...resolveCameraRelativeInput({ x: 0, z: -1 }, Math.PI / 2)! };
    const sAt90 = { ...resolveCameraRelativeInput({ x: 0, z: 1 }, Math.PI / 2)! };
    const aAt90 = { ...resolveCameraRelativeInput({ x: -1, z: 0 }, Math.PI / 2)! };
    const dAt90 = { ...resolveCameraRelativeInput({ x: 1, z: 0 }, Math.PI / 2)! };
    expect(wAt90.x).toBeCloseTo(1, 8);
    expect(sAt90.x).toBeCloseTo(-1, 8);
    expect(aAt90.z).toBeCloseTo(1, 8);
    expect(dAt90.z).toBeCloseTo(-1, 8);
    const arbitrary = resolveCameraRelativeInput({ x: 0, z: -1 }, 0.37)!;
    expect(Math.hypot(arbitrary.x, arbitrary.z)).toBeCloseTo(1, 8);
    expect(resolveCameraRelativeInput(null)).toBeNull();
  });

  it("clears all player and world action state on restart", () => {
    startSpeedBoost(PLAYER);
    startPlayerDash({ x: 1, z: 0 });
    beginPlayerJump();
    PLAYER.slideRemaining = 0.5;
    WORLD_STATE.barrierClosed = true;
    resetSimulation();
    expect(PLAYER.dashState).toBe("ready");
    expect(PLAYER.boostState).toBe("ready");
    expect(PLAYER.jumpRemaining).toBe(0);
    expect(PLAYER.jumpCooldownRemaining).toBe(0);
    expect(PLAYER.slideRemaining).toBe(0);
    expect(WORLD_STATE.barrierClosed).toBe(false);
    expect(AGENTS.every((agent) => agent.hidden === 0)).toBe(true);
  });
});

