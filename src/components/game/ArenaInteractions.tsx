import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { WORLD_STATE } from "@/lib/catchy/agents";
import { GAME_CONFIG, INTERACTIVE_OBJECTS } from "@/lib/catchy/config";

const SPEED_PAD = INTERACTIVE_OBJECTS.find((item) => item.kind === "speedPad")!;
const SLOW_ZONE = INTERACTIVE_OBJECTS.find((item) => item.kind === "slowZone")!;
const ELASTIC_BOUNCE = INTERACTIVE_OBJECTS.find((item) => item.kind === "elasticBounce")!;
const TEMPORARY_BARRIER = INTERACTIVE_OBJECTS.find((item) => item.kind === "temporaryBarrier")!;

function SpeedPadVisual() {
  const pulse = useRef<THREE.Group>(null);
  const outerRing = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const pulseSeconds = GAME_CONFIG.interactiveObjects.speedPad.pulseSeconds;
    const strength = Math.max(0, Math.min(WORLD_STATE.speedPadPulseRemaining / pulseSeconds, 1));
    if (pulse.current) pulse.current.scale.setScalar(1 + strength * 0.16);
    if (outerRing.current) outerRing.current.rotation.z = clock.elapsedTime * 0.48;
  });

  return (
    <group
      position={[SPEED_PAD.position.x, SPEED_PAD.y, SPEED_PAD.position.z]}
      rotation-y={SPEED_PAD.rotation}
      scale={SPEED_PAD.scale}
    >
      <mesh position-y={0.045} receiveShadow>
        <cylinderGeometry args={[1.52, 1.52, 0.09, 32]} />
        <meshStandardMaterial color="#247f86" roughness={0.54} metalness={0.16} />
      </mesh>
      <group ref={pulse}>
        <mesh rotation-x={Math.PI / 2} position-y={0.055}>
          <torusGeometry args={[1.34, 0.075, 8, 40]} />
          <meshStandardMaterial color="#8ff3da" emissive="#2abfba" emissiveIntensity={0.45} />
        </mesh>
      </group>
      <mesh ref={outerRing} rotation-x={Math.PI / 2} position-y={0.06}>
        <torusGeometry args={[1.62, 0.035, 6, 40]} />
        <meshStandardMaterial color="#f2d57b" emissive="#c89328" emissiveIntensity={0.34} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[(i - 1) * 0.62, 0.055, 0]} rotation-y={-0.55}>
          <boxGeometry args={[0.32, 0.045, 0.84]} />
          <meshStandardMaterial color="#f6df91" emissive="#b99540" emissiveIntensity={0.14} />
        </mesh>
      ))}
    </group>
  );
}

function SlowZoneVisual() {
  const radius = (SLOW_ZONE.triggerRadius ?? 3) * SLOW_ZONE.scale;
  return (
    <group position={[SLOW_ZONE.position.x, SLOW_ZONE.y, SLOW_ZONE.position.z]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[radius, 40]} />
        <meshStandardMaterial
          color="#8c98c5"
          emissive="#555f98"
          emissiveIntensity={0.2}
          transparent
          opacity={0.28}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={0.018}>
        <torusGeometry args={[radius - 0.14, 0.075, 8, 48]} />
        <meshStandardMaterial color="#d2cff5" emissive="#6b74a9" emissiveIntensity={0.35} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={0.023}>
        <torusGeometry args={[radius * 0.62, 0.035, 6, 40]} />
        <meshStandardMaterial color="#b5bcdf" transparent opacity={0.68} />
      </mesh>
    </group>
  );
}

function ElasticBounceVisual() {
  const radius =
    GAME_CONFIG.interactiveObjects.elasticBounce.collisionRadius * ELASTIC_BOUNCE.scale;
  return (
    <group position={[ELASTIC_BOUNCE.position.x, ELASTIC_BOUNCE.y, ELASTIC_BOUNCE.position.z]}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[radius, 28, 20]} />
        <meshStandardMaterial
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

function TemporaryBarrierVisual() {
  const group = useRef<THREE.Group>(null);
  const settings = GAME_CONFIG.interactiveObjects.temporaryBarrier;

  useFrame(() => {
    if (group.current) group.current.visible = WORLD_STATE.barrierClosed;
  });

  return (
    <group
      ref={group}
      position={[TEMPORARY_BARRIER.position.x, TEMPORARY_BARRIER.y, TEMPORARY_BARRIER.position.z]}
      rotation-y={TEMPORARY_BARRIER.rotation}
      scale={TEMPORARY_BARRIER.scale}
      visible={WORLD_STATE.barrierClosed}
    >
      <mesh position-y={settings.height / 2} castShadow receiveShadow>
        <boxGeometry args={[settings.width, settings.height, settings.depth]} />
        <meshStandardMaterial color="#7894a8" roughness={0.48} metalness={0.16} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.22, side * (settings.depth / 2 - 0.08)]} castShadow>
          <boxGeometry args={[settings.width * 1.3, 0.44, 0.17]} />
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
      <TemporaryBarrierVisual />
    </group>
  );
}
