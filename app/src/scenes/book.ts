// `book` — "Contents" (intro). docs/TREATMENT.md: a wide shot in smog, the city in haze, one tiny yellow
// coat on a bridge; push in to the child under an overhang in the rain; the drone wakes with a click and
// lights the handbook; the contents page (our typesetting of the thirteen entries); the red numbers lift
// off and fly to the drone's page counter; the camera dives into the first entry.
// Shots (beats from data/audio.json): city 0 → B5 · overhang B5 → B8 · page B8 → B13 (= the chapter end).
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H } from '../engine/gl';
import { F, font, measure } from '../engine/type';
import { clamp, ease, lerp, prog, smoothstep, hash, mulberry32 } from '../engine/util';
import { CONTENTS } from '../contents';
import {
  CityScene, CityBlocks, LitLines, drawChildOver, drawBeam2D, type Tower, LIN, POST_BASE, SAFE, rgba, mixRgba, scaleRGB, mixRGB, smogSky, solid, col3, project,
  drawChild, drawDrone, droneGlow, drawCallout, drawEntry, drawPageNumber, drawPageCounter, drawSystemLine, rain, makeLamp, flicker,
} from './_motifs';

type V3 = [number, number, number];
const v = (a: V3) => new THREE.Vector3(...a);

// the child sits on the bridge deck under the canopy, facing the city (-z)
const CHILD: V3 = [6, 42, -0.6];
const DECK_Y = 42;
const SCREEN_TEXT = 'CURFEW FOR MINORS 22:00 · FOR YOUR SAFETY';

// the contents page, in page units (1000 wide)
const PW_ = 1000, PH_ = 1300;
const PAGE_TOP = 250, PAGE_STEP = 62, PAGE_SIZE = 35, PAGE_X = 70, PAGE_RIGHT = 920;
const TEAR_X = 930; // the torn edge: entries whose page ends in '·' lose their last digit here

export default class Book extends CityScene {
  city!: CityBlocks;
  near = new LitLines();
  fog = new THREE.FogExp2(0x000000, 0.0017);
  screenMat!: THREE.MeshBasicMaterial;

