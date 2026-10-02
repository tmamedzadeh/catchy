import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { HUD } from "@/components/hud/HUD";
import { GameFeedback, unlockGameAudio } from "@/lib/catchy/feedback";
import { installInputEventListeners, setGameplayInputEnabled } from "@/lib/catchy/input";
import { mapRepository, setActiveMap, type MapDefinition } from "@/lib/catchy/maps";
import {
  beginPlaySession,
  isIOSPlatform,
  isStandaloneOrFullscreen,
  listenForFullscreenEvents,
  listenForInstallPrompt,
  type DeferredInstallPrompt,
} from "@/lib/catchy/pwa";

const GameCanvas = lazy(() =>
  import("@/components/game/GameCanvas").then(({ GameCanvas: Canvas }) => ({ default: Canvas })),
);

const title = "Catchy — Fast chase/tag browser game";
const description =
  "Chase three runners around a bright 3D arena in Catchy, a fast browser tag game.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  component: Game,
});

function Game() {
  const [started, setStarted] = useState(false);
  const [maps, setMaps] = useState<MapDefinition[]>(() => mapRepository.listMaps());
  const [selectedMapId, setSelectedMapId] = useState(() => {
    const saved = mapRepository.getLastSelectedId();
    return saved && mapRepository.hasMap(saved) ? saved : "default";
  });
  const [gameReady, setGameReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installedMode, setInstalledMode] = useState(() => isStandaloneOrFullscreen());
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const markReady = useCallback(() => setGameReady(true), []);

  useLayoutEffect(() => {
    setGameplayInputEnabled(started && gameReady);
    return () => setGameplayInputEnabled(false);
  }, [started, gameReady]);

  useEffect(() => {
    if (!started) return;
    return installInputEventListeners();
  }, [started]);

  const play = useCallback(() => {
    const selected = maps.find((map) => map.id === selectedMapId) ?? maps[0]!;
    setActiveMap(selected);
    mapRepository.setLastSelectedId(selected.id);
    void unlockGameAudio();
    // The helper requests fullscreen from PLAY, then locks orientation and launches.
    beginPlaySession(() => setStarted(true), { alreadyFullscreen: installedMode });
  }, [installedMode, maps, selectedMapId]);

  useEffect(
    () =>
      listenForInstallPrompt(
        (event) => setInstallPrompt(event),
        () => {
          setInstallPrompt(null);
          setInstalledMode(true);
        },
      ),
    [],
  );

  useEffect(
    () =>
      listenForFullscreenEvents(
        () => setInstalledMode(isStandaloneOrFullscreen()),
        () => setInstalledMode(isStandaloneOrFullscreen()),
      ),
    [],
  );

  const offerInstall = useCallback(() => {
    const deferredPrompt = installPrompt;
    if (!deferredPrompt) {
      setShowInstallHelp((visible) => !visible);
      return;
    }
    setInstallPrompt(null);
    try {
      const promptResult = deferredPrompt.prompt();
      void promptResult.then(() => deferredPrompt.userChoice).catch(() => setShowInstallHelp(true));
    } catch {
      setShowInstallHelp(true);
    }
  }, [installPrompt]);

  useEffect(() => {
    if (import.meta.env.MODE !== "e2e" || import.meta.env["VITE_CATCHY_E2E"] !== "true") return;
    let dispose: (() => void) | undefined;
    let canceled = false;
    void import("@/lib/catchy/e2eBridge").then(({ installCatchyE2EBridge }) => {
      const removeBridge = installCatchyE2EBridge();
      if (canceled) removeBridge();
      else dispose = removeBridge;
    });
    return () => {
      canceled = true;
      dispose?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3ff]">
      {started ? (
        <>
          <Suspense fallback={null}>
            <GameCanvas gameReady={gameReady} />
          </Suspense>
          <HUD gameReady={gameReady} />
          <GameFeedback />
          <LoadingScreen ready={gameReady} onReady={markReady} />
        </>
      ) : (
        <StartScreen
          installedMode={installedMode}
          hasInstallPrompt={installPrompt !== null}
          showInstallHelp={showInstallHelp}
          onInstall={offerInstall}
          maps={maps}
          selectedMapId={selectedMapId}
          onSelectMap={(id) => {
            setSelectedMapId(id);
            mapRepository.setLastSelectedId(id);
          }}
          onRefreshMaps={() => setMaps(mapRepository.listMaps())}
          onPlay={play}
        />
      )}
    </div>
  );
}

export function StartScreen({
  installedMode,
  hasInstallPrompt,
  showInstallHelp,
  onInstall,
  maps,
  selectedMapId,
  onSelectMap,
  onRefreshMaps,
  onPlay,
}: {
  maps: MapDefinition[];
  selectedMapId: string;
  onSelectMap: (id: string) => void;
  onRefreshMaps: () => void;
  installedMode: boolean;
  hasInstallPrompt: boolean;
  showInstallHelp: boolean;
  onInstall: () => void;
  onPlay: () => void;
}) {
  const ios = isIOSPlatform();
  return (
    <main className="catchy-start-screen">
      <div className="catchy-start-card">
        <h1 className="catchy-start-title">CATCHY</h1>
        <p className="catchy-start-subtitle">Tag arena</p>
        <div className="mb-5 mt-5 w-full max-w-2xl text-left">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-extrabold tracking-[0.25em] text-catchy-ink-soft">
              MAPS
            </span>
            <a className="text-sm font-bold text-catchy-ink underline" href="/editor">
              EDITOR
            </a>
          </div>
          <div className="grid max-h-[38vh] grid-cols-1 gap-3 overflow-auto pr-1 sm:grid-cols-2">
            {maps.map((map) => (
              <MapCard
                key={map.id}
                map={map}
                selected={map.id === selectedMapId}
                onSelect={() => onSelectMap(map.id)}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <a
              className="flex-1 rounded-xl border-catchy-ink/20 bg-white/50 px-3 py-2 text-center text-sm font-bold text-catchy-ink"
              href="/editor"
            >
              CREATE MAP / EDITOR
            </a>
            <button
              type="button"
              className="flex-1 rounded-xl border-catchy-ink/20 bg-white/50 px-3 py-2 text-sm font-bold text-catchy-ink"
              onClick={onRefreshMaps}
            >
              REFRESH MAPS
            </button>
          </div>
        </div>
        <button type="button" className="catchy-play-button" onClick={onPlay}>
          START
        </button>
        {!installedMode && (
          <div className="catchy-install-prompt">
            <span>Install Catchy for the best fullscreen experience</span>
            <button type="button" onClick={onInstall}>
              {hasInstallPrompt ? "Install" : "How to install"}
            </button>
            {showInstallHelp && (
              <p className="catchy-install-help" role="status">
                {ios
                  ? "In Safari, tap Share → Add to Home Screen, enable Open as Web App, then tap Add."
                  : "Open your browser menu and choose Install app or Add to Home Screen."}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function MapCard({
  map,
  selected,
  onSelect,
}: {
  map: MapDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl border-2 p-3 text-left transition ${selected ? "border-catchy-accent bg-white shadow-lg" : "border-white/70 bg-white/45 hover:bg-white/70"}`}
      aria-pressed={selected}
    >
      <div className="flex gap-3">
        <svg
          viewBox="0 0 100 100"
          className="h-16 w-16 shrink-0 rounded-xl bg-[#e9b766]"
          aria-label={`${map.name} preview`}
        >
          <circle cx="50" cy="50" r="44" fill="none" stroke="#8b6b4b" strokeWidth="3" />
          {map.objects.slice(0, 24).map((object) => (
            <circle
              key={object.id}
              cx={50 + (object.position.x / map.arena.radius) * 42}
              cy={50 + (object.position.z / map.arena.radius) * 42}
              r="2.5"
              fill="#6f5b43"
            />
          ))}
          <circle
            cx={50 + (map.playerSpawn.x / map.arena.radius) * 42}
            cy={50 + (map.playerSpawn.z / map.arena.radius) * 42}
            r="3"
            fill="#3a8dff"
          />
          {map.runnerSpawns.map((spawn) => (
            <circle
              key={spawn.id}
              cx={50 + (spawn.x / map.arena.radius) * 42}
              cy={50 + (spawn.z / map.arena.radius) * 42}
              r="2.5"
              fill="#e85b67"
            />
          ))}
        </svg>
        <span>
          <strong className="block text-lg text-catchy-ink">{map.name}</strong>
          <small className="block text-catchy-ink-soft">
            {map.id === "default" ? "Default" : "Saved on this device"}
          </small>
          <span className="mt-1 block text-xs text-catchy-ink-soft">
            {map.description ?? "Custom tag arena"}
          </span>
        </span>
      </div>
    </button>
  );
}

function isAssetQueueComplete() {
  const { active, errors, loaded, progress, total } = useProgress.getState();
  return progress >= 100 || (!active && total > 0 && loaded + errors.length >= total);
}

function LoadingScreen({ ready, onReady }: { ready: boolean; onReady: () => void }) {
  const { active, errors, loaded, progress, total } = useProgress();
  const [layerVisible, setLayerVisible] = useState(() => !isAssetQueueComplete());
  const complete = progress >= 100 || (!active && total > 0 && loaded + errors.length >= total);

  useEffect(() => {
    if (complete) onReady();
  }, [complete, onReady]);

  useEffect(() => {
    if (!ready) return;
    const timeout = window.setTimeout(() => setLayerVisible(false), 300);
    return () => window.clearTimeout(timeout);
  }, [ready]);

  if (!layerVisible) return null;

  return (
    <div
      aria-hidden={ready}
      aria-live="polite"
      className={`game-loading-screen ${ready ? "game-loading-screen-ready" : ""}`}
    >
      <div className="game-loading-card">
        <div className="font-display text-3xl font-semibold tracking-tight">Catchy</div>
        <div className="mt-1 text-sm text-catchy-ink-soft">Getting the arena ready</div>
        <div className="game-loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
