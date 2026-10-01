import { useEffect, useState } from "react";
import { Joystick } from "./Joystick";
import { useGameStore } from "@/store/gameStore";
import { requestPlayerDash, requestPlayerSpeedBoost } from "@/lib/catchy/input";
import { GAME_CONFIG } from "@/lib/catchy/config";

const ONBOARDING_KEY = "catchy-first-session-controls-v1";
const MOVEMENT_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  "KeyE",
]);

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
      <div className="mb-1 flex items-center justify-between font-display text-[0.7rem] tracking-wide text-catchy-ink-soft uppercase">
        <span>{label}</span>
        <span className="text-catchy-accent-2">
          {unit === "%"
            ? `${(value * 100).toFixed(0)}%`
            : unit === "°"
              ? `${value.toFixed(0)}°`
              : `${value.toFixed(1)}${unit}`}
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
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-catchy-accent [&::-webkit-slider-thumb]:shadow-md"
        style={{
          background: `linear-gradient(90deg, var(--catchy-accent) ${progress}%, oklch(0.34 0.07 152 / 0.15) ${progress}%)`,
        }}
      />
    </label>
  );
}

export function HUD({ gameReady }: { gameReady: boolean }) {
  const state = useGameStore((s) => s.state);
  const caught = useGameStore((s) => s.caught);
  const time = useGameStore((s) => s.time);
  const distance = useGameStore((s) => s.distance);
  const bearing = useGameStore((s) => s.bearing);
  const targetId = useGameStore((s) => s.targetId);
  const restart = useGameStore((s) => s.restart);
  const dashStatus = useGameStore((s) => s.dashStatus);
  const speedBoostStatus = useGameStore((s) => s.speedBoostStatus);
  const boostEffectActive = useGameStore((s) => s.boostEffectActive);
  const boostCueId = useGameStore((s) => s.boostCueId);
  const debugMode =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "true";
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
          className="capture-flash absolute inset-0"
          style={{ animation: "catchy-capture-flash 380ms ease-out forwards" }}
        />
      )}

      {/* Catchy branding */}
      <div className="hud-brand absolute flex items-center">
        <div className="hud-card flex items-center gap-2.5 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="leading-none">
            <div className="font-display text-base font-semibold text-catchy-ink sm:text-lg">
              Catchy
            </div>
          </div>
        </div>
      </div>

      <div
        role="group"
        aria-label="Game status"
        className="hud-card hud-game-status absolute grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.2fr)_minmax(0,1.25fr)] items-center gap-1.5 px-2.5 py-2 sm:gap-3 sm:px-3.5 sm:py-2.5"
      >
        <section className="min-w-0" aria-label="Caught score">
          <div className="font-display text-[0.56rem] tracking-[0.12em] text-catchy-ink-soft uppercase sm:text-[0.62rem] sm:tracking-[0.16em]">
            Caught
          </div>
          <div
            key={caught}
            className="font-display text-xl leading-none text-catchy-accent-2 tabular-nums sm:text-2xl"
            style={{ animation: "catchy-pop 320ms ease-out" }}
          >
            {String(caught).padStart(2, "0")}
          </div>
        </section>

        <section
          className="min-w-0"
          aria-label="Round time"
          style={time < 10 ? { animation: "catchy-pulse 1s infinite" } : undefined}
        >
          <div className="font-display text-[0.56rem] tracking-[0.12em] text-catchy-ink-soft uppercase sm:text-[0.62rem] sm:tracking-[0.16em]">
            Time
          </div>
          <div className="flex items-center gap-1 font-display text-sm text-catchy-ink tabular-nums sm:gap-1.5 sm:text-base">
            <span className="shrink-0 text-catchy-accent-2">{ClockIcon}</span>
            <span>{fmt(time)}</span>
          </div>
        </section>

        {/* Camera-relative nearest-runner finder; neutral when all runners are unavailable. */}
        <section
          className="min-w-0"
          aria-label={targetId ? "Target direction and distance" : "No target"}
        >
          <div className="font-display text-[0.56rem] tracking-[0.12em] text-catchy-ink-soft uppercase sm:text-[0.62rem] sm:tracking-[0.16em]">
            {targetId ? "Target" : "No target"}
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <div
              className="relative grid size-6 shrink-0 place-items-center rounded-full sm:size-7"
              style={{
                background: "conic-gradient(from 0deg, oklch(0.95 0.04 80), oklch(0.99 0.01 95))",
                boxShadow: nearby
                  ? "inset 0 0 0 1px oklch(1 0 0 / 0.8), 0 0 0 2px oklch(0.72 0.19 45 / 0.18), 0 0 10px oklch(0.72 0.19 45 / 0.24)"
                  : "inset 0 0 0 1px oklch(1 0 0 / 0.8)",
              }}
            >
              {targetId ? (
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 transition-transform duration-100 sm:size-[1.125rem]"
                  style={{ transform: "rotate(" + bearing + "rad)" }}
                  fill="currentColor"
                  aria-label="Direction to nearest runner"
                >
                  <path
                    d="M12 3.2 18.4 19 12 15.4 5.6 19 12 3.2Z"
                    className={nearby ? "text-catchy-lime" : "text-catchy-accent-2"}
                    style={{ filter: "drop-shadow(0 1px 2px oklch(0.34 0.07 152 / 0.35))" }}
                  />
                </svg>
              ) : (
                <span className="font-display text-base leading-none text-catchy-ink-soft">
                  {"\u2022"}
                </span>
              )}
            </div>
            <div className="whitespace-nowrap font-display text-sm text-catchy-ink tabular-nums sm:text-base">
              {distance === null ? "\u2014" : String(Math.round(distance)) + " m"}
            </div>
          </div>
        </section>
      </div>
      <div className="hud-callouts absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        {state === "nearby" && (
          <div
            className="rounded-full px-4 py-1.5 font-display text-sm text-white sm:text-base"
            style={{
              background: "linear-gradient(90deg, oklch(0.72 0.19 45), oklch(0.66 0.21 25))",
              boxShadow: "var(--hud-shadow-soft)",
              animation: "catchy-pop 260ms ease-out",
            }}
          >
            {distance !== null && distance <= 4.5 ? "Close! Go for the tag" : "Runner nearby!"}
          </div>
        )}
        {state === "capture" && (
          <div
            className="capture-tag font-display text-5xl text-white sm:text-7xl"
            style={{
              textShadow: "0 4px 0 oklch(0.66 0.21 25), 0 10px 26px oklch(0.34 0.07 152 / 0.45)",
              animation: "catchy-pop 320ms ease-out",
            }}
          >
            TAG!
          </div>
        )}
        {state === "after" && (
          <div
            className="hud-card px-4 py-2 font-display text-lg text-catchy-ink"
            style={{ animation: "catchy-pop 280ms ease-out" }}
          >
            +1 caught · nice tag!
          </div>
        )}
      </div>

      {state === "timeup" && (
        <div className="round-end-overlay absolute inset-0 grid place-items-center bg-catchy-ink/45 backdrop-blur-[2px]">
          <div
            className="hud-card pointer-events-auto w-[min(22rem,86vw)] px-6 py-7 text-center"
            style={{ animation: "catchy-pop 340ms ease-out" }}
          >
            <div className="font-display text-[0.7rem] tracking-[0.22em] text-catchy-ink-soft uppercase">
              Time up
            </div>
            <div className="mt-1 font-display text-4xl text-catchy-ink">Round over</div>
            <div className="mt-3 font-display text-lg text-catchy-accent-2">
              {caught} runner{caught === 1 ? "" : "s"} caught
            </div>
            <button
              data-sound="restart"
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

      <div className="touch-controls absolute">
        <Joystick />
      </div>
      <div className="camera-controls absolute">
        <Joystick side="camera" />
      </div>
      <div className="ability-controls absolute flex flex-col-reverse items-end gap-2">
        <DashControl gameReady={gameReady} state={state} status={dashStatus} />
        <SpeedBoostControl
          gameReady={gameReady}
          state={state}
          status={speedBoostStatus}
          effectActive={boostEffectActive}
          cueId={boostCueId}
        />
      </div>

      <FirstSessionOnboarding gameReady={gameReady} />

      {debugMode && <CameraTuningPanel />}
    </div>
  );
}