  override init() {
    const fogCol = mixRGB(scaleRGB(LIN.smog2, 0.8), scaleRGB(LIN.smog, 0.72), 0.4);
    this.fog.color = col3(fogCol);
    this.fog.density = 0.00105;
    this.three.fog = this.fog;
    // the city: a canyon of towers beyond the bridge; near ones frame it, megastructures stand far off
    const extra: Tower[] = [
      // the towers the bridge hangs between
      { x: -58, z: 0, w: 24, d: 26, h: 190, y0: -200, shade: 0.1 },
      { x: 70, z: -4, w: 28, d: 30, h: 230, y0: -200, shade: 0.3 },
      // near framing towers (dark, close)
      { x: -150, z: -60, w: 60, d: 50, h: 320, y0: -200, shade: 0 },
      { x: 175, z: -90, w: 70, d: 60, h: 380, y0: -200, shade: 0.05 },
      { x: -240, z: -170, w: 80, d: 60, h: 300, y0: -200, shade: 0.1 },
      { x: 270, z: -230, w: 90, d: 70, h: 420, y0: -200, shade: 0.1 },
      // the tower that carries the public screen
      { x: -72, z: -186, w: 64, d: 30, h: 150, y0: -200, shade: 0.2 },
    ];
    this.city = new CityBlocks({
      seed: 11, count: 300, x0: -1300, x1: 1300, z0: -2200, z1: -120,
      keepOut: (x, z, w) => Math.abs(x - 10) < 60 + w / 2 && z > -420,
      edgeWithin: (tw) => tw.z > -700 && tw.z < -100 && tw.w < 150, edgeFloors: 14,
      extra, color: LIN.shadow, yBase: -200, windowRate: 0.05,
    });
    this.three.add(this.city.mesh);
    // bridge deck, canopy, pillars
    const deckMat = solid(scaleRGB(LIN.deep, 0.9));
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, m = deckMat) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      this.three.add(b);
    };
    add(116, 1.6, 6, 6, DECK_Y - 0.8, 0);
    add(18, 0.5, 7, 7, DECK_Y + 3.6, 0);
    for (const x of [-1.5, 15.5]) for (const z of [-3, 3]) add(0.3, 3.4, 0.3, x, DECK_Y + 1.7, z);
    const L = this.near;
    const conc = LIN.concrete;
    for (const z of [-2.95, 2.95]) {
      L.seg(-46, DECK_Y + 1.05, z, 64, DECK_Y + 1.05, z, conc, 1.2);
      L.seg(-46, DECK_Y + 0.5, z, 64, DECK_Y + 0.5, z, conc, 0.8);
      for (let x = -46; x <= 64; x += 2) L.seg(x, DECK_Y, z, x, DECK_Y + 1.05, z, conc, 0.8);
    }
    for (let x = -46; x < 64; x += 6) {
      for (const z of [-3, 3]) {
        L.seg(x, DECK_Y - 1.6, z, x + 3, DECK_Y - 5, z, conc, 1);
        L.seg(x + 3, DECK_Y - 5, z, x + 6, DECK_Y - 1.6, z, conc, 1);
      }
      L.seg(x, DECK_Y - 5, -3, x + 6, DECK_Y - 5, -3, conc, 1);
      L.seg(x, DECK_Y - 5, 3, x + 6, DECK_Y - 5, 3, conc, 1);
    }
    L.box(7, DECK_Y + 3.35, 0, 18, 0.5, 7, conc, 1.1);
    for (const x of [-1.5, 15.5]) for (const z of [-3, 3]) L.seg(x, DECK_Y, z, x, DECK_Y + 3.35, z, conc, 1);
    for (let x = -46; x <= 64; x += 3) L.seg(x, DECK_Y + 0.01, -2.9, x, DECK_Y + 0.01, 2.9, scaleRGB(conc, 0.6), 0.6);
    // lamp posts on the bridge (sodium)
    for (let x = -40; x <= 60; x += 14) { L.seg(x, DECK_Y, 2.95, x, DECK_Y + 3.2, 2.95, conc, 1); this.posts.push([x, DECK_Y + 3.2, 2.95]); }
    // the street, far below, in the dark haze: sodium points along a few avenues
    const r = mulberry32(5);
    for (let i = 0; i < 700; i++) {
      const av = Math.floor(r() * 6);
      const along = lerp(-2000, 60, r());
      const x = av < 3 ? lerp(-500, 500, av / 2) + (r() - 0.5) * 8 : lerp(-900, 900, r());
      const z = av < 3 ? along : lerp(-1800, -150, (av - 3) / 3) + (r() - 0.5) * 8;
      this.street.push([av < 3 ? x : lerp(-900, 900, r()), -180 + r() * 3, z]);
    }
    // the public screen: a real surface in the city (fogged like everything else)
    const cv = document.createElement('canvas');
    cv.width = 2048; cv.height = 256;
    const c = cv.getContext('2d')!;
    c.fillStyle = rgba('shadow'); c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = rgba('neon', 0.5); c.lineWidth = 6; c.strokeRect(8, 8, cv.width - 16, cv.height - 16);
    const fsz = Math.min(86, (cv.width - 120) / (measure(SCREEN_TEXT, F.mono(600), 100, 8) / 100));
    c.font = font(F.mono(600), fsz); c.letterSpacing = '8px';
    c.fillStyle = rgba('neon'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(SCREEN_TEXT, cv.width / 2, cv.height / 2 + 4);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.screenMat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
    this.screenMat.color.setScalar(1.3);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(84, 10.5), this.screenMat);
    scr.position.set(-66, 62, -170);
    scr.rotation.y = 0.12;
    this.three.add(scr);
  }
  posts: V3[] = [];
  street: V3[] = [];

  page = new ContentsPage(this);

  // ------------------------------------------------------------------ timing
  B = (k: number) => this.au.timeOfBeat(k);

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, B = this.B;
    this.begin();
    const tShot2 = B(5), tZoom0 = B(8) - 0.45, tZoom1 = B(8) + 0.45;
    const post = { ...POST_BASE };
    if (t < tZoom1) this.renderCity(f, out, t < tShot2 ? 1 : 2);
    // the page (from the zoom on): drawn over the city shot, which darkens away
    const pageK = prog(t, tZoom0, tZoom1, ease.inOutCubic);
    if (pageK > 0) this.page.render(f, out, pageK);
    return post;
  }

  // ------------------------------------------------------------------ shots 1 and 2: the city, the overhang
  camFor(t: number, shot: 1 | 2) {
    const cam = this.cam, B = this.B;
    const C = v(CHILD);
    if (shot === 1) {
      const k = prog(t, 0, B(5), (x) => ease.inOutCubic(x) * 0.75 + x * 0.25);
      cam.position.set(lerp(-44, 4.4, k), lerp(60, 44.4, ease.outQuad(k)), lerp(215, 17, k));
      cam.lookAt(lerp(-4, 5.6, k), lerp(50, 42.9, k), lerp(-150, -1, k));
      cam.fov = lerp(40, 31, k);
    } else {
      const k = prog(t, B(5), B(8) + 0.45);
      cam.position.copy(C).add(new THREE.Vector3(0, 1.95 - 0.1 * k, 1.05 - 0.15 * k));
      cam.lookAt(C.clone().add(new THREE.Vector3(-0.1, 0.1, -2.8)));
      cam.fov = 58;
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  renderCity(f: Frame, out: THREE.WebGLRenderTarget, shot: 1 | 2) {
    const { renderer } = this.ctx;
    const t = f.t, B = this.B;
    const cam = this.cam;
    const C = v(CHILD);
    this.camFor(t, shot);
    const sky = smogSky(0);
    this.sky.render(renderer, out, { top: sky.top, horizon: sky.horizon, low: scaleRGB(LIN.smog, 0.18), horizonY: shot === 1 ? 0.5 : 0.12, t, haze: 1.1, shafts: 0.8 });
    this.drawThree(out);
    this.city.edges.emit(this.lines3D, cam, { base: 0.32, fog: 0.0035, alpha: 0.55 });
    this.near.emit(this.lines3D, cam, { base: 0.55, fog: 0.008 });
    this.lines3D.render(renderer, out, cam);
    this.city.emitWindows(this.glow3D, cam, t, { density: 0.0008, gain: 1.6 });
    for (const p of this.street) this.glow3D.add(p[0], p[1], p[2], 1.6, 1.6, LIN.sodium, 1.4 * Math.exp(-Math.hypot(p[0] - cam.position.x, p[1] - cam.position.y, p[2] - cam.position.z) * 0.0016), 3);
    for (const p of this.posts) this.glow3D.add(p[0], p[1], p[2], 0.35, 0.35, LIN.sodium, 2.2, 4);
    this.glow3D.render(renderer, out, cam);

    const w = this.world.ctx;
    const wake = B(5) + 0.35;
    let droneXY = { x: 0, y: 0 }, droneR = 2, lampOn = 0, look: [number, number] = [0, 1];
    if (shot === 1) {
      // the child on the bridge, the drone asleep beside her
      const pf = project(cam, C.x, C.y, C.z), ph = project(cam, C.x, C.y + 1.12, C.z);
      const hPx = Math.max(2, pf.y - ph.y);
      drawChild(w, pf.x, pf.y, hPx, { pose: 'sit', t, shade: 0.1 });
      const pd = project(cam, C.x + 0.5, C.y + 0.1, C.z);
      droneXY = pd; droneR = Math.max(1, hPx * 0.07);
      drawDrone(w, pd.x, pd.y, droneR, { t, lamp: 0, dark: 0.6, tilt: 0 });
    } else {
      // over the shoulder: the hood and sleeves at the bottom, the open handbook in the lap
      this.drawBook2(w, t, prog(t, wake, wake + 0.3));
      const hands: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 770, y: 760 }, { x: 1150, y: 760 }];
      lampOn = clamp(prog(t, wake, wake + 0.12)) * flicker(t, t < wake + 0.45 ? 0.9 : 0.04, 3);
      drawChildOver(w, 960, 1030, 215, { hands, t, lit: lampOn, litSide: -1 });
      const rise = prog(t, wake + 0.1, wake + 1.1, ease.inOutCubic);
      const bob = rise * Math.sin(t * 1.9) * 6;
      droneXY = { x: lerp(672, 600, rise) + Math.sin(t * 0.9) * 4 * rise, y: lerp(880, 410, rise) + bob };
      droneR = lerp(30, 34, rise);
      look = [960 - droneXY.x, 640 - droneXY.y];
      drawBeam2D(w, droneXY.x, droneXY.y, 1000, 650, 0.3, lampOn * 0.55);
      drawDrone(w, droneXY.x, droneXY.y, droneR, { t, lamp: lampOn, look, dark: lampOn > 0 ? 0 : 0.5, tilt: rise > 0 && rise < 1 ? Math.sin(t * 6) * 0.25 * (1 - rise) : undefined });
      if (t > wake - 0.05 && t < wake + 0.6) {
        const k = prog(t, wake - 0.05, wake + 0.6, ease.outCubic);
        w.strokeStyle = rgba('lamp', 0.7 * (1 - k));
        w.lineWidth = 2;
        w.beginPath(); w.arc(droneXY.x, droneXY.y, droneR * (1.2 + k * 3.5), 0, Math.PI * 2); w.stroke();
      }
    }
    this.composite2D(this.world, out);
    droneGlow(this.glow2D, droneXY.x, droneXY.y, droneR, lampOn, look);
    this.glow2D.render(renderer, out);
    rain(this.lines2D, t, {
      count: shot === 1 ? 1200 : 700, alpha: shot === 1 ? 0.12 : 0.16, speed: shot === 1 ? 1300 : 1900, angle: 0.1, seed: shot,
      // in shot 2 the canopy keeps the rain off the child: it falls beyond the railing only
      y1: shot === 1 ? undefined : 420,
      lit: shot === 2 && lampOn > 0 ? (x, y) => clamp(1 - Math.hypot(x - droneXY.x, y - droneXY.y) / 300) * lampOn * 0.5 : undefined,
    });
    this.lines2D.render(renderer, out);
    this.fogSheet.render(renderer, out, { color: scaleRGB(LIN.smog2, 0.5), alpha: shot === 1 ? 0.2 : 0.1, y0: 0.35, y1: 1, t, scale: 0.9 });

    const u = this.ui.ctx;
    if (shot === 2) {
      drawCallout(u, t, { ax: 1085, ay: 560, lx: 1300, ly: 400, side: 1, text: ['HANDBOOK · CHILDREN’S SAFETY', 'PRINTED ON PAPER'], at: B(6), size: 19, plate: 0.55 });
    }
    this.composite2D(this.ui, out);
  }

  /** The open handbook in the lap, seen over the shoulder (screen px; the page zoom starts from its right page). */
  drawBook2(c: CanvasRenderingContext2D, t: number, lamp: number) {
    const bl = { x: 735, y: 760 }, br = { x: 1185, y: 760 }, tl = { x: 805, y: 525 }, tr = { x: 1115, y: 525 };
    const sb = { x: 960, y: 772 }, st = { x: 960, y: 530 };
    c.save();
    // cover edge
    c.fillStyle = rgba('red', 0.55);
    c.beginPath(); c.moveTo(bl.x - 8, bl.y + 8); c.lineTo(br.x + 8, br.y + 8); c.lineTo(tr.x + 6, tr.y - 2); c.lineTo(tl.x - 6, tl.y - 2); c.closePath(); c.fill();
    const pageFill = (a: typeof bl, b: typeof bl, cc: typeof bl, d: typeof bl) => {
      const g = c.createLinearGradient(640, 420, 1100, 760);
      g.addColorStop(0, mixRgba('paper', 'lamp', 0.3 * lamp));
      g.addColorStop(1, mixRgba('paper', 'shadow', 0.62 - 0.35 * lamp));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo((a.x + b.x) / 2, a.y - 8, b.x, b.y); c.lineTo(cc.x, cc.y); c.quadraticCurveTo((cc.x + d.x) / 2, cc.y - 6, d.x, d.y); c.closePath(); c.fill();
    };
    pageFill(bl, sb, st, tl);
    pageFill(sb, br, tr, st);
    // left page: the title in the handbook's italic
    const P = (a: typeof bl, b: typeof bl, cc: typeof bl, d: typeof bl, u: number, vv: number) => ({ x: lerp(lerp(d.x, cc.x, u), lerp(a.x, b.x, u), vv), y: lerp(lerp(d.y, cc.y, u), lerp(a.y, b.y, u), vv) });
    const tp = P(bl, sb, st, tl, 0.5, 0.35);
    c.font = font(F.serif(600, true), 26);
    c.fillStyle = rgba('ink', 0.75);
    c.textAlign = 'center';
    c.fillText('What to do if…', tp.x, tp.y);
    c.textAlign = 'left';
    // right page: the contents in miniature
    for (let i = 0; i < 13; i++) {
      const vv = 0.12 + i * 0.062;
      const a = P(sb, br, tr, st, 0.1, vv), b = P(sb, br, tr, st, 0.8, vv), n = P(sb, br, tr, st, 0.9, vv);
      c.strokeStyle = rgba('ink', 0.55);
      c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(lerp(a.x, b.x, 0.45 + 0.35 * hash(i, 2)), lerp(a.y, b.y, 0.5)); c.stroke();
      c.fillStyle = rgba('ink', 0.4);
      for (let k = 0.62; k < 0.97; k += 0.06) c.fillRect(lerp(a.x, b.x, k), lerp(a.y, b.y, k) - 1, 1.5, 1.5);
      c.fillStyle = rgba('red', 0.85);
      c.fillRect(n.x - 3, n.y - 4, 7, 5);
    }
    c.restore();
  }
}

