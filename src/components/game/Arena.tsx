import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ARENA, GAME_CONFIG } from "@/lib/catchy/config";
import { createTerrainTexture } from "@/lib/catchy/textures";

const SAND = "#edb75f";
const SAND_DARK = "#d88f43";
const STONE = "#d3c4aa";
const ROCK = "#93735c";

/** Soft radial-gradient sky dome. */
export function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color("#3ea8f5") },
          mid: { value: new THREE.Color("#a8e2ff") },
          bottom: { value: new THREE.Color("#d8f0c2") },
        },
        vertexShader: /* glsl */ `
          varying float vH;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vH = normalize(world.xyz).y;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vH;
          uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
          void main() {
            float h = clamp(vH, -1.0, 1.0);
            vec3 c = h > 0.08
              ? mix(mid, top, smoothstep(0.08, 0.85, h))
              : mix(bottom, mid, smoothstep(-0.35, 0.08, h));
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    [],
  );

  return (
    <mesh scale={260} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 20]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function IrregularIsland({
  position,
  radius,
  color,
  y = 0.09,
}: {
  position: [number, number];
  radius: number;
  color: string;
  y?: number;
}) {
  const geometry = useMemo(() => {
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
  }, [radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      geometry={geometry}
      rotation-x={-Math.PI / 2}
      position={[position[0], y, position[1]]}
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.78} />
    </mesh>
  );
}

function StoneRim() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 46;
  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = GAME_CONFIG.arenaRadius + 0.08;
      dummy.position.set(
        Math.cos(angle) * radius,
        0.72 + (i % 3) * 0.035,
        Math.sin(angle) * radius,
      );
      dummy.rotation.set(0, -angle, (i % 2 ? 1 : -1) * 0.025);
      dummy.scale.set(1.95, 0.82 + (i % 4) * 0.035, 1.16);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={STONE} roughness={0.72} metalness={0.02} />
    </instancedMesh>
  );
}

/** Sand ground disc, boundary wall and the cliff the arena sits on. */
export function Arena() {
  const R = GAME_CONFIG.arenaRadius;
  const textures = useMemo(
    () => ({
      sand: createTerrainTexture("sand", 12),
      rock: createTerrainTexture("rock", 8),
      stone: createTerrainTexture("stone", 18),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(textures).forEach((texture) => texture.dispose()),
    [textures],
  );

  return (
    <group>
      {/* cliff base */}
      <mesh position={[0, -4.6, 0]}>
        <cylinderGeometry args={[R + 0.6, R - 7, 9, 48, 1]} />
        <meshStandardMaterial map={textures.rock} color={ROCK} roughness={0.88} flatShading />
      </mesh>

      {/* darker soil band makes the island edge read as a raised land mass */}
      <mesh position={[0, -0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R - 0.45, 0.65, 64]} />
        <meshStandardMaterial color="#6f5b43" roughness={0.95} />
      </mesh>

      {/* sand play surface */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} receiveShadow>
        <circleGeometry args={[R, 64]} />
        <meshStandardMaterial map={textures.sand} color={SAND} roughness={0.8} />
      </mesh>

      {/* smaller irregular wear marks replace the old flat circular stains */}
      <IrregularIsland position={[-12, 9]} radius={5.4} color={SAND_DARK} y={0.062} />
      <IrregularIsland position={[10, 11]} radius={4.8} color="#f1c875" y={0.063} />
      <IrregularIsland position={[-2, -15]} radius={4.2} color="#e4a552" y={0.064} />

      {/* thin boundary wall */}
      <mesh position={[0, ARENA.rimHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R + 0.05, R + 0.05, ARENA.rimHeight, 72, 1, true]} />
        <meshStandardMaterial
          map={textures.stone}
          color={STONE}
          roughness={0.72}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, ARENA.rimHeight, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <ringGeometry args={[R - 0.55, R + 0.35, 72]} />
        <meshStandardMaterial
          map={textures.stone}
          color="#eadfc9"
          roughness={0.68}
          side={THREE.DoubleSide}
        />
      </mesh>
      <StoneRim />
    </group>
  );
}
