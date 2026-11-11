#!/usr/bin/env python3
"""
Research harness: generate sprites with the app's prompt (variant A) and a research-based prompt (variant B),
run the app's real pipeline (via baseline.ts) and prototype cleanup passes, and save EVERY step for review.

Usage: python3 -I scripts/research/run.py <out_dir> [--only name1,name2] [--variants A,B]
The Gemini key is read from .env.local and is never printed or written.
"""
import base64, json, os, re, subprocess, sys, time, urllib.request, urllib.error, io
from collections import Counter
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash-image')  # default = the model wrangler.jsonc used before the upgrade
W, H, GW, GH = 32, 48, 256, 384
MAGENTA = (255, 0, 255)

CHARACTERS = {
    'nerd-glasses': 'computer nerd with round glasses and headphones, holding a laptop in one hand, wearing a teal hoodie',
    'sunglasses-cool': 'cool street guy wearing black sunglasses, leather jacket and jeans, spiky black hair',
    'cyclops': 'friendly one-eyed cyclops monster with a single big round eye, green skin and small horns',
    'visor-robot': 'small robot with a glowing cyan visor across its face, grey metal body and antenna',
    'pink-hair-girl': 'girl with long pink hair, big blue eyes, a white dress and red shoes',
    'dark-wizard': 'old wizard in a dark hooded purple robe with a long white beard holding a wooden staff',
    'heterochromia-cat': 'cat-eared kid with one blue eye and one green eye, orange hair and a striped sweater',
    'knight-helmet': 'knight in full silver armor with a closed helmet with a narrow eye slit, red plume and a shield',
}

def prompt_A(desc):
    # Mirrors shared/prompts.ts buildSpritePrompt exactly.
    return f"""
    A single full-body character sprite of a {desc}, pixel art style, super-deformed chibi proportions.

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
  """

def prompt_B(desc):
    # Research-based variant (see docs/pixel-art-research.md section 7). Experimental.
    return f"""Pixel art chibi game sprite of a {desc}.
Full body, front view, standing idle pose, centered, one single character (not a sprite sheet or grid).
Hard pixel edges, solid flat color fills, flat shading, limited color palette, clean 1-pixel dark outline, bold simple silhouette with few internal details.
Face: eyes or eyewear are large, simple and clearly separated from the outline and hair, drawn with 2-3 flat colors and no gradients. Eyewear such as glasses, sunglasses or visors is drawn as simple solid shapes with at most one small highlight. Eye shape and color follow the character description.
Background: flat solid pure #FF00FF magenta, no gradient, no shadow, no grid lines, no watermark. Do not use magenta or pink-magenta anywhere on the character.
The character fills the vertical frame with small padding at top and bottom."""

PROMPTS = {'A': prompt_A, 'B': prompt_B}

def load_key():
    for line in open(os.path.join(ROOT, '.env.local')):
        if line.startswith('GEMINI_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"\'')
    raise SystemExit('GEMINI_API_KEY missing in .env.local')

def call_gemini(key, text):
    body = json.dumps({'contents': [{'parts': [{'text': text}]}],
                       'generationConfig': {'imageConfig': {'aspectRatio': '3:4'}}}).encode()
    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent',
        data=body, headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def extract(resp):
    texts, img, mime = [], None, None
    for p in resp.get('candidates', [{}])[0].get('content', {}).get('parts', []):
        if 'text' in p: texts.append(p['text'])
        d = p.get('inlineData') or p.get('inline_data')
        if d and d.get('data') and img is None:
            img, mime = base64.b64decode(d['data']), d.get('mimeType') or d.get('mime_type')
    return img, mime, texts

# ---------- rendering ----------
def hex_to_rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
def is_magenta(rgb): return sum((a - b) ** 2 for a, b in zip(rgb, MAGENTA)) ** 0.5 < 130

def render(pixels, palette, w=W, h=H):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = im.load()
    for i, ci in enumerate(pixels):
        if ci and palette[ci] and not is_magenta(hex_to_rgb(palette[ci])):
            px[i % w, i // w] = hex_to_rgb(palette[ci]) + (255,)
    return im

def on_checker(im, scale):
    big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    bg = Image.new('RGBA', big.size, (26, 32, 44, 255))
    bp = bg.load()
    c = max(scale, 8)
    for y in range(big.height):
        for x in range(big.width):
            if (x // c + y // c) % 2: bp[x, y] = (45, 55, 72, 255)
    bg.alpha_composite(big)
    return bg.convert('RGB')

def save_step(d, name, im, scale=8):
    im.save(os.path.join(d, name + '.png'))
    on_checker(im, scale).save(os.path.join(d, name + '@8x.png'))

def diff_overlay(prev, cur, palette, scale=8):
    base = on_checker(render(cur, palette), scale).convert('RGBA')
    ov = Image.new('RGBA', base.size, (0, 0, 0, 0))
    op = ov.load()
    for i, (a, b) in enumerate(zip(prev, cur)):
        if a != b:
            x, y = i % W, i // W
            for dy in range(scale):
                for dx in range(scale):
                    if dx in (0, scale - 1) or dy in (0, scale - 1):
                        op[x * scale + dx, y * scale + dy] = (255, 40, 40, 255)
    base.alpha_composite(ov)
    return base.convert('RGB')

# ---------- metrics ----------
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = N4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))
def at(p, x, y): return p[y * W + x] if 0 <= x < W and 0 <= y < H else 0

