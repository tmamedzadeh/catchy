import { useEffect, useState } from "react";
import { Joystick } from "./Joystick";
import { CAM_DEFAULTS, useGameStore, type GameState } from "@/store/gameStore";

const STATES: { id: GameState; label: string }[] = [
  { id: "chase", label: "Normal chase" },
  { id: "nearby", label: "Runner nearby" },
  { id: "capture", label: "Capture moment" },
  { id: "after", label: "After capture" },
  { id: "timeup", label: "Time up" },
];

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Ability({
  glyph,
  label,
  primary,
  cooldown,
}: {
  glyph: string;
  label: string;
  primary?: boolean;
  cooldown?: string;
}) {
  const [press, setPress] = useState(false);
  return (
    <button
      onPointerDown={() => setPress(true)}
      onPointerUp={() => setPress(false)}
      onPointerLeave={() => setPress(false)}
      aria-label={label}
      className="pointer-events-auto relative grid place-items-center rounded-full font-display text-sprout-ink transition-transform duration-100 active:scale-95"
      style={{
        width: primary ? "var(--btn-ability-primary)" : "var(--btn-ability)",
        height: primary ? "var(--btn-ability-primary)" : "var(--btn-ability)",
        transform: press ? "scale(0.93)" : undefined,
        background: primary
          ? "radial-gradient(circle at 40% 30%, oklch(0.84 0.17 60), oklch(0.68 0.2 38))"
          : "radial-gradient(circle at 40% 30%, oklch(1 0.01 95 / 0.95), oklch(0.93 0.03 90 / 0.85))",
        border: "2px solid oklch(1 0 0 / 0.7)",
        boxShadow: primary
          ? "0 10px 20px -8px oklch(0.6 0.2 38 / 0.8), inset 0 -4px 0 oklch(0.55 0.18 32 / 0.5)"
          : "0 8px 18px -8px oklch(0.34 0.07 152 / 0.5), inset 0 -3px 0 oklch(0.34 0.07 152 / 0.12)",
        color: primary ? "white" : undefined,
      }}
    >
      <span className={primary ? "text-2xl" : "text-xl"}>{glyph}</span>
      {cooldown && (
        <span className="absolute -top-1 -right-1 rounded-full bg-sprout-ink px-1.5 py-0.5 font-display text-[0.6rem] text-white">
          {cooldown}
        </span>
      )}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="pointer-events-auto block">
      <div className="mb-1 flex items-center justify-between font-display text-[0.7rem] tracking-wide text-sprout-ink-soft uppercase">
        <span>{label}</span>
        <span className="text-sprout-accent-2">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sprout-accent [&::-webkit-slider-thumb]:shadow-md"
        style={{
          background: `linear-gradient(90deg, var(--sprout-accent) ${
            ((value - min) / (max - min)) * 100
          }%, oklch(0.34 0.07 152 / 0.15) ${((value - min) / (max - min)) * 100}%)`,
        }}
      />
    </label>
  );
}

