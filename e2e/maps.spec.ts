import { expect, test } from "@playwright/test";
import { openStartScreen, startGame } from "./helpers";

test("launcher selects Default and starts it without model 404s or editor controls", async ({
  page,
}) => {
  const missingModels: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/models/") && response.status() >= 400)
      missingModels.push(`${response.status()} ${response.url()}`);
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
});

test("editor saves a custom map, launcher reloads it, and gameplay uses that map", async ({
  page,
}) => {
  await openStartScreen(page);
  await page.goto("/editor");
  await expect(page.getByRole("heading", { name: "Map library" })).toBeVisible();
  await expect(page.locator("[data-testid=editor-viewport] canvas")).toBeVisible();
  await expect(page.getByRole("region", { name: "Asset palette" })).toBeVisible();

  await page.getByRole("button", { name: "NEW MAP" }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Unsaved changes");
  await page.getByRole("spinbutton", { name: "Arena radius" }).fill("32");
  const selectElement = page.getByRole("combobox", { name: "Select map element" });
  await selectElement.selectOption("spawn:player");
  await page.getByRole("spinbutton", { name: "X" }).fill("-3");
  await selectElement.selectOption("spawn:pink");
  await page.getByRole("spinbutton", { name: "X" }).fill("-12");
  await page.getByRole("button", { name: "Place Large rock" }).click();
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
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Saved");

  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("catchy.maps.v1") ?? "{}").maps,
  );
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ id: "map-1", name: "Untitled Map" });
  expect(saved[0]).toMatchObject({ arena: { radius: 32 }, playerSpawn: { x: -3, z: 12 } });
  expect(saved[0].runnerSpawns[0]).toMatchObject({ id: "pink", x: -12, z: -2 });
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

  const activeMap = await page.evaluate(() => window.__CATCHY_E2E__!.getActiveMap());
  expect(activeMap).toMatchObject({
    id: "map-1",
    arenaRadius: 32,
    playerSpawn: { x: -3, z: 12 },
  });
  expect(activeMap.objects).toContainEqual(
    expect.objectContaining({ model: "rock-large", x: 3, z: 0 }),
  );
  expect(activeMap.runnerSpawns[0]).toMatchObject({ id: "pink", x: -12, z: -2 });
});
