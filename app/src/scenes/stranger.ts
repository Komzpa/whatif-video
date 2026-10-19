// `stranger` — «ПРИСТАЁТ НЕЗНАКОМЫЙ ЧЕЛОВЕК» (TREATMENT p.11·: being followed; cameras on every corner turn to
// watch and not one does anything, «incident not detected»; the child runs to the one lit window). City stop: a
// long street near home along a tall concrete ПО-2 wall (familiar ground: the kiosk's sign reads plainly).
// First person:
//   (a) start        walking along the wall; a man's shadow, huge, slides onto the wall ahead: behind the child a
//                    car stands with its headlights on.
//   (b) «A stranger» the child looks back over the shoulder: a man in a long coat and a hat, black against the
//                    headlights (callout: the distance, «N м»). The CCTV camera on the lamp post turns to watch.
//   (c) «won't leave» a second look back: he is closer, one arm lifted, calling. The next camera turns too:
//                    ИНЦИДЕНТ НЕ ОБНАРУЖЕН.
//   (d) «alone»      the child runs, the torch bouncing, towards the one lit window in the street: a night kiosk,
//                    the seller inside looks up from the phone. ДОМ · 1,0 км.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, smoothstep, keys, mulberry32, hash, prog } from '../engine/util';
import { F, font } from '../engine/type';
import { garble, homeLabel, city } from '../city';
import { drawOpenHand, pxAt, type Light } from './_hands';
import {
  LitScene, lit, canvasTex, speckle, blotches, asphalt, boxMesh, cyl, ground, concreteTex, streetLight,
  panelBlock, WindowPanes, POST_BASE, LIN, scaleRGB, EYE, project, type Pov, type V3,
} from './_kit';
import { Figure, STRANGER } from './_people';
import { makeLamp } from './_motifs';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const WALL_X = 1.7; // the wall's street face
const WALL_H = 3.2;
const PATH_X = -0.35; // the child's line on the pavement
const CAR: V3 = [-5.1, 0, 38]; // the parked car far behind (centre), facing -z: its lights throw the man's shadow onto the wall
const HEAD_L: V3 = [CAR[0] - 0.62, 0.72, CAR[2] - 2.08], HEAD_R: V3 = [CAR[0] + 0.62, 0.72, CAR[2] - 2.08];
const S_X = -0.95; // the stranger's line
const MAN_Z0 = 12.5; // where he stands at the start
const KZ = -22.6; // the kiosk's window plane (z); the kiosk stands across the end of the pavement, window facing +z
const KX = 0.9; // the kiosk's centre (x)
const STOP: V3 = [KX - 0.1, 0, KZ + 2.0]; // where the child stops, facing the window
const POLE_A: V3 = [-2.15, 4.3, 7.5], POLE_B: V3 = [-2.15, 4.3, -17.5]; // CCTV on the lamp posts
const WALL_CAM: V3 = [WALL_X - 0.05, WALL_H + 0.25, -6.5];

interface Cctv { g: THREE.Group; head: THREE.Group; p: THREE.Vector3; wake: number; idle: THREE.Vector3; lens: THREE.Vector3 }

export default class Stranger extends LitScene {
  chapter = 'stranger';
  man!: Figure;
  seller!: Figure;
  phone!: THREE.Mesh;
  cams: Cctv[] = [];
  headL: THREE.SpotLight[] = [];
  lamps: V3[] = [];
  deadLamp: V3 = [0, 0, 0];
  signText = '';
  sign!: THREE.Mesh;
  glass!: THREE.Mesh;
  panes!: WindowPanes;
  zs: number[] = []; // the child's z every 10 ms from T.s
  dist1 = 12; dist2 = 8;

