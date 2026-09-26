// Shared motifs for every chapter of What if (docs/TREATMENT.md "Signature devices").
// Recurring things must look identical across chapters, so they live here:
//   paper side  : contents entry with dot leader + per-word karaoke, red page numbers, page counter
//   drone side  : WHAT TO DO panel, annotation callouts, the lamp (volumetric cone + CPU line lighting)
//   figures     : the child (raincoat silhouette, no face) and the lantern-drone (original designs)
//   city side   : sky/haze, fog, glows (lights, windows, wet reflections), rain, lit wireframes,
//                 the city's system line and its wide signage type
//   CityScene   : a Scene base class that owns the usual layers in the usual order.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H, rtScale } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LineBatch } from '../engine/lines';
import { HEX, LIN, rgba, mixRgba, type PaletteKey } from '../engine/palette';
import { F, font, measure, layout } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import type { AudioData } from '../engine/audio';
import { clamp, ease, frameIdx, hash, lerp, mulberry32, noise1, prog, smoothstep } from '../engine/util';
import { CONTENTS, INTRO } from '../contents';

export { HEX, LIN, rgba, mixRgba };
type RGB = [number, number, number];

/** Title-safe margin for lyric text (TREATMENT "Karaoke rules"). */
export const SAFE = 96;

/** Post-processing defaults for the whole video: only the lamp blooms (threshold above everything else). */
export const POST_BASE: PostOverrides = {
  bloom: 0.75, bloomThreshold: 1.05, bloomKnee: 0.35, bloomRadius: 0.8,
  halation: 0.1, ca: 0.7, grain: 0.045, vignette: 0.42,
};

const scaleRGB = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mixRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export { scaleRGB, mixRGB };

// =====================================================================================================
// Lyrics helpers
// =====================================================================================================

/** The contents entry (page, chapter) of a lyric line, or null. */
export function entryOfLine(ly: Lyrics, line: Line) {
  return CONTENTS.find((e) => ly.get(e.line) === line) ?? null;
}
/** The lyric line of a contents entry. */
export const lineOf = (ly: Lyrics, q: string) => ly.get(q);

/** A word's display token for a contents entry: caps, no sentence-final full stop. */
export const entryToken = (w: string) => w.toUpperCase().replace(/\.$/, '');

/** Karaoke state of a word at t (TREATMENT: appear/highlight at `start`, dim anticipation <= 0.4 s early). */
export function wordState(w: Word, next: Word | undefined, t: number): { vis: number; hot: number; sung: number } {
  if (t < w.start - 0.4) return { vis: 0, hot: 0, sung: 0 };
  if (t < w.start) return { vis: smoothstep(w.start - 0.4, w.start - 0.05, t) * 0.26, hot: 0, sung: 0 };
  // the sung word stays red until the next word starts (at most 0.35 s past its own end)
  const until = next ? Math.min(next.start, w.end + 0.35) : w.end + 0.35;
  const hot = t < until ? 1 : 1 - smoothstep(until, until + 0.18, t);
  return { vis: 1, hot, sung: 1 };
}

/** Beat-quantised progress 0..1 from t0 to t1: jumps on each beat with a quick sweep (dots "on the beat"). */
export function beatProgress(au: AudioData, t: number, t0: number, t1: number, sweep = 0.14) {
  if (t <= t0) return 0;
  if (t >= t1 + sweep) return 1;
  const b0 = au.beatAt(t0), b1 = au.beatAt(t1);
  const n = Math.max(1, Math.round(b1 - b0));
  let done = 0;
  for (let k = 0; k <= n; k++) {
    const tk = k === 0 ? t0 : au.timeOfBeat(Math.ceil(b0) + k - 1);
    if (t >= tk) done = Math.max(done, (k + prog(t, tk, tk + sweep, ease.outCubic)) / (n + 1));
  }
  return clamp(done);
}

// =====================================================================================================
// Page numbers and the page counter
// =====================================================================================================

const PAGE_FONT = () => F.archivo(62, 900);
/** The digit the photo cut off, stable per page ('7·' -> a hidden second digit). */
const ghostDigit = (page: string) => '2468'[Math.floor(hash(page.length, page.charCodeAt(0)) * 4)]!;

/**
 * A red page number. `right`: x of the right edge of the *known* digits (a clipped page's ghost digit
 * continues past it). `clip`: 'tear' cuts the ghost digit with a ragged vertical edge (inside the
 * frame); 'frame' leaves it whole (the caller places it across the frame edge).
 */
export function drawPageNumber(c: CanvasRenderingContext2D, page: string, right: number, baseline: number, size: number,
  o: { color?: string; alpha?: number; clip?: 'tear' | 'frame' } = {}) {
  const fam = PAGE_FONT();
  const known = page.replace('·', '');
  const clipped = page.includes('·');
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  c.font = font(fam, size);
  c.textBaseline = 'alphabetic';
  c.fillStyle = o.color ?? rgba('red');
  const kw = measure(known, fam, size);
  c.fillText(known, right - kw, baseline);
  if (clipped) {
    const g = ghostDigit(page);
    const gw = measure(g, fam, size);
    if (o.clip !== 'frame') {
      // torn: 40% of the ghost digit survives, with a ragged edge
      c.beginPath();
      const x0 = right, x1 = right + gw * 0.42;
      c.moveTo(x0, baseline - size);
      for (let i = 0; i <= 8; i++) c.lineTo(x1 + (hash(i, known.length) - 0.5) * size * 0.08, baseline - size + (i / 8) * size * 1.2);
      c.lineTo(x0, baseline + size * 0.2);
      c.closePath();
      c.clip();
    }
    c.fillText(g, right, baseline);
  }
  c.restore();
  return kw;
}

/**
 * Page shown by the counter at t. The first page of a chapter flips in at the chapter cut
 * (`chapter`, `chapterStart`: the scene's own entry), later pages at their lyric line.
 */
export function pageAt(ly: Lyrics, t: number, chapter?: string, chapterStart?: number): { page: string | null; prev: string | null; since: number } {
  // before the first entry the book is open at its introduction (p. 12)
  let page: string | null = INTRO.page, prev: string | null = null, since = -Infinity;
  CONTENTS.forEach((e, i) => {
    const first = chapter && e.chapter === chapter && CONTENTS.findIndex((x) => x.chapter === chapter) === i;
    const s = first && chapterStart !== undefined ? chapterStart : ly.get(e.line).words[0]!.start;
    if (s <= t) { prev = page ?? (first && i > 0 ? CONTENTS[i - 1]!.page : null); page = e.page; since = s; }
  });
  return { page, prev, since };
}

/**
 * The drone's page counter: large red numerals top-right, a split-flap page-flip on each change.
 * Clipped pages ('7·') slide right so their last digit is cut by the frame edge (TREATMENT device 2).
 */
export function drawPageCounter(c: CanvasRenderingContext2D, ly: Lyrics, t: number,
  o: { alpha?: number; size?: number; top?: number; right?: number; page?: string | null; prev?: string | null; since?: number; chapter?: string; chapterStart?: number } = {}) {
  const st = pageAt(ly, t, o.chapter, o.chapterStart);
  const page = o.page !== undefined ? o.page : st.page;
  const prev = o.prev !== undefined ? o.prev : st.prev;
  const since = o.since ?? st.since;
  if (!page || (o.alpha ?? 1) <= 0.001) return;
  const size = o.size ?? 124, top = o.top ?? 70;
  const base = top + size * 0.74;
  const fam = PAGE_FONT();
  const rightFor = (p: string) => {
    if (!p.includes('·')) return o.right ?? W - SAFE;
    // the ghost digit straddles the frame edge: ~45% of it inside
    return W - measure(ghostDigit(p), fam, size) * 0.45;
  };
  const k = clamp((t - since) / 0.42);
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  // a tiny mono caption: this is the handbook's page
  c.font = font(F.mono(500), 13);
  c.letterSpacing = '3px';
  c.fillStyle = rgba('red', 0.8);
  c.textAlign = 'right';
  c.fillText('P.', Math.min(rightFor(page), W - SAFE) - measure(page.replace('·', ''), fam, size) - 12, top + 16);
  c.textAlign = 'left';
  c.letterSpacing = '0px';
  const mid = base - size * 0.36; // flap hinge (optical middle of the digits)
  const half = (p: string, upper: boolean, sy = 1) => {
    c.save();
    c.beginPath();
    if (upper) c.rect(0, top - size * 0.4, W + 400, mid - (top - size * 0.4));
    else c.rect(0, mid, W + 400, size);
    c.clip();
    c.translate(0, mid); c.scale(1, sy); c.translate(0, -mid);
    drawPageNumber(c, p, rightFor(p), base, size, { clip: 'frame' });
    c.restore();
  };
  if (k >= 1 || !prev) {
    drawPageNumber(c, page, rightFor(page), base, size, { clip: 'frame', alpha: prev ? 1 : prog(t, since, since + 0.25) });
  } else {
    // split flap: new top + old bottom are static; the old top folds down, then the new bottom unfolds
    half(page, true);
    half(prev, false);
    if (k < 0.5) half(prev, true, Math.cos(k * Math.PI));
    else half(page, false, -Math.cos(k * Math.PI));
  }
  c.restore();
}

// =====================================================================================================
// Contents entry: caps heading + dotted leader + red page number, karaoke per word
// =====================================================================================================

export interface EntryOpts {
  x: number; // left edge
  y: number; // baseline of the first row
  width: number; // total width, page number right-aligned at x + width
  size?: number;
  page?: string | null; // defaults to the line's page from the contents table
  theme?: 'dark' | 'paper';
  alpha?: number;
  /** Printed (no karaoke): every word shown at once, e.g. on the handbook's page. */
  printed?: boolean;
  /** Override the leader/number reveal (0..1); default follows the words and the beats. */
  leader?: number;
  /** Line height factor for wrapped rows. */
  leading?: number;
  /** Hide the page number (the number has flown off the page). */
  noNumber?: boolean;
  /** Extra letter spacing (px). */
  tracking?: number;
  /** How a clipped page's ghost digit is cut: torn inside the frame (default) or left whole for a caller's clip. */
  numberClip?: 'tear' | 'frame';
  /** Colour of the printed/sung text (defaults: paper on dark, ink on paper). */
  base?: PaletteKey;
  /**
   * The translation note under the sung line: the heading as printed in the handbook, small, in mono,
   * with its own leader and page (TREATMENT r4). Default: shown for sung (not printed) entries.
   */
  heading?: string | false;
}

/**
 * Lay out and draw a lyric line as a contents entry. Returns the geometry (rows, leader span, number
 * position) so scenes can anchor things to it. Karaoke: a word appears dim at most 0.4 s before its
 * `start`, turns red at `start`, and stays paper (or ink) once sung. Held words stretch their tracking.
 */
