import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { GameCanvas } from "@/components/game/GameCanvas";
import { HUD } from "@/components/hud/HUD";
import { GameFeedback } from "@/lib/sprout/feedback";

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
  const [gameReady, setGameReady] = useState(() => isAssetQueueComplete());
  const markReady = useCallback(() => setGameReady(true), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3ff]">
      <GameCanvas />
      <HUD gameReady={gameReady} />
      <GameFeedback />
      <LoadingScreen ready={gameReady} onReady={markReady} />
    </div>
  );
}

function isAssetQueueComplete() {
  const { active, loaded, progress, total } = useProgress.getState();
  return progress >= 100 || (!active && total > 0 && loaded >= total);
}

function LoadingScreen({ ready, onReady }: { ready: boolean; onReady: () => void }) {
  const { active, loaded, progress, total } = useProgress();
  const [layerVisible, setLayerVisible] = useState(() => !isAssetQueueComplete());
  const complete = progress >= 100 || (!active && total > 0 && loaded >= total);

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
        <div className="game-loading-mark" aria-hidden="true">
          C
        </div>
        <div className="font-display text-3xl font-semibold tracking-tight">Catchy</div>
        <div className="mt-1 text-sm text-sprout-ink-soft">Getting the arena ready</div>
        <div className="game-loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
