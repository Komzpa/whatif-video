// `book` — "Contents" (intro). docs/TREATMENT.md: a wide shot in smog, the city in haze, one tiny yellow
// coat on a bridge; push in to the child under an overhang in the rain; the drone wakes with a click and
// lights the handbook; the contents page (our typesetting of the thirteen entries); the red numbers lift
// off and fly to the drone's page counter; the camera dives into the first entry.
// Shots (beats from data/audio.json): city 0 → B5 · overhang B5 → B8 · page B8 → B13 (= the chapter end).
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H } from '../engine/gl';
import { F, font, measure } from '../engine/type';
import { clamp, ease, keys, lerp, prog, smoothstep, hash, mulberry32 } from '../engine/util';
import { CONTENTS, INTRO } from '../contents';
import {
  CityScene, CityBlocks, LitLines, drawChildBack, drawBeam2D, type Tower, LIN, POST_BASE, SAFE, rgba, mixRgba, scaleRGB, mixRGB, smogSky, solid, col3, project,
  drawChild, drawDrone, droneGlow, drawCallout, drawEntry, drawPageNumber, drawPageCounter, rain, flicker, printedLine, NeonSign, FogCards, LightShafts, GlowBatch,
} from './_motifs';

type V3 = [number, number, number];
const v = (a: V3) => new THREE.Vector3(...a);

// the child sits on the bridge deck under the canopy, facing the city (-z)
const CHILD: V3 = [6, 42, -0.6];
const DECK_Y = 42;
const GROUND = -60; // the street at the bottom of the canyon (wet)
// megablock 7: the huge slab the MEGABLOCK callout points at
const MEGA = { x: -250, z: -820, w: 280, d: 150, h: 880 };

// the contents page, in page units (1000 wide): the introduction row, the header, the thirteen entries
const PW_ = 1000, PH_ = 1300;
const INTRO_Y = 118, HEAD_Y = 212;
const PAGE_TOP = 290, PAGE_STEP = 61, PAGE_SIZE = 35, PAGE_X = 70, PAGE_RIGHT = 920;
const TEAR_X = 930; // the torn edge: entries whose page ends in '·' lose their last digit here

// the city speaks: signs at different depths (TREATMENT: every sign has something to say)
const SIGNS: ConstructorParameters<typeof NeonSign>[0][] = [
  { lines: ['CURFEW FOR MINORS 22:00 · FOR YOUR SAFETY'], pos: [-66, 62, -170.4], height: 3.8, rotY: 0.12, kind: 'screen', bright: 1.5, flicker: 0.05, seed: 2 },
  { lines: ['LOST CHILDREN · REPORT TO ANY TERMINAL'], wall: 'left', pos: [-50, -47, 150], height: 3.6, rotY: 1.2, groundY: GROUND, bright: 1.8, flicker: 0.12, seed: 3 },
  { lines: ['NO LOITERING'], vertical: true, wall: 'left', pos: [-50, -18, -48], height: 34, rotY: 1.15, groundY: GROUND, bright: 1.7, flicker: 0.06, seed: 4 },
  { lines: ['AIR QUALITY: POOR · BREATHE LESS'], wall: 'right', pos: [70, -32, -112], height: 5.5, rotY: -1.1, kind: 'screen', groundY: GROUND, color: 'sodium', bright: 1.3, flicker: 0.04, seed: 5 },
  { lines: ['SMILE · YOU ARE ON CAMERA'], wall: 'left', pos: [-50, -36, -236], height: 4.6, rotY: 1.1, groundY: GROUND, bright: 1.8, flicker: 0.2, seed: 6 },
  { lines: ['YOUR RATING: 4.2', 'KEEP IT UP'], wall: 'right', pos: [70, 18, -300], height: 13, rotY: -1.0, kind: 'screen', groundY: GROUND, bright: 1.4, flicker: 0.05, seed: 7 },
  { lines: ['QUIET HOURS 22:00–06:00'], wall: 'right', pos: [70, -26, -540], height: 7, rotY: -0.95, groundY: GROUND, bright: 1.8, flicker: 0.08, seed: 8 },
  { lines: ['MEGABLOCK 7'], pos: [MEGA.x, 470, MEGA.z + MEGA.d / 2 + 1], height: 34, bright: 1.6, flicker: 0.03, seed: 9 },
];

