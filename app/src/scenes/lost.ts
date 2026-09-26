// `lost` — p. 22 → 26. docs/TREATMENT.md: the metro as a vast fogged brutalist hall; the network map as a
// floating 3D diagram; the child is a yellow dot, YOU ARE HERE. A train of lit windows slides past and the
// station the child needed slides away with it (YOUR STOP). Gates roll down; station lights go off one
// by one along the map. System line: SERVICE ENDED · NEXT SERVICE 05:40 · THANK YOU FOR YOUR PATIENCE.
// WHAT TO DO: 1. Stay where you are. 2. Find someone in uniform. 3. Say your address. A patrol drone
// passes, scans the child, MINOR · LOGGED, and leaves.
// One continuous shot: platform dolly → the train → crane up to the map → closing → down to the patrol.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { clamp, ease, lerp, prog, smoothstep, keys, hash, frameIdx, type Key } from '../engine/util';
import { F, font } from '../engine/type';
import {
  CityScene, LitLines, LIN, POST_BASE, SAFE, rgba, mixRgba, scaleRGB, mixRGB, solid, col3, project, pxPerMetre,
  drawChild, drawDrone, droneGlow, drawCallout, drawEntry, drawPanel, drawPageCounter, drawSystemLine, entryAlpha,
  makeLamp, flicker, type Step,
} from './_motifs';

type V3 = [number, number, number];
const CHILD: V3 = [-2, 0, -6];
const HALL = { x0: -12, x1: 10, trench: 3.2, ceil: 11.5, zNear: 30, zFar: -230 };
const BAY = 8; // column / beam spacing
const MAP = { c: [-2.6, 6.9, -16] as V3, w: 17, h: 8 }; // floating map: centre, size (m)
const TRAIN_LEN = 96, TRAIN_V = 44; // m, m/s

// map geometry in map units (-1..1 both ways, v up)
type P2 = [number, number];
const LINES: P2[][] = [
  [[-1, -0.25], [-0.42, -0.25], [-0.12, 0.25], [0.62, 0.25], [1.05, 0.25]], // the child's line
  [[-0.2, -1], [-0.2, -0.45], [0.18, -0.05], [0.18, 1]],
  [[-1, 0.72], [0.08, 0.72], [0.5, 0.3], [0.92, -0.62]],
  [[-0.9, -0.85], [-0.55, -0.85], [-0.3, -0.62], [0.55, -0.62], [0.8, -0.95]],
];
const STATIONS_PER = [7, 5, 6, 5];
const HERE = 1, YOURS = 4; // station indices on line 0

export default class Lost extends CityScene {
  structure = new LitLines();
  tubes = new LineBatch(4000, { screen2D: false, worldWidth: true, blend: 'add', depthTest: true });
  floorScene = new THREE.Scene();
  train = new THREE.Group();
  trainLines = new LitLines();
  lights: { x: number; z: number }[] = [];
  gates: number[] = [];
  stations: { u: number; v: number; line: number; i: number; d: number }[] = [];
  steps: Step[] = [];
  mapScene = new THREE.Scene();
  mapBack!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  fog = new THREE.FogExp2(0, 0.03);

