import { beforeEach, describe, expect, it } from "vitest";
import { AGENTS, PLAYER, RUNNERS, WORLD_STATE, getPlayerBoostState } from "./agents";
import { GAME_CONFIG } from "./config";
import {
  advanceSimulationFrame,
  resetSimulationRuntime,
  setSimulationEnabled,
  SIMULATION_FIXED_DT,
} from "./runtime";
import {
  clearInput,
  installInputEventListeners,
  requestPlayerDash,
  requestPlayerJump,
  requestPlayerSpeedBoost,
  setGameplayInputEnabled,
} from "./input";
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
  setGameplayInputEnabled(true);
  setSimulationEnabled(true);
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
    requestPlayerJump();
    stepTicks(1);
    expect(PLAYER.jumpHeight).toBeGreaterThan(0);
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
    expect(PLAYER.jumpElapsed).toBe(0);
    expect(PLAYER.jumpHeight).toBe(0);
    expect(getPlayerBoostState()).toBe("ready");
    expect(RUNNERS.every((agent) => agent.hidden === 0)).toBe(true);
    expect(useGameStore.getState().restartCount).toBe(restartCount + 1);
  });

  it("restores camera tuning defaults and keeps composition offset separate", () => {
    const store = useGameStore.getState();
    store.setCamDistance(31.8);
    store.setCamPitch(63.4);
    store.setCamLookAhead(4.2);
    store.setCamCompositionOffset(0.21);
    store.setCamFollowYawSpeed(7.1);
    store.setCamTurnAnticipation(12);
    store.setCamFollowResumeSpeed(5.3);
    expect(useGameStore.getState().camDistance).toBe(32);
    expect(WORLD_STATE.cameraDistance).toBe(32);
    expect(useGameStore.getState().camPitch).toBe(63);
    expect(useGameStore.getState().camLookAhead).toBe(4.2);
    expect(useGameStore.getState().camCompositionOffset).toBe(0.21);
    expect(WORLD_STATE.cameraFollowYawSpeed).toBe(7);
    expect(WORLD_STATE.cameraTurnAnticipation).toBe(12);
    expect(WORLD_STATE.cameraFollowResumeSpeed).toBe(5.25);
    useGameStore.getState().resetCamera();
    expect(useGameStore.getState()).toMatchObject({
      camDistance: CAM_DEFAULTS.distance,
      camPitch: CAM_DEFAULTS.pitch,
      camLookAhead: CAM_DEFAULTS.lookAhead,
      camCompositionOffset: CAM_DEFAULTS.compositionOffset,
      camFollowYawSpeed: CAM_DEFAULTS.followYawSpeed,
      camTurnAnticipation: CAM_DEFAULTS.turnAnticipation,
      camFollowResumeSpeed: CAM_DEFAULTS.followResumeSpeed,
    });
    expect(WORLD_STATE.cameraYaw).toBe(PLAYER.heading);
    expect(WORLD_STATE.cameraDistance).toBe(CAM_DEFAULTS.distance);
    expect(WORLD_STATE.cameraPitch).toBe(0);
    expect(WORLD_STATE.cameraManualRemaining).toBe(0);
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

  it("does not advance the timer, player, or NPCs until the ready signal enables simulation", () => {
    const playerStart = { x: PLAYER.x, z: PLAYER.z };
    const runnerStart = { x: RUNNERS[0]!.x, z: RUNNERS[0]!.z };
    const timeStart = useGameStore.getState().time;
    setSimulationEnabled(false);
    const result = advanceSimulationFrame(10_000);
    expect(result.ticks).toBe(0);
    expect(useGameStore.getState().time).toBe(timeStart);
    expect({ x: PLAYER.x, z: PLAYER.z }).toEqual(playerStart);
    expect({ x: RUNNERS[0]!.x, z: RUNNERS[0]!.z }).toEqual(runnerStart);
    setSimulationEnabled(true);
    stepTicks(GAME_CONFIG.simulation.tickHz + 1);
    expect(useGameStore.getState().time).toBeLessThan(timeStart);
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

  it("starts Jump through one fixed simulation tick and clears it on input reset", () => {
    requestPlayerJump();
    stepTicks(1);
    expect(PLAYER.jumpActivationId).toBe(1);
    expect(PLAYER.jumpHeight).toBeGreaterThan(0);
    clearInput();
    expect(PLAYER.jumpElapsed).toBe(0);
    expect(PLAYER.jumpHeight).toBe(0);
  });

  it("clears active and queued Jump state when visibility is lost", () => {
    requestPlayerJump();
    stepTicks(1);
    expect(PLAYER.jumpHeight).toBeGreaterThan(0);
    requestPlayerJump();

    const browserWindow = new EventTarget() as unknown as Window;
    let hidden = false;
    const browserDocument = new EventTarget() as unknown as Document;
    Object.defineProperty(browserDocument, "hidden", { get: () => hidden });
    const removeListeners = installInputEventListeners(browserWindow, browserDocument);
    hidden = true;
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    expect(PLAYER.jumpElapsed).toBe(0);
    expect(PLAYER.jumpHeight).toBe(0);
    removeListeners();
    stepTicks(2);
    expect(PLAYER.jumpActivationId).toBe(1);
  });

  it("discards a buffered Jump during capture presentation and after timeup", () => {
    place(PLAYER, 0, 0);
    place(RUNNERS[0]!, 1, 0);
    place(RUNNERS[1]!, 15, 12);
    place(RUNNERS[2]!, -15, 12);
    stepTicks(1);
    expect(useGameStore.getState().state).toBe("capture");
    requestPlayerJump();
    stepTicks(1);
    expect(useGameStore.getState().state).toBe("capture");
    expect(PLAYER.jumpActivationId).toBe(0);

    useGameStore.getState().setState("timeup");
    requestPlayerJump();
    stepTicks(1);
    expect(PLAYER.jumpActivationId).toBe(0);
    expect(PLAYER.jumpHeight).toBe(0);
  });

  it("drops stale capture presentation clocks after the round restarts", () => {
    place(PLAYER, 0, 0);
    place(RUNNERS[0]!, 1, 0);
    place(RUNNERS[1]!, 15, 12);
    place(RUNNERS[2]!, -15, 12);
    stepTicks(1);
    expect(useGameStore.getState().state).toBe("capture");

    useGameStore.getState().restart();
    stepTicks(1);
    expect(useGameStore.getState().state).toBe("chase");
    expect(useGameStore.getState().capture).toBeNull();
    expect(useGameStore.getState().caught).toBe(0);
    expect(RUNNERS.every((runner) => runner.hidden === 0)).toBe(true);
  });
});
