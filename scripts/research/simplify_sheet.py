"""Compose before/after contact sheet: python3 simplify_sheet.py DIR  (reads DIR/<name>.{before,after}.rgba 32x48)"""
import sys, json
from PIL import Image, ImageDraw
d = sys.argv[1]; names = json.load(open(f'{d}/names.json')); S = 6
W, H = 32*S, 48*S; pad = 8
sheet = Image.new('RGBA', (2*(W+pad)+pad+110, len(names)*(H+pad)+pad), (60,60,70,255))
dr = ImageDraw.Draw(sheet)
for r, n in enumerate(names):
    dr.text((pad, pad+r*(H+pad)+H//2), n, fill=(255,255,255,255))
    for c, k in enumerate(['before','after']):
        im = Image.frombytes('RGBA', (32,48), open(f'{d}/{n}.{k}.rgba','rb').read()).resize((W,H), Image.NEAREST)
        x = 110+pad+c*(W+pad); y = pad+r*(H+pad)
        sheet.paste(Image.new('RGBA',(W,H),(200,200,210,255)),(x,y)); sheet.alpha_composite(im,(x,y))
sheet.save(sys.argv[2])
