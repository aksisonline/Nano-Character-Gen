import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants';
import { isMagentaLikeHex } from '../services/imageProcessingService';

type PaletteColor = string | null;
type GifPalette = [number, number, number][];

const MAX_GIF_COLORS = 256;
const TRANSPARENT_INDEX = 0;

function parseColor(color: string): [number, number, number] {
  const hex = color.trim().replace(/^#/, '');
  if (!/^[\da-f]{3}([\da-f])?$|^[\da-f]{6}([\da-f]{2})?$/i.test(hex)) {
    throw new Error(`Invalid palette color: ${color}`);
  }
  const expanded = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

/**
 * Encodes palette-indexed sprite frames as a browser GIF. Palette index 0 is
 * always transparent; null and magenta-like palette entries are also treated
 * as transparent. Colors beyond GIF's 256-entry limit are quantized safely.
 */
export function encodeSpriteGif(
  frames: number[][],
  palette: PaletteColor[],
  fps: number,
  loop = true,
  scale = 1,
): Uint8Array {
  if (!frames.length) throw new Error('At least one frame is required');
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('fps must be positive');
  if (!Number.isInteger(scale) || scale < 1) throw new Error('scale must be a positive integer');
  const pixelCount = frames[0].length;
  if (pixelCount !== SPRITE_WIDTH * SPRITE_HEIGHT) {
    throw new Error(`Frames must contain ${SPRITE_WIDTH * SPRITE_HEIGHT} pixels`);
  }
  if (frames.some((frame) => frame.length !== pixelCount)) {
    throw new Error('All frames must have the same dimensions');
  }

  const colors: [number, number, number][] = [];
  const sourceToColor = new Map<number, number>();
  palette.forEach((entry, index) => {
    if (index === TRANSPARENT_INDEX || !entry) return;
    if (isMagentaLikeHex(entry)) return;
    const rgb = parseColor(entry);
    sourceToColor.set(index, colors.length + 1);
    colors.push(rgb);
  });

  const indexedFrames = frames.map((frame) => {
    const rgba = new Uint8Array(pixelCount * 4);
    frame.forEach((sourceIndex, pixel) => {
      const colorIndex = sourceToColor.get(sourceIndex);
      if (colorIndex === undefined) return;
      const [r, g, b] = colors[colorIndex - 1];
      const offset = pixel * 4;
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = 255;
    });
    return rgba;
  });

  let gifPalette: GifPalette;
  if (colors.length + 1 <= MAX_GIF_COLORS) {
    gifPalette = [[0, 0, 0], ...colors];
  } else {
    // Quantize opaque pixels only, reserving index 0 exclusively for transparency.
    const opaquePixels = new Uint8Array(indexedFrames.reduce((n, f) => n + f.length / 4, 0) * 3);
    let cursor = 0;
    for (const frame of indexedFrames) {
      for (let i = 0; i < frame.length; i += 4) {
        if (!frame[i + 3]) continue;
        opaquePixels[cursor++] = frame[i];
        opaquePixels[cursor++] = frame[i + 1];
        opaquePixels[cursor++] = frame[i + 2];
      }
    }
    gifPalette = [[0, 0, 0], ...quantize(opaquePixels.subarray(0, cursor), 255).map((c) => [c[0], c[1], c[2]] as [number, number, number])];
  }

  const encoder = GIFEncoder();
  const delay = Math.max(1, Math.round(1000 / fps));
  for (const [frameIndex, rgba] of indexedFrames.entries()) {
    const pixels = new Uint8Array(pixelCount);
    if (colors.length + 1 <= MAX_GIF_COLORS) {
      for (let p = 0; p < pixelCount; p++) {
        if (rgba[p * 4 + 3]) {
          const rgb = [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]];
          pixels[p] = colors.findIndex((c) => c[0] === rgb[0] && c[1] === rgb[1] && c[2] === rgb[2]) + 1;
        }
      }
    } else {
      const mapped = applyPalette(rgba, gifPalette.slice(1), 'rgb565');
      for (let p = 0; p < pixelCount; p++) if (rgba[p * 4 + 3]) pixels[p] = mapped[p] + 1;
    }
    const scaled = new Uint8Array(pixelCount * scale * scale);
    const outWidth = SPRITE_WIDTH * scale;
    const outHeight = SPRITE_HEIGHT * scale;
    for (let y = 0; y < SPRITE_HEIGHT; y++) for (let x = 0; x < SPRITE_WIDTH; x++) {
      const value = pixels[y * SPRITE_WIDTH + x];
      for (let sy = 0; sy < scale; sy++) scaled.fill(value, (y * scale + sy) * outWidth + x * scale, (y * scale + sy) * outWidth + (x + 1) * scale);
    }
    encoder.writeFrame(scaled, outWidth, outHeight, {
      palette: frameIndex === 0 ? gifPalette : undefined,
      delay,
      transparent: true,
      transparentIndex: TRANSPARENT_INDEX,
      repeat: loop ? 0 : -1,
    });
  }
  encoder.finish();
  return encoder.bytes();
}

export function downloadSpriteGif(
  frames: number[][],
  palette: PaletteColor[],
  fps: number,
  loop = true,
  scale = 1,
  filename = 'animation.gif',
): void {
  const blob = new Blob([encodeSpriteGif(frames, palette, fps, loop, scale)], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.toLowerCase().endsWith('.gif') ? filename : `${filename}.gif`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
