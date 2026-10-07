import { expect, type Page } from "@playwright/test";
import type { CatchyE2EApi } from "../src/lib/catchy/e2eBridge";
import { DEFAULT_MAP } from "../src/lib/catchy/maps/defaultMap";

declare global {
  interface Window {
    __CATCHY_E2E__?: CatchyE2EApi;
    __catchyFullscreenRequests?: number;
    __catchyOrientationRequests?: number;
  }
}

export async function openStartScreen(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("catchy-first-session-controls-v1", "done");
    } catch {
      // The app also needs to work when storage is unavailable.
    }

    window.__catchyFullscreenRequests = 0;
    window.__catchyOrientationRequests = 0;
    try {
      Object.defineProperty(Element.prototype, "requestFullscreen", {
        configurable: true,
        value: () => {
          window.__catchyFullscreenRequests = (window.__catchyFullscreenRequests ?? 0) + 1;
          return Promise.reject(new Error("Fullscreen denied by browser test"));
        },
      });
    } catch {
      // A browser that cannot override the API still exercises its native fallback.
    }
    try {
      Object.defineProperty(window.screen.orientation, "lock", {
        configurable: true,
        value: () => {
          window.__catchyOrientationRequests = (window.__catchyOrientationRequests ?? 0) + 1;
          return Promise.reject(new Error("Orientation lock denied by browser test"));
        },
      });
    } catch {
      // Orientation lock is optional on desktop and some mobile browser builds.
    }
  });
  await page.goto("/?debug=true");
  await expect(page.getByRole("heading", { name: "CATCHY" })).toBeVisible();
}

export async function startGame(page: Page) {
  await page.getByRole("button", { name: "START" }).click();
  await expect(page.locator(".game-canvas canvas")).toBeVisible();
  await page.waitForFunction(() => window.__CATCHY_E2E__?.isReady() === true);
  await expect(page.getByRole("group", { name: "Game status" })).toBeVisible();
  await page.evaluate(() => window.__CATCHY_E2E__!.reset());
}

export async function startCompactGame(page: Page) {
  await openStartScreen(page);
  const compactMap = structuredClone(DEFAULT_MAP);
  compactMap.id = "compact-controls";
  compactMap.name = "Compact Controls";
  compactMap.arena.radius = 30;
  compactMap.objects = [];
  compactMap.decorations = [];
  for (const item of compactMap.interactiveObjects) {
    if (item.kind === "speedPad") item.position = { x: -8, z: 0 };
    else if (item.kind === "slowZone") item.position = { x: 8, z: 0 };
    else if (item.kind === "elasticBounce") item.position = { x: 0, z: -8 };
    else item.position = { x: 0, z: 8 };
  }
  await page.evaluate((map) => {
    localStorage.setItem("catchy.maps.v1", JSON.stringify({ schemaVersion: 1, maps: [map] }));
  }, compactMap);
  await page.reload();
  await page.getByRole("button", { name: /Compact Controls/ }).click();
  await startGame(page);
}

export async function readPlayer(page: Page) {
  return page.evaluate(() => window.__CATCHY_E2E__!.getPlayer());
}

export async function readWorld(page: Page) {
  return page.evaluate(() => window.__CATCHY_E2E__!.getWorld());
}
