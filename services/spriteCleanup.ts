/**
 * Pure sprite cleanup passes on indexed pixels (0 = transparent). Port of scripts/research/run.py.
 * No DOM; frames are 32x48 by default.
 */
import { SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants';

type Pixels = ArrayLike<number>;

/** Most common value among `vals` (first-seen wins ties, like Python's Counter.most_common). */
function mostCommon(vals: number[]): { value: number; count: number } {
  let bestV = 0;
  let bestC = 0;
  for (let i = 0; i < vals.length; i++) {
    let c = 0;
    for (let j = 0; j < vals.length; j++) if (vals[j] === vals[i]) c++;
    if (c > bestC) {
      bestC = c;
      bestV = vals[i];
    }
  }
  return { value: bestV, count: bestC };
}

/**
 * Downscale an index map by block mode. A block is transparent when background covers more than half of it,
 * otherwise it takes the most common non-background index.
 */
export function modeDownscale(
  src: Pixels,
  srcW: number,
  srcH: number,
  dstW: number = SPRITE_WIDTH,
  dstH: number = SPRITE_HEIGHT
): number[] {
  const bx = Math.floor(srcW / dstW);
  const by = Math.floor(srcH / dstH);
  const half = Math.floor((bx * by) / 2);
  const counts = new Uint32Array(256);
  const out = new Array<number>(dstW * dstH).fill(0);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      let bg = 0;
      for (let yy = y * by; yy < (y + 1) * by; yy++) {
        for (let xx = x * bx; xx < (x + 1) * bx; xx++) {
          const v = src[yy * srcW + xx];
          if (v === 0) bg++;
          else counts[v]++;
        }
      }
      let best = 0;
      let bestC = 0;
      for (let yy = y * by; yy < (y + 1) * by; yy++) {
        for (let xx = x * bx; xx < (x + 1) * bx; xx++) {
          const v = src[yy * srcW + xx];
          if (v !== 0 && counts[v] > bestC) {
            bestC = counts[v];
            best = v;
          }
        }
      }
      for (let yy = y * by; yy < (y + 1) * by; yy++) {
        for (let xx = x * bx; xx < (x + 1) * bx; xx++) counts[src[yy * srcW + xx]] = 0;
      }
      out[y * dstW + x] = bestC === 0 || bg > half ? 0 : best;
    }
  }
  return out;
}

/** Drop isolated specks, recolor lonely-color pixels inside a region, fill 1px interior holes. */
export function removeOrphans(p: Pixels, w: number = SPRITE_WIDTH, h: number = SPRITE_HEIGHT): number[] {
  const out = Array.from(p as ArrayLike<number>);
  const at = (x: number, y: number) => (x >= 0 && x < w && y >= 0 && y < h ? p[y * w + x] : 0);
  for (let i = 0; i < w * h; i++) {
    const v = p[i];
    const x = i % w;
    const y = (i - x) / w;
    const nb = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
    const filled = nb.filter((n) => n !== 0);
    if (v) {
      if (filled.length === 0) out[i] = 0;
      else if (!nb.includes(v)) {
        const top = mostCommon(filled);
        if (top.count >= 2 || filled.length >= 3) out[i] = top.value;
      }
    } else if (filled.length >= 3 && x > 0 && x < w - 1 && y > 0 && y < h - 1) {
      out[i] = mostCommon(filled).value;
    }
  }
  return out;
}

/** Keep the largest 8-connected component plus components of >= minSize or within 2px of it. */
export function keepMainComponents(
  p: Pixels,
  minSize = 6,
  w: number = SPRITE_WIDTH,
  h: number = SPRITE_HEIGHT
): number[] {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!p[i] || label[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop() as number;
      size++;
      const x = j % w;
      const y = (j - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const k = ny * w + nx;
            if (p[k] && label[k] < 0) {
              label[k] = id;
              stack.push(k);
            }
          }
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length === 0) return Array.from(p as ArrayLike<number>);
  let big = 0;
  for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[big]) big = c;
  const keep = new Uint8Array(sizes.length);
  keep[big] = 1;
  for (let c = 0; c < sizes.length; c++) if (sizes[c] >= minSize) keep[c] = 1;
  // components within 2px (Chebyshev) of the largest one
  for (let i = 0; i < n; i++) {
    if (label[i] < 0 || keep[label[i]]) continue;
    const x = i % w;
    const y = (i - x) / w;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && label[ny * w + nx] === big) {
          near = true;
          break;
        }
      }
    }
    if (near) keep[label[i]] = 1;
  }
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) if (label[i] >= 0 && keep[label[i]]) out[i] = p[i];
  return out;
}

