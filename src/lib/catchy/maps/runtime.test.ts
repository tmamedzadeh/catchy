import { afterEach, describe, expect, it } from "vitest";
import {
  getNavigationSummary,
  getSimulationMap,
  installMapForSimulation,
  isWalkablePoint,
  PLAYER,
  RUNNERS,
} from "../agents";
import { GAME_CONFIG } from "../config";
import { DEFAULT_MAP, cloneMap } from "./defaultMap";
import { validateMap } from "./validator";

afterEach(() => installMapForSimulation(DEFAULT_MAP));

describe("active map runtime contract", () => {
  it("rebuilds arena bounds, collisions, navigation, and spawns from one map snapshot", () => {
    const custom = cloneMap(DEFAULT_MAP);
    custom.id = "runtime-map";
    custom.arena.radius = 34;
    custom.playerSpawn = { x: 0, z: 24 };
    custom.runnerSpawns = [
      { id: "pink", x: -20, z: 0 },
      { id: "purple", x: 20, z: 0 },
      { id: "orange", x: 0, z: -20 },
    ];
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
    expect(PLAYER).toMatchObject({ x: 0, z: 24 });
    expect(RUNNERS.map(({ id, x, z }) => ({ id, x, z }))).toEqual([
      { id: "pink", x: -20, z: 0 },
      { id: "purple", x: 20, z: 0 },
      { id: "orange", x: 0, z: -20 },
    ]);
    expect(isWalkablePoint(0, 0, GAME_CONFIG.player.radius)).toBe(false);
    expect(isWalkablePoint(32.5, 0, GAME_CONFIG.player.radius)).toBe(true);
    expect(getNavigationSummary().nodes).toBeGreaterThan(beforeNavigation.nodes);
  });
});
