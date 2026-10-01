import { useEffect, useRef } from "react";
import { addCameraDrag, endCameraDrag } from "@/lib/catchy/input";

/** Camera owns only pointers that did not begin on another HUD control. */
export function CameraSurface() {
  const pointer = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });

  const release = (pointerId?: number) => {
    if (pointerId !== undefined && pointer.current !== pointerId) return;
    pointer.current = null;
    endCameraDrag();
  };

  useEffect(() => {
    const clear = () => release();
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="camera-surface pointer-events-auto absolute inset-0 touch-none"
      onPointerDown={(event) => {
        if (pointer.current !== null || (event.pointerType === "mouse" && event.button !== 0))
          return;
        event.preventDefault();
        pointer.current = event.pointerId;
        last.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return;
        event.preventDefault();
        addCameraDrag(event.clientX - last.current.x, event.clientY - last.current.y);
        last.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId)}
      onLostPointerCapture={(event) => release(event.pointerId)}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
