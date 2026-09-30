import * as THREE from "three";

type TextureKind = "sand" | "grass" | "rock" | "stone";

const PALETTES: Record<TextureKind, { base: string; flecks: string[] }> = {
  sand: { base: "#e9b867", flecks: ["#f5d28b", "#d89a50", "#f0c77a"] },
  grass: { base: "#58ad3b", flecks: ["#74c84c", "#3e8d31", "#8dd45a"] },
  rock: { base: "#9b8067", flecks: ["#b69a79", "#765f50", "#c7ad88"] },
  stone: { base: "#c9bda7", flecks: ["#e1d7c4", "#a89b86", "#d3c5ab"] },
};

function random(seed: number) {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createTerrainTexture(kind: TextureKind, repeat: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();

  const palette = PALETTES[kind];
  const rnd = random(kind.length * 919 + repeat * 37);
  context.fillStyle = palette.base;
  context.fillRect(0, 0, 256, 256);

  const count = kind === "grass" ? 560 : 380;
  for (let i = 0; i < count; i++) {
    context.globalAlpha = 0.12 + rnd() * 0.24;
    context.fillStyle = palette.flecks[Math.floor(rnd() * palette.flecks.length)] ?? palette.base;
    const x = rnd() * 256;
    const y = rnd() * 256;
    if (kind === "grass") {
      context.save();
      context.translate(x, y);
      context.rotate((rnd() - 0.5) * 0.9);
      context.fillRect(0, 0, 1 + rnd(), 3 + rnd() * 5);
      context.restore();
    } else if (kind === "rock" || kind === "stone") {
      context.beginPath();
      context.ellipse(x, y, 1 + rnd() * 5, 0.5 + rnd() * 2, rnd() * Math.PI, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.arc(x, y, 0.5 + rnd() * 2.2, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}