import type { CollisionShape } from "./types";

export type AssetCatalogEntry = {
  id: string;
  displayName: string;
  category: "walls" | "crates" | "barrels" | "rocks" | "trees" | "town";
  modelPath: string;
  defaultScale: number;
  collision: CollisionShape;
  /** Canonical GLB dimensions in model units, read from bundled asset bounds. */
  bounds: { width: number; height: number; depth: number };
};

const circle = (radius: number): CollisionShape => ({ type: "circle", radius });
const box = (width: number, depth: number): CollisionShape => ({ type: "box", width, depth });

export const ASSET_CATALOG: readonly AssetCatalogEntry[] = [
  {
    id: "fountain-round",
    displayName: "Fountain",
    category: "town",
    modelPath: "/models/town/fountain-round.glb",
    defaultScale: 3.1,
    collision: circle(1.3),
    bounds: { width: 2, height: 0.28, depth: 2 },
  },
  {
    id: "wall-block",
    displayName: "Stone wall",
    category: "walls",
    modelPath: "/models/town/wall-block.glb",
    defaultScale: 1.9,
    collision: box(0.98, 0.52),
    bounds: { width: 1, height: 1, depth: 1 },
  },
  {
    id: "crate",
    displayName: "Crate",
    category: "crates",
    modelPath: "/models/pirate/crate.glb",
    defaultScale: 1.35,
    collision: box(0.72, 0.72),
    bounds: { width: 1.078, height: 0.77, depth: 1.309 },
  },
  {
    id: "crate-bottles",
    displayName: "Bottle crate",
    category: "crates",
    modelPath: "/models/pirate/crate-bottles.glb",
    defaultScale: 1.5,
    collision: box(0.72, 0.72),
    bounds: { width: 1.078, height: 1.057, depth: 1.309 },
  },
  {
    id: "barrel",
    displayName: "Barrel",
    category: "barrels",
    modelPath: "/models/pirate/barrel.glb",
    defaultScale: 1.2,
    collision: circle(0.38),
    bounds: { width: 1.336, height: 1.229, depth: 1.336 },
  },
  {
    id: "cart",
    displayName: "Cart",
    category: "town",
    modelPath: "/models/town/cart.glb",
    defaultScale: 2,
    collision: box(0.82, 0.52),
    bounds: { width: 1, height: 1.03, depth: 1.34 },
  },
  {
    id: "lantern",
    displayName: "Lantern",
    category: "town",
    modelPath: "/models/town/lantern.glb",
    defaultScale: 2.2,
    collision: circle(0.24),
    bounds: { width: 0.216, height: 1.556, depth: 0.224 },
  },
  {
    id: "rock-large",
    displayName: "Large rock",
    category: "rocks",
    modelPath: "/models/town/rock-large.glb",
    defaultScale: 2.1,
    collision: circle(0.42),
    bounds: { width: 1.67, height: 1.163, depth: 1.549 },
  },
  {
    id: "rock-wide",
    displayName: "Wide rock",
    category: "rocks",
    modelPath: "/models/town/rock-wide.glb",
    defaultScale: 1.8,
    collision: circle(0.48),
    bounds: { width: 1.094, height: 1.02, depth: 1.567 },
  },
  {
    id: "rock-small",
    displayName: "Small rock",
    category: "rocks",
    modelPath: "/models/town/rock-small.glb",
    defaultScale: 1.7,
    collision: circle(0.36),
    bounds: { width: 0.998, height: 1.02, depth: 1.326 },
  },
  {
    id: "stone_tallD",
    displayName: "Tall stone",
    category: "rocks",
    modelPath: "/models/nature/stone_tallD.glb",
    defaultScale: 2.6,
    collision: circle(0.4),
    bounds: { width: 0.443, height: 0.772, depth: 0.461 },
  },
  {
    id: "stone_largeC",
    displayName: "Large stone",
    category: "rocks",
    modelPath: "/models/nature/stone_largeC.glb",
    defaultScale: 2.4,
    collision: circle(0.46),
    bounds: { width: 1.064, height: 0.321, depth: 1.016 },
  },
  {
    id: "tree_palmDetailedTall",
    displayName: "Tall palm",
    category: "trees",
    modelPath: "/models/nature/tree_palmDetailedTall.glb",
    defaultScale: 3.4,
    collision: circle(0.2),
    bounds: { width: 1.034, height: 1.442, depth: 1.034 },
  },
  {
    id: "tree_palmBend",
    displayName: "Bent palm",
    category: "trees",
    modelPath: "/models/nature/tree_palmBend.glb",
    defaultScale: 3.1,
    collision: circle(0.2),
    bounds: { width: 0.935, height: 1.38, depth: 1.013 },
  },
  {
    id: "tree_palmDetailedShort",
    displayName: "Short palm",
    category: "trees",
    modelPath: "/models/nature/tree_palmDetailedShort.glb",
    defaultScale: 3,
    collision: circle(0.2),
    bounds: { width: 1.034, height: 1.142, depth: 1.034 },
  },
];

export const ASSET_BY_ID: ReadonlyMap<string, AssetCatalogEntry> = new Map(
  ASSET_CATALOG.map((asset) => [asset.id, asset]),
);

/** Fit the current semantic collider shape to the canonical model footprint. */
export function fitColliderToAsset(model: string, current: CollisionShape): CollisionShape | null {
  const bounds = ASSET_BY_ID.get(model)?.bounds;
  if (!bounds) return null;
  return current.type === "circle"
    ? { type: "circle", radius: Math.max(bounds.width, bounds.depth) / 2 }
    : { type: "box", width: bounds.width, depth: bounds.depth };
}

/** Height of the visible model after its existing uniform map scale. */
export function getAssetHeight(model: string, scale: number) {
  const height = ASSET_BY_ID.get(model)?.bounds.height;
  return height === undefined || !Number.isFinite(scale) ? Infinity : height * scale;
}
