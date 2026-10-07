import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CharacterVariant } from "./characterVariants";

type ShapeName = "sphere" | "dome" | "capsule" | "torus" | "cone" | "star";
type Piece = {
  shape: ShapeName;
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
};

const starShape = new THREE.Shape();
for (let point = 0; point < 10; point++) {
  const angle = (point * Math.PI) / 5 - Math.PI / 2;
  const radius = point % 2 === 0 ? 1 : 0.46;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  if (point === 0) starShape.moveTo(x, y);
  else starShape.lineTo(x, y);
}
starShape.closePath();

/** Low-poly source shapes are shared. Variant rigs only own their small merged part geometries. */
const SHAPES: Record<ShapeName, THREE.BufferGeometry> = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  dome: new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 8),
  torus: new THREE.TorusGeometry(1, 0.14, 6, 16),
  cone: new THREE.ConeGeometry(1, 1, 8),
  star: new THREE.ShapeGeometry(starShape),
};

const materials = new Map<string, THREE.MeshStandardMaterial>();

function material(color: string, roughness = 0.82) {
  const key = `${color}:${roughness}`;
  let result = materials.get(key);
  if (!result) {
    result = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materials.set(key, result);
  }
  return result;
}

function piece(
  shape: ShapeName,
  color: string,
  position: [number, number, number],
  scale: [number, number, number],
  rotation?: [number, number, number],
): Piece {
  return rotation ? { shape, color, position, scale, rotation } : { shape, color, position, scale };
}

function addMergedPieces(
  parent: THREE.Group,
  pieces: Piece[],
  ownedGeometries: THREE.BufferGeometry[],
) {
  const byMaterial = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
  for (const item of pieces) {
    const source = SHAPES[item.shape];
    const transformed = source.clone();
    const position = new THREE.Vector3(...item.position);
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...(item.rotation ?? [0, 0, 0])),
    );
    const scale = new THREE.Vector3(...item.scale);
    transformed.applyMatrix4(new THREE.Matrix4().compose(position, rotation, scale));
    const mat = material(item.color);
    const group = byMaterial.get(mat) ?? [];
    group.push(transformed);
    byMaterial.set(mat, group);
  }

  for (const [mat, geometries] of byMaterial) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error("Catchy character geometry could not be combined");
    ownedGeometries.push(merged);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

export type CharacterRig = {
  model: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  dispose: () => void;
};

function hairPieces(variant: CharacterVariant): Piece[] {
  const { colors: c } = variant;
  const pieces = [piece("sphere", c.hair, [0, 0.25, -0.02], [0.44, 0.27, 0.38])];

  switch (variant.hair) {
    case "cap":
      pieces.push(
        piece("dome", c.accent, [0, 0.17, 0], [0.47, 0.29, 0.42]),
        piece("sphere", c.shirt, [0, 0.17, 0.2], [0.48, 0.055, 0.22]),
        piece("sphere", c.hair, [0, 0.02, -0.23], [0.29, 0.2, 0.15]),
      );
      break;
    case "ponytail":
      pieces.push(
        piece("capsule", c.hair, [0, -0.01, -0.29], [0.15, 0.22, 0.14], [-1.05, 0, 0]),
        piece("sphere", c.accent, [0, 0.06, -0.17], [0.105, 0.07, 0.08]),
        piece("sphere", c.hair, [-0.31, 0.02, 0.02], [0.13, 0.22, 0.16]),
      );
      break;
    case "sideBob":
      pieces.push(
        piece("sphere", c.hair, [-0.34, -0.09, 0.02], [0.15, 0.33, 0.17]),
        piece("sphere", c.hair, [0.34, -0.08, 0.01], [0.14, 0.32, 0.17]),
        piece("sphere", c.hair, [0.12, 0.13, 0.29], [0.28, 0.13, 0.12]),
      );
      break;
    case "beanie":
      pieces.push(
        piece("sphere", c.hair, [0, 0.22, -0.02], [0.45, 0.32, 0.4]),
        piece("sphere", c.accent, [0, 0.01, 0.04], [0.45, 0.075, 0.39]),
        piece("sphere", c.secondary, [0, 0.52, -0.02], [0.12, 0.11, 0.12]),
      );
      break;
    case "buns":
      pieces.push(
        piece("sphere", c.hair, [-0.34, 0.22, -0.03], [0.19, 0.2, 0.18]),
        piece("sphere", c.hair, [0.34, 0.22, -0.03], [0.19, 0.2, 0.18]),
        piece("sphere", c.accent, [0, 0.05, -0.28], [0.11, 0.075, 0.07]),
      );
      break;
    case "spiky":
      pieces.push(
        piece("cone", c.hair, [-0.2, 0.43, -0.04], [0.14, 0.28, 0.13], [0, 0, -0.32]),
        piece("cone", c.hair, [0, 0.49, -0.03], [0.15, 0.31, 0.13]),
        piece("cone", c.hair, [0.2, 0.42, -0.04], [0.14, 0.27, 0.13], [0, 0, 0.32]),
      );
      break;
  }
  return pieces;
}

