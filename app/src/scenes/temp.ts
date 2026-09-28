// `temp` — «СЛИШКОМ ЖАРКО» / «СЛИШКОМ ХОЛОДНО» (TREATMENT p.52→62; r8 note 5: the same child in the same winter
// coat, too hot inside, too cold outside). City stop: the heating main on the way out of the promzona, and the heat
// point (ЦТП) it runs into. r5 item 9: the cat is with the child (callout КОШКА · 1).
//   (a) start      inside the heat point, from behind: the child in its coat among the hot pipes, orange steam, a
//                  bare bulb; wisps of steam rise off the coat's shoulders; the cat lies on the warm pump housing.
//   (b) «far too hot»  first person: the wall's dial thermometer needle slams to +41°; the view fogs over with
//                  condensation, drops at the edges; the child looks down and unzips the coat, steam off the jumper.
//   (c) «far too cold» the steel door bangs open onto the road: the same child, the same damp coat; the steam off
//                  it turns into a white plume, the condensation freezes into frost at the edges of the view, the
//                  street board slams to −27°, snow; the cat walks along the pipe and then close to the child's legs.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, prog, smoothstep, keys, mulberry32, hash } from '../engine/util';
import { F, font } from '../engine/type';
import { garble, homeLabel, city } from '../city';
import { type Light, drawOpenHand } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, blotches, speckle, asphalt, boxMesh, cyl, ground, concreteTex, streetLight, concreteFence,
  POST_BASE, LIN, scaleRGB, mixRGB, lin, EYE, type Pov, type V3, type RGB,
} from './_kit';
import { Quadruped, OUR_CAT, type QuadSpec } from './_beasts';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const PX = 1.95; // pipe axis x (right of the road)
const PY = 1.25; // pipe axis height
const PR = 0.3; // cladding radius
const LOOP_Z = -34; // the П-loop over the road
const BOARD: V3 = [3.3, 4.4, -16]; // the LED board on its pole, behind the main (right of the road)
const JET_Z = -9.5; // the steam jet from a joint
const IX = 60; // the heat point's inside: its own set (the same building's interior), far from the road
const DOOR: V3 = [-5.2, 0, 2.4]; // the heat point's door on the road (faces +x)
const DIAL: V3 = [IX - 0.25, 1.62, -2.66]; // the dial thermometer on the inside wall

export default class Temp extends LitScene {
  chapter = 'temp';
  cat!: Quadruped;
  catSpec: QuadSpec = OUR_CAT;
  board!: THREE.Mesh; boardCv!: HTMLCanvasElement; boardTex!: THREE.CanvasTexture; boardText = ''; tickText = '';
  frost!: HTMLCanvasElement;
  snow: { x: number; y: number; z: number; sp: number; ph: number }[] = [];
  steam: { a: number; b: number; c: number; d: number }[] = [];
  lamps: V3[] = [];
  dialCv!: HTMLCanvasElement; dialBase!: HTMLCanvasElement; dialTex!: THREE.CanvasTexture;
  drops: { x: number; y: number; r: number; run: number }[] = [];

  override init() {
    this.initLit();
    this.hemi.intensity = 0.22;
    this.fogE.density = 0.03;
    const s = this.ctx.start;
    const words = this.ly.linesIn(s, s + 13).flatMap((l) => l.words);
    const all = (re: RegExp) => words.filter((q) => re.test(q.w));
    const T: Record<string, number> = { s };
    const far = all(/^far$/), too = all(/^too$/);
    T.far1 = far[0]!.start; T.too1 = too[0]!.start; T.hot = all(/^hot/)[0]!.start;
    T.far2 = far[1]!.start; T.too2 = too[1]!.start; T.cold = all(/^cold/)[0]!.start;
    T.line1 = all(/^It/)[0]!.start; // the board reads +41° from the first sung word of «far too hot» (the clock only before it)
    T.line2 = all(/^It/)[1]!.start; // «It's far too cold»: the board flips as this line starts (the sung line must not sit under +41°)
    T.end = s + 13;
    this.T = T;
    // shots: the road along the main from high behind, the cat on the pipe; the board flipping to +41° and the
    // steam jet in first person; low behind the child, the board high on its pole over the road as it slams to −27°;
    // from above in the snow as the cat jumps down; over the shoulder walking on with the cat; the torch on the cat
    // shots: inside the heat point from behind (the coat among the hot pipes: the 2 s hook); first person on the dial
    // and looking down to unzip; the door bangs open: low behind the child stepping out onto the road as the board slams
    // to −27°; from above in the snow as the cat jumps down; over the shoulder walking on with the cat
    this.shots = [
      [T.s, T.line1 + 1.25, { k: 'back', d: 1.2, h: 1.5, side: -1, ahead: 1, aimY: PORTRAIT ? 0.9 : 0.6 }],
      [T.line2, T.line2 + 1.7, { k: 'free', p: [1.6, 1.25, DOOR[2] + 4.2], p1: [1.4, 1.2, DOOR[2] + 3.6], look: [DOOR[0] + 0.4, 1.0, DOOR[2] - 0.2], look1: [PORTRAIT ? -0.3 : -1.2, 1.0, DOOR[2] - 1.6], fov: PORTRAIT ? 66 : 50 }],
      [T.line2 + 1.7, T.cold + (PORTRAIT ? 0.15 : -0.15), { k: 'back', d: 1.3, h: 0.8, side: 1, ahead: 1, aimY: PORTRAIT ? 1.7 : 2.4, yaw: PORTRAIT ? 0.1 : 0.3 }],
      [T.cold + (PORTRAIT ? 0.15 : -0.15), T.cold + 1.7, { k: 'high', d: 0.4, d1: 0.5, h: 0.6, side: -0.5, ahead: PORTRAIT ? 0 : 0.7 }],
      [T.cold + 1.7, T.cold + 3.6, { k: 'ots', d: 2.0, h: 2.2, side: -1.3, ahead: 0.5, yaw: 0.2, aimY: PORTRAIT ? 0 : 1.6 }],
    ];
    this.initKid(9);
    this.build();
    this.cat = new Quadruped(this.catSpec, this.three, 80);
    this.tickText = 'МОРОЗ · ОСТАВАЙТЕСЬ ДОМА · '; // plain: this street is near home (garble only in the unfamiliar district)
    this.buildFrost();
    const r = mulberry32(3);
    for (let i = 0; i < 1600; i++) this.snow.push({ x: (r() - 0.5) * 16, y: r() * 8, z: 4 - r() * 36, sp: 0.6 + r() * 0.6, ph: r() * 6.28 });
    for (let i = 0; i < 70; i++) this.steam.push({ a: r(), b: r(), c: r(), d: r() });
    // condensation drops on the view (dense at the edges)
    for (let i = 0; i < 260; i++) { const e = r() ** 0.5, side = Math.floor(r() * 4), u = r(); const d = (1 - e) * 0.3; this.drops.push({ x: side === 0 ? u : side === 1 ? 1 - d : side === 2 ? u : d, y: side === 0 ? d : side === 1 ? u : side === 2 ? 1 - d : u, r: 2 + r() * 6 * (PORTRAIT ? 1.2 : 1), run: r() < 0.12 ? 0.2 + r() * 0.6 : 0 }); }
    this.obstacles = () => { const b = this.planeBox(this.board); return b ? [b] : []; };
  }

