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
  await expect(page.locator(".ability-controls")).toBeHidden();
  await expect(page.locator(".speed-boost-control")).toBeHidden();
  await expect(page.getByText("Camera tuning", { exact: true })).toHaveCount(0);
  await expect(page.locator(".game-canvas canvas")).toBeVisible();
});

test("desktop movement, camera holds, Jump, Dash, and Speed Boost use the approved keys", async ({
  page,
}) => {
  await openStartScreen(page);
  await startGame(page);

  const directions = [
    { key: "w", name: "W", axis: "forward", sign: 1 },
    { key: "s", name: "S", axis: "forward", sign: -1 },
    { key: "a", name: "A", axis: "right", sign: -1 },
    { key: "d", name: "D", axis: "right", sign: 1 },
  ] as const;
  for (const control of directions) {
    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
      game.placePlayer(-4, 12);
    });
    await page.waitForFunction(() => {
      const camera = window.__CATCHY_E2E__!.getRenderedCamera();
      return camera !== null && Math.abs(camera.forwardX) < 0.04 && camera.forwardZ > 0.9;
    });
    const renderedCamera = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
    const forwardLength = Math.hypot(renderedCamera.forwardX, renderedCamera.forwardZ);
    const cameraForward = {
      x: renderedCamera.forwardX / forwardLength,
      z: renderedCamera.forwardZ / forwardLength,
    };
    // Three.js screen-right is rendered camera-forward × world-up.
    const cameraRight = { x: -cameraForward.z, z: cameraForward.x };
    const before = await readPlayer(page);
    await page.keyboard.down(control.key);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(900));
    await page.keyboard.up(control.key);
    const after = await readPlayer(page);
    const dx = (after.x as number) - (before.x as number);
    const dz = (after.z as number) - (before.z as number);
    const expected = control.axis === "forward" ? cameraForward : cameraRight;
    const progress = (dx * expected.x + dz * expected.z) * control.sign;
    const crossTrack = Math.abs(dx * expected.z - dz * expected.x);
    expect(
      progress,
      `${control.name} must move in the rendered camera-relative direction`,
    ).toBeGreaterThan(6);
    expect(
      crossTrack,
      `${control.name} must move straight instead of orbiting as Follow turns`,
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

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
  });
  const yawBeforeKeys = (await readWorld(page)).cameraYaw as number;
  await page.keyboard.down("ArrowUp");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(120));
  await page.keyboard.up("ArrowUp");
  expect((await readWorld(page)).cameraPitch).toBeLessThan(0);
  const yawAfterUp = (await readWorld(page)).cameraYaw as number;
  expect(yawAfterUp).toBeCloseTo(yawBeforeKeys, 6);

  await page.keyboard.down("ArrowDown");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(240));
  await page.keyboard.up("ArrowDown");
  expect((await readWorld(page)).cameraPitch).toBeGreaterThan(0);

  await page.keyboard.down("ArrowLeft");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
  await page.keyboard.up("ArrowLeft");
  const yawAfterLeft = (await readWorld(page)).cameraYaw as number;
  expect(yawAfterLeft).toBeGreaterThan(yawBeforeKeys + 0.5);
  await page.evaluate(() => window.__CATCHY_E2E__!.step(100));
  expect((await readWorld(page)).cameraYaw).toBeCloseTo(yawAfterLeft, 6);

  await page.keyboard.down("ArrowRight");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
  await page.keyboard.up("ArrowRight");
  expect((await readWorld(page)).cameraYaw).toBeLessThan(yawAfterLeft - 0.5);

  await page.keyboard.down("Shift");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(50));
  await page.keyboard.up("Shift");
  expect((await readPlayer(page)).dashState).toBe("active");
  await page.keyboard.down("e");
  await page.evaluate(() => window.__CATCHY_E2E__!.step(50));
  await page.keyboard.up("e");
  expect((await readPlayer(page)).boostState).toBe("active");
});

