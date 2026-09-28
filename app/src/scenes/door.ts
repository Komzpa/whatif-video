// `door` — «ТЫ ОДИН ДОМА, А В ДВЕРЬ ЗВОНЯТ» (TREATMENT r4 p.32; r5–r7; city.json: the route's stop «Проходная», the
// empty gatehouse just inside the promzona gate). First person, the child alone in the watchman's booth:
//   (a) start     dark booth; the child's hand finds the desk lamp's switch: warm light, the booth is almost a room
//                 (a mug, the phone, the heater's coil). Through the rainy window: the gate it came through, the
//                 metro's red «М» and the lit windows of the far blocks. «home»: ДОМ · 5,8 км, far out there.
//   (b) doorbell  the bell over the door rattles; the child's head snaps round: on the door's reeded glass, the
//                 backlit shape of someone big.
//   (c)           the child goes to the door. The intercom beside it has woken: a camera picture of the visitor from
//                 above (no face), a line of mojibake the child can't read, a big bright button and a tiny one. The
//                 hand drifts to the big one («ОТКРЫТЬ ДВЕРЬ?») — and stops.
//   (d) rings     the bell again; the handle is tried from outside, twice; the shape leans to the glass; the child
//                 backs away. Then the shape turns and goes. Rain on the glass.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, prog, smoothstep, keys, hash, mulberry32, frameIdx } from '../engine/util';
import { F, font } from '../engine/type';
import { logText } from '../textlog';
import { homeLabel, city, garble } from '../city';
import { metroSignCanvas } from './_ru';
import { buildHome, HOME, type Home } from './_home';
import { Quadruped, OUR_CAT } from './_beasts';
import { drawOpenHand, pxAt, type Light } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, blotches, speckle, asphalt, boxMesh, cyl, ground, planeSign, concreteFence, streetLight, panelBlock, WindowPanes,
  POST_BASE, LIN, scaleRGB, mixRGB, project, lin, EYE, type Pov, type V3, type RGB, type Box,
} from './_kit';

const WALL_X = -1.6, FRONT_Z = -1.3, BACK_Z = 1.3, RIGHT_X = 1.6, CEIL = 2.6;
const DOOR_Z0 = -0.2, DOOR_Z1 = 0.7, DOOR_H = 2.05;
const GL_Z0 = -0.05, GL_Z1 = 0.55, GL_Y0 = 1.12, GL_Y1 = 1.88; // the door's reeded glass
const SCR: V3 = [WALL_X + 0.035, 1.3, -0.62]; // the intercom screen (faces +x)
const SCR_W = 0.3, SCR_H = 0.225;
const BTN = new THREE.Vector3((185 / 480 - 0.5) * SCR_W, (0.5 - 313 / 360) * SCR_H, 0); // the big button, plane-local
const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const SEAT: V3 = [0.12, 0.98, 0.1];
const STAND: V3 = [-1.08, EYE, -0.22];
const LAMP: V3 = [0.62, 1.2, -0.95]; // the desk lamp's shade
const HOME_P: V3 = [2, 0, -90]; // the home block, far out beyond the gate (the same model as in `close`)

export default class Door extends LitScene {
  chapter = 'door';
  room = new THREE.Group();
  yard = new THREE.Group();
  deskLamp!: THREE.SpotLight; lampFill!: THREE.PointLight; heaterL!: THREE.PointLight; screenL!: THREE.PointLight; gateLamp!: THREE.SpotLight;
  shadeIn!: THREE.MeshBasicMaterial; coil!: THREE.MeshBasicMaterial;
  glassCv!: HTMLCanvasElement; glassTex!: THREE.CanvasTexture; glass!: THREE.Mesh;
  scrCv!: HTMLCanvasElement; scrTex!: THREE.CanvasTexture; scr!: THREE.Mesh; scrMat!: THREE.MeshBasicMaterial;
  scrText = { title: '', yes: '', no: '' };
  hammer = new THREE.Group(); handle = new THREE.Group(); leaf = new THREE.Group();
  panes!: WindowPanes;
  home!: Home; homeCat!: Quadruped;
  winDrops!: THREE.Mesh;
  metroSign!: THREE.Mesh;
  rainPts: { x: number; z: number; ph: number; sp: number }[] = [];

  override init() {
    this.initLit();
    this.hemi.intensity = 0.25;
    this.fogE.color.setRGB(0.012, 0.016, 0.022); this.fogE.density = 0.012;
    const L = this.ly.get('home alone');
    const w = (re: RegExp) => L.words.find((x) => re.test(x.w))!;
    const s = this.ctx.start;
    const T: Record<string, number> = { s };
    T.lampOn = s + 0.42;
    T.home = w(/home/).start; T.alone = w(/alone/).start;
    T.bell1 = w(/doorbell/).start; T.whip0 = T.bell1 + 0.08; T.whip1 = T.whip0 + 0.5;
    T.up = T.whip1 + 0.35; T.walk0 = T.up + 0.25; T.walk1 = T.walk0 + 1.3;
    T.openCall = T.walk1 - 0.3;
    T.reach0 = T.walk1 + 0.15; T.reach1 = T.reach0 + 0.9;
    T.bell2 = w(/rings/).start;
    T.back0 = T.bell2 + 0.25; T.back1 = T.back0 + 0.55;
    T.leave0 = T.bell2 + 1.45; T.leave1 = T.leave0 + 1.0;
    this.T = T;
    // shots: the lamp switch in first person; the booth from its high corner, the child small at the desk in the
    // lamp light; over the shoulder when the bell rings and the child goes to the door; the button in first person;
    // low by the window when the handle is tried, the child backing away from the shape on the glass
    this.shots = [
      // far out there, as the child stares at it: our window on the home block, the lamp on, the cat waiting (a long lens)
      [T.home + 0.1, T.alone + 0.45, { k: 'free', p: [0.37, 1.3, -1.05], p1: [0.37, 1.3, -1.05], look: [HOME_P[0] - 0.3, 4.85, HOME_P[2] + 0.3], look1: [HOME_P[0], 5.0, HOME_P[2] + 0.3], fov: PORTRAIT ? 7 : 4.6 }],
      [T.alone + 0.45, T.bell1 + 0.05, { k: 'free', p: [0.75, 1.9, 1.15], p1: [0.6, 1.8, 0.95], look: [PORTRAIT ? 0.8 : -0.1, PORTRAIT ? 1.1 : 0.8, -1.3], look1: [PORTRAIT ? 0.9 : 0.0, PORTRAIT ? 1.1 : 0.8, -1.3], fov: PORTRAIT ? 90 : 72 }],
      [T.bell1 + 0.05, T.walk1, { k: 'ots', d: 1.5, side: -1.2, h: 2.2, aimY: PORTRAIT ? -0.9 : 0 }],
      [T.bell2, T.leave1 + 2, { k: 'free', p: [0.7, 1.55, 1.2], p1: [0.6, 1.5, 1.1], look: [WALL_X, 1.1, 0.1], look1: [WALL_X, 1.15, 0.05], fov: PORTRAIT ? 84 : 64 }],
    ];
    this.initKid(7);
    this.buildRoom();
    this.buildYard();
    this.obstacles = () => { const b = this.planeBox(this.scr); return b ? [b] : []; };
  }