export function drawEntry(c: CanvasRenderingContext2D, ly: Lyrics, au: AudioData, line: Line | string, t: number, o: EntryOpts) {
  const L = typeof line === 'string' ? ly.get(line) : line;
  const size = o.size ?? 60, fam = F.archivo(62, 900);
  const theme = o.theme ?? 'dark';
  const base = o.base ?? (theme === 'paper' ? 'ink' : 'paper');
  const page = o.page !== undefined ? o.page : CONTENTS.find((e) => ly.get(e.line) === L)?.page ?? null;
  const words = L.words;
  const tokens = words.map((w) => entryToken(w.w));
  const space = measure(' ', fam, size) * 1.05;
  const numW = page ? measure(page.replace('·', '') + (page.includes('·') ? '0' : ''), fam, size) : 0;
  const minLeader = size * 0.9;
  const rowW = o.width - numW - minLeader;
  // held notes stretch: extra tracking while the word is sung, relaxed afterwards
  const stretch = words.map((w) => {
    const d = w.end - w.start;
    if (o.printed || d < 0.95) return 0;
    const p = Lyrics.wordProgress(w, t);
    const relax = 1 - smoothstep(w.end, w.end + 0.6, t);
    return size * 0.11 * clamp((d - 0.8) / 1.2 + 0.4) * ease.outCubic(p) * relax;
  });
  const widths = tokens.map((s, i) => measure(s, fam, size, (o.tracking ?? 0) + stretch[i]!));
  // greedy wrap (layout without stretch so rows don't jump when a word is held)
  const rows: number[][] = [[]];
  let acc = 0;
  tokens.forEach((s, i) => {
    const w0 = measure(s, fam, size, o.tracking ?? 0);
    const row = rows[rows.length - 1]!;
    if (row.length && acc + space + w0 > rowW) { rows.push([i]); acc = w0; } else { row.push(i); acc += (row.length > 1 ? space : 0) + w0; }
  });
  const lead = size * (o.leading ?? 1.02);
  const alpha = o.alpha ?? 1;
  c.save();
  c.globalAlpha *= alpha;
  c.font = font(fam, size);
  c.textBaseline = 'alphabetic';
  const wordX: number[] = [];
  let lastRight = o.x;
  rows.forEach((row, r) => {
    let x = o.x;
    const y = o.y + r * lead;
    for (const i of row) {
      const w = words[i]!;
      const st = o.printed ? { vis: 1, hot: 0, sung: 1 } : wordState(w, words[i + 1], t);
      wordX[i] = x;
      if (st.vis > 0.001) {
        const col = st.hot > 0 ? mixRgba(base, 'red', st.hot, st.vis) : rgba(base, st.vis * (theme === 'paper' ? 0.94 : 0.96));
        c.fillStyle = col;
        c.letterSpacing = `${(o.tracking ?? 0) + stretch[i]!}px`;
        c.fillText(tokens[i]!, x, y);
      }
      x += widths[i]! + space;
    }
    if (r === rows.length - 1) lastRight = x - space;
  });
  c.letterSpacing = '0px';
  // leader
  const lastY = o.y + (rows.length - 1) * lead;
  const numRight = o.x + o.width;
  const l0 = lastRight + size * 0.22, l1 = numRight - numW - size * 0.22;
  const gap = size * 0.24, r = Math.max(1.2, size * 0.042);
  const nDots = Math.max(0, Math.floor((l1 - l0) / gap));
  let lp: number;
  if (o.leader !== undefined) lp = o.leader;
  else if (o.printed) lp = 1;
  else {
    // the words first; then the leader runs dot by dot on the beats to the red number
    const last = words[words.length - 1]!;
    lp = beatProgress(au, t, last.start, Math.max(last.start + 0.5, last.end + 0.25));
  }
  const shown = Math.floor(nDots * lp + 1e-6);
  c.fillStyle = rgba(base, theme === 'paper' ? 0.85 : 0.7);
  for (let i = 0; i < shown; i++) {
    c.beginPath();
    c.arc(l1 - (nDots - 1 - i) * gap - r, lastY - r, r, 0, Math.PI * 2);
    // (dots fill from the heading towards the number)
    c.fill();
  }
  let numPop = 0;
  if (page && !o.noNumber) {
    numPop = o.printed ? 1 : smoothstep(0.96, 1, lp);
    if (numPop > 0) {
      const s = lerp(1.25, 1, ease.outBack(numPop));
      c.save();
      c.translate(numRight, lastY);
      c.scale(s, s);
      drawPageNumber(c, page, 0, 0, size, { alpha: numPop, clip: o.numberClip });
      c.restore();
    }
  }
  // the printed heading, as a translation note: types in once the first word is sung
  const entry = CONTENTS.find((e) => ly.get(e.line) === L);
  const heading = o.heading === false ? null : o.heading ?? (o.printed ? null : entry?.heading ?? null);
  let noteY = lastY;
  if (heading && page) {
    const ns = Math.max(18, Math.round(size * 0.3)), nfam = F.mono(500);
    const t0 = words[0]!.start + 0.15;
    const n = o.printed ? heading.length : Math.floor(Math.max(0, t - t0) * 45);
    if (n > 0) {
      noteY = lastY + size * 0.36 + ns * 1.25;
      c.font = font(nfam, ns);
      c.letterSpacing = `${ns * 0.06}px`;
      const txt = heading.slice(0, n);
      c.fillStyle = rgba(base, 0.62);
      c.fillText(txt, o.x, noteY);
      const hw = measure(heading, nfam, ns, ns * 0.06);
      c.letterSpacing = '0px';
      const done = clamp((n - heading.length) / 12);
      if (done > 0) {
        const nr = o.x + Math.min(o.width * 0.62, Math.max(hw + ns * 5, o.width * 0.42));
        const pw = measure(page.replace('·', '') + (page.includes('·') ? '0' : ''), F.archivo(62, 900), ns * 1.15);
        const d0 = o.x + hw + ns * 0.5, d1 = nr - pw - ns * 0.4;
        c.fillStyle = rgba(base, 0.5);
        const nd = Math.floor((d1 - d0) / (ns * 0.42));
        for (let i = 0; i < Math.floor(nd * done); i++) c.fillRect(d0 + i * ns * 0.42, noteY - 2, 2, 2);
        if (done >= 1) drawPageNumber(c, page, nr, noteY, ns * 1.15, { clip: 'tear', alpha: 0.9 });
      }
    }
  }
  c.restore();
  return { rows: rows.length, lastY, wordX, widths, leader: [l0, l1] as [number, number], numRight, numW, height: lead * (rows.length - 1) + size, noteY };
}

/** A printed (non-sung) contents line, e.g. the introduction row: a Line with untimed words. */
export function printedLine(text: string): Line {
  const words = text.split(' ').map((w, i) => ({ w, start: -1, end: -1, line: -1, index: i, gi: -1 }));
  return { i: -1, text, start: -1, end: -1, words };
}

/** Visibility of a lyric line as an on-screen entry: from 0.4 s before its first word to `hold` after its end. */
export function entryAlpha(L: Line, t: number, hold = 1.2, nextStart = Infinity) {
  const a = smoothstep(L.words[0]!.start - 0.4, L.words[0]!.start - 0.1, t);
  const end = Math.min(L.end + hold, nextStart - 0.05);
  return a * (1 - smoothstep(end - 0.35, end, t));
}

// =====================================================================================================
// WHAT TO DO panel (the drone's voice)
// =====================================================================================================

export interface Step {
  text: string;
  at: number; // time the step starts typing (put it on a beat)
  blank?: boolean; // the number prints, the text never comes: a blinking cursor
  glitch?: number; // 0..1: glyphs fall apart
}

const GLITCH = '╱╲│─┼·:;/\\|_';

/**
 * The WHAT TO DO panel: a mono title with a dot leader, numbered steps typed in on beats.
 * (x, y) = top-left. Returns the panel height. Lamp text on a dark, slightly translucent card.
 */
export function drawPanel(c: CanvasRenderingContext2D, t: number, o: {
  x: number; y: number; w: number; steps: Step[]; at: number; title?: string; alpha?: number; size?: number; cps?: number;
  theme?: 'dark' | 'paper'; anchor?: { x: number; y: number } | null;
}) {
  const size = o.size ?? 22, cps = o.cps ?? 26;
  const a = (o.alpha ?? 1) * smoothstep(o.at, o.at + 0.3, t);
  if (a <= 0.001) return 0;
  const pad = size * 0.9, lh = size * 1.45;
  const ink = o.theme === 'paper' ? 'ink' : 'lamp';
  const fam = F.mono(500);
  c.save();
  c.globalAlpha *= a;
  c.font = font(fam, size);
  c.textBaseline = 'alphabetic';
  // wrap each step to the panel width
  const maxW = o.w - pad * 2 - size * 1.6;
  const wrapped = o.steps.map((s) => {
    const out: string[] = [];
    let cur = '';
    for (const word of s.text.split(' ')) {
      const nxt = cur ? cur + ' ' + word : word;
      if (measure(nxt, fam, size) > maxW && cur) { out.push(cur); cur = word; } else cur = nxt;
    }
    out.push(cur);
    return out;
  });
  const visibleSteps = o.steps.filter((s) => t >= s.at - 0.05).length;
  const rowsShown = wrapped.slice(0, visibleSteps).reduce((n, w) => n + w.length, 0);
  const hTarget = pad * 2 + size * 1.2 + (rowsShown ? size * 0.6 + rowsShown * lh : 0);
  const h = hTarget;
  // card
  c.fillStyle = o.theme === 'paper' ? rgba('paper', 0.92) : rgba('shadow', 0.72);
  c.fillRect(o.x, o.y, o.w, h);
  c.strokeStyle = rgba(ink, 0.35);
  c.lineWidth = 1;
  c.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, h - 1);
  // title + leader + the lamp mark
  const title = o.title ?? 'WHAT TO DO';
  c.fillStyle = rgba(ink, 0.95);
  c.letterSpacing = `${size * 0.12}px`;
  c.font = font(F.mono(600), size * 0.82);
  const tx = o.x + pad, ty = o.y + pad + size * 0.8;
  c.fillText(title, tx, ty);
  const tw = measure(title, F.mono(600), size * 0.82, size * 0.12);
  c.letterSpacing = '0px';
  const dots = Math.floor(prog(t, o.at, o.at + 0.5) * 40);
  c.fillStyle = rgba(ink, 0.6);
  for (let i = 0; i < dots; i++) {
    const dx = tx + tw + size * 0.5 + i * size * 0.42;
    if (dx > o.x + o.w - pad - size * 0.7) break;
    c.fillRect(dx, ty - 2, 2, 2);
  }
  c.beginPath();
  c.arc(o.x + o.w - pad - size * 0.25, ty - size * 0.28, size * 0.2, 0, Math.PI * 2);
  c.fillStyle = rgba('lamp', 0.9);
  c.fill();
  // steps
  c.font = font(fam, size);
  let y = ty + size * 0.6 + lh;
  const blinkOn = Math.floor(t * 2.4) % 2 === 0;
  o.steps.forEach((s, si) => {
    if (t < s.at - 0.05) return;
    const num = `${si + 1}.`;
    c.fillStyle = rgba(ink, 0.7);
    c.fillText(num, tx, y);
    const x0 = tx + size * 1.6;
    const total = s.blank ? 0 : s.text.length;
    const typed = Math.min(total, Math.floor(Math.max(0, t - s.at) * cps));
    let left = typed;
    const lines = wrapped[si]!;
    let cursorAt: { x: number; y: number } | null = null;
    lines.forEach((ln, li) => {
      const n = Math.max(0, Math.min(ln.length, left));
      left -= ln.length + 1;
      let str = ln.slice(0, n);
      if (s.glitch) {
        str = Array.from(str).map((ch, k) => (ch !== ' ' && hash(si, li, k, frameIdx(t) >> 2) < s.glitch! ? GLITCH[Math.floor(hash(k, si, frameIdx(t)) * GLITCH.length)]! : ch)).join('');
      }
      c.fillStyle = rgba(ink, 0.96);
      c.fillText(str, x0, y);
      if (n > 0 || li === 0) cursorAt = { x: x0 + measure(str, fam, size) + 2, y };
      if (li < lines.length - 1 && n >= ln.length) y += lh;
    });
    const typing = typed < total;
    const isLast = si === o.steps.filter((q) => t >= q.at - 0.05).length - 1;
    if ((typing || s.blank || isLast) && cursorAt && (typing || blinkOn)) {
      const cp = cursorAt as { x: number; y: number };
      c.fillStyle = rgba(ink, 0.85);
      c.fillRect(cp.x, cp.y - size * 0.78, size * 0.55, size * 0.95);
    }
    y += lh;
  });
  c.restore();
  // dotted leader to the drone
  if (o.anchor) drawLeader(c, { x: o.x + o.w, y: o.y + size }, o.anchor, prog(t, o.at, o.at + 0.6), rgba('lamp', 0.55 * a));
  return h;
}

