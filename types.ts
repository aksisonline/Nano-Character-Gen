
export interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** Generation progress of a single user-defined animation. */
export type AnimationStatus = 'empty' | 'generating' | 'ready' | 'error';

/**
 * One animation of a character. Animations are defined one by one by the user:
 * a name, a motion description used to prompt the model, and playback settings.
 */
export interface SpriteAnimation {
  id: string;
  name: string;
  /** Motion description, e.g. "a slow two frame breathing bob in place". */
  prompt: string;
  /** Number of frames requested when generating this animation. */
  frameCount: number;
  /** Frames per second used for preview playback and GIF export. */
  fps: number;
  /** Loop forever (true) or play once and hold the last frame (false). */
  loop: boolean;
  /** Each frame is a 1D array of palette indices, SPRITE_WIDTH * SPRITE_HEIGHT long. */
  frames: number[][];
  status: AnimationStatus;
}

export interface SpriteMatrix {
  meta: {
    name: string;
    width: number;
    height: number;
    created_at: number;
  };
  palette: (string | null)[]; // Hex codes, null is transparent
  pixels: number[]; // 1D array of indices pointing to palette for the Base Sprite (Editor view)
  animations: SpriteAnimation[];
}

export enum ToolMode {
  PENCIL = 'PENCIL',
  ERASER = 'ERASER',
  PICKER = 'PICKER'
}

export enum AppPhase {
  CREATE = 'CREATE',
  EDITOR = 'EDITOR',
  ANIMATOR = 'ANIMATOR'
}
