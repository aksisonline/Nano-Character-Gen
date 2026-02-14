/**
 * Character generation pipeline: 256×384 → quantize (max 24) → downscale to 32×48 nearest-neighbor.
 * Transparent background, no anti-aliasing, center in frame, trim only transparent padding.
 */

import {
  SPRITE_WIDTH,
  SPRITE_HEIGHT,
  GEN_WIDTH_256,
  GEN_HEIGHT_384,
  MAX_PALETTE_COLORS,
} from '../constants';
import { generateSpriteImage } from './geminiService';

const MAGENTA = { r: 255, g: 0, b: 255 };
/** Generous tolerance so anti-aliased/compressed magenta (#FF66FF, etc.) becomes transparent. */
const MAGENTA_TOLERANCE = 130;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function colorDist(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number {
  return Math.sqrt(
    (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2
  );
}

function isTransparentOrMagenta(
  r: number,
  g: number,
  b: number,
  a: number,
  bgTolerance: number
): boolean {
  if (a < 128) return true;
  const d = colorDist({ r, g, b }, MAGENTA);
  return d < bgTolerance;
}

function isMagentaLike(r: number, g: number, b: number): boolean {
  return colorDist({ r, g, b }, MAGENTA) < MAGENTA_TOLERANCE;
}

function isMagentaLikeHex(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return isMagentaLike(r, g, b);
}

/**
 * 1) Request image from API, draw to 256×384 canvas (nearest-neighbor).
 * Returns data URL of 256×384 PNG.
 */
export async function generateSprite256(userPrompt: string): Promise<string> {
  const base64 = await generateSpriteImage(userPrompt);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = GEN_WIDTH_256;
      canvas.height = GEN_HEIGHT_384;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, GEN_WIDTH_256, GEN_HEIGHT_384);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load generated image'));
    img.src = base64;
  });
}

/**
 * 2) Palette quantization: max 24 colors, remove anti-aliasing (snap to nearest palette).
 * Returns ImageData with indices (0 = transparent) and palette hex[].
 */
export function quantizeSprite(
  imageData: ImageData,
  maxColors: number = MAX_PALETTE_COLORS
): { data: Uint8ClampedArray; palette: (string | null)[] } {
  const { data, width, height } = imageData;
  const bgTolerance = MAGENTA_TOLERANCE;
  const colorCounts = new Map<string, number>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128 || isTransparentOrMagenta(r, g, b, a, bgTolerance)) continue;
    const key = `${r},${g},${b}`;
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
  }

  const sorted = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors - 1);
  const palette: (string | null)[] = [null];
  const paletteRgb: { r: number; g: number; b: number }[] = [];
  for (const [key] of sorted) {
    const [r, g, b] = key.split(',').map(Number);
    if (isMagentaLike(r, g, b)) continue; // Never add pink/magenta to palette
    palette.push(rgbToHex(r, g, b));
    paletteRgb.push({ r, g, b });
  }

  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    if (a < 128 || isTransparentOrMagenta(r, g, b, a, bgTolerance)) {
      out[i] = 0;
      continue;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let p = 0; p < paletteRgb.length; p++) {
      const d = colorDist({ r, g, b }, paletteRgb[p]);
      if (d < bestDist) {
        bestDist = d;
        best = p + 1;
      }
    }
    out[i] = best;
  }
  return { data: out, palette };
}

/**
 * 3) Downscale to 32×48 using nearest-neighbor only.
 */
export function downscaleTo32x48Nearest(
  quantizedData: Uint8ClampedArray,
  quantizedPalette: (string | null)[],
  sourceWidth: number,
  sourceHeight: number
): { pixels: number[]; palette: (string | null)[] } {
  const pixels: number[] = [];
  const scaleX = sourceWidth / SPRITE_WIDTH;
  const scaleY = sourceHeight / SPRITE_HEIGHT;
  for (let y = 0; y < SPRITE_HEIGHT; y++) {
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      const srcX = Math.min(Math.floor(x * scaleX), sourceWidth - 1);
      const srcY = Math.min(Math.floor(y * scaleY), sourceHeight - 1);
      const idx = srcY * sourceWidth + srcX;
      pixels.push(quantizedData[idx] ?? 0);
    }
  }
  return { pixels, palette: quantizedPalette };
}

