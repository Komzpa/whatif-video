// `cat` — «ТВОЯ КОШКА ЗАЛЕЗЛА НА ДЕРЕВО» (TREATMENT p.48; r5 items 8–9: the torch finds the cat, the child waits,
// the cat comes down to the child: the only warm, living thing so far; city.json stop «Водокачка», promzona).
// First person, night, a yard by the old brick water tower:
//   (a) start      the yard: the water tower with its red light, one old bare tree behind a railing, a shed.
//   (b) «Your cat» the torch climbs the trunk into the branches and finds two green eyes: a ginger cat.
//   (c) «is stuck up in»  the cat crouched on a limb, 4,6 m up (a dimension line down to the ground: the child
//                  can't reach). The child waits; nobody comes.
//   (d) «a tree»   the cat decides: down the limb, a jump to the shed roof, along it, onto the crates, to the
//                  ground, and straight to the child. It sits at the child's feet; the hand comes down and
//                  touches its head.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, prog, smoothstep, keys, hash, mulberry32 } from '../engine/util';
import { F, font } from '../engine/type';
import { garble, homeLabel, city } from '../city';
import { stencilText } from './_ru';
import { drawOpenHand, pxAt, type Light } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, blotches, speckle, asphalt, boxMesh, cyl, ground, planeSign, concreteTex, brickTex, corrugatedTex,
  POST_BASE, LIN, scaleRGB, mixRGB, lin, project, EYE, type Pov, type V3,
} from './_kit';
import { Quadruped, CAT, type QuadSpec } from './_beasts';
import { Tree } from './_tree';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const TOWER: V3 = [-11, 0, -17];
const STAND: V3 = [1.45, EYE, 2.25]; // where the child stops and waits
const START: V3 = [0.4, EYE, 9.0];
const SHED = { x0: 1.5, x1: 4.6, z0: -3.4, z1: -0.5, h: 2.15 };
const CRATES: V3 = [5.25, 0, -0.1];
const LAMP: V3 = [6.4, 4.6, 3.4];

interface CatKey { t: number; p: THREE.Vector3; mode: 'walk' | 'jump' | 'still'; crouch?: number; sit?: number }

export default class CatScene extends LitScene {
  chapter = 'cat';
  tree!: Tree;
  cat!: Quadruped;
  catSpec: QuadSpec = { ...CAT, back: [0.34, 0.12, 0.03], belly: [0.62, 0.36, 0.14], legs: [0.5, 0.26, 0.08], muzzleC: [0.7, 0.5, 0.32], eye: [0.45, 0.95, 0.3], stripes: 70 };
  path: CatKey[] = [];
  perch = new THREE.Vector3(); low = new THREE.Vector3();
  heightTxt = '';
  fall!: THREE.InstancedMesh; fallSeeds: number[][] = [];
  redK = 0;
  spill = new THREE.PointLight(0xffe8b5, 0, 0, 2);

  override init() {
    this.initLit();
    this.hemi.intensity = 0.2;
    this.fogE.color.setRGB(0.016, 0.017, 0.022); this.fogE.density = 0.022;
    const s = this.ctx.start;
    const words = this.ly.linesIn(s, s + 16).flatMap((l) => l.words);
    const w = (re: RegExp) => { const x = words.find((q) => re.test(q.w)); if (!x) throw new Error(`cat: word ${re}`); return x; };
    const T: Record<string, number> = { s };
    T.walkEnd = s + 2.6;
    T.your = w(/^Your$/).start; T.cat = w(/^cat$/).start; T.stuck = w(/stuck/).start; T.up = w(/^up$/).start;
    T.tree = w(/tree/).start; T.a = w(/^a$/).start;
    T.found = T.cat + 0.1;
    this.T = T;
    this.buildYard();
    this.three.add(this.spill);
    this.cat = new Quadruped(this.catSpec, this.three, 84);
    this.buildPath();
    this.obstacles = () => [];
  }

