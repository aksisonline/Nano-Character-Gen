"""Dump saved NB2.1 raws as 512x768 RGBA (box resize) for simplify-eval.ts: python3 simplify_dump.py OUT_DIR"""
import os, sys
from PIL import Image
R = 'docs/research-runs/2026-11-11-sprites-nb21-v2'
NAMES = ['knight-helmet','visor-robot','nerd-glasses','sunglasses-cool','heterochromia-cat','dark-wizard','pink-hair-girl']
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
for n in NAMES:
    p = f'{R}/{n}/E/01-gemini-raw.jpg'
    if not os.path.exists(p): print('missing', p); continue
    Image.open(p).convert('RGBA').resize((512,768), Image.BOX).tobytes()
    open(f'{out}/{n}.rgba','wb').write(Image.open(p).convert('RGBA').resize((512,768), Image.BOX).tobytes())