/** A dotted line from a to b, drawn in dot by dot (p 0..1). */
export function drawLeader(c: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, p: number, color: string, gap = 7, r = 1.3) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.floor(len / gap);
  const shown = Math.floor(n * clamp(p));
  c.save();
  c.fillStyle = color;
  for (let i = 0; i <= shown; i++) {
    const k = i / Math.max(1, n);
    c.beginPath();
    c.arc(lerp(a.x, b.x, k), lerp(a.y, b.y, k), r, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// =====================================================================================================
// Annotation callout: dotted leader from a point to a mono label
// =====================================================================================================

/**
 * A callout. The anchor ring pops at `at`, the leader draws dot by dot to an elbow and along to the
 * label, then the label types in. (ax, ay) = the thing pointed at; (lx, ly) = the label's baseline start
 * (the leader ends just before it; `side` -1 puts the label left of the elbow, right-aligned).
 */
export function drawCallout(c: CanvasRenderingContext2D, t: number, o: {
  ax: number; ay: number; lx: number; ly: number; text: string | string[]; at: number; out?: number;
  color?: PaletteKey | string; size?: number; alpha?: number; ring?: boolean; side?: 1 | -1; cps?: number; dim?: number;
  /** A dark backing card behind the label (for bright, hazy backgrounds). */
  plate?: number;
}) {
  const a0 = (o.alpha ?? 1) * smoothstep(o.at - 0.01, o.at + 0.08, t) * (o.out !== undefined ? 1 - smoothstep(o.out, o.out + 0.35, t) : 1);
  if (a0 <= 0.001) return;
  const col = o.color ?? 'lamp';
  const size = o.size ?? 17;
  const side = o.side ?? (o.lx >= o.ax ? 1 : -1);
  const elbow = { x: o.lx - side * size * 0.6, y: o.ly - size * 0.35 };
  const mid = { x: lerp(o.ax, elbow.x, 0.35), y: elbow.y };
  // path: anchor -> diagonal knee -> elbow
  const knee = Math.abs(o.ay - elbow.y) > 4 ? { x: o.ax + Math.sign(elbow.x - o.ax) * Math.min(Math.abs(o.ay - elbow.y), Math.abs(elbow.x - o.ax) * 0.7), y: elbow.y } : mid;
  const seg1 = Math.hypot(knee.x - o.ax, knee.y - o.ay), seg2 = Math.hypot(elbow.x - knee.x, elbow.y - knee.y);
  const total = seg1 + seg2;
  const drawDur = 0.25 + total / 1600;
  const p = prog(t, o.at + 0.06, o.at + 0.06 + drawDur, ease.outCubic);
  c.save();
  c.globalAlpha *= a0;
  const color = rgba(col, 0.9 * (o.dim ?? 1));
  if (o.ring !== false) {
    const rr = 5 + 6 * (1 - prog(t, o.at, o.at + 0.3, ease.outCubic));
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(o.ax, o.ay, rr, 0, Math.PI * 2); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.arc(o.ax, o.ay, 1.8, 0, Math.PI * 2); c.fill();
  }
  const along = p * total;
  const start1 = { x: o.ax + (knee.x - o.ax) * (7 / Math.max(7, seg1)), y: o.ay + (knee.y - o.ay) * (7 / Math.max(7, seg1)) };
  drawLeader(c, start1, knee, clamp(along / Math.max(1, seg1)), color, 6, 1.25);
  if (along > seg1) drawLeader(c, knee, elbow, clamp((along - seg1) / Math.max(1, seg2)), color, 6, 1.25);
  // label types in once the leader arrives
  const lines = Array.isArray(o.text) ? o.text : [o.text];
  const t0 = o.at + 0.06 + drawDur * 0.8;
  const n = Math.floor(Math.max(0, t - t0) * (o.cps ?? 60));
  c.font = font(F.mono(500), size);
  c.letterSpacing = `${size * 0.06}px`;
  c.textBaseline = 'alphabetic';
  if (o.plate && n > 0) {
    const wMax = Math.max(...lines.map((ln) => measure(ln, F.mono(500), size, size * 0.06)));
    const px = side > 0 ? o.lx - size * 0.5 : o.lx - wMax - size * 0.5;
    c.fillStyle = rgba('shadow', o.plate * clamp(n / 6));
    c.fillRect(px, o.ly - size * 1.15, wMax + size, size * (0.75 + 1.35 * lines.length));
  }
  c.fillStyle = rgba(col, 0.95 * (o.dim ?? 1));
  let left = n;
  lines.forEach((ln, i) => {
    const s = ln.slice(0, Math.max(0, left));
    left -= ln.length;
    if (!s) return;
    if (side > 0) c.fillText(s, o.lx, o.ly + i * size * 1.35);
    else { c.textAlign = 'right'; c.fillText(s, o.lx, o.ly + i * size * 1.35); c.textAlign = 'left'; }
  });
  c.restore();
}

// =====================================================================================================
// The lamp: intensity over time (flicker, die), CPU lighting for line geometry, and a volumetric cone
// =====================================================================================================

/** Per-frame flicker 0..1 (1 = steady). `amount` 0 = none, 1 = violent. Constant over a frame's shutter. */
export function flicker(t: number, amount: number, seed = 1) {
  if (amount <= 0) return 1;
  const f = frameIdx(t);
  const slow = 0.5 + 0.5 * noise1(t * 6.0, seed);
  const drop = hash(f >> 1, seed) < amount * 0.45 ? hash(f, seed + 3) * 0.7 : 0;
  return clamp(1 - amount * 0.25 * slow - drop);
}

/** A lamp that dies: full before t0, stutters, dark after t0 + dur. */
export function lampDie(t: number, t0: number, dur = 0.8, seed = 5) {
  if (t < t0) return 1;
  if (t > t0 + dur) return 0;
  const k = (t - t0) / dur;
  const f = frameIdx(t);
  const on = hash(f >> 1, seed) > k * 1.1 ? 1 : 0.08;
  return on * (1 - k * 0.7);
}

export interface Lamp {
  pos: THREE.Vector3;
  dir: THREE.Vector3; // normalised
  cosOuter: number; // cone half-angle cosine (edge)
  cosInner: number; // full-brightness cosine
  range: number; // metres
  intensity: number; // 0..1+ (times the lamp colour)
}

export function makeLamp(pos: THREE.Vector3, target: THREE.Vector3, halfAngleDeg = 24, range = 14, intensity = 1): Lamp {
  const dir = target.clone().sub(pos).normalize();
  const o = (halfAngleDeg * Math.PI) / 180;
  return { pos, dir, cosOuter: Math.cos(o), cosInner: Math.cos(o * 0.55), range, intensity };
}

/** How much a lamp lights a point (0..~1): cone falloff times distance falloff. */
export function lampLight(l: Lamp, x: number, y: number, z: number) {
  const dx = x - l.pos.x, dy = y - l.pos.y, dz = z - l.pos.z;
  const d = Math.hypot(dx, dy, dz) + 1e-6;
  const cos = (dx * l.dir.x + dy * l.dir.y + dz * l.dir.z) / d;
  const cone = smoothstep(l.cosOuter, l.cosInner, cos);
  const near = smoothstep(0, 0.6, d); // no hot spot at the lens
  const fall = 1 / (1 + (d / (l.range * 0.35)) ** 2) * (1 - smoothstep(l.range * 0.7, l.range, d));
  return cone * fall * near * l.intensity;
}

/**
 * Volumetric lamp cone: per-pixel ray march through a spotlight in fog, stopped by a floor plane.
 * The one soft bloom of the video (lamp colour, TREATMENT palette rules).
 */
export class LampCone {
  pass = new FSPass(/* glsl */ `
    uniform mat4 invProj, camWorld; uniform vec3 camPos;
    uniform vec3 lPos, lDir, lCol; uniform float cosO, cosI, range, inten, density, floorY, time, maxDist;
    float spot(vec3 p) {
      vec3 d = p - lPos; float L = length(d) + 1e-4;
      float c = dot(d / L, lDir);
      float cone = smoothstep(cosO, cosI, c);
      float fall = 1.0 / (1.0 + pow(L / (range * 0.35), 2.0)) * (1.0 - smoothstep(range * 0.7, range, L));
      return cone * fall * smoothstep(0.0, 0.25, L);
    }
    void main() {
      vec2 ndc = vUv * 2.0 - 1.0;
      vec4 v = invProj * vec4(ndc, 1.0, 1.0); v /= v.w;
      vec3 rd = normalize((camWorld * vec4(v.xyz, 0.0)).xyz);
      float tMax = maxDist;
      if (rd.y < -1e-4) tMax = min(tMax, (floorY - camPos.y) / rd.y);
      const int N = 40;
      float jit = hash12(gl_FragCoord.xy + fract(time * 7.1) * 97.0);
      float acc = 0.0, dt = tMax / float(N);
      for (int i = 0; i < N; i++) {
        float s = (float(i) + jit) * dt;
        vec3 p = camPos + rd * s;
        float n = 0.55 + 0.45 * snoise(p * 0.35 + vec3(0.0, -time * 0.25, time * 0.1));
        acc += spot(p) * n * dt;
      }
      vec3 col = lCol * acc * density * inten;
      // the pool on the floor
      if (rd.y < -1e-4 && tMax < maxDist) {
        vec3 hp = camPos + rd * tMax;
        col += lCol * spot(hp) * inten * 0.55;
      }
      fragColor = vec4(col, 1.0);
    }`, {
    invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, camPos: { value: new THREE.Vector3() },
    lPos: { value: new THREE.Vector3() }, lDir: { value: new THREE.Vector3() }, lCol: { value: new THREE.Vector3(...LIN.lamp) },
    cosO: { value: 0.9 }, cosI: { value: 0.95 }, range: { value: 10 }, inten: { value: 1 }, density: { value: 0.12 },
    floorY: { value: 0 }, time: { value: 0 }, maxDist: { value: 60 },
  }, { blending: THREE.AdditiveBlending, transparent: true });

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: THREE.PerspectiveCamera, l: Lamp, t: number, o: { density?: number; floorY?: number; color?: RGB; maxDist?: number } = {}) {
    if (l.intensity <= 0.002) return;
    const u = this.pass.u;
    cam.updateMatrixWorld();
    (u.invProj!.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    (u.camWorld!.value as THREE.Matrix4).copy(cam.matrixWorld);
    (u.camPos!.value as THREE.Vector3).copy(cam.position);
    (u.lPos!.value as THREE.Vector3).copy(l.pos);
    (u.lDir!.value as THREE.Vector3).copy(l.dir);
    (u.lCol!.value as THREE.Vector3).set(...(o.color ?? LIN.lamp));
    u.cosO!.value = l.cosOuter; u.cosI!.value = l.cosInner; u.range!.value = l.range; u.inten!.value = l.intensity;
    u.density!.value = o.density ?? 0.12; u.floorY!.value = o.floorY ?? -1e4; u.time!.value = t; u.maxDist!.value = o.maxDist ?? 40;
    this.pass.render(renderer, out);
  }
}

// =====================================================================================================
// Glows: soft light sprites (lamps, windows, streetlights), in screen px or 3D, with wet reflections
// =====================================================================================================

const GLOW_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 iPos; in vec2 iSize; in vec4 iColor; in float iSharp;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix; uniform vec2 res; uniform bool screen2D; uniform float pxScale;
out vec2 vUv; out vec4 vColor; out float vSharp;
void main() {
  vec4 c; vec2 sz;
  float energy = 1.0;
  if (screen2D) { c = vec4(iPos.x / res.x * 2.0 - 1.0, 1.0 - iPos.y / res.y * 2.0, 0.0, 1.0); sz = iSize; }
  else {
    c = projectionMatrix * modelViewMatrix * vec4(iPos, 1.0);
    if (c.w <= 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float k = projectionMatrix[1][1] * 0.5 * res.y / c.w;
    sz = iSize * k;
    // sub-pixel lights keep their energy as a 1.6 px dot
    float m = min(sz.x, sz.y);
    if (m < 1.6) { energy = (sz.x * sz.y) / (1.6 * 1.6 * max(1.0, sz.x / sz.y) * max(1.0, sz.y / sz.x)); sz = max(sz, vec2(1.6)); }
  }
  vec2 ndc = c.xy / c.w;
  gl_Position = vec4(ndc + position.xy * sz / (0.5 * res), clamp(c.z / c.w, -1.0, 1.0), 1.0);
  vUv = position.xy; vColor = vec4(iColor.rgb * energy, iColor.a); vSharp = iSharp;
}`;
const GLOW_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; in vec4 vColor; in float vSharp;
out vec4 fragColor;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  // gaussian core + a faint wide skirt, zero at the quad edge
  float g = (exp(-r2 * vSharp) - exp(-vSharp)) / (1.0 - exp(-vSharp));
  float skirt = (1.0 - r2) * (1.0 - r2) * 0.08;
  fragColor = vec4(vColor.rgb * (g + skirt) * vColor.a, 0.0);
}`;

export class GlowBatch {
  geo = new THREE.InstancedBufferGeometry();
  mat: THREE.RawShaderMaterial;
  mesh: THREE.Mesh;
  scene = new THREE.Scene();
  cam2D = new THREE.OrthographicCamera(0, W, 0, H, -1, 1);
  count = 0;
  private p: Float32Array; private s: Float32Array; private c: Float32Array; private k: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  constructor(public capacity: number, opts: { screen2D?: boolean; depthTest?: boolean } = {}) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.p = new Float32Array(capacity * 3); this.s = new Float32Array(capacity * 2);
    this.c = new Float32Array(capacity * 4); this.k = new Float32Array(capacity);
    this.attrs = [new THREE.InstancedBufferAttribute(this.p, 3), new THREE.InstancedBufferAttribute(this.s, 2), new THREE.InstancedBufferAttribute(this.c, 4), new THREE.InstancedBufferAttribute(this.k, 1)];
    this.attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iPos', this.attrs[0]!); this.geo.setAttribute('iSize', this.attrs[1]!);
    this.geo.setAttribute('iColor', this.attrs[2]!); this.geo.setAttribute('iSharp', this.attrs[3]!);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
      uniforms: { res: { value: new THREE.Vector2(W, H) }, screen2D: { value: opts.screen2D ?? true }, pxScale: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: opts.depthTest ?? false, blending: THREE.CustomBlending,
    });
    this.mat.blendEquation = THREE.AddEquation; this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneFactor;
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  clear() { this.count = 0; }
  /** A glow at (x, y, z) (px or world), radius rx/ry (px or world units), linear colour times intensity. */
  add(x: number, y: number, z: number, rx: number, ry: number, rgb: RGB, intensity = 1, sharp = 4) {
    if (this.count >= this.capacity || intensity <= 0) return;
    const i = this.count++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.s[i * 2] = rx; this.s[i * 2 + 1] = ry;
    this.c[i * 4] = rgb[0]; this.c[i * 4 + 1] = rgb[1]; this.c[i * 4 + 2] = rgb[2]; this.c[i * 4 + 3] = intensity;
    this.k[i] = sharp;
  }
  /** 2D glow plus its wet-ground reflection (a vertical smear mirrored about groundY). */
  addReflected(x: number, y: number, r: number, rgb: RGB, intensity: number, groundY: number, wet = 0.5) {
    this.add(x, y, 0, r, r, rgb, intensity);
    if (wet > 0 && y < groundY) this.add(x, groundY + (groundY - y) * 0.9, 0, r * 0.7, r * 2.6 + (groundY - y) * 0.4, rgb, intensity * wet * 0.5, 2.5);
  }
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera?: THREE.Camera) {
    if (!this.count) return;
    for (const a of this.attrs) { a.needsUpdate = true; a.addUpdateRange(0, this.count * a.itemSize); }
    this.geo.instanceCount = this.count;
    const s = rtScale(target);
    (this.mat.uniforms.res!.value as THREE.Vector2).set(target.width / s, target.height / s);
    this.mat.uniforms.pxScale!.value = s;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, camera ?? this.cam2D);
    for (const a of this.attrs) a.clearUpdateRanges();
  }
}

