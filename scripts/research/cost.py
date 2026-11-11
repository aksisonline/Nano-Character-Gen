#!/usr/bin/env python3
"""Cost per Gemini call from saved usageMetadata. Rates (USD per 1M tokens) from the Gemini pricing page, 2026-11-11."""
import glob, json, os, sys, statistics as st
RATES = {  # input, text/thinking output, image output
    'gemini-nano-banana-2.1': (1.50, 7.50, 30.0),
    'gemini-3.1-flash-image': (0.50, 3.00, 60.0),
    'gemini-2.5-flash-image': (0.30, 2.50, 30.0),
}
def cost(u, model):
    ri, rt, rim = RATES[model]
    prompt = u.get('promptTokenCount', 0); cand = u.get('candidatesTokenCount', 0)
    img = sum(d['tokenCount'] for d in u.get('candidatesTokensDetails', []) if d['modality'] == 'IMAGE')
    thoughts = u.get('thoughtsTokenCount') or max(0, u.get('totalTokenCount', 0) - prompt - cand)
    text_out = cand - img
    usd = prompt * ri / 1e6 + (text_out + thoughts) * rt / 1e6 + img * rim / 1e6
    return usd, {'prompt': prompt, 'image_out': img, 'text_out': text_out, 'thoughts': thoughts}
def collect(pattern, model_default):
    rows = []
    for f in glob.glob(pattern, recursive=True):
        d = json.load(open(f)); u = d.get('usage') or d.get('usageMetadata')
        if not u: continue
        m = d.get('model') or model_default
        if m not in RATES: continue
        usd, parts = cost(u, m); rows.append({'file': f, 'model': m, 'usd': usd, 'ok': parts['image_out'] > 0, **parts})
    return rows
if __name__ == '__main__':
    rows = collect('docs/research-runs/2026-11-11-sprites-nb21/*/*/01-response-meta.json', 'gemini-nano-banana-2.1')
    rows += collect('docs/research-runs/2026-11-11-anim-full-nb21/*/analysis*.json', 'gemini-nano-banana-2.1')
    ok = [r for r in rows if r['ok']]; bad = [r for r in rows if not r['ok']]
    print(f'{len(rows)} calls with usage; {len(ok)} produced an image, {len(bad)} did not')
    if ok:
        print('image calls: mean $%.4f  min $%.4f  max $%.4f' % (st.mean(r['usd'] for r in ok), min(r['usd'] for r in ok), max(r['usd'] for r in ok)))
        print('mean tokens: prompt %.0f image_out %.0f text_out %.0f thoughts %.0f' % tuple(st.mean(r[k] for r in ok) for k in ('prompt', 'image_out', 'text_out', 'thoughts')))
    if bad: print('blocked/no-image calls: mean $%.5f total $%.4f' % (st.mean(r['usd'] for r in bad), sum(r['usd'] for r in bad)))
