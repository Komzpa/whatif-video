// Russian-language drawing helpers (TREATMENT r7): the chapter line (the handbook's own Russian heading, timed
// to the sung line; no English karaoke), fence stencils, typewritten taped notices, the metro «М» sign.
import * as THREE from 'three';
import type { Line } from '../engine/lyrics';
import { F, font } from '../engine/type';
import { clamp, smoothstep } from '../engine/util';
import { rgba, mixRgba } from '../engine/palette';
import { logText } from '../textlog';

/** The chapter line's layout (wrap, rows, baselines, the plate box) with `c`'s font set for it; drawHeading and the
 *  label placement (LitScene.headBoxAt) share it, so the reserved box is the drawn one. */
export function layoutHeading(c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, heading: string, o: { x: number; y: number; width: number; size: number; top?: boolean }) {
  const size = o.size, fam = F.metro(900);
  c.font = font(fam, size); c.letterSpacing = `${size * 0.02}px`; c.textBaseline = 'alphabetic';
  const words = heading.split(' ');
  const rows: string[] = [];
  let cur = '';
  for (const w of words) { const nx = cur ? `${cur} ${w}` : w; if (c.measureText(nx).width > o.width && cur) { rows.push(cur); cur = w; } else cur = nx; }
  if (cur) rows.push(cur);
  const lead = size * 1.02;
  const cap = c.measureText('Н').actualBoundingBoxAscent;
  const top = o.top ? o.y + cap : o.y - (rows.length - 1) * lead;
  const yb = top + (rows.length - 1) * lead; // the last row's baseline
  const bw = Math.max(...rows.map((r) => c.measureText(r).width));
  // the plate holds every row whole (cap top to below the baseline) so no row fades into the ground behind it
  const plate = { x: o.x - size * 0.4, y: top - cap - size * 0.32, w: bw + size * 0.8, h: yb - top + cap + size * 0.62 };
  return { rows, lead, cap, top, yb, bw, plate };
}

/**
 * The chapter line: the Russian heading, lit letter by letter as the line is sung (first word to last word),
 * the letter at the front in red. `y` is the baseline of the LAST row (the block grows upwards from the
 * bottom of the frame). Returns the block's box.
 */
export function drawHeading(c: CanvasRenderingContext2D, L: Line, heading: string, t: number, o: {
  x: number; y: number; width: number; size: number; until?: number; alpha?: number; plate?: number;
  /** r9 note 4: `y` is the cap top of the first row (the line hangs from the top of the frame) instead of the last baseline. */
  top?: boolean;
}) {
  const w0 = L.words[0]!, w1 = L.words[L.words.length - 1]!;
  // staggered out/in (TESTPLAN gate 3: no double exposure): the previous line is gone 0.14 s before the next
  // line's first word, the next one fades in over the last 0.12 s before it
  const a = (o.alpha ?? 1) * smoothstep(w0.start - 0.12, w0.start - 0.01, t) * (o.until !== undefined ? 1 - smoothstep(o.until - 0.3, o.until - 0.14, t) : 1);
  if (a <= 0.001) return null;
  const size = o.size;
  c.save();
  const { rows, lead, cap, top, yb, bw, plate: pl } = layoutHeading(c, heading, o);
  const plate = o.plate ? pl : null;
  c.globalAlpha *= a;
  if (plate) { c.fillStyle = rgba('shadow', o.plate!); c.fillRect(plate.x, plate.y, plate.w, plate.h); }
  // progress over the sung line, in characters
  const total = rows.join('').length;
  const p = clamp((t - w0.start) / Math.max(0.3, w1.end - w0.start));
  const lit = p * total;
  // sung letters paper, the front letter red, the unsung rest a solid muted paper (A9: >= 4.5:1 on the plate)
  const SUNG = rgba('paper', 1), FRONT = mixRgba('red', 'paper', 0.28), UNSUNG = mixRgba('paper', 'shadow', 0.26);
  const ink: { box: { x: number; y: number; w: number; h: number }; fg: string; size: number }[] = [];
  let k = 0;
  rows.forEach((row, ri) => {
    let x = o.x;
    const y = top + ri * lead;
    for (const ch of row) {
      const on = clamp(lit - k);
      const fg = on >= 1 ? SUNG : on > 0 ? FRONT : UNSUNG;
      c.fillStyle = fg;
      c.fillText(ch, x, y);
      const cw = c.measureText(ch).width;
      // runs of letters that share one ink, with their boxes (for the contrast check)
      const lastInk = ink[ink.length - 1];
      if (ch !== ' ') {
        if (lastInk && lastInk.fg === fg && Math.abs(lastInk.box.y - (y - cap)) < 1 && x - (lastInk.box.x + lastInk.box.w) < size * 0.4) lastInk.box.w = x + cw - lastInk.box.x;
        else ink.push({ box: { x, y: y - cap, w: cw, h: cap }, fg, size });
      }
      x += cw + size * 0.02;
      k++;
    }
  });
  c.restore();
  const box = { x: o.x, y: top - cap, w: bw, h: yb - top + cap + size * 0.22 };
  logText('karaoke', heading, a >= 0.97, box, { cap, id: `karaoke:${heading}`, ink: a >= 0.97 ? ink : undefined, lit: Math.floor(lit) });
  return box;
}

