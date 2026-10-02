import {
  Grid,
  OrbitControls,
  OrthographicCamera,
  TransformControls,
  useGLTF,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { MapDefinition, MapObject, Point2 } from "@/lib/catchy/maps";
import { ASSET_BY_ID } from "@/lib/catchy/maps";

export type EditorSelection = string | null;
export type EditorTransform = { x: number; y: number; z: number; rotation: number; scale: number };

type Props = {
  map: MapDefinition;
  selected: EditorSelection;
  tool: "translate" | "rotate" | "scale";
  showGrid: boolean;
  showColliders: boolean;
  snap: boolean;
  snapStep: number;
  rotationSnap: number;
  onSelect: (id: string | null) => void;
  onTransform: (id: string, transform: EditorTransform, committed: boolean) => void;
  onSpawnTransform: (id: string, point: Point2, committed: boolean) => void;
  onPlace: (point: Point2) => void;
};

function modelUrl(model: string) {
  const asset = ASSET_BY_ID.get(model);
  return asset?.modelPath ?? `/models/town/${model}.glb`;
}

function propTransform(object: MapObject): EditorTransform {
  return {
    x: object.position.x,
    y: object.y,
    z: object.position.z,
    rotation: object.rotation,
    scale: object.scale,
  };
}

function EditorProp({
  object,
  selected,
  tool,
  showColliders,
  snap,
  snapStep,
  rotationSnap,
  onSelect,
  onTransform,
}: {
  object: MapObject;
  selected: boolean;
  tool: Props["tool"];
  showColliders: boolean;
  snap: boolean;
  snapStep: number;
  rotationSnap: number;
  onSelect: Props["onSelect"];
  onTransform: Props["onTransform"];
}) {
  const root = useRef<THREE.Group>(null);
  const { scene } = useGLTF(modelUrl(object.model));
  const clone = useMemo(() => scene.clone(true), [scene]);
  const collider =
    object.collision.type === "circle" ? (
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry
          args={[
            object.collision.radius * object.scale - 0.05,
            object.collision.radius * object.scale,
            32,
          ]}
        />
        <meshBasicMaterial color="#e85b67" transparent opacity={0.85} />
      </mesh>
    ) : (
      <mesh rotation-x={-Math.PI / 2}>
        <boxGeometry
          args={[
            object.collision.width * object.scale,
            object.collision.depth * object.scale,
            0.04,
          ]}
        />
        <meshBasicMaterial color="#e85b67" wireframe transparent opacity={0.75} />
      </mesh>
    );
  const read = (committed: boolean) => {
    const current = root.current;
    if (!current) return;
    onTransform(
      object.id,
      {
        x: current.position.x,
        y: current.position.y,
        z: current.position.z,
        rotation: current.rotation.y,
        scale: current.scale.x,
      },
      committed,
    );
  };
  return (
    <>
      <group
        ref={root}
        position={[object.position.x, object.y, object.position.z]}
        rotation-y={object.rotation}
        scale={object.scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(object.id);
        }}
      >
        <primitive object={clone} />
        {showColliders && <group userData={{ editorCollider: true }}>{collider}</group>}
        {selected && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <ringGeometry args={[0.55, 0.64, 32]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        )}
      </group>
      {selected && root.current && (
        <TransformControls
          object={root.current}
          mode={tool}
          showX
          showY={tool === "translate"}
          showZ
          onObjectChange={() => read(false)}
          onMouseDown={() => undefined}
          onMouseUp={() => read(true)}
          translationSnap={snap ? snapStep : null}
          rotationSnap={snap ? rotationSnap : null}
          scaleSnap={snap ? snapStep : null}
        />
      )}
    </>
  );
}

