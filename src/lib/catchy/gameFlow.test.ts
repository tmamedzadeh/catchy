import { beforeEach, describe, expect, it } from "vitest";
import { AGENTS, PLAYER, RUNNERS, WORLD_STATE, getPlayerBoostState } from "./agents";
import { GAME_CONFIG } from "./config";
import { advanceSimulationFrame, resetSimulationRuntime, SIMULATION_FIXED_DT } from "./runtime";
import { requestPlayerDash, requestPlayerSpeedBoost } from "./input";
import { CAM_DEFAULTS, useGameStore } from "@/store/gameStore";

function place(agent: (typeof AGENTS)[number], x: number, z: number) {
  agent.x = x;
  agent.z = z;
  agent.previousX = x;
  agent.previousZ = z;
  agent.lastX = x;
  agent.lastZ = z;
  agent.vx = 0;
  agent.vz = 0;
  agent.speed = 0;
  agent.hidden = 0;
}

function stepTicks(count: number) {
  for (let i = 0; i < count; i++) advanceSimulationFrame(SIMULATION_FIXED_DT);
}

beforeEach(() => {
  useGameStore.getState().restart();
  resetSimulationRuntime();
});

describe("round, capture, score, and respawn flow", () => {
  it("starts a 300-second round and expires into the round-end state", () => {
    expect(useGameStore.getState().time).toBe(300);
    expect(GAME_CONFIG.roundSeconds).toBe(300);
    useGameStore.getState().tick(GAME_CONFIG.roundSeconds);
    expect(useGameStore.getState().time).toBe(0);
    expect(useGameStore.getState().state).toBe("timeup");
  });

  it("captures once with an ID and world-position snapshot, then delays respawn", () => {
    place(PLAYER, -4, 12);
    place(RUNNERS[0]!, -2.55, 12);
    place(RUNNERS[1]!, -19, 0);
    place(RUNNERS[2]!, 20, 0);

    stepTicks(1);
    let game = useGameStore.getState();
    expect(game.state).toBe("capture");
    expect(game.caught).toBe(1);
    expect(game.capture?.runnerId).toBe(RUNNERS[0]!.id);
    expect(game.capture?.position.x).toBe(RUNNERS[0]!.x);
    expect(game.capture?.position.z).toBe(RUNNERS[0]!.z);
    expect(RUNNERS[0]!.hidden).toBe(0);

    stepTicks(80);
    game = useGameStore.getState();
    expect(game.caught).toBe(1);
    expect(game.capture).toBeNull();
    expect(game.state).not.toBe("capture");
    expect(RUNNERS[0]!.respawns).toBe(1);
    expect(RUNNERS[0]!.hidden).toBeGreaterThan(0);
    stepTicks(Math.ceil(GAME_CONFIG.npc.respawnDelay / SIMULATION_FIXED_DT) + 1);
    expect(RUNNERS[0]!.hidden).toBe(0);
    expect(RUNNERS[0]!.state).toBe("flee");
  });

  it("locks the captured target during presentation and finishes cleanly at round end", () => {
    place(PLAYER, -4, 12);
    place(RUNNERS[0]!, -2.55, 12);
    place(RUNNERS[1]!, -19, 0);
    place(RUNNERS[2]!, 20, 0);
    stepTicks(1);
    expect(useGameStore.getState().capture?.runnerId).toBe(RUNNERS[0]!.id);
    useGameStore.getState().tick(GAME_CONFIG.roundSeconds);
    expect(useGameStore.getState().time).toBe(0);
    expect(useGameStore.getState().state).toBe("capture");
    stepTicks(80);
    expect(useGameStore.getState().capture).toBeNull();
    expect(useGameStore.getState().state).toBe("timeup");
  });
});

describe("restart and action reset", () => {
  it("clears active Dash, Boost, capture, input, and hidden runner state", () => {
    requestPlayerDash();
    requestPlayerSpeedBoost();
    const runner = RUNNERS[0]!;
    useGameStore.getState().beginCapture({
      runnerId: runner.id,
      position: { x: runner.x, y: 0, z: runner.z },
      capturedAt: 1,
    });
    runner.hidden = 9;
    const restartCount = useGameStore.getState().restartCount;
    useGameStore.getState().restart();
    resetSimulationRuntime();
    const game = useGameStore.getState();
    expect(game.state).toBe("chase");
    expect(game.capture).toBeNull();
    expect(game.caught).toBe(0);
    expect(game.time).toBe(300);
    expect(game.dashStatus).toBe("ready");
    expect(game.speedBoostStatus).toBe("ready");
    expect(PLAYER.dashState).toBe("ready");
    expect(getPlayerBoostState()).toBe("ready");
    expect(RUNNERS.every((agent) => agent.hidden === 0)).toBe(true);
    expect(useGameStore.getState().restartCount).toBe(restartCount + 1);
  });

  it("restores camera tuning defaults and keeps composition offset separate", () => {
    const store = useGameStore.getState();
    store.setCamHeight(31.8);
    store.setCamAngle(63.4);
    store.setCamLookAhead(4.2);
    store.setCamCompositionOffset(0.21);
    expect(useGameStore.getState().camHeight).toBe(32);
    expect(useGameStore.getState().camAngle).toBe(63);
    expect(useGameStore.getState().camLookAhead).toBe(4.2);
    expect(useGameStore.getState().camCompositionOffset).toBe(0.21);
    useGameStore.getState().resetCamera();
    expect(useGameStore.getState()).toMatchObject({
      camHeight: CAM_DEFAULTS.distance,
      camAngle: CAM_DEFAULTS.angle,
      camLookAhead: CAM_DEFAULTS.lookAhead,
      camCompositionOffset: CAM_DEFAULTS.compositionOffset,
    });
    expect(WORLD_STATE.cameraYaw).toBe(PLAYER.heading);
  });
});

describe("simulation runtime fixed-tick integration", () => {
  it("uses accumulator ticks and discards excess stall time at the configured cap", () => {
    const before = PLAYER.x;
    const result = advanceSimulationFrame(100);
    expect(result.ticks).toBe(GAME_CONFIG.simulation.maxCatchUpSteps);
    expect(result.alpha).toBeLessThan(1);
    expect(Math.hypot(PLAYER.x - before, PLAYER.z - 12)).toBeLessThan(2);
  });

  it("applies movement commands through the same runtime path", () => {
    const startZ = PLAYER.z;
    stepTicks(1);
    requestPlayerDash();
    stepTicks(1);
    expect(PLAYER.dashState).toBe("active");
    expect(PLAYER.z).not.toBe(startZ);
    requestPlayerSpeedBoost();
    stepTicks(1);
    expect(getPlayerBoostState()).toBe("active");
    stepTicks(15);
    expect(PLAYER.dashState).toBe("cooldown");
  });
});
