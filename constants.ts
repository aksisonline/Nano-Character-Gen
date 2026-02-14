
export const SPRITE_WIDTH = 32;
export const SPRITE_HEIGHT = 48;
/** Scale used when asking the model for a higher-res image; we then downsample to SPRITE_WIDTH x SPRITE_HEIGHT with no smoothing to get crisp pixels. */
export const GENERATION_SCALE = 16;
export const GEN_WIDTH = SPRITE_WIDTH * GENERATION_SCALE; // 512
export const GEN_HEIGHT = SPRITE_HEIGHT * GENERATION_SCALE; // 768

export const TILE_SIZE = 32;
export const WORLD_WIDTH = 200;
export const WORLD_HEIGHT = 500;

/**
 * Character gen strategy: AI (e.g. Gemini) cannot reliably output exact 32x48 pixel art.
 * We request a higher-resolution image (3:4 aspect) with clear "large eyes" (3x3 px) in the prompt,
 * then downsample to 32x48 in processImageToMatrix with imageSmoothingEnabled = false so details
 * (especially eyes) survive as crisp pixels. No extra de-rez step is needed beyond that.
 */

export const INITIAL_PALETTE: (string | null)[] = [
  null, // Transparent
  '#000000', // Black
  '#ffffff', // White
  '#ff0044', // Red
  '#00cc99', // Green
  '#3366ff', // Blue
];

// Initialize an empty grid
export const EMPTY_MATRIX_PIXELS = new Array(SPRITE_WIDTH * SPRITE_HEIGHT).fill(0); // All transparent

export const MODEL_NAME = 'gemini-2.5-flash-image';
export const THINKING_MODEL_NAME = 'gemini-2.5-flash-thinking-preview'; // Fallback if needed for text logic
