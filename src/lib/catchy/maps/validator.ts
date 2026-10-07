import { ASSET_BY_ID } from "./catalog";
import type {
  CollisionShape,
  MapDefinition,
  MapValidationIssue,
  MapValidationResult,
} from "./types";
import { GAME_CONFIG } from "../config";

export const MAP_LIMITS = Object.freeze({
  maxObjects: 300,
  minRadius: 12,
  // At the current 1.9m NPC grid spacing, radius 100 is roughly 8,500 walkable
  // nodes on the default layout. Keep the supported ceiling explicit and measured.
  maxRadius: 100,
});
const MAX_TRANSFORM = 1_000;
const REQUIRED_INTERACTIVES = [
  "speedPad",
  "slowZone",
  "elasticBounce",
  "temporaryBarrier",
] as const;
type RecordValue = Record<string, unknown>;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const record = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
const issue = (code: string, message: string, path?: string): MapValidationIssue =>
  path === undefined ? { code, message } : { code, message, path };

function validCollision(value: unknown): value is CollisionShape {
  const collision = record(value);
  if (!collision) return false;
  if (collision["type"] === "circle")
    return finite(collision["radius"]) && collision["radius"] > 0 && collision["radius"] < 20;
  return (
    collision["type"] === "box" &&
    finite(collision["width"]) &&
    finite(collision["depth"]) &&
    collision["width"] > 0 &&
    collision["depth"] > 0 &&
    collision["width"] < 30 &&
    collision["depth"] < 30
  );
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(value);
}

function isInsideArena(x: unknown, z: unknown, radius: number, padding = 0): boolean {
  return finite(x) && finite(z) && Math.hypot(x, z) + padding < radius - GAME_CONFIG.obstacleMargin;
}

function collisionExtent(collision: CollisionShape, scale: number): number {
  return collision.type === "circle"
    ? collision.radius * scale
    : Math.hypot(collision.width / 2, collision.depth / 2) * scale;
}

