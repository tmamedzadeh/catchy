export const QUALITY_LEVELS = {
  high: { dpr: 1.75, shadowMapSize: 2048 },
  medium: { dpr: 1.15, shadowMapSize: 1536 },
  low: { dpr: 0.9, shadowMapSize: 1024 },
} as const;

export type QualityTier = keyof typeof QUALITY_LEVELS;

export function getTierDpr(tier: QualityTier) {
  const deviceDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const minimumDpr = tier === "low" ? 0.8 : 1;
  return Math.max(minimumDpr, Math.min(deviceDpr, QUALITY_LEVELS[tier].dpr));
}

export function detectInitialQualityTier(): QualityTier {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "high";

  const device = navigator as Navigator & { deviceMemory?: number };
  const isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 720;
  const lowMemory = device.deviceMemory !== undefined && device.deviceMemory <= 3;
  const fewCores = device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 3;

  if (lowMemory || (isMobile && fewCores)) return "low";
  return isMobile ? "medium" : "high";
}
