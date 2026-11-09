import { SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants';
import {
  CHARACTER_DOC_VERSION, MAX_ANIMATIONS, MAX_FRAMES, MAX_NAME, MAX_PALETTE, MAX_TEXT,
  packPixels, unpackPixels, type CharacterDoc,
} from '../shared/character';
import type { SpriteMatrix } from '../types';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : min)));

/** Editable state -> storable JSON. Only values are stored, never rendered images. */
export function toDoc(matrix: SpriteMatrix, prompt: string): CharacterDoc {
  const palette = matrix.palette.slice(0, MAX_PALETTE);
  return {
    v: CHARACTER_DOC_VERSION,
    name: (matrix.meta.name === 'init' ? 'Untitled' : matrix.meta.name).trim().slice(0, MAX_NAME) || 'Untitled',
    prompt: prompt.slice(0, MAX_TEXT),
    palette,
    pixels: packPixels(matrix.pixels, palette.length),
    animations: matrix.animations.slice(0, MAX_ANIMATIONS).map((a) => ({
      id: a.id.slice(0, 40),
      name: (a.name.trim() || 'Clip').slice(0, 60),
      prompt: a.prompt.slice(0, MAX_TEXT),
      frameCount: clamp(a.frameCount, 1, MAX_FRAMES),
      fps: clamp(a.fps, 1, 60),
      loop: !!a.loop,
      frames: a.frames.slice(0, MAX_FRAMES).map((f) => packPixels(f, palette.length)),
    })),
  };
}

/** Stored JSON -> studio state. The sprite is re-rendered from these values by the canvas. */
export function fromDoc(doc: CharacterDoc): { matrix: SpriteMatrix; prompt: string } {
  return {
    prompt: doc.prompt,
    matrix: {
      meta: { name: doc.name, width: SPRITE_WIDTH, height: SPRITE_HEIGHT, created_at: Date.now() },
      palette: [...doc.palette],
      pixels: unpackPixels(doc.pixels),
      animations: doc.animations.map((a) => ({
        ...a,
        frames: a.frames.map(unpackPixels),
        status: a.frames.length ? 'ready' : 'empty',
      })),
    },
  };
}
