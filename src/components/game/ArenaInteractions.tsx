import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { WORLD_STATE } from "@/lib/catchy/agents";
import { GAME_CONFIG } from "@/lib/catchy/config";
import { getActiveMap } from "@/lib/catchy/maps";
import { useGameStore } from "@/store/gameStore";
import { useCanvasTextTexture } from "./canvasTextTexture";

function getInteractive(kind: "speedPad" | "slowZone" | "elasticBounce" | "temporaryBarrier") {
  return getActiveMap().interactiveObjects.find((item) => item.kind === kind)!;
}
const SPEED_PAD_SEGMENTS = 24;
const CHARGE_READY = new THREE.Color("#caff8b");

function SpeedPadVisual() {
  const speedPad = getInteractive("speedPad");
  const radius =
    speedPad.triggerRadius ??
    (speedPad.collision.type === "circle" ? speedPad.collision.radius : 1);
  const pulse = useRef<THREE.Group>(null);
  const baseMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const innerRingMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const outerRingMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const chargeSegments = useRef<THREE.InstancedMesh>(null);
  const streaks = useRef<THREE.Group>(null);

  useEffect(() => {
    const mesh = chargeSegments.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < SPEED_PAD_SEGMENTS; i++) {
      const angle = (i / SPEED_PAD_SEGMENTS) * Math.PI * 2;
      dummy.position.set(Math.cos(angle) * radius * 0.8093, 0.1, Math.sin(angle) * radius * 0.8093);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, CHARGE_READY);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [radius]);

  useFrame(({ clock }) => {
    const pulseSeconds = GAME_CONFIG.interactiveObjects.speedPad.pulseSeconds;
    const strength = Math.max(0, Math.min(WORLD_STATE.speedPadPulseRemaining / pulseSeconds, 1));
    const idlePulse = (Math.sin(clock.elapsedTime * 2.7) + 1) * 0.025;
    if (pulse.current) pulse.current.scale.setScalar(1 + idlePulse + strength * 0.12);
    if (baseMaterial.current) baseMaterial.current.emissiveIntensity = 0.5 + strength * 0.68;
    if (streaks.current) {
      const children = streaks.current.children;
      for (let i = 0; i < children.length; i++) {
        const streak = children[i] as THREE.Mesh;
        const phase = (clock.elapsedTime * 0.72 + i / children.length) % 1;
        streak.position.z = -radius * 0.484 + phase * radius * 0.968;
        (streak.material as THREE.MeshStandardMaterial).opacity =
          0.12 + 0.3 * (1 - Math.abs(phase - 0.5) * 2);
      }
    }
  });

  return (
    <group
      position={[speedPad.position.x, speedPad.y, speedPad.position.z]}
      rotation-y={speedPad.rotation}
      scale={speedPad.scale}
    >
      <mesh position-y={0.045} receiveShadow>
        <cylinderGeometry args={[radius * 0.707, radius * 0.707, 0.09, 32]} />
        <meshStandardMaterial
          ref={baseMaterial}
          color="#69dc72"
          roughness={0.48}
          metalness={0.1}
          emissive="#329647"
          emissiveIntensity={0.18}
        />
      </mesh>
      <group ref={pulse}>
        <mesh rotation-x={Math.PI / 2} position-y={0.055}>
          <torusGeometry args={[radius * 0.623, radius * 0.035, 8, 40]} />
          <meshStandardMaterial
            ref={innerRingMaterial}
            color="#d9ffe0"
            emissive="#71ed81"
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>
      <mesh rotation-x={Math.PI / 2} position-y={0.06}>
        <torusGeometry args={[radius * 0.753, radius * 0.0163, 6, 40]} />
        <meshStandardMaterial
          ref={outerRingMaterial}
          color="#efffbd"
          emissive="#a3df54"
          emissiveIntensity={0.42}
        />
      </mesh>
      <instancedMesh ref={chargeSegments} args={[undefined, undefined, SPEED_PAD_SEGMENTS]}>
        <sphereGeometry args={[radius * 0.0349, 8, 6]} />
        <meshStandardMaterial color="white" emissive="#5eaa64" emissiveIntensity={0.2} />
      </instancedMesh>
      {[-0.5, 0, 0.5].map((z) => (
        <group key={z} position={[0, 0.12, z * radius * 0.465]}>
          <mesh position={[-0.056 * radius, 0, 0]} rotation-y={Math.PI / 4}>
            <boxGeometry args={[0.051 * radius, 0.055, 0.209 * radius]} />
            <meshStandardMaterial color="#f7ffe9" emissive="#b6ff9d" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0.056 * radius, 0, 0]} rotation-y={-Math.PI / 4}>
            <boxGeometry args={[0.051 * radius, 0.055, 0.209 * radius]} />
            <meshStandardMaterial color="#f7ffe9" emissive="#b6ff9d" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
      <group ref={streaks}>
        {[-0.335, 0, 0.335].map((x) => (
          <mesh key={x} position={[x * radius, 0.095, -radius * 0.465]}>
            <boxGeometry args={[radius * 0.0256, 0.025, radius * 0.14]} />
            <meshStandardMaterial
              color="#efffbd"
              emissive="#a3df54"
              emissiveIntensity={0.38}
              transparent
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SlowZoneVisual() {
  const edge = useRef<THREE.Mesh>(null);
  const ripples = useRef<THREE.Group>(null);
  const rippleMaterials = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const slowZone = getInteractive("slowZone");
  const radius = slowZone.triggerRadius ?? 3;
  const labelTexture = useCanvasTextTexture("SLOW", "#7b431d", "#ffe5ae");

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (edge.current) edge.current.scale.setScalar(1 + Math.sin(t * 2.2) * 0.025);
    if (ripples.current) {
      const children = ripples.current.children;
      for (let i = 0; i < children.length; i++) {
        const phase = (t * 0.55 + i * 0.5) % 1;
        children[i]!.scale.setScalar(1.16 - phase * 0.52);
        const material = rippleMaterials.current[i];
        if (material) material.opacity = 0.44 * (1 - phase);
      }
    }
  });

  return (
    <group
      position={[slowZone.position.x, slowZone.y, slowZone.position.z]}
      rotation-y={slowZone.rotation}
      scale={slowZone.scale}
    >
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[radius, 40]} />
        <meshStandardMaterial
          color="#f2bc5e"
          emissive="#d98729"
          emissiveIntensity={0.12}
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={edge} rotation-x={Math.PI / 2} position-y={0.018}>
        <torusGeometry args={[radius - 0.14, 0.075, 8, 48]} />
        <meshStandardMaterial color="#ffc857" emissive="#e8872d" emissiveIntensity={0.42} />
      </mesh>
      <group ref={ripples} position-y={0.026}>
        {[0, 1].map((i) => (
          <mesh
            key={i}
            ref={(mesh) =>
              (rippleMaterials.current[i] = mesh?.material as THREE.MeshStandardMaterial | null)
            }
            rotation-x={Math.PI / 2}
          >
            <torusGeometry args={[radius * 0.7, 0.035, 6, 40]} />
            <meshStandardMaterial
              color="#ffda8d"
              emissive="#d98729"
              emissiveIntensity={0.3}
              transparent
              opacity={0.4}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      {labelTexture && (
        <mesh position={[0, 0.09, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2.1, 0.525]} />
          <meshBasicMaterial map={labelTexture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh position={[0, 0.12, -1.65]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.15, 0.28, 3]} />
        <meshStandardMaterial color="#d87c2c" emissive="#a34f21" emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[0, 0.12, 1.65]} rotation-x={-Math.PI / 2}>
        <coneGeometry args={[0.15, 0.28, 3]} />
        <meshStandardMaterial color="#d87c2c" emissive="#a34f21" emissiveIntensity={0.22} />
      </mesh>
    </group>
  );
}

function ElasticBounceVisual() {
  const sphere = useRef<THREE.Mesh>(null);
  const sphereMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const restartCount = useGameStore((state) => state.restartCount);
  const previousRestart = useRef(restartCount);
  const animation = useRef({
    id: WORLD_STATE.bounceImpactId,
    startedAt: -1,
    normalX: 0,
    normalZ: 1,
  });
  const elastic = getInteractive("elasticBounce");
  const radius = elastic.collision.type === "circle" ? elastic.collision.radius : 1;

  useFrame(({ clock }) => {
    const mesh = sphere.current;
    if (!mesh) return;
    if (previousRestart.current !== restartCount) {
      previousRestart.current = restartCount;
      animation.current.id = WORLD_STATE.bounceImpactId;
      animation.current.startedAt = -1;
      mesh.scale.setScalar(1);
      if (sphereMaterial.current) sphereMaterial.current.emissiveIntensity = 0.13;
      return;
    }
    if (animation.current.id !== WORLD_STATE.bounceImpactId) {
      animation.current.id = WORLD_STATE.bounceImpactId;
      animation.current.startedAt = clock.elapsedTime;
      animation.current.normalX = WORLD_STATE.bounceNormalX;
      animation.current.normalZ = WORLD_STATE.bounceNormalZ;
      mesh.rotation.y = Math.atan2(-animation.current.normalZ, animation.current.normalX);
    }
    const progress = Math.max(
      0,
      Math.min((clock.elapsedTime - animation.current.startedAt) / 0.24, 1),
    );
    const squash = Math.sin(progress * Math.PI);
    const pulse = 1 + squash * 0.08;
    mesh.scale.set(
      pulse * (1 - squash * 0.2),
      pulse * (1 + squash * 0.13),
      pulse * (1 + squash * 0.06),
    );
    if (sphereMaterial.current) sphereMaterial.current.emissiveIntensity = 0.13 + squash * 0.5;
  });

  return (
    <group
      position={[elastic.position.x, elastic.y, elastic.position.z]}
      rotation-y={elastic.rotation}
      scale={elastic.scale}
    >
      <mesh ref={sphere} castShadow receiveShadow>
        <sphereGeometry args={[radius, 28, 20]} />
        <meshStandardMaterial
          ref={sphereMaterial}
          color="#ffad70"
          roughness={0.32}
          metalness={0.04}
          emissive="#9c3f27"
          emissiveIntensity={0.13}
        />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={0.12} scale={[1, 1, 0.78]}>
        <torusGeometry args={[radius * 0.72, 0.11, 8, 32]} />
        <meshStandardMaterial color="#ffe3a0" roughness={0.4} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={-0.22} scale={[1, 1, 0.78]}>
        <torusGeometry args={[radius * 0.74, 0.075, 8, 32]} />
        <meshStandardMaterial color="#e57855" roughness={0.48} />
      </mesh>
    </group>
  );
}

const INTERACTION_MESSAGES = {
  speedPad: { text: "SPEED UP!", color: "#d8ffb9" },
  slowZone: { text: "SLOWED!", color: "#ffe0a0" },
  elasticBounce: { text: "BOUNCE!", color: "#ffe0c3" },
  dash: { text: "ACCELERATE!", color: "#c8f4ff" },
} as const;

function InteractionMessage() {
  const cueId = useGameStore((state) => state.interactionCueId);
  const cueKind = useGameStore((state) => state.interactionCueKind);
  const billboard = useRef<THREE.Group>(null);
  const text = useRef<THREE.Mesh>(null);
  const animation = useRef({ id: cueId, startedAt: -1 });

  useFrame(({ clock }) => {
    const group = billboard.current;
    const mesh = text.current;
    if (!group || !mesh) return;
    if (animation.current.id !== cueId) {
      animation.current.id = cueId;
      animation.current.startedAt = clock.elapsedTime;
      group.position.set(WORLD_STATE.interactionCueX, 0, WORLD_STATE.interactionCueZ);
    }

    const elapsed = clock.elapsedTime - animation.current.startedAt;
    const progress = elapsed / 0.9;
    group.visible = cueKind !== null && progress >= 0 && progress < 1;
    if (!group.visible) return;

    const entrance = Math.min(elapsed / 0.16, 1);
    const scale = 0.58 + (1 - Math.pow(1 - entrance, 3)) * 0.42;
    group.scale.setScalar(scale);
    group.position.y = Math.min(elapsed, 0.8) * 0.64;
    const opacity = progress < 0.65 ? 1 : Math.max(0, (1 - progress) / 0.35);
    const material = mesh.material as THREE.Material & {
      opacity: number;
      transparent: boolean;
      depthWrite: boolean;
    };
    material.transparent = true;
    material.depthWrite = false;
    material.opacity = opacity;
  });

  const message = cueKind ? INTERACTION_MESSAGES[cueKind] : null;
  const labelTexture = useCanvasTextTexture(
    message?.text ?? "",
    message?.color ?? "#ffffff",
    "#254353",
  );
  return (
    <Billboard ref={billboard} visible={false} follow>
      {labelTexture && (
        <mesh ref={text} position={[0, 2.05, 0]}>
          <planeGeometry args={[3.9, 0.975]} />
          <meshBasicMaterial map={labelTexture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </Billboard>
  );
}

function TemporaryBarrierVisual() {
  const group = useRef<THREE.Group>(null);
  const barrier = getInteractive("temporaryBarrier");
  const settings = GAME_CONFIG.interactiveObjects.temporaryBarrier;

  useFrame(() => {
    if (group.current) group.current.visible = WORLD_STATE.barrierClosed;
  });

  if (barrier.collision.type !== "box") return null;
  const { width, depth } = barrier.collision;

  return (
    <group
      ref={group}
      position={[barrier.position.x, barrier.y, barrier.position.z]}
      rotation-y={barrier.rotation}
      scale={barrier.scale}
      visible={WORLD_STATE.barrierClosed}
    >
      <mesh position-y={settings.height / 2} castShadow receiveShadow>
        <boxGeometry args={[width, settings.height, depth]} />
        <meshStandardMaterial color="#7894a8" roughness={0.48} metalness={0.16} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.22, side * (depth / 2 - 0.08)]} castShadow>
          <boxGeometry args={[width * 1.3, 0.44, 0.17]} />
          <meshStandardMaterial color="#efc56c" roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

/** Visuals are driven by the same descriptors used by triggers, collision and navigation. */
export function ArenaInteractions() {
  return (
    <group>
      <SpeedPadVisual />
      <SlowZoneVisual />
      <ElasticBounceVisual />
      <InteractionMessage />
      <TemporaryBarrierVisual />
    </group>
  );
}