  buildYard() {
    const S = this.three;
    // the yard: old concrete slabs, cracked, with weeds at the joints
    const slab = concreteTex(61, [10, 10], { joints: [4, 4], stains: 40, base: '#55595c' });
    ground(S, 80, 80, 0, -10, lit([0.8, 0.8, 0.8], { map: slab, rough: 0.8 }));
    // the tree, fenced
    this.tree = new Tree(S, {
      seed: 7, height: 8, trunkR: 0.26, fork: 2.35, depth: 3, leaves: 180, leafColor: [0.5, 0.3, 0.05],
      limbs: [
        { dir: [0.75, 1, 0.1], len: 3.4, r: 0.13 }, // the cat's limb, over the shed
        { dir: [-0.85, 1, 0.25], len: 3.2, r: 0.12 },
        { dir: [0.15, 1, -0.85], len: 3.0, r: 0.11 },
        { dir: [0.05, 1.6, 0.25], len: 3.8, r: 0.13 },
        { dir: [-0.3, 1, 0.9], len: 2.4, r: 0.08 },
      ],
    }, [0, 0, 0]);
    // the perch: the point on limb 0 nearest 4.6 m, the low point near the fork for the jump
    let best = 0, bestD = 1e9;
    for (let i = 0; i <= 200; i++) { const q = this.tree.along(0, i / 200).p; const d = Math.abs(q.y - 4.6); if (d < bestD) { bestD = d; best = i / 200; } }
    const a = this.tree.along(0, best); this.perch.copy(a.p).add(new THREE.Vector3(0, a.r, 0));
    let lowS = best; for (let i = Math.floor(best * 200); i >= 0; i--) { const q = this.tree.along(0, i / 200); if (q.p.y < 3.25) { lowS = i / 200; break; } }
    const b = this.tree.along(0, lowS); this.low.copy(b.p).add(new THREE.Vector3(0, b.r, 0));
    this.heightTxt = `${this.perch.y.toFixed(1).replace('.', ',')} м`;
    SHED.x0 = Math.max(1.2, this.low.x + 0.9);
    // the railing around the tree
    const iron = lit([0.05, 0.055, 0.06], { rough: 0.5, metal: 0.6 });
    const R = 1.25;
    for (let i = 0; i < 20; i++) { const a0 = (i / 20) * Math.PI * 2; cyl(S, [Math.cos(a0) * R, 0, Math.sin(a0) * R], [Math.cos(a0) * R, 0.9, Math.sin(a0) * R], 0.014, iron, { seg: 6 }); }
    for (const y of [0.3, 0.85]) for (let i = 0; i < 20; i++) { const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2; cyl(S, [Math.cos(a0) * R, y, Math.sin(a0) * R], [Math.cos(a1) * R, y, Math.sin(a1) * R], 0.012, iron, { seg: 5 }); }
    // the shed: brick, a flat tarred roof with a tin edge, a steel door
    const br = brickTex(62, [4, 1.2], '#6b3a2a');
    const brM = lit([0.95, 0.95, 0.95], { map: br.map, normalMap: br.nrm, rough: 0.9 });
    const sw = SHED.x1 - SHED.x0, sd = SHED.z1 - SHED.z0;
    boxMesh(S, sw, SHED.h, sd, (SHED.x0 + SHED.x1) / 2, SHED.h / 2, (SHED.z0 + SHED.z1) / 2, brM);
    boxMesh(S, sw + 0.2, 0.12, sd + 0.2, (SHED.x0 + SHED.x1) / 2, SHED.h + 0.06, (SHED.z0 + SHED.z1) / 2, lit([0.05, 0.05, 0.05], { rough: 0.7 }));
    boxMesh(S, sw + 0.24, 0.05, 0.03, (SHED.x0 + SHED.x1) / 2, SHED.h + 0.1, SHED.z1 + 0.12, lit([0.3, 0.3, 0.3], { rough: 0.4, metal: 0.7 }));
    const door = corrugatedTex(63, [2, 1], '#4b5a4f');
    boxMesh(S, 1.1, 2.0, 0.06, SHED.x0 + 1.6, 1.0, SHED.z1 + 0.03, lit([1, 1, 1], { map: door.map, normalMap: door.nrm, rough: 0.5, metal: 0.4 }));
    // crates against the shed's end
    const wood = lit(lin('#6b5236'), { rough: 0.9, map: concreteTex(64, [1, 1], { base: '#6b5236', joints: [1, 3] }) });
    boxMesh(S, 0.62, 0.5, 0.62, CRATES[0], 0.25, CRATES[2], wood, { ry: 0.1 });
    boxMesh(S, 0.62, 0.5, 0.62, CRATES[0] + 0.05, 0.75, CRATES[2] - 0.05, wood, { ry: -0.12 });
    boxMesh(S, 0.62, 0.5, 0.62, CRATES[0] + 0.1, 0.25, CRATES[2] - 0.7, wood, { ry: 0.3 });
    // the streetlight by the shed (sodium), shadows on
    cyl(S, [LAMP[0] + 0.6, 0, LAMP[2]], [LAMP[0] + 0.6, LAMP[1] + 0.2, LAMP[2]], 0.07, lit([0.3, 0.3, 0.3], { metal: 0.5, rough: 0.5 }));
    cyl(S, [LAMP[0] + 0.6, LAMP[1] + 0.2, LAMP[2]], [LAMP[0], LAMP[1] + 0.1, LAMP[2]], 0.03, lit([0.3, 0.3, 0.3]));
    this.addLamp(LAMP, { k: 55, angle: 1.0, shadow: true, target: [LAMP[0] - 2.5, 0, LAMP[2] - 2.5] });
    // the water tower: a brick shaft, the tank house on top with small windows, a tin cone roof, the red light
    const tb = brickTex(65, [10, 12], '#7a4030');
    const tM = lit([0.9, 0.9, 0.9], { map: tb.map, normalMap: tb.nrm, rough: 0.9 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.9, 17, 28, 1, false), tM);
    shaft.position.set(TOWER[0], 8.5, TOWER[2]); shaft.castShadow = true; shaft.receiveShadow = true; S.add(shaft);
    const cornice = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 2.5, 1.2, 28), tM); cornice.position.set(TOWER[0], 17.4, TOWER[2]); S.add(cornice);
    const tankTex = canvasTex(1024, 256, (c, w2, h2) => {
      c.fillStyle = '#8a8272'; c.fillRect(0, 0, w2, h2);
      for (let i = 0; i < 12; i++) { const x = (i + 0.5) * (w2 / 12); c.fillStyle = '#16171a'; c.fillRect(x - 14, 90, 28, 80); c.strokeStyle = '#4a463e'; c.lineWidth = 4; c.strokeRect(x - 16, 88, 32, 84); }
      blotches(c, w2, h2, 60, () => 'rgba(60,50,40,0.25)', 10, 60, 66); speckle(c, w2, h2, 4000, 0.2, 67);
    });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 4.6, 32, 1, true), lit([0.8, 0.8, 0.8], { map: tankTex, rough: 0.85 }));
    tank.position.set(TOWER[0], 20.3, TOWER[2]); tank.castShadow = true; S.add(tank);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.0, 2.6, 32), lit([0.25, 0.27, 0.28], { rough: 0.45, metal: 0.6 }));
    roof.position.set(TOWER[0], 23.9, TOWER[2]); S.add(roof);
    // the tower door with a bulb over it
    boxMesh(S, 1.2, 2.2, 0.2, TOWER[0] + 0.9, 1.1, TOWER[2] + 2.75, lit([0.08, 0.08, 0.07], { rough: 0.6 }), { ry: 0.3 });
    this.addPoint([TOWER[0] + 1.2, 2.9, TOWER[2] + 3.4], LIN.sodium, 14);
    // a floodlight at the tower's foot washes the brick upwards
    this.addLamp([TOWER[0] + 3.2, 0.4, TOWER[2] + 5.2], { color: [1.0, 0.78, 0.5], k: 400, angle: 0.5, shadow: false, target: [TOWER[0], 16, TOWER[2]] });
    // the promzona behind: dark factory blocks, a chimney, a gantry crane; a few lit windows
    const dark = lit([0.06, 0.06, 0.065], { rough: 0.9 });
    for (const [x, z, w2, h2, d] of [[14, -30, 22, 12, 14], [-30, -34, 18, 9, 12], [2, -46, 30, 16, 10], [28, -18, 10, 7, 20]] as const) boxMesh(S, w2, h2, d, x, h2 / 2, z, dark);
    cyl(S, [22, 0, -44], [22, 38, -44], 1.8, dark, { r1: 1.1 });
    const winM = glowMat([1.0, 0.72, 0.35], 1.4);
    const rr = mulberry32(5);
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), winM); m.position.set(-8 + rr() * 26, 2 + rr() * 9, -40.9); S.add(m); }
    // falling leaves
    this.fall = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.08), lit([0.5, 0.3, 0.05], { rough: 0.8, side: THREE.DoubleSide }), 36);
    const fr = mulberry32(12);
    for (let i = 0; i < 36; i++) this.fallSeeds.push([fr() * 6.28, 0.6 + fr() * 2.2, fr() * 6.28, 0.3 + fr() * 0.5, fr()]);
    this.fall.castShadow = false; S.add(this.fall);
  }

  buildPath() {
    const T = this.T;
    const roofY = SHED.h + 0.12;
    const r0 = new THREE.Vector3(SHED.x0 + 0.35, roofY, SHED.z1 - 0.28);
    const r1 = new THREE.Vector3(SHED.x1 - 0.3, roofY, SHED.z1 - 0.25);
    const cr = new THREE.Vector3(CRATES[0] + 0.05, 1.0, CRATES[2] - 0.05);
    const gnd = new THREE.Vector3(CRATES[0] + 0.25, 0, CRATES[2] + 0.9);
    const end = new THREE.Vector3(STAND[0] + 0.3, 0, STAND[2] - 0.75);
    const t0 = T.tree - 0.05;
    this.path = [
      { t: T.s, p: this.perch.clone(), mode: 'still', crouch: 0.9 },
      { t: t0, p: this.perch.clone(), mode: 'still', crouch: 0.9 },
      { t: t0 + 0.9, p: this.low.clone(), mode: 'walk' },
      { t: t0 + 1.1, p: this.low.clone(), mode: 'still', crouch: 0.9 },
      { t: t0 + 1.5, p: r0, mode: 'jump' },
      { t: t0 + 2.2, p: r1, mode: 'walk' },
      { t: t0 + 2.35, p: r1, mode: 'still', crouch: 0.7 },
      { t: t0 + 2.7, p: cr, mode: 'jump' },
      { t: t0 + 2.8, p: cr, mode: 'still', crouch: 0.6 },
      { t: t0 + 3.1, p: gnd, mode: 'jump' },
      { t: t0 + 4.0, p: end, mode: 'walk' },
      { t: t0 + 4.4, p: end, mode: 'still', sit: 1 },
    ];
  }

  /** The cat's state at t: position, heading, pitch, the gait distance and the pose knobs. */
  catAt(t: number) {
    const P = this.path;
    let i = 0; while (i < P.length - 1 && t > P[i + 1]!.t) i++;
    const a = P[i]!, b = P[Math.min(i + 1, P.length - 1)]!;
    const u = b.t > a.t ? clamp((t - a.t) / (b.t - a.t)) : 1;
    let pos = a.p.clone().lerp(b.p, u);
    let jump = 0, crouch = 0, sit = 0;
    const d = b.p.clone().sub(a.p);
    let heading = Math.atan2(-d.z, d.x), pitch = 0;
    // distance travelled up to here (drives the gait)
    let dist = 0; for (let k = 1; k <= i; k++) if (P[k]!.mode === 'walk') dist += P[k]!.p.distanceTo(P[k - 1]!.p);
    const moving = b.mode === 'walk' && u < 1;
    if (b.mode === 'walk') { dist += d.length() * u; pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
    if (b.mode === 'jump') {
      const hgt = Math.max(0.25, d.y > 0 ? d.y + 0.3 : 0.3);
      pos.y += 4 * hgt * u * (1 - u) * (d.y < -0.5 ? 0.4 : 1);
      jump = Math.sin(Math.PI * u);
      pitch = Math.atan2(d.y + 4 * hgt * (1 - 2 * u) * 0.4, Math.hypot(d.x, d.z)) * 0.6;
      crouch = u < 0.08 ? 1 - u / 0.08 : 0;
    }
    if (b.mode === 'still') { crouch = lerp(a.crouch ?? 0, b.crouch ?? 0, u); sit = lerp(a.sit ?? 0, b.sit ?? 0, smoothstep(0, 1, u)); heading = this.lastHeading(i); }
    if (a.mode === 'still' && b.mode !== 'still' && u < 0.15) crouch = (a.crouch ?? 0) * (1 - u / 0.15);
    if (i === 0 && b.mode === 'still') { heading = this.lastHeading(2); pitch = 0; }
    return { pos, heading, pitch, dist, speed: moving ? d.length() / (b.t - a.t) : 0, jump, crouch, sit };
  }
  lastHeading(i: number) {
    const P = this.path;
    for (let k = Math.max(1, i); k < P.length; k++) { const d = P[k]!.p.clone().sub(P[k - 1]!.p); if (d.lengthSq() > 1e-4 && (P[k]!.mode !== 'still')) { if (k > i) return Math.atan2(-d.z, d.x); } }
    for (let k = i; k >= 1; k--) { const d = P[k]!.p.clone().sub(P[k - 1]!.p); if (d.lengthSq() > 1e-4) return Math.atan2(-d.z, d.x); }
    return 0;
  }

  pov(t: number): Pov {
    const cp = this.cat.g.position;
    if (PROOF === 'tree') return { p: [3.5, 1.4, 11], yaw: this.yawTo([3.5, 1.4, 11], [0, 3.5, 0]), pitch: 0.18, walk: 0 };
    if (PROOF === 'cat') return { p: [cp.x + 0.2, cp.y + 0.28, cp.z + 1.05], yaw: this.yawTo([cp.x + 0.2, 0, cp.z + 1.05], [cp.x, 0, cp.z]), pitch: -0.2, walk: 0, fov: PORTRAIT ? 50 : 34 };
    if (PROOF === 'tower') return { p: [2, 1.4, 8], yaw: this.yawTo([2, 1.4, 8], TOWER), pitch: 0.42, walk: 0 };
    if (PROOF === 'shed') return { p: [6.5, 1.5, 7.5], yaw: this.yawTo([6.5, 1.5, 7.5], [2.8, 1.2, 0]), pitch: 0.05, walk: 0 };
    const T = this.T, E = ease.inOutCubic;
    const w = prog(t, T.s, T.walkEnd, (x) => x * (2 - x));
    const p: V3 = [lerp(START[0], STAND[0], w), EYE, lerp(START[2], STAND[2], w)];
    const c = this.catAt(t).pos;
    const toCat = this.yawTo(p, [c.x, 0, c.z]);
    const pitchCat = Math.atan2(c.y + 0.12 - EYE, Math.hypot(c.x - p[0], c.z - p[2]));
    const trunkY = (y: number) => Math.atan2(y - EYE, Math.hypot(p[0], p[2]));
    const tp = PORTRAIT ? 0.0 : -0.1;
    const yaw = keys(t, [[T.s, 0.25], [T.s + 1.2, this.yawTo(p, TOWER) * 0.5, E], [T.your - 0.6, this.yawTo(p, [0, 0, 0]), E], [T.found, toCat + (PORTRAIT ? 0.0 : 0.2), E], [T.tree + 7, toCat + (PORTRAIT ? 0.0 : 0.2)]]);
    const pitch = keys(t, [[T.s, 0.1], [T.s + 1.2, 0.3, E], [T.your - 0.6, trunkY(1.4), E], [T.cat - 0.1, trunkY(3.6), E], [T.found + 0.3, pitchCat + tp, E], [T.tree + 7, pitchCat + tp]]);
    const zoom = smoothstep(T.found, T.found + 0.8, t) * (1 - smoothstep(T.tree + 0.8, T.tree + 2.0, t));
    return { p, yaw, pitch: clamp(pitch, -1.2, 1.2), walk: w > 0 && w < 1 ? 1 : 0, fov: lerp(PORTRAIT ? 74 : 56, PORTRAIT ? 64 : 46, zoom) };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    // the cat first (the camera follows it)
    const c = this.catAt(PROOF === 'cat' ? T.tree + 4.3 : t);
    if (PROOF === 'cat') { c.pos.set(3.2, 0, 3.2); c.heading = 0.4; c.pitch = 0; c.dist = t * 0.9; c.speed = 0.6; c.jump = 0; c.crouch = 0; c.sit = 0; }
    this.cat.pose({ pos: c.pos, heading: c.heading, pitch: c.pitch, dist: c.dist, speed: c.speed, t, jump: c.jump, crouch: c.crouch, sit: c.sit, tailUp: c.sit > 0.5 ? 0.9 : c.speed > 0 ? 0.85 : 0.1, tailWag: c.sit > 0.5 ? 0.12 : 0.05, look: null, lookK: 0 });
    const P = this.pov(t);
    this.setCam(P, t, 0);
    const cam = this.cam;
    // the cat looks at the child when still
    const still = c.speed === 0 && c.jump === 0;
    if (still && !PROOF) this.cat.pose({ pos: c.pos, heading: c.heading, pitch: c.pitch, dist: c.dist, speed: 0, t, crouch: c.crouch, sit: c.sit, tailUp: c.sit > 0.5 ? 0.9 : 0.1, tailWag: c.sit > 0.5 ? 0.15 : 0.06, look: cam.position, lookK: 1 });
    // the torch: on the trunk, then on the cat
    const cp = this.cat.head.getWorldPosition(new THREE.Vector3());
    const climb = keys(t, [[T.s, 0], [T.your - 0.5, 0.2], [T.found, 1, ease.inOutCubic]]);
    const trunkAim = new THREE.Vector3(0.1, lerp(0.5, 4.2, climb), 0.2);
    const early = new THREE.Vector3(Math.sin((t - T.s) * 1.1) * 2, 0.2, 2);
    const aim = early.clone().lerp(trunkAim, smoothstep(T.s + 1.8, T.your - 0.4, t)).lerp(cp.clone().add(new THREE.Vector3(0, -0.1, 0)), smoothstep(T.found - 0.15, T.found + 0.2, t));
    const pose = this.torch(t, { raise: 1, on: 1, walk: P.walk, aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : 0.95, spot: clamp(26 * (aim.distanceTo(this.cam.position) / 4.5) ** 2, 3, 40), angle: 0.3 });
    // the torch's spill (no shadow): the branches must not black out the cat entirely
    if (pose) { this.spill.position.copy(pose.head); this.spill.intensity = PROOF ? 0 : 3.5 * smoothstep(T.found - 0.2, T.found + 0.3, t) * (1 - smoothstep(T.tree + 1.0, T.tree + 2.0, t)); }
    const tdir = pose ? pose.target.clone().sub(pose.head).normalize() : null;
    if (pose && !PROOF) this.cat.setShine(0.02 + this.cat.shine(pose.head, tdir, 0.95), 2.4); else this.cat.setShine(PROOF === 'cat' ? 0.1 : 0.02);
    // falling leaves (drifting down through the torch)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.fallSeeds.forEach((sd, i) => {
      const period = 7 / sd[3]!, ph = ((t + sd[4]! * period) % period) / period;
      const y = 6.5 - ph * 6.6;
      const x = Math.cos(sd[0]!) * sd[1]! + Math.sin(t * 0.9 + i) * 0.3, z = Math.sin(sd[0]!) * sd[1]! + Math.cos(t * 0.7 + i) * 0.3;
      e.set(t * 2.1 + sd[2]!, t * 1.3 + i, t * 1.7); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, Math.max(0.01, y), z), q, new THREE.Vector3(1, 1, 1)); this.fall.setMatrixAt(i, m);
    });
    this.fall.instanceMatrix.needsUpdate = true;
    // ---- render
    this.renderWorld(out, t, { sky: { top: scaleRGB(LIN.shadow, 0.9), horizon: mixRGB(scaleRGB(LIN.fog, 0.8), scaleRGB(LIN.smog, 0.5), 0.45), low: scaleRGB(LIN.shadow, 1.0), horizonY: 0.45, haze: 1 } });
    const g = this.glow3D;
    g.add(LAMP[0], LAMP[1], LAMP[2], 0.45, 0.35, LIN.sodium, 2.4, 4);
    g.add(TOWER[0] + 1.2, 2.9, TOWER[2] + 3.4, 0.25, 0.25, LIN.sodium, 1.5, 4);
    const blink = 0.5 + 0.5 * Math.sign(Math.sin(t * Math.PI * 1.0));
    g.add(TOWER[0], 25.4, TOWER[2], 0.5, 0.5, [1.0, 0.08, 0.05], 1.2 + 1.8 * blink, 4);
    this.flushGlow(out);
    // the height: a dotted dimension line from the cat's limb down to the ground (the film's own layer)
    const lb = this.lines3D;
    const hk = PROOF ? 0 : smoothstep(T.stuck, T.stuck + 0.3, t) * (1 - smoothstep(T.tree - 0.2, T.tree + 0.1, t));
    if (hk > 0.01) {
      const x = this.perch.x + 0.35, z = this.perch.z;
      const top = this.perch.y, grow = smoothstep(T.stuck, T.stuck + 0.6, t);
      const bot = top - top * grow;
      const pc = LIN.paper;
      for (let y = top; y > bot; y -= 0.16) lb.seg(x, y, z, x, Math.max(bot, y - 0.08), z, 2, pc[0], pc[1], pc[2], 0.8 * hk);
      lb.seg(x - 0.14, top, z, x + 0.14, top, z, 2, pc[0], pc[1], pc[2], 0.9 * hk);
      if (grow > 0.98) lb.seg(x - 0.14, 0.01, z, x + 0.14, 0.01, z, 2, pc[0], pc[1], pc[2], 0.9 * hk);
    }
    lb.render(renderer, out, cam); lb.clear();
    this.beam(out, t, pose, PROOF ? 0 : 1, { density: 0.016, maxDist: pose ? clamp(aim.distanceTo(cam.position) - 0.5, 0.8, 8) : 8 });
    // ---- QA text in the world
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.2, warm: 0.25, torch: 1 };
    if (!PROOF) {
      this.torchHand(u, pose, light);
      this.pet(u, t, light);
      this.heading(u, t, f);
      this.callout(u, t, homeLabel('cat'), T.s + 0.3, T.your - 0.5, () => this.onScreen(TOWER[0], 12, TOWER[2]), { places: [city().home.name] });
      this.callout(u, t, 'КОШКА · 1', T.found + 0.1, T.stuck - 0.15, () => { const h = this.cat.head.getWorldPosition(new THREE.Vector3()); return this.onScreen(h.x, h.y + 0.08, h.z); });
      this.callout(u, t, this.heightTxt, T.stuck + 0.5, T.tree - 0.2, () => this.onScreen(this.perch.x + 0.35, this.perch.y * 0.78, this.perch.z));
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.5 };
  }

  /** The free hand comes down to the cat sitting at the child's feet and touches its head. */
  pet(c: CanvasRenderingContext2D, t: number, light: Light) {
    const tEnd = this.path[this.path.length - 1]!.t;
    const k = prog(t, tEnd - 0.1, tEnd + 0.7, ease.inOutCubic);
    if (k <= 0.001) return;
    const h = this.cat.head.getWorldPosition(new THREE.Vector3());
    const e = project(this.cam, h.x, h.y + 0.05, h.z);
    if (e.behind) return;
    const s = 0.055 * pxAt(this.cam, 0.5);
    const from = { x: W * (PORTRAIT ? 0.3 : 0.36), y: H + s * 3 };
    const stroke = Math.sin(Math.max(0, t - tEnd - 0.7) * 5) * s * 0.25;
    const tip = { x: lerp(from.x + s, e.x + stroke, k), y: lerp(H + s, e.y - s * 0.2, k) };
    drawOpenHand(c, tip, from, s, light, 'flat', { curl: 0.25 });
  }
}
void asphalt; void hash; void mixRGB;
