// @ts-nocheck — OBSOLETE: baselined the pre-keyer pipeline (quantizeSprite was removed from services/spritePipeline.ts).
/**
 * Runs the app's REAL pipeline functions (services/spritePipeline.ts) on a raw 256x384 RGBA file.
 * Usage: bun scripts/research/baseline.ts <rgba-file> <out-json>
 * Writes { palette, quantized, raw32x48, centered }.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  quantizeSprite,
  downscaleTo32x48Nearest,
  centerSpriteInFrame,
} from '../../services/spritePipeline';
import { GEN_WIDTH_256, GEN_HEIGHT_384, SPRITE_WIDTH, SPRITE_HEIGHT, MAX_PALETTE_COLORS } from '../../constants';

const [rgbaPath, outPath] = process.argv.slice(2);
const buf = readFileSync(rgbaPath);
const data = new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
const imageData = { data, width: GEN_WIDTH_256, height: GEN_HEIGHT_384 } as ImageData;

const { data: quantized, palette } = quantizeSprite(imageData, MAX_PALETTE_COLORS);
const { pixels: raw } = downscaleTo32x48Nearest(quantized, palette, GEN_WIDTH_256, GEN_HEIGHT_384);
const centered = centerSpriteInFrame(raw, palette, SPRITE_WIDTH, SPRITE_HEIGHT);
writeFileSync(outPath, JSON.stringify({ palette, quantized: Array.from(quantized), raw32x48: raw, centered }));
