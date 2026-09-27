// `alone` — «С ТОБОЙ НИКТО НЕ ДРУЖИТ» (TREATMENT r5 item 9: "No one stays" needs someone alive who leaves: the
// cat stops, looks back once and leaves, onto a wall and over it into the dark; the POV hand reaches and stays
// empty; callout on the empty spot: КОШКА · 0). City stop: a street along an old brick wall, a девятиэтажка
// across the road. First person:
//   (a) start       walking along the wall, the cat trotting ahead; it stops and turns its head back.
//   (b) «No one stays»  it jumps onto the wall, walks a few steps along the top and drops down the far side.
//                   The free hand reaches out after it and stays open, empty. КОШКА · 0.
//   (c) «No one's your friend»  the child turns to the block across the road: lit windows with people in them,
//                   together, a TV's blue light; then the windows go dark one by one and the child walks on.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, smoothstep, keys, mulberry32, hash, prog } from '../engine/util';
import { homeLabel, city } from '../city';
import { drawOpenHand, pxAt, type Light } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, speckle, asphalt, boxMesh, cyl, ground, concreteTex, brickTex, streetLight,
  panelBlock, WindowPanes, POST_BASE, LIN, scaleRGB, lin, EYE, project, type Pov, type V3,
} from './_kit';
import { lampDie } from './_motifs';
import { Quadruped, CAT, type QuadSpec } from './_beasts';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const WX = -1.5; // the wall's axis
const WH = 1.45; // its height
const STOP_Z = 0; // where the child stops
const CZ = STOP_Z - 2.5; // where the cat stops
const BX = 22; // the block across the road (its facade at BX - 6)

