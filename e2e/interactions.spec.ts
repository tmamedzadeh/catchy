import { expect, test } from "@playwright/test";
import { openStartScreen, readPlayer, readWorld, startGame } from "./helpers";

async function moveRunnersAway(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.placeRunner("pink", 0, -22);
    game.placeRunner("purple", 17, 14);
    game.placeRunner("orange", -14, 18);
  });
}

test("Speed Pad, Slow Zone, Dash Bounce, barrier cycling, and event debouncing work in Chromium", async ({
  page,
}) => {
  await openStartScreen(page);
  await startGame(page);
  await moveRunnersAway(page);

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.placePlayer(-16, 12);
    game.step(17);
  });
  let state = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  expect(state.interactionCueKind).toBe("speedPad");
  expect(state.interactionCueId).toBe(1);
  expect(state.boostEffectActive).toBe(true);
  expect(state.speedBoostStatus).toBe("ready");
  expect((await readPlayer(page)).boostEffectRemaining as number).toBeGreaterThan(4.9);
  await expect(page.locator(".speed-boost-control")).toBeHidden();
  await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
  state = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  expect(state.interactionCueId).toBe(1);

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placePlayer(-16, 12);
    game.activateBoost();
    game.step(17);
    game.placePlayer(-10, 12);
    game.step(17);
    game.step(5_100);
    game.placePlayer(-16, 12);
    game.step(17);
  });
  state = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  const padDuringCooldown = await readPlayer(page);
  expect(state.interactionCueKind).toBe("speedPad");
  expect(state.interactionCueId).toBe(1);
  expect(padDuringCooldown.boostEffectRemaining as number).toBeGreaterThan(4.8);
  expect(padDuringCooldown.boostState).toBe("cooldown");

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placePlayer(5, -20);
    game.step(17);
  });
  state = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  expect(state.interactionCueKind).toBe("slowZone");
  expect((await readPlayer(page)).slowMultiplier).toBe(0.55);
  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.placePlayer(10, -20);
    game.step(2_500);
  });
  expect((await readPlayer(page)).slowMultiplier).toBe(1);

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placePlayer(-16.4, 3);
    game.activateDash();
    game.step(200);
  });
  state = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  expect(state.interactionCueKind).toBe("elasticBounce");
  expect((await readWorld(page)).bounceImpactId).toBeGreaterThan(0);
  expect((await readPlayer(page)).vx as number).toBeGreaterThan(0);

  await page.evaluate(() => window.__CATCHY_E2E__!.reset());
  expect((await readWorld(page)).barrierClosed).toBe(false);
  await page.evaluate(() => window.__CATCHY_E2E__!.step(5_100));
  expect((await readWorld(page)).barrierClosed).toBe(true);
  await page.evaluate(() => window.__CATCHY_E2E__!.step(5_100));
  expect((await readWorld(page)).barrierClosed).toBe(false);
});
