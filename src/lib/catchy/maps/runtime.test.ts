import { afterEach, describe, expect, it } from "vitest";
import {
  getNavigationSummary,
  getSimulationMap,
  installMapForSimulation,
  isWalkablePoint,
  isSafeSpawn,
  PLAYER,
  findSafeSpawn,
  resetSimulation,
  respawn,
  resolveWorld,
  RUNNERS,
  step,
  WORLD_STATE,
} from "../agents";
import { GAME_CONFIG } from "../config";
import { DEFAULT_MAP, cloneMap } from "./defaultMap";
import type { MapDefinition } from "./types";
import { validateMap } from "./validator";

afterEach(() => installMapForSimulation(DEFAULT_MAP));

const DT = 1 / GAME_CONFIG.simulation.tickHz;
const NO_COMMANDS = { dash: false, speedBoost: false, jump: false };

function mapAtRadius(radius: number, useDefaultLayout = false): MapDefinition {
  const map = cloneMap(DEFAULT_MAP);
  map.id = `runtime-radius-${radius}`;
  map.arena.radius = radius;
  if (radius === 100 || useDefaultLayout) return map;
  map.objects = [];
  map.decorations = [];
  const offset = radius * 0.25;
  for (const item of map.interactiveObjects) {
    if (item.kind === "speedPad") item.position = { x: -offset, z: 0 };
    else if (item.kind === "slowZone") item.position = { x: offset, z: 0 };
    else if (item.kind === "elasticBounce") item.position = { x: 0, z: -offset };
    else item.position = { x: 0, z: offset };
  }
  return map;
}

describe("active map runtime contract", () => {
  it("rebuilds arena bounds, collisions, navigation, and safe random spawns from one map snapshot", () => {
    const custom = mapAtRadius(34);
    custom.id = "runtime-map";
    custom.objects = [
      {
        id: "center-wall",
        model: "wall-block",
        position: { x: 0, z: 0 },
        rotation: 0,
        scale: 1,
        y: 0,
        collision: { type: "box", width: 2, depth: 2 },
      },
    ];
    expect(validateMap(custom).valid).toBe(true);
    const beforeNavigation = getNavigationSummary();

    installMapForSimulation(custom);

    expect(getSimulationMap()).toMatchObject({ id: "runtime-map", arena: { radius: 34 } });
    expect(getSimulationMap()).not.toHaveProperty("playerSpawn");
    expect(getSimulationMap()).not.toHaveProperty("runnerSpawns");
    const agents = [PLAYER, ...RUNNERS];
    for (const agent of agents) {
      expect(Math.hypot(agent.x, agent.z) + agent.radius).toBeLessThan(34);
      expect(isSafeSpawn(agent, agent.x, agent.z)).toBe(true);
    }
    for (const runner of RUNNERS)
      expect(Math.hypot(runner.x - PLAYER.x, runner.z - PLAYER.z)).toBeGreaterThanOrEqual(
        GAME_CONFIG.npc.minSpawnDistanceFromPlayer,
      );
    expect(isWalkablePoint(0, 0, GAME_CONFIG.player.radius)).toBe(false);
    expect(isWalkablePoint(32.5, 0, GAME_CONFIG.player.radius)).toBe(true);
    // The source map is R100; installing this R34 map must rebuild to a smaller grid.
    expect(getNavigationSummary().nodes).toBeLessThan(beforeNavigation.nodes);
  });

  it("installs radius 100 with a usable navigation grid, safe spawns, and boundary collision", () => {
    const custom = mapAtRadius(100);
    custom.id = "radius-one-hundred";
    expect(validateMap(custom).valid).toBe(true);

    installMapForSimulation(custom);

    expect(getSimulationMap().arena.radius).toBe(100);
    const navigation = getNavigationSummary();
    expect(navigation.nodes).toBeGreaterThan(5_000);
    expect(navigation.components).toBe(1);
    expect(isWalkablePoint(90, 0, GAME_CONFIG.npc.radius)).toBe(true);
    expect(isWalkablePoint(99.7, 0, GAME_CONFIG.npc.radius)).toBe(false);
    for (const agent of [PLAYER, ...RUNNERS]) {
      expect(Math.hypot(agent.x, agent.z) + agent.radius).toBeLessThan(100);
      expect(isSafeSpawn(agent, agent.x, agent.z)).toBe(true);
    }

    PLAYER.x = 120;
    PLAYER.z = 0;
    PLAYER.vx = 1;
    PLAYER.vz = 0;
    resolveWorld(PLAYER);
    expect(PLAYER.x).toBeCloseTo(100 - PLAYER.radius);
    expect(PLAYER.vx).toBe(0);
  });

  for (const radius of [30, 60, 80, 100]) {
    it(`keeps random spawns, active barriers, and respawns safe at R${radius}`, () => {
      const custom = mapAtRadius(radius);
      custom.id = `spawn-radius-${radius}`;
      expect(validateMap(custom).valid).toBe(true);
      installMapForSimulation(custom);

      let seed = radius;
      const random = () => {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        return seed / 0x1_0000_0000;
      };
      resetSimulation(random);
      const agents = [PLAYER, ...RUNNERS];
      for (const agent of agents) {
        expect(Math.hypot(agent.x, agent.z) + agent.radius).toBeLessThan(radius);
        expect(isSafeSpawn(agent, agent.x, agent.z)).toBe(true);
      }
      for (const runner of RUNNERS) {
        expect(Math.hypot(runner.x - PLAYER.x, runner.z - PLAYER.z)).toBeGreaterThanOrEqual(
          GAME_CONFIG.npc.minSpawnDistanceFromPlayer,
        );
      }
      for (let first = 0; first < RUNNERS.length; first++) {
        for (let second = first + 1; second < RUNNERS.length; second++) {
          const a = RUNNERS[first]!;
          const b = RUNNERS[second]!;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
            a.radius + b.radius + GAME_CONFIG.npc.spawnSeparation,
          );
        }
      }

      WORLD_STATE.barrierClosed = true;
      const barrierSafePoint = findSafeSpawn(PLAYER, random);
      expect(isSafeSpawn(PLAYER, barrierSafePoint.x, barrierSafePoint.z)).toBe(true);
      WORLD_STATE.barrierClosed = false;

      const runner = RUNNERS[0]!;
      respawn(runner);
      for (let tick = 0; tick < 43; tick++) step(DT, null, NO_COMMANDS, true);
      expect(runner.state).toBe("flee");
      expect(runner.hidden).toBe(0);
      expect(isSafeSpawn(runner, runner.x, runner.z)).toBe(true);
    });
  }
});
