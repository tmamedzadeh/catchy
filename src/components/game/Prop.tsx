import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { PROPS, PROP_MODELS } from "@/lib/sprout/config";

PROP_MODELS.forEach((m) => useGLTF.preload(`/models/${m}.glb`));

/**
 * Renders every instance of one model. Clones per instance (useGLTF caches the
 * source scene) and enables shadows on the clone.
 */
function PropGroup({ model }: { model: string }) {
  const { scene } = useGLTF(`/models/${model}.glb`);
  const items = useMemo(() => PROPS.filter((p) => p.m === model), [model]);

  const clones = useMemo(
    () =>
      items.map((it) => {
        const c = scene.clone(true);
        c.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
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
          position={[it.p[0], it.y ?? 0, it.p[1]]}
          rotation-y={it.r ?? 0}
          scale={it.s ?? 1}
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
