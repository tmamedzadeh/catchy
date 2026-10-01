import { useCallback, useEffect, useRef } from "react";
import { claimTouchPointer, joystick, releaseTouchPointer } from "@/lib/catchy/input";
import { calculateJoystickVector, measureJoystickGeometry } from "@/lib/catchy/joystick";

export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knobElement = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const geometry = useRef<ReturnType<typeof measureJoystickGeometry> | null>(null);

  const readGeometry = useCallback(() => {
    const baseElement = base.current;
    const knob = knobElement.current;
    if (!baseElement || !knob) return null;
    const rect = baseElement.getBoundingClientRect();
    geometry.current = measureJoystickGeometry(
      rect,
      baseElement.clientWidth,
      baseElement.clientHeight,
      knob.getBoundingClientRect().width,
      knob.getBoundingClientRect().height,
    );
    return geometry.current;
  }, []);

  const update = (clientX: number, clientY: number) => {
    const measured = geometry.current ?? readGeometry();
    if (!measured) return;
    const vector = calculateJoystickVector(clientX, clientY, measured);
    knobElement.current?.style.setProperty(
      "transform",
      `translate(calc(-50% + ${vector.knobX}px), calc(-50% + ${vector.knobY}px))`,
    );
    joystick.x = vector.x;
    joystick.z = -vector.y;
    joystick.active = true;
  };

  const release = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && pointer.current !== pointerId) {
      releaseTouchPointer(pointerId, "movement");
      return;
    }
    if (pointer.current !== null) releaseTouchPointer(pointer.current, "movement");
    pointer.current = null;
    knobElement.current?.style.setProperty("transform", "translate(-50%, -50%)");
    joystick.x = 0;
    joystick.z = 0;
    joystick.active = false;
  }, []);

  useEffect(() => {
    const resize = () => readGeometry();
    const clear = () => release();
    const onVisibilityChange = () => {
      if (document.hidden) clear();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    if (base.current) observer?.observe(base.current);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibilityChange);
    readGeometry();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
    };
  }, [readGeometry, release]);

  return (
    <div
      ref={base}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (pointer.current !== null || (event.pointerType === "mouse" && event.button !== 0))
          return;
        if (!claimTouchPointer(event.pointerId, "movement")) return;
        event.preventDefault();
        const measured = readGeometry();
        if (!measured) {
          release(event.pointerId);
          return;
        }
        pointer.current = event.pointerId;
        joystick.gestureId++;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          release(event.pointerId);
          return;
        }
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        if (pointer.current !== event.pointerId) return;
        event.preventDefault();
        update(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        release(event.pointerId);
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        release(event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        event.stopPropagation();
        release(event.pointerId);
      }}
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
      <div className="pointer-events-none absolute inset-[18%] rounded-full border border-white/35" />
      <div
        ref={knobElement}
        data-testid="joystick-knob"
        className="pointer-events-none absolute top-1/2 left-1/2 z-20 size-[42%] rounded-full"
        style={{
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle at 40% 32%, oklch(0.99 0.01 95), oklch(0.9 0.05 80))",
          boxShadow: "0 6px 14px -4px oklch(0.34 0.07 152 / 0.55)",
        }}
      />
    </div>
  );
}