def components(p):
    seen, comps = set(), []
    for i, v in enumerate(p):
        if v and i not in seen:
            stack, comp = [i], []
            seen.add(i)
            while stack:
                j = stack.pop(); comp.append(j)
                x, y = j % W, j // W
                for dx, dy in N8:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        k = ny * W + nx
                        if p[k] and k not in seen: seen.add(k); stack.append(k)
            comps.append(comp)
    return comps

def metrics(p, palette=None):
    fg = [i for i, v in enumerate(p) if v]
    isolated = sum(1 for i in fg if not any(at(p, i % W + dx, i // W + dy) for dx, dy in N4))
    lonely = sum(1 for i in fg if not any(at(p, i % W + dx, i // W + dy) == p[i] for dx, dy in N4))
    holes = sum(1 for i, v in enumerate(p) if not v and sum(1 for dx, dy in N4 if at(p, i % W + dx, i // W + dy)) >= 3
                and 0 < i % W < W - 1 and 0 < i // W < H - 1)
    comps = components(p)
    return {'fg_pixels': len(fg), 'isolated_fg': isolated, 'lonely_color_px': lonely, 'tiny_holes': holes,
            'components': len(comps), 'small_components_lt6': sum(1 for c in comps if len(c) < 6),
            'colors_used': len(set(v for v in p if v))}

# ---------- prototype passes (EXPERIMENTAL, not app code) ----------
def mode_downscale(q):
    out = []
    bx, by = GW // W, GH // H
    for y in range(H):
        for x in range(W):
            cnt = Counter()
            for yy in range(y * by, (y + 1) * by):
                row = yy * GW
                for xx in range(x * bx, (x + 1) * bx): cnt[q[row + xx]] += 1
            bg = cnt.get(0, 0)
            cnt.pop(0, None)
            out.append(0 if (not cnt or bg > bx * by // 2) else cnt.most_common(1)[0][0])
    return out

def remove_orphans(p):
    out = list(p)
    for i, v in enumerate(p):
        x, y = i % W, i // W
        nb = [at(p, x + dx, y + dy) for dx, dy in N4]
        if v:
            if not any(nb): out[i] = 0                       # isolated speck
            elif v not in nb:                                  # lonely color inside a region
                c = Counter(n for n in nb if n)
                top, n = c.most_common(1)[0]
                if n >= 2 or len([n for n in nb if n]) >= 3: out[i] = top
        else:
            filled = [n for n in nb if n]
            if len(filled) >= 3 and 0 < x < W - 1 and 0 < y < H - 1:   # 1px hole
                out[i] = Counter(filled).most_common(1)[0][0]
    return out

def keep_main_components(p, min_size=6):
    comps = components(p)
    if not comps: return p
    big = max(comps, key=len)
    keep = set(big)
    bx = [(j % W, j // W) for j in big]
    for c in comps:
        if c is big: continue
        near = any(abs(j % W - a) <= 2 and abs(j // W - b) <= 2 for j in c for a, b in bx)
        if len(c) >= min_size or near: keep.update(c)
    return [v if i in keep else 0 for i, v in enumerate(p)]

def merge_palette(p, palette, thresh=36):
    cnt = Counter(v for v in p if v)
    order = [i for i, _ in cnt.most_common()]
    rep = {}
    kept = []
    for i in order:
        rgb = hex_to_rgb(palette[i])
        tgt = next((k for k in kept if sum((a - b) ** 2 for a, b in zip(rgb, hex_to_rgb(palette[k]))) ** 0.5 < thresh), None)
        if tgt is None: kept.append(i); rep[i] = i
        else: rep[i] = tgt
    return [rep.get(v, v) if v else 0 for v in p], len(kept)

def center(p):
    xs = [i % W for i, v in enumerate(p) if v]; ys = [i // W for i, v in enumerate(p) if v]
    if not xs: return p
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    ox, oy = (W - (x1 - x0 + 1)) // 2, (H - (y1 - y0 + 1)) // 2
    out = [0] * (W * H)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            out[(oy + y - y0) * W + ox + x - x0] = p[y * W + x]
    return out

def rgb_hex(c): return '#%02x%02x%02x' % tuple(int(round(v)) for v in c)

def median_cut_quantize(rgba_bytes, n=23):
    """EXPERIMENTAL: median-cut palette over real (non-background) colors; returns (indices[GW*GH], palette[None,...])."""
    bins = {}
    fg = []
    for i in range(GW * GH):
        r, g, b, a = rgba_bytes[i*4:i*4+4]
        if a < 128 or is_magenta((r, g, b)): fg.append(None); continue
        k = (r >> 3, g >> 3, b >> 3)
        e = bins.setdefault(k, [0, 0, 0, 0]); e[0] += r; e[1] += g; e[2] += b; e[3] += 1
        fg.append(k)
    items = [(k, (v[0]/v[3], v[1]/v[3], v[2]/v[3]), v[3]) for k, v in bins.items()]
    boxes = [items]
    while len(boxes) < n:
        cand = [bx for bx in boxes if len(bx) > 1]
        if not cand: break
        def rng(bx): return max(max(c[1][ch] for c in bx) - min(c[1][ch] for c in bx) for ch in range(3))
        bx = max(cand, key=lambda b_: rng(b_) * (sum(c[2] for c in b_) ** 0.5))
        ch = max(range(3), key=lambda c_: max(c[1][c_] for c in bx) - min(c[1][c_] for c in bx))
        bx.sort(key=lambda c: c[1][ch]); half = sum(c[2] for c in bx) / 2; acc = 0; cut = 1
        for j, c in enumerate(bx):
            acc += c[2]
            if acc >= half: cut = max(1, min(len(bx) - 1, j + 1)); break
        boxes.remove(bx); boxes += [bx[:cut], bx[cut:]]
    pal_rgb = []
    for bx in boxes:
        t = sum(c[2] for c in bx)
        pal_rgb.append(tuple(sum(c[1][ch] * c[2] for c in bx) / t for ch in range(3)))
    cache = {}
    idx = []
    for k in fg:
        if k is None: idx.append(0); continue
        if k not in cache:
            rgb = bins[k][0] / bins[k][3], bins[k][1] / bins[k][3], bins[k][2] / bins[k][3]
            cache[k] = 1 + min(range(len(pal_rgb)), key=lambda j: sum((a - b) ** 2 for a, b in zip(rgb, pal_rgb[j])))
        idx.append(cache[k])
    return idx, [None] + [rgb_hex(c) for c in pal_rgb]

# ---------- orchestration ----------
def process(d, name, variant, img_bytes, mime, bun):
    ext = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}.get(mime, 'bin')
    open(os.path.join(d, f'01-gemini-raw.{ext}'), 'wb').write(img_bytes)
    src = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
    meta = {'source_size': list(src.size), 'mime': mime}
    # App step: draw into 256x384 with smoothing disabled (nearest), regardless of aspect ratio.
    r256 = src.resize((GW, GH), Image.NEAREST)
    r256.save(os.path.join(d, '02-resized-256x384.png'))
    rgba = os.path.join(d, '_rgba.bin'); open(rgba, 'wb').write(r256.tobytes())
    out_json = os.path.join(d, '_baseline.json')
    subprocess.run([bun, os.path.join(ROOT, 'scripts/research/baseline.ts'), rgba, out_json], check=True, cwd=ROOT)
    b = json.load(open(out_json)); os.remove(rgba); os.remove(out_json)
    palette = b['palette']
    meta['palette_size'] = len(palette) - 1
    # 03 quantized 256x384 preview
    qim = Image.new('RGBA', (GW, GH), (0, 0, 0, 0)); qp = qim.load()
    for i, ci in enumerate(b['quantized']):
        if ci and palette[ci] and not is_magenta(hex_to_rgb(palette[ci])): qp[i % GW, i // GW] = hex_to_rgb(palette[ci]) + (255,)
    on_checker(qim, 1).save(os.path.join(d, '03-quantized-256x384.png'))
    steps, m = [], {}
    def add(label, key, p, prev=None, pal=None):
        pal = pal or palette
        save_step(d, key, render(p, pal))
        if prev is not None: diff_overlay(prev, p, pal).save(os.path.join(d, key + '-diff.png'))
        m[label] = metrics(p); steps.append({'key': key, 'label': label, 'diff': prev is not None})
    # baseline = the app's current pipeline
    add('baseline: nearest downscale', '04-baseline-raw32x48', b['raw32x48'])
    add('baseline: centered (final in app)', '05-baseline-final', b['centered'], b['raw32x48'])
    # experimental pipeline
    e1 = mode_downscale(b['quantized']); add('exp: mode downscale', '10-exp-mode-downscale', e1)
    e2 = remove_orphans(e1); add('exp: orphans + holes', '11-exp-orphans', e2, e1)
    e3 = keep_main_components(e2); add('exp: keep main components', '12-exp-components', e3, e2)
    e4, kept = merge_palette(e3, palette); add(f'exp: palette merge ({kept} colors kept)', '13-exp-palette-merge', e4, e3)
    e5 = center(e4); add('exp: centered (final)', '14-exp-final', e5, e4)
    # baseline + only the orphan pass, to isolate its effect
    f1 = remove_orphans(b['centered']); add('baseline + orphan pass only', '20-baseline-plus-orphans', f1, b['centered'])
    # experimental pipeline 2: better palette (median cut on real colors) instead of top-N exact RGB
    mq, pal2 = median_cut_quantize(r256.tobytes())
    q2 = Image.new('RGBA', (GW, GH), (0, 0, 0, 0)); q2p = q2.load()
    for i, ci in enumerate(mq):
        if ci: q2p[i % GW, i // GW] = hex_to_rgb(pal2[ci]) + (255,)
    on_checker(q2, 1).save(os.path.join(d, '30-exp2-median-cut-256x384.png'))
    g1 = mode_downscale(mq); add('exp2: median-cut + mode downscale', '31-exp2-mode-downscale', g1, pal=pal2)
    g2 = remove_orphans(g1); add('exp2: orphans + holes', '32-exp2-orphans', g2, g1, pal2)
    g3 = keep_main_components(g2); add('exp2: keep main components', '33-exp2-components', g3, g2, pal2)
    g4, kept2 = merge_palette(g3, pal2); add(f'exp2: palette merge ({kept2} colors kept)', '34-exp2-palette-merge', g4, g3, pal2)
    g5 = center(g4); add('exp2: centered (final)', '35-exp2-final', g5, g4, pal2)
    json.dump({'baseline_final': b['centered'], 'exp_final': e5, 'exp2_final': g5, 'exp2_palette': pal2},
              open(os.path.join(d, 'indices.json'), 'w'))
    meta['palette_exp2'] = pal2
    meta['palette'] = palette; meta['metrics'] = m; meta['steps'] = steps
    return meta

def main():
    out = sys.argv[1]
    only = None; variants = ['A', 'B']
    if '--only' in sys.argv: only = sys.argv[sys.argv.index('--only') + 1].split(',')
    if '--variants' in sys.argv: variants = sys.argv[sys.argv.index('--variants') + 1].split(',')
    bun = os.path.expanduser('~/.bun/bin/bun')
    key = load_key()
    results = []
    for name, desc in CHARACTERS.items():
        if only and name not in only: continue
        for v in variants:
            d = os.path.join(out, name, v); os.makedirs(d, exist_ok=True)
            text = PROMPTS[v](desc)
            open(os.path.join(d, '00-prompt.txt'), 'w').write(text)
            print(f'[{name}/{v}] generating...', flush=True)
            resp = None
            for attempt in range(2):
                try:
                    resp = call_gemini(key, text); break
                except Exception as e:
                    print(f'  attempt {attempt+1} failed: {type(e).__name__} {getattr(e, "code", "")}', flush=True); time.sleep(5)
            if resp is None: results.append({'name': name, 'variant': v, 'error': 'api failure'}); continue
            img, mime, texts = extract(resp)
            json.dump({'texts': texts, 'finishReason': resp.get('candidates', [{}])[0].get('finishReason'),
                       'usage': resp.get('usageMetadata')}, open(os.path.join(d, '01-response-meta.json'), 'w'), indent=1)
            if not img: results.append({'name': name, 'variant': v, 'error': 'no image', 'texts': texts}); print('  no image', flush=True); continue
            meta = process(d, name, v, img, mime, bun)
            meta.update({'name': name, 'variant': v, 'desc': desc})
            json.dump({k: v_ for k, v_ in meta.items()}, open(os.path.join(d, 'metrics.json'), 'w'), indent=1)
            results.append(meta)
            m = meta['metrics']
            print(f"  baseline isolated={m['baseline: centered (final in app)']['isolated_fg']} lonely={m['baseline: centered (final in app)']['lonely_color_px']} "
                  f"| exp isolated={m['exp: centered (final)']['isolated_fg']} lonely={m['exp: centered (final)']['lonely_color_px']} "
                  f"| exp2 isolated={[v for k, v in m.items() if k.startswith('exp2: centered')][0]['isolated_fg']} lonely={[v for k, v in m.items() if k.startswith('exp2: centered')][0]['lonely_color_px']}", flush=True)
            time.sleep(2)
    json.dump(results, open(os.path.join(out, 'results.json'), 'w'), indent=1)

if __name__ == '__main__': main()
