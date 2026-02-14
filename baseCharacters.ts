import { SpriteMatrix } from './types';
import { INITIAL_PALETTE, SPRITE_WIDTH, SPRITE_HEIGHT } from './constants';

const W = SPRITE_WIDTH;
const H = SPRITE_HEIGHT;
const TOTAL = W * H;

// Fill a rectangle (in pixel indices) with a palette index. x,y are top-left; w,h in pixels.
function fillRect(pixels: number[], x: number, y: number, w: number, h: number, colorIndex: number) {
  for (let row = y; row < y + h && row < H; row++) {
    for (let col = x; col < x + w && col < W; col++) {
      pixels[row * W + col] = colorIndex;
    }
  }
}

// Outline a rectangle (border only)
function outlineRect(pixels: number[], x: number, y: number, w: number, h: number, colorIndex: number) {
  for (let col = x; col < x + w && col < W; col++) {
    if (y >= 0) pixels[y * W + col] = colorIndex;
    if (y + h - 1 < H) pixels[(y + h - 1) * W + col] = colorIndex;
  }
  for (let row = y; row < y + h && row < H; row++) {
    if (x >= 0) pixels[row * W + x] = colorIndex;
    if (x + w - 1 < W) pixels[row * W + (x + w - 1)] = colorIndex;
  }
}

function createBaseMatrix(name: string, pixels: number[]): SpriteMatrix {
  return {
    meta: {
      name,
      width: W,
      height: H,
      created_at: Date.now(),
      fps: { idle: 0.5, walk: 4, special: 8 },
    },
    palette: [...INITIAL_PALETTE],
    pixels: [...pixels],
    matrix: { idle: [], walk: [], jump: [], special: [] },
  };
}

// Knight: blocky armor, helmet, sword silhouette
function knightPixels(): number[] {
  const p = new Array(TOTAL).fill(0);
  const black = 1, white = 2, red = 3;
  // Helmet (wide)
  fillRect(p, 12, 2, 8, 6, black);
  fillRect(p, 14, 3, 4, 4, white);
  // Visor
  fillRect(p, 15, 4, 2, 2, black);
  // Body (armor)
  fillRect(p, 11, 10, 10, 18, black);
  outlineRect(p, 11, 10, 10, 18, white);
  fillRect(p, 14, 12, 4, 4, red); // chest
  // Legs
  fillRect(p, 12, 28, 5, 18, black);
  fillRect(p, 15, 28, 5, 18, black);
  outlineRect(p, 12, 28, 5, 18, white);
  outlineRect(p, 15, 28, 5, 18, white);
  // Sword (right side)
  fillRect(p, 22, 12, 2, 20, white);
  fillRect(p, 21, 10, 4, 4, black);
  return p;
}

// Mage: robe, pointy hat, staff
function magePixels(): number[] {
  const p = new Array(TOTAL).fill(0);
  const black = 1, white = 2, blue = 5;
  // Pointy hat
  fillRect(p, 14, 0, 4, 4, blue);
  fillRect(p, 13, 4, 6, 4, blue);
  fillRect(p, 12, 8, 8, 4, blue);
  fillRect(p, 14, 3, 2, 2, white); // star
  // Face
  fillRect(p, 14, 12, 4, 4, white);
  fillRect(p, 15, 13, 2, 2, black); // eyes
  // Robe
  fillRect(p, 10, 18, 12, 28, blue);
  outlineRect(p, 10, 18, 12, 28, black);
  fillRect(p, 14, 22, 4, 6, white); // belt
  // Staff (left)
  fillRect(p, 6, 8, 2, 38, black);
  fillRect(p, 5, 6, 4, 4, white); // orb
  return p;
}

// Rogue: slim, hood, dagger
function roguePixels(): number[] {
  const p = new Array(TOTAL).fill(0);
  const black = 1, white = 2, green = 4;
  // Hood
  fillRect(p, 13, 2, 6, 10, green);
  outlineRect(p, 13, 2, 6, 10, black);
  fillRect(p, 15, 5, 2, 2, white); // eyes
  // Torso (slim)
  fillRect(p, 13, 12, 6, 14, black);
  fillRect(p, 14, 14, 4, 2, green);
  // Legs (narrow)
  fillRect(p, 14, 26, 3, 20, black);
  fillRect(p, 15, 26, 3, 20, black);
  // Dagger
  fillRect(p, 21, 14, 2, 16, white);
  fillRect(p, 20, 12, 4, 4, black);
  return p;
}

export const BASE_CHARACTERS: { id: string; name: string; matrix: SpriteMatrix }[] = [
  { id: 'knight', name: 'Knight', matrix: createBaseMatrix('Knight', knightPixels()) },
  { id: 'mage', name: 'Mage', matrix: createBaseMatrix('Mage', magePixels()) },
  { id: 'rogue', name: 'Rogue', matrix: createBaseMatrix('Rogue', roguePixels()) },
];
