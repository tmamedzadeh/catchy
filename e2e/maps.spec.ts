import { expect, test } from "@playwright/test";
import { ASSET_CATALOG } from "../src/lib/catchy/maps/catalog";
import { DEFAULT_MAP } from "../src/lib/catchy/maps/defaultMap";
import { GAME_CONFIG } from "../src/lib/catchy/config";
import { openStartScreen, startGame } from "./helpers";

test("launcher selects Default and starts it without model 404s or editor controls", async ({
  page,
}) => {
  const missingModels: string[] = [];
  const runtimeErrors: string[] = [];
  const requestedModels = new Set<string>();
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/models/") && response.status() >= 400)
      missingModels.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(".glb")) requestedModels.add(pathname);
  });
  await openStartScreen(page);
  await expect(page.getByRole("button", { name: /Default/ })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Editor|Create Map|Refresh Maps|Duplicate|Delete|Export|Import/i,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Default/ }).click();
  await startGame(page);
  await expect(page.locator(".game-canvas canvas")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__CATCHY_E2E__!.getActiveMap().id))
    .toBe("default");
  expect(missingModels).toEqual([]);
  const activeMap = await page.evaluate(() => window.__CATCHY_E2E__!.getActiveMap());
  const expectedModels = new Set(
    activeMap.objects.map(
      (object) => ASSET_CATALOG.find((asset) => asset.id === object.model)!.modelPath,
    ),
  );
  expect(requestedModels).toEqual(expectedModels);
  expect(runtimeErrors).toEqual([]);
});

