import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AGENTS, PLAYER, RUNNERS } from "@/lib/catchy/agents";
import { GAME_CONFIG } from "@/lib/catchy/config";
import { useGameStore } from "@/store/gameStore";

const PARTICLE_GEOMETRY = new THREE.SphereGeometry(1, 8, 6);

/** Dust puffs kicked up behind every running character. */
export function Dust() {
  const group = useRef<THREE.Group>(null);
  const restartCount = useGameStore((s) => s.restartCount);
  const previousRestart = useRef(restartCount);
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
    if (previousRestart.current !== restartCount) {
      previousRestart.current = restartCount;
      for (let index = 0; index < data.length; index++) {
        const particle = data[index]!;
        particle.life = 0.8;
        const mesh = g.children[index] as THREE.Mesh;
        mesh.visible = false;
        mesh.scale.setScalar(0);
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!;
      const m = g.children[i] as THREE.Mesh;
      const a = AGENTS[d.ai]!;
      if (a.speed <= 2.5 || a.hidden > 0) {
        d.life = 0;
        if (m.visible) {
          m.visible = false;
          m.scale.setScalar(0);
          (m.material as THREE.MeshBasicMaterial).opacity = 0;
        }
        continue;
      }

      d.life -= dt;
      if (d.life <= 0) {
        d.life = 0.8;
        m.position.set(a.x - Math.sin(a.heading) * 0.4, 0.15, a.z - Math.cos(a.heading) * 0.4);
      }
      const t = 1 - d.life / 0.8;
      m.position.y += dt * 0.5;
      m.visible = true;
      m.scale.setScalar(0.2 + t * 0.55);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - t);
    }
  });

  return (
    <group ref={group}>
      {data.map((_, i) => (
        <mesh key={i} geometry={PARTICLE_GEOMETRY} dispose={null}>
          <meshBasicMaterial color="#f4e0bd" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A short, pooled floor streak left at the start of an accepted player dash. */
export function DashStreak() {
  const group = useRef<THREE.Group>(null);
  const restartCount = useGameStore((s) => s.restartCount);
  const previousRestart = useRef(restartCount);
  const animation = useRef({ id: PLAYER.dashActivationId, elapsed: 0, active: false });

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const game = useGameStore.getState();
    if (
      game.time <= 0 ||
      game.state === "capture" ||
      game.state === "after" ||
      game.state === "timeup"
    ) {
      animation.current.active = false;
      g.visible = false;
      return;
    }
    if (previousRestart.current !== restartCount) {
      previousRestart.current = restartCount;
      animation.current.id = PLAYER.dashActivationId;
      animation.current.active = false;
      g.visible = false;
      return;
    }

    if (PLAYER.dashActivationId !== animation.current.id) {
      animation.current.id = PLAYER.dashActivationId;
      animation.current.elapsed = 0;
      animation.current.active = true;
      g.position.set(PLAYER.dashStartX, 0, PLAYER.dashStartZ);
      g.rotation.y = Math.atan2(PLAYER.dashDirectionX, PLAYER.dashDirectionZ);
      g.visible = true;
    }
    if (!animation.current.active) return;

    animation.current.elapsed += Math.min(rawDelta, 0.05);
    const progress = Math.min(animation.current.elapsed / GAME_CONFIG.player.dash.trailSeconds, 1);
    for (let i = 0; i < g.children.length; i++) {
      const mesh = g.children[i] as THREE.Mesh;
      (mesh.material as THREE.MeshBasicMaterial).opacity = (0.42 - i * 0.09) * (1 - progress);
    }
    if (progress >= 1) {
      animation.current.active = false;
      g.visible = false;
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh position={[0, 0.14, -0.32]}>
        <boxGeometry args={[0.16, 0.06, 1.15]} />
        <meshBasicMaterial color="#8df2ff" transparent opacity={0.42} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.13, -0.88]}>
        <boxGeometry args={[0.11, 0.05, 0.82]} />
        <meshBasicMaterial color="#d3fbff" transparent opacity={0.33} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.12, -1.36]}>
        <boxGeometry args={[0.07, 0.04, 0.54]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.24} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Hearts + sparkle burst that plays on the capture moment. */
export function CaptureBurst() {
  const state = useGameStore((s) => s.state);
  const capture = useGameStore((s) => s.capture);
  const group = useRef<THREE.Group>(null);
  const animation = useRef({ runnerId: null as string | null, capturedAt: 0, elapsed: 0 });
  const active = Boolean(capture) && (state === "capture" || state === "after");

  const hearts = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2, r: 0.5 + (i % 3) * 0.3 })),
    [],
  );

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    if (!active || !capture) {
      if (g.visible || animation.current.runnerId !== null) {
        animation.current.runnerId = null;
        animation.current.elapsed = 0;
        g.visible = false;
      }
      return;
    }

    if (
      animation.current.runnerId !== capture.runnerId ||
      animation.current.capturedAt !== capture.capturedAt
    ) {
      animation.current.runnerId = capture.runnerId;
      animation.current.capturedAt = capture.capturedAt;
      animation.current.elapsed = 0;
    } else {
      animation.current.elapsed += Math.min(rawDelta, 0.05);
    }
    g.visible = true;
    g.position.set(capture.position.x, capture.position.y + 1.4, capture.position.z);
    const progress = Math.min(animation.current.elapsed / 0.75, 1);
    for (let i = 0; i < hearts.length; i++) {
      const h = hearts[i]!;
      const m = g.children[i] as THREE.Mesh;
      m.position.set(
        Math.cos(h.a) * h.r * (0.6 + progress * 2.4),
        progress * 2.2 + Math.sin(progress * 6 + i) * 0.1,
        Math.sin(h.a) * h.r * (0.6 + progress * 2.4),
      );
      m.rotation.z = Math.sin(progress * 5 + i) * 0.4;
      m.scale.setScalar(0.28 * (1 - progress * 0.4));
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
    }
  });

  return (
    <group ref={group} visible={false}>
      {hearts.map((_, i) => (
        <mesh key={i} geometry={PARTICLE_GEOMETRY} dispose={null}>
          <meshBasicMaterial color={i % 2 ? "#ff5c86" : "#ffd166"} transparent depthWrite={false} />
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
    const state = useGameStore.getState();
    const capture = state.capture;
    const isPresentation = state.state === "capture" || state.state === "after";
    let x: number;
    let z: number;
    if (isPresentation && capture) {
      x = capture.position.x;
      z = capture.position.z;
    } else {
      let target = null;
      for (const runner of RUNNERS) {
        if (runner.id === state.targetId && runner.hidden <= 0) {
          target = runner;
          break;
        }
      }
      if (!target) {
        g.visible = false;
        return;
      }
      x = target.x;
      z = target.z;
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(x, 0, z);
    const t = clock.elapsedTime;
    const pulse = (t % 1.05) / 1.05;
    const ring = g.children[0] as THREE.Mesh;
    const close = state.state === "nearby";
    const color = close ? "#83f17b" : "#ffc14d";
    ring.scale.setScalar(0.68 + pulse * 1.35);
    const ringMaterial = ring.material as THREE.MeshBasicMaterial;
    ringMaterial.color.set(color);
    ringMaterial.opacity = 0.96 * (1 - pulse);
    const beam = g.children[1] as THREE.Mesh;
    const beamMaterial = beam.material as THREE.MeshBasicMaterial;
    beamMaterial.color.set(color);
    beamMaterial.opacity = (close ? 0.48 : 0.36) + Math.sin(t * 3.5) * 0.08;
    const tip = g.children[2] as THREE.Mesh;
    tip.position.y = 4.45 + Math.sin(t * 3.2) * 0.12;
    tip.rotation.y = t * 0.8;
    (tip.material as THREE.MeshBasicMaterial).color.set(color);
  });

  return (
    <group ref={ref}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.11, 0]}>
        <ringGeometry args={[0.52, 0.76, 32]} />
        <meshBasicMaterial color="#ffc14d" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.9, 0]}>
        <cylinderGeometry args={[0.11, 0.22, 3.4, 12, 1, true]} />
        <meshBasicMaterial
          color="#ffc14d"
          transparent
          opacity={0.24}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 4.45, 0]}>
        <coneGeometry args={[0.42, 0.76, 4]} />
        <meshBasicMaterial color="#ffc14d" transparent opacity={0.92} depthWrite={false} />
      </mesh>
    </group>
  );
}
