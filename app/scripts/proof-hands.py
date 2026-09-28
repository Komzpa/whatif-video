#!/usr/bin/env python3
"""Proof sheet for the POV torch hand against the author's grip photos (reference/hand-torch-2026-09-28).

Usage: proof-hands.py OUT.png STILL.png [STILL.png ...]
Each render still is shown full frame next to a crop of the reference grip (a closed fist round the barrel,
back of the hand and knuckles towards the viewer, the body continuing forward out of the fist, the lanyard
hanging from the tail), so a reviewer compares pose, not colour. The references cycle across the stills.
"""
import sys, glob, os
from PIL import Image, ImageOps, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
REF = os.path.join(ROOT, 'reference', 'hand-torch-2026-09-28')
# crops (x0, y0, x1, y1) of the 1098x2560 portrait photos around the fist and torch
CROPS = {
    'img_307262a3c26e.jpg': (250, 600, 1098, 1700),
    'img_3e3c932159e5.jpg': (0, 700, 1098, 1700),
    'img_5ef22c2a2e69.jpg': (0, 650, 1098, 1650),
    'img_b1d326549ea8.jpg': (0, 1150, 1098, 2150),
    'img_c22138132b90.jpg': (0, 1150, 1098, 2150),
    'img_86dfb2368427.jpg': (0, 500, 1098, 1900),
}
out, stills = sys.argv[1], sys.argv[2:]
refs = [ImageOps.exif_transpose(Image.open(os.path.join(REF, k))).convert('RGB').crop(v) for k, v in CROPS.items() if os.path.exists(os.path.join(REF, k))]
H = 420
rows = []
for i, s in enumerate(stills):
    im = Image.open(s).convert('RGB'); im = im.resize((int(im.width * H / im.height), H))
    rf = refs[i % len(refs)]; rf = rf.resize((int(rf.width * H / rf.height), H))
    row = Image.new('RGB', (im.width + rf.width + 8, H + 22), (20, 20, 20))
    row.paste(im, (0, 22)); row.paste(rf, (im.width + 8, 22))
    ImageDraw.Draw(row).text((4, 4), f'render {os.path.basename(os.path.dirname(s))}/{os.path.basename(s)}   |   reference grip', fill=(230, 230, 230))
    rows.append(row)
cols = 2 if rows and rows[0].width < 1200 else 1
w = max(r.width for r in rows); h = rows[0].height
n = (len(rows) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * n), (20, 20, 20))
for i, r in enumerate(rows): sheet.paste(r, ((i % cols) * w, (i // cols) * h))
sheet.save(out)
print(out, sheet.size)
