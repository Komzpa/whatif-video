// `temp` — «СЛИШКОМ ЖАРКО» / «СЛИШКОМ ХОЛОДНО» (TREATMENT p.52→62: the public thermometer, the needle slams right
// then left; heat shimmer and orange smog, then frost growing across the frame as branching lines and blue-grey
// haze; r5 item 9: the cat walks with the child, callout КОШКА · 1 — it is «твоя кошка» in the song). City stop: the heating main on the
// way out of the promzona. First person, walking:
//   (a) start      a road along the above-ground heating main (silver-clad pipes on concrete supports, the П-shaped
//                  expansion loop over the road ahead); the cat trots along the top of the warm pipe.
//   (b) «far too hot»  the street LED board ahead flips from the clock to +41°; a joint in the main blows a jet of
//                  steam across the road; orange haze; the board's line in mojibake says «stay at home».
//   (c) «far too cold» the board slams to −27°; frost grows in from the edges of the view, snow starts, the steam
//                  freezes into a white plume; the cat jumps down from the pipe and walks close to the child's legs.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, prog, smoothstep, keys, mulberry32 } from '../engine/util';
import { F, font } from '../engine/type';
import { garble, homeLabel, city } from '../city';
import { type Light } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, blotches, speckle, asphalt, boxMesh, cyl, ground, concreteTex, streetLight, concreteFence,
  POST_BASE, LIN, scaleRGB, mixRGB, lin, EYE, type Pov, type V3, type RGB,
} from './_kit';
import { Quadruped, CAT, type QuadSpec } from './_beasts';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const PX = 1.95; // pipe axis x (right of the road)
const PY = 1.25; // pipe axis height
const PR = 0.3; // cladding radius
const LOOP_Z = -34; // the П-loop over the road
const BOARD: V3 = [3.3, 4.4, -16]; // the LED board on its pole, behind the main (right of the road)
const JET_Z = -9.5; // the steam jet from a joint