// =====================================================================================================
// Sky, haze and fog layers
// =====================================================================================================

/**
 * Background sky: a vertical gradient (top / horizon / below) with drifting haze bands and faint light
 * shafts. Smog for wide establishing shots, shadow for night.
 */
export class Sky {
  pass = new FSPass(/* glsl */ `
    uniform vec3 cTop, cHor, cLow; uniform float horizon, time, haze, shafts, grain;
    void main() {
      vec2 p = FRAG_PX / vec2(${W}.0, ${H}.0); p.y = 1.0 - p.y; // 0 top .. 1 bottom
      float d = p.y - horizon;
      vec3 c = d < 0.0 ? mix(cHor, cTop, pow(sat(-d / horizon), 0.8)) : mix(cHor, cLow, pow(sat(d / (1.0 - horizon)), 0.6));
      // haze bands
      float n = fbm(vec2(p.x * 2.2 + time * 0.012, p.y * 7.0 - time * 0.004), 4);
      c *= 1.0 + haze * 0.22 * n;
      // light shafts from the upper left
      vec2 q = rot2(-0.42) * (p - vec2(0.15, -0.2));
      float s = pow(0.5 + 0.5 * sin(q.x * 38.0 + fbm(vec2(q.x * 3.0, time * 0.05), 2) * 3.0), 6.0) * smoothstep(1.1, 0.1, q.y);
      c += cHor * s * shafts * 0.25;
      fragColor = vec4(c, 1.0);
    }`, {
    cTop: { value: new THREE.Vector3() }, cHor: { value: new THREE.Vector3() }, cLow: { value: new THREE.Vector3() },
    horizon: { value: 0.6 }, time: { value: 0 }, haze: { value: 1 }, shafts: { value: 0 }, grain: { value: 0 },
  });
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, o: { top: RGB; horizon: RGB; low: RGB; horizonY?: number; t: number; haze?: number; shafts?: number }) {
    const u = this.pass.u;
    (u.cTop!.value as THREE.Vector3).set(...o.top);
    (u.cHor!.value as THREE.Vector3).set(...o.horizon);
    (u.cLow!.value as THREE.Vector3).set(...o.low);
    u.horizon!.value = o.horizonY ?? 0.6; u.time!.value = o.t; u.haze!.value = o.haze ?? 1; u.shafts!.value = o.shafts ?? 0;
    this.pass.render(renderer, out);
  }
}

/** The smog gradient for wide shots, as sky colours (linear). `k` 0 = dusk amber, 1 = darker night smog. */
export function smogSky(k = 0): { top: RGB; horizon: RGB; low: RGB } {
  return {
    top: mixRGB(scaleRGB(LIN.smog, 0.42), scaleRGB(LIN.fog, 0.8), k),
    horizon: mixRGB(scaleRGB(LIN.smog2, 0.95), scaleRGB(LIN.smog, 0.55), k),
    low: mixRGB(scaleRGB(LIN.smog, 0.55), scaleRGB(LIN.shadow, 1.0), k),
  };
}

/** A translucent drifting fog sheet over everything drawn so far (denser towards `y1`). */
export class FogSheet {
  pass = new FSPass(/* glsl */ `
    uniform vec3 col; uniform float alpha, y0, y1, time, scale, speed;
    void main() {
      vec2 p = FRAG_PX / vec2(${W}.0, ${H}.0); p.y = 1.0 - p.y;
      float g = smoothstep(y0, y1, p.y);
      float n = fbm(vec2(p.x * scale * 1.8 + time * speed, p.y * scale * 3.0 + time * speed * 0.2), 4) * 0.5 + 0.5;
      float a = alpha * g * mix(0.45, 1.0, n);
      fragColor = vec4(col * a, a);
    }`, {
    col: { value: new THREE.Vector3() }, alpha: { value: 0.5 }, y0: { value: 0.3 }, y1: { value: 1.0 }, time: { value: 0 }, scale: { value: 1 }, speed: { value: 0.02 },
  }, { blending: THREE.NormalBlending, transparent: true });
  constructor() {
    const m = this.pass.mat;
    m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, o: { color: RGB; alpha: number; y0?: number; y1?: number; t: number; scale?: number; speed?: number }) {
    if (o.alpha <= 0.001) return;
    const u = this.pass.u;
    (u.col!.value as THREE.Vector3).set(...o.color);
    u.alpha!.value = o.alpha; u.y0!.value = o.y0 ?? 0.3; u.y1!.value = o.y1 ?? 1; u.time!.value = o.t; u.scale!.value = o.scale ?? 1; u.speed!.value = o.speed ?? 0.02;
    this.pass.render(renderer, out);
  }
}

// =====================================================================================================
// Rain: fine lines in three parallax layers (screen space)
// =====================================================================================================

export function rain(lb: LineBatch, t: number, o: { count?: number; angle?: number; speed?: number; alpha?: number; color?: RGB; seed?: number; x0?: number; x1?: number; y0?: number; y1?: number; lit?: (x: number, y: number) => number } = {}) {
  const n = o.count ?? 900, ang = o.angle ?? 0.12, col = o.color ?? LIN.paper;
  const x0 = o.x0 ?? -80, x1 = o.x1 ?? W + 80, y0 = o.y0 ?? -60, y1 = o.y1 ?? H + 60;
  const r = mulberry32(o.seed ?? 7);
  for (let i = 0; i < n; i++) {
    const layer = i % 3; // 0 far, 1 mid, 2 near
    const depth = [0.35, 0.65, 1][layer]!;
    const sp = (o.speed ?? 1500) * depth * (0.85 + r() * 0.3);
    const len = (14 + 40 * depth) * (0.8 + r() * 0.4);
    const bx = r(), by = r();
    const yy = y0 + (((by * (y1 - y0) + t * sp) % (y1 - y0)) + (y1 - y0)) % (y1 - y0);
    const xx = x0 + bx * (x1 - x0) + (yy - y0) * ang;
    const lit = o.lit ? o.lit(xx, yy) : 0;
    const a = (o.alpha ?? 0.16) * (0.35 + depth * 0.65) + lit * 0.6;
    const c = lit > 0 ? mixRGB(col, scaleRGB(LIN.lamp, 1.2), clamp(lit)) : col;
    lb.seg2(xx, yy, xx - ang * len, yy - len, 0.6 + depth * 0.7, c, clamp(a));
  }
}

// =====================================================================================================
// Lit wireframes: static 3D segments, faded into fog by distance and lit by the lamp (CPU per segment)
// =====================================================================================================

export class LitLines {
  a: number[] = []; // xyz xyz, packed
  col: number[] = []; // base rgb (linear) per segment
  w: number[] = [];
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, rgb: RGB = LIN.concrete, width = 1.2) {
    this.a.push(ax, ay, az, bx, by, bz);
    this.col.push(...rgb);
    this.w.push(width);
  }
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, rgb?: RGB, width?: number) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy, y1 = cy + h, z0 = cz - d / 2, z1 = cz + d / 2;
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [i, j] of e) this.seg(v[i]![0]!, v[i]![1]!, v[i]![2]!, v[j]![0]!, v[j]![1]!, v[j]![2]!, rgb, width);
  }
  get count() { return this.w.length; }
  /**
   * Emit into a 3D LineBatch. `base` scales the unlit colour (0 = invisible until lit), `fog` the
   * exponential fade by distance from the camera, `lamps` add lamp-coloured light.
   */
  emit(lb: LineBatch, cam: THREE.Camera, o: { base?: number; fog?: number; lamps?: Lamp[]; lampGain?: number; alpha?: number; filter?: (i: number) => number; offset?: [number, number, number] } = {}) {
    const [ox, oy, oz] = o.offset ?? [0, 0, 0];
    const cp = (cam as THREE.PerspectiveCamera).position;
    const base = o.base ?? 1, fogD = o.fog ?? 0.03, gain = o.lampGain ?? 2.2;
    for (let i = 0; i < this.w.length; i++) {
      const k = o.filter ? o.filter(i) : 1;
      if (k <= 0) continue;
      const ax = this.a[i * 6]! + ox, ay = this.a[i * 6 + 1]! + oy, az = this.a[i * 6 + 2]! + oz, bx = this.a[i * 6 + 3]! + ox, by = this.a[i * 6 + 4]! + oy, bz = this.a[i * 6 + 5]! + oz;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
      const d = Math.hypot(mx - cp.x, my - cp.y, mz - cp.z);
      const vis = Math.exp(-d * fogD);
      let lr = 0;
      if (o.lamps) for (const l of o.lamps) lr += lampLight(l, mx, my, mz);
      const r = this.col[i * 3]! * base + LIN.lamp[0] * lr * gain;
      const g = this.col[i * 3 + 1]! * base + LIN.lamp[1] * lr * gain;
      const b = this.col[i * 3 + 2]! * base + LIN.lamp[2] * lr * gain;
      const a = clamp(vis * (o.alpha ?? 1) * k * (base > 0 ? 1 : clamp(lr * 3)));
      if (a < 0.004) continue;
      lb.seg(ax, ay, az, bx, by, bz, this.w[i]!, r, g, b, a);
    }
  }
}

/** Project a world point to logical screen px. `z` > 1 or `behind` means not visible. */
export function project(cam: THREE.Camera, x: number, y: number, z: number) {
  const v = new THREE.Vector3(x, y, z).project(cam);
  const view = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
  return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, depth: -view.z, behind: view.z > 0 };
}

/** Screen height in px of an object `h` metres tall at distance `depth` for a perspective camera. */
export const pxPerMetre = (cam: THREE.PerspectiveCamera, depth: number) => (H / 2) / Math.tan((cam.fov * Math.PI) / 360) / Math.max(1e-3, depth);

