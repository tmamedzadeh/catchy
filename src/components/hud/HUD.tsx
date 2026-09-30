import { useEffect, useMemo, useState } from "react";
import { Joystick } from "./Joystick";
import { CAM_DEFAULTS, useGameStore } from "@/store/gameStore";

const ClockIcon = (
  <svg
    viewBox="0 0 24 24"
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

function fmt(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="pointer-events-auto block">
      <div className="mb-1 flex items-center justify-between font-display text-[0.7rem] tracking-wide text-sprout-ink-soft uppercase">
        <span>{label}</span>
        <span className="text-sprout-accent-2">
          {unit === "°" ? value.toFixed(0) : value.toFixed(1)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sprout-accent [&::-webkit-slider-thumb]:shadow-md"
        style={{
          background: `linear-gradient(90deg, var(--sprout-accent) ${progress}%, oklch(0.34 0.07 152 / 0.15) ${progress}%)`,
        }}
      />
    </label>
  );
}

export function HUD() {
  const state = useGameStore((s) => s.state);
  const caught = useGameStore((s) => s.caught);
  const time = useGameStore((s) => s.time);
  const distance = useGameStore((s) => s.distance);
  const bearing = useGameStore((s) => s.bearing);
  const targetId = useGameStore((s) => s.targetId);
  const camHeight = useGameStore((s) => s.camHeight);
  const camAngle = useGameStore((s) => s.camAngle);
  const setCamHeight = useGameStore((s) => s.setCamHeight);
  const setCamAngle = useGameStore((s) => s.setCamAngle);
  const resetCamera = useGameStore((s) => s.resetCamera);
  const cameraYaw = useGameStore((s) => s.cameraYaw);
  const playerX = useGameStore((s) => s.playerX);
  const playerZ = useGameStore((s) => s.playerZ);
  const playerSpeed = useGameStore((s) => s.playerSpeed);
  const runners = useGameStore((s) => s.runners);
  const restart = useGameStore((s) => s.restart);
  const debugMode = useMemo(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "true",
    [],
  );
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (state === "capture") setFlash((version) => version + 1);
  }, [state]);

  const nearby = state === "nearby" || state === "capture";

  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-body select-none">
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

      {/* Catchy branding and round timer */}
      <div className="absolute top-4 left-4 flex items-center gap-2 sm:top-6 sm:left-6 sm:gap-3">
        <div className="hud-card flex items-center gap-2.5 px-3 py-2 sm:px-4 sm:py-2.5">
          <div
            className="grid size-8 place-items-center rounded-xl font-display text-xl font-bold text-white sm:size-9"
            style={{
              background:
                "radial-gradient(circle at 35% 30%, oklch(0.84 0.17 60), oklch(0.68 0.2 38))",
              boxShadow: "inset 0 -3px 0 oklch(0.5 0.15 150 / 0.25)",
            }}
          >
            C
          </div>
          <div className="leading-none">
            <div className="font-display text-base font-semibold text-sprout-ink sm:text-lg">
              Catchy
            </div>
            <div className="mt-0.5 hidden font-display text-[0.6rem] tracking-[0.18em] text-sprout-ink-soft uppercase min-[420px]:block sm:text-[0.65rem]">
              Tag arena
            </div>
          </div>
        </div>
        <div
          className="hud-card flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5"
          style={time < 10 ? { animation: "sprout-pulse 1s infinite" } : undefined}
        >
          <span className="text-sprout-accent-2">{ClockIcon}</span>
          <span className="font-display text-lg tabular-nums text-sprout-ink sm:text-xl">
            {fmt(time)}
          </span>
        </div>
      </div>

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

      {/* Camera-relative nearest-runner finder; neutral when all runners are unavailable. */}
      <div className="hud-card absolute top-1/2 right-4 flex -translate-y-1/2 flex-col items-center gap-1.5 px-3 py-3 sm:right-6 sm:px-4">
        <div className="font-display text-[0.58rem] tracking-[0.16em] text-sprout-ink-soft uppercase sm:text-[0.65rem]">
          {targetId ? "Nearest runner" : "No target"}
        </div>
        <div
          className="relative grid size-14 place-items-center rounded-full sm:size-16"
          style={{
            background: "conic-gradient(from 0deg, oklch(0.95 0.04 80), oklch(0.99 0.01 95))",
            boxShadow: "inset 0 0 0 2px oklch(1 0 0 / 0.8)",
          }}
        >
          {targetId ? (
            <svg
              viewBox="0 0 24 24"
              className="size-8 transition-transform duration-100 sm:size-9"
              style={{ transform: `rotate(${bearing}rad)` }}
              fill="currentColor"
              aria-label="Direction to nearest runner"
            >
              <path d="M12 3.2 18.4 19 12 15.4 5.6 19 12 3.2Z" className="text-sprout-accent-2" />
            </svg>
          ) : (
            <span className="font-display text-2xl text-sprout-ink-soft">·</span>
          )}
        </div>
        <div className="font-display text-base text-sprout-ink tabular-nums sm:text-lg">
          {distance === null ? "—" : `${Math.round(distance)} m`}
        </div>
      </div>

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
              textShadow: "0 4px 0 oklch(0.66 0.21 25), 0 10px 26px oklch(0.34 0.07 152 / 0.45)",
              animation: "sprout-pop 320ms ease-out",
            }}
          >
            TAG!
          </div>
        )}
        {state === "after" && (
          <div
            className="hud-card px-4 py-2 font-display text-lg text-sprout-ink"
            style={{ animation: "sprout-pop 280ms ease-out" }}
          >
            +1 caught · nice tag!
          </div>
        )}
      </div>

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
                boxShadow:
                  "0 10px 20px -8px oklch(0.6 0.2 38 / 0.8), inset 0 -4px 0 oklch(0.55 0.18 32 / 0.55)",
              }}
            >
              Play again
            </button>
          </div>
        </div>
      )}

      <div className="touch-controls absolute bottom-5 left-5 sm:bottom-8 sm:left-8">
        <Joystick />
      </div>

      {debugMode && (
        <div className="hud-card pointer-events-auto absolute top-24 left-4 w-[min(14rem,88vw)] space-y-3 p-3.5 sm:top-28 sm:left-6">
          <div className="font-display text-[0.72rem] font-semibold tracking-[0.14em] text-sprout-ink uppercase">
            Camera tuning
          </div>
          <Slider
            label="Height / zoom"
            value={camHeight}
            min={14}
            max={32}
            step={0.5}
            unit=""
            onChange={setCamHeight}
          />
          <Slider
            label="Angle"
            value={camAngle}
            min={10}
            max={75}
            step={1}
            unit="°"
            onChange={setCamAngle}
          />
          <button
            onClick={resetCamera}
            className="w-full rounded-xl border border-sprout-ink/15 bg-white/70 px-3 py-1.5 font-display text-xs text-sprout-ink transition-colors hover:bg-white"
          >
            Reset camera ({CAM_DEFAULTS.height.toFixed(1)} / {CAM_DEFAULTS.angle}°)
          </button>
          <div className="border-t border-sprout-ink/10 pt-2 font-body text-[0.64rem] leading-relaxed text-sprout-ink-soft">
            <div>Camera yaw: {cameraYaw.toFixed(2)} rad</div>
            <div>
              Player: {playerX.toFixed(1)}, {playerZ.toFixed(1)} · {playerSpeed.toFixed(1)} u/s
            </div>
            <div>
              Target: {targetId ?? "none"}
              {distance === null ? "" : ` · ${distance.toFixed(1)} u`}
            </div>
            {runners.map((runner) => (
              <div key={runner.id}>
                {runner.id}: {runner.state}
                {runner.active
                  ? ` · ${runner.x.toFixed(1)}, ${runner.z.toFixed(1)} · ${runner.speed.toFixed(1)} u/s`
                  : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