  override init() {
    this.initLit();
    this.hemi.intensity = 0.1;
    this.fogE.density = 0.02;
    const s = this.ctx.start;
    const words = this.ly.linesIn(s, s + 13).flatMap((l) => l.words);
    const w1 = (re: RegExp) => words.find((q) => re.test(q.w))!.start;
    const T: Record<string, number> = { s };
    T.stranger = w1(/^stranger/); T.wont = w1(/^won/); T.leave = w1(/^leave/); T.alone = w1(/^alone/);
    T.end = this.ctx.end;
    T.go = T.stranger + 0.15; // the man starts walking
    T.back1 = T.stranger - 0.2; T.fwd1 = T.back1 + 2.25; // the first look back (turn in 0.4 s, hold, turn back)
    T.back2 = T.wont - 0.05; T.fwd2 = T.back2 + 2.05;
    T.run = T.alone + 0.05;
    this.T = T;
    this.signText = 'ПРОДУКТЫ';
    this.integrate();
    T.arrive = STOP_T(this); T.turn = T.arrive + 0.3; // he gives up and walks back to his car
    T.glance = Math.max(T.arrive + 0.5, T.end - 1.45); // the last look back: he is walking away
    // shots: the first look back in first person (12 м); ahead of the child looking back up the street, both it and
    // the man black against the headlights, the second look back; the CCTV's own view from the pole as the child
    // passes under it (ИНЦИДЕНТ НЕ ОБНАРУЖЕН pinned to the child) and starts to run; low behind the running child to
    // the lit kiosk; the hand on the counter in first person; from above the kiosk as the man walks back to his car
    const cz = (t: number) => this.camZ(t);
    this.shots = [
      [T.fwd1, T.fwd2, { k: 'free', p: [-2.3, 1.45, cz(T.fwd2) - 6.2], p1: [-2.2, 1.4, cz(T.fwd2) - 5.6], look: [S_X + 0.6, 1.25, cz(T.fwd1) + 8], look1: [S_X + 0.6, 1.25, cz(T.fwd2) + 7], fov: PORTRAIT ? 70 : 50 }],
      [T.fwd2, T.run + 1.0, { k: 'free', p: [POLE_B[0] + 0.15, POLE_B[1] + 0.2, POLE_B[2] + 0.35], look: [PATH_X, 0.4, cz(T.fwd2) - 0.5], look1: [PATH_X, 0.4, cz(T.run + 0.8) - 1.5], fov: PORTRAIT ? 72 : 54 }],
      [T.run + 1.0, T.arrive - 0.2, { k: 'back', d: 1.6, h: 1.8, side: -0.8, ahead: 1, aimY: PORTRAIT ? -1.25 : 0.3, fov: PORTRAIT ? 76 : 58 }],
      [T.glance + 0.4, T.end + 1, { k: 'free', p: [PORTRAIT ? 1.5 : 2.3, 2.9, KZ + 0.3], p1: [PORTRAIT ? 1.55 : 2.35, 3.0, KZ + 0.1], look: [PORTRAIT ? 0.9 : 1.0, 0.0, KZ + (PORTRAIT ? 7.4 : 5.2)], fov: PORTRAIT ? 80 : 62 }], // portrait: tilted up a little so the stranger walking away stays under the chapter line (A15)
    ];
    this.initKid(23);
    this.build();
    this.buildCar();
    this.buildKiosk();
    this.buildCams();
    this.man = new Figure(this.three, STRANGER, 72);
    this.seller = new Figure(this.three, { height: 1.66, coat: [0.32, 0.16, 0.12], trousers: [0.1, 0.08, 0.08], hair: [0.12, 0.07, 0.04], beanie: [0.55, 0.52, 0.48], bulk: 1.15, seed: 12 }, 56);
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.5, 0.65, 0.85, THREE.LinearSRGBColorSpace) }));
    this.three.add(this.phone);
    this.obstacles = () => [this.planeBox(this.sign), this.planeBox(this.glass)].filter((b): b is NonNullable<typeof b> => !!b);
    this.signBoxes = () => [this.planeBox(this.sign)].filter((b): b is NonNullable<typeof b> => !!b); // the kiosk glass carries no lettering
    this.dist1 = Math.round(this.gap(T.back1 + 0.45));
    this.dist2 = Math.round(this.gap(T.back2 + 0.45));
  }

  // ---- the child's path: walks, then runs on «alone» and stops at the kiosk window
  integrate() {
    const T = this.T;
    let z = 0, v = 1.05;
    for (let t = T.s; t <= T.end + 0.02; t += 0.01) {
      this.zs.push(z);
      let want = t < T.run ? 1.05 : Math.min(4.3, 1.05 + (t - T.run) * 7);
      const d = z - STOP[2];
      want = Math.min(want, Math.sqrt(Math.max(0, 2 * 3.2 * d)));
      v = lerp(v, want, 0.2);
      z = Math.max(STOP[2], z - v * 0.01);
    }
  }
  camZ(t: number) { const i = clamp((t - this.T.s) / 0.01, 0, this.zs.length - 1); const a = Math.floor(i), b = Math.min(a + 1, this.zs.length - 1); return lerp(this.zs[a]!, this.zs[b]!, i - a); }
  speed(t: number) { return (this.camZ(t - 0.05) - this.camZ(t + 0.05)) / 0.1; }
  camX(t: number) { return lerp(PATH_X, STOP[0], smoothstep(STOP[2] + 9, STOP[2], this.camZ(t))); }
  running(t: number) { return smoothstep(1.6, 3.2, this.speed(t)); }
  /** The man: stands by the car, then walks after the child; stops when the child runs. */
  /** r9 note 4: the man and the kiosk seller, for keeping text off them. */
  override subjectsAt(t: number) { return [{ p: [S_X, 0, this.manZ(t)] as V3, h: 1.9, r: 0.35 }, { p: [KX + 0.35, 0, KZ - 1.55] as V3, h: 1.7, r: 0.35 }]; }
  manZ(t: number) {
    const T = this.T, v = 2.3, z0 = MAN_Z0;
    const tStop = T.run + 0.9;
    if (t < T.go) return z0;
    if (t < tStop) return z0 - v * (t - T.go) * smoothstep(T.go, T.go + 0.5, t) ** 0.3;
    const zs = z0 - v * (tStop - T.go) - v * 0.6 * (1 - Math.exp(-(t - tStop) / 0.6));
    return zs + 1.6 * Math.max(0, t - T.turn - 0.5);
  }
  gap(t: number) { return this.manZ(t) - this.camZ(t); }

  build() {
    const S = this.three;
    const { map, rough } = asphalt(171, [4, 40], { puddles: 14, base: '#1e2023' });
    ground(S, 14, 200, -9.2, -20, lit([0.6, 0.6, 0.6], { map, roughMap: rough, rough: 0.3 }));
    const pav = concreteTex(172, [2, 50], { base: '#4e4d48', joints: [2, 1], stains: 50 });
    ground(S, 4.0, 200, -0.3, -20, lit([0.6, 0.6, 0.6], { map: pav, rough: 0.7 }), 0.02);
    boxMesh(S, 0.25, 0.15, 200, -2.25, 0.075, -20, lit([0.42, 0.42, 0.4], { map: concreteTex(173, [50, 1]), rough: 0.85 }));
    // the ПО-2 wall: concrete slabs with the diamond relief, two rows, a coping; stains and a dead poster
    const slab = canvasTex(512, 430, (c) => {
      c.fillStyle = '#6c6a64'; c.fillRect(0, 0, 512, 430);
      speckle(c, 512, 430, 9000, 0.25, 174);
      const nx = 6, ny = 5, dw = 512 / nx, dh = 430 / ny;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const cx = (i + 0.5) * dw, cy = (j + 0.5) * dh, rx = dw * 0.44, ry = dh * 0.44;
        const tri = (a: [number, number], b: [number, number], col: string) => { c.fillStyle = col; c.beginPath(); c.moveTo(cx, cy); c.lineTo(...a); c.lineTo(...b); c.closePath(); c.fill(); };
        tri([cx, cy - ry], [cx - rx, cy], 'rgba(255,255,255,0.13)');
        tri([cx, cy - ry], [cx + rx, cy], 'rgba(255,255,255,0.05)');
        tri([cx - rx, cy], [cx, cy + ry], 'rgba(0,0,0,0.14)');
        tri([cx + rx, cy], [cx, cy + ry], 'rgba(0,0,0,0.26)');
      }
      blotches(c, 512, 430, 22, (i) => (i % 3 ? 'rgba(30,28,24,0.25)' : 'rgba(90,80,60,0.14)'), 20, 120, 175);
      const r = mulberry32(176);
      for (let i = 0; i < 30; i++) { const x = r() * 512, len = 60 + r() * 260; const g = c.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(20,18,15,0.35)'); g.addColorStop(1, 'rgba(20,18,15,0)'); c.fillStyle = g; c.fillRect(x, 0, 2 + r() * 4, len); }
      c.strokeStyle = 'rgba(15,15,15,0.7)'; c.lineWidth = 4; c.strokeRect(0, 0, 512, 430);
    }, { repeat: [50 / 2.5, 2] });
    const wallM = lit([0.62, 0.62, 0.62], { map: slab, rough: 0.9 });
    boxMesh(S, 0.2, WALL_H, 50, WALL_X + 0.1, WALL_H / 2, 8, wallM);
    boxMesh(S, 0.34, 0.1, 50, WALL_X + 0.12, WALL_H + 0.05, 8, lit([0.4, 0.4, 0.38], { rough: 0.9 }));
    for (let z = 33; z > -17.5; z -= 2.5) boxMesh(S, 0.34, WALL_H + 0.05, 0.22, WALL_X + 0.2, WALL_H / 2, z, wallM, { cast: false });
    // past the wall: a lawn, the kiosk's corner; beyond the wall and across the road: dark panel blocks
    ground(S, 12, 40, 7, -42, lit([0.09, 0.1, 0.07], { map: concreteTex(177, [6, 20], { base: '#23261c', stains: 60 }), rough: 1 }), 0.01);
    const wins = panelBlock(S, { cx: 30, cz: -6, len: 70, floors: 9, ang: Math.PI / 2, seed: 178, litRate: 0.03 });
    wins.push(...panelBlock(S, { cx: -32, cz: -14, len: 80, floors: 12, ang: -Math.PI / 2, seed: 179, litRate: 0.03 }));
    wins.push(...panelBlock(S, { cx: 4, cz: -70, len: 44, floors: 9, ang: 0.2, seed: 180, litRate: 0.03 }));
    this.panes = new WindowPanes(S, wins);
    // streetlights on the kerb: the one behind (with the first camera), a dead one, one past the kiosk (second camera)
    for (const z of [34, POLE_A[2], -5, POLE_B[2]]) {
      const hp = streetLight(S, -2.6, z, { h: 7.5, arm: [1.6, 0, 0] });
      if (z === -5) { this.deadLamp = hp; continue; }
      this.lamps.push(hp); this.addLamp(hp, { k: z === POLE_B[2] ? 38 : 16, angle: 0.8, target: [hp[0] - 1.2, 0, hp[2]] });
    }
  }

  buildCar() {
    const S = this.three;
    const g = new THREE.Group(); g.position.set(CAR[0], 0, CAR[2]); S.add(g);
    const paint = lit([0.12, 0.13, 0.12], { rough: 0.35, metal: 0.5 });
    boxMesh(g, 1.6, 0.62, 4.1, 0, 0.62, 0, paint);
    boxMesh(g, 1.5, 0.55, 2.0, 0, 1.2, 0.35, paint);
    const glass = lit([0.02, 0.02, 0.025], { rough: 0.05, metal: 0.8 });
    boxMesh(g, 1.52, 0.42, 1.2, 0, 1.2, 0.35, glass, { cast: false });
    boxMesh(g, 1.46, 0.46, 0.05, 0, 1.18, -0.63, glass, { cast: false, rx: -0.5 });
    const tyre = lit([0.03, 0.03, 0.03], { rough: 0.8 });
    for (const z of [-1.3, 1.3]) for (const x of [-0.75, 0.75]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), tyre); w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); g.add(w); }
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3, 2.9, 2.6, THREE.LinearSRGBColorSpace), toneMapped: false });
    for (const x of [-0.62, 0.62]) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), lampM); m.position.set(x, 0.72, -2.06); m.rotation.y = Math.PI; g.add(m); }
    // the headlights: two spotlights down the pavement; the right one casts the man's shadow onto the wall
    for (const [i, h] of [HEAD_L, HEAD_R].entries()) {
      const L = new THREE.SpotLight(new THREE.Color().setRGB(1, 0.95, 0.82, THREE.LinearSRGBColorSpace), 0, 54, 0.22, 0.45, 0);
      L.position.set(...h); L.target.position.set(WALL_X, 0.9, -2);
      if (i === 1) { L.castShadow = true; L.shadow.mapSize.set(2048, 2048); L.shadow.bias = -0.0004; L.shadow.normalBias = 0.02; L.shadow.camera.near = 0.3; L.shadow.camera.far = 90; }
      S.add(L, L.target); this.headL.push(L);
    }
  }

  buildKiosk() {
    const S = this.three;
    const g = new THREE.Group(); g.position.set(KX, 0, KZ - 1.2); g.rotation.y = Math.PI / 2; S.add(g);
    const skin = lit([0.3, 0.33, 0.3], { map: concreteTex(181, [2, 1], { base: '#5f6b62', stains: 30 }), rough: 0.6, metal: 0.2 });
    const Wd = 2.4, D = 3.2, Hh = 2.6, fx = -Wd / 2; // the front face at local x = -1.2
    boxMesh(g, Wd, 0.95, D, 0, 0.475, 0, skin);
    boxMesh(g, 0.08, Hh - 0.95, D, Wd / 2 - 0.04, 0.95 + (Hh - 0.95) / 2, 0, skin); // back wall
    for (const z of [-D / 2 + 0.04, D / 2 - 0.04]) boxMesh(g, Wd, Hh - 0.95, 0.08, 0, 0.95 + (Hh - 0.95) / 2, z, skin);
    boxMesh(g, 0.1, 0.35, D, fx + 0.05, Hh - 0.175, 0, skin); // above the window
    boxMesh(g, Wd + 0.4, 0.1, D + 0.4, 0, Hh + 0.05, 0, lit([0.2, 0.2, 0.2], { rough: 0.7 }));
    boxMesh(g, 0.35, 0.05, D - 0.2, fx - 0.15, 0.97, 0, lit([0.5, 0.48, 0.42], { rough: 0.5 })); // the counter ledge
    // inside: shelves of goods painted on the back, a counter, a hanging bulb
    const shelves = canvasTex(512, 256, (c) => {
      c.fillStyle = '#6a5436'; c.fillRect(0, 0, 512, 256);
      const r = mulberry32(182);
      for (let row = 0; row < 4; row++) {
        const y = 20 + row * 60;
        c.fillStyle = '#3a2c1c'; c.fillRect(0, y + 44, 512, 6);
        for (let x = 6; x < 506;) {
          const w = 10 + r() * 22, h = 20 + r() * 24, hue = [['#b8322a', '#e0c070'], ['#2f6a3a', '#dcd4b0'], ['#d8a030', '#6a3020'], ['#3a5aa0', '#e8e0d0'], ['#8a8078', '#302820']][Math.floor(r() * 5)]!;
          c.fillStyle = hue[0]!; if (r() < 0.4) { c.fillRect(x, y + 44 - h, w * 0.6, h); c.fillRect(x + w * 0.15, y + 44 - h - 8, w * 0.3, 8); } else c.fillRect(x, y + 44 - h, w, h);
          c.fillStyle = hue[1]!; c.fillRect(x + 2, y + 44 - h * 0.6, Math.max(2, w * 0.6 - 4), h * 0.25);
          x += w + 2 + r() * 3;
        }
      }
      blotches(c, 512, 256, 10, () => 'rgba(20,10,0,0.18)', 30, 100, 183);
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.2, 1.5), lit([1, 1, 1], { map: shelves, rough: 0.8 }));
    back.position.set(Wd / 2 - 0.1, 1.72, 0); back.rotation.y = -Math.PI / 2; g.add(back);
    boxMesh(g, 0.5, 0.1, D - 0.3, fx + 0.35, 0.98, 0, lit([0.35, 0.3, 0.25], { rough: 0.6 }));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.16, Hh - 1.3), new THREE.MeshStandardMaterial({ color: 0xc8d8d0, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.12, depthWrite: false }));
    glass.position.set(fx - 0.01, 0.95 + (Hh - 1.3) / 2, 0); glass.rotation.y = -Math.PI / 2; g.add(glass); this.glass = glass;
    const bulb = new THREE.PointLight(new THREE.Color().setRGB(1, 0.72, 0.4, THREE.LinearSRGBColorSpace), 5, 7, 2); bulb.position.set(0.1, 2.05, 0.3); g.add(bulb);
    const spill = new THREE.SpotLight(new THREE.Color().setRGB(1, 0.72, 0.42, THREE.LinearSRGBColorSpace), 26, 12, 0.9, 0.8, 2);
    spill.position.set(0.4, 2.2, 0); spill.target.position.set(-3, 0, 0); g.add(spill, spill.target);
    // the light-box sign on the roof, facing the street
    const sc = document.createElement('canvas'); sc.width = 768; sc.height = 128;
    const s2 = sc.getContext('2d')!;
    s2.fillStyle = '#f2ead6'; s2.fillRect(0, 0, 768, 128);
    s2.fillStyle = '#b3261e'; s2.font = font(F.metro(900), 84); s2.textAlign = 'center'; s2.textBaseline = 'middle'; s2.fillText(this.signText, 384, 70);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; st.anisotropy = 8;
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.48), new THREE.MeshBasicMaterial({ map: st, toneMapped: false, fog: true, color: new THREE.Color().setScalar(0.85) }));
    this.sign.position.set(fx - 0.22, Hh + 0.38, 0); this.sign.rotation.y = -Math.PI / 2; g.add(this.sign);
    boxMesh(g, 0.2, 0.56, 3.0, fx - 0.1, Hh + 0.38, 0, lit([0.15, 0.15, 0.15], { rough: 0.6 }));
  }

  buildCams() {
    const S = this.three;
    const body = lit([0.72, 0.72, 0.7], { rough: 0.45, metal: 0.2 });
    const dark = lit([0.04, 0.04, 0.05], { rough: 0.3, metal: 0.5 });
    const mk = (p: V3, wake: number, idle: V3, bracket: V3) => {
      const g = new THREE.Group(); g.position.set(...p); S.add(g);
      cyl(g, [0, 0.06, 0], bracket, 0.03, body, { seg: 8 });
      boxMesh(g, 0.06, 0.1, 0.1, bracket[0], bracket[1], bracket[2], body);
      const head = new THREE.Group(); g.add(head);
      boxMesh(head, 0.16, 0.15, 0.42, 0, 0, 0.08, body);
      boxMesh(head, 0.22, 0.02, 0.5, 0, 0.09, 0.1, body); // sun visor
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), dark); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, 0.3); head.add(lens);
      this.cams.push({ g, head, p: new THREE.Vector3(...p), wake, idle: new THREE.Vector3(...idle), lens: new THREE.Vector3() });
    };
    const T = this.T;
    mk(POLE_A, T.back1 + 0.3, [POLE_A[0] + 3, 0, POLE_A[2] + 6], [-0.34, 0.12, 0]);
    mk(WALL_CAM, T.fwd1 + 0.5, [WALL_X - 4, 0, WALL_CAM[2] - 4], [0.2, -0.2, 0]);
    mk(POLE_B, T.fwd2 + 0.1, [POLE_B[0] + 4, 0, POLE_B[2] - 6], [-0.34, 0.12, 0]);
  }

  /** Where the camera heads look: idle, then (after `wake`) at the child with a servo's lag. */
  poseCams(t: number) {
    for (const c of this.cams) {
      const tt = t - 0.35;
      const child = new THREE.Vector3(this.camX(tt), 1.0, this.camZ(tt));
      const k = smoothstep(c.wake, c.wake + 0.7, t);
      const aim = c.idle.clone().lerp(child, k);
      c.head.lookAt(aim);
      c.head.updateMatrixWorld();
      c.lens.set(0, 0, 0.33).applyMatrix4(c.head.matrixWorld);
    }
  }

  pov(t: number): Pov {
    const T = this.T, P = PORTRAIT, E = ease.inOutCubic;
    if (PROOF === 'street') return { p: [-6.5, 2.4, 9], yaw: this.yawTo([-6.5, 2.4, 9], [0.6, 1.5, -4]), pitch: -0.05, walk: 0, fov: P ? 70 : 52 };
    if (PROOF === 'car') { const p: V3 = [CAR[0] + 2.2, 1.2, CAR[2] - 5]; return { p, yaw: this.yawTo(p, [CAR[0], 0.8, CAR[2]]), pitch: -0.05, walk: 0, fov: P ? 64 : 46 }; }
    if (PROOF === 'man') { const z = this.manZ(t); const p: V3 = [S_X + 2.2, 1.3, z - 3.2]; return { p, yaw: this.yawTo(p, [S_X, 1.2, z]), pitch: -0.02, walk: 0, fov: P ? 60 : 40 }; }
    if (PROOF === 'cctv') { const c = this.cams[2]!.p; const p: V3 = [c.x + 1.4, c.y - 0.4, c.z - 1.3]; return { p, yaw: this.yawTo(p, [c.x, c.y, c.z]), pitch: 0.2, walk: 0, fov: P ? 50 : 36 }; }
    if (PROOF === 'kiosk') { const p: V3 = [-2.6, 1.5, KZ + 4.5]; return { p, yaw: this.yawTo(p, [KX, 1.5, KZ - 0.5]), pitch: 0.04, walk: 0, fov: P ? 66 : 50 }; }
    const cam: V3 = [this.camX(t), EYE, this.camZ(t)];
    const man: V3 = [S_X, 1.35, this.manZ(t)];
    const toMan = this.yawTo(cam, man); // ~ +pi (behind)
    // r9 note 3: each look back is a cut to it and a cut away, both on beats (a 180° turn in 0.4 s was a whip)
    const back = (a: number, b: number) => (t >= this.onBeat(a + 0.2) && t < this.onBeat(b + 0.2) ? 1 : 0);
    const k1 = back(T.back1, T.fwd1), k2 = back(T.back2, T.fwd2);
    const fwdYaw = keys(t, [[T.s, P ? -0.28 : -0.34], [T.back1, P ? -0.2 : -0.26, E], [T.back2, P ? 0.0 : -0.06, E], [T.fwd2 + 0.5, P ? 0.02 : -0.02, E], [T.run + 1.5, 0.02, E], [STOP_T(this), 0.0, E]]);
    const toWin = this.yawTo(cam, [KX, 1.4, KZ - 1]);
    const kWin = smoothstep(STOP[2] + 5, STOP[2] + 0.2, this.camZ(t));
    let backYaw = toMan + (P ? 0.16 : 0.3) * (toMan > 0 ? -1 : 1); // the wall's side stays in frame
    if (backYaw < 0) backYaw += Math.PI * 2;
    let yaw = fwdYaw + (backYaw - fwdYaw) * Math.max(k1, k2);
    yaw = lerp(yaw, toWin + (P ? 0 : 0.04), kWin);
    const fwdPitch = keys(t, [[T.s, P ? 0.06 : 0.05], [T.fwd2, P ? 0.1 : 0.08, E], [T.fwd2 + 2.4, P ? 0.08 : 0.06, E], [T.run + 0.6, -0.04, E]]);
    let pitch = lerp(fwdPitch, P ? -0.2 : 0.0, Math.max(k1, k2));
    pitch = lerp(pitch, P ? -0.06 : 0.1, kWin);
    const k3 = t >= this.onBeat(T.glance + 0.25) ? 1 : 0;
    yaw = lerp(yaw, backYaw, k3); pitch = lerp(pitch, P ? -0.16 : 0.0, k3);
    const run = this.running(t);
    return { p: cam, yaw, pitch, walk: 1 - smoothstep(STOP[2] + 1.2, STOP[2] + 0.1, this.camZ(t)), fov: (P ? 74 : 56) + run * 4 - Math.max(k1, k2) * (P ? 12 : 10) * (1 - kWin), roll: run * Math.sin(t * 9.5) * 0.02 };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    this.fogE.color.setRGB(0.02, 0.022, 0.03);
    // the man: stands by the car with the lights on, walks after the child, one arm lifted on the second look
    const mz = this.manZ(t), mv = (this.manZ(t - 0.05) - this.manZ(t + 0.05)) / 0.1;
    const armUp = smoothstep(T.back2 + 0.2, T.back2 + 0.7, t) * (1 - smoothstep(T.fwd2 + 0.6, T.fwd2 + 1.2, t));
    const turnK = ease.inOutCubic(prog(t, T.turn, T.turn + 0.7));
    this.man.pose({ pos: new THREE.Vector3(S_X, 0, mz), heading: Math.PI / 2 + 0.04 + turnK * Math.PI, t, steps: this.steps(t), speed: Math.abs(mv), armL: armUp * 0.8, look: 0, headDown: 0.05 });
    // the kiosk woman: on her phone; as the child arrives she looks up and leans to the window
    const arr = smoothstep(STOP[2] + 3.5, STOP[2] + 0.3, this.camZ(t));
    const camNow = new THREE.Vector3(this.camX(t), EYE, this.camZ(t));
    this.seller.pose({ pos: new THREE.Vector3(KX + 0.35, 0, KZ - 1.55), heading: -Math.PI / 2 + 0.15, t, phone: 1 - arr, look: arr * -0.2, headDown: 0.25 * (1 - arr), lean: arr * 0.25 });
    this.phone.visible = arr < 0.95;
    this.phone.position.copy(this.seller.hR).add(new THREE.Vector3(-0.05, 0.03, 0)); this.phone.rotation.set(0, Math.PI / 2, 0.5);
    this.headL[0]!.intensity = 3; this.headL[1]!.intensity = 22;
    this.poseCams(t);
    const P = this.pov(t);
    this.setCam(P, t, P.walk);
    const cam = this.cam;
    // the torch: ahead on the ground while walking; on the look back it drops to the ground between them (the
    // child does not dare to shine it at him); bouncing on the run; at the window it rests on the counter
    const k1 = smoothstep(T.back1, T.back1 + 0.4, t) * (1 - smoothstep(T.fwd1, T.fwd1 + 0.4, t));
    const k2 = smoothstep(T.back2, T.back2 + 0.4, t) * (1 - smoothstep(T.fwd2, T.fwd2 + 0.4, t));
    const ahead = new THREE.Vector3(cam.position.x - 0.6, 0, cam.position.z - 5.5);
    const between = new THREE.Vector3(lerp(cam.position.x, S_X, 0.4), 0, lerp(cam.position.z, mz, 0.35));
    const counter = new THREE.Vector3(KX - 0.8, 0, KZ + 0.9);
    const aim = ahead.lerp(between, Math.max(k1, k2)).lerp(counter, arr).lerp(new THREE.Vector3(cam.position.x - 0.4, 0, cam.position.z + 2.5), smoothstep(T.glance, T.glance + 0.5, t));
    const pose = this.torch(t, { raise: 1, on: PROOF ? 0 : 1, walk: P.walk, beat: this.running(t), aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : 0.8, spot: clamp(20 * (aim.distanceTo(cam.position) / 5) ** 2, 3, 22) });
    if (!PROOF) this.cut(t, P, pose, { speed: this.speed(t) * 1.0, dist: -this.camZ(t) });
    this.renderWorld(out, t, { sky: { top: [0.008, 0.01, 0.02], horizon: scaleRGB(LIN.smog, 0.12), low: scaleRGB(LIN.shadow, 0.8), horizonY: 0.5, haze: 1 } });
    const g = this.glow3D;
    for (const l of this.lamps) g.add(l[0], l[1], l[2], 0.45, 0.35, LIN.sodium, 2.2, 4);
    g.add(this.deadLamp[0], this.deadLamp[1], this.deadLamp[2], 0.3, 0.25, LIN.sodium, hash(Math.floor(t * 9), 4) < 0.08 ? 1.2 : 0.0, 4);
    for (const h of [HEAD_L, HEAD_R]) { g.add(h[0], h[1], h[2] - 0.05, 0.4, 0.3, [1, 0.95, 0.85], 1.2, 2); g.add(h[0], h[1], h[2] - 0.05, 0.22, 0.2, [1, 1, 1], 6, 4); }
    for (const c of this.cams) g.add(c.lens.x, c.lens.y, c.lens.z, 0.05, 0.05, [1, 0.08, 0.04], (Math.floor(t * 2 + c.p.z) % 2 ? 4 : 1.2) * (t > c.wake ? 1 : 0.4), 4);
    const kd = clamp((cam.position.distanceTo(new THREE.Vector3(KX, 1.5, KZ)) - 4) / 8);
    g.add(KX, 1.55, KZ + 0.05, 1.6, 0.8, [1, 0.7, 0.35], 0.22 * kd, 1.6);
    g.add(KX, 3.0, KZ + 0.25, 1.9, 0.45, [1, 0.9, 0.75], 0.2 * kd, 1.6);
    this.flushGlow(out);
    // the headlights' beams in the haze
    for (const h of [HEAD_L, HEAD_R]) {
      const L = makeLamp(new THREE.Vector3(...h), new THREE.Vector3(WALL_X, 0.9, -4), 12, 60, 0.35);
      this.cone.render(renderer, out, cam, L, t, { density: 0.008, floorY: 0, maxDist: 40, pool: 0, color: [1, 0.95, 0.85] });
    }
    this.beam(out, t, pose, PROOF ? 0 : 1, { density: 0.02, maxDist: clamp(aim.distanceTo(cam.position) - 0.5, 0.8, 8) });
    this.logPlane(this.sign, this.signText, 'sign', { minPx: 10, id: 'scenery:stranger-kiosk', scenery: true });
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.16 + 0.2 * arr, warm: 0.15 + 0.5 * arr, torch: 1 };
    if (!PROOF) {
      if (!this.third) this.handOnCounter(u, t, arr, light);
      this.torchHand(u, pose, light);
      this.heading(u, t, f);
      const head = () => this.onScreen(S_X, 1.95, this.manZ(t));
      this.callout(u, t, `${this.dist1} м`, T.back1 + 0.3, T.fwd1 + 0.05, head);
      // portrait: below-left of the head, off the headlights' bloom (A9)
      const h2 = head();
      this.callout(u, t, `${this.dist2} м`, T.back2 + 0.2, T.fwd2 + 0.1, head, PORTRAIT && h2 ? this.placeLabel(`${this.dist2} м`, 34, h2, { dx: -50, dy: 120, side: -1 }) : {});
      const cb = this.cams[2]!.p;
      // pinned left of the child, over the wall (away from the headlights' bloom and the stranger), every frame the same
      const incA = (tt: number) => (this.shots.some(([a0, a1]) => tt >= a0 && tt < a1) ? this.onScreen(this.camX(tt), 1.3, this.camZ(tt)) : this.onScreen(cb.x, cb.y, cb.z));
      const ia = incA(t), S0 = PORTRAIT ? 34 : 26;
      this.callout(u, t, 'ИНЦИДЕНТ НЕ ОБНАРУЖЕН', T.fwd2 + 0.5, T.fwd2 + 2.95, incA, ia ? this.placeLabel('ИНЦИДЕНТ НЕ ОБНАРУЖЕН', S0, ia, { dx: -30, dy: -150, side: -1 }) : {});
      this.callout(u, t, homeLabel('stranger'), T.fwd2 + 3.35, T.fwd2 + 5.45, () => this.onScreen(-1.4, 0.8, KZ - 0.6), { places: [city().home.name] });
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    void camNow;
    return { ...POST_BASE, vignette: 0.6 };
  }

  /** At the window the free hand lands flat on the counter ledge. */
  handOnCounter(c: CanvasRenderingContext2D, t: number, arr: number, light: Light) {
    const k = ease.outCubic(smoothstep(0.55, 1, arr)) * (1 - smoothstep(this.T.glance - 0.1, this.T.glance + 0.3, t));
    if (k <= 0.001) return;
    const target = project(this.cam, KX - 0.45, 1.0, KZ + 0.2);
    const s = 0.055 * pxAt(this.cam, 0.5);
    const from = { x: W * (PORTRAIT ? 0.2 : 0.28), y: H + s * 3 };
    const tx = target.behind ? W * 0.4 : clamp(target.x, s * 2, W * 0.62), ty = target.behind ? H * 0.6 : clamp(target.y + s * 0.8, H * 0.4, H * 0.85);
    drawOpenHand(c, { x: lerp(from.x + s, tx, k), y: lerp(H + s, ty, k) }, from, s, light, 'flat', { curl: 0.2 });
    void t;
  }
}

/** When the child reaches the window. */
function STOP_T(s: Stranger) { const T = s.T; for (let t = T.run; t < T.end; t += 0.05) if (s.camZ(t) <= STOP[2] + 0.05) return t; return T.end; }
void lerp;
