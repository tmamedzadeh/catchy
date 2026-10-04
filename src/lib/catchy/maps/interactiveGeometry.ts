import type { InteractiveMapObject } from "./types";

/** A bounce sphere is grounded with its base on y=0 at the map's uniform scale. */
export function interactiveYForScale(object: InteractiveMapObject, scale = object.scale) {
  return object.kind === "elasticBounce" && object.collision.type === "circle"
    ? object.collision.radius * scale
    : object.y;
}
