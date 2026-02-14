export const SPRITE_WIDTH = 32;
export const SPRITE_HEIGHT = 48;
export const GENERATION_SCALE = 16;
export const GEN_WIDTH = SPRITE_WIDTH * GENERATION_SCALE; // 512
export const GEN_HEIGHT = SPRITE_HEIGHT * GENERATION_SCALE; // 768

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