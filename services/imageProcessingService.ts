
import { SPRITE_WIDTH, SPRITE_HEIGHT, TILE_SIZE } from "../constants";
import { SpriteMatrix, RGB, WorldTile } from "../types";

// Helper: Hex to RGB
const hexToRgb = (hex: string): RGB => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: 255
  } : { r: 0, g: 0, b: 0, a: 255 };
};

// Helper: RGB to Hex
const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

// Helper: Color Distance (Euclidean)
const colorDistance = (c1: RGB, c2: RGB): number => {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
};

const MAGENTA_REF: RGB = { r: 255, g: 0, b: 255, a: 255 };
const MAGENTA_TOLERANCE = 130; // Catch anti-aliased/compressed magenta (#FF66FF, etc.)

/** Any pink/magenta → treat as transparent. Used in pipeline and sprite sheet processing. */
export function isMagentaLike(r: number, g: number, b: number, tolerance = MAGENTA_TOLERANCE): boolean {
  return colorDistance({ r, g, b, a: 255 }, MAGENTA_REF) < tolerance;
}

/** Hex color (e.g. "#ff00ff") is magenta-like → treat as transparent when drawing. */
export function isMagentaLikeHex(hex: string, tolerance = MAGENTA_TOLERANCE): boolean {
  const c = hexToRgb(hex);
  return isMagentaLike(c.r, c.g, c.b, tolerance);
}

const isMagentaFringe = (r: number, g: number, b: number): boolean => isMagentaLike(r, g, b);