test("editor saves maps without spawn markers and gameplay picks safe runtime spawns", async ({
  page,
}) => {
  await openStartScreen(page);
  const defaultCard = page.getByRole("button", { name: /Default/ });
  await expect(defaultCard).toHaveAttribute("aria-pressed", "true");
  await startGame(page);
  const defaultRuntime = await page.evaluate(() => ({
    map: window.__CATCHY_E2E__!.getActiveMap(),
    player: window.__CATCHY_E2E__!.getPlayer(),
    runners: window.__CATCHY_E2E__!.getRunners(),
  }));
  expect(defaultRuntime.map.id).toBe("default");
  expect(defaultRuntime.runners).toHaveLength(3);
  expect(Math.hypot(defaultRuntime.player.x, defaultRuntime.player.z)).toBeLessThan(
    defaultRuntime.map.arenaRadius - defaultRuntime.player.radius,
  );
  for (const runner of defaultRuntime.runners) {
    expect(runner.hidden).toBe(0);
    expect(Math.hypot(runner.x, runner.z)).toBeLessThan(
      defaultRuntime.map.arenaRadius - runner.radius,
    );
    expect(
      Math.hypot(runner.x - defaultRuntime.player.x, runner.z - defaultRuntime.player.z),
    ).toBeGreaterThanOrEqual(GAME_CONFIG.npc.minSpawnDistanceFromPlayer);
  }

  await page.goto("/editor");
  const backToMaps = page.getByRole("link", { name: "Back to Maps" });
  await expect(backToMaps).toHaveAttribute("aria-label", "Back to Maps");
  await expect(backToMaps).toHaveAttribute("title", "Back to Maps");
  await expect(page.getByText("Interactive areas", { exact: true })).toHaveCount(0);
  await backToMaps.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "CATCHY" })).toBeVisible();

  await page.goto("/editor");
  await expect(page.locator("[data-testid=editor-viewport] canvas")).toBeVisible();
  const toolbar = page.getByRole("toolbar", { name: "Map actions" });
  await expect(toolbar.getByRole("button")).toHaveCount(8);
  const newMapButton = page.getByRole("button", { name: "New map" });
  await expect(newMapButton).toHaveAttribute("title", "New map");
  await newMapButton.hover();
  await expect(page.getByRole("tooltip", { name: "New map" })).toBeVisible();
  await expect(page.getByText(/player spawn|runner spawn/i)).toHaveCount(0);
  await expect(page.getByText(/Click to select/)).toHaveCount(0);
  const paletteToggle = page.getByRole("button", { name: "Toggle editor drawer" });
  await expect(paletteToggle).toHaveAttribute("aria-expanded", "false");
  await paletteToggle.hover();
  await expect(paletteToggle).toHaveAttribute("aria-expanded", "true");
  await paletteToggle.click();
  const mapLibraryHeading = page.getByRole("heading", { name: "Map Library" });
  const assetPaletteHeading = page.getByRole("heading", { name: "Asset Palette" });
  const interactiveHeading = page.getByRole("heading", { name: "Interactive Objects" });
  await expect(mapLibraryHeading).toBeVisible();
  await expect(assetPaletteHeading).toBeVisible();
  await expect(interactiveHeading).toBeVisible();
  await expect(page.getByRole("button", { name: "Select Default map, protected" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const sectionOrder = await page.evaluate(() => {
    const ids = ["map-library-heading", "asset-palette-heading", "interactive-objects-heading"];
    return ids.map((id) => document.getElementById(id)!.getBoundingClientRect().top);
  });
  expect(sectionOrder[0]).toBeLessThan(sectionOrder[1]!);
  expect(sectionOrder[1]).toBeLessThan(sectionOrder[2]!);
  const palette = page.getByRole("region", { name: "Asset Palette" });
  await expect(palette).toBeVisible();
  await paletteToggle.click();
  await expect(paletteToggle).toHaveAttribute("aria-expanded", "false");
  await paletteToggle.click();
  await expect(paletteToggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "New map" }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Unsaved changes");
  await expect(
    page.getByRole("button", { name: "Select Untitled Map map, unsaved draft" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("spinbutton", { name: "Arena radius" }).fill("100");
  const selectElement = page.getByRole("combobox", { name: "Select map element" });
  const selectionLabels = await selectElement.locator("option").allTextContents();
  expect(selectionLabels.join(" ")).not.toMatch(/spawn/i);
  await page.getByRole("button", { name: "Place Large rock" }).click();
  await paletteToggle.click();
  const viewport = page.locator("[data-testid=editor-viewport] canvas");
  const bounds = await viewport.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await expect(page.getByRole("heading", { name: "rock-large" })).toBeVisible();

  const xField = page.getByRole("spinbutton", { name: "X" });
  await xField.fill("3");
  await expect(xField).toHaveValue("3");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("spinbutton", { name: "X" })).toHaveValue("0");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByRole("spinbutton", { name: "X" })).toHaveValue("3");
  await page.getByRole("spinbutton", { name: "Rotation (radians)" }).fill("0.5");
  await page.getByRole("spinbutton", { name: "Scale" }).fill("1.5");

  await page.getByRole("combobox", { name: "Collider shape" }).selectOption("box");
  await page.getByRole("spinbutton", { name: "Collider width" }).fill("1.4");
  await page.getByRole("button", { name: "DUPLICATE OBJECT" }).click();
  await page.getByRole("button", { name: "DELETE", exact: true }).click();
  await page.getByRole("button", { name: "Save map" }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Saved");
  await expect(
    page.getByRole("button", { name: "Select Untitled Map map, custom" }),
  ).toHaveAttribute("aria-pressed", "true");

  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("catchy.maps.v1") ?? "{}").maps,
  );
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ id: "map-1", name: "Untitled Map", arena: { radius: 100 } });
  expect(saved[0]).not.toHaveProperty("playerSpawn");
  expect(saved[0]).not.toHaveProperty("runnerSpawns");
  expect(saved[0].objects).toHaveLength(1);
  expect(saved[0].objects[0]).toMatchObject({
    model: "rock-large",
    position: { x: 3, z: 0 },
    rotation: 0.5,
    scale: 1.5,
  });
  expect(saved[0].objects[0].collision).toMatchObject({ type: "box", width: 1.4 });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Default/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Untitled Map/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Untitled Map/ })).toBeVisible();
  await page.getByRole("button", { name: /Untitled Map/ }).click();
  await startGame(page);

  const runtime = await page.evaluate(() => ({
    map: window.__CATCHY_E2E__!.getActiveMap(),
    player: window.__CATCHY_E2E__!.getPlayer(),
    runners: window.__CATCHY_E2E__!.getRunners(),
  }));
  expect(runtime.map).toMatchObject({ id: "map-1", arenaRadius: 100 });
  expect(runtime.map).not.toHaveProperty("playerSpawn");
  expect(runtime.map).not.toHaveProperty("runnerSpawns");
  expect(runtime.map.objects).toContainEqual(
    expect.objectContaining({ model: "rock-large", x: 3, z: 0 }),
  );
  expect(Math.hypot(runtime.player.x, runtime.player.z) + runtime.player.radius).toBeLessThan(100);
  for (const runner of runtime.runners) {
    expect(runner.hidden).toBe(0);
    expect(Math.hypot(runner.x, runner.z) + runner.radius).toBeLessThan(100);
    expect(
      Math.hypot(runner.x - runtime.player.x, runner.z - runtime.player.z),
    ).toBeGreaterThanOrEqual(8);
  }
  for (let i = 0; i < runtime.runners.length; i++) {
    for (let j = i + 1; j < runtime.runners.length; j++) {
      const first = runtime.runners[i]!;
      const second = runtime.runners[j]!;
      expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThanOrEqual(
        first.radius + second.radius + GAME_CONFIG.npc.spawnSeparation,
      );
    }
  }
});

