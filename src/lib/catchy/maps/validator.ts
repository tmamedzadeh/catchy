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
const REQUIRED_INTERACTIVES = [
  "speedPad",
  "slowZone",
  "elasticBounce",
  "temporaryBarrier",
] as const;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const issue = (code: string, message: string, path?: string): MapValidationIssue =>
  path === undefined ? { code, message } : { code, message, path };

function validCollision(collision: unknown): collision is CollisionShape {
  if (!collision || typeof collision !== "object") return false;
  const value = collision as Record<string, unknown>;
  if (value["type"] === "circle")
    return finite(value["radius"]) && value["radius"] > 0 && value["radius"] < 20;
  return (
    value["type"] === "box" &&
    finite(value["width"]) &&
    finite(value["depth"]) &&
    value["width"] > 0 &&
    value["depth"] > 0 &&
    value["width"] < 30 &&
    value["depth"] < 30
  );
}

export function validateMap(map: unknown): MapValidationResult {
  const errors: MapValidationIssue[] = [];
  const warnings: MapValidationIssue[] = [];
  if (!map || typeof map !== "object")
    return { valid: false, errors: [issue("schema", "Map must be an object.")], warnings };
  const value = map as Partial<MapDefinition>;
  if (value.schemaVersion !== 1) errors.push(issue("version", "Unsupported map schema version."));
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(value.id))
    errors.push(issue("id", "Map ID must be 2–64 letters, numbers, dashes, or underscores."));
  if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 80)
    errors.push(issue("name", "Map name is required and must be at most 80 characters."));
  if (
    !value.arena ||
    !finite(value.arena.radius) ||
    value.arena.radius < MIN_RADIUS ||
    value.arena.radius > MAX_RADIUS
  )
    errors.push(issue("arena", `Arena radius must be between ${MIN_RADIUS}m and ${MAX_RADIUS}m.`));
  const radius = value.arena?.radius ?? 0;
  const inArena = (x: unknown, z: unknown) =>
    finite(x) && finite(z) && Math.hypot(x, z) < radius - GAME_CONFIG.obstacleMargin;
  const player = value.playerSpawn;
  if (!player || !inArena(player.x, player.z))
    errors.push(issue("spawn", "Player spawn must be inside the arena."));
  if (!Array.isArray(value.runnerSpawns) || value.runnerSpawns.length !== 3)
    errors.push(issue("spawns", "A playable map must have exactly three runner spawns."));
  const runners = Array.isArray(value.runnerSpawns) ? value.runnerSpawns : [];
  const spawnPoints = [player, ...runners];
  for (const [index, spawn] of spawnPoints.entries())
    if (!spawn || !inArena(spawn.x, spawn.z))
      errors.push(issue("spawn", "Spawn must be inside the arena.", `spawns[${index}]`));
  for (let i = 0; i < runners.length; i++)
    for (let j = i + 1; j < runners.length; j++)
      if (
        Math.hypot(runners[i]!.x - runners[j]!.x, runners[i]!.z - runners[j]!.z) <
        GAME_CONFIG.npc.spawnSeparation
      )
        errors.push(issue("spawn-overlap", "Runner spawns must be separated."));
  if (
    player &&
    runners.some(
      (spawn) =>
        Math.hypot(player.x - spawn.x, player.z - spawn.z) <
        GAME_CONFIG.npc.minSpawnDistanceFromPlayer,
    )
  )
    errors.push(issue("spawn-distance", "Runner spawns must start far enough from the player."));
  const objects = Array.isArray(value.objects) ? value.objects : [];
  if (objects.length > MAX_OBJECTS)
    errors.push(issue("size", `Maps may contain at most ${MAX_OBJECTS} props.`));
  const ids = new Set<string>();
  for (const [index, object] of objects.entries()) {
    if (!object || typeof object !== "object") {
      errors.push(issue("object", "Invalid prop.", `objects[${index}]`));
      continue;
    }
    if (typeof object.id !== "string" || ids.has(object.id))
      errors.push(issue("object-id", "Prop IDs must be unique and non-empty."));
    else ids.add(object.id);
    if (!ASSET_BY_ID.has(object.model))
      errors.push(issue("asset", `Unknown bundled asset: ${String(object.model)}.`));
    if (!object.position || !inArena(object.position.x, object.position.z))
      errors.push(issue("bounds", "Props must remain inside the arena."));
    if (
      !finite(object.rotation) ||
      !finite(object.scale) ||
      object.scale <= 0 ||
      object.scale > 12 ||
      !finite(object.y) ||
      !validCollision(object.collision)
    )
      errors.push(
        issue("transform", "Prop transform and collision must contain finite, sensible values."),
      );
  }
  const interactiveIds = new Set<string>();
  const interactives = Array.isArray(value.interactiveObjects) ? value.interactiveObjects : [];
  for (const object of interactives) {
    if (!object || typeof object.id !== "string" || interactiveIds.has(object.id))
      errors.push(issue("interactive-id", "Interactive object IDs must be unique and non-empty."));
    else interactiveIds.add(object.id);
  }
  for (const kind of REQUIRED_INTERACTIVES) {
    const matches = interactives.filter((object) => object?.kind === kind);
    if (matches.length !== 1)
      errors.push(issue("interactive", `Map must contain exactly one ${kind}.`));
  }
  for (const object of interactives)
    if (
      !object.position ||
      !inArena(object.position.x, object.position.z) ||
      !finite(object.rotation) ||
      !finite(object.scale) ||
      object.scale <= 0 ||
      !validCollision(object.collision)
    )
      errors.push(issue("interactive-transform", "Interactive object has an invalid transform."));
  if (objects.length > 120)
    warnings.push(issue("performance", "Large maps may reduce rendering performance."));
  return { valid: errors.length === 0, errors, warnings };
}

export function isMapDefinition(value: unknown): value is MapDefinition {
  return validateMap(value).valid;
}
