export const ASPECT_RATIOS = ['1:1', '2:3', '3:4', '4:3', '16:9', '9:16'] as const
export type AspectRatio = typeof ASPECT_RATIOS[number]

export const BLOCKED_MESSAGE = 'Oops! Sorry, our model thinks this prompt is a little too… much. Try rewording it and give it another go!'

/** Chroma-key colors. The key must not appear on the character, or the keyer removes that part of it. */
export const KEY_COLORS = {
  magenta: { name: 'MAGENTA', hex: '#FF00FF' },
  green: { name: 'GREEN', hex: '#00FF00' },
} as const
export type KeyColor = keyof typeof KEY_COLORS

/** Pick a key color the character is unlikely to use (pink/purple characters get green, otherwise magenta). */
export function chooseKeyColor(description: string): KeyColor {
  return /\b(pink|magenta|fuchsia|purple|violet|lavender|rose|mauve)\b/i.test(description) ? 'green' : 'magenta'
}

/** Pick the key color that avoids the palette's pink/magenta (or green) hues. */
export function chooseKeyForPalette(palette: (string | null)[]): KeyColor {
  for (const c of palette) {
    const m = c && /^#?([0-9a-f]{6})/i.exec(c)
    if (!m) continue
    const n = parseInt(m[1], 16)
    const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
    if (max < 0.2 || d / max < 0.25) continue
    const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
    const near = (t: number) => Math.min(Math.abs(h - t), 360 - Math.abs(h - t)) <= 40
    if (near(300) || near(330)) return 'green'
  }
  return 'magenta'
}

const backgroundRules = (key: KeyColor) => {
  const { name, hex } = KEY_COLORS[key]
  return `
    BACKGROUND INSTRUCTION:
    Generate the sprite on a perfectly flat, SOLID ${name} (${hex}) background that fills the whole image: no gradient, no vignette, no texture, no noise.
    Do NOT use White, Black, or Gray for the background.
    Do NOT use ${name} or any similar shade anywhere on the character itself.

    NO SHADOWS:
    No ground shadow, no drop shadow, no contact shadow, no reflection, no glow and no floor.
    The character floats on the flat background and its feet end cleanly with the outline.
`
}

export function buildSpritePrompt(userPrompt: string, key: KeyColor = 'magenta') {
  return `
    A single full-body character sprite of a ${userPrompt}, pixel art style, super-deformed chibi proportions.
${backgroundRules(key)}
    EYES & FACE LEGIBILITY:
    Eyes or eyewear are large, simple, clearly separated from the outline and hair, drawn with 2-3 flat colors and no gradients.
    Glasses, sunglasses, visors, helmets and unusual eyes (one eye, slits, different colors) follow the character description exactly.
    Eyewear is drawn as simple solid shapes with at most one small highlight.
    The face structure must be clear and defined.

    The character must be facing forward in a standing idle pose.
    Flat shading, no gradients, heavy outlines to separate from background. High contrast.
    The character should fill the vertical frame (32x48) but leave small padding at top and bottom.
    Do NOT generate a sprite sheet or grid. Generate one large character.
  `
}

export function buildAnimationPrompt(a: { name: string; prompt: string; frameCount: number; columns: number; rows: number }, key: KeyColor = 'magenta') {
  return `
    You are an expert pixel-art character animator. The attached image is the exact reference character.
    Create one sprite sheet containing exactly ${a.frameCount} sequential frames for the "${a.name}" animation.
    The animation action is: ${a.prompt}

    Arrange the frames in a ${a.columns}-column by ${a.rows}-row grid, reading left to right and then top to bottom.
    Each cell contains one complete, centered, full-body pose of the same character. Use every cell exactly once.
    Keep the character's identity, outfit, colors, proportions, outline, and pixel-art style consistent with the reference.
    Do not add props, weapons, or effects that are not in the reference.
    Use a perfectly flat, solid ${KEY_COLORS[key].name} (${KEY_COLORS[key].hex}) background with no gradient, no vignette and no noise, and do not use that color on the character.
    No shadows of any kind: no ground shadow, no drop shadow, no reflection, no glow, no floor.
    Leave a small gap between cells. Do not add borders, labels, numbers, or extra frames.
  `
}
