#!/usr/bin/env python3
"""Visual half of TESTPLAN A14: one row of stills per recurring element (TREATMENT r8 continuity table).

Usage: proof-continuity.py OUT.jpg STILLS_DIR 'child:31,55,...' 'cat:27.8,...' ...
Stills are the files `bun scripts/render.ts stills --out STILLS_DIR` writes; the one whose name carries the time
(e.g. `t031.00` / `31.00`) is picked. Each row is labelled with the element, each cell with its time.
"""
import re, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out, sdir, rows = sys.argv[1], Path(sys.argv[2]), sys.argv[3:]
files = sorted(p for p in sdir.iterdir() if p.suffix.lower() in ('.png', '.jpg'))

def find(t: float) -> Path | None:
    best = None
    for p in files:
        for m in re.finditer(r'(\d+(?:\.\d+)?)', p.stem):
            v = float(m.group(1))
            if abs(v - t) < 0.006 and (best is None or len(p.name) < len(best.name)):
                best = p
    return best

try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except OSError:
    font = ImageFont.load_default()

parsed = [(lab, [float(x) for x in ts.split(',')]) for lab, ts in (r.split(':', 1) for r in rows)]
probe = next(find(t) for _, ts in parsed for t in ts if find(t))
w0, h0 = Image.open(probe).size
cw = 360 if w0 >= h0 else 200
ch = round(cw * h0 / w0)
lab_w, ncol = 130, max(len(ts) for _, ts in parsed)
sheet = Image.new('RGB', (lab_w + ncol * (cw + 4), len(parsed) * (ch + 4)), (18, 18, 20))
d = ImageDraw.Draw(sheet)
missing = []
for r, (lab, ts) in enumerate(parsed):
    y = r * (ch + 4)
    d.text((8, y + ch // 2 - 12), lab, fill=(240, 240, 240), font=font)
    for c, t in enumerate(ts):
        x = lab_w + c * (cw + 4)
        p = find(t)
        if p is None:
            missing.append(f'{lab}@{t}')
            d.rectangle([x, y, x + cw, y + ch], outline=(200, 60, 60), width=3)
            continue
        sheet.paste(Image.open(p).convert('RGB').resize((cw, ch), Image.LANCZOS), (x, y))
        d.rectangle([x, y, x + 78, y + 28], fill=(0, 0, 0))
        d.text((x + 4, y + 2), f'{t:.1f}s', fill=(255, 220, 90), font=font)
sheet.save(out, quality=88)
print(f'{out}: {len(parsed)} rows' + (f', MISSING {missing}' if missing else ''))
sys.exit(1 if missing else 0)
