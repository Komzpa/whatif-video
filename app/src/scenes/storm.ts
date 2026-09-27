// `storm` — «ПОГОДА СТАНОВИТСЯ ОПАСНОЙ» (TREATMENT p.70: the storm front arrives, rain thickens, signs flicker; on
// "unsafe" the light flickers for the first time; the child finds shelter; r5 item 9: the cat shelters with the
// child). City stop: Старый путепровод, the old railway overpass on the way out of the promzona. First person:
//   (a) start          a wet road towards the overpass; far lightning lights the clouds, the blocks and the
//                      overpass in one white blink (the hook); a warning screen on the abutment blinks a pictogram
//                      and mojibake (callout: ШТОРМОВОЕ ПРЕДУПРЕЖДЕНИЕ).
//   (b) «turns»        a strike on the pylon to the right, the rain comes down hard; the cat bolts for the underpass;
//                      the child runs after it.
//   (c) «unsafe»       a close strike, white; the torch stutters for the first time, a street lamp dies. The child is
//                      under the deck, turns round: the rain curtain pouring off the deck edge, the road it came by,
//                      lightning over it, and the cat sitting at the child's feet looking out.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, smoothstep, keys, mulberry32, hash } from '../engine/util';
import { F, font } from '../engine/type';
import { garble, homeLabel, city } from '../city';
import { type Light } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, blotches, speckle, asphalt, boxMesh, cyl, ground, concreteTex, corrugatedTex, streetLight,
  panelBlock, WindowPanes, beamLit, POST_BASE, LIN, scaleRGB, mixRGB, EYE, type Pov, type V3, type RGB,
} from './_kit';
import { rain, lampDie, flicker } from './_motifs';
import { Quadruped, CAT, type QuadSpec } from './_beasts';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const DZ0 = -14, DZ1 = -21; // the deck's near and far edges (z)
const DY = 3.8; // the deck's underside (a low old overpass)
const WX = 4.9; // the abutment walls (±x)
const SCREEN: V3 = [-6.65, 2.3, DZ0 + 0.76]; // the abutment face is at DZ0 + 0.6 // the warning screen on the left abutment's face
const PYLON: V3 = [34, 0, -62];
const Z_UNDER = -18.6; // where the child stops under the deck

interface Bolt { t: number; k: number; segs: [THREE.Vector3, THREE.Vector3, number][]; at: THREE.Vector3; near: number }

export default class Storm extends LitScene {
  chapter = 'storm';
  cat!: Quadruped;
  catSpec: QuadSpec = { ...CAT, back: [0.34, 0.12, 0.03], belly: [0.62, 0.36, 0.14], legs: [0.5, 0.26, 0.08], muzzleC: [0.7, 0.5, 0.32], eye: [0.45, 0.95, 0.3], stripes: 70 };
  screen!: THREE.Mesh; scrCv!: HTMLCanvasElement; scrTex!: THREE.CanvasTexture; scrText = '';
  flashL!: THREE.DirectionalLight;
  tube!: THREE.PointLight; tubeMesh!: THREE.Mesh;
  lamps: { p: V3; L: THREE.SpotLight; dies: boolean }[] = [];
  bolts: Bolt[] = [];
  clouds!: THREE.Mesh; cloudMat!: THREE.MeshBasicMaterial;
  panes!: WindowPanes;
  drops: { x: number; y: number; z: number; sp: number }[] = [];