  build() {
    const S = this.three;
    const { map, rough } = asphalt(71, [5, 30], { puddles: 0 });
    ground(S, 11, 140, 0, -40, lit([0.7, 0.7, 0.7], { map, roughMap: rough, rough: 0.75 }));
    // verges of frozen mud / weeds either side
    const verge = concreteTex(72, [6, 40], { base: '#3b3a30', stains: 60 });
    ground(S, 30, 140, -20.5, -40, lit([0.7, 0.7, 0.7], { map: verge, rough: 1 }), -0.01);
    ground(S, 30, 140, 20.5, -40, lit([0.7, 0.7, 0.7], { map: verge, rough: 1 }), -0.01);
    // the heating main: two clad pipes on concrete T-supports, joints every 6 m, then the П-loop over the road
    const clad = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = '#9aa0a2'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 128) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x, 0, 4, h); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x + 4, 0, 3, h); }
      blotches(c, w, h, 30, () => 'rgba(80,70,50,0.25)', 6, 40, 73); speckle(c, w, h, 3000, 0.2, 74);
    }, { repeat: [30, 1] });
    const cladM = lit([0.8, 0.8, 0.8], { map: clad, rough: 0.42, metal: 0.25 });
    const conc = lit([0.55, 0.55, 0.52], { map: concreteTex(75, [1, 1]), rough: 0.9 });
    const pipeRun = (x: number, y: number, z0: number, z1: number) => { cyl(S, [x, y, z0], [x, y, z1], PR, cladM, { seg: 20 }); };
    for (const dx of [0, 0.8]) pipeRun(PX + dx, PY, 12, LOOP_Z);
    for (let z = 10; z > LOOP_Z; z -= 6) {
      boxMesh(S, 1.6, 0.2, 0.5, PX + 0.4, PY - PR - 0.12, z, conc);
      boxMesh(S, 0.4, PY - PR - 0.2, 0.4, PX + 0.4, (PY - PR - 0.2) / 2, z, conc);
      for (const dx of [0, 0.8]) cyl(S, [PX + dx, PY, z + 0.08], [PX + dx, PY, z - 0.08], PR + 0.035, lit([0.4, 0.4, 0.4], { rough: 0.5, metal: 0.6 }), { seg: 20 });
    }
    // the loop: up, across the road at 6 m, down on the far side and back along the left verge
    const LH = 6.2;
    for (const dx of [0, 0.8]) {
      const zz = LOOP_Z - dx;
      cyl(S, [PX + dx, PY, zz], [PX + dx, LH, zz], PR, cladM, { seg: 20 });
      cyl(S, [PX + dx, LH, zz], [-PX - 0.8 + dx, LH, zz], PR, cladM, { seg: 20 });
      cyl(S, [-PX - 0.8 + dx, LH, zz], [-PX - 0.8 + dx, PY, zz], PR, cladM, { seg: 20 });
      cyl(S, [-PX - 0.8 + dx, PY, zz], [-PX - 0.8 + dx, PY, zz - 30], PR, cladM, { seg: 20 });
    }
    boxMesh(S, 0.5, LH, 0.5, PX + 1.4, LH / 2, LOOP_Z - 0.4, conc);
    boxMesh(S, 0.5, LH, 0.5, -PX - 1.6, LH / 2, LOOP_Z - 0.4, conc);
    // the promzona fence behind the main on the right; warehouses and a chimney beyond
    const dark = lit([0.07, 0.07, 0.075], { rough: 0.9 });
    for (const [x, z, w, h, d] of [[18, -20, 16, 10, 30], [-18, -26, 14, 8, 22], [4, -70, 40, 18, 12], [-26, -60, 20, 14, 14]] as const) boxMesh(S, w, h, d, x, h / 2, z, dark);
    cyl(S, [10, 0, -80], [10, 45, -80], 2.2, dark, { r1: 1.3 });
    const winM = glowMat([1.0, 0.72, 0.35], 1.3);
    const rr = mulberry32(9);
    for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), winM); m.position.set(-12 + rr() * 30, 2 + rr() * 14, -63.9); S.add(m); }
    // streetlights along the left side of the road
    for (const z of [9, -16, -34, -52]) {
      const hp = streetLight(S, -4.6, z, { h: 7, arm: [1.6, 0, 0] });
      this.lamps.push(hp);
      this.addLamp(hp, { k: 45, angle: 1.0, shadow: z === -16, target: [hp[0] + 1.2, 0, hp[2]] });
    }
    // ---- the heat point (ЦТП) by the road: a brick box the main dives into, its steel door ajar, warm light and steam
    const brick = lit([0.62, 0.62, 0.62], { map: concreteTex(76, [3, 1], { base: '#5e3526', stains: 40 }), rough: 0.9 });
    boxMesh(S, 4.2, 3.4, 7.5, -7.3, 1.7, 2.5, brick);
    boxMesh(S, 4.5, 0.2, 7.8, -7.3, 3.45, 2.5, conc);
    const dg = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.05), glowMat([1.0, 0.5, 0.2], 0.55)); dg.position.set(DOOR[0] + 0.01, 1.03, DOOR[2]); dg.rotation.y = Math.PI / 2; S.add(dg);
    boxMesh(S, 0.05, 2.05, 0.95, DOOR[0] + 0.475 * 0.985, 1.03, DOOR[2] - 0.475 - 0.475 * 0.174, lit([0.2, 0.24, 0.22], { rough: 0.6, metal: 0.4 }), { ry: 1.745 }); // the leaf swung wide open
    this.addPoint([DOOR[0] + 0.5, 1.7, DOOR[2]], [1.0, 0.5, 0.2], 3.5, 7);
    // ---- its inside (a separate set): painted walls, rusty pipes, valves, a pump, a bare bulb, the dial thermometer
    {
      const wallT = canvasTex(512, 256, (c, w, h) => {
        c.fillStyle = '#b9b2a0'; c.fillRect(0, 0, w, h); c.fillStyle = '#35523f'; c.fillRect(0, h * 0.5, w, h * 0.5);
        c.fillStyle = '#233a2c'; c.fillRect(0, h * 0.5 - 3, w, 4);
        blotches(c, w, h, 50, () => 'rgba(70,50,30,0.25)', 8, 60, 77); speckle(c, w, h, 4000, 0.18, 78);
      }, { repeat: [3, 1] });
      const wallM = lit([0.8, 0.8, 0.8], { map: wallT, rough: 0.8, side: THREE.DoubleSide });
      const X0 = IX - 3, X1 = IX + 3, Z0 = -2.8, Z1 = 4.4, HH = 3.2;
      ground(S, X1 - X0, Z1 - Z0, IX, (Z0 + Z1) / 2, lit([0.5, 0.5, 0.48], { map: concreteTex(79, [3, 3], { stains: 80 }), rough: 0.7 }));
      boxMesh(S, X1 - X0, HH, 0.1, IX, HH / 2, Z0, wallM); boxMesh(S, X1 - X0, HH, 0.1, IX, HH / 2, Z1, wallM);
      boxMesh(S, 0.1, HH, Z1 - Z0, X0, HH / 2, (Z0 + Z1) / 2, wallM); boxMesh(S, 0.1, HH, Z1 - Z0, X1, HH / 2, (Z0 + Z1) / 2, wallM);
      boxMesh(S, X1 - X0, 0.1, Z1 - Z0, IX, HH, (Z0 + Z1) / 2, lit([0.35, 0.34, 0.3], { rough: 0.9 }));
      const rust = lit([0.62, 0.62, 0.62], { map: concreteTex(80, [8, 1], { base: '#4a3226', stains: 90 }), rough: 0.55, metal: 0.35 });
      for (const [y, rr] of [[0.55, 0.2], [1.05, 0.16], [2.55, 0.12]] as const) cyl(S, [X0, y, Z0 + 0.35], [X1, y, Z0 + 0.35], rr, rust, { seg: 18 });
      for (const x of [IX - 2.3, IX + 2.2]) cyl(S, [x, 0, Z0 + 0.35], [x, HH, Z0 + 0.35], 0.14, rust, { seg: 14 });
      cyl(S, [X0 + 0.35, 1.9, Z0], [X0 + 0.35, 1.9, Z1], 0.15, rust, { seg: 16 });
      const red = lit([0.5, 0.05, 0.03], { rough: 0.5, metal: 0.3 });
      for (const x of [IX - 1.3, IX + 1.1]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), red); w.position.set(x, 1.05, Z0 + 0.6); S.add(w); cyl(S, [x, 1.05, Z0 + 0.35], [x, 1.05, Z0 + 0.6], 0.03, red); }
      boxMesh(S, 1.1, 0.8, 0.7, IX + 1.9, 0.4, -1.4, lit([0.18, 0.28, 0.35], { rough: 0.5, metal: 0.4 }));
      cyl(S, [IX + 1.9, 0.8, -1.4], [IX + 1.9, 0.8, Z0 + 0.35], 0.1, rust, { seg: 12 });
      // the bare bulb on its flex
      cyl(S, [IX + 0.3, HH, 0.2], [IX + 0.3, 2.62, 0.2], 0.008, lit([0.05, 0.05, 0.05]));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), glowMat([1.0, 0.75, 0.4], 3)); bulb.position.set(IX + 0.3, 2.56, 0.2); S.add(bulb);
      this.addPoint([IX + 0.3, 2.45, 0.2], [1.0, 0.6, 0.28], 10, 14);
      this.addPoint([IX - 1.4, 0.6, -2.0], [1.0, 0.35, 0.1], 2.5, 5); // the heat off the pipes, low and red
      this.addPoint([IX + 1.2, 2.2, 3.4], [1.0, 0.62, 0.32], 5, 9); // a second bulb by the door: the coat reads yellow from behind
      // the dial thermometer: a steel rim, a paper face, the needle drawn per frame
      this.dialBase = document.createElement('canvas'); this.dialBase.width = 512; this.dialBase.height = 512;
      const c = this.dialBase.getContext('2d')!;
      c.fillStyle = '#e9e2cf'; c.beginPath(); c.arc(256, 256, 250, 0, Math.PI * 2); c.fill();
      const ang = (v: number) => (-135 + ((v + 40) / 90) * 270) * Math.PI / 180;
      c.lineWidth = 34; c.strokeStyle = '#b3261e'; c.beginPath(); c.arc(256, 256, 200, ang(30) - Math.PI / 2, ang(50) - Math.PI / 2); c.stroke();
      c.lineWidth = 34; c.strokeStyle = '#3a6fa0'; c.beginPath(); c.arc(256, 256, 200, ang(-40) - Math.PI / 2, ang(-20) - Math.PI / 2); c.stroke();
      for (let v = -40; v <= 50; v += 2) { const a = ang(v), big = v % 10 === 0; c.strokeStyle = '#1b1712'; c.lineWidth = big ? 6 : 2.5; c.beginPath(); c.moveTo(256 + Math.sin(a) * (big ? 168 : 182), 256 - Math.cos(a) * (big ? 168 : 182)); c.lineTo(256 + Math.sin(a) * 222, 256 - Math.cos(a) * 222); c.stroke(); }
      c.fillStyle = '#1b1712'; c.font = font(F.metro(900), 40); c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let v = -40; v <= 50; v += 20) { const a = ang(v); c.fillText(String(v), 256 + Math.sin(a) * 128, 256 - Math.cos(a) * 128); }
      c.font = font(F.metro(900), 44); c.fillText('°C', 256, 350);
      blotches(c, 512, 512, 20, () => 'rgba(120,90,40,0.15)', 10, 60, 81);
      this.dialCv = document.createElement('canvas'); this.dialCv.width = 512; this.dialCv.height = 512;
      this.dialTex = new THREE.CanvasTexture(this.dialCv); this.dialTex.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 48), new THREE.MeshStandardMaterial({ map: this.dialTex, roughness: 0.4, emissive: new THREE.Color(1, 1, 1), emissiveMap: this.dialTex, emissiveIntensity: 0.25 }));
      face.position.set(DIAL[0], DIAL[1], DIAL[2]); S.add(face);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.025, 10, 48), lit([0.5, 0.5, 0.5], { metal: 0.8, rough: 0.3 })); rim.position.set(DIAL[0], DIAL[1], DIAL[2] + 0.01); S.add(rim);
    }
    // the LED board: a steel box on a pole
    cyl(S, [BOARD[0], 0, BOARD[2]], [BOARD[0], BOARD[1] - 0.6, BOARD[2]], 0.09, lit([0.25, 0.25, 0.25], { metal: 0.6, rough: 0.5 }));
    boxMesh(S, 2.7, 1.5, 0.3, BOARD[0] - Math.sin(-0.2) * 0.17, BOARD[1], BOARD[2] - Math.cos(-0.2) * 0.17, lit([0.06, 0.06, 0.06], { rough: 0.5, metal: 0.2 }), { ry: -0.2 });
    this.boardCv = document.createElement('canvas'); this.boardCv.width = 512; this.boardCv.height = 256;
    this.boardTex = new THREE.CanvasTexture(this.boardCv); this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.25), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false, fog: false }) /* the number is the story: it cuts through the haze */);
    (this.board.material as THREE.MeshBasicMaterial).color.setScalar(3.2); // LEDs glow above the haze
    this.board.position.set(BOARD[0], BOARD[1], BOARD[2]); this.board.rotation.y = -0.2; S.add(this.board);
    this.addPoint([BOARD[0] - 0.3, BOARD[1], BOARD[2] + 1.0], [1.0, 0.15, 0.08], 2.5);
  }

  /** The frost pattern: branching crystal lines, dense at the frame's edges (drawn once, revealed from the edges). */
  buildFrost() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d')!;
    const r = mulberry32(21);
    const branch = (x: number, y: number, a: number, L: number, w: number, d: number) => {
      if (d <= 0 || L < 4) return;
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      c.strokeStyle = `rgba(215,235,255,${0.35 + 0.35 * r()})`; c.lineWidth = w;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      for (let k = 0; k < 3; k++) { const t = 0.3 + r() * 0.6; branch(x + (x2 - x) * t, y + (y2 - y) * t, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), L * (0.35 + r() * 0.25), w * 0.7, d - 1); }
      branch(x2, y2, a + (r() - 0.5) * 0.4, L * 0.7, w * 0.85, d - 1);
    };
    const seeds = 44;
    for (let i = 0; i < seeds; i++) {
      // a seed on the border, growing inwards
      const side = Math.floor(r() * 4), u = r();
      const [x, y, a] = side === 0 ? [u * W, 0, Math.PI / 2] : side === 1 ? [W, u * H, Math.PI] : side === 2 ? [u * W, H, -Math.PI / 2] : [0, u * H, 0];
      branch(x, y, a + (r() - 0.5) * 1.1, (PORTRAIT ? 110 : 90) + r() * 110, 2.2, 4);
    }
    // a milky rime at the very edge
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, 'rgba(200,220,240,0)'); g.addColorStop(1, 'rgba(200,220,240,0.3)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    this.frost = cv;
  }

  inside(t: number) { return t < this.T.line2; }
  heat(t: number) { const T = this.T; return this.inside(t) ? 0.55 + 0.45 * smoothstep(T.too1, T.hot + 0.1, t) : 0; }
  cold(t: number) { const T = this.T; return 0.45 * smoothstep(T.line2, T.line2 + 0.5, t) + 0.55 * smoothstep(T.too2, T.cold + 0.1, t); }
  /** Condensation on the view: builds in the heat, freezes into the frost outside. */
  fogged(t: number) { const T = this.T; return this.inside(t) ? smoothstep(T.line1 + 1.0, T.hot, t) : 1 - smoothstep(T.line2, T.line2 + 0.9, t); }
  /** The coat's zip: 0 done up, 1 open (unzipped inside, still open outside). */
  unzip(t: number) { const T = this.T; return smoothstep(T.hot + 0.3, T.line2 - 0.08, t); }
  dialValue(t: number) { const T = this.T; return keys(t, [[T.s, 22], [T.too1 - 0.05, 31], [T.too1 + 0.1, 46, ease.outCubic], [T.too1 + 0.28, 39], [T.hot + 0.1, 41.5], [T.hot + 0.3, 41]]); }

  /** Outside: out of the heat point's door, onto the road, along it; the cold slows the child down. */
  camZ(t: number) { const T = this.T; const t1 = Math.min(Math.max(t, T.line2), T.cold); return DOOR[2] - 1.05 * (t1 - T.line2) - 0.6 * Math.max(0, t - T.cold); }
  camX(t: number) { const T = this.T; return lerp(DOOR[0] + 0.45, 0.2, ease.inOutCubic(smoothstep(T.line2, T.line2 + 1.8, t))); }

  catAt(t: number) {
    const T = this.T, z = this.camZ(t);
    // inside: curled up on the warm pump housing, watching the child
    if (this.inside(t)) return { pos: new THREE.Vector3(IX + 1.75, 0.8, -1.35), heading: 2.4, pitch: 0, dist: 0, speed: 0, jump: 0 };
    // on the pipe, 2.5 m ahead of the child; on «cold» a jump down and then beside the child's left foot... right foot
    const jump0 = T.cold + 0.3, jump1 = jump0 + 0.45;
    const onPipe = new THREE.Vector3(PX, PY + PR, z - 4.6);
    const ground0 = new THREE.Vector3(1.0, 0, z - 3.6), beside = new THREE.Vector3(PORTRAIT ? 0.3 : 0.45, 0, z - (PORTRAIT ? 4.2 : 2.6));
    const dist = (T.end - T.s) * 1.05 - (z - 6) * -1;
    if (t < jump0) return { pos: onPipe, heading: Math.PI / 2, pitch: 0, dist: (6 - z), speed: 1.05, jump: 0 };
    if (t < jump1) {
      const u = (t - jump0) / (jump1 - jump0);
      const p = onPipe.clone().lerp(ground0, u); p.y += 4 * 0.35 * u * (1 - u);
      const d = ground0.clone().sub(onPipe);
      return { pos: p, heading: Math.atan2(-d.z, d.x), pitch: -0.3, dist: 6 - z, speed: 0, jump: Math.sin(Math.PI * u) };
    }
    const u = smoothstep(jump1, jump1 + 1.0, t);
    const p = ground0.clone().lerp(beside, u);
    void dist;
    return { pos: p, heading: Math.PI / 2 + 0.25 * (1 - u), pitch: 0, dist: 6 - z + u * 0.8, speed: 1.05, jump: 0 };
  }

  pov(t: number): Pov {
    const T = this.T;
    if (PROOF === 'main') return { p: [-1.5, 1.5, 3], yaw: -0.35, pitch: 0.12, walk: 0 };
    if (PROOF === 'board') return { p: [BOARD[0] + 1.5, 2.2, BOARD[2] + 5], yaw: 0.22, pitch: 0.34, walk: 0, fov: PORTRAIT ? 60 : 44 };
    if (PROOF === 'cat') { const c = this.catAt(t); const p: V3 = [c.pos.x - 1.3, c.pos.y + 0.3, c.pos.z + 0.9]; return { p, yaw: this.yawTo(p, [c.pos.x, 0, c.pos.z]), pitch: -0.2, walk: 0, fov: PORTRAIT ? 55 : 40 }; }
    if (PROOF === 'loop') return { p: [0, 1.2, LOOP_Z + 14], yaw: 0, pitch: 0.2, walk: 0 };
    const E = ease.inOutCubic;
    if (this.inside(t)) {
      // at the dial, then looking down at the coat to unzip it
      const down = smoothstep(T.hot + 0.02, T.hot + 0.32, t);
      const lookD = this.yawTo([IX + 0.2, EYE, 1.0], DIAL);
      return { p: [IX + 0.2, EYE, 1.0], yaw: lookD + 0.04 * Math.sin(t * 1.3) + (PORTRAIT ? 0 : 0.06), pitch: lerp(0.2 + 0.02 * Math.sin(t * 1.7), PORTRAIT ? -1.0 : -1.08, down), walk: 0 };
    }
    const z = this.camZ(t), x = this.camX(t);
    // the board stays in view the whole chapter (its number is the story); small head turns around it
    const lookB = this.yawTo([x, EYE, z], BOARD);
    const road = lookB + (PORTRAIT ? -0.1 : -0.3) + keys(t, [[T.line2, 0.04], [T.too2, -0.03, E], [T.cold + 1.3, 0.02, E], [T.end, 0, E]]);
    const yaw = lerp(-Math.PI / 2 + 0.5, road, E(smoothstep(T.line2, T.line2 + 1.5, t)));
    const pitch = keys(t, [[T.line2, -0.04], [T.too2, 0.12, E], [T.cold + 0.6, 0.1], [T.cold + 1.3, -0.12, E], [T.end, PORTRAIT ? -0.16 : -0.06, E]]) + (PORTRAIT ? 0.02 : 0);
    return { p: [x, EYE, z], yaw, pitch, walk: 1 };
  }

  drawBoard(t: number) {
    const T = this.T, c = this.boardCv.getContext('2d')!;
    const w = 512, h = 256;
    c.fillStyle = '#070606'; c.fillRect(0, 0, w, h);
    const hot = false, cold = t >= T.line2 - 0.02;
    const main = cold ? '−27°' : '23:47';
    this.boardText = main;
    // LED dots: draw the text into a mask, then sample a dot grid
    const m = document.createElement('canvas'); m.width = 128; m.height = 64;
    const mc = m.getContext('2d')!;
    mc.fillStyle = '#000'; mc.fillRect(0, 0, 128, 64); mc.fillStyle = '#fff'; mc.font = font(F.metro(900), 38); mc.textAlign = 'center'; mc.textBaseline = 'middle';
    mc.fillText(main, 64, 26);
    // the ticker line below, plain (scrolls)
    mc.font = font(F.metro(900), 11); mc.textAlign = 'left';
    const tw = mc.measureText(this.tickText).width;
    const off = ((t - T.s) * 22) % (tw + 128);
    if (hot || cold) mc.fillText(this.tickText, 128 - off, 55);
    const d = mc.getImageData(0, 0, 128, 64).data;
    const flash = hot ? 0.93 + 0.07 * Math.sign(Math.sin((t - T.line1) * 9)) * (t < T.line1 + 0.7 ? 1 : 0) : cold ? 0.93 + 0.07 * Math.sign(Math.sin((t - T.line2) * 9)) * (t < T.line2 + 0.6 ? 1 : 0) : 1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const on = d[(y * 128 + x) * 4]! > 110;
      c.fillStyle = on ? `rgba(255,${cold ? 150 : 120},${cold ? 110 : 70},${flash})` : 'rgba(40,10,6,0.5)';
      c.beginPath(); c.arc(x * 4 + 2, y * 4 + 2, on ? 1.7 : 1.1, 0, Math.PI * 2); c.fill();
    }
    this.boardTex.needsUpdate = true;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    const hk = this.heat(t), ck = this.cold(t), inside = this.inside(t);
    // grade: warm orange steam inside the heat point, blue-grey in the cold outside
    const fogC = inside ? mixRGB([0.05, 0.03, 0.015], [0.16, 0.075, 0.025], hk) : mixRGB([0.018, 0.018, 0.022], [0.026, 0.032, 0.042], ck);
    this.fogE.color.setRGB(fogC[0], fogC[1], fogC[2]); this.fogE.density = inside ? 0.05 + 0.07 * hk : 0.03 + 0.012 * ck;
    this.hemi.color.setRGB(lerp(0.6, 0.55, ck), lerp(0.55, 0.65, ck), lerp(0.5, 0.8, ck)); this.hemi.intensity = inside ? 0.08 : 0.2 + 0.25 * ck;
    this.drawDial(t);
    const c = this.catAt(t);
    this.cat.pose({ pos: c.pos, heading: c.heading, pitch: c.pitch, dist: c.dist, speed: c.speed, t, jump: c.jump, tailUp: 0.85, tailWag: 0.05 });
    const P = this.pov(t);
    this.setCam(P, t, 1);
    const cam = this.cam;
    this.drawBoard(t);
    // the torch: along the road ahead, onto the steam, onto the cat
    const aim = inside
      ? new THREE.Vector3(DIAL[0], DIAL[1] - 0.1, DIAL[2]).lerp(new THREE.Vector3(IX + 0.35, 0, -0.3), smoothstep(T.hot + 0.02, T.hot + 0.32, t))
      : new THREE.Vector3(0.5, 0.6, cam.position.z - 6).lerp(c.pos.clone().add(new THREE.Vector3(0, 0.15, 0)), smoothstep(T.cold + 0.8, T.cold + 1.4, t));
    const pose = this.torch(t, { raise: 1, on: 1, walk: 1, aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : 0.8, spot: clamp(20 * (aim.distanceTo(cam.position) / 5) ** 2, 3, 28) });
    if (!PROOF) this.cut(t, P, pose, inside ? { speed: 0, armL: 0.35 * smoothstep(T.line1, T.line1 + 0.8, t), headDown: -0.15 } : { speed: t < T.cold ? 1.05 : 0.6, dist: 6 - this.camZ(t) });
    const tdir = pose ? pose.target.clone().sub(pose.head).normalize() : null;
    this.cat.setShine(pose ? 0.02 + this.cat.shine(pose.head, tdir, 0.95) : 0.02, 2);
    // ---- render
    const top = mixRGB(scaleRGB(LIN.shadow, 0.9), [0.03, 0.035, 0.05], ck);
    const hor = mixRGB(mixRGB(scaleRGB(LIN.fog, 0.8), scaleRGB(LIN.smog, 0.5), 0.45 + 0.4 * hk), [0.12, 0.14, 0.17], ck);
    this.renderWorld(out, t, { sky: { top, horizon: hor, low: scaleRGB(LIN.shadow, 1), horizonY: 0.45, haze: 1 } });
    const g = this.glow3D;
    for (const hp of this.lamps) g.add(hp[0], hp[1], hp[2], 0.45, 0.35, LIN.sodium, 2.4, 4);
    // steam: a jet from the joint across the road; in the cold a slow white plume
    // steam off the coat: wisps rising from the child's shoulders inside; outside the damp coat smokes white in the cold
    {
      const kp = new THREE.Vector3(P.p[0], 0, P.p[2]);
      const outK = inside ? 0 : 1 - smoothstep(T.line2 + 2.2, T.line2 + 4.0, t);
      const k = inside ? 0.6 + 0.4 * hk : outK;
      if (k > 0.01) for (let i = 0; i < 26; i++) {
        const s0 = this.steam[i]!, life = 1.4, ph = ((t * (0.7 + s0.a * 0.5) + s0.b * life) % life) / life;
        const a = s0.c * 6.28, rr = 0.12 + 0.1 * s0.d + ph * 0.15;
        const col: RGB = inside ? [0.55, 0.4, 0.25] : [0.6, 0.65, 0.72];
        const y0 = inside && !this.third ? 0.75 : 0.85;
        g.add(kp.x + Math.cos(a) * rr, y0 + ph * (0.7 + s0.a * 0.6), kp.z + Math.sin(a) * rr * 0.7, 0.1 + ph * 0.35, 0.1 + ph * 0.35, col, 0.09 * k * (1 - ph) * (0.6 + s0.a * 0.8), 1.4);
      }
      if (inside) for (let i = 26; i < 70; i++) { // leaking valves: steam hangs under the ceiling
        const s0 = this.steam[i]!, life = 2.4, ph = ((t * (0.4 + s0.a * 0.3) + s0.b * life) % life) / life;
        g.add(IX - 1.3 + (s0.c - 0.5) * 4 + ph * 0.8, 1.1 + ph * 1.9, -2.2 + s0.d * 3.5, 0.3 + ph * 0.9, 0.3 + ph * 0.9, [0.6, 0.4, 0.22], 0.05 * (1 - ph) * (0.5 + s0.a), 1.4);
      }
    }
    const jetK = inside ? 0 : smoothstep(T.line2 - 0.1, T.line2 + 0.3, t);
    if (jetK > 0) {
      for (const s of this.steam) {
        const life = 1.6, ph = ((t * (0.8 + s.a * 0.6) + s.b * life) % life) / life;
        const hot = 1 - ck;
        const dir = new THREE.Vector3(-1, 0.25 + ck * 1.4, (s.c - 0.5) * 0.4).normalize();
        const dist = ph * (hot * 4.5 + ck * 2.2) * (0.6 + s.d * 0.6);
        const p = new THREE.Vector3(PX - PR, PY + 0.1, JET_Z).addScaledVector(dir, dist);
        p.y += ph * ph * (0.8 + ck * 2.5);
        const size = 0.15 + ph * (1.2 + ck * 1.2);
        const col = mixRGB(mixRGB(scaleRGB(LIN.sodium, 0.35), [0.5, 0.45, 0.4], 0.5), [0.55, 0.6, 0.68], ck);
        g.add(p.x, p.y, p.z, size, size, col, (0.12 - 0.08 * ck) * jetK * (1 - ph) * (0.6 + s.a * 0.8), 1.4);
      }
    }
    this.flushGlow(out);
    // snow in the cold (lit near the lamps and in the torch)
    const lb = this.lines3D;
    if (ck > 0.01) {
      for (const q of this.snow) {
        const y = 8 - ((((t - T.too2) * q.sp + q.ph) % 8) + 8) % 8;
        const x = q.x + Math.sin(t * 0.8 + q.ph) * 0.3, z = q.z + (cam.position.z - 6);
        const col = [0.75, 0.8, 0.9] as RGB;
        lb.seg(x, y, z, x + 0.01, y + 0.02, z, 2.2, col[0], col[1], col[2], 0.55 * ck);
      }
    }
    lb.render(renderer, out, cam); lb.clear();
    this.beam(out, t, pose, PROOF ? 0 : 1, { density: 0.018, maxDist: clamp(aim.distanceTo(cam.position) - 0.5, 0.8, 8) });
    // ---- QA text: the board's number and its ticker (mojibake)
    // after the cold beat has read (last shot: walking on with the cat) the board is background behind the torch haze
    const late = t > T.cold + 1.7;
    if (!inside) this.logPlane(this.board, this.boardText, 'sign', { frac: [0.12, 0.05, 0.88, 0.72], minPx: 14, id: late ? 'scenery:temp-board' : 'plane:temp-board', scenery: late });
    if (!inside) this.logPlane(this.board, this.tickText, 'sign', { frac: [0.02, 0.78, 0.98, 0.95], minPx: 10, letterFrac: 0.6, id: 'scenery:temp-ticker', scenery: true });
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.2 + 0.1 * ck, warm: 0.25 * (1 - ck), torch: 1 };
    if (!PROOF) {
      // frost on the eye's edges (under the hand and the text)
      if (ck > 0.01) { u.save(); u.globalAlpha = 0.4 * ck; this.drawFrost(u, ck); u.restore(); }
      const fg = this.fogged(t);
      if (fg > 0.01 && !this.third) this.drawFog(u, t, fg, inside ? 0 : ck);
      if (inside && !this.third && P.pitch < -0.5) this.drawCoat(u, t, light);
      this.torchHand(u, pose, light);
      this.heading(u, t, f);
      this.callout(u, t, homeLabel('temp'), T.line2 + 0.35, T.line2 + 3.3, () => this.onScreen(0, 8, cam.position.z - 60), { places: [city().home.name] });
      this.callout(u, t, 'КОШКА · 1', T.cold + 1.5, T.end + 1, () => { const h = this.cat.head.getWorldPosition(new THREE.Vector3()); return this.onScreen(h.x, h.y + 0.08, h.z); });
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.5 };
  }

  drawDial(t: number) {
    const c = this.dialCv.getContext('2d')!;
    c.clearRect(0, 0, 512, 512); c.drawImage(this.dialBase, 0, 0);
    const v = this.dialValue(t), a = (-135 + ((v + 40) / 90) * 270) * Math.PI / 180 + Math.sin(t * 40) * 0.004;
    c.save(); c.translate(256, 256); c.rotate(a);
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(-9, 30); c.lineTo(0, -215); c.lineTo(9, 30); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = '#222'; c.beginPath(); c.arc(256, 256, 20, 0, Math.PI * 2); c.fill();
    this.dialTex.needsUpdate = true;
  }

  /** Condensation on the view: a warm milky film from the edges, drops that bead and run; outside it freezes. */
  drawFog(u: CanvasRenderingContext2D, t: number, k: number, freeze: number) {
    u.save();
    const R = Math.hypot(W, H) / 2;
    const g = u.createRadialGradient(W / 2, H * 0.45, R * lerp(0.9, 0.25, k), W / 2, H * 0.45, R * 1.05);
    const tint = freeze > 0 ? '215,228,240' : '240,222,196';
    g.addColorStop(0, `rgba(${tint},0)`); g.addColorStop(0.55, `rgba(${tint},${0.2 * k})`); g.addColorStop(1, `rgba(${tint},${0.45 * k})`);
    u.fillStyle = g; u.fillRect(0, 0, W, H);
    for (const d of this.drops) {
      const run = d.run ? Math.max(0, (t - this.T.line1 - 1.2) * d.run * 60) % (H * 0.4) : 0;
      const x = d.x * W, y = d.y * H + run, r = d.r * (0.4 + 0.6 * k);
      if (d.run && run > 0) { u.strokeStyle = `rgba(20,14,10,${0.25 * k})`; u.lineWidth = r * 0.8; u.beginPath(); u.moveTo(x, y - run); u.lineTo(x, y); u.stroke(); }
      u.fillStyle = `rgba(30,20,12,${0.35 * k})`; u.beginPath(); u.arc(x, y, r, 0, Math.PI * 2); u.fill();
      u.fillStyle = `rgba(255,245,225,${0.55 * k})`; u.beginPath(); u.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, Math.PI * 2); u.fill();
    }
    u.restore();
  }

  /** Looking down at the coat: the collar is at the bottom of the view, the hem further up, the boots and the floor
   *  beyond it; the free hand pulls the zip away from the chin and the jumper underneath steams. */
  drawCoat(u: CanvasRenderingContext2D, t: number, light: Light) {
    const z = this.unzip(t), cx = W * (PORTRAIT ? 0.47 : 0.45);
    const hem = H * (PORTRAIT ? 0.5 : 0.44), L = light.amb + 0.25;
    const col = (r: number, g: number, b: number, k: number) => `rgb(${Math.round(r * k * L * 2.1)},${Math.round(g * k * L * 2.1)},${Math.round(b * k * L * 2.1)})`;
    const half = (y: number) => lerp(W * (PORTRAIT ? 0.36 : 0.23), W * (PORTRAIT ? 0.5 : 0.36), (y - hem) / (H - hem)); // the body widens towards the eye
    const zipY = lerp(H * 0.97, hem + H * 0.07, z); // the pull travels from the chin away to the hem
    const gap = (y: number) => (y > zipY ? lerp(6, W * (PORTRAIT ? 0.13 : 0.09), (y - zipY) / Math.max(1, H - zipY)) : 3);
    u.save();
    // the boots beyond the hem, on the concrete
    for (const sd of [-1, 1]) { u.fillStyle = col(22, 14, 10, 1); u.beginPath(); u.ellipse(cx + sd * W * 0.05, hem - H * 0.01, W * 0.03, H * 0.028, sd * 0.25, Math.PI, Math.PI * 2); u.fill(); }
    // the two fronts: rounded belly towards the hem, shaded to the sides
    for (const sd of [-1, 1]) {
      u.beginPath();
      u.moveTo(cx + sd * gap(H), H);
      for (let y = H; y >= hem; y -= 16) u.lineTo(cx + sd * gap(y), y);
      u.quadraticCurveTo(cx + sd * half(hem) * 0.7, hem - H * 0.03, cx + sd * half(hem), hem + H * 0.03);
      u.quadraticCurveTo(cx + sd * half(hem) * 1.12, (hem + H) / 2, cx + sd * half(H) * 1.05, H);
      u.closePath();
      const gr = u.createLinearGradient(cx, 0, cx + sd * half(H), 0); gr.addColorStop(0, col(150, 112, 22, 1)); gr.addColorStop(0.7, col(150, 112, 22, 0.75)); gr.addColorStop(1, col(150, 112, 22, 0.4));
      u.fillStyle = gr; u.fill();
      const vg = u.createLinearGradient(0, hem, 0, H); vg.addColorStop(0, 'rgba(0,0,0,0.35)'); vg.addColorStop(0.4, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.15)');
      u.fillStyle = vg; u.fill();
      u.strokeStyle = 'rgba(40,28,6,0.4)'; u.lineWidth = 3;
      for (let k = 0; k < 2; k++) { u.beginPath(); u.moveTo(cx + sd * (W * 0.07 + k * W * 0.08), hem + H * 0.06); u.quadraticCurveTo(cx + sd * (W * 0.11 + k * W * 0.09), H * 0.75, cx + sd * (W * 0.09 + k * W * 0.11), H); u.stroke(); }
      // the hem band and a pocket flap
      u.strokeStyle = 'rgba(50,34,6,0.6)'; u.lineWidth = 5; u.beginPath(); u.moveTo(cx + sd * 6, hem + H * 0.035); u.quadraticCurveTo(cx + sd * half(hem) * 0.6, hem, cx + sd * half(hem), hem + H * 0.04); u.stroke();
      u.fillStyle = 'rgba(60,40,8,0.5)'; u.fillRect(cx + sd * W * 0.1 - (sd < 0 ? W * 0.09 : 0), hem + H * 0.14, W * 0.09, H * 0.025);
    }
    // the jumper in the opening, the zip's teeth above the pull, the pull
    u.beginPath(); u.moveTo(cx - gap(H) + 2, H);
    for (let y = H; y >= zipY; y -= 12) u.lineTo(cx - gap(y) + 2, y);
    for (let y = zipY; y <= H; y += 12) u.lineTo(cx + gap(y) - 2, y);
    u.closePath(); u.fillStyle = col(62, 30, 36, 1); u.fill();
    u.strokeStyle = 'rgba(30,28,24,0.9)'; u.lineWidth = 6; u.setLineDash([4, 4]); u.beginPath(); u.moveTo(cx, zipY); u.lineTo(cx, hem + H * 0.03); u.stroke(); u.setLineDash([]);
    u.fillStyle = '#a4a39a'; u.fillRect(cx - 7, zipY - 22, 14, 26);
    // steam off the jumper, rising out of the opening
    for (let i = 0; i < 9; i++) {
      const ph = ((t * (0.6 + hash(i, 5) * 0.5) + hash(i, 6)) % 1), x = cx + (hash(i, 7) - 0.5) * gap(H) * 1.2 + Math.sin(t * 2 + i) * 20, y = lerp(H, zipY - H * 0.2, ph);
      const r = 30 + ph * 90, gg = u.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, `rgba(240,225,205,${0.22 * (1 - ph) * z})`); gg.addColorStop(1, 'rgba(240,225,205,0)');
      u.fillStyle = gg; u.fillRect(x - r, y - r, r * 2, r * 2);
    }
    u.restore();
    // the free hand pinches the pull (from the bottom left)
    drawOpenHand(u, { x: cx - 4, y: zipY - 14 }, { x: W * (PORTRAIT ? 0.0 : 0.1), y: H + 220 }, PORTRAIT ? 150 : 120, light, 'grab');
  }

  drawFrost(u: CanvasRenderingContext2D, k: number) {
    // reveal from the edges inwards: a radial mask that shrinks as k grows
    const tmp = (this as unknown as { _ft?: HTMLCanvasElement })._ft ??= document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const c = tmp.getContext('2d')!;
    c.clearRect(0, 0, W, H); c.drawImage(this.frost, 0, 0);
    c.globalCompositeOperation = 'destination-out';
    const R = Math.hypot(W, H) / 2;
    const g = c.createRadialGradient(W / 2, H / 2, R * lerp(1.0, 0.8, k), W / 2, H / 2, R * lerp(1.08, 1.02, k));
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    u.drawImage(tmp, 0, 0);
  }
}
void speckle; void lin; void prog; void blotches; void canvasTex;