/** Stencil lettering (fence paint): the condensed black face with the stencil bridges cut through each glyph. */
export function stencilText(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, bg: string) {
  c.save();
  c.font = font(F.stencil(), size); c.letterSpacing = `${size * 0.08}px`; c.textBaseline = 'alphabetic';
  c.fillStyle = color; c.fillText(text, x, y);
  // bridges: thin gaps where a stencil holds its islands (vertical through round letters, horizontal mid-height)
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = bg;
  let cx = x;
  for (const ch of text) {
    const w = c.measureText(ch).width;
    if (/[ОСЭЮЯБВДРФЗЕАДЖ0689]/.test(ch)) c.fillRect(cx + w * 0.46, y - size * 0.8, size * 0.06, size * 0.85);
    if (/[АНИЙВЕЁЗЭШЩЫ]/.test(ch)) c.fillRect(cx, y - size * 0.4, w, size * 0.05);
    cx += w + size * 0.08;
  }
  c.restore();
}

/** A typewritten notice taped up: paper, two strips of tape, the typed lines (a CanvasTexture for a plane). */
export function noticeCanvas(lines: string[], o: { w?: number; h?: number; title?: string } = {}) {
  const W = o.w ?? 512, H = o.h ?? 360;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#E9E2CF'; c.fillRect(0, 0, W, H);
  // damp and grime
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(90,70,40,${0.02 + 0.03 * ((i * 37) % 7) / 7})`; c.beginPath(); c.arc((i * 131) % W, (i * 71) % H, 12 + (i % 5) * 9, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(210,205,180,0.8)';
  c.save(); c.translate(W * 0.12, 8); c.rotate(-0.12); c.fillRect(-40, -12, 110, 30); c.restore();
  c.save(); c.translate(W * 0.88, 8); c.rotate(0.1); c.fillRect(-70, -12, 110, 30); c.restore();
  c.fillStyle = '#1E1B16';
  let y = 90;
  if (o.title) { c.font = font(F.typewriter(700), 46); c.textAlign = 'center'; c.fillText(o.title, W / 2, y); y += 60; }
  c.font = font(F.typewriter(400), 30); c.textAlign = 'left';
  for (const ln of lines) { c.fillText(ln, 40, y); y += 40; }
  return cv;
}

/** A textured plane for a notice (paper), placed by the caller. */
export function noticeMesh(cv: HTMLCanvasElement, wM: number) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, wM * cv.height / cv.width), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  return m;
}

/** The metro sign: a red «М» on a white disc (a plain letter, our own lettering). Drawn on a canvas. */
export function metroSignCanvas(size = 256, lit = 1) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const c = cv.getContext('2d')!;
  c.fillStyle = mixRgba('#8F8A80', '#FFFFFF', lit); c.beginPath(); c.arc(size / 2, size / 2, size * 0.47, 0, Math.PI * 2); c.fill();
  c.fillStyle = mixRgba('#5A1E18', '#D7362B', lit);
  c.font = font(F.metro(900), size * 0.72); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillText('М', size / 2, size * 0.76);
  return cv;
}

