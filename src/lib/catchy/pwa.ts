export type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type DisplayModeEnvironment = {
  fullscreenElement?: Element | null;
  standalone?: boolean;
  matchesDisplayMode?: (mode: "standalone" | "fullscreen" | "minimal-ui") => boolean;
};

type OrientationTarget = {
  orientation?: { lock?: (orientation: "landscape") => Promise<void> };
};

function currentDocument(target?: Document) {
  return target ?? (typeof document === "undefined" ? undefined : document);
}

export function isFullscreenSupported(target?: Document) {
  return typeof currentDocument(target)?.documentElement.requestFullscreen === "function";
}

/** Requests fullscreen from the caller's user gesture and absorbs platform/API failures. */
export async function enterFullscreen(target?: Document) {
  const doc = currentDocument(target);
  const element = doc?.documentElement;
  if (!element || typeof element.requestFullscreen !== "function") return false;
  try {
    await element.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(target?: Document) {
  const doc = currentDocument(target);
  if (!doc?.fullscreenElement || typeof doc.exitFullscreen !== "function") return false;
  try {
    await doc.exitFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function lockLandscape(target?: OrientationTarget) {
  let screenTarget = target;
  if (!screenTarget && typeof window !== "undefined")
    screenTarget = window.screen as unknown as OrientationTarget;
  const lock = screenTarget?.orientation?.lock;
  if (typeof lock !== "function") return false;
  try {
    await lock.call(screenTarget?.orientation, "landscape");
    return true;
  } catch {
    return false;
  }
}

/** Requests fullscreen from PLAY, then orientation, and launches without waiting for the lock. */
export function beginPlaySession(
  onStarted: () => void,
  environment?: { document?: Document; screen?: OrientationTarget; alreadyFullscreen?: boolean },
) {
  const doc = currentDocument(environment?.document);
  const alreadyFullscreen =
    environment?.alreadyFullscreen ??
    (isStandaloneOrFullscreen({ fullscreenElement: doc?.fullscreenElement ?? null }) ||
      isStandaloneOrFullscreen());
  const fullscreenRequest = alreadyFullscreen
    ? Promise.resolve(true)
    : enterFullscreen(environment?.document);
  const lockThenStart = () => {
    // Orientation locks commonly require fullscreen; do not wait for the lock to resolve.
    void lockLandscape(environment?.screen);
    onStarted();
  };
  void fullscreenRequest.then(lockThenStart, lockThenStart);
}

export function isStandaloneOrFullscreen(environment?: DisplayModeEnvironment) {
  let source = environment;
  if (!source && typeof window !== "undefined" && typeof document !== "undefined") {
    const appNavigator = navigator as Navigator & { standalone?: boolean };
    source = {
      fullscreenElement: document.fullscreenElement,
      standalone: appNavigator.standalone === true,
      matchesDisplayMode: (mode) => {
        try {
          return window.matchMedia?.(`(display-mode: ${mode})`).matches ?? false;
        } catch {
          return false;
        }
      },
    };
  }
  if (!source) return false;
  if (source.fullscreenElement || source.standalone) return true;
  return (
    source.matchesDisplayMode?.("standalone") === true ||
    source.matchesDisplayMode?.("fullscreen") === true ||
    source.matchesDisplayMode?.("minimal-ui") === true
  );
}

export function isIOSPlatform(details?: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}) {
  const info =
    details ??
    (typeof navigator === "undefined"
      ? { userAgent: "", platform: "", maxTouchPoints: 0 }
      : navigator);
  return (
    /iPad|iPhone|iPod/i.test(info.userAgent) ||
    (info.platform === "MacIntel" && info.maxTouchPoints > 1)
  );
}

export function listenForFullscreenEvents(
  onChange: () => void,
  onError: () => void,
  target?: Document,
) {
  const doc = currentDocument(target);
  if (!doc) return () => undefined;
  doc.addEventListener("fullscreenchange", onChange);
  doc.addEventListener("fullscreenerror", onError);
  return () => {
    doc.removeEventListener("fullscreenchange", onChange);
    doc.removeEventListener("fullscreenerror", onError);
  };
}

export function listenForInstallPrompt(
  onPrompt: (event: DeferredInstallPrompt) => void,
  onInstalled: () => void,
  target?: Window,
) {
  const browserWindow = target ?? (typeof window === "undefined" ? undefined : window);
  if (!browserWindow) return () => undefined;
  const handlePrompt = (event: Event) => {
    event.preventDefault();
    onPrompt(event as DeferredInstallPrompt);
  };
  browserWindow.addEventListener("beforeinstallprompt", handlePrompt);
  browserWindow.addEventListener("appinstalled", onInstalled);
  return () => {
    browserWindow.removeEventListener("beforeinstallprompt", handlePrompt);
    browserWindow.removeEventListener("appinstalled", onInstalled);
  };
}
