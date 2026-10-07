import * as THREE from "three";

/** Shared irregular ground patch used by the game world and map editor. */
export function createIslandGeometry(radius: number) {
  const shape = new THREE.Shape();
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = 1 + Math.sin(i * 2.37 + radius) * 0.09 + Math.cos(i * 1.17) * 0.05;
    const x = Math.cos(angle) * radius * wobble;
    const z = Math.sin(angle) * radius * wobble;
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