test("mouse drag and arrows rotate the camera while WASD stays movement-only", async ({ page }) => {
  test.setTimeout(150_000);
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
  // The E2E build advances simulation only through this bridge; consume the
  // pointerup delta just as the next production fixed tick would.
  await page.evaluate(() => window.__CATCHY_E2E__!.step(40));
  await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getWorld().cameraYaw > 0.2);
  // Let the independently smoothed R3F camera publish this simulation step before sampling it.
  await page.waitForTimeout(500);
  await page.waitForFunction(
    (startX) => window.__CATCHY_E2E__!.getRenderedCamera()!.x < startX - 0.5,
    leftStart.x,
    { timeout: 10_000 },
  );
  const afterLeft = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  expect(afterLeft.x).toBeLessThan(leftStart.x - 0.5);
  const manuallySelectedYaw = (await readWorld(page)).cameraYaw as number;
  await page.evaluate(() => window.__CATCHY_E2E__!.step(3_000));
  expect((await readWorld(page)).cameraYaw).toBeCloseTo(manuallySelectedYaw, 6);

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
  await page.evaluate(() => window.__CATCHY_E2E__!.step(40));
  await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getWorld().cameraYaw < -0.2);
  await page.waitForTimeout(500);
  await page.waitForFunction(
    (startX) => window.__CATCHY_E2E__!.getRenderedCamera()!.x > startX + 0.5,
    rightStart.x,
    { timeout: 10_000 },
  );
  const afterRight = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
  expect(afterRight.x).toBeGreaterThan(rightStart.x + 0.5);

  const verticalStartForwardY = (await page.evaluate(() =>
    window.__CATCHY_E2E__!.getRenderedCamera(),
  ))!.forwardY;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 96, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => window.__CATCHY_E2E__!.step(40));
  await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getWorld().cameraPitch < -1);
  await page.waitForTimeout(500);
  await expect
    .poll(
      () =>
        page.evaluate((initialForwardY) => {
          const game = window.__CATCHY_E2E__!;
          const camera = game.getRenderedCamera()!;
          return {
            movedInExpectedDirection: camera.forwardY > initialForwardY + 0.02,
            cameraPitch: game.getWorld().cameraPitch,
            forwardY: camera.forwardY,
          };
        }, verticalStartForwardY),
      { timeout: 5_000 },
    )
    .toMatchObject({ movedInExpectedDirection: true });

  await page.mouse.move(x, y - 96);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => window.__CATCHY_E2E__!.step(40));
  await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
  await expect
    .poll(() => page.evaluate(() => Math.abs(window.__CATCHY_E2E__!.getWorld().cameraPitch)), {
      timeout: 5_000,
    })
    .toBeLessThan(0.1);
  await expect
    .poll(
      () =>
        page.evaluate(
          (startY) => Math.abs(window.__CATCHY_E2E__!.getRenderedCamera()!.forwardY - startY),
          verticalStartForwardY,
        ),
      { timeout: 10_000 },
    )
    .toBeLessThan(0.01);
  const verticalResetForwardY = (await page.evaluate(() =>
    window.__CATCHY_E2E__!.getRenderedCamera(),
  ))!.forwardY;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 96, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => window.__CATCHY_E2E__!.step(40));
  await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getWorld().cameraPitch > 1);
  await page.waitForTimeout(500);
  await expect
    .poll(
      () =>
        page.evaluate((initialForwardY) => {
          const game = window.__CATCHY_E2E__!;
          const camera = game.getRenderedCamera()!;
          return {
            movedInExpectedDirection: camera.forwardY < initialForwardY - 0.02,
            cameraPitch: game.getWorld().cameraPitch,
            forwardY: camera.forwardY,
          };
        }, verticalResetForwardY),
      { timeout: 5_000 },
    )
    .toMatchObject({ movedInExpectedDirection: true });

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(-4, 12);
  });
  await page.waitForFunction(() => window.__CATCHY_E2E__!.getRenderedCamera() !== null);
  await page.waitForFunction(() => {
    const camera = window.__CATCHY_E2E__!.getRenderedCamera();
    return camera !== null && Math.abs(camera.x + 4) < 0.75 && Math.abs(camera.forwardX) < 0.04;
  });
  const cameraBeforeFollow = (await page.evaluate(() =>
    window.__CATCHY_E2E__!.getRenderedCamera(),
  ))!;
  await page.evaluate(() => window.__CATCHY_E2E__!.placePlayer(-1, 12));
  await page.waitForFunction(
    (startX) => window.__CATCHY_E2E__!.getRenderedCamera()!.x > startX + 2,
    cameraBeforeFollow.x,
    { timeout: 10_000 },
  );

  await page.evaluate(() => {
    const game = window.__CATCHY_E2E__!;
    game.reset();
    game.turnCamera(0);
    game.placePlayer(-4, 12);
  });
  for (const key of ["a", "d"]) {
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
  await page.getByRole("button", { name: "START" }).click();
  await expect(page.locator(".game-canvas canvas")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__CATCHY_E2E__));
  expect(await page.evaluate(() => window.__catchyFullscreenRequests)).toBe(1);
  await expect(page.getByRole("group", { name: "Game status" })).toBeVisible();
});
