export const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16'] as const
export type AspectRatio = typeof ASPECT_RATIOS[number]

export function buildSpritePrompt(userPrompt: string) {
  return `
    A single full-body character sprite of a ${userPrompt}, pixel art style, super-deformed chibi proportions.

    BACKGROUND INSTRUCTION:
    Generate the sprite on a SOLID MAGENTA (#FF00FF) background.
    Do NOT use White, Black, or Gray for the background.

    CRITICAL DETAIL - EYES & FACE:
    The eyes must be large and distinct, occupying a 3x3 pixel grid each.
    - The Left 1x3 vertical strip of the eye must be pure WHITE highlights.
    - The Right 2x3 block of the eye must be the colored iris.
    - The face structure must be clear and defined.

    The character must be facing forward in a standing idle pose.
    Flat shading, no gradients, heavy outlines to separate from background. High contrast.
    The character should fill the vertical frame (32x48) but leave small padding at top and bottom.
    Do NOT generate a sprite sheet or grid. Generate one large character.
  `
}

export function buildAnimationPrompt(a: { name: string; prompt: string; frameCount: number; columns: number; rows: number }) {
  return `
    You are an expert pixel-art character animator. The attached image is the exact reference character.
    Create one sprite sheet containing exactly ${a.frameCount} sequential frames for the "${a.name}" animation.
    The animation action is: ${a.prompt}

    Arrange the frames in a ${a.columns}-column by ${a.rows}-row grid, reading left to right and then top to bottom.
    Each cell contains one complete, centered, full-body pose of the same character. Use every cell exactly once.
    Keep the character's identity, outfit, colors, proportions, outline, and pixel-art style consistent with the reference.
    Do not add props, weapons, or effects that are not in the reference. Use a solid #FF00FF background.
    Leave a small gap between cells. Do not add borders, labels, numbers, or extra frames.
  `
}
