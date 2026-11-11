"""
Prototype chroma keyer (pure Python). Replaces the app's fixed 'distance from #FF00FF < 130' test.

Ideas:
 1. Estimate the REAL background color from the image border (Gemini's 'magenta' is a gradient, not #FF00FF).
 2. A pixel is a background candidate if its HUE is close to the background hue (with enough saturation/value),
    so darker or lighter shades of the key color (gradient, vignette, tinted shadow) are still keyed.
 3. Flood-fill from the border only. Interior key-colored parts of the character survive unless they are an
    enclosed pocket that matches the background color tightly (gap between arm and body).
 4. De-fringe: blended edge pixels that lean toward the key hue next to the background are removed.
 5. QA stats: border uniformity, key leakage into the character, pocket size, shadow suspicion.
"""
from collections import Counter

def hsv(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b); d = mx - mn
    v = mx / 255.0; s = 0 if mx == 0 else d / mx
    if d == 0: h = 0.0
    elif mx == r: h = (60 * ((g - b) / d)) % 360
    elif mx == g: h = 60 * ((b - r) / d) + 120
    else: h = 60 * ((r - g) / d) + 240
    return h, s, v

def hue_diff(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)

def rgb_dist(a, b): return ((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2) ** 0.5

def estimate_bg(px, w, h, ring=3):
    pts = []
    for y in range(h):
        for x in range(w):
            if x < ring or y < ring or x >= w - ring or y >= h - ring: pts.append(px[y * w + x])
    med = tuple(sorted(c[i] for c in pts)[len(pts) // 2] for i in range(3))
    near = sum(1 for c in pts if rgb_dist(c, med) < 70) / len(pts)
    return med, near

def key_mask(px, w, h, key_hint=None, hue_tol=28, sat_min=0.30, val_min=0.18, rgb_loose=60, rgb_tight=55, defringe=2):
    """px: list of (r,g,b). Returns (mask list[bool] True=background, stats dict)."""
    bg, uniform = estimate_bg(px, w, h)
    bh, bs, bv = hsv(*bg)
    cache = {}
    def cand(c):
        v = cache.get(c)
        if v is None:
            hh, ss, vv = hsv(*c)
            v = (ss >= sat_min and vv >= val_min and hue_diff(hh, bh) <= hue_tol) or rgb_dist(c, bg) < rgb_loose
            cache[c] = v
        return v
    mask = [False] * (w * h); stack = []
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not mask[i] and cand(px[i]): mask[i] = True; stack.append(i)
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not mask[i] and cand(px[i]): mask[i] = True; stack.append(i)
    while stack:
        i = stack.pop(); x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not mask[j] and cand(px[j]): mask[j] = True; stack.append(j)
    # enclosed pockets that match the background tightly (between arm and body, between legs)
    pocket = 0
    for i in range(w * h):
        if not mask[i] and rgb_dist(px[i], bg) < rgb_tight: mask[i] = True; pocket += 1
    # de-fringe: key-tinted blended pixels touching the background
    removed = 0
    for _ in range(defringe):
        new = []
        for i in range(w * h):
            if mask[i]: continue
            x, y = i % w, i // w
            if not any(0 <= x+dx < w and 0 <= y+dy < h and mask[(y+dy)*w + x+dx] for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))): continue
            hh, ss, vv = hsv(*px[i])
            if ss >= 0.2 and vv >= 0.25 and hue_diff(hh, bh) <= hue_tol + 20 and rgb_dist(px[i], bg) < 140: new.append(i)
        for i in new: mask[i] = True
        removed += len(new)
    # 'swallowed': keyed pixels far from the real background color, i.e. key-hued parts of the character
    # (pink hair on a magenta key) that the hue rule removed. Gradient/shadow pixels are small; hair is big.
    swallowed = sum(1 for i in range(w * h) if mask[i] and rgb_dist(px[i], bg) > 100)
    fg = [i for i in range(w * h) if not mask[i]]
    leak = sum(1 for i in fg if (lambda t: t[1] >= sat_min and t[2] >= val_min and hue_diff(t[0], bh) <= hue_tol)(hsv(*px[i])))
    return mask, {'bg_color': '#%02x%02x%02x' % bg, 'bg_hue': round(bh), 'border_uniformity': round(uniform, 3),
                  'fg_pixels': len(fg), 'pocket_px': pocket, 'defringe_px': removed,
                  'key_leak_px': leak, 'key_leak_pct': round(100 * leak / max(1, len(fg)), 2),
                  'swallowed_px': swallowed, 'swallowed_pct_of_image': round(100 * swallowed / (w * h), 2),
                  'key_conflict': swallowed > 0.02 * w * h}

def shadow_suspect(mask, w, h):
    """Heuristic: a wide, unbroken fg run in the bottom rows while the rows above split into two legs."""
    rows = [y for y in range(h) if any(not mask[y*w+x] for x in range(w))]
    if not rows: return False
    y1 = max(rows); y0 = min(rows); bw = max(sum(1 for x in range(w) if not mask[y*w+x]) for y in rows)
    def runs(y):
        r, cur = 0, False
        for x in range(w):
            f = not mask[y*w+x]
            if f and not cur: r += 1
            cur = f
        return r
    def width(y): return sum(1 for x in range(w) if not mask[y*w+x])
    bottom = [y for y in range(max(y0, y1 - 5), y1 + 1)]
    above = [y for y in range(max(y0, y1 - 25), max(y0, y1 - 8))]
    wide_unbroken = sum(1 for y in bottom if runs(y) == 1 and width(y) > 0.7 * bw) >= 3
    split_above = sum(1 for y in above if runs(y) >= 2) >= max(3, len(above) // 3)
    return bool(wide_unbroken and split_above)

def median_cut(px, fg_idx, n=23):
    """Median-cut palette over foreground pixels only. Returns (palette_rgb list, assign dict bin->palette idx)."""
    bins = {}
    for i in fg_idx:
        r, g, b = px[i]; k = (r >> 3, g >> 3, b >> 3)
        e = bins.setdefault(k, [0, 0, 0, 0]); e[0] += r; e[1] += g; e[2] += b; e[3] += 1
    items = [(k, (v[0]/v[3], v[1]/v[3], v[2]/v[3]), v[3]) for k, v in bins.items()]
    boxes = [items]
    while len(boxes) < n:
        cand = [b for b in boxes if len(b) > 1]
        if not cand: break
        rng = lambda b: max(max(c[1][ch] for c in b) - min(c[1][ch] for c in b) for ch in range(3))
        bx = max(cand, key=lambda b: rng(b) * (sum(c[2] for c in b) ** 0.5))
        ch = max(range(3), key=lambda c_: max(c[1][c_] for c in bx) - min(c[1][c_] for c in bx))
        bx.sort(key=lambda c: c[1][ch]); half = sum(c[2] for c in bx) / 2; acc = 0; cut = 1
        for j, c in enumerate(bx):
            acc += c[2]
            if acc >= half: cut = max(1, min(len(bx) - 1, j + 1)); break
        boxes.remove(bx); boxes += [bx[:cut], bx[cut:]]
    pal = []
    for b in boxes:
        t = sum(c[2] for c in b); pal.append(tuple(sum(c[1][ch] * c[2] for c in b) / t for ch in range(3)))
    return pal

def index_map(px, mask, palette_rgb):
    cache, out = {}, []
    for i, c in enumerate(px):
        if mask[i]: out.append(0); continue
        k = (c[0] >> 3, c[1] >> 3, c[2] >> 3)
        if k not in cache:
            cache[k] = 1 + min(range(len(palette_rgb)), key=lambda j: sum((a - b) ** 2 for a, b in zip(c, palette_rgb[j])))
        out.append(cache[k])
    return out
