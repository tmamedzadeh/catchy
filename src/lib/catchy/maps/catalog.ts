import type { CollisionShape } from "./types";

export type AssetCatalogEntry = {
  id: string;
  displayName: string;
  category: "walls" | "crates" | "barrels" | "rocks" | "trees" | "town";
  modelPath: string;
  defaultScale: number;
  collision: CollisionShape;
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
  },
  {
    id: "wall-block",
    displayName: "Stone wall",
    category: "walls",
    modelPath: "/models/town/wall-block.glb",
    defaultScale: 1.9,
    collision: box(0.98, 0.52),
  },
  {
    id: "crate",
    displayName: "Crate",
    category: "crates",
    modelPath: "/models/pirate/crate.glb",
    defaultScale: 1.35,
    collision: box(0.72, 0.72),
  },
  {
    id: "crate-bottles",
    displayName: "Bottle crate",
    category: "crates",
    modelPath: "/models/pirate/crate-bottles.glb",
    defaultScale: 1.5,
    collision: box(0.72, 0.72),
  },
  {
    id: "barrel",
    displayName: "Barrel",
    category: "barrels",
    modelPath: "/models/pirate/barrel.glb",
    defaultScale: 1.2,
    collision: circle(0.38),
  },
  {
    id: "cart",
    displayName: "Cart",
    category: "town",
    modelPath: "/models/town/cart.glb",
    defaultScale: 2,
    collision: box(0.82, 0.52),
  },
  {
    id: "lantern",
    displayName: "Lantern",
    category: "town",
    modelPath: "/models/town/lantern.glb",
    defaultScale: 2.2,
    collision: circle(0.24),
  },
  {
    id: "rock-large",
    displayName: "Large rock",
    category: "rocks",
    modelPath: "/models/town/rock-large.glb",
    defaultScale: 2.1,
    collision: circle(0.42),
  },
  {
    id: "rock-wide",
    displayName: "Wide rock",
    category: "rocks",
    modelPath: "/models/town/rock-wide.glb",
    defaultScale: 1.8,
    collision: circle(0.48),
  },
  {
    id: "rock-small",
    displayName: "Small rock",
    category: "rocks",
    modelPath: "/models/town/rock-small.glb",
    defaultScale: 1.7,
    collision: circle(0.36),
  },
  {
    id: "stone_tallD",
    displayName: "Tall stone",
    category: "rocks",
    modelPath: "/models/nature/stone_tallD.glb",
    defaultScale: 2.6,
    collision: circle(0.4),
  },
  {
    id: "stone_largeC",
    displayName: "Large stone",
    category: "rocks",
    modelPath: "/models/nature/stone_largeC.glb",
    defaultScale: 2.4,
    collision: circle(0.46),
  },
  {
    id: "tree_palmDetailedTall",
    displayName: "Tall palm",
    category: "trees",
    modelPath: "/models/nature/tree_palmDetailedTall.glb",
    defaultScale: 3.4,
    collision: circle(0.2),
  },
  {
    id: "tree_palmBend",
    displayName: "Bent palm",
    category: "trees",
    modelPath: "/models/nature/tree_palmBend.glb",
    defaultScale: 3.1,
    collision: circle(0.2),
  },
  {
    id: "tree_palmDetailedShort",
    displayName: "Short palm",
    category: "trees",
    modelPath: "/models/nature/tree_palmDetailedShort.glb",
    defaultScale: 3,
    collision: circle(0.2),
  },
];

export const ASSET_BY_ID: ReadonlyMap<string, AssetCatalogEntry> = new Map(
  ASSET_CATALOG.map((asset) => [asset.id, asset]),
);
