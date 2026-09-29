import { createFileRoute } from "@tanstack/react-router";
import { GameCanvas } from "@/components/game/GameCanvas";
import { HUD } from "@/components/hud/HUD";

const title = "Sprout! Tiny Tag Arena — 3D chase game prototype";
const description =
  "A sunny 3D tag arena: chase three runners across an open round map, dodge traps, grab power-ups and tag them before the timer runs out.";

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
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3ff]">
      <GameCanvas />
      <HUD />
    </div>
  );
}
