import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AGENTS, PLAYER } from "@/lib/sprout/agents";
import { useGameStore } from "@/store/gameStore";

/** Dust puffs kicked up behind every running character. */
export function Dust() {
  const group = useRef<THREE.Group>(null);
  const COUNT = 6;
  const data = useMemo(
    () =>
      AGENTS.flatMap((a, ai) =>
        Array.from({ length: COUNT }, (_, i) => ({ ai, life: (i / COUNT) * 0.8 })),
      ),
    [],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const g = group.current;
    if (!g) return;
    data.forEach((d, i) => {
      const m = g.children[i] as THREE.Mesh;
      const a = AGENTS[d.ai]!;
      d.life -= dt;
      if (d.life <= 0) {
        d.life = 0.8;
        m.position.set(a.x - Math.sin(a.heading) * 0.4, 0.15, a.z - Math.cos(a.heading) * 0.4);
      }
      const t = 1 - d.life / 0.8;
      m.position.y += dt * 0.5;
      const visible = a.speed > 2.5 && a.hidden <= 0;
      m.visible = visible;
      m.scale.setScalar(0.2 + t * 0.55);
      (m.material as THREE.MeshBasicMaterial).opacity = visible ? 0.32 * (1 - t) : 0;
    });
  });

  return (
    <group ref={group}>
      {data.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color="#f4e0bd" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Hearts + sparkle burst that plays on the capture moment. */
export function CaptureBurst() {
  const state = useGameStore((s) => s.state);
  const group = useRef<THREE.Group>(null);
  const t = useRef(0);
  const active = state === "capture" || state === "after";

  const hearts = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2, r: 0.5 + (i % 3) * 0.3 })),
    [],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const g = group.current;
    if (!g) return;
    if (!active) {
      t.current = 0;
      g.visible = false;
      return;
    }
    g.visible = true;
    t.current += dt;
    g.position.set(PLAYER.x, 1.4, PLAYER.z);
    hearts.forEach((h, i) => {
      const m = g.children[i] as THREE.Mesh;
      const p = Math.min(t.current / 1.6, 1);
      m.position.set(
        Math.cos(h.a) * h.r * (0.6 + p * 2.4),
        p * 2.2 + Math.sin(p * 6 + i) * 0.1,
        Math.sin(h.a) * h.r * (0.6 + p * 2.4),
      );
      m.rotation.z = Math.sin(p * 5 + i) * 0.4;
      m.scale.setScalar(0.28 * (1 - p * 0.4));
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - p;
    });
  });

  return (
    <group ref={group} visible={false}>
      {hearts.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial
            color={i % 2 ? "#ff5c86" : "#ffd166"}
            transparent
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Ground beacon showing where the tracked runner is. */
export function TargetBeacon() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const runners = AGENTS.slice(1).filter((r) => r.hidden <= 0);
    let best = runners[0];
    let bd = Infinity;
    for (const r of runners) {
      const d = Math.hypot(r.x - PLAYER.x, r.z - PLAYER.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (!best) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(best.x, 0, best.z);
    const t = clock.elapsedTime;
    const pulse = (t % 1.4) / 1.4;
    const ring = g.children[0] as THREE.Mesh;
    ring.scale.setScalar(0.6 + pulse * 2.2);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - pulse);
    const beam = g.children[1] as THREE.Mesh;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 3) * 0.07;
  });

  return (
    <group ref={ref}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.11, 0]}>
        <ringGeometry args={[0.85, 1.15, 28]} />
        <meshBasicMaterial color="#ff9a3d" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[0.7, 1.15, 7, 18, 1, true]} />
        <meshBasicMaterial
          color="#ffb347"
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
