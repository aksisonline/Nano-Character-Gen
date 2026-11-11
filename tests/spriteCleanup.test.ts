// @ts-nocheck — runs under `bun test`; not part of the app/worker type-check.
import { describe, expect, test } from 'bun:test'
import { keepMainComponents, mergePalette, modeDownscale, removeOrphans, centerSpriteInFrame } from '../services/spriteCleanup'

const W = 32
const H = 48
const blank = () => new Array(W * H).fill(0)
const set = (p: number[], x: number, y: number, v: number) => { p[y * W + x] = v }
function fill(p: number[], x0: number, y0: number, x1: number, y1: number, v: number) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(p, x, y, v)
}

describe('spriteCleanup', () => {
  test('modeDownscale picks block mode and drops mostly-background blocks', () => {
    const src = new Uint8Array(16 * 16)
    // block (0,0) 8x8: mostly 2, a few 3
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) src[y * 16 + x] = 2
    for (let x = 0; x < 3; x++) src[x] = 3
    // block (1,0): 40 of 64 background -> transparent
    for (let y = 0; y < 8; y++) for (let x = 8; x < 16; x++) src[y * 16 + x] = y < 3 ? 4 : 0
    const out = modeDownscale(src, 16, 16, 2, 2)
    expect(out[0]).toBe(2)
    expect(out[1]).toBe(0)
    expect(out[2]).toBe(0)
  })

  test('removeOrphans drops an isolated pixel', () => {
    const p = blank()
    fill(p, 10, 10, 20, 30, 1)
    set(p, 3, 3, 1)
    const out = removeOrphans(p)
    expect(out[3 * W + 3]).toBe(0)
    expect(out[15 * W + 15]).toBe(1)
  })

  test('removeOrphans fills a 1px interior hole', () => {
    const p = blank()
    fill(p, 10, 10, 20, 30, 1)
    set(p, 15, 15, 0)
    expect(removeOrphans(p)[15 * W + 15]).toBe(1)
  })

  test('removeOrphans recolors a lonely color inside a region', () => {
    const p = blank()
    fill(p, 10, 10, 20, 30, 1)
    set(p, 15, 15, 2)
    expect(removeOrphans(p)[15 * W + 15]).toBe(1)
  })

  test('keepMainComponents drops a far tiny component, keeps near and big ones', () => {
    const p = blank()
    fill(p, 10, 10, 20, 30, 1)
    set(p, 2, 40, 1) // far speck
    set(p, 21, 15, 1) // within 2px of main body -> kept
    fill(p, 2, 2, 5, 5, 1) // 9px far component -> kept (>= 6)
    const out = keepMainComponents(p)
    expect(out[40 * W + 2]).toBe(0)
    expect(out[15 * W + 21]).toBe(1)
    expect(out[3 * W + 3]).toBe(1)
    expect(out[15 * W + 15]).toBe(1)
  })

  test('mergePalette merges close colors and compacts the palette', () => {
    const p = blank()
    fill(p, 5, 5, 15, 15, 1)
    fill(p, 15, 5, 17, 15, 2) // near-duplicate of 1
    fill(p, 20, 5, 25, 15, 3)
    const { pixels, palette } = mergePalette(p, [null, '#102030', '#142434', '#ff0000'], 24)
    expect(palette).toEqual([null, '#102030', '#ff0000'])
    expect(pixels[5 * W + 15]).toBe(1)
    expect(pixels[5 * W + 20]).toBe(2)
    expect(pixels[0]).toBe(0)
  })

  test('centerSpriteInFrame centers content', () => {
    const p = blank()
    fill(p, 0, 0, 4, 6, 1)
    const out = centerSpriteInFrame(p, [null, '#ffffff'])
    expect(out[21 * W + 14]).toBe(1)
    expect(out[0]).toBe(0)
  })
})
