import { expect, test } from "@playwright/test";
import { openStartScreen, readPlayer, readWorld, startGame } from "./helpers";

test.describe("landscape coarse-pointer controls", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  test("left stick moves only, gameplay drag controls camera, and buttons stay reachable", async ({
    page,
  }) => {
    await openStartScreen(page);
    await expect(page.getByRole("button", { name: "How to install" })).toBeVisible();
    await startGame(page);

    const movementStick = page.getByRole("group", { name: "Movement joystick" });
    await expect(movementStick).toBeVisible();
    await expect(page.getByRole("group", { name: "Camera joystick" })).toHaveCount(0);
    const dashButton = page.getByRole("button", { name: "Dash", exact: true });
    const jumpButton = page.getByRole("button", { name: "Jump", exact: true });
    const boostButton = page.getByRole("button", { name: "Speed boost ready" });
    await expect(dashButton).toBeEnabled();
    await expect(jumpButton).toBeEnabled();
    await expect(boostButton).toBeEnabled();
    const [dashBounds, jumpBounds, boostBounds, cameraBounds] = await Promise.all([
      dashButton.boundingBox(),
      jumpButton.boundingBox(),
      boostButton.boundingBox(),
      page.locator(".camera-surface").boundingBox(),
    ]);
    expect(dashBounds).not.toBeNull();
    expect(jumpBounds).not.toBeNull();
    expect(boostBounds).not.toBeNull();
    expect(cameraBounds).not.toBeNull();
    expect(jumpBounds!.width).toBeCloseTo(dashBounds!.width, 5);
    expect(jumpBounds!.height).toBeCloseTo(dashBounds!.height, 5);
    expect(dashBounds!.x).toBeLessThan(jumpBounds!.x);
    expect(jumpBounds!.x + jumpBounds!.width).toBeLessThanOrEqual(844);
    expect(boostBounds!.y + boostBounds!.height).toBeLessThanOrEqual(dashBounds!.y);
    const movementBounds = await movementStick.boundingBox();
    expect(movementBounds).not.toBeNull();
    expect(cameraBounds!.width).toBeGreaterThan(movementBounds!.width);
    expect(cameraBounds!.height).toBeGreaterThan(movementBounds!.height);
    expect(boostBounds!.y + boostBounds!.height / 2).toBeLessThan(
      dashBounds!.y + dashBounds!.height / 2,
    );
    expect(dashBounds!.x).toBeGreaterThanOrEqual(0);
    expect(dashBounds!.x + dashBounds!.width).toBeLessThanOrEqual(844);
    expect(dashBounds!.y + dashBounds!.height).toBeLessThanOrEqual(390);

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.placePlayer(0, 14);
    });
    const start = await readPlayer(page);
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
    await page.mouse.up();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(50));
    const afterCenterTap = await readPlayer(page);
    expect(afterCenterTap.jumpActivationId).toBe(0);
    expect(afterCenterTap.jumpHeight).toBe(0);
    expect((await readWorld(page)).cameraYaw).toBeDefined();

    await jumpButton.click();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(50));
    const afterJumpButton = await readPlayer(page);
    expect(afterJumpButton.jumpActivationId).toBe(1);
    expect(afterJumpButton.jumpHeight).toBeGreaterThan(0);

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
    });
    await page.mouse.move(cameraX, cameraY);
    await page.mouse.down();
    await page.mouse.move(cameraX + cameraBounds!.width * 0.4, cameraY, { steps: 3 });
    await page.evaluate(() => window.__CATCHY_E2E__!.step(200));
    const afterCenterDragYaw = (await readWorld(page)).cameraYaw as number;
    expect(Math.abs(afterCenterDragYaw)).toBeGreaterThan(0.1);
    expect((await readPlayer(page)).jumpActivationId).toBe(0);
    expect(await page.evaluate(() => window.__CATCHY_E2E__!.getCameraMode())).toBe("normal");
    await page.mouse.up();

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
    });
    const nearCenterX = cameraX + cameraBounds!.width * 0.1;
    await page.mouse.move(nearCenterX, cameraY);
    await page.mouse.down();
    await page.mouse.move(nearCenterX + 26, cameraY, { steps: 2 });
    await page.evaluate(() => window.__CATCHY_E2E__!.step(120));
    await page.mouse.up();
    expect((await readPlayer(page)).jumpActivationId).toBe(0);
    expect(Math.abs((await readWorld(page)).cameraYaw as number)).toBeGreaterThan(0.1);

    for (const stick of [movementStick]) {
      const bounds = await stick.boundingBox();
      expect(bounds).not.toBeNull();
      const centerX = bounds!.x + bounds!.width / 2;
      const centerY = bounds!.y + bounds!.height / 2;
      const knob = stick.getByTestId("joystick-knob");
      const horizontalTravel: number[] = [];
      const verticalTravel: number[] = [];
      const axes: Array<[number, number, number[]]> = [
        [-1, 0, horizontalTravel],
        [1, 0, horizontalTravel],
        [0, -1, verticalTravel],
        [0, 1, verticalTravel],
      ];
      for (const [dx, dy, travel] of axes) {
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.mouse.move(centerX + dx * bounds!.width, centerY + dy * bounds!.height);
        const knobBounds = await knob.boundingBox();
        expect(knobBounds).not.toBeNull();
        travel.push(
          Math.hypot(
            knobBounds!.x + knobBounds!.width / 2 - centerX,
            knobBounds!.y + knobBounds!.height / 2 - centerY,
          ),
        );
        await page.mouse.up();
        const centered = await knob.boundingBox();
        expect(centered).not.toBeNull();
        expect(centered!.x + centered!.width / 2).toBeCloseTo(centerX, 0);
        expect(centered!.y + centered!.height / 2).toBeCloseTo(centerY, 0);
      }
      // Maximum travel is symmetric and radially clamped: identical in every
      // cardinal direction, and a corner drag never exceeds that same radius.
      expect(horizontalTravel[0]).toBeCloseTo(horizontalTravel[1]!, 0);
      expect(verticalTravel[0]).toBeCloseTo(verticalTravel[1]!, 0);
      expect(horizontalTravel[0]).toBeCloseTo(verticalTravel[0]!, 0);
      const maxTravelRadius = horizontalTravel[0]!;
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + bounds!.width, centerY + bounds!.height);
      const diagonal = await knob.boundingBox();
      expect(diagonal).not.toBeNull();
      const diagonalRadius = Math.hypot(
        diagonal!.x + diagonal!.width / 2 - centerX,
        diagonal!.y + diagonal!.height / 2 - centerY,
      );
      expect(diagonalRadius).toBeLessThanOrEqual(maxTravelRadius + 0.5);
      await page.mouse.up();
    }

    await page.evaluate(() => window.__CATCHY_E2E__!.turnCamera(1));
    const headingBeforeRecenter = (await readPlayer(page)).heading as number;
    const yawBeforeRecenter = (await readWorld(page)).cameraYaw as number;
    await page.mouse.move(cameraX, cameraY);
    await page.mouse.down();
    await page.mouse.move(cameraX, cameraY - cameraBounds!.height * 0.42, { steps: 3 });
    await page.evaluate(() => window.__CATCHY_E2E__!.step(350));
    await page.mouse.up();
    const headingAfterRecenter = (await readPlayer(page)).heading as number;
    const yawAfterRecenter = (await readWorld(page)).cameraYaw as number;
    const distanceBeforeRecenter = Math.abs(headingBeforeRecenter - yawBeforeRecenter);
    const distanceAfterRecenter = Math.abs(headingAfterRecenter - yawAfterRecenter);
    expect(distanceAfterRecenter).toBeLessThan(distanceBeforeRecenter);

    await page.mouse.move(cameraX, cameraY);
    await page.mouse.down();
    await page.mouse.move(cameraX, cameraY + cameraBounds!.height * 0.12, { steps: 3 });
    await page.mouse.up();
    expect((await readWorld(page)).cameraYaw).toBeDefined();

    await dashButton.click();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
    await expect.poll(async () => (await readPlayer(page)).dashState).toBe("active");
    await boostButton.click();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
    await expect.poll(async () => (await readPlayer(page)).boostState).toBe("active");
  });
});
