import { expect, test } from "@playwright/test";
import { DEFAULT_MAP } from "../src/lib/catchy/maps/defaultMap";
import { openStartScreen, readPlayer, readWorld, startGame } from "./helpers";

const speedPad = DEFAULT_MAP.interactiveObjects.find((item) => item.kind === "speedPad")!;
const slowZone = DEFAULT_MAP.interactiveObjects.find((item) => item.kind === "slowZone")!;
const bounce = DEFAULT_MAP.interactiveObjects.find((item) => item.kind === "elasticBounce")!;

async function moveRunnersAway(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.placeRunner("pink", 0, -82);
    game.placeRunner("purple", 78, 25);
    game.placeRunner("orange", -70, 45);
    game.placeRunner("green", 40, 73);
    game.placeRunner("yellow", -40, -70);
  });
}

test("Speed Pad, Slow Zone, Dash Bounce, barrier cycling, and event debouncing work in Chromium", async ({
  page,
}) => {
  await openStartScreen(page);
  await startGame(page);
  await moveRunnersAway(page);

  await page.evaluate((position) => {
    const game = window.__CATCHY_E2E__!;
    game.placePlayer(position.x, position.z);
    game.step(17);
  }, speedPad.position);
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

  await page.evaluate((pad) => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placeRunner("pink", 0, -82);
    game.placeRunner("purple", 78, 25);
    game.placeRunner("orange", -70, 45);
    game.placeRunner("green", 40, 73);
    game.placeRunner("yellow", -40, -70);
    game.placePlayer(pad.position.x, pad.position.z);
    game.activateBoost();
    game.step(17);
    game.placePlayer(pad.position.x + (pad.triggerRadius ?? 2) + 2, pad.position.z);
    game.step(17);
    game.step(5_100);
    game.placePlayer(pad.position.x, pad.position.z);
    game.step(17);
  }, speedPad);
  state = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  const padDuringCooldown = await readPlayer(page);
  expect(state.interactionCueKind).toBe("speedPad");
  expect(state.interactionCueId).toBe(1);
  expect(padDuringCooldown.boostEffectRemaining as number).toBeGreaterThan(4.8);
  expect(padDuringCooldown.boostState).toBe("cooldown");

  await page.evaluate((zone) => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placeRunner("pink", 0, -82);
    game.placeRunner("purple", 78, 25);
    game.placeRunner("orange", -70, 45);
    game.placeRunner("green", 40, 73);
    game.placeRunner("yellow", -40, -70);
    game.placePlayer(zone.position.x, zone.position.z);
    game.step(17);
  }, slowZone);
  state = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  expect(state.interactionCueKind).toBe("slowZone");
  expect((await readPlayer(page)).slowMultiplier).toBe(0.55);
  await page.evaluate((zone) => {
    const game = window.__CATCHY_E2E__!;
    game.placePlayer(zone.position.x + (zone.triggerRadius ?? 3) + 2, zone.position.z);
    game.step(2_500);
  }, slowZone);
  expect((await readPlayer(page)).slowMultiplier).toBe(1);

  await page.evaluate((bounceObject) => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    const player = game.getPlayer();
    const radius =
      bounceObject.collision.type === "circle"
        ? bounceObject.collision.radius * bounceObject.scale
        : 1;
    const dashX = Math.sin(player.heading);
    const dashZ = Math.cos(player.heading);
    const gap = radius + player.radius + 0.3;
    game.placeRunner("pink", 0, -82);
    game.placeRunner("purple", 78, 25);
    game.placeRunner("orange", -70, 45);
    game.placeRunner("green", 40, 73);
    game.placeRunner("yellow", -40, -70);
    game.placePlayer(bounceObject.position.x - dashX * gap, bounceObject.position.z - dashZ * gap);
    game.activateDash();
    game.step(200);
  }, bounce);
  state = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  expect(state.interactionCueKind).toBe("elasticBounce");
  expect((await readWorld(page)).bounceImpactId).toBeGreaterThan(0);
  expect((await readPlayer(page)).vx as number).toBeGreaterThan(0);

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placeRunner("pink", 0, -82);
    game.placeRunner("purple", 78, 25);
    game.placeRunner("orange", -70, 45);
    game.placeRunner("green", 40, 73);
    game.placeRunner("yellow", -40, -70);
  });
  expect((await readWorld(page)).barrierClosed).toBe(false);
  await page.evaluate(() => window.__CATCHY_E2E__!.step(5_100));
  expect((await readWorld(page)).barrierClosed).toBe(true);
  await page.evaluate(() => window.__CATCHY_E2E__!.step(5_100));
  expect((await readWorld(page)).barrierClosed).toBe(false);
});
