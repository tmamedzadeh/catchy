import { useEffect, useMemo } from "react";
import * as THREE from "three";

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 128;

/** Build small in-scene labels locally so gameplay never depends on a font CDN. */
export function useCanvasTextTexture(text: string, color: string, outlineColor: string) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    context.font = "800 72px ui-rounded, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = 8;
    context.strokeStyle = outlineColor;
    context.strokeText(text, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2, TEXTURE_WIDTH - 28);
    context.fillStyle = color;
    context.fillText(text, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2, TEXTURE_WIDTH - 28);

    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.generateMipmaps = false;
    return result;
  }, [color, outlineColor, text]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}