export default class Alone extends LitScene {
  chapter = 'alone';
  cat!: Quadruped;
  catSpec: QuadSpec = { ...CAT, back: [0.34, 0.12, 0.03], belly: [0.62, 0.36, 0.14], legs: [0.5, 0.26, 0.08], muzzleC: [0.7, 0.5, 0.32], eye: [0.45, 0.95, 0.3], stripes: 70 };
  panes!: WindowPanes;
  people: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; off: number; tv: boolean; p: V3 }[] = [];
  lamps: V3[] = [];

  override init() {
    this.initLit();
    this.hemi.intensity = 0.13;
    this.fogE.density = 0.022;
    const s = this.ctx.start;
    const words = this.ly.linesIn(s, s + 13).flatMap((l) => l.words);
    const all = (re: RegExp) => words.filter((q) => re.test(q.w));
    const T: Record<string, number> = { s };
    T.no1 = all(/^No$/)[0]!.start; T.one = all(/^one$/)[0]!.start; T.stays = all(/^stays/)[0]!.start;
    T.no2 = all(/^No$/)[1]!.start; T.ones = all(/^one/)[1]!.start; T.friend = all(/^friend/)[0]!.start;
    T.end = this.ctx.end;
    // the cat's moves
    T.jump = T.one - 0.1; T.top = T.jump + 0.42; T.drop = T.stays + 0.95; T.gone = T.drop + 0.4;
    this.T = T;
    // shots: from high behind along the wall, the cat trotting ahead; its look back in first person; behind the
    // child as the cat goes up and along the wall, the child's arm reaching after it; over the left shoulder at the
    // empty wall top (КОШКА · 0), the arm still out; low behind the child, small under the block of lit windows;
    // walking on in first person as they go dark
    this.shots = [
      [s, T.no1 + 0.2, { k: 'wide', d: 0.9, h: 1.0, side: 1.2, ahead: 1.2, aimY: 0.4 }],
      [T.top + 0.1, T.gone + 0.1, { k: 'back', h: 2.8, side: -0.4, ahead: 0.6, yaw: 0.3, aimY: PORTRAIT ? -0.6 : 0.8, d: PORTRAIT ? 1.8 : 1.2 }],
      [T.gone + 0.1, T.friend - 0.15, { k: 'back', h: 3.4, side: -1.6, ahead: 0.5, yaw: 0.1, aimY: PORTRAIT ? -0.6 : 0.7, d: PORTRAIT ? 2.2 : 1.6 }],
      [T.friend - 0.15, T.friend + 3.6, { k: 'free', p: [-1.55, 2.2, 3.8], p1: [-1.55, 2.0, 3.0], look: [6, PORTRAIT ? -1.6 : 2.8, -6], look1: [7, PORTRAIT ? -1.2 : 3.2, -7], fov: PORTRAIT ? 80 : 64 }],
    ];
    this.initKid(17);
    this.build();
    this.cat = new Quadruped(this.catSpec, this.three, 80);
  }

  build() {
    const S = this.three;
    const { map, rough } = asphalt(121, [4, 30], { puddles: 8, base: '#242629' });
    ground(S, 14, 160, 8, -30, lit([0.6, 0.6, 0.6], { map, roughMap: rough, rough: 0.55 }));
    const pav = concreteTex(122, [2, 40], { base: '#55544e', joints: [2, 1], stains: 40 });
    ground(S, 3.4, 160, -0.2, -30, lit([0.6, 0.6, 0.6], { map: pav, rough: 0.9 }), 0.01);
    boxMesh(S, 0.25, 0.15, 160, 1.5, 0.075, -30, lit([0.45, 0.45, 0.43], { map: concreteTex(123, [40, 1]), rough: 0.85 }));
    ground(S, 80, 160, -42, -30, lit([0.16, 0.15, 0.13], { map: concreteTex(124, [10, 20], { base: '#2e2c26', stains: 80 }), rough: 1 }), -0.01);
    // ---- the brick wall with a concrete coping; a few bricks gone, a crack
    const bt = brickTex(125, [40, 1.6], '#5d3326');
    const brick = lit([0.7, 0.7, 0.7], { map: bt.map, normalMap: bt.nrm, rough: 0.9 });
    boxMesh(S, 0.38, WH, 120, WX, WH / 2, -20, brick);
    boxMesh(S, 0.48, 0.08, 120, WX, WH + 0.04, -20, lit([0.5, 0.5, 0.48], { map: concreteTex(126, [60, 1]), rough: 0.9 }));
    for (let z = 8; z > -50; z -= 3) boxMesh(S, 0.5, WH + 0.12, 0.5, WX, (WH + 0.12) / 2, z, brick); // pilasters
    // beyond the wall: dry weeds, a far promzona silhouette with a red light
    const dark = lit([0.05, 0.05, 0.055], { rough: 0.95 });
    for (const [x, z, w, h, d] of [[-30, -40, 30, 12, 20], [-22, -80, 40, 18, 16], [-50, -20, 14, 8, 30]] as const) boxMesh(S, w, h, d, x, h / 2, z, dark);
    cyl(S, [-34, 0, -70], [-34, 40, -70], 1.8, dark, { r1: 1.1 });
    const r = mulberry32(127);
    const weedM = lit([0.22, 0.2, 0.12], { rough: 1 });
    for (let i = 0; i < 160; i++) { const x = WX - 0.4 - r() * 6, z = 6 - r() * 40, h = 0.3 + r() * 0.8; cyl(S, [x, 0, z], [x + (r() - 0.5) * 0.2, h, z + (r() - 0.5) * 0.2], 0.008, weedM, { seg: 3, cast: false }); }
    // ---- the block across the road, and its windows (some with people inside)
    const wins = panelBlock(S, { cx: BX, cz: -18, len: 64, floors: 9, ang: Math.PI / 2, seed: 128, litRate: 0.2 });
    wins.push(...panelBlock(S, { cx: 12, cz: -62, len: 40, floors: 9, ang: 0.3, seed: 129, litRate: 0.15 }));
    // pick the street-facing windows in view for the people
    const facing = wins.map((w, i) => ({ w, i })).filter(({ w }) => w.p[0] < BX - 5 && w.p[2] < 6 && w.p[2] > -34 && w.p[1] < 20);
    const pick = new Set<number>();
    const rr = mulberry32(130);
    for (const { i } of facing) if (rr() < 0.55 && pick.size < 12) pick.add(i);
    this.panes = new WindowPanes(S, wins);
    this.panes.set((_, i) => (pick.has(i) ? 0 : 1));
    (this.panes as unknown as { base: (i: number) => number }).base = (i: number) => (pick.has(i) ? 0 : 1);
    let n = 0;
    for (const i of pick) {
      const w = wins[i]!;
      const tv = n % 4 === 1;
      const cv = this.roomCanvas(131 + n, tv);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true, toneMapped: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.1), mat);
      m.position.set(w.p[0] - 0.01, w.p[1], w.p[2]); m.rotation.y = w.ry; S.add(m);
      this.people.push({ m, mat, off: hash(n, 5), tv, p: w.p });
      n++;
    }
    // ---- streetlights on the road's far edge, one on this side
    for (const z of [10, -8, -26, -44]) {
      const hp = streetLight(S, 14.2, z, { h: 8, arm: [-1.8, 0, 0] });
      this.lamps.push(hp); this.addLamp(hp, { k: 70, angle: 1.0, target: [hp[0] - 1.5, 0, hp[2]] });
    }
    // the light over the child's stop comes from a lamp on the wall side, out of frame (no pole in the shots)
    const hp: V3 = [0.3, 5.6, -1.4];
    this.addLamp(hp, { k: 55, angle: 1.05, shadow: true, target: [hp[0] + 0.3, 0, hp[2] + 1.3] });
    void glowMat; void canvasTex; void speckle;
  }

  /** A lit room seen through the glass: a warm lamp or a TV's blue, curtains, people together (silhouettes). */
  roomCanvas(seed: number, tv: boolean) {
    const r = mulberry32(seed);
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 140;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(60 + r() * 40, 40, 5, 80, 70, 110);
    if (tv) { g.addColorStop(0, '#9fb8ff'); g.addColorStop(1, '#233050'); } else { g.addColorStop(0, '#ffd9a0'); g.addColorStop(1, '#8a4a20'); }
    c.fillStyle = g; c.fillRect(0, 0, 160, 140);
    // curtains
    c.fillStyle = tv ? 'rgba(20,30,60,0.55)' : 'rgba(120,50,20,0.55)';
    c.fillRect(0, 0, 18 + r() * 14, 140); c.fillRect(160 - 18 - r() * 14, 0, 40, 140);
    // people: head + shoulders, two or three together; one is small (a child with its parents)
    const k = 2 + Math.floor(r() * 2);
    let x = 40 + r() * 20;
    for (let i = 0; i < k; i++) {
      const small = i === k - 1 && r() < 0.6;
      const hh = small ? 16 : 22, sy = small ? 104 : 88;
      c.fillStyle = 'rgba(15,10,8,0.92)';
      c.beginPath(); c.ellipse(x, sy - hh * 1.3, hh * 0.55, hh * 0.65, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(x - hh * 1.3, 140); c.quadraticCurveTo(x - hh * 1.2, sy - hh * 0.4, x, sy - hh * 0.5); c.quadraticCurveTo(x + hh * 1.2, sy - hh * 0.4, x + hh * 1.3, 140); c.fill();
      x += small ? 26 : 32 + r() * 8;
    }
    // the window frame's mullions
    c.fillStyle = '#b8b3a6'; c.fillRect(99, 0, 6, 140); c.fillRect(0, 38, 99, 5);
    return cv;
  }

  camZ(t: number) { const T = this.T, z0 = 1.3; const v = (z0 - STOP_Z) / (T.no1 - 0.1 - T.s); const walk2 = Math.max(0, t - (T.friend + 2.6)) * 0.55; return Math.max(STOP_Z, z0 - v * (t - T.s)) - walk2; }
  walking(t: number) { const T = this.T; return (1 - smoothstep(T.no1 - 0.5, T.no1, t)) + smoothstep(T.friend + 2.4, T.friend + 3.2, t) * 0.6; }

  catAt(t: number) {
    const T = this.T;
    const stand = new THREE.Vector3(WX + 0.55, 0, CZ);
    const top0 = new THREE.Vector3(WX, WH + 0.08, CZ - 0.35), top1 = new THREE.Vector3(WX, WH + 0.08, CZ - 1.3);
    const off = new THREE.Vector3(WX - 0.9, 0, CZ - 1.6);
    const camP = new THREE.Vector3(0.3, EYE, this.camZ(t));
    if (t < T.no1 - 0.25) {
      // trotting ahead of the child, arriving at its stop
      const z = Math.max(CZ, this.camZ(t) - 2.5 - 0.1);
      const p = new THREE.Vector3(WX + 0.55, 0, z);
      return { pos: p, heading: Math.PI / 2, dist: 10 - z, speed: 1.0, sit: 0, crouch: 0, jump: 0, look: null as THREE.Vector3 | null, lookK: 0, pitch: 0, vis: 1 };
    }
    if (t < T.jump) {
      // stops, looks back at the child (the head turns, held), then turns to the wall and crouches
      const look = smoothstep(T.no1 - 0.25, T.no1 + 0.3, t) * (1 - smoothstep(T.jump - 0.55, T.jump - 0.3, t));
      const face = Math.atan2(-(camP.z - stand.z), camP.x - stand.x);
      const turn = smoothstep(T.no1 - 0.25, T.no1 + 0.35, t);
      const hd = lerp(lerp(Math.PI / 2, face + 0.35, turn), Math.PI / 2 + 0.9, smoothstep(T.jump - 0.6, T.jump - 0.25, t));
      return { pos: stand, heading: hd, dist: 10 - CZ, speed: 0, sit: 0, crouch: smoothstep(T.jump - 0.35, T.jump - 0.05, t) * 0.8, jump: 0, look: camP, lookK: look, pitch: 0, vis: 1 };
    }
    if (t < T.top) {
      const u = (t - T.jump) / (T.top - T.jump);
      const p = stand.clone().lerp(top0, u); p.y = lerp(0, WH + 0.08, u) + 4 * 0.35 * u * (1 - u);
      return { pos: p, heading: Math.PI / 2 + 0.9 - 0.4 * u, dist: 10 - CZ, speed: 0, sit: 0, crouch: 0, jump: Math.sin(Math.PI * u), look: null, lookK: 0, pitch: -0.5 * (1 - u), vis: 1 };
    }
    if (t < T.drop) {
      // along the top, a few steps away
      const u = smoothstep(T.top + 0.15, T.drop, t);
      const p = top0.clone().lerp(top1, u);
      return { pos: p, heading: Math.PI / 2 + 0.2 * (1 - u), dist: 12 + u * 0.95, speed: u > 0 && u < 1 ? 0.9 : 0, sit: 0, crouch: 0, jump: 0, look: null, lookK: 0, pitch: 0, vis: 1 };
    }
    const u = clamp((t - T.drop) / (T.gone - T.drop));
    const p = top1.clone().lerp(off, u); p.y = lerp(WH + 0.08, 0, u * u) + 0.25 * Math.sin(Math.PI * u);
    return { pos: p, heading: Math.PI / 2 + 1.1, dist: 14, speed: 0, sit: 0, crouch: 0, jump: Math.sin(Math.PI * u) * 0.8, look: null, lookK: 0, pitch: 0.4 * u, vis: u < 1 ? 1 : 0 };
  }

  pov(t: number): Pov {
    const T = this.T;
    if (PROOF === 'wall') return { p: [2.4, 1.3, 3], yaw: this.yawTo([2.4, 1.3, 3], [WX, 0.8, -4]), pitch: 0, walk: 0 };
    if (PROOF === 'cat') { const c = this.catAt(T.no1 + 0.8); const p: V3 = [c.pos.x + 1.2, 0.5, c.pos.z + 0.9]; return { p, yaw: this.yawTo(p, [c.pos.x, 0.1, c.pos.z]), pitch: -0.14, walk: 0, fov: PORTRAIT ? 55 : 40 }; }
    if (PROOF === 'block') return { p: [2, 1.6, 6], yaw: this.yawTo([2, 1.6, 6], [BX - 6, 8, -16]), pitch: 0.28, walk: 0 };
    if (PROOF === 'window') { const w = this.people[0]!; const p: V3 = [w.p[0] - 6, w.p[1], w.p[2]]; return { p, yaw: this.yawTo(p, w.p), pitch: 0, walk: 0, fov: PORTRAIT ? 40 : 26 }; }
    const z = this.camZ(t);
    const cam: V3 = [0.3, EYE, z];
    const E = ease.inOutCubic;
    const P = PORTRAIT;
    const toCat = this.yawTo(cam, [WX + 0.3, 0, CZ - 0.5]);
    const W0 = this.people.length ? this.people.reduce((a, b) => (Math.hypot(a.p[1] - 5, a.p[2] + 10) < Math.hypot(b.p[1] - 5, b.p[2] + 10) ? a : b)).p : [BX - 6, 6, -10] as V3;
    const toBlock = this.yawTo(cam, W0);
    const upB = this.pitchTo(cam, W0);
    const yaw = keys(t, [[T.s, 0.05], [T.no1 - 0.4, toCat + (P ? -0.05 : -0.2), E], [T.drop, toCat + (P ? -0.02 : -0.16), E], [T.gone + 0.4, toCat + (P ? 0.0 : -0.12), E], [T.friend - 0.9, toCat + (P ? 0.0 : -0.1), E], [T.friend + 1.4, toBlock + (P ? 0.02 : 0.08), E], [T.friend + 3.6, toBlock + (P ? 0.03 : 0.1), E], [T.end, P ? -0.3 : -0.2, E]]);
    const pitch = keys(t, [[T.s, -0.1], [T.no1 - 0.4, P ? -0.3 : -0.26, E], [T.jump, P ? -0.28 : -0.24, E], [T.top + 0.2, P ? -0.06 : -0.04, E], [T.gone + 0.4, P ? -0.08 : -0.06, E], [T.friend - 0.9, -0.05, E], [T.friend + 1.4, upB - (P ? 0.05 : 0.04), E], [T.friend + 3.6, upB - (P ? 0.06 : 0.05), E], [T.end, 0.0, E]]);
    const F0 = P ? 74 : 56;
    const fov = F0 - (P ? 14 : 12) * smoothstep(T.no1 - 0.4, T.no1 + 0.6, t) * (1 - smoothstep(T.top, T.drop, t)) - (P ? 20 : 15) * smoothstep(T.friend - 0.2, T.friend + 2.4, t) * (1 - smoothstep(T.end - 2.6, T.end - 0.6, t));
    return { p: cam, yaw, pitch, walk: this.walking(t), fov };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    this.fogE.color.setRGB(0.02, 0.022, 0.03);
    const c = this.catAt(t);
    this.cat.g.visible = c.vis > 0;
    this.cat.pose({ pos: c.pos, heading: c.heading, dist: c.dist, speed: c.speed, t, sit: c.sit, crouch: c.crouch, jump: c.jump, pitch: c.pitch, look: c.look, lookK: c.lookK, tailUp: 0.7, tailWag: 0.06 });
    // the windows: people inside, a TV flickering; after «friend» they go dark one by one
    const dark0 = T.friend + 1.6;
    const base = (this.panes as unknown as { base: (i: number) => number }).base;
    this.panes.set((w, i) => base(i) * (t > dark0 && hash(i, 7) < 0.7 ? lampDie(t, dark0 + hash(i, 3) * (T.end - dark0 - 0.8), 0.25, i) : 1));
    for (const p of this.people) {
      const on = t > dark0 ? lampDie(t, dark0 + 0.4 + p.off * (T.end - dark0 - 1.2), 0.25, 17) : 1;
      const fl = p.tv ? 0.75 + 0.25 * hash(Math.floor(t * 8), 3) : 1;
      p.mat.color.setScalar(1.25 * on * fl);
    }
    const P = this.pov(t);
    this.setCam(P, t, this.walking(t));
    const cam = this.cam;
    const aim = c.vis > 0 && t < T.friend - 0.5 ? c.pos.clone().add(new THREE.Vector3(0, 0.15, 0)) : t < T.friend ? new THREE.Vector3(WX + 0.2, WH - 0.35, CZ - 1.3) : new THREE.Vector3(1.0, 0.2, cam.position.z - 6);
    const pose = this.torch(t, { raise: 1, on: PROOF ? 0 : 1, walk: this.walking(t), aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : 0.85, spot: clamp(20 * (aim.distanceTo(cam.position) / 5) ** 2, 3, 26) });
    const reachK = prog(t, T.top + 0.1, T.drop + 0.4, ease.outCubic) * (1 - prog(t, T.friend - 0.6, T.friend + 0.4, ease.inCubic));
    if (!PROOF) this.cut(t, P, pose, { speed: this.walking(t) * 1.2, armL: reachK });
    const tdir = pose ? pose.target.clone().sub(pose.head).normalize() : null;
    this.cat.setShine(pose ? 0.02 + this.cat.shine(pose.head, tdir, 0.95) : 0.02, 2);
    this.renderWorld(out, t, { sky: { top: [0.008, 0.01, 0.018], horizon: scaleRGB(LIN.smog, 0.1), low: scaleRGB(LIN.shadow, 0.8), horizonY: 0.5, haze: 1 } });
    const g = this.glow3D;
    for (const l of this.lamps) g.add(l[0], l[1], l[2], 0.45, 0.35, LIN.sodium, 2.2, 4);
    g.add(-34, 40.5, -70, 0.8, 0.8, [1, 0.1, 0.05], Math.floor(t * 1.2) % 2 ? 2.5 : 0.3, 4);
    this.flushGlow(out);
    this.beam(out, t, pose, PROOF ? 0 : 1, { density: 0.02, maxDist: clamp(aim.distanceTo(cam.position) - 0.5, 0.8, 8) });
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.18, warm: 0.2, torch: 1 };
    if (!PROOF) {
      if (!this.third) this.reach(u, t, light);
      this.torchHand(u, pose, light);
      this.heading(u, t, f);
      this.callout(u, t, homeLabel('alone'), T.s + 0.1, T.s + 2.3, () => this.onScreen(WX, WH + 0.2, -7), { places: [city().home.name] });
      this.callout(u, t, 'КОШКА · 0', T.gone + 0.15, T.friend - 0.15, () => this.onScreen(WX, WH + 0.1, CZ - 1.3));
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.55 };
  }

  /** The free hand reaches out after the cat and stays there, open and empty; then it drops. */
  reach(c: CanvasRenderingContext2D, t: number, light: Light) {
    const T = this.T;
    const k = prog(t, T.top + 0.1, T.drop + 0.4, ease.outCubic) * (1 - prog(t, T.friend - 0.6, T.friend + 0.4, ease.inCubic));
    if (k <= 0.001) return;
    const target = project(this.cam, WX + 0.1, WH + 0.1, CZ - 1.0);
    const s = 0.055 * pxAt(this.cam, 0.5);
    const from = { x: W * (PORTRAIT ? 0.18 : 0.26), y: H + s * 3 };
    const tx = target.behind ? W * 0.4 : clamp(target.x + s * 0.6, s * 2, W * 0.6), ty = target.behind ? H * 0.5 : clamp(target.y + s * 1.2, H * 0.3, H * 0.85);
    const tip = { x: lerp(from.x + s, tx, k), y: lerp(H + s, ty, k) };
    drawOpenHand(c, tip, from, s, light, 'flat', { curl: 0.15 + 0.35 * prog(t, T.drop + 0.6, T.friend - 0.6) });
  }
}
void H; void lin; void mulberry32;