  override init() {
    this.initLit();
    this.hemi.intensity = 0.16;
    this.fogE.density = 0.028;
    const s = this.ctx.start;
    const words = this.ly.linesIn(s, s + 10).flatMap((l) => l.words);
    const w1 = (re: RegExp) => words.find((q) => re.test(q.w))!.start;
    const T: Record<string, number> = { s };
    T.the = w1(/^The$/); T.weather = w1(/^weather/); T.turns = w1(/^turns/); T.feels = w1(/^feels/); T.unsafe = w1(/^unsafe/);
    T.end = this.ctx.end;
    this.T = T;
    // shots: the road to the overpass from high behind, the hook strike lighting the whole block; the pylon strike
    // and the cat bolting in first person; low behind the child running through the gusting rain; the close strike
    // and the torch's first stutter in first person; under the deck over the child's shoulder, the rain curtain,
    // the road it came by and the cat at its feet
    this.shots = [
      [T.s, T.weather + 1.2, { k: 'wide', d: 1.1, h: 1.4, side: -0.8, ahead: 2, aimY: 2.2 }],
      [T.turns + 0.85, T.unsafe - 0.15, { k: 'back', d: 1.5, h: 0.9, side: 1, ahead: 1.2, aimY: 1.0 }],
      [T.unsafe + 1.15, T.end + 1, { k: 'ots', d: 1.7, h: 1.8, side: 1.1, ahead: 0.5, aimY: PORTRAIT ? -0.3 : -0.9, d1: PORTRAIT ? 2.4 : 1.7 }],
    ];
    this.initKid(13);
    this.build();
    this.cat = new Quadruped(this.catSpec, this.three, 80);
    this.scrText = garble('ШТОРМОВОЕ ПРЕДУПРЕЖДЕНИЕ');
    const r = mulberry32(5);
    for (let i = 0; i < 6000; i++) this.drops.push({ x: (r() - 0.5) * 22, y: r() * 14, z: r(), sp: 9 + r() * 4 });
    // the strikes: far (the hook), mid, the pylon on «turns», far, close on «unsafe», over the road seen from shelter
    const mk = (t: number, at: V3, top: number, k: number, near: number, seed: number) => this.bolts.push({ t, k, at: new THREE.Vector3(...at), near, segs: this.bolt(new THREE.Vector3(at[0] + (hash(seed, 1) - 0.5) * 20, top, at[2] - 10), new THREE.Vector3(...at), seed) });
    mk(s + 0.32, [-60, 8, -140], 110, 0.9, 0, 11);
    mk(T.weather + 1.05, [45, 0, -120], 100, 0.8, 0, 12);
    mk(T.turns + 0.02, [PYLON[0], 22, PYLON[2]], 95, 1.3, 0.4, 13);
    mk(T.feels + 0.9, [-80, 10, -160], 110, 0.7, 0, 14);
    mk(T.unsafe - 0.02, [-9, 0, -46], 90, 1.8, 1, 15);
    mk(T.unsafe + 1.9, [18, 0, 70], 100, 1.2, 0.5, 16);
    this.obstacles = () => { const b = this.planeBox(this.screen); return b ? [b] : []; };
  }

