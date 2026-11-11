#!/usr/bin/env python3
"""
Animation reference test: does the reference image format change frame consistency?
R0 = 32x48 transparent PNG (what App.tsx sends today)
R1 = 16x nearest-upscaled on flat #FF00FF
R2 = R1 + original high-res Gemini generation as a second image
Usage: python3 scripts/research/anim_test.py <out_dir> <run1_dir>
Frame processing mirrors services/imageProcessingService.ts processAnimationSheet (ported to Python).
"""
import base64, io, json, os, sys, time, urllib.request
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import run as R, keyer
import subprocess

W, H = 32, 48
CHARS = ['nerd-glasses', 'knight-helmet', 'sunglasses-cool']
ANIMS = {'idle': 'gentle idle breathing loop: the body bobs slightly up and down, arms and hair sway a little, feet stay planted',
         'attack': 'quick attack: wind up, lunge forward with a strike or spell, follow through, return to ready stance'}
FRAMES, COLS, ROWS, AR = 4, 2, 2, '3:4'
# Optional narrowing: ONLY=knight-helmet:attack  (char[:anim])
_only = os.environ.get('ONLY')
if _only:
    _c, _, _a = _only.partition(':')
    CHARS = [_c]
    if _a: ANIMS = {_a: ANIMS[_a]}

def anim_prompt(name, prompt):   # the app's REAL buildAnimationPrompt (new: flat key, no shadows)
    return subprocess.run([os.path.expanduser('~/.bun/bin/bun'), 'scripts/research/prompt.ts', 'anim', json.dumps({'name': name, 'prompt': prompt, 'frameCount': FRAMES, 'columns': COLS, 'rows': ROWS}), 'magenta'], cwd=R.ROOT, capture_output=True, text=True, check=True).stdout

def anim_prompt_old(name, prompt):   # previous text, kept for reference
    return f"""
    You are an expert pixel-art character animator. The attached image is the exact reference character.
    Create one sprite sheet containing exactly {FRAMES} sequential frames for the "{name}" animation.
    The animation action is: {prompt}

    Arrange the frames in a {COLS}-column by {ROWS}-row grid, reading left to right and then top to bottom.
    Each cell contains one complete, centered, full-body pose of the same character. Use every cell exactly once.
    Keep the character's identity, outfit, colors, proportions, outline, and pixel-art style consistent with the reference.
    Do not add props, weapons, or effects that are not in the reference. Use a solid #FF00FF background.
    Leave a small gap between cells. Do not add borders, labels, numbers, or extra frames.
  """

def b64(im):
    b = io.BytesIO(); im.save(b, 'PNG'); return base64.b64encode(b.getvalue()).decode()

def call(key, text, images):
    parts = [{'text': text}] + [{'inlineData': {'mimeType': 'image/png', 'data': b64(i)}} for i in images]
    body = json.dumps({'contents': [{'parts': parts}], 'generationConfig': {'imageConfig': {'aspectRatio': AR}}}).encode()
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{R.MODEL}:generateContent',
                                 data=body, headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    with urllib.request.urlopen(req, timeout=180) as r: return json.load(r)

def dist(a, b): return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5

def process_sheet(sheet, palette_rgb):
    """Port of processAnimationSheet: per-cell nearest resize, drop bg (alpha/magenta/dominant color), nearest palette."""
    cw, ch = sheet.width / COLS, sheet.height / ROWS
    frames, cells = [], []
    for f in range(FRAMES):
        c, r = f % COLS, f // COLS
        cell = sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        cells.append(cell)
        small = cell.convert('RGBA').resize((W, H), Image.NEAREST)
        data = list(small.getdata())
        cnt = {}
        for p in data:
            if p[3] >= 128: cnt[p[:3]] = cnt.get(p[:3], 0) + 1
        bg = max(cnt, key=cnt.get) if cnt else (255, 0, 255)
        idx = []
        for p in data:
            rgb = p[:3]
            if p[3] < 128 or R.is_magenta(rgb) or dist(rgb, bg) < 75: idx.append(0); continue
            idx.append(1 + min(range(len(palette_rgb)), key=lambda k: dist(rgb, palette_rgb[k])))
        frames.append(idx)
    return frames, cells

def process_sheet_keyed(sheet, palette_rgb):
    """New: key each cell at 256x384 with the hue keyer, map fg to the LOCKED palette, mode-downscale, orphan cleanup."""
    cw, ch = sheet.width / COLS, sheet.height / ROWS; frames, stats = [], []
    for f in range(FRAMES):
        c, r = f % COLS, f // COLS
        cell = sheet.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))).convert('RGB').resize((R.GW, R.GH), Image.NEAREST)
        px = list(cell.getdata()); mask, st = keyer.key_mask(px, R.GW, R.GH); stats.append({k: st[k] for k in ('bg_color', 'border_uniformity', 'key_conflict', 'swallowed_pct_of_image')})
        q = keyer.index_map(px, mask, palette_rgb)
        p = R.mode_downscale(q); p = R.remove_orphans(p); p = R.keep_main_components(p)
        frames.append(p)
    return frames, stats

