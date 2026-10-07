import { expect, test, type Page } from "@playwright/test";
import { openStartScreen, startGame } from "./helpers";

test("R100 perimeter shadows stay coherent on desktop", async ({ page }) => {
  test.setTimeout(180_000);
  await capturePerimeterView(page);
  await expect(page.locator(".game-canvas canvas")).toHaveScreenshot(
    "r100-perimeter-shadows-desktop.png",
    { animations: "disabled", maxDiffPixelRatio: 0.01 },
  );
});

test.describe("mobile WebGL emulation", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  test("R100 perimeter shadows stay coherent on a mobile viewport", async ({ page }) => {
    await capturePerimeterView(page);
    await expect(page.locator(".game-canvas canvas")).toHaveScreenshot(
      "r100-perimeter-shadows-mobile.png",
      { animations: "disabled", maxDiffPixelRatio: 0.01 },
    );
  });
});

async function capturePerimeterView(page: Page) {
  await openStartScreen(page);
  await startGame(page);
  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(0, 90);
    game.placeRunner("pink", -30, 0);
    game.placeRunner("purple", -15, 0);
    game.placeRunner("orange", 15, 0);
    game.placeRunner("green", 30, 0);
    game.placeRunner("yellow", 0, -30);
  });
  await page.waitForFunction(() => {
    const game = window.__CATCHY_E2E__!;
    const camera = game.getRenderedCamera();
    const player = game.getPlayer();
    return camera !== null && Math.hypot(camera.x - player.x, camera.z - player.z) < 25;
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let previous: { x: number; y: number; z: number } | null = null;
        let stableFrames = 0;
        const check = () => {
          const camera = window.__CATCHY_E2E__!.getRenderedCamera();
          if (!camera) {
            requestAnimationFrame(check);
            return;
          }
          const stable =
            previous !== null &&
            Math.hypot(camera.x - previous.x, camera.y - previous.y, camera.z - previous.z) < 0.002;
          stableFrames = stable ? stableFrames + 1 : 0;
          previous = camera;
          if (stableFrames >= 12) resolve();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
}