export default class Book extends CityScene {
  city!: CityBlocks;
  near = new LitLines();
  fog = new THREE.FogExp2(0x000000, 0.0006);
  signs: NeonSign[] = [];
  reflScene = new THREE.Scene();
  glowRefl = new GlowBatch(4000, { screen2D: false, depthTest: false });
  fogCards = new FogCards();
  shafts = new LightShafts();
  posts: V3[] = [];
  street: V3[] = [];
  curfew!: NeonSign;

  override init() {
    const fogCol = mixRGB(scaleRGB(LIN.smog2, 0.75), scaleRGB(LIN.smog, 0.7), 0.45);
    this.fog.color = col3(fogCol);
    this.three.fog = this.fog;
    this.reflScene.fog = this.fog;
    // the city: a canyon of towers beyond the bridge, walls lining the street below, megastructures far off
    const extra: Tower[] = [
      // the towers the bridge hangs between
      { x: -58, z: 0, w: 24, d: 26, h: 250, y0: GROUND, shade: 0.1 },
      { x: 70, z: -4, w: 28, d: 30, h: 290, y0: GROUND, shade: 0.3 },
      // near framing towers (dark, close)
      { x: -150, z: -60, w: 60, d: 50, h: 380, y0: GROUND, shade: 0 },
      { x: 175, z: -90, w: 70, d: 60, h: 440, y0: GROUND, shade: 0.05 },
      { x: -240, z: -170, w: 80, d: 60, h: 360, y0: GROUND, shade: 0.1 },
      { x: 270, z: -230, w: 90, d: 70, h: 480, y0: GROUND, shade: 0.1 },
      // the tower that carries the public screen
      { x: -72, z: -186, w: 64, d: 30, h: 210, y0: GROUND, shade: 0.2 },
      // megablock 7
      { x: MEGA.x, z: MEGA.z, w: MEGA.w, d: MEGA.d, h: MEGA.h, y0: GROUND, shade: 0.15 },
    ];
    // the canyon's walls: the street runs along z under the bridge (x from -50 to 70)
    const rw = mulberry32(21);
    for (let z = 190; z > -700; z -= 70 + rw() * 30) {
      if (Math.abs(z) < 30) continue;
      extra.push({ x: -64 - rw() * 4, z, w: 28, d: 60 + rw() * 20, h: 90 + rw() * 200, y0: GROUND, shade: rw() * 0.4 });
      extra.push({ x: 84 + rw() * 4, z: z - 30, w: 28, d: 60 + rw() * 20, h: 90 + rw() * 220, y0: GROUND, shade: rw() * 0.4 });
    }
    this.city = new CityBlocks({
      seed: 11, count: 340, x0: -1400, x1: 1400, z0: -2400, z1: -120,
      keepOut: (x, z, w) => Math.abs(x - 10) < 60 + w / 2 && z > -760,
      edgeWithin: (tw) => tw.z > -700 && tw.z < -100 && tw.w < 150, edgeFloors: 14,
      extra, color: LIN.shadow, yBase: GROUND, windowRate: 0.07, mega: 6,
    });
    // megablock 7's own spine of light and its beacon
    for (let y = GROUND + 8; y < GROUND + MEGA.h; y += 3.2) this.city.strips.push({ x: MEGA.x + 60, y, z: MEGA.z + MEGA.d / 2 + 0.6, rgb: LIN.sodium, seed: y });
    this.city.beacons.push({ x: MEGA.x, y: GROUND + MEGA.h + 6, z: MEGA.z, seed: 0.3 });
    this.three.add(this.city.mesh);
    // the wet street: dark and translucent, so the mirrored signs show through it
    const gm = solid(scaleRGB(LIN.shadow, 0.9), { transparent: true, opacity: 0.72 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3400), gm);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, GROUND, -1300);
    this.three.add(ground);
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
    // the street below: sodium lamps along both kerbs, far avenues beyond
    for (let z = 280; z > -1600; z -= 24) for (const x of [-42, 62]) { this.street.push([x, GROUND + 7, z]); L.seg(x, GROUND, z, x, GROUND + 7, z, scaleRGB(conc, 0.7), 0.8); }
    const r = mulberry32(5);
    for (let i = 0; i < 700; i++) {
      const av = Math.floor(r() * 6);
      const along = lerp(-2400, -700, r());
      const x = av < 3 ? lerp(-600, 600, av / 2) + (r() - 0.5) * 8 : lerp(-1200, 1200, r());
      const z = av < 3 ? along : lerp(-2200, -760, (av - 3) / 3) + (r() - 0.5) * 8;
      this.street.push([x, GROUND + 3, z]);
    }
    // signs (and their reflections in the wet street)
    for (const o of SIGNS) {
      const sg = new NeonSign(o);
      this.signs.push(sg);
      this.three.add(sg.mesh);
      if (sg.refl) this.reflScene.add(sg.refl);
    }
    this.curfew = this.signs[0]!;
    // layered haze: cool and dark near, amber and bright far (atmospheric depth)
    const fc = this.fogCards;
    fc.add({ z: 120, w: 700, y0: GROUND, y1: 160, color: scaleRGB(LIN.fog, 0.9), alpha: 0.22, scale: 0.012, seed: 1, high: 60 });
    fc.add({ z: -60, w: 1400, y0: GROUND, y1: 300, color: mixRGB(LIN.fog, LIN.smog, 0.35), alpha: 0.26, scale: 0.008, seed: 2, high: 120 });
    fc.add({ z: -260, w: 2200, y0: GROUND, y1: 500, color: mixRGB(LIN.fog, LIN.smog, 0.7), alpha: 0.3, scale: 0.005, seed: 3, high: 220 });
    fc.add({ z: -520, w: 2800, y0: GROUND, y1: 700, color: scaleRGB(LIN.smog, 0.8), alpha: 0.34, scale: 0.0035, seed: 4, high: 330 });
    fc.add({ z: -950, w: 3600, y0: GROUND, y1: 1000, color: mixRGB(LIN.smog, LIN.smog2, 0.4), alpha: 0.38, scale: 0.0025, seed: 5, high: 480 });
    fc.add({ z: -1650, w: 5000, y0: GROUND, y1: 1300, color: scaleRGB(LIN.smog2, 0.9), alpha: 0.42, scale: 0.0018, seed: 6, high: 700 });
    // light through gaps in the smog
    const sh = this.shafts, sc = mixRGB(LIN.smog2, LIN.paper, 0.2);
    sh.add({ top: [-340, 900, -700], dir: [0.34, -1, 0.22], length: 1200, width: 30, spread: 1.6, color: sc, intensity: 0.2, seed: 1 });
    sh.add({ top: [-120, 900, -1100], dir: [0.3, -1, 0.3], length: 1250, width: 45, spread: 1.4, color: sc, intensity: 0.16, seed: 2 });
    sh.add({ top: [180, 850, -560], dir: [0.26, -1, 0.35], length: 1000, width: 18, spread: 2.0, color: sc, intensity: 0.22, seed: 3 });
    sh.add({ top: [420, 950, -1400], dir: [0.3, -1, 0.2], length: 1300, width: 60, spread: 1.2, color: sc, intensity: 0.14, seed: 4 });
    // the flying car's searchlight (moved every frame)
    sh.add({ top: [0, 0, 0], dir: [0.12, -1, 0.08], length: 150, width: 1.6, spread: 5, color: mixRGB(LIN.concrete, LIN.paper, 0.6), intensity: 0.35, seed: 5, fog: 0.001 });
  }

  page = new ContentsPage(this);

  // ------------------------------------------------------------------ timing
  B = (k: number) => this.au.timeOfBeat(k);

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, B = this.B;
    this.begin();
    const tShot2 = B(6), tZoom0 = B(9) - 0.45, tZoom1 = B(9) + 0.45;
    if (t < tZoom1) this.renderCity(f, out, t < tShot2 ? 1 : 2);
    // the page (from the zoom on): drawn over the city shot, which darkens away
    const pageK = prog(t, tZoom0, tZoom1, ease.inOutCubic);
    if (pageK > 0) this.page.render(f, out, pageK);
    return { ...POST_BASE };
  }

  /** The flying car: crosses the canyon slowly, high up, the whole wide shot. */
  carPos(t: number): V3 { return [lerp(-420, 300, t / this.B(6)), 112 + Math.sin(t * 0.7) * 1.5, -250]; }

  // ------------------------------------------------------------------ shots 1 and 2: the city, the overhang
  camFor(t: number, shot: 1 | 2) {
    const cam = this.cam, B = this.B;
    const C = v(CHILD);
    if (shot === 1) {
      // a crane up out of the street and a dolly in over the bridge: the deck sweeps down through frame
      const k = prog(t, 0, B(6), (x) => ease.inOutQuad(x) * 0.8 + x * 0.2);
      const y = keys(k, [[0, -44], [0.45, 6, ease.inOutQuad], [0.78, 39, ease.inOutQuad], [1, 43.5, ease.outQuad]]);
      const z = keys(k, [[0, 260], [0.5, 110], [0.8, 40], [1, 17]]);
      const x = keys(k, [[0, -18], [0.6, 0], [1, 4.4]]);
      cam.position.set(x, y, z);
      const pitch = keys(k, [[0, 0.2], [0.45, 0.16], [0.8, 0.04], [1, -0.06]]);
      const yaw = keys(k, [[0, 0.07], [0.6, -0.03], [1, -0.07]]);
      cam.lookAt(x + Math.sin(yaw) * 100, y + Math.tan(pitch) * 100, z - Math.cos(yaw) * 100);
      cam.fov = lerp(46, 32, ease.inOutQuad(k));
    } else {
      // behind and above the child, looking over the shoulder at the book and out to the city
      const k = prog(t, B(6), B(9) + 0.45);
      cam.position.copy(C).add(new THREE.Vector3(-0.3 + 0.1 * k, 1.75 - 0.08 * k, 1.3 - 0.15 * k));
      cam.lookAt(C.clone().add(new THREE.Vector3(0.2, 0.9, -3)));
      cam.fov = 50;
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
    this.sky.render(renderer, out, { top: sky.top, horizon: sky.horizon, low: scaleRGB(LIN.smog, 0.3), horizonY: shot === 1 ? 0.5 : 0.25, t, haze: 1.1, shafts: 0.6 });
    // reflections in the wet street (under the translucent ground)
    for (const sg of this.signs) sg.update(t);
    renderer.setRenderTarget(out); renderer.clearDepth(); renderer.render(this.reflScene, cam);
    const gr = this.glowRefl; gr.clear();
    const cp = cam.position;
    for (const p of this.street) {
      if (p[2] < -700) continue;
      const fk = Math.exp(-Math.hypot(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z) * 0.0012);
      gr.add(p[0], 2 * GROUND - p[1] + 1, p[2], 1.4, 6, LIN.sodium, 0.55 * fk, 2.5);
    }
    for (const sg of this.signs) sg.glow(gr);
    gr.render(renderer, out, cam);
    this.drawThree(out);
    this.city.edges.emit(this.lines3D, cam, { base: 0.3, fog: 0.003, alpha: 0.5 });
    this.near.emit(this.lines3D, cam, { base: 0.55, fog: 0.006 });
    this.lines3D.render(renderer, out, cam);
    // lights: thousands of windows, the megastructures' spines, streetlamps, cars, the flying car
    const g = this.glow3D;
    this.city.emitWindows(g, cam, t, { density: 0.0006, gain: 1.7 });
    this.city.emitStrips(g, cam, t, { density: 0.0005, gain: 1.2 });
    for (const p of this.street) g.add(p[0], p[1], p[2], 1.3, 1.3, LIN.sodium, 1.6 * Math.exp(-Math.hypot(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z) * 0.0012), 3);
    for (const p of this.posts) g.add(p[0], p[1], p[2], 0.35, 0.35, LIN.sodium, 2.2, 4);
    for (let i = 0; i < 14; i++) {
      // traffic on the canyon street: sodium heads towards us, dim neon tails away
      const lane = i % 2, sp = 26 + 9 * hash(i, 4);
      const z = ((hash(i, 2) * 1900 + t * sp * (lane ? 1 : -1)) % 1900 + 1900) % 1900 - 1600;
      const x = lane ? 18 : 2;
      const fk = Math.exp(-Math.hypot(x - cp.x, GROUND - cp.y, z - cp.z) * 0.0012);
      for (const dx of [-0.8, 0.8]) g.add(x + dx, GROUND + 0.8, z, 0.5, 0.35, lane ? mixRGB(LIN.lamp, LIN.paper, 0.5) : LIN.neon, (lane ? 2.4 : 1.2) * fk, 4);
    }
    for (const sg of this.signs) sg.glow(g, 0.6);
    if (shot === 1) {
      const [vx, vy, vz] = this.carPos(t);
      g.add(vx + 3, vy, vz, 0.9, 0.5, mixRGB(LIN.paper, LIN.concrete, 0.2), 3.5, 4);
      g.add(vx + 3, vy - 0.4, vz + 1.2, 0.9, 0.5, mixRGB(LIN.paper, LIN.concrete, 0.2), 3.5, 4);
      g.add(vx, vy - 0.6, vz, 4, 0.5, LIN.sodium, 1.2, 3);
      if ((t % 0.9) < 0.12) g.add(vx - 3, vy + 0.4, vz, 1.2, 1.2, LIN.neon, 3, 4);
      const sm = this.shafts.mats[4]!;
      (sm.uniforms.top!.value as THREE.Vector3).set(vx + 1, vy - 0.8, vz);
    }
    g.render(renderer, out, cam);
    // haze layers over everything behind them, then the light through the smog
    this.fogCards.render(renderer, out, cam, t, shot === 1 ? 1 : 0.7);
    this.shafts.render(renderer, out, cam, t, shot === 1 ? 1 : 0.5);

    const w = this.world.ctx;
    const wake = B(6) + 0.3;
    let droneXY = { x: 0, y: 0 }, droneR = 2, lampOn = 0, look: [number, number] = [0, 1];
    const u = this.ui.ctx;
    if (shot === 1) {
      // the child on the bridge, the drone asleep at her shoulder
      const pf = project(cam, C.x, C.y, C.z), ph = project(cam, C.x, C.y + 1.12, C.z);
      const hPx = Math.max(2, pf.y - ph.y);
      drawChild(w, pf.x, pf.y, hPx, { pose: 'sit', t, shade: 0.1 });
      const pd = project(cam, C.x + 0.42, C.y + 0.62, C.z);
      droneXY = pd; droneR = Math.max(1.5, hPx * 0.12);
      drawDrone(w, pd.x, pd.y, droneR, { t, lamp: 0.35, dark: 0.2, tilt: 0 });
      lampOn = 0.3; look = [0.2, 0.5];
      // the drone's callouts: what the viewer is looking at
      const CO = { size: 20, plate: 0.62 } as const;
      const mg = project(cam, MEGA.x + 60, 330, MEGA.z + MEGA.d / 2);
      drawCallout(u, t, { ...CO, ax: mg.x, ay: mg.y, lx: clamp(mg.x + 140, SAFE, W - SAFE - 470), ly: clamp(mg.y - 110, SAFE + 40, H - SAFE), text: ['MEGABLOCK 7 · 41 000 RESIDENTS'], at: 0.8, out: 4.1 });
      const sp = project(cam, this.curfew.pos.x + this.curfew.w * 0.3, this.curfew.pos.y - this.curfew.h * 0.5, this.curfew.pos.z);
      drawCallout(u, t, { ...CO, ax: sp.x, ay: sp.y, lx: clamp(sp.x + 150, SAFE, W - SAFE - 200), ly: clamp(sp.y + 110, SAFE + 40, H - SAFE - 40), text: 'CURFEW SIGN', at: 1.7, out: 3.9 });
      if (!ph.behind) {
        drawCallout(u, t, { ...CO, ax: ph.x - hPx * 0.1, ay: ph.y + hPx * 0.3, lx: ph.x - 170, ly: ph.y - 110, side: -1, text: 'YOU', at: 3.3, color: 'coat' });
        drawCallout(u, t, { ...CO, ax: pd.x, ay: pd.y, lx: pd.x + 180, ly: pd.y - 150, text: ['GUIDE DRONE · BATTERY 64%'], at: 3.85 });
      }
    } else {
      // behind the child: the hood, the shoulders, two hands holding the open handbook in the lamp
      const lampT = prog(t, wake, wake + 0.12) * flicker(t, t < wake + 0.45 ? 0.9 : 0.04, 3);
      lampOn = clamp(lampT);
      const hood = { x: 800, y: 770, s: 100 };
      this.drawBook2(w, t, lampOn);
      const hands: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 740, y: 652 }, { x: 1070, y: 640 }];
      // the drone: asleep on the left shoulder, wakes with a click, rises to hover at the shoulder
      const rise = prog(t, wake + 0.1, wake + 0.9, ease.inOutCubic);
      droneXY = { x: lerp(640, 560, rise) + Math.sin(t * 0.9) * 5 * rise, y: lerp(815, 560, rise) + rise * Math.sin(t * 1.9) * 7 };
      droneR = 42;
      look = [905 - droneXY.x, 590 - droneXY.y];
      drawChildBack(w, hood.x, hood.y, hood.s, { hands, t, lit: lampOn, litFrom: droneXY, shade: 0.2 });
      drawBeam2D(w, droneXY.x, droneXY.y, 910, 590, 0.26, lampOn * 0.5);
      drawDrone(w, droneXY.x, droneXY.y, droneR, { t, lamp: 0.08 + lampOn * 0.92, look, dark: lampOn > 0 ? 0 : 0.35, tilt: rise > 0 && rise < 1 ? Math.sin(t * 6) * 0.25 * (1 - rise) : undefined });
      if (t > wake - 0.05 && t < wake + 0.6) {
        const k = prog(t, wake - 0.05, wake + 0.6, ease.outCubic);
        w.strokeStyle = rgba('lamp', 0.7 * (1 - k));
        w.lineWidth = 2;
        w.beginPath(); w.arc(droneXY.x, droneXY.y, droneR * (1.2 + k * 3.5), 0, Math.PI * 2); w.stroke();
      }
      drawCallout(u, t, { ax: 1092, ay: 676, lx: 1230, ly: 790, side: 1, text: ['HANDBOOK · CHILDREN’S SAFETY', 'PRINTED ON PAPER'], at: B(7), size: 20, plate: 0.6 });
      drawCallout(u, t, { ax: 780, ay: 515, lx: 560, ly: 370, side: -1, text: ['INTRODUCTION · P. 12', 'PRINTED: ВВЕДЕНИЕ'], at: B(7) + 0.5, size: 20, plate: 0.6 });
    }
    this.composite2D(this.world, out);
    droneGlow(this.glow2D, droneXY.x, droneXY.y, droneR, lampOn, look);
    this.glow2D.render(renderer, out);
    rain(this.lines2D, t, {
      count: shot === 1 ? 1300 : 700, alpha: shot === 1 ? 0.13 : 0.16, speed: shot === 1 ? 1300 : 1900, angle: 0.1, seed: shot,
      // in shot 2 the canopy keeps the rain off the child: it falls beyond the railing only
      y1: shot === 1 ? undefined : 380,
      lit: shot === 2 && lampOn > 0 ? (x, y) => clamp(1 - Math.hypot(x - droneXY.x, y - droneXY.y) / 300) * lampOn * 0.5 : undefined,
    });
    this.lines2D.render(renderer, out);
    this.fogSheet.render(renderer, out, { color: scaleRGB(LIN.smog2, 0.5), alpha: shot === 1 ? 0.1 : 0.08, y0: 0.45, y1: 1, t, scale: 0.9 });
    this.composite2D(this.ui, out);
  }

  /** The open handbook held up in two hands, seen over the shoulder (screen px). Left page: the
   *  introduction (p. 12); right page: the contents, which the page zoom grows out of. */
  drawBook2(c: CanvasRenderingContext2D, t: number, lamp: number) {
    const bl = { x: 716, y: 684 }, br = { x: 1090, y: 672 }, tl = { x: 752, y: 496 }, tr = { x: 1050, y: 488 };
    const sb = { x: 903, y: 690 }, st = { x: 901, y: 498 };
    c.save();
    // cover edge (the handbook's red)
    c.fillStyle = mixRgba('red', 'shadow', 0.35);
    c.beginPath(); c.moveTo(bl.x - 9, bl.y + 9); c.lineTo(br.x + 9, br.y + 9); c.lineTo(tr.x + 7, tr.y - 3); c.lineTo(tl.x - 7, tl.y - 3); c.closePath(); c.fill();
    const pageFill = (a: typeof bl, b: typeof bl, cc: typeof bl, d: typeof bl) => {
      const g = c.createLinearGradient(600, 420, 1050, 660);
      g.addColorStop(0, mixRgba('paper', 'lamp', 0.3 * lamp));
      g.addColorStop(1, mixRgba('paper', 'shadow', 0.6 - 0.38 * lamp));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo((a.x + b.x) / 2, a.y - 8, b.x, b.y); c.lineTo(cc.x, cc.y); c.quadraticCurveTo((cc.x + d.x) / 2, cc.y - 6, d.x, d.y); c.closePath(); c.fill();
    };
    pageFill(bl, sb, st, tl);
    pageFill(sb, br, tr, st);
    // the gutter shadow
    const gg = c.createLinearGradient(sb.x - 30, 0, sb.x + 30, 0);
    gg.addColorStop(0, rgba('shadow', 0)); gg.addColorStop(0.5, rgba('shadow', 0.3)); gg.addColorStop(1, rgba('shadow', 0));
    c.fillStyle = gg; c.fillRect(sb.x - 30, st.y, 60, sb.y - st.y);
    const P = (a: typeof bl, b: typeof bl, cc: typeof bl, d: typeof bl, u: number, vv: number) => ({ x: lerp(lerp(d.x, cc.x, u), lerp(a.x, b.x, u), vv), y: lerp(lerp(d.y, cc.y, u), lerp(a.y, b.y, u), vv) });
    // left page: INTRODUCTION, a few lines of body text (unreadable at this size), the page number 12
    const hp = P(bl, sb, st, tl, 0.12, 0.14);
    c.font = font(F.archivo(62, 900), 17);
    c.fillStyle = rgba('ink', 0.8);
    c.fillText('INTRODUCTION', hp.x, hp.y);
    for (let i = 0; i < 9; i++) {
      const vv = 0.26 + i * 0.07;
      const a = P(bl, sb, st, tl, 0.12, vv), b = P(bl, sb, st, tl, 0.12 + 0.76 * (i === 8 ? 0.45 : 0.85 + 0.15 * hash(i, 5)), vv);
      c.strokeStyle = rgba('ink', 0.32); c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    const np = P(bl, sb, st, tl, 0.12, 0.93);
    drawPageNumber(c, '12', np.x + 18, np.y, 17, { alpha: 0.95 });
    // right page: the contents in miniature
    for (let i = 0; i < 14; i++) {
      const vv = 0.1 + i * 0.058 + (i > 0 ? 0.04 : 0);
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
  intro = { x: 0, y: 0 };
  constructor(private s: Book) {}
  build() {}

  /** Page -> screen transform at t (k: the zoom from the shot-2 book, 0..1). */
  transform(t: number, k: number) {
    const B = this.s.B;
    const s1 = 0.84;
    // the book's spot in shot 2 (approx.; the page grows out of it)
    const x = lerp(990, 960, k), y = lerp(592, 548, k);
    const sc = lerp(0.165, s1, k) * (1 + 0.025 * prog(t, B(9), B(12)));
    const rot = lerp(-1.5, -1.2, k);
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
    // the introduction: the first row of the printed contents (this chapter's page, 12)
    const introGeo = drawEntry(c, s.sctx.lyrics, s.sctx.audio, printedLine(INTRO.label), t, {
      x: PAGE_X, y: INTRO_Y, width: PAGE_RIGHT - PAGE_X, size: PAGE_SIZE, theme: 'paper', printed: true, page: INTRO.page, noNumber: t >= lift, heading: false, leader: 1,
    });
    this.intro = { x: introGeo.numRight, y: introGeo.lastY };
    c.font = font(F.archivo(100, 300), 34);
    c.letterSpacing = '6px';
    c.fillStyle = rgba('ink', 0.78);
    c.textAlign = 'center';
    c.fillText('WHAT TO DO IF…', PW_ / 2, HEAD_Y);
    c.textAlign = 'left';
    c.letterSpacing = '0px';
    c.fillStyle = rgba('red', 0.9);
    c.font = font(F.archivo(100, 500), 30);
    c.fillText('*', PW_ / 2 + measure('WHAT TO DO IF…', F.archivo(100, 300), 34, 6) / 2 + 6, HEAD_Y - 12);
    // the thirteen entries
    this.lines = [];
    CONTENTS.forEach((e, i) => {
      const y = PAGE_TOP + i * PAGE_STEP;
      const flown = t >= lift + (i + 1) * 0.045;
      const geo = drawEntry(c, s.sctx.lyrics, s.sctx.audio, e.line, t, {
        x: PAGE_X, y, width: PAGE_RIGHT - PAGE_X, size: PAGE_SIZE, theme: 'paper', printed: true, noNumber: flown, numberClip: 'frame',
      });
      this.lines.push({ y, num: { x: geo.numRight, y: geo.lastY } });
    });
    // footnote, typed in mono
    const note = '* they say if you remove the page numbers, it reads like a song.';
    const nn = Math.floor(Math.max(0, t - (B(10) - 0.2)) * 48);
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
    const hdr = m.transformPoint(new DOMPoint(PW_ / 2 + 170, HEAD_Y - 10));
    drawCallout(c, t, { ax: hdr.x, ay: hdr.y, lx: hdr.x + 240, ly: hdr.y + 30, text: ['TITLE, TRANSLATED:', 'WHAT TO DO IF…', 'PRINTED: ЧТО ДЕЛАТЬ, ЕСЛИ…'], at: B(9) + 0.3, out: B(11) - 0.3, size: 19, alpha: pa, plate: 0.6 });
    const ip = m.transformPoint(new DOMPoint(PAGE_X + 20, INTRO_Y - PAGE_SIZE * 0.4));
    drawCallout(c, t, { ax: ip.x, ay: ip.y, lx: ip.x - 90, ly: ip.y - 70, side: -1, text: ['THIS PAGE · P. 12'], at: B(9) + 0.7, out: B(11) - 0.3, size: 19, alpha: pa, plate: 0.6 });

    // the red numbers lift off and fly to the page counter
    const cnt = { x: W - SAFE, y: 70 + 124 * 0.74 };
    const flyers = [{ num: this.intro, page: INTRO.page }, ...this.lines.map((ln, i) => ({ num: ln.num, page: CONTENTS[i]!.page }))];
    flyers.forEach((ln, i) => {
      const t0 = lift + i * 0.045, t1 = t0 + 0.42;
      if (t < t0 || t > t1 + 0.05) return;
      const p0 = m.transformPoint(new DOMPoint(ln.num.x, ln.num.y));
      const u = prog(t, t0, t1, ease.inOutCubic);
      const ctrl = { x: lerp(p0.x, cnt.x, 0.3), y: Math.min(p0.y, cnt.y) - 160 };
      const x = (1 - u) ** 2 * p0.x + 2 * (1 - u) * u * ctrl.x + u * u * cnt.x;
      const y = (1 - u) ** 2 * p0.y + 2 * (1 - u) * u * ctrl.y + u * u * cnt.y;
      const ps = PAGE_SIZE * Math.hypot(m.a, m.b);
      const size = i === 0 ? lerp(ps, 124, u * u) : lerp(ps, ps * 0.6, u);
      drawPageNumber(c, ln.page, x, y, size, { alpha: i === 0 ? 1 - smoothstep(0.9, 1, u) : 1 - smoothstep(0.55, 0.95, u), clip: 'frame' });
    });
    // the counter: it is born from the numbers
    if (t >= land - 0.1) {
      drawPageCounter(c, s.sctx.lyrics, t, { page: INTRO.page, prev: null, since: land - 0.1 });
    }
    // the dive ends in the ink
    if (dive > 0.8) { c.fillStyle = rgba('ink', smoothstep(0.8, 0.98, dive)); c.fillRect(0, 0, W, H); drawPageCounter(c, s.sctx.lyrics, t, { page: INTRO.page, prev: null, since: land - 0.1 }); }
    s.composite2D(s.ui, out);
    s.glow2D.clear();
    if (pa > 0) { droneGlow(s.glow2D, dp.x, dp.y, 26, pa, [-0.8, 0.5]); }
    const fl = t >= land ? Math.pow(0.5, (t - land) / 0.12) : 0;
    if (fl > 0.02) s.glow2D.add(cnt.x - 60, cnt.y - 44, 0, 120, 70, LIN.red, 0.4 * fl, 2);
    s.glow2D.render(renderer, out);
  }
}
