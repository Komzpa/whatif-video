// `dogs` — «ТЕБЕ ПОВСТРЕЧАЛИСЬ ЧУЖИЕ СОБАКИ» (TREATMENT r4 p.40: somebody else's dogs, not strays: big, off the leash,
// the owner far away; r5–r7; city.json: the route's stop «Склады», the warehouses inside the promzona). First person:
//   (a) start     the lane between the warehouses in drizzle, the torch sweeping corrugated walls, rails, pallets;
//                 ahead in the dark two pairs of eyes catch the beam.
//   (b) «Stray»   the first dog steps into the wall lamp's light: big, black and tan, a collar with a tag, a leash
//                 dragging through the puddles. «dogs»: two more behind it.
//   (c) «cross your path»  they trot across the lane in front of the child; the child stands still, the torch
//                 lowered to the ground. At the far end of the lane, under a lamp, a small man with a phone: the owner.
//   (d) «at night» the last dog stops, turns its head, looks straight at the child, eyes shining; then goes after
//                 the others. On the wall, a tin sign the child can't read: the rule nobody keeps.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, prog, smoothstep, keys, hash, mulberry32, frameIdx } from '../engine/util';
import { F, font } from '../engine/type';
import { garble, homeLabel, city } from '../city';
import { stencilText } from './_ru';
import { type Light } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, blotches, speckle, asphalt, boxMesh, cyl, ground, planeSign, corrugatedTex, brickTex, concreteTex, beamLit,
  POST_BASE, LIN, scaleRGB, mixRGB, lin, EYE, type Pov, type V3, type RGB,
} from './_kit';
import { Quadruped, DOG, type QuadSpec } from './_beasts';
import { Figure } from './_people';
import { rain } from './_motifs';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const LX = -4.4, RX = 4.4; // the warehouses' walls either side of the lane
const LAMP: V3 = [RX - 0.35, 5.2, -4.4]; // the wall lamp over the dock
const FAR: V3 = [1.2, 4.8, -24]; // the lamp at the far end (the owner stands under it)

interface DogRun { spec: QuadSpec; path: V3[]; s: (t: number) => number; look: (t: number) => number; seed: number }

export default class Dogs extends LitScene {
  chapter = 'dogs';
  dogs: Quadruped[] = [];
  runs: DogRun[] = [];
  owner!: Figure;
  wallLamp!: THREE.SpotLight; farLamp!: THREE.SpotLight; dockL!: THREE.RectAreaLight | THREE.SpotLight;
  sign!: THREE.Mesh; signText = '';
  leash: THREE.Mesh | null = null;
  phone!: THREE.Mesh;
  lamp2: V3 = [0, 0, 0];
  rainPts: { x: number; z: number; ph: number; sp: number }[] = [];