function DashControl({
  gameReady,
  state,
  status,
}: {
  gameReady: boolean;
  state: ReturnType<typeof useGameStore.getState>["state"];
  status: ReturnType<typeof useGameStore.getState>["dashStatus"];
}) {
  const isChasing = state === "chase" || state === "nearby";
  const enabled = gameReady && isChasing && status === "ready";
  const label = status === "ready" ? "READY" : status === "active" ? "DASH" : "WAIT";
  const coolDownAnimationSeconds = Math.max(
    0.1,
    GAME_CONFIG.player.dash.cooldownSeconds - GAME_CONFIG.player.dash.durationSeconds,
  );

  return (
    <div className="dash-control">
      <button
        type="button"
        data-sound="dash"
        aria-label={enabled ? "Dash" : `Dash ${isChasing ? status : "unavailable"}`}
        title={enabled ? "Dash" : label}
        disabled={!enabled}
        onPointerDown={(event) => {
          if (event.button !== 0 || !enabled) return;
          event.preventDefault();
          event.stopPropagation();
          requestPlayerDash();
        }}
        onPointerCancel={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        className="dash-control-button pointer-events-auto relative grid place-items-center rounded-full text-white transition-transform active:scale-95 disabled:cursor-default"
      >
        <svg
          className="dash-control-ring absolute inset-0 size-full"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <circle className="dash-control-ring-track" cx="24" cy="24" r="20" />
          <circle
            key={status}
            className={`dash-control-ring-progress ${status === "cooldown" ? "is-cooling" : ""}`}
            cx="24"
            cy="24"
            r="20"
            style={{ animationDuration: `${coolDownAnimationSeconds}s` }}
          />
        </svg>
        <span className="relative flex flex-col items-center leading-none">
          <svg viewBox="0 0 24 24" className="mb-0.5 size-5" fill="currentColor" aria-hidden="true">
            <path d="M13.1 1.8 4.7 13h5.5l-.5 9.2L19.3 10h-5.7l-.5-8.2Z" />
          </svg>
          <span className="font-display text-[0.55rem] font-bold tracking-wide">
            {isChasing ? label : "LOCK"}
          </span>
        </span>
      </button>
    </div>
  );
}

function SpeedBoostControl({
  gameReady,
  state,
  status,
  effectActive,
  cueId,
}: {
  gameReady: boolean;
  state: ReturnType<typeof useGameStore.getState>["state"];
  status: ReturnType<typeof useGameStore.getState>["speedBoostStatus"];
  effectActive: boolean;
  cueId: number;
}) {
  const isChasing = state === "chase" || state === "nearby";
  const enabled = gameReady && isChasing && status === "ready" && !effectActive;
  const label = status === "active" ? "ACTIVE" : status === "cooldown" ? "RECHARGING" : "READY";

  return (
    <div className="boost-control">
      <button
        type="button"
        data-sound="boost"
        aria-label={`Speed boost ${isChasing ? status : "unavailable"}`}
        title={label}
        disabled={!enabled}
        onPointerDown={(event) => {
          if (event.button !== 0 || !enabled) return;
          event.preventDefault();
          event.stopPropagation();
          requestPlayerSpeedBoost();
        }}
        onPointerCancel={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        className="boost-control-button pointer-events-auto relative grid place-items-center rounded-full font-display font-bold text-white transition-transform active:scale-95 disabled:cursor-default"
      >
        <svg
          className="boost-control-ring absolute inset-0 size-full"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <circle className="boost-control-ring-track" cx="24" cy="24" r="20" />
          <circle
            key={cueId}
            className={`boost-control-ring-progress ${status === "ready" ? "" : "is-cooling"}`}
            cx="24"
            cy="24"
            r="20"
            style={{ animationDuration: `${GAME_CONFIG.player.speedBoost.cooldownSeconds}s` }}
          />
        </svg>
        <span className="relative flex flex-col items-center leading-none">
          <svg viewBox="0 0 24 24" className="mb-0.5 size-5" fill="currentColor" aria-hidden="true">
            <path d="M14.2 1.8 5.1 13.2h5.7l-.8 9 8.9-12h-5.7l1-8.4Z" />
          </svg>
          <span className="text-[0.33rem] tracking-tight">{isChasing ? label : "LOCK"}</span>
        </span>
      </button>
    </div>
  );
}

function CameraTuningPanel() {
  const camHeight = useGameStore((s) => s.camHeight);
  const camAngle = useGameStore((s) => s.camAngle);
  const camLookAhead = useGameStore((s) => s.camLookAhead);
  const camCompositionOffset = useGameStore((s) => s.camCompositionOffset);
  const setCamHeight = useGameStore((s) => s.setCamHeight);
  const setCamAngle = useGameStore((s) => s.setCamAngle);
  const setCamLookAhead = useGameStore((s) => s.setCamLookAhead);
  const setCamCompositionOffset = useGameStore((s) => s.setCamCompositionOffset);
  const resetCamera = useGameStore((s) => s.resetCamera);
  const ranges = GAME_CONFIG.camera.tuningRanges;
  const cameraYaw = useGameStore((s) => s.cameraYaw);
  const playerX = useGameStore((s) => s.playerX);
  const playerZ = useGameStore((s) => s.playerZ);
  const playerSpeed = useGameStore((s) => s.playerSpeed);
  const targetId = useGameStore((s) => s.targetId);
  const distance = useGameStore((s) => s.distance);
  const runners = useGameStore((s) => s.runners);

  return (
    <div className="hud-card pointer-events-auto absolute top-24 left-4 w-[min(14rem,88vw)] space-y-3 p-3.5 sm:top-28 sm:left-6">
      <div className="font-display text-[0.72rem] font-semibold tracking-[0.14em] text-catchy-ink uppercase">
        Camera tuning
      </div>
      <Slider
        label="Distance / zoom"
        value={camHeight}
        {...ranges.distance}
        unit=""
        onChange={setCamHeight}
      />
      <Slider label="Angle" value={camAngle} {...ranges.angle} unit="°" onChange={setCamAngle} />
      <Slider
        label="Look ahead"
        value={camLookAhead}
        {...ranges.lookAhead}
        unit=" u"
        onChange={setCamLookAhead}
      />
      <Slider
        label="Composition offset"
        value={camCompositionOffset}
        {...ranges.compositionOffset}
        unit="%"
        onChange={setCamCompositionOffset}
      />
      <button
        onClick={resetCamera}
        className="w-full rounded-xl border border-catchy-ink/15 bg-white/70 px-3 py-1.5 font-display text-xs text-catchy-ink transition-colors hover:bg-white"
      >
        Reset camera defaults
      </button>
      <div className="border-t border-catchy-ink/10 pt-2 font-body text-[0.64rem] leading-relaxed text-catchy-ink-soft">
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
  );
}

function FirstSessionOnboarding({ gameReady }: { gameReady: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!gameReady) return;
    try {
      if (window.localStorage.getItem(ONBOARDING_KEY) === "done") return;
    } catch {
      // Keep the hint available in private contexts where storage is unavailable.
    }

    let finished = false;
    let timeout = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (MOVEMENT_KEYS.has(event.code)) finish();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".touch-controls, .camera-controls, .ability-controls")
      )
        finish();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      setVisible(false);
      try {
        window.localStorage.setItem(ONBOARDING_KEY, "done");
      } catch {
        // Keep the round playable if storage is disabled.
      }
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };

    setVisible(true);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    timeout = window.setTimeout(finish, 6500);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [gameReady]);

  let isCoarsePointer = false;
  try {
    isCoarsePointer =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse), (max-width: 640px)").matches;
  } catch {
    isCoarsePointer = false;
  }
  if (!visible) return null;

  return (
    <div className="first-session-onboarding absolute left-1/2 -translate-x-1/2">
      <div className="hud-card px-4 py-2.5 text-center">
        <div className="font-display text-sm font-semibold text-catchy-ink">Ready to chase?</div>
        <div className="mt-0.5 text-xs text-catchy-ink-soft">
          {isCoarsePointer
            ? "Left stick moves · Right stick turns, recenters, or shows the arena · Dash / boost buttons"
            : "W / S forward / back · A left · D right · ← / → camera · ↑ recenter · ↓ overview · Shift dash · E boost"}
        </div>
      </div>
    </div>
  );
}
