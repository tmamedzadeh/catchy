import { useCallback, useEffect, useRef, useState } from "react";
import { joystick } from "@/lib/sprout/input";

export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width * 0.34;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    setKnob({ x: dx, y: dy });
    const n = Math.max(Math.hypot(dx, dy), 0.001);
    const mag = Math.min(d / max, 1);
    joystick.x = (dx / n) * mag * (d > 0 ? 1 : 0);
    joystick.z = (dy / n) * mag * (d > 0 ? 1 : 0);
    joystick.active = true;
  };

  const release = useCallback(() => {
    pointer.current = null;
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
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (pointer.current === e.pointerId) release();
      }}
      onPointerCancel={release}
      onLostPointerCapture={release}
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
