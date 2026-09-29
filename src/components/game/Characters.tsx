import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AGENTS } from "@/lib/sprout/agents";
import { useGameStore } from "@/store/gameStore";

type Palette = {
  shirt: string;
  pants: string;
  shoes: string;
  skin: string;
  hair: string;
  accent: string;
  hairStyle: "cap" | "ponytail" | "bun" | "spiky";
  build: number;
};

export const PALETTES: Palette[] = [
  {
    shirt: "#2ea8ff",
    pants: "#1b4f9c",
    shoes: "#123a72",
    skin: "#f4caa4",
    hair: "#38281f",
    accent: "#8df2ff",
    hairStyle: "cap",
    build: 1.05,
  },
  {
    shirt: "#ff5c86",
    pants: "#c22a56",
    shoes: "#8d1c3c",
    skin: "#f7d7b8",
    hair: "#7a1f3d",
    accent: "#ffd0dd",
    hairStyle: "ponytail",
    build: 0.93,
  },
  {
    shirt: "#a06bff",
    pants: "#6739c4",
    shoes: "#3f1f7d",
    skin: "#d9a074",
    hair: "#2a1a44",
    accent: "#e2caff",
    hairStyle: "bun",
    build: 0.98,
  },
  {
    shirt: "#ffb020",
    pants: "#e07310",
    shoes: "#9c4a06",
    skin: "#c98a5e",
    hair: "#ff7a1a",
    accent: "#ffe58f",
    hairStyle: "spiky",
    build: 1.1,
  },
];

function Hair({ p }: { p: Palette }) {
  const mat = <meshStandardMaterial color={p.hair} roughness={0.7} />;
  switch (p.hairStyle) {
    case "cap":
      return (
        <group position={[0, 0.16, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.285, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={p.accent} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.01, 0.24]} rotation-x={-0.12} castShadow>
            <boxGeometry args={[0.36, 0.05, 0.24]} />
            <meshStandardMaterial color={p.shirt} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.12, -0.16]} castShadow>
            <sphereGeometry args={[0.2, 16, 12]} />
            {mat}
          </mesh>
        </group>
      );
    case "ponytail":
      return (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.295, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            {mat}
          </mesh>
          <mesh position={[0, -0.05, -0.28]} rotation-x={0.5} castShadow>
            <capsuleGeometry args={[0.11, 0.42, 6, 12]} />
            {mat}
          </mesh>
        </group>
      );
    case "bun":
      return (
        <group position={[0, 0.11, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.3, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.68]} />
            {mat}
          </mesh>
          <mesh position={[0, 0.2, -0.16]} castShadow>
            <sphereGeometry args={[0.17, 16, 12]} />
            {mat}
          </mesh>
        </group>
      );
    default:
      return (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.29, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            {mat}
          </mesh>
          {[-0.14, 0, 0.14].map((x, i) => (
            <mesh key={i} position={[x, 0.16, -0.02]} rotation-z={x * 1.6} castShadow>
              <coneGeometry args={[0.09, 0.26, 8]} />
              {mat}
            </mesh>
          ))}
        </group>
      );
  }
}

