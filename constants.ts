/** Final sprite dimensions (pixel-perfect game asset). */
export const SPRITE_WIDTH = 32;
export const SPRITE_HEIGHT = 48;

/** Generation pipeline: AI outputs at 8× resolution, then we downscale with nearest-neighbor. */
export const GENERATION_SCALE_8X = 8;
export const GEN_WIDTH_256 = SPRITE_WIDTH * GENERATION_SCALE_8X; // 256
export const GEN_HEIGHT_384 = SPRITE_HEIGHT * GENERATION_SCALE_8X; // 384

/** Legacy names for compatibility. */
export const GENERATION_SCALE = GENERATION_SCALE_8X;
export const GEN_WIDTH = GEN_WIDTH_256;
export const GEN_HEIGHT = GEN_HEIGHT_384;

/** Max palette size for quantize step. */
export const MAX_PALETTE_COLORS = 24;

/** Allowed preview scales (integer only — no CSS scaling). */
export const PREVIEW_SCALES = [4, 6, 8, 12] as const;
export const DEFAULT_PREVIEW_SCALE = 8;

/** UI grid (all spacing snaps to multiples). */
export const GRID_UNIT = 8;

/** Checkerboard background for transparency. */
export const CHECKER_LIGHT = '#2d3748';
export const CHECKER_DARK = '#1a202c';

/* ---------------------------------------------------------------------------
   Animations — the user defines them one by one
   --------------------------------------------------------------------------- */

/** Frame counts an animation can be generated with. */
export const FRAME_COUNT_OPTIONS = [1, 2, 3, 4, 6, 8] as const;
export const DEFAULT_FRAME_COUNT = 4;

/** Playback rates offered per animation. */
export const FPS_OPTIONS = [1, 2, 4, 6, 8, 12, 24] as const;
export const DEFAULT_FPS = 6;

/** Starter presets offered when adding an animation. */
export const ANIMATION_PRESETS: { name: string; prompt: string }[] = [
  { name: 'Idle', prompt: 'a gentle breathing bob in place, standing, arms relaxed' },
  { name: 'Walk', prompt: 'a side-view walk cycle, left foot forward then right foot forward' },
  { name: 'Run', prompt: 'a fast running cycle, leaning forward, arms pumping' },
  { name: 'Jump', prompt: 'a jump: crouch, launch upward, then land and settle' },
  { name: 'Attack', prompt: 'a sword slash: wind up, swing, then recover to stance' },
  { name: 'Hurt', prompt: 'a hit reaction: recoil backwards, then return to stance' },
];

/* ---------------------------------------------------------------------------
   GIF export
   --------------------------------------------------------------------------- */

/** Integer upscales offered for GIF export (no fractional scaling). */
export const GIF_EXPORT_SCALES = [1, 2, 4, 6, 8] as const;
export const DEFAULT_GIF_EXPORT_SCALE = 6;


/**
 * Character gen strategy: AI (e.g. Gemini) cannot reliably output exact 32x48 pixel art.
 * We request a higher-resolution image (3:4 aspect) with clear "large eyes" (3x3 px) in the prompt,
 * then downsample to 32x48 in runSpritePipeline with imageSmoothingEnabled = false so details
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