function torsoPieces(variant: CharacterVariant): Piece[] {
  const c = variant.colors;
  const pieces = [
    piece("sphere", c.pants, [0, 0.69, 0], [0.29, 0.23, 0.245]),
    piece("sphere", c.shirt, [0, 1.08, 0], [0.34, 0.4, 0.27]),
    piece("sphere", c.skin, [0, 1.48, 0], [0.13, 0.17, 0.13]),
  ];

  switch (variant.outfit) {
    case "varsity":
      pieces.push(
        piece("capsule", c.accent, [0, 1.08, 0.255], [0.025, 0.25, 0.018]),
        piece("sphere", c.secondary, [-0.19, 1.24, 0.16], [0.06, 0.055, 0.045]),
        piece("sphere", c.secondary, [0.19, 1.24, 0.16], [0.06, 0.055, 0.045]),
      );
      break;
    case "sport":
      pieces.push(
        piece("capsule", c.accent, [-0.23, 1.09, 0.17], [0.035, 0.2, 0.035], [0, 0, -0.2]),
        piece("capsule", c.accent, [0.23, 1.09, 0.17], [0.035, 0.2, 0.035], [0, 0, 0.2]),
      );
      break;
    case "hoodie":
      pieces.push(
        piece("sphere", c.accent, [0, 1.42, -0.17], [0.31, 0.3, 0.17]),
        piece("capsule", c.secondary, [-0.055, 0.98, 0.25], [0.018, 0.12, 0.014]),
        piece("capsule", c.secondary, [0.055, 0.98, 0.25], [0.018, 0.12, 0.014]),
        piece("sphere", c.accent, [0, 0.89, 0.23], [0.18, 0.09, 0.035]),
      );
      break;
    case "overalls":
      pieces.push(
        piece("sphere", c.pants, [0, 1.08, 0.24], [0.23, 0.29, 0.055]),
        piece("capsule", c.pants, [-0.14, 1.31, 0.22], [0.045, 0.2, 0.04]),
        piece("capsule", c.pants, [0.14, 1.31, 0.22], [0.045, 0.2, 0.04]),
        piece("sphere", c.accent, [-0.14, 1.37, 0.26], [0.04, 0.04, 0.025]),
        piece("sphere", c.accent, [0.14, 1.37, 0.26], [0.04, 0.04, 0.025]),
      );
      break;
    case "tracksuit":
      pieces.push(
        piece("capsule", c.accent, [-0.23, 1.07, 0.17], [0.025, 0.22, 0.025]),
        piece("capsule", c.accent, [0.23, 1.07, 0.17], [0.025, 0.22, 0.025]),
      );
      break;
    case "jumper":
      pieces.push(
        piece("torus", c.secondary, [0, 1.42, 0], [0.15, 0.045, 0.15], [Math.PI / 2, 0, 0]),
        piece("sphere", c.accent, [0.18, 1.2, 0.22], [0.07, 0.06, 0.035]),
      );
      break;
  }

  switch (variant.accessory) {
    case "sling":
      pieces.push(
        piece("capsule", c.accent, [0.02, 1.05, 0.27], [0.035, 0.27, 0.025], [0, 0, -0.56]),
        piece("sphere", c.secondary, [0.23, 0.77, 0.12], [0.13, 0.13, 0.13]),
        piece("sphere", c.accent, [0, 0.97, -0.27], [0.2, 0.25, 0.12]),
      );
      break;
    case "scarf":
      pieces.push(piece("torus", c.accent, [0, 1.47, 0], [0.17, 0.055, 0.16], [Math.PI / 2, 0, 0]));
      break;
    case "backpack":
      pieces.push(
        piece("sphere", c.accent, [0, 0.98, -0.25], [0.23, 0.32, 0.16]),
        piece("sphere", c.secondary, [0, 1.2, -0.27], [0.2, 0.09, 0.15]),
      );
      break;
    case "starPin":
      pieces.push(piece("star", c.secondary, [-0.19, 1.2, 0.255], [0.08, 0.08, 0.018]));
      break;
    case "ribbon":
      // The bow tail peeks over the shoulder so the runner remains identifiable from behind.
      pieces.push(piece("sphere", c.accent, [0.15, 1.38, -0.19], [0.09, 0.12, 0.06]));
      break;
    case "wristbands":
      // Wristbands are placed on the animated arm pivots below.
      break;
  }
  return pieces;
}