function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/**
 * Merge near-duplicate palette colors (most-used first wins). Unused entries are dropped and the palette is
 * compacted (index 0 stays null); pixels are renumbered accordingly.
 */
export function mergePalette(
  pixels: Pixels,
  palette: (string | null)[],
  threshold = 24
): { pixels: number[]; palette: (string | null)[] } {
  const counts = new Map<number, number>();
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  // Map preserves first-seen order; stable sort by count desc matches Counter.most_common.
  const order = [...counts.keys()].sort((a, b) => (counts.get(b) as number) - (counts.get(a) as number));
  const rep = new Map<number, number>();
  const kept: number[] = [];
  for (const i of order) {
    const hex = palette[i];
    if (!hex) {
      kept.push(i);
      rep.set(i, i);
      continue;
    }
    const rgb = hexRgb(hex);
    let target = -1;
    for (const k of kept) {
      const kh = palette[k];
      if (!kh) continue;
      const o = hexRgb(kh);
      if (Math.hypot(rgb[0] - o[0], rgb[1] - o[1], rgb[2] - o[2]) < threshold) {
        target = k;
        break;
      }
    }
    if (target < 0) {
      kept.push(i);
      rep.set(i, i);
    } else rep.set(i, target);
  }
  const keptSorted = [...kept].sort((a, b) => a - b);
  const renum = new Map<number, number>();
  const outPalette: (string | null)[] = [null];
  keptSorted.forEach((old, j) => {
    renum.set(old, j + 1);
    outPalette.push(palette[old] ?? null);
  });
  const out = new Array<number>(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    out[i] = v ? (renum.get(rep.get(v) as number) as number) : 0;
  }
  return { pixels: out, palette: outPalette };
}

/** Trim only transparent padding; center the content in the frame. */
export function centerSpriteInFrame(
  pixels: Pixels,
  palette: (string | null)[],
  width: number = SPRITE_WIDTH,
  height: number = SPRITE_HEIGHT
): number[] {
  if (width !== SPRITE_WIDTH || height !== SPRITE_HEIGHT) return Array.from(pixels as ArrayLike<number>);
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ci = pixels[y * width + x];
      if (ci !== 0 && palette[ci]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return Array.from(pixels as ArrayLike<number>);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const ox = Math.floor((width - cw) / 2);
  const oy = Math.floor((height - ch) / 2);
  const out = new Array<number>(width * height).fill(0);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      out[(oy + y) * width + ox + x] = pixels[(minY + y) * width + minX + x];
    }
  }
  return out;
}

export const centerSprite = centerSpriteInFrame;

// ---------------------------------------------------------------------------------------------------------------
// Shading-noise reduction (deterministic). Median cut spends its budget splitting grey/metal gradients into many
// near-identical colors; these passes collapse them without touching distinct accents (eyes, plume, visor).
// ---------------------------------------------------------------------------------------------------------------

type Lab = [number, number, number];

/** sRGB (0-255) -> CIELAB (D65). */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDist(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Merge palette entries closer than `threshold` (CIELAB distance), always merging the closest pair first and
 * replacing the pair by their pixel-count-weighted mean. Entries far from everything else (an eye, a plume) never
 * qualify however few pixels they cover, so tiny accents survive. Dark outline colors are held to a stricter
 * threshold so they do not dissolve into dark shading. Returns the new palette plus `map[oldIndex] = newIndex`.
 */
export function simplifyPalette(
  palette: ArrayLike<ArrayLike<number>>,
  counts: ArrayLike<number>,
  threshold = 10
): { palette: [number, number, number][]; map: number[] } {
  type Node = { rgb: [number, number, number]; lab: Lab; n: number; members: number[] };
  const nodes: Node[] = [];
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    nodes.push({ rgb: [p[0], p[1], p[2]], lab: rgbToLab(p[0], p[1], p[2]), n: Math.max(1, counts[i] ?? 0), members: [i] });
  }
  const chroma = (n: Node) => Math.hypot(n.lab[1], n.lab[2]);
  // Greys/metal gradients get a looser threshold (they are the main source of speckle); dark outlines a stricter one.
  const limit = (a: Node, b: Node) =>
    Math.min(a.lab[0], b.lab[0]) < 22 ? threshold * 0.6 : Math.max(chroma(a), chroma(b)) < 14 ? threshold * 1.6 : threshold;
  for (;;) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = labDist(nodes[i].lab, nodes[j].lab);
        if (d < limit(nodes[i], nodes[j]) && d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0) break;
    const a = nodes[bi];
    const b = nodes[bj];
    const t = a.n + b.n;
    const rgb: [number, number, number] = [
      Math.round((a.rgb[0] * a.n + b.rgb[0] * b.n) / t),
      Math.round((a.rgb[1] * a.n + b.rgb[1] * b.n) / t),
      Math.round((a.rgb[2] * a.n + b.rgb[2] * b.n) / t),
    ];
    nodes[bi] = { rgb, lab: rgbToLab(rgb[0], rgb[1], rgb[2]), n: t, members: [...a.members, ...b.members] };
    nodes.splice(bj, 1);
  }
  const map = new Array<number>(palette.length).fill(0);
  nodes.forEach((nd, k) => nd.members.forEach((m) => (map[m] = k)));
  return { palette: nodes.map((n) => n.rgb), map };
}

