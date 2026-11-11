import { GEN_HEIGHT_384, GEN_WIDTH_256, SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants';
import { RGB } from '../types';
import { keyBackground, mapToPalette } from './chromaKey';
import { keepMainComponents, modeDownscale, removeOrphans } from './spriteCleanup';

const MAGENTA = { r: 255, g: 0, b: 255 };
/**
 * Only near-pure magenta (leftover key pixels from older characters) is hidden in the UI. The keyer already removes the real
 * background, so legitimate pink/magenta/green palette colors (pink hair) must stay visible.
 */
export const KEY_DISPLAY_TOLERANCE = 40;

function hexToRgb(hex: string): RGB {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/**
 * True for colors within `tolerance` of pure magenta (#FF00FF): leftovers from older characters. Green is NOT
 * hidden: green-keyed sprites never keep key pixels (the keyer removes them) and slime/goblin palettes are real.
 */
export function isKeyLike(r: number, g: number, b: number, tolerance = KEY_DISPLAY_TOLERANCE): boolean {
  return colorDistance({ r, g, b }, MAGENTA) < tolerance;
}

export function isKeyLikeHex(hex: string, tolerance = KEY_DISPLAY_TOLERANCE): boolean {
  const { r, g, b } = hexToRgb(hex);
  return isKeyLike(r, g, b, tolerance);
}

/** Legacy names: key-like palette entries are treated as transparent throughout the app. */
export function isMagentaLike(r: number, g: number, b: number, tolerance = KEY_DISPLAY_TOLERANCE): boolean {
  return isKeyLike(r, g, b, tolerance);
}

export function isMagentaLikeHex(hex: string, tolerance = KEY_DISPLAY_TOLERANCE): boolean {
  return isKeyLikeHex(hex, tolerance);
}

/**
 * Split a generated frame grid into indexed sprite frames. Each cell is
 * independently scaled and mapped onto the character's existing palette.
 */
export async function processAnimationSheet(
  base64Sheet: string,
  palette: (string | null)[],
  columns: number,
  rows: number,
  frameCount: number
): Promise<number[][]> {
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1 ||
      !Number.isInteger(frameCount) || frameCount < 1 || frameCount > columns * rows) {
    throw new Error('Animation sheet grid does not fit the requested frame count.');
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load generated animation sheet.'));
    image.src = base64Sheet;
  });

  const frames: number[][] = [];
  // Locked palette entries (skip index 0 and null); lockedIndex maps compact index -> real palette index.
  const lockedRgb: number[][] = [];
  const lockedIndex: number[] = [];
  for (let i = 1; i < palette.length; i++) {
    const color = palette[i];
    if (!color || isKeyLikeHex(color)) continue; // hidden entries would turn matched pixels into holes
    const { r, g, b } = hexToRgb(color);
    lockedRgb.push([r, g, b]);
    lockedIndex.push(i);
  }
  const cellWidth = img.width / columns;
  const cellHeight = img.height / rows;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const column = frameIndex % columns;
    const row = Math.floor(frameIndex / columns);
    const canvas = document.createElement('canvas');
    canvas.width = GEN_WIDTH_256;
    canvas.height = GEN_HEIGHT_384;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create animation frame canvas.');
    context.imageSmoothingEnabled = false;
    context.drawImage(
      img,
      column * cellWidth,
      row * cellHeight,
      cellWidth,
      cellHeight,
      0,
      0,
      GEN_WIDTH_256,
      GEN_HEIGHT_384
    );

    const { data } = context.getImageData(0, 0, GEN_WIDTH_256, GEN_HEIGHT_384);
    const { mask } = keyBackground(data, GEN_WIDTH_256, GEN_HEIGHT_384);
    const indexMap = mapToPalette(data, mask, lockedRgb);
    const mapped = new Uint8Array(indexMap.length);
    for (let i = 0; i < indexMap.length; i++) mapped[i] = indexMap[i] ? lockedIndex[indexMap[i] - 1] : 0;
    let frame = modeDownscale(mapped, GEN_WIDTH_256, GEN_HEIGHT_384, SPRITE_WIDTH, SPRITE_HEIGHT);
    frame = removeOrphans(frame);
    frame = keepMainComponents(frame);
    frames.push(frame);
  }
  return frames;
}
