import { SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants';
import { RGB } from '../types';

const MAGENTA = { r: 255, g: 0, b: 255 };
const MAGENTA_TOLERANCE = 130;

function hexToRgb(hex: string): RGB {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export function isMagentaLike(r: number, g: number, b: number, tolerance = MAGENTA_TOLERANCE): boolean {
  return colorDistance({ r, g, b }, MAGENTA) < tolerance;
}

/** Magenta-like palette entries are treated as transparent throughout the app. */
export function isMagentaLikeHex(hex: string, tolerance = MAGENTA_TOLERANCE): boolean {
  const { r, g, b } = hexToRgb(hex);
  return isMagentaLike(r, g, b, tolerance);
}

function getDominantColor(data: Uint8ClampedArray): RGB {
  const counts = new Map<string, number>();
  let best = '255,0,255';
  let maxCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > maxCount) {
      best = key;
      maxCount = count;
    }
  }
  const [r, g, b] = best.split(',').map(Number);
  return { r, g, b };
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
  const cellWidth = img.width / columns;
  const cellHeight = img.height / rows;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const column = frameIndex % columns;
    const row = Math.floor(frameIndex / columns);
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_WIDTH;
    canvas.height = SPRITE_HEIGHT;
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
      SPRITE_WIDTH,
      SPRITE_HEIGHT
    );

    const { data } = context.getImageData(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
    const background = getDominantColor(data);
    const frame = new Array<number>(SPRITE_WIDTH * SPRITE_HEIGHT).fill(0);
    for (let i = 0; i < frame.length; i++) {
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (data[offset + 3] < 128 || isMagentaLike(r, g, b) ||
          colorDistance({ r, g, b }, background) < 75) {
        continue;
      }

      let closestIndex = 0;
      let closestDistance = Infinity;
      for (let colorIndex = 1; colorIndex < palette.length; colorIndex++) {
        const color = palette[colorIndex];
        if (!color || isMagentaLikeHex(color)) continue;
        const distance = colorDistance({ r, g, b }, hexToRgb(color));
        if (distance < closestDistance) {
          closestIndex = colorIndex;
          closestDistance = distance;
        }
      }
      frame[i] = closestIndex;
    }
    frames.push(frame);
  }
  return frames;
}
