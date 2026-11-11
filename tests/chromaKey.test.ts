// @ts-nocheck — runs under `bun test`; not part of the app/worker type-check.
import { describe, expect, test } from 'bun:test'
import { keyBackground, mapToPalette, medianCutPalette } from '../services/chromaKey'

type Img = { data: Uint8ClampedArray; w: number; h: number }

function make(w: number, h: number, bg: (x: number, y: number) => [number, number, number]): Img {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = bg(x, y)
      const o = (y * w + x) * 4
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255
    }
  return { data, w, h }
}
function rect(im: Img, x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const o = (y * im.w + x) * 4
      im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]
    }
}
function ellipse(im: Img, cx: number, cy: number, rx: number, ry: number, c: [number, number, number]) {
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
        const o = (y * im.w + x) * 4
        im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]
      }
}
const MAG: [number, number, number] = [255, 0, 255]
const GRN: [number, number, number] = [0, 255, 0]
const isBg = (m: Uint8Array, w: number, x: number, y: number) => m[y * w + x] === 1

/** Small "character": blue body, skin head, two dark legs. */
function character(bg: (x: number, y: number) => [number, number, number]): Img {
  const im = make(64, 96, bg)
  rect(im, 24, 10, 40, 26, [230, 190, 150]) // head
  rect(im, 20, 26, 44, 60, [40, 90, 200]) // body
  rect(im, 22, 60, 30, 84, [60, 40, 30]) // left leg
  rect(im, 34, 60, 42, 84, [60, 40, 30]) // right leg
  return im
}

describe('keyBackground', () => {
  test('flat magenta background is keyed, character survives', () => {
    const im = character(() => MAG)
    const { mask, stats } = keyBackground(im.data, im.w, im.h)
    expect(isBg(mask, im.w, 2, 2)).toBe(true)
    expect(isBg(mask, im.w, 32, 40)).toBe(false)
    expect(isBg(mask, im.w, 32, 18)).toBe(false)
    expect(stats.bgColor).toBe('#ff00ff')
    expect(stats.keyConflict).toBe(false)
    expect(stats.shadowSuspect).toBe(false)
    expect(stats.fgPixels).toBe(16 * 16 + 24 * 34 + 2 * 8 * 24)
  })

  test('vignette gradient of the same hue is keyed', () => {
    const im = character((x, y) => {
      const d = Math.hypot(x - 32, y - 48) / 60
      const k = 1 - 0.55 * Math.min(1, d)
      return [Math.round(255 * k), 0, Math.round(255 * k)]
    })
    const { mask } = keyBackground(im.data, im.w, im.h)
    for (const [x, y] of [[0, 0], [63, 0], [0, 95], [63, 95], [5, 50], [60, 50]]) expect(isBg(mask, im.w, x, y)).toBe(true)
    expect(isBg(mask, im.w, 32, 40)).toBe(false)
  })

  test('darker same-hue shadow under feet is keyed', () => {
    const im = character(() => MAG)
    ellipse(im, 32, 86, 16, 4, [140, 0, 140])
    const { mask, stats } = keyBackground(im.data, im.w, im.h)
    expect(isBg(mask, im.w, 32, 87)).toBe(true)
    expect(stats.shadowSuspect).toBe(false)
  })

  test('enclosed background pocket between arm and body is removed', () => {
    const im = make(64, 96, () => MAG)
    rect(im, 16, 10, 48, 80, [40, 90, 200]) // big body block
    rect(im, 28, 30, 34, 40, MAG) // enclosed hole
    const { mask, stats } = keyBackground(im.data, im.w, im.h)
    expect(isBg(mask, im.w, 30, 35)).toBe(true)
    expect(stats.pocketPx).toBeGreaterThanOrEqual(60)
    expect(isBg(mask, im.w, 20, 35)).toBe(false)
  })

  test('pink hair on a GREEN key survives, no conflict', () => {
    const im = character(() => GRN)
    rect(im, 22, 4, 42, 12, [255, 105, 180]) // pink hair block
    const { mask, stats } = keyBackground(im.data, im.w, im.h)
    expect(isBg(mask, im.w, 5, 5)).toBe(true)
    expect(isBg(mask, im.w, 32, 8)).toBe(false)
    expect(stats.keyConflict).toBe(false)
    expect(stats.bgHue).toBe(120)
  })

  test('the same pink block on a MAGENTA key is swallowed and flags keyConflict', () => {
    const im = character(() => MAG)
    rect(im, 8, 4, 56, 20, [190, 50, 185]) // big magenta-ish region touching background
    const { mask, stats } = keyBackground(im.data, im.w, im.h)
    expect(isBg(mask, im.w, 32, 8)).toBe(true)
    expect(stats.swallowedPx).toBeGreaterThan(0)
    expect(stats.keyConflict).toBe(true)
  })

  test('neutral dark ellipse under split legs triggers shadowSuspect', () => {
    const im = character(() => MAG)
    ellipse(im, 32, 85, 18, 4, [50, 50, 50])
    const { stats } = keyBackground(im.data, im.w, im.h)
    expect(stats.shadowSuspect).toBe(true)
  })

  test('256x384 keys in well under the time budget', () => {
    const im = make(256, 384, (x, y) => [255 - (y >> 4), 0, 255 - (x >> 5)])
    ellipse(im, 128, 190, 70, 150, [40, 90, 200])
    keyBackground(im.data, im.w, im.h) // warm up
    const t = performance.now()
    const { mask } = keyBackground(im.data, im.w, im.h)
    const pal = medianCutPalette(im.data, mask, 23)
    mapToPalette(im.data, mask, pal)
    expect(performance.now() - t).toBeLessThan(1500)
  })
})

describe('palette', () => {
  test('median cut returns <= maxColors and maps to 1-based indices', () => {
    const im = make(64, 64, () => MAG)
    for (let i = 0; i < 40; i++) rect(im, 8 + (i % 8) * 6, 8 + Math.floor(i / 8) * 6, 12 + (i % 8) * 6, 12 + Math.floor(i / 8) * 6, [i * 6, 255 - i * 6, (i * 37) % 256])
    const { mask } = keyBackground(im.data, im.w, im.h)
    for (const max of [1, 4, 23]) {
      const pal = medianCutPalette(im.data, mask, max)
      expect(pal.length).toBeLessThanOrEqual(max)
      expect(pal.length).toBeGreaterThan(0)
      const idx = mapToPalette(im.data, mask, pal)
      for (let i = 0; i < idx.length; i++) {
        if (mask[i]) expect(idx[i]).toBe(0)
        else { expect(idx[i]).toBeGreaterThanOrEqual(1); expect(idx[i]).toBeLessThanOrEqual(pal.length) }
      }
    }
  })

  test('empty foreground gives an empty palette', () => {
    const im = make(16, 16, () => MAG)
    const { mask } = keyBackground(im.data, 16, 16)
    expect(medianCutPalette(im.data, mask, 8)).toEqual([])
  })
})

// Parity against saved real Gemini output needs an image decoder (not available in bun without a new
// dependency), so it is intentionally skipped; parity was checked against the Python prototype out-of-band.
test.skip('parity with saved real raw images', () => {})