/** Validate untrusted persisted or imported JSON without assuming nested values are well formed. */
export function validateMap(input: unknown): MapValidationResult {
  const errors: MapValidationIssue[] = [];
  const warnings: MapValidationIssue[] = [];
  const value = record(input);
  if (!value)
    return { valid: false, errors: [issue("schema", "Map must be an object.")], warnings };

  if (value["schemaVersion"] !== 1 || value["version"] !== 1)
    errors.push(issue("version", "Unsupported map schema version."));
  if (!validId(value["id"]))
    errors.push(issue("id", "Map ID must be 2–64 letters, numbers, dashes, or underscores."));
  if (
    typeof value["name"] !== "string" ||
    value["name"].trim().length === 0 ||
    value["name"].length > 80
  )
    errors.push(issue("name", "Map name is required and must be at most 80 characters."));
  if (
    value["description"] !== undefined &&
    (typeof value["description"] !== "string" || value["description"].length > 240)
  )
    errors.push(issue("description", "Map description must be text up to 240 characters."));

  const arena = record(value["arena"]);
  const radius = arena?.["radius"];
  if (!finite(radius) || radius < MAP_LIMITS.minRadius || radius > MAP_LIMITS.maxRadius)
    errors.push(
      issue(
        "arena",
        `Arena radius must be between ${MAP_LIMITS.minRadius}m and ${MAP_LIMITS.maxRadius}m.`,
      ),
    );
  const safeRadius = finite(radius) ? radius : 0;

  const usedIds = new Set<string>();

  const rawObjects = value["objects"];
  if (!Array.isArray(rawObjects)) errors.push(issue("objects", "Map props must be an array."));
  const objects = Array.isArray(rawObjects) ? rawObjects : [];
  if (objects.length > MAP_LIMITS.maxObjects)
    errors.push(issue("size", `Maps may contain at most ${MAP_LIMITS.maxObjects} props.`));
  for (const [index, raw] of objects.entries()) {
    const object = record(raw);
    if (!object) {
      errors.push(issue("object", "Invalid prop.", `objects[${index}]`));
      continue;
    }
    const id = object["id"];
    if (!validId(id))
      errors.push(issue("object-id", "Prop IDs must be valid.", `objects[${index}].id`));
    else if (usedIds.has(id)) errors.push(issue("duplicate-id", `Duplicate map object ID: ${id}.`));
    else usedIds.add(id);
    const model = object["model"];
    if (typeof model !== "string" || !ASSET_BY_ID.has(model))
      errors.push(
        issue("asset", `Unknown bundled asset: ${String(model)}.`, `objects[${index}].model`),
      );
    if (object["kind"] !== undefined && object["kind"] !== "prop")
      errors.push(issue("object-type", "Unsupported map object type.", `objects[${index}].kind`));
    const position = record(object["position"]);
    const collision = object["collision"];
    const x = position?.["x"];
    const z = position?.["z"];
    const rotation = object["rotation"];
    const scale = object["scale"];
    const y = object["y"];
    if (
      !finite(x) ||
      !finite(z) ||
      !finite(rotation) ||
      Math.abs(rotation) > MAX_TRANSFORM ||
      !finite(scale) ||
      scale <= 0 ||
      scale > 12 ||
      !finite(y) ||
      Math.abs(y) > 20 ||
      !validCollision(collision)
    ) {
      errors.push(
        issue(
          "transform",
          "Prop transform and collision must contain finite, sensible values.",
          `objects[${index}]`,
        ),
      );
      continue;
    }
    const point = { x, z };
    if (!isInsideArena(point.x, point.z, safeRadius, collisionExtent(collision, scale)))
      errors.push(
        issue(
          "bounds",
          "Prop and collider must remain inside the arena.",
          `objects[${index}].position`,
        ),
      );
  }

  const rawInteractives = value["interactiveObjects"];
  if (!Array.isArray(rawInteractives))
    errors.push(issue("interactive", "Interactive objects must be an array."));
  const interactives = Array.isArray(rawInteractives) ? rawInteractives : [];
  const validKinds = new Set<string>(REQUIRED_INTERACTIVES);
  for (const kind of REQUIRED_INTERACTIVES) {
    if (interactives.filter((raw) => record(raw)?.["kind"] === kind).length !== 1)
      errors.push(issue("interactive", `Map must contain exactly one ${kind}.`));
  }
  for (const [index, raw] of interactives.entries()) {
    const object = record(raw);
    if (!object) {
      errors.push(
        issue(
          "interactive",
          "Interactive object must be an object.",
          `interactiveObjects[${index}]`,
        ),
      );
      continue;
    }
    const id = object["id"];
    if (!validId(id)) errors.push(issue("interactive-id", "Interactive object IDs must be valid."));
    else if (usedIds.has(id)) errors.push(issue("duplicate-id", `Duplicate map object ID: ${id}.`));
    else usedIds.add(id);
    const position = record(object["position"]);
    const collision = object["collision"];
    const kind = object["kind"];
    const x = position?.["x"];
    const z = position?.["z"];
    const rotation = object["rotation"];
    const scale = object["scale"];
    const y = object["y"];
    const triggerRadius = object["triggerRadius"];
    const triggerOnly = kind === "speedPad" || kind === "slowZone";
    if (
      typeof kind !== "string" ||
      !validKinds.has(kind) ||
      object["model"] !== "" ||
      !position ||
      !finite(x) ||
      !finite(z) ||
      !finite(rotation) ||
      Math.abs(rotation) > MAX_TRANSFORM ||
      !finite(scale) ||
      scale <= 0 ||
      scale > 12 ||
      !finite(y) ||
      Math.abs(y) > 20 ||
      !validCollision(collision) ||
      (kind === "elasticBounce" && collision.type !== "circle") ||
      (kind === "temporaryBarrier" && collision.type !== "box") ||
      (triggerOnly && collision.type !== "circle") ||
      (object["triggerRadius"] !== undefined &&
        (!finite(triggerRadius) || triggerRadius <= 0 || triggerRadius > 20)) ||
      (triggerOnly && (!finite(triggerRadius) || triggerRadius <= 0 || triggerRadius > 20))
    ) {
      errors.push(
        issue(
          "interactive-transform",
          "Interactive object has an invalid transform, collider, or configuration.",
          `interactiveObjects[${index}]`,
        ),
      );
      continue;
    }

    if (
      kind === "elasticBounce" &&
      collision.type === "circle" &&
      Math.abs(y - collision.radius * scale) > 1e-6
    ) {
      errors.push(
        issue(
          "interactive-transform",
          "Bounce Ball must keep its collision sphere grounded at the current scale.",
          `interactiveObjects[${index}].y`,
        ),
      );
      continue;
    }

    const solid = kind === "elasticBounce" || kind === "temporaryBarrier";
    const extent = solid
      ? collisionExtent(collision, scale)
      : triggerOnly && finite(triggerRadius)
        ? triggerRadius * scale
        : 0;
    if (!isInsideArena(x, z, safeRadius, extent)) {
      errors.push(
        issue(
          "interactive-bounds",
          triggerOnly
            ? "Interactive trigger must remain inside the arena."
            : "Interactive collider must remain inside the arena.",
          `interactiveObjects[${index}].position`,
        ),
      );
    }
  }

  const rawDecorations = value["decorations"];
  if (rawDecorations !== undefined && !Array.isArray(rawDecorations))
    errors.push(issue("decoration", "Decorations must be an array."));
  const decorations = Array.isArray(rawDecorations) ? rawDecorations : [];
  for (const [index, raw] of decorations.entries()) {
    const decoration = record(raw);
    const id = decoration?.["id"];
    const position = record(decoration?.["position"]);
    if (
      !decoration ||
      !validId(id) ||
      usedIds.has(id) ||
      decoration["kind"] !== "island" ||
      !position ||
      !finite(position["x"]) ||
      !finite(position["z"]) ||
      !finite(decoration["radius"]) ||
      decoration["radius"] <= 0 ||
      decoration["radius"] > safeRadius ||
      !isInsideArena(position["x"], position["z"], safeRadius, decoration["radius"]) ||
      !finite(decoration["y"]) ||
      (decoration["rotation"] !== undefined && !finite(decoration["rotation"])) ||
      typeof decoration["color"] !== "string" ||
      !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(decoration["color"])
    ) {
      errors.push(
        issue(
          "decoration",
          "Decorations must have unique IDs, valid colors, finite positions, and an in-arena radius.",
          `decorations[${index}]`,
        ),
      );
    } else usedIds.add(id);
  }

  if (objects.length > 120)
    warnings.push(issue("performance", "Large maps may reduce rendering performance."));
  return { valid: errors.length === 0, errors, warnings };
}

export function isMapDefinition(value: unknown): value is MapDefinition {
  return validateMap(value).valid;
}
