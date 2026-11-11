import { SPRITE_HEIGHT, SPRITE_WIDTH } from "../constants";

export interface UsageInfo { limit: number; remaining: number; resetsAt: string }

export class AuthRequiredError extends Error {}
export class QuotaError extends Error {}
export class ContentBlockedError extends Error {}

let usageListener: ((usage: UsageInfo) => void) | undefined;
export const onUsageChange = (fn: (usage: UsageInfo) => void) => { usageListener = fn; };

async function post(path: string, payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, turnId: crypto.randomUUID() }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthRequiredError('Sign in with your AKS account to generate.');
  if (res.status === 422 && data.error === 'blocked') throw new ContentBlockedError(data.message || 'This prompt was blocked. Try rewording it.');
  if (res.status === 409 && (data.error === 'openai_unavailable' || data.error === 'openai_reauth')) throw new Error(data.message || 'Your OpenAI account is not available. Check Account.');
  if (res.status === 429 && data.reason === 'openai_usage_limit') throw new QuotaError('Your ChatGPT plan usage limit is reached. Try again later, or switch to your AKS allowance in Account.');
  if (res.status === 429) {
    const when = data.resetsAt ? new Date(data.resetsAt).toLocaleString() : 'next week';
    throw new QuotaError(
      data.reason === 'weekly_limit' ? `Weekly generation limit reached. Resets ${when}.` : 'Too many requests. Please wait a moment.',
    );
  }
  if (!res.ok || !data.image) throw new Error(data.error || 'Generation failed.');
  if (data.usage) usageListener?.(data.usage);
  return data.image;
}

export const generateSpriteImage = (userPrompt: string) => post('/api/generate/sprite', { prompt: userPrompt });

export interface AnimationGrid {
  columns: number;
  rows: number;
  aspectRatio: '1:1' | '3:4' | '4:3' | '16:9' | '9:16';
}

/** Pick a compact grid whose cell count exactly matches the requested frames. */
export function getAnimationGrid(frameCount: number): AnimationGrid {
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error('Animation frame count must be a positive integer.');
  }
  const choices: AnimationGrid['aspectRatio'][] = ['3:4', '1:1', '4:3', '16:9', '9:16'];
  const ratio = (value: string) => {
    const [width, height] = value.split(':').map(Number);
    return width / height;
  };
  const layouts = choices.flatMap((aspectRatio) => {
    const wantedRatio = ratio(aspectRatio);
    return Array.from({ length: frameCount }, (_, index) => index + 1)
      .filter((columns) => frameCount % columns === 0)
      .map((columns) => {
        const rows = frameCount / columns;
        const targetRatio = (columns * SPRITE_WIDTH) / (rows * SPRITE_HEIGHT);
        return {
          columns,
          rows,
          aspectRatio,
          error: Math.abs(Math.log(wantedRatio / targetRatio)),
        };
      });
  });
  const best = layouts.reduce((winner, layout) => layout.error < winner.error ? layout : winner);
  return { columns: best.columns, rows: best.rows, aspectRatio: best.aspectRatio };
}

/** Generate only the animation the user requested, in row-major frame order. */
export const generateAnimationFrames = (
  baseSpriteBase64: string,
  animationName: string,
  animationPrompt: string,
  frameCount: number,
  grid: AnimationGrid,
  key: 'magenta' | 'green' = 'magenta'
) => post('/api/generate/animation', {
  image: baseSpriteBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, ''),
  name: animationName,
  prompt: animationPrompt,
  frameCount,
  columns: grid.columns,
  rows: grid.rows,
  aspectRatio: grid.aspectRatio,
  key,
});
