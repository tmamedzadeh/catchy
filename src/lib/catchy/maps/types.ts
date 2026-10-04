export const MAP_SCHEMA_VERSION = 1 as const;

export type Point2 = { x: number; z: number };
export type CollisionShape =
  { type: "box"; width: number; depth: number } | { type: "circle"; radius: number };

export type MapObject = {
  id: string;
  model: string;
  position: Point2;
  rotation: number;
  scale: number;
  y: number;
  collision: CollisionShape;
};

export type InteractiveKind = "speedPad" | "slowZone" | "elasticBounce" | "temporaryBarrier";
export type InteractiveMapObject = {
  id: string;
  kind: InteractiveKind;
  model: "";
  position: Point2;
  rotation: number;
  scale: number;
  y: number;
  collision: CollisionShape;
  triggerRadius?: number;
};

export type MapDecoration = {
  id: string;
  kind: "island";
  position: Point2;
  radius: number;
  color: string;
  y: number;
};

export type MapDefinition = {
  /** Public map format version. `schemaVersion` remains for V1 compatibility. */
  version: typeof MAP_SCHEMA_VERSION;
  schemaVersion: typeof MAP_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  arena: { radius: number };
  /** @deprecated Legacy maps may contain this field; it is ignored and removed on normalization. */
  playerSpawn?: Point2;
  /** @deprecated Legacy maps may contain this field; it is ignored and removed on normalization. */
  runnerSpawns?: { id: string; x: number; z: number }[];
  objects: MapObject[];
  interactiveObjects: InteractiveMapObject[];
  decorations?: MapDecoration[];
};

export type MapValidationIssue = { code: string; message: string; path?: string };
export type MapValidationResult = {
  valid: boolean;
  errors: MapValidationIssue[];
  warnings: MapValidationIssue[];
};