test("editor viewport pans horizontally and vertically without changing the map or history", async ({
  page,
}) => {
  await openStartScreen(page);
  await page.goto("/editor");
  await page.getByRole("button", { name: "New map" }).click();
  const canvas = page.locator("[data-testid=editor-viewport] canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.locator("[data-testid=editor-viewport]");
  const initial = await viewport.evaluate((element) => ({
    x: Number(element.getAttribute("data-viewport-x")),
    z: Number(element.getAttribute("data-viewport-z")),
    zoom: Number(element.getAttribute("data-viewport-zoom")),
  }));
  const mapBefore = await page.getByRole("spinbutton", { name: "Arena radius" }).inputValue();

  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 120, bounds!.y + bounds!.height / 2 + 80);
  await page.mouse.up();

  await expect.poll(async () => viewport.getAttribute("data-viewport-x")).not.toBe("0");
  await expect.poll(async () => viewport.getAttribute("data-viewport-z")).not.toBe("0");
  expect(await page.getByRole("spinbutton", { name: "Arena radius" }).inputValue()).toBe(mapBefore);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.wheel(0, -500);
  await expect
    .poll(async () => Number(await viewport.getAttribute("data-viewport-zoom")))
    .toBeGreaterThan(initial.zoom);

  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 - 120, bounds!.y + bounds!.height / 2 - 80);
  await page.mouse.up();
  await expect.poll(async () => viewport.getAttribute("data-viewport-x")).not.toBe("0");
  await expect.poll(async () => viewport.getAttribute("data-viewport-z")).not.toBe("0");
});

