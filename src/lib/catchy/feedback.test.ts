import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/store/gameStore";
import {
  dispatchFeedbackTransition,
  playGameSound,
  unlockGameAudio,
  vibrateGame,
  type FeedbackSink,
  type FeedbackTransition,
} from "./feedback";

const base = (): FeedbackTransition => {
  const state = useGameStore.getState();
  return {
    ...state,
    state: "chase",
    caught: 0,
    time: 300,
    dashStatus: "ready",
    speedBoostStatus: "ready",
    boostCueId: 0,
    interactionCueId: 0,
    interactionCueKind: null,
    restartCount: 0,
  };
};

function createSink() {
  const sounds: string[] = [];
  const vibrations: { pattern: number | number[]; cue: string }[] = [];
  const sink: FeedbackSink = {
    sound: (cue) => sounds.push(cue),
    vibrate: (pattern, cue) => vibrations.push({ pattern, cue }),
  };
  return { sink, sounds, vibrations };
}

afterEach(() => vi.unstubAllGlobals());

describe("central feedback transitions", () => {
  it("emits one ACCELERATE event for Dash activation and no frame-based repeats", () => {
    const previous = base();
    const current = { ...previous, dashStatus: "active" as const };
    const { sink, sounds, vibrations } = createSink();
    const deferScore = vi.fn();
    dispatchFeedbackTransition(current, previous, sink, deferScore);
    dispatchFeedbackTransition(current, current, sink, deferScore);
    expect(sounds).toEqual(["dash"]);
    expect(vibrations).toEqual([{ pattern: 18, cue: "dash" }]);
  });

  it.each([
    ["speedPad", "boost"],
    ["elasticBounce", "bounce"],
  ] as const)("routes %s to exactly one %s event", (kind, expectedCue) => {
    const previous = base();
    const current = {
      ...previous,
      boostCueId: kind === "speedPad" ? 1 : previous.boostCueId,
      interactionCueId: 1,
      interactionCueKind: kind,
    };
    const { sink, sounds, vibrations } = createSink();
    dispatchFeedbackTransition(current, previous, sink, vi.fn());
    dispatchFeedbackTransition(current, current, sink, vi.fn());
    expect(sounds).toEqual([expectedCue]);
    expect(vibrations).toHaveLength(1);
    expect(vibrations[0]!.cue).toBe(expectedCue);
  });

  it("emits SLOWED once on slow-zone entry and respects the transition ID", () => {
    const previous = base();
    const current = { ...previous, interactionCueId: 1, interactionCueKind: "slowZone" as const };
    const { sink, sounds } = createSink();
    dispatchFeedbackTransition(current, previous, sink, vi.fn());
    dispatchFeedbackTransition(current, current, sink, vi.fn());
    expect(sounds).toEqual(["slowDown"]);
  });

  it("schedules catch score feedback once and handles countdown, round end, and restart", () => {
    const previous = base();
    const { sink, sounds, vibrations } = createSink();
    const deferScore = vi.fn();
    dispatchFeedbackTransition({ ...previous, caught: 1 }, previous, sink, deferScore);
    dispatchFeedbackTransition({ ...previous, time: 3 }, { ...previous, time: 4 }, sink, vi.fn());
    dispatchFeedbackTransition(
      { ...previous, state: "timeup", restartCount: 1 },
      previous,
      sink,
      vi.fn(),
    );
    expect(deferScore).toHaveBeenCalledTimes(1);
    expect(sounds).toEqual(["catch", "countdown", "roundEnd", "restart"]);
    expect(vibrations.map(({ cue }) => cue)).toEqual(["catch", "countdown", "roundEnd"]);
  });
});

describe("optional browser audio and haptics", () => {
  it("does not throw when vibration is unavailable or the browser rejects it", () => {
    vi.stubGlobal("navigator", {});
    expect(() => vibrateGame(20, "dash")).not.toThrow();
    vi.stubGlobal("navigator", {
      maxTouchPoints: 1,
      vibrate: () => {
        throw new Error("haptics disabled");
      },
    });
    expect(() => vibrateGame(20, "bounce")).not.toThrow();
  });

  it("debounces repeated haptics and safely handles missing audio support", async () => {
    vi.spyOn(performance, "now").mockReturnValue(10_000);
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { maxTouchPoints: 1, vibrate });
    vibrateGame(16, "dash");
    vibrateGame(16, "dash");
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.stubGlobal("window", {
      AudioContext: class {
        constructor() {
          throw new Error("audio unavailable");
        }
      },
    });
    await expect(unlockGameAudio()).resolves.toBeUndefined();
    expect(() => playGameSound("dash")).not.toThrow();
  });
});
