// `tease` — «ТЕБЯ ДРАЗНЯТ РЕБЯТА» (TREATMENT p.7·: the kids around the child, "they call your name": the name
// repeats until it is unreadable; the city's screen says «kindness week»; r5 item 9: the cat is still with the
// child). City stop: a двор between панельки, garages along one side. First person:
//   (a) start      out of the arch under a block into the yard: the garage roofs, the lit windows, an empty swing
//                  moving; on «They» five phone screens light up on the garage roofs, one by one.
//   (b) the walk   the kids' heads follow the child; red REC dots come on; a poster on the garage end with a
//                  smiley and mojibake (callout: НЕДЕЛЯ ДОБРОТЫ).
//   (c) «tease… laugh»  the phones' torches turn on the child; the kids rock with laughter, one points.
//   (d) «call your name» chalk on the garage doors, one on every beat: ПОТЕРЯШКА, again and again, stacked until
//                  it no longer reads; on «name» the child looks down: the cat pressed to its boots, ears back.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, smoothstep, keys, mulberry32, hash } from '../engine/util';
import { F, font } from '../engine/type';
import { garble, homeLabel, city } from '../city';
import { type Light } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, blotches, speckle, asphalt, boxMesh, cyl, ground, concreteTex, corrugatedTex, streetLight,
  panelBlock, WindowPanes, POST_BASE, LIN, scaleRGB, mixRGB, lin, EYE, type Pov, type V3, type RGB,
} from './_kit';
import { makeLamp } from './_motifs';
import { Quadruped, CAT, type QuadSpec } from './_beasts';
import { Figure, type FigureSpec } from './_people';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const GX = -5.6; // the garage fronts (doors face +x)
const GY = 2.55; // garage roof height
const G_Z0 = -6; // the row's near end
const GW = 3.3; // one garage
const NG = 6;
const POSTER: V3 = [-8.4, 1.45, G_Z0 + 0.02];
const STOP_Z = -7.2; // where the child stops
const NAME = 'ПОТЕРЯШКА';

interface Kid { glow: THREE.PointLight; f: Figure; pos: THREE.Vector3; sit: number; lit: number; rec: number; torch: number; phone: THREE.Mesh; L: THREE.SpotLight; seed: number; point?: boolean }
interface Scrawl { door: number; x: number; y: number; size: number; ang: number; t: number }

export default class Tease extends LitScene {
  chapter = 'tease';
  cat!: Quadruped;
  catSpec: QuadSpec = { ...CAT, back: [0.34, 0.12, 0.03], belly: [0.62, 0.36, 0.14], legs: [0.5, 0.26, 0.08], muzzleC: [0.7, 0.5, 0.32], eye: [0.45, 0.95, 0.3], stripes: 70 };
  kids: Kid[] = [];
  doors: { mesh: THREE.Mesh; cv: HTMLCanvasElement; tex: THREE.CanvasTexture; z: number }[] = [];
  scrawls: Scrawl[] = [];
  poster!: THREE.Mesh; posterText = '';
  panes!: WindowPanes;
  swing!: THREE.Group;
  grain!: HTMLCanvasElement;
  bulbP: V3 = [0, 0, 0];
  lampP: V3 = [-11.4, 6.5, -13.5];

  override init() {
    this.initLit();
    this.hemi.intensity = 0.14;
    this.fogE.density = 0.02;
    const s = this.ctx.start;
    const words = this.ly.linesIn(s, s + 23).flatMap((l) => l.words);
    const w1 = (re: RegExp) => words.find((q) => re.test(q.w))!;
    const T: Record<string, number> = { s };
    T.they = w1(/^They$/).start; T.tease = w1(/^tease/).start; T.laugh = w1(/^laugh/).start; T.call = w1(/^call/).start; T.name = w1(/^name/).start;
    T.end = this.ctx.end;
    this.T = T;
    this.posterText = garble('НЕДЕЛЯ ДОБРОТЫ');
    this.build();
    this.cat = new Quadruped(this.catSpec, this.three, 80);
    this.buildKids();
    this.buildScrawls();
    this.obstacles = () => { const b = this.planeBox(this.poster); return b ? [b] : []; };
  }

