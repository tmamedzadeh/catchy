import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENTS,
  PLAYER,
  RUNNERS,
  WORLD_STATE,
  activatePlayerBoost,
  advanceAgentActionTimers,
  applyBoostEffect,
  advanceBarrier,
  cancelPlayerActions,
  clearPlayerJump,
  effectiveSpeedMultiplier,
  findSafeSpawn,
  getPlayerBoostState,
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
  step,
  updateSlowZone,
  updateSpeedPad,
  type Agent,
} from "./agents";
import { GAME_CONFIG, INTERACTIVE_OBJECTS, OBSTACLES, type Obstacle } from "./config";

const DT = 1 / GAME_CONFIG.simulation.tickHz;
const noCommands = { dash: false, speedBoost: false, jump: false };

function obstacle(type: "box" | "circle", x = 0, z = 0, rotation = 0): Obstacle {
  return {
    kind: "prop",
    model: "test",
    position: { x, z },
    rotation,
    scale: 1,
    y: 0,
    collision: type === "box" ? { type, width: 2, depth: 1 } : { type, radius: 0.7 },
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
    put(PLAYER, 0.8, 0);
    PLAYER.vx = -2;
    expect(resolveObstacle(PLAYER, box)).toBe(true);
    expect(PLAYER.x).toBeGreaterThanOrEqual(
      box.collision.type === "box"
        ? box.collision.width / 2 + GAME_CONFIG.obstacleMargin + PLAYER.radius - 1e-6
        : 0,
    );
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
    const minDistance =
      fountain.collision.type === "circle"
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
    runner.boostEffectRemaining = GAME_CONFIG.player.speedBoost.durationSeconds;
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

describe("player jump simulation", () => {
  it("starts immediately, follows the configured arc, and returns to grounded state", () => {
    step(DT, null, { ...noCommands, jump: true }, false);
    expect(PLAYER.jumpActivationId).toBe(1);
    expect(PLAYER.jumpElapsed).toBeGreaterThan(0);
    expect(PLAYER.jumpHeight).toBeGreaterThan(0);

    for (let tick = 1; tick < Math.floor(GAME_CONFIG.player.jump.durationSeconds / DT); tick++) {
      step(DT, null, noCommands, false);
    }
    expect(PLAYER.jumpElapsed).toBeGreaterThan(0);
    expect(PLAYER.jumpHeight).toBeGreaterThan(0);
    step(DT, null, noCommands, false);
    expect(PLAYER.jumpElapsed).toBe(0);
    expect(PLAYER.jumpHeight).toBe(0);
    expect(PLAYER.previousJumpHeight).toBe(0);
  });

  it("keeps horizontal movement and facing on the existing movement path", () => {
    put(PLAYER, 0, 0);
    WORLD_STATE.cameraYaw = 0;
    const beforeZ = PLAYER.z;
    const beforeHeading = PLAYER.heading;
    step(DT, { x: 0, z: 1 }, { ...noCommands, jump: true }, false);
    expect(PLAYER.z).toBeGreaterThan(beforeZ);
    expect(PLAYER.vz).toBeGreaterThan(0);
    expect(Math.abs(PLAYER.heading)).toBeLessThan(Math.abs(beforeHeading));
    expect(PLAYER.jumpHeight).toBeGreaterThan(0);
  });

  it("does not replace or alter Dash and Speed Boost actions", () => {
    step(DT, null, { dash: true, speedBoost: true, jump: true }, false);
    expect(PLAYER.dashState).toBe("active");
    expect(PLAYER.playerBoostActiveRemaining).toBeGreaterThan(0);
    expect(PLAYER.jumpHeight).toBeGreaterThan(0);
  });

  it("does not start while the player is frozen for capture or round end", () => {
    step(DT, null, { ...noCommands, jump: true }, true);
    expect(PLAYER.jumpElapsed).toBe(0);
    expect(PLAYER.jumpHeight).toBe(0);
    step(DT, null, { ...noCommands, jump: true }, true, true);
    expect(PLAYER.jumpElapsed).toBe(0);
  });

  it("reset and input recovery clear an active jump", () => {
    step(DT, null, { ...noCommands, jump: true }, false);
    expect(PLAYER.jumpHeight).toBeGreaterThan(0);
    clearPlayerJump();
    expect(PLAYER.jumpElapsed).toBe(0);
    expect(PLAYER.jumpHeight).toBe(0);
    step(DT, null, { ...noCommands, jump: true }, false);
    resetSimulation();
    expect(PLAYER.jumpElapsed).toBe(0);
    expect(PLAYER.jumpHeight).toBe(0);
    expect(PLAYER.previousJumpHeight).toBe(0);
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

  it("steers an edge runner inward and spreads three escape goals", () => {
    activeRunners();
    put(PLAYER, 0, 0);
    put(RUNNERS[0]!, 26, 0);
    put(RUNNERS[1]!, 0, 17);
    put(RUNNERS[2]!, -17, 0);
    for (const runner of RUNNERS) runner.routeTimer = 0;

    step(DT, null, noCommands, true);

    const navigation = GAME_CONFIG.npc.navigation;
    const edgeGoal = RUNNERS[0]!;
    expect(Math.hypot(edgeGoal.routeGoalX, edgeGoal.routeGoalZ)).toBeLessThan(
      navigation.preferredRunnerRadius + 1,
    );
    const goals = RUNNERS.map((runner) => ({ x: runner.routeGoalX, z: runner.routeGoalZ }));
    for (let i = 0; i < goals.length; i++) {
      for (let j = i + 1; j < goals.length; j++) {
        expect(Math.hypot(goals[i]!.x - goals[j]!.x, goals[i]!.z - goals[j]!.z)).toBeGreaterThan(
          navigation.preferredGoalSeparation * 0.5,
        );
      }
    }
    expect(new Set(RUNNERS.map((runner) => runner.routePhaseOffset)).size).toBe(RUNNERS.length);
  });

  it("chooses comfortable player-distance goals and flees strongly when too close", () => {
    activeRunners();
    put(PLAYER, 0, 0);
    const runner = RUNNERS[0]!;
    put(runner, 16, 0);
    for (const other of RUNNERS.slice(1)) other.hidden = 10;
    runner.routeTimer = 0;
    step(DT, null, noCommands, true);
    const preferredGoalDistance = Math.hypot(runner.routeGoalX, runner.routeGoalZ);
    expect(preferredGoalDistance).toBeGreaterThan(GAME_CONFIG.npc.navigation.minFleeDistance);
    expect(preferredGoalDistance).toBeLessThan(GAME_CONFIG.npc.navigation.maxFleeDistance);

    put(runner, 8, 0);
    runner.routeTimer = 0;
    step(DT, null, noCommands, true);
    const urgentGoalDistance = Math.hypot(runner.routeGoalX, runner.routeGoalZ);
    expect(urgentGoalDistance).toBeGreaterThan(GAME_CONFIG.npc.navigation.minFleeDistance - 1);
    expect(urgentGoalDistance).toBeGreaterThan(8);
    expect(urgentGoalDistance).toBeLessThan(GAME_CONFIG.npc.navigation.maxFleeDistance + 2);
  });

  it("keeps runners roaming around the player without sustained wall camping", () => {
    activeRunners();
    const lastPositions = RUNNERS.map((runner) => ({ x: runner.x, z: runner.z }));
    const traveled = RUNNERS.map(() => 0);
    const samples: Array<{
      distances: number[];
      radii: number[];
      pairwise: number[];
      goalSeparation: number;
    }> = [];

    for (let tick = 0; tick < GAME_CONFIG.simulation.tickHz * 20; tick++) {
      step(DT, null, noCommands, true);
      for (let index = 0; index < RUNNERS.length; index++) {
        const runner = RUNNERS[index]!;
        const previous = lastPositions[index]!;
        traveled[index]! += Math.hypot(runner.x - previous.x, runner.z - previous.z);
        previous.x = runner.x;
        previous.z = runner.z;
      }
      if (tick >= GAME_CONFIG.simulation.tickHz * 5 && tick % GAME_CONFIG.simulation.tickHz === 0) {
        const goals = RUNNERS.map((runner) => ({ x: runner.routeGoalX, z: runner.routeGoalZ }));
        samples.push({
          distances: RUNNERS.map((runner) => Math.hypot(runner.x - PLAYER.x, runner.z - PLAYER.z)),
          radii: RUNNERS.map((runner) => Math.hypot(runner.x, runner.z)),
          pairwise: [
            Math.hypot(RUNNERS[0]!.x - RUNNERS[1]!.x, RUNNERS[0]!.z - RUNNERS[1]!.z),
            Math.hypot(RUNNERS[0]!.x - RUNNERS[2]!.x, RUNNERS[0]!.z - RUNNERS[2]!.z),
            Math.hypot(RUNNERS[1]!.x - RUNNERS[2]!.x, RUNNERS[1]!.z - RUNNERS[2]!.z),
          ],
          goalSeparation: Math.min(
            Math.hypot(goals[0]!.x - goals[1]!.x, goals[0]!.z - goals[1]!.z),
            Math.hypot(goals[0]!.x - goals[2]!.x, goals[0]!.z - goals[2]!.z),
            Math.hypot(goals[1]!.x - goals[2]!.x, goals[1]!.z - goals[2]!.z),
          ),
        });
      }
    }

    expect(samples.length).toBeGreaterThanOrEqual(14);
    expect(traveled.every((distance) => distance > 80)).toBe(true);
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    for (let index = 0; index < RUNNERS.length; index++) {
      const averageDistance = mean(samples.map((sample) => sample.distances[index]!));
      expect(averageDistance).toBeGreaterThan(GAME_CONFIG.npc.navigation.minFleeDistance - 2);
      expect(averageDistance).toBeLessThan(GAME_CONFIG.npc.navigation.maxFleeDistance + 3);
      const wallOccupancy =
        samples.filter(
          (sample) => sample.radii[index]! > GAME_CONFIG.npc.navigation.boundarySteeringFullRadius,
        ).length / samples.length;
      expect(wallOccupancy).toBeLessThan(0.25);
    }
    expect(mean(samples.map((sample) => mean(sample.pairwise)))).toBeGreaterThan(5);
    expect(mean(samples.map((sample) => sample.goalSeparation))).toBeGreaterThan(
      GAME_CONFIG.npc.navigation.preferredGoalSeparation * 0.4,
    );
  });

  it("steers clustered runners apart with a local separation field", () => {
    activeRunners();
    put(PLAYER, 0, -20);
    put(RUNNERS[0]!, 1, 8);
    put(RUNNERS[1]!, 3, 8);
    put(RUNNERS[2]!, 2, 10);
    const minimumBefore = Math.min(
      Math.hypot(RUNNERS[0]!.x - RUNNERS[1]!.x, RUNNERS[0]!.z - RUNNERS[1]!.z),
      Math.hypot(RUNNERS[0]!.x - RUNNERS[2]!.x, RUNNERS[0]!.z - RUNNERS[2]!.z),
      Math.hypot(RUNNERS[1]!.x - RUNNERS[2]!.x, RUNNERS[1]!.z - RUNNERS[2]!.z),
    );

    step(DT, null, noCommands, true);

    const minimumAfter = Math.min(
      Math.hypot(RUNNERS[0]!.x - RUNNERS[1]!.x, RUNNERS[0]!.z - RUNNERS[1]!.z),
      Math.hypot(RUNNERS[0]!.x - RUNNERS[2]!.x, RUNNERS[0]!.z - RUNNERS[2]!.z),
      Math.hypot(RUNNERS[1]!.x - RUNNERS[2]!.x, RUNNERS[1]!.z - RUNNERS[2]!.z),
    );
    expect(minimumAfter).toBeGreaterThan(minimumBefore);
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
  it("hides a captured runner, clears its boost state, and restores safe movement after delay", () => {
    const runner = RUNNERS[0]!;
    runner.boostEffectRemaining = 2;
    runner.slowMultiplier = 0.55;
    runner.onSlowZone = true;
    respawn(runner);
    expect(runner.hidden).toBe(GAME_CONFIG.npc.respawnDelay);
    expect(runner.state).toBe("respawning");
    expect(runner.boostEffectRemaining).toBe(0);
    expect(runner.slowMultiplier).toBe(1);
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

  it("uses heading when Dash starts without a direction", () => {
    PLAYER.heading = Math.PI / 3;
    expect(startPlayerDash({ x: 0, z: 0 })).toBe(true);
    expect(PLAYER.dashDirectionX).toBeCloseTo(Math.sin(Math.PI / 3), 8);
  });

  it("runs a 5-second player boost with a 30-second recharge from activation", () => {
    expect(activatePlayerBoost()).toBe(true);
    expect(activatePlayerBoost()).toBe(false);
    expect(getPlayerBoostState()).toBe("active");
    expect(PLAYER.boostEffectRemaining).toBe(5);
    expect(PLAYER.playerBoostCooldownRemaining).toBe(30);
    advanceAgentActionTimers(PLAYER, 5);
    expect(getPlayerBoostState()).toBe("cooldown");
    expect(PLAYER.boostEffectRemaining).toBe(0);
    expect(PLAYER.playerBoostCooldownRemaining).toBe(25);
    advanceAgentActionTimers(PLAYER, 24.9);
    expect(getPlayerBoostState()).toBe("cooldown");
    advanceAgentActionTimers(PLAYER, 0.1);
    expect(getPlayerBoostState()).toBe("ready");
  });

  it("combines Dash with Boost and Slow Zone multipliers without stacking activation", () => {
    expect(activatePlayerBoost()).toBe(true);
    PLAYER.slowMultiplier = GAME_CONFIG.slowZone.movementMultiplier;
    expect(effectiveSpeedMultiplier(PLAYER)).toBeCloseTo(0.825, 8);
    expect(startPlayerDash({ x: 0, z: 1 })).toBe(true);
    step(DT, null, noCommands, false);
    expect(PLAYER.speed).toBeGreaterThan(GAME_CONFIG.player.speed * 0.55);
    expect(activatePlayerBoost()).toBe(false);
  });

  it("cancels active player actions and clears cooldowns on a full reset", () => {
    activatePlayerBoost();
    startPlayerDash({ x: 1, z: 0 });
    advanceAgentActionTimers(PLAYER, 0.04);
    // The store uses this same method for capture and round end.
    cancelPlayerActions(true);
    expect(PLAYER.dashState).toBe("ready");
    expect(getPlayerBoostState()).toBe("ready");
    expect(PLAYER.playerBoostCooldownRemaining).toBe(0);
    expect(PLAYER.boostEffectRemaining).toBe(0);
  });
});

describe("Speed Pad and Slow Zone", () => {
  it("grants a fresh pad effect during player cooldown without changing its timeline", () => {
    const pad = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
    put(PLAYER, pad.position.x + (pad.triggerRadius ?? 0) + 2, pad.position.z);
    updateSpeedPad(PLAYER);
    expect(activatePlayerBoost()).toBe(true);
    advanceAgentActionTimers(PLAYER, 5);
    const cooldownAtEntry = PLAYER.playerBoostCooldownRemaining;
    expect(getPlayerBoostState()).toBe("cooldown");

    put(PLAYER, pad.position.x, pad.position.z);
    expect(updateSpeedPad(PLAYER)).toBe(true);
    expect(PLAYER.boostEffectRemaining).toBe(5);
    expect(PLAYER.playerBoostCooldownRemaining).toBe(cooldownAtEntry);
    expect(getPlayerBoostState()).toBe("cooldown");
    expect(PLAYER.onSpeedPad).toBe(true);
    expect(WORLD_STATE.interactionCueKind).toBe("speedPad");
    const padCueId = WORLD_STATE.interactionCueId;
    expect(updateSpeedPad(PLAYER)).toBe(false);
    expect(PLAYER.boostEffectRemaining).toBe(5);
    expect(WORLD_STATE.interactionCueId).toBe(padCueId);
    expect(PLAYER.playerBoostCooldownRemaining).toBe(cooldownAtEntry);

    advanceAgentActionTimers(PLAYER, 5);
    expect(PLAYER.boostEffectRemaining).toBe(0);
    expect(updateSpeedPad(PLAYER)).toBe(false);
    put(PLAYER, pad.position.x + (pad.triggerRadius ?? 0) + 2, pad.position.z);
    updateSpeedPad(PLAYER);
    put(PLAYER, pad.position.x, pad.position.z);
    expect(updateSpeedPad(PLAYER)).toBe(true);
    expect(PLAYER.boostEffectRemaining).toBe(5);
    expect(PLAYER.playerBoostCooldownRemaining).toBeCloseTo(cooldownAtEntry - 5, 8);
  });

  it("does not stack or extend a pad effect that is already active", () => {
    const pad = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
    put(PLAYER, pad.position.x + (pad.triggerRadius ?? 0) + 2, pad.position.z);
    updateSpeedPad(PLAYER);
    expect(applyBoostEffect(PLAYER)).toBe(true);
    put(PLAYER, pad.position.x, pad.position.z);
    const previousCueId = WORLD_STATE.interactionCueId;
    expect(updateSpeedPad(PLAYER)).toBe(false);
    expect(PLAYER.boostEffectRemaining).toBe(GAME_CONFIG.player.speedBoost.durationSeconds);
    expect(WORLD_STATE.interactionCueId).toBe(previousCueId);
    expect(getPlayerBoostState()).toBe("ready");
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
    for (let i = 0; i < 130; i++) updateSlowZone(PLAYER, DT);
    expect(PLAYER.slowMultiplier).toBe(1);
    expect(PLAYER.onSlowZone).toBe(false);
  });

  it("applies the same pad and slow interactions to runners", () => {
    const runner = RUNNERS[0]!;
    const pad = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
    const zone = INTERACTIVE_OBJECTS.find((item) => item.kind === "slowZone")!;
    expect(activatePlayerBoost()).toBe(true);
    advanceAgentActionTimers(PLAYER, 5);
    expect(getPlayerBoostState()).toBe("cooldown");
    const playerCooldownRemaining = PLAYER.playerBoostCooldownRemaining;
    put(runner, pad.position.x, pad.position.z);
    updateSpeedPad(runner);
    expect(runner.boostEffectRemaining).toBe(GAME_CONFIG.player.speedBoost.durationSeconds);
    expect(PLAYER.playerBoostCooldownRemaining).toBe(playerCooldownRemaining);
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
    const radius =
      bounce.collision.type === "circle"
        ? bounce.collision.radius * bounce.scale + runner.radius + GAME_CONFIG.obstacleMargin
        : 0;
    put(runner, bounce.position.x + nx * (radius - 0.05), bounce.position.z + nz * (radius - 0.05));
    runner.vx = inX;
    runner.vz = inZ;
    resolveObstacle(runner, bounce);
    return { runner: { ...runner }, nx, nz };
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
    expect(Math.hypot(runner.vx, runner.vz)).toBeCloseTo(Math.hypot(incoming[0], incoming[1]), 7);
    const minimumDistance =
      (bounce.collision.type === "circle" ? bounce.collision.radius * bounce.scale : 0) +
      runner.radius +
      GAME_CONFIG.obstacleMargin;
    expect(
      Math.hypot(runner.x - bounce.position.x, runner.z - bounce.position.z),
    ).toBeGreaterThanOrEqual(minimumDistance - 1e-6);
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

  it("reflects the player by the collision normal and applies one configured speed boost", () => {
    const normalLength = Math.hypot(1, 1);
    const nx = 1 / normalLength;
    const nz = 1 / normalLength;
    const minDistance =
      bounce.collision.type === "circle"
        ? bounce.collision.radius * bounce.scale + PLAYER.radius + GAME_CONFIG.obstacleMargin
        : 0;
    const incoming = { x: -3, z: -4 };
    const incomingDotNormal = incoming.x * nx + incoming.z * nz;
    const reflected = {
      x: incoming.x - 2 * incomingDotNormal * nx,
      z: incoming.z - 2 * incomingDotNormal * nz,
    };

    put(
      PLAYER,
      bounce.position.x + nx * (minDistance - 0.05),
      bounce.position.z + nz * (minDistance - 0.05),
    );
    PLAYER.vx = incoming.x;
    PLAYER.vz = incoming.z;
    expect(resolveObstacle(PLAYER, bounce)).toBe(true);

    const multiplier = GAME_CONFIG.elasticBounce.playerSpeedMultiplier;
    expect(PLAYER.vx).toBeCloseTo(reflected.x * multiplier, 7);
    expect(PLAYER.vz).toBeCloseTo(reflected.z * multiplier, 7);
    expect(Math.hypot(PLAYER.vx, PLAYER.vz)).toBeCloseTo(
      Math.hypot(incoming.x, incoming.z) * multiplier,
      7,
    );
    expect(WORLD_STATE.bounceImpactId).toBe(1);

    for (let i = 0; i < 6; i++) {
      PLAYER.x = bounce.position.x + nx * (minDistance - 0.05);
      PLAYER.z = bounce.position.z + nz * (minDistance - 0.05);
      resolveObstacle(PLAYER, bounce);
      expect(Math.hypot(PLAYER.vx, PLAYER.vz)).toBeCloseTo(
        Math.hypot(incoming.x, incoming.z) * multiplier,
        7,
      );
    }
    expect(WORLD_STATE.bounceImpactId).toBe(1);
  });

  it("bounces a player Dash, including when Boost is active, without tunneling", () => {
    const minDistance =
      bounce.collision.type === "circle"
        ? bounce.collision.radius + PLAYER.radius + GAME_CONFIG.obstacleMargin
        : 0;
    for (const withBoost of [false, true]) {
      resetSimulation();
      put(PLAYER, bounce.position.x + minDistance + 1.2, bounce.position.z);
      if (withBoost) activatePlayerBoost();
      expect(startPlayerDash({ x: -1, z: 0 })).toBe(true);
      for (let i = 0; i < 12; i++) step(DT, null, noCommands, false);
      expect(WORLD_STATE.bounceImpactId).toBe(1);
      expect(overlapsObstacle(PLAYER.x, PLAYER.z, PLAYER.radius, bounce)).toBe(false);
    }
  });
});

describe("camera-relative movement and reset", () => {
  it.each([
    { name: "W at zero yaw", yaw: 0, input: { x: 0, z: 1 }, world: { x: 0, z: 1 } },
    { name: "S at zero yaw", yaw: 0, input: { x: 0, z: -1 }, world: { x: 0, z: -1 } },
    { name: "A at zero yaw", yaw: 0, input: { x: -1, z: 0 }, world: { x: 1, z: 0 } },
    { name: "D at zero yaw", yaw: 0, input: { x: 1, z: 0 }, world: { x: -1, z: 0 } },
    {
      name: "W at 90 degree yaw",
      yaw: Math.PI / 2,
      input: { x: 0, z: 1 },
      world: { x: 1, z: 0 },
    },
    {
      name: "arbitrary yaw",
      yaw: 0.37,
      input: { x: 0.4, z: 0.9 },
      world: {
        x: -0.4 * Math.cos(0.37) + 0.9 * Math.sin(0.37),
        z: 0.4 * Math.sin(0.37) + 0.9 * Math.cos(0.37),
      },
    },
  ])("maps $name into world movement", ({ yaw, input, world: expected }) => {
    const world = resolveCameraRelativeInput(input, yaw);
    expect(world).not.toBeNull();
    expect(world!.x).toBeCloseTo(expected.x, 7);
    expect(world!.z).toBeCloseTo(expected.z, 7);
  });

  it.each([
    { name: "W", yaw: 0, input: { x: 0, z: 1 }, expected: { x: 0, z: 1 } },
    { name: "S", yaw: 0, input: { x: 0, z: -1 }, expected: { x: 0, z: -1 } },
    { name: "A", yaw: 0, input: { x: -1, z: 0 }, expected: { x: -1, z: 0 } },
    { name: "D", yaw: 0, input: { x: 1, z: 0 }, expected: { x: 1, z: 0 } },
    {
      name: "W after camera turn",
      yaw: Math.PI / 2,
      input: { x: 0, z: 1 },
      expected: { x: 1, z: 0 },
    },
    {
      name: "S after camera turn",
      yaw: Math.PI / 2,
      input: { x: 0, z: -1 },
      expected: { x: -1, z: 0 },
    },
    {
      name: "A after camera turn",
      yaw: Math.PI / 2,
      input: { x: -1, z: 0 },
      expected: { x: 0, z: 1 },
    },
    {
      name: "D after camera turn",
      yaw: Math.PI / 2,
      input: { x: 1, z: 0 },
      expected: { x: 0, z: -1 },
    },
  ])("moves $name in its actual world direction over fixed ticks", ({ yaw, input, expected }) => {
    put(PLAYER, -4, 12);
    PLAYER.heading = yaw;
    WORLD_STATE.cameraYaw = yaw;
    WORLD_STATE.previousCameraYaw = yaw;
    WORLD_STATE.movementCameraYaw = yaw;
    WORLD_STATE.movementInputFrame = null;
    WORLD_STATE.cameraManualRemaining = 0;
    const start = { x: PLAYER.x, z: PLAYER.z };

    for (let tick = 0; tick < 42; tick++) {
      step(
        DT,
        input,
        noCommands,
        false,
        false,
        0,
        "normal",
        { x: 0, y: 0 },
        0,
        `key:${input.x}:${input.z}`,
      );
    }

    const dx = PLAYER.x - start.x;
    const dz = PLAYER.z - start.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(4);
    expect(dx * expected.x + dz * expected.z).toBeGreaterThan(4);
    expect(Math.abs(dx * expected.z - dz * expected.x)).toBeLessThan(0.25);
    expect(PLAYER.speed).toBeGreaterThan(0);
  });

  it.each([
    { name: "A", input: { x: -1, z: 0 }, expected: { x: 1, z: 0 } },
    { name: "D", input: { x: 1, z: 0 }, expected: { x: -1, z: 0 } },
    { name: "S", input: { x: 0, z: -1 }, expected: { x: 0, z: -1 } },
  ])("keeps a held $name trajectory straight while Follow turns", ({ input, expected }) => {
    put(PLAYER, -4, 12);
    PLAYER.heading = 0;
    WORLD_STATE.cameraYaw = 0;
    WORLD_STATE.previousCameraYaw = 0;
    WORLD_STATE.movementCameraYaw = 0;
    WORLD_STATE.movementInputFrame = null;
    const start = { x: PLAYER.x, z: PLAYER.z };
    const positions: Array<{ x: number; z: number }> = [];

    for (let tick = 0; tick < 60; tick++) {
      step(
        DT,
        input,
        noCommands,
        false,
        false,
        0,
        "normal",
        { x: 0, y: 0 },
        0,
        `held:${input.x}:${input.z}`,
      );
      if (tick % 10 === 9) positions.push({ x: PLAYER.x, z: PLAYER.z });
    }

    const dx = PLAYER.x - start.x;
    const dz = PLAYER.z - start.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(7);
    expect(Math.abs(dx * expected.z - dz * expected.x)).toBeLessThan(0.2);
    expect(Math.abs(WORLD_STATE.cameraYaw)).toBeGreaterThan(0.2);
    for (const position of positions) {
      const offsetX = position.x - start.x;
      const offsetZ = position.z - start.z;
      expect(Math.abs(offsetX * expected.z - offsetZ * expected.x)).toBeLessThan(0.2);
    }
  });

  it("turns through a backward reversal smoothly and faces the actual movement", () => {
    put(PLAYER, -4, 12);
    PLAYER.heading = 0;
    WORLD_STATE.cameraYaw = 0;
    WORLD_STATE.previousCameraYaw = 0;
    WORLD_STATE.movementCameraYaw = 0;
    WORLD_STATE.movementInputFrame = null;
    for (let tick = 0; tick < 24; tick++)
      step(DT, { x: 0, z: 1 }, noCommands, false, false, 0, "normal", { x: 0, y: 0 }, 0, "W");
    const startBackward = { x: PLAYER.x, z: PLAYER.z };
    const headingAtSwitch = PLAYER.heading;
    const cameraYawSamples: number[] = [];
    for (let tick = 0; tick < 60; tick++) {
      step(DT, { x: 0, z: -1 }, noCommands, false, false, 0, "normal", { x: 0, y: 0 }, 0, "S");
      cameraYawSamples.push(WORLD_STATE.cameraYaw);
    }
    const angularError = (a: number, b: number) =>
      Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const maxCameraStep = Math.max(
      ...cameraYawSamples.map((yaw, index) =>
        angularError(yaw, index === 0 ? 0 : cameraYawSamples[index - 1]!),
      ),
    );
    expect(angularError(headingAtSwitch, 0)).toBeLessThan(0.1);
    expect(PLAYER.z).toBeLessThan(startBackward.z - 7);
    expect(angularError(PLAYER.heading, Math.PI)).toBeLessThan(0.12);
    expect(maxCameraStep).toBeLessThan(0.25);
  });

  it("keeps manual camera yaw while stationary and resumes Follow smoothly on movement", () => {
    put(PLAYER, -4, 12);
    PLAYER.heading = 1.2;
    WORLD_STATE.cameraYaw = 0;
    WORLD_STATE.previousCameraYaw = 0;
    WORLD_STATE.cameraManualRemaining = 0;
    step(DT, null, noCommands, false, false, 0, "normal", { x: -20, y: -100 });
    expect(PLAYER.heading).toBe(1.2);
    expect(WORLD_STATE.cameraYaw).toBeLessThan(0);
    expect(WORLD_STATE.cameraPitch).toBeLessThan(0);
    const manualYaw = WORLD_STATE.cameraYaw;
    const manualRemaining = WORLD_STATE.cameraManualRemaining;

    for (let tick = 0; tick < 180; tick++) step(DT, null, noCommands, false);
    expect(Math.hypot(PLAYER.vx, PLAYER.vz)).toBeLessThan(
      GAME_CONFIG.camera.followMovementSpeedThreshold,
    );
    expect(WORLD_STATE.cameraYaw).toBeCloseTo(manualYaw, 8);
    expect(WORLD_STATE.cameraManualRemaining).toBeCloseTo(manualRemaining, 8);
    expect(PLAYER.heading).toBeCloseTo(1.2, 8);

    // Positive X input is semantic camera-right and gives the camera a new
    // player heading that is visibly different from the manually selected yaw.
    for (let tick = 0; tick < 45; tick++)
      step(DT, { x: 1, z: 0 }, noCommands, false, false, 0, "normal", { x: 0, y: 0 }, 0, "D");
    expect(WORLD_STATE.cameraManualRemaining).toBe(0);
    const headingAtFollow = PLAYER.heading;
    const yawAtFollow = WORLD_STATE.cameraYaw;
    const angularError = (a: number, b: number) =>
      Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    expect(angularError(headingAtFollow, yawAtFollow)).toBeGreaterThan(0.3);

    const followErrors: number[] = [];
    let largestFollowStep = 0;
    for (let tick = 0; tick < 60; tick++) {
      const before = WORLD_STATE.cameraYaw;
      step(DT, { x: 1, z: 0 }, noCommands, false, false, 0, "normal", { x: 0, y: 0 }, 0, "D");
      const delta = Math.atan2(
        Math.sin(WORLD_STATE.cameraYaw - before),
        Math.cos(WORLD_STATE.cameraYaw - before),
      );
      largestFollowStep = Math.max(largestFollowStep, Math.abs(delta));
      followErrors.push(angularError(PLAYER.heading, WORLD_STATE.cameraYaw));
    }
    expect(angularError(WORLD_STATE.cameraYaw, yawAtFollow)).toBeGreaterThan(0.5);
    expect(angularError(WORLD_STATE.cameraYaw, PLAYER.heading)).toBeLessThan(0.12);
    expect(largestFollowStep).toBeLessThan(0.25);
    for (let index = 31; index < followErrors.length; index++)
      expect(followErrors[index]).toBeLessThanOrEqual(followErrors[index - 1]! + 0.01);
  });

  it("clamps camera pitch and pinch zoom to safe camera bounds", () => {
    WORLD_STATE.cameraDistance = GAME_CONFIG.camera.distance;
    WORLD_STATE.cameraYaw = 0;
    step(DT, null, noCommands, true, false, 0, "normal", { x: 0, y: -1000 });
    expect(WORLD_STATE.cameraPitch).toBe(-10);
    step(DT, null, noCommands, true, false, 0, "normal", { x: 0, y: 1000 });
    expect(WORLD_STATE.cameraPitch).toBe(10);

    step(DT, null, noCommands, true, false, 0, "normal", { x: 0, y: 0 }, 1000);
    expect(WORLD_STATE.cameraDistance).toBe(GAME_CONFIG.camera.tuningRanges.distance.max);
    step(DT, null, noCommands, true, false, 0, "normal", { x: 0, y: 0 }, -1000);
    expect(WORLD_STATE.cameraDistance).toBe(GAME_CONFIG.camera.tuningRanges.distance.min);
    expect(Number.isFinite(WORLD_STATE.cameraDistance)).toBe(true);
  });

  it("rotates W, S, A and D at right-angle and arbitrary camera yaw", () => {
    const wAt90 = { ...resolveCameraRelativeInput({ x: 0, z: 1 }, Math.PI / 2)! };
    const sAt90 = { ...resolveCameraRelativeInput({ x: 0, z: -1 }, Math.PI / 2)! };
    const aAt90 = { ...resolveCameraRelativeInput({ x: -1, z: 0 }, Math.PI / 2)! };
    const dAt90 = { ...resolveCameraRelativeInput({ x: 1, z: 0 }, Math.PI / 2)! };
    expect(wAt90.x).toBeCloseTo(1, 8);
    expect(sAt90.x).toBeCloseTo(-1, 8);
    expect(aAt90.z).toBeCloseTo(-1, 8);
    expect(dAt90.z).toBeCloseTo(1, 8);
    const arbitrary = resolveCameraRelativeInput({ x: 0, z: 1 }, 0.37)!;
    expect(Math.hypot(arbitrary.x, arbitrary.z)).toBeCloseTo(1, 8);
    expect(resolveCameraRelativeInput(null)).toBeNull();
  });

  it("recenters camera yaw toward player heading and holds the yaw in Tactical Overview", () => {
    PLAYER.heading = 1.15;
    WORLD_STATE.cameraYaw = -1.1;
    step(DT, null, noCommands, true, true, 1, "recenter");
    expect(WORLD_STATE.cameraYaw).toBeGreaterThan(-1.1);
    expect(WORLD_STATE.cameraYaw).toBeLessThan(PLAYER.heading);
    expect(PLAYER.heading).toBe(1.15);

    const yaw = WORLD_STATE.cameraYaw;
    step(DT, null, noCommands, true, true, -1, "tactical");
    expect(WORLD_STATE.cameraYaw).toBe(yaw);
    expect(PLAYER.heading).toBe(1.15);
  });

  it("clears all player and world action state on restart", () => {
    activatePlayerBoost();
    startPlayerDash({ x: 1, z: 0 });
    WORLD_STATE.barrierClosed = true;
    resetSimulation();
    expect(PLAYER.dashState).toBe("ready");
    expect(getPlayerBoostState()).toBe("ready");
    expect(WORLD_STATE.barrierClosed).toBe(false);
    expect(AGENTS.every((agent) => agent.hidden === 0)).toBe(true);
  });
});
