// `dark` — «ТЫ БОИШЬСЯ ТЕМНОТЫ И МОНСТРОВ» (TREATMENT p.13·, with r8: no drone, the child's own torch). City stop:
// a двор of five-storey blocks in Черёмушки (known district, 0,4 км from home). First person:
//   (a) start        walking into the yard: lit windows all round, two lamps, washing on a line, boxes by the bins,
//                    a tower crane over the roofs.
//   (b) «You're scared»  blackout: block after block goes dark on the beat, the lamps die.
//   (c) «dark»       the torch stutters and dies. Black. In the dark the child's eye draws monsters in chalky
//                    lines: the coat on the line grows a long neck and claws (callout МОНСТР?); a flick of the
//                    torch shows it is a coat (ПАЛЬТО). The boxes by the bins grow teeth; the next flick: boxes.
//   (d) «things you can't see»  over the roofs the crane becomes a giant, and no flick reaches it: НЕ НАЙДЕНО.
//                    The child sits down on the kerb. Far across the yard one window lights up.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, smoothstep, keys, mulberry32, hash, prog } from '../engine/util';
import { homeLabel, city } from '../city';
import { type Light } from './_hands';
import {
  LitScene, lit, canvasTex, speckle, blotches, asphalt, boxMesh, cyl, ground, concreteTex, streetLight,
  panelBlock, WindowPanes, POST_BASE, LIN, scaleRGB, EYE, project, type Pov, type V3, type LitWindow,
} from './_kit';
import { lampDie } from './_motifs';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const COAT: V3 = [-3.3, 1.98, -4.3]; // where the coat hangs from the line (its hanger)
const BOXES: V3 = [-2.1, 0, -5.6]; // the box stack by the bins
const CRANE: V3 = [-24, 0, -40]; // the tower crane's mast foot
const MAST_H = 30;
const SIT_Y = 0.62;

type Stroke = [number, number][];

/** A child's chalk drawing: strokes in metres (x right, y up) around an anchor, billboarded to the camera. */
function circle(cx: number, cy: number, rx: number, ry = rx, n = 18, a0 = 0): Stroke { const s: Stroke = []; for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI * 2; s.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return s; }
function zig(x0: number, x1: number, y: number, n: number, amp: number): Stroke { const s: Stroke = []; for (let i = 0; i <= n; i++) s.push([lerp(x0, x1, i / n), y + (i % 2 ? amp : -amp)]); return s; }

const GHOST: Stroke[] = [
  [[-0.05, 0], [0.02, 0.35], [-0.04, 0.7], [0.06, 1.05], [0.1, 1.18]], // the neck, out of the hanger
  circle(0.12, 1.55, 0.34, 0.42, 20, -Math.PI / 2),
  circle(-0.02, 1.62, 0.07, 0.09, 10), circle(0.26, 1.62, 0.07, 0.09, 10),
  zig(-0.08, 0.32, 1.34, 6, 0.05),
  [[-0.32, -0.12], [-0.38, -0.55], [-0.36, -1.0]], [[0.32, -0.12], [0.38, -0.55], [0.36, -1.0]], // the coat's sides
  zig(-0.36, 0.36, -1.02, 7, 0.06), // a ragged hem
  [[-0.32, -0.14], [-0.6, -0.5], [-0.8, -0.95], [-0.95, -1.35]], [[-0.95, -1.35], [-1.12, -1.48]], [[-0.95, -1.35], [-1.0, -1.58]], [[-0.95, -1.35], [-0.84, -1.56]],
  [[0.32, -0.14], [0.62, -0.48], [0.84, -0.92], [0.98, -1.3]], [[0.98, -1.3], [1.16, -1.42]], [[0.98, -1.3], [1.04, -1.54]], [[0.98, -1.3], [0.86, -1.52]],
];
const BITER: Stroke[] = [
  circle(0, 0.72, 0.95, 0.8, 22, Math.PI),
  circle(-0.32, 1.12, 0.13, 0.15, 10), circle(0.32, 1.12, 0.13, 0.15, 10),
  circle(-0.3, 1.1, 0.03, 0.03, 6), circle(0.34, 1.1, 0.03, 0.03, 6),
  [[-0.7, 0.62], [0.7, 0.62]], zig(-0.66, 0.66, 0.5, 10, 0.12), zig(-0.62, 0.62, 0.74, 9, 0.1),
  [[-0.55, 1.35], [-0.72, 1.78], [-0.48, 1.5]], [[0.55, 1.35], [0.72, 1.78], [0.48, 1.5]],
];
const GIANT: Stroke[] = [
  circle(0, 3.2, 2.6, 2.9, 22, -Math.PI / 2),
  circle(-0.9, 3.6, 0.45, 0.55, 10), circle(0.9, 3.6, 0.45, 0.55, 10),
  zig(-1.3, 1.3, 2.0, 8, 0.35),
  [[-3.5, 0.2], [-3.0, -8], [-2.6, -17]], [[3.5, 0.2], [3.0, -8], [2.6, -17]], [[-3.5, 0.2], [3.5, 0.2]], // shoulders, a body down the mast
  [[3.4, 0.4], [10, 1.2], [17, 1.6], [23, 1.4]], [[23, 1.4], [25.5, 3.2]], [[23, 1.4], [26, 1.2]], [[23, 1.4], [25.2, -0.8]], // an arm along the jib
  [[-3.4, 0.3], [-6, -3], [-8.5, -6.5]], [[-8.5, -6.5], [-10, -5.6]], [[-8.5, -6.5], [-9.6, -8]],
  [[-2.4, -17], [-4.2, -24], [-5.6, -30]], [[2.4, -17], [4.2, -24], [5.6, -30]],
];

