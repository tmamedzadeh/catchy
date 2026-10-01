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
  await expect(status.getByText("Caught", { exact: true })).toBeVisible();
  await expect(status.getByText("Time", { exact: true })).toBeVisible();
  await expect(status.getByText("Target", { exact: true })).toBeVisible();
  await expect(
    status.getByRole("region", { name: /No target|Target direction and distance/ }),
  ).toBeVisible();
  const [brandBounds, statusBounds] = await Promise.all([
    page.locator(".hud-brand .hud-card").boundingBox(),
    status.boundingBox(),
  ]);
  expect(brandBounds).not.toBeNull();
  expect(statusBounds).not.toBeNull();
  expect(Math.abs(brandBounds!.height - statusBounds!.height)).toBeLessThanOrEqual(2);
  expect(await status.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Speed Up ready" })).toBeEnabled();
  await expect(page.getByText("Camera tuning", { exact: true })).toHaveCount(0);
  await expect(page.locator(".game-canvas canvas")).toBeVisible();
});

test("desktop movement, camera holds, Jump, Dash, and Speed Boost use the approved keys", async ({
  page,
}) => {
  await openStartScreen(page);
  await startGame(page);

  const directions = [
    { key: "w", name: "W", x: 0, z: 1 },
    { key: "s", name: "S", x: 0, z: -1 },
    { key: "a", name: "A", x: -1, z: 0 },
    { key: "d", name: "D", x: 1, z: 0 },
  ] as const;
  for (const control of directions) {
    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
      game.placePlayer(-4, 12);
    });
    const before = await readPlayer(page);
    await page.keyboard.down(control.key);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(900));
    await page.keyboard.up(control.key);
    const after = await readPlayer(page);
    const dx = (after.x as number) - (before.x as number);
    const dz = (after.z as number) - (before.z as number);
    expect(
      dx * control.x + dz * control.z,
      `${control.name} must move in its world direction`,
    ).toBeGreaterThan(6);
    expect(
      Math.abs(dx * control.z - dz * control.x),
      `${control.name} must not orbit`,
    ).toBeLessThan(0.8);
    expect(Math.hypot(dx, dz), `${control.name} must change player position`).toBeGreaterThan(6);
    const movementHeading = Math.atan2(after.vx as number, after.vz as number);
    const headingError = Math.atan2(
      Math.sin((after.heading as number) - movementHeading),
      Math.cos((after.heading as number) - movementHeading),
    );
    expect(Math.abs(headingError)).toBeLessThan(0.4);
  }

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(0, 15);
  });
  await page.keyboard.down("Space");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(100));
  const firstJumpTick = await readPlayer(page);
  expect(firstJumpTick.jumpHeight).toBeGreaterThan(0);
  expect(firstJumpTick.jumpActivationId).toBe(1);
  await page.evaluate(() => window.__CATCHY_E2E__!.step(700));
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "Space",
        key: " ",
        repeat: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    window.__CATCHY_E2E__!.step(100);
  });
  await page.keyboard.up("Space");
  const afterHeldSpace = await readPlayer(page);
  expect(afterHeldSpace.jumpActivationId).toBe(1);
  expect(afterHeldSpace.jumpHeight).toBe(0);
  expect(afterHeldSpace.dashState).toBe("ready");
  expect(afterHeldSpace.boostState).toBe("ready");

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

test("mouse drag changes the rendered camera direction while A/D and side arrows do not", async ({
  page,
}) => {
  await openStartScreen(page);
  await startGame(page);
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getRenderedCamera() !== null);
  const surface = page.locator(".camera-surface");
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2;

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
  });
  await page.waitForFunction(() => {
    const camera = window.__CATCHY_E2E__!.getRenderedCamera();
    return camera !== null && Math.abs(camera.forwardX) < 0.04;
  });
  const leftStart = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 72, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getWorld().cameraYaw < -0.2);
  await page.waitForTimeout(100);
  const afterLeft = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  expect(afterLeft.forwardX).toBeLessThan(leftStart.forwardX - 0.08);

  await page.evaluate(() => window.__CATCHY_E2E__!.turnCamera(0));
  await page.waitForFunction(() => {
    const camera = window.__CATCHY_E2E__!.getRenderedCamera();
    return camera !== null && Math.abs(camera.forwardX) < 0.04;
  });
  const rightStart = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 72, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getWorld().cameraYaw > 0.2);
  await page.waitForTimeout(100);
  const afterRight = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  expect(afterRight.forwardX).toBeGreaterThan(rightStart.forwardX + 0.08);

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
  });
  await page.waitForFunction(() => {
    const camera = window.__CATCHY_E2E__!.getRenderedCamera();
    return camera !== null && Math.abs(camera.forwardY + Math.sin((27 * Math.PI) / 180)) < 0.08;
  });
  const verticalStart = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 48, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getWorld().cameraPitch < -1);
  await page.waitForTimeout(120);
  const afterUp = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  expect(afterUp.forwardY).toBeGreaterThan(verticalStart.forwardY + 0.02);

  await page.evaluate(() => window.__CATCHY_E2E__!.turnCamera(0));
  await page.waitForFunction(() => Math.abs(window.__CATCHY_E2E__!.getWorld().cameraPitch) < 0.1);
  await page.waitForTimeout(150);
  const verticalReset = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 48, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getWorld().cameraPitch > 1);
  await page.waitForTimeout(120);
  const afterDown = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  expect(afterDown.forwardY).toBeLessThan(verticalReset.forwardY - 0.02);

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(-4, 12);
  });
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getRenderedCamera() !== null);
  const cameraBeforeFollow = (await page.evaluate(() =>
    window.__CATCHY_E2E__!.getRenderedCamera(),
  ))!;
  await page.evaluate(() => window.__CATCHY_E2E__!.placePlayer(-1, 12));
  await page.waitForFunction(
    (startX) => window.__CATCHY_E2E__!.getRenderedCamera()!.x > startX + 2,
    cameraBeforeFollow.x,
  );

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(-4, 12);
  });
  for (const key of ["a", "d", "ArrowLeft", "ArrowRight"]) {
    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
      game.placePlayer(-4, 12);
    });
    const yawBeforeKeys = (await readWorld(page)).cameraYaw as number;
    await page.keyboard.down(key);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(250));
    await page.keyboard.up(key);
    expect((await readWorld(page)).cameraYaw as number).toBeCloseTo(yawBeforeKeys, 3);
  }
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