test("interactive palette selects existing objects by friendly name", async ({ page }) => {
  await openStartScreen(page);
  await page.goto("/editor");
  const toggle = page.getByRole("button", { name: "Toggle editor drawer" });
  await toggle.click();
  const palette = page.getByRole("region", { name: "Interactive objects" });
  await expect(palette).toBeVisible();

  for (const label of ["Speed Up", "Slow Down", "Bounce Ball", "Temporary Barrier"]) {
    await palette.getByRole("button", { name: `Select ${label}` }).click();
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
});

test("keyboard transforms props and interactives, supports undo, and leaves text inputs alone", async ({
  page,
}) => {
  const defaultSpeedPad = DEFAULT_MAP.interactiveObjects.find((item) => item.kind === "speedPad")!;
  await openStartScreen(page);
  await page.goto("/editor");
  await page.getByRole("button", { name: "New map" }).click();
  const radius = page.getByRole("spinbutton", { name: "Arena radius" });
  await radius.fill("60");
  await expect(radius).toHaveValue("60");
  const paletteToggle = page.getByRole("button", { name: "Toggle editor drawer" });
  await paletteToggle.click();
  await page.getByRole("button", { name: "Place Large rock" }).click();
  await paletteToggle.click();
  const canvas = page.locator("[data-testid=editor-viewport] canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await expect(page.getByRole("heading", { name: "rock-large" })).toBeVisible();

  const xField = page.getByRole("spinbutton", { name: "X" });
  const zField = page.getByRole("spinbutton", { name: "Z" });
  const initialX = Number(await xField.inputValue());
  const initialZ = Number(await zField.inputValue());
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  expect(
    await page
      .locator("[data-testid=editor-viewport] canvas")
      .evaluate((canvas) => canvas !== document.activeElement),
  ).toBe(true);
  await page.keyboard.press("w");
  await page.keyboard.press("a");
  await expect(xField).toHaveValue(String(initialX - 0.5));
  await expect(zField).toHaveValue(String(initialZ - 0.5));
  await page.keyboard.press("s");
  await page.keyboard.press("d");
  await expect(xField).toHaveValue(String(initialX));
  await expect(zField).toHaveValue(String(initialZ));

  const rotation = page.getByRole("spinbutton", { name: "Rotation (radians)" });
  const scale = page.getByRole("spinbutton", { name: "Scale" });
  await page.keyboard.press("ArrowLeft");
  await expect(rotation).toHaveValue(String(-Math.PI / 12));
  await page.keyboard.press("ArrowRight");
  await expect(rotation).toHaveValue("0");
  const initialScale = Number(await scale.inputValue());
  const nudgedScale = String(Number((initialScale + 0.1).toFixed(4)));
  await page.keyboard.press("ArrowUp");
  await expect(scale).toHaveValue(nudgedScale);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(scale).toHaveValue(String(initialScale));
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(scale).toHaveValue(nudgedScale);

  const name = page.getByRole("textbox", { name: "Map name" });
  await name.fill("Catchy");
  await name.press("End");
  await page.keyboard.type("wasd");
  await expect(name).toHaveValue("Catchywasd");
  const unchangedX = Number(await xField.inputValue());
  const unchangedScale = Number(await scale.inputValue());
  await name.press("ArrowLeft");
  await name.press("ArrowUp");
  await name.press("ArrowDown");
  await expect(xField).toHaveValue(String(unchangedX));
  await expect(scale).toHaveValue(String(unchangedScale));

  await page
    .getByRole("combobox", { name: "Select map element" })
    .selectOption("interactive:speed-pad");
  await page.keyboard.press("Tab");
  const interactiveX = page.getByRole("spinbutton", { name: "X" });
  const initialInteractiveX = Number(await interactiveX.inputValue());
  await page.keyboard.press("d");
  await expect(interactiveX).toHaveValue(String(initialInteractiveX + 0.5));
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  await page.getByRole("button", { name: "Save map" }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Saved");

  await page.reload();
  await page
    .getByRole("combobox", { name: "Select map element" })
    .selectOption("interactive:speed-pad");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowUp");
  await page.getByRole("button", { name: "Save map", exact: true }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Saved");
  const savedInteractive = await page.evaluate(() => {
    const maps = JSON.parse(localStorage.getItem("catchy.maps.v1") ?? "{}").maps;
    return maps[0]?.interactiveObjects.find((item: { id: string }) => item.id === "speed-pad");
  });
  expect(savedInteractive).toMatchObject({
    position: { x: initialInteractiveX + 0.5 },
    rotation:
      Math.round((defaultSpeedPad.rotation - Math.PI / 12) / (Math.PI / 12)) * (Math.PI / 12),
    scale: defaultSpeedPad.scale + 0.2,
  });
});

test("map lifecycle protects Default, blocks invalid saves, and round trips radius 100", async ({
  page,
}) => {
  await openStartScreen(page);
  await page.goto("/editor");
  await expect(page.getByRole("textbox", { name: "Map name" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save map" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete map" })).toBeDisabled();

  await page.getByRole("button", { name: "Duplicate map" }).click();
  const radius = page.getByRole("spinbutton", { name: "Arena radius" });
  await radius.fill("101");
  await expect(page.getByRole("button", { name: "Save map" })).toBeDisabled();
  await radius.fill("100");
  await expect(page.getByRole("button", { name: "Save map" })).toBeEnabled();
  await page.getByRole("button", { name: "Save map" }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Saved");
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("catchy.maps.v1") ?? "{}").maps[0],
  );
  expect(saved.arena.radius).toBe(100);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Map name" })).toHaveValue("Default Copy");
  await expect(page.getByRole("spinbutton", { name: "Arena radius" })).toHaveValue("100");

  const importInput = page.locator('input[type="file"]');
  await importInput.setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Import is not valid JSON" }),
  ).toBeVisible();
  await importInput.setInputFiles({
    name: "invalid-map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, id: "bad-map" })),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Unsupported map schema version" }),
  ).toBeVisible();

  const exportedMap = await page.evaluate(
    () => JSON.parse(localStorage.getItem("catchy.maps.v1") ?? "{}").maps[0],
  );
  await importInput.setInputFiles({
    name: "radius-100.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exportedMap)),
  });
  await expect(page.getByRole("textbox", { name: "Map name" })).toHaveValue(
    "Default Copy (Imported)",
  );
  await expect(page.getByRole("spinbutton", { name: "Arena radius" })).toHaveValue("100");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Map name" })).toHaveValue(
    "Default Copy (Imported)",
  );

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete map" }).click();
  await expect(page.getByRole("textbox", { name: "Map name" })).toHaveValue("Default");
  const maps = await page.evaluate(
    () => JSON.parse(localStorage.getItem("catchy.maps.v1") ?? "{}").maps,
  );
  expect(maps).toHaveLength(1);
});

test.describe("touch editor drawer", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  test("tap opens and closes the shared map and asset drawer", async ({ page }) => {
    await openStartScreen(page);
    await page.goto("/editor");
    const toggle = page.getByRole("button", { name: "Toggle editor drawer" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      await page
        .locator("#editor-drawer-content")
        .evaluate((drawer) => (drawer as HTMLElement).inert),
    ).toBe(true);

    const bounds = await toggle.boundingBox();
    expect(bounds).not.toBeNull();
    const x = bounds!.x + bounds!.width / 2;
    const y = bounds!.y + bounds!.height / 2;
    await page.touchscreen.tap(x, y);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("heading", { name: "Map Library" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Asset Palette" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interactive Objects" })).toBeVisible();

    await page.locator("#editor-drawer-content").evaluate(async (drawer) => {
      const animations = drawer.parentElement?.getAnimations() ?? [];
      await Promise.all(animations.map((animation) => animation.finished));
    });
    const openBounds = await toggle.boundingBox();
    expect(openBounds).not.toBeNull();
    await page.touchscreen.tap(
      openBounds!.x + openBounds!.width / 2,
      openBounds!.y + openBounds!.height / 2,
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      await page
        .locator("#editor-drawer-content")
        .evaluate((drawer) => (drawer as HTMLElement).inert),
    ).toBe(true);
  });
});
