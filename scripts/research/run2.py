#!/usr/bin/env python3
"""
Sprite run v2 (new model + new keyer). Variants:
  A = the app's OLD prompt (magenta key, shadows allowed), aspect 3:4  -> also runs the app's real pipeline for reference
  D = the app's NEW prompt (no shadows, key color chosen per character), aspect 3:4
  E = same as D but aspect 2:3 (matches the 32:48 canvas, no squash)
Pipeline for every variant: keyer -> median-cut palette (fg only) -> mode downscale -> orphans -> components -> gentle merge -> center.
Usage: GEMINI_MODEL=gemini-nano-banana-2.1 python3 scripts/research/run2.py <out_dir> [--only a,b] [--variants A,D,E]
"""
import io, json, os, subprocess, sys, time, urllib.request
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import run as R, keyer

ROOT = R.ROOT; W, H, GW, GH = R.W, R.H, R.GW, R.GH
BUN = os.path.expanduser('~/.bun/bin/bun')
KEY_RGB = {'magenta': (255, 0, 255), 'green': (0, 255, 0)}

def app_prompt(desc, key):
    return subprocess.run([BUN, 'scripts/research/prompt.ts', 'sprite', desc, key], cwd=ROOT, capture_output=True, text=True, check=True).stdout
def choose_key(desc):
    return subprocess.run([BUN, 'scripts/research/prompt.ts', 'key', desc], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()

def call(key, text, ar):
    body = json.dumps({'contents': [{'parts': [{'text': text}]}], 'generationConfig': {'imageConfig': {'aspectRatio': ar}}}).encode()
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{R.MODEL}:generateContent',
                                 data=body, headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    with urllib.request.urlopen(req, timeout=180) as r: return json.load(r)

def render_plain(p, pal):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); px = im.load()
    for i, ci in enumerate(p):
        if ci and pal[ci]: px[i % W, i // W] = R.hex_to_rgb(pal[ci]) + (255,)
    return im

def save(d, key, p, pal, prev=None, m=None, label=None, steps=None):
    im = render_plain(p, pal); im.save(os.path.join(d, key + '.png')); R.on_checker(im, 8).save(os.path.join(d, key + '@8x.png'))
    if prev is not None:
        base = R.on_checker(im, 8).convert('RGBA'); ov = Image.new('RGBA', base.size, (0, 0, 0, 0)); op = ov.load()
        for i, (a, b) in enumerate(zip(prev, p)):
            if a != b:
                x, y = i % W, i // W
                for dy in range(8):
                    for dx in range(8):
                        if dx in (0, 7) or dy in (0, 7): op[x*8+dx, y*8+dy] = (255, 40, 40, 255)
        base.alpha_composite(ov); base.convert('RGB').save(os.path.join(d, key + '-diff.png'))
    if m is not None: m[label] = R.metrics(p)
    if steps is not None: steps.append({'key': key, 'label': label, 'diff': prev is not None})

def process(d, name, variant, key_name, img_bytes, mime):
    ext = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}.get(mime, 'bin')
    open(os.path.join(d, f'01-gemini-raw.{ext}'), 'wb').write(img_bytes)
    src = Image.open(io.BytesIO(img_bytes)).convert('RGB'); meta = {'source_size': list(src.size), 'mime': mime, 'key': key_name}
    r256 = src.resize((GW, GH), Image.NEAREST); r256.save(os.path.join(d, '02-resized-256x384.png'))
    px = list(r256.getdata())
    mask, st = keyer.key_mask(px, GW, GH); st['shadow_suspect'] = keyer.shadow_suspect(mask, GW, GH); meta['keyer'] = st
    vis = Image.new('RGBA', (GW, GH), (26, 32, 44, 255)); vp = vis.load()
    for i, c in enumerate(px):
        if not mask[i]: vp[i % GW, i // GW] = c + (255,)
    vis.convert('RGB').save(os.path.join(d, '03-keyed-256x384.png'))
    fg = [i for i in range(GW * GH) if not mask[i]]
    pal_rgb = keyer.median_cut(px, fg, 23); q = keyer.index_map(px, mask, pal_rgb)
    pal = [None] + [R.rgb_hex(c) for c in pal_rgb]
    m, steps = {}, []
    e1 = R.mode_downscale(q); save(d, '10-mode-downscale', e1, pal, None, m, 'mode downscale', steps)
    e2 = R.remove_orphans(e1); save(d, '11-orphans', e2, pal, e1, m, 'orphans + holes', steps)
    e3 = R.keep_main_components(e2); save(d, '12-components', e3, pal, e2, m, 'keep main components', steps)
    e4, kept = R.merge_palette(e3, pal, 24); save(d, '13-palette-merge', e4, pal, e3, m, f'palette merge ({kept} kept)', steps)
    e5 = R.center(e4); save(d, '14-final', e5, pal, e4, m, 'centered (final)', steps)
    if variant == 'A':   # what the app produces today from this raw image (real code, magenta key)
        rgba = os.path.join(d, '_rgba.bin'); open(rgba, 'wb').write(r256.convert('RGBA').tobytes()); oj = os.path.join(d, '_b.json')
        subprocess.run([BUN, 'scripts/research/baseline.ts', rgba, oj], check=True, cwd=ROOT)
        b = json.load(open(oj)); os.remove(rgba); os.remove(oj)
        bp = b['palette']
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ip = im.load()
        for i, ci in enumerate(b['centered']):
            if ci and bp[ci] and not R.is_magenta(R.hex_to_rgb(bp[ci])): ip[i % W, i // W] = R.hex_to_rgb(bp[ci]) + (255,)
        im.save(os.path.join(d, '00-app-today.png')); R.on_checker(im, 8).save(os.path.join(d, '00-app-today@8x.png'))
        m['app today (real code)'] = R.metrics(b['centered']); meta['has_app_today'] = True
    meta['palette'] = pal; meta['metrics'] = m; meta['steps'] = steps; meta['final_colors'] = len({v for v in e5 if v})
    json.dump({'final': e5, 'palette': pal}, open(os.path.join(d, 'indices.json'), 'w'))
    return meta

def main():
    out = sys.argv[1]; only = None; variants = ['A', 'D', 'E']
    if '--only' in sys.argv: only = sys.argv[sys.argv.index('--only') + 1].split(',')
    if '--variants' in sys.argv: variants = sys.argv[sys.argv.index('--variants') + 1].split(',')
    key = R.load_key(); results = []
    for name, desc in R.CHARACTERS.items():
        if only and name not in only: continue
        kn = choose_key(desc)
        for v in variants:
            d = os.path.join(out, name, v); os.makedirs(d, exist_ok=True)
            if v == 'A': text, k, ar = R.prompt_A(desc), 'magenta', '3:4'
            else: text, k, ar = app_prompt(desc, kn), kn, ('2:3' if v == 'E' else '3:4')
            open(os.path.join(d, '00-prompt.txt'), 'w').write(text)
            print(f'[{name}/{v}] key={k} ar={ar} generating...', flush=True)
            resp = None
            for attempt in range(2):
                try: resp = call(key, text, ar); break
                except Exception as e: print('  attempt failed', type(e).__name__, getattr(e, 'code', ''), flush=True); time.sleep(5)
            if resp is None: results.append({'name': name, 'variant': v, 'error': 'api failure'}); continue
            img, mime, texts = R.extract(resp)
            json.dump({'texts': texts, 'finishReason': resp.get('candidates', [{}])[0].get('finishReason'), 'usage': resp.get('usageMetadata'), 'model': R.MODEL, 'aspect': ar}, open(os.path.join(d, '01-response-meta.json'), 'w'), indent=1)
            if not img: results.append({'name': name, 'variant': v, 'error': 'no image'}); print('  no image', flush=True); continue
            meta = process(d, name, v, k, img, mime); meta.update({'name': name, 'variant': v, 'desc': desc, 'aspect': ar, 'model': R.MODEL})
            json.dump(meta, open(os.path.join(d, 'metrics.json'), 'w'), indent=1); results.append(meta)
            ks = meta['keyer']
            print(f"  src={meta['source_size']} bg={ks['bg_color']} uniform={ks['border_uniformity']} swallowed={ks['swallowed_pct_of_image']}% conflict={ks['key_conflict']} shadow?={ks['shadow_suspect']} final_colors={meta['final_colors']}", flush=True)
            time.sleep(2)
    json.dump(results, open(os.path.join(out, 'results.json'), 'w'), indent=1)

if __name__ == '__main__': main()