// Helper: Get Dominant Color (Max Coverage)
const getDominantColor = (data: Uint8ClampedArray): RGB => {
    const colorCounts: Record<string, number> = {};
    let maxCount = 0;
    let dominantKey = "255,0,255"; // Default to Magenta

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];
        
        if (a < 128) continue;

        const key = `${r},${g},${b}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;

        if (colorCounts[key] > maxCount) {
            maxCount = colorCounts[key];
            dominantKey = key;
        }
    }

    const [r, g, b] = dominantKey.split(',').map(Number);
    return { r, g, b };
};

// Programmatically generate a "Bob" frame for Idle
const generateIdleBobFrame = (basePixels: number[], width: number, height: number): number[] => {
    const newPixels = [...basePixels];
    // We want to shift the "Body" (Top ~35 pixels) down by 1 pixel.
    const SQUASH_ROW = 35; 
    
    // Work bottom-up to avoid overwriting needed data
    for (let y = SQUASH_ROW; y > 0; y--) {
        for (let x = 0; x < width; x++) {
            const currentIdx = y * width + x;
            const aboveIdx = (y - 1) * width + x;
            newPixels[currentIdx] = basePixels[aboveIdx];
        }
    }
    
    // Clear the top row since we shifted everything down
    for (let x = 0; x < width; x++) {
        newPixels[x] = 0; // Transparent
    }

    return newPixels;
};

export const processImageToMatrix = async (
  base64Image: string,
  existingPalette: (string | null)[] = [null]
): Promise<SpriteMatrix> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SPRITE_WIDTH;
      canvas.height = SPRITE_HEIGHT;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);

      const imageData = ctx.getImageData(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
      const data = imageData.data;
      const pixelCount = SPRITE_WIDTH * SPRITE_HEIGHT;

      // 1. Determine Background Color by Max Coverage
      const bgColor = getDominantColor(data);
      const bgTolerance = 110; // High tolerance for thorough removal

      const palette: (string | null)[] = [...existingPalette]; 
      const paletteMap = new Map<string, number>(); 
      
      // Initialize map with existing palette
      palette.forEach((color, idx) => {
        if (color) paletteMap.set(color, idx);
      });

      const pixels: number[] = new Array(pixelCount);

      for (let i = 0; i < pixelCount; i++) {
        const offset = i * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const a = data[offset + 3];

        // Transparent by alpha
        if (a < 128) {
          pixels[i] = 0;
          continue;
        }

        // Background Check (Dominant Color or Fringe)
        const isFringe = isMagentaFringe(r,g,b);
        const isBg = colorDistance({r,g,b}, bgColor) < bgTolerance;

        if (isBg || isFringe) {
            pixels[i] = 0; // Set to Transparent
            continue;
        }

        const current: RGB = { r, g, b };
        const hex = rgbToHex(r, g, b);

        let matchedIndex = -1;

        if (paletteMap.has(hex)) {
            matchedIndex = paletteMap.get(hex)!;
        } else {
            // Find closest color in palette
            let bestDist = Infinity;
            let bestIdx = -1;

            for (let p = 1; p < palette.length; p++) {
                const pColor = hexToRgb(palette[p] as string);
                const dist = colorDistance(current, pColor);
                if (dist < 40) { // Merging threshold
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestIdx = p;
                    }
                }
            }

            if (bestIdx !== -1) {
                matchedIndex = bestIdx;
                paletteMap.set(hex, matchedIndex);
            } else {
                // Never add magenta/pink to palette — treat as transparent
                if (isMagentaLike(r, g, b)) {
                  pixels[i] = 0;
                  continue;
                }
                palette.push(hex);
                matchedIndex = palette.length - 1;
                paletteMap.set(hex, matchedIndex);
            }
        }
        
        pixels[i] = matchedIndex;
      }

      const matrix: SpriteMatrix = {
        meta: { 
            name: "New_Character", 
            width: SPRITE_WIDTH, 
            height: SPRITE_HEIGHT, 
            created_at: Date.now(),
            fps: { idle: 0.5, walk: 4, special: 8 }
        },
        palette,
        pixels,
        matrix: {
            idle: [],
            walk: [],
            jump: [],
            special: []
        }
      };

      resolve(matrix);
    };
    img.onerror = (err) => reject(err);
    img.src = base64Image;
  });
};


export const processSpriteSheet = async (
    base64Sheet: string,
    existingPalette: (string | null)[],
    baseSpritePixels: number[] // We need the original base sprite to generate the Idle animation
): Promise<{ idle: number[][], walk: number[][], jump: number[][], special: number[][] }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            // The sheet is 3x3. We need to slice it.
            const cellW = img.width / 3;
            const cellH = img.height / 3;

            const extractFrame = (row: number, col: number): number[] => {
                const canvas = document.createElement('canvas');
                canvas.width = SPRITE_WIDTH;
                canvas.height = SPRITE_HEIGHT;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return [];

                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(
                    img, 
                    col * cellW, row * cellH, cellW, cellH, // Source
                    0, 0, SPRITE_WIDTH, SPRITE_HEIGHT // Dest
                );
                
                const imageData = ctx.getImageData(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
                const data = imageData.data;
                const pixels: number[] = [];

                // Determine BG color for THIS frame specifically
                const bgColor = getDominantColor(data);
                const bgTolerance = 110;

                for(let i=0; i<SPRITE_WIDTH*SPRITE_HEIGHT; i++) {
                    const off = i*4;
                    const r = data[off];
                    const g = data[off+1];
                    const b = data[off+2];
                    
                    const isFringe = isMagentaFringe(r,g,b);
                    const isBg = colorDistance({r,g,b}, bgColor) < bgTolerance;

                    if (isBg || isFringe) {
                        pixels.push(0);
                        continue;
                    }

                    // Find closest color in EXISTING palette (skip magenta-like entries)
                    let bestIdx = 0;
                    let bestDist = Infinity;
                    for (let p = 1; p < existingPalette.length; p++) {
                        const hex = existingPalette[p];
                        if (!hex || isMagentaLikeHex(hex)) continue;
                        const pColor = hexToRgb(hex);
                        const dist = colorDistance({ r, g, b }, pColor);
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestIdx = p;
                        }
                    }
                    pixels.push(bestIdx);
                }
                return pixels;
            };

            // Programmatically Generate Idle
            // Frame 1 is the Base Sprite.
            // Frame 2 is the "Squashed" Bob frame.
            const idleFrames = [
                [...baseSpritePixels],
                generateIdleBobFrame(baseSpritePixels, SPRITE_WIDTH, SPRITE_HEIGHT)
            ];

            // Grid Layout Mapping (0-indexed rows/cols) matches geminiService prompt
            // Row 1: Walk A, Walk B, Jump
            const walkFrames = [extractFrame(0, 0), extractFrame(0, 1)];
            const jumpFrames = [extractFrame(0, 2)];

            // Row 2: Special 1, Special 2, Special 3
            const specialFrames = [extractFrame(1, 0), extractFrame(1, 1), extractFrame(1, 2)];

            // Row 3: Special 4, Special 5, Special 6
            specialFrames.push(extractFrame(2, 0));
            specialFrames.push(extractFrame(2, 1));
            specialFrames.push(extractFrame(2, 2));

            resolve({
                idle: idleFrames,
                walk: walkFrames,
                jump: jumpFrames,
                special: specialFrames
            });
        };
        img.onerror = reject;
        img.src = base64Sheet;
    });
}

export const processTileset = async (base64Sheet: string): Promise<WorldTile[]> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const rows = 4;
            const cols = 4;
            const cellW = img.width / cols;
            const cellH = img.height / rows;
            
            const tiles: WorldTile[] = [];

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const canvas = document.createElement('canvas');
                    canvas.width = TILE_SIZE;
                    canvas.height = TILE_SIZE;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) continue;

                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, c * cellW, r * cellH, cellW, cellH, 0, 0, TILE_SIZE, TILE_SIZE);
                    
                    const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
                    const data = imageData.data;
                    const pixels: number[] = [];
                    const palette: (string | null)[] = [null]; // Start with transparent
                    const paletteMap = new Map<string, number>();

                    const bgColor = getDominantColor(data);
                    const bgTolerance = 110;

                    for(let i=0; i<TILE_SIZE*TILE_SIZE; i++) {
                        const off = i*4;
                        const r = data[off];
                        const g = data[off+1];
                        const b = data[off+2];
                        const a = data[off+3];

                        if (a < 128) {
                            pixels.push(0);
                            continue;
                        }

                        const isFringe = isMagentaLike(r, g, b);
                        const isBg = colorDistance({r,g,b}, bgColor) < bgTolerance;

                        if (isBg || isFringe) {
                            pixels.push(0);
                            continue;
                        }

                        const hex = rgbToHex(r, g, b);
                        if (isMagentaLikeHex(hex)) {
                            pixels.push(0);
                            continue;
                        }
                        if (!paletteMap.has(hex)) {
                            palette.push(hex);
                            paletteMap.set(hex, palette.length - 1);
                        }
                        pixels.push(paletteMap.get(hex)!);
                    }
                    
                    tiles.push({
                        id: `tile_${r}_${c}`,
                        pixels,
                        palette,
                        isWall: false, // Default
                        name: `Tile ${tiles.length + 1}`
                    });
                }
            }
            resolve(tiles);
        };
        img.onerror = reject;
        img.src = base64Sheet;
    });
};
