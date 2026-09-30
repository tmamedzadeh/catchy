import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ARENA } from "@/lib/sprout/config";

const SAND = "#e89a4f";
const SAND_DARK = "#d9803a";
const GRASS = "#3fbf4e";
const GRASS_DARK = "#35b04c";
const STONE = "#f4efe6";
const ROCK = "#9c8f7c";

/** Soft radial-gradient sky dome. */
export function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color("#1a7fe0") },
          mid: { value: new THREE.Color("#7fe3f0") },
          bottom: { value: new THREE.Color("#ffcf9e") },
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

function Fountain() {
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) {
      const t = clock.elapsedTime;
      water.current.position.y = 0.92 + Math.sin(t * 2) * 0.02;
      (water.current.material as THREE.MeshStandardMaterial).opacity =
        0.82 + Math.sin(t * 1.4) * 0.05;
    }
  });
  return (
    <group position={[2, 0, -1]}>
      <mesh ref={water} position={[0, 0.92, 0]} receiveShadow>
        <cylinderGeometry args={[2.55, 2.55, 0.12, 40]} />
        <meshStandardMaterial
          color="#39c6f0"
          transparent
          opacity={0.85}
          roughness={0.12}
          metalness={0.1}
          emissive="#0d7fa8"
          emissiveIntensity={0.25}
        />
      </mesh>
    </group>
  );
}

/** Ground disc, grass rim, boundary wall and the cliff the arena sits on. */
export function Arena() {
  const R = ARENA.radius;

  // Sandy running paths painted as slightly darker discs.
  const patches = useMemo(
    () =>
      [
        [-12, 9, 9],
        [-18, -8, 6.5],
        [8, 12, 7],
        [16, -6, 6],
        [0, -18, 6.5],
      ] as [number, number, number][],
    [],
  );

  return (
    <group>
      {/* cliff base */}
      <mesh position={[0, -4.6, 0]}>
        <cylinderGeometry args={[R + 0.6, R - 7, 9, 48, 1]} />
        <meshStandardMaterial color={ROCK} roughness={1} flatShading />
      </mesh>

      {/* grass ring (outer) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[R, 64]} />
        <meshStandardMaterial color={GRASS} roughness={0.95} />
      </mesh>

      {/* sand play surface */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} receiveShadow>
        <circleGeometry args={[R - ARENA.grassRing, 64]} />
        <meshStandardMaterial color={SAND} roughness={0.98} />
      </mesh>

      {/* worn path patches */}
      {patches.map(([x, z, r], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.06, z]} receiveShadow>
          <circleGeometry args={[r, 32]} />
          <meshStandardMaterial color={SAND_DARK} roughness={1} transparent opacity={0.55} />
        </mesh>
      ))}

      {/* inner grass islands for colour variation */}
      {(
        [
          [2, -1, 6.2],
          [-14, -9.5, 4.4],
          [12, -2, 3.6],
          [-6, 18, 4.2],
        ] as [number, number, number][]
      ).map(([x, z, r], i) => (
        <mesh key={`g${i}`} rotation-x={-Math.PI / 2} position={[x, 0.07, z]} receiveShadow>
          <circleGeometry args={[r, 32]} />
          <meshStandardMaterial color={GRASS_DARK} roughness={1} transparent opacity={0.85} />
        </mesh>
      ))}

      {/* thin boundary wall */}
      <mesh position={[0, ARENA.rimHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[R + 0.05, R + 0.05, ARENA.rimHeight, 72, 1, true]}
        />
        <meshStandardMaterial color={STONE} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, ARENA.rimHeight, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <ringGeometry args={[R - 0.55, R + 0.35, 72]} />
        <meshStandardMaterial color="#e6dcc6" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* neon glow strip on the rim */}
      <mesh position={[0, ARENA.rimHeight + 0.04, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[R - 0.62, R - 0.42, 96]} />
        <meshBasicMaterial color="#2ee6d6" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, ARENA.rimHeight * 0.55, 0]}>
        <cylinderGeometry args={[R - 0.5, R - 0.5, 0.14, 96, 1, true]} />
        <meshBasicMaterial color="#ff6b3d" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* centre court markings */}
      {[9, 9.25, 17, 17.2].map((r, i) => (
        <mesh key={`m${i}`} rotation-x={-Math.PI / 2} position={[2, 0.075, -1]}>
          <ringGeometry args={[r, r + 0.12, 96]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}

      <Fountain />
    </group>
  );
}