/** The contents page: typeset by us, lit by the lamp, held in two yellow sleeves. */
class ContentsPage {
  lines: { y: number; num: { x: number; y: number } }[] = [];
  constructor(private s: Book) {}
  build() {}

  /** Page -> screen transform at t (k: the zoom from the shot-2 book, 0..1). */
  transform(t: number, k: number) {
    const B = this.s.B;
    const s1 = 0.84;
    // the book's spot in shot 2 (approx.; the page grows out of it)
    const x = lerp(1045, 960, k), y = lerp(640, 548, k);
    const sc = lerp(0.19, s1, k) * (1 + 0.025 * prog(t, B(8), B(12)));
    const rot = lerp(0, -1.2, k);
    let m = new DOMMatrix().translate(x, y).rotate(rot).scale(sc).translate(-PW_ / 2, -PH_ * 0.47);
    // the dive: zoom into the ink of the first entry's LOST
    const dive = prog(t, B(12), B(13));
    if (dive > 0) {
      const tp = this.diveTarget();
      const p = m.transformPoint(new DOMPoint(tp.x, tp.y));
      const z = Math.exp(Math.log(500) * Math.pow(dive, 2.2));
      const cx = lerp(p.x, W / 2, ease.inOutCubic(Math.min(1, dive * 1.4)));
      const cy = lerp(p.y, H / 2, ease.inOutCubic(Math.min(1, dive * 1.4)));
      m = new DOMMatrix().translate(cx, cy).scale(z).translate(-p.x, -p.y).multiply(m);
    }
    return m;
  }
  /** A point inside the stroke of the O of LOST (first entry), in page units. */
  diveTarget() {
    const fam = F.archivo(62, 900);
    // same spacing rule as drawEntry (word widths + 1.05 spaces)
    const sp = measure(' ', fam, PAGE_SIZE) * 1.05;
    const x0 = PAGE_X + measure('YOU', fam, PAGE_SIZE) + measure('ARE', fam, PAGE_SIZE) + 2 * sp + measure('L', fam, PAGE_SIZE);
    return { x: x0 + measure('O', fam, PAGE_SIZE) * 0.13, y: PAGE_TOP - PAGE_SIZE * 0.37 };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget, k: number) {
    const s = this.s, t = f.t, B = s.B;
    const { renderer } = s.sctx;
    // background: the dark of the lap, faded in over the city shot
    const c = s.ui.ctx;
    s.ui.clear();
    c.fillStyle = rgba('shadow', smoothstep(0.1, 0.8, k));
    c.fillRect(0, 0, W, H);
    const m = this.transform(t, k);
    const lift = B(11), land = lift + 0.42;
    // sleeves holding the page (coat yellow), behind the paper's lower corners
    c.save();
    c.setTransform(m);
    c.fillStyle = mixRgba('coat', 'shadow', 0.35);
    for (const sx of [-1, 1]) {
      c.beginPath();
      const x = sx < 0 ? -40 : PW_ + 40;
      c.moveTo(x - sx * 120, PH_ + 260);
      c.bezierCurveTo(x - sx * 60, PH_ * 0.88, x + sx * 30, PH_ * 0.78, x + sx * 10, PH_ * 0.7);
      c.bezierCurveTo(x + sx * 160, PH_ * 0.72, x + sx * 240, PH_ * 0.9, x + sx * 260, PH_ + 260);
      c.closePath();
      c.fill();
    }
    // the paper, torn at the lower right (like the photo, the last numbers are cut off)
    const firstCut = CONTENTS.findIndex((e) => e.page.includes('·'));
    const yCut = PAGE_TOP + (firstCut - 0.5) * PAGE_STEP;
    const paper = new Path2D();
    paper.moveTo(0, 0); paper.lineTo(PW_, 0); paper.lineTo(PW_, yCut - 30);
    for (let i = 0; i <= 12; i++) paper.lineTo(lerp(PW_, TEAR_X, Math.min(1, i / 3)) + (hash(i, 3) - 0.5) * 10, yCut - 30 + i * 12);
    for (let i = 0; i <= 30; i++) paper.lineTo(TEAR_X + (hash(i, 9) - 0.5) * 9 - i * 0.25, yCut + 114 + i * ((PH_ - yCut - 114) / 30));
    paper.lineTo(0, PH_); paper.closePath();
    // lamp pool from the upper right
    const g = c.createRadialGradient(PW_ * 0.72, PH_ * 0.12, 40, PW_ * 0.6, PH_ * 0.35, PH_ * 0.95);
    g.addColorStop(0, mixRgba('paper', 'lamp', 0.35));
    g.addColorStop(0.55, rgba('paper'));
    g.addColorStop(1, mixRgba('paper', 'smog', 0.55));
    c.fillStyle = g;
    c.fill(paper);
    c.save();
    c.clip(paper);
    // header (the handbook's own voice: thin caps, like the photographed page) + the footnote's star
    c.font = font(F.archivo(100, 300), 34);
    c.letterSpacing = '6px';
    c.fillStyle = rgba('ink', 0.78);
    c.textAlign = 'center';
    c.fillText('WHAT TO DO IF…', PW_ / 2, 150);
    c.textAlign = 'left';
    c.letterSpacing = '0px';
    c.fillStyle = rgba('red', 0.9);
    c.font = font(F.archivo(100, 500), 30);
    c.fillText('*', PW_ / 2 + measure('WHAT TO DO IF…', F.archivo(100, 300), 34, 6) / 2 + 6, 138);
    // the thirteen entries
    this.lines = [];
    CONTENTS.forEach((e, i) => {
      const y = PAGE_TOP + i * PAGE_STEP;
      const flown = t >= lift + i * 0.025;
      const geo = drawEntry(c, s.sctx.lyrics, s.sctx.audio, e.line, t, {
        x: PAGE_X, y, width: PAGE_RIGHT - PAGE_X, size: PAGE_SIZE, theme: 'paper', printed: true, noNumber: flown, numberClip: 'frame',
      });
      this.lines.push({ y, num: { x: geo.numRight, y: geo.lastY } });
    });
    // footnote, typed in mono
    const note = '* they say if you remove the page numbers, it reads like a song.';
    const nn = Math.floor(Math.max(0, t - B(9)) * 48);
    c.font = font(F.mono(400), 21);
    c.fillStyle = rgba('ink', 0.72);
    c.fillText(note.slice(0, nn), PAGE_X, PAGE_TOP + 13 * PAGE_STEP + 40);
    if (nn > 0 && nn < note.length) {
      c.fillRect(PAGE_X + measure(note.slice(0, nn), F.mono(400), 21) + 2, PAGE_TOP + 13 * PAGE_STEP + 40 - 17, 11, 21);
    }
    c.restore();
    // torn edge: a slightly darker fibre line
    c.strokeStyle = rgba('ink', 0.18);
    c.lineWidth = 1.5;
    c.stroke(paper);
    c.restore();

    // the drone over the page (upper right), its light on the paper
    const dp = { x: 1510 + Math.sin(t * 0.9) * 6, y: 300 + Math.sin(t * 1.9) * 8 };
    const dive = prog(t, B(12), B(13));
    const pa = smoothstep(0.5, 1, k) * (1 - smoothstep(0, 0.25, dive));
    if (pa > 0) {
      drawDrone(c, dp.x, dp.y, 26, { t, lamp: 1, look: [-0.8, 0.5], alpha: pa });
    }
    // the translation note on the header
    const hdr = m.transformPoint(new DOMPoint(PW_ / 2 + 170, 140));
    drawCallout(c, t, { ax: hdr.x, ay: hdr.y, lx: hdr.x + 250, ly: hdr.y - 50, text: ['TITLE, TRANSLATED:', 'WHAT TO DO IF…'], at: B(8) + 0.25, out: B(11) - 0.4, size: 18, alpha: pa, plate: 0.5 });

    // the red numbers lift off and fly to the page counter
    const cnt = { x: W - SAFE, y: 70 + 124 * 0.74 };
    this.lines.forEach((ln, i) => {
      const t0 = lift + i * 0.045, t1 = t0 + 0.42;
      if (t < t0 || t > t1 + 0.05) return;
      const p0 = m.transformPoint(new DOMPoint(ln.num.x, ln.num.y));
      const u = prog(t, t0, t1, ease.inOutCubic);
      const ctrl = { x: lerp(p0.x, cnt.x, 0.3), y: Math.min(p0.y, cnt.y) - 160 };
      const x = (1 - u) ** 2 * p0.x + 2 * (1 - u) * u * ctrl.x + u * u * cnt.x;
      const y = (1 - u) ** 2 * p0.y + 2 * (1 - u) * u * ctrl.y + u * u * cnt.y;
      const ps = PAGE_SIZE * Math.hypot(m.a, m.b);
      const size = i === 0 ? lerp(ps, 124, u * u) : lerp(ps, ps * 0.6, u);
      drawPageNumber(c, CONTENTS[i]!.page, x, y, size, { alpha: i === 0 ? 1 - smoothstep(0.9, 1, u) : 1 - smoothstep(0.55, 0.95, u), clip: 'frame' });
    });
    // the counter: it is born from the numbers
    if (t >= land - 0.1) {
      drawPageCounter(c, s.sctx.lyrics, t, { page: '22', prev: null, since: land - 0.1 });
    }
    // the dive ends in the ink
    if (dive > 0.8) { c.fillStyle = rgba('ink', smoothstep(0.8, 0.98, dive)); c.fillRect(0, 0, W, H); drawPageCounter(c, s.sctx.lyrics, t, { page: '22', prev: null, since: land - 0.1 }); }
    s.composite2D(s.ui, out);
    s.glow2D.clear();
    if (pa > 0) { droneGlow(s.glow2D, dp.x, dp.y, 26, pa, [-0.8, 0.5]); }
    const fl = t >= land ? Math.pow(0.5, (t - land) / 0.12) : 0;
    if (fl > 0.02) s.glow2D.add(cnt.x - 60, cnt.y - 44, 0, 120, 70, LIN.red, 0.4 * fl, 2);
    s.glow2D.render(renderer, out);
  }
}