// =====================================================================================================
// The child: a small figure in a long, too-big raincoat and a hood. Clean lines, flat silhouette, no face.
// =====================================================================================================

export type ChildPose = 'stand' | 'walk' | 'sit' | 'read' | 'hug';

/**
 * Draw the child with feet at (x, y), `h` px tall standing (hood top to boots). Seen from behind
 * (default) or in profile (`profile` = facing -1/1). `lit` 0..1 adds a warm lamp rim on `litSide`.
 * `shade` darkens the coat for night scenes (0 = full faded yellow).
 */
export function drawChild(c: CanvasRenderingContext2D, x: number, y: number, h: number, o: {
  pose?: ChildPose; t?: number; lit?: number; litSide?: -1 | 1; shade?: number; alpha?: number; profile?: 0 | 1 | -1; phase?: number; wind?: number;
} = {}) {
  const pose = o.pose ?? 'stand', t = o.t ?? 0, lit = o.lit ?? 0, side = o.litSide ?? 1, shade = o.shade ?? 0;
  const prof = o.profile ?? 0;
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  c.translate(x, y);
  c.scale(h, h); // unit: 1 = standing height, feet at 0, hood top at -1
  const coat = mixRgba('coat', 'shadow', shade * 0.7);
  const coatDark = mixRgba('coat', 'shadow', 0.45 + shade * 0.35);
  const boot = rgba('shadow');
  const lw = Math.max(0.8 / h, 0.006);
  if (h < 14) {
    // tiny: a hood blob and a coat triangle, nothing else survives at this size
    c.fillStyle = coat;
    c.beginPath();
    c.moveTo(-0.13, -0.78); c.lineTo(0.13, -0.78); c.lineTo(0.27, -0.12); c.lineTo(-0.27, -0.12); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(0, -0.86, 0.15, 0.15, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = boot; c.fillRect(-0.12, -0.13, 0.09, 0.13); c.fillRect(0.03, -0.13, 0.09, 0.13);
    c.restore();
    return;
  }
  const breathe = Math.sin(t * 1.7 + (o.phase ?? 0)) * 0.004;
  const wind = (o.wind ?? 0) * (0.6 + 0.4 * Math.sin(t * 3.1));
  if (pose === 'sit' || pose === 'read' || pose === 'hug') {
    // sitting on the ground, knees up, coat pooled around; from behind the hood and the back
    c.translate(0, 0);
    // boots poking out in front (slightly visible either side)
    c.fillStyle = boot;
    c.beginPath(); c.ellipse(-0.2, -0.03, 0.08, 0.035, -0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(0.22, -0.03, 0.08, 0.035, 0.2, 0, Math.PI * 2); c.fill();
    // coat mass
    c.fillStyle = coat;
    c.beginPath();
    c.moveTo(-0.15, -0.5 + breathe);
    c.bezierCurveTo(-0.3, -0.45, -0.36, -0.2, -0.34, -0.02);
    c.quadraticCurveTo(0, 0.02, 0.34, -0.02);
    c.bezierCurveTo(0.36, -0.2, 0.3, -0.45, 0.15, -0.5 + breathe);
    c.closePath();
    c.fill();
    // hood (slightly bowed forward when reading)
    const bow = pose === 'read' ? 0.04 : 0;
    c.beginPath();
    c.moveTo(-0.15, -0.49 + breathe);
    c.bezierCurveTo(-0.19, -0.62 + bow, -0.12, -0.72 + bow, 0.0, -0.73 + bow);
    c.bezierCurveTo(0.12, -0.72 + bow, 0.19, -0.62 + bow, 0.15, -0.49 + breathe);
    c.closePath();
    c.fill();
    // seams: hood rim, centre back, hem
    c.strokeStyle = coatDark; c.lineWidth = lw * 1.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.14, -0.5 + breathe); c.quadraticCurveTo(0, -0.46, 0.14, -0.5 + breathe); c.stroke();
    c.beginPath(); c.moveTo(0, -0.47); c.lineTo(0, -0.05); c.stroke();
    c.beginPath(); c.moveTo(-0.33, -0.06); c.quadraticCurveTo(0, -0.02, 0.33, -0.06); c.stroke();
    if (pose === 'read') {
      // elbows out, the book held in front (its edge peeks past the arms)
      c.beginPath(); c.moveTo(-0.26, -0.3); c.quadraticCurveTo(-0.34, -0.22, -0.24, -0.16); c.stroke();
      c.beginPath(); c.moveTo(0.26, -0.3); c.quadraticCurveTo(0.34, -0.22, 0.24, -0.16); c.stroke();
    }
    if (pose === 'hug') {
      c.beginPath(); c.moveTo(-0.3, -0.25); c.quadraticCurveTo(0, -0.18, 0.3, -0.25); c.stroke();
    }
  } else {
    const walk = pose === 'walk' ? Math.sin(t * 7.5 + (o.phase ?? 0)) : 0;
    // boots
    c.fillStyle = boot;
    const bl = -0.09 + walk * 0.04 * (prof ? 1.6 : 0.4), br = 0.02 - walk * 0.04 * (prof ? 1.6 : 0.4);
    const lift = (s: number) => Math.max(0, s) * 0.03;
    c.beginPath(); c.roundRect(bl, -0.15 - lift(walk), 0.075, 0.15, 0.02); c.fill();
    c.beginPath(); c.roundRect(br, -0.15 - lift(-walk), 0.075, 0.15, 0.02); c.fill();
    if (prof) { c.beginPath(); c.ellipse(bl + 0.075 * (prof > 0 ? 1 : 0), -0.01, 0.04, 0.02, 0, 0, Math.PI * 2); c.fill(); }
    // coat: narrow shoulders, wide long hem (too big), hem sways with the walk and the wind
    const sway = walk * 0.015 + wind * 0.03;
    c.fillStyle = coat;
    c.beginPath();
    c.moveTo(-0.13, -0.74 + breathe);
    c.bezierCurveTo(-0.2, -0.68, -0.22, -0.45, -0.27 + sway, -0.16);
    c.quadraticCurveTo(-0.02 + sway, -0.1, 0.27 + sway, -0.15);
    c.bezierCurveTo(0.22, -0.45, 0.2, -0.68, 0.13, -0.74 + breathe);
    c.closePath();
    c.fill();
    // sleeves: long, covering the hands (little bulges past the coat line)
    c.beginPath(); c.moveTo(-0.19, -0.66); c.quadraticCurveTo(-0.26, -0.5, -0.24, -0.36); c.quadraticCurveTo(-0.21, -0.33, -0.18, -0.38); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0.19, -0.66); c.quadraticCurveTo(0.26, -0.5, 0.24, -0.36); c.quadraticCurveTo(0.21, -0.33, 0.18, -0.38); c.closePath(); c.fill();
    // hood: a soft pointed back, a little too big
    c.beginPath();
    const hx = prof * 0.03;
    c.moveTo(-0.14, -0.72 + breathe);
    c.bezierCurveTo(-0.19 + hx, -0.86, -0.13 + hx, -0.99, 0.0 + hx, -1.0);
    c.bezierCurveTo(0.13 + hx, -0.99, 0.19 + hx, -0.86, 0.14, -0.72 + breathe);
    c.closePath();
    c.fill();
    if (prof) {
      // profile: the hood's opening is a dark notch (no face, just shadow inside the hood)
      c.fillStyle = rgba('shadow', 0.9);
      c.beginPath();
      c.ellipse(prof * 0.1, -0.84, 0.05, 0.085, 0, 0, Math.PI * 2);
      c.fill();
    }
    // seams
    c.strokeStyle = coatDark; c.lineWidth = lw * 1.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.13, -0.73 + breathe); c.quadraticCurveTo(0, -0.69, 0.13, -0.73 + breathe); c.stroke();
    c.beginPath(); c.moveTo(0, -0.7); c.lineTo(sway * 0.5, -0.13); c.stroke();
    c.beginPath(); c.moveTo(-0.26 + sway, -0.2); c.quadraticCurveTo(0, -0.14, 0.26 + sway, -0.19); c.stroke();
    c.beginPath(); c.moveTo(-0.185, -0.64); c.quadraticCurveTo(-0.22, -0.5, -0.215, -0.4); c.stroke();
    c.beginPath(); c.moveTo(0.185, -0.64); c.quadraticCurveTo(0.22, -0.5, 0.215, -0.4); c.stroke();
  }
  // lamp rim: a warm edge on the lit side
  if (lit > 0.01) {
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(side * 0.34, 0, side * 0.05, 0);
    g.addColorStop(0, rgba('lamp', 0.85 * lit));
    g.addColorStop(1, rgba('lamp', 0));
    c.fillStyle = g;
    c.fillRect(-0.5, -1.05, 1, 1.1);
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
}

/**
 * The child seen from behind and a little above, reading: the hood (a soft dome, slightly pointed at the
 * back, bowed forward), a small shoulder line, the coat's back falling out of frame, and two sleeves
 * bending forward at the elbows to two small hands that hold the book's edges (`hands`, screen px).
 * `s` = the hood's radius in px. The coat is the only warm colour; the hands are pale and cool.
 * Draw the book first: the hands and the hood overlap it.
 */