export default class Dark extends LitScene {
  chapter = 'dark';
  panes!: WindowPanes;
  wins: { w: LitWindow; block: number }[] = [];
  lamps: { p: V3; L: THREE.SpotLight }[] = [];
  endWin = 0;
  offAt: number[] = [];

  override init() {
    this.initLit();
    this.hemi.intensity = 0.12;
    this.fogE.density = 0.016;
    const s = this.ctx.start;
    const words = this.ly.linesIn(s, s + 10).flatMap((l) => l.words);
    const w1 = (re: RegExp) => words.find((q) => re.test(q.w))!.start;
    const T: Record<string, number> = { s };
    T.youre = w1(/^You/); T.scared = w1(/^scared/); T.of = w1(/^of$/); T.dark = w1(/^dark/);
    T.and = w1(/^and$/); T.things = w1(/^things/); T.you2 = words.filter((q) => /^you$/i.test(q.w)).pop()!.start; T.cant = w1(/^can/); T.see = w1(/^see/);
    T.end = this.ctx.end;
    T.flash1 = T.and; T.flash2 = T.you2; // the two flicks of the torch
    T.m1 = T.dark + 0.05; T.m2 = T.flash1 + 0.9; T.m3 = T.flash2 + 0.3; // the monsters start drawing
    T.sit0 = T.see + 0.75; T.sit1 = T.sit0 + 0.7;
    T.win = T.end - 0.75; // the window across the yard
    this.T = T;
    this.build();
  }

