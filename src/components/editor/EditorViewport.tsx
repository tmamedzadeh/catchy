import {
  Grid,
  OrbitControls,
  OrthographicCamera,
  TransformControls,
  useGLTF,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { MapDecoration, MapDefinition, MapObject, Point2 } from "@/lib/catchy/maps";
import { ASSET_BY_ID } from "@/lib/catchy/maps";
import { createIslandGeometry } from "@/lib/catchy/maps";
import { NonCriticalAssetBoundary } from "../game/NonCriticalAssetBoundary";
import { EDITOR_SCALE_STEP, writeUniformScale } from "@/lib/catchy/maps/editorTransforms";

export type EditorSelection = string | null;
export type EditorTransform = { x: number; y: number; z: number; rotation: number; scale: number };

type Props = {
  map: MapDefinition;
  selected: EditorSelection;
  tool: "translate" | "rotate" | "scale";
  showGrid: boolean;
  showColliders: boolean;
  readOnly: boolean;
  snap: boolean;
  snapRotation: boolean;
  snapStep: number;
  rotationSnap: number;
  onSelect: (id: string | null) => void;
  onTransform: (id: string, transform: EditorTransform, committed: boolean) => void;
  onInteractiveTransform: (id: string, transform: EditorTransform, committed: boolean) => void;
  onDecorationTransform: (id: string, transform: EditorTransform, committed: boolean) => void;
  onPlace: (point: Point2) => void;
  onViewportChange?: (position: { x: number; z: number; zoom: number }) => void;
};

type EditorPropProps = {
  object: MapObject;
  selected: boolean;
  tool: Props["tool"];
  showColliders: boolean;
  readOnly: boolean;
  snap: boolean;
  snapRotation: boolean;
  snapStep: number;
  rotationSnap: number;
  onSelect: Props["onSelect"];
  onTransform: Props["onTransform"];
};

function EditorProp({ ...props }: EditorPropProps) {
  const asset = ASSET_BY_ID.get(props.object.model);
  if (!asset) return null;
  return <LoadedEditorProp {...props} assetUrl={asset.modelPath} />;
}

function EditorDecoration({
  decoration,
  selected,
  tool,
  readOnly,
  snap,
  snapRotation,
  snapStep,
  rotationSnap,
  onSelect,
  onTransform,
}: {
  decoration: MapDecoration;
  selected: boolean;
  tool: Props["tool"];
  readOnly: boolean;
  snap: boolean;
  snapRotation: boolean;
  snapStep: number;
  rotationSnap: number;
  onSelect: Props["onSelect"];
  onTransform: Props["onDecorationTransform"];
}) {
  const root = useRef<THREE.Group>(null);
  const geometry = useMemo(() => createIslandGeometry(1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const read = (committed: boolean) => {
    const current = root.current;
    if (!current) return;
    if (tool === "scale") writeUniformScale(current.scale, current.scale.x);
    onTransform(
      decoration.id,
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
        position={[decoration.position.x, decoration.y, decoration.position.z]}
        rotation-y={decoration.rotation ?? 0}
        scale={decoration.radius}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(`decoration:${decoration.id}`);
        }}
        onPointerUp={(event) => event.stopPropagation()}
      >
        <mesh geometry={geometry} rotation-x={-Math.PI / 2} receiveShadow>
          <meshStandardMaterial color={decoration.color} roughness={0.78} />
        </mesh>
        {selected && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
            <ringGeometry args={[1.04, 1.09, 40]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        )}
      </group>
      {selected && !readOnly && root.current && (
        <TransformControls
          object={root.current}
          mode={tool}
          showX={tool !== "rotate"}
          showY={tool === "rotate"}
          showZ={tool !== "rotate" && tool !== "scale"}
          onObjectChange={() => read(false)}
          onMouseUp={() => read(true)}
          translationSnap={snap ? snapStep : null}
          rotationSnap={snapRotation ? rotationSnap : null}
          scaleSnap={snap ? EDITOR_SCALE_STEP : null}
        />
      )}
    </>
  );
}

function LoadedEditorProp({
  object,
  selected,
  tool,
  showColliders,
  readOnly,
  snap,
  snapRotation,
  snapStep,
  rotationSnap,
  onSelect,
  onTransform,
  assetUrl,
}: EditorPropProps & { assetUrl: string }) {
  const root = useRef<THREE.Group>(null);
  const { scene } = useGLTF(assetUrl);
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
    if (tool === "scale") writeUniformScale(current.scale, current.scale.x);
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
        onPointerUp={(event) => {
          event.stopPropagation();
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
      {selected && !readOnly && root.current && (
        <TransformControls
          object={root.current}
          mode={tool}
          showX={tool !== "rotate"}
          showY={tool === "rotate"}
          showZ={tool !== "rotate" && tool !== "scale"}
          onObjectChange={() => read(false)}
          onMouseDown={() => undefined}
          onMouseUp={() => read(true)}
          translationSnap={snap ? snapStep : null}
          rotationSnap={snapRotation ? rotationSnap : null}
          scaleSnap={snap ? EDITOR_SCALE_STEP : null}
        />
      )}
    </>
  );
}

function InteractiveMarkers({
  map,
  selected,
  tool,
  snap,
  snapRotation,
  snapStep,
  rotationSnap,
  onSelect,
  onTransform,
  readOnly,
}: {
  map: MapDefinition;
  selected: EditorSelection;
  tool: Props["tool"];
  snap: boolean;
  snapRotation: boolean;
  snapStep: number;
  rotationSnap: number;
  readOnly: boolean;
  onSelect: Props["onSelect"];
  onTransform: Props["onInteractiveTransform"];
}) {
  return (
    <group>
      {map.interactiveObjects.map((item) => (
        <InteractiveMarker
          key={item.id}
          item={item}
          selected={selected === `interactive:${item.id}`}
          tool={tool}
          snap={snap}
          snapRotation={snapRotation}
          snapStep={snapStep}
          rotationSnap={rotationSnap}
          readOnly={readOnly}
          onSelect={onSelect}
          onTransform={onTransform}
        />
      ))}
    </group>
  );
}

function InteractiveMarker({
  item,
  selected,
  tool,
  snap,
  snapRotation,
  snapStep,
  rotationSnap,
  onSelect,
  onTransform,
  readOnly,
}: {
  item: MapDefinition["interactiveObjects"][number];
  selected: boolean;
  tool: Props["tool"];
  snap: boolean;
  snapRotation: boolean;
  snapStep: number;
  rotationSnap: number;
  readOnly: boolean;
  onSelect: Props["onSelect"];
  onTransform: Props["onInteractiveTransform"];
}) {
  const root = useRef<THREE.Group>(null);
  const read = (committed: boolean) => {
    if (!root.current) return;
    if (tool === "scale") writeUniformScale(root.current.scale, root.current.scale.x);
    onTransform(
      item.id,
      {
        x: root.current.position.x,
        y: root.current.position.y,
        z: root.current.position.z,
        rotation: root.current.rotation.y,
        scale: root.current.scale.x,
      },
      committed,
    );
  };
  const zoneRadius =
    item.triggerRadius ??
    (item.collision.type === "circle"
      ? item.collision.radius
      : Math.hypot(item.collision.width / 2, item.collision.depth / 2));
  return (
    <>
      <group
        ref={root}
        position={[item.position.x, item.y, item.position.z]}
        rotation-y={item.rotation}
        scale={item.scale}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(`interactive:${item.id}`);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
        }}
      >
        {item.kind === "speedPad" && (
          <>
            <mesh rotation-x={-Math.PI / 2} position-y={0.025}>
              <circleGeometry args={[zoneRadius, 40]} />
              <meshBasicMaterial color="#72d96c" transparent opacity={0.42} depthWrite={false} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
              <ringGeometry args={[zoneRadius * 0.78, zoneRadius * 0.9, 40]} />
              <meshBasicMaterial color={selected ? "#ffffff" : "#f6ffb2"} />
            </mesh>
            <mesh position={[0, 0.07, 0]} rotation-x={Math.PI / 2}>
              <coneGeometry args={[zoneRadius * 0.18, zoneRadius * 0.42, 3]} />
              <meshBasicMaterial color="#eaffac" />
            </mesh>
          </>
        )}
        {item.kind === "slowZone" && (
          <>
            <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
              <circleGeometry args={[zoneRadius, 40]} />
              <meshBasicMaterial color="#d88ae8" transparent opacity={0.34} depthWrite={false} />
            </mesh>
            {[0.42, 0.72, 0.94].map((ratio) => (
              <mesh key={ratio} rotation-x={-Math.PI / 2} position-y={0.04 + ratio * 0.002}>
                <ringGeometry args={[zoneRadius * ratio, zoneRadius * ratio + 0.08, 40]} />
                <meshBasicMaterial color={selected ? "#ffffff" : "#8e55bd"} />
              </mesh>
            ))}
          </>
        )}
        {item.kind === "elasticBounce" && (
          <>
            {item.collision.type === "circle" && (
              <>
                <mesh castShadow>
                  <sphereGeometry args={[item.collision.radius, 20, 14]} />
                  <meshStandardMaterial color={selected ? "#fff4cf" : "#ffad70"} roughness={0.4} />
                </mesh>
                <mesh rotation-x={-Math.PI / 2} position-y={-item.y / item.scale + 0.03}>
                  <ringGeometry
                    args={[item.collision.radius * 0.78, item.collision.radius * 0.92, 32]}
                  />
                  <meshBasicMaterial color="#e57855" />
                </mesh>
              </>
            )}
          </>
        )}
        {item.kind === "temporaryBarrier" && item.collision.type === "box" && (
          <>
            <mesh rotation-x={-Math.PI / 2} position-y={0.06}>
              <boxGeometry args={[item.collision.width, item.collision.depth, 0.12]} />
              <meshStandardMaterial
                color={selected ? "#ffffff" : "#7894a8"}
                transparent
                opacity={0.86}
              />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position-y={0.14}>
              <boxGeometry
                args={[item.collision.width * 0.62, item.collision.depth * 0.12, 0.04]}
              />
              <meshBasicMaterial color="#efc56c" />
            </mesh>
          </>
        )}
        {selected && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.2}>
            <ringGeometry args={[zoneRadius * 1.03, zoneRadius * 1.08, 40]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        )}
      </group>
      {selected && !readOnly && root.current && (
        <TransformControls
          object={root.current}
          mode={tool}
          showX={tool !== "rotate"}
          showY={tool === "rotate"}
          showZ={tool !== "rotate" && tool !== "scale"}
          onObjectChange={() => read(false)}
          onMouseUp={() => read(true)}
          translationSnap={snap ? snapStep : null}
          rotationSnap={snapRotation ? rotationSnap : null}
          scaleSnap={snap ? EDITOR_SCALE_STEP : null}
        />
      )}
    </>
  );
}

