#!/usr/bin/env python3
"""
Experiment: ask Gemini for pixel art directly on a 32x48 grid, and measure how well the output obeys a grid.
Variants:  C1 = text-only 'true low-res pixel art' prompt, aspect 2:3
           C2 = same + blank 32x48 grid template image as a reference
Control:   raw images from run1 (prompts A/B, aspect 3:4)
Usage: python3 scripts/research/direct.py <out_dir> <run1_dir>
"""
import base64, io, json, os, sys, time, urllib.request
from PIL import Image, ImageChops, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
import run as R

W, H = 32, 48
CHARS = ['nerd-glasses', 'knight-helmet', 'pink-hair-girl']

def template(cell=18):
    im = Image.new('RGB', (W * cell, H * cell), (255, 0, 255))
    d = ImageDraw.Draw(im)
    for x in range(W + 1): d.line([(x * cell, 0), (x * cell, H * cell)], fill=(214, 0, 214), width=1)
    for y in range(H + 1): d.line([(0, y * cell), (W * cell, y * cell)], fill=(214, 0, 214), width=1)
    return im

def prompt_C1(desc):
    return f"""True low-resolution pixel art of a {desc}.
The image is a 32 pixels wide by 48 pixels tall artwork shown enlarged with nearest-neighbor scaling: every art pixel is a perfectly square, flat-colored block of exactly the same size, aligned on a regular grid. No anti-aliasing, no blur, no gradients, no sub-pixel detail, no half-size pixels.
Full body, front view, standing, centered, chibi proportions, bold simple silhouette, clean 1-pixel dark outline, limited palette of about 16 colors. Eyes or eyewear are simple and 2-3 flat colors.
Background: flat solid pure #FF00FF magenta, no shadow, no gradient. Do not use magenta on the character."""

def prompt_C2(desc):
    return f"""The attached image is an empty 32 columns by 48 rows pixel grid. Draw pixel art of a {desc} strictly inside this grid: every grid cell is filled with exactly one flat color, no cell is split, no anti-aliasing, no blur, no gradients. Keep the same canvas size and grid.
Full body, front view, standing, centered, chibi proportions, bold simple silhouette, clean 1-cell dark outline, limited palette of about 16 colors. Eyes or eyewear are simple and 2-3 flat colors.
Background cells: flat solid pure #FF00FF magenta. Do not use magenta on the character."""

def call(key, text, image=None):
    parts = [{'text': text}]
    if image is not None:
        b = io.BytesIO(); image.save(b, 'PNG')
        parts.append({'inlineData': {'mimeType': 'image/png', 'data': base64.b64encode(b.getvalue()).decode()}})
    body = json.dumps({'contents': [{'parts': parts}], 'generationConfig': {'imageConfig': {'aspectRatio': '2:3'}}}).encode()
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{R.MODEL}:generateContent',
                                 data=body, headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)

def edge_profile(im, axis):
    g = im.convert('L')
    w, h = g.size
    if axis == 'x':
        diff = ImageChops.difference(g, ImageChops.offset(g, 1, 0))
        row = diff.resize((w, 1), Image.BOX)
        return list(row.getdata())
    diff = ImageChops.difference(g, ImageChops.offset(g, 0, 1))
    col = diff.resize((1, h), Image.BOX)
    return list(col.getdata())

def fit_grid(e, pmin=5.0, pmax=40.0):
    """Find pitch/offset whose grid lines carry the most edge energy. Returns (frac_on_lines, chance, pitch, offset)."""
    L = len(e); total = sum(e) or 1.0
    best = (0, 1, 0, 0)
    p = pmin
    while p <= pmax:
        o = 0.0
        while o < p:
            tot, k = 0.0, 0
            pos = o
            while pos < L:
                i = int(round(pos))
                tot += max(e[j] for j in range(max(0, i - 1), min(L, i + 2)))
                pos += p; k += 1
            frac = tot / total
            chance = 3.0 / p
            lift = frac / chance
            if lift > best[0] / best[1] if best[2] else True:
                if not best[2] or lift > best[0] / best[1]: best = (frac, chance, p, o)
            o += 0.5
        p += 0.25
    return best