export function drawChildBack(c: CanvasRenderingContext2D, cx: number, cy: number, s: number, o: {
  hands: [{ x: number; y: number }, { x: number; y: number }]; t?: number; lit?: number; litFrom?: { x: number; y: number }; shade?: number;
}) {
  const t = o.t ?? 0, lit = o.lit ?? 0, shade = o.shade ?? 0;
  const breathe = Math.sin(t * 1.7) * s * 0.012;
  const coat = mixRgba('coat', 'shadow', 0.12 + shade * 0.6);
  const coatLo = mixRgba('coat', 'shadow', 0.55 + shade * 0.3);
  const seam = mixRgba('coat', 'shadow', 0.62 + shade * 0.25);
  const L = o.litFrom ?? { x: cx - s * 2, y: cy - s * 2 };
  const lw = Math.max(1.2, s * 0.028);
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  const coatFill = (y0: number, y1: number) => {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, coat); g.addColorStop(1, coatLo);
    return g;
  };
  // ---- sleeves (behind the back at the shoulder, in front of the book at the cuff)
  const sleeve = (sh: { x: number; y: number }, el: { x: number; y: number }, h: { x: number; y: number }, w0: number, w1: number) => {
    // a tapered tube shoulder -> elbow -> wrist, as a thick stroked path in two tones
    c.strokeStyle = coatLo; c.lineWidth = w0 * 2;
    c.beginPath(); c.moveTo(sh.x, sh.y); c.quadraticCurveTo(el.x, el.y, h.x, h.y); c.stroke();
    c.strokeStyle = coat; c.lineWidth = w0 * 1.55;
    c.beginPath(); c.moveTo(sh.x, sh.y - w0 * 0.2); c.quadraticCurveTo(el.x, el.y - w0 * 0.25, lerp(h.x, el.x, 0.12), lerp(h.y, el.y, 0.12) - w1 * 0.2); c.stroke();
    // the elbow crease and the cuff (a little too long: it swallows half the hand)
    c.strokeStyle = seam; c.lineWidth = lw;
    const ex = lerp(lerp(sh.x, el.x, 0.5), lerp(el.x, h.x, 0.5), 0.5), ey = lerp(lerp(sh.y, el.y, 0.5), lerp(el.y, h.y, 0.5), 0.5);
    c.beginPath(); c.arc(ex, ey, w0 * 0.55, -0.4, 1.2); c.stroke();
    const ang = Math.atan2(h.y - el.y, h.x - el.x);
    c.fillStyle = coat;
    c.beginPath(); c.ellipse(h.x - Math.cos(ang) * w1 * 0.3, h.y - Math.sin(ang) * w1 * 0.3, w1 * 1.05, w1 * 0.8, ang, 0, Math.PI * 2); c.fill();
    c.strokeStyle = seam; c.beginPath(); c.ellipse(h.x - Math.cos(ang) * w1 * 0.3, h.y - Math.sin(ang) * w1 * 0.3, w1 * 1.05, w1 * 0.8, ang, -1.2, 1.2); c.stroke();
  };
  const hand = (h: { x: number; y: number }, dir: 1 | -1) => {
    // small pale fingers curled over the book's edge (cool: the coat stays the only warm thing)
    const skin = mixRgba('paper', 'concrete', 0.45), skinD = mixRgba('paper', 'shadow', 0.55);
    c.fillStyle = skin;
    c.beginPath(); c.ellipse(h.x + dir * s * 0.05, h.y - s * 0.08, s * 0.2, s * 0.15, dir * 0.4, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.ellipse(h.x + dir * s * (0.16 + i * 0.015) , h.y - s * (0.2 - i * 0.09), s * 0.085, s * 0.05, dir * 0.2, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = skinD; c.lineWidth = Math.max(0.8, s * 0.012);
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(h.x + dir * s * 0.1, h.y - s * (0.245 - i * 0.09)); c.lineTo(h.x + dir * s * 0.22, h.y - s * (0.245 - i * 0.09)); c.stroke(); }
  };
  const shL = { x: cx - s * 1.3, y: cy + s * 1.0 }, shR = { x: cx + s * 1.3, y: cy + s * 1.0 };
  const [hL, hR] = o.hands;
  const elL = { x: cx - s * 1.95, y: cy + s * 0.35 }, elR = { x: cx + s * 2.05, y: cy + s * 0.55 };
  sleeve(shL, elL, hL, s * 0.34, s * 0.22);
  sleeve(shR, elR, hR, s * 0.34, s * 0.22);
  hand(hL, 1); hand(hR, -1);
  // cuffs over the hands' base
  for (const [h, el] of [[hL, elL], [hR, elR]] as const) {
    const ang = Math.atan2(h.y - el.y, h.x - el.x);
    c.fillStyle = coat;
    c.beginPath(); c.ellipse(h.x - Math.cos(ang) * s * 0.2, h.y - Math.sin(ang) * s * 0.2, s * 0.2, s * 0.17, ang, 0, Math.PI * 2); c.fill();
    c.strokeStyle = seam; c.lineWidth = lw;
    c.beginPath(); c.ellipse(h.x - Math.cos(ang) * s * 0.2, h.y - Math.sin(ang) * s * 0.2, s * 0.2, s * 0.17, ang, -1.3, 1.3); c.stroke();
  }
  // ---- the back: a small shoulder line, the coat falling away out of frame
  const yB = cy + s * 5;
  c.fillStyle = coatFill(cy + s * 0.6, yB);
  c.beginPath();
  c.moveTo(cx - s * 2.0, yB);
  c.bezierCurveTo(cx - s * 1.85, cy + s * 2.0, cx - s * 1.75, cy + s * 1.05, cx - s * 1.2, cy + s * 0.82 + breathe);
  c.quadraticCurveTo(cx, cy + s * 0.55 + breathe, cx + s * 1.2, cy + s * 0.82 + breathe);
  c.bezierCurveTo(cx + s * 1.75, cy + s * 1.05, cx + s * 1.85, cy + s * 2.0, cx + s * 2.0, yB);
  c.closePath();
  c.fill();
  // folds of the too-big coat and the centre back seam
  c.strokeStyle = seam; c.lineWidth = lw;
  c.beginPath(); c.moveTo(cx + s * 0.02, cy + s * 1.15); c.bezierCurveTo(cx + s * 0.06, cy + s * 2.2, cx - s * 0.04, cy + s * 3.2, cx + s * 0.02, yB); c.stroke();
  c.globalAlpha = 0.6;
  c.beginPath(); c.moveTo(cx - s * 1.2, cy + s * 1.5); c.quadraticCurveTo(cx - s * 1.0, cy + s * 2.6, cx - s * 1.25, yB); c.stroke();
  c.beginPath(); c.moveTo(cx + s * 1.25, cy + s * 1.45); c.quadraticCurveTo(cx + s * 1.05, cy + s * 2.7, cx + s * 1.3, yB); c.stroke();
  c.globalAlpha = 1;
  // ---- the hood: a soft dome, pointed at the back (towards us = down the screen), bowed forward
  const hood = new Path2D();
  hood.moveTo(cx - s * 0.98, cy + s * 0.2);
  hood.bezierCurveTo(cx - s * 1.04, cy - s * 0.7, cx - s * 0.55, cy - s * 1.05, cx + s * 0.02, cy - s * 1.04);
  hood.bezierCurveTo(cx + s * 0.58, cy - s * 1.03, cx + s * 1.05, cy - s * 0.68, cx + s * 0.98, cy + s * 0.2);
  hood.bezierCurveTo(cx + s * 0.85, cy + s * 0.8, cx + s * 0.35, cy + s * 1.12, cx, cy + s * 1.24);
  hood.bezierCurveTo(cx - s * 0.35, cy + s * 1.12, cx - s * 0.85, cy + s * 0.8, cx - s * 0.98, cy + s * 0.2);
  hood.closePath();
  const hg = c.createRadialGradient(cx - s * 0.2, cy - s * 0.4, s * 0.1, cx, cy + s * 0.2, s * 1.35);
  hg.addColorStop(0, coat); hg.addColorStop(1, coatLo);
  c.fillStyle = hg;
  c.fill(hood);
  c.strokeStyle = seam; c.lineWidth = lw * 1.2;
  // centre seam from the crown down to the point, and the gathered hem where it meets the collar
  c.beginPath(); c.moveTo(cx + s * 0.02, cy - s * 1.0); c.bezierCurveTo(cx + s * 0.07, cy - s * 0.3, cx + s * 0.04, cy + s * 0.5, cx, cy + s * 1.2); c.stroke();
  c.beginPath(); c.moveTo(cx - s * 0.92, cy + s * 0.45); c.quadraticCurveTo(cx - s * 0.6, cy + s * 1.05, cx, cy + s * 1.3); c.quadraticCurveTo(cx + s * 0.6, cy + s * 1.05, cx + s * 0.92, cy + s * 0.45); c.stroke();
  c.globalAlpha = 0.5;
  c.beginPath(); c.moveTo(cx - s * 0.62, cy - s * 0.7); c.quadraticCurveTo(cx - s * 0.75, cy - s * 0.1, cx - s * 0.55, cy + s * 0.7); c.stroke();
  c.beginPath(); c.moveTo(cx + s * 0.64, cy - s * 0.68); c.quadraticCurveTo(cx + s * 0.78, cy - s * 0.1, cx + s * 0.57, cy + s * 0.7); c.stroke();
  c.globalAlpha = 1;
  // ---- the lamp's warmth: a rim on the side facing the drone
  if (lit > 0.01) {
    c.save();
    c.clip(hood);
    const g = c.createRadialGradient(L.x, L.y, s * 0.2, L.x, L.y, s * 3.2);
    g.addColorStop(0, rgba('lamp', 0.32 * lit)); g.addColorStop(0.45, rgba('lamp', 0.12 * lit)); g.addColorStop(1, rgba('lamp', 0));
    c.fillStyle = g; c.globalCompositeOperation = 'lighter';
    c.fillRect(cx - s * 2, cy - s * 2, s * 4, s * 4);
    c.restore();
    // a thin bright edge along the hood and the shoulder on the lamp side
    c.strokeStyle = rgba('lamp', 0.55 * lit); c.lineWidth = lw * 1.3;
    const sd = L.x < cx ? -1 : 1;
    c.beginPath(); c.arc(cx, cy - s * 0.05, s * 1.0, sd < 0 ? Math.PI * 1.05 : -0.9, sd < 0 ? Math.PI * 1.6 : -0.05); c.stroke();
    c.beginPath(); c.moveTo(cx + sd * s * 1.15, cy + s * 0.85); c.quadraticCurveTo(cx + sd * s * 1.7, cy + s * 1.05, cx + sd * s * 1.85, cy + s * 1.9); c.stroke();
  }
  c.restore();
}

/** A soft wedge of lamp light from (x, y) towards (tx, ty) in 2D (haze in the beam; the lamp's cone). */
export function drawBeam2D(c: CanvasRenderingContext2D, x: number, y: number, tx: number, ty: number, spread: number, alpha: number) {
  if (alpha <= 0.001) return;
  const ang = Math.atan2(ty - y, tx - x), len = Math.hypot(tx - x, ty - y) * 1.15;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const g = c.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, rgba('lamp', 0.5 * alpha));
  g.addColorStop(1, rgba('lamp', 0));
  c.fillStyle = g;
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const sp = spread * (0.55 + i * 0.25);
    c.globalAlpha = 0.45;
    c.beginPath(); c.moveTo(0, -3); c.lineTo(len, -len * Math.tan(sp)); c.lineTo(len, len * Math.tan(sp)); c.lineTo(0, 3); c.closePath(); c.fill();
  }
  c.restore();
}

// =====================================================================================================
// The lantern-drone: palm-sized, round, one soft lamp, a scuffed shell, one wobbling rotor
// =====================================================================================================

/**
 * Draw the drone centred at (x, y), body radius r px. `lamp` 0..1 is the lamp's brightness (the glow
 * itself goes in a GlowBatch via droneGlow). `look` tilts the lens towards a screen direction.
 */
export function drawDrone(c: CanvasRenderingContext2D, x: number, y: number, r: number, o: { t: number; lamp?: number; look?: [number, number]; alpha?: number; tilt?: number; dark?: number } = { t: 0 }) {
  const t = o.t, lamp = o.lamp ?? 1;
  const look = o.look ?? [0.3, 0.4];
  const ll = Math.hypot(look[0], look[1]) || 1;
  const lx = (look[0] / ll) * r * 0.38, ly = (look[1] / ll) * r * 0.38;
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  c.translate(x, y);
  c.rotate(o.tilt ?? Math.sin(t * 1.3) * 0.06);
  if (r < 5) {
    c.fillStyle = rgba('concrete', 0.9);
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = rgba('lamp', 0.4 + 0.6 * lamp);
    c.beginPath(); c.arc(lx * 0.6, ly * 0.6, r * 0.55, 0, Math.PI * 2); c.fill();
    c.restore();
    return;
  }
  // rotor arms and blurred discs; the right one wobbles (an old bearing)
  const arm = (sx: number, wob: number) => {
    c.strokeStyle = rgba('concrete', 0.95);
    c.lineWidth = Math.max(1, r * 0.12);
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(sx * r * 0.55, -r * 0.55); c.lineTo(sx * r * 1.05, -r * 0.95); c.stroke();
    c.save();
    c.translate(sx * r * 1.05, -r * 1.0);
    c.rotate(wob);
    c.fillStyle = rgba('paper', 0.16);
    c.beginPath(); c.ellipse(0, 0, r * 0.62, r * 0.1, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = rgba('paper', 0.3);
    c.lineWidth = Math.max(0.6, r * 0.03);
    c.stroke();
    c.restore();
  };
  arm(-1, Math.sin(t * 40) * 0.02);
  arm(1, Math.sin(t * 9.3) * 0.16 + Math.sin(t * 23.0) * 0.05);
  // shell
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  const dk = o.dark ?? 0;
  g.addColorStop(0, mixRgba('#8a929b', 'shadow', dk * 0.6));
  g.addColorStop(1, mixRgba('#2c333b', 'shadow', dk * 0.6));
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  // equator seam and scuffs
  c.strokeStyle = rgba('shadow', 0.65);
  c.lineWidth = Math.max(0.7, r * 0.05);
  c.beginPath(); c.ellipse(0, r * 0.05, r * 0.98, r * 0.28, 0, 0, Math.PI); c.stroke();
  c.strokeStyle = rgba('paper', 0.28);
  c.lineWidth = Math.max(0.5, r * 0.025);
  for (let i = 0; i < 4; i++) {
    const a = 3.6 + i * 0.35, rr = r * (0.55 + 0.1 * i);
    c.beginPath(); c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); c.lineTo(Math.cos(a) * rr + r * 0.14, Math.sin(a) * rr + r * 0.05); c.stroke();
  }
  // a small dent
  c.fillStyle = rgba('shadow', 0.35);
  c.beginPath(); c.ellipse(r * 0.45, -r * 0.45, r * 0.12, r * 0.07, 0.6, 0, Math.PI * 2); c.fill();
  // lens: bezel + lamp
  c.fillStyle = rgba('shadow', 0.9);
  c.beginPath(); c.arc(lx, ly, r * 0.46, 0, Math.PI * 2); c.fill();
  const lg = c.createRadialGradient(lx, ly, 0, lx, ly, r * 0.38);
  lg.addColorStop(0, mixRgba('#3a3530', 'lamp', 0.15 + 0.85 * lamp));
  lg.addColorStop(1, mixRgba('#1c1a18', 'lamp', 0.55 * lamp));
  c.fillStyle = lg;
  c.beginPath(); c.arc(lx, ly, r * 0.36, 0, Math.PI * 2); c.fill();
  // tiny status tick on the shell (red: it belongs to the handbook's page counter)
  c.fillStyle = rgba('red', 0.8 * lamp);
  c.beginPath(); c.arc(-r * 0.62, r * 0.18, Math.max(0.8, r * 0.06), 0, Math.PI * 2); c.fill();
  c.restore();
}

