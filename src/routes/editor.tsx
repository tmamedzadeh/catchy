import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  PanelLeftOpen,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  EditorViewport,
  type EditorSelection,
  type EditorTransform,
} from "@/components/editor/EditorViewport";
import {
  ASSET_CATALOG,
  DEFAULT_MAP,
  MAP_LIMITS,
  mapRepository,
  validateMap,
  fitColliderToAsset,
  type CollisionShape,
  type InteractiveKind,
  type MapDefinition,
  type Point2,
  interactiveYForScale,
} from "@/lib/catchy/maps";
import {
  EDITOR_FREE_MOVE_STEP,
  EDITOR_SCALE_STEP,
  nudgeEditorPoint,
  nudgeEditorRadius,
  nudgeEditorRotation,
  nudgeEditorScale,
  snapEditorScale,
  snapEditorRadius,
} from "@/lib/catchy/maps/editorTransforms";

export const Route = createFileRoute("/editor")({ ssr: false, component: Editor });

const ASSET_GROUPS = [
  { label: "Nature", categories: ["rocks", "trees"] },
  { label: "Town", categories: ["town", "walls"] },
  { label: "Pirate", categories: ["crates", "barrels"] },
] as const;

const INTERACTIVE_LABELS: Record<InteractiveKind, string> = {
  speedPad: "Speed Up",
  slowZone: "Slow Down",
  elasticBounce: "Bounce Ball",
  temporaryBarrier: "Temporary Barrier",
};

const INTERACTIVE_KINDS: InteractiveKind[] = [
  "speedPad",
  "slowZone",
  "elasticBounce",
  "temporaryBarrier",
];

type ToolbarIconButtonProps = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  prominent?: boolean;
  destructive?: boolean;
};

function ToolbarIconButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  prominent = false,
  destructive = false,
}: ToolbarIconButtonProps) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catchy-ink disabled:cursor-not-allowed disabled:opacity-40 ${prominent ? "bg-catchy-accent" : destructive ? "bg-red-100 text-red-700" : "bg-white/80"}`}
      >
        <Icon aria-hidden="true" size={18} strokeWidth={2.4} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-catchy-ink px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

function formatColliderDimension(value: number) {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function Editor() {
  const [maps, setMaps] = useState(() => mapRepository.listMaps());
  const [map, setMap] = useState<MapDefinition | null>(() => {
    const maps = mapRepository.listMaps();
    const lastId = mapRepository.getLastSelectedId();
    return structuredClone(maps.find((item) => item.id === lastId) ?? maps[0] ?? null);
  });
  const [dirty, setDirty] = useState(false);
  const [showColliders, setShowColliders] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [snapRotation, setSnapRotation] = useState(true);
  const [snapStep, setSnapStep] = useState(0.5);
  const [rotationSnapDegrees, setRotationSnapDegrees] = useState(15);
  const [tool, setTool] = useState<"translate" | "rotate" | "scale">("translate");
  const [history, setHistory] = useState<MapDefinition[]>([]);
  const [future, setFuture] = useState<MapDefinition[]>([]);
  const [placement, setPlacement] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<EditorSelection>(null);
  const [viewport, setViewport] = useState({ x: 0, z: 0, zoom: 5.5 });
  const dragStartMap = useRef<MapDefinition | null>(null);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  const [drawerPinned, setDrawerPinned] = useState(false);
  const [drawerHovered, setDrawerHovered] = useState(false);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);
  const validation = useMemo(() => (map ? validateMap(map) : null), [map]);
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      dirty &&
      current.pathname !== next.pathname &&
      !window.confirm("Discard unsaved map changes?"),
    enableBeforeUnload: dirty,
  });
  const update = (next: MapDefinition, historyEntry = true) => {
    if (map?.id === "default") {
      setMessage("Default is protected. Duplicate it before editing.");
      return;
    }
    if (historyEntry && map) setHistory((items) => [...items.slice(-49), structuredClone(map)]);
    setFuture(historyEntry ? [] : future);
    setMap(structuredClone(next));
    setDirty(true);
  };
  const rotationSnap = (rotationSnapDegrees * Math.PI) / 180;
  const snapValue = (value: number, step = snapStep, enabled = snap) =>
    enabled ? Math.round(value / step) * step : value;
  const open = (next: MapDefinition, nextDirty = false, keepCurrentEdits = false) => {
    if (dirty && map && !keepCurrentEdits && !window.confirm("Discard unsaved map changes?")) {
      return;
    }
    dragStartMap.current = null;
    setMap(structuredClone(next));
    if (mapRepository.hasMap(next.id)) mapRepository.setLastSelectedId(next.id);
    setDirty(nextDirty);
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setPlacement(null);
  };
  const save = () => {
    if (!map || !validation?.valid) {
      setMessage("Fix validation errors before saving.");
      return;
    }
    try {
      mapRepository.saveMap(map);
      setMaps(mapRepository.listMaps());
      mapRepository.setLastSelectedId(map.id);
      setDirty(false);
      setMessage("Saved on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save map.");
    }
  };
  const add = (model: string, point: Point2 = { x: 0, z: 0 }) => {
    if (!map || map.id === "default") return;
    const asset = ASSET_CATALOG.find((item) => item.id === model);
    if (!asset) return;
    const ids = new Set([
      ...map.objects.map((object) => object.id),
      ...map.interactiveObjects.map((object) => object.id),
    ]);
    const unique = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let id = `${model}-${unique}`;
    let suffix = 1;
    while (ids.has(id)) id = `${model}-${Date.now()}-${++suffix}`;
    update({
      ...map,
      objects: [
        ...map.objects,
        {
          id,
          model,
          position: { x: snapValue(point.x), z: snapValue(point.z) },
          rotation: 0,
          scale: asset.defaultScale,
          y: 0,
          collision: structuredClone(asset.collision),
        },
      ],
    });
    setSelected(id);
  };
  const placeInteractive = (kind: InteractiveKind, point: Point2) => {
    if (!map || map.id === "default") return;
    if (map.interactiveObjects.some((item) => item.kind === kind)) {
      const existing = map.interactiveObjects.find((item) => item.kind === kind)!;
      setSelected(`interactive:${existing.id}`);
      setPlacement(null);
      return;
    }
    const canonical = DEFAULT_MAP.interactiveObjects.find((item) => item.kind === kind);
    if (!canonical) return;
    const usedIds = new Set([
      ...map.objects.map((object) => object.id),
      ...map.interactiveObjects.map((object) => object.id),
    ]);
    let id = canonical.id;
    let suffix = 1;
    while (usedIds.has(id)) id = `${canonical.id}-${++suffix}`;
    const object = {
      ...structuredClone(canonical),
      id,
      position: { x: snapValue(point.x), z: snapValue(point.z) },
    };
    update({ ...map, interactiveObjects: [...map.interactiveObjects, object] });
    setSelected(`interactive:${id}`);
    setPlacement(null);
  };
  const selectOrPlaceInteractive = (kind: InteractiveKind) => {
    if (!map) return;
    const existing = map.interactiveObjects.find((item) => item.kind === kind);
    if (existing) {
      setSelected(`interactive:${existing.id}`);
      setPlacement(null);
      return;
    }
    if (map.id === "default") {
      setMessage("Default is protected. Duplicate it before adding interactive objects.");
      return;
    }
    setSelected(null);
    setPlacement(`interactive:${kind}`);
    setMessage(`Click inside the arena to place ${INTERACTIVE_LABELS[kind]}.`);
  };
  const moveSelected = (axis: "x" | "z", value: number) => {
    if (!map || map.id === "default" || !selected || !Number.isFinite(value)) return;
    update({
      ...map,
      objects: map.objects.map((object) =>
        object.id === selected
          ? {
              ...object,
              position: { ...object.position, [axis]: snapValue(value) },
            }
          : object,
      ),
    });
  };
  const setObjectCollider = (id: string, collision: CollisionShape) => {
    if (!map || map.id === "default") return;
    update({
      ...map,
      objects: map.objects.map((object) =>
        object.id === id ? { ...object, collision: structuredClone(collision) } : object,
      ),
    });
  };
  const fitSelectedCollider = (object: MapDefinition["objects"][number]) => {
    const fitted = fitColliderToAsset(object.model, object.collision);
    if (!fitted) {
      setMessage("This asset has no canonical bounds to fit.");
      return;
    }
    setObjectCollider(object.id, fitted);
    setMessage("Collider fitted to the asset footprint. The current object scale is preserved.");
  };
  const duplicateSelected = () => {
    if (!map || map.id === "default" || !selected || selected.startsWith("interactive:")) return;
    const source = map.objects.find((object) => object.id === selected);
    if (!source) return;
    let index = 1;
    let id = `${source.id}-copy`;
    const ids = new Set(map.objects.map((object) => object.id));
    while (ids.has(id)) id = `${source.id}-copy-${++index}`;
    update({
      ...map,
      objects: [
        ...map.objects,
        {
          ...structuredClone(source),
          id,
          position: { x: source.position.x + 1, z: source.position.z + 1 },
        },
      ],
    });
    setSelected(id);
  };
  const removeSelected = () => {
    if (!map || map.id === "default" || !selected) return;
    if (selected.startsWith("decoration:")) {
      const id = selected.slice("decoration:".length);
      update({
        ...map,
        decorations: (map.decorations ?? []).filter((item) => item.id !== id),
      });
      setSelected(null);
      return;
    }
    if (selected.startsWith("interactive:")) {
      setMessage("Required interactive objects are preserved in V1; move them instead.");
      return;
    }
    update({ ...map, objects: map.objects.filter((object) => object.id !== selected) });
    setSelected(null);
  };
  const create = () => open(mapRepository.newMap("Untitled Map"), true);
  const deleteMap = () => {
    if (!map || map.id === "default") return;
    const prompt = dirty
      ? `Delete ${map.name} and discard its unsaved changes?`
      : `Delete ${map.name}?`;
    if (!window.confirm(prompt)) return;
    try {
      const deleted = mapRepository.deleteMap(map.id);
      setMaps(mapRepository.listMaps());
      setMap(structuredClone(mapRepository.getMap("default")!));
      setDirty(false);
      setSelected(null);
      setHistory([]);
      setFuture([]);
      setPlacement(null);
      setMessage(deleted ? "Map deleted." : "Unsaved draft discarded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete map.");
    }
  };
  const undo = () => {
    if (!map || history.length === 0) return;
    const previous = history[history.length - 1]!;
    setFuture((items) => [...items, structuredClone(map)]);
    setHistory((items) => items.slice(0, -1));
    setMap(structuredClone(previous));
    setDirty(true);
  };
  const redo = () => {
    if (!map || future.length === 0) return;
    const next = future[future.length - 1]!;
    setHistory((items) => [...items, structuredClone(map)]);
    setFuture((items) => items.slice(0, -1));
    setMap(structuredClone(next));
    setDirty(true);
  };
  const duplicate = () => {
    if (!map) return;
    const draft = mapRepository.duplicateDraft(map);
    open(draft, true, true);
    setMessage("Duplicated into an unsaved custom map. Save when it is ready.");
  };
  const importInput = useRef<HTMLInputElement>(null);
  const importMap = async (file: File) => {
    try {
      const raw = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Import is not valid JSON.");
      }
      const result = validateMap(parsed);
      if (!result.valid) throw new Error(result.errors.map((error) => error.message).join(" "));
      if (dirty && !window.confirm("Import this map and discard your unsaved changes?")) return;
      const imported = await mapRepository.importMap(raw);
      setMaps(mapRepository.listMaps());
      open(imported, false, true);
      setMessage("Imported as a new custom map.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    }
  };
  const commitDrag = (next: MapDefinition) => {
    const previous = dragStartMap.current ?? map;
    dragStartMap.current = null;
    if (!previous || JSON.stringify(previous) === JSON.stringify(next)) return;
    setHistory((items) => [...items.slice(-49), structuredClone(previous)]);
    setFuture([]);
    setMap(structuredClone(next));
    setDirty(true);
  };
  const transformObject = (id: string, transform: EditorTransform, committed: boolean) => {
    if (
      !map ||
      map.id === "default" ||
      !Number.isFinite(transform.x) ||
      !Number.isFinite(transform.z) ||
      !Number.isFinite(transform.rotation) ||
      !Number.isFinite(transform.scale)
    )
      return;
    if (!committed) {
      if (!dragStartMap.current) dragStartMap.current = structuredClone(map);
      return;
    }
    const next = {
      ...map,
      objects: map.objects.map((object) =>
        object.id === id
          ? {
              ...object,
              position: { x: snapValue(transform.x), z: snapValue(transform.z) },
              rotation: snapValue(transform.rotation, rotationSnap, snapRotation),
              scale: snapEditorScale(transform.scale, snap),
              y: transform.y,
            }
          : object,
      ),
    };
    commitDrag(next);
  };
  const transformInteractive = (id: string, transform: EditorTransform, committed: boolean) => {
    if (
      !map ||
      map.id === "default" ||
      !Number.isFinite(transform.x) ||
      !Number.isFinite(transform.z) ||
      !Number.isFinite(transform.rotation) ||
      !Number.isFinite(transform.scale)
    )
      return;
    if (!committed) {
      if (!dragStartMap.current) dragStartMap.current = structuredClone(map);
      return;
    }
    const next = {
      ...map,
      interactiveObjects: map.interactiveObjects.map((object) => {
        if (object.id !== id) return object;
        const scale = snapEditorScale(transform.scale, snap);
        return {
          ...object,
          position: { x: snapValue(transform.x), z: snapValue(transform.z) },
          rotation: snapValue(transform.rotation, rotationSnap, snapRotation),
          scale,
          y: interactiveYForScale(object, scale),
        };
      }),
    };
    commitDrag(next);
  };
  const transformDecoration = (id: string, transform: EditorTransform, committed: boolean) => {
    if (
      !map ||
      map.id === "default" ||
      !Number.isFinite(transform.x) ||
      !Number.isFinite(transform.z) ||
      !Number.isFinite(transform.rotation) ||
      !Number.isFinite(transform.scale)
    )
      return;
    if (!committed) {
      if (!dragStartMap.current) dragStartMap.current = structuredClone(map);
      return;
    }
    const next = {
      ...map,
      decorations: (map.decorations ?? []).map((decoration) =>
        decoration.id === id
          ? {
              ...decoration,
              position: { x: snapValue(transform.x), z: snapValue(transform.z) },
              rotation: snapValue(transform.rotation, rotationSnap, snapRotation),
              radius: snapEditorRadius(transform.scale, EDITOR_SCALE_STEP, snap, map.arena.radius),
            }
          : decoration,
      ),
    };
    commitDrag(next);
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "Escape") {
      setPlacement(null);
      setSelected(null);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || !map || map.id === "default") return;
    if ((event.key === "Delete" || event.key === "Backspace") && selected) {
      event.preventDefault();
      removeSelected();
    }

    const key = event.code.startsWith("Key")
      ? event.code.slice(3).toLowerCase()
      : event.key.toLowerCase();
    if (selected && (key === "w" || key === "a" || key === "s" || key === "d")) {
      event.preventDefault();
      const step = snap ? snapStep : EDITOR_FREE_MOVE_STEP;
      if (selected.startsWith("interactive:")) {
        const id = selected.slice("interactive:".length);
        const object = map.interactiveObjects.find((item) => item.id === id);
        if (!object) return;
        const position = nudgeEditorPoint(object.position, key, step);
        update({
          ...map,
          interactiveObjects: map.interactiveObjects.map((item) =>
            item.id === id ? { ...item, position } : item,
          ),
        });
        return;
      }
      if (selected.startsWith("decoration:")) {
        const id = selected.slice("decoration:".length);
        const decoration = map.decorations?.find((item) => item.id === id);
        if (!decoration) return;
        const position = nudgeEditorPoint(decoration.position, key, step);
        update({
          ...map,
          decorations: (map.decorations ?? []).map((item) =>
            item.id === id ? { ...item, position } : item,
          ),
        });
        return;
      }
      const object = map.objects.find((item) => item.id === selected);
      if (!object) return;
      const position = nudgeEditorPoint(object.position, key, step);
      update({
        ...map,
        objects: map.objects.map((item) => (item.id === selected ? { ...item, position } : item)),
      });
      return;
    }

    if (selected && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      if (selected.startsWith("decoration:")) {
        const id = selected.slice("decoration:".length);
        const decoration = map.decorations?.find((item) => item.id === id);
        if (!decoration) return;
        const decorations = (map.decorations ?? []).map((item) => {
          if (item.id !== id) return item;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            return {
              ...item,
              rotation: nudgeEditorRotation(
                item.rotation ?? 0,
                event.key === "ArrowLeft" ? -1 : 1,
                snapRotation,
                rotationSnap,
              ),
            };
          }
          return {
            ...item,
            radius: nudgeEditorRadius(
              item.radius,
              event.key === "ArrowUp" ? 1 : -1,
              snap ? snapStep : EDITOR_FREE_MOVE_STEP,
              snap,
              map.arena.radius,
            ),
          };
        });
        update({ ...map, decorations });
        return;
      }
      const interactive = selected.startsWith("interactive:");
      const id = interactive ? selected.slice("interactive:".length) : selected;
      const object = interactive
        ? map.interactiveObjects.find((item) => item.id === id)
        : map.objects.find((item) => item.id === id);
      if (!object) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const rotation = nudgeEditorRotation(
          object.rotation,
          event.key === "ArrowLeft" ? -1 : 1,
          snapRotation,
          rotationSnap,
        );
        update(
          interactive
            ? {
                ...map,
                interactiveObjects: map.interactiveObjects.map((item) =>
                  item.id === id ? { ...item, rotation } : item,
                ),
              }
            : {
                ...map,
                objects: map.objects.map((item) => (item.id === id ? { ...item, rotation } : item)),
              },
        );
      } else {
        const scale = nudgeEditorScale(object.scale, event.key === "ArrowUp" ? 1 : -1);
        update(
          interactive
            ? {
                ...map,
                interactiveObjects: map.interactiveObjects.map((item) =>
                  item.id === id ? { ...item, scale, y: interactiveYForScale(item, scale) } : item,
                ),
              }
            : {
                ...map,
                objects: map.objects.map((item) => (item.id === id ? { ...item, scale } : item)),
              },
        );
      }
    }
  };
  keyHandler.current = handleKeyDown;
  const exportMap = () => {
    if (!map) return;
    try {
      const blob = new Blob([mapRepository.exportMap(map)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${map.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage("Map exported as JSON.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export map.");
    }
  };
  const drawerOpen = drawerPinned || drawerHovered;
  const libraryMaps = map && !maps.some((saved) => saved.id === map.id) ? [...maps, map] : maps;
  return (
    <main className="min-h-screen overflow-auto bg-[#bfe3ff] p-3 text-catchy-ink md:p-4">
      <header className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 rounded-2xl bg-white/75 p-3 shadow-lg">
        <Link
          to="/"
          aria-label="Back to Maps"
          title="Back to Maps"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white/80 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catchy-ink"
        >
          <ArrowLeft aria-hidden="true" size={19} strokeWidth={2.4} />
        </Link>
        <input
          aria-label="Map name"
          className="min-w-40 flex-1 rounded-xl border-black/10 bg-white px-3 py-2 text-xl font-bold"
          value={map?.name ?? "Map editor"}
          disabled={!map || map.id === "default"}
          onChange={(event) => map && update({ ...map, name: event.target.value })}
        />
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${validation?.valid ? "bg-lime-200" : "bg-amber-200"}`}
          role="status"
          aria-label={
            map
              ? validation?.valid
                ? "Map valid"
                : `Map invalid: ${validation?.errors.length} errors`
              : "No map selected"
          }
          title={validation?.errors.map((error) => error.message).join("\n") || "Map is valid"}
        >
          {map ? (validation?.valid ? "Valid" : `! ${validation?.errors.length}`) : "Choose a map"}
        </span>
        <span
          className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold"
          role="status"
          data-testid="dirty-status"
        >
          {dirty ? "Unsaved changes" : "Saved"}
        </span>
        <div role="toolbar" aria-label="Map actions" className="ml-auto flex items-center gap-2">
          <div className="flex gap-1">
            <ToolbarIconButton label="New map" icon={Plus} onClick={create} />
            <ToolbarIconButton
              label="Duplicate map"
              icon={Copy}
              onClick={duplicate}
              disabled={!map || !validation?.valid}
            />
          </div>
          <span aria-hidden="true" className="h-8 border-l border-black/15" />
          <div className="flex gap-1">
            <ToolbarIconButton
              label="Undo"
              icon={Undo2}
              onClick={undo}
              disabled={history.length === 0}
            />
            <ToolbarIconButton
              label="Redo"
              icon={Redo2}
              onClick={redo}
              disabled={future.length === 0}
            />
          </div>
          <span aria-hidden="true" className="h-8 border-l border-black/15" />
          <div className="flex gap-1">
            <ToolbarIconButton
              label="Import JSON"
              icon={Upload}
              onClick={() => importInput.current?.click()}
            />
            <ToolbarIconButton
              label="Export JSON"
              icon={Download}
              onClick={exportMap}
              disabled={!map || map.id === "default" || !validation?.valid}
            />
          </div>
          <span aria-hidden="true" className="h-8 border-l border-black/15" />
          <div className="flex gap-1">
            <ToolbarIconButton
              label="Save map"
              icon={Save}
              onClick={save}
              disabled={!map || !validation?.valid || !dirty}
              prominent
            />
            <ToolbarIconButton
              label="Delete map"
              icon={Trash2}
              onClick={deleteMap}
              disabled={!map || map.id === "default"}
              destructive
            />
          </div>
        </div>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importMap(file);
            event.target.value = "";
          }}
        />
        {message && (
          <span role="status" className="text-sm font-bold">
            {message}
          </span>
        )}
      </header>
      <div className="mx-auto mt-3 grid max-w-[1700px] gap-3 lg:h-[calc(100vh-125px)]">
        <div className="grid min-h-[620px] gap-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section
            className="relative min-h-[420px] overflow-hidden rounded-2xl bg-[#e9b766] shadow-lg lg:min-h-0"
            data-testid="editor-viewport"
            data-viewport-x={viewport.x}
            data-viewport-z={viewport.z}
            data-viewport-zoom={viewport.zoom}
          >
            {map ? (
              <EditorViewport
                map={map}
                selected={selected}
                tool={tool}
                showGrid={showGrid}
                showColliders={showColliders}
                readOnly={map.id === "default"}
                snap={snap}
                snapRotation={snapRotation}
                snapStep={snapStep}
                rotationSnap={rotationSnap}
                onSelect={setSelected}
                onTransform={transformObject}
                onInteractiveTransform={transformInteractive}
                onDecorationTransform={transformDecoration}
                onViewportChange={setViewport}
                onPlace={(point) => {
                  if (!placement) {
                    setSelected(null);
                    return;
                  }
                  if (Math.hypot(point.x, point.z) >= map.arena.radius - 1) {
                    setMessage("Place props inside the arena boundary.");
                    return;
                  }
                  if (placement.startsWith("interactive:")) {
                    const kind = placement.slice("interactive:".length) as InteractiveKind;
                    placeInteractive(kind, point);
                    return;
                  }
                  add(placement, point);
                  setPlacement(null);
                }}
              />
            ) : (
              <div className="flex h-full min-h-[620px] items-center justify-center text-center text-catchy-ink-soft">
                Create or open a map to start editing.
              </div>
            )}
            <div
              className={`absolute inset-y-0 left-0 z-20 flex transition-transform duration-200 ${drawerOpen ? "translate-x-0" : "-translate-x-[calc(100%-2.75rem)]"}`}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch" && window.matchMedia("(hover: hover)").matches) {
                  setDrawerHovered(true);
                }
              }}
              onPointerLeave={(event) => {
                if (!event.currentTarget.contains(document.activeElement)) setDrawerHovered(false);
              }}
            >
              <aside
                id="editor-drawer-content"
                aria-label="Map library and asset palette"
                inert={!drawerOpen}
                onFocusCapture={() => setDrawerPinned(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDrawerPinned(false);
                    setDrawerHovered(false);
                  }
                }}
                className="h-full w-72 overflow-y-auto rounded-l-2xl bg-white/95 p-3 shadow-xl backdrop-blur"
              >
                <section aria-labelledby="map-library-heading" className="mb-3">
                  <h2
                    id="map-library-heading"
                    className="mb-2 font-display text-sm font-extrabold uppercase tracking-wider"
                  >
                    Map Library
                  </h2>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {libraryMaps.map((item) => {
                      const isSelected = map?.id === item.id;
                      const isDraft = isSelected && !maps.some((saved) => saved.id === item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={`Select ${item.name} map${item.id === "default" ? ", protected" : isDraft ? ", unsaved draft" : ", custom"}`}
                          aria-pressed={isSelected}
                          title={item.name}
                          onClick={() => {
                            if (!isSelected) open(item);
                          }}
                          className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catchy-ink ${isSelected ? "border-catchy-accent bg-catchy-accent/55" : "border-black/10 bg-white/70 hover:bg-white"}`}
                        >
                          <span className="truncate font-bold">{item.name}</span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${item.id === "default" ? "bg-catchy-ink text-white" : "bg-black/5 text-catchy-ink-soft"}`}
                          >
                            {item.id === "default" ? "Built in" : isDraft ? "Draft" : "Custom"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section
                  aria-labelledby="asset-palette-heading"
                  className="border-t border-black/10 pt-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h2
                      id="asset-palette-heading"
                      className="font-display text-sm font-extrabold uppercase tracking-wider"
                    >
                      Asset Palette
                    </h2>
                    <span className="max-w-36 text-right text-[10px] leading-tight text-catchy-ink-soft">
                      {placement
                        ? "Click inside the arena to place · Esc to cancel"
                        : "Choose an asset, then place it in the arena"}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {ASSET_GROUPS.map((group) => (
                      <div key={group.label} className="min-w-0">
                        <h3 className="mb-1 text-xs font-extrabold uppercase tracking-wider text-catchy-ink-soft">
                          {group.label}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {ASSET_CATALOG.filter((asset) =>
                            (group.categories as readonly string[]).includes(asset.category),
                          ).map((asset) => (
                            <button
                              key={asset.id}
                              type="button"
                              title={asset.displayName}
                              aria-label={`Place ${asset.displayName}`}
                              aria-pressed={placement === asset.id}
                              className={`min-w-[105px] rounded-lg border px-2 py-1.5 text-left text-xs font-bold ${placement === asset.id ? "border-catchy-accent bg-catchy-accent/60" : "border-black/10 bg-white/70 hover:bg-white"}`}
                              disabled={!map || map.id === "default"}
                              onClick={() =>
                                setPlacement((current) => (current === asset.id ? null : asset.id))
                              }
                            >
                              <span aria-hidden="true" className="mr-1 text-catchy-accent">
                                ＋
                              </span>
                              {asset.displayName}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <section
                    aria-labelledby="interactive-objects-heading"
                    className="mt-3 border-t border-black/10 pt-3"
                  >
                    <h3
                      id="interactive-objects-heading"
                      className="mb-1 text-xs font-extrabold uppercase tracking-wider text-catchy-ink-soft"
                    >
                      Interactive Objects
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {INTERACTIVE_KINDS.map((kind) => {
                        const existing = map?.interactiveObjects.find((item) => item.kind === kind);
                        const label = INTERACTIVE_LABELS[kind];
                        const selectedInteractive = selected === `interactive:${existing?.id}`;
                        const activePlacement = placement === `interactive:${kind}`;
                        return (
                          <button
                            key={kind}
                            type="button"
                            aria-label={`${existing ? "Select" : "Place"} ${label}`}
                            aria-pressed={selectedInteractive || activePlacement}
                            className={`rounded-lg border px-2 py-1.5 text-left text-xs font-bold ${activePlacement || selectedInteractive ? "border-catchy-accent bg-catchy-accent/60" : "border-black/10 bg-white/70 hover:bg-white"}`}
                            disabled={!map}
                            onClick={() => selectOrPlaceInteractive(kind)}
                          >
                            <span className="block">{label}</span>
                            <small className="block font-normal opacity-65">
                              {existing
                                ? selectedInteractive
                                  ? "Selected"
                                  : "Already placed"
                                : "Click to place"}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </section>
              </aside>
              <button
                type="button"
                data-drawer-toggle
                aria-label="Toggle editor drawer"
                aria-controls="editor-drawer-content"
                aria-expanded={drawerOpen}
                title={drawerOpen ? "Close editor drawer" : "Open editor drawer"}
                className="my-3 flex h-12 w-11 shrink-0 items-center justify-center rounded-r-xl border border-l-0 border-black/10 bg-white/95 text-catchy-ink shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catchy-ink"
                onClick={() => {
                  if (drawerPinned) {
                    setDrawerPinned(false);
                    setDrawerHovered(false);
                  } else setDrawerPinned(true);
                }}
              >
                <PanelLeftOpen aria-hidden="true" size={19} />
              </button>
            </div>
          </section>
          <aside className="rounded-2xl bg-white/75 p-3 shadow-lg lg:overflow-auto">
            <h2 className="mb-3 font-display text-xl">Inspector</h2>
            {map ? (
              <>
                <label className="mb-3 block text-sm font-bold">
                  Selection
                  <select
                    aria-label="Select map element"
                    className="mt-1 w-full rounded-lg border bg-white p-2"
                    value={selected ?? ""}
                    onChange={(event) => setSelected(event.target.value || null)}
                  >
                    <option value="">Nothing selected</option>
                    {map.interactiveObjects.map((object) => (
                      <option key={object.id} value={`interactive:${object.id}`}>
                        Interactive · {object.kind}
                      </option>
                    ))}
                    {map.objects.map((object) => (
                      <option key={object.id} value={object.id}>
                        {ASSET_CATALOG.find((asset) => asset.id === object.model)?.displayName ??
                          object.model}
                      </option>
                    ))}
                    {(map.decorations ?? []).map((decoration) => (
                      <option key={decoration.id} value={`decoration:${decoration.id}`}>
                        Decoration · {decoration.id}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    className={`rounded-lg px-2 py-1 font-bold ${tool === "translate" ? "bg-catchy-accent" : "bg-white"}`}
                    onClick={() => setTool("translate")}
                    disabled={map.id === "default"}
                  >
                    MOVE
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-2 py-1 font-bold ${tool === "rotate" ? "bg-catchy-accent" : "bg-white"}`}
                    onClick={() => setTool("rotate")}
                    disabled={map.id === "default"}
                  >
                    ROTATE
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-2 py-1 font-bold ${tool === "scale" ? "bg-catchy-accent" : "bg-white"}`}
                    onClick={() => setTool("scale")}
                    disabled={map.id === "default"}
                  >
                    SCALE
                  </button>
                </div>
                <label className="mb-3 block text-sm font-bold">
                  Arena radius
                  <input
                    type="number"
                    min={MAP_LIMITS.minRadius}
                    max={MAP_LIMITS.maxRadius}
                    className="mt-1 w-full rounded-lg border p-2"
                    value={map.arena.radius}
                    disabled={map.id === "default"}
                    onChange={(e) => {
                      const radius = Number(e.target.value);
                      if (!Number.isFinite(radius)) return;
                      update({
                        ...map,
                        arena: {
                          radius: Math.max(
                            MAP_LIMITS.minRadius,
                            Math.min(MAP_LIMITS.maxRadius, radius),
                          ),
                        },
                      });
                    }}
                  />
                </label>
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showColliders}
                    onChange={(e) => setShowColliders(e.target.checked)}
                  />{" "}
                  Colliders
                </label>
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                  />{" "}
                  Grid
                </label>
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={snap}
                    onChange={(e) => setSnap(e.target.checked)}
                  />{" "}
                  Snap position / scale
                </label>
                <label className="mb-3 block text-sm">
                  Snap step
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    className="mt-1 w-full rounded-lg border p-2"
                    value={snapStep}
                    onChange={(e) => setSnapStep(Math.max(0.1, Number(e.target.value) || 0.5))}
                  />
                </label>
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={snapRotation}
                    onChange={(e) => setSnapRotation(e.target.checked)}
                  />
                  Snap rotation
                </label>
                <label className="mb-3 block text-sm">
                  Rotation step (degrees)
                  <input
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    className="mt-1 w-full rounded-lg border p-2"
                    value={rotationSnapDegrees}
                    onChange={(e) =>
                      setRotationSnapDegrees(
                        Math.max(1, Math.min(180, Number(e.target.value) || 15)),
                      )
                    }
                  />
                </label>
                {selected ? (
                  (() => {
                    const object = map.objects.find((item) => item.id === selected);
                    const interactive = selected.startsWith("interactive:")
                      ? map.interactiveObjects.find(
                          (item) => item.id === selected.slice("interactive:".length),
                        )
                      : undefined;
                    const decoration = selected.startsWith("decoration:")
                      ? map.decorations?.find(
                          (item) => item.id === selected.slice("decoration:".length),
                        )
                      : undefined;
                    if (!object && !interactive && !decoration) return null;
                    if (interactive)
                      return (
                        <div>
                          <h3 className="font-bold">{INTERACTIVE_LABELS[interactive.kind]}</h3>
                          <label className="mt-3 block text-sm">
                            X
                            <input
                              type="number"
                              className="mt-1 w-full rounded-lg border p-2"
                              value={interactive.position.x}
                              disabled={map.id === "default"}
                              onChange={(e) =>
                                transformInteractive(
                                  interactive.id,
                                  {
                                    x: Number(e.target.value),
                                    y: interactive.y,
                                    z: interactive.position.z,
                                    rotation: interactive.rotation,
                                    scale: interactive.scale,
                                  },
                                  true,
                                )
                              }
                            />
                          </label>
                          <label className="mt-3 block text-sm">
                            Z
                            <input
                              type="number"
                              className="mt-1 w-full rounded-lg border p-2"
                              value={interactive.position.z}
                              disabled={map.id === "default"}
                              onChange={(e) =>
                                transformInteractive(
                                  interactive.id,
                                  {
                                    x: interactive.position.x,
                                    y: interactive.y,
                                    z: Number(e.target.value),
                                    rotation: interactive.rotation,
                                    scale: interactive.scale,
                                  },
                                  true,
                                )
                              }
                            />
                          </label>
                          <p className="mt-3 text-xs opacity-70">
                            Required interactive objects cannot be deleted. Trigger radius:{" "}
                            {interactive.triggerRadius ?? "—"}
                          </p>
                        </div>
                      );
                    if (decoration)
                      return (
                        <div>
                          <h3 className="font-bold">Decoration · {decoration.id}</h3>
                          <label className="mt-3 block text-sm">
                            X
                            <input
                              type="number"
                              className="mt-1 w-full rounded-lg border p-2"
                              value={decoration.position.x}
                              disabled={map.id === "default"}
                              onChange={(event) => {
                                const x = Number(event.target.value);
                                if (!Number.isFinite(x)) return;
                                update({
                                  ...map,
                                  decorations: (map.decorations ?? []).map((item) =>
                                    item.id === decoration.id
                                      ? { ...item, position: { ...item.position, x: snapValue(x) } }
                                      : item,
                                  ),
                                });
                              }}
                            />
                          </label>
                          <label className="mt-3 block text-sm">
                            Z
                            <input
                              type="number"
                              className="mt-1 w-full rounded-lg border p-2"
                              value={decoration.position.z}
                              disabled={map.id === "default"}
                              onChange={(event) => {
                                const z = Number(event.target.value);
                                if (!Number.isFinite(z)) return;
                                update({
                                  ...map,
                                  decorations: (map.decorations ?? []).map((item) =>
                                    item.id === decoration.id
                                      ? { ...item, position: { ...item.position, z: snapValue(z) } }
                                      : item,
                                  ),
                                });
                              }}
                            />
                          </label>
                          <label className="mt-3 block text-sm">
                            Rotation (radians)
                            <input
                              type="number"
                              step="0.261799"
                              className="mt-1 w-full rounded-lg border p-2"
                              value={decoration.rotation ?? 0}
                              disabled={map.id === "default"}
                              onChange={(event) => {
                                const rotation = Number(event.target.value);
                                if (!Number.isFinite(rotation)) return;
                                update({
                                  ...map,
                                  decorations: (map.decorations ?? []).map((item) =>
                                    item.id === decoration.id ? { ...item, rotation } : item,
                                  ),
                                });
                              }}
                            />
                          </label>
                          <label className="mt-3 block text-sm">
                            Radius
                            <input
                              aria-label="Decoration radius"
                              type="number"
                              min="0.5"
                              max={map.arena.radius}
                              step={snapStep}
                              className="mt-1 w-full rounded-lg border p-2"
                              value={decoration.radius}
                              disabled={map.id === "default"}
                              onChange={(event) => {
                                const radius = Number(event.target.value);
                                if (!Number.isFinite(radius)) return;
                                update({
                                  ...map,
                                  decorations: (map.decorations ?? []).map((item) =>
                                    item.id === decoration.id
                                      ? {
                                          ...item,
                                          radius: snapEditorRadius(
                                            radius,
                                            snapStep,
                                            snap,
                                            map.arena.radius,
                                          ),
                                        }
                                      : item,
                                  ),
                                });
                              }}
                            />
                          </label>
                          <p className="mt-3 text-xs opacity-70">
                            WASD moves; arrows rotate and change radius. Ctrl+Z / Ctrl+Y undo or
                            redo.
                          </p>
                          <button
                            type="button"
                            className="mt-4 w-full rounded-xl bg-red-100 p-2 font-bold text-red-700"
                            onClick={removeSelected}
                            disabled={map.id === "default"}
                          >
                            DELETE DECORATION
                          </button>
                        </div>
                      );
                    if (!object) return null;
                    return (
                      <div>
                        <h3 className="font-bold">{object.model}</h3>
                        <label className="mt-3 block text-sm">
                          X
                          <input
                            type="number"
                            className="mt-1 w-full rounded-lg border p-2"
                            value={object.position.x}
                            disabled={map.id === "default"}
                            onChange={(e) => moveSelected("x", Number(e.target.value))}
                          />
                        </label>
                        <label className="mt-3 block text-sm">
                          Rotation (radians)
                          <input
                            type="number"
                            step="0.261799"
                            className="mt-1 w-full rounded-lg border p-2"
                            value={object.rotation}
                            disabled={map.id === "default"}
                            onChange={(e) =>
                              update({
                                ...map,
                                objects: map.objects.map((item) =>
                                  item.id === selected
                                    ? { ...item, rotation: Number(e.target.value) }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="mt-3 block text-sm">
                          Scale
                          <input
                            type="number"
                            min="0.1"
                            max="12"
                            step="0.1"
                            className="mt-1 w-full rounded-lg border p-2"
                            value={object.scale}
                            disabled={map.id === "default"}
                            onChange={(e) =>
                              update({
                                ...map,
                                objects: map.objects.map((item) =>
                                  item.id === selected
                                    ? { ...item, scale: Number(e.target.value) }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="mt-3 block text-sm">
                          Z
                          <input
                            type="number"
                            className="mt-1 w-full rounded-lg border p-2"
                            value={object.position.z}
                            disabled={map.id === "default"}
                            onChange={(e) => moveSelected("z", Number(e.target.value))}
                          />
                        </label>
                        <div className="mt-3 rounded-lg border bg-white/50 p-2 text-xs">
                          <span className="font-bold">Collider: </span>
                          <span>
                            {object.collision.type === "circle"
                              ? `Circle (r=${formatColliderDimension(object.collision.radius)})`
                              : `Box (${formatColliderDimension(object.collision.width)} × ${formatColliderDimension(object.collision.depth)})`}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="mt-2 w-full rounded-lg border bg-white p-2 text-sm font-bold"
                          onClick={() => fitSelectedCollider(object)}
                          disabled={map.id === "default"}
                        >
                          Fit collider to asset
                        </button>
                        <label className="mt-3 block text-sm">
                          Collider shape
                          <select
                            aria-label="Collider shape"
                            className="mt-1 w-full rounded-lg border bg-white p-2"
                            value={object.collision.type}
                            disabled={map.id === "default"}
                            onChange={(event) =>
                              setObjectCollider(
                                object.id,
                                event.target.value === "circle"
                                  ? {
                                      type: "circle",
                                      radius:
                                        object.collision.type === "circle"
                                          ? object.collision.radius
                                          : Math.max(
                                              object.collision.width,
                                              object.collision.depth,
                                            ) / 2,
                                    }
                                  : {
                                      type: "box",
                                      width:
                                        object.collision.type === "box"
                                          ? object.collision.width
                                          : object.collision.radius * 2,
                                      depth:
                                        object.collision.type === "box"
                                          ? object.collision.depth
                                          : object.collision.radius * 2,
                                    },
                              )
                            }
                          >
                            <option value="circle">Circle</option>
                            <option value="box">Box</option>
                          </select>
                        </label>
                        {object.collision.type === "circle" ? (
                          <label className="mt-2 block text-sm">
                            Collider radius
                            <input
                              aria-label="Collider radius"
                              type="number"
                              min="0.1"
                              max="20"
                              step="0.1"
                              className="mt-1 w-full rounded-lg border p-2"
                              value={object.collision.radius}
                              disabled={map.id === "default"}
                              onChange={(event) =>
                                setObjectCollider(object.id, {
                                  type: "circle",
                                  radius: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        ) : (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {(["width", "depth"] as const).map((axis) => (
                              <label key={axis} className="block text-sm capitalize">
                                Collider {axis}
                                <input
                                  aria-label={`Collider ${axis}`}
                                  type="number"
                                  min="0.1"
                                  max="30"
                                  step="0.1"
                                  className="mt-1 w-full rounded-lg border p-2"
                                  value={
                                    object.collision.type === "box" ? object.collision[axis] : 1
                                  }
                                  disabled={map.id === "default"}
                                  onChange={(event) => {
                                    if (object.collision.type !== "box") return;
                                    setObjectCollider(object.id, {
                                      ...object.collision,
                                      [axis]: Number(event.target.value),
                                    });
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                        )}
                        <button
                          className="mt-4 w-full rounded-xl bg-catchy-ink p-2 font-bold text-white"
                          onClick={duplicateSelected}
                          disabled={map.id === "default"}
                        >
                          DUPLICATE OBJECT
                        </button>
                        <button
                          className="mt-2 w-full rounded-xl bg-red-100 p-2 font-bold text-red-700"
                          onClick={removeSelected}
                          disabled={map.id === "default"}
                        >
                          DELETE
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-sm opacity-70">
                    Select a prop in the viewport. Add assets from the palette.
                  </p>
                )}
                <div className="mt-6 rounded-xl bg-white/70 p-3 text-sm">
                  <strong>Validation</strong>
                  {validation?.warnings.map((warning) => (
                    <p key={warning.code + warning.message} className="mt-1 text-amber-800">
                      {warning.message}
                    </p>
                  ))}
                  {validation?.errors.map((error) => (
                    <p key={error.code + error.message} className="mt-1 text-red-700">
                      • {error.message}
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm opacity-70">Choose a map or create a new clean template.</p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
