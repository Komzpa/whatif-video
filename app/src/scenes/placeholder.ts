// Stand-in for a chapter whose scene is not built yet: the handbook's Russian heading for each of its lines,
// lit as the line is sung (TREATMENT r7: Russian only; r6: no page numbers, no counter), over quiet night haze.
// Keeps the whole song watchable end to end.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { F, font } from '../engine/type';
import { smoothstep } from '../engine/util';
import { entriesOf } from '../contents';
import { CityScene, LIN, POST_BASE, SAFE, rgba, scaleRGB } from './_motifs';
import { drawHeading } from './_ru';

export default class Placeholder extends CityScene {
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t;
    this.begin();
    this.sky.render(renderer, out, { top: scaleRGB(LIN.shadow, 1), horizon: scaleRGB(LIN.fog, 0.7), low: scaleRGB(LIN.shadow, 1.1), horizonY: 0.62, t, haze: 1.2 });
    this.fogSheet.render(renderer, out, { color: scaleRGB(LIN.fog, 0.9), alpha: 0.35, y0: 0.35, y1: 1, t, scale: 0.8 });

    const c = this.ui.ctx;
    const chapter = this.ctx.params.chapter as string;
    const entries = entriesOf(chapter);
    entries.forEach((e, i) => {
      const L = this.ly.get(e.line);
      const next = entries[i + 1] ? this.ly.get(entries[i + 1]!.line).words[0]!.start : f.end;
      drawHeading(c, L, e.heading, t, PORTRAIT ? { x: 60, y: 1300, width: W - 210, size: 104, until: next } : { x: SAFE, y: H - 110, width: 1300, size: 64, until: next });
    });
    if (!entries.length) {
      c.font = font(F.metro(400), 30);
      c.fillStyle = rgba('paper', 0.35 * smoothstep(f.start, f.start + 1, t));
      c.textAlign = 'center';
      c.fillText('…', W / 2, H * 0.48);
      c.textAlign = 'left';
    }
    this.composite2D(this.ui, out);
    return { ...POST_BASE };
  }
}
