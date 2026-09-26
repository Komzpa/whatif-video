// Stand-in for a chapter whose scene is not built yet: its contents entries (caps heading, dot
// leader, red page number) sung word by word over quiet night haze, and the page counter. Keeps the
// whole song watchable end to end.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { smoothstep } from '../engine/util';
import { entriesOf } from '../contents';
import { CityScene, LIN, POST_BASE, SAFE, drawEntry, drawPageCounter, entryAlpha, rgba, scaleRGB, drawChild, drawDrone, droneGlow, droneBob } from './_motifs';

export default class Placeholder extends CityScene {
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t;
    this.begin();
    this.sky.render(renderer, out, { top: scaleRGB(LIN.shadow, 1), horizon: scaleRGB(LIN.fog, 0.7), low: scaleRGB(LIN.shadow, 1.1), horizonY: 0.62, t, haze: 1.2 });
    this.fogSheet.render(renderer, out, { color: scaleRGB(LIN.fog, 0.9), alpha: 0.35, y0: 0.35, y1: 1, t, scale: 0.8 });

    const c = this.ui.ctx;
    const chapter = this.ctx.params.chapter as string;
    const entries = entriesOf(chapter).map((e) => this.ly.get(e.line));
    // the child and the drone, small, bottom right: the pair is always present
    const gx = W * 0.78, gy = H * 0.86;
    drawChild(this.world.ctx, gx, gy, 90, { t, shade: 0.35, lit: 0.4, litSide: -1 });
    const [bx, by] = droneBob(t, 9);
    drawDrone(this.world.ctx, gx - 34 + bx, gy - 104 + by, 9, { t, lamp: 1, look: [-0.5, 0.3] });
    droneGlow(this.glow2D, gx - 34 + bx, gy - 104 + by, 9, 1, [-0.5, 0.3]);
    this.composite2D(this.world, out);
    this.glow2D.render(renderer, out);

    entries.forEach((L, i) => {
      const next = entries[i + 1]?.words[0]!.start ?? f.end;
      const a = entryAlpha(L, t, 30, next);
      if (a <= 0.001) return;
      drawEntry(c, this.ly, this.au, L, t, { x: SAFE + 60, y: H * 0.46, width: W - 2 * SAFE - 120, size: 64, alpha: a });
    });
    if (!entries.length) {
      c.font = font(F.serif(400, true), 44);
      c.fillStyle = rgba('paper', 0.6 * smoothstep(f.start, f.start + 1, t));
      c.textAlign = 'center';
      c.fillText(chapter === 'close' ? 'the last page' : 'What to do if…', W / 2, H * 0.48);
      c.textAlign = 'left';
    }
    c.font = font(F.mono(500), 13);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('concrete', 0.7);
    c.fillText(`[${chapter}] PLACEHOLDER`, SAFE, H - SAFE + 40);
    c.letterSpacing = '0px';
    drawPageCounter(c, this.ly, t, { chapter, chapterStart: this.ctx.start });
    this.composite2D(this.ui, out);
    return { ...POST_BASE };
  }
}
