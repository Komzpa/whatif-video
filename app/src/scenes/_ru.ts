// Russian-language drawing helpers (TREATMENT r7): the chapter line (the handbook's own Russian heading, timed
// to the sung line; no English karaoke), fence stencils, typewritten taped notices, the metro «М» sign.
import * as THREE from 'three';
import type { Line } from '../engine/lyrics';
import { F, font } from '../engine/type';
import { clamp, smoothstep } from '../engine/util';
import { rgba, mixRgba } from '../engine/palette';
import { logText } from '../textlog';

/**
 * The chapter line: the Russian heading, lit letter by letter as the line is sung (first word to last word),
 * the letter at the front in red. `y` is the baseline of the LAST row (the block grows upwards from the
 * bottom of the frame). Returns the block's box.
 */
export function drawHeading(c: CanvasRenderingContext2D, L: Line, heading: string, t: number, o: {
  x: number; y: number; width: number; size: number; until?: number; alpha?: number; plate?: number;
}) {
  const w0 = L.words[0]!, w1 = L.words[L.words.length - 1]!;
  const a = (o.alpha ?? 1) * smoothstep(w0.start - 0.2, w0.start - 0.02, t) * (o.until !== undefined ? 1 - smoothstep(o.until - 0.25, o.until - 0.05, t) : 1);
  if (a <= 0.001) return null;
  const size = o.size, fam = F.metro(900);
  c.save();
  c.font = font(fam, size); c.letterSpacing = `${size * 0.02}px`; c.textBaseline = 'alphabetic';
  // wrap
  const words = heading.split(' ');
  const rows: string[] = [];
  let cur = '';
  for (const w of words) { const nx = cur ? `${cur} ${w}` : w; if (c.measureText(nx).width > o.width && cur) { rows.push(cur); cur = w; } else cur = nx; }
  if (cur) rows.push(cur);
  const lead = size * 1.02;
  const top = o.y - (rows.length - 1) * lead;
  const cap = c.measureText('Н').actualBoundingBoxAscent;
  const bw = Math.max(...rows.map((r) => c.measureText(r).width));
  c.globalAlpha *= a;
  if (o.plate) {
    const g = c.createLinearGradient(0, top - cap - size * 0.5, 0, o.y + size * 0.4);
    g.addColorStop(0, rgba('shadow', 0)); g.addColorStop(0.35, rgba('shadow', o.plate)); g.addColorStop(1, rgba('shadow', o.plate));
    c.fillStyle = g; c.fillRect(o.x - size * 0.4, top - cap - size * 0.5, bw + size * 0.8, o.y - top + cap + size * 0.9);
  }
  // progress over the sung line, in characters
  const total = rows.join('').length;
  const p = clamp((t - w0.start) / Math.max(0.3, w1.end - w0.start));
  const lit = p * total;
  let k = 0;
  rows.forEach((row, ri) => {
    let x = o.x;
    const y = top + ri * lead;
    for (const ch of row) {
      const on = clamp(lit - k);
      c.fillStyle = on >= 1 ? rgba('paper', 1) : on > 0 ? mixRgba('red', 'paper', 0.15) : rgba('paper', 0.34);
      c.fillText(ch, x, y);
      x += c.measureText(ch).width + size * 0.02;
      k++;
    }
  });
  c.restore();
  const box = { x: o.x, y: top - cap, w: bw, h: o.y - top + cap + size * 0.22 };
  logText('karaoke', heading, a >= 0.97, box, { cap, id: `karaoke:${heading}` });
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