  build() {
    const S = this.three;
    const { map, rough } = asphalt(191, [8, 8], { puddles: 10, base: '#222427' });
    ground(S, 70, 70, 0, -10, lit([0.6, 0.6, 0.6], { map, roughMap: rough, rough: 0.5 }));
    ground(S, 30, 30, -8, -8, lit([0.12, 0.13, 0.09], { map: concreteTex(192, [8, 8], { base: '#2a2d22', stains: 70 }), rough: 1 }), 0.01);
    boxMesh(S, 0.25, 0.14, 40, -1.6, 0.07, -8, lit([0.45, 0.45, 0.42], { map: concreteTex(193, [20, 1]), rough: 0.85 })); // the kerb
    // the five-storey blocks round the yard
    const blocks = [
      panelBlock(S, { cx: -20, cz: -8, len: 54, floors: 5, ang: -Math.PI / 2, seed: 194, litRate: 0.45 }),
      panelBlock(S, { cx: 20, cz: -8, len: 54, floors: 5, ang: Math.PI / 2, seed: 195, litRate: 0.45 }),
      panelBlock(S, { cx: -2, cz: -34, len: 44, floors: 5, ang: 0, seed: 196, litRate: 0.45 }),
      panelBlock(S, { cx: 36, cz: -60, len: 50, floors: 9, ang: 0.3, seed: 197, litRate: 0.3 }),
      panelBlock(S, { cx: -44, cz: -70, len: 50, floors: 9, ang: -0.2, seed: 198, litRate: 0.3 }),
    ];
    blocks.forEach((b, bi) => b.forEach((w) => this.wins.push({ w, block: bi })));
    this.panes = new WindowPanes(S, this.wins.map((q) => q.w));
    // the window that lights up at the end: in the far block across the yard, low, left of centre
    let best = 0, bs = 1e9;
    this.wins.forEach((q, i) => { if (q.block !== 0) return; const sc = Math.hypot(q.w.p[2] + 20, (q.w.p[1] - 10.5) * 2) + (q.w.p[0] < -16 ? 50 : 0); if (sc < bs) { bs = sc; best = i; } });
    this.endWin = best;
    // blackout order: on the beats from «You're» to «dark», block by block; a few windows hold on a moment longer
    const T = this.T, beats: number[] = [];
    for (let k = 0; ; k++) { const b = this.au.timeOfBeat(Math.ceil(this.au.beatAt(T.youre - 0.02)) + k); if (b > T.dark - 0.2) break; beats.push(b); }
    const order = [3, 4, 1, 2, 0];
    this.offAt = this.wins.map((q, i) => { const b = beats[Math.min(order.indexOf(q.block), beats.length - 1)] ?? T.youre; return hash(i, 3) < 0.08 ? T.dark - 0.1 + hash(i, 5) * 0.2 : b + hash(i, 4) * 0.12; });
    // the washing line: two T-posts, a line, sheets, the coat on its hanger
    const metal = lit([0.28, 0.3, 0.3], { rough: 0.6, metal: 0.4 });
    for (const z of [-1.4, -8.2]) { cyl(S, [COAT[0], 0, z], [COAT[0], 2.25, z], 0.04, metal, { seg: 8 }); cyl(S, [COAT[0] - 0.5, 2.2, z], [COAT[0] + 0.5, 2.2, z], 0.03, metal, { seg: 6 }); }
    const rope = lit([0.6, 0.6, 0.55], { rough: 0.8 });
    for (const dx of [-0.35, 0.35]) cyl(S, [COAT[0] + dx, 2.18, -1.4], [COAT[0] + dx, 2.0, -4.8], 0.008, rope, { seg: 4, cast: false }), cyl(S, [COAT[0] + dx, 2.0, -4.8], [COAT[0] + dx, 2.18, -8.2], 0.008, rope, { seg: 4, cast: false });
    const sheetM = lit([0.62, 0.6, 0.55], { rough: 0.9, side: THREE.DoubleSide });
    for (const [z, w, h] of [[-2.4, 1.3, 1.2], [-6.4, 1.6, 1.35]] as const) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 8, 4), sheetM); const pos = m.geometry.attributes.position!; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 3.1 + z) * 0.05); m.geometry.computeVertexNormals(); m.position.set(COAT[0] - 0.35, 2.1 - h / 2, z); m.rotation.y = Math.PI / 2; m.castShadow = true; S.add(m); }
    // the coat: a dark wool coat on a wire hanger, sleeves hanging
    const coat = lit([0.36, 0.3, 0.24], { rough: 0.95 });
    const cg = new THREE.Group(); cg.position.set(COAT[0] + 0.35, COAT[1], COAT[2]); cg.rotation.y = Math.PI / 2 + 0.25; S.add(cg);
    const bodyG = new THREE.CylinderGeometry(0.2, 0.3, 0.95, 12, 1, true); bodyG.scale(1, 1, 0.45);
    const body = new THREE.Mesh(bodyG, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.36, 0.3, 0.24, THREE.LinearSRGBColorSpace), roughness: 0.95, side: THREE.DoubleSide })); body.position.y = -0.58; body.castShadow = true; cg.add(body);
    boxMesh(cg, 0.44, 0.08, 0.14, 0, -0.1, 0, coat); // shoulders
    for (const sx of [-1, 1]) { const sl = cyl(cg, [sx * 0.21, -0.12, 0], [sx * 0.27, -0.78, 0.02], 0.06, coat, { r1: 0.07, seg: 8 }); void sl; }
    cyl(cg, [0, -0.06, 0], [0, 0.02, 0], 0.006, metal, { seg: 4 });
    // the bins and the box stack
    const binM = lit([0.18, 0.24, 0.2], { rough: 0.6, metal: 0.3 });
    boxMesh(S, 1.4, 1.2, 1.0, BOXES[0] - 1.25, 0.6, BOXES[2] - 1.0, binM);
    const card = canvasTex(256, 256, (c) => { c.fillStyle = '#8a6a44'; c.fillRect(0, 0, 256, 256); speckle(c, 256, 256, 3000, 0.2, 199); blotches(c, 256, 256, 8, () => 'rgba(40,25,10,0.25)', 20, 80, 200); c.fillStyle = 'rgba(60,40,20,0.8)'; c.fillRect(0, 118, 256, 20); });
    const cm = lit([0.8, 0.8, 0.8], { map: card, rough: 0.9 });
    const r = mulberry32(201);
    let y = 0;
    for (const [w, h, d] of [[0.9, 0.5, 0.7], [0.7, 0.45, 0.6], [0.55, 0.35, 0.5]] as const) { boxMesh(S, w, h, d, BOXES[0] + (r() - 0.5) * 0.1, y + h / 2, BOXES[2] + (r() - 0.5) * 0.1, cm, { ry: (r() - 0.5) * 0.5 }); y += h; }
    boxMesh(S, 0.6, 0.4, 0.5, BOXES[0] + 0.75, 0.2, BOXES[2] + 0.2, cm, { ry: 0.4 });
    // the tower crane beyond the roofs: a lattice mast, a jib, a counter-jib with its weight, a cab
    const crane = lit([0.5, 0.42, 0.2], { rough: 0.7, metal: 0.3 });
    const [cx, , cz] = CRANE, m = 0.9;
    for (const [ox, oz] of [[-m, -m], [m, -m], [m, m], [-m, m]] as const) cyl(S, [cx + ox, 0, cz + oz], [cx + ox, MAST_H, cz + oz], 0.07, crane, { seg: 4 });
    for (let yy = 0; yy < MAST_H; yy += 1.8) { cyl(S, [cx - m, yy, cz - m], [cx + m, yy + 1.8, cz - m], 0.04, crane, { seg: 3, cast: false }); cyl(S, [cx + m, yy, cz + m], [cx - m, yy + 1.8, cz + m], 0.04, crane, { seg: 3, cast: false }); cyl(S, [cx - m, yy, cz + m], [cx - m, yy + 1.8, cz - m], 0.04, crane, { seg: 3, cast: false }); }
    boxMesh(S, 26, 0.9, 1.1, cx + 12, MAST_H + 0.5, cz, crane); boxMesh(S, 9, 0.8, 1.1, cx - 5, MAST_H + 0.45, cz, crane);
    boxMesh(S, 2.2, 2.6, 1.6, cx - 8, MAST_H - 0.9, cz, lit([0.25, 0.25, 0.25], { rough: 0.8 }));
    boxMesh(S, 1.8, 1.8, 1.8, cx + 1.4, MAST_H - 1.4, cz, crane);
    cyl(S, [cx, MAST_H + 1, cz], [cx, MAST_H + 5, cz], 0.12, crane, { seg: 6 });
    cyl(S, [cx, MAST_H + 5, cz], [cx + 20, MAST_H + 1, cz], 0.03, crane, { seg: 3, cast: false }); cyl(S, [cx, MAST_H + 5, cz], [cx - 9, MAST_H + 0.9, cz], 0.03, crane, { seg: 3, cast: false });
    // two yard lamps (they die in the blackout)
    for (const [x, z] of [[2.6, -3], [-6, -18]] as const) { const hp = streetLight(S, x, z, { h: 6, arm: [-1.2, 0, 0] }); const L = this.addLamp(hp, { k: 45, angle: 1.0, shadow: x > 0, target: [hp[0] - 0.8, 0, hp[2]] }); this.lamps.push({ p: hp, L }); }
    void blotches; void speckle;
  }

  /** The torch: on, stutters and dies on «dark»; two short flicks later. 0..1 */
  torchOn(t: number) {
    const T = this.T;
    if (t < T.dark - 0.2) return 1;
    if (t < T.dark + 0.25) return hash(Math.floor(t * 30), 7) < 0.5 - (t - T.dark) ? 1 : 0.05;
    const flick = (t0: number, hold: number) => (t < t0 ? 0 : (t < t0 + hold ? 1 : Math.exp(-(t - t0 - hold) / 0.12)) * (hash(Math.floor(t * 30), 9) < 0.85 ? 1 : 0.45));
    return Math.max(flick(T.flash1, 0.7), flick(T.flash2, 0.45)) * (t < T.flash1 ? 0 : 1);
  }
  /** How much of the night is left lit (windows + lamps) — for the ambient light. */
  cityLit(t: number) { return 1 - smoothstep(this.T.youre, this.T.dark, t); }

  camZ(t: number) { const T = this.T; return 4 - 0.95 * (Math.min(t, T.dark - 0.3) - T.s) - 0.5 * ease.outCubic(clamp((t - T.dark + 0.3) / 0.8)); }
  camY(t: number) { const T = this.T; return lerp(EYE, SIT_Y, ease.inOutCubic(smoothstep(T.sit0, T.sit1, t))); }

  pov(t: number): Pov {
    const T = this.T, P = PORTRAIT, E = ease.inOutCubic;
    if (PROOF === 'yard') return { p: [8, 4.5, 10], yaw: this.yawTo([8, 4.5, 10], [-4, 1, -8]), pitch: -0.12, walk: 0, fov: P ? 72 : 56 };
    if (PROOF === 'coat') { const p: V3 = [COAT[0] + 1.8, 1.5, COAT[2] + 1.2]; return { p, yaw: this.yawTo(p, [COAT[0] + 0.35, 1.5, COAT[2]]), pitch: 0.05, walk: 0, fov: P ? 60 : 42 }; }
    if (PROOF === 'boxes') { const p: V3 = [BOXES[0] + 2.2, 1.2, BOXES[2] + 2.0]; return { p, yaw: this.yawTo(p, [BOXES[0] - 0.4, 0.6, BOXES[2] - 0.3]), pitch: -0.1, walk: 0, fov: P ? 60 : 44 }; }
    if (PROOF === 'crane') { const p: V3 = [0, 1.5, 6]; return { p, yaw: this.yawTo(p, [CRANE[0] + 6, MAST_H - 4, CRANE[2]]), pitch: this.pitchTo(p, [CRANE[0] + 6, MAST_H - 4, CRANE[2]]), walk: 0, fov: P ? 60 : 44 }; }
    const cam: V3 = [0.3, this.camY(t), this.camZ(t)];
    const toCoat = this.yawTo(cam, [COAT[0] + 0.3, 1.4, COAT[2]]);
    const upCoat = this.pitchTo(cam, [COAT[0] + 0.3, 1.9, COAT[2]]);
    const toBox = this.yawTo(cam, [BOXES[0], 0.8, BOXES[2]]);
    const toCrane = this.yawTo(cam, [CRANE[0] + 4, MAST_H, CRANE[2]]);
    const yaw = keys(t, [[T.s, 0.05], [T.scared, -0.12, E], [T.of, 0.12, E], [T.dark - 0.3, toCoat - (P ? 0.02 : 0.08), E], [T.flash1 + 0.5, toCoat - (P ? 0.0 : 0.06), E], [T.flash2 - 0.1, toBox + (P ? 0.0 : -0.18), E], [T.flash2 + 0.4, lerp(toBox, toCrane, 0.35), E], [T.see + 0.2, lerp(toBox, toCrane, 0.5), E], [T.end, lerp(toBox, toCrane, 0.55) - (P ? 0.02 : 0.08), E]]);
    const pitch = keys(t, [[T.s, 0.06], [T.scared, 0.14, E], [T.of, 0.1, E], [T.dark - 0.3, upCoat + (P ? -0.06 : 0.06), E], [T.flash1 + 0.5, upCoat + (P ? -0.06 : 0.05), E], [T.flash2 - 0.1, upCoat - (P ? 0.2 : 0.1), E], [T.flash2 + 0.4, P ? 0.2 : 0.22, E], [T.see + 0.2, P ? 0.26 : 0.3, E], [T.sit1, P ? 0.3 : 0.36, E], [T.end, P ? 0.24 : 0.3, E]]);
    const walk = 1 - smoothstep(T.dark - 0.8, T.dark + 0.4, t);
    return { p: cam, yaw, pitch, walk };
  }

  /** Billboarded world point of a doodle vertex. */
  dpt(anchor: V3, x: number, y: number, scale: number) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.quaternion); right.y = 0; right.normalize();
    return new THREE.Vector3(anchor[0] + right.x * x * scale, anchor[1] + y * scale, anchor[2] + right.z * x * scale);
  }
  /** Draw a chalk monster: strokes revealed along their length by `k`, boiling slightly (hand-drawn animation, 8 fps). */
  doodle(c: CanvasRenderingContext2D, t: number, strokes: Stroke[], anchor: V3, scale: number, k: number, alpha: number, seed: number) {
    if (alpha <= 0.01 || k <= 0.001) return;
    const pts = strokes.map((s) => s.map(([x, y]) => project(this.cam, ...this.dpt(anchor, x, y, scale).toArray() as V3)));
    const lens = pts.map((s) => s.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - s[i]!.x, p.y - s[i]!.y), 0));
    const total = lens.reduce((a, b) => a + b, 0);
    let budget = total * k;
    const f = Math.floor(t * 8);
    const wob = (i: number, j: number) => (hash(f * 131 + i * 17 + j, seed) - 0.5) * (PORTRAIT ? 5 : 4);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = `rgba(250,238,205,${alpha})`; c.lineWidth = PORTRAIT ? 7 : 5.5;
    c.shadowColor = `rgba(255,220,150,${0.8 * alpha})`; c.shadowBlur = 16;
    pts.forEach((s, i) => {
      if (budget <= 0 || s.some((p) => p.behind)) return;
      c.beginPath(); c.moveTo(s[0]!.x + wob(i, 0), s[0]!.y + wob(i, 1));
      for (let j = 1; j < s.length && budget > 0; j++) {
        const seg = Math.hypot(s[j]!.x - s[j - 1]!.x, s[j]!.y - s[j - 1]!.y);
        const u = Math.min(1, budget / Math.max(seg, 1e-3));
        c.lineTo(lerp(s[j - 1]!.x, s[j]!.x, u) + wob(i, j * 2), lerp(s[j - 1]!.y, s[j]!.y, u) + wob(i, j * 2 + 1));
        budget -= seg;
      }
      c.stroke();
    });
    c.restore();
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    const cl = this.cityLit(t);
    this.fogE.color.setRGB(0.012 + 0.012 * cl, 0.013 + 0.012 * cl, 0.02 + 0.012 * cl);
    this.hemi.intensity = 0.06 + 0.06 * cl;
    const win = smoothstep(T.win, T.win + 0.35, t);
    this.panes.set((_, i) => (i === this.endWin ? Math.max(t < this.offAt[i]! ? 1 : 0, win * 1.6) : t < this.offAt[i]! ? 1 : lampDie(t, this.offAt[i]!, 0.18, i) * 0));
    for (const [i, l] of this.lamps.entries()) l.L.intensity = 45 * lampDie(t, i === 0 ? T.of : T.scared + 0.4, 0.5, 30 + i);
    const P = this.pov(t);
    this.setCam(P, t, P.walk);
    const cam = this.cam;
    const on = PROOF ? 0 : this.torchOn(t);
    // after «dark» the torch hangs lower, pointed where the child looks; the flicks go to the coat, then the boxes
    const aimCoat = new THREE.Vector3(COAT[0] + 0.3, 1.4, COAT[2]), aimBox = new THREE.Vector3(BOXES[0], 0.7, BOXES[2]);
    const ahead = new THREE.Vector3(cam.position.x - 0.3, 0, cam.position.z - 5);
    const aim = ahead.lerp(aimCoat, smoothstep(T.dark - 0.5, T.dark, t)).lerp(aimBox, smoothstep(T.flash1 + 0.8, T.flash2 - 0.1, t));
    const pose = this.torch(t, { raise: 1, on, walk: P.walk, aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : t > T.dark ? 1 : 0.85, spot: clamp(20 * (aim.distanceTo(cam.position) / 5) ** 2, 4, 24) * (t > T.dark ? 1.8 : 1) });
    const sky = { top: [0.018, 0.02, 0.034] as [number, number, number], horizon: scaleRGB(LIN.smog, 0.09 + 0.05 * cl), low: scaleRGB(LIN.shadow, 0.5), horizonY: 0.5, haze: 1 };
    this.renderWorld(out, t, { sky });
    const g = this.glow3D;
    for (const [i, l] of this.lamps.entries()) g.add(l.p[0], l.p[1], l.p[2], 0.4, 0.3, LIN.sodium, 2.2 * lampDie(t, i === 0 ? T.of : T.scared + 0.4, 0.5, 30 + i), 4);
    g.add(CRANE[0] + 24.5, MAST_H + 1.1, CRANE[2], 0.25, 0.25, [1, 0.1, 0.05], (t < T.dark ? 2.5 : 0) * (Math.floor(t * 1.3) % 2), 4);
    if (win > 0) { const w = this.wins[this.endWin]!.w; g.add(w.p[0] + 0.3, w.p[1], w.p[2], 2.2, 1.8, [1, 0.7, 0.35], 0.5 * win, 1.6); }
    this.flushGlow(out);
    this.beam(out, t, pose, on, { density: 0.03, maxDist: clamp(aim.distanceTo(cam.position) - 0.3, 0.8, 8) });
    // ---- the monsters (the child's imagination) and the UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.04 + 0.16 * cl + 0.1 * win, warm: 0.1 * cl + 0.2 * win, torch: on };
    const k1 = prog(t, T.m1, T.m1 + 1.1, ease.inOutCubic), a1 = 1 - smoothstep(T.flash1 - 0.02, T.flash1 + 0.08, t);
    const k2 = prog(t, T.m2, T.m2 + 0.8, ease.inOutCubic), a2 = 1 - smoothstep(T.flash2 - 0.02, T.flash2 + 0.08, t);
    const k3 = prog(t, T.m3, T.m3 + 1.3, ease.inOutCubic), a3 = 1 - 0.35 * smoothstep(T.sit1, T.end, t);
    if (!PROOF || PROOF === 'monsters') {
      this.doodle(u, t, GHOST, [COAT[0] + 0.35, COAT[1] - 0.04, COAT[2]], 1, k1, a1, 1);
      this.doodle(u, t, BITER, [BOXES[0], 0, BOXES[2]], 1, k2, a2, 2);
      this.doodle(u, t, GIANT, [CRANE[0], MAST_H, CRANE[2]], 1, k3, a3, 3);
    }
    if (!PROOF) {
      this.torchHand(u, pose, light);
      this.heading(u, t, f);
      this.callout(u, t, homeLabel('dark'), T.s + 0.05, T.s + 2.1, () => this.onScreen(-10, 7, -34), { places: [city().home.name] });
      // one callout on the coat that flips when the torch finds it: МОНСТР? -> ПАЛЬТО
      this.callout(u, t, t < T.flash1 + 0.3 ? 'МОНСТР?' : 'ПАЛЬТО', T.dark - 0.15, T.see - 0.55, () => this.onScreen(COAT[0] + 0.35, COAT[1] - 0.1, COAT[2]));
      const head3 = this.dpt([CRANE[0], MAST_H, CRANE[2]], 0, 3.2, 1);
      this.callout(u, t, 'НЕ НАЙДЕНО', T.see - 0.08, T.end + 0.05, () => this.onScreen(head3.x, head3.y, head3.z));
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    void W; void H;
    return { ...POST_BASE, vignette: 0.65 };
  }
}
