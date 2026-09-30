import { useCallback, useEffect, useRef, useState } from "react";
import { joystick } from "@/lib/sprout/input";

export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const layout = useRef<{ centerX: number; centerY: number; max: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    let bounds = layout.current;
    if (!bounds) {
      const rect = el.getBoundingClientRect();
      bounds = {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        max: rect.width * 0.34,
      };
      layout.current = bounds;
    }
    let dx = clientX - bounds.centerX;
    let dy = clientY - bounds.centerY;
    const d = Math.hypot(dx, dy);
    if (d > bounds.max) {
      dx = (dx / d) * bounds.max;
      dy = (dy / d) * bounds.max;
    }
    setKnob({ x: dx, y: dy });
    const n = Math.max(Math.hypot(dx, dy), 0.001);
    const mag = Math.min(d / bounds.max, 1);
    joystick.x = (dx / n) * mag * (d > 0 ? 1 : 0);
    joystick.z = (dy / n) * mag * (d > 0 ? 1 : 0);
    joystick.active = true;
  };

  const release = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && pointer.current !== pointerId) return;
    pointer.current = null;
    layout.current = null;
    setKnob({ x: 0, y: 0 });
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
      onPointerDown={(e) => {
        if (pointer.current !== null || e.button !== 0) return;
        if (e.pointerType !== "mouse") e.preventDefault();
        pointer.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          release(e.pointerId);
          return;
        }
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        release(e.pointerId);
      }}
      onPointerCancel={(e) => release(e.pointerId)}
      onLostPointerCapture={(e) => release(e.pointerId)}
      className="pointer-events-auto relative size-[var(--joystick-size)] touch-none rounded-full select-none"
      style={{
        background:
          "radial-gradient(circle at 50% 42%, oklch(1 0 0 / 0.42), oklch(1 0 0 / 0.14) 62%, oklch(1 0 0 / 0.06))",
        border: "2px solid oklch(1 0 0 / 0.55)",
        boxShadow: "var(--hud-shadow-soft)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div className="absolute inset-[18%] rounded-full border border-white/35" />
      <div
        className="absolute top-1/2 left-1/2 size-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-75"
        style={{
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          background: "radial-gradient(circle at 40% 32%, oklch(0.99 0.01 95), oklch(0.9 0.05 80))",
          boxShadow: "0 6px 14px -4px oklch(0.34 0.07 152 / 0.55)",
        }}
      />
    </div>
  );
}