def bbox(p):
    xs = [i % W for i, v in enumerate(p) if v]; ys = [i // W for i, v in enumerate(p) if v]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else None

def shift(p, dx, dy):
    out = [0] * (W * H)
    for i, v in enumerate(p):
        if v:
            x, y = i % W + dx, i // W + dy
            if 0 <= x < W and 0 <= y < H: out[y * W + x] = v
    return out

def iou(a, b):
    A = {i for i, v in enumerate(a) if v}; B = {i for i, v in enumerate(b) if v}
    return len(A & B) / len(A | B) if A | B else 0

def register(p, ref):
    """Integer shift: align bottom row and horizontal centroid to the reference frame."""
    bp, br = bbox(p), bbox(ref)
    if not bp or not br: return p
    cx = lambda q: sum(i % W for i, v in enumerate(q) if v) / max(1, sum(1 for v in q if v))
    return shift(p, round(cx(ref) - cx(p)), br[3] - bp[3])

def analyze(frames, ref_sprite, pal_size_ref):
    ref_boxes = [bbox(f) for f in frames]
    out = {'frames_nonempty': sum(1 for b in ref_boxes if b)}
    if not all(ref_boxes): return out
    hs = [b[3] - b[1] + 1 for b in ref_boxes]; ws = [b[2] - b[0] + 1 for b in ref_boxes]
    out['height_range'] = [min(hs), max(hs)]; out['width_range'] = [min(ws), max(ws)]
    out['bottom_y'] = [b[3] for b in ref_boxes]
    out['iou_vs_frame0_raw'] = [round(iou(frames[0], f), 2) for f in frames[1:]]
    out['iou_vs_frame0_registered'] = [round(iou(frames[0], register(f, frames[0])), 2) for f in frames[1:]]
    out['iou_frame0_vs_reference_registered'] = round(iou(ref_sprite, register(frames[0], ref_sprite)), 2)
    out['colors_used'] = len({v for f in frames for v in f if v})
    out['stray'] = [R.metrics(f)['isolated_fg'] for f in frames]
    return out

def main():
    out, run1 = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True); key = R.load_key(); results = []
    for n in CHARS:
        bv = os.environ.get('BASE_VARIANT', 'A')   # which earlier variant supplies the base sprite + high-res original
        idx = json.load(open(os.path.join(run1, n, bv, 'indices.json')))
        pal2 = idx.get('exp2_palette') or idx['palette']; sprite = idx.get('exp2_final') or idx['final']
        used = sorted({v for v in sprite if v})
        palette_rgb = [R.hex_to_rgb(pal2[i]) for i in used]; remap = {u: k + 1 for k, u in enumerate(used)}
        sprite_local = [remap.get(v, 0) for v in sprite]
        base = R.render(sprite, pal2)                                   # R0 (32x48, transparent)
        up = base.resize((W * 16, H * 16), Image.NEAREST)
        mag = Image.new('RGBA', up.size, (255, 0, 255, 255)); mag.alpha_composite(up); r1 = mag.convert('RGB')
        import glob
        hi = Image.open(sorted(glob.glob(os.path.join(run1, n, bv, '01-gemini-raw.*')))[0]).convert('RGB')
        refs = {'R0': [base], 'R1': [r1], 'R2': [r1, hi]}
        nd = os.path.join(out, n); os.makedirs(nd, exist_ok=True)
        base.save(os.path.join(nd, 'base-sprite-32x48.png')); r1.save(os.path.join(nd, 'ref-R1-16x-on-magenta.png'))
        for an, ap in ANIMS.items():
            for v, imgs in refs.items():
                d = os.path.join(nd, f'{an}-{v}'); os.makedirs(d, exist_ok=True)
                text = anim_prompt(an, ap)
                if v == 'R2': text += "\n    A second attached image is the same character at high resolution; use it for fine detail (face, eyes, eyewear). The first image is the exact pixel sprite to match."
                open(os.path.join(d, '00-prompt.txt'), 'w').write(text)
                print(f'[{n}/{an}/{v}] generating...', flush=True)
                try: resp = call(key, text, imgs)
                except Exception as e:
                    print('  failed', type(e).__name__, getattr(e, 'code', '')); results.append({'name': n, 'anim': an, 'ref': v, 'error': 'api'}); continue
                img, mime, texts = R.extract(resp)
                if not img: print('  no image', [t[:80] for t in texts]); results.append({'name': n, 'anim': an, 'ref': v, 'error': 'no image'}); continue
                open(os.path.join(d, '01-sheet.png'), 'wb').write(img)
                sheet = Image.open(io.BytesIO(img)).convert('RGBA')
                frames_old, cells = process_sheet(sheet, palette_rgb)
                frames, kstats = process_sheet_keyed(sheet, palette_rgb)
                pal_local = [None] + [R.rgb_hex(c) for c in palette_rgb]
                def rp(p):
                    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); q = im.load()
                    for i, ci in enumerate(p):
                        if ci: q[i % W, i // W] = palette_rgb[ci - 1] + (255,)
                    return im
                for i, f in enumerate(frames_old): R.save_step(d, f'02-old-frame{i}', rp(f))
                for i, f in enumerate(frames):
                    R.save_step(d, f'04-new-frame{i}', rp(f))
                    R.save_step(d, f'05-new-registered{i}', rp(register(f, frames[0]) if i else f))
                a = analyze(frames, sprite_local, len(used)); a['old_processing'] = analyze(frames_old, sprite_local, len(used)); a['keyer'] = kstats
                a.update({'name': n, 'anim': an, 'ref': v, 'sheet_size': list(sheet.size), 'sheet_aspect_requested': AR, 'usage': resp.get('usageMetadata'), 'model': R.MODEL})
                json.dump(a, open(os.path.join(d, 'analysis.json'), 'w'), indent=1); results.append(a)
                print('  new', {k: a.get(k) for k in ('iou_vs_frame0_registered', 'iou_frame0_vs_reference_registered', 'height_range')}, '| old', {k: a['old_processing'].get(k) for k in ('iou_vs_frame0_registered', 'iou_frame0_vs_reference_registered', 'height_range')}, flush=True)
                time.sleep(2)
    json.dump(results, open(os.path.join(out, 'results.json'), 'w'), indent=1)

if __name__ == '__main__': main()
