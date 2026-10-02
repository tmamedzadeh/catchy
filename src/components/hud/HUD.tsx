import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Joystick } from "./Joystick";
import { CameraSurface } from "./CameraSurface";
import { useGameStore } from "@/store/gameStore";
import {
  claimTouchPointer,
  releaseTouchPointer,
  requestPlayerDash,
  requestPlayerJump,
  requestPlayerSpeedBoost,
  type TouchPointerOwner,
} from "@/lib/catchy/input";
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
  "Space",
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

function useActionPointer(
  owner: Exclude<TouchPointerOwner, "movement" | "camera">,
  enabled: boolean,
  activate: () => void,
) {
  const activePointer = useRef<number | null>(null);
  const release = (pointerId: number) => {
    if (activePointer.current !== pointerId) return;
    releaseTouchPointer(pointerId, owner);
    activePointer.current = null;
  };
  useEffect(() => {
    const clear = () => {
      const pointerId = activePointer.current;
      if (pointerId === null) return;
      releaseTouchPointer(pointerId, owner);
      activePointer.current = null;
    };
    const onVisibilityChange = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clear();
    };
  }, [owner]);
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!enabled) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!claimTouchPointer(event.pointerId, owner)) return;
      event.stopPropagation();
      activePointer.current = event.pointerId;
      activate();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        release(event.pointerId);
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      release(event.pointerId);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      release(event.pointerId);
    },
    onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      release(event.pointerId);
    },
  };
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
  const formatValue = (number: number) =>
    unit === "%"
      ? `${(number * 100).toFixed(0)}%`
      : unit === "°"
        ? `${number.toFixed(0)}°`
        : `${number.toFixed(1)}${unit}`;
  return (
    <label className="pointer-events-auto block">
      <div className="mb-1 flex items-center justify-between font-display text-[0.7rem] tracking-wide text-catchy-ink-soft uppercase">
        <span>{label}</span>
        <span className="text-catchy-accent-2">{formatValue(value)}</span>
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
      <div className="-mt-0.5 flex justify-between font-body text-[0.55rem] text-catchy-ink-soft">
        <span>Min {formatValue(min)}</span>
        <span>Max {formatValue(max)}</span>
      </div>
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
        className="hud-card hud-game-status absolute flex items-center justify-between gap-2 px-2.5 sm:gap-3 sm:px-3.5"
      >
        <section className="hud-metric" aria-label="Caught score">
          <span className="hud-metric-label">Caught</span>
          <span
            key={caught}
            className="hud-metric-value hud-caught-value"
            style={{ animation: "catchy-pop 320ms ease-out" }}
          >
            {String(caught).padStart(2, "0")}
          </span>
        </section>

        <section
          className="hud-metric"
          aria-label="Round time"
          style={time < 10 ? { animation: "catchy-pulse 1s infinite" } : undefined}
        >
          <span className="hud-metric-label">Time</span>
          <span className="hud-metric-value hud-time-value">
            <span className="text-catchy-accent-2" aria-hidden="true">
              {ClockIcon}
            </span>
            <span>{fmt(time)}</span>
          </span>
        </section>

        {/* Camera-relative nearest-runner finder; neutral when all runners are unavailable. */}
        <section
          className="hud-metric"
          aria-label={targetId ? "Target direction and distance" : "No target"}
        >
          <span className="hud-metric-label">Target</span>
          <span className="hud-metric-value hud-target-value">
            <span
              className="relative grid size-4 shrink-0 place-items-center rounded-full"
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
                  className="size-3 transition-transform duration-100"
                  style={{ transform: "rotate(" + bearing + "rad)" }}
                  fill="currentColor"
                  aria-label="Direction to target runner"
                  role="img"
                >
                  <path
                    d="M12 3.2 18.4 19 12 15.4 5.6 19 12 3.2Z"
                    className={nearby ? "text-catchy-lime" : "text-catchy-accent-2"}
                    style={{ filter: "drop-shadow(0 1px 2px oklch(0.34 0.07 152 / 0.35))" }}
                  />
                </svg>
              ) : (
                <span
                  className="font-display text-xs leading-none text-catchy-ink-soft"
                  aria-hidden="true"
                >
                  {"\u2022"}
                </span>
              )}
            </span>
            <span
              className="whitespace-nowrap"
              aria-label={
                distance === null
                  ? "No target distance"
                  : `Target distance ${Math.round(distance)} meters`
              }
            >
              {distance === null ? "\u2014" : String(Math.round(distance)) + " m"}
            </span>
          </span>
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

      <CameraSurface enabled={gameReady} />
      <div className="touch-controls absolute">
        <Joystick enabled={gameReady} />
      </div>
      <div className="ability-controls absolute flex items-center gap-2">
        <DashControl gameReady={gameReady} state={state} status={dashStatus} />
        <JumpControl gameReady={gameReady} state={state} />
      </div>
      <div className="speed-boost-control absolute">
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
  const pointerHandlers = useActionPointer("dash", enabled, requestPlayerDash);
  const label = status === "ready" ? "READY" : status === "active" ? "DASH" : "WAIT";
  const coolDownAnimationSeconds = Math.max(
    0.1,
    GAME_CONFIG.player.dash.cooldownSeconds - GAME_CONFIG.player.dash.durationSeconds,
  );

  return (
    <div className="dash-control">
      <button
        {...pointerHandlers}
        type="button"
        data-sound="dash"
        aria-label={enabled ? "Dash" : `Dash ${isChasing ? status : "unavailable"}`}
        title={enabled ? "Dash" : label}
        disabled={!enabled}
        onClick={(event) => {
          if (event.detail === 0 && enabled) requestPlayerDash();
        }}
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
          <svg
            viewBox="0 0 24 24"
            className="mb-0.5 size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12h15m-6-6 6 6-6 6" />
            <path d="M4 7h4M4 17h4" strokeWidth="1.7" />
          </svg>
          <span className="font-display text-[0.55rem] font-bold tracking-wide">
            {isChasing ? label : "LOCK"}
          </span>
        </span>
      </button>
    </div>
  );
}

