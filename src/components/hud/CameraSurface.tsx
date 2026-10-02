import { useEffect, useRef } from "react";
import {
  addCameraDrag,
  addCameraZoom,
  claimTouchPointer,
  discardPendingCameraInput,
  endCameraDrag,
  releaseTouchPointer,
} from "@/lib/catchy/input";
import { pinchZoomDelta } from "@/lib/catchy/pinch";

type OwnedPointer = { x: number; y: number };

/** Camera owns only pointers that did not begin on another HUD control. */
export function CameraSurface({ enabled }: { enabled: boolean }) {
  const pointers = useRef(new Map<number, OwnedPointer>());
  const pinchDistance = useRef<number | null>(null);

  const release = (pointerId: number) => {
    pointers.current.delete(pointerId);
    releaseTouchPointer(pointerId, "camera");
    if (pointers.current.size < 2) pinchDistance.current = null;
    if (pointers.current.size === 0) endCameraDrag();
  };

  useEffect(() => {
    const clear = () => {
      for (const pointerId of pointers.current.keys()) releaseTouchPointer(pointerId, "camera");
      pointers.current.clear();
      pinchDistance.current = null;
      endCameraDrag();
      discardPendingCameraInput();
    };
    const onVisibilityChange = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="camera-surface pointer-events-auto absolute inset-0 touch-none"
      onPointerDown={(event) => {
        if (!enabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (!claimTouchPointer(event.pointerId, "camera")) return;
        event.preventDefault();
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          release(event.pointerId);
          return;
        }
        if (pointers.current.size === 2) {
          // Drop a one-finger delta before entering pinch mode so joining a
          // second finger cannot create a yaw/pitch jump.
          discardPendingCameraInput();
          const [a, b] = [...pointers.current.values()];
          pinchDistance.current = pinchZoomDelta(null, a!, b!).distance;
        }
      }}
      onPointerMove={(event) => {
        const point = pointers.current.get(event.pointerId);
        if (!point) return;
        event.preventDefault();
        const dx = event.clientX - point.x;
        const dy = event.clientY - point.y;
        point.x = event.clientX;
        point.y = event.clientY;
        if (pointers.current.size >= 2) {
          const [a, b] = [...pointers.current.values()];
          const pinch = pinchZoomDelta(pinchDistance.current, a!, b!);
          pinchDistance.current = pinch.distance;
          addCameraZoom(pinch.delta);
        } else {
          addCameraDrag(dx, dy);
        }
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => {
        discardPendingCameraInput();
        release(event.pointerId);
      }}
      onLostPointerCapture={(event) => release(event.pointerId)}
      onContextMenu={(event) => event.preventDefault()}
    />
  );
}
