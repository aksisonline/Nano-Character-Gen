/**
 * Character generation pipeline: 512x768 -> chroma key -> median-cut palette (max 24) -> mode downscale to 32x48
 * -> cleanup -> center. Transparent background, no anti-aliasing.
 */

import {
  SPRITE_WIDTH,
  SPRITE_HEIGHT,
  MAX_PALETTE_COLORS,
} from '../constants';
import { generateSpriteImage } from './geminiService';
import { keyBackground, mapToPalette, medianCutPalette, type KeyStats } from './chromaKey';
import {
  centerSpriteInFrame,
  contrastDownscale,
  keepMainComponents,
  mergePalette,
  removeOrphans,
  simplifyPalette,
  smoothShading,
} from './spriteCleanup';

// Work at 16x the sprite (512x768) with a smoothed downscale of the AI image: thin features (glasses rims, eyes)
// survive that, but not a nearest-neighbor 512x768 pass. Measured on 7 NB2.1 characters (docs/research-runs/2026-11-11-sprites-nb21-v2).
const WORK_W = SPRITE_WIDTH * 16;
const WORK_H = SPRITE_HEIGHT * 16;

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * 1) Request image from API, draw to 512×768 canvas (nearest-neighbor).
 * Returns data URL of 512×768 PNG.
 */
export async function generateSpriteWork(userPrompt: string): Promise<string> {
  const base64 = await generateSpriteImage(userPrompt);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = WORK_W;
      canvas.height = WORK_H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, WORK_W, WORK_H);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load generated image'));
    img.src = base64;
  });
}

/**
 * Full pipeline: generate at 512x768 -> chroma key -> median-cut palette -> map -> mode downscale to 32x48
 * -> orphan/component cleanup -> palette merge -> center. Returns the final PNG, indexed pixels, palette and
 * keyer QA stats.
 */
export async function runSpritePipeline(userPrompt: string): Promise<{
  pngDataUrl: string;
  pixels: number[];
  palette: (string | null)[];
  qa: KeyStats;
}> {
  const dataUrl256 = await generateSpriteWork(userPrompt);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Failed to load 256 image'));
    i.src = dataUrl256;
  });

  const canvas256 = document.createElement('canvas');
  canvas256.width = WORK_W;
  canvas256.height = WORK_H;
  const ctx256 = canvas256.getContext('2d', { willReadFrequently: true });
  if (!ctx256) throw new Error('Canvas 256 context');
  ctx256.imageSmoothingEnabled = false;
  ctx256.drawImage(img, 0, 0, WORK_W, WORK_H);
  const { data } = ctx256.getImageData(0, 0, WORK_W, WORK_H);

  const { mask, stats } = keyBackground(data, WORK_W, WORK_H);
  let paletteRgb = medianCutPalette(data, mask, MAX_PALETTE_COLORS - 1);
  let indexMap = mapToPalette(data, mask, paletteRgb);
  // Collapse near-identical shades (metal/grey gradients) so the 32x48 result is not speckled; accents stay.
  const counts = new Array<number>(paletteRgb.length).fill(0);
  for (let i = 0; i < indexMap.length; i++) if (indexMap[i]) counts[indexMap[i] - 1]++;
  paletteRgb = simplifyPalette(paletteRgb, counts, 14).palette;
  indexMap = mapToPalette(data, mask, paletteRgb);
  const basePalette: (string | null)[] = [null, ...paletteRgb.map(([r, g, b]) => rgbToHex(r, g, b))];

  let px = contrastDownscale(indexMap, WORK_W, WORK_H, basePalette, SPRITE_WIDTH, SPRITE_HEIGHT, 0.35, 50);
  px = removeOrphans(px);
  px = keepMainComponents(px);
  px = smoothShading(px, basePalette, SPRITE_WIDTH, SPRITE_HEIGHT, 14);
  const merged = mergePalette(px, basePalette, 24);
  const palette = merged.palette;
  const pixels = centerSpriteInFrame(merged.pixels, palette, SPRITE_WIDTH, SPRITE_HEIGHT);
  // Keyer swallowed (almost) everything: do not open the editor on a blank sprite.
  if (pixels.reduce((n, v) => n + (v ? 1 : 0), 0) < 20) {
    throw new Error("Couldn't separate the character from the background. Please try again.");
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = SPRITE_WIDTH;
  outCanvas.height = SPRITE_HEIGHT;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) throw new Error('Output canvas context');
  outCtx.imageSmoothingEnabled = false;
  for (let i = 0; i < pixels.length; i++) {
    const c = palette[pixels[i]];
    if (c) {
      outCtx.fillStyle = c;
      outCtx.fillRect(i % SPRITE_WIDTH, Math.floor(i / SPRITE_WIDTH), 1, 1);
    }
  }
  const pngDataUrl = outCanvas.toDataURL('image/png');
  return { pngDataUrl, pixels, palette, qa: stats };
}

export { centerSpriteInFrame };