  // ================================================================ the booth
  buildRoom() {
    const R = this.room; this.three.add(R);
    // walls: Soviet oil paint to 1.5 m (grey-green), whitewash above, a dark line between; grime
    const wallTex = (seed: number, wM: number) => canvasTex(512, 512, (c, w, h) => {
      const split = h * (1 - 1.5 / CEIL);
      c.fillStyle = '#c3bca9'; c.fillRect(0, 0, w, split);
      c.fillStyle = '#56706a'; c.fillRect(0, split, w, h - split);
      c.fillStyle = '#2d3a36'; c.fillRect(0, split - 3, w, 5);
      blotches(c, w, split, 14, () => 'rgba(90,75,50,0.18)', 20, 110, seed);
      speckle(c, w, h, 5000, 0.12, seed + 1);
      const sh = c.createLinearGradient(0, split, 0, h); sh.addColorStop(0, 'rgba(255,255,255,0.06)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)'); c.fillStyle = sh; c.fillRect(0, split, w, h - split);
      // scuffs along the bottom
      blotches(c, w, h, 10, () => 'rgba(20,18,15,0.25)', 10, 40, seed + 2);
      void wM;
    });
    const wm = (seed: number, wM: number) => lit([1, 1, 1], { map: wallTex(seed, wM), rough: 0.7 });
    const floorTex = canvasTex(512, 512, (c, w, h) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#6b4432' : '#3f2a22'; c.fillRect(x * 64, y * 64, 64, 64); }
      speckle(c, w, h, 6000, 0.18, 5); blotches(c, w, h, 20, () => 'rgba(0,0,0,0.25)', 20, 90, 6);
    }, { repeat: [2, 2] });
    ground(R, 3.2, 2.6, 0, 0, lit([1, 1, 1], { map: floorTex, rough: 0.55 }));
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), lit([0.55, 0.53, 0.48], { rough: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CEIL, 0); R.add(ceil);
    // back and right walls (whole), front wall around the window, left wall around the door
    const wall = (w: number, h: number, x: number, y: number, z: number, ry: number, seed: number, u0 = 0, u1 = 1, v0 = 0, v1 = 1) => {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
      const m = new THREE.Mesh(g, wm(seed, w)); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; R.add(m); return m;
    };
    wall(3.2, CEIL, 0, CEIL / 2, BACK_Z, Math.PI, 1);
    wall(2.6, CEIL, RIGHT_X, CEIL / 2, 0, -Math.PI / 2, 2);
    // front (window x -1.1..1.1, y 0.95..2.1)
    const WX0 = -1.1, WX1 = 1.1, WY0 = 0.95, WY1 = 2.1;
    wall(3.2, WY0, 0, WY0 / 2, FRONT_Z, 0, 3, 0, 1, 0, WY0 / CEIL);
    wall(3.2, CEIL - WY1, 0, (WY1 + CEIL) / 2, FRONT_Z, 0, 3, 0, 1, WY1 / CEIL, 1);
    wall(WX0 + 1.6, WY1 - WY0, (WX0 - 1.6) / 2, (WY0 + WY1) / 2, FRONT_Z, 0, 3, 0, (WX0 + 1.6) / 3.2, WY0 / CEIL, WY1 / CEIL);
    wall(1.6 - WX1, WY1 - WY0, (WX1 + 1.6) / 2, (WY0 + WY1) / 2, FRONT_Z, 0, 3, (WX1 + 1.6) / 3.2, 1, WY0 / CEIL, WY1 / CEIL);
    // left (door z -0.2..0.7, h 2.05)
    const zl = (z: number) => (z + 1.3) / 2.6;
    wall(DOOR_Z0 + 1.3, CEIL, WALL_X, CEIL / 2, (DOOR_Z0 - 1.3) / 2, Math.PI / 2, 4, 1 - zl(DOOR_Z0), 1, 0, 1);
    wall(1.3 - DOOR_Z1, CEIL, WALL_X, CEIL / 2, (DOOR_Z1 + 1.3) / 2, Math.PI / 2, 4, 0, 1 - zl(DOOR_Z1), 0, 1);
    wall(DOOR_Z1 - DOOR_Z0, CEIL - DOOR_H, WALL_X, (DOOR_H + CEIL) / 2, (DOOR_Z0 + DOOR_Z1) / 2, Math.PI / 2, 4, 1 - zl(DOOR_Z1), 1 - zl(DOOR_Z0), DOOR_H / CEIL, 1);
    // the window: painted wooden frame, a mullion and a transom, a wide sill
    const frameM = lit([0.72, 0.7, 0.64], { rough: 0.6 });
    boxMesh(R, WX1 - WX0 + 0.12, 0.08, 0.12, 0, WY0 - 0.02, FRONT_Z, frameM);
    boxMesh(R, WX1 - WX0 + 0.12, 0.08, 0.12, 0, WY1, FRONT_Z, frameM);
    for (const x of [WX0, 0.18, WX1]) boxMesh(R, 0.07, WY1 - WY0, 0.1, x, (WY0 + WY1) / 2, FRONT_Z, frameM);
    boxMesh(R, 1.3, 0.05, 0.08, -0.46, 1.68, FRONT_Z, frameM);
    // raindrops on the glass (a faint lit texture over the view)
    const drops = canvasTex(1024, 512, (c, w, h) => {
      const r = mulberry32(77);
      for (let i = 0; i < 260; i++) {
        const x = r() * w, y = r() * h, rad = 1 + r() * r() * 4;
        c.fillStyle = `rgba(255,236,200,${0.04 + r() * 0.1})`; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
        if (r() < 0.12) { const len = 20 + r() * 90; c.fillStyle = 'rgba(255,236,200,0.07)'; c.fillRect(x - 1, y, 2, len); }
      }
    });
    const dm = new THREE.MeshBasicMaterial({ map: drops, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.winDrops = new THREE.Mesh(new THREE.PlaneGeometry(WX1 - WX0, WY1 - WY0), dm);
    this.winDrops.position.set(0, (WY0 + WY1) / 2, FRONT_Z - 0.01); R.add(this.winDrops);
    // the desk along the front wall
    const wood = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = '#4b3121'; c.fillRect(0, 0, w, h);
      const r = mulberry32(8);
      for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(${20 + r() * 30},${10 + r() * 15},5,${0.25 + r() * 0.3})`; c.lineWidth = 1 + r() * 2; c.beginPath(); const y = r() * h; c.moveTo(0, y); for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * 0.02 + i) * 4); c.stroke(); }
      blotches(c, w, h, 8, () => 'rgba(255,230,190,0.06)', 20, 60, 9);
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(360, 70, 22, 0, Math.PI * 2); c.stroke(); // a mug ring
    });
    const deskM = lit([1, 1, 1], { map: wood, rough: 0.45 });
    boxMesh(R, 2.3, 0.04, 0.72, 0, 0.75, FRONT_Z + 0.4, deskM);
    boxMesh(R, 2.3, 0.7, 0.02, 0, 0.38, FRONT_Z + 0.75, lit([0.2, 0.14, 0.1]));
    // the desk lamp: a heavy round base, a jointed arm, a green enamel shade (lit inside)
    const enamel = lit(lin('#2f5a44'), { rough: 0.35 });
    const steel = lit([0.3, 0.3, 0.3], { rough: 0.35, metal: 0.7 });
    cyl(R, [LAMP[0] + 0.12, 0.77, LAMP[2] + 0.1], [LAMP[0] + 0.12, 0.8, LAMP[2] + 0.1], 0.08, enamel);
    cyl(R, [LAMP[0] + 0.12, 0.8, LAMP[2] + 0.1], [LAMP[0] + 0.05, 1.1, LAMP[2] + 0.04], 0.012, steel);
    cyl(R, [LAMP[0] + 0.05, 1.1, LAMP[2] + 0.04], [LAMP[0], LAMP[1] + 0.04, LAMP[2]], 0.012, steel);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.11, 0.13, 20, 1, true), enamel);
    shade.position.set(...LAMP); shade.rotation.z = 0.35; shade.castShadow = true; R.add(shade);
    this.shadeIn = glowMat(LIN.lamp, 0.2, { fog: false });
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.105, 0.125, 20, 1, true), this.shadeIn);
    inner.material.side = THREE.BackSide; inner.position.copy(shade.position); inner.rotation.copy(shade.rotation); R.add(inner);
    this.deskLamp = new THREE.SpotLight(0xffe8b5, 0, 0, 1.0, 0.55, 2);
    this.deskLamp.position.set(LAMP[0] + 0.02, LAMP[1] - 0.04, LAMP[2]);
    this.deskLamp.target.position.set(LAMP[0] - 0.25, 0.75, LAMP[2] + 0.35);
    this.deskLamp.castShadow = true; this.deskLamp.shadow.mapSize.set(1024, 1024); this.deskLamp.shadow.bias = -0.0003; this.deskLamp.shadow.normalBias = 0.01; this.deskLamp.shadow.camera.near = 0.05; this.deskLamp.shadow.camera.far = 6;
    R.add(this.deskLamp, this.deskLamp.target);
    this.lampFill = new THREE.PointLight(0xffe0b0, 0, 0, 2); this.lampFill.position.set(LAMP[0], LAMP[1] + 0.25, LAMP[2] + 0.1); R.add(this.lampFill);
    // on the desk: the rotary phone, an enamel mug, the torch lying off, a few keys
    const phoneM = lit(lin('#6d1e1a'), { rough: 0.3 });
    boxMesh(R, 0.2, 0.08, 0.22, -0.42, 0.81, -0.95, phoneM, { ry: 0.25 });
    const hs = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.16, 4, 10), phoneM); hs.rotation.set(0, 0.25, Math.PI / 2); hs.position.set(-0.42, 0.88, -0.95); hs.castShadow = true; R.add(hs);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.01, 24), lit([0.8, 0.78, 0.72], { rough: 0.4 })); dial.position.set(-0.4, 0.845, -0.9); dial.rotation.set(-0.5, 0.25, 0); R.add(dial);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.09, 20), lit([0.85, 0.84, 0.8], { rough: 0.25 })); mug.position.set(0.15, 0.815, -0.78); mug.castShadow = true; R.add(mug);
    const tea = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), lit(lin('#3a1d0c'), { rough: 0.1 })); tea.rotation.x = -Math.PI / 2; tea.position.set(0.15, 0.85, -0.78); R.add(tea);
    const handleM = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16, Math.PI), lit([0.85, 0.84, 0.8], { rough: 0.25 })); handleM.position.set(0.198, 0.815, -0.78); handleM.rotation.z = -Math.PI / 2; R.add(handleM);
    const tm = lit([0.2, 0.22, 0.25], { rough: 0.3, metal: 0.8 });
    const torch = cyl(R, [0.42, 0.785, -0.62], [0.58, 0.785, -0.7], 0.017, tm); void torch;
    cyl(R, [0.58, 0.785, -0.7], [0.62, 0.787, -0.72], 0.022, tm);
    // the heater under the desk on the right: a bowl reflector with a coil
    this.coil = glowMat(lin('#ff5a1a'), 0.0);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lit([0.6, 0.6, 0.6], { rough: 0.2, metal: 0.9, side: THREE.DoubleSide }));
    bowl.rotation.x = -Math.PI / 2 - 0.4; bowl.position.set(1.15, 0.28, -0.6); R.add(bowl);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 24), this.coil); coil.position.set(1.15, 0.28, -0.56); coil.rotation.x = -0.4; R.add(coil);
    cyl(R, [1.15, 0, -0.6], [1.15, 0.2, -0.62], 0.012, steel);
    this.heaterL = new THREE.PointLight(0xff6a2a, 0, 0, 2); this.heaterL.position.set(1.1, 0.35, -0.4); R.add(this.heaterL);
    // the keys board on the right wall; the wall calendar (numbers only)
    boxMesh(R, 0.02, 0.4, 0.55, RIGHT_X - 0.01, 1.55, 0.2, lit(lin('#3b2a1e'), { rough: 0.6 }));
    for (let i = 0; i < 12; i++) { const y = 1.68 - Math.floor(i / 4) * 0.12, z = 0.02 + (i % 4) * 0.12; cyl(R, [RIGHT_X - 0.02, y, z], [RIGHT_X - 0.06, y, z], 0.004, steel); if (hash(i, 4) > 0.3) boxMesh(R, 0.004, 0.05, 0.02, RIGHT_X - 0.055, y - 0.04, z, lit(lin('#b8a878'), { rough: 0.5, metal: 0.5 })); }
    const cal = canvasTex(256, 360, (c, w, h) => {
      c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3b5f7a'; c.fillRect(14, 14, w - 28, 150); // a picture: sea and sky
      c.fillStyle = '#6f93a8'; c.fillRect(14, 14, w - 28, 80);
      c.fillStyle = '#c78a3c'; c.beginPath(); c.arc(180, 70, 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2a3a2a'; c.beginPath(); c.moveTo(14, 164); c.lineTo(90, 110); c.lineTo(160, 164); c.fill();
      c.fillStyle = '#2a2622'; c.font = font(F.metro(700), 20); c.textAlign = 'center';
      for (let i = 0; i < 30; i++) { const col = i % 7, row = Math.floor(i / 7); c.fillStyle = col >= 5 ? '#a3241c' : '#2a2622'; c.fillText(String(i + 1), 30 + col * 32, 200 + row * 34); }
    });
    planeSign(R, cal.image as HTMLCanvasElement, 0.3, [RIGHT_X - 0.01, 1.62, -0.55], { ry: -Math.PI / 2 });
    // the chair back behind the camera is never seen; a coat on a hook on the back wall
    // ---- the door: leaf, frame, reeded glass, lever handle; the bell above it; the intercom beside it
    const doorM = lit(lin('#5b4632'), { rough: 0.55 });
    const jamb = lit(lin('#4a3a2a'), { rough: 0.6 });
    boxMesh(R, 0.12, DOOR_H + 0.06, 0.07, WALL_X + 0.02, (DOOR_H + 0.06) / 2, DOOR_Z0 - 0.035, jamb);
    boxMesh(R, 0.12, DOOR_H + 0.06, 0.07, WALL_X + 0.02, (DOOR_H + 0.06) / 2, DOOR_Z1 + 0.035, jamb);
    boxMesh(R, 0.12, 0.07, DOOR_Z1 - DOOR_Z0 + 0.14, WALL_X + 0.02, DOOR_H + 0.035, (DOOR_Z0 + DOOR_Z1) / 2, jamb);
    const lf = this.leaf; lf.position.set(WALL_X + 0.02, 0, DOOR_Z0); R.add(lf);
    const dw = DOOR_Z1 - DOOR_Z0;
    boxMesh(lf, 0.045, GL_Y0, dw, 0, GL_Y0 / 2, dw / 2, doorM);
    boxMesh(lf, 0.045, DOOR_H - GL_Y1, dw, 0, (GL_Y1 + DOOR_H) / 2, dw / 2, doorM);
    boxMesh(lf, 0.045, GL_Y1 - GL_Y0, GL_Z0 - DOOR_Z0, 0, (GL_Y0 + GL_Y1) / 2, (GL_Z0 - DOOR_Z0) / 2, doorM);
    boxMesh(lf, 0.045, GL_Y1 - GL_Y0, DOOR_Z1 - GL_Z1, 0, (GL_Y0 + GL_Y1) / 2, dw - (DOOR_Z1 - GL_Z1) / 2, doorM);
    // bead around the glass and panel mouldings
    for (const [y0, y1] of [[0.12, 0.98]]) { boxMesh(lf, 0.06, 0.02, dw - 0.16, 0.012, y0!, dw / 2, jamb); boxMesh(lf, 0.06, 0.02, dw - 0.16, 0.012, y1!, dw / 2, jamb); boxMesh(lf, 0.06, y1! - y0!, 0.02, 0.012, (y0! + y1!) / 2, 0.08, jamb); boxMesh(lf, 0.06, y1! - y0!, 0.02, 0.012, (y0! + y1!) / 2, dw - 0.08, jamb); }
    this.glassCv = document.createElement('canvas'); this.glassCv.width = 256; this.glassCv.height = 320;
    this.glassTex = new THREE.CanvasTexture(this.glassCv); this.glassTex.colorSpace = THREE.SRGBColorSpace;
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(GL_Z1 - GL_Z0, GL_Y1 - GL_Y0), new THREE.MeshBasicMaterial({ map: this.glassTex, fog: false, toneMapped: false }));
    this.glass.rotation.y = Math.PI / 2; this.glass.position.set(0.0, (GL_Y0 + GL_Y1) / 2, (GL_Z0 + GL_Z1) / 2 - DOOR_Z0); lf.add(this.glass);
    // lever handle and the lock plate on the leaf, the hinges
    const brass = lit(lin('#8a7a52'), { rough: 0.3, metal: 0.8 });
    boxMesh(lf, 0.02, 0.2, 0.05, 0.03, 1.0, dw - 0.08, brass);
    this.handle.position.set(0.05, 1.06, dw - 0.08); lf.add(this.handle);
    boxMesh(this.handle, 0.03, 0.025, 0.13, 0.02, 0, -0.06, brass);
    for (const y of [0.25, 1.8]) boxMesh(lf, 0.03, 0.12, 0.02, 0.02, y, 0.01, brass);
    // the electric bell: a steel dome on a bracket, the hammer on its arm
    const bellM = lit([0.62, 0.62, 0.6], { rough: 0.25, metal: 0.9 });
    boxMesh(R, 0.04, 0.12, 0.1, WALL_X + 0.02, 2.3, 0.25, lit([0.2, 0.2, 0.2]));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), bellM);
    dome.rotation.z = -Math.PI / 2; dome.position.set(WALL_X + 0.05, 2.3, 0.25); dome.castShadow = true; R.add(dome);
    this.hammer.position.set(WALL_X + 0.1, 2.22, 0.25); R.add(this.hammer);
    cyl(this.hammer, [0, 0, 0], [0, 0.1, 0], 0.004, bellM);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), bellM); ball.position.set(0, 0.1, 0); this.hammer.add(ball);
    cyl(R, [WALL_X + 0.02, 2.3, 0.25], [WALL_X + 0.02, 2.6, 0.25], 0.004, lit([0.1, 0.1, 0.1])); // its wire
    // the intercom: a steel box with a small screen and a grille
    boxMesh(R, 0.05, SCR_H + 0.14, SCR_W + 0.08, WALL_X + 0.005, SCR[1] - 0.03, SCR[2], lit([0.22, 0.23, 0.24], { rough: 0.4, metal: 0.6 }));
    this.scrCv = document.createElement('canvas'); this.scrCv.width = 480; this.scrCv.height = 360;
    this.scrTex = new THREE.CanvasTexture(this.scrCv); this.scrTex.colorSpace = THREE.SRGBColorSpace;
    this.scrMat = new THREE.MeshBasicMaterial({ map: this.scrTex, fog: false, toneMapped: false });
    this.scr = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), this.scrMat);
    this.scr.rotation.y = Math.PI / 2; this.scr.position.set(...SCR); R.add(this.scr);
    for (let i = 0; i < 6; i++) boxMesh(R, 0.01, 0.006, 0.12, WALL_X + 0.035, SCR[1] - SCR_H / 2 - 0.035 - i * 0.012, SCR[2], lit([0.05, 0.05, 0.05]), { cast: false });
    this.screenL = new THREE.PointLight(0x9fc4d8, 0, 0, 2); this.screenL.position.set(WALL_X + 0.3, SCR[1], SCR[2]); R.add(this.screenL);
    this.scrText = { title: 'ОТКРЫТЬ?', yes: 'ДА', no: 'НЕТ' }; // plain Russian: this is the child's own side of the city (B4)
    // the watchman's coat on a hook by the back wall (the dark will need it)
    const coatM = lit(lin('#2c2f2a'), { rough: 0.95 });
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 1.1, 12, 1, true), coatM); coat.position.set(1.2, 1.25, BACK_Z - 0.18); coat.castShadow = true; coat.material.side = THREE.DoubleSide; R.add(coat);
  }

  // ================================================================ the yard through the window
  buildYard() {
    const Y = this.yard; this.three.add(Y);
    const { map, rough } = asphalt(12, [30, 30]);
    ground(Y, 400, 400, 0, -150, lit([0.8, 0.8, 0.8], { map, roughMap: rough, rough: 1 }), -0.02);
    // the booth's own outside (seen through the door glass only as light) and the yard: the gate, the fence
    concreteFence(Y, -60, 60, -9, { gap: [[-0.2, 3.4]], face: -1 });
    const gm = lit([0.28, 0.3, 0.3], { rough: 0.6, metal: 0.5 });
    for (const x of [-0.25, 3.45]) boxMesh(Y, 0.3, 2.9, 0.3, x, 1.45, -9, lit([0.5, 0.5, 0.48], { rough: 0.9 }));
    // the gate: left leaf shut, right leaf ajar (swung in towards the booth)
    for (let k = 0; k <= 7; k++) cyl(Y, [0 + k * 0.21, 0.08, -9], [0 + k * 0.21, 2.1, -9], 0.015, gm, { seg: 5 });
    for (const y of [0.1, 1.1, 2.1]) cyl(Y, [0, y, -9], [1.5, y, -9], 0.02, gm, { seg: 5 });
    const hx = 3.3, aj = 1.0, gw = 1.5, ex = hx - Math.cos(aj) * gw, ez = -9 + Math.sin(aj) * gw;
    for (let k = 0; k <= 7; k++) { const q = k / 7; cyl(Y, [lerp(hx, ex, q), 0.08, lerp(-9, ez, q)], [lerp(hx, ex, q), 2.1, lerp(-9, ez, q)], 0.015, gm, { seg: 5 }); }
    for (const y of [0.1, 1.1, 2.1]) cyl(Y, [hx, y, -9], [ex, y, ez], 0.02, gm, { seg: 5 });
    // the gate lamp on its post (it lights the yard, the gate and the booth's door from outside)
    const gl = streetLight(Y, -1.2, -8.6, { h: 4.6, arm: [0.9, 0, 0.9] });
    this.gateLamp = this.addLamp(gl, { k: 45, angle: 1.1, shadow: true, target: [gl[0] + 0.5, 0, gl[2] + 3] });
    // outside the fence: the road, streetlights, the metro vestibule with its red «М», the microdistrict
    for (let x = -80; x <= 80; x += 26) { const p = streetLight(Y, x, -16.5, { arm: [0, 0, 1.3] }); this.addPoint([p[0], p[1] - 0.3, p[2]], LIN.sodium, 25); }
    const vm = lit([0.42, 0.43, 0.42], { rough: 0.9 });
    boxMesh(Y, 10, 4.2, 8, 9, 2.1, -26, vm);
    boxMesh(Y, 11, 0.35, 9, 9, 4.37, -26, lit([0.3, 0.3, 0.3]));
    const mtex = new THREE.CanvasTexture(metroSignCanvas(256, 1)); mtex.colorSpace = THREE.SRGBColorSpace;
    this.metroSign = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40), glowMat([1, 1, 1], 1.6, { map: mtex }));
    this.metroSign.position.set(4.6, 5.6, -21.8); Y.add(this.metroSign);
    cyl(Y, [4.6, 0, -21.9], [4.6, 5.0, -21.9], 0.06, vm);
    this.addPoint([4.6, 5.6, -21.2], LIN.red, 6);
    const wins = [
      ...panelBlock(Y, { cx: -64, cz: -70, len: 96, floors: 9, ang: 0.12, seed: 3, litRate: 0.08 }),
      ...panelBlock(Y, { cx: 95, cz: -112, len: 80, floors: 9, ang: -0.3, seed: 4, litRate: 0.07 }),
      ...panelBlock(Y, { cx: 10, cz: -150, len: 120, floors: 9, ang: 0.02, seed: 5, litRate: 0.06 }),
      ...panelBlock(Y, { cx: -90, cz: -120, len: 70, floors: 5, ang: 0.5, seed: 6, litRate: 0.07 }),
      ...panelBlock(Y, { cx: 58, cz: -48, len: 60, floors: 5, ang: -0.1, seed: 7, litRate: 0.09 }),
    ];
    // home, far out there: the SAME block the child comes back to in `close` (shared model), facing the booth; the lamp
    // left on in our window and the cat waiting on the sill (TREATMENT r8 notes 3 and 8)
    this.home = buildHome(Y, { pos: [HOME_P[0], 0, HOME_P[2]], ry: Math.atan2(-HOME_P[0], -HOME_P[2]), ourLight: 0.55 }); // seen through the open gate, left of the metro
    wins.push(...this.home.windows.filter((_, i) => hash(i, 41) < 0.2).map((w) => ({ ...w, c: [0.95, 0.7, 0.4] as [number, number, number], k: 0.6 })));
    this.homeCat = new Quadruped(OUR_CAT, Y, 56);
    this.addLamp(this.home.toWorld([4.5, 6.5, 8]), { k: 90, angle: 0.8, color: [0.95, 0.75, 0.5], target: this.home.toWorld([1, 3.5, 0]) }); // the yard lamp in front of our block
    this.panes = new WindowPanes(Y, wins);
    // rain in the yard (3D streaks)
    const r = mulberry32(5);
    for (let i = 0; i < 700; i++) this.rainPts.push({ x: -7 + r() * 14, z: -3.5 - r() * 12, ph: r(), sp: 7 + r() * 3 });
  }

  // ================================================================ motion
  /** Gate-1 proof views (?proof=booth|intercom|glass|yard): fixed cameras on the chapter's new assets. */
  proofPov(): Pov | null {
    switch (PROOF) {
      case 'booth': return { p: [0.55, 1.95, 1.2], yaw: this.yawTo([0.55, 1.95, 1.2], [-0.7, 0.9, -0.7]), pitch: -0.36, walk: 0, fov: PORTRAIT ? 90 : 75 };
      case 'intercom': return { p: [WALL_X + 0.42, SCR[1], SCR[2]], yaw: Math.PI / 2, pitch: 0, walk: 0, fov: PORTRAIT ? 60 : 45 };
      case 'glass': return { p: [WALL_X + 1.3, 1.45, (DOOR_Z0 + DOOR_Z1) / 2], yaw: Math.PI / 2, pitch: 0.02, walk: 0 };
      case 'yard': return { p: [0.1, 1.3, -1.5], yaw: 0, pitch: 0.02, walk: 0 };
      default: return null;
    }
  }
  pov(t: number): Pov {
    const pp = this.proofPov(); if (pp) return pp;
    const T = this.T, E = ease.inOutCubic;
    const up = prog(t, T.up, T.up + 0.5, E), wk = prog(t, T.walk0, T.walk1, ease.inOutQuad), back = prog(t, T.back0, T.back1, ease.outCubic);
    const push = prog(t, T.s, T.bell1, (x) => x);
    let p: V3 = [SEAT[0], SEAT[1], SEAT[2] - 0.16 * push];
    p = [lerp(p[0], SEAT[0] - 0.15, up), lerp(p[1], EYE, up), lerp(p[2], SEAT[2] + 0.1, up)];
    p = [lerp(p[0], STAND[0], wk), p[1], lerp(p[2], STAND[2], wk)];
    p = [lerp(p[0], STAND[0] + 0.5, back), p[1], lerp(p[2], STAND[2] + 0.15, back)];
    // facing the window (yaw 0), the whip to the door (yaw +π/2 looks -x), a glance at the screen
    const toGlass = this.yawTo(p, [WALL_X, 1.5, (GL_Z0 + GL_Z1) / 2]), toScr = this.yawTo(p, SCR);
    const dy = PORTRAIT ? -0.34 : 0, dp = PORTRAIT ? -0.12 : 0;
    const yaw = keys(t, [[T.s, -0.05 + dy], [T.alone, 0.04 + dy, E], [T.whip0, 0.04 + dy], [T.whip1, Math.PI / 2 - 0.1, ease.outCubic], [T.walk0, Math.PI / 2 - 0.05, E], [T.walk1 - 0.2, toScr + 0.25, E], [T.reach1, toScr + 0.18, E], [T.bell2, toScr + 0.2], [T.bell2 + 0.35, toGlass, ease.outCubic], [T.leave1 + 1, toGlass]]);
    const pitch = keys(t, [[T.s, -0.18 + dp], [T.lampOn + 0.4, -0.08 + dp, E], [T.alone, -0.02 + dp, E], [T.whip0, -0.02 + dp], [T.whip1, 0.2, ease.outCubic], [T.walk1 - 0.2, 0.06, E], [T.reach1, 0.02, E], [T.bell2, 0.02], [T.bell2 + 0.35, 0.28, ease.outCubic], [T.leave1 + 1, 0.22]]);
    const walk = (wk > 0 && wk < 1) || (back > 0 && back < 1) ? 1 : 0;
    // the bell shakes the frame a little (the child flinches)
    const flinch = Math.exp(-Math.max(0, t - T.bell1) * 5) * (t > T.bell1 ? 1 : 0) + 0.7 * Math.exp(-Math.max(0, t - T.bell2) * 5) * (t > T.bell2 ? 1 : 0);
    return { p, yaw: yaw + 0.02 * flinch * Math.sin(t * 60), pitch: pitch + 0.015 * flinch * Math.sin(t * 47), walk };
  }

  /** The visitor behind the glass: horizontal offset (m on the glass), nearness 0..1, presence 0..1. */
  visitor(t: number) {
    const T = this.T;
    if (PROOF) return { on: 1, near: 0.5, x: 0 };
    const on = smoothstep(T.bell1 - 0.6, T.bell1 - 0.1, t) * (1 - smoothstep(T.leave0, T.leave1, t));
    const near = 0.35 + 0.35 * prog(t, T.bell2 - 0.1, T.bell2 + 0.6, ease.outCubic) - 0.25 * prog(t, T.leave0, T.leave1, ease.inCubic);
    const x = 0.05 * Math.sin(t * 0.7) - 0.25 * prog(t, T.leave0, T.leave1, ease.inQuad);
    return { on, near, x };
  }

  drawGlass(t: number, backK: number) {
    const c = this.glassCv.getContext('2d')!, w = 256, h = 320;
    const v = this.visitor(t);
    // backlit by the gate lamp: warm, brighter towards the top left
    const g = c.createLinearGradient(0, 0, w * 0.6, h);
    g.addColorStop(0, `rgba(255,190,110,${0.95 * backK})`); g.addColorStop(1, `rgba(150,95,55,${0.9 * backK})`);
    c.fillStyle = '#1a120b'; c.fillRect(0, 0, w, h);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // the visitor: head, hat brim and shoulders, blurred by the reeds (sharper when close)
    if (v.on > 0.01) {
      c.save();
      c.filter = `blur(${lerp(14, 6, v.near)}px)`;
      c.globalAlpha = v.on;
      c.fillStyle = 'rgba(12,8,6,0.93)';
      const cx = w * (0.5 + v.x), s = lerp(0.8, 1.45, v.near);
      c.beginPath(); c.ellipse(cx, h * 0.34, 38 * s, 46 * s, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(cx, h * 0.25, 62 * s, 12 * s, 0, 0, Math.PI * 2); c.fill(); // a hat brim
      c.beginPath(); c.moveTo(cx - 150 * s, h + 10); c.quadraticCurveTo(cx - 120 * s, h * 0.5, cx - 30 * s, h * 0.47); c.lineTo(cx + 30 * s, h * 0.47); c.quadraticCurveTo(cx + 120 * s, h * 0.5, cx + 150 * s, h + 10); c.closePath(); c.fill();
      c.restore();
    }
    // the reeds: vertical ribs of light and shadow
    for (let x = 0; x < w; x += 8) { const gr = c.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, 'rgba(255,240,210,0.10)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.16)'); gr.addColorStop(1, 'rgba(255,240,210,0.08)'); c.fillStyle = gr; c.fillRect(x, 0, 8, h); }
    // rain running down outside, seen as soft streaks
    const r = mulberry32(frameIdx(t) >> 3);
    for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(255,230,190,0.12)'; c.fillRect(r() * w, r() * h, 2, 20 + r() * 40); }
    this.glassTex.needsUpdate = true;
  }

  /** The intercom's question (header + buttons) comes up once the child is at the door, and goes when it backs off. */
  uiOn(t: number) { if (PROOF) return 1; const T = this.T; return smoothstep(T.walk1 - 0.45, T.walk1 - 0.3, t) * (1 - smoothstep(T.back0, T.back0 + 0.1, t)); }
  drawScreen(t: number, on: number) {
    const c = this.scrCv.getContext('2d')!, w = 480, h = 360;
    c.fillStyle = '#05080a'; c.fillRect(0, 0, w, h);
    if (on > 0.01) {
      c.save(); c.globalAlpha = on;
      // the camera picture: from above the door, fisheye; wet concrete, the lamp's pool, the visitor (hat, shoulders)
      c.save(); c.beginPath(); c.rect(10, 52, w - 20, 214); c.clip();
      const bg = c.createRadialGradient(w * 0.42, 150, 10, w * 0.5, 160, 260); bg.addColorStop(0, '#8b9690'); bg.addColorStop(1, '#1c2422'); c.fillStyle = bg; c.fillRect(0, 0, w, h);
      const v = this.visitor(t);
      // the door camera looks down and out: the visitor's hat and shoulders fill the lower half, face in the brim's shadow
      const cx = w * (0.5 + v.x * 1.2), s = lerp(0.85, 1.3, v.near), top = 110 - 30 * v.near;
      c.fillStyle = 'rgba(20,26,24,0.55)'; c.beginPath(); c.ellipse(cx + 90, 250, 120 * s, 20 * s, -0.2, 0, Math.PI * 2); c.fill();
      const coat = c.createLinearGradient(0, top + 40 * s, 0, 270); coat.addColorStop(0, '#39413d'); coat.addColorStop(1, '#161b19');
      c.fillStyle = coat; c.beginPath(); c.moveTo(cx - 150 * s, 270); c.quadraticCurveTo(cx - 130 * s, top + 70 * s, cx - 40 * s, top + 62 * s); c.lineTo(cx + 40 * s, top + 62 * s); c.quadraticCurveTo(cx + 130 * s, top + 70 * s, cx + 150 * s, 270); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(160,175,168,0.3)'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 26 * s, top + 66 * s); c.lineTo(cx - 70 * s, 270); c.moveTo(cx + 26 * s, top + 66 * s); c.lineTo(cx + 70 * s, 270); c.stroke(); // the coat's front edges, collar up
      c.fillStyle = '#070909'; c.beginPath(); c.ellipse(cx, top + 38 * s, 30 * s, 34 * s, 0, 0, Math.PI * 2); c.fill(); // the face, in shadow
      c.fillStyle = '#1d2321'; c.beginPath(); c.ellipse(cx, top + 14 * s, 64 * s, 17 * s, 0, 0, Math.PI * 2); c.fill(); // brim
      c.fillStyle = '#2b3330'; c.beginPath(); c.ellipse(cx, top + 2 * s, 36 * s, 24 * s, 0, Math.PI, 0); c.fill(); // crown
      c.strokeStyle = 'rgba(190,200,195,0.3)'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx, top + 14 * s, 64 * s, 17 * s, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      // grain, scanlines, a fisheye vignette
      const r = mulberry32(frameIdx(t));
      for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(255,255,255,${0.08 * r()})`; c.fillRect(r() * w, 52 + r() * 214, 2, 2); }
      for (let y = 52; y < 266; y += 3) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, y, w, 1); }
      const vg = c.createRadialGradient(w / 2, 159, 60, w / 2, 159, 250); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.85)'); c.fillStyle = vg; c.fillRect(0, 52, w, 214);
      c.restore();
      // the header line (mojibake) and the two buttons: a big bright one, a tiny dim one
      c.globalAlpha = on * this.uiOn(t);
      c.fillStyle = '#c9d6dc'; c.font = font(F.metro(700), 30); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(this.scrText.title, w / 2, 28, w - 30);
      const pulse = 0.85 + 0.15 * Math.sin(t * 6);
      c.fillStyle = `rgba(90,210,130,${pulse})`; c.beginPath(); c.roundRect(20, 278, 330, 70, 10); c.fill();
      c.fillStyle = '#06140a'; c.font = font(F.metro(900), 40); c.fillText(this.scrText.yes, 185, 314, 300);
      c.strokeStyle = 'rgba(160,170,175,0.5)'; c.lineWidth = 2; c.beginPath(); c.roundRect(372, 296, 88, 34, 6); c.stroke();
      c.fillStyle = 'rgba(160,170,175,0.6)'; c.font = font(F.metro(700), 20); c.fillText(this.scrText.no, 416, 314, 80);
      c.restore();
    }
    this.scrTex.needsUpdate = true;
  }

  // ================================================================ frame
  /**
   * The flashback's clock (TREATMENT r8 note 9): the world runs on its own time while the sung line stays on the
   * song's. Stutter (frames held, 6 per second) while the shape is on the glass after each ring; stretched time (0.6x)
   * as the child crosses to the door, ended by a jump cut; identity elsewhere, so both rings land on the lyric.
   */
  memT(tr: number) {
    const T = this.T;
    const stut = (a: number, b: number) => (tr >= a && tr < b ? a + Math.floor((tr - a) * 6) / 6 + (hash(Math.floor((tr - a) * 6), 9) < 0.25 ? -1 / 6 : 0) : null);
    const s1 = stut(T.bell1 + 0.12, T.bell1 + 0.9); if (s1 !== null) return Math.max(T.bell1 + 0.12, s1);
    const s2 = stut(T.bell2 + 0.2, T.bell2 + 1.4); if (s2 !== null) return Math.max(T.bell2 + 0.2, s2);
    const a = T.bell1 + 0.9, b = T.reach0;
    if (tr >= a && tr < b) return a + 0.6 * (tr - a);
    return tr;
  }
  /** The flashback's grade and its intrusions (world only; the HUD keeps its colours): hard cut in (a white frame and a punch), the memory grade (washed out,
   *  overexposed, cold, heavy grain, a breathing vignette), each ring repeated as decaying punches, a snap back out. */
  memPost(tr: number) {
    const T = this.T, s = this.ctx.start, e = this.ctx.end;
    const echoes = (b: number) => { let k = 0; for (let i = 0; i < 4; i++) { const d = tr - (b + i * 0.21); if (d >= 0 && d < 0.2) k = Math.max(k, (1 - d / 0.2) * (1 - i * 0.22)); } return k; };
    const ring = Math.max(echoes(T.bell1), echoes(T.bell2));
    const inK = 1 - smoothstep(s, s + 0.3, tr), outK = tr >= e - 1 / 60 ? 1 : 0; // one white frame: the snap back to the present
    const breathe = 0.5 + 0.5 * Math.sin((tr - s) * 2 * Math.PI * 0.9);
    return {
      sat: tr > T.home + 0.1 && tr < T.alone + 0.45 ? 0.6 : 0.32, tint: [0.92, 1.0, 1.07] as [number, number, number], lift: 0.012 + Math.max(inK > 0.8 ? 1.1 : 0, outK * 1.2, 0.3 * ring * (ring > 0.7 ? 1 : 0)), exposure: 1.22, bloom: 0.9, ca: 2.4 + 3 * ring,
      grain: 0.1 + 0.04 * breathe + 0.06 * ring, vignette: 0.55 + 0.18 * breathe,
      // the white frames of the cut in / snap out and the ring's flashes are in the world's lift, so the sung line stays readable
      zoom: 1 + 0.07 * inK + 0.035 * ring, shake: [8 * ring * Math.sin(tr * 173), 6 * ring * Math.cos(tr * 151)] as [number, number],
    };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const tr = f.t, T = this.T, { renderer } = this.ctx;
    const t = PROOF ? tr : this.memT(tr);
    this.begin();
    const P = this.pov(t);
    this.setCam(P, t, 0);
    if (!PROOF) this.cut(t, P, null, { sit: 1 - prog(t, T.up, T.up + 0.5), speed: P.walk * 1.1, look: 0 });
    const cam = this.cam;
    // the desk lamp: comes on with a stutter
    const lamp = PROOF ? 1 : t < T.lampOn ? 0 : clamp((t - T.lampOn) / 0.06) * (t < T.lampOn + 0.25 ? (hash(frameIdx(t) >> 1, 3) > 0.35 ? 1 : 0.2) : 1);
    const ring1 = tr > T.bell1 && tr < T.bell1 + 0.9 ? 1 : 0, ring2 = tr > T.bell2 && tr < T.bell2 + 1.3 ? 1 : 0; // the bell on the song's clock
    const ring = Math.max(ring1, ring2);
    const jitter = ring ? 0.93 + 0.07 * Math.sin(t * 157) : 1;
    this.deskLamp.intensity = 2.2 * lamp * jitter;
    this.lampFill.intensity = 0.35 * lamp * jitter;
    this.shadeIn.color.setRGB(LIN.lamp[0] * (0.1 + 2.4 * lamp), LIN.lamp[1] * (0.1 + 2.4 * lamp), LIN.lamp[2] * (0.1 + 2.4 * lamp), THREE.LinearSRGBColorSpace);
    const heat = 0.55 + 0.1 * Math.sin(t * 1.3);
    this.coil.color.setRGB(1.6 * heat, 0.35 * heat, 0.08 * heat, THREE.LinearSRGBColorSpace);
    this.heaterL.intensity = 0.5 * heat;
    // the bell's hammer
    this.hammer.rotation.x = ring ? 0.35 * Math.sin(tr * 2 * Math.PI * 22) : 0;
    // the handle tried from outside, twice
    const tryH = Math.max(Math.exp(-(((t - (T.bell2 + 0.25)) / 0.12) ** 2)), Math.exp(-(((t - (T.bell2 + 0.75)) / 0.12) ** 2)));
    this.handle.rotation.x = -0.55 * tryH;
    this.leaf.rotation.y = 0.004 * tryH * Math.sin(t * 90);
    // the intercom wakes on the first ring
    const scrOn = PROOF ? 1 : smoothstep(T.bell1, T.bell1 + 0.3, t) * (1 - smoothstep(T.leave1, T.leave1 + 0.4, t));
    this.screenL.intensity = 0.25 * scrOn;
    this.drawGlass(t, 1);
    this.drawScreen(t, scrOn);
    // the yard: the windows breathe (a television or two)
    {
      const ry = this.home.ry, p = this.home.toWorld([0.25, HOME.WIN.y0, -0.2]);
      this.homeCat.pose({ pos: new THREE.Vector3(...p), heading: Math.atan2(-Math.cos(ry), Math.sin(ry)), dist: 0, speed: 0, sit: 1, t, tailUp: 0.1, look: new THREE.Vector3(0, 1.2, 0), lookK: 0.6 });
    }
    this.panes.set((w, i) => (w.tv ? 0.6 + 0.4 * Math.sin(t * 7 + i) * Math.sin(t * 2.3 + i * 3) : 1));
    this.torchL.intensity = 0;
    // ---- render
    this.renderWorld(out, t, { sky: { top: scaleRGB(LIN.shadow, 0.9), horizon: mixRGB(scaleRGB(LIN.fog, 0.8), scaleRGB(LIN.smog, 0.4), 0.4), low: scaleRGB(LIN.shadow, 1.0), horizonY: 0.55, haze: 1 } });
    // glows: the gate lamp's bulb, streetlights, the metro sign's halo, far window haze
    const g = this.glow3D;
    g.add(this.gateLamp.position.x, this.gateLamp.position.y, this.gateLamp.position.z, 0.5, 0.5, LIN.sodium, 2.5, 4);
    for (let x = -80; x <= 80; x += 26) g.add(x, 7.55, -15.2, 0.45, 0.45, LIN.sodium, 1.6, 4);
    g.add(4.6, 5.6, -21.7, 1.6, 1.6, LIN.red, 0.35, 2);
    g.add(LAMP[0], LAMP[1] - 0.05, LAMP[2], 0.06, 0.06, LIN.lamp, 1.5 * lamp, 4);
    this.flushGlow(out);
    // rain in the yard
    const lb = this.lines3D;
    for (const q of this.rainPts) {
      const y = 6 - (((t * q.sp + q.ph * 6) % 6) + 6) % 6;
      const near = Math.hypot(q.x - this.gateLamp.position.x, q.z - this.gateLamp.position.z);
      const k = 0.07 + 0.35 * Math.exp(-near * 0.5);
      const col = mixRGB(scaleRGB(LIN.paper, 0.6), scaleRGB(LIN.sodium, 1.3), clamp(1.2 - near * 0.2));
      lb.seg(q.x, y, q.z, q.x + 0.03, y + 0.55, q.z, 0.8, col[0], col[1], col[2], k);
    }
    lb.render(renderer, out, cam); lb.clear();
    // ---- QA: signs and screens in the world
    const scrTxt = [this.scrText.title, this.scrText.yes].join(' / ');
    if (scrOn > 0.9 && this.uiOn(t) > 0.9) this.logPlane(this.scr, scrTxt, 'sign', { frac: [0.04, 0.02, 0.96, 0.98], minPx: 14, id: 'plane:intercom', letterFrac: 0.083 });
    // ---- the child's hands and the non-diegetic layer
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.12 + 0.3 * lamp, warm: 0.55 * lamp, torch: 0 };
    if (!PROOF && !this.third) this.drawHands(u, t, light, lamp);
    if (!PROOF) this.drawUI(u, tr, f);
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.5, ...(PROOF ? {} : this.memPost(tr)) };
  }

  drawUI(u: CanvasRenderingContext2D, t: number, f: Frame) {
    const T = this.T;
    this.heading(u, t, f);
    this.callout(u, t, homeLabel('door'), T.home + 0.15, T.alone + 0.35, () => this.onScreen(...this.home.our), { places: [city().home.name] });
  }

  /** The left hand: presses the lamp switch; later reaches for the big button and stops short. */
  drawHands(c: CanvasRenderingContext2D, t: number, light: Light, lamp: number) {
    const T = this.T, cam = this.cam;
    const arm = (pt: THREE.Vector3, k: number, fromX: number, curl: number) => {
      if (k <= 0.001) return;
      const e = project(cam, pt.x, pt.y, pt.z);
      if (e.behind) return;
      const s = 0.055 * pxAt(cam, 0.5);
      const from = { x: W * fromX, y: H + s * 3 };
      const tip = { x: lerp(from.x + s, e.x, k), y: lerp(H + s, e.y, k) };
      drawOpenHand(c, tip, from, s, light, 'point', { curl });
    };
    // the lamp switch on the lamp's base
    const sw = prog(t, T.s, T.lampOn, ease.outCubic) * (1 - prog(t, T.lampOn + 0.35, T.lampOn + 0.9, ease.inOutCubic));
    arm(new THREE.Vector3(LAMP[0] + 0.1, 0.8, LAMP[2] + 0.18), sw, PORTRAIT ? 0.62 : 0.66, 0.35);
    // the big green button: the hand comes up, hovers a few centimetres short, curls and drops
    const reach = prog(t, T.reach0, T.reach1, ease.inOutCubic) * (1 - prog(t, T.bell2 + 0.05, T.bell2 + 0.4, ease.inCubic));
    const hover = 0.06 * (1 - prog(t, T.reach1 - 0.2, T.reach1 + 0.4, ease.outCubic));
    const btn = BTN.clone().setZ(hover).applyMatrix4(this.scr.matrixWorld);
    arm(btn, reach, PORTRAIT ? 0.2 : 0.3, 0.2 + 0.6 * prog(t, T.reach1 + 0.1, T.bell2, ease.inOutQuad));
    void lamp;
  }
}

void mixRGB; void lin; void ground; void boxMesh; void logText; void keys;
export type { Box, RGB };
