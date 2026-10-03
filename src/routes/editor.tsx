import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  EditorViewport,
  type EditorSelection,
  type EditorTransform,
} from "@/components/editor/EditorViewport";
import {
  ASSET_CATALOG,
  mapRepository,
  validateMap,
  type CollisionShape,
  type MapDefinition,
  type Point2,
} from "@/lib/catchy/maps";

export const Route = createFileRoute("/editor")({ ssr: false, component: Editor });

const ASSET_GROUPS = [
  { label: "Nature", categories: ["rocks", "trees"] },
  { label: "Town", categories: ["town", "walls"] },
  { label: "Pirate", categories: ["crates", "barrels"] },
] as const;

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
  const dragStartMap = useRef<MapDefinition | null>(null);
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
      ...map.runnerSpawns.map((spawn) => spawn.id),
      "player",
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
  const duplicateSelected = () => {
    if (
      !map ||
      map.id === "default" ||
      !selected ||
      selected.startsWith("spawn:") ||
      selected.startsWith("interactive:")
    )
      return;
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
    if (selected.startsWith("spawn:")) {
      setMessage("Spawn points are required; move them instead of deleting them.");
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
              scale: snapValue(transform.scale),
              y: transform.y,
            }
          : object,
      ),
    };
    commitDrag(next);
  };
  const transformSpawn = (id: string, point: Point2, committed: boolean) => {
    if (!map || map.id === "default" || !Number.isFinite(point.x) || !Number.isFinite(point.z))
      return;
    if (!committed) {
      if (!dragStartMap.current) dragStartMap.current = structuredClone(map);
      return;
    }
    const next: MapDefinition =
      id === "spawn:player"
        ? { ...map, playerSpawn: { x: snapValue(point.x), z: snapValue(point.z) } }
        : {
            ...map,
            runnerSpawns: map.runnerSpawns.map((spawn) =>
              `spawn:${spawn.id}` === id
                ? { ...spawn, x: snapValue(point.x), z: snapValue(point.z) }
                : spawn,
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
      interactiveObjects: map.interactiveObjects.map((object) =>
        object.id === id
          ? {
              ...object,
              position: { x: snapValue(transform.x), z: snapValue(transform.z) },
              rotation: snapValue(transform.rotation, rotationSnap, snapRotation),
              scale: snapValue(transform.scale),
              y: transform.y,
            }
          : object,
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
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
    if (event.key === "Escape") {
      setPlacement(null);
      setSelected(null);
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selected) {
      event.preventDefault();
      removeSelected();
    }
    if (event.key.toLowerCase() === "w") setTool("translate");
    if (event.key.toLowerCase() === "e") setTool("rotate");
    if (event.key.toLowerCase() === "r") setTool("scale");
  };
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
  return (
    <main
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="min-h-screen overflow-auto bg-[#bfe3ff] p-3 text-catchy-ink md:p-4"
    >
      <header className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 rounded-2xl bg-white/75 p-3 shadow-lg">
        <Link to="/" className="font-bold">
          ← Back to Maps
        </Link>
        <input
          aria-label="Map name"
          className="min-w-48 flex-1 rounded-xl border-black/10 bg-white px-3 py-2 text-xl font-bold"
          value={map?.name ?? "Map editor"}
          disabled={!map || map.id === "default"}
          onChange={(event) => map && update({ ...map, name: event.target.value })}
        />
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${validation?.valid ? "bg-lime-200" : "bg-amber-200"}`}
        >
          {map
            ? validation?.valid
              ? "VALID"
              : `${validation?.errors.length} errors`
            : "Choose a map"}
        </span>
        <span
          className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold"
          role="status"
          data-testid="dirty-status"
        >
          {dirty ? "Unsaved changes" : "Saved"}
        </span>
        <button
          className="rounded-xl bg-catchy-accent px-4 py-2 font-bold"
          disabled={!map || !validation?.valid || !dirty}
          onClick={save}
        >
          SAVE
        </button>
        <button
          className="rounded-xl bg-catchy-ink px-4 py-2 font-bold text-white"
          onClick={duplicate}
          disabled={!map || !validation?.valid}
        >
          DUPLICATE
        </button>
        <button
          className="rounded-xl border-black/10 bg-white px-4 py-2 font-bold"
          onClick={create}
        >
          NEW MAP
        </button>
        <button
          type="button"
          aria-label="Undo"
          className="rounded-xl border-black/10 bg-white px-3 py-2 font-bold"
          onClick={undo}
          disabled={history.length === 0}
        >
          UNDO
        </button>
        <button
          type="button"
          aria-label="Redo"
          className="rounded-xl border-black/10 bg-white px-3 py-2 font-bold"
          onClick={redo}
          disabled={future.length === 0}
        >
          REDO
        </button>
        <button
          className="rounded-xl border-black/10 bg-white px-4 py-2 font-bold"
          onClick={exportMap}
          disabled={!map || map.id === "default" || !validation?.valid}
        >
          EXPORT JSON
        </button>
        <button
          className="rounded-xl bg-red-100 px-4 py-2 font-bold text-red-700"
          onClick={deleteMap}
          disabled={!map || map.id === "default"}
        >
          DELETE MAP
        </button>
        <button
          type="button"
          aria-label="Import JSON"
          className="rounded-xl border-black/10 bg-white px-4 py-2 font-bold"
          onClick={() => importInput.current?.click()}
        >
          IMPORT JSON
        </button>
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
      <div className="mx-auto mt-3 grid max-w-[1700px] gap-3 lg:h-[calc(100vh-135px)] lg:grid-rows-[minmax(0,1fr)_190px]">
        <div className="grid min-h-[620px] gap-3 lg:min-h-0 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
          <aside className="rounded-2xl bg-white/75 p-3 shadow-lg lg:overflow-auto">
            <h2 className="mb-3 font-display text-xl">Map library</h2>
            {maps.map((item) => (
              <button
                key={item.id}
                className={`mb-2 w-full rounded-xl p-3 text-left ${map?.id === item.id ? "bg-catchy-accent/70" : "bg-white/70"}`}
                onClick={() => open(item)}
              >
                {item.name}
                <small className="block opacity-60">
                  {item.id === "default" ? "Protected built-in" : "Saved on this device"}
                </small>
              </button>
            ))}
          </aside>
          <section
            className="relative min-h-[420px] overflow-hidden rounded-2xl bg-[#e9b766] shadow-lg lg:min-h-0"
            data-testid="editor-viewport"
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
                onSpawnTransform={transformSpawn}
                onPlace={(point) => {
                  if (!placement) {
                    setSelected(null);
                    return;
                  }
                  if (Math.hypot(point.x, point.z) >= map.arena.radius - 1) {
                    setMessage("Place props inside the arena boundary.");
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
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-white/80 px-3 py-2 text-xs font-bold">
              Click to select · drag gizmo to edit · wheel zoom · middle drag pan · W/E/R tools ·
              Delete removes selected
            </div>
            <div className="pointer-events-none absolute right-3 top-3 rounded-xl bg-white/85 px-3 py-2 text-xs font-bold">
              <span className="text-blue-600">● Player spawn</span>
              <span className="ml-3 text-rose-600">● Runner spawns</span>
              <span className="ml-3 text-emerald-700">● Interactive areas</span>
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
                    <option value="spawn:player">Player spawn</option>
                    {map.runnerSpawns.map((spawn) => (
                      <option key={spawn.id} value={`spawn:${spawn.id}`}>
                        Runner spawn · {spawn.id}
                      </option>
                    ))}
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
                    min="12"
                    max="80"
                    className="mt-1 w-full rounded-lg border p-2"
                    value={map.arena.radius}
                    disabled={map.id === "default"}
                    onChange={(e) => update({ ...map, arena: { radius: Number(e.target.value) } })}
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
                    const spawn = selected.startsWith("spawn:")
                      ? selected === "spawn:player"
                        ? { id: "player", x: map.playerSpawn.x, z: map.playerSpawn.z }
                        : map.runnerSpawns.find(
                            (item) => item.id === selected.slice("spawn:".length),
                          )
                      : undefined;
                    if (!object && !interactive && !spawn) return null;
                    if (spawn)
                      return (
                        <div>
                          <h3 className="font-bold">
                            {spawn.id === "player" ? "Player spawn" : `Runner ${spawn.id}`}
                          </h3>
                          <label className="mt-3 block text-sm">
                            X
                            <input
                              type="number"
                              className="mt-1 w-full rounded-lg border p-2"
                              value={spawn.x}
                              disabled={map.id === "default"}
                              onChange={(e) =>
                                transformSpawn(
                                  selected,
                                  { x: Number(e.target.value), z: spawn.z },
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
                              value={spawn.z}
                              disabled={map.id === "default"}
                              onChange={(e) =>
                                transformSpawn(
                                  selected,
                                  { x: spawn.x, z: Number(e.target.value) },
                                  true,
                                )
                              }
                            />
                          </label>
                          <p className="mt-3 text-xs opacity-70">
                            Spawn points are required and cannot be deleted.
                          </p>
                        </div>
                      );
                    if (interactive)
                      return (
                        <div>
                          <h3 className="font-bold">{interactive.kind}</h3>
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
                              ? `Circle (r=${object.collision.radius.toFixed(2)})`
                              : `Box (${object.collision.width.toFixed(2)} × ${object.collision.depth.toFixed(2)})`}
                          </span>
                        </div>
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
        <section className="rounded-2xl bg-white/75 p-3 shadow-lg" aria-label="Asset palette">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg">Asset palette</h2>
            <span className="text-xs text-catchy-ink-soft">
              {placement
                ? "Click inside the arena to place · Esc to cancel"
                : "Choose an asset, then place it in the arena"}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
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
                      title={asset.modelPath}
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
        </section>
      </div>
    </main>
  );
}