function JumpControl({
  gameReady,
  state,
}: {
  gameReady: boolean;
  state: ReturnType<typeof useGameStore.getState>["state"];
}) {
  const isChasing = state === "chase" || state === "nearby";
  const enabled = gameReady && isChasing;
  const pointerHandlers = useActionPointer("jump", enabled, requestPlayerJump);

  return (
    <div className="jump-control">
      <button
        {...pointerHandlers}
        type="button"
        data-sound="jump"
        aria-label="Jump"
        title="Jump"
        disabled={!enabled}
        onClick={(event) => {
          if (event.detail === 0 && enabled) requestPlayerJump();
        }}
        onContextMenu={(event) => event.preventDefault()}
        className="dash-control-button pointer-events-auto relative grid place-items-center rounded-full text-white transition-transform active:scale-95 disabled:cursor-default"
      >
        <span className="relative flex items-center leading-none">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
            <path
              d="M12 19V5m0 0L6.5 10.5M12 5l5.5 5.5"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
  const active = status === "active" || effectActive;
  const label = active ? "ACTIVE" : status === "cooldown" ? "RECHARGING" : "READY";
  const accessibleStatus = active ? "active" : status;
  const pointerHandlers = useActionPointer("speedBoost", enabled, requestPlayerSpeedBoost);

  return (
    <div className="boost-control">
      <button
        {...pointerHandlers}
        type="button"
        data-sound="boost"
        aria-label={`Speed Up ${isChasing ? accessibleStatus : "unavailable"}`}
        title={label}
        disabled={!enabled}
        onClick={(event) => {
          if (event.detail === 0 && enabled) requestPlayerSpeedBoost();
        }}
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
  const camDistance = useGameStore((s) => s.camDistance);
  const camPitch = useGameStore((s) => s.camPitch);
  const camLookAhead = useGameStore((s) => s.camLookAhead);
  const camCompositionOffset = useGameStore((s) => s.camCompositionOffset);
  const camFollowYawSpeed = useGameStore((s) => s.camFollowYawSpeed);
  const camTurnAnticipation = useGameStore((s) => s.camTurnAnticipation);
  const camFollowResumeSpeed = useGameStore((s) => s.camFollowResumeSpeed);
  const setCamDistance = useGameStore((s) => s.setCamDistance);
  const setCamPitch = useGameStore((s) => s.setCamPitch);
  const setCamLookAhead = useGameStore((s) => s.setCamLookAhead);
  const setCamCompositionOffset = useGameStore((s) => s.setCamCompositionOffset);
  const setCamFollowYawSpeed = useGameStore((s) => s.setCamFollowYawSpeed);
  const setCamTurnAnticipation = useGameStore((s) => s.setCamTurnAnticipation);
  const setCamFollowResumeSpeed = useGameStore((s) => s.setCamFollowResumeSpeed);
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
        label="Distance"
        value={camDistance}
        {...ranges.distance}
        unit=" u"
        onChange={setCamDistance}
      />
      <Slider label="Pitch" value={camPitch} {...ranges.pitch} unit="°" onChange={setCamPitch} />
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
      <Slider
        label="Follow yaw speed"
        value={camFollowYawSpeed}
        {...ranges.followYawSpeed}
        unit=" /s"
        onChange={setCamFollowYawSpeed}
      />
      <Slider
        label="Turn anticipation"
        value={camTurnAnticipation}
        {...ranges.turnAnticipation}
        unit="°"
        onChange={setCamTurnAnticipation}
      />
      <Slider
        label="Follow resume speed"
        value={camFollowResumeSpeed}
        {...ranges.followResumeSpeed}
        unit=" /s"
        onChange={setCamFollowResumeSpeed}
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
        event.target.closest(".touch-controls, .ability-controls, .speed-boost-control")
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
            ? "Left stick moves · drag the world to look · Dash · Jump · Speed Up"
            : "W / S move · A / D strafe · drag or arrow keys look · Shift Dash · E Speed Up · Space Jump"}
        </div>
      </div>
    </div>
  );
}
