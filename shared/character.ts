// Character storage format. JSON only: palette + packed palette-index strings. No rendered images are
// ever stored; the studio re-renders the sprite from this data when an item is opened.
export const CHARACTER_DOC_VERSION = 1
export const SPRITE_PIXELS = 32 * 48
export const MAX_PALETTE = 36 // one base-36 character per pixel
export const MAX_ANIMATIONS = 12
export const MAX_FRAMES = 16
export const MAX_NAME = 80
export const MAX_TEXT = 600

export interface StoredAnimation {
  id: string
  name: string
  prompt: string
  frameCount: number
  fps: number
  loop: boolean
  /** Packed frames: each string is SPRITE_PIXELS base-36 palette indices. */
  frames: string[]
}
export interface CharacterDoc {
  v: typeof CHARACTER_DOC_VERSION
  name: string
  prompt: string
  palette: (string | null)[]
  /** Packed base sprite: SPRITE_PIXELS base-36 palette indices. */
  pixels: string
  animations: StoredAnimation[]
}

const HEX = /^#[0-9a-fA-F]{6}$/
const PACKED = /^[0-9a-z]+$/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const packPixels = (pixels: number[], paletteSize: number) =>
  pixels.map((p) => (Number.isInteger(p) && p >= 0 && p < paletteSize ? p : 0).toString(36)).join('')
export const unpackPixels = (packed: string) => Array.from(packed, (c) => parseInt(c, 36))

const KEYS = {
  doc: ['v', 'name', 'prompt', 'palette', 'pixels', 'animations'],
  animation: ['id', 'name', 'prompt', 'frameCount', 'fps', 'loop', 'frames'],
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const exactKeys = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => k in o)
const str = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max
const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

export type Validation = { ok: true; doc: CharacterDoc } | { ok: false; error: string }

/** Strict validation: exact keys (unknown fields rejected), bounded sizes, indices inside the palette. */
export function validateCharacterDoc(input: unknown): Validation {
  const bad = (error: string): Validation => ({ ok: false, error })
  if (!isObj(input) || !exactKeys(input, KEYS.doc)) return bad('shape')
  if (input.v !== CHARACTER_DOC_VERSION) return bad('version')
  if (!str(input.name, 1, MAX_NAME)) return bad('name')
  if (!str(input.prompt, 0, MAX_TEXT)) return bad('prompt')
  const palette = input.palette
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > MAX_PALETTE
    || !palette.every((c) => c === null || (typeof c === 'string' && HEX.test(c)))) return bad('palette')
  const fits = (packed: unknown) => typeof packed === 'string' && packed.length === SPRITE_PIXELS && PACKED.test(packed)
    && [...packed].every((c) => parseInt(c, 36) < palette.length)
  if (!fits(input.pixels)) return bad('pixels')
  const animations = input.animations
  if (!Array.isArray(animations) || animations.length > MAX_ANIMATIONS) return bad('animations')
  const ids = new Set<string>()
  for (const a of animations) {
    if (!isObj(a) || !exactKeys(a, KEYS.animation)) return bad('animation')
    if (!str(a.id, 1, 40) || ids.has(a.id) || !str(a.name, 1, 60) || !str(a.prompt, 0, MAX_TEXT)) return bad('animation')
    ids.add(a.id)
    if (!int(a.frameCount, 1, MAX_FRAMES) || !int(a.fps, 1, 60) || typeof a.loop !== 'boolean') return bad('animation')
    if (!Array.isArray(a.frames) || a.frames.length > MAX_FRAMES || !a.frames.every(fits)) return bad('frames')
  }
  return { ok: true, doc: input as unknown as CharacterDoc }
}