def analyze(im):
    ex, ey = edge_profile(im, 'x'), edge_profile(im, 'y')
    fx, fy = fit_grid(ex), fit_grid(ey)
    return {'size': list(im.size),
            'x': {'edge_energy_on_grid': round(fx[0], 3), 'chance': round(fx[1], 3), 'pitch': fx[2], 'offset': fx[3]},
            'y': {'edge_energy_on_grid': round(fy[0], 3), 'chance': round(fy[1], 3), 'pitch': fy[2], 'offset': fy[3]},
            'cells': [round(im.size[0] / fx[2], 1), round(im.size[1] / fy[2], 1)]}

def sample_grid(im, nx, ny, mode_center=0.5):
    """Sample one color per cell (mode of the central region) -> RGBA nx x ny; background -> transparent."""
    w, h = im.size; out = Image.new('RGBA', (nx, ny), (0, 0, 0, 0)); px = out.load(); src = im.convert('RGB')
    for cy in range(ny):
        for cx in range(nx):
            x0, x1 = w * cx / nx, w * (cx + 1) / nx; y0, y1 = h * cy / ny, h * (cy + 1) / ny
            mx, my = (x1 - x0) * (1 - mode_center) / 2, (y1 - y0) * (1 - mode_center) / 2
            box = (int(x0 + mx), int(y0 + my), max(int(x0 + mx) + 1, int(x1 - mx)), max(int(y0 + my) + 1, int(y1 - my)))
            cnt = {}
            for c in src.crop(box).getdata(): cnt[c] = cnt.get(c, 0) + 1
            c = max(cnt, key=cnt.get)
            if not R.is_magenta(c): px[cx, cy] = c + (255,)
    return out

def main():
    out, run1 = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True); key = R.load_key(); results = []
    tpl = template(); tpl.save(os.path.join(out, 'grid-template-32x48.png'))
    # controls from run1
    for n in CHARS:
        for v in 'AB':
            im = Image.open(os.path.join(run1, n, v, '01-gemini-raw.png'))
            results.append({'name': n, 'variant': f'control-{v}', **analyze(im)}); print('control', n, v, results[-1]['cells'], flush=True)
    for n in CHARS:
        desc = R.CHARACTERS[n]
        for v, fn, ref in (('C1', prompt_C1, None), ('C2', prompt_C2, tpl)):
            d = os.path.join(out, n, v); os.makedirs(d, exist_ok=True)
            text = fn(desc); open(os.path.join(d, '00-prompt.txt'), 'w').write(text)
            print(f'[{n}/{v}] generating...', flush=True)
            try: resp = call(key, text, ref)
            except Exception as e: print('  failed', type(e).__name__, getattr(e, 'code', '')); results.append({'name': n, 'variant': v, 'error': 'api'}); continue
            img, mime, texts = R.extract(resp)
            if not img: print('  no image', texts[:1]); results.append({'name': n, 'variant': v, 'error': 'no image'}); continue
            ext = 'png' if mime == 'image/png' else 'jpg'
            open(os.path.join(d, f'01-gemini-raw.{ext}'), 'wb').write(img)
            im = Image.open(io.BytesIO(img)).convert('RGB')
            a = analyze(im); a.update({'name': n, 'variant': v})
            # sample at detected cell counts AND at the intended 32x48
            nx, ny = 32, 48
            s = sample_grid(im, nx, ny); R.save_step(d, '02-sampled-32x48', s)
            a['colors_after_sampling'] = len(set(s.getdata())) - 1
            a['stray'] = R.metrics([1 if p[3] else 0 for p in s.getdata()])
            json.dump(a, open(os.path.join(d, 'analysis.json'), 'w'), indent=1); results.append(a)
            print('  size', a['size'], 'cells(x,y)', a['cells'], 'on-grid x/y', a['x']['edge_energy_on_grid'], a['y']['edge_energy_on_grid'], flush=True)
            time.sleep(2)
    json.dump(results, open(os.path.join(out, 'results.json'), 'w'), indent=1)

if __name__ == '__main__': main()
