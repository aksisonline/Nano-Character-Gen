/**
 * Chroma keyer (pure TS, typed arrays, no DOM). Port of scripts/research/keyer.py.
 *
 * Ideas:
 *  1. Estimate the REAL background color from the image border ring (generated "magenta"/"green" is a gradient).
 *  2. A pixel is a background candidate if its HUE is close to the background hue (with enough saturation/value),
 *     so darker/lighter shades of the key (gradient, vignette, tinted shadow) are keyed too.
 *  3. Flood-fill from the border only. Interior key-hued character parts survive unless they are an enclosed
 *     pocket that matches the background tightly (gap between arm and body).
 *  4. De-fringe: blended edge pixels leaning toward the key hue next to the background are removed.
 *  5. QA stats: border uniformity, key leakage, swallowed pixels (key conflict), shadow suspicion.
 */

export interface KeyStats {
  bgColor: string;
  bgHue: number;
  borderUniformity: number;
  fgPixels: number;
  pocketPx: number;
  defringePx: number;
  keyLeakPx: number;
  keyLeakPct: number;
  swallowedPx: number;
  swallowedPctOfImage: number;
  /** Swallowed pixels exceed 2% of the image: the character likely contains the key hue (pink hair on magenta). */
  keyConflict: boolean;
  /** A wide unbroken foreground blob under split legs: probably a cast shadow that survived keying. */
  shadowSuspect: boolean;
}

export type RGB3 = [number, number, number];

const HUE_TOL = 28;
const SAT_MIN = 0.3;
const VAL_MIN = 0.18;
const RGB_LOOSE = 60;
const RGB_TIGHT = 55;
const DEFRINGE_PASSES = 2;
const RING = 3;

function hueOf(r: number, g: number, b: number, mx: number, d: number): number {
  if (d === 0) return 0;
  let h: number;
  if (mx === r) h = (60 * ((g - b) / d)) % 360;
  else if (mx === g) h = 60 * ((b - r) / d) + 120;
  else h = 60 * ((r - g) / d) + 240;
  return h < 0 ? h + 360 : h;
}

function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

