import { describe, expect, test } from 'bun:test';
import {
  brushFootprint, createHistory, floodFill, linePoints, paintSegment,
  pushHistory, redoHistory, undoHistory, HISTORY_LIMIT,
} from '../services/editorTools';

const W = 5;
const H = 4;
const blank = () => new Array(W * H).fill(0);

describe('linePoints', () => {
  test('single point', () => expect(linePoints(2, 2, 2, 2)).toEqual([{ x: 2, y: 2 }]));
  test('is gap-free in both directions and includes endpoints', () => {
    for (const [a, b, c, d] of [[0, 0, 7, 3], [7, 3, 0, 0], [0, 5, 2, -4], [3, 3, 3, 0]]) {
      const pts = linePoints(a, b, c, d);
      expect(pts[0]).toEqual({ x: a, y: b });
      expect(pts[pts.length - 1]).toEqual({ x: c, y: d });
      for (let i = 1; i < pts.length; i++) {
        expect(Math.max(Math.abs(pts[i].x - pts[i - 1].x), Math.abs(pts[i].y - pts[i - 1].y))).toBe(1);
      }
    }
  });
});

describe('brushFootprint', () => {
  test('sizes', () => {
    expect(brushFootprint(3, 3, 1)).toEqual([{ x: 3, y: 3 }]);
    expect(brushFootprint(3, 3, 2)).toHaveLength(4);
    const three = brushFootprint(3, 3, 3);
    expect(three).toHaveLength(9);
    expect(three).toContainEqual({ x: 2, y: 2 });
    expect(three).toContainEqual({ x: 4, y: 4 });
  });
});

describe('paintSegment', () => {
  test('draws and does not mutate input', () => {
    const p = blank();
    const out = paintSegment(p, W, H, { x: 0, y: 0 }, { x: 4, y: 0 }, 2);
    expect(p.every((v) => v === 0)).toBe(true);
    expect(out.slice(0, 5)).toEqual([2, 2, 2, 2, 2]);
  });
  test('clips out of bounds', () => {
    const out = paintSegment(blank(), W, H, { x: -3, y: 1 }, { x: 8, y: 1 }, 1);
    expect(out.slice(W, 2 * W)).toEqual([1, 1, 1, 1, 1]);
  });
  test('mirror paints the reflected cell', () => {
    const out = paintSegment(blank(), W, H, { x: 0, y: 2 }, { x: 0, y: 2 }, 3, 1, true);
    expect(out[2 * W]).toBe(3);
    expect(out[2 * W + 4]).toBe(3);
  });
  test('same reference when nothing changes', () => {
    const p = blank();
    expect(paintSegment(p, W, H, { x: 1, y: 1 }, { x: 1, y: 1 }, 0)).toBe(p);
  });
});

describe('floodFill', () => {
  // 1 1 0 0 0
  // 1 0 0 2 0
  // 0 0 2 2 0
  // 0 0 0 0 0
  const grid = [1, 1, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0];
  test('contiguous fill stays inside region (4-connected)', () => {
    const out = floodFill(grid, W, H, 4, 3, 5);
    expect(out[3]).toBe(5);
    expect(out[19]).toBe(5);
    expect(out[0]).toBe(1);
    expect(out[8]).toBe(2);
  });
  test('does not leak diagonally', () => {
    const g = [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const out = floodFill(g, W, H, 0, 0, 9); // (0,0) touches the rest of the sprite only diagonally
    expect(out[0]).toBe(9);
    expect(out[W + 1]).toBe(0);
    expect(out.filter((v) => v === 9)).toHaveLength(1);
  });
  test('global replaces all of that index', () => {
    const out = floodFill(grid, W, H, 0, 0, 7, true);
    expect(out.filter((v) => v === 7)).toHaveLength(3);
    expect(out.includes(1)).toBe(false);
  });
  test('no-op returns same reference', () => {
    expect(floodFill(grid, W, H, 0, 0, 1)).toBe(grid);
    expect(floodFill(grid, W, H, -1, 0, 3)).toBe(grid);
  });
});

describe('history', () => {
  test('undo/redo round trip', () => {
    let h = createHistory<number>();
    h = pushHistory(h, 1);
    h = pushHistory(h, 2);
    const u = undoHistory(h, 3)!;
    expect(u.value).toBe(2);
    const u2 = undoHistory(u.history, 2)!;
    expect(u2.value).toBe(1);
    expect(undoHistory(u2.history, 1)).toBeNull();
    const r = redoHistory(u2.history, 1)!;
    expect(r.value).toBe(2);
    expect(redoHistory(createHistory<number>(), 0)).toBeNull();
  });
  test('push clears redo', () => {
    let h = pushHistory(createHistory<number>(), 1);
    h = undoHistory(h, 2)!.history;
    expect(h.future).toHaveLength(1);
    expect(pushHistory(h, 5).future).toHaveLength(0);
  });
  test('caps depth, dropping oldest', () => {
    let h = createHistory<number>();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = pushHistory(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(20);
  });
});
