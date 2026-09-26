// Global overlay: the crop-mark frame (off unless a scene asks for it with post.frame) and the
// optional timeline captions. The What if video keeps its recurring UI (page counter, WHAT TO DO
// panel, contents entries) inside the scenes via scenes/_motifs.ts, not here.
import { Layer2D, W, H } from './gl';
import { rgba } from './palette';
import { F, font } from './type';
import { clamp, ease, lerp, prog, smoothstep } from './util';

export interface Caption { start: number; end: number; fig: string; text: string }

export interface HudState {
  /** Overrides from the active scene (via post.hud etc.). */
  opacity: number;
  /** 0..1 the crop-mark frame: 1 in place, 0 flown out past the edges (see PostParams.frame). */
  frame: number;
  /** 0..1: the frame is light (paper) — draw captions/crop marks in ink. */
  paper: number;
}

export class Hud {
  layer = new Layer2D();
  private ink = false;
  constructor(public captions: Caption[]) {}

  draw(t: number, st: HudState) {
    const L = this.layer;
    L.clear();
    const c = L.ctx;
    if (st.opacity <= 0.001) return L.upload();
    c.globalAlpha = st.opacity;
    this.ink = st.paper > 0.5;
    if (st.frame > 0.001) this.cropMarks(c, st.frame);
    this.caption(c, t);
    return L.upload();
  }

  /** Corner marks; as `k` drops they fly out along the diagonals and past the edges. */
  private cropMarks(c: CanvasRenderingContext2D, k: number) {
    const e = ease.inOutCubic(clamp(k));
    c.save();
    c.globalAlpha *= clamp(k * 3);
    c.strokeStyle = this.ink ? rgba('ink', 0.45) : rgba('paper', 0.34);
    c.lineWidth = 1.25;
    const m = lerp(-40, 36, e), l = 22;
    c.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
      c.moveTo(x + sx * l, y + 0.5 * sy); c.lineTo(x, y + 0.5 * sy); c.lineTo(x, y + sy * l);
    }
    c.stroke();
    c.restore();
  }

  private caption(c: CanvasRenderingContext2D, t: number) {
    const cap = this.captions.find((k) => t >= k.start && t < k.end);
    if (!cap) return;
    const a = Math.min(smoothstep(cap.start, cap.start + 0.5, t), 1 - smoothstep(cap.end - 0.6, cap.end, t));
    if (a <= 0) return;
    c.save();
    c.globalAlpha *= a;
    const x = W - 64, y = H - 66;
    c.textBaseline = 'alphabetic';
    c.font = font(F.serif(400, true), 26);
    c.fillStyle = this.ink ? rgba('ink', 0.9) : rgba('paper', 0.85);
    const n = Math.floor(cap.text.length * prog(t, cap.start, cap.start + 0.8));
    const full = c.measureText(cap.text).width;
    c.fillText(cap.text.slice(0, n), x - full, y);
    c.font = font(F.mono(500), 13);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('red', 1);
    c.fillText(cap.fig, x - full, y - 34);
    c.restore();
  }
}