  override init() {
    this.initLit();
    this.hemi.intensity = 0.18;
    this.fogE.color.setRGB(0.014, 0.016, 0.02); this.fogE.density = 0.028;
    const L = this.ly.get('Stray dogs');
    const w = (re: RegExp) => L.words.find((x) => re.test(x.w))!;
    const s = this.ctx.start;
    const T: Record<string, number> = { s };
    T.eyes = s + 0.55; T.stop = s + 1.9;
    T.stray = w(/Stray/).start; T.dogs = w(/dogs/).start; T.cross = w(/cross/).start; T.path = w(/path/).start;
    T.night = w(/night/).start; T.at = w(/^at$/).start;
    T.lower = T.cross - 0.2; T.raise = T.night - 0.15;
    T.ownerCall = T.path; T.signCall = T.night + 0.9;
    this.T = T;
    // shots: the lane from high behind, the child small with the torch sweeping; the eyes in the gap in first
    // person; beside the child as the first dog steps out; from above while the three cross and the torch is
    // lowered; over the shoulder towards the owner; the last dog's stare in first person; over the shoulder to the sign
    this.shots = [
      [T.s, T.s + 1.75, { k: 'wide', d: 0.9, h: 1.1, side: -0.6, ahead: 1.6 }],
      [T.stray + 0.85, T.cross, { k: 'back', d: 1.1, side: 1, ahead: 0.9 }],
      [T.cross, T.path + 0.95, { k: 'high', d: 0.35, d1: 0.45, h: 0.75, ahead: PORTRAIT ? -0.5 : 0.8, side: 0.4 }],
      [T.path + 0.95, T.at, { k: 'ots', d: 2.2, h: 2.6, side: -1.4, yaw: PORTRAIT ? 0 : 0.3 }],
      [T.night + 1.4, T.night + 5, { k: 'ots', d: 2.2, h: 2.4, side: -1.4, ahead: 0.6 }],
    ];
    this.initKid(3);
    this.buildLane();
    // three dogs: out of the gap on the left, across the lane, then away down its right side to the owner
    const gapZ = -4.2;
    const mk = (spec: QuadSpec, t0: number, dz: number, stopAt: number | null, seed: number, lookT: [number, number] | null): DogRun => {
      const path: V3[] = [[LX - 3, 0, gapZ + dz], [LX + 0.6, 0, gapZ + dz + 0.4], [0, 0, gapZ + 0.9 + dz * 0.5], [RX - 1.4, 0, gapZ - 1.2 + dz * 0.3], [FAR[0] + 1.2, 0, FAR[2] - 1.5]];
      const len = pathLen(path);
      const v = 1.7; // a trot
      const sOf = (t: number) => {
        if (stopAt === null) return clamp((t - t0) * v, 0, len);
        const sStop = stopAt, tStop = t0 + sStop / v, hold = T.night + 1.1 - tStop;
        if (t < tStop) return clamp((t - t0) * v, 0, len);
        if (t < tStop + hold) return sStop;
        return clamp(sStop + (t - tStop - hold) * v, 0, len);
      };
      const look = (t: number) => (lookT ? smoothstep(lookT[0], lookT[0] + 0.35, t) * (1 - smoothstep(lookT[1], lookT[1] + 0.4, t)) : 0);
      return { spec, path, s: sOf, look, seed };
    };
    // the first dog steps out on "Stray" and stops at the lamp for a moment; the second and third on "dogs"
    this.runs.push(mk({ ...DOG }, T.stray - 1.9, 0, null, 1, [T.stray + 0.1, T.stray + 1.1]));
    this.runs.push(mk({ ...DOG, withers: 0.6, hip: 0.57, back: [0.045, 0.036, 0.028], belly: [0.11, 0.095, 0.08], legs: [0.1, 0.085, 0.07] }, T.dogs - 1.7, -1.1, null, 2, null));
    this.runs.push(mk({ ...DOG, withers: 0.7, hip: 0.66, len: 0.66, back: [0.008, 0.008, 0.008], belly: [0.018, 0.016, 0.014], legs: [0.018, 0.016, 0.014], muzzleC: [0.008, 0.008, 0.008] }, T.dogs - 0.6, 0.8, 6.8, 3, [T.night - 0.1, T.night + 1.0]));
    for (const r of this.runs) this.dogs.push(new Quadruped(r.spec, this.three));
    // the owner at the far end, on his phone
    this.owner = new Figure(this.three, { height: 1.8, coat: [0.1, 0.075, 0.05], trousers: [0.025, 0.028, 0.035], beanie: [0.02, 0.02, 0.022], seed: 4 });
    this.phone = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.13), glowMat([0.7, 0.8, 1.0], 2.2));
    this.three.add(this.phone);
    if (PROOF === 'dog' || PROOF === 'dogs') { this.addPoint([2.2, 1.6, -5.2], [1, 0.85, 0.7], 6); this.addPoint([-2, 1.2, -9.5], [0.5, 0.6, 0.9], 4); }
    this.obstacles = () => { const b = this.planeBox(this.sign); return b ? [b] : []; };
  }

  buildLane() {
    const S = this.three;
    const { map, rough } = asphalt(31, [6, 24], { puddles: 0 });
    ground(S, 12, 120, 0, -40, lit([0.75, 0.75, 0.75], { map, roughMap: rough, rough: 0.72 }));
    // the rail spur along the lane (two rails, sleepers)
    const steel = lit([0.36, 0.33, 0.3], { rough: 0.35, metal: 0.8 });
    const wood = lit(lin('#2a2019'), { rough: 0.95 });
    for (const x of [-1.9, -0.38]) boxMesh(S, 0.07, 0.12, 110, x, 0.06, -40, steel, { cast: false });
    for (let z = 12; z > -95; z -= 0.75) boxMesh(S, 2.4, 0.08, 0.22, -1.14, 0.02, z + hash(z, 2) * 0.05, wood, { cast: false, ry: (hash(z, 3) - 0.5) * 0.06 });
    // the warehouses: brick plinth, corrugated sheet walls, loading docks with steel doors on the right
    const cor = corrugatedTex(41, [12, 1]);
    const corM = lit([0.9, 0.9, 0.9], { map: cor.map, normalMap: cor.nrm, normalK: 0.8, rough: 0.55, metal: 0.3 });
    const br = brickTex(42, [16, 2], '#5e3427');
    const brM = lit([0.9, 0.9, 0.9], { map: br.map, normalMap: br.nrm, rough: 0.9 });
    const wall = (x: number, z0: number, z1: number, face: 1 | -1) => {
      const len = z0 - z1;
      boxMesh(S, 0.3, 1.2, len, x, 0.6, (z0 + z1) / 2, brM);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 5.8), corM);
      p.position.set(x + face * 0.16, 1.2 + 2.9, (z0 + z1) / 2); p.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2; p.receiveShadow = true; p.castShadow = true; S.add(p);
      boxMesh(S, 0.5, 0.3, len, x - face * 0.1, 7.15, (z0 + z1) / 2, lit([0.22, 0.22, 0.22]));
      boxMesh(S, 8, 7, len, x - face * 4.2, 3.5, (z0 + z1) / 2, lit([0.1, 0.1, 0.1]));
    };
    // left: two buildings with the gap the dogs come out of (z -6.2 .. -9.4)
    wall(LX, 14, -2.6, 1); wall(LX, -5.8, -70, 1);
    // right: one long building with docks
    wall(RX, 14, -70, -1);
    const dockM = lit(lin('#6d6a62'), { map: concreteTex(43, [3, 1]), rough: 0.9 });
    boxMesh(S, 1.6, 1.1, 30, RX - 0.8, 0.55, -18, dockM);
    const doorM = lit(lin('#4f5a55'), { rough: 0.5, metal: 0.5, map: corrugatedTex(44, [3, 1], '#56625c').map });
    for (const z of [-8, -16, -24]) {
      boxMesh(S, 0.08, 3.2, 3.0, RX - 0.1, 1.1 + 1.6, z, doorM);
      boxMesh(S, 0.25, 0.3, 3.6, RX - 0.15, 4.45, z, lit([0.2, 0.2, 0.2]));
    }
    // a half-open dock door: cold light spills out from inside under it
    boxMesh(S, 0.1, 0.04, 3.0, RX - 0.1, 1.15, -31, lit([0.1, 0.1, 0.1]));
    boxMesh(S, 0.08, 2.4, 3.0, RX - 0.1, 1.1 + 0.55 + 1.2 + 0.6, -31, doorM);
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.52), glowMat([0.55, 0.7, 0.85], 1.6));
    spill.position.set(RX - 0.14, 1.1 + 0.28, -31); spill.rotation.y = -Math.PI / 2; S.add(spill);
    this.dockL = this.addLamp([RX - 0.6, 1.4, -31], { color: [0.55, 0.7, 0.9], k: 8, angle: 1.3, target: [0, 0, -31] });
    // pallets and a container by the left gap; oil drums
    const pal = lit(lin('#5b4a36'), { rough: 0.95 });
    for (let k = 0; k < 5; k++) { const y = 0.075 + k * 0.15; boxMesh(S, 1.2, 0.14, 0.8, LX + 1.0, y, -1.8, pal, { ry: 0.08 * hash(k, 1) }); }
    const cont = corrugatedTex(45, [4, 1], '#6d2f22');
    boxMesh(S, 2.44, 2.6, 6.1, LX - 1.4, 1.3, -12.6, lit([1, 1, 1], { map: cont.map, normalMap: cont.nrm, rough: 0.6, metal: 0.3 }), { ry: 0.05 });
    const drum = lit(lin('#2f4a5c'), { rough: 0.5, metal: 0.5 });
    for (const [x, z] of [[RX - 2.1, 2.5], [RX - 2.6, 3.1], [LX + 1.2, -20]] as const) cyl(S, [x, 0, z], [x, 0.9, z], 0.29, drum, { seg: 18 });
    // the tin sign on the right wall under the lamp: the rule, painted by stencil (the child sees mojibake)
    this.signText = garble('ВЫГУЛ СОБАК ЗАПРЕЩЁН');
    const cv = document.createElement('canvas'); cv.width = 600; cv.height = 300;
    { const c = cv.getContext('2d')!;
      c.fillStyle = '#e8e3d6'; c.fillRect(0, 0, 600, 300); c.strokeStyle = '#a3241c'; c.lineWidth = 22; c.strokeRect(12, 12, 576, 276);
      const words = this.signText.split(' ');
      const rows = [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
      rows.forEach((row, k) => { let sz = 70; c.font = font(F.stencil(), sz); while (c.measureText(row).width + sz * 0.08 * row.length > 520 && sz > 24) { sz -= 2; c.font = font(F.stencil(), sz); } const wd = c.measureText(row).width + sz * 0.08 * row.length; stencilText(c, row, 300 - wd / 2, 130 + k * 95, sz, '#15120e', '#e8e3d6'); });
      blotches(c, 600, 300, 30, () => 'rgba(120,60,20,0.18)', 8, 50, 7);
    }
    this.sign = planeSign(S, cv, 1.0, [RX - 0.16, 2.6, -3.2], { ry: -Math.PI / 2 });
    // lamps: the wall lamp over the docks, the far one where the owner stands, a dim one behind
    const lampHead = (p: V3) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 0.18, 12), lit([0.25, 0.25, 0.25], { metal: 0.5, rough: 0.5 })); m.position.set(p[0], p[1] + 0.1, p[2]); S.add(m); cyl(S, [p[0], p[1] + 0.15, p[2]], [p[0] + (p[0] > 0 ? 0.5 : -0.5), p[1] + 0.35, p[2]], 0.03, lit([0.2, 0.2, 0.2])); };
    lampHead(LAMP);
    const L2: V3 = [LX + 0.35, 4.6, 3.0]; lampHead(L2);
    this.addLamp(L2, { k: 30, angle: 0.9, shadow: false, target: [0, 0, 1.5] });
    this.lamp2 = L2;
    this.wallLamp = this.addLamp(LAMP, { k: 70, angle: 0.95, shadow: true, target: [0.5, 0, LAMP[2] + 0.5] });
    this.farLamp = this.addLamp(FAR, { k: 55, angle: 0.8, shadow: false, target: [FAR[0], 0, FAR[2]] });
    cyl(S, [FAR[0] - 0.9, 0, FAR[2]], [FAR[0] - 0.9, FAR[1] + 0.2, FAR[2]], 0.08, lit([0.35, 0.35, 0.33]));
    cyl(S, [FAR[0] - 0.9, FAR[1] + 0.2, FAR[2]], [FAR[0], FAR[1] + 0.2, FAR[2]], 0.03, lit([0.35, 0.35, 0.33]));
    // the end of the lane: the fence and far chimneys against the sky glow
    boxMesh(S, 12, 2.4, 0.2, 0, 1.2, -62, lit([0.35, 0.35, 0.33], { map: concreteTex(46, [4, 1]) }));
    for (const x of [-18, 9]) cyl(S, [x, 0, -140], [x, 55, -140], 2.2, lit([0.1, 0.1, 0.1]), { r1: 1.4 });
    const r = mulberry32(8);
    for (let i = 0; i < 900; i++) this.rainPts.push({ x: -4.2 + r() * 8.4, z: 2 - r() * 34, ph: r(), sp: 6.5 + r() * 2.5 });
  }

  // ================================================================ the dogs' motion
  dogAt(i: number, t: number) {
    const r = this.runs[i]!;
    const s = r.s(t), s2 = r.s(t + 0.05);
    const p = pointAt(r.path, s), q = pointAt(r.path, Math.min(pathLen(r.path), s + 0.3));
    const heading = Math.atan2(-(q[2] - p[2]), q[0] - p[0]);
    return { pos: new THREE.Vector3(p[0], 0, p[2]), heading, dist: s, speed: Math.abs(s2 - s) / 0.05, look: r.look(t) };
  }

  pov(t: number): Pov {
    if (PROOF === 'dog' || PROOF === 'dogs') return { p: [1.6, 0.75, -4.2], yaw: this.yawTo([1.6, 0.75, -4.2], [0, 0.45, -7.4]), pitch: -0.12, walk: 0, fov: PORTRAIT ? 60 : 40 };
    if (PROOF === 'lane') return { p: [0, 1.6, 6], yaw: 0, pitch: -0.02, walk: 0 };
    if (PROOF === 'owner') return { p: [FAR[0] + 0.2, 1.5, FAR[2] + 5], yaw: 0, pitch: -0.05, walk: 0, fov: PORTRAIT ? 55 : 40 };
    if (PROOF === 'sign') return { p: [1.2, 1.9, -3.2], yaw: -Math.PI / 2, pitch: 0.12, walk: 0, fov: PORTRAIT ? 55 : 45 };
    const T = this.T, E = ease.inOutCubic;
    // walking down the lane, stopping when the eyes show; standing still through the crossing; on again at the end
    const walk1 = prog(t, T.s, T.stop, (x) => x * (2 - x)), walk2 = 0;
    const z = 1.5 - 2.3 * walk1 - 3 * walk2;
    const lookDog = (i: number) => { const d = this.dogAt(i, t); return this.yawTo([0, EYE, z], [d.pos.x, 0.5, d.pos.z]); };
    const follow = lookDog(0);
    const yaw = keys(t, [[T.s, 0.12], [T.eyes, 0.02, E], [T.s + 1.9, 0.02], [T.s + 2.5, this.yawTo([0, EYE, z], [LX, 0.5, -4.2]) * 0.4, E], [T.stray + 0.3, follow * 0.55, E], [T.cross + 0.3, PORTRAIT ? 0 : lookDog(1) * 0.25, E], [T.night - 0.9, PORTRAIT ? 0 : lookDog(1) * 0.25], [T.night - 0.1, lookDog(2) - (PORTRAIT ? 0.05 : 0.38), E], [T.night + 1.2, lookDog(2) - (PORTRAIT ? 0.05 : 0.38), E], [T.night + 2.6, this.yawTo([0, EYE, z], [RX, 2.4, -3.2]) * (PORTRAIT ? 0.97 : 0.62), E]]);
    const pitch = keys(t, [[T.s, -0.05], [T.eyes, -0.02, E], [T.lower, -0.04], [T.lower + 0.6, -0.2, E], [T.raise, -0.2], [T.raise + 0.6, -0.1, E], [T.night + 1.2, -0.1], [T.night + 2.4, PORTRAIT ? -0.02 : 0.1, E]]) + (PORTRAIT ? 0.04 - 0.24 * smoothstep(T.s + 1.9, T.s + 2.6, t) * (1 - smoothstep(T.night + 1.2, T.night + 2.2, t)) : 0);
    const moving = (walk1 > 0 && walk1 < 1) || (walk2 > 0 && walk2 < 1) ? 1 : 0;
    // breath held: a tiny tremor while standing still
    const trem = t > T.lower && t < T.raise ? 0.003 * Math.sin(t * 23) : 0;
    return { p: [0, EYE, z], yaw: yaw + trem, pitch, walk: moving };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    const P = this.pov(t);
    this.setCam(P, t, 0);
    const cam = this.cam;
    // the dogs
    this.dogs.forEach((d, i) => {
      if (PROOF === 'dog') {
        d.g.visible = i === 0;
        d.pose({ pos: new THREE.Vector3(0, 0, -7.4), heading: 0.35, dist: t * 1.7, speed: 1.7, t, tailWag: 0.2, tailUp: 0.35 });
        d.setShine(0.3);
        return;
      }
      if (PROOF === 'dogs') {
        const poses = [{ x: -0.6, z: -7.6, h: 0.3, walk: true }, { x: 0.7, z: -8.6, h: 2.6, walk: false }, { x: 1.4, z: -6.9, h: -1.2, walk: false }];
        const q = poses[i]!;
        d.pose({ pos: new THREE.Vector3(q.x, 0, q.z), heading: q.h, dist: q.walk ? t * 1.7 : 0, speed: q.walk ? 1.7 : 0, t, look: i === 2 ? cam.position : null, lookK: 1 });
        d.setShine(i === 2 ? 1 : 0.1);
        return;
      }
      const a = this.dogAt(i, t);
      const visible = a.dist > 0.01 && a.dist < pathLen(this.runs[i]!.path) - 0.1;
      d.g.visible = visible;
      if (!visible) return;
      d.pose({ pos: a.pos, heading: a.heading, dist: a.dist, speed: a.speed, t: t + i * 1.3, look: a.look > 0 ? cam.position : null, lookK: a.look, tailWag: 0.18, tailUp: 0.3 + 0.2 * a.look, earBack: 0 });
    });
    // the torch: sweeping, finding the eyes, lowered to the ground during the crossing
    const lowered = prog(t, T.lower, T.lower + 0.5, ease.inOutCubic) * (1 - prog(t, T.raise, T.raise + 0.6, ease.inOutCubic));
    const sweep = 0.18 * Math.sin((t - T.s) * 1.3) * (1 - smoothstep(T.eyes - 0.2, T.eyes + 0.3, t));
    const d0 = this.dogAt(0, t).pos;
    const gapP = new THREE.Vector3(LX + 0.2, 0.5, -4.2);
    const early = new THREE.Vector3(sweep * 8, 0.3, -9);
    const aimFar = early.clone().lerp(gapP, smoothstep(T.eyes - 0.4, T.eyes + 0.2, t)).lerp(new THREE.Vector3(d0.x, 0.45, d0.z), smoothstep(T.stray - 0.2, T.stray + 0.5, t) * (this.dogs[0]!.g.visible ? 1 : 0));
    const aimLow = new THREE.Vector3(0.3, 0, cam.position.z - 3.6);
    { const d2 = this.dogs[2]!; if (d2.g.visible) { const hp = d2.head.getWorldPosition(new THREE.Vector3()); aimFar.lerp(hp.setY(0.12), smoothstep(T.night - 0.3, T.night + 0.2, t) * (1 - smoothstep(T.night + 1.2, T.night + 1.8, t))); } }
    const aim = PROOF ? null : aimFar.clone().lerp(aimLow, lowered);
    const pose = this.torch(t, { raise: 1 - 0.3 * lowered, on: 1, walk: P.walk, aimAt: aim, aimK: PROOF ? 0 : 0.7, spot: 15 });
    if (!PROOF) this.cut(t, P, pose, { speed: P.walk * 1.2, film: 0.85 - 0.5 * lowered });
    // eye shine for each dog
    const tdir = pose ? pose.target.clone().sub(pose.head).normalize() : null;
    if (!PROOF) this.dogs.forEach((d) => { if (!d.g.visible || !pose) return; const k = d.shine(pose.head, tdir, 0.95); d.setShine(0.03 + k * (1 - 0.5 * lowered), 2.2); });
    // the owner under the far lamp, head down to the phone's glow
    const oPos = new THREE.Vector3(FAR[0] + 0.3, 0, FAR[2] + 0.5);
    this.owner.pose({ pos: oPos, heading: -Math.PI / 2 + 0.9, t, phone: 1, look: 0 });
    const hand = this.owner.handR();
    this.phone.position.copy(hand).add(new THREE.Vector3(0, 0.05, 0.06)); this.phone.lookAt(this.owner.headPos());
    // the leash: a strap from the first dog's collar dragging behind it on the ground
    this.updateLeash(t);
    // ---- render
    this.renderWorld(out, t, { sky: { top: scaleRGB(LIN.shadow, 0.9), horizon: mixRGB(scaleRGB(LIN.fog, 0.8), scaleRGB(LIN.smog, 0.45), 0.4), low: scaleRGB(LIN.shadow, 1.0), horizonY: 0.5, haze: 1 } });
    const g = this.glow3D;
    g.add(LAMP[0], LAMP[1], LAMP[2], 0.45, 0.35, LIN.sodium, 2.4, 4);
    g.add(FAR[0], FAR[1], FAR[2], 0.45, 0.35, LIN.sodium, 2.0, 4);
    g.add(this.lamp2[0], this.lamp2[1], this.lamp2[2], 0.45, 0.35, LIN.sodium, 2.2, 4);
    g.add(RX - 0.3, 1.38, -31, 1.6, 0.4, [0.55, 0.7, 0.9], 0.5, 2);
    const ph = this.phone.position; g.add(ph.x, ph.y, ph.z, 0.03, 0.03, [0.6, 0.75, 1.0], 0.35, 3);
    this.flushGlow(out);
    // drizzle in the lane (3D), lit near the lamps and in the torch
    const lb = this.lines3D;
    for (const q of this.rainPts) {
      const y = 7 - (((t * q.sp + q.ph * 7) % 7) + 7) % 7;
      const dl = Math.hypot(q.x - LAMP[0], y - LAMP[1], q.z - LAMP[2]);
      const k = 0.05 + 0.4 * Math.exp(-dl * 0.35);
      const col = mixRGB(scaleRGB(LIN.paper, 0.6), scaleRGB(LIN.sodium, 1.4), clamp(1.4 - dl * 0.25));
      lb.seg(q.x, y, q.z, q.x + 0.02, y + 0.45, q.z, 0.8, col[0], col[1], col[2], k);
    }
    lb.render(renderer, out, cam); lb.clear();
    const on = 1;
    this.beam(out, t, pose, on * (PROOF ? 0 : 1), { density: 0.014, maxDist: aim ? clamp(aim.distanceTo(cam.position) - 0.6, 0.8, 7) : 7 }); // the haze stops short of what the torch is on (the march ignores depth)
    // ---- QA: the tin sign (mojibake) when readable
    this.logPlane(this.sign, this.signText, 'garble', { frac: [0.08, 0.2, 0.92, 0.85], minPx: 14, letterFrac: 0.28, id: 'plane:dog-sign' });
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.22, warm: 0.2, torch: 1 };
    if (!PROOF || PROOF === 'lane') this.torchHand(u, pose, light);
    if (!PROOF) this.drawUI(u, t, f);
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.5 };
  }

  updateLeash(t: number) {
    const d = this.dogs[0]!;
    if (!this.leash) {
      this.leash = new THREE.Mesh(new THREE.BufferGeometry(), lit(lin('#3a1e14'), { rough: 0.6 }));
      this.leash.castShadow = true; this.leash.frustumCulled = false; this.three.add(this.leash);
    }
    this.leash.visible = d.g.visible;
    if (!d.g.visible) return;
    const collar = d.head.localToWorld(new THREE.Vector3(-DOG.skull[0] * 1.3, -DOG.skull[1] * 0.9, 0));
    const back = new THREE.Vector3(-Math.cos(d.g.rotation.y), 0, Math.sin(d.g.rotation.y));
    const pts = [collar];
    for (let k = 1; k <= 8; k++) {
      const q = k / 8;
      const p = d.g.position.clone().addScaledVector(back, -0.1 + q * 1.5);
      p.y = Math.max(0.012, lerp(collar.y, 0.012, smoothstep(0, 0.35, q)));
      const side = new THREE.Vector3(Math.sin(d.g.rotation.y), 0, Math.cos(d.g.rotation.y));
      p.addScaledVector(side, 0.13 * Math.sin(Math.PI * clamp(q * 1.6)) + 0.06 * Math.sin(q * 5 + t * 6) * q);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    this.leash.geometry.dispose();
    this.leash.geometry = new THREE.TubeGeometry(curve, 24, 0.008, 5, false);
  }

  drawUI(u: CanvasRenderingContext2D, t: number, f: Frame) {
    const T = this.T;
    this.heading(u, t, f);
    this.callout(u, t, homeLabel('dogs'), T.s + 0.3, T.stray - 0.2, () => this.onScreen(FAR[0], 9, -110), { places: [city().home.name] });
    this.callout(u, t, 'ХОЗЯИН', T.ownerCall, T.night - 0.3, () => { const h = this.owner.headPos(); return this.onScreen(h.x, h.y + 0.1, h.z); });
    this.callout(u, t, 'ВЫГУЛ СОБАК ЗАПРЕЩЁН', T.signCall, f.end + 1, () => this.onScreen(RX - 0.17, 2.3, -2.8));
  }
}

function pathLen(p: V3[]) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![2] - p[i - 1]![2]); return L; }
function pointAt(p: V3[], s: number): V3 {
  // a smoothed polyline: Catmull-Rom through the points, arc length approximated per segment
  let left = s;
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![2] - p[i - 1]![2]);
    if (left <= d || i === p.length - 1) {
      const u = clamp(left / d);
      const a = p[Math.max(0, i - 2)]!, b = p[i - 1]!, c = p[i]!, e = p[Math.min(p.length - 1, i + 1)]!;
      const cr = (k: 0 | 2) => 0.5 * ((2 * b[k]) + (-a[k] + c[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c[k] - e[k]) * u * u + (-a[k] + 3 * b[k] - 3 * c[k] + e[k]) * u * u * u);
      return [cr(0), 0, cr(2)];
    }
    left -= d;
  }
  return p[p.length - 1]!;
}
void canvasTex; void speckle; void rain; void beamLit; void W; void H; void frameIdx; void lerp;
export type { RGB };
