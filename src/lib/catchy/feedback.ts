import { useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { GAME_CONFIG } from "./config";

type Cue =
  | "nearby"
  | "catch"
  | "score"
  | "countdown"
  | "roundEnd"
  | "button"
  | "restart"
  | "dash"
  | "boost"
  | "slowDown"
  | "bounce";

type Note = {
  frequency: number;
  duration: number;
  delay?: number;
  volume?: number;
  wave?: OscillatorType;
};

const CUES: Record<Cue, { cooldown: number; notes: Note[] }> = {
  nearby: {
    cooldown: 1300,
    notes: [
      { frequency: 440, duration: 0.09, volume: 0.12 },
      { frequency: 590, duration: 0.11, delay: 0.07, volume: 0.1 },
    ],
  },
  catch: {
    cooldown: 300,
    notes: [
      { frequency: 520, duration: 0.13, volume: 0.2 },
      { frequency: 690, duration: 0.17, delay: 0.06, volume: 0.17 },
    ],
  },
  score: {
    cooldown: 500,
    notes: [
      { frequency: 880, duration: 0.11, volume: 0.11 },
      { frequency: 1175, duration: 0.15, delay: 0.08, volume: 0.09 },
    ],
  },
  countdown: { cooldown: 700, notes: [{ frequency: 620, duration: 0.07, volume: 0.075 }] },
  roundEnd: {
    cooldown: 1200,
    notes: [
      { frequency: 620, duration: 0.16, volume: 0.12 },
      { frequency: 494, duration: 0.2, delay: 0.12, volume: 0.11 },
      { frequency: 392, duration: 0.28, delay: 0.27, volume: 0.1 },
    ],
  },
  button: { cooldown: 90, notes: [{ frequency: 500, duration: 0.045, volume: 0.055 }] },
  restart: {
    cooldown: 400,
    notes: [
      { frequency: 520, duration: 0.1, volume: 0.1 },
      { frequency: 780, duration: 0.13, delay: 0.08, volume: 0.09 },
    ],
  },
  dash: {
    cooldown: 180,
    notes: [
      { frequency: 310, duration: 0.07, volume: 0.1, wave: "triangle" },
      { frequency: 740, duration: 0.1, delay: 0.025, volume: 0.075, wave: "sine" },
    ],
  },
  boost: {
    cooldown: 220,
    notes: [
      { frequency: 470, duration: 0.07, volume: 0.09, wave: "triangle" },
      { frequency: 680, duration: 0.11, delay: 0.035, volume: 0.08, wave: "sine" },
    ],
  },
  slowDown: {
    cooldown: 420,
    notes: [
      { frequency: 360, duration: 0.11, volume: 0.07, wave: "triangle" },
      { frequency: 260, duration: 0.13, delay: 0.06, volume: 0.06, wave: "sine" },
    ],
  },
  bounce: {
    cooldown: 180,
    notes: [
      { frequency: 270, duration: 0.075, volume: 0.12, wave: "triangle" },
      { frequency: 590, duration: 0.12, delay: 0.035, volume: 0.09, wave: "sine" },
    ],
  },
};

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let resumePromise: Promise<void> | null = null;
let activeVoices = 0;
const lastPlayed = new Map<Cue, number>();
const lastVibrated = new Map<Cue, number>();
const MAX_ACTIVE_VOICES = 6;
let lastVibrationAt = -Infinity;

function getAudioContext() {
  if (audioContext || typeof window === "undefined") return audioContext;
  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return null;
    audioContext = new AudioContextConstructor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.18;
    masterGain.connect(audioContext.destination);
  } catch {
    audioContext = null;
    masterGain = null;
  }
  return audioContext;
}

/** Create/resume audio only from a user gesture so autoplay policies are respected. */
export function unlockGameAudio() {
  const context = getAudioContext();
  if (!context || context.state === "running") return Promise.resolve();
  if (!resumePromise) {
    resumePromise = context
      .resume()
      .catch(() => undefined)
      .finally(() => {
        resumePromise = null;
      });
  }
  return resumePromise;
}

