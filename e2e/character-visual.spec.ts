import { expect, test } from "@playwright/test";
import { openStartScreen, startGame } from "./helpers";

test("R100 chibi characters stay readable in representative gameplay views", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openStartScreen(page);
  await startGame(page);
  expect(await page.evaluate(() => window.__CATCHY_E2E__!.getActiveMap().arenaRadius)).toBe(100);

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(20, 20);
    game.placeRunner("pink", 24, 18);
    game.placeRunner("purple", 27, 22);
    game.placeRunner("orange", 24, 26);
    game.placeRunner("green", 18, 27);
    game.placeRunner("yellow", 15, 22);
  });
  await waitForCameraToReachPlayer(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: testInfo.outputPath("view-a-six-characters-r100.png") });

  const playerBeforeRun = await page.evaluate(() => window.__CATCHY_E2E__!.getPlayer());
  await page.keyboard.down("w");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(450));
  await page.keyboard.up("w");
  const playerAfterRun = await page.evaluate(() => window.__CATCHY_E2E__!.getPlayer());
  expect(
    Math.hypot(playerAfterRun.x - playerBeforeRun.x, playerAfterRun.z - playerBeforeRun.z),
  ).toBeGreaterThan(1);
  await page.waitForTimeout(200);
  await page.screenshot({ path: testInfo.outputPath("view-b-player-running-r100.png") });

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placePlayer(20, 20);
    game.placeRunner("pink", 29, 20);
  });
  await waitForCameraToReachPlayer(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: testInfo.outputPath("view-c-runner-medium-distance.png") });

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placePlayer(-49, -43.8);
  });
  await waitForCameraToReachPlayer(page);
  await page.keyboard.down("Space");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(130));
  await page.keyboard.up("Space");
  expect(await page.evaluate(() => window.__CATCHY_E2E__!.getPlayer().jumpHeight)).toBeGreaterThan(
    0,
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: testInfo.outputPath("view-d-jump-by-ruin-wall.png") });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placePlayer(20, 20);
    game.placeRunner("pink", 24, 18);
    game.placeRunner("purple", 27, 22);
    game.placeRunner("orange", 24, 26);
    game.placeRunner("green", 18, 27);
    game.placeRunner("yellow", 15, 22);
  });
  await waitForCameraToReachPlayer(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: testInfo.outputPath("view-e-mobile-gameplay.png") });

  expect(pageErrors).toEqual([]);
});

async function waitForCameraToReachPlayer(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const game = window.__CATCHY_E2E__;
      const camera = game?.getRenderedCamera();
      if (!game || !camera) return false;
      const player = game.getPlayer();
      return Math.hypot(camera.x - player.x, camera.z - player.z) < 25;
    },
    undefined,
    { timeout: 30_000 },
  );
}
