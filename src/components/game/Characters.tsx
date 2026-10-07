import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { AGENTS, WORLD_STATE } from "@/lib/catchy/agents";
import { GAME_CONFIG } from "@/lib/catchy/config";
import { useGameStore } from "@/store/gameStore";
import { createCharacterRig } from "./characterModel";
import { getCharacterVariant } from "./characterVariants";

const CONTACT_SHADOW = new THREE.MeshBasicMaterial({
  color: "#58422f",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

const ringMaterials = new Map<string, THREE.MeshBasicMaterial>();

function getRingMaterial(color: string, opacity: number) {
  const key = `${color}:${opacity}`;
  let material = ringMaterials.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
    });
    ringMaterials.set(key, material);
  }
  return material;
}

/** Shared chibi rig. Its rendered geometry follows the existing agent and jump state. */
export function Character({ index }: { index: number }) {
  const variant = getCharacterVariant(index);
  const agent = AGENTS[index]!;
  const isPlayer = agent.role === "player";

  const root = useRef<THREE.Group>(null);
  const runSmooth = useRef(0);
  const rig = useMemo(() => createCharacterRig(variant), [variant]);
  const ringGeometry = useMemo(
    () => new THREE.RingGeometry(agent.radius * 1.3, agent.radius * 1.65, 28),
    [agent.radius],
  );
  const ringMaterial = getRingMaterial(
    isPlayer ? "#44e1ee" : variant.colors.accent,
    isPlayer ? 0.9 : 0.64,
  );

  useEffect(() => () => rig.dispose(), [rig]);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const group = root.current;
    if (!group) return;
    const alpha = WORLD_STATE.renderAlpha;
    const x = agent.previousX + (agent.x - agent.previousX) * alpha;
    const z = agent.previousZ + (agent.z - agent.previousZ) * alpha;
    const angleDelta = Math.atan2(
      Math.sin(agent.heading - agent.previousHeading),
      Math.cos(agent.heading - agent.previousHeading),
    );
    const heading = agent.previousHeading + angleDelta * alpha;
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    group.visible = agent.hidden <= 0;

    const runTarget = Math.min(agent.speed / 8, 1.15);
    runSmooth.current += (runTarget - runSmooth.current) * (1 - Math.exp(-8 * dt));
    const run = runSmooth.current;
    const phase = agent.phase * 3.1;
    const swing = Math.sin(phase);
    const step = Math.cos(phase);
    const jumpHeight =
      agent.previousJumpHeight + (agent.jumpHeight - agent.previousJumpHeight) * alpha;
    const jump = THREE.MathUtils.clamp(jumpHeight / GAME_CONFIG.player.jump.height, 0, 1);

    // A soft breathing idle blends into the same alternating stride used by the old rig.
    const idle = Math.sin(clock.elapsedTime * 2.2 + agent.phase) * 0.012 * (1 - run);
    rig.body.position.y = jumpHeight + idle + Math.abs(step) * 0.025 * run;
    rig.body.rotation.x = run * 0.12 + jump * 0.1;
    rig.body.rotation.z = swing * 0.018 * run;

    rig.leftLeg.rotation.x = swing * 0.56 * run - jump * 0.56;
    rig.rightLeg.rotation.x = -swing * 0.56 * run - jump * 0.56;
    rig.leftLeg.position.y = 0.59 + Math.max(0, -step) * 0.035 * run;
    rig.rightLeg.position.y = 0.59 + Math.max(0, step) * 0.035 * run;

    rig.leftArm.rotation.x = -swing * 0.44 * run - run * 0.22 - jump * 0.62;
    rig.rightArm.rotation.x = swing * 0.44 * run - run * 0.22 - jump * 0.62;
    rig.leftArm.rotation.z = 0.16 + run * 0.08 + jump * 0.12;
    rig.rightArm.rotation.z = -0.16 - run * 0.08 - jump * 0.12;

    rig.head.position.y = 1.79 - Math.abs(step) * 0.008 * run + idle * 0.45;
    rig.head.rotation.z = -swing * 0.025 * run;
    rig.head.rotation.x = -run * 0.065 + jump * 0.06;
  });

  const state = useGameStore((store) => store.state);
  const targetId = useGameStore((store) => store.targetId);
  const highlight = isPlayer || state === "capture" || targetId === agent.id;

  return (
    <group ref={root}>
      <primitive object={rig.model} dispose={null} />
      {highlight && (
        <mesh
          geometry={ringGeometry}
          material={ringMaterial}
          rotation-x={-Math.PI / 2}
          position={[0, 0.035, 0]}
        />
      )}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.022, 0]} material={CONTACT_SHADOW}>
        <circleGeometry args={[agent.radius * 1.28, 20]} />
      </mesh>
    </group>
  );
}

export function Characters() {
  return (
    <group>
      {AGENTS.map((agent, index) => (
        <Character key={agent.id} index={index} />
      ))}
    </group>
  );
}
