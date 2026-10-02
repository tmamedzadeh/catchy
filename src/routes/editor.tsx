import { createFileRoute, Link } from "@tanstack/react-router";
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
  type MapDefinition,
  type Point2,
} from "@/lib/catchy/maps";

export const Route = createFileRoute("/editor")({ ssr: false, component: Editor });

function Editor() {
  const [maps, setMaps] = useState(() => mapRepository.listMaps());
  const [map, setMap] = useState<MapDefinition | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showColliders, setShowColliders] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [snapStep, setSnapStep] = useState(0.5);
  const [tool, setTool] = useState<"translate" | "rotate" | "scale">("translate");
  const [history, setHistory] = useState<MapDefinition[]>([]);
  const [future, setFuture] = useState<MapDefinition[]>([]);
  const [placement, setPlacement] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<EditorSelection>(null);
  const validation = useMemo(() => (map ? validateMap(map) : null), [map]);
  const update = (next: MapDefinition, historyEntry = true) => {
    if (historyEntry && map) setHistory((items) => [...items.slice(-49), structuredClone(map)]);
    setFuture(historyEntry ? [] : future);
    setMap(structuredClone(next));
    setDirty(true);
  };
  const open = (next: MapDefinition) => {
    setMap(structuredClone(next));
    setDirty(false);
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
      setDirty(false);
      setMessage("Saved on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save map.");
    }
  };
  const add = (model: string, point: Point2 = { x: 0, z: 0 }) => {
    if (!map) return;
    const asset = ASSET_CATALOG.find((item) => item.id === model);
    if (!asset) return;
    const count = map.objects.length;
    const id = `${model}-${Date.now()}-${count}`;
    update({
      ...map,
      objects: [
        ...map.objects,
        {
          id,
          model,
          position: { x: point.x, z: point.z },
          rotation: 0,
          scale: asset.defaultScale,
          y: 0,
          collision: structuredClone(asset.collision),
        },
      ],
    });
    setSelected(id);
    void count;
  };
  const moveSelected = (axis: "x" | "z", value: number) => {
    if (!map || !selected) return;
    update({
      ...map,
      objects: map.objects.map((object) =>
        object.id === selected
          ? {
              ...object,
              position: { ...object.position, [axis]: snap ? Math.round(value * 2) / 2 : value },
            }
          : object,
      ),
    });
  };
  const removeSelected = () => {
    if (!map || !selected) return;
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
  const create = () => open(mapRepository.newMap());
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
    let duplicateMap: MapDefinition | undefined;
    if (mapRepository.hasMap(map.id)) duplicateMap = mapRepository.duplicateMap(map.id);
    else {
      duplicateMap = structuredClone(map);
      duplicateMap.id = `map-${Date.now().toString(36)}`;
      duplicateMap.name = `${map.name} Copy`;
    }
    if (!duplicateMap) return;
    const duplicateId = duplicateMap.id;
    if (!duplicateMap) return;
    setMaps(mapRepository.listMaps());
    open({
      ...structuredClone(duplicateMap),
      name: `${map.name} Copy`,
    });
  };
  const importInput = useRef<HTMLInputElement>(null);
  const importMap = async (file: File) => {
    try {
      const imported = await mapRepository.importMap(await file.text());
      setMaps(mapRepository.listMaps());
      open(imported);
      setMessage("Imported as a new custom map.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    }
  };
  const transformObject = (id: string, transform: EditorTransform, committed: boolean) => {
    if (
      !map ||
      !Number.isFinite(transform.x) ||
      !Number.isFinite(transform.z) ||
      !Number.isFinite(transform.rotation) ||
      !Number.isFinite(transform.scale)
    )
      return;
    const next = {
      ...map,
      objects: map.objects.map((object) =>
        object.id === id
          ? {
              ...object,
              position: { x: transform.x, z: transform.z },
              rotation: transform.rotation,
              scale: transform.scale,
              y: transform.y,
            }
          : object,
      ),
    };
    if (committed) update(next);
    else setMap(next);
    setDirty(true);
  };
  const transformSpawn = (id: string, point: Point2, committed: boolean) => {
    if (!map || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const next: MapDefinition =
      id === "spawn:player"
        ? { ...map, playerSpawn: { x: point.x, z: point.z } }
        : {
            ...map,
            runnerSpawns: map.runnerSpawns.map((spawn) =>
              `spawn:${spawn.id}` === id ? { ...spawn, x: point.x, z: point.z } : spawn,
            ),
          };
    if (committed) update(next);
    else setMap(next);
    setDirty(true);
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
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
    const blob = new Blob([mapRepository.exportMap(map)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${map.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <main
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="min-h-screen overflow-auto bg-[#bfe3ff] p-4 text-catchy-ink md:p-6"
    >
      <header className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 rounded-2xl bg-white/75 p-4 shadow-lg">
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
          disabled={!map}
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
          disabled={!map}
        >
          EXPORT JSON
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
      <div className="mx-auto mt-4 grid max-w-[1500px] gap-4 lg:grid-cols-[240px_1fr_280px]">
        <aside className="rounded-2xl bg-white/75 p-4 shadow-lg">
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
          <hr className="my-4 border-black/10" />
          <h2 className="mb-2 font-display text-xl">Assets</h2>
          <div className="grid gap-2">
            {ASSET_CATALOG.map((asset) => (
              <button
                key={asset.id}
                type="button"
                aria-label={`Place ${asset.displayName}`}
                className={`rounded-lg px-2 py-2 text-left text-sm hover:bg-white ${placement === asset.id ? "bg-catchy-accent" : "bg-white/70"}`}
                disabled={!map || map.id === "default"}
                onClick={() => setPlacement((current) => (current === asset.id ? null : asset.id))}
              >
                ＋ {asset.displayName}
              </button>
            ))}
          </div>
        </aside>
        <section
          className="relative min-h-[620px] overflow-hidden rounded-2xl bg-[#e9b766] shadow-lg"
          data-testid="editor-viewport"
        >
          {map ? (
            <EditorViewport
              map={map}
              selected={selected}
              tool={tool}
              showGrid={showGrid}
              showColliders={showColliders}
              snap={snap}
              snapStep={snapStep}
              rotationSnap={Math.PI / 12}
              onSelect={setSelected}
              onTransform={transformObject}
              onSpawnTransform={transformSpawn}
              onPlace={(point) => placement && (add(placement, point), setPlacement(null))}
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
        </section>
        <aside className="rounded-2xl bg-white/75 p-4 shadow-lg">
          <h2 className="mb-3 font-display text-xl">Inspector</h2>
          {map ? (
            <>
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1 font-bold ${tool === "translate" ? "bg-catchy-accent" : "bg-white"}`}
                  onClick={() => setTool("translate")}
                >
                  MOVE
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1 font-bold ${tool === "rotate" ? "bg-catchy-accent" : "bg-white"}`}
                  onClick={() => setTool("rotate")}
                >
                  ROTATE
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1 font-bold ${tool === "scale" ? "bg-catchy-accent" : "bg-white"}`}
                  onClick={() => setTool("scale")}
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
                <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />{" "}
                Snap
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
              {selected ? (
                (() => {
                  const object = map.objects.find((item) => item.id === selected);
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
                          onChange={(e) => moveSelected("z", Number(e.target.value))}
                        />
                      </label>
                      <button
                        className="mt-4 w-full rounded-xl bg-red-100 p-2 font-bold text-red-700"
                        onClick={removeSelected}
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
    </main>
  );
}