function EditorScene(props: Props) {
  const arenaSegments = Math.ceil((64 * props.map.arena.radius) / 30);
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
          fadeDistance={props.map.arena.radius * 2.2}
          infiniteGrid
        />
      )}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={-0.03}
        onPointerUp={(event) => {
          event.stopPropagation();
          // OrbitControls uses the same empty surface for pan. Only a click places;
          // releasing after a drag must never mutate the map.
          if (event.delta <= 4 && event.point)
            props.onPlace({ x: event.point.x, z: event.point.z });
        }}
      >
        <circleGeometry args={[props.map.arena.radius, arenaSegments]} />
        <meshStandardMaterial color="#edb75f" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
        <ringGeometry
          args={[props.map.arena.radius - 0.12, props.map.arena.radius, arenaSegments * 1.5]}
        />
        <meshBasicMaterial color="#8b6b4b" />
      </mesh>
      {props.map.objects.map((object) => (
        <Suspense key={object.id} fallback={null}>
          <NonCriticalAssetBoundary>
            <EditorProp
              object={object}
              selected={props.selected === object.id}
              tool={props.tool}
              showColliders={props.showColliders}
              snap={props.snap}
              snapRotation={props.snapRotation}
              snapStep={props.snapStep}
              rotationSnap={props.rotationSnap}
              onSelect={props.onSelect}
              onTransform={props.onTransform}
              readOnly={props.readOnly}
            />
          </NonCriticalAssetBoundary>
        </Suspense>
      ))}
      <InteractiveMarkers
        map={props.map}
        selected={props.selected}
        tool={props.tool}
        snap={props.snap}
        snapRotation={props.snapRotation}
        snapStep={props.snapStep}
        rotationSnap={props.rotationSnap}
        onSelect={props.onSelect}
        onTransform={props.onInteractiveTransform}
        readOnly={props.readOnly}
      />
      {(props.map.decorations ?? []).map((decoration) => (
        <EditorDecoration
          key={decoration.id}
          decoration={decoration}
          selected={props.selected === `decoration:${decoration.id}`}
          tool={props.tool}
          readOnly={props.readOnly}
          snap={props.snap}
          snapRotation={props.snapRotation}
          snapStep={props.snapStep}
          rotationSnap={props.rotationSnap}
          onSelect={props.onSelect}
          onTransform={props.onDecorationTransform}
        />
      ))}
    </>
  );
}

export function EditorViewport(props: Props) {
  const initialZoom = 5.5 * Math.min(1, 30 / props.map.arena.radius);
  return (
    <Canvas
      orthographic
      shadows
      camera={{ position: [0, 42, 0], zoom: initialZoom, near: 0.1, far: 200 }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <OrthographicCamera
        makeDefault
        position={[0, 42, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        zoom={initialZoom}
      />
      <OrbitControls
        makeDefault
        enableRotate={false}
        enablePan
        enableZoom
        minZoom={Math.min(3, initialZoom * 0.7)}
        maxZoom={20}
        screenSpacePanning
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN }}
        onChange={(event) => {
          const camera = event?.target?.object as THREE.OrthographicCamera | undefined;
          if (camera)
            props.onViewportChange?.({
              x: camera.position.x,
              z: camera.position.z,
              zoom: camera.zoom,
            });
        }}
      />
      <EditorScene {...props} />
    </Canvas>
  );
}
