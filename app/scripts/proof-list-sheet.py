#!/usr/bin/env python3
"""Proof sheet of every glyph-soup sign or every POV hand run, from qa-reading-time's --garble-list / --hand-list.

Usage:
  proof-list-sheet.py times RT.txt GARBLE|HAND            -> prints the comma-joined mid times (for render.ts stills)
  proof-list-sheet.py sheet OUT.jpg RT.txt GARBLE|HAND STILLS_DIR
Each cell is the still at the run's middle, labelled with the run and (for glyph soup) the id and the text.
"""
import re, sys, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def rows(rt: str, tag: str):
    out = []
    for ln in Path(rt).read_text().splitlines():
        if not ln.startswith(tag):
            continue
        f = ln.split('\t')
        out.append({'id': f[0][len(tag):].strip(), 'mid': float(f[1]), 'run': f[2], 'dur': f[3], 'text': f[4] if len(f) > 4 else ''})
    return out

mode = sys.argv[1]
if mode == 'times':
    print(','.join(f"{r['mid']:.2f}" for r in rows(sys.argv[2], sys.argv[3])))
    sys.exit(0)
out, rt, tag, sdir = sys.argv[2:6]
items = rows(rt, tag)
files = [p for p in Path(sdir).iterdir() if p.suffix == '.png']
def find(t):
    for p in files:
        m = re.search(r'(\d+\.\d+)', p.stem)
        if m and abs(float(m.group(1)) - t) < 0.006:
            return p
    return None
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
except OSError:
    font = ImageFont.load_default()
probe = next((find(r['mid']) for r in items if find(r['mid'])), None)
if probe is None:
    sys.exit('no stills found')
w0, h0 = Image.open(probe).size
cw = 480 if w0 >= h0 else 270
ch = round(cw * h0 / w0)
cap = 58
ncol = 4 if w0 >= h0 else 6
nrow = (len(items) + ncol - 1) // ncol
sheet = Image.new('RGB', (ncol * (cw + 6), nrow * (ch + cap + 6)), (16, 16, 18))
d = ImageDraw.Draw(sheet)
miss = []
for i, r in enumerate(items):
    x, y = (i % ncol) * (cw + 6), (i // ncol) * (ch + cap + 6)
    p = find(r['mid'])
    if p:
        sheet.paste(Image.open(p).convert('RGB').resize((cw, ch), Image.LANCZOS), (x, y))
    else:
        miss.append(r['mid']); d.rectangle([x, y, x + cw, y + ch], outline=(200, 60, 60), width=3)
    lab = f"{r['mid']:.2f}s  run {r['run']} ({r['dur']})"
    if r['id']:
        lab += '\n' + textwrap.shorten(f"{r['id']}  {r['text']}", cw // 8)
    d.multiline_text((x + 4, y + ch + 4), lab, fill=(235, 235, 235), font=font, spacing=3)
sheet.save(out, quality=88)
print(f'{out}: {len(items)} {tag} cells' + (f', MISSING {miss}' if miss else ''))