  /** A jagged bolt from the cloud base down to `b`, with forks; each segment carries its width weight. */
  bolt(a: THREE.Vector3, b: THREE.Vector3, seed: number) {
    const r = mulberry32(seed);
    const segs: [THREE.Vector3, THREE.Vector3, number][] = [];
    const walk = (p: THREE.Vector3, q: THREE.Vector3, wgt: number, depth: number) => {
      const n = 14;
      let cur = p.clone();
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const nxt = p.clone().lerp(q, u).add(new THREE.Vector3((r() - 0.5) * 7 * (1 - u * 0.6), (r() - 0.5) * 2, (r() - 0.5) * 5));
        if (i === n) nxt.copy(q);
        segs.push([cur.clone(), nxt.clone(), wgt]);
        if (depth > 0 && r() < 0.28) {
          const end = nxt.clone().add(new THREE.Vector3((r() - 0.5) * 30, -(8 + r() * 25), (r() - 0.5) * 12));
          walk(nxt, end, wgt * 0.45, depth - 1);
        }
        cur = nxt;
      }
    };
    walk(a, b, 1, 2);
    return segs;
  }

  build() {
    const S = this.three;
    const { map, rough } = asphalt(81, [4, 40], { puddles: 9, base: '#1d1f22' });
    ground(S, 9, 200, 0, -30, lit([0.62, 0.62, 0.62], { map, roughMap: rough, rough: 0.42 }));
    const verge = concreteTex(82, [8, 50], { base: '#34332c', stains: 60 });
    ground(S, 60, 200, -34.5, -30, lit([0.7, 0.7, 0.7], { map: verge, rough: 0.9 }), -0.01);
    ground(S, 60, 200, 34.5, -30, lit([0.7, 0.7, 0.7], { map: verge, rough: 0.9 }), -0.01);
    // kerbs
    const kerb = lit([0.45, 0.45, 0.43], { map: concreteTex(83, [40, 1]), rough: 0.85 });
    boxMesh(S, 0.25, 0.15, 200, -4.6, 0.075, -30, kerb); boxMesh(S, 0.25, 0.15, 200, 4.6, 0.075, -30, kerb);
    // ---- the overpass: two abutments, the deck (box girder with an edge beam), parapets, catenary masts on top
    const concM = lit([0.6, 0.6, 0.58], { map: concreteTex(84, [3, 2], { joints: [3, 2], stains: 40 }), rough: 0.9 });
    const deckM = lit([0.5, 0.5, 0.48], { map: concreteTex(85, [6, 1], { stains: 50 }), rough: 0.9 });
    const Dz = DZ0 - DZ1, Dc = (DZ0 + DZ1) / 2;
    for (const sx of [-1, 1]) {
      // the abutment: a wall block from the road edge outwards, as high as the deck, with wing walls
      boxMesh(S, 14, DY, Dz + 1.2, sx * (WX + 7), DY / 2, Dc, concM);
      boxMesh(S, 0.8, DY * 0.6, 7, sx * (WX + 13.5), DY * 0.3, DZ0 + 3.5, concM);
    }
    boxMesh(S, 36, 1.35, Dz, 0, DY + 0.675, Dc, deckM);
    boxMesh(S, 36, 0.5, 0.35, 0, DY + 0.2, DZ0 - 0.18, lit([0.32, 0.3, 0.28], { map: concreteTex(86, [12, 1]), rough: 0.8 })); // the drip edge
    const railM = lit([0.18, 0.17, 0.16], { rough: 0.6, metal: 0.3 });
    for (const z of [DZ0 + 0.1, DZ1 - 0.1]) {
      boxMesh(S, 36, 0.9, 0.12, 0, DY + 1.35 + 0.45, z, railM);
    }
    const mastM = lit([0.22, 0.22, 0.22], { rough: 0.6, metal: 0.3 });
    for (let x = -16; x <= 16; x += 8) {
      cyl(S, [x, DY + 1.35, DZ0 - 0.9], [x, DY + 8.5, DZ0 - 0.9], 0.12, mastM, { seg: 6 });
      cyl(S, [x, DY + 7.8, DZ0 - 0.9], [x, DY + 7.8, DZ1 + 1.2], 0.05, mastM, { seg: 5 });
    }
    for (const z of [DZ0 - 2.3, DZ1 + 2.3]) cyl(S, [-18, DY + 7.2, z], [18, DY + 7.2, z], 0.012, mastM, { seg: 4, cast: false });
    // the fluorescent tube under the deck on the left wall (cold, failing)
    this.tubeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.2), glowMat([0.75, 0.9, 1.0], 2.2));
    this.tubeMesh.position.set(-WX + 0.08, 3.6, Dc + 0.8); S.add(this.tubeMesh);
    this.tube = this.addPoint([-WX + 0.5, 3.5, Dc + 0.8], [0.55, 0.75, 1.0], 6);
    // wet dark stains and a puddle under the deck
    const pud = new THREE.Mesh(new THREE.CircleGeometry(1, 40), lit([0.02, 0.02, 0.025], { rough: 0.08, metal: 0.1 }));
    pud.rotation.x = -Math.PI / 2; pud.scale.set(2.6, 1.3, 1); pud.position.set(0.8, 0.005, Dc + 2.5); pud.receiveShadow = true; S.add(pud);
    // ---- garages on the right before the overpass (rusty corrugated doors), a pylon beyond
    const cor = corrugatedTex(87, [1, 1], '#4a4f52');
    const garM = lit([0.55, 0.55, 0.55], { map: cor.map, normalMap: cor.nrm, rough: 0.7, metal: 0.1 });
    const garBody = lit([0.35, 0.34, 0.32], { map: concreteTex(88, [2, 1]), rough: 0.95 });
    for (let k = 0; k < 7; k++) {
      const z = -1 - k * 3.2;
      if (z < DZ0 + 1) break;
      boxMesh(S, 6, 2.6, 3.1, 9.6, 1.3, z, garBody);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.1), garM);
      door.position.set(6.58, 1.08, z); door.rotation.y = -Math.PI / 2; door.receiveShadow = true; S.add(door);
    }
    boxMesh(S, 6.4, 0.15, 24, 9.6, 2.65, -10.6, lit([0.12, 0.12, 0.12], { rough: 0.6 }));
    // the pylon (the strike on «turns»)
    const pyM = lit([0.12, 0.12, 0.13], { rough: 0.7, metal: 0.3 });
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) cyl(S, [PYLON[0] + dx * 1.6, 0, PYLON[2] + dz * 1.6], [PYLON[0] + dx * 0.3, 22, PYLON[2] + dz * 0.3], 0.18, pyM, { seg: 5 });
    boxMesh(S, 12, 0.4, 0.4, PYLON[0], 18, PYLON[2], pyM); boxMesh(S, 8, 0.4, 0.4, PYLON[0], 21, PYLON[2], pyM);
    // ---- the blocks: девятиэтажки beyond the overpass and behind the child (for the look back)
    const wins = [
      ...panelBlock(S, { cx: -26, cz: -72, len: 64, floors: 9, ang: 0.25, seed: 31, litRate: 0.12 }),
      ...panelBlock(S, { cx: 30, cz: -100, len: 48, floors: 9, ang: -0.4, seed: 32, litRate: 0.1 }),
      ...panelBlock(S, { cx: 4, cz: -140, len: 80, floors: 12, ang: 0.05, seed: 33, litRate: 0.1 }),
      ...panelBlock(S, { cx: -22, cz: 46, len: 56, floors: 9, ang: -0.3, seed: 34, litRate: 0.13 }),
      ...panelBlock(S, { cx: 28, cz: 60, len: 40, floors: 5, ang: 0.35, seed: 35, litRate: 0.15 }),
    ];
    this.panes = new WindowPanes(S, wins);
    // ---- streetlights (left side); the one nearest the overpass dies on «unsafe»
    for (const z of [10, -4, -30, -46, 26]) {
      const hp = streetLight(S, -5.4, z, { h: 7, arm: [1.7, 0, 0] });
      const L = this.addLamp(hp, { k: 55, angle: 1.0, shadow: z === -4, target: [hp[0] + 1.3, 0, hp[2]] });
      this.lamps.push({ p: hp, L, dies: z === -4 });
    }
    // ---- the warning screen on the abutment face: a dot-matrix box
    boxMesh(S, 3.3, 1.8, 0.2, SCREEN[0], SCREEN[1], SCREEN[2] - 0.12, lit([0.05, 0.05, 0.05], { rough: 0.5, metal: 0.2 }));
    this.scrCv = document.createElement('canvas'); this.scrCv.width = 512; this.scrCv.height = 256;
    this.scrTex = new THREE.CanvasTexture(this.scrCv); this.scrTex.colorSpace = THREE.SRGBColorSpace;
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), new THREE.MeshBasicMaterial({ map: this.scrTex, toneMapped: false, fog: true }));
    this.screen.position.set(...SCREEN); S.add(this.screen);
    this.scrLight = this.addPoint([SCREEN[0], SCREEN[1], SCREEN[2] + 1.0], [1.0, 0.35, 0.05], 2.2);
    // ---- the cloud deck (lit from inside by the strikes)
    const cloudTex = canvasTex(1024, 1024, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      blotches(c, w, h, 260, (i) => `rgba(255,255,255,${0.05 + (i % 5) * 0.025})`, 40, 220, 91);
      speckle(c, w, h, 20000, 0.1, 92, true);
    }, { repeat: [1, 1] });
    this.cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), this.cloudMat);
    this.clouds.rotation.x = Math.PI / 2; this.clouds.position.set(0, 95, -60); S.add(this.clouds);
    // the strike's light: a directional light from the bolt (hard shadows of the overpass)
    this.flashL = new THREE.DirectionalLight(0xd8e4ff, 0);
    this.flashL.castShadow = true; this.flashL.shadow.mapSize.set(2048, 2048);
    const sc = this.flashL.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 300;
    this.flashL.shadow.bias = -0.0006;
    S.add(this.flashL, this.flashL.target);
  }
  scrLight!: THREE.PointLight;

  /** The strike light at t: 0..~2 (return strokes: three pulses decaying). */
  flash(t: number) {
    let f = 0, near = 0, at: THREE.Vector3 | null = null, best = 0;
    for (const b of this.bolts) {
      const d = t - b.t;
      if (d < -0.01 || d > 0.7) continue;
      const e = Math.max(0, Math.exp(-Math.max(0, d) * 22)) + 0.8 * Math.exp(-Math.max(0, d - 0.09) * 18) * (d > 0.09 ? 1 : 0) + 0.55 * Math.exp(-Math.max(0, d - 0.24) * 12) * (d > 0.24 ? 1 : 0);
      const v = e * b.k;
      f += v;
      if (v > best) { best = v; at = b.at; near = b.near; }
    }
    return { f, at, near };
  }
  rainK(t: number) { const T = this.T; return lerp(0.3, 1, smoothstep(T.weather, T.turns + 0.4, t)); }
  /** 0 in the open, 1 under the deck. */
  shelter(z: number) { return smoothstep(DZ0 + 0.3, DZ0 - 1.4, z) * smoothstep(DZ1 - 0.3, DZ1 + 1.4, z); }

  camZ(t: number) {
    const T = this.T, z0 = 0.4, v0 = 1.25;
    const z1 = z0 - v0 * (Math.min(t, T.turns) - T.s);
    if (t <= T.turns) return z1;
    const t2 = T.unsafe - 0.15;
    const u = clamp((t - T.turns) / (t2 - T.turns));
    // accelerate into a run, brake under the deck
    const s = 0.75 * u + 0.25 * ease.inOutCubic(u);
    return lerp(z1, Z_UNDER, s) - (t > t2 ? 0.15 * smoothstep(t2, t2 + 0.5, t) : 0);
  }
  running(t: number) { const T = this.T; return smoothstep(T.turns, T.turns + 0.4, t) * (1 - smoothstep(T.unsafe - 0.4, T.unsafe + 0.1, t)); }

  catAt(t: number) {
    const T = this.T, z = this.camZ(t);
    const sitPt = new THREE.Vector3(-2.9, 0, DZ0 - 1.6); // by the wall under the tube
    const outPt = new THREE.Vector3(PORTRAIT ? 0.15 : -0.1, 0, Z_UNDER + (PORTRAIT ? 3.3 : 3.9)); // at the child's feet, looking out
    const bolt0 = T.turns + 0.1;
    if (t < bolt0) {
      const p = new THREE.Vector3(PORTRAIT ? 0.55 : 0.75, 0, z - (PORTRAIT ? 3.4 : 3.3));
      return { pos: p, heading: Math.PI / 2 + 0.05, dist: 2.4 - z, speed: 1.25, sit: 0, look: null as THREE.Vector3 | null };
    }
    const from = new THREE.Vector3(PORTRAIT ? 0.55 : 0.75, 0, this.camZ(bolt0) - (PORTRAIT ? 3.4 : 3.3));
    const arrive = bolt0 + 1.9;
    if (t < arrive) {
      const u = ease.inOutQuad(clamp((t - bolt0) / (arrive - bolt0)));
      const p = from.clone().lerp(sitPt, u);
      const d = sitPt.clone().sub(from);
      return { pos: p, heading: Math.atan2(-d.z, d.x), dist: 2.4 - this.camZ(bolt0) + u * d.length() * 1.0, speed: 5, sit: 0, look: null };
    }
    const turn0 = T.unsafe + 0.35, turn1 = turn0 + 1.3;
    if (t < turn0) return { pos: sitPt, heading: Math.PI / 2 - 1.2, dist: 20, speed: 0, sit: smoothstep(arrive, arrive + 0.4, t), look: new THREE.Vector3(0.2, 0.6, z) };
    const u = ease.inOutQuad(clamp((t - turn0) / (turn1 - turn0)));
    const p = sitPt.clone().lerp(outPt, u);
    const d = outPt.clone().sub(sitPt);
    const hd = u < 0.85 ? Math.atan2(-d.z, d.x) : lerp(Math.atan2(-d.z, d.x), -Math.PI / 2 - 0.1, (u - 0.85) / 0.15);
    return { pos: p, heading: hd, dist: 20 + u * d.length(), speed: u > 0 && u < 1 ? 1.1 : 0, sit: t > turn1 ? smoothstep(turn1, turn1 + 0.35, t) : 0, look: t > turn1 ? new THREE.Vector3(2, 0.8, 30) : null };
  }

  /** The camera shake of the close strike. */
  shake(t: number) { const T = this.T; const d = t - T.unsafe; return d > 0 && d < 0.6 ? Math.exp(-d * 7) * 0.035 : 0; }

  pov(t: number): Pov {
    const T = this.T;
    if (PROOF === 'overpass') return { p: [-1.2, 1.4, 8], yaw: 0.04, pitch: 0.12, walk: 0 };
    if (PROOF === 'screen') return { p: [SCREEN[0] + (PORTRAIT ? 1.0 : 1.4), 1.6, SCREEN[2] + (PORTRAIT ? 6.0 : 3.2)], yaw: PORTRAIT ? 0.14 : 0.35, pitch: 0.14, walk: 0, fov: PORTRAIT ? 60 : 44 };
    if (PROOF === 'cat') { const c = this.catAt(T.end - 0.3); const p: V3 = [c.pos.x + 0.9, 0.45, c.pos.z + 1.0]; return { p, yaw: this.yawTo(p, [c.pos.x, 0, c.pos.z]), pitch: -0.18, walk: 0, fov: PORTRAIT ? 55 : 40 }; }
    if (PROOF === 'under') return { p: [2.6, 1.3, DZ1 + 1.2], yaw: this.yawTo([2.6, 1.3, DZ1 + 1.2], [-2, 1.2, DZ0 + 3]), pitch: 0.05, walk: 0 };
    if (PROOF === 'garages') return { p: [2.5, 1.2, 0], yaw: -0.9, pitch: 0.05, walk: 0 };
    const z = this.camZ(t), run = this.running(t);
    const E = ease.inOutCubic;
    // walk looking a little left (the screen, the lamps), run straight, then turn round under the deck
    const turn0 = T.unsafe + 0.25, turn1 = turn0 + 1.4;
    const back = Math.PI - (PORTRAIT ? 0.04 : 0.1);
    const yaw = keys(t, [[T.s, PORTRAIT ? 0.3 : 0.14], [T.weather, PORTRAIT ? 0.36 : 0.18, E], [T.turns + 0.3, PORTRAIT ? 0.3 : 0.1, E], [T.feels, PORTRAIT ? 0.06 : 0.02, E], [T.unsafe - 0.2, 0.0, E], [turn0, 0.08, E], [turn1, back, E], [T.end, back + 0.05, E]]);
    const pitch = keys(t, [[T.s, 0.05], [T.weather, 0.07, E], [T.turns, 0.0, E], [T.unsafe, 0.03, E], [turn0, 0.02, E], [turn1, PORTRAIT ? -0.27 : 0.07, E], [T.end, PORTRAIT ? -0.25 : 0.08, E]]);
    const sh = this.shake(t);
    return { p: [0.2 + Math.sin(t * 61) * sh, EYE - 0.04 * run, z], yaw: yaw + Math.sin(t * 47) * sh, pitch: pitch + Math.cos(t * 53) * sh, walk: 1 + 1.2 * run, fov: (PORTRAIT ? 74 : 56) + (PORTRAIT ? 0 : 6) * smoothstep(turn0, turn1, t) };
  }

  drawScreen(t: number) {
    const T = this.T, c = this.scrCv.getContext('2d')!;
    const w = 512, h = 256;
    c.fillStyle = '#060504'; c.fillRect(0, 0, w, h);
    // flickers after «unsafe», then dies
    const alive = t < T.unsafe ? 1 : lampDie(t, T.unsafe + 0.05, 1.2, 23);
    const blink = Math.floor((t - T.s) * 2.2) % 2 === 0 ? 1 : 0.35;
    const m = document.createElement('canvas'); m.width = 128; m.height = 64;
    const mc = m.getContext('2d')!;
    mc.fillStyle = '#000'; mc.fillRect(0, 0, 128, 64);
    // the pictogram: a warning triangle with a lightning bolt (reads without words)
    mc.strokeStyle = '#fff'; mc.lineWidth = 3; mc.lineJoin = 'round';
    mc.beginPath(); mc.moveTo(22, 6); mc.lineTo(40, 38); mc.lineTo(4, 38); mc.closePath(); mc.stroke();
    mc.fillStyle = '#fff'; mc.beginPath(); mc.moveTo(24, 13); mc.lineTo(17, 26); mc.lineTo(22, 26); mc.lineTo(19, 35); mc.lineTo(28, 22); mc.lineTo(23, 22); mc.lineTo(26, 13); mc.closePath(); mc.fill();
    // the mojibake line, scrolling
    mc.font = font(F.metro(900), 13); mc.textBaseline = 'middle';
    const tw = mc.measureText(this.scrText).width;
    const off = ((t - T.s) * 26) % (tw + 80);
    mc.save(); mc.beginPath(); mc.rect(46, 0, 82, 64); mc.clip();
    mc.fillText(this.scrText, 128 - off, 22);
    mc.restore();
    mc.font = font(F.metro(900), 12); mc.fillText(this.scrText.slice(0, 9), 48, 44);
    const d = mc.getImageData(0, 0, 128, 64).data;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const on = d[(y * 128 + x) * 4]! > 110;
      const pict = x < 44;
      const a = on ? (pict ? blink : 1) * alive : 0;
      c.fillStyle = a > 0.05 ? `rgba(255,${pict ? 150 : 90},20,${a})` : 'rgba(55,20,6,0.45)';
      c.beginPath(); c.arc(x * 4 + 2, y * 4 + 2, a > 0.05 ? 1.7 : 1.1, 0, Math.PI * 2); c.fill();
    }
    this.scrTex.needsUpdate = true;
    this.scrLight.intensity = 2.2 * alive * (0.7 + 0.3 * blink);
    return alive;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    const fl = this.flash(t), F1 = Math.min(fl.f, 2.2);
    const rk = this.rainK(t);
    // the lights: the dying lamp, the failing tube, the strike
    for (const l of this.lamps) l.L.intensity = 55 * (l.dies ? lampDie(t, T.unsafe + 0.1, 0.9, 41) * (t > T.turns ? (hash(Math.floor(t * 14), 43) < 0.3 ? 0.25 : 1) : 1) : 1);
    const tubeK = flicker(t, 0.45, 7) * (hash(Math.floor(t * 3), 2) < 0.15 ? 0.2 : 1);
    this.tube.intensity = 6 * tubeK; (this.tubeMesh.material as THREE.MeshBasicMaterial).color.setScalar(2.2 * tubeK);
    const cam0 = this.camZ(t);
    if (fl.at) {
      const dir = fl.at.clone().add(new THREE.Vector3(0, 60, 0)).sub(new THREE.Vector3(0, 0, cam0)).normalize();
      this.flashL.position.set(0.2 + dir.x * 120, dir.y * 120, cam0 + dir.z * 120);
      this.flashL.target.position.set(0.2, 0, cam0 - 4); this.flashL.target.updateMatrixWorld();
    }
    this.flashL.intensity = F1 * (3.2 + 2.6 * fl.near);
    this.hemi.intensity = 0.16 + 1.1 * F1;
    this.hemi.color.setRGB(0.55 + 0.3 * F1, 0.62 + 0.3 * F1, 0.78 + 0.25 * F1);
    const fogC = mixRGB([0.02, 0.022, 0.028], [0.3, 0.33, 0.42], clamp(F1 * 0.35));
    this.fogE.color.setRGB(fogC[0], fogC[1], fogC[2]); this.fogE.density = 0.022 + 0.012 * rk;
    this.cloudMat.color.setRGB(0.05 + 0.9 * F1, 0.055 + 0.95 * F1, 0.07 + 1.1 * F1);
    this.panes.set((w, i) => (t > T.unsafe + 0.05 && hash(i, 9) < 0.35 ? lampDie(t, T.unsafe + 0.05 + hash(i, 3) * 0.3, 0.3, i) : 1));
    const c = this.catAt(PROOF === 'cat' ? T.end - 0.3 : t);
    this.cat.pose({ pos: c.pos, heading: c.heading, dist: c.dist, speed: c.speed, t, sit: c.sit, look: c.look, lookK: c.look ? 0.8 : 0, tailUp: c.speed > 2 ? 0.4 : 0.7, tailWag: 0.05, earBack: clamp(0.3 + 0.5 * this.running(t) + 0.8 * F1), crouch: clamp(0.9 * F1 * (c.speed < 2 ? 1 : 0.3)) });
    const P = this.pov(t);
    this.setCam(P, t, 1);
    const cam = this.cam;
    const scrAlive = this.drawScreen(t);
    // the torch: stutters on «unsafe» (the first time), comes back weaker
    const d = t - T.unsafe;
    const stutter = d < 0 ? 1 : d < 1.0 ? (hash(Math.floor(t * 30), 5) < 0.55 ? 0.08 : 0.9) * (d < 0.12 ? 0.05 : 1) : lerp(0.75, 0.85, smoothstep(1.0, 2.5, d));
    const on = PROOF ? 0 : stutter;
    const ahead = new THREE.Vector3(0.4, 0.5, cam.position.z - 7.5);
    const aim = t > T.unsafe + 1.2 ? c.pos.clone().add(new THREE.Vector3(0, 0.7, 4.5)) : ahead; // past the cat into the rain: the cat in silhouette
    const pose = this.torch(t, { raise: 1, on, walk: 1, aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : 0.85, spot: clamp(20 * (aim.distanceTo(cam.position) / 5) ** 2, 3, 30) });
    if (!PROOF) this.cut(t, P, pose, { speed: 1.2 + 2.2 * this.running(t), dist: 40 - this.camZ(t) });
    const tdir = pose ? pose.target.clone().sub(pose.head).normalize() : null;
    this.cat.setShine(pose && on > 0.3 ? 0.02 + this.cat.shine(pose.head, tdir, 0.95) * on : 0.02, 2);
    // ---- world
    const top = mixRGB([0.012, 0.014, 0.02], [0.35, 0.4, 0.55], clamp(F1 * 0.5));
    const hor = mixRGB([0.05, 0.05, 0.06], [0.5, 0.55, 0.7], clamp(F1 * 0.45));
    this.renderWorld(out, t, { sky: { top, horizon: hor, low: scaleRGB(LIN.shadow, 0.8), horizonY: 0.5, haze: 1.2 } });
    const g = this.glow3D;
    for (const l of this.lamps) g.add(l.p[0], l.p[1], l.p[2], 0.5, 0.4, LIN.sodium, 2.4 * (l.L.intensity / 55), 4);
    g.add(this.tubeMesh.position.x + 0.05, this.tubeMesh.position.y, this.tubeMesh.position.z, 0.5, 0.25, [0.6, 0.8, 1.0], 1.4 * tubeK, 3);
    g.add(SCREEN[0], SCREEN[1], SCREEN[2] + 0.9, 1.4, 0.8, [1.0, 0.35, 0.05], 0.25 * scrAlive, 2);
    // bolts: a hot core and a wide glow along the channel
    const lb = this.lines3D;
    for (const b of this.bolts) {
      const dd = t - b.t;
      if (dd < 0 || dd > 0.36) continue;
      const vis = (dd < 0.07 || (dd > 0.09 && dd < 0.15) || (dd > 0.24 && dd < 0.3)) ? 1 : 0.15;
      for (const [a, q, wgt] of b.segs) {
        lb.seg(a.x, a.y, a.z, q.x, q.y, q.z, (2 + 5 * b.near) * wgt + 0.8, 3.2 * vis, 3.4 * vis, 4.0 * vis, clamp(wgt * 1.4));
        if (wgt > 0.6) g.add((a.x + q.x) / 2, (a.y + q.y) / 2, (a.z + q.z) / 2, 4 + 3 * b.near, 4 + 3 * b.near, [0.6, 0.7, 1.0], 0.5 * vis * wgt, 1.5);
      }
    }
    lb.render(renderer, out, cam); lb.clear();
    this.flushGlow(out);
    // rain: streaks in the world (none under the deck), a curtain pouring off the deck edge, splashes
    const wind = 0.22 + 0.16 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1) + 0.12 * this.running(t);
    for (const q of this.drops) {
      const span = 14;
      const y = span - ((((t * q.sp) + q.y) % span) + span) % span;
      const x = q.x + (y - 7) * wind;
      const z = cam.position.z + 6 - q.z * 28 + (P.yaw > 1.5 ? 22 : 0);
      if (Math.abs(x) < WX + 0.2 && z < DZ0 && z > DZ1 && y < DY + 1.4) continue;
      if (hash(Math.floor(q.x * 100), 4) > rk) continue;
      const L = 0.45;
      const br = 0.2 + 1.3 * F1;
      const dist = Math.hypot(x - cam.position.x, z - cam.position.z);
      const fade = Math.exp(-dist * 0.09);
      if (fade < 0.04) continue;
      lb.seg(x, y, z, x - wind * L, y + L, z, 1.4, 0.55 * br, 0.6 * br, 0.7 * br, 0.3 * rk * fade);
    }
    // the curtain off the drip edge (lit by the tube and the flash)
    const curtK = smoothstep(T.weather, T.turns + 0.6, t);
    for (let i = 0; i < 320; i++) {
      const x = -WX + ((i >> 1) + 0.5) * (2 * WX) / 160 + (hash(i, 8) - 0.5) * 0.05;
      const ph = (t * (6 + hash(i, 6) * 3) + hash(i, 7) * 5) % 1;
      const y0 = DY - 0.05 - ph * 3.4, y1 = y0 - 0.25 - hash(i, 5) * 0.7;
      const br = 0.5 + 0.5 * tubeK + 1.5 * F1;
      const zc = DZ0 + 0.02 + (i & 1) * 0.12;
      lb.seg(x + (DY - y0) * wind * 0.25, y0, zc, x + (DY - y1) * wind * 0.25, Math.max(0, y1), zc, 1.2 + hash(i, 4) * 1.2, 0.6 * br, 0.68 * br, 0.8 * br, (0.15 + 0.45 * hash(i, 3)) * curtK);
    }
    // splashes on the road
    const fi = Math.floor(t * 25);
    for (let i = 0; i < 380 * rk; i++) {
      const x = (hash(i, fi) - 0.5) * 14, z = cam.position.z + 5 - hash(i, fi + 7) * 22 + (P.yaw > 1.5 ? 12 : 0);
      if (Math.abs(x) < WX && z < DZ0 && z > DZ1) continue;
      g.add(x, 0.03, z, 0.035, 0.012, [0.7, 0.75, 0.85], 0.12 + 0.5 * F1, 2);
    }
    lb.render(renderer, out, cam); lb.clear();
    this.flushGlow(out);
    const shel = this.shelter(cam.position.z);
    this.beam(out, t, pose, on, { density: 0.02 + 0.01 * rk, maxDist: clamp(aim.distanceTo(cam.position) - 0.5, 0.8, 8) });
    // near rain across the lens (screen space), lit where it crosses the beam; none once under the deck
    const nearA = rk * (1 - shel) * (1 - (P.yaw > 1.5 ? 0.6 : 0));
    if (nearA > 0.02) rain(this.lines2D, t, { count: Math.round(900 * rk), alpha: 0.13 * nearA, speed: 2200, angle: 0.12 + wind * 0.9, seed: 17, lit: beamLit(cam, pose, on) });
    this.lines2D.render(renderer, out); this.lines2D.clear();
    // ---- QA text: the screen's mojibake
    if (scrAlive > 0.5) this.logPlane(this.screen, this.scrText, 'garble', { frac: [0.37, 0.1, 1.0, 0.85], minPx: 10, letterFrac: 0.3, id: 'scenery:storm-screen', scenery: true });
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.16 + 0.6 * F1, warm: 0.15, torch: on };
    if (!PROOF) {
      this.torchHand(u, pose, light);
      this.heading(u, t, f);
      this.callout(u, t, 'ШТОРМОВОЕ ПРЕДУПРЕЖДЕНИЕ', T.s + 0.15, T.s + 3.0, () => this.onScreen(SCREEN[0] + 0.1, SCREEN[1] + 0.2, SCREEN[2]));
      this.callout(u, t, homeLabel('storm'), T.s + 3.5, T.s + 5.6, () => this.onScreen(-2, 7, cam.position.z - 70), { places: [city().home.name] });
      // the strike blinds the eye for a moment
      if (F1 > 0.3 && fl.near > 0.3) { u.fillStyle = `rgba(225,235,255,${clamp((F1 - 0.3) * 0.28 * fl.near)})`; u.fillRect(0, 0, W, H); }
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.55 };
  }
}
void H;
