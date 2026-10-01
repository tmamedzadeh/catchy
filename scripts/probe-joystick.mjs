import { chromium, devices } from "@playwright/test";

// Probe the live rendered joystick geometry to confirm the offset root cause.
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem("catchy-first-session-controls-v1", "done");
});
await page.goto("http://127.0.0.1:4173/?debug=true");
await page.getByRole("heading", { name: "CATCHY" }).waitFor();
await page.getByRole("button", { name: "PLAY" }).click();
await page.locator(".game-canvas canvas").waitFor();
await page.waitForFunction(() => Boolean(window.__CATCHY_E2E__));

const probe = await page.evaluate(() => {
  const base = document.querySelector('[role="group"][aria-label="Movement joystick"]');
  const knob = base?.querySelector('[data-testid="joystick-knob"]');
  if (!(base instanceof HTMLElement) || !(knob instanceof HTMLElement)) return null;
  const baseRect = base.getBoundingClientRect();
  const knobRect = knob.getBoundingClientRect();
  const style = getComputedStyle(knob);
  const baseStyle = getComputedStyle(base);
  return {
    base: { left: baseRect.left, top: baseRect.top, w: baseRect.width, h: baseRect.height },
    baseCenter: { x: baseRect.left + baseRect.width / 2, y: baseRect.top + baseRect.height / 2 },
    knob: { left: knobRect.left, top: knobRect.top, w: knobRect.width, h: knobRect.height },
    knobCenter: { x: knobRect.left + knobRect.width / 2, y: knobRect.top + knobRect.height / 2 },
    knobTranslateProperty: style.translate,
    knobTransformProperty: style.transform,
    knobBoxSizing: style.boxSizing,
    baseBorderLeft: baseStyle.borderLeftWidth,
    basePadding: baseStyle.padding,
    clientWidth: base.clientWidth,
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
