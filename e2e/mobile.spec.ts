import { expect, test } from "@playwright/test";
import { openStartScreen, readPlayer, readWorld, startGame } from "./helpers";

test.describe("landscape coarse-pointer controls", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  test("left stick moves only, right stick controls camera modes, and buttons stay reachable", async ({
    page,
  }) => {
    await openStartScreen(page);
    await expect(page.getByRole("button", { name: "How to install" })).toBeVisible();
    await startGame(page);

    const movementStick = page.getByRole("group", { name: "Movement joystick" });
    const cameraStick = page.getByRole("group", { name: "Camera joystick" });
    await expect(movementStick).toBeVisible();
    await expect(cameraStick).toBeVisible();
    const dashButton = page.getByRole("button", { name: "Dash", exact: true });
    const boostButton = page.getByRole("button", { name: "Speed boost ready" });
    await expect(dashButton).toBeEnabled();
    await expect(boostButton).toBeEnabled();
    const [dashBounds, boostBounds, cameraBounds] = await Promise.all([
      dashButton.boundingBox(),
      boostButton.boundingBox(),
      cameraStick.boundingBox(),
    ]);
    expect(dashBounds).not.toBeNull();
    expect(boostBounds).not.toBeNull();
    expect(cameraBounds).not.toBeNull();
    expect(boostBounds!.y + boostBounds!.height / 2).toBeLessThan(
      dashBounds!.y + dashBounds!.height / 2,
    );
    expect(dashBounds!.x).toBeGreaterThan(cameraBounds!.x);
    expect(dashBounds!.x + dashBounds!.width).toBeLessThanOrEqual(844);
    expect(dashBounds!.y + dashBounds!.height).toBeLessThanOrEqual(390);

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.placePlayer(0, 14);
    });
    const start = await readPlayer(page);
    const movementBounds = await movementStick.boundingBox();
    expect(movementBounds).not.toBeNull();
    const moveX = movementBounds!.x + movementBounds!.width / 2;
    const moveY = movementBounds!.y + movementBounds!.height / 2;
    await page.mouse.move(moveX, moveY);
    await page.mouse.down();
    await page.mouse.move(moveX, moveY);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(200));
    expect(await readPlayer(page)).toMatchObject({ x: start.x, z: start.z });
    await page.mouse.move(moveX, moveY - movementBounds!.height * 0.35, { steps: 4 });
    await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
    const moved = await readPlayer(page);
    expect(moved.z).toBeGreaterThan(start.z as number);
    await page.mouse.up();

    await page.evaluate(() => window.__CATCHY_E2E__!.turnCamera(0));
    const cameraX = cameraBounds!.x + cameraBounds!.width / 2;
    const cameraY = cameraBounds!.y + cameraBounds!.height / 2;
    await page.mouse.move(cameraX, cameraY);
    await page.mouse.down();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(200));
    expect((await readWorld(page)).cameraYaw as number).toBeCloseTo(0, 3);
    await page.mouse.move(cameraX + cameraBounds!.width * 0.4, cameraY, { steps: 3 });
    await page.evaluate(() => window.__CATCHY_E2E__!.step(200));
    expect((await readWorld(page)).cameraYaw as number).toBeGreaterThan(0.1);
    expect(await page.evaluate(() => window.__CATCHY_E2E__!.getCameraMode())).toBe("normal");
    await page.mouse.up();

    await page.evaluate(() => window.__CATCHY_E2E__!.turnCamera(1));
    const headingBeforeRecenter = (await readPlayer(page)).heading as number;
    const yawBeforeRecenter = (await readWorld(page)).cameraYaw as number;
    await page.mouse.move(cameraX, cameraY);
    await page.mouse.down();
    await page.mouse.move(cameraX, cameraY - cameraBounds!.height * 0.42, { steps: 3 });
    expect(await page.evaluate(() => window.__CATCHY_E2E__!.getCameraMode())).toBe("recenter");
    await page.evaluate(() => window.__CATCHY_E2E__!.step(350));
    await page.mouse.up();
    const headingAfterRecenter = (await readPlayer(page)).heading as number;
    const yawAfterRecenter = (await readWorld(page)).cameraYaw as number;
    const distanceBeforeRecenter = Math.abs(headingBeforeRecenter - yawBeforeRecenter);
    const distanceAfterRecenter = Math.abs(headingAfterRecenter - yawAfterRecenter);
    expect(distanceAfterRecenter).toBeLessThan(distanceBeforeRecenter);

    await page.mouse.move(cameraX, cameraY);
    await page.mouse.down();
    await page.mouse.move(cameraX, cameraY + cameraBounds!.height * 0.42, { steps: 3 });
    expect(await page.evaluate(() => window.__CATCHY_E2E__!.getCameraMode())).toBe("tactical");
    await page.mouse.up();
    expect(await page.evaluate(() => window.__CATCHY_E2E__!.getCameraMode())).toBe("normal");

    await dashButton.click();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
    await expect.poll(async () => (await readPlayer(page)).dashState).toBe("active");
    await boostButton.click();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
    await expect.poll(async () => (await readPlayer(page)).boostState).toBe("active");
  });
});