function SpawnMarker({
  id,
  point,
  color,
  selected,
  tool,
  snap,
  snapStep,
  rotationSnap,
  onSelect,
  onTransform,
}: {
  id: string;
  point: Point2;
  color: string;
  selected: boolean;
  tool: Props["tool"];
  snap: boolean;
  snapStep: number;
  rotationSnap: number;
  onSelect: Props["onSelect"];
  onTransform: Props["onSpawnTransform"];
}) {
  const root = useRef<THREE.Group>(null);
  const read = (committed: boolean) => {
    if (root.current)
      onTransform(id, { x: root.current.position.x, z: root.current.position.z }, committed);
  };
  return (
    <>
      <group
        ref={root}
        position={[point.x, 0.28, point.z]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(id);
        }}
      >
        <mesh>
          <sphereGeometry args={[0.5, 16, 10]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={-0.25}>
          <ringGeometry args={[0.65, 0.76, 24]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      {selected && root.current && (
        <TransformControls
          object={root.current}
          mode="translate"
          showY={false}
          onObjectChange={() => read(false)}
          onMouseDown={() => undefined}
          onMouseUp={() => read(true)}
          translationSnap={snap ? snapStep : null}
          rotationSnap={rotationSnap}
        />
      )}
    </>
  );
}

function InteractiveMarkers({
  map,
  onSelect,
}: {
  map: MapDefinition;
  onSelect: Props["onSelect"];
}) {
  return (
    <group>
      {map.interactiveObjects.map((item) => (
        <mesh
          key={item.id}
          position={[item.position.x, item.y + 0.04, item.position.z]}
          rotation-x={-Math.PI / 2}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect(`interactive:${item.id}`);
          }}
        >
          <circleGeometry
            args={[
              (item.triggerRadius ??
                (item.collision.type === "circle" ? item.collision.radius : 1)) * item.scale,
              32,
            ]}
          />
          <meshBasicMaterial color="#67c98b" transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function EditorScene(props: Props) {
  return (
    <>
      <color attach="background" args={["#bfe3ff"]} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[10, 20, 8]} intensity={2.4} castShadow />
      {props.showGrid && (
        <Grid
          args={[props.map.arena.radius * 2, props.map.arena.radius * 2]}
          cellSize={props.snapStep}
          sectionSize={props.snapStep * 4}
          fadeDistance={100}
          infiniteGrid
        />
      )}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={-0.03}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (event.point) props.onPlace({ x: event.point.x, z: event.point.z });
        }}
      >
        <circleGeometry args={[props.map.arena.radius, 64]} />
        <meshStandardMaterial color="#edb75f" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
        <ringGeometry args={[props.map.arena.radius - 0.12, props.map.arena.radius, 96]} />
        <meshBasicMaterial color="#8b6b4b" />
      </mesh>
      {props.map.objects.map((object) => (
        <EditorProp
          key={object.id}
          object={object}
          selected={props.selected === object.id}
          tool={props.tool}
          showColliders={props.showColliders}
          snap={props.snap}
          snapStep={props.snapStep}
          rotationSnap={props.rotationSnap}
          onSelect={props.onSelect}
          onTransform={props.onTransform}
        />
      ))}
      <InteractiveMarkers map={props.map} onSelect={props.onSelect} />
      <SpawnMarker
        id="spawn:player"
        point={props.map.playerSpawn}
        color="#3a8dff"
        selected={props.selected === "spawn:player"}
        tool={props.tool}
        snap={props.snap}
        snapStep={props.snapStep}
        rotationSnap={props.rotationSnap}
        onSelect={props.onSelect}
        onTransform={props.onSpawnTransform}
      />
      {props.map.runnerSpawns.map((spawn) => (
        <SpawnMarker
          key={spawn.id}
          id={`spawn:${spawn.id}`}
          point={spawn}
          color="#e85b67"
          selected={props.selected === `spawn:${spawn.id}`}
          tool={props.tool}
          snap={props.snap}
          snapStep={props.snapStep}
          rotationSnap={props.rotationSnap}
          onSelect={props.onSelect}
          onTransform={props.onSpawnTransform}
        />
      ))}
    </>
  );
}

export function EditorViewport(props: Props) {
  return (
    <Canvas
      orthographic
      shadows
      camera={{ position: [0, 42, 0], zoom: 16, near: 0.1, far: 200 }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <OrthographicCamera
        makeDefault
        position={[0, 42, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        zoom={16}
      />
      <OrbitControls
        makeDefault
        enableRotate={false}
        enablePan
        enableZoom
        minZoom={5}
        maxZoom={45}
        screenSpacePanning
      />
      <EditorScene {...props} />
    </Canvas>
  );
}
