// `book` — the title card (TREATMENT r5 item 3: at most 3 s, then straight into the story).
// The handbook's paper cover in the dark, then it falls open at the contents: INTRODUCTION · 12 and the
// thirteen entries flash by as print (a prop, not text to read). The red 12 lifts off into the page
// counter, and the cut lands in the child's hands in the train, on the same page (lost.ts).
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { F, font, measure } from '../engine/type';
import { clamp, ease, hash, lerp, prog, smoothstep } from '../engine/util';
import { CONTENTS, INTRO } from '../contents';
import { CityScene, LIN, POST_BASE, rgba, mixRgba, scaleRGB, mixRGB, drawPageNumber, drawPageCounter, rain, logText } from './_motifs';

const TITLE = 'WHAT TO DO IF…';

export default class Book extends CityScene {
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, { renderer } = this.ctx;
    this.begin();
    const tOpen = f.end - 0.9; // the cover opens (after the title's 1.5 s)
    this.sky.render(renderer, out, { top: scaleRGB(LIN.shadow, 0.9), horizon: mixRGB(scaleRGB(LIN.fog, 0.8), scaleRGB(LIN.smog, 0.3), 0.3), low: scaleRGB(LIN.shadow, 1.1), horizonY: 0.4, t, haze: 0.7 });
    // out-of-focus city lights behind the book (bokeh), drifting a little
    const g = this.glow2D;
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 1) * W + Math.sin(t * 0.3 + i) * 6, y = H * (0.15 + 0.5 * hash(i, 2));
      const col = hash(i, 3) < 0.2 ? LIN.neon : hash(i, 3) < 0.7 ? LIN.sodium : LIN.concrete;
      g.add(x, y, 0, 26 + 50 * hash(i, 4), 26 + 50 * hash(i, 4), col, 0.08 + 0.12 * hash(i, 5), 1.6);
    }
    g.render(renderer, out);
    rain(this.lines2D, t, { count: 500, alpha: 0.08, speed: 1400, angle: 0.08, seed: 3 });
    this.lines2D.render(renderer, out);

    const c = this.ui.ctx;
    // the book: centred, a slow push in; the cover swings open around its spine at tOpen
    const push = lerp(1, 1.08, prog(t, f.start, f.end));
    const open = prog(t, tOpen, tOpen + 0.32, ease.inOutCubic);
    const bw = (PORTRAIT ? W * 0.62 * lerp(1, 0.74, open) : H * 0.62) * push, bh = bw * 1.38;
    const cx = W / 2, cy = PORTRAIT ? H * 0.42 : H * 0.5;
    const light = smoothstep(f.start + 0.02, f.start + 0.25, t);
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.04 * (1 - open));
    // the spread lies under the cover (its right page under the cover); the cover swings over the spine
    // to the left and the spread slides to the centre
    const fold = Math.cos(open * Math.PI);
    const spreadX = -1.5 * bw + 0.5 * bw * open, spine = spreadX + bw;
    c.save();
    c.beginPath(); c.rect(spine + Math.min(0, fold) * bw, -bh, 3 * bw, 2 * bh); c.clip();
    this.contents(c, t, spreadX, -bh / 2, bw, bh, tOpen);
    c.restore();
    if (fold > -0.98) {
      c.save();
      c.translate(spine, 0);
      c.scale(fold, 1);
      if (fold > 0) this.cover(c, 0, -bh / 2, bw, bh, light);
      else { c.fillStyle = mixRgba('paper', 'shadow', 0.3); c.fillRect(0, -bh / 2, bw, bh); }
      c.restore();
    }
    c.restore();
    // title: fully visible from the lamp-up to the moment the cover starts to open
    logText('title', TITLE, t > f.start + 0.2 && t < tOpen, { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh * 0.4 });
    drawPageCounter(c, this.ly, t, { page: prog(t, tOpen + 0.45, tOpen + 0.5) > 0 ? INTRO.page : null, prev: null, since: tOpen + 0.45, ...(PORTRAIT ? counterPortrait() : {}) });
    this.composite2D(this.ui, out);
    return { ...POST_BASE, fade: 1 - smoothstep(f.start, f.start + 0.3, t) };
  }

  cover(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, light: number) {
    c.fillStyle = mixRgba('shadow', 'paper', 0.25 + 0.7 * light);
    c.beginPath(); c.roundRect(x, y, w, h, w * 0.02); c.fill();
    c.fillStyle = mixRgba('shadow', 'red', 0.3 + 0.6 * light);
    c.fillRect(x, y + h * 0.1, w, h * 0.012);
    c.fillRect(x, y + h * 0.9, w, h * 0.012);
    c.fillStyle = mixRgba('shadow', 'ink', 0.5 + 0.5 * light);
    c.font = font(F.archivo(62, 900), w * 0.15); c.textBaseline = 'alphabetic';
    c.fillText('WHAT TO DO', x + w * 0.1, y + h * 0.3);
    c.fillText('IF…', x + w * 0.1, y + h * 0.3 + w * 0.15);
    // our own emblem: a house outline and a small lantern
    c.strokeStyle = mixRgba('shadow', 'red', 0.3 + 0.6 * light); c.lineWidth = w * 0.012;
    const ex = x + w * 0.5, ey = y + h * 0.68, s = w * 0.16;
    c.beginPath(); c.moveTo(ex - s, ey + s * 0.8); c.lineTo(ex - s, ey - s * 0.1); c.lineTo(ex, ey - s); c.lineTo(ex + s, ey - s * 0.1); c.lineTo(ex + s, ey + s * 0.8); c.closePath(); c.stroke();
    c.beginPath(); c.arc(ex, ey + s * 0.25, s * 0.22, 0, Math.PI * 2); c.stroke();
  }

  /** The contents spread (our typesetting of the handbook's contents: INTRODUCTION + the thirteen entries). */
  contents(c: CanvasRenderingContext2D, t: number, x: number, y: number, w: number, h: number, tOpen: number) {
    c.fillStyle = rgba('paper', 0.95);
    c.beginPath(); c.roundRect(x, y, w * 2, h, w * 0.02); c.fill();
    const gg = c.createLinearGradient(x + w * 0.9, 0, x + w * 1.1, 0);
    gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, 'rgba(0,0,0,0.25)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gg; c.fillRect(x + w * 0.9, y, w * 0.2, h);
    const ink = rgba('ink', 0.9), fs = w * 0.052, fam = F.archivo(62, 800);
    const row = (label: string, page: string, px: number, py: number, pw: number, lift = 0) => {
      c.font = font(fam, fs); c.fillStyle = ink; c.fillText(label, px, py);
      const lw = measure(label, fam, fs);
      c.fillStyle = rgba('ink', 0.6);
      for (let d = px + lw + fs * 0.3; d < px + pw - fs * 1.4; d += fs * 0.3) c.fillRect(d, py - 2, 2, 2);
      if (lift < 1) drawPageNumber(c, page, px + pw, py - lift * fs * 4, fs, { alpha: 1 - lift });
    };
    // left page: the introduction row; the 12 lifts off to the counter
    const lift = prog(t, tOpen + 0.3, tOpen + 0.5, ease.inOutCubic);
    c.font = font(F.mono(600), fs * 0.6); c.fillStyle = rgba('ink', 0.7); c.fillText('CONTENTS', x + w * 0.1, y + h * 0.12);
    row(INTRO.label, INTRO.page, x + w * 0.1, y + h * 0.22, w * 0.8, lift);
    c.font = font(fam, fs * 1.3); c.fillStyle = ink; c.fillText(TITLE, x + w * 0.1, y + h * 0.34);
    // right page: the thirteen entries
    CONTENTS.forEach((e, i) => row(e.line.toUpperCase(), e.page, x + w * 1.1, y + h * (0.1 + i * 0.066), w * 0.8));
    logText('prop', 'contents page', true);
  }
}

/** The page counter inside the vertical safe area (r5 item 7): below the top 150 px, left of the right 140 px. */
export function counterPortrait() { return { top: 190, right: W - 150, size: 132 }; }