/** The drone's lamp glow (add to a screen-space GlowBatch after drawing the drone). */
export function droneGlow(g: GlowBatch, x: number, y: number, r: number, lamp: number, look: [number, number] = [0.3, 0.4]) {
  if (lamp <= 0.001) return;
  const ll = Math.hypot(look[0], look[1]) || 1;
  const lx = x + (look[0] / ll) * r * 0.38, ly = y + (look[1] / ll) * r * 0.38;
  g.add(lx, ly, 0, r * 0.45, r * 0.45, LIN.lamp, 2.4 * lamp, 5);
  g.add(lx, ly, 0, r * 2.2, r * 2.2, LIN.lamp, 0.42 * lamp, 3.5);
  g.add(lx, ly, 0, r * 5.5, r * 5.5, LIN.lamp, 0.07 * lamp, 2.5);
}

/** Hover bob offset for the drone (px, relative to its size). */
export const droneBob = (t: number, r: number): [number, number] => [Math.sin(t * 0.9) * r * 0.25, Math.sin(t * 1.9) * r * 0.35];

// =====================================================================================================
// The city's voice: system lines and wide signage
// =====================================================================================================

/**
 * One line of small system text (the adult layer): mono caps on a thin screen frame, typed out.
 * Neon by default (city). (x, y) = baseline start. Returns the width.
 */
export function drawSystemLine(c: CanvasRenderingContext2D, t: number, text: string, x: number, y: number, o: {
  size?: number; color?: PaletteKey | string; alpha?: number; at?: number; cps?: number; frame?: boolean; align?: 'left' | 'center' | 'right'; flicker?: number;
} = {}) {
  const size = o.size ?? 15, at = o.at ?? -1e9, col = o.color ?? 'neon';
  const n = Math.floor(Math.max(0, t - at) * (o.cps ?? 40));
  const s = text.slice(0, n);
  const fam = F.mono(500);
  const tr = size * 0.14;
  const w = measure(text, fam, size, tr);
  const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  const fl = o.flicker ? flicker(t, o.flicker, 11) : 1;
  c.save();
  c.globalAlpha *= (o.alpha ?? 1) * fl * smoothstep(at, at + 0.1, t);
  if (o.frame !== false) {
    c.fillStyle = rgba('shadow', 0.6);
    c.fillRect(x0 - size * 0.7, y - size * 1.25, w + size * 1.4, size * 1.8);
    c.strokeStyle = rgba(col, 0.35);
    c.lineWidth = 1;
    c.strokeRect(x0 - size * 0.7 + 0.5, y - size * 1.25 + 0.5, w + size * 1.4 - 1, size * 1.8 - 1);
  }
  c.font = font(fam, size);
  c.letterSpacing = `${tr}px`;
  c.fillStyle = rgba(col, 0.95);
  c.textBaseline = 'alphabetic';
  c.fillText(s, x0, y);
  c.restore();
  return w;
}

/** City signage: Archivo wide (125), light, huge, tracked out. Cold and indifferent. */
export function drawSign(c: CanvasRenderingContext2D, text: string, x: number, y: number, o: { size?: number; color?: PaletteKey | string; alpha?: number; align?: CanvasTextAlign; tracking?: number } = {}) {
  const size = o.size ?? 90;
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  c.font = font(F.archivo(125, 300), size);
  c.letterSpacing = `${(o.tracking ?? 0.18) * size}px`;
  c.textAlign = o.align ?? 'left';
  c.fillStyle = rgba(o.color ?? 'neon', 1);
  c.fillText(text, x, y);
  c.restore();
}

// =====================================================================================================
// City blocks: towers and megastructures in haze, sparse lit windows, near edges as lit wireframes
// =====================================================================================================

export interface Tower { x: number; z: number; w: number; d: number; h: number; y0: number; shade: number }

/**
 * A deterministic field of towers. Solids are one InstancedMesh (fogged by the scene's fog), lit
 * windows are sparse 3D glows faded by the same fog, near towers also get concrete edge lines.
 */
export class CityBlocks {
  towers: Tower[] = [];
  mesh: THREE.InstancedMesh;
  windows: { x: number; y: number; z: number; w: number; h: number; warm: number; seed: number }[] = [];
  strips: { x: number; y: number; z: number; rgb: RGB; seed: number }[] = [];
  beacons: { x: number; y: number; z: number; seed: number }[] = [];
  edges = new LitLines();
  constructor(o: {
    seed?: number; count?: number; x0?: number; x1?: number; z0?: number; z1?: number; hMin?: number; hMax?: number;
    wMin?: number; wMax?: number; keepOut?: (x: number, z: number, w: number, d: number) => boolean; mega?: number;
    color?: RGB; windowRate?: number; edgeWithin?: (t: Tower) => boolean; extra?: Tower[];
    /** Ground level the towers stand on (below the camera: a canyon). */
    yBase?: number;
    /** With edgeWithin: horizontal floor lines on the camera-facing face every N metres. */
    edgeFloors?: number;
  } = {}) {
    const yb = o.yBase ?? 0;
    const r = mulberry32(o.seed ?? 3);
    const n = o.count ?? 220;
    const x0 = o.x0 ?? -900, x1 = o.x1 ?? 900, z0 = o.z0 ?? -1400, z1 = o.z1 ?? -80;
    for (let i = 0; i < n * 3 && this.towers.length < n; i++) {
      const w = lerp(o.wMin ?? 18, o.wMax ?? 70, r() ** 1.5), d = w * lerp(0.6, 1.4, r());
      const x = lerp(x0, x1, r()), z = lerp(z0, z1, r() ** 0.8);
      if (o.keepOut && o.keepOut(x, z, w, d)) continue;
      const far = (z1 - z) / (z1 - z0);
      const h = lerp(o.hMin ?? 60, o.hMax ?? 380, r() ** 1.3) * lerp(0.8, 1.5, far);
      this.towers.push({ x, z, w, d, h, y0: yb, shade: r() });
      // setbacks: a narrower block on top
      if (r() < 0.45) this.towers.push({ x: x + (r() - 0.5) * w * 0.2, z, w: w * lerp(0.45, 0.75, r()), d: d * lerp(0.45, 0.8, r()), h: h * lerp(0.2, 0.5, r()), y0: yb + h, shade: r() });
    }
    // megastructures: a few enormous slabs far away, the city's scale
    for (let i = 0; i < (o.mega ?? 5); i++) {
      const x = lerp(x0 * 0.9, x1 * 0.9, (i + 0.3 + r() * 0.4) / (o.mega ?? 5));
      const z = lerp(z0 * 1.05, z0 * 0.7, r());
      const w = lerp(160, 320, r()), h = lerp(700, 1100, r());
      this.towers.push({ x, z, w, d: w * 0.6, h, y0: yb, shade: 0.2 * r() });
      // a vertical light strip up the face (the megastructure's spine) and a beacon on top
      const sx = x + (r() - 0.5) * w * 0.4, col = r() < 0.4 ? LIN.neon : LIN.sodium;
      for (let y = yb + 6; y < yb + h; y += 3.2) this.strips.push({ x: sx, y, z: z + w * 0.3 + 0.5, rgb: col, seed: y });
      this.beacons.push({ x, y: yb + h + (r() < 0.7 ? h * 0.25 : 0) + 4, z, seed: r() });
      if (r() < 0.7) this.towers.push({ x, z, w: w * 0.3, d: w * 0.3, h: h * 0.25, y0: yb + h, shade: 0 });
    }
    if (o.extra) this.towers.push(...o.extra);
    const base = o.color ?? LIN.shadow;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.towers.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    this.towers.forEach((tw, i) => {
      m.compose(ps.set(tw.x, tw.y0, tw.z), q, sc.set(tw.w, tw.h, tw.d));
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, col3(mixRGB(base, LIN.deep, tw.shade * 0.8)));
      // windows on the camera-facing (+z) face: sparse, in floors
      const rate = (o.windowRate ?? 0.035) * (tw.w > 150 ? 0.35 : 1);
      const floors = Math.floor(tw.h / 4.2), cols = Math.max(1, Math.floor(tw.w / 3.6));
      const rr = mulberry32(i * 7919 + (o.seed ?? 3));
      const litFloors = new Set<number>();
      for (let fl = 1; fl < floors; fl++) if (rr() < rate * 1.6) litFloors.add(fl);
      for (let fl = 1; fl < floors; fl++) for (let cc = 0; cc < cols; cc++) {
        if (rr() > (litFloors.has(fl) ? 0.55 : rate)) continue;
        this.windows.push({ x: tw.x - tw.w / 2 + (cc + 0.5) * (tw.w / cols), y: tw.y0 + fl * 4.2, z: tw.z + tw.d / 2 + 0.3, w: 1.1, h: 1.3, warm: rr(), seed: rr() });
      }
      if (o.edgeWithin && o.edgeWithin(tw)) {
        this.edges.box(tw.x, tw.y0, tw.z, tw.w, tw.h, tw.d, LIN.concrete, 1.1);
        if (o.edgeFloors) for (let y = tw.y0 + o.edgeFloors; y < tw.y0 + tw.h; y += o.edgeFloors)
          this.edges.seg(tw.x - tw.w / 2, y, tw.z + tw.d / 2, tw.x + tw.w / 2, y, tw.z + tw.d / 2, scaleRGB(LIN.concrete, 0.6), 0.7);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.frustumCulled = false;
  }
  /** Emit lit windows as 3D glows, faded by exponential fog `density` from the camera. */
  emitWindows(g: GlowBatch, cam: THREE.Camera, t: number, o: { density?: number; gain?: number; off?: (w: { x: number; y: number; z: number; seed: number }) => number } = {}) {
    const cp = (cam as THREE.PerspectiveCamera).position;
    const dens = o.density ?? 0.002, gain = o.gain ?? 1;
    const warm = LIN.sodium, cold = mixRGB(LIN.concrete, LIN.paper, 0.5);
    for (const w of this.windows) {
      const d = Math.hypot(w.x - cp.x, w.y - cp.y, w.z - cp.z);
      const f = Math.exp(-d * dens);
      if (f < 0.02) continue;
      const k = o.off ? o.off(w) : 1;
      if (k <= 0) continue;
      const tv = (0.85 + 0.15 * Math.sin(t * (0.3 + w.seed) + w.seed * 40)) * (0.3 + 0.7 * smoothstep(30, 220, d));
      g.add(w.x, w.y, w.z, w.w, w.h, w.warm > 0.3 ? warm : cold, 1.3 * f * gain * tv * k, 3.5);
    }
  }
  /** Megastructure light strips (a slow pulse running up) and blinking red beacons. */
  emitStrips(g: GlowBatch, cam: THREE.Camera, t: number, o: { density?: number; gain?: number } = {}) {
    const cp = (cam as THREE.PerspectiveCamera).position;
    const dens = o.density ?? 0.001, gain = o.gain ?? 1;
    for (const s of this.strips) {
      const f = Math.exp(-Math.hypot(s.x - cp.x, s.y - cp.y, s.z - cp.z) * dens);
      const run = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(s.y * 0.02 - t * 2.2), 6);
      g.add(s.x, s.y, s.z, 2.2, 1.6, s.rgb, 1.6 * f * gain * run, 3);
    }
    for (const b of this.beacons) {
      const f = Math.exp(-Math.hypot(b.x - cp.x, b.y - cp.y, b.z - cp.z) * dens * 0.8);
      const on = ((t + b.seed * 2) % 1.6) < 0.25 ? 1 : 0.08;
      g.add(b.x, b.y, b.z, 5, 5, LIN.neon, 3 * f * on * gain, 4);
    }
  }
}


// =====================================================================================================
// Depth: fog cards (layered haze that parallaxes), light shafts through it, neon signs with wet reflections
// =====================================================================================================

const FOGCARD_VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec2 uv;
uniform mat4 projectionMatrix, modelViewMatrix, modelMatrix;
out vec3 vW; out vec2 vUv;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * Layered haze: vertical translucent sheets at fixed depths, each a drifting fbm veil graded by height
 * (denser low). Being real planes in the scene, they parallax against the towers as the camera moves;
 * they fade out as the camera flies through them.
 */
export class FogCards {
  scene = new THREE.Scene();
  cards: { mesh: THREE.Mesh; mat: THREE.RawShaderMaterial; z: number }[] = [];
  add(o: { z: number; x?: number; w: number; y0: number; y1: number; color: RGB; alpha: number; scale?: number; seed?: number; low?: number; high?: number; rotY?: number }) {
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FOGCARD_VERT,
      fragmentShader: `precision highp float;\nin vec3 vW; in vec2 vUv; out vec4 fragColor;\n${GLSL_COMMON}\n
        uniform vec3 col, camPos; uniform float alpha, time, sc, seed, low, high, cardZ;
        void main() {
          float n = fbm(vec2(vW.x * sc + time * 0.6 * sc * 20.0 + seed, vW.y * sc * 2.4 + seed * 0.37), 5) * 0.5 + 0.5;
          float g = smoothstep(high, low, vW.y);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          float near = smoothstep(4.0, 40.0, abs(camPos.z - cardZ));
          float a = alpha * mix(0.35, 1.0, n * n * 1.6) * g * edge * near;
          fragColor = vec4(col * a, a);
        }`,
      uniforms: { col: { value: new THREE.Vector3(...o.color) }, camPos: { value: new THREE.Vector3() }, alpha: { value: o.alpha }, time: { value: 0 },
        sc: { value: o.scale ?? 0.004 }, seed: { value: o.seed ?? 0 }, low: { value: o.low ?? o.y0 }, high: { value: o.high ?? o.y1 }, cardZ: { value: o.z } },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending,
    });
    mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.y1 - o.y0), mat);
    mesh.position.set(o.x ?? 0, (o.y0 + o.y1) / 2, o.z);
    mesh.rotation.y = o.rotY ?? 0;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.cards.push({ mesh, mat, z: o.z });
    return mesh;
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: THREE.Camera, t: number, gain = 1) {
    for (const c of this.cards) {
      (c.mat.uniforms.camPos!.value as THREE.Vector3).copy((cam as THREE.PerspectiveCamera).position);
      c.mat.uniforms.time!.value = t;
      c.mesh.visible = gain > 0.001;
      c.mat.uniforms.alpha!.value = (c.mat.userData.a0 ??= c.mat.uniforms.alpha!.value) * gain;
    }
    renderer.setRenderTarget(out);
    renderer.render(this.scene, cam);
  }
}

