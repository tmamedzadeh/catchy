import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { PROPS, PROP_MODELS } from "@/lib/sprout/config";

/** Each kit keeps its own Textures/ folder, so models live in kit subfolders. */
function url(model: string) {
  const kit = /^(tree_|plant_|flower_|grass_|stone_|statue_)/.test(model)
    ? "nature"
    : /^(crate|barrel|chest|flag-)/.test(model)
      ? "pirate"
      : "town";
  return `/models/${kit}/${model}.glb`;
}

PROP_MODELS.forEach((m) => useGLTF.preload(url(m)));

/**
 * Renders every instance of one model. Clones per instance (useGLTF caches the
 * source scene) and enables shadows on the clone.
 */
function PropGroup({ model }: { model: string }) {
  const { scene } = useGLTF(url(model));
  const items = useMemo(() => PROPS.filter((p) => p.model === model), [model]);

  const clones = useMemo(
    () =>
      items.map((it) => {
        const c = scene.clone(true);
        c.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const enhance = (source: THREE.Material) => {
              const material = source.clone();
              if (material instanceof THREE.MeshStandardMaterial) {
                const hsl = { h: 0, s: 0, l: 0 };
                material.color.getHSL(hsl);
                material.color.setHSL(
                  hsl.h,
                  Math.min(1, hsl.s * 1.22 + 0.04),
                  Math.min(0.72, hsl.l * 1.03),
                );
                material.roughness = Math.min(material.roughness, 0.72);
                material.envMapIntensity = 0.85;
              }
              return material;
            };
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map(enhance)
              : enhance(mesh.material);
          }
        });
        return { c, it };
      }),
    [scene, items],
  );

  return (
    <group>
      {clones.map(({ c, it }, i) => (
        <primitive
          key={i}
          object={c}
          position={[it.position.x, it.y, it.position.z]}
          rotation-y={it.rotation}
          scale={it.scale}
        />
      ))}
    </group>
  );
}

export function Props() {
  return (
    <group>
      {PROP_MODELS.map((m) => (
        <PropGroup key={m} model={m} />
      ))}
    </group>
  );
}
