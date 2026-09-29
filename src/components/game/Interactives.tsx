import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { POWERUPS, TRAPS, type PowerUp, type Trap } from "@/lib/sprout/config";

function Pad({
  color,
  radius = 1.5,
  opacity = 0.55,
  y = 0.09,
}: {
  color: string;
  radius?: number;
  opacity?: number;
  y?: number;
}) {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]}>
        <circleGeometry args={[radius, 32]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, y + 0.01, 0]}>
        <ringGeometry args={[radius * 0.86, radius, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
      </mesh>
    </>
  );
}

function TrapObject({ t }: { t: Trap }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (!g.current) return;
    if (t.kind === "spike") {
      g.current.position.y = 0.05 + Math.max(0, Math.sin(time * 1.6 + t.x)) * 0.42;
    } else if (t.kind === "portal") {
      g.current.rotation.y = time * 1.5;
      g.current.position.y = 1.1 + Math.sin(time * 1.8) * 0.12;
    } else if (t.kind === "mystery") {
      g.current.position.y = 0.55 + Math.sin(time * 2) * 0.1;
      g.current.rotation.y = Math.sin(time * 0.8) * 0.5;
    }
  });

  return (
    <group position={[t.x, 0, t.z]} rotation-y={t.rot ?? 0}>
      {t.kind === "spike" && (
        <>
          <Pad color="#ff4d4d" radius={1.55} opacity={0.32} />
          <mesh position={[0, 0.14, 0]} receiveShadow>
            <cylinderGeometry args={[1.35, 1.45, 0.22, 24]} />
            <meshStandardMaterial color="#7b4a3c" roughness={0.9} />
          </mesh>
          <group ref={g}>
            {(
              [
                [0, 0],
                [0.55, 0.3],
                [-0.5, 0.45],
                [0.25, -0.6],
                [-0.6, -0.3],
              ] as [number, number][]
            ).map(([x, z], i) => (
              <mesh key={i} position={[x, 0.45, z]} castShadow>
                <coneGeometry args={[0.16, 0.8, 8]} />
                <meshStandardMaterial color="#e6e9ef" metalness={0.5} roughness={0.25} />
              </mesh>
            ))}
          </group>
        </>
      )}

      {t.kind === "slow" && (
        <>
          <Pad color="#8b5cf6" radius={2.9} opacity={0.35} />
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[2.85, 2.85, 0.6, 32, 1, true]} />
            <meshStandardMaterial
              color="#a78bfa"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
              emissive="#7c3aed"
              emissiveIntensity={0.4}
            />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              position={[Math.cos(i * 1.6) * 1.6, 0.4, Math.sin(i * 1.6) * 1.6]}
            >
              <sphereGeometry args={[0.16, 10, 8]} />
              <meshStandardMaterial color="#c4b5fd" emissive="#8b5cf6" emissiveIntensity={0.8} />
            </mesh>
          ))}
        </>
      )}

      {t.kind === "speed" && (
        <>
          <Pad color="#22d3ee" radius={1.9} opacity={0.4} />
          {[-0.7, 0, 0.7].map((z, i) => (
            <mesh key={i} position={[0, 0.12, z]} rotation-x={-Math.PI / 2} rotation-z={Math.PI}>
              <coneGeometry args={[0.55, 0.7, 3]} />
              <meshStandardMaterial
                color="#67e8f9"
                emissive="#06b6d4"
                emissiveIntensity={0.9}
                roughness={0.3}
              />
            </mesh>
          ))}
        </>
      )}

      {t.kind === "portal" && (
        <>
          <Pad color="#f472b6" radius={1.7} opacity={0.4} />
          <group ref={g} position={[0, 1.1, 0]}>
            <mesh castShadow>
              <torusGeometry args={[1.0, 0.16, 12, 28]} />
              <meshStandardMaterial
                color="#f472b6"
                emissive="#db2777"
                emissiveIntensity={0.7}
                metalness={0.3}
                roughness={0.3}
              />
            </mesh>
            <mesh>
              <circleGeometry args={[0.95, 28]} />
              <meshBasicMaterial color="#fbcfe8" transparent opacity={0.55} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </>
      )}

      {t.kind === "mystery" && (
        <>
          <Pad color="#fbbf24" radius={1.3} opacity={0.3} />
          <group ref={g} position={[0, 0.55, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.95, 0.95, 0.95]} />
              <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.15} />
            </mesh>
            <mesh position={[0, 0, 0.49]}>
              <torusGeometry args={[0.18, 0.06, 8, 16, Math.PI * 1.4]} />
              <meshStandardMaterial color="#7c2d12" roughness={0.5} />
            </mesh>
            <mesh position={[0.02, -0.28, 0.49]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshStandardMaterial color="#7c2d12" />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}

const PU_COLOR: Record<PowerUp["kind"], string> = {
  boost: "#22d3ee",
  key: "#fbbf24",
  energy: "#4ade80",
  warp: "#f472b6",
};

function PowerUpObject({ p }: { p: PowerUp }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.elapsedTime;
    g.current.rotation.y = t * 1.4;
    g.current.position.y = 1.15 + Math.sin(t * 2 + p.x) * 0.18;
  });
  const color = PU_COLOR[p.kind];
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.09, 0]}>
        <circleGeometry args={[0.85, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} />
      </mesh>
      <group ref={g}>
        {p.kind === "boost" && (
          <mesh castShadow rotation-z={0.2}>
            <octahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.6}
              metalness={0.4}
              roughness={0.2}
            />
          </mesh>
        )}
        {p.kind === "key" && (
          <group rotation-z={0.4}>
            <mesh castShadow>
              <torusGeometry args={[0.24, 0.08, 10, 20]} />
              <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} emissive="#b45309" emissiveIntensity={0.3} />
            </mesh>
            <mesh position={[0, -0.45, 0]} castShadow>
              <boxGeometry args={[0.1, 0.55, 0.1]} />
              <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0.12, -0.62, 0]} castShadow>
              <boxGeometry args={[0.22, 0.1, 0.1]} />
              <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        )}
        {p.kind === "energy" && (
          <mesh castShadow>
            <icosahedronGeometry args={[0.4, 0]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.7}
              roughness={0.15}
              flatShading
            />
          </mesh>
        )}
        {p.kind === "warp" && (
          <group>
            <mesh castShadow rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.34, 0.1, 10, 20]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
            </mesh>
            <mesh castShadow>
              <sphereGeometry args={[0.2, 14, 12]} />
              <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.9} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

export function Interactives() {
  return (
    <group>
      {TRAPS.map((t, i) => (
        <TrapObject key={i} t={t} />
      ))}
      {POWERUPS.map((p, i) => (
        <PowerUpObject key={i} p={p} />
      ))}
    </group>
  );
}