/**
 * Light shafts: long soft beams of haze-light (sun through a gap in the smog, a searchlight), each a
 * camera-facing ribbon along its axis, additive, depth-tested against the city, faded by distance.
 */
export class LightShafts {
  scene = new THREE.Scene();
  mats: THREE.RawShaderMaterial[] = [];
  add(o: { top: V3; dir: V3; length: number; width: number; color: RGB; intensity: number; seed?: number; fog?: number; spread?: number }) {
    const geo = new THREE.PlaneGeometry(2, 1, 1, 24);
    geo.translate(0, 0.5, 0); // x: -1..1 across, y: 0..1 along
    const d = new THREE.Vector3(...o.dir).normalize();
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `precision highp float;
        in vec3 position; uniform mat4 projectionMatrix, viewMatrix; uniform vec3 top, dir, camPos; uniform float len, width, spread;
        out vec2 vP; out vec3 vW;
        void main() {
          vec3 c = top + dir * len * position.y;
          vec3 side = normalize(cross(dir, camPos - c));
          vec3 w = c + side * position.x * width * (1.0 + spread * position.y);
          vP = position.xy; vW = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `precision highp float;\nin vec2 vP; in vec3 vW; out vec4 fragColor;\n${GLSL_COMMON}\n
        uniform vec3 col, camPos; uniform float inten, time, seed, fogD;
        void main() {
          float across = pow(1.0 - vP.x * vP.x, 2.0);
          float along = smoothstep(0.0, 0.08, vP.y) * pow(1.0 - vP.y, 1.6);
          float streak = 0.6 + 0.4 * fbm(vec2(vP.x * 3.0 + seed, vP.y * 2.0 - time * 0.05), 3);
          float fog = exp(-length(vW - camPos) * fogD);
          fragColor = vec4(col * inten * across * along * streak * fog, 0.0);
        }`,
      uniforms: { top: { value: new THREE.Vector3(...o.top) }, dir: { value: d }, camPos: { value: new THREE.Vector3() }, len: { value: o.length }, width: { value: o.width },
        spread: { value: o.spread ?? 0.6 }, col: { value: new THREE.Vector3(...o.color) }, inten: { value: o.intensity }, time: { value: 0 }, seed: { value: o.seed ?? 0 }, fogD: { value: o.fog ?? 0.0006 } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.CustomBlending,
    });
    mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor;
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    this.scene.add(m);
    this.mats.push(mat);
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: THREE.Camera, t: number, gain = 1) {
    for (const m of this.mats) {
      (m.uniforms.camPos!.value as THREE.Vector3).copy((cam as THREE.PerspectiveCamera).position);
      m.uniforms.time!.value = t;
      m.uniforms.inten!.value = (m.userData.i0 ??= m.uniforms.inten!.value) * gain;
    }
    renderer.setRenderTarget(out);
    renderer.render(this.scene, cam);
  }
}

type V3 = [number, number, number];

/**
 * A city sign in 3D: neon letters (bare tubes, additive) or a screen (dark panel, lit text), with a
 * slight flicker and its reflection on the wet ground below (a mirrored, dimmed copy seen through the
 * translucent ground). Every sign speaks in the city's system-line voice.
 */
export class NeonSign {
  mesh: THREE.Mesh; refl: THREE.Mesh | null = null;
  mat: THREE.MeshBasicMaterial; rmat: THREE.MeshBasicMaterial | null = null;
  w: number; h: number; pos: THREE.Vector3;
  constructor(public o: {
    lines: string[]; pos: V3; height: number; rotY?: number; color?: PaletteKey; kind?: 'neon' | 'screen';
    groundY?: number; bright?: number; flicker?: number; seed?: number; vertical?: boolean; reflect?: number; wall?: 'left' | 'right';
  }) {
    const kind = o.kind ?? 'neon', col = o.color ?? 'neon';
    const fam = F.mono(600), fs = 120, tr = fs * 0.12;
    const lines = o.vertical ? o.lines[0]!.split('') : o.lines;
    // measure with the canvas itself (what it draws is what we size for)
    const mc = document.createElement('canvas').getContext('2d')!;
    mc.font = font(fam, fs); mc.letterSpacing = o.vertical ? '0px' : `${tr}px`;
    const wMax = Math.max(...lines.map((l) => mc.measureText(l).width));
    const lh = fs * (o.vertical ? 1.05 : 1.3);
    const pad = fs * 0.6;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(wMax + pad * 2); cv.height = Math.ceil(lh * lines.length + pad * 1.4);
    const c = cv.getContext('2d')!;
    if (kind === 'screen') {
      c.fillStyle = rgba('shadow', 0.92); c.fillRect(0, 0, cv.width, cv.height);
      c.strokeStyle = rgba(col, 0.55); c.lineWidth = fs * 0.06; c.strokeRect(fs * 0.12, fs * 0.12, cv.width - fs * 0.24, cv.height - fs * 0.24);
    }
    c.font = font(fam, fs); c.letterSpacing = o.vertical ? '0px' : `${tr}px`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const y = pad * 0.7 + lh * (i + 0.5);
      if (kind === 'neon') { c.shadowColor = rgba(col, 0.9); c.shadowBlur = fs * 0.25; c.fillStyle = rgba(col, 0.55); c.fillText(l, cv.width / 2, y); c.shadowBlur = 0; }
      c.fillStyle = kind === 'neon' ? mixRgba(col, 'paper', 0.35) : rgba(col);
      c.fillText(l, cv.width / 2, y);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    this.h = o.height; this.w = o.height * cv.width / cv.height;
    const additive = kind === 'neon';
    this.mat = new THREE.MeshBasicMaterial({ map: tex, fog: true, transparent: additive, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.mat);
    this.pos = new THREE.Vector3(...o.pos);
    // mounted on a wall (x = pos.x): slide the sign out so its angled plane doesn't sink into the wall
    if (o.wall) this.pos.x += (o.wall === 'left' ? 1 : -1) * (Math.abs(Math.cos(o.rotY ?? 0)) * this.w / 2 + 0.4);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = o.rotY ?? 0;
    if (o.groundY !== undefined) {
      this.rmat = new THREE.MeshBasicMaterial({ map: tex, fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.refl = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.rmat);
      this.refl.position.set(this.pos.x, 2 * o.groundY - o.pos[1], o.pos[2]);
      this.refl.rotation.y = o.rotY ?? 0;
      this.refl.scale.y = -1.25; // stretched by the wet ground
    }
  }
  /** Per-frame brightness (flicker), `k` 0..1 master (e.g. a blackout). */
  update(t: number, k = 1) {
    const b = (this.o.bright ?? 1.6) * k * flicker(t, this.o.flicker ?? 0.08, this.o.seed ?? 1);
    this.mat.color.setScalar(b);
    if (this.rmat) this.rmat.color.setScalar(b * (this.o.reflect ?? 0.3));
  }
  /** A soft halo of the sign's colour around it (3D glow), and its smear on the ground. */
  glow(g: GlowBatch, k = 1) {
    const rgb = LIN[this.o.color ?? 'neon'];
    const b = (this.o.bright ?? 1.6) * k * 0.05;
    g.add(this.pos.x, this.pos.y, this.pos.z + 0.5, this.w * 0.8, this.h * 1.6, rgb, b, 2);
    if (this.o.groundY !== undefined) g.add(this.pos.x, this.o.groundY + 0.3, this.pos.z + 0.5, this.w * 0.5, Math.min(40, (this.pos.y - this.o.groundY) * 0.6 + this.h), rgb, b * 1.2, 2.5);
  }
}

// =====================================================================================================
// CityScene: the usual layers in the usual order
// =====================================================================================================

/**
 * Base class for chapter scenes. Render order the chapters follow:
 *   sky -> three.js solids (fog) -> lit wireframes -> lamp cone -> world 2D (figures, signs)
 *   -> glows (screen and 3D) -> rain -> UI 2D (entry, panel, callouts, page counter)
 */
export abstract class CityScene extends Scene {
  sky = new Sky();
  fogSheet = new FogSheet();
  cone = new LampCone();
  three = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 2000);
  lines3D = new LineBatch(60000, { screen2D: false, blend: 'normal', depthTest: true });
  lines2D = new LineBatch(8000, { screen2D: true, blend: 'add' });
  glow2D = new GlowBatch(512, { screen2D: true });
  glow3D = new GlowBatch(48000, { screen2D: false, depthTest: true });
  world = new Layer2D();
  ui = new Layer2D();

  constructor(ctx: SceneCtx) { super(ctx); }

  /** The scene context, for helper objects owned by the scene. */
  get sctx() { return this.ctx; }
  protected get ly() { return this.ctx.lyrics; }
  protected get au() { return this.ctx.audio; }

  /** Begin a frame: clear batches and layers. */
  begin() {
    this.lines3D.clear(); this.lines2D.clear(); this.glow2D.clear(); this.glow3D.clear();
    this.world.clear(); this.ui.clear();
  }
  drawThree(out: THREE.WebGLRenderTarget) {
    const r = this.ctx.renderer;
    r.setRenderTarget(out);
    r.clearDepth();
    r.render(this.three, this.cam);
  }
  composite2D(layer: Layer2D, out: THREE.WebGLRenderTarget, opacity = 1) {
    this.ctx.comp.draw(this.ctx.renderer, layer.upload(), out, { opacity });
  }
}

/** A basic fogged solid material (linear colour). */
export function solid(rgb: RGB, o: { fog?: boolean; side?: THREE.Side; transparent?: boolean; opacity?: number } = {}) {
  const m = new THREE.MeshBasicMaterial({ fog: o.fog ?? true, side: o.side ?? THREE.FrontSide, transparent: o.transparent ?? false, opacity: o.opacity ?? 1 });
  m.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
  return m;
}
/** A linear-space THREE.Color. */
export const col3 = (rgb: RGB) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);

export { layout };
