// `lost` — p. 22 → 26, one continuous sequence (docs/TREATMENT.md r5 items 1–8). First person: the
// child's sleeves, hands and handbook at the bottom of the frame; the film's own annotation layer
// (callouts, the map card, the page counter, HOME · x km) is drawn for the viewer. Names and distances
// come from data/city.json (src/city.ts).
//   instrumental : in the train on LINE 3, reading the handbook's introduction (p. 12). The train stands at
//                  YOUR STOP; the child gets up, walks to the door, the doors close in front of the hands; the
//                  platform slides away; the route display's names beyond the known part turn to glyph soup;
//                  the train comes out into the unfamiliar district and stops at the last station.
//   "You are lost": the doors open, out onto the street; the signs are unreadable (the viewer's callouts read
//                  them); the map card: the dot at the edge of the known city, AREA NOT MAPPED.
//   "missed the stop": the route line draws back along LINE 3 to YOUR STOP; the handbook's p. 22 steps.
//   "the metro closed": the child turns back to the station; the shutter comes down on "closed".
//   to the next line: the map recalculates (metro greyed out, the only way runs through the restricted zone);
//                  the handbook turns to p. 26; the child turns to the zone's gate, torch on, and goes in.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { clamp, ease, lerp, prog, smoothstep, keys, hash, mulberry32 } from '../engine/util';
import { F, font, measure } from '../engine/type';
import {
  CityScene, CityBlocks, LitLines, NeonSign, FogCards, GlowBatch, LIN, POST_BASE, SAFE, rgba, scaleRGB, mixRGB, solid, col3, project,
  drawCallout, drawEntry, drawPageCounter, entryAlpha, makeLamp, flicker, rain, drawPOV, drawHandbookSpread, torchHead, logText, type Tower, type Step,
} from './_motifs';
import { counterPortrait } from './book';
import { INTRO } from '../contents';
import {
  city, stations, yourStop, exitStation, stationIndex, isKnown, garble, drawCityMap, mapPx, homeKm, fmtKm, toWorld, type MapView, type XY,
} from '../city';

type V3 = [number, number, number];
type Cam = { p: V3; yaw: number; pitch: number };

// ---------------------------------------------------------------- the car (car-local metres)
const DOOR_X = 3.5, DOOR_W = 1.3, DOOR_H = 1.9;
const WALL_Z = -1.45, WIN_Y0 = 0.88, WIN_Y1 = 1.95, CEIL = 2.35;
const SEAT: V3 = [0.9, 0.95, 1.05]; // the child's eye on the near bench
const EYE = 1.12; // standing eye height (a small child)
const PLATFORM_HALF = 21;
// ---------------------------------------------------------------- the district (world metres; the street along x)
const CAR_Z = 9.45; // car origin z at KILN YARD: its far wall (the doors) at z = 8.0
const GATE_Z = 6.4; // the station's street gate (with the shutter), facing north
const FENCE_Z = -2.6; // the restricted zone's fence on the far kerb
const STOP_Z = 0.6; // where the child stands on the street

export default class Lost extends CityScene {
  // district
  cityB!: CityBlocks;
  dLines = new LitLines();
  signs: NeonSign[] = [];
  gateBoard!: NeonSign; closedBoard!: NeonSign; zoneBoard!: NeonSign; stationBoard!: NeonSign;
  shutter = new THREE.Group();
  fog = new THREE.FogExp2(0, 0.02);
  fogCards = new FogCards();
  lamps: V3[] = [];
  // train
  car = new THREE.Scene();
  outside = new THREE.Scene();
  outGroup = new THREE.Group();
  carLines = new LitLines();
  outLines = new LitLines();
  leaves: THREE.Group[] = [];
  outLights: V3[] = [];
  tunnelLights: number[] = [];
  nameSigns: NeonSign[] = [];
  tubes = new LineBatch(2000, { screen2D: false, worldWidth: true, blend: 'add', depthTest: true });
  // story times (absolute song time), set in init
  T: Record<string, number> = {};
  introSteps: Step[] = []; steps22: Step[] = []; steps26: Step[] = [];
  origin!: XY; // km: the exit station (the world's origin)

  B = (k: number) => this.au.timeOfBeat(Math.round(this.au.beatAt(this.ctx.start)) + k);

  override init() {
    const B = this.B, ly = this.ly;
    const L1 = ly.get('You are lost'), L2 = ly.get('You missed the stop');
    const wYou = L1.words[0]!, wLost = L1.words[L1.words.length - 1]!;
    const wMissed = L2.words[0]!, wStop = L2.words.find((w) => /stop/i.test(w.w))!, wMetro = L2.words.find((w) => /metro/i.test(w.w))!;
    const wClosed = L2.words[L2.words.length - 1]!;
    this.T = {
      stop: B(5) + 0.2, // the train stands at YOUR STOP
      lookUp: B(5) - 0.4, stand: B(6) - 0.2, walk0: B(6) + 0.35, shut0: B(7) + 0.9, shut1: B(7) + 1.15, go: B(8) + 0.35,
      display: B(10) - 0.2, emerge: B(11) + 0.45, arrive: B(12) + 0.75,
      open: wYou.start, exit: wYou.start + 0.15, out: wYou.start + 1.1, lost: wLost.start,
      book22: wLost.start + 0.45, bookDown: B(18) + 0.57 + 1.65, missed: wMissed.start, stopW: wStop.start,
      turnBack: wMetro.start - 0.25, shutterGo: wMetro.start, closed: wClosed.start,
      recalc: wClosed.start + 0.5, turnZone: B(25) - 0.3, walkIn: B(26) - 0.2,
    };
    this.introSteps = [
      { text: 'Find your page.', at: B(0) + 0.1 },
      { text: 'Read it.', at: B(1) },
      { text: 'Do what it says.', at: B(2) },
    ];
    this.steps22 = [
      { text: 'Stay where you are.', at: B(16) - 0.35 },
      { text: 'Find someone in uniform.', at: B(17) - 0.2 },
      { text: 'Say your address.', at: B(18) },
    ];
    const t26 = wClosed.start + 0.45;
    this.steps26 = [
      { text: 'Get off at the next station.', at: t26 },
      { text: "Don't go on alone.", at: t26 + 1.0 },
      { text: 'Wait for a grown-up.', at: t26 + 1.65 },
    ];
    this.origin = exitStation().at;
    this.initDistrict();
    this.initTrain();
  }