/**
 * 4) Validate sprite dimensions (32×48).
 */
export function validateSpriteDimensions(
  width: number,
  height: number
): void {
  if (width !== SPRITE_WIDTH || height !== SPRITE_HEIGHT) {
    throw new Error(
      `Invalid sprite dimensions: expected ${SPRITE_WIDTH}×${SPRITE_HEIGHT}, got ${width}×${height}`
    );
  }
}

/**
 * 5) Trim only transparent padding; center sprite in 32×48 frame.
 * Does not crop body — only removes full transparent rows/columns from edges.
 */
export function centerSpriteInFrame(
  pixels: number[],
  palette: (string | null)[],
  width: number,
  height: number
): number[] {
  if (width !== SPRITE_WIDTH || height !== SPRITE_HEIGHT) {
    return pixels;
  }
  let minX = width,
    maxX = -1,
    minY = height,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const ci = pixels[idx];
      if (ci !== 0 && palette[ci]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return pixels;
  const contentW = maxX - minX + 1;
  const contentH = maxY - minY + 1;
  const offsetX = Math.floor((width - contentW) / 2);
  const offsetY = Math.floor((height - contentH) / 2);
  const out = new Array(width * height).fill(0);
  for (let y = 0; y < contentH; y++) {
    for (let x = 0; x < contentW; x++) {
      const srcIdx = (minY + y) * width + (minX + x);
      const dstY = offsetY + y;
      const dstX = offsetX + x;
      if (dstY >= 0 && dstY < height && dstX >= 0 && dstX < width) {
        out[dstY * width + dstX] = pixels[srcIdx];
      }
    }
  }
  return out;
}

/**
 * Full pipeline: generate at 256×384 → quantize → downscale → validate → center.
 * Returns final 32×48 PNG data URL and pixel data + palette for matrix.
 */
export async function runSpritePipeline(userPrompt: string): Promise<{
  pngDataUrl: string;
  pixels: number[];
  palette: (string | null)[];
}> {
  const dataUrl256 = await generateSprite256(userPrompt);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Failed to load 256 image'));
    i.src = dataUrl256;
  });

  const canvas256 = document.createElement('canvas');
  canvas256.width = GEN_WIDTH_256;
  canvas256.height = GEN_HEIGHT_384;
  const ctx256 = canvas256.getContext('2d', { willReadFrequently: true });
  if (!ctx256) throw new Error('Canvas 256 context');
  ctx256.imageSmoothingEnabled = false;
  ctx256.drawImage(img, 0, 0, GEN_WIDTH_256, GEN_HEIGHT_384);
  const imageData256 = ctx256.getImageData(0, 0, GEN_WIDTH_256, GEN_HEIGHT_384);

  const { data: quantized, palette } = quantizeSprite(
    imageData256,
    MAX_PALETTE_COLORS
  );
  const { pixels: rawPixels } = downscaleTo32x48Nearest(
    quantized,
    palette,
    GEN_WIDTH_256,
    GEN_HEIGHT_384
  );
  validateSpriteDimensions(SPRITE_WIDTH, SPRITE_HEIGHT);
  const pixels = centerSpriteInFrame(rawPixels, palette, SPRITE_WIDTH, SPRITE_HEIGHT);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = SPRITE_WIDTH;
  outCanvas.height = SPRITE_HEIGHT;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) throw new Error('Output canvas context');
  outCtx.imageSmoothingEnabled = false;
  for (let i = 0; i < pixels.length; i++) {
    const c = palette[pixels[i]];
    if (c && !isMagentaLikeHex(c)) {
      outCtx.fillStyle = c;
      const x = i % SPRITE_WIDTH;
      const y = Math.floor(i / SPRITE_WIDTH);
      outCtx.fillRect(x, y, 1, 1);
    }
  }
  const pngDataUrl = outCanvas.toDataURL('image/png');
  return { pngDataUrl, pixels, palette };
}
