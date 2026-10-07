import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { AGENTS } from "@/lib/catchy/agents";
import { GAME_CONFIG } from "@/lib/catchy/config";
import { createCharacterRig } from "./characterModel";
import { CHARACTER_VARIANTS, getCharacterVariant } from "./characterVariants";

const rigs: ReturnType<typeof createCharacterRig>[] = [];

afterEach(() => {
  rigs.splice(0).forEach((rig) => rig.dispose());
});

describe("Catchy character visuals", () => {
  it("keeps six stable, distinct identities in the existing player and runner order", () => {
    expect(CHARACTER_VARIANTS.map(({ id }) => id)).toEqual(AGENTS.map(({ id }) => id));
    expect(CHARACTER_VARIANTS.map(({ hair }) => hair)).toEqual([
      "cap",
      "ponytail",
      "sideBob",
      "beanie",
      "buns",
      "spiky",
    ]);
    expect(new Set(CHARACTER_VARIANTS.map(({ outfit }) => outfit)).size).toBe(6);
    expect(new Set(CHARACTER_VARIANTS.map(({ accessory }) => accessory)).size).toBe(6);
    expect(CHARACTER_VARIANTS[0]).toMatchObject({ id: "player", role: "player" });
    expect(CHARACTER_VARIANTS.slice(1).every(({ role }) => role === "runner")).toBe(true);
  });

  it("does not expose mutable shared variant configuration", () => {
    const before = JSON.stringify(CHARACTER_VARIANTS);
    expect(Object.isFrozen(CHARACTER_VARIANTS)).toBe(true);
    for (const variant of CHARACTER_VARIANTS) {
      expect(Object.isFrozen(variant)).toBe(true);
      expect(Object.isFrozen(variant.colors)).toBe(true);
    }
    expect(() => getCharacterVariant(6)).toThrow(RangeError);
    expect(JSON.stringify(CHARACTER_VARIANTS)).toBe(before);
  });

  it("builds lightweight, grounded Three.js rigs for every variant with shared materials", () => {
    const sharedMaterials = new Set<THREE.Material>();
    const meshCounts: number[] = [];

    for (const variant of CHARACTER_VARIANTS) {
      const rig = createCharacterRig(variant);
      rigs.push(rig);
      expect(rig.model.name).toBe(`catchy-character-${variant.id}`);
      expect(rig.model.children).toContain(rig.body);
      expect(rig.body.children).toContain(rig.head);
      expect(
        [rig.leftLeg, rig.rightLeg, rig.leftArm, rig.rightArm].every((part) =>
          rig.body.children.includes(part),
        ),
      ).toBe(true);

      const meshes: THREE.Mesh[] = [];
      rig.model.traverse((object) => {
        if (object instanceof THREE.Mesh) meshes.push(object);
      });
      meshCounts.push(meshes.length);
      expect(meshes.length).toBeGreaterThan(0);
      expect(meshes.length).toBeLessThanOrEqual(30);
      expect(meshes.every((mesh) => mesh.geometry.getAttribute("position").count > 0)).toBe(true);
      expect(meshes.every((mesh) => mesh.castShadow && mesh.receiveShadow)).toBe(true);

      const bounds = new THREE.Box3().setFromObject(rig.model);
      expect(bounds.min.y).toBeGreaterThanOrEqual(0);
      expect(bounds.min.y).toBeLessThan(0.08);
      expect(bounds.max.y).toBeLessThan(3);

      for (const object of rig.head.children) {
        if (!(object instanceof THREE.Mesh)) continue;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material.color.getHexString() === "fff8ed") sharedMaterials.add(material);
        }
      }
    }

    expect(meshCounts.every((count) => count <= 30)).toBe(true);
    expect(sharedMaterials.size).toBe(1);
  });

  it("keeps character visuals separate from the authoritative gameplay dimensions", () => {
    expect(GAME_CONFIG.player.radius).toBe(0.55);
    expect(GAME_CONFIG.npc.radius).toBe(0.48);
    expect(GAME_CONFIG.captureDistance).toBe(2);
    expect(GAME_CONFIG.player.jump).toEqual({ height: 1.15, durationSeconds: 0.72 });
    expect(AGENTS.map(({ radius }) => radius)).toEqual([0.55, 0.48, 0.48, 0.48, 0.48, 0.48]);
  });
});