  // ================================================================ the district (KILN YARD, unfamiliar)
  initDistrict() {
    this.fog.color = col3(mixRGB(scaleRGB(LIN.fog, 0.75), scaleRGB(LIN.smog, 0.35), 0.25));
    this.three.fog = this.fog;
    const r = mulberry32(31);
    const towers: Tower[] = [];
    // the street along x at z = 0; blocks south (behind the station) are housing, north is the zone (sheds, low)
    for (let i = -6; i <= 6; i++) for (const side of [-1, 1]) {
      const x = i * 26 + (r() - 0.5) * 6;
      if (side > 0 && Math.abs(x) < 14) continue; // the station's own building stands here
      const zone = side < 0;
      const w = lerp(12, 22, r()), d = lerp(10, 20, r());
      const z = side > 0 ? 12 + d / 2 + r() * 4 : FENCE_Z - 6 - d / 2 - r() * 10;
      towers.push({ x, z, w, d, h: zone ? lerp(6, 14, r()) : lerp(18, 60, r() ** 1.3), y0: 0, shade: r() * 0.5 });
    }
    this.cityB = new CityBlocks({
      seed: 7, count: 170, x0: -1300, x1: 1300, z0: -1600, z1: -160, hMin: 50, hMax: 240, mega: 4,
      extra: towers, color: LIN.shadow, yBase: 0, windowRate: 0.06,
      edgeWithin: (tw) => Math.hypot(tw.x, tw.z) < 120 && tw.h < 80, edgeFloors: 4,
    });
    this.three.add(this.cityB.mesh);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), solid(scaleRGB(LIN.shadow, 1.0)));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -600);
    this.three.add(ground);
    const L = this.dLines, dim = scaleRGB(LIN.concrete, 0.5), conc = scaleRGB(LIN.concrete, 0.8);
    // kerbs and the centre line
    for (const z of [-2.5, 2.5]) L.seg(-200, 0.12, z, 200, 0.12, z, dim, 0.8);
    for (let x = -200; x < 200; x += 4) L.seg(x, 0.01, 0, x + 1.6, 0.01, 0, scaleRGB(LIN.paper, 0.25), 0.6);
    // streetlamps on the south kerb
    for (let x = -120; x <= 120; x += 22) { if (Math.abs(x) < 5) continue; this.lamps.push([x, 5.2, 3.2]); L.seg(x, 0, 3.2, x, 5.2, 3.2, conc, 0.8); }
    this.lamps.push([2.4, 4.2, FENCE_Z - 0.3]); // the one sodium lamp over the zone's gate
    L.seg(2.4, 0, FENCE_Z - 0.3, 2.4, 4.2, FENCE_Z - 0.3, conc, 0.8);
    // the zone's fence: posts, mesh (diagonals), barbed top; the gate (two leaves, one ajar)
    const fc = scaleRGB(LIN.concrete, 1.0);
    for (let x = -80; x <= 60; x += 2.5) {
      if (x > -1.3 && x < 1.3) continue;
      L.seg(x, 0, FENCE_Z, x, 2.5, FENCE_Z, fc, 1.1);
      for (let y = 0; y < 2.4; y += 0.5) { L.seg(x, y, FENCE_Z, x + 2.5, y + 0.5, FENCE_Z, scaleRGB(LIN.concrete, 0.6), 0.6); L.seg(x + 2.5, y, FENCE_Z, x, y + 0.5, FENCE_Z, scaleRGB(LIN.concrete, 0.6), 0.6); }
      L.seg(x, 2.5, FENCE_Z, x + 0.3, 2.85, FENCE_Z - 0.3, fc, 0.8);
    }
    L.seg(-80, 2.8, FENCE_Z - 0.3, 60, 2.8, FENCE_Z - 0.3, fc, 0.6);
    // the gate: a left leaf closed, the right leaf swung in (ajar): the way in
    L.box(-0.65, 0, FENCE_Z, 1.3, 2.3, 0.05, fc, 1.2);
    for (let k = 0; k <= 6; k++) L.seg(-1.3 + k * 0.21, 0.05, FENCE_Z, -1.3 + k * 0.21, 2.25, FENCE_Z, fc, 0.8);
    const aj = 1.1; // ajar angle (rad)
    const hx = 1.3, gw = 1.3;
    const ex = hx - Math.cos(aj) * gw, ez = FENCE_Z - Math.sin(aj) * gw;
    for (const y of [0.05, 1.15, 2.25]) L.seg(hx, y, FENCE_Z, ex, y, ez, fc, 1.2);
    for (let k = 0; k <= 6; k++) { const q = k / 6; L.seg(lerp(hx, ex, q), 0.05, lerp(FENCE_Z, ez, q), lerp(hx, ex, q), 2.25, lerp(FENCE_Z, ez, q), fc, 0.8); }
    // inside the zone: sheds' outlines, a crane
    for (let x = -30; x <= 30; x += 15) L.box(x, 0, FENCE_Z - 16, 11, 5, 8, scaleRGB(LIN.concrete, 0.45), 0.8);
    L.seg(8, 0, -40, 8, 34, -40, scaleRGB(LIN.concrete, 0.5), 1.4); L.seg(-14, 34, -40, 26, 34, -40, scaleRGB(LIN.concrete, 0.5), 1.4);
    // the station: platform canopy and the street gate frame (the shutter hangs in it)
    L.box(0, 0, GATE_Z, 4.4, 3.1, 0.12, conc, 1.4);
    L.seg(-12, 3.3, GATE_Z, 12, 3.3, GATE_Z, conc, 1.0);
    L.seg(-12, 3.3, 8.0, 12, 3.3, 8.0, conc, 1.0);
    for (let x = -12; x <= 12; x += 4) L.seg(x, 0, GATE_Z + 0.05, x, 3.3, GATE_Z + 0.05, conc, 0.9);
    const wallM = solid(scaleRGB(LIN.deep, 1.6));
    for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(9.8, 3.3, 0.2), wallM); b.position.set(sx * 7.1, 1.65, GATE_Z); this.three.add(b); }
    // the roller shutter: slats in a group that slides down on "the metro closed"
    const slatM = solid(scaleRGB(LIN.concrete, 0.55));
    for (let k = 0; k < 14; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.2, 0.05), slatM); s.position.set(0, k * 0.22 + 0.1, 0); this.shutter.add(s); }
    this.shutter.position.set(0, 3.1, GATE_Z - 0.08);
    this.three.add(this.shutter);
    // ---- signs: the child can't read any of them here (glyph soup generated from the real names)
    const exit = exitStation();
    this.stationBoard = new NeonSign({ kind: 'led', header: city().metro.line, lines: [garble(exit.name)], pos: [0, 4.1, GATE_Z - 0.12], rotY: Math.PI, height: 0.85, color: 'sodium', garbled: true });
    this.closedBoard = new NeonSign({ kind: 'led', header: city().metro.line, lines: [garble('STATION CLOSED'), garble('LAST TRAIN LEFT')], pos: [0, 3.32, GATE_Z - 0.14], rotY: Math.PI, height: 0.5, color: 'neon', garbled: true });
    this.gateBoard = this.stationBoard;
    this.zoneBoard = new NeonSign({ kind: 'led', header: '▲ ▲ ▲', lines: [garble(city().restricted.sign.split(' · ')[0]!), garble(city().restricted.sign.split(' · ')[1]!)], pos: [-0.65, 1.45, FENCE_Z + 0.08], height: 0.62, color: 'neon', garbled: true });
    const soup: ConstructorParameters<typeof NeonSign>[0][] = [
      { lines: [garble('KILN YARDS')], pos: [-7.5, 4.9, 11.6], rotY: Math.PI, height: 1.8, bright: 1.9, flicker: 0.1, seed: 11, garbled: true },
      { kind: 'led', header: '24H', lines: [garble('NO ROUTE DATA'), garble('ENTRY BY PASS')], pos: [19, 5.5, 11.6], rotY: Math.PI, height: 2.4, color: 'sodium', garbled: true },
      { lines: [garble('DEPOT'), garble('NIGHT SHIFT')], kind: 'screen', pos: [36, 9, 11.4], rotY: Math.PI, height: 3.2, color: 'sodium', bright: 1.3, flicker: 0.04, seed: 15, garbled: true },
      { lines: [garble('KEEP OUT')], pos: [-9, 5, FENCE_Z - 10], height: 2.8, bright: 1.7, flicker: 0.2, seed: 16, garbled: true },
      { lines: [garble('SECTOR CLOSED')], kind: 'screen', pos: [9, 4.2, FENCE_Z - 14], height: 2.6, color: 'neon', bright: 1.4, flicker: 0.06, seed: 17, garbled: true },
    ];
    for (const o of soup) { const sg = new NeonSign(o); this.signs.push(sg); this.three.add(sg.mesh); }
    for (const sg of [this.stationBoard, this.closedBoard, this.zoneBoard]) this.three.add(sg.mesh);
    const fcol = mixRGB(LIN.fog, LIN.smog, 0.25);
    this.fogCards.add({ z: -40, w: 500, y0: 0, y1: 60, color: fcol, alpha: 0.25, scale: 0.03, seed: 1, high: 30 });
    this.fogCards.add({ z: -160, w: 1200, y0: 0, y1: 240, color: mixRGB(LIN.fog, LIN.smog, 0.4), alpha: 0.35, scale: 0.01, seed: 3, high: 120 });
    this.fogCards.add({ z: -700, w: 4000, y0: 0, y1: 800, color: mixRGB(LIN.fog, LIN.smog, 0.6), alpha: 0.45, scale: 0.003, seed: 5, high: 450 });
  }

  // ================================================================ the car and the tunnel (car-local)
  initTrain() {
    const m = (rgb: [number, number, number]) => solid(rgb, { fog: false });
    const wallM = m(scaleRGB(LIN.deep, 1.9)), darkM = m(scaleRGB(LIN.shadow, 1.4)), floorM = m(scaleRGB(LIN.shadow, 1.5)), ceilM = m(scaleRGB(LIN.concrete, 0.45));
    const seatM = m(scaleRGB(LIN.fog, 0.95));
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
      for (let x = a; x <= b + 1e-3; x += (b - a) / Math.max(1, Math.round((b - a) / 1.7))) box(car, 0.14, WIN_Y1 - WIN_Y0, 0.1, x, (WIN_Y0 + WIN_Y1) / 2, WALL_Z, darkM);
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
      const lw = DOOR_W / 2, leafM = m(scaleRGB(LIN.concrete, 0.5)), edgeM = m(scaleRGB(LIN.sodium, 0.9));
      box(leaf, lw, 1.0, 0.05, 0, 0.5, 0, leafM);
      box(leaf, lw, DOOR_H - 1.72, 0.05, 0, (1.72 + DOOR_H) / 2, 0, leafM);
      box(leaf, 0.08, 0.72, 0.05, -lw / 2 + 0.04, 1.36, 0, leafM);
      box(leaf, 0.08, 0.72, 0.05, lw / 2 - 0.04, 1.36, 0, leafM);
      box(leaf, 0.04, DOOR_H, 0.06, -sx * (lw / 2 - 0.02), DOOR_H / 2, 0.01, edgeM);
      leaf.userData.sx = sx;
      car.add(leaf);
      this.leaves.push(leaf);
    }
    for (const x of [DOOR_X - 1.1, DOOR_X + 1.1, -2.2, -6.4, 8.6]) L.seg(x, 0, -0.6, x, CEIL, -0.6, scaleRGB(LIN.concrete, 1.4), 3.2);
    L.seg(X0, 1.95, 0.35, X1, 1.95, 0.35, scaleRGB(LIN.concrete, 1.2), 2.4);
    // the tunnel and YOUR STOP's platform (underground)
    const g = this.outGroup;
    this.outside.add(g);
    const pm = m(scaleRGB(LIN.concrete, 0.42)), pw = m(scaleRGB(LIN.concrete, 0.62)), tm = m(scaleRGB(LIN.shadow, 1.4));
    box(g, PLATFORM_HALF * 2, 0.2, 4.2, 0, -0.1, -3.7, pm);
    box(g, PLATFORM_HALF * 2, 4.5, 0.2, 0, 2.25, -5.8, pw);
    box(g, PLATFORM_HALF * 2, 0.2, 4.4, 0, 4.4, -3.7, tm);
    const O = this.outLines, oc = scaleRGB(LIN.concrete, 1.0);
    for (let x = -PLATFORM_HALF; x <= PLATFORM_HALF; x += 6) { box(g, 0.5, 4.3, 0.5, x, 2.15, -3.4, pw); O.box(x, 0, -3.4, 0.5, 4.3, 0.5, oc, 1); }
    for (let x = -PLATFORM_HALF; x <= PLATFORM_HALF; x += 0.6) O.seg(x, 0, -5.68, x, 4.3, -5.68, scaleRGB(LIN.concrete, 0.55), 0.7);
    for (let y = 0.3; y < 4.3; y += 0.3) O.seg(-PLATFORM_HALF, y, -5.68, PLATFORM_HALF, y, -5.68, scaleRGB(LIN.concrete, 0.55), 0.7);
    O.seg(-PLATFORM_HALF, 0.01, -1.9, PLATFORM_HALF, 0.01, -1.9, scaleRGB(LIN.sodium, 0.9), 3);
    for (let x = -PLATFORM_HALF + 2; x < PLATFORM_HALF; x += 4) this.outLights.push([x, 4.1, -3.2]);
    for (const x of [-15, -6, 1.6, 10, 18]) {
      const sg = new NeonSign({ lines: [yourStop().name], pos: [x, 2.3, -5.66], height: 0.62, kind: 'screen', color: 'paper', bright: 1.2, flicker: 0.02, seed: x });
      g.add(sg.mesh);
      this.nameSigns.push(sg);
    }
    for (const sx of [-1, 1]) {
      box(g, 400, 4.4, 0.2, sx * (PLATFORM_HALF + 200), 2.2, -2.4, tm);
      for (let x = PLATFORM_HALF + 6; x < 400; x += 12) this.tunnelLights.push(sx * x);
      for (const y of [1.2, 1.35, 2.8]) O.seg(sx * PLATFORM_HALF, y, -2.28, sx * (PLATFORM_HALF + 400), y, -2.28, scaleRGB(LIN.concrete, 0.4), 1.2);
    }
  }

  /** Train position relative to YOUR STOP (underground, m) before it comes out of the tunnel. */
  trainS(t: number) {
    const T = this.T;
    if (t < T.stop) { const u = prog(t, T.stop - 1.35, T.stop); return -34 * Math.pow(1 - u, 3); }
    if (t < T.go) return 0;
    return 0.5 * 9 * (t - T.go) ** 2;
  }
  /** Car x offset from its stopping point at KILN YARD (the district, m): braking in, standing, leaving. */
  trainD(t: number) {
    const T = this.T;
    if (t < T.arrive) { const u = prog(t, T.emerge, T.arrive); return -44 * Math.pow(1 - u, 3); }
    const leave = T.out + 1.2;
    return t < leave ? 0 : 0.5 * 5 * (t - leave) ** 2;
  }
  /** Train position along LINE 3 as a station index (the route display's arrow). */
  linePos(t: number) {
    const T = this.T, ys = stationIndex(yourStop().id), ex = stationIndex(exitStation().id);
    if (t < T.stop) return lerp(ys - 0.3, ys, prog(t, T.stop - 1.35, T.stop, ease.outCubic));
    if (t < T.go) return ys;
    return lerp(ys, ex, prog(t, T.go, T.arrive, (x) => x * x * (3 - 2 * x)));
  }

  // ================================================================ the POV camera
  /** Car-local camera (before the child steps out) or world camera (after). */
  pov(t: number): { local: boolean; c: Cam; walk: number; standing: number } {
    const T = this.T, E = ease.inOutCubic;
    if (t < T.exit + 0.35) {
      // seated, reading (looking down), then up at the display, up, to the door, the door shuts in front
      const stand = prog(t, T.stand, T.stand + 0.5, E);
      const wk = prog(t, T.walk0, T.shut0 - 0.1, (x) => x);
      const out = prog(t, T.exit, T.exit + 0.35, E);
      const px = lerp(SEAT[0], DOOR_X, ease.inOutQuad(wk));
      const back = prog(t, T.go, T.display, ease.inOutQuad) * (1 - prog(t, T.emerge + 0.5, T.arrive, ease.inOutQuad));
      const pz = lerp(lerp(SEAT[2], -0.3, ease.inOutQuad(wk)) + back * 0.5, -1.9, out);
      const py = lerp(SEAT[1], EYE, stand);
      const yaw = keys(t, [[this.ctx.start, 0.12], [T.lookUp, 0.1], [T.lookUp + 0.6, -0.55, E], [T.walk0, -0.5, E], [T.shut0 - 0.1, 0, E], [T.display, 0, E], [T.display + 0.5, PORTRAIT ? -0.38 : -0.05, E], [T.emerge + 0.1, PORTRAIT ? -0.38 : -0.05, E], [T.emerge + 0.6, 0.25, E], [T.arrive, 0.1, E], [T.exit + 0.35, 0, E]]);
      const pitch = keys(t, [[this.ctx.start, -0.42], [T.lookUp, -0.42], [T.lookUp + 0.6, 0.04, E], [T.walk0, -0.02, E], [T.shut1, 0.02, E], [T.display, 0.02, E], [T.display + 0.5, 0.62, E], [T.emerge + 0.3, 0.62, E], [T.emerge + 0.9, 0.0, E], [T.exit + 0.35, -0.02, E]]);
      const walking = (t > T.walk0 && t < T.shut0 - 0.1) ? 1 : out > 0 && out < 1 ? 1 : 0;
      return { local: true, c: { p: [px, py, pz], yaw, pitch }, walk: walking, standing: stand };
    }
    // in the street (world): off the platform through the gate, across to the far kerb; look around;
    // turn back to the station (the shutter); turn to the zone's gate; walk in
    const z0 = CAR_Z - 1.9; // just outside the car door (car-local z = -1.9)
    const zAcross = prog(t, T.exit + 0.35, T.book22 + 2.9, (x) => x);
    const zIn = prog(t, T.walkIn, T.walkIn + 2.6, (x) => x);
    const pz = lerp(lerp(z0, STOP_Z, ease.inOutQuad(zAcross)), FENCE_Z - 1.4, zIn);
    const px = lerp(0, 0.5, zIn);
    // yaw: 0 = facing north (-z), π = facing the station (south)
    const yaw = keys(t, [[T.exit + 0.35, 0], [T.lost, -0.1, E], [T.lost + 0.7, -0.6, E], [T.lost + 1.7, 0.5, E], [T.lost + 2.6, 0.1, E], [T.turnBack, 0.1, E], [T.turnBack + 0.75, Math.PI + 0.05, E], [T.turnZone, Math.PI - 0.05, E], [T.turnZone + 0.8, 0.04, E], [T.walkIn + 2.6, 0.0, E]]);
    const pitch = keys(t, [[T.exit + 0.35, 0.0], [T.lost, 0.12, E], [T.lost + 1.7, 0.16, E], [T.lost + 2.6, 0.05, E], [T.turnBack + 0.75, PORTRAIT ? 0.3 : 0.14, E], [T.closed, PORTRAIT ? 0.28 : 0.12, E], [T.turnZone + 0.8, 0.06, E]]);
    const walking = (zAcross > 0 && zAcross < 1) || (zIn > 0 && zIn < 1) ? 1 : 0;
    return { local: false, c: { p: [px, EYE, pz], yaw, pitch }, walk: walking, standing: 1 };
  }

  setCam(c: Cam, t: number, walk: number, offset: V3 = [0, 0, 0], move = 0) {
    const cam = this.cam;
    const bob = walk * Math.abs(Math.sin(t * 7.4)) * 0.03, sway = walk * Math.sin(t * 3.7) * 0.012;
    const swayY = Math.sin(t * 7.3) * 0.006 * move + Math.sin(t * 1.3) * 0.003;
    cam.position.set(c.p[0] + offset[0] + sway * Math.cos(c.yaw), c.p[1] + offset[1] + bob + swayY, c.p[2] + offset[2] - sway * Math.sin(c.yaw));
    const dir = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
    const roll = walk * Math.sin(t * 3.7) * 0.01 + Math.sin(t * 5.3) * 0.004 * move;
    cam.up.set(Math.sin(roll) * Math.cos(c.yaw), Math.cos(roll), -Math.sin(roll) * Math.sin(c.yaw));
    cam.lookAt(cam.position.clone().add(dir));
    cam.up.set(0, 1, 0);
    cam.fov = PORTRAIT ? 74 : 56;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // ================================================================ rendering
  renderDistrict(out: THREE.WebGLRenderTarget, t: number, torch: { on: number; target: THREE.Vector3 } | null) {
    const { renderer } = this.ctx;
    const cam = this.cam, T = this.T;
    this.sky.render(renderer, out, { top: scaleRGB(LIN.shadow, 1.0), horizon: mixRGB(scaleRGB(LIN.fog, 0.9), scaleRGB(LIN.smog, 0.45), 0.35), low: scaleRGB(LIN.shadow, 1.2), horizonY: 0.52, t, haze: 1.0 });
    for (const sg of this.signs) sg.update(t);
    const closed = t >= T.closed;
    this.closedBoard.mesh.visible = t >= T.shutterGo + 0.3;
    this.stationBoard.update(t); this.closedBoard.update(t, closed ? 1.2 : flicker(t, 0.9, 7)); this.zoneBoard.update(t);
    this.shutter.position.y = lerp(3.1, 0.0, prog(t, T.shutterGo, T.closed, (x) => x * x));
    this.shutter.visible = t > T.shutterGo - 0.01;
    this.drawThree(out);
    const cp = cam.position;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const lampsL = torch ? [makeLamp(cp.clone().add(right.multiplyScalar(0.28)).add(new THREE.Vector3(0, -0.3, 0)), torch.target, 11, 12, 1.2 * torch.on)] : [];
    // the one sodium lamp over the zone's gate lights its bars
    const gateLamp = makeLamp(new THREE.Vector3(2.4, 4.1, FENCE_Z - 0.3), new THREE.Vector3(0, 0, FENCE_Z + 0.5), 55, 9, 1.0);
    this.cityB.edges.emit(this.lines3D, cam, { base: 0.35, fog: 0.012, alpha: 0.6 });
    this.dLines.emit(this.lines3D, cam, { base: 0.55, fog: 0.03, lamps: [...lampsL, gateLamp], lampGain: 1.8 });
    this.lines3D.render(renderer, out, cam);
    this.lines3D.clear();
    const g = this.glow3D;
    // the zone is dark (abandoned) and the nearest windows stay small
    this.cityB.emitWindows(g, cam, t, { density: 0.004, gain: 1.3, off: (w) => (w.z < FENCE_Z && w.z > -150 && Math.abs(w.x) < 200 ? 0 : smoothstep(25, 90, Math.hypot(w.x, w.z))) });
    this.cityB.emitStrips(g, cam, t, { density: 0.0015, gain: 1.0 });
    for (const p of this.lamps) g.add(p[0], p[1], p[2], 0.35, 0.35, LIN.sodium, 2.4 * Math.exp(-Math.hypot(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z) * 0.01), 4);
    for (const p of this.lamps) g.add(p[0], 0.05, p[2], 2.6, 2.6, LIN.sodium, 0.18, 2.5);
    for (const sg of this.signs) sg.glow(g, 0.6);
    g.render(renderer, out, cam);
    g.clear();
    this.fogCards.render(renderer, out, cam, t, 1);
    if (torch && torch.on > 0.01) this.cone.render(renderer, out, cam, lampsL[0]!, t, { density: 0.035, floorY: 0, maxDist: 9 });
    // the viewer can see what the child sees: report the signs (glyph soup) for QA
    for (const sg of this.signs) sg.log(cam, { min: 18 });
    this.stationBoard.log(cam, { min: 18 });
    if (this.closedBoard.mesh.visible) this.closedBoard.log(cam, { min: 18 });
    this.zoneBoard.log(cam, { min: 18 });
  }

  renderCar(out: THREE.WebGLRenderTarget, t: number, carPos: V3, outsideDistrict: boolean, sUnder: number) {
    const { renderer } = this.ctx;
    const cam = this.cam, T = this.T;
    // camera is already in world coordinates (car-local + carPos)
    if (!outsideDistrict) {
      // underground: the tunnel scene lives in car-local coordinates (shift the camera back)
      const clear = scaleRGB(LIN.shadow, 0.6);
      renderer.setRenderTarget(out);
      const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
      renderer.setClearColor(new THREE.Color().setRGB(clear[0], clear[1], clear[2], THREE.LinearSRGBColorSpace), 1);
      renderer.clear();
      renderer.setClearColor(prevClear, prevA);
      this.outGroup.position.x = -sUnder;
      for (const sg of this.nameSigns) sg.update(t);
      renderer.render(this.outside, cam);
      this.outLines.emit(this.lines3D, cam, { base: 0.6, fog: 0.02, offset: [-sUnder, 0, 0] });
      this.lines3D.render(renderer, out, cam);
      this.lines3D.clear();
      const g = this.glow3D;
      const cold = mixRGB(LIN.concrete, LIN.paper, 0.65);
      const speed = Math.abs(this.trainS(t + 0.01) - this.trainS(t)) / 0.01;
      const blur = clamp(speed * 0.035, 0, 6);
      for (const p of this.outLights) { const x = p[0] - sUnder; if (Math.abs(x - cam.position.x) < 30) g.add(x, p[1], p[2], 1.4 + blur, 0.18, cold, 1.4, 3); }
      for (const tx of this.tunnelLights) { const x = tx - sUnder; if (Math.abs(x - cam.position.x) < 40) g.add(x, 2.6, -2.25, 0.18 + blur, 0.12, LIN.sodium, 2.2, 4); }
      g.render(renderer, out, cam);
      g.clear();
    }
    // the car itself
    this.car.position.set(...carPos);
    this.car.updateMatrixWorld();
    renderer.setRenderTarget(out); renderer.clearDepth();
    const shut = prog(t, T.shut0, T.shut1, ease.inOutCubic), open1 = prog(t, T.stop + 0.3, T.stop + 0.75, ease.inOutCubic);
    const open2 = prog(t, T.open, T.open + 0.4, ease.inOutCubic);
    const openK = t < T.go + 1 ? open1 * (1 - shut) : open2;
    for (const leaf of this.leaves) {
      const sx = leaf.userData.sx as number;
      leaf.position.set(DOOR_X + sx * (DOOR_W / 4 + openK * (DOOR_W / 2 - 0.02)), 0, WALL_Z - 0.06);
    }
    renderer.render(this.car, cam);
    this.carLines.emit(this.lines3D, cam, { base: 0.75, fog: 0.02, offset: carPos });
    this.lines3D.render(renderer, out, cam);
    this.lines3D.clear();
    const cold = mixRGB(LIN.concrete, LIN.paper, 0.65);
    this.tubes.clear();
    for (let x = -13; x < 13; x += 2.6) { const c = scaleRGB(cold, 1.05); this.tubes.seg(x + carPos[0], CEIL - 0.03 + carPos[1], -0.55 + carPos[2], x + 1.9 + carPos[0], CEIL - 0.03 + carPos[1], -0.55 + carPos[2], 0.12, c[0], c[1], c[2], 1); }
    this.tubes.render(renderer, out, cam);
    const g = this.glow3D;
    const warn = t > T.shut0 - 0.8 && t < T.shut1 + 0.1 ? (Math.floor((t - T.shut0) * 4) % 2 === 0 ? 1 : 0.15) : 0.1;
    for (const sx of [-1, 1]) g.add(DOOR_X + sx * (DOOR_W / 2 + 0.09) + carPos[0], 1.62, WALL_Z + 0.08 + carPos[2], 0.06, 0.1, LIN.sodium, 3 * warn, 4);
    for (let x = -13; x < 13; x += 2.6) g.add(x + 0.95 + carPos[0], CEIL - 0.1, -0.55 + carPos[2], 1.4, 0.35, cold, 0.18, 2);
    g.render(renderer, out, cam);
    g.clear();
    // the route display above the door (drawn in the world layer)
    this.drawRoute(this.world.ctx, t, cam, carPos);
  }

  /** LINE 3 above the door: the stations of city.json; beyond the known part the names turn to glyph soup. */
  drawRoute(c: CanvasRenderingContext2D, t: number, cam: THREE.PerspectiveCamera, off: V3) {
    const x0 = DOOR_X - 0.95 + off[0], x1 = DOOR_X + 0.95 + off[0], y0 = CEIL - 0.04, y1 = DOOR_H + 0.05, z = WALL_Z + 0.06 + off[2];
    const a = project(cam, x0, y0, z), b = project(cam, x1, y0, z), d = project(cam, x0, y1, z);
    if (a.behind || b.behind) return;
    const DW = 1000, DH = 150;
    const st = stations();
    const pos = this.linePos(t);
    const pxPer = Math.hypot(b.x - a.x, b.y - a.y) / DW; // screen px per display px
    c.save();
    c.setTransform((b.x - a.x) / DW, (b.y - a.y) / DW, (d.x - a.x) / DH, (d.y - a.y) / DH, a.x, a.y);
    c.fillStyle = rgba('shadow', 0.95); c.fillRect(0, 0, DW, DH);
    c.strokeStyle = rgba('concrete', 0.6); c.lineWidth = 3; c.strokeRect(2, 2, DW - 4, DH - 4);
    const sx = (i: number) => 70 + i * ((DW - 140) / (st.length - 1));
    const ly = 58;
    c.strokeStyle = rgba('neon', 0.35); c.lineWidth = 6;
    c.beginPath(); c.moveTo(sx(0), ly); c.lineTo(sx(st.length - 1), ly); c.stroke();
    c.strokeStyle = rgba('neon', 0.9);
    c.beginPath(); c.moveTo(sx(0), ly); c.lineTo(sx(pos), ly); c.stroke();
    const ys = stationIndex(yourStop().id);
    st.forEach((s, i) => {
      const passed = pos > i + 0.02, here = Math.abs(pos - i) < 0.04;
      const blink = here && Math.floor(t * 3) % 2 === 0;
      c.fillStyle = here ? rgba('neon', blink ? 1 : 0.5) : passed ? rgba('neon', 0.8) : rgba('concrete', 0.8);
      c.beginPath(); c.arc(sx(i), ly, here ? 13 : 9, 0, Math.PI * 2); c.fill();
      // names beyond the known part break up, letter by letter, once the train has left the known part
      const known = isKnown(s.at[0], s.at[1]);
      const lvl = known ? 0 : clamp(0.18 + (pos - (ys + 0.6)) * 1.1 + (i - ys - 2) * 0.25, 0.18, 1);
      const name = garble(s.name, lvl);
      c.font = font(F.mono(600), 24); c.letterSpacing = '1px'; c.textAlign = 'center';
      c.fillStyle = i === ys ? rgba('paper', 0.95) : rgba('paper', 0.62);
      c.fillText(name, sx(i), i % 2 ? 128 : 104);
      // QA: legible when the display is on screen and its type is ≥ 11 px tall
      const p = project(cam, lerp(x0, x1, sx(i) / DW), lerp(y0, y1, (i % 2 ? 128 : 104) / DH), z);
      const vis = !p.behind && p.x > 0 && p.x < W && p.y > 0 && p.y < H && 24 * pxPer >= 10;
      logText(lvl > 0 ? 'garble' : 'place', lvl > 0 ? `display:${s.name}` : s.name, vis, undefined, { id: `display:${s.id}:${lvl > 0 ? 'g' : 'c'}` });
    });
    c.fillStyle = rgba('paper', 0.95);
    c.beginPath(); c.moveTo(sx(pos) + 16, ly - 26); c.lineTo(sx(pos) - 4, ly - 37); c.lineTo(sx(pos) - 4, ly - 15); c.closePath(); c.fill();
    c.restore();
    // YOUR STOP: the viewer's callout on the display's station
    const pYs = project(cam, lerp(x0, x1, sx(ys) / DW), lerp(y0, y1, ly / DH), z);
    return pYs;
  }

  // ================================================================ the map card (the film's layer)
  mapView(): { v: MapView; box: { x: number; y: number; w: number; h: number } } {
    const b = city().bounds;
    const kmW = b[2] - b[0], kmH = b[3] - b[1];
    const s = PORTRAIT ? 84 : 86;
    const w = kmW * s + 40, h = kmH * s + 40;
    const x = PORTRAIT ? (W - 140 - w) / 2 + 20 : W - SAFE - w, y = PORTRAIT ? 780 : 240;
    return { v: { ox: x + 20 - b[0] * s, oy: y + 20 + kmH * s + b[1] * s, s }, box: { x, y, w, h } };
  }

  drawMapCard(c: CanvasRenderingContext2D, t: number) {
    const T = this.T;
    const a1 = smoothstep(T.lost - 0.1, T.lost + 0.25, t) * (1 - smoothstep(T.turnBack - 0.2, T.turnBack + 0.1, t));
    const a2 = smoothstep(T.recalc, T.recalc + 0.3, t) * (1 - smoothstep(T.turnZone + 0.6, T.turnZone + 0.9, t));
    const a = Math.max(a1, a2);
    if (a <= 0.001) return;
    const { v, box } = this.mapView();
    const recalc = a2 > a1;
    c.save();
    c.globalAlpha *= a;
    c.fillStyle = rgba('shadow', 0.86); c.fillRect(box.x, box.y, box.w, box.h);
    c.strokeStyle = rgba('lamp', 0.35); c.lineWidth = 1; c.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    const metro = recalc ? 1 - prog(t, T.recalc + 0.2, T.recalc + 0.7) : 1;
    drawCityMap(c, v, { metro, zoneLabel: recalc ? prog(t, T.recalc + 0.8, T.recalc + 1.1) : 0, weight: PORTRAIT ? 1.25 : 1.1 });
    const ex = exitStation(), ys = yourStop();
    const dot = mapPx(v, ex.at);
    // YOU: the yellow dot at the edge of the known city
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    c.fillStyle = rgba('coat'); c.beginPath(); c.arc(dot.x, dot.y, 10, 0, Math.PI * 2); c.fill();
    c.strokeStyle = rgba('coat', 0.7 * (1 - pulse)); c.lineWidth = 2; c.beginPath(); c.arc(dot.x, dot.y, 13 + pulse * 18, 0, Math.PI * 2); c.stroke();
    c.restore();
    const S = PORTRAIT ? 30 : 22;
    if (!recalc) {
      drawCallout(c, t, { ax: dot.x, ay: dot.y, lx: dot.x - 30, ly: dot.y - 70, side: -1, text: ['YOU', ex.name], places: [ex.name], at: T.lost + 0.1, out: T.turnBack - 0.3, color: 'coat', size: S, plate: 0.7 });
      // "missed the stop": the route line draws back along LINE 3 to YOUR STOP
      const st = stations(), i0 = stationIndex(ex.id), i1 = stationIndex(ys.id);
      const k = prog(t, T.missed, T.stopW, ease.inOutQuad) * a1;
      if (k > 0) {
        const pts = st.slice(i1, i0 + 1).reverse().map((s) => mapPx(v, s.at));
        c.save(); c.globalAlpha *= a1;
        c.strokeStyle = rgba('red', 0.95); c.lineWidth = PORTRAIT ? 7 : 6; c.lineCap = 'round'; c.setLineDash([2, 12]);
        let left = k * pts.slice(1).reduce((L, p, j) => L + Math.hypot(p.x - pts[j]!.x, p.y - pts[j]!.y), 0);
        c.beginPath(); c.moveTo(pts[0]!.x, pts[0]!.y);
        for (let j = 1; j < pts.length && left > 0; j++) {
          const d = Math.hypot(pts[j]!.x - pts[j - 1]!.x, pts[j]!.y - pts[j - 1]!.y), q = Math.min(1, left / d);
          c.lineTo(lerp(pts[j - 1]!.x, pts[j]!.x, q), lerp(pts[j - 1]!.y, pts[j]!.y, q)); left -= d;
        }
        c.stroke(); c.restore();
      }
      const yp = mapPx(v, ys.at);
      drawCallout(c, t, { ax: yp.x, ay: yp.y, lx: box.x + 26, ly: box.y + 34 + S, side: 1, text: ['YOUR STOP', ys.name], at: T.missed, cps: 90, out: T.turnBack - 0.3, size: S, plate: 0.75, places: [ys.name] });
      // AREA NOT MAPPED: a hazard-striped banner over the grey part, landing on "lost"
      this.drawBanner(c, t, T.lost, box, a1);
    } else {
      // recalculation: the metro is closed; the only way home on foot runs through the restricted zone
      const w = city().route.walk.map((p) => mapPx(v, p));
      const k = prog(t, T.recalc + 0.6, T.recalc + 1.6, ease.inOutQuad);
      c.save(); c.globalAlpha *= a2;
      c.strokeStyle = rgba('coat', 0.95); c.lineWidth = PORTRAIT ? 7 : 6; c.lineCap = 'round'; c.lineJoin = 'round';
      let left = k * w.slice(1).reduce((L, p, j) => L + Math.hypot(p.x - w[j]!.x, p.y - w[j]!.y), 0);
      c.beginPath(); c.moveTo(w[0]!.x, w[0]!.y);
      for (let j = 1; j < w.length && left > 0; j++) {
        const d = Math.hypot(w[j]!.x - w[j - 1]!.x, w[j]!.y - w[j - 1]!.y), q = Math.min(1, left / d);
        c.lineTo(lerp(w[j - 1]!.x, w[j]!.x, q), lerp(w[j - 1]!.y, w[j]!.y, q)); left -= d;
      }
      c.stroke(); c.restore();
      const mid = mapPx(v, stations()[Math.floor(stations().length / 2)]!.at);
      drawCallout(c, t, { ax: mid.x, ay: mid.y, lx: mid.x + 20, ly: mid.y + 50, side: 1, text: `${city().metro.line} · CLOSED`, cps: 90, at: T.recalc + 0.3, out: T.turnZone + 0.6, size: S, plate: 0.75, places: [city().metro.line] });
    }
  }

  /** AREA NOT MAPPED: a hazard-striped strip on the map card (our own design). */
  drawBanner(c: CanvasRenderingContext2D, t: number, at: number, box: { x: number; y: number; w: number; h: number }, alpha: number) {
    const k = prog(t, at - 0.05, at + 0.25, ease.outBack);
    if (k <= 0 || alpha <= 0.001) return;
    const l1 = 'AREA NOT MAPPED', l2 = 'THIS PART OF THE CITY IS NOT OPEN YET';
    const s1 = PORTRAIT ? 34 : 34, s2 = PORTRAIT ? 17 : 17;
    const w1 = measure(l1, F.mono(600), s1, s1 * 0.12), w2 = measure(l2, F.mono(500), s2, s2 * 0.06);
    const bw = Math.min(box.w - 20, Math.max(w1, w2) + 90), bh = s1 + s2 + 46;
    const cx = box.x + box.w - bw / 2 - 10, cy = box.y + box.h - bh / 2 - 10;
    c.save();
    c.globalAlpha *= alpha * clamp(k * 3);
    c.translate(cx, cy);
    c.scale(lerp(1.2, 1, clamp(k)), lerp(1.2, 1, clamp(k)));
    c.fillStyle = rgba('shadow', 0.92); c.fillRect(-bw / 2, -bh / 2, bw, bh);
    for (const sx of [-1, 1]) {
      c.save();
      c.beginPath(); c.rect(sx < 0 ? -bw / 2 : bw / 2 - 26, -bh / 2, 26, bh); c.clip();
      c.fillStyle = rgba('neon', 0.85);
      for (let x = -bw / 2 - 60; x < bw / 2 + 60; x += 18) { c.beginPath(); c.moveTo(x, -bh / 2); c.lineTo(x + 9, -bh / 2); c.lineTo(x + 9 - bh * 0.6, bh / 2); c.lineTo(x - bh * 0.6, bh / 2); c.closePath(); c.fill(); }
      c.restore();
    }
    c.strokeStyle = rgba('neon', 0.9); c.lineWidth = 2; c.strokeRect(-bw / 2 + 1, -bh / 2 + 1, bw - 2, bh - 2);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const n = Math.floor(Math.max(0, t - at) * 150);
    c.font = font(F.mono(600), s1); c.letterSpacing = `${s1 * 0.12}px`; c.fillStyle = rgba('neon');
    c.fillText(l1.slice(0, n), 0, -bh / 2 + 16 + s1 * 0.85);
    c.font = font(F.mono(500), s2); c.letterSpacing = `${s2 * 0.06}px`; c.fillStyle = rgba('paper', 0.9);
    c.fillText(l2.slice(0, Math.max(0, n - l1.length)), 0, bh / 2 - 16);
    c.restore();
    logText('banner', `${l1} / ${l2}`, n >= l1.length + l2.length && alpha >= 0.97, { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh });
  }

  // ================================================================ frame
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    const P = this.pov(t);
    let carPos: V3 = [0, 0, 0];
    let district = false, sUnder = 0;
    if (P.local) {
      if (t < T.emerge) { sUnder = this.trainS(t); carPos = [0, 0, 0]; }
      else { district = true; carPos = [-DOOR_X + this.trainD(t), 0, CAR_Z]; }
      const moving = t < T.stop || (t > T.go && t < T.arrive) ? 1 : 0;
      this.setCam(P.c, t, P.walk, carPos, moving);
    } else {
      district = true;
      carPos = [-DOOR_X + this.trainD(t), 0, CAR_Z];
      this.setCam(P.c, t, P.walk);
    }
    // the torch: out in the dark after "lost", pointing where the child looks
    const torchOn = t > T.lost + 0.25 ? clamp(prog(t, T.lost + 0.25, T.lost + 0.35)) * flicker(t, t < T.lost + 0.7 ? 0.8 : 0.02, 5) : 0;
    const fwd = new THREE.Vector3(); this.cam.getWorldDirection(fwd);
    const torchT = this.cam.position.clone().add(fwd.clone().multiplyScalar(6)).add(new THREE.Vector3(0, -0.9, 0));
    if (district) this.renderDistrict(out, t, t > T.lost ? { on: torchOn, target: torchT } : null);
    if (P.local || this.trainD(t) < 30) this.renderCar(out, t, carPos, district, sUnder);
    const w = this.world.ctx;
    rain(this.lines2D, t, { count: district && !P.local ? 700 : 0, alpha: 0.1, speed: 1500, angle: 0.08, seed: 9 });
    this.composite2D(this.world, out);
    if (district && !P.local) this.lines2D.render(renderer, out);

    // ---- first person: sleeves, hands, the handbook (and the torch after "lost")
    const u = this.ui.ctx;
    this.drawHands(u, t, P, torchOn);
    this.drawUI(u, t, f);
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    const fadeIn = 1 - smoothstep(f.start, f.start + 0.12, t);
    return { ...POST_BASE, fade: fadeIn * 0.6 };
  }

  drawHands(c: CanvasRenderingContext2D, t: number, P: ReturnType<Lost['pov']>, torchOn: number) {
    const T = this.T;
    const bob = P.walk * Math.sin(t * 7.4) * 10;
    // how the book is held: up and facing (reading), or lowered (looking up / walking)
    const readA = 1 - prog(t, T.lookUp, T.lookUp + 0.6, ease.inOutCubic); // the introduction
    const read22 = Math.max(prog(t, T.book22, T.book22 + 0.5, ease.inOutCubic) * (1 - prog(t, T.bookDown, T.bookDown + 0.4, ease.inOutCubic)), prog(t, T.closed + 0.05, T.closed + 0.45, ease.inOutCubic));
    const read = t < T.exit ? readA : read22;
    const legible = read > 0.9;
    const bw = PORTRAIT ? 880 : 900;
    const upY = PORTRAIT ? 1440 : 820, downY = PORTRAIT ? 1760 : 1090;
    const bx = PORTRAIT ? W / 2 - 40 : W * 0.34;
    const book = { x: bx + Math.sin(t * 0.7) * 6, y: lerp(downY, upY, read) + bob, w: bw, rot: lerp(0.1, -0.03, read), tilt: lerp(0.55, 0.97, read) };
    const inDark = t > T.exit;
    // which page: the introduction (p. 12) in the train; p. 22 once lost; p. 26 after "closed"
    const flip = prog(t, T.closed - 0.3, T.closed);
    const page = t < T.exit ? { page: INTRO.page, heading: 'INTRODUCTION', steps: this.introSteps, title: 'HOW TO USE THIS BOOK' }
      : flip < 0.5 ? { page: '22', heading: 'YOU ARE LOST', steps: this.steps22 } : { page: '26', heading: 'YOU MISSED THE STOP', steps: this.steps26 };
    const glitch = prog(t, this.steps26[2]!.at + 20 / 30 + 2.1, this.steps26[2]!.at + 20 / 30 + 2.6);
    const steps = page.page === '26' ? page.steps.map((s, i) => (i === 2 && glitch > 0 ? { ...s, glitch } : s)) : page.steps;
    // right hand: on the book (train), reaching to the door glass (doors shut), holding the torch (dark)
    let right: { x: number; y: number; mode: 'book' | 'torch' | 'reach'; dir?: number } | null | undefined = undefined;
    const reach = prog(t, T.shut0 - 0.15, T.shut1, ease.outCubic) * (1 - prog(t, T.display - 0.4, T.display, ease.inOutCubic));
    if (reach > 0) right = { x: lerp(bx + bw * 0.5, W * 0.62, reach), y: lerp(book.y, H * 0.52, reach), mode: 'reach', dir: -0.2 };
    if (inDark) {
      const tb = prog(t, T.lost, T.lost + 0.4, ease.outCubic);
      const tx = PORTRAIT ? W * 0.8 : W * 0.78, ty = PORTRAIT ? 1650 : 900;
      right = { x: lerp(W + 200, tx, tb), y: ty + bob * 0.6, mode: 'torch', dir: -Math.PI / 2 - 0.35 };
    }
    const r = drawPOV(c, t, {
      book, right, torch: torchOn, warm: inDark ? 0.55 * torchOn : 0.1, amb: inDark ? 0.18 : 0.75,
      page: (pc, w, h) => {
        pc.save();
        if (flip > 0 && flip < 1) { pc.translate(w / 2, 0); pc.scale(Math.abs(Math.cos(flip * Math.PI)), 1); pc.translate(-w / 2, 0); }
        drawHandbookSpread(pc, w, h, t, { page: page.page, heading: page.heading, steps, legible: legible && (flip === 0 || flip === 1), cps: 30 });
        pc.restore();
      },
    });
    this.glow2D.clear();
    if (inDark && right && right.mode === 'torch') {
      const th = torchHead(right);
      this.glow2D.add(th.x, th.y, 0, 60, 60, LIN.lamp, 0.8 * torchOn, 3);
    }
    return r;
  }

  drawUI(c: CanvasRenderingContext2D, t: number, f: Frame) {
    const T = this.T, cam = this.cam;
    const L1 = this.ly.get('You are lost'), L2 = this.ly.get('You missed the stop');
    const S = PORTRAIT ? 30 : 24;
    // ---- the sung entry (with the printed heading as a translation note)
    const ex = PORTRAIT ? 60 : SAFE, ew = PORTRAIT ? W - 60 - 150 : 1040;
    const ey = PORTRAIT ? 440 : 150, size = PORTRAIT ? 102 : 56;
    const l2s = L2.words[0]!.start;
    drawEntry(c, this.ly, this.au, L1, t, { x: ex, y: ey, width: ew, size, alpha: entryAlpha(L1, t, 30) * (1 - smoothstep(l2s - 0.3, l2s - 0.12, t)), plate: 0.5 });
    drawEntry(c, this.ly, this.au, L2, t, { x: ex, y: ey, width: ew, size, alpha: smoothstep(l2s - 0.12, l2s - 0.02, t), plate: 0.5 });
    // ---- page counter: p. 12 (the introduction) until "lost" (22), then 26 on "You missed"
    drawPageCounter(c, this.ly, t, { chapter: 'lost', chapterStart: L1.words[0]!.start, plate: 0.6, ...(PORTRAIT ? counterPortrait() : {}) });
    // ---- the viewer's callouts
    if (t < T.emerge) {
      // YOUR STOP on the station name plate through the door (from the stop until it slides away)
      const s = this.trainS(t);
      const sg = this.nameSigns[2]!;
      const sp = project(cam, sg.pos.x - s - sg.w * 0.3, sg.pos.y + sg.h * 0.1, sg.pos.z);
      const inView = sp.x > 80 && sp.x < W - 80 && !sp.behind && sp.y > 0 && sp.y < H;
      if (t >= T.stop) sg.log(cam, { kind: 'place', min: 12 });
      drawCallout(c, t, { ax: sp.x, ay: sp.y, lx: sp.x + 60, ly: sp.y - 110, side: 1, text: ['YOUR STOP', yourStop().name], at: T.stop, out: inView ? T.emerge : Math.min(T.emerge, t - 0.36), size: S, plate: 0.7, places: [yourStop().name] });
      const dl = project(cam, DOOR_X + DOOR_W / 2 + 0.09, 1.62, WALL_Z + 0.08);
      const dax = clamp(dl.x, 40, W - 40), day = clamp(dl.y, 40, H - 40);
      drawCallout(c, t, { ax: dax, ay: day, lx: clamp(dax + 70, 120, W - 420), ly: clamp(day + 90, 240, PORTRAIT ? 1300 : H - 300), side: 1, text: 'DOORS CLOSING', at: T.shut0 - 1.1, out: T.go + 0.9, cps: 90, size: S, plate: 0.7, color: 'sodium' });
    }
    if (t >= T.display - 0.2 && t < T.emerge + 1.4) {
      // the display past the known part: the names break up; the viewer still reads them
      const ex2 = exitStation();
      const p = project(cam, DOOR_X + 0.95, CEIL - 0.2, WALL_Z + 0.06);
      const pax = clamp(p.x, 40, W - 40), pay = clamp(p.y, 40, H - 40);
      drawCallout(c, t, { ax: pax, ay: pay, lx: clamp(pax + 60, 120, W - 420), ly: clamp(pay + 100, 240, PORTRAIT ? 1300 : H - 300), side: 1, text: 'PAST YOUR MAP', cps: 90, at: T.display, out: T.emerge + 0.95, size: S, plate: 0.75 }); void ex2;
    }
    if (t > T.exit) {
      // in the street: the viewer reads the signs the child can't
      const board = this.closedBoard;
      const bp = project(cam, board.pos.x, board.pos.y + board.h * 0.1, board.pos.z);
      const ok = !bp.behind && bp.x > 60 && bp.x < W - 60;
      drawCallout(c, t, { ax: bp.x, ay: bp.y, lx: PORTRAIT ? bp.x + 60 : bp.x - 80, ly: bp.y + 110, side: PORTRAIT ? 1 : -1, text: 'STATION CLOSED', cps: 90, at: T.closed + 0.05, out: ok ? T.turnZone - 0.1 : t - 0.36, size: S, plate: 0.75 });
      const zp = project(cam, this.zoneBoard.pos.x, this.zoneBoard.pos.y, this.zoneBoard.pos.z);
      const zax = zp.behind ? W / 2 : clamp(zp.x, 40, W - 40), zay = zp.behind ? H / 2 : clamp(zp.y, 40, H - 40);
      drawCallout(c, t, { ax: zax, ay: zay, lx: clamp(zax + 90, 120, W - 640), ly: clamp(zay - 150, PORTRAIT ? 880 : 280, PORTRAIT ? 1300 : H - 300), side: 1, text: city().restricted.sign.split(' · '), cps: 90, at: T.turnZone + 0.2, out: f.end + 1, size: S, plate: 0.75, color: 'neon', places: [city().restricted.name] });
    }
    // ---- the map card and the HOME · x km chip
    this.drawMapCard(c, t);
    const chipAt = T.recalc + 1.6;
    if (t > chipAt) {
      const txt = `HOME · ${fmtKm(homeKm('lost'))}`;
      const cs = PORTRAIT ? 30 : 24;
      const cw = measure(txt, F.mono(600), cs, cs * 0.1) + cs * 1.4;
      const cx = PORTRAIT ? W - 390 - cw : W - SAFE - 250 - cw, cy = PORTRAIT ? 205 : 92;
      const a = smoothstep(chipAt, chipAt + 0.25, t);
      c.save(); c.globalAlpha *= a;
      c.fillStyle = rgba('shadow', 0.8); c.fillRect(cx, cy, cw, cs * 1.7);
      c.strokeStyle = rgba('coat', 0.7); c.strokeRect(cx + 0.5, cy + 0.5, cw - 1, cs * 1.7 - 1);
      c.font = font(F.mono(600), cs); c.letterSpacing = `${cs * 0.1}px`; c.fillStyle = rgba('coat');
      c.fillText(txt, cx + cs * 0.7, cy + cs * 1.2);
      c.restore();
      logText('chip', txt, a >= 0.97, { x: cx, y: cy, w: cw, h: cs * 1.7 }, { places: [city().home.name] });
    }
  }
}
