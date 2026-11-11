/**
 * Before/after evaluation of palette simplification + smooth shading on saved NB2.1 raws.
 *   python3 scripts/research/simplify_dump.py $TMP/raw
 *   bun scripts/research/simplify-eval.ts $TMP/raw $TMP/out [thresholdPalette] [thresholdSmooth]
 *   python3 scripts/research/simplify_sheet.py $TMP/out docs/research-runs/2026-11-11-sprites-nb21-v2/simplify-before-after.png
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { keyBackground, mapToPalette, medianCutPalette } from '../../services/chromaKey'
import { contrastDownscale, centerSpriteInFrame, keepMainComponents, mergePalette, modeDownscale, removeOrphans, simplifyPalette, smoothShading } from '../../services/spriteCleanup'

const [rawDir, outDir, tp = '14', ts = '14', sh = '0.35', ct = '50'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const W = 512, H = 768, SW = 32, SH = 48
const hex = (r: number, g: number, b: number) => '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)

function run(data: Uint8Array, simplify: boolean) {
  const { mask } = keyBackground(data as any, W, H)
  let pal = medianCutPalette(data, mask, 23)
  let idx = mapToPalette(data, mask, pal)
  if (simplify) {
    const counts = new Array(pal.length).fill(0)
    for (let i = 0; i < idx.length; i++) if (idx[i]) counts[idx[i] - 1]++
    const s = simplifyPalette(pal, counts, +tp)
    pal = s.palette
    idx = mapToPalette(data, mask, pal)
  }
  const base: (string | null)[] = [null, ...pal.map(([r, g, b]) => hex(r, g, b))]
  let px = simplify ? contrastDownscale(idx, W, H, base, SW, SH, +sh, +ct) : modeDownscale(idx, W, H, SW, SH)
  px = removeOrphans(px)
  px = keepMainComponents(px)
  if (simplify) px = smoothShading(px, base, SW, SH, +ts)
  const m = mergePalette(px, base, 24)
  const pixels = centerSpriteInFrame(m.pixels, m.palette, SW, SH)
  return { pixels, palette: m.palette }
}

function metrics(px: number[]) {
  let single = 0, boundary = 0, filled = 0
  const used = new Set<number>()
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const v = px[y * SW + x]
    if (!v) continue
    filled++; used.add(v)
    let same = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy
      const n = xx < 0 || yy < 0 || xx >= SW || yy >= SH ? 0 : px[yy * SW + xx]
      if (n === v) same++
      if (dx > 0 || dy > 0) if (n !== v && n !== 0) boundary++ // interior color edges, each counted once
    }
    if (same === 0) single++
  }
  // connected regions of same color
  const seen = new Uint8Array(px.length); let regions = 0, tiny = 0
  for (let i = 0; i < px.length; i++) {
    if (!px[i] || seen[i]) continue
    regions++; let size = 0; const st = [i]; seen[i] = 1
    while (st.length) {
      const c = st.pop()!; size++; const x = c % SW, y = (c / SW) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= SW || yy >= SH) continue
        const j = yy * SW + xx
        if (!seen[j] && px[j] === px[i]) { seen[j] = 1; st.push(j) }
      }
    }
    if (size <= 2) tiny++
  }
  return { colors: used.size, regions, tinyRegions: tiny, isolated1px: single, colorEdges: boundary, filled }
}

const names = readdirSync(rawDir).filter((f) => f.endsWith('.rgba')).map((f) => f.replace('.rgba', ''))
writeFileSync(`${outDir}/names.json`, JSON.stringify(names))
const tot = { b: { colors: 0, regions: 0, tinyRegions: 0, colorEdges: 0 }, a: { colors: 0, regions: 0, tinyRegions: 0, colorEdges: 0 } }
for (const n of names) {
  const data = new Uint8Array(readFileSync(`${rawDir}/${n}.rgba`))
  const row: any = { name: n }
  for (const [k, simp] of [['before', false], ['after', true]] as const) {
    const r = run(data, simp)
    const rgba = new Uint8Array(SW * SH * 4)
    r.pixels.forEach((v, i) => {
      const c = r.palette[v]
      if (c) { rgba[i * 4] = parseInt(c.slice(1, 3), 16); rgba[i * 4 + 1] = parseInt(c.slice(3, 5), 16); rgba[i * 4 + 2] = parseInt(c.slice(5, 7), 16); rgba[i * 4 + 3] = 255 }
    })
    writeFileSync(`${outDir}/${n}.${k}.rgba`, rgba)
    const m = metrics(r.pixels); row[k] = m
    const t = tot[k === 'before' ? 'b' : 'a']; t.colors += m.colors; t.regions += m.regions; t.tinyRegions += m.tinyRegions; t.colorEdges += m.colorEdges
  }
  console.log(n.padEnd(18), 'before', JSON.stringify(row.before), '\n'.padEnd(19), 'after ', JSON.stringify(row.after))
}
console.log('TOTAL before', JSON.stringify(tot.b), 'after', JSON.stringify(tot.a))