  build() {
    const S = this.three;
    const { map, rough } = asphalt(101, [6, 6], { puddles: 12, base: '#222427' });
    ground(S, 60, 60, 0, -14, lit([0.62, 0.62, 0.62], { map, roughMap: rough, rough: 0.68 }));
    ground(S, 120, 120, 0, -14, lit([0.2, 0.2, 0.19], { rough: 1 }), -0.02);
    // ---- the block with the arch behind the camera (two halves and the span over the arch)
    const wins: ReturnType<typeof panelBlock> = [];
    wins.push(...panelBlock(S, { cx: -17, cz: 7.5, len: 30, floors: 9, ang: 0, seed: 51, litRate: 0.14 }));
    wins.push(...panelBlock(S, { cx: 17, cz: 7.5, len: 30, floors: 9, ang: 0, seed: 52, litRate: 0.14 }));
    const span = new THREE.Group(); span.position.y = 3.2; S.add(span);
    panelBlock(span, { cx: 0, cz: 7.5, len: 4.2, floors: 8, ang: 0, seed: 53, litRate: 0 });
    const archM = lit([0.4, 0.4, 0.39], { map: concreteTex(54, [3, 1], { stains: 50 }), rough: 0.95 });
    for (const sx of [-1, 1]) boxMesh(S, 0.3, 3.2, 12, sx * 2.1, 1.6, 7.5, archM);
    boxMesh(S, 4.4, 0.3, 12, 0, 3.2, 7.5, archM);
    this.addPoint([0, 2.9, 4], [1.0, 0.75, 0.45], 1.2);
    // ---- the other blocks around the yard
    wins.push(...panelBlock(S, { cx: 30, cz: -16, len: 50, floors: 9, ang: Math.PI / 2, seed: 55, litRate: 0.16 }));
    wins.push(...panelBlock(S, { cx: -2, cz: -46, len: 70, floors: 9, ang: 0.05, seed: 56, litRate: 0.15 }));
    wins.push(...panelBlock(S, { cx: -32, cz: -22, len: 40, floors: 5, ang: Math.PI / 2 + 0.1, seed: 57, litRate: 0.18 }));
    this.panes = new WindowPanes(S, wins);
    // entrance lamps on the right block
    for (const z of [-4, -20, -36]) { this.addPoint([23.3, 2.9, z], [1.0, 0.7, 0.4], 3); }
    // ---- the garage row: brick-and-concrete boxes with corrugated steel doors, a tar roof with a lip
    const body = lit([0.4, 0.38, 0.36], { map: concreteTex(58, [3, 1], { stains: 40 }), rough: 0.95 });
    const roof = lit([0.08, 0.08, 0.085], { rough: 0.7 });
    const cor = corrugatedTex(59, [1, 1], '#50575a');
    for (let k = 0; k < NG; k++) {
      const z = G_Z0 - GW / 2 - k * GW;
      boxMesh(S, 6, GY, GW - 0.02, GX - 3, GY / 2, z, body);
      boxMesh(S, 6.3, 0.14, GW, GX - 3, GY + 0.07, z, roof);
      const col = k % 3 === 0 ? '#4a5a4c' : k % 3 === 1 ? '#5a4a40' : '#4a5058';
      const c2 = corrugatedTex(60 + k, [1, 1], col);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.1), lit([0.6, 0.6, 0.6], { map: c2.map, normalMap: c2.nrm, rough: 0.6, metal: 0.1 }));
      door.position.set(GX + 0.02, 1.08, z); door.rotation.y = Math.PI / 2; door.receiveShadow = true; S.add(door);
      // the chalk layer on the door
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 520;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.1), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 }));
      m.position.set(GX + 0.035, 1.08, z); m.rotation.y = Math.PI / 2; S.add(m);
      this.doors.push({ mesh: m, cv, tex, z });
    }
    void cor;
    // the poster on the row's end wall: a printed sheet with a smiley and mojibake
    const pc = document.createElement('canvas'); pc.width = 420; pc.height = 560;
    const c = pc.getContext('2d')!;
    c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, 420, 560);
    speckle(c, 420, 560, 3000, 0.12, 61);
    c.fillStyle = '#d23a2c'; c.font = font(F.metro(900), 44); c.textAlign = 'center'; c.fillText(this.posterText.slice(0, 7), 210, 70); c.fillText(this.posterText.slice(7), 210, 120);
    c.fillStyle = '#f2c53d'; c.beginPath(); c.arc(210, 290, 110, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2a2016'; c.lineWidth = 12; c.lineCap = 'round';
    c.beginPath(); c.arc(210, 300, 64, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.fillStyle = '#2a2016'; c.beginPath(); c.arc(172, 262, 12, 0, 7); c.arc(248, 262, 12, 0, 7); c.fill();
    c.fillStyle = '#3a3a3a'; c.font = font(F.metro(400), 20);
    for (let i = 0; i < 4; i++) c.fillText(garble(['ДРУЖИТЕ', 'ПОМОГАЙТЕ', 'УЛЫБАЙТЕСЬ', 'ДЕЛИТЕСЬ'][i]!), 210, 450 + i * 26);
    // the rain got to it: streaks and a torn corner
    const g = c.createLinearGradient(0, 0, 0, 560); g.addColorStop(0, 'rgba(80,70,50,0)'); g.addColorStop(1, 'rgba(80,70,50,0.35)'); c.fillStyle = g; c.fillRect(0, 0, 420, 560);
    c.fillStyle = '#000'; c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.moveTo(420, 460); c.lineTo(420, 560); c.lineTo(330, 560); c.closePath(); c.fill(); c.globalCompositeOperation = 'source-over';
    const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace; ptex.anisotropy = 8;
    this.poster = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.4), lit([0.9, 0.9, 0.9], { map: ptex, rough: 0.85, transparent: true }));
    this.poster.position.set(...POSTER); S.add(this.poster);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat([1.0, 0.8, 0.5], 3)); bulb.position.set(POSTER[0], POSTER[1] + 1.0, POSTER[2] + 0.25); S.add(bulb);
    boxMesh(S, 0.04, 0.04, 0.25, POSTER[0], POSTER[1] + 1.05, POSTER[2] + 0.12, lit([0.2, 0.2, 0.2]));
    this.addPoint([POSTER[0], POSTER[1] + 0.95, POSTER[2] + 0.35], [1.0, 0.78, 0.5], 1.6, 6);
    this.bulbP = [POSTER[0], POSTER[1] + 1.0, POSTER[2] + 0.25];
    // ---- the yard lamp (by the garages) and the playground: a swing frame and a steel rocket
    const hp = streetLight(S, GX - 7, -13.5, { h: 6.5, arm: [1.2, 0, 0] });
    this.lampP = hp;
    this.addLamp(hp, { k: 70, angle: 1.2, shadow: true, target: [hp[0] + 4, 0, hp[2]] });
    const steel = lit([0.25, 0.3, 0.32], { rough: 0.5, metal: 0.3 });
    const SX = 6.5, SZ = -13;
    for (const dz of [-1.1, 1.1]) { cyl(S, [SX - 0.9, 0, SZ + dz], [SX, 2.4, SZ + dz], 0.05, steel, { seg: 6 }); cyl(S, [SX + 0.9, 0, SZ + dz], [SX, 2.4, SZ + dz], 0.05, steel, { seg: 6 }); }
    cyl(S, [SX, 2.4, SZ - 1.2], [SX, 2.4, SZ + 1.2], 0.05, steel, { seg: 6 });
    this.swing = new THREE.Group(); this.swing.position.set(SX, 2.4, SZ); S.add(this.swing);
    for (const dz of [-0.3, 0.3]) cyl(this.swing, [0, 0, dz], [0, -1.9, dz], 0.01, steel, { seg: 4 });
    boxMesh(this.swing, 0.25, 0.04, 0.7, 0, -1.92, 0, lit([0.5, 0.18, 0.1], { rough: 0.7 }));
    // the rocket: a tube frame with a cone
    const RX = 11, RZ = -25;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; cyl(S, [RX + Math.cos(a) * 0.9, 0, RZ + Math.sin(a) * 0.9], [RX + Math.cos(a) * 0.9, 4.2, RZ + Math.sin(a) * 0.9], 0.04, steel, { seg: 5 }); cyl(S, [RX + Math.cos(a) * 0.9, 4.2, RZ + Math.sin(a) * 0.9], [RX, 6.2, RZ], 0.04, steel, { seg: 5 }); }
    for (const y of [1.2, 2.6, 4.2]) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, b = ((k + 1) / 6) * Math.PI * 2; cyl(S, [RX + Math.cos(a) * 0.9, y, RZ + Math.sin(a) * 0.9], [RX + Math.cos(b) * 0.9, y, RZ + Math.sin(b) * 0.9], 0.03, steel, { seg: 4, cast: false }); }
    // the chalk grain (erases specks from the chalk)
    this.grain = document.createElement('canvas'); this.grain.width = 640; this.grain.height = 520;
    const gc = this.grain.getContext('2d')!; const r = mulberry32(62);
    for (let i = 0; i < 26000; i++) { gc.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`; gc.fillRect(r() * 640, r() * 520, 1 + r() * 2, 1 + r() * 2); }
    void glowMat; void blotches; void canvasTex; void lin;
  }

  buildKids() {
    const specs: [FigureSpec, V3, number, boolean?][] = [
      [{ height: 1.45, kid: true, coat: [0.1, 0.12, 0.16], trousers: [0.05, 0.05, 0.06], hood: true, seed: 1 }, [GX - 0.35, GY, -9.4], 1],
      [{ height: 1.55, kid: true, coat: [0.22, 0.05, 0.05], trousers: [0.04, 0.04, 0.05], beanie: [0.05, 0.05, 0.06], seed: 2 }, [GX - 0.9, GY, -11.0], 0, true],
      [{ height: 1.5, kid: true, coat: [0.06, 0.1, 0.07], trousers: [0.05, 0.05, 0.05], seed: 3 }, [GX - 0.4, GY, -12.6], 1],
      [{ height: 1.6, kid: true, coat: [0.14, 0.14, 0.15], trousers: [0.04, 0.04, 0.05], hood: true, seed: 4 }, [GX - 1.2, GY, -14.4], 0],
      [{ height: 1.4, kid: true, coat: [0.3, 0.2, 0.08], trousers: [0.05, 0.05, 0.06], beanie: [0.3, 0.05, 0.05], seed: 5 }, [GX + 0.9, 0, -15.8], 0],
    ];
    const T = this.T;
    specs.forEach(([sp, p, sit, point], i) => {
      const f = new Figure(this.three, sp, 64);
      const phone = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.5, 0.65, 0.85, THREE.LinearSRGBColorSpace) }));
      this.three.add(phone);
      const L = new THREE.SpotLight(0xe8f0ff, 0, 30, 0.22, 0.6, 2);
      this.three.add(L, L.target);
      const glow = new THREE.PointLight(0xa8c4ff, 0, 3.5, 2); this.three.add(glow);
      // on «They» the screens light up one by one; REC before «tease»; the torches on «tease»
      const lt = T.they + 0.15 + i * 0.42, rt = T.they + 5.5 + i * 0.5, tt = T.tease - 0.05 + [0, 0.5, 0.25, 0.8, 1.1][i]!;
      const pos = new THREE.Vector3(...p);
      if (sit) pos.y = GY - 0.3 * sp.height;
      this.kids.push({ glow, f, pos, sit, lit: lt, rec: rt, torch: tt, phone, L, seed: i, point });
    });
  }

  /** The chalk: on «call» one ПОТЕРЯШКА per beat across the doors, then faster and stacked until it doesn't read. */
  buildScrawls() {
    const T = this.T, r = mulberry32(71);
    const t0 = T.call - 0.05;
    const beats: number[] = [];
    for (let k = 0; ; k++) { const b = this.au.timeOfBeat(Math.ceil(this.au.beatAt(t0)) + k); if (b > T.end - 0.3) break; beats.push(b); }
    // first ones big and clean on the nearest doors; later on halves of beats, overlapping
    const order = [1, 2, 1, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 1, 3, 2, 1, 2, 3, 1, 2, 1, 2, 3];
    const times: number[] = [];
    beats.forEach((b, i) => { times.push(b); if (i >= 4) times.push(b + (beats[i + 1] ? (beats[i + 1]! - b) / 2 : 0.25)); });
    times.slice(0, 40).forEach((t, i) => {
      const door = PORTRAIT && order[i % order.length] === 3 ? 1 + (i % 2) : order[i % order.length]!;
      const first = i < 4;
      this.scrawls.push({ door, x: first ? 30 : 10 + r() * 200, y: first ? 150 + (i % 2) * 190 : 60 + r() * 400, size: first ? 100 : 55 + r() * 60, ang: (r() - 0.5) * (first ? 0.14 : 0.6), t });
    });
  }

  drawChalk(t: number) {
    for (let d = 0; d < this.doors.length; d++) {
      const D = this.doors[d]!, c = D.cv.getContext('2d')!;
      const list = this.scrawls.filter((s) => s.door === d && t >= s.t);
      if (!list.length) { if (D.cv.dataset.n !== '0') { c.clearRect(0, 0, 640, 520); D.tex.needsUpdate = true; D.cv.dataset.n = '0'; } continue; }
      c.clearRect(0, 0, 640, 520);
      for (const s of list) this.scrawl(c, s, clamp((t - s.t) / 0.45));
      c.globalCompositeOperation = 'destination-out'; c.drawImage(this.grain, 0, 0); c.globalCompositeOperation = 'source-over';
      D.tex.needsUpdate = true; D.cv.dataset.n = String(list.length);
    }
  }
  /** One handwritten word: letters jitter in size and angle, the line drifts; revealed left to right. */
  scrawl(c: CanvasRenderingContext2D, s: Scrawl, p: number) {
    const r = mulberry32(Math.floor(s.t * 1000));
    c.save(); c.translate(s.x, s.y); c.rotate(s.ang);
    c.font = font(F.metro(700), s.size); c.textBaseline = 'alphabetic';
    let x = 0;
    const n = NAME.length, shown = Math.ceil(p * n);
    for (let i = 0; i < shown; i++) {
      const ch = NAME[i]!;
      const sz = s.size * (0.88 + r() * 0.3);
      c.save(); c.translate(x, (r() - 0.5) * s.size * 0.12 + i * s.size * 0.015); c.rotate((r() - 0.5) * 0.2);
      c.font = font(F.metro(700), sz);
      c.lineWidth = sz * 0.07; c.lineJoin = 'round';
      c.strokeStyle = 'rgba(240,238,228,0.92)'; c.strokeText(ch, 0, 0);
      c.fillStyle = 'rgba(240,238,228,0.18)'; c.fillText(ch, 0, 0);
      c.restore();
      x += c.measureText(ch).width * (sz / s.size) * 0.98 + s.size * 0.02;
    }
    if (p >= 1 && r() < 0.5) { c.strokeStyle = 'rgba(240,238,228,0.85)'; c.lineWidth = s.size * 0.05; c.beginPath(); c.moveTo(0, s.size * 0.18); c.lineTo(x * 0.95, s.size * 0.12 + x * 0.02); c.stroke(); }
    c.restore();
  }

  camZ(t: number) { const T = this.T; const z0 = 5.6, v = (z0 - STOP_Z) / (T.tease - 0.2 - T.s); return Math.max(STOP_Z, z0 - v * (t - T.s)) - 0.1 * smoothstep(T.tease - 0.2, T.tease + 0.5, t); }
  walking(t: number) { return 1 - smoothstep(this.T.tease - 0.6, this.T.tease, t); }

  catAt(t: number) {
    const T = this.T, z = this.camZ(t);
    const side = new THREE.Vector3(PORTRAIT ? 0.55 : 0.75, 0, z - (PORTRAIT ? 2.9 : 2.5));
    const feet = new THREE.Vector3(PORTRAIT ? -0.1 : 0.5, 0, STOP_Z - (PORTRAIT ? 1.7 : 1.9));
    const k0 = T.laugh - 0.2, k1 = k0 + 1.1;
    if (t < k0) {
      const w = this.walking(t);
      return { pos: side, heading: Math.PI / 2 + 0.05, dist: 5.6 - z, speed: 1.0 * w + 0.01, sit: smoothstep(T.tease, T.tease + 0.6, t) * 0.0, crouch: 0, look: null as THREE.Vector3 | null };
    }
    const from = new THREE.Vector3(PORTRAIT ? 0.55 : 0.75, 0, STOP_Z - 0.1 - (PORTRAIT ? 2.9 : 2.5));
    const u = ease.inOutQuad(clamp((t - k0) / (k1 - k0)));
    const p = from.clone().lerp(feet, u);
    const d = feet.clone().sub(from);
    const hd = u < 0.8 ? Math.atan2(-d.z, d.x) : lerp(Math.atan2(-d.z, d.x), Math.PI / 2 + 0.9, (u - 0.8) / 0.2);
    return { pos: p, heading: hd, dist: 10 + u * d.length(), speed: u > 0 && u < 1 ? 0.9 : 0, sit: smoothstep(k1, k1 + 0.4, t), crouch: 0.25 * u, look: t > k1 + 0.5 ? new THREE.Vector3(GX, 2.5, -12) : null };
  }

  pov(t: number): Pov {
    const T = this.T;
    if (PROOF === 'yard') return { p: [0.8, 1.5, 0.6], yaw: 0.45, pitch: 0.14, walk: 0 };
    if (PROOF === 'kids') return { p: [-3.2, 2.2, -9], yaw: this.yawTo([-3.2, 2.2, -9], [GX - 0.5, 3, -13]), pitch: 0.12, walk: 0, fov: PORTRAIT ? 60 : 44 };
    if (PROOF === 'kid') { const k = this.kids[1]!; const p: V3 = [k.pos.x - 2.4, GY + 1.3, k.pos.z - 1.2]; return { p, yaw: this.yawTo(p, [k.pos.x + 3, GY - 0.5, k.pos.z + 1.2]), pitch: -0.12, walk: 0, fov: PORTRAIT ? 68 : 34 }; }
    if (PROOF === 'poster') return { p: [POSTER[0] + 0.3, 1.4, POSTER[2] + 2.2], yaw: 0.1, pitch: 0.02, walk: 0, fov: PORTRAIT ? 55 : 40 };
    if (PROOF === 'chalk') return { p: [-5.5, 1.2, -9.3], yaw: this.yawTo([-5.5, 1.2, -9.3], [GX, 1.1, -9.3]) , pitch: 0, walk: 0, fov: PORTRAIT ? 64 : 50 };
    if (PROOF === 'play') return { p: [1.5, 1.3, -6], yaw: this.yawTo([1.5, 1.3, -6], [8, 1.5, -18]), pitch: 0.1, walk: 0 };
    const z = this.camZ(t);
    const E = ease.inOutCubic;
    const cam: V3 = [0.3, EYE, z];
    const toKids = this.yawTo(cam, [GX, 2.8, -12.2]);
    const toDoors = this.yawTo(cam, [GX, 1.2, PORTRAIT ? -12.2 : -14.0]);
    const P = PORTRAIT;
    const toPoster = this.yawTo(cam, POSTER);
    const yaw = keys(t, [[T.s, P ? 0.2 : 0.3], [T.they + 0.4, P ? 0.45 : 0.42, E], [T.they + 2.6, toPoster - (P ? 0.1 : 0.35), E], [T.they + 6.0, toPoster - (P ? 0.25 : 0.45), E], [T.they + 7.5, P ? 0.2 : 0.15, E], [T.tease - 0.4, P ? 0.35 : 0.3, E], [T.tease + 0.8, toKids + (P ? 0 : -0.1), E], [T.call - 0.9, toKids + (P ? 0 : -0.05), E], [T.call + 0.15, toDoors + (P ? -0.05 : -0.15), E], [T.name + 1.4, toDoors + (P ? 0.05 : -0.1), E], [T.name + 2.0, P ? 0.1 : -0.3, E], [T.end, P ? 0.08 : -0.33, E]]);
    const pitch = keys(t, [[T.s, 0.1], [T.they + 0.4, 0.2, E], [T.they + 5.2, 0.02, E], [T.tease - 0.4, 0.05, E], [T.tease + 0.8, 0.2, E], [T.call - 0.9, 0.16, E], [T.call + 0.15, -0.04, E], [T.name + 1.4, -0.04, E], [T.name + 2.0, P ? -0.42 : -0.36, E], [T.end, P ? -0.44 : -0.38, E]]);
    return { p: cam, yaw, pitch, walk: this.walking(t) };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    this.fogE.color.setRGB(0.02, 0.024, 0.032);
    this.swing.rotation.z = Math.sin(t * 1.6) * 0.28;
    const c = this.catAt(t);
    const camP = new THREE.Vector3(0.3, EYE, this.camZ(t));
    this.cat.pose({ pos: c.pos, heading: c.heading, dist: c.dist, speed: c.speed, t, sit: c.sit, crouch: c.crouch, look: c.look, lookK: c.look ? 0.7 : 0, tailUp: c.sit > 0.5 ? 0.2 : 0.6, tailWag: 0.04, earBack: smoothstep(T.laugh - 0.3, T.laugh + 0.3, t) * 0.9 });
    // the kids: heads follow the child, phones up, laughing on «laugh», one points
    const laugh = smoothstep(T.laugh - 0.2, T.laugh + 0.1, t) * (1 - smoothstep(T.call + 1.5, T.call + 3.0, t)) + 0.4 * smoothstep(T.name, T.name + 0.5, t);
    for (const k of this.kids) {
      const d = camP.clone().sub(k.pos);
      const face = Math.atan2(-d.z, d.x);
      const lookUp = smoothstep(k.lit - 0.6, k.lit, t);
      const film = smoothstep(k.rec - 0.8, k.rec, t);
      const heading = face + (1 - lookUp) * 0.6 * (k.seed % 2 ? 1 : -1);
      k.f.pose({ pos: k.pos, heading, t, sit: k.sit, phone: lookUp * (1 - film), film, bob: laugh * (0.6 + 0.4 * hash(k.seed, 3)), armL: k.point ? smoothstep(T.laugh, T.laugh + 0.5, t) * (1 - smoothstep(T.call + 2, T.call + 3, t)) : 0, headDown: 0.1 * (1 - film), look: 0 });
      const h = k.f.handR();
      k.phone.position.copy(h); k.phone.lookAt(camP); k.phone.rotateY(Math.PI);
      const scr = t >= k.lit ? 1 : 0;
      (k.phone.material as THREE.MeshBasicMaterial).color.setRGB(0.5 * scr + 0.02, 0.65 * scr + 0.02, 0.85 * scr + 0.02, THREE.LinearSRGBColorSpace);
      const tk = smoothstep(k.torch, k.torch + 0.12, t) * (1 - 0.6 * smoothstep(T.name + 2.2, T.name + 3.5, t));
      k.glow.position.copy(h).add(new THREE.Vector3(0.12, 0.05, 0)); k.L.position.copy(h); k.L.target.position.copy(camP).add(new THREE.Vector3(0, -0.4, 0)); k.L.target.updateMatrixWorld();
      k.L.intensity = 16 * tk; k.glow.intensity = 0.5 * (t >= k.lit ? 1 : 0) + 1.5 * tk;
      (k as unknown as { tk: number }).tk = tk;
    }
    this.drawChalk(t);
    const P = this.pov(t);
    this.setCam(P, t, this.walking(t));
    const cam = this.cam;
    const aimEnd = t > T.name + 1.6;
    const aim = aimEnd ? c.pos.clone().add(new THREE.Vector3(0, 0.15, 0)) : new THREE.Vector3(0.2, 0.3, cam.position.z - 6).lerp(new THREE.Vector3(GX + 0.5, 1.2, -10.5), smoothstep(T.call, T.call + 1.0, t) * (1 - smoothstep(T.name + 1.2, T.name + 2.2, t)));
    const pose = this.torch(t, { raise: 1, on: PROOF ? 0 : 1, walk: this.walking(t), aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : 0.85, spot: clamp(20 * (aim.distanceTo(cam.position) / 5) ** 2, 3, 30) });
    const tdir = pose ? pose.target.clone().sub(pose.head).normalize() : null;
    this.cat.setShine(pose ? 0.02 + this.cat.shine(pose.head, tdir, 0.95) : 0.02, 2);
    // ---- world
    this.renderWorld(out, t, { sky: { top: [0.008, 0.01, 0.018], horizon: scaleRGB(LIN.smog, 0.12), low: scaleRGB(LIN.shadow, 0.8), horizonY: 0.52, haze: 1 } });
    const g = this.glow3D;
    g.add(this.lampP[0], this.lampP[1], this.lampP[2], 0.45, 0.35, LIN.sodium, 2.2, 4);
    g.add(this.bulbP[0], this.bulbP[1], this.bulbP[2], 0.18, 0.18, [1.0, 0.8, 0.5], 1.5, 4);
    for (const z of [-4, -20, -36]) g.add(23.3, 2.9, z, 0.3, 0.3, lin('#ffb85c'), 1.2, 4);
    for (const k of this.kids) {
      const h = k.phone.position;
      if (t >= k.lit) g.add(h.x, h.y, h.z, 0.12, 0.12, [0.5, 0.65, 0.9], 0.6, 3);
      // the REC dot: on the phone's back, facing the child, blinking
      if (t >= k.rec && Math.floor((t - k.rec) * 2) % 2 === 0) g.add(h.x + 0.02, h.y + 0.06, h.z, 0.05, 0.05, [1.0, 0.05, 0.03], 3.0, 3);
      const tk = (k as unknown as { tk: number }).tk ?? 0;
      if (tk > 0) g.add(h.x, h.y, h.z, 0.14, 0.14, [0.9, 0.95, 1.0], 2.0 * tk, 3);
    }
    this.flushGlow(out);
    this.beam(out, t, pose, PROOF ? 0 : 1, { density: 0.02, maxDist: clamp(aim.distanceTo(cam.position) - 0.5, 0.8, 8) });
    // the phones' beams in the haze (the light that pins the child)
    for (const k of this.kids) {
      const tk = (k as unknown as { tk: number }).tk ?? 0;
      if (tk <= 0.02 || PROOF) continue;
      this.cone.render(renderer, out, cam, makeLamp(k.L.position.clone(), k.L.target.position.clone(), 9, 14, 0.5 * tk), t, { density: 0.02, floorY: 0, maxDist: 12, pool: 0 });
    }
    // ---- QA text
    this.logPlane(this.poster, this.posterText, 'garble', { frac: [0.05, 0.02, 0.95, 0.24], minPx: 10, id: 'scenery:tease-poster', scenery: true });
    for (let d = 0; d < this.doors.length; d++) {
      const first = this.scrawls.findIndex((s) => s.door === d);
      if (first >= 0 && first < 4 && t >= this.scrawls[first]!.t + 0.45) {
        const s = this.scrawls[first]!;
        const many = this.scrawls.filter((q) => q.door === d && t >= q.t).length;
        this.logPlane(this.doors[d]!.mesh, NAME, 'sign', { frac: [s.x / 640, (s.y - s.size * 0.8) / 520, Math.min(1, (s.x + s.size * 5.6) / 640), (s.y + s.size * 0.2) / 520], minPx: 14, id: many > 3 ? `scenery:tease-chalk-${d}` : `sign:tease-chalk-${d}`, scenery: many > 3 });
      }
    }
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    // the glare of the phone torches aimed at the child
    for (const k of this.kids) {
      const tk = (k as unknown as { tk: number }).tk ?? 0;
      if (tk <= 0.02 || PROOF) continue;
      const q = this.onScreen(k.phone.position.x, k.phone.position.y, k.phone.position.z, -50);
      if (q) this.glow2D.add(q.x, q.y, 0, 34, 34, [0.9, 0.95, 1.0], 0.35 * tk, 2);
    }
    const light: Light = { amb: 0.18 + 0.12 * smoothstep(T.tease, T.tease + 1, t), warm: 0.15, torch: 1 };
    if (!PROOF) {
      this.torchHand(u, pose, light);
      this.heading(u, t, f);
      this.callout(u, t, homeLabel('tease'), T.s + 0.1, T.s + 2.0, () => this.onScreen(-14, 18, -46), { places: [city().home.name] });
      this.callout(u, t, 'НЕДЕЛЯ ДОБРОТЫ', T.they + 3.4, T.they + 6.2, () => this.onScreen(POSTER[0] + 0.45, POSTER[1] + 0.5, POSTER[2]));
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.55 };
  }
}
void H; void W; void mixRGB; void cyl; void lerp;
