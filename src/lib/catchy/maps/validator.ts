import { ASSET_BY_ID } from "./catalog";
import type {
  CollisionShape,
  MapDefinition,
  MapValidationIssue,
  MapValidationResult,
} from "./types";
import { GAME_CONFIG } from "../config";

const MAX_OBJECTS = 300;
const MIN_RADIUS = 12;
const MAX_RADIUS = 80;
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

function overlapsSpawn(
  point: { x: number; z: number },
  object: {
    position: { x: number; z: number };
    rotation: number;
    scale: number;
    collision: CollisionShape;
  },
  agentRadius: number,
): boolean {
  const dx = point.x - object.position.x;
  const dz = point.z - object.position.z;
  if (object.collision.type === "circle")
    return Math.hypot(dx, dz) < object.collision.radius * object.scale + agentRadius;
  const cos = Math.cos(object.rotation);
  const sin = Math.sin(object.rotation);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  return (
    Math.abs(localX) < (object.collision.width * object.scale) / 2 + agentRadius &&
    Math.abs(localZ) < (object.collision.depth * object.scale) / 2 + agentRadius
  );
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
  if (!finite(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS)
    errors.push(issue("arena", `Arena radius must be between ${MIN_RADIUS}m and ${MAX_RADIUS}m.`));
  const safeRadius = finite(radius) ? radius : 0;

  const player = record(value["playerSpawn"]);
  const playerPoint =
    player && finite(player["x"]) && finite(player["z"])
      ? { x: player["x"], z: player["z"] }
      : null;
  if (!playerPoint || !isInsideArena(playerPoint.x, playerPoint.z, safeRadius))
    errors.push(issue("spawn", "Player spawn must be inside the arena."));

  const usedIds = new Set<string>();
  const runnerRaw = value["runnerSpawns"];
  if (!Array.isArray(runnerRaw) || runnerRaw.length !== 3)
    errors.push(issue("spawns", "A playable map must have exactly three runner spawns."));
  const runners = Array.isArray(runnerRaw) ? runnerRaw : [];
  const validRunners: { id: string; x: number; z: number }[] = [];
  for (const [index, raw] of runners.entries()) {
    const runner = record(raw);
    if (!runner || !validId(runner["id"])) {
      errors.push(
        issue(
          "spawn-id",
          "Runner spawn IDs must be unique and valid.",
          `runnerSpawns[${index}].id`,
        ),
      );
      continue;
    }
    const id = runner["id"];
    if (usedIds.has(id)) errors.push(issue("duplicate-id", `Duplicate map object ID: ${id}.`));
    usedIds.add(id);
    const x = runner["x"];
    const z = runner["z"];
    if (!finite(x) || !finite(z) || !isInsideArena(x, z, safeRadius)) {
      errors.push(
        issue("spawn", "Runner spawn must be inside the arena.", `runnerSpawns[${index}]`),
      );
      continue;
    }
    validRunners.push({ id, x, z });
  }
  if (validRunners.length === 3) {
    for (let i = 0; i < validRunners.length; i++) {
      for (let j = i + 1; j < validRunners.length; j++) {
        const first = validRunners[i]!;
        const second = validRunners[j]!;
        if (Math.hypot(first.x - second.x, first.z - second.z) < GAME_CONFIG.npc.spawnSeparation)
          errors.push(issue("spawn-overlap", "Runner spawns must be separated."));
      }
    }
    if (
      playerPoint &&
      validRunners.some(
        (spawn) =>
          Math.hypot(playerPoint.x - spawn.x, playerPoint.z - spawn.z) <
          GAME_CONFIG.npc.minSpawnDistanceFromPlayer,
      )
    )
      errors.push(issue("spawn-distance", "Runner spawns must start far enough from the player."));
  }

  const rawObjects = value["objects"];
  if (!Array.isArray(rawObjects)) errors.push(issue("objects", "Map props must be an array."));
  const objects = Array.isArray(rawObjects) ? rawObjects : [];
  if (objects.length > MAX_OBJECTS)
    errors.push(issue("size", `Maps may contain at most ${MAX_OBJECTS} props.`));
  const validObjects: {
    id: string;
    model: string;
    position: { x: number; z: number };
    rotation: number;
    scale: number;
    collision: CollisionShape;
  }[] = [];
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
    if (validId(id) && typeof model === "string")
      validObjects.push({
        id,
        model,
        position: point,
        rotation,
        scale,
        collision,
      });
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
    if (
      typeof kind !== "string" ||
      !validKinds.has(kind) ||
      object["model"] !== "" ||
      !position ||
      !isInsideArena(position["x"], position["z"], safeRadius) ||
      !finite(object["rotation"]) ||
      Math.abs(object["rotation"]) > MAX_TRANSFORM ||
      !finite(object["scale"]) ||
      object["scale"] <= 0 ||
      object["scale"] > 12 ||
      !finite(object["y"]) ||
      Math.abs(object["y"]) > 20 ||
      !validCollision(collision) ||
      (object["triggerRadius"] !== undefined &&
        (!finite(object["triggerRadius"]) ||
          object["triggerRadius"] <= 0 ||
          object["triggerRadius"] > 20))
    )
      errors.push(
        issue(
          "interactive-transform",
          "Interactive object has an invalid transform or configuration.",
          `interactiveObjects[${index}]`,
        ),
      );
  }

  if (playerPoint) {
    if (
      validObjects.some((object) => overlapsSpawn(playerPoint, object, GAME_CONFIG.player.radius))
    )
      errors.push(issue("spawn-collider", "Player spawn overlaps a prop collider."));
  }
  for (const spawn of validRunners)
    if (validObjects.some((object) => overlapsSpawn(spawn, object, GAME_CONFIG.npc.radius)))
      errors.push(issue("spawn-collider", "Runner spawn overlaps a prop collider."));

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
      typeof decoration["color"] !== "string" ||
      !/^#[0-9a-f]{3,8}$/i.test(decoration["color"])
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
