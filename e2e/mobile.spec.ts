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
    await expect(page.locator(".touch-stick:visible")).toHaveCount(1);
    const dashButton = page.getByRole("button", { name: "Dash", exact: true });
    const jumpButton = page.getByRole("button", { name: "Jump", exact: true });
    const boostButton = page.getByRole("button", { name: "Speed Up ready" });
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
    expect(boostBounds!.y + boostBounds!.height).toBeLessThan(jumpBounds!.y);
    expect(boostBounds!.x + boostBounds!.width).toBeCloseTo(jumpBounds!.x + jumpBounds!.width, 0);
    const movementBounds = await movementStick.boundingBox();
    expect(movementBounds).not.toBeNull();
    expect(cameraBounds!.width).toBeGreaterThan(movementBounds!.width);
    expect(cameraBounds!.height).toBeGreaterThan(movementBounds!.height);
    const actionPairCenterX =
      (dashBounds!.x + dashBounds!.width / 2 + jumpBounds!.x + jumpBounds!.width / 2) / 2;
    expect(boostBounds!.x + boostBounds!.width / 2).toBeGreaterThan(actionPairCenterX);
    expect(dashBounds!.x).toBeGreaterThanOrEqual(0);
    expect(dashBounds!.x + dashBounds!.width).toBeLessThanOrEqual(844);
    expect(dashBounds!.y + dashBounds!.height).toBeLessThanOrEqual(390);
    const status = page.getByRole("group", { name: "Game status" });
    await expect(status.getByText("Caught", { exact: true })).toBeVisible();
    await expect(status.getByText("Time", { exact: true })).toBeVisible();
    await expect(status.getByText("Target", { exact: true })).toBeVisible();
    expect(await status.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const [brandBounds, statusBounds] = await Promise.all([
      page.locator(".hud-brand .hud-card").boundingBox(),
      status.boundingBox(),
    ]);
    expect(brandBounds).not.toBeNull();
    expect(statusBounds).not.toBeNull();
    expect(Math.abs(brandBounds!.height - statusBounds!.height)).toBeLessThanOrEqual(2);
    expect(await page.locator("body").innerText()).not.toContain('className="pointer-events-none');
    const dashIcon = await dashButton
      .locator('svg[viewBox="0 0 24 24"] path')
      .first()
      .getAttribute("d");
    const boostIcon = await boostButton
      .locator('svg[viewBox="0 0 24 24"] path')
      .first()
      .getAttribute("d");
    expect(dashIcon).not.toBe(boostIcon);

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
      game.placePlayer(0, 14);
    });
    const start = await readPlayer(page);
    const moveX = movementBounds!.x + movementBounds!.width / 2;
    const moveY = movementBounds!.y + movementBounds!.height / 2;
    await page.mouse.move(moveX, moveY);
    await page.mouse.down();
    expect(
      await page.evaluate(() =>
        window.__CATCHY_E2E__!.getTouchPointerOwners().map(([, owner]) => owner),
      ),
    ).toContain("movement");
    await page.mouse.move(moveX, moveY);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(200));
    expect(await readPlayer(page)).toMatchObject({ x: start.x, z: start.z });
    await page.mouse.move(moveX, moveY - movementBounds!.height * 0.35, { steps: 4 });
    await page.evaluate(() => window.__CATCHY_E2E__!.step(300));
    await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
    const moved = await readPlayer(page);
    expect(moved.z).toBeGreaterThan(start.z as number);
    expect((await readWorld(page)).cameraYaw).toBeCloseTo(0, 1);
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
    expect(await page.evaluate(() => window.__CATCHY_E2E__!.getTouchPointerOwners())).toEqual([]);

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
    expect(headingAfterRecenter).toBeCloseTo(headingBeforeRecenter, 6);
    expect(yawAfterRecenter).toBeCloseTo(yawBeforeRecenter, 3);
    expect((await readWorld(page)).cameraPitch).toBeLessThan(0);

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
    });
    await page.mouse.move(cameraX, cameraY);
    await page.mouse.down();
    await page.mouse.move(cameraX, cameraY + cameraBounds!.height * 0.12, { steps: 3 });
    await page.evaluate(() => window.__CATCHY_E2E__!.step(120));
    await page.mouse.up();
    expect((await readWorld(page)).cameraPitch).toBeGreaterThan(0);

    await dashButton.click();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
    await expect.poll(async () => (await readPlayer(page)).dashState).toBe("active");
    await boostButton.click();
    await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
    await expect.poll(async () => (await readPlayer(page)).boostState).toBe("active");
  });

  test("native touch ownership supports joystick plus camera, isolated buttons, and pinch zoom", async ({
    page,
  }) => {
    await openStartScreen(page);
    await startGame(page);
    const session = await page.context().newCDPSession(page);
    const dispatchTouch = async (
      type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
      points: Array<{ id: number; x: number; y: number }>,
    ) => {
      await session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map((point) => ({ ...point, radiusX: 1, radiusY: 1, force: 1 })),
      });
    };
    const owners = () =>
      page.evaluate(() => window.__CATCHY_E2E__!.getTouchPointerOwners().map(([, owner]) => owner));
    const movementStick = page.getByRole("group", { name: "Movement joystick" });
    const stickBounds = await movementStick.boundingBox();
    const cameraBounds = await page.locator(".camera-surface").boundingBox();
    expect(stickBounds).not.toBeNull();
    expect(cameraBounds).not.toBeNull();
    const stickX = stickBounds!.x + stickBounds!.width / 2;
    const stickY = stickBounds!.y + stickBounds!.height / 2;
    const cameraX = cameraBounds!.x + cameraBounds!.width / 2;
    const cameraY = cameraBounds!.y + cameraBounds!.height / 2;

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
      game.placePlayer(0, 14);
    });
    await page.waitForFunction(() => {
      const camera = window.__CATCHY_E2E__!.getRenderedCamera();
      return camera !== null && Math.abs(camera.forwardX) < 0.06;
    });
    const cameraDirectionStart = (await page.evaluate(() =>
      window.__CATCHY_E2E__!.getRenderedCamera(),
    ))!;
    const movementStart = await readPlayer(page);
    await dispatchTouch("touchStart", [{ id: 1, x: stickX, y: stickY }]);
    expect(await owners()).toEqual(["movement"]);
    await dispatchTouch("touchStart", [
      { id: 1, x: stickX, y: stickY },
      { id: 2, x: cameraX, y: cameraY },
    ]);
    expect((await owners()).sort()).toEqual(["camera", "movement"]);
    await dispatchTouch("touchMove", [
      { id: 1, x: stickX, y: stickY - stickBounds!.height * 0.32 },
      { id: 2, x: cameraX + 36, y: cameraY },
    ]);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(180));
    await page.evaluate(() => window.__CATCHY_E2E__!.step(20));
    const moved = await readPlayer(page);
    expect(moved.z).toBeGreaterThan((movementStart.z as number) + 0.5);
    expect((await readWorld(page)).cameraYaw as number).toBeLessThan(-0.15);
    await page.waitForFunction(
      (startX) => window.__CATCHY_E2E__!.getRenderedCamera()!.x > startX + 0.5,
      cameraDirectionStart.x,
    );
    const cameraDirectionMoved = (await page.evaluate(() =>
      window.__CATCHY_E2E__!.getRenderedCamera(),
    ))!;
    expect(cameraDirectionMoved.x).toBeGreaterThan(cameraDirectionStart.x + 0.5);
    await dispatchTouch("touchCancel", []);
    expect(await owners()).toEqual([]);

    const jumpButton = page.getByRole("button", { name: "Jump", exact: true });
    const dashButton = page.getByRole("button", { name: "Dash", exact: true });
    const boostButton = page.getByRole("button", { name: "Speed Up ready" });
    const jumpBounds = await jumpButton.boundingBox();
    const dashBounds = await dashButton.boundingBox();
    const boostBounds = await boostButton.boundingBox();
    expect(jumpBounds).not.toBeNull();
    expect(dashBounds).not.toBeNull();
    expect(boostBounds).not.toBeNull();

    for (const [button, bounds, owner, action] of [
      [jumpButton, jumpBounds!, "jump", "jump"] as const,
      [dashButton, dashBounds!, "dash", "dash"] as const,
      [boostButton, boostBounds!, "speedBoost", "boost"] as const,
    ]) {
      await page.evaluate(() => {
        const game = window.__CATCHY_E2E__!;
        game.reset();
        game.turnCamera(0);
      });
      const yawBefore = (await readWorld(page)).cameraYaw as number;
      const buttonX = bounds.x + bounds.width / 2;
      const buttonY = bounds.y + bounds.height / 2;
      await dispatchTouch("touchStart", [{ id: 10, x: buttonX, y: buttonY }]);
      expect(await owners()).toEqual([owner]);
      await dispatchTouch("touchStart", [
        { id: 10, x: buttonX, y: buttonY },
        { id: 11, x: cameraX, y: cameraY },
      ]);
      expect(await owners()).toContain(owner);
      expect(await owners()).toContain("camera");
      await dispatchTouch("touchMove", [
        { id: 10, x: buttonX, y: buttonY },
        { id: 11, x: cameraX + 30, y: cameraY },
      ]);
      await page.evaluate(() => window.__CATCHY_E2E__!.step(80));
      expect((await readWorld(page)).cameraYaw as number).toBeLessThan(yawBefore - 0.1);
      await dispatchTouch("touchEnd", []);
      await page.evaluate(() => window.__CATCHY_E2E__!.step(50));
      expect(await owners()).toEqual([]);
      if (action === "jump") expect((await readPlayer(page)).jumpActivationId).toBe(1);
      if (action === "dash") expect((await readPlayer(page)).dashState).toBe("active");
      if (action === "boost") expect((await readPlayer(page)).boostState).toBe("active");
    }

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
      game.placePlayer(-4, 12);
    });
    await page.waitForFunction(() => window.__CATCHY_E2E__!.getRenderedCamera() !== null);
    await page.waitForTimeout(400);
    const cameraDistanceFromPlayer = async () =>
      page.evaluate(() => {
        const camera = window.__CATCHY_E2E__!.getRenderedCamera()!;
        const player = window.__CATCHY_E2E__!.getPlayer();
        return Math.hypot(camera.x - player.x, camera.z - player.z);
      });
    const pinchStart = await cameraDistanceFromPlayer();
    const pinchStartWorld = await readWorld(page);
    const initialYaw = pinchStartWorld.cameraYaw as number;
    const initialCameraDistance = pinchStartWorld.cameraDistance as number;
    await dispatchTouch("touchStart", [{ id: 21, x: cameraX - 50, y: cameraY }]);
    await dispatchTouch("touchStart", [
      { id: 21, x: cameraX - 50, y: cameraY },
      { id: 22, x: cameraX + 50, y: cameraY },
    ]);
    expect((await owners()).filter((owner) => owner === "camera")).toHaveLength(2);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(30));
    expect((await readWorld(page)).cameraYaw as number).toBeCloseTo(initialYaw, 2);
    await dispatchTouch("touchMove", [
      { id: 21, x: cameraX - 70, y: cameraY },
      { id: 22, x: cameraX + 70, y: cameraY },
    ]);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(80));
    const pinchOutWorld = await readWorld(page);
    await page.waitForFunction((startDistance) => {
      const camera = window.__CATCHY_E2E__!.getRenderedCamera();
      const player = window.__CATCHY_E2E__!.getPlayer();
      return (
        camera !== null &&
        Math.hypot(camera.x - player.x, camera.z - player.z) < startDistance - 0.5
      );
    }, pinchStart);
    const pinchOutRendered = await cameraDistanceFromPlayer();
    expect(pinchOutWorld.cameraDistance).toBeLessThan(initialCameraDistance);
    expect(pinchOutRendered).toBeLessThan(pinchStart - 0.5);
    await dispatchTouch("touchEnd", []);
    expect(await owners()).toEqual([]);

    await dispatchTouch("touchStart", [{ id: 41, x: cameraX - 50, y: cameraY }]);
    await dispatchTouch("touchStart", [
      { id: 41, x: cameraX - 50, y: cameraY },
      { id: 42, x: cameraX + 50, y: cameraY },
    ]);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(30));
    expect((await readWorld(page)).cameraYaw).toBeCloseTo(initialYaw, 2);
    await dispatchTouch("touchMove", [
      { id: 41, x: cameraX - 30, y: cameraY },
      { id: 42, x: cameraX + 30, y: cameraY },
    ]);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(80));
    const pinchInWorld = await readWorld(page);
    expect(pinchInWorld.cameraDistance).toBeGreaterThan(pinchOutWorld.cameraDistance as number);
    expect(pinchInWorld.cameraYaw).toBeCloseTo(initialYaw, 2);
    await page.waitForFunction((startDistance) => {
      const camera = window.__CATCHY_E2E__!.getRenderedCamera();
      const player = window.__CATCHY_E2E__!.getPlayer();
      return (
        camera !== null &&
        Math.hypot(camera.x - player.x, camera.z - player.z) > startDistance + 0.5
      );
    }, pinchOutRendered);
    expect(await cameraDistanceFromPlayer()).toBeGreaterThan(pinchOutRendered + 0.5);
    await dispatchTouch("touchEnd", [{ id: 41, x: cameraX - 30, y: cameraY }]);
    expect((await owners()).filter((owner) => owner === "camera")).toHaveLength(1);
    const yawBeforeSingle = (await readWorld(page)).cameraYaw as number;
    const remainingPointerId = await page.evaluate(
      () => window.__CATCHY_E2E__!.getTouchPointerOwners()[0]![0],
    );
    await page.locator(".camera-surface").evaluate(
      (surface, { pointerId, x, y }) =>
        surface.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: "touch",
            clientX: x,
            clientY: y,
          }),
        ),
      { pointerId: remainingPointerId, x: cameraX + 44, y: cameraY },
    );
    await page.evaluate(() => window.__CATCHY_E2E__!.step(50));
    expect((await readWorld(page)).cameraYaw as number).toBeLessThan(yawBeforeSingle - 0.1);
    await dispatchTouch("touchEnd", []);
    expect(await owners()).toEqual([]);

    await page.evaluate(() => {
      const game = window.__CATCHY_E2E__!;
      game.reset();
      game.turnCamera(0);
    });
    await page.waitForFunction(() => {
      const camera = window.__CATCHY_E2E__!.getRenderedCamera();
      return camera !== null && Math.abs(window.__CATCHY_E2E__!.getWorld().cameraPitch) < 0.1;
    });
    await page.waitForTimeout(450);
    const pitchStart = (await page.evaluate(() => window.__CATCHY_E2E__!.getRenderedCamera()))!;
    await dispatchTouch("touchStart", [{ id: 31, x: cameraX, y: cameraY }]);
    await dispatchTouch("touchMove", [{ id: 31, x: cameraX, y: cameraY - 45 }]);
    await page.evaluate(() => window.__CATCHY_E2E__!.step(80));
    const pitchedWorld = await readWorld(page);
    expect(pitchedWorld.cameraPitch).toBeLessThan(0);
    await page.waitForFunction(
      (startY) => window.__CATCHY_E2E__!.getRenderedCamera()!.forwardY > startY + 0.02,
      pitchStart.forwardY,
      { timeout: 10_000 },
    );
    await dispatchTouch("touchEnd", []);
    expect(await owners()).toEqual([]);

    await session.detach();
  });

  test("compact status and controls stay separated at a narrow portrait width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await openStartScreen(page);
    await startGame(page);
    const brand = page.locator(".hud-brand .hud-card");
    const status = page.getByRole("group", { name: "Game status" });
    const [brandBounds, statusBounds] = await Promise.all([
      brand.boundingBox(),
      status.boundingBox(),
    ]);
    expect(brandBounds).not.toBeNull();
    expect(statusBounds).not.toBeNull();
    expect(brandBounds!.x + brandBounds!.width).toBeLessThan(statusBounds!.x);
    expect(Math.abs(brandBounds!.height - statusBounds!.height)).toBeLessThanOrEqual(2);
    expect(await status.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await expect(status.getByText("Caught", { exact: true })).toBeVisible();
    await expect(status.getByText("Time", { exact: true })).toBeVisible();
    await expect(status.getByText("Target", { exact: true })).toBeVisible();
    const jumpBounds = await page.getByRole("button", { name: "Jump", exact: true }).boundingBox();
    const dashBounds = await page.getByRole("button", { name: "Dash", exact: true }).boundingBox();
    const boostBounds = await page.getByRole("button", { name: "Speed Up ready" }).boundingBox();
    expect(jumpBounds).not.toBeNull();
    expect(dashBounds).not.toBeNull();
    expect(boostBounds).not.toBeNull();
    expect(dashBounds!.x).toBeLessThan(jumpBounds!.x);
    expect(boostBounds!.x + boostBounds!.width).toBeCloseTo(jumpBounds!.x + jumpBounds!.width, 0);
    expect(boostBounds!.y + boostBounds!.height).toBeLessThan(jumpBounds!.y);
  });
});