/**
 * Edge-aware smoothing of shading speckle on a 32x48 index grid. A pixel is snapped to the neighbor color when at
 * least `minAgree` of its 4-neighbors share one color that is perceptually close (CIELAB < `threshold`) to it.
 * Anything with high contrast to that color (eyes, rims, outlines, accents) is left alone. Single pass, reads from
 * the input grid so the result does not depend on scan order.
 */
export function smoothShading(
  pixels: Pixels,
  palette: (string | null)[],
  w: number = SPRITE_WIDTH,
  h: number = SPRITE_HEIGHT,
  threshold = 14,
  minAgree = 3
): number[] {
  const labs = palette.map((c) => (c ? ((l) => rgbToLab(l[0], l[1], l[2]))(hexRgb(c)) : null));
  const out = Array.from(pixels as ArrayLike<number>);
  const nb: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = pixels[y * w + x];
      if (!v || !labs[v]) continue;
      nb.length = 0;
      if (x > 0) nb.push(pixels[y * w + x - 1]);
      if (x < w - 1) nb.push(pixels[y * w + x + 1]);
      if (y > 0) nb.push(pixels[(y - 1) * w + x]);
      if (y < h - 1) nb.push(pixels[(y + 1) * w + x]);
      let best = 0;
      let bestC = 0;
      for (const c of nb) {
        if (!c || c === v) continue;
        let k = 0;
        for (const d of nb) if (d === c) k++;
        if (k > bestC) {
          bestC = k;
          best = c;
        }
      }
      if (bestC < minAgree || !labs[best]) continue;
      if (labDist(labs[v] as Lab, labs[best] as Lab) < threshold) out[y * w + x] = best;
    }
  }
  return out;
}

/**
 * Like modeDownscale, but a thin high-contrast feature is not outvoted by the dominant color: when a color that is
 * perceptually far (CIELAB >= `contrast`) from the block mode covers at least `share` of the block, it wins instead.
 * Merging near-identical shades (simplifyPalette) concentrates the vote on the main color, which would otherwise
 * erase 1-2px eyes and rims that previously survived only because the surrounding shade was split.
 */
export function contrastDownscale(
  src: Pixels,
  srcW: number,
  srcH: number,
  palette: (string | null)[],
  dstW: number = SPRITE_WIDTH,
  dstH: number = SPRITE_HEIGHT,
  share = 0.2,
  contrast = 40
): number[] {
  const base = modeDownscale(src, srcW, srcH, dstW, dstH);
  const labs = palette.map((c) => (c ? ((l) => rgbToLab(l[0], l[1], l[2]))(hexRgb(c)) : null));
  const bx = Math.floor(srcW / dstW);
  const by = Math.floor(srcH / dstH);
  const need = bx * by * share;
  const counts = new Map<number, number>();
  const out = base.slice();
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const m = base[y * dstW + x];
      if (!m || !labs[m]) continue;
      counts.clear();
      for (let yy = y * by; yy < (y + 1) * by; yy++) {
        for (let xx = x * bx; xx < (x + 1) * bx; xx++) {
          const v = src[yy * srcW + xx];
          if (v && v !== m) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
      let best = m;
      let bestC = 0;
      for (const [v, c] of counts) {
        const l = labs[v];
        if (c >= need && l && c > bestC && labDist(l, labs[m] as Lab) >= contrast) {
          best = v;
          bestC = c;
        }
      }
      out[y * dstW + x] = best;
    }
  }
  return out;
}
