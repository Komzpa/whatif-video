// `lost` r4 — «НЕ УСПЕЛ ВЫЙТИ ИЗ ВАГОНА МЕТРО», «ТЫ ПОТЕРЯЛСЯ». One first-person sequence told by what happens
// (TREATMENT r5 item 5, r6: no book, r7: Russian, Soviet radial-ring city; TESTPLAN gates). The child's own
// hands are the only body we see (src/scenes/_hands.ts). Every name and distance comes from city.json.
//   (a) 0–9.5 s   the carriage, seen frontally from the bench opposite the door. The line diagram over the door
//                 shows Садовая coming; the train brakes into Садовая (the plate: «ТВОЯ ОСТАНОВКА»); the child
//                 gets up late, walks to the door; «ДВЕРИ ЗАКРЫВАЮТСЯ»; the doors close in its face, the left
//                 hand grabs at the closing edge; the plate slides away.
//   (b) 9.5–13 s  the tunnel through the door glass; the diagram lights past Садовая, the names beyond the ring
//                 break into mojibake («ДАЛЬШЕ КАРТЫ НЕТ»).
//   (c) 13–16.5 s Заводская, an unfamiliar deep station: dim, every sign mojibake. «You are lost»: the torch
//                 comes up; the map card once (≤ 3 s): you are here, your stop far back, not on the map. The child
//                 walks to the escalator arch. Cut.
//   (d) 16.5–21 s the microdistrict street in the rain: panel blocks at angles, heating mains, garages, the
//                 promzona's concrete fence opposite. The child turns back to the metro vestibule; the roller
//                 shutter comes down out of its drum on «the metro closed» and lands on the beat; the child runs
//                 back and puts a hand flat on the slats («СТАНЦИЯ ЗАКРЫТА»).
//   (e) 21–26 s   it turns to the fence: the only way is through the promzona gate («ПОСТОРОННИМ ВХОД
//                 ВОСПРЕЩЁН · ДОМ · 6,3 км»); it runs across and goes in.
// Non-diegetic layer: at most one callout or the map card at a time, beside the chapter line.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { clamp, ease, lerp, prog, smoothstep, keys, hash, mulberry32 } from '../engine/util';
import { F, font, measure } from '../engine/type';
import {
  CityScene, LitLines, NeonSign, FogCards, LIN, POST_BASE, SAFE, rgba, mixRgba, scaleRGB, mixRGB, solid, col3, project,
  drawCallout, makeLamp, flicker, rain, logText, textlog,
  walkMotion, easePov,
} from './_motifs';
import { drawHeading, stencilText, noticeCanvas, metroSignCanvas } from './_ru';
import { torchPose, drawTorchHand, drawOpenHand, pxAt, type Light } from './_hands';
import { city, stations, yourStop, exitStation, stationIndex, isKnown, garble, drawCityMap, mapPx, homeLabel, type MapView, type XY } from '../city';
import { MOJI, CODEC_RU, moji } from '../mojibake';
import { entriesOf } from '../contents';

type V3 = [number, number, number];
type Box = { x: number; y: number; w: number; h: number };
type RGB = [number, number, number];
interface Pov { space: 'car' | 'world'; p: V3; yaw: number; pitch: number; walk: number }

// ---------------------------------------------------------------- the carriage (car-local metres)
const DOOR_X = 3.5, DOOR_W = 1.3, DOOR_H = 1.9;
const WALL_Z = -1.45, WIN_Y0 = 0.88, WIN_Y1 = 1.95, CEIL = 2.35;
const SEAT: V3 = [DOOR_X, 0.95, 1.05]; // the bench opposite the door: the door and the diagram straight ahead
const EYE = 1.12;
const PLATFORM_HALF = 21;
// Заводская: the city map on the back wall straight across from the door, the exit arch to its right
const ARCH_X = DOOR_X + 2.4;
const MAP_W = 1.4, MAP_H = 1.0, MAP_Y = 1.6, MAP_Z = -5.66, MCW = 1400, MCH = 1000;
const MAP_S = 95, MAP_OX = 700, MAP_OY = 575; // km -> map canvas px (north up)
const S2 = 110; // metres from Садовая to Заводская (the film's compression)
// the line diagram above the door: 1.2 m x 0.36 m, drawn at 1000 x 300
const BX0 = DOOR_X - 0.6, BX1 = DOOR_X + 0.6, BY0 = CEIL - 0.03, BY1 = DOOR_H + 0.07, BZ = WALL_Z + 0.07;
const DW = 1000, DH = 300;
// ---------------------------------------------------------------- the street (world metres; along x)
const GATE_Z = 5.0; // the vestibule's front wall (its face at GATE_Z - 0.2)
const FACE_Z = GATE_Z - 0.2;
const OPEN_W = 2.4, OPEN_H = 2.5; // the entrance opening
const CURT_Z = FACE_Z - 0.04;
const SLAT = 0.09, NSLAT = 30, BAR = 0.07;
const FENCE_Z = -5.0; // the promzona's concrete fence on the far pavement
const GATE_X = 2.5; // the promzona gate (3 m wide)

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;

export default class Lost extends CityScene {
  constructor(ctx: ConstructorParameters<typeof CityScene>[0]) {
    super(ctx);
    // r9 note 3: the first-person view eased (pov is the target; a change of space, car/world, stays a cut)
    const raw = this.pov;
    this.pov = (t: number) => easePov((q) => raw.call(this, q), t);
  }
  // district
  dLines = new LitLines();
  curtLines = new LitLines();
  curtSlat: number[] = []; // slat index of each curtain line
  signs: NeonSign[] = [];
  vestBoard!: NeonSign;
  curtain = new THREE.Group();
  slats: THREE.Mesh[] = [];
  notice!: THREE.Mesh; noticeText: string[] = [];
  gateSign!: THREE.Mesh; gateSignText = '';
  fog = new THREE.FogExp2(0, 0.022);
  fogCards = new FogCards();
  lamps: V3[] = [];
  windows: { p: V3; c: RGB; k: number; ph: number; ry?: number }[] = [];
  redLights: V3[] = [];
  vestLights: V3[] = [];
  // train
  car = new THREE.Scene();
  outside = new THREE.Scene();
  platA = new THREE.Group(); platB = new THREE.Group();
  carLines = new LitLines();
  linesA = new LitLines(); linesB = new LitLines();
  leaves: THREE.Group[] = [];
  lightsA: V3[] = []; lightsB: V3[] = [];
  tunnelLights: number[] = [];
  platesA: NeonSign[] = []; platesB: NeonSign[] = [];
  wallMap!: THREE.Mesh; wallMapBase!: HTMLCanvasElement; wallMapCv!: HTMLCanvasElement; wallMapTex!: THREE.CanvasTexture;
  poleM = solid(scaleRGB(LIN.concrete, 1.25), { fog: false });
  panes: [number, number][] = []; // side window panes (car x), y WIN_Y0..WIN_Y1
  wallMapTexts: { text: string; x: number; y: number; w: number; h: number }[] = [];
  tubes = new LineBatch(2000, { screen2D: false, worldWidth: true, blend: 'add', depthTest: true });
  T: Record<string, number> = {};
  base = 0;

