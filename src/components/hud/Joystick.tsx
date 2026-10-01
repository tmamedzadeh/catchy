import { useCallback, useEffect, useRef } from "react";
import { joystick } from "@/lib/catchy/input";
import { calculateJoystickVector, measureJoystickGeometry } from "@/lib/catchy/joystick";

export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knobElement = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);

  const readGeometry = () => {
    const baseElement = base.current;
    const knob = knobElement.current;
    if (!baseElement || !knob) return null;
    const rect = baseElement.getBoundingClientRect();
    const knobRect = knob.getBoundingClientRect();
    return measureJoystickGeometry(
      rect,
      baseElement.clientWidth,
      baseElement.clientHeight,
      knobRect.width,
      knobRect.height,
    );
  };

  const update = (clientX: number, clientY: number) => {
    const geometry = readGeometry();
    if (!geometry) return;
    const vector = calculateJoystickVector(clientX, clientY, geometry);
    knobElement.current?.style.setProperty("transform", `translate(calc(-50% + ${vector.knobX}px), calc(-50% + ${vector.knobY}px))`);
    joystick.x = vector.x;
    joystick.z = -vector.y;
    joystick.active = true;
  };

  const release = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && pointer.current !== pointerId) return;
    pointer.current = null;
    knobElement.current?.style.setProperty("transform", "translate(-50%, -50%)");
    joystick.x = 0;
    joystick.z = 0;
    joystick.active = false;
  }, []);

  useEffect(() => {
    const clear = () => release();
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [release]);

  return (
    <div
      ref={base}
      onPointerDown={(event) => {
        if (pointer.current !== null || event.button !== 0) return;
        if (event.pointerType !== "mouse") event.preventDefault();
        const geometry = readGeometry();
        if (!geometry) return;
        pointer.current = event.pointerId;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          release(event.pointerId);
          return;
        }
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return;
        update(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId)}
      onLostPointerCapture={(event) => release(event.pointerId)}
      role="group"
      aria-label="Movement joystick"
      aria-description="Drag controls player movement; center is neutral"
      className="pointer-events-auto relative touch-stick touch-stick-movement size-[var(--joystick-size)] touch-none rounded-full select-none"
      style={{
        background:
          "radial-gradient(circle at 50% 42%, oklch(1 0 0 / 0.42), oklch(1 0 0 / 0.14) 62%, oklch(1 0 0 / 0.06))",
        border: "2px solid oklch(1 0 0 / 0.55)",
        boxShadow: "var(--hud-shadow-soft)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div className="absolute inset-[18%] z-0 rounded-full border border-white/35" />
      <div className="pointer-events-none absolute inset-[28%] z-10 rounded-full border-white/35" />
      <div />
      className="pointer-events-none absolute top-1/2 left-1/2 z-10 grid size-[34%] -translate-x-1/2
      -translate-y-1/2 place-items-center rounded-full border border-white/75"
      <div
        ref={knobElement}
        data-testid="joystick-knob"
        className="absolute top-1/2 left-1/2 z-20 size-[42%] rounded-full"
        style={{
          // The inline transform is the only knob translation: Tailwind's
          // -translate-* utilities set the independent `translate` property,
          // which composes with `transform` and shifts the neutral knob off
          // the outer circle's center.
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle at 40% 32%, oklch(0.99 0.01 95), oklch(0.9 0.05 80))",
          boxShadow: "0 6px 14px -4px oklch(0.34 0.07 152 / 0.55)",
        }}
      />
    </div>
  );
}
