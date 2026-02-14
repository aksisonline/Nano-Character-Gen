
export interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface AnimationMeta {
  idle: number;
  walk: number;
  special: number;
}

export interface SpriteMatrix {
  meta: {
    name: string;
    width: number;
    height: number;
    fps: AnimationMeta;
    created_at: number;
  };
  palette: (string | null)[]; // Hex codes, null is transparent
  pixels: number[]; // 1D array of indices pointing to palette for the Base Sprite (Editor view)
  // The matrix object holds the animation frames
  matrix: {
    idle: number[][]; 
    walk: number[][];
    jump: number[][];
    special: number[][];
  };
}

export interface ProcessingConfig {
  targetWidth: number;
  targetHeight: number;
  colorTolerance: number; // For background removal
  maxPaletteSize: number;
}

export enum ToolMode {
  PENCIL = 'PENCIL',
  ERASER = 'ERASER',
  PICKER = 'PICKER',
  BUCKET = 'BUCKET'
}

export enum AppPhase {
  EDITOR = 'EDITOR',
  ANIMATOR = 'ANIMATOR'
}

export enum EngineMode {
  CHARACTER = 'CHARACTER',
  WORLD = 'WORLD'
}

export interface WorldTile {
  id: string;
  pixels: number[];
  palette: (string | null)[];
  isWall: boolean;
  name: string;
}

export interface WorldData {
  width: number;
  height: number;
  map: number[]; // 1D array of Tile Indices (not palette indices, but index in the tileset array)
  tileset: WorldTile[];
}