export function keyBackground(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): { mask: Uint8Array; stats: KeyStats } {
  const w = width;
  const h = height;
  const n = w * h;

  // 1. background estimate from the border ring
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < RING || y < RING || x >= w - RING || y >= h - RING) {
        const o = (y * w + x) * 4;
        rs.push(rgba[o]);
        gs.push(rgba[o + 1]);
        bs.push(rgba[o + 2]);
      }
    }
  }
  const bgR = median(rs.slice());
  const bgG = median(gs.slice());
  const bgB = median(bs.slice());
  let near = 0;
  for (let i = 0; i < rs.length; i++) {
    const dr = rs[i] - bgR;
    const dg = gs[i] - bgG;
    const db = bs[i] - bgB;
    if (dr * dr + dg * dg + db * db < 70 * 70) near++;
  }
  const uniform = rs.length ? near / rs.length : 0;
  const bgMax = Math.max(bgR, bgG, bgB);
  const bgMin = Math.min(bgR, bgG, bgB);
  const bgHueV = hueOf(bgR, bgG, bgB, bgMax, bgMax - bgMin);

  const distBg2 = (o: number): number => {
    const dr = rgba[o] - bgR;
    const dg = rgba[o + 1] - bgG;
    const db = rgba[o + 2] - bgB;
    return dr * dr + dg * dg + db * db;
  };
  /** hue/sat/val test only (no rgb_loose). */
  const hueMatch = (o: number): boolean => {
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const mx = Math.max(r, g, b);
    const d = mx - Math.min(r, g, b);
    if (mx === 0) return false;
    if (d / mx < SAT_MIN || mx / 255 < VAL_MIN) return false;
    return hueDiff(hueOf(r, g, b, mx, d), bgHueV) <= HUE_TOL;
  };

  // lazily cached candidate test: 0 unknown, 1 yes, 2 no
  const candCache = new Uint8Array(n);
  const cand = (i: number): boolean => {
    let c = candCache[i];
    if (c === 0) {
      const o = i * 4;
      c = hueMatch(o) || distBg2(o) < RGB_LOOSE * RGB_LOOSE ? 1 : 2;
      candCache[i] = c;
    }
    return c === 1;
  };

  // 2. flood fill from the border
  const mask = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const seed = (i: number) => {
    if (!mask[i] && cand(i)) {
      mask[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w;
    const y = (i - x) / w;
    if (x + 1 < w) seed(i + 1);
    if (x > 0) seed(i - 1);
    if (y + 1 < h) seed(i + w);
    if (y > 0) seed(i - w);
  }

  // 3. enclosed pockets matching the background tightly
  let pocket = 0;
  for (let i = 0; i < n; i++) {
    if (!mask[i] && distBg2(i * 4) < RGB_TIGHT * RGB_TIGHT) {
      mask[i] = 1;
      pocket++;
    }
  }

  // 4. de-fringe
  let defringe = 0;
  const pending = new Int32Array(n);
  const hueLimit = HUE_TOL + 20;
  for (let pass = 0; pass < DEFRINGE_PASSES; pass++) {
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      if (mask[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      const touches =
        (x + 1 < w && mask[i + 1] === 1) ||
        (x > 0 && mask[i - 1] === 1) ||
        (y + 1 < h && mask[i + w] === 1) ||
        (y > 0 && mask[i - w] === 1);
      if (!touches) continue;
      const o = i * 4;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      const mx = Math.max(r, g, b);
      const d = mx - Math.min(r, g, b);
      if (mx === 0 || d / mx < 0.2 || mx / 255 < 0.25) continue;
      if (hueDiff(hueOf(r, g, b, mx, d), bgHueV) <= hueLimit && distBg2(o) < 140 * 140) pending[cnt++] = i;
    }
    for (let k = 0; k < cnt; k++) mask[pending[k]] = 1;
    defringe += cnt;
  }

  // 5. stats
  let swallowed = 0;
  let fg = 0;
  let leak = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i]) {
      if (distBg2(i * 4) > 100 * 100) swallowed++;
    } else {
      fg++;
      if (hueMatch(i * 4)) leak++;
    }
  }
  const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;
  const stats: KeyStats = {
    bgColor: '#' + hex2(bgR) + hex2(bgG) + hex2(bgB),
    bgHue: Math.round(bgHueV),
    borderUniformity: round(uniform, 3),
    fgPixels: fg,
    pocketPx: pocket,
    defringePx: defringe,
    keyLeakPx: leak,
    keyLeakPct: round((100 * leak) / Math.max(1, fg), 2),
    swallowedPx: swallowed,
    swallowedPctOfImage: round((100 * swallowed) / n, 2),
    keyConflict: swallowed > 0.02 * n,
    shadowSuspect: detectShadow(mask, w, h),
  };
  return { mask, stats };
}

/** Wide, unbroken fg run in the bottom rows while the rows above split into two legs. */
function detectShadow(mask: Uint8Array, w: number, h: number): boolean {
  const widths = new Int32Array(h);
  const runs = new Int32Array(h);
  let y0 = -1;
  let y1 = -1;
  let bw = 0;
  for (let y = 0; y < h; y++) {
    let wd = 0;
    let r = 0;
    let cur = false;
    for (let x = 0; x < w; x++) {
      const f = mask[y * w + x] === 0;
      if (f) {
        wd++;
        if (!cur) r++;
      }
      cur = f;
    }
    widths[y] = wd;
    runs[y] = r;
    if (wd > 0) {
      if (y0 < 0) y0 = y;
      y1 = y;
      if (wd > bw) bw = wd;
    }
  }
  if (y0 < 0) return false;
  let wideUnbroken = 0;
  for (let y = Math.max(y0, y1 - 5); y <= y1; y++) {
    if (runs[y] === 1 && widths[y] > 0.7 * bw) wideUnbroken++;
  }
  const aboveStart = Math.max(y0, y1 - 25);
  const aboveEnd = Math.max(y0, y1 - 8); // exclusive
  let splitAbove = 0;
  for (let y = aboveStart; y < aboveEnd; y++) if (runs[y] >= 2) splitAbove++;
  const aboveLen = Math.max(0, aboveEnd - aboveStart);
  return wideUnbroken >= 3 && splitAbove >= Math.max(3, Math.floor(aboveLen / 3));
}