function playNotes(context: AudioContext, notes: Note[]) {
  const output = masterGain;
  if (!output || context.state !== "running") return;

  for (const note of notes) {
    if (activeVoices >= MAX_ACTIVE_VOICES) break;
    try {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const startAt = context.currentTime + (note.delay ?? 0);
      const stopAt = startAt + note.duration;
      const peak = note.volume ?? 0.1;
      oscillator.type = note.wave ?? "sine";
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.linearRampToValueAtTime(peak, startAt + Math.min(0.015, note.duration * 0.3));
      envelope.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      oscillator.connect(envelope);
      envelope.connect(output);
      activeVoices++;
      oscillator.onended = () => {
        activeVoices = Math.max(0, activeVoices - 1);
        oscillator.disconnect();
        envelope.disconnect();
      };
      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.01);
    } catch {
      // Audio is optional; an unavailable device or suspended context must not affect play.
    }
  }
}

export function playGameSound(cue: Cue) {
  const now = typeof performance === "undefined" ? Date.now() : performance.now();
  const previous = lastPlayed.get(cue) ?? -Infinity;
  if (now - previous < CUES[cue].cooldown) return;
  lastPlayed.set(cue, now);

  const context = audioContext;
  if (!context) return;
  if (context.state !== "running") {
    void unlockGameAudio().then(() => {
      if (audioContext?.state === "running") playNotes(audioContext, CUES[cue].notes);
    });
    return;
  }
  playNotes(context, CUES[cue].notes);
}

export function vibrateGame(pattern: number | number[], cue: Cue) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  let hasTouch = navigator.maxTouchPoints > 0;
  try {
    hasTouch ||=
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return;
  }
  if (!hasTouch) return;
  const now = typeof performance === "undefined" ? Date.now() : performance.now();
  const previous = lastVibrated.get(cue) ?? -Infinity;
  if (now - previous < CUES[cue].cooldown || now - lastVibrationAt < 80) return;
  lastVibrated.set(cue, now);
  lastVibrationAt = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Haptics are optional and must never interrupt a round.
  }
}

/** Store transitions and button clicks are the only sources of game sounds. */
export function GameFeedback() {
  useEffect(() => {
    const unlock = () => void unlockGameAudio();
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("button, [role='button']");
      if (
        !button ||
        button.matches("[data-sound='restart'], [data-sound='dash'], [data-sound='boost']")
      )
        return;
      playGameSound("button");
    };

    window.addEventListener("pointerdown", unlock, { passive: true, capture: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock, true);
    document.addEventListener("click", onClick, true);

    const unsubscribe = useGameStore.subscribe((current, previous) => {
      if (current.state === "nearby" && previous.state !== "nearby") {
        playGameSound("nearby");
      }
      if (current.caught > previous.caught) {
        playGameSound("catch");
        window.setTimeout(() => playGameSound("score"), 110);
        vibrateGame(24, "catch");
      }

      const previousSecond = Math.ceil(previous.time);
      const currentSecond = Math.ceil(current.time);
      if (currentSecond !== previousSecond && currentSecond <= 10 && currentSecond > 0) {
        playGameSound("countdown");
        if (currentSecond <= 3) vibrateGame(12, "countdown");
      }

      if (current.state === "timeup" && previous.state !== "timeup") {
        playGameSound("roundEnd");
        vibrateGame([18, 22, 18], "roundEnd");
      }
      if (current.dashStatus === "active" && previous.dashStatus !== "active") {
        playGameSound("dash");
        vibrateGame(GAME_CONFIG.player.dash.hapticMs, "dash");
      }
      const speedPadTriggered =
        current.interactionCueId > previous.interactionCueId &&
        current.interactionCueKind === "speedPad";
      if (current.boostCueId > previous.boostCueId && !speedPadTriggered) {
        playGameSound("boost");
        vibrateGame(GAME_CONFIG.player.speedBoost.hapticMs, "boost");
      }
      if (current.interactionCueId > previous.interactionCueId) {
        if (current.interactionCueKind === "speedPad") {
          playGameSound("boost");
          vibrateGame(GAME_CONFIG.player.speedBoost.hapticMs, "boost");
        } else if (current.interactionCueKind === "slowZone") {
          playGameSound("slowDown");
          vibrateGame(12, "slowDown");
        } else if (current.interactionCueKind === "elasticBounce") {
          playGameSound("bounce");
          vibrateGame(24, "bounce");
        }
      }
      if (current.restartCount > previous.restartCount) playGameSound("restart");
    });

    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock, true);
      document.removeEventListener("click", onClick, true);
      unsubscribe();
    };
  }, []);

  return null;
}
