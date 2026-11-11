/** Pure sprite-editor logic: no DOM, no React. Pixels are palette indices, 0 = transparent. */

export interface Point {
  x: number;
  y: number;
}

export const HISTORY_LIMIT = 100;
export const MAX_BRUSH_SIZE = 3;

/** Integer line from a to b inclusive (Bresenham). Handles any direction and a === b. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return points;
}

/** Cells covered by a square brush of `size` anchored so (cx, cy) is its centre (top-left biased for even sizes). */
export function brushFootprint(cx: number, cy: number, size: number): Point[] {
  const s = Math.max(1, Math.floor(size));
  const offset = Math.floor((s - 1) / 2);
  const cells: Point[] = [];
  for (let dy = 0; dy < s; dy++) {
    for (let dx = 0; dx < s; dx++) cells.push({ x: cx - offset + dx, y: cy - offset + dy });
  }
  return cells;
}

/**
 * Paint `value` along a segment with a square brush, optionally mirrored across the vertical axis.
 * Returns a new array (or the same reference when nothing changed). Out-of-bounds cells are ignored.
 */
export function paintSegment(
  pixels: number[], width: number, height: number,
  from: Point, to: Point, value: number, size = 1, mirror = false,
): number[] {
  let out: number[] | null = null;
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if ((out ?? pixels)[i] === value) return;
    if (!out) out = pixels.slice();
    out[i] = value;
  };
  for (const p of linePoints(from.x, from.y, to.x, to.y)) {
    for (const c of brushFootprint(p.x, p.y, size)) {
      set(c.x, c.y);
      if (mirror) set(width - 1 - c.x, c.y);
    }
  }
  return out ?? pixels;
}

/**
 * Bucket fill. Contiguous (4-connected) by default; `global` replaces every pixel of the target index.
 * Returns the same reference if nothing changes.
 */
export function floodFill(
  pixels: number[], width: number, height: number,
  x: number, y: number, value: number, global = false,
): number[] {
  if (x < 0 || y < 0 || x >= width || y >= height) return pixels;
  const target = pixels[y * width + x];
  if (target === value) return pixels;
  const out = pixels.slice();
  if (global) {
    for (let i = 0; i < out.length; i++) if (out[i] === target) out[i] = value;
    return out;
  }
  const stack: number[] = [y * width + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (out[i] !== target) continue;
    out[i] = value;
    const px = i % width;
    if (px > 0) stack.push(i - 1);
    if (px < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i + width < out.length) stack.push(i + width);
  }
  return out;
}

export function pixelsEqual(a: number[], b: number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Immutable undo/redo stack of snapshots. */
export interface History<T> {
  past: T[];
  future: T[];
}

export const createHistory = <T,>(): History<T> => ({ past: [], future: [] });

/** Record `snapshot` (the state before a change). Clears redo and caps depth. */
export function pushHistory<T>(h: History<T>, snapshot: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...h.past, snapshot];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

export function undoHistory<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.past.length) return null;
  const value = h.past[h.past.length - 1];
  return { value, history: { past: h.past.slice(0, -1), future: [...h.future, current] } };
}

export function redoHistory<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.future.length) return null;
  const value = h.future[h.future.length - 1];
  return { value, history: { past: [...h.past, current], future: h.future.slice(0, -1) } };
}
