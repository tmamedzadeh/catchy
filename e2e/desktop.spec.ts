import { expect, test } from "@playwright/test";
import { openStartScreen, readPlayer, readWorld, startGame } from "./helpers";

test("start screen, compact HUD, manifest, and production-only UI gates", async ({ page }) => {
  await openStartScreen(page);
  await expect(page.getByText("Install Catchy for the best fullscreen experience")).toBeVisible();
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("fullscreen");
  expect(manifest.orientation).toBe("landscape");

  await startGame(page);
  const status = page.getByRole("group", { name: "Game status" });
  await expect(status.getByRole("region", { name: "Caught score" })).toContainText("00");
  await expect(status.getByRole("region", { name: "Round time" })).toContainText("05:00");
  await expect(
    status.getByRole("region", { name: /No target|Target direction and distance/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Speed boost ready" })).toBeEnabled();
  await expect(page.getByText("Camera tuning", { exact: true })).toHaveCount(0);
  await expect(page.locator(".game-canvas canvas")).toBeVisible();
});

test("desktop movement, camera holds, Dash, and Speed Boost use the approved keys", async ({
  page,
}) => {
  await openStartScreen(page);
  await startGame(page);

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(0, 15);
  });
  const initial = await readPlayer(page);
  await page.keyboard.down("w");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
  await page.keyboard.up("w");
  const moved = await readPlayer(page);
  expect(moved.z).toBeGreaterThan(initial.z);
  expect(Math.abs(moved.heading as number)).toBeLessThan(0.2);

  const otherDirections = [
    { key: "s", axis: "z", direction: -1, heading: Math.PI },
    { key: "a", axis: "x", direction: 1, heading: Math.PI / 2 },
    { key: "d", axis: "x", direction: -1, heading: -Math.PI / 2 },
  ] as const;
  for (const control of otherDirections) {
    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
      game.placePlayer(0, 15);
    });
    const before = await readPlayer(page);
    await page.keyboard.down(control.key);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
    await page.keyboard.up(control.key);
    const after = await readPlayer(page);
    const delta = after[control.axis] - before[control.axis];
    expect(delta * control.direction).toBeGreaterThan(0);
    const headingError = Math.atan2(
      Math.sin(after.heading - control.heading),
      Math.cos(after.heading - control.heading),
    );
    expect(Math.abs(headingError)).toBeLessThan(0.2);
  }

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(0, 15);
  });
  const beforeSpace = await readPlayer(page);
  await page.keyboard.down("Space");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(100));
  await page.keyboard.up("Space");
  const afterSpace = await readPlayer(page);
  expect(afterSpace.x).toBe(beforeSpace.x);
  expect(afterSpace.z).toBe(beforeSpace.z);
  expect(afterSpace.dashState).toBe("ready");
  expect(afterSpace.boostState).toBe("ready");

  await page.keyboard.down("ArrowLeft");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
  await page.keyboard.up("ArrowLeft");
  const leftYaw = (await readWorld(page)).cameraYaw as number;
  expect(leftYaw).toBeGreaterThan(0.3);
  await page.keyboard.down("ArrowRight");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
  await page.keyboard.up("ArrowRight");
  expect((await readWorld(page)).cameraYaw as number).toBeLessThan(leftYaw);

  await page.evaluate(() => window.__CATCHY_E2E__!.turnCamera(1.4));
  const headingAtRecenter = (await readPlayer(page)).heading as number;
  const yawBeforeRecenter = (await readWorld(page)).cameraYaw as number;
  await page.keyboard.down("ArrowUp");
  expect(await page.evaluate(() => window.__CATCHY_E2E__!.getCameraMode())).toBe("recenter");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(350));
  await page.keyboard.up("ArrowUp");
  const headingAfterRecenter = (await readPlayer(page)).heading as number;
  const yawAfterRecenter = (await readWorld(page)).cameraYaw as number;
  const errorBeforeRecenter = Math.atan2(
    Math.sin(yawBeforeRecenter - headingAtRecenter),
    Math.cos(yawBeforeRecenter - headingAtRecenter),
  );
  const errorAfterRecenter = Math.atan2(
    Math.sin(yawAfterRecenter - headingAfterRecenter),
    Math.cos(yawAfterRecenter - headingAfterRecenter),
  );
  expect(headingAfterRecenter).toBe(headingAtRecenter);
  expect(Math.abs(errorAfterRecenter)).toBeLessThan(Math.abs(errorBeforeRecenter));
  await page.keyboard.down("ArrowDown");
  expect(await page.evaluate(() => window.__CATCHY_E2E__!.getCameraMode())).toBe("tactical");
  await page.keyboard.up("ArrowDown");
  expect(await page.evaluate(() => window.__CATCHY_E2E__!.getCameraMode())).toBe("normal");

  await page.keyboard.down("Shift");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(50));
  await page.keyboard.up("Shift");
  expect((await readPlayer(page)).dashState).toBe("active");
  await page.keyboard.down("e");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(50));
  await page.keyboard.up("e");
  expect((await readPlayer(page)).boostState).toBe("active");
});

test("capture, delayed respawn, round end, and restart run through the UI", async ({ page }) => {
  await openStartScreen(page);
  await startGame(page);
  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.placePlayer(0, 0);
    game.placeRunner("pink", 1, 0);
    game.placeRunner("purple", 14, 12);
    game.placeRunner("orange", -14, 10);
    game.step(17);
  });
  const captured = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  expect(captured.state).toBe("capture");
  expect(captured.caught).toBe(1);
  expect(captured.capture).toMatchObject({ runnerId: "pink" });

  await page.evaluate(() => window.__CATCHY_E2E__!.step(1_200));
  await expect(page.getByRole("region", { name: "Round time" })).toContainText("04:59");
  const respawned = await page.evaluate(() => window.__CATCHY_E2E__!.getRunners());
  expect(respawned.find((runner) => runner.id === "pink")?.respawns).toBe(1);

  await page.evaluate(() => window.__CATCHY_E2E__!.endRound());
  await expect(page.getByText("Round over")).toBeVisible();
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.getByRole("group", { name: "Game status" })).toBeVisible();
  const restarted = await page.evaluate(() => window.__CATCHY_E2E__!.getState());
  expect(restarted.caught).toBe(0);
  expect(restarted.state).toBe("chase");
});

test("fullscreen and orientation failures never block Play", async ({ page }) => {
  await openStartScreen(page);
  await page.getByRole("button", { name: "PLAY" }).click();
  await expect(page.locator(".game-canvas canvas")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__CATCHY_E2E__));
  expect(await page.evaluate(() => window.__catchyFullscreenRequests)).toBe(1);
  await expect(page.getByRole("group", { name: "Game status" })).toBeVisible();
});
