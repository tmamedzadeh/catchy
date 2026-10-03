import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAP } from "./maps/defaultMap";
import { StartScreen } from "@/routes/index";
import {
  beginPlaySession,
  isFullscreenSupported,
  isIOSPlatform,
  isStandaloneOrFullscreen,
  listenForInstallPrompt,
  type DeferredInstallPrompt,
} from "./pwa";

describe("Catchy mobile startup", () => {
  it("declares production PNG icons with matching paths and dimensions", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../../../public/manifest.webmanifest", import.meta.url), "utf8"),
    ) as {
      display: string;
      orientation: string;
      icons: { src: string; sizes: string; type: string; purpose: string }[];
    };
    const expectedIcons = [
      { src: "/icons/catchy-192.png", sizes: "192x192", dimension: 192 },
      { src: "/icons/catchy-512.png", sizes: "512x512", dimension: 512 },
    ];

    expect(manifest.display).toBe("fullscreen");
    expect(manifest.orientation).toBe("landscape");
    for (const expected of expectedIcons) {
      const icon = manifest.icons.find((entry) => entry.src === expected.src);
      expect(icon).toMatchObject({
        src: expected.src,
        sizes: expected.sizes,
        type: "image/png",
      });
      expect(icon?.purpose.split(" ")).toContain("maskable");

      const png = await readFile(new URL(`../../../public${expected.src}`, import.meta.url));
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(expected.dimension);
      expect(png.readUInt32BE(20)).toBe(expected.dimension);
    }
  });

  it("renders CATCHY, PLAY, and optional install guidance in browser mode", () => {
    const html = renderToStaticMarkup(
      createElement(StartScreen, {
        maps: [DEFAULT_MAP],
        selectedMapId: "default",
        onSelectMap: () => undefined,
        installedMode: false,
        hasInstallPrompt: false,
        showInstallHelp: false,
        onInstall: () => undefined,
        onPlay: () => undefined,
      }),
    );

    expect(html).toContain("CATCHY");
    expect(html).toContain("START");
    expect(html).toContain("Default");
    expect(html).toContain("Install Catchy for the best fullscreen experience");
    expect(html).not.toMatch(/EDITOR|CREATE MAP|REFRESH MAPS|DUPLICATE|DELETE|EXPORT|IMPORT/);
  });

  it("hides install guidance in standalone or fullscreen mode", () => {
    const html = renderToStaticMarkup(
      createElement(StartScreen, {
        maps: [],
        selectedMapId: "default",
        onSelectMap: () => undefined,
        installedMode: true,
        hasInstallPrompt: false,
        showInstallHelp: false,
        onInstall: () => undefined,
        onPlay: () => undefined,
      }),
    );

    expect(html).toContain("START");
    expect(html).not.toContain("Install Catchy");
    expect(html).not.toContain("How to install");
  });

  it("starts gameplay after failed platform requests without waiting for the lock", async () => {
    const attempts: string[] = [];
    const requestFullscreen = vi.fn(() => {
      attempts.push("fullscreen");
      return Promise.reject(new Error("denied"));
    });
    const lock = vi.fn(() => {
      attempts.push("orientation");
      return Promise.reject(new Error("unsupported"));
    });
    const fakeDocument = {
      documentElement: { requestFullscreen },
    } as unknown as Document;
    const fakeScreen = { orientation: { lock } };
    const start = vi.fn(() => attempts.push("start"));

    beginPlaySession(start, { document: fakeDocument, screen: fakeScreen });

    expect(attempts).toEqual(["fullscreen"]);
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    await vi.waitFor(() => {
      expect(lock).toHaveBeenCalledWith("landscape");
      expect(start).toHaveBeenCalledOnce();
      expect(attempts).toEqual(["fullscreen", "orientation", "start"]);
    });
  });

  it("feature-detects fullscreen, installed display modes, and iOS devices", () => {
    const supportedDocument = {
      documentElement: { requestFullscreen: vi.fn() },
    } as unknown as Document;
    const unsupportedDocument = { documentElement: {} } as unknown as Document;

    expect(isFullscreenSupported(supportedDocument)).toBe(true);
    expect(isFullscreenSupported(unsupportedDocument)).toBe(false);
    expect(isStandaloneOrFullscreen({ standalone: true })).toBe(true);
    expect(isStandaloneOrFullscreen({ fullscreenElement: {} as Element })).toBe(true);
    expect(isStandaloneOrFullscreen({ matchesDisplayMode: (mode) => mode === "fullscreen" })).toBe(
      true,
    );
    expect(isStandaloneOrFullscreen({ standalone: false })).toBe(false);
    expect(
      isIOSPlatform({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 1 }),
    ).toBe(true);
    expect(
      isIOSPlatform({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 5 }),
    ).toBe(true);
  });

  it("defers the browser install prompt until an install event listener receives it", () => {
    const target = new EventTarget();
    const prompt = vi.fn();
    const installed = vi.fn();
    const removeListeners = listenForInstallPrompt(prompt, installed, target as unknown as Window);
    const beforeInstall = new Event("beforeinstallprompt", {
      cancelable: true,
    }) as DeferredInstallPrompt;
    beforeInstall.prompt = vi.fn().mockResolvedValue(undefined);
    beforeInstall.userChoice = Promise.resolve({ outcome: "accepted", platform: "test" });

    target.dispatchEvent(beforeInstall);
    expect(beforeInstall.defaultPrevented).toBe(true);
    expect(prompt).toHaveBeenCalledWith(beforeInstall);
    target.dispatchEvent(new Event("appinstalled"));
    expect(installed).toHaveBeenCalledOnce();
    removeListeners();
  });
});