export function HUD() {
  const {
    state,
    caught,
    time,
    distance,
    bearing,
    camHeight,
    camAngle,
    setCamHeight,
    setCamAngle,
    resetCamera,
    setState,
    setManualState,
    manualState,
    restart,
  } = useGameStore();

  const [panel, setPanel] = useState(true);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (state === "capture") setFlash((f) => f + 1);
  }, [state]);

  const nearby = state === "nearby" || state === "capture";

  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-body select-none">
      {/* state tints */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: nearby ? 1 : 0,
          background:
            "radial-gradient(ellipse at center, transparent 42%, oklch(0.68 0.2 38 / 0.38) 100%)",
        }}
      />
      {state === "capture" && (
        <div
          key={flash}
          className="absolute inset-0 bg-white"
          style={{ animation: "sprout-flash 420ms ease-out forwards" }}
        />
      )}

      {/* top-left: brand + timer */}
      <div className="absolute top-4 left-4 flex items-center gap-2 sm:top-6 sm:left-6 sm:gap-3">
        <div className="hud-card flex items-center gap-2.5 px-3 py-2 sm:px-4 sm:py-2.5">
          <div
            className="grid size-8 place-items-center rounded-xl text-lg sm:size-9"
            style={{
              background: "radial-gradient(circle at 35% 30%, oklch(0.87 0.19 135), oklch(0.7 0.19 145))",
              boxShadow: "inset 0 -3px 0 oklch(0.5 0.15 150 / 0.45)",
            }}
          >
            🌱
          </div>
          <div className="leading-none">
            <div className="font-display text-base font-semibold text-sprout-ink sm:text-lg">
              Sprout!
            </div>
            <div className="mt-0.5 font-display text-[0.6rem] tracking-[0.18em] text-sprout-ink-soft uppercase sm:text-[0.65rem]">
              Tiny Tag Arena
            </div>
          </div>
        </div>
        <div
          className="hud-card flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5"
          style={time < 10 ? { animation: "sprout-pulse 1s infinite" } : undefined}
        >
          <span className="text-sm">⏱</span>
          <span className="font-display text-lg tabular-nums text-sprout-ink sm:text-xl">
            {fmt(time)}
          </span>
        </div>
      </div>

      {/* top-right: caught counter */}
      <div className="hud-card absolute top-4 right-4 px-3.5 py-2 text-right sm:top-6 sm:right-6 sm:px-4 sm:py-2.5">
        <div className="font-display text-[0.6rem] tracking-[0.18em] text-sprout-ink-soft uppercase sm:text-[0.65rem]">
          Caught
        </div>
        <div
          key={caught}
          className="font-display text-2xl leading-none text-sprout-accent-2 tabular-nums sm:text-3xl"
          style={{ animation: "sprout-pop 320ms ease-out" }}
        >
          {String(caught).padStart(2, "0")}
        </div>
      </div>

      {/* right: target finder */}
      <div className="hud-card absolute top-1/2 right-4 flex -translate-y-1/2 flex-col items-center gap-1.5 px-3 py-3 sm:right-6 sm:px-4">
        <div className="font-display text-[0.58rem] tracking-[0.16em] text-sprout-ink-soft uppercase sm:text-[0.65rem]">
          Find the runner
        </div>
        <div
          className="relative grid size-14 place-items-center rounded-full sm:size-16"
          style={{
            background: "conic-gradient(from 0deg, oklch(0.95 0.04 80), oklch(0.99 0.01 95))",
            boxShadow: "inset 0 0 0 2px oklch(1 0 0 / 0.8)",
          }}
        >
          <div
            className="text-2xl transition-transform duration-150 sm:text-3xl"
            style={{ transform: `rotate(${bearing}rad)` }}
          >
            <span className="block text-sprout-accent-2">➤</span>
          </div>
        </div>
        <div className="font-display text-base text-sprout-ink tabular-nums sm:text-lg">
          {Math.round(distance)} m
        </div>
      </div>

      {/* state banners */}
      <div className="absolute top-20 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 sm:top-24">
        {state === "nearby" && (
          <div
            className="rounded-full px-4 py-1.5 font-display text-sm text-white sm:text-base"
            style={{
              background: "linear-gradient(90deg, oklch(0.72 0.19 45), oklch(0.66 0.21 25))",
              boxShadow: "var(--hud-shadow-soft)",
              animation: "sprout-pop 260ms ease-out",
            }}
          >
            Runner nearby!
          </div>
        )}
        {state === "capture" && (
          <div
            className="font-display text-5xl text-white sm:text-7xl"
            style={{
              textShadow:
                "0 4px 0 oklch(0.66 0.21 25), 0 10px 26px oklch(0.34 0.07 152 / 0.45)",
              animation: "sprout-pop 320ms ease-out",
            }}
          >
            TAG! 💕
          </div>
        )}
        {state === "after" && (
          <div
            className="hud-card px-4 py-2 font-display text-lg text-sprout-ink"
            style={{ animation: "sprout-pop 280ms ease-out" }}
          >
            +1 caught · nice grab!
          </div>
        )}
      </div>

      {/* time up */}
      {state === "timeup" && (
        <div className="absolute inset-0 grid place-items-center bg-sprout-ink/45 backdrop-blur-[2px]">
          <div
            className="hud-card pointer-events-auto w-[min(22rem,86vw)] px-6 py-7 text-center"
            style={{ animation: "sprout-pop 340ms ease-out" }}
          >
            <div className="font-display text-[0.7rem] tracking-[0.22em] text-sprout-ink-soft uppercase">
              Time up
            </div>
            <div className="mt-1 font-display text-4xl text-sprout-ink">Round over</div>
            <div className="mt-3 font-display text-lg text-sprout-accent-2">
              {caught} runner{caught === 1 ? "" : "s"} caught
            </div>
            <button
              onClick={restart}
              className="mt-5 w-full rounded-2xl px-5 py-3 font-display text-lg text-white transition-transform active:scale-95"
              style={{
                background: "linear-gradient(180deg, oklch(0.78 0.18 55), oklch(0.66 0.21 33))",
                boxShadow: "0 10px 20px -8px oklch(0.6 0.2 38 / 0.8), inset 0 -4px 0 oklch(0.55 0.18 32 / 0.55)",
              }}
            >
              Play again
            </button>
          </div>
        </div>
      )}

      {/* bottom-left: joystick */}
      <div className="absolute bottom-5 left-5 sm:bottom-8 sm:left-8">
        <Joystick />
      </div>

      {/* bottom-right: abilities */}
      <div className="absolute right-5 bottom-5 flex items-end gap-3 sm:right-8 sm:bottom-8 sm:gap-4">
        <Ability glyph="👀" label="Scan" cooldown="8" />
        <Ability glyph="⚡" label="Dash" cooldown="3" />
        <Ability glyph="🤗" label="Grab" primary />
      </div>

      {/* prototype / debug controls */}
      <div className="absolute right-4 bottom-32 w-[13.5rem] sm:right-6 sm:bottom-36">
        <button
          onClick={() => setPanel((p) => !p)}
          className="hud-card pointer-events-auto mb-2 ml-auto flex items-center gap-1.5 px-3 py-1.5 font-display text-[0.7rem] tracking-wide text-sprout-ink uppercase"
        >
          🎛 Prototype {panel ? "▾" : "▸"}
        </button>
        {panel && (
          <div className="hud-card space-y-3 p-3.5">
            <Slider
              label="Camera height"
              value={camHeight}
              min={14}
              max={32}
              unit=""
              onChange={setCamHeight}
            />
            <Slider
              label="Camera angle"
              value={camAngle}
              min={45}
              max={75}
              unit="°"
              onChange={setCamAngle}
            />
            <button
              onClick={resetCamera}
              className="pointer-events-auto w-full rounded-xl border border-sprout-ink/15 bg-white/70 px-3 py-1.5 font-display text-xs text-sprout-ink transition-colors hover:bg-white"
            >
              Reset camera ({CAM_DEFAULTS.height} / {CAM_DEFAULTS.angle}°)
            </button>

            <div className="pt-1">
              <div className="mb-1.5 font-display text-[0.7rem] tracking-wide text-sprout-ink-soft uppercase">
                Game state
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STATES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setManualState(true);
                      setState(s.id);
                    }}
                    className="pointer-events-auto rounded-full px-2.5 py-1 font-display text-[0.68rem] transition-colors"
                    style={
                      state === s.id
                        ? { background: "var(--sprout-accent)", color: "white" }
                        : { background: "oklch(0.34 0.07 152 / 0.08)", color: "var(--sprout-ink)" }
                    }
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setManualState(false);
                    setState("chase");
                  }}
                  className="pointer-events-auto rounded-full px-2.5 py-1 font-display text-[0.68rem]"
                  style={
                    manualState
                      ? { background: "oklch(0.34 0.07 152 / 0.08)", color: "var(--sprout-ink)" }
                      : { background: "var(--sprout-cyan)", color: "white" }
                  }
                >
                  Auto
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* hint */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 font-display text-[0.65rem] tracking-wide text-white/75 uppercase">
        Drag the stick or use W A S D · catch all the runners
      </div>
    </div>
  );
}
