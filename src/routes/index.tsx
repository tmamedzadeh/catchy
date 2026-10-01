import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { HUD } from "@/components/hud/HUD";
import { GameFeedback, unlockGameAudio } from "@/lib/catchy/feedback";
import { installInputEventListeners, setPlayerJumpInputEnabled } from "@/lib/catchy/input";
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
  const [gameReady, setGameReady] = useState(() => isAssetQueueComplete());
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installedMode, setInstalledMode] = useState(() => isStandaloneOrFullscreen());
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const markReady = useCallback(() => setGameReady(true), []);

  useLayoutEffect(() => {
    setPlayerJumpInputEnabled(started && gameReady);
    return () => setPlayerJumpInputEnabled(false);
  }, [started, gameReady]);

  useEffect(() => {
    if (!started) return;
    return installInputEventListeners();
  }, [started]);

  const play = useCallback(() => {
    void unlockGameAudio();
    // The helper requests fullscreen from PLAY, then locks orientation and launches.
    beginPlaySession(() => setStarted(true), { alreadyFullscreen: installedMode });
  }, [installedMode]);

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
            <GameCanvas />
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
  onPlay,
}: {
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
        <button type="button" className="catchy-play-button" onClick={onPlay}>
          PLAY
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