  B = (k: number) => this.au.timeOfBeat(this.base + k);
  labelCache = new Map<string, { dx: number; dy: number; side: 1 | -1 }>();
  /**
   * A callout's label placement as an offset from its anchor (the label rides with its object, the leader stays
   * short): the first of a few nearby offsets whose label box stays clear of every sign, board and the sung line,
   * and inside the frame's safe area, over the callout's whole life (sampled). A pure function of its inputs
   * (cached), so any frame order gives the same answer.
   */
  pickLabel(text: string | string[], size: number, at: number, out: number, anchor: (t: number) => { x: number; y: number } | null) {
    const key = `${JSON.stringify(text)}@${at.toFixed(3)}`;
    const hit = this.labelCache.get(key);
    if (hit) return hit;
    const cands: [number, number, 1 | -1][] = [[50, -90, 1], [-50, -90, -1], [50, 120, 1], [-50, 120, -1], [110, -20, 1], [-110, -20, -1], [50, -180, 1], [-50, -180, -1], [60, 210, 1], [-60, 210, -1], [50, -280, 1], [-50, -280, -1]];
    const samples: { a: { x: number; y: number }; obst: Box[] }[] = [];
    const t1 = Math.min(out, at + 5);
    for (let k = 0; k <= 24; k++) {
      const t = lerp(at + 0.1, t1, k / 24);
      const r = this.withCamAt(t, () => ({ a: anchor(t), obst: this.obstNow(t) }));
      if (r.a) samples.push({ a: r.a, obst: [this.lyricBox(), ...r.obst] });
    }
    let best = cands[0]!, bestA = Infinity;
    for (const cd of cands) {
      let a = 0;
      for (const sm of samples) {
        const b = this.labelBox(text, size, sm.a.x + cd[0], sm.a.y + cd[1], cd[2]);
        const c = this.clampLabel(b);
        a += 40 * (Math.abs(c.x - b.x) + Math.abs(c.y - b.y)); // pushed off the safe area: the leader would stretch
        for (const o of sm.obst) a += Math.max(0, Math.min(c.x + c.w, o.x + o.w) - Math.max(c.x, o.x) + 6) * Math.max(0, Math.min(c.y + c.h, o.y + o.h) - Math.max(c.y, o.y) + 6);
      }
      if (a < bestA) { bestA = a; best = cd; }
      if (a === 0) break;
    }
    const r = { dx: best[0], dy: best[1], side: best[2] };
    this.labelCache.set(key, r);
    return r;
  }
  /** The label's backing box as drawCallout draws it (px). */
  labelBox(text: string | string[], size: number, lx: number, ly: number, side: 1 | -1): Box {
    const lines = Array.isArray(text) ? text : [text];
    const w = Math.max(...lines.map((ln) => measure(ln, F.mono(500), size, size * 0.06)));
    return { x: (side > 0 ? lx : lx - w) - size * 0.5, y: ly - size * 1.15, w: w + size, h: size * (0.75 + 1.35 * lines.length) };
  }
  /** Keep a label box inside the frame (and the TikTok safe area in 9:16). */
  clampLabel(b: Box): Box {
    const x0 = 40, x1 = W - (PORTRAIT ? 145 : 40), y0 = PORTRAIT ? 155 : 40, y1 = H - (PORTRAIT ? 485 : 40);
    return { ...b, x: clamp(b.x, x0, x1 - b.w), y: clamp(b.y, y0, y1 - b.h) };
  }
  /** Where a callout's label goes this frame: its anchor plus the fixed offset, clamped into the safe area. */
  placeLabel(text: string | string[], size: number, a: { x: number; y: number }, o: { dx: number; dy: number; side: 1 | -1 }) {
    const lx = a.x + o.dx, ly = a.y + o.dy;
    const b = this.labelBox(text, size, lx, ly, o.side), c = this.clampLabel(b);
    return { lx: lx + c.x - b.x, ly: ly + c.y - b.y, side: o.side };
  }
  lyricBox(): Box { return PORTRAIT ? { x: 30, y: 1416 - 100 * 3 - 90, w: W - 60, h: 440 } : { x: SAFE - 30, y: H - 96 - 64 * 2 - 70, w: 1080, h: 290 }; }
  /** Run `fn` with the camera and the moving parts set as they are at time t (no rendering), then restore. */
  withCamAt<R>(t: number, fn: () => R): R {
    const cam = this.cam;
    const saved = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, ax: this.platA.position.x, bx: this.platB.position.x, cy: this.curtain.position.y };
    const P = this.proofPov() ?? this.pov(t);
    this.setCam({ ...P, walk: 0 }, t, 0);
    const s = this.trainS(t), onB = s > S2 / 2, sl = onB ? s - S2 : s;
    (onB ? this.platB : this.platA).position.x = -sl;
    this.curtain.position.y = this.shutterY(t);
    this.platA.updateMatrixWorld(true); this.platB.updateMatrixWorld(true); this.curtain.updateMatrixWorld(true);
    const r = fn();
    cam.position.copy(saved.p); cam.quaternion.copy(saved.q); cam.fov = saved.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    this.platA.position.x = saved.ax; this.platB.position.x = saved.bx; this.curtain.position.y = saved.cy;
    this.platA.updateMatrixWorld(true); this.platB.updateMatrixWorld(true); this.curtain.updateMatrixWorld(true);
    return r;
  }
  /** Screen boxes of the signs and boards for the current camera (the obstacles for callout labels, A4). */
  obstNow(t: number): Box[] {
    const cam = this.cam, P = this.proofPov() ?? this.pov(t);
    const out: Box[] = [];
    const add = (b: Box | null) => { if (b && b.x + b.w > 0 && b.x < W && b.y + b.h > 0 && b.y < H) out.push(b); };
    if (P.space === 'world') {
      for (const sg of this.signs) add(sg.screenBox(cam));
      add(this.vestBoard.screenBox(cam));
      add(this.planeBox(this.gateSign)); add(this.planeBox(this.notice));
    } else {
      const onB = this.trainS(t) > S2 / 2;
      for (const sg of onB ? this.platesB : this.platesA) add(sg.screenBox(cam));
      if (onB) for (const r of this.wallMapTexts) add(this.mapRectBox(r));
      add(this.boardBox());
    }
    return out;
  }
  /** A textured plane's box on screen (px), or null when any corner is behind the camera. */
  planeBox(m: THREE.Mesh): Box | null {
    const { width: w, height: h } = (m.geometry as THREE.PlaneGeometry).parameters;
    m.updateMatrixWorld(true);
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => { const v = new THREE.Vector3(x, y, 0).applyMatrix4(m.matrixWorld); return project(this.cam, v.x, v.y, v.z); });
    if (pts.some((q) => q.behind)) return null;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  boardBox(): Box | null {
    const cam = this.cam;
    const a = project(cam, BX0, BY0, BZ), b = project(cam, BX1, BY0, BZ), d = project(cam, BX0, BY1, BZ), e = project(cam, BX1, BY1, BZ);
    if (a.behind || b.behind || d.behind || e.behind) return null;
    const xs = [a.x, b.x, d.x, e.x], ys = [a.y, b.y, d.y, e.y];
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  override init() {
    this.base = Math.round(this.au.beatAt(2.707));
    const B = this.B, ly = this.ly;
    const L1 = ly.get('You are lost'), L2 = ly.get('You missed the stop');
    const wYou = L1.words[0]!, wLost = L1.words[L1.words.length - 1]!;
    const wMetro = L2.words.find((w) => /metro/i.test(w.w))!, wClosed = L2.words[L2.words.length - 1]!;
    // the shutter lands on the beat nearest "closed"
    let land = B(0);
    for (let k = 0; k < 40; k++) if (Math.abs(B(k) - wClosed.start) < Math.abs(land - wClosed.start)) land = B(k);
    const T: Record<string, number> = {
      stop: B(5) + 0.2, look1: 2.2, look2: 4.3,
      stand: B(6) - 0.2, walk0: B(6) + 0.35, shut0: B(7) + 0.9, shut1: B(7) + 1.15, go: B(8) + 0.35,
      boardEnd: B(12) + 0.3, arrive: B(12) + 0.75,
      open: wYou.start, lost: wLost.start,
      // the hard cut sits halfway between two 60 fps frames: a frame's motion-blur shutter (±¼ frame) never
      // straddles it, so no frame averages the platform with the street (gate 3: no double exposure); ≤ 8 ms off the beat
      cut: (Math.round(B(19) * 60 - 0.5) + 0.5) / 60,
      turnBack: wMetro.start - 0.25, shutterGo: wMetro.start, land,
    };
    T.exit0 = T.open + 0.2; T.exit1 = T.open + 1.0;
    // the torch on the wall map: on "lost" it finds ВЫ ЗДЕСЬ; on "you missed the stop" it runs back along the line
    const wStop = L2.words.find((w) => /stop/i.test(w.w))!;
    T.trace0 = L2.words[0]!.start; T.trace1 = wStop.start;
    T.stopCall = T.trace0 + 0.07; T.turnArch = T.cut - 0.67;
    T.run0 = T.shutterGo + 0.53; T.run1 = T.land + 0.1;
    T.touch0 = T.land - 0.05; T.touch1 = T.land + 0.7;
    T.turnZone = T.land + 1.0; T.run2a = T.turnZone + 0.7; T.run2b = T.run2a + 2.6; T.walkIn = T.run2b + 0.05;
    this.T = T;
    this.initTrain();
    this.initDistrict();
  }

  // ================================================================ the carriage, the tunnel, two platforms
  initTrain() {
    const m = (rgb: RGB) => solid(rgb, { fog: false });
    const wallM = m(scaleRGB(LIN.deep, 1.9)), darkM = m(scaleRGB(LIN.shadow, 1.4)), floorM = m(scaleRGB(LIN.shadow, 1.5)), ceilM = m(scaleRGB(LIN.concrete, 0.45));
    const seatM = m(mixRGB(LIN.fog, LIN.smog, 0.25));
    const box = (g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); g.add(b); return b;
    };
    const car = this.car, L = this.carLines, cc = scaleRGB(LIN.concrete, 1.1);
    const X0 = -14, X1 = 14;
    box(car, X1 - X0, 0.1, 3.2, 0, -0.05, 0, floorM);
    box(car, X1 - X0, 0.1, 3.2, 0, CEIL + 0.05, 0, ceilM);
    const doors = [DOOR_X, DOOR_X - 9.5, DOOR_X + 9.5];
    const spans: [number, number][] = [];
    let s0 = X0;
    for (const d of [...doors].sort((a, b) => a - b)) { spans.push([s0, d - DOOR_W / 2]); s0 = d + DOOR_W / 2; }
    spans.push([s0, X1]);
    for (const [a, b] of spans) {
      box(car, b - a, WIN_Y0, 0.08, (a + b) / 2, WIN_Y0 / 2, WALL_Z, wallM);
      box(car, b - a, CEIL - WIN_Y1, 0.08, (a + b) / 2, (WIN_Y1 + CEIL) / 2, WALL_Z, wallM);
      const np = Math.max(1, Math.round((b - a) / 1.7)), pw0 = (b - a) / np;
      for (let k = 0; k <= np; k++) box(car, 0.14, WIN_Y1 - WIN_Y0, 0.1, a + k * pw0, (WIN_Y0 + WIN_Y1) / 2, WALL_Z, darkM);
      for (let k = 0; k < np; k++) this.panes.push([a + k * pw0 + 0.07, a + (k + 1) * pw0 - 0.07]);
      L.seg(a, WIN_Y0, WALL_Z + 0.05, b, WIN_Y0, WALL_Z + 0.05, cc, 1.2);
      L.seg(a, WIN_Y1, WALL_Z + 0.05, b, WIN_Y1, WALL_Z + 0.05, cc, 1.2);
      box(car, b - a - 0.2, 0.12, 0.5, (a + b) / 2, 0.4, WALL_Z + 0.3, seatM);
      box(car, b - a - 0.2, 0.34, 0.08, (a + b) / 2, 0.66, WALL_Z + 0.08, seatM);
      L.seg(a + 0.1, 0.46, WALL_Z + 0.55, b - 0.1, 0.46, WALL_Z + 0.55, scaleRGB(LIN.concrete, 0.8), 1);
    }
    const glass = solid(scaleRGB(LIN.concrete, 0.5), { fog: false, transparent: true, opacity: 0.1 });
    glass.depthWrite = false;
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, WIN_Y1 - WIN_Y0), glass);
    gl.position.set(0, (WIN_Y0 + WIN_Y1) / 2, WALL_Z - 0.02);
    car.add(gl);
    for (const d of doors) {
      box(car, DOOR_W + 0.2, CEIL - DOOR_H, 0.1, d, (DOOR_H + CEIL) / 2, WALL_Z, wallM);
      L.box(d, 0, WALL_Z + 0.06, DOOR_W, DOOR_H, 0.02, cc, 1.3);
    }
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      const lw = DOOR_W / 2, leafM = m(scaleRGB(LIN.concrete, 0.5)), edgeM = m(scaleRGB(LIN.shadow, 1.2));
      box(leaf, lw, 1.0, 0.05, 0, 0.5, 0, leafM);
      box(leaf, lw, DOOR_H - 1.72, 0.05, 0, (1.72 + DOOR_H) / 2, 0, leafM);
      box(leaf, 0.08, 0.72, 0.05, -lw / 2 + 0.04, 1.36, 0, leafM);
      box(leaf, 0.08, 0.72, 0.05, lw / 2 - 0.04, 1.36, 0, leafM);
      box(leaf, 0.04, DOOR_H, 0.07, -sx * (lw / 2 - 0.02), DOOR_H / 2, 0.01, edgeM); // the rubber edge
      leaf.userData.sx = sx;
      car.add(leaf);
      this.leaves.push(leaf);
    }
    // grab poles and the handrail
    const tube = (a: V3, b: V3, rad: number) => {
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, va.distanceTo(vb), 14), this.poleM);
      cyl.position.copy(va.clone().add(vb).multiplyScalar(0.5));
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
      car.add(cyl);
    };
    for (const x of [DOOR_X - 1.35, DOOR_X + 1.35, -2.2, -6.4, 8.6]) tube([x, 0, -0.75], [x, CEIL, -0.75], 0.019);
    tube([X0, 1.98, 0.2], [X1, 1.98, 0.2], 0.016);
    // the tunnel (both directions) and the two platforms
    this.outside.add(this.platA, this.platB);
    for (let x = -400; x < 400; x += 12) this.tunnelLights.push(x);
    this.buildPlatform(this.platA, this.linesA, false);
    this.buildPlatform(this.platB, this.linesB, true);
  }

  /** A deep Soviet station: the platform, the track wall with the station's name, lamps; B has the exit arch. */
  buildPlatform(g: THREE.Group, O: LitLines, unfamiliar: boolean) {
    const m = (rgb: RGB) => solid(rgb, { fog: false });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); g.add(b); return b;
    };
    const k = unfamiliar ? 0.7 : 1;
    const pm = m(scaleRGB(LIN.concrete, 0.42 * k)), pw = m(mixRGB(scaleRGB(LIN.concrete, 0.62 * k), scaleRGB(LIN.smog, 0.3), 0.2)), tm = m(scaleRGB(LIN.shadow, 1.4));
    box(PLATFORM_HALF * 2, 0.2, 4.2, 0, -0.1, -3.7, pm);
    box(PLATFORM_HALF * 2, 0.2, 4.4, 0, 4.4, -3.7, tm);
    // the tunnel wall beyond each end of the platform (the train runs through it between the stations)
    for (const sx of [-1, 1]) box(300, 4.4, 0.2, sx * (PLATFORM_HALF + 150), 2.2, -2.4, tm);
    const ax0 = ARCH_X - 1.2, ax1 = ARCH_X + 1.2, AH = 3.0;
    if (unfamiliar) {
      // the back wall with the exit arch; behind it the escalator hall rising away
      box(ax0 + PLATFORM_HALF, 4.5, 0.2, (ax0 - PLATFORM_HALF) / 2, 2.25, -5.8, pw);
      box(PLATFORM_HALF - ax1, 4.5, 0.2, (ax1 + PLATFORM_HALF) / 2, 2.25, -5.8, pw);
      box(ax1 - ax0, 4.5 - AH, 0.2, ARCH_X, (AH + 4.5) / 2, -5.8, pw);
      const hall = m(scaleRGB(LIN.shadow, 1.8));
      for (const sx of [-1, 1]) box(0.2, 8, 9, ARCH_X + sx * 1.9, 3, -10.3, hall);
      box(4, 0.2, 9, ARCH_X, 7.2, -10.3, hall);
      // three escalators up (30°) with balustrades; the lamps on the balustrades (the torchère posts)
      const e = scaleRGB(LIN.concrete, 0.8);
      for (const ex of [-1.1, 0, 1.1]) {
        const x = ARCH_X + ex;
        for (const dx of [-0.45, 0.45]) O.seg(x + dx, 0.9, -6.0, x + dx, 0.9 + 6 * 0.577, -12, e, 1.2);
        for (let s = 0; s < 22; s++) { const z = -6.2 - s * 0.27; const y = Math.max(0, (-6.2 - z) * 0.577); O.seg(x - 0.4, y, z, x + 0.4, y, z, scaleRGB(LIN.concrete, 0.5), 0.7); }
      }
      for (let s = 0; s < 6; s++) for (const ex of [-0.55, 0.55]) this.lightsB.push([ARCH_X + ex, 1.6 + s * 0.6, -6.4 - s * 1.05]);
      O.box(ARCH_X, 0, -5.72, ax1 - ax0, AH, 0.02, scaleRGB(LIN.concrete, 1.0), 1.4);
      // no exit sign on this platform: a lit sign over the arch would be cut by the carriage windows at the stop
      // and by the frame's top edge as the child steps out (TESTPLAN C1); the escalators going up read as the way out
      // the city map on the wall (paper behind glass), unlit: only the torch shows it
      this.wallMapBase = this.drawWallMapBase();
      this.wallMapCv = document.createElement('canvas'); this.wallMapCv.width = MCW; this.wallMapCv.height = MCH;
      this.wallMapTex = new THREE.CanvasTexture(this.wallMapCv); this.wallMapTex.colorSpace = THREE.SRGBColorSpace; this.wallMapTex.anisotropy = 8;
      this.wallMap = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), new THREE.MeshBasicMaterial({ map: this.wallMapTex, fog: false }));
      this.wallMap.position.set(DOOR_X, MAP_Y, MAP_Z);
      g.add(this.wallMap);
      box(MAP_W + 0.08, MAP_H + 0.08, 0.03, DOOR_X, MAP_Y, MAP_Z - 0.02, m(scaleRGB(LIN.shadow, 1.1)));
      this.lightMap(null, 0, 0.2);
    } else {
      box(PLATFORM_HALF * 2, 4.5, 0.2, 0, 2.25, -5.8, pw);
    }
    const oc = scaleRGB(LIN.concrete, k);
    for (let x = -PLATFORM_HALF; x <= PLATFORM_HALF; x += 6) { if (Math.abs(x - DOOR_X) < 1.3 || (unfamiliar && x > ax0 - 0.5 && x < ax1 + 0.5)) continue; box(0.5, 4.3, 0.5, x, 2.15, -3.4, pw); O.box(x, 0, -3.4, 0.5, 4.3, 0.5, oc, 1); }
    for (let x = -PLATFORM_HALF; x <= PLATFORM_HALF; x += 0.6) { if (unfamiliar && x > ax0 && x < ax1) continue; O.seg(x, 0, -5.68, x, 4.3, -5.68, scaleRGB(LIN.concrete, 0.5 * k), 0.7); }
    O.seg(-PLATFORM_HALF, 0.01, -1.9, PLATFORM_HALF, 0.01, -1.9, scaleRGB(LIN.sodium, 0.9 * k), 3);
    const lights = unfamiliar ? this.lightsB : this.lightsA;
    for (let x = -PLATFORM_HALF + 2; x < PLATFORM_HALF; x += 4) if (!unfamiliar || hash(x, 3) > 0.45) lights.push([x, 4.1, -3.2]);
    // the station's name on the track wall (metal letters on a plate), repeated along the platform
    const name = unfamiliar ? exitStation().name : yourStop().name;
    const plates = unfamiliar ? this.platesB : this.platesA;
    const at: [number, number, number][] = unfamiliar ? [[-14, 2.0, 0.55], [-8, 2.0, 0.55], [13, 2.0, 0.55], [19, 2.0, 0.55]] : [[DOOR_X - 0.85, 1.95, 0.34]];
    for (const [x, y, hh] of at) {
      const sg = new NeonSign({ lines: [unfamiliar ? garble(name) : name], pos: [x, y, -5.66], height: hh, kind: 'screen', color: 'paper', bright: unfamiliar ? 0.8 : 1.2, flicker: unfamiliar ? 0.1 : 0.02, seed: x, garbled: unfamiliar });
      g.add(sg.mesh);
      plates.push(sg);
    }
    void box;
  }

  /** A wall-map canvas rect on screen (px). */
  mapRectBox(r: { x: number; y: number; w: number; h: number }): Box | null {
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => { const v = this.mapWorld({ x: x!, y: y! }); return project(this.cam, v.x, v.y, v.z); });
    if (pts.some((q) => q.behind)) return null;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  /** The openings in the carriage wall on screen this frame: side window panes, the door gap, the leaves' windows. */
  apertures(openK: number): Box[] {
    const rects: [number, number, number, number][] = this.panes.map(([a, b]) => [a, b, WIN_Y0, WIN_Y1]);
    const g = openK * (DOOR_W / 2 - 0.02);
    if (g > 0.01) rects.push([DOOR_X - g, DOOR_X + g, 0, DOOR_H]);
    for (const sx of [-1, 1]) {
      const cx = DOOR_X + sx * (DOOR_W / 4 + g), x0 = Math.max(DOOR_X - DOOR_W / 2, cx - 0.245), x1 = Math.min(DOOR_X + DOOR_W / 2, cx + 0.245);
      if (x1 - x0 > 0.02) rects.push([x0, x1, 1.0, 1.72]);
    }
    const out: Box[] = [];
    for (const [x0, x1, y0, y1] of rects) {
      const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => project(this.cam, x!, y!, WALL_Z - 0.03));
      if (pts.some((q) => q.behind)) continue;
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      out.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    }
    return out;
  }
  /** Log a platform sign as seen from inside the carriage: whole in one opening, cut by the wall, or hidden. */
  logThrough(sg: NeonSign, aps: Box[], kind: 'place' | 'garble', scenery: boolean) {
    const b = sg.screenBox(this.cam);
    if (!b) return;
    const text = sg.o.lines.join(' / ');
    this.logBoxThrough(b, aps, kind, text, scenery ? `scenery:${kind}:${text}` : `${kind}:${text}`);
  }
  /** Log any text box seen through the carriage wall's openings (aps null: the camera is outside the car). */
  logBoxThrough(b: Box, aps: Box[] | null, kind: 'place' | 'garble' | 'sign', text: string, id: string, lit = true) {
    if (!aps) {
      if (b.x + b.w < 0 || b.x > W || b.y + b.h < 0 || b.y > H) return;
      logText(kind, text, lit && b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H && b.h >= 12, b, { id });
      return;
    }
    const ov = (a: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const hits = aps.filter(ov);
    if (!hits.length || b.x + b.w < 0 || b.x > W || b.y + b.h < 0 || b.y > H) return;
    const whole = hits.some((a) => b.x >= a.x - 2 && b.y >= a.y - 2 && b.x + b.w <= a.x + a.w + 2 && b.y + b.h <= a.y + a.h + 2);
    const inFrame = b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;
    logText(kind, text, lit && whole && inFrame && b.h >= 12, b, { id, ...(whole ? {} : { clip: true }) });
  }
  /** km (city.json) -> the wall map's canvas px. */
  mapCv(p: XY | [number, number]) { return { x: MAP_OX + p[0] * MAP_S, y: MAP_OY - p[1] * MAP_S }; }
  /** The wall map's canvas px -> world (platform B at its station). */
  mapWorld(q: { x: number; y: number }) { return new THREE.Vector3(this.platB.position.x + DOOR_X + (q.x / MCW - 0.5) * MAP_W, MAP_Y + (0.5 - q.y / MCH) * MAP_H, MAP_Z + 0.01); }

  /** The printed city map (paper): districts, the promzona, streets, the three metro lines, «ВЫ ЗДЕСЬ». */
  drawWallMapBase() {
    const cv = document.createElement('canvas'); cv.width = MCW; cv.height = MCH;
    const c = cv.getContext('2d')!, CT = city();
    c.fillStyle = '#E4DCC4'; c.fillRect(0, 0, MCW, MCH);
    // age: damp stains, a fold
    for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(120,95,60,${0.03 + 0.05 * hash(i, 11)})`; c.beginPath(); c.arc(hash(i, 12) * MCW, hash(i, 13) * MCH, 30 + 90 * hash(i, 14), 0, Math.PI * 2); c.fill(); }
    const poly = (pts: number[][]) => { c.beginPath(); pts.forEach((p, i) => { const q = this.mapCv(p as [number, number]); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); c.closePath(); };
    for (const d of CT.districts as any[]) { poly(d.poly); c.fillStyle = d.kind === 'centre' ? '#D9C9A8' : d.known ? '#D3CDB5' : '#CEC6AC'; c.fill(); c.strokeStyle = 'rgba(90,80,60,0.35)'; c.lineWidth = 2; c.stroke(); }
    // the promzona: grey with a hatch and a dashed fence line
    poly(CT.restricted.poly); c.fillStyle = '#B9B4A6'; c.fill();
    c.save(); poly(CT.restricted.poly); c.clip(); c.strokeStyle = 'rgba(60,55,50,0.35)'; c.lineWidth = 3;
    for (let x = -MCH; x < MCW; x += 22) { c.beginPath(); c.moveTo(x, MCH); c.lineTo(x + MCH, 0); c.stroke(); }
    c.restore(); poly(CT.restricted.poly); c.setLineDash([14, 8]); c.strokeStyle = '#5B544A'; c.lineWidth = 4; c.stroke(); c.setLineDash([]);
    for (const st of CT.streets as any[]) {
      c.strokeStyle = st.kind === 'street' ? '#A89F88' : '#9A9079'; c.lineWidth = st.kind === 'prospekt' ? 7 : st.kind === 'ring' ? 6 : 3.5; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); (st.pts as number[][]).forEach((p, i) => { const q = this.mapCv(p as [number, number]); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); if (st.kind === 'ring') c.closePath(); c.stroke();
    }
    // the metro: the ring line as a circle through its stations, the radial lines through theirs
    for (const ln of CT.metro.lines as any[]) {
      c.strokeStyle = ln.color; c.lineWidth = 11; c.lineCap = 'round'; c.lineJoin = 'round';
      const pts = (ln.stations as any[]).map((q) => this.mapCv(q.at));
      c.beginPath();
      if (/Кольцев/.test(ln.name)) { const o = this.mapCv([0, 0]); c.arc(o.x, o.y, Math.hypot(pts[0]!.x - o.x, pts[0]!.y - o.y), 0, Math.PI * 2); }
      else pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.stroke();
    }
    for (const ln of CT.metro.lines as any[]) for (const q of ln.stations as any[]) {
      const p = this.mapCv(q.at);
      c.fillStyle = '#FBF7EC'; c.strokeStyle = ln.color; c.lineWidth = 5; c.beginPath(); c.arc(p.x, p.y, 11, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // «ВЫ ЗДЕСЬ» at this station, printed in red with a white knockout
    const here = this.mapCv(exitStation().at);
    c.fillStyle = '#A3241C'; c.beginPath(); c.arc(here.x, here.y, 17, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#FBF7EC'; c.lineWidth = 4; c.beginPath(); c.arc(here.x, here.y, 17, 0, Math.PI * 2); c.stroke();
    c.font = font(F.metro(900), 44); c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    c.lineWidth = 10; c.strokeStyle = '#E4DCC4'; c.strokeText('ВЫ ЗДЕСЬ', here.x - 30, here.y - 26);
    { const w = c.measureText('ВЫ ЗДЕСЬ').width; this.wallMapTexts.push({ text: 'ВЫ ЗДЕСЬ', x: here.x - 30 - w - 6, y: here.y - 26 - 38, w: w + 12, h: 50 }); }
    c.fillStyle = '#62120D'; c.fillText('ВЫ ЗДЕСЬ', here.x - 30, here.y - 26);
    // the title band and the frame
    c.fillStyle = '#2B2A27'; c.fillRect(0, 0, MCW, 92);
    c.fillStyle = '#E9E2CC'; c.font = font(F.metro(900), 56); c.textAlign = 'left'; c.fillText('СХЕМА ГОРОДА', 40, 66);
    this.wallMapTexts.push({ text: 'СХЕМА ГОРОДА', x: 34, y: 18, w: c.measureText('СХЕМА ГОРОДА').width + 12, h: 60 });
    c.fillStyle = '#C8352B'; c.beginPath(); c.arc(MCW - 70, 46, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#FBF7EC'; c.font = font(F.metro(900), 42); c.textAlign = 'center'; c.fillText('М', MCW - 70, 61);
    c.strokeStyle = '#2B2A27'; c.lineWidth = 10; c.strokeRect(5, 5, MCW - 10, MCH - 10);
    return cv;
  }

  /**
   * The wall map as lit this frame: dim station light (`amb`) plus the torch's spot where its beam hits the map
   * (`hit` in canvas px, radius `rad` px), warm at the centre.
   */
  mapLight: { hit: { x: number; y: number; rad: number } | null; on: number; amb: number } = { hit: null, on: 0, amb: 0 };
  /** How much of the paper's brightness reaches canvas point (x, y) under the current lighting (0 dark .. 1 lit). */
  mapBright(x: number, y: number) {
    const { hit, on, amb } = this.mapLight, a = 1 - amb;
    if (!hit || on <= 0.01) return 1 - a;
    const d = Math.hypot(x - hit.x, y - hit.y) / hit.rad;
    const al = d <= 0.6 ? lerp(a * (1 - on), a * (1 - 0.92 * on), d / 0.6) : d <= 1 ? lerp(a * (1 - 0.92 * on), a, (d - 0.6) / 0.4) : a;
    return 1 - al;
  }
  lightMap(hit: { x: number; y: number; rad: number } | null, on: number, amb: number) {
    this.mapLight = { hit, on, amb };
    const c = this.wallMapCv.getContext('2d')!;
    c.globalCompositeOperation = 'source-over';
    c.drawImage(this.wallMapBase, 0, 0);
    const dark = 'rgba(10,12,16,';
    if (hit && on > 0.01) {
      const g = c.createRadialGradient(hit.x, hit.y, 0, hit.x, hit.y, hit.rad);
      const a = 1 - amb;
      g.addColorStop(0, `${dark}${(a * (1 - on)).toFixed(3)})`); g.addColorStop(0.6, `${dark}${(a * (1 - 0.92 * on)).toFixed(3)})`); g.addColorStop(1, `${dark}${a.toFixed(3)})`);
      c.fillStyle = g; c.fillRect(0, 0, MCW, MCH);
      c.globalCompositeOperation = 'multiply';
      const w = c.createRadialGradient(hit.x, hit.y, 0, hit.x, hit.y, hit.rad * 0.8);
      w.addColorStop(0, `rgba(255,238,212,${on.toFixed(3)})`); w.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = w; c.fillRect(0, 0, MCW, MCH);
      c.globalCompositeOperation = 'source-over';
    } else { c.fillStyle = `${dark}${(1 - amb).toFixed(3)})`; c.fillRect(0, 0, MCW, MCH); }
    this.wallMapTex.needsUpdate = true;
  }

  // ================================================================ the microdistrict street, the vestibule, the fence
  initDistrict() {
    this.fog.color = col3(mixRGB(scaleRGB(LIN.fog, 0.75), scaleRGB(LIN.smog, 0.35), 0.25));
    this.three.fog = this.fog;
    const S = this.three, L = this.dLines, r = mulberry32(31);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, ry = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.y = ry; S.add(b); return b;
    };
    const conc = scaleRGB(LIN.concrete, 0.8), dim = scaleRGB(LIN.concrete, 0.5);
    // ground, with the vestibule's escalator pit left open (x ±5, z 9.2..13)
    const gm = solid(scaleRGB(LIN.shadow, 1.05));
    const ground = (x0: number, z0: number, x1: number, z1: number) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), gm); p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); S.add(p); };
    ground(-1500, -1500, 1500, 9.2); ground(-1500, 13, 1500, 1500); ground(-1500, 9.2, -5, 13); ground(5, 9.2, 1500, 13);
    // the road (6 m), kerbs, pavements, puddle lines
    for (const z of [-3, 3]) L.seg(-220, 0.14, z, 220, 0.14, z, dim, 0.9);
    for (let x = -220; x < 220; x += 5) L.seg(x, 0.01, 0, x + 2, 0.01, 0, scaleRGB(LIN.paper, 0.22), 0.6);
    // Soviet streetlights (a concrete post, a curved arm) on both pavements
    for (let x = -160; x <= 160; x += 26) for (const z of [3.6, -3.8]) {
      if (Math.abs(x - GATE_X) < 6 && z < 0) continue;
      const hz = z > 0 ? z - 1.1 : z + 1.1;
      this.lamps.push([x, 7.2, hz]);
      L.seg(x, 0, z, x, 7.4, z, conc, 1.0); L.seg(x, 7.4, z, x, 7.3, hz, conc, 0.8);
    }
    // ---- the promzona: the concrete fence with relief panels and barbed wire, the gate, the tin sign, stencils
    const fm = solid(mixRGB(scaleRGB(LIN.concrete, 0.55), scaleRGB(LIN.smog, 0.25), 0.2));
    const fc = scaleRGB(LIN.concrete, 1.0);
    for (let x = -90; x < 90; x += 2.5) {
      if (x + 2.5 > GATE_X - 1.6 && x < GATE_X + 1.6) continue;
      box(2.48, 2.3, 0.12, x + 1.25, 1.15, FENCE_Z, fm);
      L.box(x + 1.25, 0, FENCE_Z + 0.07, 2.48, 2.3, 0.01, scaleRGB(fc, 0.7), 0.7);
      // the diamond relief of the panel
      for (let k = 0; k < 4; k++) { const cx = x + 0.3 + k * 0.63, cy = 1.15; L.seg(cx, cy - 0.3, FENCE_Z + 0.07, cx + 0.3, cy, FENCE_Z + 0.07, scaleRGB(fc, 0.35), 0.5); L.seg(cx + 0.3, cy, FENCE_Z + 0.07, cx, cy + 0.3, FENCE_Z + 0.07, scaleRGB(fc, 0.35), 0.5); }
      // barbed wire on angled brackets
      L.seg(x, 2.3, FENCE_Z, x, 2.75, FENCE_Z + 0.35, fc, 0.8);
    }
    for (const [y, dz] of [[2.45, 0.12], [2.6, 0.24], [2.74, 0.34]] as const) for (let x = -90; x < 90; x += 0.5) {
      if (x > GATE_X - 1.7 && x < GATE_X + 1.6) continue;
      L.seg(x, y, FENCE_Z + dz, x + 0.5, y + 0.01, FENCE_Z + dz, scaleRGB(fc, 0.8), 0.5);
      L.seg(x + 0.22, y - 0.03, FENCE_Z + dz, x + 0.28, y + 0.04, FENCE_Z + dz, scaleRGB(fc, 0.8), 0.5);
    }
    // the gate: two steel leaves; the right one stands ajar, swung in (the way in)
    for (const sx of [-1, 1]) { box(0.3, 2.9, 0.3, GATE_X + sx * 1.65, 1.45, FENCE_Z, fm); L.box(GATE_X + sx * 1.65, 0, FENCE_Z, 0.3, 2.9, 0.3, fc, 1.0); }
    L.box(GATE_X - 0.8, 0.05, FENCE_Z, 1.5, 2.1, 0.04, fc, 1.2);
    for (let k = 0; k <= 7; k++) L.seg(GATE_X - 1.5 + k * 0.2, 0.1, FENCE_Z, GATE_X - 1.5 + k * 0.2, 2.1, FENCE_Z, fc, 0.8);
    const aj = 1.0, hx = GATE_X + 1.5, gw = 1.5, ex = hx - Math.cos(aj) * gw, ez = FENCE_Z - Math.sin(aj) * gw;
    for (const y of [0.1, 1.1, 2.1]) L.seg(hx, y, FENCE_Z, ex, y, ez, fc, 1.2);
    for (let k = 0; k <= 7; k++) { const q = k / 7; L.seg(lerp(hx, ex, q), 0.1, lerp(FENCE_Z, ez, q), lerp(hx, ex, q), 2.1, lerp(FENCE_Z, ez, q), fc, 0.8); }
    this.lamps.push([GATE_X, 4.2, FENCE_Z - 0.4]); // the one sodium lamp over the gate
    L.seg(GATE_X - 1.65, 2.9, FENCE_Z, GATE_X - 1.65, 4.3, FENCE_Z, conc, 0.8);
    // the tin sign on the closed leaf: white with a red border, the text as the child sees it (mojibake)
    this.gateSignText = garble(city().restricted.signs[1] ?? city().restricted.sign);
    {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 300;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#EEEAE0'; c.fillRect(0, 0, 512, 300);
      c.strokeStyle = '#B3261E'; c.lineWidth = 22; c.strokeRect(14, 14, 484, 272);
      // stencil-painted on the tin (TREATMENT r7: stencil for fences), two lines, centred
      const words = this.gateSignText.split(' '), half = Math.ceil(words.length / 2);
      [words.slice(0, half).join(' '), words.slice(half).join(' ')].forEach((ln, k) => {
        let sz = 64; c.font = font(F.stencil(), sz);
        const wOf = () => c.measureText(ln).width + sz * 0.08 * ln.length;
        while (wOf() > 440 && sz > 20) { sz -= 2; c.font = font(F.stencil(), sz); }
        stencilText(c, ln, 256 - wOf() / 2, 135 + k * 80, sz, '#15120E', '#EEEAE0');
      });
      for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(120,70,30,${0.03 + 0.05 * hash(i, 2)})`; c.beginPath(); c.arc(hash(i, 5) * 512, hash(i, 6) * 300, 6 + 20 * hash(i, 7), 0, Math.PI * 2); c.fill(); }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      this.gateSign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
      this.gateSign.position.set(GATE_X - 0.45, 1.45, FENCE_Z + 0.04);
      S.add(this.gateSign);
    }
    // inside the promzona: sawtooth sheds, a chimney with red lights, a gantry crane, a pipe rack
    const shedM = solid(scaleRGB(LIN.shadow, 1.5));
    box(22, 16, 10, GATE_X + 6, 8, FENCE_Z - 38, shedM); // the works' office block (the letters on its roof)
    for (let x = -60; x <= 60; x += 22) {
      box(18, 7, 14, x, 3.5, FENCE_Z - 16 - hash(x, 1) * 8, shedM);
      for (let k = 0; k < 6; k++) { const sx = x - 9 + k * 3, z = FENCE_Z - 9 - hash(x, 1) * 8; L.seg(sx, 7, z, sx + 3, 8.4, z, dim, 0.8); L.seg(sx + 3, 8.4, z, sx + 3, 7, z, dim, 0.8); }
    }
    for (let x = -60; x <= 60; x += 22) this.lamps.push([x + 4, 5.5, FENCE_Z - 9 - hash(x, 1) * 8 + 0.3]);
    for (let a = 0; a < 12; a++) { const q = (a / 12) * Math.PI * 2; L.seg(-18 + Math.cos(q) * 1.6, 0, -60 + Math.sin(q) * 1.6, -18 + Math.cos(q) * 1.0, 48, -60 + Math.sin(q) * 1.0, dim, 1.0); }
    this.redLights.push([-18, 48.5, -60], [-18, 30, -59], [22, 30, -48]);
    L.seg(10, 0, -45, 10, 29, -45, dim, 1.4); L.seg(34, 0, -45, 34, 29, -45, dim, 1.4); L.seg(4, 29, -45, 40, 29, -45, dim, 1.6);
    for (let x = -80; x < 80; x += 6) L.seg(x, 0, FENCE_Z - 6, x, 4.5, FENCE_Z - 6, scaleRGB(LIN.concrete, 0.4), 0.8);
    L.seg(-80, 4.2, FENCE_Z - 6, 80, 4.2, FENCE_Z - 6, scaleRGB(LIN.concrete, 0.45), 2.2);
    // ---- the microdistrict behind the vestibule: panel blocks at angles, garages, the heating main, a playground
    const blocks: [number, number, number, number, number][] = [ // cx, cz, length, floors, angle
      [-4, 44, 96, 9, 0.18], [-66, 26, 64, 5, 0.95], [58, 30, 70, 5, -0.7], [-120, 60, 80, 9, 0.4], [118, 64, 84, 9, -0.35], [10, 110, 120, 9, 0.05],
      [-40, -70, 60, 9, 0.3], [70, -90, 70, 9, -0.2],
    ];
    for (const [cx, cz, len, fl, ang] of blocks) this.panelBlock(cx, cz, len, fl, ang, r);
    // the lit windows are real rectangles on the facades (a curtain-warm pane each)
    {
      const wins = this.windows.filter((w) => w.ry !== undefined);
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.35), new THREE.MeshBasicMaterial({ fog: true, toneMapped: false }), wins.length);
      const o = new THREE.Object3D(), col = new THREE.Color();
      wins.forEach((w, i) => {
        o.position.set(w.p[0], w.p[1], w.p[2]); o.rotation.set(0, w.ry!, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
        const k = 0.55 * w.k; col.setRGB(w.c[0] * k, w.c[1] * k, w.c[2] * k, THREE.LinearSRGBColorSpace); im.setColorAt(i, col);
      });
      S.add(im);
    }
    // garages (the metal row) west of the vestibule
    const garM = solid(scaleRGB(LIN.concrete, 0.35));
    for (let k = 0; k < 7; k++) {
      const gx = -30 + k * 3.1, gz = 15;
      box(3, 2.3, 6, gx, 1.15, gz, garM);
      L.box(gx, 0, gz - 3.02, 2.6, 2.1, 0.01, scaleRGB(LIN.concrete, 0.55 + 0.2 * hash(k, 9)), 0.8);
    }
    // the heating main on low supports along the south pavement, stepping up in a П over the yard driveway
    const pipeM = solid(mixRGB(scaleRGB(LIN.concrete, 0.7), scaleRGB(LIN.smog, 0.15), 0.3));
    const pipe = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rad: number) => {
      const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), len = a.distanceTo(b);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 10), pipeM);
      cyl.position.copy(a.clone().add(b).multiplyScalar(0.5));
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      S.add(cyl);
      L.seg(x0, y0 + rad, z0, x1, y1 + rad, z1, scaleRGB(LIN.concrete, 0.9), 0.8);
    };
    for (const dz of [0, 0.75]) {
      const z = 8.0 + dz;
      pipe(-150, 1.1, z, -40, 1.1, z, 0.28); pipe(-40, 1.1, z, -40, 5.6, z, 0.28); pipe(-40, 5.6, z, -34, 5.6, z, 0.28); pipe(-34, 5.6, z, -34, 1.1, z, 0.28); pipe(-34, 1.1, z, -8, 1.1, z, 0.28);
      pipe(8, 1.1, z, 150, 1.1, z, 0.28);
    }
    for (let x = -150; x < 150; x += 6) { if (Math.abs(x) < 8 || (x > -41 && x < -33)) continue; box(0.4, 0.8, 1.4, x, 0.4, 8.4, solid(scaleRGB(LIN.concrete, 0.4))); }
    // the playground in the yard: a climbing frame and a swing
    for (let k = 0; k < 4; k++) L.box(-52 + k * 0.9, 0, 36, 0.9, 1.8, 0.9, scaleRGB(LIN.sodium, 0.35), 0.7);
    L.seg(-44, 0, 36, -44, 2.2, 36, conc, 0.9); L.seg(-41, 0, 36, -41, 2.2, 36, conc, 0.9); L.seg(-44, 2.2, 36, -41, 2.2, 36, conc, 0.9);
    // ---- the metro vestibule (the pavilion) with its roller shutter
    this.buildVestibule(box);
    // ---- mojibake shop and utility signs (the child can't read any of them here)
    const soup: ConstructorParameters<typeof NeonSign>[0][] = [
      { lines: [garble('ПРОДУКТЫ')], pos: [-60, 3.6, 20.5], rotY: Math.PI - 0.95, height: 1.1, bright: 1.6, flicker: 0.2, seed: 11, garbled: true, color: 'neon' },
      { lines: [garble('АПТЕКА')], pos: [52, 3.6, 24], rotY: Math.PI + 0.7, height: 1.0, bright: 1.4, flicker: 0.05, seed: 12, garbled: true, color: 'sodium' },
      { kind: 'led', header: '24', lines: [garble('ГАРАЖНЫЙ КООПЕРАТИВ')], pos: [-20, 3.2, 11.9], rotY: Math.PI, height: 0.7, color: 'sodium', garbled: true },
      { lines: [garble('ТЕПЛОСЕТЬ')], kind: 'screen', pos: [-37, 6.4, 8.35], rotY: Math.PI, height: 0.6, color: 'paper', bright: 0.9, seed: 14, garbled: true },
      { lines: [garble('ЗАВОД')], pos: [GATE_X + 6, 17, FENCE_Z - 32.9], height: 2.4, bright: 1.5, flicker: 0.25, seed: 16, garbled: true, color: 'neon' },
    ];
    for (const o of soup) { const sg = new NeonSign(o); this.signs.push(sg); S.add(sg.mesh); }
    const fcol = mixRGB(LIN.fog, LIN.smog, 0.25);
    this.fogCards.add({ z: -50, w: 600, y0: 0, y1: 70, color: fcol, alpha: 0.25, scale: 0.03, seed: 1, high: 30 });
    this.fogCards.add({ z: 160, w: 900, y0: 0, y1: 120, color: fcol, alpha: 0.3, scale: 0.02, seed: 2, high: 60 });
    this.fogCards.add({ z: -200, w: 1400, y0: 0, y1: 260, color: mixRGB(LIN.fog, LIN.smog, 0.4), alpha: 0.35, scale: 0.01, seed: 3, high: 120 });
  }

  /** A panel block (пятиэтажка / девятиэтажка): a slab with floor and panel joints, a few lit windows, entrances. */
  panelBlock(cx: number, cz: number, len: number, floors: number, ang: number, r: () => number) {
    const S = this.three, L = this.dLines, FH = 2.8, D = 12, h = floors * FH;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, h, D), solid(mixRGB(scaleRGB(LIN.deep, 1.5), scaleRGB(LIN.concrete, 0.25), 0.35)));
    mesh.position.set(cx, h / 2, cz); mesh.rotation.y = ang; S.add(mesh);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (u: number, y: number, v: number): V3 => [cx + u * ca + v * sa, y, cz - u * sa + v * ca];
    const seg = (a: V3, b: V3, col: RGB, w: number) => L.seg(a[0], a[1], a[2], b[0], b[1], b[2], col, w);
    const jc = scaleRGB(LIN.concrete, 0.42);
    for (const v of [-D / 2 - 0.02, D / 2 + 0.02]) {
      for (let f = 1; f < floors; f++) seg(P(-len / 2, f * FH, v), P(len / 2, f * FH, v), jc, 0.5);
      for (let u = -len / 2; u <= len / 2 + 0.01; u += 3.2) seg(P(u, 0, v), P(u, h, v), scaleRGB(jc, 0.7), 0.4);
      // windows: two per panel per floor; a few lit (warm), one flickers blue (a television)
      for (let f = 0; f < floors; f++) for (let u = -len / 2 + 0.9; u < len / 2 - 0.5; u += 1.6) {
        if (r() > 0.13) continue;
        const tv = r() < 0.12;
        this.windows.push({ ry: Math.atan2(sa * Math.sign(v), ca * Math.sign(v)), p: P(u, f * FH + 1.5, v + Math.sign(v) * 0.05), c: tv ? mixRGB(LIN.concrete, LIN.paper, 0.6) : mixRGB(LIN.sodium, LIN.lamp, r()), k: 0.5 + r() * 0.8, ph: tv ? -1 - r() * 5 : r() * 10 });
      }
      // the entrances (подъезды): a small lamp over each
      for (let u = -len / 2 + 8; u < len / 2 - 4; u += 16) this.windows.push({ p: P(u, 2.6, v + Math.sign(v) * 0.4), c: LIN.lamp, k: 0.9, ph: 0 });
    }
    seg(P(-len / 2, h, -D / 2), P(len / 2, h, -D / 2), scaleRGB(LIN.concrete, 0.55), 0.8);
    seg(P(-len / 2, h, D / 2), P(len / 2, h, D / 2), scaleRGB(LIN.concrete, 0.55), 0.8);
  }

  /** The vestibule: a concrete pavilion with a clerestory, the entrance with a real roller shutter (TESTPLAN B3). */
  buildVestibule(box: (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, ry?: number) => THREE.Mesh) {
    const S = this.three, L = this.dLines;
    const wallM = solid(mixRGB(scaleRGB(LIN.concrete, 0.5), scaleRGB(LIN.smog, 0.18), 0.25)), inM = solid(scaleRGB(LIN.concrete, 0.3));
    const PH = 4.2, PW = 10, PD = 8;
    // front wall around the opening, side walls, back wall, roof slab with an overhang
    box((PW - OPEN_W) / 2, PH, 0.4, -(OPEN_W / 2 + (PW - OPEN_W) / 4), PH / 2, GATE_Z, wallM);
    box((PW - OPEN_W) / 2, PH, 0.4, OPEN_W / 2 + (PW - OPEN_W) / 4, PH / 2, GATE_Z, wallM);
    box(OPEN_W, PH - OPEN_H, 0.4, 0, (OPEN_H + PH) / 2, GATE_Z, wallM);
    for (const sx of [-1, 1]) box(0.3, PH, PD, sx * PW / 2, PH / 2, GATE_Z + PD / 2, wallM);
    box(PW, PH, 0.3, 0, PH / 2, GATE_Z + PD, wallM);
    box(PW + 1, 0.35, PD + 1, 0, PH + 0.17, GATE_Z + PD / 2 - 0.3, solid(scaleRGB(LIN.concrete, 0.4)));
    // the clerestory band of glazing along the top of the front, lit from inside
    const c1 = scaleRGB(LIN.concrete, 0.9);
    L.box(0, 0, FACE_Z - 0.01, PW, PH, 0.02, scaleRGB(LIN.concrete, 0.7), 1.0);
    for (let x = -PW / 2 + 0.4; x < PW / 2; x += 0.8) if (Math.abs(x) > OPEN_W / 2 + 0.3) this.vestLights.push([x, 3.75, FACE_Z - 0.02]);
    // inside: the floor, a row of turnstiles, the escalators going down, torchère lamps, ceiling lights
    box(PW - 0.4, 0.06, 4.2, 0, -0.03, GATE_Z + 2.1, inM);
    for (let x = -2; x <= 2; x += 1) { box(0.22, 1.0, 0.8, x, 0.5, GATE_Z + 2.2, solid(scaleRGB(LIN.concrete, 0.55))); L.box(x, 0, GATE_Z + 2.2, 0.22, 1.0, 0.8, c1, 0.8); this.vestLights.push([x, 1.02, GATE_Z + 1.78]); }
    for (const sx of [-1, 1]) box(0.3, 3.6, 4.2, sx * 1.9, -1.8, GATE_Z + 6.2, inM); // the pit walls
    for (const ex of [-1.1, 0, 1.1]) {
      for (const dx of [-0.45, 0.45]) L.seg(ex + dx, 0.95, GATE_Z + 4.1, ex + dx, 0.95 - 3.4, GATE_Z + 4.1 + 5.9, scaleRGB(LIN.concrete, 0.8), 1.1);
      for (let s = 0; s < 20; s++) { const z = GATE_Z + 4.3 + s * 0.3, y = -(z - GATE_Z - 4.3) * 0.577; L.seg(ex - 0.4, y, z, ex + 0.4, y, z, scaleRGB(LIN.concrete, 0.45), 0.6); }
    }
    for (let s = 0; s < 4; s++) for (const ex of [-0.55, 0.55]) this.vestLights.push([ex, 1.5 - s * 0.9, GATE_Z + 4.6 + s * 1.5]);
    for (let z = GATE_Z + 1; z < GATE_Z + PD; z += 2) this.vestLights.push([0, PH - 0.3, z]);
    // ---- the roller shutter: the drum housing on the lintel, two U-channel rails, the curtain
    const metal = solid(scaleRGB(LIN.concrete, 0.62));
    box(OPEN_W + 0.3, 0.45, 0.42, 0, OPEN_H + 0.225, FACE_Z - 0.21, metal); // the housing (the drum inside)
    L.box(0, OPEN_H, FACE_Z - 0.21, OPEN_W + 0.3, 0.45, 0.42, scaleRGB(LIN.concrete, 1.1), 1.0);
    for (const sx of [-1, 1]) {
      const x = sx * (OPEN_W / 2 + 0.035);
      box(0.08, OPEN_H, 0.012, x, OPEN_H / 2, FACE_Z - 0.006, metal); // the back of the channel on the wall
      box(0.012, OPEN_H, 0.08, x - 0.034, OPEN_H / 2, FACE_Z - 0.04, metal); // the two flanges
      box(0.012, OPEN_H, 0.08, x + 0.034, OPEN_H / 2, FACE_Z - 0.04, metal);
      L.seg(x - 0.04, 0, FACE_Z - 0.08, x - 0.04, OPEN_H, FACE_Z - 0.08, scaleRGB(LIN.concrete, 1.0), 0.7);
      L.seg(x + 0.04, 0, FACE_Z - 0.08, x + 0.04, OPEN_H, FACE_Z - 0.08, scaleRGB(LIN.concrete, 1.0), 0.7);
    }
    // the curtain: corrugated slats edge to edge between the rails; the bottom bar; grime and dents per slat
    const CW = OPEN_W + 0.06;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(CW, BAR, 0.05), solid(scaleRGB(LIN.concrete, 0.38)));
    bar.position.set(0, BAR / 2, 0); this.curtain.add(bar);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), solid(scaleRGB(LIN.sodium, 0.35)));
    lock.position.set(0.3, BAR / 2, -0.035); this.curtain.add(lock);
    for (let k = 0; k < NSLAT; k++) {
      const grime = 0.46 + 0.14 * hash(k, 3) - 0.1 * clamp(1 - k / 8);
      const slat = new THREE.Mesh(new THREE.BoxGeometry(CW, SLAT - 0.004, 0.018), solid(mixRGB(scaleRGB(LIN.concrete, grime), scaleRGB(LIN.smog, 0.2), 0.15 * hash(k, 4))));
      slat.position.set(0, BAR + k * SLAT + SLAT / 2, (hash(k, 5) > 0.85 ? -0.006 : 0));
      this.curtain.add(slat); this.slats.push(slat);
      // the corrugation: a lit crest and a dark groove along each slat (the torch picks up the crest)
      const y0 = BAR + k * SLAT;
      this.curtLines.seg(-CW / 2, y0 + SLAT * 0.62, -0.012, CW / 2, y0 + SLAT * 0.62, -0.012, scaleRGB(LIN.concrete, 1.25), 1.0); this.curtSlat.push(k);
      this.curtLines.seg(-CW / 2, y0 + 0.004, -0.012, CW / 2, y0 + 0.004, -0.012, scaleRGB(LIN.shadow, 1.0), 0.8); this.curtSlat.push(k);
    }
    this.curtLines.seg(-CW / 2, 0.004, -0.03, CW / 2, 0.004, -0.03, scaleRGB(LIN.shadow, 0.6), 1.6); this.curtSlat.push(-1); // the rubber seal
    // the taped notice (typewritten, the child sees it as mojibake), low on the curtain
    this.noticeText = [garble('ВХОД ЗАКРЫТ'), garble('СТАНЦИЯ ЗАКРЫТА')];
    const cv = noticeCanvas([this.noticeText[1]!], { title: this.noticeText[0], w: 512, h: 360 });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.notice = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.1828), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
    this.notice.position.set(0.0, 1.45, 0.014); this.notice.rotation.z = 0.03;
    this.curtain.add(this.notice);
    this.curtain.rotation.y = Math.PI; // the slats' front faces the street
    this.curtain.position.set(0, OPEN_H, CURT_Z);
    S.add(this.curtain);
    // the station board on the wall above the drum; the metro «М» on a post by the roof
    this.vestBoard = new NeonSign({ kind: 'led', header: 'М', lines: [moji(exitStation().name)], pos: [0, 3.9, FACE_Z - 0.02], rotY: Math.PI, height: 0.42, color: 'sodium', garbled: true });
    S.add(this.vestBoard.mesh);
    const mtex = new THREE.CanvasTexture(metroSignCanvas(256, 1)); mtex.colorSpace = THREE.SRGBColorSpace;
    const msign = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), new THREE.MeshBasicMaterial({ map: mtex, fog: true }));
    msign.position.set(-3.9, 5.5, FACE_Z - 0.1); msign.rotation.y = Math.PI; S.add(msign);
    L.seg(-3.9, PH + 0.35, FACE_Z - 0.1, -3.9, 5.0, FACE_Z - 0.1, scaleRGB(LIN.concrete, 0.9), 1.4);
    this.redLights.push([-3.9, 5.5, FACE_Z - 0.2]);
  }

  // ================================================================ motion
  /** Train position relative to Садовая (m). */
  trainS(t: number) {
    const T = this.T;
    if (t < T.stop) return -2 * (T.stop - t) ** 2;
    if (t < T.go) return 0;
    const u = clamp((t - T.go) / (T.arrive - T.go));
    return S2 * u * u * u * (u * (u * 6 - 15) + 10);
  }
  /** The train on the diagram, as a station index. */
  linePos(t: number) {
    const T = this.T, ys = stationIndex(yourStop().id), ex = stationIndex(exitStation().id);
    if (t < T.stop) return lerp(ys - 0.85, ys, prog(t, T.stop - 5.5, T.stop, ease.outCubic));
    if (t < T.go) return ys;
    return lerp(ys, ex, prog(t, T.go, T.arrive, (x) => x * x * (3 - 2 * x)));
  }
  /** The shutter's bottom edge (m): out of the drum at motor speed, slowing near the floor, landing on the beat. */
  shutterY(t: number) {
    if (PROOF === 'shutter-half') return OPEN_H * 0.5;
    if (PROOF === 'shutter-closed') return 0;
    if (PROOF === 'vestibule' || PROOF === 'street') return OPEN_H;
    const T = this.T, u = prog(t, T.shutterGo, T.land);
    const s = u < 0.75 ? (u / 0.75) * 0.85 : 0.85 + 0.15 * ease.outCubic((u - 0.75) / 0.25);
    return OPEN_H * (1 - s);
  }

  pov(t: number): Pov {
    const T = this.T, E = ease.inOutCubic;
    if (t < T.cut) {
      const zb = PORTRAIT ? -0.1 : -0.55;
      const stand = prog(t, T.stand, T.stand + 0.5, E);
      const wk = prog(t, T.walk0, T.shut0 - 0.1, (x) => x);
      const back = prog(t, T.go + 0.3, T.go + 0.9, E) * (1 - prog(t, T.boardEnd, T.arrive, E));
      const out = prog(t, T.exit0, T.exit1, E), toArch = prog(t, T.turnArch + 0.2, T.cut, (x) => x);
      const zMap = PORTRAIT ? -3.55 : -3.9;
      const z = lerp(lerp(lerp(SEAT[2], -0.6, ease.inOutQuad(wk)), zb, back), zMap, out) - 0.5 * toArch;
      const y = lerp(SEAT[1], EYE, stand);
      const pb = PORTRAIT ? 0.5 : 0.74, pl = PORTRAIT ? 0.12 : 0.17, ps = PORTRAIT ? 0.04 : 0.12;
      const pitch = keys(t, [[0, ps], [T.look1, ps], [T.look1 + 0.6, pl + 0.1, E], [T.look2, pl + 0.1, E], [T.look2 + 0.6, ps, E], [T.walk0, ps], [T.walk0 + 0.6, 0.05, E], [T.go + 0.3, 0.0, E], [T.go + 0.7, pb, E], [T.boardEnd, pb, E], [T.arrive, 0.0, E], [T.exit0, 0.0], [T.exit1, PORTRAIT ? 0.2 : 0.27, E], [T.turnArch, PORTRAIT ? 0.2 : 0.27], [T.cut, 0.16, E]]);
      const yaw = keys(t, [[0, 0], [T.turnArch, 0], [T.cut, -0.75, E]]);
      const walk = (wk > 0 && wk < 1) || (out > 0 && out < 1) || (toArch > 0 && toArch < 1) ? 1 : 0;
      return { space: 'car', p: [DOOR_X + 0.5 * toArch, y, z], yaw, pitch, walk };
    }
    // the street (world): out of the vestibule; look around; turn back; run to the shutter; the fence; in
    const w0 = prog(t, T.cut, T.cut + 0.9, (x) => x);
    const run = prog(t, T.run0, T.run1, (x) => x);
    const run2 = prog(t, T.run2a, T.run2b, (x) => x), inn = prog(t, T.walkIn, T.walkIn + 1.5, (x) => x);
    let x = lerp(0, 0.3, w0), z = lerp(2.4, 1.4, ease.inOutQuad(w0));
    x = lerp(x, 0, run); z = lerp(z, GATE_Z - 1.0, ease.inOutQuad(run));
    // across the road to the promzona gate; the chapter ends on its threshold, pushing in by the ajar leaf
    x = lerp(x, GATE_X - 0.2, ease.inOutQuad(run2)); z = lerp(z, FENCE_Z + 2.6, ease.inOutQuad(run2));
    x = lerp(x, GATE_X - 0.3, ease.outQuad(inn)); z = lerp(z, FENCE_Z + 2.0, ease.outQuad(inn));
    const toGate = -Math.atan2(GATE_X - 0.1, -(FENCE_Z + 1.7 - (GATE_Z - 1.0)));
    // r9 note 3: the two about-turns are cuts on the beat, not 180° whip pans
    const cutB = this.au.nearestBeat(T.turnBack + 0.35), cutZ = this.au.nearestBeat(T.turnZone + 0.33);
    const yE = PORTRAIT ? 0.0 : 0.15; // portrait: the gate's sign whole in frame while the child stands before the about-turn cut (C1)
    const yaw = keys(t, [[T.cut, 0.65], [T.turnBack - 0.1, yE, E], [cutB - 0.001, yE], [cutB, -Math.PI + 0.02], [T.turnZone, -Math.PI + 0.02], [cutZ - 0.001, -Math.PI + 0.02], [cutZ, -2 * Math.PI + toGate * 0.6], [T.run2b, -2 * Math.PI + toGate, E], [T.walkIn + 1.5, -2 * Math.PI - 0.12, E]]);
    const pS = PORTRAIT ? 0.14 : 0.08;
    const pitch = keys(t, [[T.cut, 0.1], [cutB - 0.001, 0.1], [cutB, pS], [T.run1, PORTRAIT ? 0.05 : 0.12, E], [cutZ - 0.001, PORTRAIT ? 0.05 : 0.12], [cutZ, 0.06], [T.walkIn + 1.5, 0.02, E]]);
    const walk = (w0 > 0 && w0 < 1) || (run > 0 && run < 1) || (run2 > 0 && run2 < 1) || (inn > 0 && inn < 1) ? 1 : 0;
    // across the road the eyes stay on the gate
    const head = -2 * Math.PI - Math.atan2(GATE_X - 0.1 - x, -(FENCE_Z - z));
    const k = t >= cutZ ? 1 : 0; // after the cut the eyes are on the gate
    return { space: 'world', p: [x, EYE, z], yaw: lerp(yaw, head, k), pitch, walk };
  }

  /** Gate-1 proof views (?proof=...): fixed cameras on the new assets. */
  proofPov(): Pov | null {
    switch (PROOF) {
      case 'shutter-half': case 'shutter-closed': return { space: 'world', p: [0.4, EYE, GATE_Z - 3.8], yaw: -Math.PI + 0.1, pitch: PORTRAIT ? 0.16 : 0.1, walk: 0 };
      case 'vestibule': return { space: 'world', p: [3.2, 1.3, GATE_Z - 5.5], yaw: -Math.PI - 0.5, pitch: PORTRAIT ? 0.2 : 0.14, walk: 0 };
      case 'street': return { space: 'world', p: [14, 1.3, 1.2], yaw: Math.PI - 1.05, pitch: PORTRAIT ? 0.2 : 0.12, walk: 0 };
      default: return null;
    }
  }

  setCam(c: Pov, t: number, moving = 0) {
    const cam = this.cam;
    const { bob, sway, swayY, roll } = walkMotion(c.walk, this.steps(t), t, moving);
    cam.position.set(c.p[0] + sway * Math.cos(c.yaw), c.p[1] + bob + swayY, c.p[2] - sway * Math.sin(c.yaw));
    const dir = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
    cam.up.set(Math.sin(roll) * Math.cos(c.yaw), Math.cos(roll), -Math.sin(roll) * Math.sin(c.yaw));
    cam.lookAt(cam.position.clone().add(dir));
    cam.up.set(0, 1, 0);
    cam.fov = PORTRAIT ? 74 : 56;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // ================================================================ rendering: the street
  renderDistrict(out: THREE.WebGLRenderTarget, t: number, torch: THREE.Vector3[] | null, torchOn: number) {
    const { renderer } = this.ctx;
    const cam = this.cam;
    this.sky.render(renderer, out, { top: scaleRGB(LIN.shadow, 1.0), horizon: mixRGB(scaleRGB(LIN.fog, 0.9), scaleRGB(LIN.smog, 0.45), 0.35), low: scaleRGB(LIN.shadow, 1.2), horizonY: 0.52, t, haze: 1.0 });
    for (const sg of this.signs) sg.update(t);
    this.vestBoard.update(t);
    const yB = this.shutterY(t);
    this.curtain.position.y = yB;
    // slats still rolled in the drum stay hidden (nothing pokes out above the housing)
    const topHide = OPEN_H + 0.45 - SLAT;
    this.slats.forEach((s, k) => { s.visible = yB + BAR + k * SLAT < topHide; });
    this.notice.visible = yB + 1.45 < OPEN_H + 0.3;
    this.drawThree(out);
    const lampsL = torch && torchOn > 0.01 ? [makeLamp(torch[0]!, torch[1]!, 11, 12, 1.25 * torchOn)] : [];
    const gateLamp = makeLamp(new THREE.Vector3(GATE_X, 4.1, FENCE_Z - 0.4), new THREE.Vector3(GATE_X, 0, FENCE_Z + 0.8), 55, 9, 1.0);
    const doorLamp = makeLamp(new THREE.Vector3(0, 3.1, FACE_Z - 0.6), new THREE.Vector3(0, 0.3, FACE_Z - 0.05), 50, 6, 0.9);
    this.dLines.emit(this.lines3D, cam, { base: 0.5, fog: 0.022, lamps: [...lampsL, gateLamp, doorLamp], lampGain: 1.8 });
    // the curtain's corrugation lines move with it; hide the ones inside the drum
    const off: V3 = [0, yB, CURT_Z];
    this.curtLines.emit(this.lines3D, cam, { base: 0.42, fog: 0.022, lamps: [...lampsL, doorLamp], lampGain: 2.4, offset: off, filter: (i) => { const k = this.curtSlat[i]!; return k < 0 || yB + BAR + k * SLAT < topHide - 0.02 ? 1 : 0; } });
    this.lines3D.render(renderer, out, cam);
    this.lines3D.clear();
    const g = this.glow3D, cp = cam.position;
    for (const w of this.windows) {
      const k = w.ph < 0 ? 0.5 + 0.5 * Math.sin(t * 9 * -w.ph) * Math.sin(t * 2.3 - w.ph) : 1;
      g.add(w.p[0], w.p[1], w.p[2], w.ry !== undefined ? 0.8 : 0.6, w.ry !== undefined ? 0.9 : 0.6, w.c, (w.ry !== undefined ? 0.22 : 0.9) * w.k * k, 2);
    }
    for (const p of this.lamps) g.add(p[0], p[1], p[2], 0.35, 0.35, LIN.sodium, 2.2 * Math.exp(-Math.hypot(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z) * 0.012), 4);
    for (const p of this.lamps) g.add(p[0], 0.05, p[2], 1.6, 1.6, LIN.sodium, 0.1, 2.5);
    for (const p of this.redLights) g.add(p[0], p[1], p[2], 0.4, 0.4, LIN.red, 1.4 * (0.6 + 0.4 * Math.sin(t * 3 + p[0])), 4);
    // the vestibule: cold light inside (dimmer once the shutter is down)
    const inside = 0.35 + 0.65 * clamp(yB / OPEN_H);
    for (const p of this.vestLights) g.add(p[0], p[1], p[2], 0.16, 0.07, mixRGB(LIN.concrete, LIN.paper, 0.6), 1.0 * inside, 3);
    g.add(0, 3.05, FACE_Z - 0.55, 0.3, 0.12, mixRGB(LIN.concrete, LIN.paper, 0.7), 1.6, 4);
    for (const sg of this.signs) sg.glow(g, 0.6);
    g.render(renderer, out, cam);
    g.clear();
    this.fogCards.render(renderer, out, cam, t, 1);
    if (lampsL.length) this.cone.render(renderer, out, cam, lampsL[0]!, t, { density: 0.035, floorY: 0, maxDist: 9 });
    // QA: what the child sees (mojibake) is reported
    for (const sg of this.signs) { sg.log(cam, { min: 18, scenery: true }); }
    this.vestBoard.log(cam, { min: 18, scenery: true });
    this.logPlane(this.gateSign, this.gateSignText, 33, 'gate-sign'); // the letters are ~0.21 of the sign's height: below ~14 px letters (sign half-height 33 px) the tin sign is a red-rimmed blur, not text
    if (this.notice.visible && yB + 1.45 + 0.13 < OPEN_H) this.logPlane(this.notice, this.noticeText.join(' / '), 14, 'notice');
  }

  /** Report a textured plane's text (mojibake) with its projected box, when it is on screen and big enough. */
  logPlane(m: THREE.Mesh, text: string, min: number, id: string) {
    const geo = m.geometry as THREE.PlaneGeometry;
    const { width: w, height: h } = geo.parameters;
    m.updateMatrixWorld();
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => { const v = new THREE.Vector3(x, y, 0).applyMatrix4(m.matrixWorld); return project(this.cam, v.x, v.y, v.z); });
    if (pts.some((p) => p.behind)) return;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const vis = x1 > 0 && x0 < W && y1 > 0 && y0 < H && (y1 - y0) / 2 >= min;
    if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) return;
    logText('garble', text, vis, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, { id: `plane:${id}` });
  }

  // ================================================================ rendering: the carriage and the tunnel
  renderCar(out: THREE.WebGLRenderTarget, t: number, torch: THREE.Vector3[] | null = null, torchOn = 0) {
    const { renderer } = this.ctx;
    const cam = this.cam, T = this.T;
    const s = this.trainS(t);
    const onB = s > S2 / 2;
    const sLocal = onB ? s - S2 : s;
    const clear = scaleRGB(LIN.shadow, 0.6);
    renderer.setRenderTarget(out);
    const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    renderer.setClearColor(new THREE.Color().setRGB(clear[0], clear[1], clear[2], THREE.LinearSRGBColorSpace), 1);
    renderer.clear();
    renderer.setClearColor(prevClear, prevA);
    this.platA.visible = !onB; this.platB.visible = onB;
    this.platA.position.x = -sLocal; this.platB.position.x = -sLocal;
    for (const sg of onB ? this.platesB : this.platesA) sg.update(t);
    if (onB) {
      // the torch's spot on the wall map (the beam axis meets the wall plane)
      let hit: { x: number; y: number; rad: number } | null = null;
      if (torch) {
        const o = torch[0]!, d = torch[1]!.clone().sub(o).normalize();
        if (d.z < -1e-3) {
          const k = (MAP_Z - o.z) / d.z, hx = o.x + d.x * k, hy = o.y + d.y * k;
          hit = { x: ((hx - this.platB.position.x - DOOR_X) / MAP_W + 0.5) * MCW, y: (0.5 - (hy - MAP_Y) / MAP_H) * MCH, rad: k * 0.2 / MAP_W * MCW };
        }
      }
      this.lightMap(hit, torchOn, 0.2 * prog(t, T.open, T.exit1));
    }
    renderer.render(this.outside, cam);
    (onB ? this.linesB : this.linesA).emit(this.lines3D, cam, { base: onB ? 0.4 : 0.6, fog: 0.02, offset: [-sLocal, 0, 0] });
    this.lines3D.render(renderer, out, cam);
    this.lines3D.clear();
    const g = this.glow3D;
    const cold = mixRGB(LIN.concrete, LIN.paper, 0.65);
    const speed = Math.abs(this.trainS(t + 0.01) - s) / 0.01;
    const blur = clamp(speed * 0.035, 0, 6);
    for (const p of onB ? this.lightsB : this.lightsA) {
      const x = p[0] - sLocal;
      if (Math.abs(x - cam.position.x) > 30) continue;
      const fl = onB ? flicker(t, hash(p[0], p[2]) > 0.8 ? 0.7 : 0.08, p[0]) : 1;
      g.add(x, p[1], p[2], p[2] < -6 ? 0.07 : 1.4 + blur, p[2] < -6 ? 0.1 : 0.18, onB && p[2] < -6 ? LIN.lamp : cold, (onB ? 0.9 : 1.4) * fl, 3);
    }
    for (const tx of this.tunnelLights) { const x = tx - (s % 12); if (Math.abs(x - cam.position.x) < 40) g.add(x, 2.6, -2.25, 0.18 + blur, 0.12, LIN.sodium, 2.2, 4); }
    g.render(renderer, out, cam);
    g.clear();
    // the car
    renderer.setRenderTarget(out); renderer.clearDepth();
    const shut = prog(t, T.shut0, T.shut1, ease.inOutCubic), open1 = prog(t, T.stop + 0.3, T.stop + 0.75, ease.inOutCubic);
    const open2 = prog(t, T.open, T.open + 0.4, ease.inOutCubic);
    const openK = t < T.go + 1 ? open1 * (1 - shut) : open2;
    for (const leaf of this.leaves) {
      const sx = leaf.userData.sx as number;
      leaf.position.set(DOOR_X + sx * (DOOR_W / 4 + openK * (DOOR_W / 2 - 0.02)), 0, WALL_Z - 0.06);
    }
    renderer.render(this.car, cam);
    this.carLines.emit(this.lines3D, cam, { base: 0.75, fog: 0.02 });
    this.lines3D.render(renderer, out, cam);
    this.lines3D.clear();
    this.tubes.clear();
    for (let x = -13; x < 13; x += 2.6) { const c = scaleRGB(cold, 1.05); this.tubes.seg(x, CEIL - 0.03, -0.55, x + 1.9, CEIL - 0.03, -0.55, 0.12, c[0], c[1], c[2], 1); }
    this.tubes.render(renderer, out, cam);
    const warn = t > T.shut0 - 1.4 && t < T.shut1 + 0.1 ? (Math.floor((t - T.shut0) * 4) % 2 === 0 ? 1 : 0.15) : 0.1;
    for (const sx of [-1, 1]) g.add(DOOR_X + sx * (DOOR_W / 2 + 0.09), 1.62, WALL_Z + 0.08, 0.06, 0.1, LIN.sodium, 3 * warn, 4);
    for (let x = -13; x < 13; x += 2.6) g.add(x + 0.95, CEIL - 0.1, -0.55, 1.4, 0.35, cold, 0.18, 2);
    g.render(renderer, out, cam);
    g.clear();
    if (onB && torch && torchOn > 0.01) {
      const lamp = makeLamp(torch[0]!, torch[1]!, 11, 12, 1.25 * torchOn);
      this.cone.render(renderer, out, cam, lamp, t, { density: 0.03, floorY: 0, maxDist: 6 });
    }
    const aps = this.apertures(openK), inside = t < T.exit1 ? aps : null;
    // the wall map is black until the doors open and the torch comes up (nothing to read through the windows)
    // a wall-map text is readable only where the torch lights it (the ambient light leaves the paper near black)
    if (onB && t >= T.open) for (const r of this.wallMapTexts) {
      const b = this.mapRectBox(r);
      const lit = Math.min(this.mapBright(r.x, r.y), this.mapBright(r.x + r.w, r.y), this.mapBright(r.x, r.y + r.h), this.mapBright(r.x + r.w, r.y + r.h)) >= 0.88;
      if (b) this.logBoxThrough(b, inside, 'sign', r.text, `wallmap:${r.text}`, lit);
    }
    for (const sg of onB ? this.platesB : this.platesA) this.logThrough(sg, aps, onB ? 'garble' : 'place', onB);
    this.drawBoard(this.world.ctx, t);
  }

  /**
   * The line diagram above the door (TESTPLAN A12/B6): one straight horizontal line, stations evenly spaced
   * inside a margin, names strictly alternating above and below at equal offsets, the train as a lamp on the
   * line. Beyond the ring the names break into mojibake as the train goes on. Checks its own layout.
   */
  drawBoard(c: CanvasRenderingContext2D, t: number) {
    const cam = this.cam;
    const a = project(cam, BX0, BY0, BZ), b = project(cam, BX1, BY0, BZ), d = project(cam, BX0, BY1, BZ);
    if (a.behind || b.behind || d.behind) return;
    const st = stations(), n = st.length;
    const pos = this.linePos(t);
    const M = 130, LY = 150, LW = 10, DR = 13, FS = 32, OFF = 38;
    const sx = (i: number) => M + i * ((DW - 2 * M) / (n - 1));
    const lineCol = city().metro.color;
    const M2 = new DOMMatrix([(b.x - a.x) / DW, (b.y - a.y) / DW, (d.x - a.x) / DH, (d.y - a.y) / DH, a.x, a.y]);
    const pxPer = Math.hypot(b.x - a.x, b.y - a.y) / DW;
    c.save();
    c.setTransform(M2);
    // the panel: cream enamel in a steel frame (the lamp above lights it)
    c.fillStyle = '#E4DDCB'; c.fillRect(0, 0, DW, DH);
    c.strokeStyle = '#6F7780'; c.lineWidth = 8; c.strokeRect(4, 4, DW - 8, DH - 8);
    // header: the line's number in its colour, top right (clear of the upper names)
    const hdr = city().metro.line.toUpperCase();
    c.font = font(F.metro(900), 26);
    const hw = c.measureText(hdr).width;
    const hx = DW - 24 - hw - 44, hy = 20;
    c.fillStyle = lineCol; c.beginPath(); c.arc(hx + 16, hy + 18, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.fillText(city().metro.line.replace(/\D/g, ''), hx + 16, hy + 27);
    c.fillStyle = '#2A2620'; c.textAlign = 'left'; c.fillText(hdr, hx + 40, hy + 28);
    const header = { x: hx, y: hy, w: hw + 44, h: 36 };
    // the line
    c.strokeStyle = lineCol; c.lineWidth = LW; c.lineCap = 'round';
    c.beginPath(); c.moveTo(sx(0), LY); c.lineTo(sx(n - 1), LY); c.stroke();
    const ys = stationIndex(yourStop().id);
    const rects: { x: number; y: number; w: number; h: number; i: number }[] = [];
    c.font = font(F.metro(700), FS); c.textAlign = 'center';
    st.forEach((s, i) => {
      const passed = pos > i + 0.02, here = Math.abs(pos - i) < 0.5 && Math.abs(pos - i) === Math.min(...st.map((_, j) => Math.abs(pos - j)));
      c.fillStyle = passed ? lineCol : '#FFFFFF'; c.strokeStyle = lineCol; c.lineWidth = 5;
      c.beginPath(); c.arc(sx(i), LY, DR, 0, Math.PI * 2); c.fill(); c.stroke();
      if (here && Math.floor(t * 2.5) % 2 === 0) { c.strokeStyle = '#D7362B'; c.lineWidth = 4; c.beginPath(); c.arc(sx(i), LY, DR + 7, 0, Math.PI * 2); c.stroke(); }
      // names beyond the known part break up character by character as the train leaves the known part
      const known = isKnown(s.at[0], s.at[1]);
      const lvl = known ? 0 : clamp(0.25 + (pos - (ys + 0.8)) * 0.6 + (i - ys - 2) * 0.2, 0.25, 1);
      const name = lvl > 0 ? garble(s.name, lvl) : s.name;
      const above = i % 2 === 0;
      const by = above ? LY - OFF : LY + OFF + FS * 0.72;
      c.fillStyle = i === ys ? '#14120E' : '#3A352C';
      const maxW = i === 0 || i === n - 1 ? 2 * (M - 18) : 2 * ((DW - 2 * M) / (n - 1)) - 18;
      c.fillText(name, sx(i), by, maxW);
      const w = Math.min(maxW, c.measureText(name).width);
      const r = { x: sx(i) - w / 2, y: by - FS * 0.74, w, h: FS * 0.95, i };
      rects.push(r);
      // QA: legible when on screen and the type is ≥ 10 px tall
      const q = [new DOMPoint(r.x, r.y).matrixTransform(M2), new DOMPoint(r.x + r.w, r.y + r.h).matrixTransform(M2)];
      const box = { x: Math.min(q[0]!.x, q[1]!.x), y: Math.min(q[0]!.y, q[1]!.y), w: Math.abs(q[1]!.x - q[0]!.x), h: Math.abs(q[1]!.y - q[0]!.y) };
      const vis = box.x > 0 && box.x + box.w < W && box.y > 0 && box.y + box.h < H && FS * pxPer >= 10;
      const bad = this.boardBad(r, rects, sx, n, LY, LW, DR, header);
      logText(lvl > 0 ? 'garble' : 'place', name, vis, box, { id: `board:${s.id}:${lvl > 0 ? 'g' : 'c'}`, ...(bad ? { bad } : {}) });
    });
    // the train: a red lamp on the line itself
    const tx = lerp(sx(0), sx(n - 1), clamp(pos / (n - 1)));
    c.fillStyle = '#D7362B'; c.beginPath(); c.roundRect(tx - 18, LY - 7, 36, 14, 7); c.fill();
    c.restore();
  }

  /** The line diagram's own layout check (A12): a label never touches a dot, the line, the header or the edge. */
  boardBad(r: { x: number; y: number; w: number; h: number; i: number }, all: { x: number; y: number; w: number; h: number; i: number }[], sx: (i: number) => number, n: number, LY: number, LW: number, DR: number, header: { x: number; y: number; w: number; h: number }) {
    const pad = 3, E = 12;
    if (r.x < E || r.y < E || r.x + r.w > DW - E || r.y + r.h > DH - E) return 'label crosses the board edge';
    if (r.y < LY + LW / 2 + pad && r.y + r.h > LY - LW / 2 - pad && r.x < sx(n - 1) && r.x + r.w > sx(0)) return 'label on the line';
    for (let i = 0; i < n; i++) { const cx = sx(i); if (r.x < cx + DR + pad && r.x + r.w > cx - DR - pad && r.y < LY + DR + pad && r.y + r.h > LY - DR - pad) return 'label on a station dot'; }
    const ov = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }) => p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
    if (ov(r, header)) return 'label on the header';
    for (const o of all) if (o.i !== r.i && ov(r, o)) return 'labels overlap';
    return '';
  }

  /** Where the torch points on the wall map (world) and how firmly (0..1), or null when it rests. */
  mapAimPoint(t: number) {
    const T = this.T;
    const k = smoothstep(T.lost + 0.0, T.lost + 0.35, t) * (1 - smoothstep(T.turnArch - 0.1, T.turnArch + 0.35, t));
    if (k <= 0.001) return null;
    // ВЫ ЗДЕСЬ, then back along Линия 2 station by station to your stop, which it holds
    const st = stations(), i0 = stationIndex(exitStation().id), i1 = stationIndex(yourStop().id);
    const pts = st.slice(i1, i0 + 1).reverse().map((q) => this.mapCv(q.at));
    // it starts on the printed «ВЫ ЗДЕСЬ» itself (the child reads it; it sits beside its dot, towards your stop)
    const lab = this.wallMapTexts.find((r) => r.text === 'ВЫ ЗДЕСЬ');
    if (lab) pts[0] = { x: lab.x + lab.w / 2, y: lab.y + lab.h / 2 };
    const u = prog(t, T.trace0 + 0.3, T.trace1, ease.inOutQuad) * (pts.length - 1);
    const j = Math.min(pts.length - 2, Math.floor(u)), f = u - j;
    const drift = 6 * Math.sin(t * 2.1);
    const q = { x: lerp(pts[j]!.x, pts[j + 1]!.x, f) + drift, y: lerp(pts[j]!.y, pts[j + 1]!.y, f) + drift * 0.6 };
    return { p: this.mapWorld(q), k };
  }

  // ================================================================ frame
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    if (PROOF === 'hand' || PROOF === 'sign') return this.renderProof2D(t, out);
    const P = this.proofPov() ?? this.pov(t);
    const moving = t < T.stop || (t > T.go && t < T.arrive) ? 1 : 0;
    this.setCam(P, t, P.space === 'car' ? moving : 0);
    const cam = this.cam;
    // the torch: up on "lost", on the whole time after (a flicker as it comes on)
    const lit = PROOF ? 1 : t > T.lost ? clamp(prog(t, T.lost + 0.2, T.lost + 0.3)) * flicker(t, t < T.lost + 0.35 ? 0.8 : 0.02, 5) : 0;
    const raise = PROOF ? 1 : prog(t, T.lost, T.lost + 0.4);
    const beat = ((this.au.beatAt(t) % 1) + 1) % 1, steps = this.steps(t);
    let pose = raise > 0 ? torchPose(cam, t, { raise, walk: P.walk, beat, steps }) : null;
    const mapAim = !PROOF && P.space === 'car' && pose ? this.mapAimPoint(t) : null;
    if (pose && mapAim) {
      // aim the beam at a point of the wall map (camera-space angles relative to the torch's resting aim)
      const pc = cam.worldToLocal(mapAim.p.clone()).sub(pose.headC).normalize();
      const ax = Math.atan2(pc.x, -pc.z), ay = Math.asin(clamp(pc.y, -1, 1));
      let aim = { x: (ax + 0.2) * mapAim.k, y: (ay + 0.1) * mapAim.k };
      pose = torchPose(cam, t, { raise, walk: P.walk, beat, steps, aim });
      for (let it = 0; it < 2; it++) {
        // where the beam actually points (camera space) vs where it should: correct the aim by the difference
        const want = cam.worldToLocal(mapAim.p.clone()).sub(pose.headC).normalize();
        const got = pose.tailC.clone().sub(pose.headC).negate().normalize();
        const dx = Math.atan2(want.x, -want.z) - Math.atan2(got.x, -got.z), dy = Math.asin(clamp(want.y, -1, 1)) - Math.asin(clamp(got.y, -1, 1));
        aim = { x: aim.x + dx * mapAim.k, y: aim.y + dy * mapAim.k };
        pose = torchPose(cam, t, { raise, walk: P.walk, beat, steps, aim });
      }
    }
    if (P.space === 'world') this.renderDistrict(out, t, pose && raise > 0.5 ? [pose.head, pose.target] : null, lit);
    else this.renderCar(out, t, pose && raise > 0.5 ? [pose.head, pose.target] : null, lit);
    rain(this.lines2D, t, { count: P.space === 'world' ? 700 : 0, alpha: 0.1, speed: 1500, angle: 0.08, seed: 9 });
    this.composite2D(this.world, out);
    if (P.space === 'world') this.lines2D.render(renderer, out);
    // ---- the child's hands
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = P.space === 'car' ? { amb: t < T.arrive ? 0.7 : 0.35, warm: 0.1, torch: lit } : { amb: 0.28, warm: 0.25, torch: lit };
    this.drawFreeHand(u, t, light);
    if (pose) {
      const r = drawTorchHand(u, cam, pose, light);
      this.glow2D.add(r.lens.x, r.lens.y, 0, 50, 50, LIN.lamp, 0.8 * lit, 3);
    }
    if (!PROOF) this.drawUI(u, t, f);
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    const fadeIn = 1 - smoothstep(0, 0.5, t);
    if (fadeIn > 0.03) textlog.dim(); // nothing is readable through the fade from black
    return { ...POST_BASE, fade: PROOF ? 0 : fadeIn };
  }

  /** The left hand: grabbing at the closing door edge in (a); flat on the shutter's slats in (d). */
  drawFreeHand(c: CanvasRenderingContext2D, t: number, light: Light) {
    const T = this.T, cam = this.cam;
    // portrait: the fingertips stay under the chapter line's plate (hy 1416 + its bottom edge), never behind it (r9 note 4, gate review)
    const CLEAR_Y = 1500;
    if (PROOF === 'shutter-closed' || PROOF === 'shutter-half' || PROOF === 'vestibule' || PROOF === 'street') return;
    const grab = prog(t, T.shut0 - 0.35, T.shut0 - 0.05, ease.outCubic) * (1 - prog(t, T.shut1 + 0.02, T.shut1 + 0.3, ease.inCubic));
    if (grab > 0.001 && t < T.cut) {
      const e = project(cam, DOOR_X - 0.02, 1.32, WALL_Z - 0.03);
      const depth = Math.max(0.3, e.depth ?? cam.position.distanceTo(new THREE.Vector3(DOOR_X, 1.32, WALL_Z)));
      const s = 0.055 * pxAt(cam, Math.min(depth, 0.5)); // the hand is drawn at arm's length, the same scale as the torch hand
      const from = { x: W * (PORTRAIT ? 0.12 : 0.6), y: H + s * 3 }; // 16:9: right of the chapter plate (A15)
      const tip = { x: lerp(from.x + s, e.x, grab), y: lerp(H + s, PORTRAIT ? Math.max(e.y, CLEAR_Y) : e.y, grab) };
      if (!PORTRAIT) tip.x = Math.max(tip.x, W * 0.56); // 16:9: the fingers stay right of the chapter plate
      drawOpenHand(c, tip, from, s, light, 'grab', { curl: 0.8 });
    }
    const touch = prog(t, T.touch0 - 0.2, T.touch0 + 0.05, ease.outCubic) * (1 - prog(t, T.touch1, T.touch1 + 0.25, ease.inCubic));
    if (touch > 0.001 && t >= T.cut) {
      const pt = PORTRAIT ? new THREE.Vector3(0.25, 0.9, CURT_Z - 0.02) : new THREE.Vector3(0.42, 1.15, CURT_Z - 0.02);
      const e = project(cam, pt.x, pt.y, pt.z);
      const depth = Math.max(0.3, cam.position.distanceTo(pt));
      const s = 0.055 * pxAt(cam, Math.min(depth, 0.5)); // the hand is drawn at arm's length, the same scale as the torch hand
      const from = { x: W * (PORTRAIT ? 0.1 : 0.6), y: H + s * 3 }; // 16:9: right of the chapter plate (A15)
      const tip = { x: lerp(from.x + s, e.x, touch), y: lerp(H + s, PORTRAIT ? Math.max(e.y, CLEAR_Y) : e.y, touch) };
      if (!PORTRAIT) tip.x = Math.max(tip.x, W * 0.56);
      drawOpenHand(c, tip, from, s, light, 'flat');
    }
  }

  drawUI(c: CanvasRenderingContext2D, t: number, f: Frame) {
    const T = this.T, cam = this.cam;
    const L1 = this.ly.get('You are lost'), L2 = this.ly.get('You missed the stop');
    const [e1, e2] = entriesOf('lost');
    const S = PORTRAIT ? 34 : 26;
    // ---- the chapter line: the handbook's Russian heading, lit as the line is sung (bottom left)
    const hx = PORTRAIT ? 60 : SAFE, hy = PORTRAIT ? 1416 : H - 96, hw = PORTRAIT ? W - 210 : 800, /* 16:9: «…ВАГОНА» wraps, the plate ends left of the torch hand at the map (A15) */ hs = PORTRAIT ? 100 : 64;
    drawHeading(c, L1, e1!.heading, t, { x: hx, y: hy, width: hw, size: hs, until: L2.words[0]!.start, plate: 0.85 });
    drawHeading(c, L2, e2!.heading, t, { x: hx, y: hy, width: hw, size: hs, until: f.end + 1, plate: 0.85 });
    // ---- one callout at a time; each label rides a short leader next to its object, clear of signs and boards
    const call = (text: string | string[], at: number, out: number, anchor: (t: number) => { x: number; y: number } | null, extra: Partial<Parameters<typeof drawCallout>[2]> = {}) => {
      if (t < at - 0.05 || t > out + 0.4) return;
      const o = this.pickLabel(text, S, at, out, anchor);
      const a = anchor(t);
      if (!a) return;
      drawCallout(c, t, { ax: a.x, ay: a.y, ...this.placeLabel(text, S, a, o), text, at, cps: 150, out, size: S, plate: 0.75, ...extra });
    };
    const onScreen = (p: { x: number; y: number; behind?: boolean }) => (!p.behind && p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20 ? { x: p.x, y: p.y } : null);
    const boardPt = (i: number, yPx: number) => { const n = stations().length; return project(this.cam, lerp(BX0, BX1, (130 + i * ((DW - 260) / (n - 1))) / DW), lerp(BY0, BY1, yPx / DH), BZ); };
    // (a) your stop on the line diagram; the doors
    call('ТВОЯ ОСТАНОВКА', T.stop - 2.3, T.stop, () => onScreen(boardPt(stationIndex(yourStop().id), 150)));
    call('ДВЕРИ ЗАКРЫВАЮТСЯ', T.stop + 0.38, T.go + 0.2, () => onScreen(project(this.cam, DOOR_X, 1.36, WALL_Z + 0.05)), { color: 'sodium' });
    // (b) past the known part the diagram's names break up
    call('ДАЛЬШЕ КАРТЫ НЕТ', T.go + 0.6, T.arrive - 0.1, () => onScreen(boardPt(stationIndex(yourStop().id) + 1, 150 + 38 + 22)));
    // (c) your stop on the wall map, where the torch runs back to
    call('ТВОЯ ОСТАНОВКА', T.stopCall, T.turnArch + 0.3, () => { const w = this.mapWorld(this.mapCv(yourStop().at)); return onScreen(project(this.cam, w.x, w.y, w.z)); });
    // (d) the station closed, on the shutter
    call('СТАНЦИЯ ЗАКРЫТА', T.shutterGo, T.land + 1.0, (tt) => onScreen(PORTRAIT ? project(this.cam, 0, this.shutterY(tt) + 1.56, CURT_Z - 0.02) : project(this.cam, -0.14, Math.min(OPEN_H - 0.15, this.shutterY(tt) + 1.45), CURT_Z - 0.02)), { maybe: true });
    // (e) the only way home is through the promzona's gate
    const zt = [city().restricted.sign, homeLabel('lost')];
    call(zt, T.turnZone + 0.4, f.end + 1, () => onScreen(project(this.cam, GATE_X - 0.45, 1.67, FENCE_Z + 0.04)), { color: '#FF7FA8', plate: 1, maybe: true, places: [city().restricted.sign, city().home.name] });
    void cam;
  }

  /** Gate-1 proof stills drawn in 2D: the hand alone; a sign beside its mojibake variant. */
  renderProof2D(t: number, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const c = this.ui.ctx;
    this.sky.render(renderer, out, { top: scaleRGB(LIN.fog, 0.55), horizon: scaleRGB(LIN.fog, 0.8), low: scaleRGB(LIN.fog, 0.5), horizonY: 0.5, t, haze: 0 });
    this.glow2D.clear();
    if (PROOF === 'hand') {
      this.setCam({ space: 'world', p: [0, EYE, 0], yaw: 0, pitch: 0, walk: 0 }, 0);
      const pose = torchPose(this.cam, 0.3, { raise: 1 });
      const r = drawTorchHand(c, this.cam, pose, { amb: 0.55, warm: 0.3, torch: 1 });
      this.glow2D.add(r.lens.x, r.lens.y, 0, 50, 50, LIN.lamp, 0.8, 3);
      drawOpenHand(c, { x: W * (PORTRAIT ? 0.3 : 0.36), y: H * (PORTRAIT ? 0.62 : 0.5) }, { x: W * (PORTRAIT ? 0.05 : 0.2), y: H + 200 }, PORTRAIT ? 170 : 150, { amb: 0.55, warm: 0.3 }, 'flat');
    } else {
      const src = 'СТАНЦИЯ ЗАКРЫТА';
      const variant = garble(src);
      const info = MOJI.get(variant);
      const cols = PORTRAIT ? [[W / 2, H * 0.33], [W / 2, H * 0.62]] : [[W * 0.28, H * 0.48], [W * 0.72, H * 0.48]];
      [[src, 'как написано'], [variant, `как видит ребёнок: ${info ? CODEC_RU[info.codec] : ''}`]].forEach(([txt, cap], i) => {
        const [cx, cy] = cols[i]!;
        const pw = PORTRAIT ? 900 : 780, ph = 200;
        c.fillStyle = '#1B1F24'; c.fillRect(cx! - pw / 2, cy! - ph / 2, pw, ph);
        c.strokeStyle = rgba('sodium', 0.6); c.lineWidth = 4; c.strokeRect(cx! - pw / 2, cy! - ph / 2, pw, ph);
        c.font = font(F.metro(700), 72); c.textAlign = 'center'; c.fillStyle = rgba('sodium');
        c.fillText(txt!, cx!, cy! + 24, pw - 40);
        c.font = font(F.metro(400), 30); c.fillStyle = rgba('paper', 0.7);
        c.fillText(cap!, cx!, cy! + ph / 2 + 48);
      });
      c.textAlign = 'left';
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, fade: 0 };
  }
}

void mixRgba; void hash;