/** Median-cut palette over foreground pixels (mask 0) on 5-bit bins. Returns rounded RGB triples. */
export function medianCutPalette(
  rgba: Uint8ClampedArray | Uint8Array,
  mask: Uint8Array,
  maxColors: number
): RGB3[] {
  const sumR = new Float64Array(32768);
  const sumG = new Float64Array(32768);
  const sumB = new Float64Array(32768);
  const cnt = new Float64Array(32768);
  const n = mask.length;
  for (let i = 0; i < n; i++) {
    if (mask[i]) continue;
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    sumR[k] += r;
    sumG[k] += g;
    sumB[k] += b;
    cnt[k]++;
  }
  // items: mean color + count, in first-seen-by-key order
  const mean: Float64Array[] = [new Float64Array(0), new Float64Array(0), new Float64Array(0)];
  const keys: number[] = [];
  for (let k = 0; k < 32768; k++) if (cnt[k] > 0) keys.push(k);
  if (keys.length === 0 || maxColors < 1) return [];
  const m = keys.length;
  mean[0] = new Float64Array(m);
  mean[1] = new Float64Array(m);
  mean[2] = new Float64Array(m);
  const count = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const k = keys[j];
    mean[0][j] = sumR[k] / cnt[k];
    mean[1][j] = sumG[k] / cnt[k];
    mean[2][j] = sumB[k] / cnt[k];
    count[j] = cnt[k];
  }
  const range = (box: number[], ch: number): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const j of box) {
      const v = mean[ch][j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return hi - lo;
  };
  const total = (box: number[]): number => {
    let t = 0;
    for (const j of box) t += count[j];
    return t;
  };

  let boxes: number[][] = [Array.from({ length: m }, (_, j) => j)];
  while (boxes.length < maxColors) {
    let best = -1;
    let bestScore = -Infinity;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      if (box.length < 2) continue;
      const score = Math.max(range(box, 0), range(box, 1), range(box, 2)) * Math.sqrt(total(box));
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best < 0) break;
    const box = boxes[best];
    let ch = 0;
    let chRange = range(box, 0);
    for (let c = 1; c < 3; c++) {
      const r = range(box, c);
      if (r > chRange) {
        chRange = r;
        ch = c;
      }
    }
    box.sort((a, b) => mean[ch][a] - mean[ch][b]);
    const half = total(box) / 2;
    let acc = 0;
    let cut = 1;
    for (let j = 0; j < box.length; j++) {
      acc += count[box[j]];
      if (acc >= half) {
        cut = Math.max(1, Math.min(box.length - 1, j + 1));
        break;
      }
    }
    boxes = boxes.filter((_, b) => b !== best);
    boxes.push(box.slice(0, cut), box.slice(cut));
  }

  return boxes.map((box) => {
    const t = total(box);
    const out: RGB3 = [0, 0, 0];
    for (let ch = 0; ch < 3; ch++) {
      let s = 0;
      for (const j of box) s += mean[ch][j] * count[j];
      out[ch] = Math.round(s / t);
    }
    return out;
  });
}

/** 0 = background; otherwise 1-based index of the nearest palette color. */
export function mapToPalette(
  rgba: Uint8ClampedArray | Uint8Array,
  mask: Uint8Array,
  paletteRgb: ArrayLike<ArrayLike<number>>
): Uint8Array {
  const n = mask.length;
  const out = new Uint8Array(n);
  const cache = new Int16Array(32768).fill(-1);
  const pl = paletteRgb.length;
  for (let i = 0; i < n; i++) {
    if (mask[i]) continue;
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let v = cache[k];
    if (v < 0) {
      let bestD = Infinity;
      let bestJ = 0;
      for (let j = 0; j < pl; j++) {
        const p = paletteRgb[j];
        const dr = r - p[0];
        const dg = g - p[1];
        const db = b - p[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          bestJ = j;
        }
      }
      v = pl === 0 ? 0 : bestJ + 1;
      cache[k] = v;
    }
    out[i] = v;
  }
  return out;
}