function facePieces(variant: CharacterVariant): Piece[] {
  const c = variant.colors;
  return [
    piece("sphere", c.skin, [0, 0, 0], [0.46, 0.49, 0.4]),
    piece("sphere", c.skin, [-0.44, -0.04, 0], [0.105, 0.13, 0.1]),
    piece("sphere", c.skin, [0.44, -0.04, 0], [0.105, 0.13, 0.1]),
    piece("sphere", "#fff8ed", [-0.14, 0.035, 0.365], [0.072, 0.09, 0.035]),
    piece("sphere", "#fff8ed", [0.14, 0.035, 0.365], [0.072, 0.09, 0.035]),
    piece("sphere", "#30242a", [-0.14, 0.035, 0.397], [0.039, 0.052, 0.02]),
    piece("sphere", "#30242a", [0.14, 0.035, 0.397], [0.039, 0.052, 0.02]),
    piece("sphere", "#ffffff", [-0.153, 0.059, 0.416], [0.015, 0.018, 0.01]),
    piece("sphere", "#ffffff", [0.127, 0.059, 0.416], [0.015, 0.018, 0.01]),
    piece("capsule", c.hair, [-0.14, 0.165, 0.37], [0.07, 0.018, 0.018], [0, 0, -0.12]),
    piece("capsule", c.hair, [0.14, 0.165, 0.37], [0.07, 0.018, 0.018], [0, 0, 0.12]),
    piece("sphere", c.skinLight, [0, -0.025, 0.397], [0.035, 0.04, 0.035]),
    piece("torus", "#9b5054", [0, -0.13, 0.385], [0.065, 0.04, 0.018], [0, 0, Math.PI]),
    piece("sphere", "#ec8790", [-0.26, -0.07, 0.31], [0.065, 0.028, 0.015]),
    piece("sphere", "#ec8790", [0.26, -0.07, 0.31], [0.065, 0.028, 0.015]),
    ...hairPieces(variant),
  ];
}

function legPieces(variant: CharacterVariant, side: -1 | 1): Piece[] {
  const c = variant.colors;
  const pieces = [
    piece("capsule", c.pants, [0, -0.22, 0], [0.12, 0.11, 0.12]),
    piece("sphere", c.shoes, [0, -0.47, 0.075], [0.155, 0.105, 0.22]),
    piece("sphere", "#fff5df", [0, -0.525, 0.075], [0.16, 0.035, 0.225]),
    piece("sphere", c.accent, [0, -0.455, 0.245], [0.075, 0.035, 0.025]),
  ];
  if (variant.outfit === "tracksuit") {
    pieces.push(piece("capsule", c.accent, [side * 0.105, -0.22, 0.07], [0.018, 0.09, 0.018]));
  }
  return pieces;
}

function armPieces(variant: CharacterVariant, side: -1 | 1): Piece[] {
  const c = variant.colors;
  const pieces = [
    piece("capsule", c.shirt, [0, -0.17, 0], [0.105, 0.13, 0.105]),
    piece("sphere", c.skin, [0, -0.38, 0], [0.09, 0.17, 0.085]),
    piece("sphere", c.skinLight, [0, -0.54, 0.025], [0.095, 0.09, 0.09]),
  ];
  if (variant.accessory === "wristbands") {
    pieces.push(
      piece("torus", c.accent, [0, -0.31, 0], [0.095, 0.028, 0.095], [Math.PI / 2, 0, 0]),
    );
  }
  if (variant.outfit === "sport" && side < 0) {
    pieces.push(
      piece("torus", c.accent, [0, -0.26, 0], [0.105, 0.025, 0.105], [Math.PI / 2, 0, 0]),
    );
  }
  return pieces;
}

export function createCharacterRig(variant: CharacterVariant): CharacterRig {
  const ownedGeometries: THREE.BufferGeometry[] = [];
  const model = new THREE.Group();
  model.name = `catchy-character-${variant.id}`;
  model.scale.setScalar(variant.scale);

  const body = new THREE.Group();
  body.name = "animated-body";
  model.add(body);

  const torso = new THREE.Group();
  torso.name = "clothing-and-accessories";
  body.add(torso);
  addMergedPieces(torso, torsoPieces(variant), ownedGeometries);

  const head = new THREE.Group();
  head.name = "head-and-face";
  head.position.set(0, 1.79, 0);
  body.add(head);
  addMergedPieces(head, facePieces(variant), ownedGeometries);

  const leftLeg = new THREE.Group();
  leftLeg.name = "left-leg";
  leftLeg.position.set(-0.15, 0.59, 0);
  body.add(leftLeg);
  addMergedPieces(leftLeg, legPieces(variant, -1), ownedGeometries);

  const rightLeg = new THREE.Group();
  rightLeg.name = "right-leg";
  rightLeg.position.set(0.15, 0.59, 0);
  body.add(rightLeg);
  addMergedPieces(rightLeg, legPieces(variant, 1), ownedGeometries);

  const leftArm = new THREE.Group();
  leftArm.name = "left-arm";
  leftArm.position.set(-0.34, 1.28, 0);
  body.add(leftArm);
  addMergedPieces(leftArm, armPieces(variant, -1), ownedGeometries);

  const rightArm = new THREE.Group();
  rightArm.name = "right-arm";
  rightArm.position.set(0.34, 1.28, 0);
  body.add(rightArm);
  addMergedPieces(rightArm, armPieces(variant, 1), ownedGeometries);

  return {
    model,
    body,
    head,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    dispose: () => ownedGeometries.forEach((geometry) => geometry.dispose()),
  };
}