export default class Temp extends LitScene {
  chapter = 'temp';
  cat!: Quadruped;
  catSpec: QuadSpec = { ...CAT, back: [0.34, 0.12, 0.03], belly: [0.62, 0.36, 0.14], legs: [0.5, 0.26, 0.08], muzzleC: [0.7, 0.5, 0.32], eye: [0.45, 0.95, 0.3], stripes: 70 };
  board!: THREE.Mesh; boardCv!: HTMLCanvasElement; boardTex!: THREE.CanvasTexture; boardText = ''; tickText = '';
  frost!: HTMLCanvasElement;
  snow: { x: number; y: number; z: number; sp: number; ph: number }[] = [];
  steam: { a: number; b: number; c: number; d: number }[] = [];
  lamps: V3[] = [];

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
    this.shots = [
      [T.s, T.too1 - 0.65, { k: 'wide', d: 1.0, h: 1.3, side: PORTRAIT ? -0.3 : -1.2, ahead: PORTRAIT ? 3 : 1.5, aimY: PORTRAIT ? 2.5 : 0.8, yaw: PORTRAIT ? 0.3 : 0 }],
      [T.line2 - 0.15, T.cold - 0.45, { k: 'back', d: 1.3, h: 0.8, side: 1, ahead: 1, aimY: PORTRAIT ? 0.9 : 2.4, yaw: PORTRAIT ? 0.1 : 0.3 }],
      [T.cold - 0.45, T.cold + 1.7, { k: 'high', d: 0.4, d1: 0.5, h: 0.6, side: -0.5, ahead: PORTRAIT ? 0 : 0.7 }],
      [T.cold + 1.7, T.cold + 3.6, { k: 'ots', d: 2.0, h: 2.2, side: -1.3, ahead: 0.5, yaw: 0.2, aimY: PORTRAIT ? 0 : 1.6 }],
    ];
    this.initKid(9);
    this.build();
    this.cat = new Quadruped(this.catSpec, this.three, 80);
    this.tickText = 'ЖАРА · ОСТАВАЙТЕСЬ ДОМА · '; // plain: this street is near home (garble only in the unfamiliar district)
    this.buildFrost();
    const r = mulberry32(3);
    for (let i = 0; i < 1600; i++) this.snow.push({ x: (r() - 0.5) * 16, y: r() * 8, z: 4 - r() * 36, sp: 0.6 + r() * 0.6, ph: r() * 6.28 });
    for (let i = 0; i < 70; i++) this.steam.push({ a: r(), b: r(), c: r(), d: r() });
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
    for (const z of [2, -16, -34, -52]) {
      const hp = streetLight(S, -4.6, z, { h: 7, arm: [1.6, 0, 0] });
      this.lamps.push(hp);
      this.addLamp(hp, { k: 45, angle: 1.0, shadow: z === -16, target: [hp[0] + 1.2, 0, hp[2]] });
    }
    // the LED board: a steel box on a pole
    cyl(S, [BOARD[0], 0, BOARD[2]], [BOARD[0], BOARD[1] - 0.6, BOARD[2]], 0.09, lit([0.25, 0.25, 0.25], { metal: 0.6, rough: 0.5 }));
    boxMesh(S, 2.7, 1.5, 0.3, BOARD[0] - Math.sin(-0.2) * 0.17, BOARD[1], BOARD[2] - Math.cos(-0.2) * 0.17, lit([0.06, 0.06, 0.06], { rough: 0.5, metal: 0.2 }), { ry: -0.2 });
    this.boardCv = document.createElement('canvas'); this.boardCv.width = 512; this.boardCv.height = 256;
    this.boardTex = new THREE.CanvasTexture(this.boardCv); this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.25), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false, fog: true }));
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

  heat(t: number) { const T = this.T; return smoothstep(T.too1, T.hot + 0.1, t) * (1 - smoothstep(T.line2, T.line2 + 0.5, t)); }
  cold(t: number) { const T = this.T; return 0.45 * smoothstep(T.line2, T.line2 + 0.5, t) + 0.55 * smoothstep(T.too2, T.cold + 0.1, t); }

  /** The camera walks along the road, stops under the steam, walks on in the cold. */
  camZ(t: number) { const T = this.T; const t1 = Math.min(t, T.cold); return 6 - 1.05 * (t1 - T.s) - 0.6 * Math.max(0, t - T.cold); }

  catAt(t: number) {
    const T = this.T, z = this.camZ(t);
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
    const z = this.camZ(t);
    const E = ease.inOutCubic;
    // the board stays in view the whole chapter (its number is the story); small head turns around it
    const lookB = this.yawTo([0.2, EYE, z], BOARD);
    const yaw = lookB + (PORTRAIT ? -0.1 : -0.3) + keys(t, [[T.s, 0.04], [T.too1, -0.03, E], [T.hot + 0.6, 0.03, E], [T.too2, -0.03, E], [T.cold + 1.3, 0.02, E], [T.end, 0, E]]);
    const pitch = keys(t, [[T.s, -0.06], [T.too1 - 0.3, 0.12, E], [T.hot + 0.9, 0.1], [T.far2, -0.04, E], [T.too2, 0.12, E], [T.cold + 0.6, 0.1], [T.cold + 1.3, -0.12, E], [T.end, PORTRAIT ? -0.16 : -0.06, E]]) + (PORTRAIT ? 0.02 : 0);
    return { p: [0.2, EYE, z], yaw, pitch, walk: 1 };
  }

  drawBoard(t: number) {
    const T = this.T, c = this.boardCv.getContext('2d')!;
    const w = 512, h = 256;
    c.fillStyle = '#070606'; c.fillRect(0, 0, w, h);
    const hot = t >= T.line1 - 0.05 && t < T.line2 - 0.02, cold = t >= T.line2 - 0.02;
    const main = cold ? '−27°' : hot ? '+41°' : '23:47';
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
    const flash = hot ? 0.75 + 0.25 * Math.sign(Math.sin((t - T.line1) * 9)) * (t < T.line1 + 0.7 ? 1 : 0) : cold ? 0.75 + 0.25 * Math.sign(Math.sin((t - T.line2) * 9)) * (t < T.line2 + 0.6 ? 1 : 0) : 1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const on = d[(y * 128 + x) * 4]! > 110;
      c.fillStyle = on ? `rgba(255,${cold ? 70 : 40},${cold ? 40 : 20},${flash})` : 'rgba(60,12,8,0.5)';
      c.beginPath(); c.arc(x * 4 + 2, y * 4 + 2, on ? 1.7 : 1.1, 0, Math.PI * 2); c.fill();
    }
    this.boardTex.needsUpdate = true;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    const hk = this.heat(t), ck = this.cold(t);
    // grade: warm orange haze in the heat, blue-grey in the cold
    const fogC = mixRGB(mixRGB([0.018, 0.018, 0.022], [0.09, 0.045, 0.015], hk), [0.026, 0.032, 0.042], ck);
    this.fogE.color.setRGB(fogC[0], fogC[1], fogC[2]); this.fogE.density = 0.03 + 0.02 * hk + 0.012 * ck;
    this.hemi.color.setRGB(lerp(0.6, 0.55, ck), lerp(0.55, 0.65, ck), lerp(0.5, 0.8, ck)); this.hemi.intensity = 0.2 + 0.25 * ck;
    const c = this.catAt(t);
    this.cat.pose({ pos: c.pos, heading: c.heading, pitch: c.pitch, dist: c.dist, speed: c.speed, t, jump: c.jump, tailUp: 0.85, tailWag: 0.05 });
    const P = this.pov(t);
    this.setCam(P, t, 1);
    const cam = this.cam;
    this.drawBoard(t);
    // the torch: along the road ahead, onto the steam, onto the cat
    const aim = new THREE.Vector3(0.5, 0.6, cam.position.z - 6).lerp(new THREE.Vector3(PX - 0.8, 1.4, JET_Z), hk * 0.8).lerp(c.pos.clone().add(new THREE.Vector3(0, 0.15, 0)), smoothstep(T.cold + 0.8, T.cold + 1.4, t));
    const pose = this.torch(t, { raise: 1, on: 1, walk: 1, aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : 0.8, spot: clamp(20 * (aim.distanceTo(cam.position) / 5) ** 2, 3, 28) });
    if (!PROOF) this.cut(t, P, pose, { speed: t < T.cold ? 1.05 : 0.6, dist: 6 - this.camZ(t) });
    const tdir = pose ? pose.target.clone().sub(pose.head).normalize() : null;
    this.cat.setShine(pose ? 0.02 + this.cat.shine(pose.head, tdir, 0.95) : 0.02, 2);
    // ---- render
    const top = mixRGB(scaleRGB(LIN.shadow, 0.9), [0.03, 0.035, 0.05], ck);
    const hor = mixRGB(mixRGB(scaleRGB(LIN.fog, 0.8), scaleRGB(LIN.smog, 0.5), 0.45 + 0.4 * hk), [0.12, 0.14, 0.17], ck);
    this.renderWorld(out, t, { sky: { top, horizon: hor, low: scaleRGB(LIN.shadow, 1), horizonY: 0.45, haze: 1 } });
    const g = this.glow3D;
    for (const hp of this.lamps) g.add(hp[0], hp[1], hp[2], 0.45, 0.35, LIN.sodium, 2.4, 4);
    // steam: a jet from the joint across the road; in the cold a slow white plume
    const jetK = smoothstep(T.hot - 0.15, T.hot + 0.1, t);
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
    this.logPlane(this.board, this.boardText, 'sign', { frac: [0.12, 0.05, 0.88, 0.72], minPx: 14, id: 'plane:temp-board' });
    if (t >= T.line1) this.logPlane(this.board, this.tickText, 'sign', { frac: [0.02, 0.78, 0.98, 0.95], minPx: 10, letterFrac: 0.6, id: 'scenery:temp-ticker', scenery: true });
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.2 + 0.1 * ck, warm: 0.25 * (1 - ck), torch: 1 };
    if (!PROOF) {
      // frost on the eye's edges (under the hand and the text)
      if (ck > 0.01) { u.save(); u.globalAlpha = 0.4 * ck; this.drawFrost(u, ck); u.restore(); }
      this.torchHand(u, pose, light);
      this.heading(u, t, f);
      this.callout(u, t, homeLabel('temp'), T.s + 0.25, T.too1 - 0.4, () => this.onScreen(0, 8, cam.position.z - 60), { places: [city().home.name] });
      this.callout(u, t, 'ОСТАВАЙТЕСЬ ДОМА', T.hot + 0.5, T.far2 + 1.4, () => this.onScreen(BOARD[0] - 1.0, BOARD[1] - 0.45, BOARD[2] - 0.2));
      this.callout(u, t, 'КОШКА · 1', T.cold + 1.5, T.end + 1, () => { const h = this.cat.head.getWorldPosition(new THREE.Vector3()); return this.onScreen(h.x, h.y + 0.08, h.z); });
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.5 };
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