  override init() {
    const fogCol = scaleRGB(LIN.fog, 0.55);
    this.fog.color = col3(fogCol);
    this.three.fog = this.fog;
    this.floorScene.fog = this.fog;
    const wallM = solid(scaleRGB(LIN.deep, 1.1)), colM = solid(scaleRGB(LIN.deep, 1.35)), ceilM = solid(scaleRGB(LIN.shadow, 1.2));
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, g: THREE.Object3D = this.three) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b;
    };
    const len = HALL.zNear - HALL.zFar, zc = (HALL.zNear + HALL.zFar) / 2;
    box(1, HALL.ceil + 2, len, HALL.x0 - 0.5, HALL.ceil / 2, zc, wallM); // left wall
    box(1, HALL.ceil + 4, len, HALL.x1 + 0.5, HALL.ceil / 2 - 1, zc, wallM); // tunnel wall
    box(HALL.x1 - HALL.x0 + 2, 1, len, (HALL.x0 + HALL.x1) / 2, HALL.ceil + 0.5, zc, ceilM);
    box(HALL.x1 - HALL.trench, 1, len, (HALL.trench + HALL.x1) / 2, -1.9, zc, solid(scaleRGB(LIN.shadow, 0.8))); // trench bed
    box(0.4, 1.4, len, HALL.trench + 0.2, -0.7, zc, wallM); // platform edge face
    const S = this.structure, conc = LIN.concrete, dim = scaleRGB(LIN.concrete, 0.55);
    for (let z = HALL.zNear - 6; z > HALL.zFar; z -= BAY) {
      // square columns in one row, beams across the ceiling
      box(1.5, HALL.ceil, 1.5, -6.5, HALL.ceil / 2, z, colM);
      S.box(-6.5, 0, z, 1.5, HALL.ceil, 1.5, conc, 1.1);
      box(HALL.x1 - HALL.x0, 1.2, 1.1, (HALL.x0 + HALL.x1) / 2, HALL.ceil - 0.6, z, colM);
      S.seg(HALL.x0, HALL.ceil - 1.2, z + 0.55, HALL.x1, HALL.ceil - 1.2, z + 0.55, conc, 1);
      // floor tile joints and the platform edge line
      S.seg(HALL.x0, 0.005, z, HALL.trench, 0.005, z, dim, 0.8);
      this.lights.push({ x: -2.2, z: z - BAY / 2 });
    }
    for (let x = HALL.x0 + 2; x < HALL.trench; x += 2.2) S.seg(x, 0.005, HALL.zNear, x, 0.005, HALL.zFar, dim, 0.7);
    S.seg(HALL.trench - 0.45, 0.01, HALL.zNear, HALL.trench - 0.45, 0.01, HALL.zFar, scaleRGB(LIN.sodium, 0.8), 1.6); // the yellow line
    S.seg(HALL.trench, 0, HALL.zNear, HALL.trench, 0, HALL.zFar, conc, 1.2);
    for (const x of [5.2, 6.7]) S.seg(x, -1.25, HALL.zNear, x, -1.25, HALL.zFar, conc, 1.3); // rails
    S.seg(HALL.x0, 0, HALL.zNear, HALL.x0, 0, HALL.zFar, conc, 1);
    S.seg(HALL.x0, HALL.ceil, HALL.zNear, HALL.x0, HALL.ceil, HALL.zFar, conc, 1);
    // exits in the left wall (their shutters roll down at "closed")
    for (const z of [-14, -38, -62, -86]) {
      this.gates.push(z);
      S.seg(HALL.x0 + 0.01, 0, z - 2.5, HALL.x0 + 0.01, 3.2, z - 2.5, conc, 1.3);
      S.seg(HALL.x0 + 0.01, 3.2, z - 2.5, HALL.x0 + 0.01, 3.2, z + 2.5, conc, 1.3);
      S.seg(HALL.x0 + 0.01, 0, z + 2.5, HALL.x0 + 0.01, 3.2, z + 2.5, conc, 1.3);
    }
    // floor: translucent over the wet reflections
    const fm = solid(scaleRGB(LIN.deep, 0.75), { transparent: true, opacity: 0.62 });
    fm.depthWrite = false;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.trench - HALL.x0, len), fm);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((HALL.x0 + HALL.trench) / 2, 0, zc);
    this.floorScene.add(floor);
    // the train: a dark body (windows are glows, edges are lines)
    box(3.0, 3.4, TRAIN_LEN, 0, 0, 0, solid(scaleRGB(LIN.deep, 1.2)), this.train).position.set(6, 0.5, -TRAIN_LEN / 2);
    this.three.add(this.train);
    for (let c = 0; c < 5; c++) {
      const z0 = -c * (TRAIN_LEN / 5);
      this.trainLines.box(6, -1.2, z0 - TRAIN_LEN / 10, 3.0, 3.4, TRAIN_LEN / 5 - 0.6, conc, 1.2);
    }
    // stations on the map, with their distance from the child's station along the network (for switch-off)
    LINES.forEach((pts, li) => {
      const n = STATIONS_PER[li]!;
      for (let i = 0; i < n; i++) {
        const [u, vv] = alongPolyline(pts, (i + 0.5) / n);
        this.stations.push({ u, v: vv, line: li, i, d: 0 });
      }
    });
    const here = this.stations.find((s) => s.line === 0 && s.i === HERE)!;
    for (const s of this.stations) s.d = Math.hypot(s.u - here.u, s.v - here.v);
    // the haze the map is projected on: a dark translucent sheet
    const bm = solid(scaleRGB(LIN.shadow, 0.9), { transparent: true, opacity: 0.7, fog: false });
    bm.depthWrite = false;
    this.mapBack = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w * 1.12, MAP.h * 1.18), bm);
    const mc = this.mapPt(0, 0, -0.1);
    this.mapBack.position.copy(mc);
    this.mapBack.rotation.x = -0.25;
    this.mapScene.add(this.mapBack);
    const B = (k: number) => this.au.timeOfBeat(k);
    const b0 = Math.round(this.au.beatAt(this.ctx.start));
    this.steps = [
      { text: 'Stay where you are.', at: B(b0 + 9) },
      { text: 'Find someone in uniform.', at: B(b0 + 11) },
      { text: 'Say your address.', at: B(b0 + 13) },
    ];
  }

  B = (k: number) => this.au.timeOfBeat(Math.round(this.au.beatAt(this.ctx.start)) + k);

  /** Map point (u, v in -1..1) → world. The map faces the camera, tilted back a little. */
  mapPt(u: number, vv: number, lift = 0): THREE.Vector3 {
    const [cx, cy, cz] = MAP.c;
    const tilt = 0.25;
    return new THREE.Vector3(cx + u * MAP.w / 2, cy + vv * MAP.h / 2 * Math.cos(tilt), cz - vv * MAP.h / 2 * Math.sin(tilt) + lift);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, B = this.B;
    this.begin();
    this.tubes.clear();
    // key times (beats from the chapter's first downbeat)
    const L1 = this.ly.get('You are lost'), L2 = this.ly.get('You missed the stop');
    const wStop = L2.words.find((w) => /stop/i.test(w.w))!;
    const wThe2 = L2.words[4]!, wClosed = L2.words[L2.words.length - 1]!;
    const tMap = B(8), tCrane = B(8) - 0.6, tClose = wThe2.start + 0.3, tPatrol = B(13) + 0.4;
    // the train: its front passes the child on "stop"
    const front = CHILD[2] + (t - wStop.start) * TRAIN_V;
    this.train.position.z = front;

    // ---------------------------------------------------------------- camera
    const cam = this.cam;
    const E = ease.inOutCubic;
    const tHi = tMap + 2.2, tDown0 = tPatrol - 0.5, tDown1 = tPatrol + 0.8;
    const kp: Key[][] = [
      // x, y, z of position; x, y, z of target
      [[f.start, -3.6], [tCrane, -3.3], [tHi, -3.5], [tDown0, -3.5], [tDown1, -3.1, E], [f.end, -3.0]],
      [[f.start, 1.6], [tCrane, 1.85], [tHi, 5.0, E], [tDown0, 5.1], [tDown1, 2.9, E], [f.end, 2.5]],
      [[f.start, 17], [tCrane, 8.5, ease.outQuad], [tHi, 8.8, E], [tDown0, 8.2], [tDown1, 3.4, E], [f.end, 2.4]],
      [[f.start, -1.6], [tCrane, -1.4], [tHi, -2.5, E], [tDown0, -2.5], [tDown1, -2.1, E], [f.end, -2.0]],
      [[f.start, 2.5], [tCrane, 2.3], [tHi, 5.8, E], [tDown0, 5.8], [tDown1, 1.4, E], [f.end, 1.3]],
      [[f.start, -60], [tCrane, -60], [tHi, -18, E], [tDown0, -18], [tDown1, -7, E], [f.end, -7]],
    ];
    const kv = kp.map((k) => keys(t, k));
    cam.position.set(kv[0]!, kv[1]!, kv[2]!);
    cam.lookAt(kv[3]!, kv[4]!, kv[5]!);
    cam.fov = 50;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // ---------------------------------------------------------------- the hall
    this.sky.render(renderer, out, { top: scaleRGB(LIN.shadow, 0.9), horizon: scaleRGB(LIN.fog, 0.55), low: scaleRGB(LIN.shadow, 0.9), horizonY: 0.5, t, haze: 0.8 });
    this.drawThree(out);
    // ceiling lights: cold tubes; they go off one by one, far to near, from "the metro closed"
    const cold = mixRGB(LIN.concrete, LIN.paper, 0.6);
    const offAt = (i: number, zz: number) => {
      const order = clamp((zz - HALL.zFar) / (CHILD[2] - 4 - HALL.zFar)); // 0 far .. 1 near
      return tClose + 0.2 + order * (wClosed.start + 1.0 - tClose);
    };
    const refl = this.glow3D;
    const lightOn = (zz: number, i: number) => {
      const ta = offAt(i, zz);
      if (t < ta) return 1;
      return t < ta + 0.12 ? (frameIdx(t) % 2 ? 0.3 : 0.9) : 0;
    };
    this.lights.forEach((l, i) => {
      const on = lightOn(l.z, i);
      if (on <= 0) return;
      const ll = scaleRGB(cold, 1.05 * on);
      this.tubes.seg(l.x - 2.4, HALL.ceil - 1.3, l.z, l.x + 2.4, HALL.ceil - 1.3, l.z, 0.22, ll[0], ll[1], ll[2], 1);
      // wet floor reflection (mirrored, stretched)
      refl.add(l.x, -(HALL.ceil - 1.3), l.z, 1.6, 2.6, cold, 0.1 * on, 3);
    });
    // train windows' reflections
    const winPts: V3[] = [];
    if (front > HALL.zFar - 10 && front - TRAIN_LEN < HALL.zNear + 20) {
      for (let zz = front - 1.5; zz > front - TRAIN_LEN; zz -= 2.3) {
        if ((front - zz) % (TRAIN_LEN / 5) < 1.2) continue;
        winPts.push([4.45, 1.6, zz]);
        refl.add(4.45, -1.6, zz, 0.6, 1.2, LIN.sodium, 0.18, 3);
      }
    }
    refl.render(renderer, out, cam);
    refl.clear();
    renderer.setRenderTarget(out);
    renderer.render(this.floorScene, cam);
    // lamp: the drone at the child's shoulder, pointing ahead at the floor
    const C = new THREE.Vector3(...CHILD);
    const bob = Math.sin(t * 1.9) * 0.03;
    const dronePos = C.clone().add(new THREE.Vector3(0.45, 1.3 + bob, -0.05));
    const lampK = smoothstep(f.start + 0.4, f.start + 1.4, t);
    const lamp = makeLamp(dronePos, C.clone().add(new THREE.Vector3(0.6, 0, -7)), 26, 11, 1.1 * lampK);
    this.structure.emit(this.lines3D, cam, { base: 0.5, fog: 0.03, lamps: [lamp], lampGain: 2.5 });
    this.trainLines.emit(this.lines3D, cam, { base: 0.6, fog: 0.03, offset: [0, 0, front] });
    this.lines3D.render(renderer, out, cam);
    this.drawShutters(t, tClose, cam, out);
    for (const [x, y, zz] of winPts) { const c = scaleRGB(LIN.sodium, 1.25); this.tubes.seg(x, y, zz - 0.6, x, y, zz + 0.6, 0.5, c[0], c[1], c[2], 1); this.glow3D.add(x, y, zz, 1.1, 0.7, LIN.sodium, 0.18, 2.5); }
    if (front > HALL.zFar && front - 2 < HALL.zNear + 40) {
      // headlights
      this.glow3D.add(4.6, 0.2, front + 0.1, 0.5, 0.5, LIN.lamp, 3, 4);
      this.glow3D.add(7.4, 0.2, front + 0.1, 0.5, 0.5, LIN.lamp, 3, 4);
    }
    this.tubes.render(renderer, out, cam);
    this.lights.forEach((l, i) => { const on = lightOn(l.z, i); if (on > 0) this.glow3D.add(l.x, HALL.ceil - 1.5, l.z, 3.2, 1.2, cold, 0.12 * on, 2.5); });
    this.glow3D.render(renderer, out, cam);
    this.cone.render(renderer, out, cam, lamp, t, { density: 0.18, floorY: 0, maxDist: 30 });

    // ---------------------------------------------------------------- the map (the drone projects it)
    const mapK = prog(t, tMap - 0.2, tMap + 0.9, ease.outCubic);
    const mapOut = 1 - smoothstep(tPatrol - 0.3, tPatrol + 0.5, t);
    const mapA = mapK * mapOut;
    const pd = project(cam, dronePos.x, dronePos.y, dronePos.z);
    const drPx = Math.max(2, pxPerMetre(cam, pd.depth) * 0.1);
    const u2 = this.ui.ctx, w2 = this.world.ctx;
    let here2 = { x: 0, y: 0 }, yours2 = { x: 0, y: 0 }, yoursAlive = 1;
    if (mapA > 0.001) {
      this.mapBack.material.opacity = 0.88 * mapA;
      this.mapBack.visible = true;
      const rr = this.ctx.renderer; rr.setRenderTarget(out); rr.render(this.mapScene, cam);
      const lb = this.lines3D; lb.clear();
      const lampC = scaleRGB(LIN.lamp, 1.0);
      // projection beams from the lens to the corners
      for (const [cu, cv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as P2[]) {
        const q = this.mapPt(cu * 1.02, cv * 1.05);
        lb.seg(dronePos.x, dronePos.y, dronePos.z, q.x, q.y, q.z, 1, lampC[0], lampC[1], lampC[2], 0.07 * mapA);
      }
      // frame ticks
      for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as [P2, P2][]) {
        const pa = this.mapPt(a[0] * 1.02, a[1] * 1.05), pb = this.mapPt(b[0] * 1.02, b[1] * 1.05);
        const n = 60;
        for (let i = 0; i < n; i += 2) {
          const k0 = i / n, k1 = (i + 0.4) / n;
          lb.seg(lerp(pa.x, pb.x, k0), lerp(pa.y, pb.y, k0), lerp(pa.z, pb.z, k0), lerp(pa.x, pb.x, k1), lerp(pa.y, pb.y, k1), lerp(pa.z, pb.z, k1), 1.2, lampC[0], lampC[1], lampC[2], 0.35 * mapA);
        }
      }
      // lines draw in, one after another
      LINES.forEach((pts, li) => {
        const grow = prog(t, tMap + li * 0.12, tMap + 0.6 + li * 0.12, ease.outCubic);
        const tot = polyLen(pts);
        let acc = 0;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!, b = pts[i]!;
          const sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const k = clamp((grow * tot - acc) / sl);
          acc += sl;
          if (k <= 0) continue;
          const pa = this.mapPt(a[0], a[1]), pb = this.mapPt(lerp(a[0], b[0], k), lerp(a[1], b[1], k));
          const c = li === 0 ? scaleRGB(LIN.lamp, 1.25) : scaleRGB(LIN.lamp, 0.55);
          lb.seg(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, li === 0 ? 4 : 2.4, c[0], c[1], c[2], mapA * 0.95);
        }
      });
      lb.render(renderer, out, cam);
      // stations: go dark one by one from the far edge towards the child, from "the metro closed"
      const maxD = Math.max(...this.stations.map((s) => s.d));
      const g = this.glow3D; g.clear();
      const trainU = this.mapTrainU(t, tMap);
      this.stations.forEach((s) => {
        const isHere = s.line === 0 && s.i === HERE, isYours = s.line === 0 && s.i === YOURS;
        if (isYours && trainU > s.u - 0.02) return; // it has left with the train (drawn below)
        const tOff = tClose + 0.25 + (1 - s.d / maxD) * (wClosed.start + 0.9 - tClose);
        let on = t < tOff ? 1 : t < tOff + 0.1 ? 0.4 : 0.12;
        on *= prog(t, tMap + 0.4 + s.d * 0.3, tMap + 0.7 + s.d * 0.3);
        if (isHere) return;
        const p = this.mapPt(s.u, s.v, 0.02);
        g.add(p.x, p.y, p.z, 0.16, 0.16, on > 0.2 ? LIN.lamp : scaleRGB(LIN.concrete, 0.6), (on > 0.2 ? 1.6 : 0.9) * on * mapA, 4);
      });
      // the map's train: a lit bar along the child's line; it carries YOUR STOP away
      if (trainU > -1.2 && trainU < 1.3) {
        for (let k = 0; k < 6; k++) {
          const uu = trainU - k * 0.035;
          const [px, py] = polyAtU(LINES[0]!, uu);
          const p = this.mapPt(px, py, 0.05);
          g.add(p.x, p.y, p.z, 0.2, 0.12, LIN.sodium, 1.4 * mapA * (1 - smoothstep(1.0, 1.25, trainU)), 3);
        }
      }
      // the child: the yellow dot
      const hs = this.stations.find((s) => s.line === 0 && s.i === HERE)!;
      const hp = this.mapPt(hs.u, hs.v, 0.06);
      const pulse = 0.8 + 0.2 * Math.sin(t * 5);
      g.add(hp.x, hp.y, hp.z, 0.3, 0.3, scaleRGB(LIN.coat, 1.4), 2.2 * pulse * mapA * prog(t, tMap + 0.3, tMap + 0.5), 4);
      g.render(renderer, out, cam);
      g.clear();
      here2 = project(cam, hp.x, hp.y, hp.z);
      const ys = this.stations.find((s) => s.line === 0 && s.i === YOURS)!;
      const yu = Math.max(ys.u, trainU - 0.03);
      const [yx, yy] = polyAtU(LINES[0]!, yu);
      const yp = this.mapPt(yx, yy, 0.05);
      yours2 = project(cam, yp.x, yp.y, yp.z);
      yoursAlive = 1 - smoothstep(0.95, 1.2, yu);
      // callouts on the map
      drawCallout(u2, t, { ax: here2.x, ay: here2.y, lx: here2.x + 70, ly: here2.y + 120, side: 1, text: 'YOU ARE HERE', at: tMap + 0.55, out: tPatrol - 0.4, size: 18, color: 'coat' });
      drawCallout(u2, t, { ax: yours2.x, ay: yours2.y, lx: yours2.x + 60, ly: yours2.y - 90, side: 1, text: 'YOUR STOP', at: tMap + 1.1, out: tPatrol - 0.4, size: 18, alpha: yoursAlive * mapA });
    }

    // ---------------------------------------------------------------- the station screen (the city's line)
    const sp = project(cam, -10.5, 3.9, -9);
    if (!sp.behind) {
      const ppm = pxPerMetre(cam, sp.depth);
      const size = clamp(ppm * 0.26, 9, 22);
      const halfW = size * 0.74 * 66 / 2 + size;
      sp.x = clamp(sp.x, SAFE + halfW, W - SAFE - halfW);
      drawSystemLine(w2, t, 'SERVICE ENDED · NEXT SERVICE 05:40 · THANK YOU FOR YOUR PATIENCE', sp.x, sp.y, { size, at: tClose + 0.6, cps: 45, align: 'center', alpha: 1 - smoothstep(tPatrol + 0.8, tPatrol + 1.6, t) });
      drawSystemLine(w2, t, 'NEXT TRAIN · 2 MIN', sp.x, sp.y, { size, at: -1e9, align: 'center', alpha: 1 - smoothstep(tClose + 0.45, tClose + 0.6, t) });
    }

    // ---------------------------------------------------------------- figures
    const pf = project(cam, C.x, C.y, C.z), ph = project(cam, C.x, C.y + 1.12, C.z);
    const hPx = pf.y - ph.y;
    // the train's wind tugs at the coat while it passes
    const gust = smoothstep(8, 0, Math.abs(front - TRAIN_LEN / 2 - C.z) - TRAIN_LEN / 2);
    drawChild(w2, pf.x, pf.y, hPx, { pose: 'stand', t, lit: 0.5 * lampK, litSide: 1, shade: 0.25, wind: gust });
    const look: [number, number] = mapA > 0.5 ? [here2.x - pd.x, here2.y - pd.y] : [0.2, 0.6];
    drawDrone(w2, pd.x, pd.y, drPx, { t, lamp: lampK, look });
    this.drawPatrol(w2, u2, t, tPatrol, cam, C, f.end);
    this.composite2D(this.world, out);
    droneGlow(this.glow2D, pd.x, pd.y, drPx, lampK, look);
    this.glow2D.render(renderer, out);
    this.fogSheet.render(renderer, out, { color: scaleRGB(LIN.fog, 0.7), alpha: 0.25, y0: 0.3, y1: 1.0, t, scale: 1.2, speed: 0.015 });

    // ---------------------------------------------------------------- UI: the entry, the panel, the counter
    const ex = SAFE, ew = W - 2 * SAFE - 330;
    drawEntry(u2, this.ly, this.au, L1, t, { x: ex, y: 200, width: ew, size: 62, alpha: entryAlpha(L1, t, 30, L2.words[0]!.start) });
    drawEntry(u2, this.ly, this.au, L2, t, { x: ex, y: 200, width: ew, size: 62, alpha: entryAlpha(L2, t, 30) });
    drawPanel(u2, t, { x: SAFE, y: H - SAFE - 210, w: 560, steps: this.steps, at: tMap + 0.2, size: 22 });
    drawPageCounter(u2, this.ly, t, { chapter: 'lost', chapterStart: f.start });
    // fade up from the ink of the previous dive
    const fadeIn = 1 - smoothstep(f.start, f.start + 1.1, t);
    this.composite2D(this.ui, out);
    return { ...POST_BASE, fade: fadeIn * 0.9 };
  }

  /** Map-train position along the child's line (map u): passes the child, then YOUR STOP, then off the map. */
  mapTrainU(t: number, tMap: number) {
    const here = this.stations.find((s) => s.line === 0 && s.i === HERE)!;
    return lerp(here.u - 0.35, 1.3, prog(t, tMap + 0.8, tMap + 3.2, (x) => x * x * (3 - 2 * x) * 0.6 + x * 0.4));
  }

  /** Shutters over the exits: horizontal slats rolling down from the lintel. */
  drawShutters(t: number, tClose: number, cam: THREE.Camera, out: THREE.WebGLRenderTarget) {
    const lb = this.lines3D; lb.clear();
    this.gates.forEach((z, i) => {
      const t0 = tClose + 0.4 + i * 0.35;
      const k = prog(t, t0, t0 + 1.3, ease.outCubic);
      if (k <= 0) return;
      const bottom = 3.2 - 3.2 * k;
      const c = scaleRGB(LIN.concrete, 0.9);
      for (let y = 3.15; y >= bottom; y -= 0.22) lb.seg(HALL.x0 + 0.05, y, z - 2.45, HALL.x0 + 0.05, y, z + 2.45, 1.4, c[0], c[1], c[2], 0.8 * Math.exp(-Math.hypot(z - cam.position.z, HALL.x0 - cam.position.x) * 0.03));
    });
    lb.render(this.ctx.renderer, out, cam);
  }

  /** The patrol drone: flat, hexagonal, cold. It flies in, scans the child, logs her, and leaves. */
  drawPatrol(w: CanvasRenderingContext2D, u: CanvasRenderingContext2D, t: number, t0: number, cam: THREE.PerspectiveCamera, C: THREE.Vector3, tEnd: number) {
    if (t < t0 - 0.2) return;
    const arrive = prog(t, t0 - 0.2, t0 + 0.7, ease.outCubic), leave = prog(t, t0 + 1.55, t0 + 2.2, ease.inCubic);
    const x = lerp(8, C.x + 1.4, arrive) + lerp(0, -16, leave);
    const pos = new THREE.Vector3(x, 1.9 + Math.sin(t * 2.3) * 0.04, C.z + 1.2);
    const p = project(cam, pos.x, pos.y, pos.z);
    if (p.behind) return;
    const s = pxPerMetre(cam, p.depth) * 0.26;
    w.save();
    w.translate(p.x, p.y);
    // rotors
    w.fillStyle = rgba('paper', 0.14);
    for (const sx of [-1.6, 1.6]) { w.beginPath(); w.ellipse(sx * s, -0.55 * s, 0.75 * s, 0.1 * s, 0, 0, Math.PI * 2); w.fill(); }
    // body: a flat hexagon, cold grey
    w.fillStyle = rgba('#3d444c');
    w.beginPath();
    w.moveTo(-1.5 * s, 0); w.lineTo(-1.0 * s, -0.42 * s); w.lineTo(1.0 * s, -0.42 * s); w.lineTo(1.5 * s, 0); w.lineTo(1.0 * s, 0.36 * s); w.lineTo(-1.0 * s, 0.36 * s); w.closePath(); w.fill();
    w.strokeStyle = rgba('concrete', 0.8); w.lineWidth = Math.max(1, s * 0.05); w.stroke();
    // the eye: a slit
    w.fillStyle = rgba('paper', 0.95);
    w.fillRect(-0.55 * s, -0.06 * s, 1.1 * s, 0.12 * s);
    // status light (the city's colour)
    w.fillStyle = rgba('neon', 0.9);
    w.beginPath(); w.arc(1.15 * s, -0.12 * s, 0.07 * s, 0, Math.PI * 2); w.fill();
    w.restore();
    // scan: a pale fan down over the child, a sweep line, a reticle
    const scanK = prog(t, t0 + 0.6, t0 + 1.4);
    const pf = project(cam, C.x, C.y, C.z), ph = project(cam, C.x, C.y + 1.12, C.z);
    if (scanK > 0 && scanK < 1) {
      const sy = lerp(ph.y - 6, pf.y + 4, scanK);
      w.save();
      w.globalCompositeOperation = 'lighter';
      w.fillStyle = rgba('paper', 0.12);
      w.beginPath(); w.moveTo(p.x, p.y); w.lineTo(pf.x - (pf.y - ph.y) * 0.5, sy); w.lineTo(pf.x + (pf.y - ph.y) * 0.5, sy); w.closePath(); w.fill();
      w.strokeStyle = rgba('paper', 0.7); w.lineWidth = 1.5;
      w.beginPath(); w.moveTo(pf.x - (pf.y - ph.y) * 0.5, sy); w.lineTo(pf.x + (pf.y - ph.y) * 0.5, sy); w.stroke();
      w.restore();
    }
    const ret = prog(t, t0 + 0.6, t0 + 0.8) * (1 - prog(t, t0 + 2.4, t0 + 2.7));
    if (ret > 0) {
      const hh = pf.y - ph.y, pad = hh * 0.18, x0 = pf.x - hh * 0.4 - pad, x1 = pf.x + hh * 0.4 + pad, y0 = ph.y - pad, y1 = pf.y + pad * 0.5;
      const L = hh * 0.18;
      u.save();
      u.globalAlpha *= ret;
      u.strokeStyle = rgba('neon', 0.9); u.lineWidth = 1.5;
      u.beginPath();
      for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
        u.moveTo(cx + sx * L, cy); u.lineTo(cx, cy); u.lineTo(cx, cy + sy * L);
      }
      u.stroke();
      u.restore();
      drawSystemLine(u, t, 'MINOR · LOGGED', x1 + 40, y1 - 10, { size: 19, at: t0 + 1.0, cps: 30, alpha: ret, frame: true });
    }
  }
}

// ------------------------------------------------------------------ small polyline helpers (map units)
function polyLen(p: P2[]) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return s; }
function alongPolyline(p: P2[], k: number): P2 {
  let s = k * polyLen(p);
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!, b = p[i]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l) return [lerp(a[0], b[0], s / l), lerp(a[1], b[1], s / l)];
    s -= l;
  }
  return p[p.length - 1]!;
}
/** Point on a left-to-right polyline at horizontal coordinate u (extrapolated past the ends). */
function polyAtU(p: P2[], u: number): P2 {
  if (u <= p[0]![0]) return [u, p[0]![1]];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!, b = p[i]!;
    if (u <= b[0]) return [u, lerp(a[1], b[1], (u - a[0]) / Math.max(1e-6, b[0] - a[0]))];
  }
  return [u, p[p.length - 1]![1]];
}
