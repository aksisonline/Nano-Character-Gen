// @ts-nocheck — runs under `bun test`; not part of the app/worker type-check.
import { describe, expect, test } from 'bun:test'
import { contrastDownscale, simplifyPalette, smoothShading } from '../services/spriteCleanup'

describe('simplifyPalette', () => {
  test('merges near-identical greys, count-weighted', () => {
    const r = simplifyPalette([[150, 150, 150], [154, 154, 155], [152, 151, 150]], [100, 10, 10], 10)
    expect(r.palette.length).toBe(1)
    expect(r.map).toEqual([0, 0, 0])
  })
  test('keeps a tiny distinct accent (red among greys, cyan visor)', () => {
    const r = simplifyPalette([[150, 150, 150], [156, 156, 156], [200, 30, 40], [0, 220, 230]], [5000, 4000, 3, 2], 14)
    expect(r.palette.length).toBe(3)
    expect(r.map[0]).toBe(r.map[1])
    expect(new Set(r.map).size).toBe(3)
  })
  test('dark outline is not dissolved into slightly lighter dark shade', () => {
    const r = simplifyPalette([[3, 2, 32], [30, 30, 50]], [100, 100], 14)
    expect(r.palette.length).toBe(2)
  })
})

describe('smoothShading', () => {
  const pal = [null, '#909090', '#949494', '#101010']
  test('snaps a near-color pixel to the neighbor majority', () => {
    const w = 5, h = 5
    const p = new Array(w * h).fill(1)
    p[12] = 2
    expect(smoothShading(p, pal, w, h)[12]).toBe(1)
  })
  test('preserves a high-contrast single pixel', () => {
    const w = 5, h = 5
    const p = new Array(w * h).fill(1)
    p[12] = 3
    expect(smoothShading(p, pal, w, h)[12]).toBe(3)
  })
})

describe('contrastDownscale', () => {
  test('a thin high-contrast stroke is not outvoted by the dominant color', () => {
    const pal = [null, '#fac4a3', '#030220']
    const src = new Uint8Array(16 * 16).fill(1)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 6; x++) src[y * 16 + x] = 2 // 37% dark of block (0,0)... block 8x8: 6/8
    const out = contrastDownscale(src, 16, 16, pal, 2, 2, 0.35, 50)
    expect(out[0]).toBe(2)
    const src2 = new Uint8Array(16 * 16).fill(1)
    src2[0] = 2
    expect(contrastDownscale(src2, 16, 16, pal, 2, 2, 0.35, 50)[0]).toBe(1)
  })
})
