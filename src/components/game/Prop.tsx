import { Suspense } from "react";
import { useLoader } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { ASSET_BY_ID, ASSET_CATALOG, getActiveMap } from "@/lib/catchy/maps";
import type { MapObject } from "@/lib/catchy/maps";
import { NonCriticalAssetBoundary } from "./NonCriticalAssetBoundary";

/** Catalog paths keep GLBs beside the atlas in their original kit folders. */
function modelUrl(model: string): string | undefined {
  return ASSET_BY_ID.get(model)?.modelPath;
}

const materialCache = new WeakMap<THREE.Material, THREE.Material>();
const atlasTextureCache = new Map<string, THREE.Texture>();

function sharedAtlasTexture(source: THREE.Texture, atlasUrl: string) {
  const key = [
    atlasUrl,
    source.mapping,
    source.channel,
    source.wrapS,
    source.wrapT,
    source.magFilter,
    source.minFilter,
    source.format,
    source.type,
    source.colorSpace,
    source.flipY,
    source.premultiplyAlpha,
    source.unpackAlignment,
    source.offset.x,
    source.offset.y,
    source.repeat.x,
    source.repeat.y,
    source.center.x,
    source.center.y,
    source.rotation,
    source.matrixAutoUpdate,
    source.matrix.elements.join(","),
    source.generateMipmaps,
    source.anisotropy,
  ].join("|");
  const shared = atlasTextureCache.get(key);
  if (shared) return shared;
  atlasTextureCache.set(key, source);
  return source;
}

function sharedEnhancedMaterial(source: THREE.Material, atlasUrl: string) {
  let material = materialCache.get(source);
  if (material) return material;

  material = source.clone();
  if (material instanceof THREE.MeshStandardMaterial) {
    if (material.map) material.map = sharedAtlasTexture(material.map, atlasUrl);
    const hsl = { h: 0, s: 0, l: 0 };
    material.color.getHSL(hsl);
    material.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.22 + 0.04), Math.min(0.72, hsl.l * 1.03));
    material.roughness = Math.min(material.roughness, 0.72);
    material.envMapIntensity = 0.85;
  }

  materialCache.set(source, material);
  return material;
}

function modelAtlasUrl(model: string): string | undefined {
  const assetUrl = modelUrl(model);
  if (!assetUrl) return undefined;
  return `${assetUrl.slice(0, assetUrl.lastIndexOf("/"))}/Textures/colormap.png`;
}

// Gameplay obstacles and large landmarks cast. Repeated foliage and small decor do not.
const SHADOW_CASTERS = new Set([
  "fountain-round",
  "wall-block",
  "crate",
  "crate-bottles",
  "barrel",
  "cart",
  "rock-large",
  "rock-wide",
  "stone_tallD",
  "stone_largeC",
]);

type InstancedPartData = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  matrices: THREE.Matrix4[];
};

function buildInstancedParts(
  scene: THREE.Group,
  items: MapObject[],
  atlasUrl: string,
): InstancedPartData[] {
  scene.updateMatrixWorld(true);
  const sourceMeshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) sourceMeshes.push(mesh);
  });

  const dummy = new THREE.Object3D();
  return sourceMeshes.map((sourceMesh) => {
    const material = Array.isArray(sourceMesh.material)
      ? sourceMesh.material.map((source) => sharedEnhancedMaterial(source, atlasUrl))
      : sharedEnhancedMaterial(sourceMesh.material, atlasUrl);
    const matrices = items.map((item) => {
      dummy.position.set(item.position.x, item.y, item.position.z);
      dummy.rotation.set(0, item.rotation, 0);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      return dummy.matrix.clone().multiply(sourceMesh.matrixWorld);
    });
    return { geometry: sourceMesh.geometry, material, matrices };
  });
}

function InstancedPropPart({ part, castShadow }: { part: InstancedPartData; castShadow: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    part.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [part]);

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, part.matrices.length]}
      castShadow={castShadow}
      receiveShadow
      dispose={null}
    />
  );
}

/** One model group shares GLTF materials and instances repeated static meshes. */
function PropGroup({ model, assetUrl }: { model: string; assetUrl: string }) {
  const { scene } = useLoader(GLTFLoader, assetUrl);
  const items = useMemo(
    () => getActiveMap().objects.filter((prop) => prop.model === model),
    [model],
  );
  const atlasUrl = useMemo(() => modelAtlasUrl(model), [model]);
  const parts = useMemo(
    () => (items.length > 1 && atlasUrl ? buildInstancedParts(scene, items, atlasUrl) : []),
    [atlasUrl, scene, items],
  );
  const single = useMemo(() => {
    if (items.length !== 1) return null;
    const clone = scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = SHADOW_CASTERS.has(model);
      mesh.receiveShadow = true;
      if (atlasUrl) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((source) => sharedEnhancedMaterial(source, atlasUrl))
          : sharedEnhancedMaterial(mesh.material, atlasUrl);
      }
    });
    return clone;
  }, [atlasUrl, items, model, scene]);

  if (single) {
    const item = items[0]!;
    return (
      <primitive
        object={single}
        position={[item.position.x, item.y, item.position.z]}
        rotation-y={item.rotation}
        scale={item.scale}
      />
    );
  }

  return (
    <group>
      {parts.map((part, index) => (
        <InstancedPropPart key={index} part={part} castShadow={SHADOW_CASTERS.has(model)} />
      ))}
    </group>
  );
}

export function Props() {
  const activeModels = new Set(getActiveMap().objects.map((object) => object.model));
  const assets = ASSET_CATALOG.filter((asset) => activeModels.has(asset.id));
  assets.forEach((asset) => useLoader.preload(GLTFLoader, asset.modelPath));
  return (
    <group>
      {assets.map((asset) => (
        <Suspense key={asset.id} fallback={null}>
          <NonCriticalAssetBoundary>
            <PropGroup model={asset.id} assetUrl={asset.modelPath} />
          </NonCriticalAssetBoundary>
        </Suspense>
      ))}
    </group>
  );
}