/** Stylised cartoon humanoid, ~1.75 units tall, fully procedural. */
export function Character({ index }: { index: number }) {
  const p = PALETTES[index]!;
  const agent = AGENTS[index]!;
  const isPlayer = agent.role === "player";

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  const skinMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.75 }),
    [p.skin],
  );
  const shirtMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: p.shirt, roughness: 0.6 }),
    [p.shirt],
  );
  const pantsMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: p.pants, roughness: 0.7 }),
    [p.pants],
  );
  const shoeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: p.shoes, roughness: 0.55 }),
    [p.shoes],
  );
  const eyeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#241c1a", roughness: 0.3 }),
    [],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const g = root.current;
    if (!g) return;
    g.position.set(agent.x, 0, agent.z);
    g.rotation.y = agent.heading;
    g.visible = agent.hidden <= 0.35;

    const run = Math.min(agent.speed / 8, 1.2);
    const ph = agent.phase * 6;
    const swing = Math.sin(ph) * 0.95 * run;
    const swing2 = Math.cos(ph) * 0.95 * run;

    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) {
      armL.current.rotation.x = -swing * 0.9;
      armL.current.rotation.z = 0.24;
    }
    if (armR.current) {
      armR.current.rotation.x = swing * 0.9;
      armR.current.rotation.z = -0.24;
    }
    if (body.current) {
      body.current.position.y = Math.abs(Math.sin(ph)) * 0.09 * run;
      body.current.rotation.x = 0.06 + run * 0.22;
      body.current.rotation.z = swing2 * 0.05;
    }
    if (head.current) {
      head.current.rotation.z = -swing2 * 0.08;
      head.current.rotation.x = -run * 0.16;
    }
    if (ring.current) {
      const t = performance.now() * 0.002;
      ring.current.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
    }
    void dt;
  });

  const state = useGameStore((s) => s.state);
  const highlight = isPlayer || state === "nearby" || state === "capture";

  return (
    <group ref={root}>
      {/* selection / contact ring */}
      {highlight && (
        <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.09, 0]}>
          <ringGeometry args={[0.58, 0.74, 28]} />
          <meshBasicMaterial
            color={isPlayer ? "#38e6ff" : p.accent}
            transparent
            opacity={isPlayer ? 0.9 : 0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* soft contact shadow */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, 0]}>
        <circleGeometry args={[0.55, 20]} />
        <meshBasicMaterial color="#5b4326" transparent opacity={0.28} />
      </mesh>

      <group ref={body} position={[0, 0, 0]} scale={p.build * 1.5}>
        {/* legs */}
        <group ref={legL} position={[0.13, 0.62, 0]}>
          <mesh position={[0, -0.24, 0]} material={pantsMat} castShadow>
            <capsuleGeometry args={[0.105, 0.34, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.5, 0.06]} material={shoeMat} castShadow>
            <boxGeometry args={[0.2, 0.14, 0.3]} />
          </mesh>
        </group>
        <group ref={legR} position={[-0.13, 0.62, 0]}>
          <mesh position={[0, -0.24, 0]} material={pantsMat} castShadow>
            <capsuleGeometry args={[0.105, 0.34, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.5, 0.06]} material={shoeMat} castShadow>
            <boxGeometry args={[0.2, 0.14, 0.3]} />
          </mesh>
        </group>

        {/* torso */}
        <mesh position={[0, 0.95, 0]} material={shirtMat} castShadow>
          <capsuleGeometry args={[0.245, 0.3, 8, 16]} />
        </mesh>
        <mesh position={[0, 0.74, 0]} material={pantsMat} castShadow>
          <capsuleGeometry args={[0.235, 0.08, 6, 14]} />
        </mesh>
        {/* accent stripe */}
        <mesh position={[0, 0.96, 0.2]} rotation-x={0.1}>
          <boxGeometry args={[0.16, 0.34, 0.1]} />
          <meshStandardMaterial color={p.accent} roughness={0.5} />
        </mesh>

        {/* arms */}
        <group ref={armL} position={[0.3, 1.16, 0]}>
          <mesh position={[0, -0.22, 0]} material={shirtMat} castShadow>
            <capsuleGeometry args={[0.078, 0.2, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.4, 0]} material={skinMat} castShadow>
            <capsuleGeometry args={[0.072, 0.14, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.54, 0]} material={skinMat} castShadow>
            <sphereGeometry args={[0.095, 12, 10]} />
          </mesh>
        </group>
        <group ref={armR} position={[-0.3, 1.16, 0]}>
          <mesh position={[0, -0.22, 0]} material={shirtMat} castShadow>
            <capsuleGeometry args={[0.078, 0.2, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.4, 0]} material={skinMat} castShadow>
            <capsuleGeometry args={[0.072, 0.14, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.54, 0]} material={skinMat} castShadow>
            <sphereGeometry args={[0.095, 12, 10]} />
          </mesh>
        </group>

        {/* head */}
        <group ref={head} position={[0, 1.44, 0]}>
          <mesh material={skinMat} castShadow scale={[1, 1.04, 0.96]}>
            <sphereGeometry args={[0.275, 24, 18]} />
          </mesh>
          {/* eyes */}
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, 0.03, 0.245]} material={eyeMat} scale={[1, 1.3, 0.6]}>
              <sphereGeometry args={[0.042, 12, 10]} />
            </mesh>
          ))}
          {/* brows */}
          {[-0.1, 0.1].map((x) => (
            <mesh key={`b${x}`} position={[x, 0.12, 0.24]} rotation-z={x > 0 ? -0.18 : 0.18}>
              <boxGeometry args={[0.08, 0.018, 0.02]} />
              <meshStandardMaterial color={p.hair} roughness={0.6} />
            </mesh>
          ))}
          {/* smile */}
          <mesh position={[0, -0.09, 0.245]} rotation-x={0.1}>
            <torusGeometry args={[0.055, 0.016, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#8d3a3a" roughness={0.5} />
          </mesh>
          {/* blush */}
          {[-0.18, 0.18].map((x) => (
            <mesh key={`c${x}`} position={[x, -0.04, 0.19]}>
              <sphereGeometry args={[0.055, 10, 8]} />
              <meshStandardMaterial color="#ff8f9c" transparent opacity={0.5} roughness={1} />
            </mesh>
          ))}
          <Hair p={p} />
        </group>
      </group>
    </group>
  );
}

export function Characters() {
  return (
    <group>
      {AGENTS.map((_, i) => (
        <Character key={i} index={i} />
      ))}
    </group>
  );
}
