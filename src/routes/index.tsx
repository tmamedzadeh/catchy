import { createFileRoute } from "@tanstack/react-router";
import { GameCanvas } from "@/components/game/GameCanvas";
import { HUD } from "@/components/hud/HUD";

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
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#bfe3ff]">
      <GameCanvas />
      <HUD />
    </div>
  );
}
