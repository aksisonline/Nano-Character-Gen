#!/usr/bin/env python3
"""Builds index.html (review page) for a research run. Usage: python3 scripts/research/report.py <run_dir>"""
import html, json, os, sys

run = sys.argv[1]
results = json.load(open(os.path.join(run, 'results.json')))

def img(rel, label, w=None, cls=''):
    style = f' style="width:{w}px"' if w else ''
    return f'<figure class="{cls}"><a href="{rel}"><img src="{rel}" loading="lazy"{style}></a><figcaption>{html.escape(label)}</figcaption></figure>'

def row_metrics(m):
    cols = ['fg_pixels', 'isolated_fg', 'lonely_color_px', 'tiny_holes', 'components', 'small_components_lt6', 'colors_used']
    t = '<table class="m"><tr><th>stage</th>' + ''.join(f'<th>{c}</th>' for c in cols) + '</tr>'
    for k, v in m.items():
        t += f'<tr><td>{html.escape(k)}</td>' + ''.join(f'<td>{v[c]}</td>' for c in cols) + '</tr>'
    return t + '</table>'

body = []
sumrows = []
for r in results:
    n, v = r['name'], r['variant']
    if 'error' in r:
        body.append(f'<section><h2>{n} / prompt {v}</h2><p class="err">{html.escape(r["error"])}</p></section>')
        continue
    base = f'{n}/{v}/'
    m = r['metrics']
    fin = lambda pre: next(x for k, x in m.items() if k.startswith(pre))
    sumrows.append((n, v, fin('baseline: centered'), fin('exp: centered'), fin('exp2: centered')))
    steps = {s['key']: s for s in r['steps']}
    row1 = ''.join([
        img(base + '01-gemini-raw.png', f"1 · Gemini raw {r['source_size'][0]}×{r['source_size'][1]}", 150),
        img(base + '02-resized-256x384.png', '2 · app resize 256×384 (nearest)', 150),
        img(base + '03-quantized-256x384.png', f"3 · app quantize ({r['palette_size']} colors)", 150),
        img(base + '30-exp2-median-cut-256x384.png', '3b · exp2 median-cut palette', 150),
    ])
    def steprow(title, keys):
        out = f'<div class="grp"><h4>{title}</h4><div class="strip">'
        for k in keys:
            s = steps[k]
            out += img(base + k + '@8x.png', s['label'], 192)
            if s['diff']: out += img(base + k + '-diff.png', '↳ changed pixels (red)', 192, 'diff')
        return out + '</div></div>'
    body.append(f'''<section id="{n}-{v}"><h2>{n} <small>prompt {v}</small></h2>
<p class="desc">{html.escape(r['desc'])} · <a href="{base}00-prompt.txt">prompt</a> · <a href="{base}01-response-meta.json">response meta</a> · <a href="{base}metrics.json">metrics.json</a> · <a href="{base}indices.json">indices.json</a></p>
<div class="strip">{row1}</div>
{steprow('A · App pipeline today (real code)', ['04-baseline-raw32x48', '05-baseline-final'])}
{steprow('B · Prototype cleanup on the same palette', ['10-exp-mode-downscale', '11-exp-orphans', '12-exp-components', '13-exp-palette-merge', '14-exp-final'])}
{steprow('C · Prototype cleanup with median-cut palette', ['31-exp2-mode-downscale', '32-exp2-orphans', '33-exp2-components', '34-exp2-palette-merge', '35-exp2-final'])}
{steprow('D · App output + orphan pass only', ['20-baseline-plus-orphans'])}
{row_metrics(m)}</section>''')

summary = '<table class="m"><tr><th>character</th><th>prompt</th><th colspan=2>app today<br>isolated / lonely</th><th colspan=2>exp (same palette)</th><th colspan=2>exp2 (median-cut)</th><th>final previews (app · exp · exp2)</th></tr>'
for n, v, a, b, c in sumrows:
    b_ = f'{n}/{v}/'
    summary += (f'<tr><td><a href="#{n}-{v}">{n}</a></td><td>{v}</td><td>{a["isolated_fg"]}</td><td>{a["lonely_color_px"]}</td>'
                f'<td>{b["isolated_fg"]}</td><td>{b["lonely_color_px"]}</td><td>{c["isolated_fg"]}</td><td>{c["lonely_color_px"]}</td>'
                f'<td class="pv"><img src="{b_}05-baseline-final@8x.png" width=64><img src="{b_}14-exp-final@8x.png" width=64><img src="{b_}35-exp2-final@8x.png" width=64></td></tr>')
summary += '</table>'

page = f'''<!doctype html><meta charset="utf-8"><title>Sprite pipeline research run</title>
<style>
body{{background:#111;color:#ddd;font:14px/1.4 system-ui,sans-serif;margin:0;padding:24px 32px;max-width:1500px}}
a{{color:#f5a623}} h1{{margin:0 0 4px}} h2{{margin:36px 0 2px;border-top:2px solid #333;padding-top:16px}} h2 small{{color:#888;font-weight:400}}
h4{{margin:14px 0 4px;color:#f5a623;font-weight:600}} .desc{{color:#999;margin:0 0 8px}} .err{{color:#f66}}
.strip{{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start}} figure{{margin:0}} figcaption{{font-size:11px;color:#999;max-width:192px}}
img{{image-rendering:pixelated;display:block;border:1px solid #333;background:#222}} figure.diff img{{border-color:#a33}}
table.m{{border-collapse:collapse;margin:10px 0;font-size:12px}} .m td,.m th{{border:1px solid #333;padding:3px 8px;text-align:right}} .m td:first-child,.m th:first-child{{text-align:left}}
.pv img{{display:inline-block;margin:0 2px}} .note{{background:#1b1b1b;border-left:3px solid #f5a623;padding:8px 14px;margin:12px 0}}
</style>
<h1>Sprite pipeline research run</h1>
<p>Generated with <code>scripts/research/run.py</code> · model <code>gemini-2.5-flash-image</code> · prompt <b>A</b> = the app's current prompt, prompt <b>B</b> = research-based variant.</p>
<div class="note"><b>How to read:</b> "isolated" = foreground pixels with no foreground 4-neighbor; "lonely" = pixels with no same-colored 4-neighbor (a noise proxy, includes legitimate 1-px details like highlights and eye pupils). Lower is cleaner but not automatically better — check the images. Rows A is the real app code; B/C/D are throwaway prototypes in <code>run.py</code>, not app code.</div>
{summary}
{''.join(body)}'''
open(os.path.join(run, 'index.html'), 'w').write(page)
print('wrote', os.path.join(run, 'index.html'))
