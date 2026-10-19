// `close` — outro, ДОМ · 0,0 км (TREATMENT `close` read through r6 (no book) and r8 (no drone): the warm point is a
// night-light the child switches on; a real window light at home replaces the torch). Instrumental. Shots:
//   (a) from low in the dark room: the door swings open, the hall light floods in and throws the child's long
//       shadow across the parquet towards us; the child comes in, black against the light.
//   (b) first person: the child crouches and presses the night-light on by the skirting: warm light from the floor.
//   (c) from the window corner, the child standing in the warm glow before the coat on the hook: only a coat now
//       (the chalk monster tries to draw itself and fades: ПАЛЬТО).
//   (d) first person: a finger in the rotary phone's dial.
//   (b) outside, pulling back from the window: the child in silhouette at the glass with the handset, the room
//       warm behind; back and up over the dark yard while a few windows light up one by one; last frame: one
//       yellow window.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, smoothstep, keys, angleKeys, mulberry32, hash, prog } from '../engine/util';
import { homeLabel, city } from '../city';
import { drawOpenHand, pxAt, type Light } from './_hands';
import {
  LitScene, KID, lit, canvasTex, speckle, blotches, asphalt, boxMesh, cyl, ground, concreteTex, streetLight,
  panelBlock, WindowPanes, POST_BASE, LIN, scaleRGB, EYE, project, type Pov, type V3, type LitWindow,
} from './_kit';
import { Figure } from './_people';
import { buildHome, HOME } from './_home';
import { Quadruped, OUR_CAT } from './_beasts';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const FY = HOME.PLINTH + HOME.FLOOR_H; // the room's floor (second floor of the shared home block)
const RW = 1.6, RD = 3.6, RH = 2.6; // the room: half width, depth (z from -RD to 0), height
const WIN = HOME.WIN; // our window in the facade
const DOOR_X = 0.9; // the room door (in the back wall)
const NL: V3 = [RW - 0.03, FY + 0.28, -1.5]; // the night-light, low on the right wall
const HOOK: V3 = [RW - 0.06, FY + 1.78, -3.05]; // the coat hook, right wall by the door
const PHONE: V3 = [1.05, FY + 0.5, -0.55]; // the phone on a stool by the window


type Stroke = [number, number][];
function circle(cx: number, cy: number, rx: number, ry = rx, n = 18, a0 = 0): Stroke { const s: Stroke = []; for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI * 2; s.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return s; }
function zig(x0: number, x1: number, y: number, n: number, amp: number): Stroke { const s: Stroke = []; for (let i = 0; i <= n; i++) s.push([lerp(x0, x1, i / n), y + (i % 2 ? amp : -amp)]); return s; }
// the same chalk ghost the child drew over this coat in the yard (`dark`)
const GHOST: Stroke[] = [
  [[-0.05, 0], [0.02, 0.35], [-0.04, 0.7], [0.06, 1.05], [0.1, 1.18]],
  circle(0.12, 1.55, 0.34, 0.42, 20, -Math.PI / 2),
  circle(-0.02, 1.62, 0.07, 0.09, 10), circle(0.26, 1.62, 0.07, 0.09, 10),
  zig(-0.08, 0.32, 1.34, 6, 0.05),
  [[-0.32, -0.12], [-0.38, -0.55], [-0.36, -1.0]], [[0.32, -0.12], [0.38, -0.55], [0.36, -1.0]],
  zig(-0.36, 0.36, -1.02, 7, 0.06),
  [[-0.32, -0.14], [-0.6, -0.5], [-0.8, -0.95], [-0.95, -1.35]], [[-0.95, -1.35], [-1.12, -1.48]], [[-0.95, -1.35], [-1.0, -1.58]], [[-0.95, -1.35], [-0.84, -1.56]],
  [[0.32, -0.14], [0.62, -0.48], [0.84, -0.92], [0.98, -1.3]], [[0.98, -1.3], [1.16, -1.42]], [[0.98, -1.3], [1.04, -1.54]], [[0.98, -1.3], [0.86, -1.52]],
];

export default class Close extends LitScene {
  chapter = 'close';
  door!: THREE.Group;
  nlMat!: THREE.MeshStandardMaterial; nlLight!: THREE.PointLight;
  hall!: THREE.SpotLight; hallFill!: THREE.PointLight; lamp!: THREE.PointLight;
  dial!: THREE.Mesh; handset!: THREE.Group;
  kidW!: Figure;
  panes!: WindowPanes; lit0: number[] = [];
  shadowKid!: THREE.Group; lampTip!: V3;
  moon!: THREE.DirectionalLight; yard!: THREE.SpotLight;
  cat!: Quadruped;

  override init() {
    this.initLit();
    this.hemi.intensity = 0.05;
    this.fogE.density = 0.012;
    const s = this.ctx.start;
    const T: Record<string, number> = { s, end: this.ctx.end };
    const beat = (t: number) => this.au.timeOfBeat(Math.round(this.au.beatAt(t)));
    T.open = s; T.in0 = s + 0.8; T.in1 = s + 2.3; // the door opens; walk in
    T.crouch = s + 2.4; T.click = beat(s + 3.9); // the night-light
    T.coat = T.click + 0.6; T.phone = T.coat + 2.3; T.dial1 = T.phone + 0.55; T.dial2 = T.dial1 + 0.8;
    T.cut = beat(s + 9.0); // outside
    this.T = T;
    this.shots = [
      [s, T.in1 + 0.1, { k: 'free', p: [0.05, FY + 0.72, -0.35], p1: [0.1, FY + 0.74, -0.7], look: [DOOR_X - 0.05, FY + 0.95, -RD], look1: [DOOR_X - 0.2, FY + 0.85, -RD + 0.6], /* at the child's own eye level: a low camera stretched the legs into adult proportions (author r1 item 5) */ fov: PORTRAIT ? 78 : 58 }],
      [T.coat - 0.1, T.phone + 0.15, { k: 'free', /* r9 note 3: holds over the turn to the phone (A1: ПАЛЬТО ≥ 1.5 s) */ p: [-1.3, FY + 0.7, -0.35], p1: [-1.25, FY + 0.75, -0.5], look: [HOOK[0] - 0.25, FY + 1.25, HOOK[2]], fov: PORTRAIT ? 78 : 60 }],
    ];
    this.initKid(31);
    this.build();
    this.buildRoom();
    this.cat = new Quadruped(OUR_CAT, this.three, 72);
    this.kidW = new Figure(this.three, { ...KID, seed: 21 }, 64); // the same child (shared spec)
    // the child's own shadow in the doorway light (a shape that only casts shadow)
    const inv = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.shadowKid = new THREE.Group(); this.three.add(this.shadowKid);
    const part = (g: THREE.BufferGeometry, x: number, y: number, rz = 0) => { const m = new THREE.Mesh(g, inv); m.position.set(x, y, 0); m.rotation.z = rz; m.castShadow = true; this.shadowKid.add(m); };
    part(new THREE.SphereGeometry(0.13, 12, 10), 0, 1.08); part(new THREE.SphereGeometry(0.06, 8, 6), 0, 1.23); // head, hood peak
    part(new THREE.CapsuleGeometry(0.17, 0.4, 4, 8), 0, 0.7); part(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), 0.08, 0.28); part(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), -0.08, 0.28);
    part(new THREE.CapsuleGeometry(0.05, 0.38, 4, 6), 0.23, 0.72, 0.25); part(new THREE.CapsuleGeometry(0.05, 0.38, 4, 6), -0.23, 0.72, -0.25);
  }

  /** The home block's facade (panel grid with our window cut out), the yard, the blocks round it. */
  build() {
    const S = this.three;
    const { map, rough } = asphalt(211, [10, 10], { puddles: 8, base: '#222427' });
    ground(S, 120, 120, 0, 40, lit([0.6, 0.6, 0.6], { map, roughMap: rough, rough: 0.5 }));
    // our block: the shared model (the same house the child saw far off from the gatehouse in `door`)
    const home = buildHome(S, { hole: true });
    const mine: LitWindow[] = home.windows;
    boxMesh(S, 1.5, 0.04, 0.32, 0, WIN.y0 - 0.02, -0.14, lit([0.78, 0.76, 0.7], { rough: 0.6 })); // the inner sill (the cat's place)
    const others = [
      ...panelBlock(S, { cx: 0, cz: 44, len: 60, floors: 5, ang: 0, seed: 216, litRate: 0.3 }),
      ...panelBlock(S, { cx: -32, cz: 16, len: 40, floors: 5, ang: Math.PI / 2, seed: 217, litRate: 0.3 }),
      ...panelBlock(S, { cx: 32, cz: 16, len: 40, floors: 5, ang: -Math.PI / 2, seed: 218, litRate: 0.3 }),
      ...panelBlock(S, { cx: 10, cz: 90, len: 60, floors: 12, ang: 0.2, seed: 219, litRate: 0.25 }),
    ];
    const all = [...mine, ...others];
    this.panes = new WindowPanes(S, all, [1.3, 1.4]);
    // which windows come back on at the end, and when (a few, one by one); the rest stay dark
    this.lit0 = all.map((_, i) => (hash(i, 31) < (i < mine.length ? 0.22 : 0.3) ? hash(i, 32) : -1));
    // a few trees and a lamp in the yard (dead)
    const trunk = lit([0.12, 0.1, 0.08], { rough: 1 });
    for (const [x, z] of [[-9, 12], [7, 18], [-3, 26]] as const) { cyl(S, [x, 0, z], [x, 5, z], 0.14, trunk, { r1: 0.07, seg: 6 }); for (let b = 0; b < 5; b++) { const a = b * 1.3 + x; cyl(S, [x, 3 + b * 0.4, z], [x + Math.cos(a) * 1.6, 4.4 + b * 0.5, z + Math.sin(a) * 1.6], 0.04, trunk, { seg: 4, cast: false }); } }
    const lampTip = this.lampTip = streetLight(S, 4, 8, { h: 6, arm: [0, 0, -1.2] });
    this.yard = this.addLamp(lampTip, { k: 0, color: [0.72, 0.82, 1], angle: 0.95, penumbra: 0.7, shadow: true, target: [3, 0, 5] });
    this.moon = new THREE.DirectionalLight(new THREE.Color().setRGB(0.55, 0.62, 0.85, THREE.LinearSRGBColorSpace), 0); this.moon.position.set(-20, 30, 40); S.add(this.moon);
    void W; void H;
  }

  buildRoom() {
    const S = this.three;
    const wp = canvasTex(256, 256, (c) => {
      c.fillStyle = '#8a7f64'; c.fillRect(0, 0, 256, 256);
      c.strokeStyle = 'rgba(70,60,40,0.55)'; c.lineWidth = 2;
      for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { const ox = (y / 64) % 2 ? 32 : 0; c.beginPath(); c.ellipse(x + ox + 32, y + 32, 10, 18, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x + ox + 32, y + 50); c.lineTo(x + ox + 32, y + 62); c.stroke(); }
      for (let x = 0; x < 256; x += 32) { c.fillStyle = 'rgba(255,240,200,0.05)'; c.fillRect(x, 0, 3, 256); }
      speckle(c, 256, 256, 2000, 0.1, 221);
    }, { repeat: [3, 2] });
    const wallM = lit([0.8, 0.8, 0.8], { map: wp, rough: 0.95 });
    const park = canvasTex(256, 256, (c) => {
      c.fillStyle = '#5a3a20'; c.fillRect(0, 0, 256, 256);
      for (let y = -32; y < 288; y += 32) for (let x = -64; x < 320; x += 64) { const k = hash(x, y) * 0.3; c.fillStyle = `rgba(${120 + k * 100},${80 + k * 60},${40 + k * 30},0.9)`; c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillRect(0, 0, 44, 14); c.restore(); c.save(); c.translate(x + 32, y + 32); c.rotate(-Math.PI / 4); c.fillRect(0, 0, 44, 14); c.restore(); }
      speckle(c, 256, 256, 3000, 0.15, 222);
    }, { repeat: [3, 3] });
    const floorM = lit([0.7, 0.7, 0.7], { map: park, rough: 0.5 });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * RW, RD), floorM); fl.rotation.x = -Math.PI / 2; fl.position.set(0, FY + 0.001, -RD / 2); fl.receiveShadow = true; S.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(2 * RW, RD), lit([0.6, 0.6, 0.58], { rough: 1 })); ce.rotation.x = Math.PI / 2; ce.position.set(0, FY + RH, -RD / 2); S.add(ce);
    const side = (x: number, ry: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(RD, RH), wallM); m.position.set(x, FY + RH / 2, -RD / 2); m.rotation.y = ry; m.receiveShadow = true; S.add(m); };
    side(-RW, Math.PI / 2); side(RW, -Math.PI / 2);
    // the inner window wall (wallpaper) with the window opening, and the back wall with the door opening
    const inner = new THREE.Shape(); inner.moveTo(-RW, FY); inner.lineTo(RW, FY); inner.lineTo(RW, FY + RH); inner.lineTo(-RW, FY + RH); inner.closePath();
    const ih = new THREE.Path(); ih.moveTo(WIN.x0, WIN.y0); ih.lineTo(WIN.x0, WIN.y1); ih.lineTo(WIN.x1, WIN.y1); ih.lineTo(WIN.x1, WIN.y0); ih.closePath(); inner.holes.push(ih);
    const wpi = wp.clone(); wpi.repeat.set(1, 1); wpi.needsUpdate = true;
    const iw = new THREE.Mesh(new THREE.ShapeGeometry(inner), lit([0.8, 0.8, 0.8], { map: wpi, rough: 0.95 })); iw.rotation.y = Math.PI; iw.position.z = -0.001; iw.receiveShadow = true; S.add(iw);
    // the back wall in three pieces round the door (a hole touching the outline breaks the triangulation)
    const bwM = lit([0.8, 0.8, 0.8], { map: wpi, rough: 0.95 }); bwM.side = THREE.DoubleSide;
    const bwPiece = (x0: number, x1: number, y0: number, y1: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), bwM); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, -RD); const pa = m.geometry.attributes.position!, uv = m.geometry.attributes.uv!; for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) + (x0 + x1) / 2, pa.getY(i) + (y0 + y1) / 2); m.receiveShadow = true; m.castShadow = true; S.add(m); };
    bwPiece(-RW - 1, DOOR_X - 0.42, FY, FY + RH); bwPiece(DOOR_X + 0.42, RW + 1, FY, FY + RH); bwPiece(DOOR_X - 0.42, DOOR_X + 0.42, FY + 2.05, FY + RH);
    // the hall behind the door: a short corridor lit warm
    boxMesh(S, 3, 0.02, 3, DOOR_X, FY - 0.01, -RD - 1.5, floorM, { cast: false });
    boxMesh(S, 0.05, RH, 3, DOOR_X - 0.9, FY + RH / 2, -RD - 1.5, wallM, { cast: false }); boxMesh(S, 0.05, RH, 3, DOOR_X + 0.9, FY + RH / 2, -RD - 1.5, wallM, { cast: false });
    boxMesh(S, 1.9, 0.05, 3.1, DOOR_X, FY + RH, -RD - 1.5, lit([0.5, 0.5, 0.48], { rough: 1 }), { cast: false });
    boxMesh(S, 3, RH, 0.05, DOOR_X, FY + RH / 2, -RD - 3, wallM, { cast: false });
    this.hall = new THREE.SpotLight(new THREE.Color().setRGB(1, 0.78, 0.5, THREE.LinearSRGBColorSpace), 0, 12, 0.6, 0.6, 2);
    this.hall.position.set(DOOR_X - 0.2, FY + 2.3, -RD - 1.9); this.hall.target.position.set(DOOR_X - 0.5, FY, -1.2);
    this.hall.castShadow = true; this.hall.shadow.mapSize.set(1024, 1024); this.hall.shadow.bias = -0.0005; this.hall.shadow.camera.near = 0.2; this.hall.shadow.camera.far = 14;
    S.add(this.hall, this.hall.target);
    // the hall itself glows behind the child (no shadows: it only fills the doorway)
    this.hallFill = new THREE.PointLight(new THREE.Color().setRGB(1, 0.74, 0.45, THREE.LinearSRGBColorSpace), 0, 5, 2); this.hallFill.position.set(DOOR_X - 0.1, FY + 2.2, -RD - 2.2); S.add(this.hallFill);
    // the door leaf, hinged on its left edge, opening into the room
    this.door = new THREE.Group(); this.door.position.set(DOOR_X - 0.41, FY, -RD); S.add(this.door);
    const doorTex = canvasTex(128, 320, (c) => {
      c.fillStyle = '#b9ad94'; c.fillRect(0, 0, 128, 320);
      for (const [y0, h] of [[20, 120], [170, 130]] as const) { c.fillStyle = 'rgba(60,50,35,0.35)'; c.fillRect(16, y0, 96, h); c.fillStyle = '#c2b69c'; c.fillRect(20, y0 + 4, 88, h - 8); c.strokeStyle = 'rgba(255,250,235,0.35)'; c.lineWidth = 2; c.strokeRect(21, y0 + 5, 86, h - 10); }
      speckle(c, 128, 320, 1500, 0.12, 224); blotches(c, 128, 320, 6, () => 'rgba(80,70,50,0.12)', 6, 24, 225);
    });
    boxMesh(this.door, 0.8, 2.02, 0.04, 0.4, 1.01, 0, lit([0.8, 0.8, 0.8], { map: doorTex, rough: 0.6 }));
    this.door.children.forEach((m) => { m.castShadow = false; });
    cyl(this.door, [0.72, 1.0, 0.03], [0.72, 1.0, 0.12], 0.015, lit([0.7, 0.65, 0.5], { metal: 0.8, rough: 0.3 }), { seg: 6 });
    // the bed on the left wall, a carpet above it, a pillow, a blanket
    boxMesh(S, 0.9, 0.3, 2.0, -RW + 0.47, FY + 0.15, -2.3, lit([0.35, 0.24, 0.14], { rough: 0.7 }));
    boxMesh(S, 0.86, 0.14, 1.96, -RW + 0.47, FY + 0.37, -2.3, lit([0.2, 0.28, 0.45], { rough: 0.95 }));
    boxMesh(S, 0.6, 0.12, 0.4, -RW + 0.47, FY + 0.5, -3.05, lit([0.75, 0.72, 0.66], { rough: 0.95 }));
    const carpet = canvasTex(256, 384, (c) => {
      c.fillStyle = '#6a1a18'; c.fillRect(0, 0, 256, 384);
      c.strokeStyle = '#c89a4a'; c.lineWidth = 6; c.strokeRect(10, 10, 236, 364); c.lineWidth = 3; c.strokeRect(24, 24, 208, 336);
      c.fillStyle = '#1a2a4a'; c.beginPath(); c.moveTo(128, 60); c.lineTo(210, 192); c.lineTo(128, 324); c.lineTo(46, 192); c.closePath(); c.fill();
      c.strokeStyle = '#d8b060'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#b8402a'; c.beginPath(); c.moveTo(128, 120); c.lineTo(170, 192); c.lineTo(128, 264); c.lineTo(86, 192); c.closePath(); c.fill();
      for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#d8b060' : '#2a5a4a'; c.fillRect(36 + (i % 6) * 32, i < 6 ? 36 : 334, 16, 14); }
      speckle(c, 256, 384, 4000, 0.18, 223);
    });
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), lit([0.8, 0.8, 0.8], { map: carpet, rough: 1 })); cp.position.set(-RW + 0.01, FY + 1.35, -2.3); cp.rotation.set(0, Math.PI / 2, Math.PI / 2); S.add(cp);
    // the coat on its hook (the same wool coat as in the yard)
    const coat = lit([0.36, 0.3, 0.24], { rough: 0.95 });
    cyl(S, [RW, HOOK[1], HOOK[2]], [RW - 0.1, HOOK[1] + 0.02, HOOK[2]], 0.01, lit([0.6, 0.55, 0.4], { metal: 0.8, rough: 0.3 }), { seg: 4 });
    const cg = new THREE.Group(); cg.position.set(HOOK[0] - 0.13, HOOK[1], HOOK[2]); cg.rotation.y = Math.PI / 2; S.add(cg);
    const bodyG = new THREE.CylinderGeometry(0.18, 0.27, 0.9, 12, 1, true); bodyG.scale(1, 1, 0.45);
    const body = new THREE.Mesh(bodyG, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.36, 0.3, 0.24, THREE.LinearSRGBColorSpace), roughness: 0.95, side: THREE.DoubleSide })); body.position.y = -0.52; body.castShadow = true; cg.add(body);
    body.castShadow = false; // grazing hall light would throw its shadow down the whole wall
    boxMesh(cg, 0.4, 0.07, 0.14, 0, -0.08, 0, coat);
    for (const sx of [-1, 1]) cyl(cg, [sx * 0.19, -0.1, 0], [sx * 0.24, -0.72, 0.02], 0.055, coat, { r1: 0.065, seg: 8 });
    cg.traverse((m) => { m.castShadow = false; });
    // the night-light: a socket plate and a little plastic moon
    boxMesh(S, 0.02, 0.09, 0.09, RW - 0.01, NL[1], NL[2], lit([0.85, 0.83, 0.78], { rough: 0.5 }));
    this.nlMat = new THREE.MeshStandardMaterial({ color: 0xf0e2c0, roughness: 0.4, emissive: new THREE.Color().setRGB(1, 0.72, 0.35, THREE.LinearSRGBColorSpace), emissiveIntensity: 0 });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12, 0, Math.PI), this.nlMat); moon.position.set(NL[0] - 0.02, NL[1], NL[2]); moon.rotation.y = -Math.PI / 2; S.add(moon);
    this.nlLight = new THREE.PointLight(new THREE.Color().setRGB(1, 0.66, 0.32, THREE.LinearSRGBColorSpace), 0, 7, 2);
    this.nlLight.position.set(NL[0] - 0.12, NL[1] + 0.02, NL[2]); this.nlLight.castShadow = true; this.nlLight.shadow.mapSize.set(512, 512); this.nlLight.shadow.bias = -0.002; S.add(this.nlLight);
    // a stool by the window with a rotary phone (base, dial, handset in its cradle)
    boxMesh(S, 0.34, 0.03, 0.34, PHONE[0], PHONE[1] - 0.02, PHONE[2], lit([0.4, 0.28, 0.16], { rough: 0.6 }));
    for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.14], [0.14, 0.14], [-0.14, 0.14]] as const) cyl(S, [PHONE[0] + dx, FY, PHONE[2] + dz], [PHONE[0] + dx, PHONE[1] - 0.03, PHONE[2] + dz], 0.015, lit([0.4, 0.28, 0.16], { rough: 0.6 }), { seg: 5 });
    const red = lit([0.5, 0.06, 0.05], { rough: 0.35 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.06, 0.22), red); base.position.set(PHONE[0], PHONE[1] + 0.03, PHONE[2]); base.castShadow = true; S.add(base);
    const slope = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.06, 0.2), red); slope.position.set(PHONE[0], PHONE[1] + 0.075, PHONE[2] + 0.01); slope.rotation.x = -0.45; slope.castShadow = true; S.add(slope);
    for (const sx of [-1, 1]) boxMesh(S, 0.025, 0.05, 0.03, PHONE[0] + sx * 0.08, PHONE[1] + 0.12, PHONE[2] + 0.02, red); // the cradle forks
    const dialTex = canvasTex(128, 128, (c) => { c.fillStyle = '#d8d2c2'; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill(); c.fillStyle = '#6a1210'; c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill(); c.fillStyle = '#e8e2d2'; for (let i = 0; i < 10; i++) { const a = -Math.PI * 0.62 + i * 0.52; c.beginPath(); c.arc(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42, 10, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#f0ead8'; c.beginPath(); c.arc(64, 64, 20, 0, Math.PI * 2); c.fill(); });
    this.dial = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), lit([0.9, 0.9, 0.9], { map: dialTex, rough: 0.4 }));
    const dg = new THREE.Group(); dg.position.set(PHONE[0], PHONE[1] + 0.106, PHONE[2] + 0.005); S.add(dg); dg.lookAt(PHONE[0], PHONE[1] + 0.098 + 0.9, PHONE[2] - 0.045 - 0.435); dg.add(this.dial);
    this.handset = new THREE.Group(); this.handset.position.set(PHONE[0], PHONE[1] + 0.13, PHONE[2] - 0.01); S.add(this.handset);
    cyl(this.handset, [-0.09, 0, 0], [0.09, 0, 0], 0.017, red, { seg: 8 });
    for (const sx of [-1, 1]) { const cup = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), red); cup.scale.set(1, 0.7, 1); cup.position.set(sx * 0.1, -0.012, 0); this.handset.add(cup); }
    // the room's lamp (on, in the last shot)
    this.lamp = new THREE.PointLight(new THREE.Color().setRGB(1, 0.74, 0.42, THREE.LinearSRGBColorSpace), 0, 9, 2); this.lamp.position.set(-0.4, FY + 1.92, -2.2); S.add(this.lamp);
    cyl(S, [-0.4, FY + RH, -2.2], [-0.4, FY + 2.25, -2.2], 0.008, lit([0.2, 0.2, 0.2]), { seg: 4 });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 0.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.8, side: THREE.DoubleSide, emissive: new THREE.Color(0xffb060), emissiveIntensity: 0 })); shade.position.set(-0.4, FY + 2.15, -2.2); S.add(shade);
    (this as unknown as { shade: THREE.Mesh }).shade = shade;
  }

  camIn(t: number): V3 {
    const T = this.T;
    const z = lerp(-RD - 1.35, -2.25, ease.inOutCubic(prog(t, T.in0, T.in1 + 0.3)));
    const x = lerp(DOOR_X + 0.12, 0.55, ease.inOutCubic(prog(t, T.in0, T.in1 + 0.3)));
    const y = FY + lerp(EYE, 0.55, ease.inOutCubic(prog(t, T.crouch, T.crouch + 0.8)) - ease.inOutCubic(prog(t, T.click + 0.35, T.coat + 0.5)) * 0.8);
    const zz = z + 0.9 * ease.inOutSine(prog(t, T.phone - 0.3, T.phone + 0.8));
    const back = ease.inOutCubic(prog(t, T.click + 0.3, T.coat + 0.4)) * (1 - ease.inOutSine(prog(t, T.phone - 0.3, T.phone + 0.8)));
    return [x - 0.75 * back + 0.25 * ease.inOutSine(prog(t, T.phone - 0.3, T.phone + 0.8)), y, zz + 0.6 * back];
  }

  pov(t: number): Pov {
    const T = this.T, P = PORTRAIT, E = ease.inOutSine; // r9 note 3: the gentlest in-out for the head turns
    if (PROOF === 'room') { const p: V3 = [-0.9, FY + 1.9, -RD + 0.3]; return { p, yaw: this.yawTo(p, [0.6, FY + 0.6, -0.6]), pitch: -0.35, walk: 0, fov: P ? 80 : 66 }; }
    if (PROOF === 'phone') { const p: V3 = [PHONE[0] - 0.55, PHONE[1] + 0.35, PHONE[2] - 0.5]; return { p, yaw: this.yawTo(p, PHONE), pitch: -0.45, walk: 0, fov: P ? 50 : 36 }; }
    if (PROOF === 'nightlight') { const p: V3 = [NL[0] - 0.8, NL[1] + 0.3, NL[2] + 0.5]; return { p, yaw: this.yawTo(p, NL), pitch: -0.3, walk: 0, fov: P ? 50 : 36 }; }
    if (PROOF === 'facade') { const p: V3 = [6, 7, 24]; return { p, yaw: this.yawTo(p, [0, 5, 0]), pitch: this.pitchTo(p, [0, 5.5, 0]), walk: 0, fov: P ? 70 : 50 }; }
    if (PROOF === 'kid') { const p: V3 = [0.9, FY + 1.1, -1.9]; return { p, yaw: this.yawTo(p, [0, FY + 0.7, -0.4]), pitch: -0.05, walk: 0, fov: P ? 64 : 46 }; }
    if (t < T.cut) {
      const cam = this.camIn(t);
      const toWin: V3 = [0, (WIN.y0 + WIN.y1) / 2, 0];
      const toNL = this.yawTo(cam, NL), upNL = this.pitchTo(cam, NL);
      const toCoat = this.yawTo(cam, [HOOK[0] - 0.13, HOOK[1] - 0.4, HOOK[2]]), upCoat = this.pitchTo(cam, [HOOK[0] - 0.13, HOOK[1] - 0.35, HOOK[2]]);
      const toPhone = this.yawTo(cam, PHONE), upPhone = this.pitchTo(cam, PHONE);
      const wy = this.yawTo(cam, toWin);
      const yaw = angleKeys(t, [[T.s, Math.PI + 0.02], [T.in1, wy + (P ? 0 : 0.05), E], [T.crouch + 0.95, toNL + (P ? 0.1 : 0.25), E], [T.click + 0.1, toNL + (P ? 0.08 : 0.2), E], [T.coat + 1.0, toCoat + (P ? 0.1 : 0.3), E], [T.phone - 0.3, toPhone + (P ? -0.05 : -0.15), E], [T.phone + 0.8, toPhone + (P ? -0.05 : -0.15), E] /* r9 note 3: the coat→phone turn (120°) happens under the coat insert; after its cut the head only drifts */, [T.cut, toPhone + (P ? -0.05 : -0.2), E]]);
      const pitch = keys(t, [[T.s, 0.0], [T.in1, 0.02, E], [T.crouch + 0.95, upNL + (P ? 0.12 : 0.2), E], [T.click + 0.1, upNL + (P ? 0.12 : 0.22), E], [T.coat + 1.0, upCoat, E], [T.phone - 0.3, upPhone + (P ? 0.12 : 0.2), E], [T.phone + 0.8, upPhone + (P ? 0.12 : 0.2), E], [T.cut, upPhone + (P ? 0.14 : 0.24), E]]);
      const walk = smoothstep(T.in0, T.in0 + 0.2, t) * (1 - smoothstep(T.in1, T.in1 + 0.3, t));
      return { p: cam, yaw, pitch, walk, fov: P ? 76 : 60 };
    }
    // outside: from the glass, back and up over the yard; the last frame holds our window
    const u = ease.inOutCubic(prog(t, T.cut, T.end - 1.8)); // then hold on our window
    const p: V3 = [lerp(0.25, -0.5, u), lerp(WIN.y0 + 0.6, 5.6, u), lerp(1.5, 9.5, u)];
    const target: V3 = [0, lerp(WIN.y0 + 0.55, P ? 4.75 : 4.95, u), 0];
    return { p, yaw: this.yawTo(p, target), pitch: this.pitchTo(p, target) + (P ? 0.04 : 0.02) * u, walk: 0, fov: lerp(P ? 64 : 48, P ? 44 : 26, u) };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    const outside = t >= T.cut && !['room', 'phone', 'nightlight', 'kid'].includes(PROOF ?? '');
    this.fogE.color.setRGB(0.015, 0.016, 0.024);
    // the door, the hall light, the night-light, the lamp, the windows coming back
    this.door.rotation.y = -(0.42 + ease.inOutCubic(prog(t, T.open + 0.1, T.open + 1.0)) * 1.3);
    this.hall.intensity = t < T.cut ? 45 * smoothstep(T.open - 0.05, T.open + 0.35, t) : 0;
    this.hallFill.intensity = this.hall.intensity * 0.3;
    const nl = PROOF ? 1 : smoothstep(T.click, T.click + 0.12, t) * (t < T.click + 0.3 ? (hash(Math.floor(t * 30), 4) < 0.7 ? 1 : 0.4) : 1);
    this.nlMat.emissiveIntensity = 2.2 * nl; this.nlLight.intensity = 2.4 * nl;
    const lampK = outside ? smoothstep(T.cut, T.cut + 0.4, t) : PROOF === 'facade' ? 1 : 0;
    this.lamp.intensity = 12 * lampK; ((this as unknown as { shade: THREE.Mesh }).shade.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.55 * lampK; // a soft shade, not a flaring bulb (author r1 item 4)
    const w0 = T.cut + 0.9, w1 = T.end - 1.2;
    const ou = outside ? smoothstep(T.cut, T.cut + 2.5, t) : PROOF === 'facade' ? 1 : 0;
    this.moon.intensity = 0.35 * ou; this.hemi.intensity = 0.05 + 0.12 * ou;
    const yk = outside ? smoothstep(T.cut + 2.6, T.cut + 2.75, t) * (t < T.cut + 3.1 ? (hash(Math.floor(t * 24), 7) < 0.6 ? 1 : 0.2) : 1) : PROOF === 'facade' ? 1 : 0;
    this.yard.intensity = 12 * yk; // the yard lamp stays dimmer and cooler than our window
    this.panes.set((_, i) => { const a = this.lit0[i]!; if (a < 0) return 0; const tt = w0 + a * (w1 - w0); return 0.42 * smoothstep(tt, tt + 0.25, t) * (hash(i, 33) < 0.1 ? 0.8 + 0.2 * hash(Math.floor(t * 8), i) : 1); });
    // dialing: the dial turns and springs back twice
    const d1 = prog(t, T.dial1, T.dial1 + 0.35) - prog(t, T.dial1 + 0.4, T.dial1 + 0.8), d2 = prog(t, T.dial2, T.dial2 + 0.3) - prog(t, T.dial2 + 0.35, T.dial2 + 0.7);
    this.dial.rotation.z = -(d1 * 2.2 + d2 * 1.4);
    // the child at the window with the handset (outside shot), else hidden; the handset leaves its cradle
    const kidOn = outside || PROOF === 'kid';
    this.kidW.g.visible = kidOn;
    if (kidOn) this.kidW.pose({ pos: new THREE.Vector3(0.05, FY, -0.42), heading: -Math.PI / 2 + 0.15, t, phone: 1, headDown: -0.15, look: 0.1 });
    if (kidOn) { this.handset.position.copy(this.kidW.hR).add(new THREE.Vector3(0, 0.05, 0.02)); this.handset.rotation.set(0.4, 0, 1.2); }
    else if (t > T.dial2 + 0.7) { const k = ease.inOutCubic(prog(t, T.dial2 + 0.7, Math.max(T.cut, T.dial2 + 1.2))); this.handset.position.set(PHONE[0] - 0.05 * k, PHONE[1] + 0.13 + 0.25 * k, PHONE[2] - 0.01 - 0.1 * k); this.handset.rotation.set(0, 0, 0.6 * k); }
    const P = this.pov(t);
    this.setCam(P, t, P.walk);
    const cam = this.cam;
    this.shadowKid.visible = false;
    this.shadowKid.position.set(cam.position.x, FY, cam.position.z + 0.05); this.shadowKid.rotation.y = P.yaw;
    const pose = this.torch(t, { raise: outside || PROOF ? 0 : 1 - smoothstep(T.crouch, T.crouch + 0.5, t), on: 0, walk: P.walk });
    const held = t >= T.coat - 0.1 && t < T.phone - 0.2; // the cat in the child's arms (the window-corner shot)
    if (!PROOF && !outside) this.cut(t, P, null, { floor: FY, speed: P.walk * 1.1, look: 0, headDown: held ? 0.35 : 0, ...(held ? { phone: 0.55, armL: 0.55 } : {}) });
    else if (this.kid) { this.kid.visible = false; this.third = false; }
    // crouched at the night-light the standing shadow would swallow the wall: fold it away
    const crouchK = ease.inOutCubic(prog(t, T.crouch - 0.2, T.crouch + 0.4)) * (1 - ease.inOutCubic(prog(t, T.coat + 0.2, T.coat + 0.8)));
    this.shadowKid.scale.set(1, Math.max(0.05, 1 - crouchK), 1);
    this.shadowKid.visible = !outside && !PROOF && !this.third && crouchK < 0.95;
    this.poseCat(t, held && !!this.kid && this.third, P);
    this.renderWorld(out, t, { sky: { top: [0.012, 0.014, 0.026], horizon: scaleRGB(LIN.smog, 0.1), low: scaleRGB(LIN.shadow, 0.6), horizonY: 0.5, haze: 1 } });
    const g = this.glow3D;
    if (nl > 0) { const dn = Math.hypot(cam.position.x - NL[0], cam.position.y - NL[1], cam.position.z - NL[2]); g.add(NL[0] - 0.08, NL[1], NL[2], 0.11, 0.11, [1, 0.7, 0.35], 0.8 * nl * clamp(dn / 2.2, 0.3, 1), 3); }
    if (lampK > 0) { const fz = clamp((cam.position.z - 6) / 10); g.add(0, (WIN.y0 + WIN.y1) / 2, 1.2, 1.3, 1.2, [1, 0.7, 0.34], 0.3 * lampK * fz, 2.5); g.add(0, (WIN.y0 + WIN.y1) / 2, 0.5, 3.2, 2.6, [1, 0.66, 0.3], 0.08 * lampK * fz, 1.6); }
    if (yk > 0) g.add(this.lampTip[0], this.lampTip[1] - 0.1, this.lampTip[2] + 0.5, 0.4, 0.28, [0.7, 0.8, 1], 0.18 * yk, 2.5);
    this.flushGlow(out);
    // ---- the chalk ghost tries to draw itself on the coat and fades in the light; hands; callouts
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.08 + 0.3 * nl, warm: 0.1 + 0.5 * nl, torch: 0 };
    if (!PROOF && !outside) {
      const gk = prog(t, T.coat - 0.15, T.coat + 0.55, ease.outCubic) * 0.75, ga = (1 - smoothstep(T.coat + 0.5, T.coat + 1.2, t)) * 0.8;
      this.ghost(u, t, gk, ga);
      if (!this.third) { this.torchHand(u, pose, light); this.reach(u, t, light); }
      this.callout(u, t, homeLabel('close'), T.open + 0.3, T.open + 2.3, () => this.onScreen(DOOR_X - 0.75, FY + 2.15, -RD + 0.02), { places: [city().home.name] }); // on the dark wall above and left of the doorway, clear of the child's head (author r1 item 4)
      this.callout(u, t, 'ПАЛЬТО', T.coat + 0.35, T.phone + 0.1, () => this.onScreen(HOOK[0] - 0.13, HOOK[1] - 0.45, HOOK[2]));
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.55 };
  }

  /**
   * The cat waited at home (TREATMENT r8 note 8): sitting on the floor facing the door when it opens, it gets up and
   * trots to the child, rubs round its legs and against it at the night-light, is in its arms by the coat, then sits
   * on the sill by the phone; from outside it is the second shape in our window.
   */
  poseCat(t: number, held: boolean, P: Pov) {
    const T = this.T, E = ease.inOutCubic;
    const at = (x: number, z: number) => new THREE.Vector3(x, FY, z);
    const head = (d: THREE.Vector3) => Math.atan2(-d.z, d.x); // the body's +x along d
    if (held && this.kid) {
      // hugged to the chest, its head over the child's shoulder, looking back at us (reads from behind)
      const k = this.kid, f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), rgt = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
      const p = k.headW.clone().addScaledVector(f, 0.02).addScaledVector(rgt, -0.13); p.y -= 0.36;
      const back = f.clone().negate();
      this.cat.pose({ pos: p, heading: Math.atan2(-back.z, back.x), dist: 0, speed: 0, sit: 1, t, tailUp: 0, pitch: 0.25, lookK: 0.8, look: this.cam.position.clone() });
      return;
    }
    if (t >= T.phone - 0.2) {
      // on the sill by the phone, and from outside next to the child in our window
      this.cat.pose({ pos: new THREE.Vector3(-0.42, WIN.y0 + 0.005, -0.2), heading: -Math.PI / 2 + 0.35, dist: 0, speed: 0, sit: 1, t, tailUp: 0.15, look: new THREE.Vector3(0.05, FY + 1.0, -0.42), lookK: 0.5 });
      return;
    }
    const wait = at(0.3, -1.55), door = new THREE.Vector3(DOOR_X, FY, -RD);
    const kid = (tt: number) => { const c = this.camIn(tt); return at(c[0], c[2]); };
    if (t < T.open + 0.55) { // waiting: sitting, facing the door; ears up when the light floods in
      this.cat.pose({ pos: wait, heading: head(door.clone().sub(wait)), dist: 0, speed: 0, sit: 1 - smoothstep(T.open + 0.35, T.open + 0.55, t), t, tailUp: 0.3, look: door.clone().setY(FY + 1.0), lookK: 1 });
      return;
    }
    if (t < T.in1 + 0.2) { // trots to meet the child
      const u = E(smoothstep(T.open + 0.55, T.in1 + 0.2, t));
      const goal = kid(Math.min(t + 0.3, T.in1)).add(new THREE.Vector3(-0.25, 0, 0.15));
      const p = wait.clone().lerp(goal, u);
      const d = goal.clone().sub(wait);
      this.cat.pose({ pos: p, heading: head(d), dist: d.length() * u, speed: 1.4, t, tailUp: 1, look: kid(t).setY(FY + 0.9), lookK: 0.6 });
      return;
    }
    // rubbing: figure-eights round the child's legs, then along its knee as it crouches at the night-light
    const c = kid(t), tt = t - T.in1 - 0.2;
    const a = tt * 3.2, r0 = 0.24;
    const crouch = smoothstep(T.crouch, T.crouch + 0.6, t);
    const toNL = new THREE.Vector3(NL[0], FY, NL[2]).sub(c).normalize();
    const side = new THREE.Vector3(-toNL.z, 0, toNL.x);
    const p = c.clone().add(new THREE.Vector3(Math.cos(a) * r0, 0, Math.sin(a * 2) * r0 * 0.6)).lerp(c.clone().addScaledVector(toNL, 0.62).addScaledVector(side, 0.14 * Math.sin(tt * 2.2)), crouch);
    const tan = new THREE.Vector3(-Math.sin(a) * r0, 0, Math.cos(a * 2) * r0 * 1.2).lerp(side.clone().multiplyScalar(Math.cos(tt * 2.2)), crouch);
    this.cat.pose({ pos: p, heading: head(tan), dist: tt * 0.5, speed: 0.5, t, tailUp: 1, look: this.cam.position.clone(), lookK: 0.7 * crouch });
  }

  ghost(c: CanvasRenderingContext2D, t: number, k: number, alpha: number) {
    if (k <= 0.001 || alpha <= 0.01) return;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cam.quaternion); right.y = 0; right.normalize();
    const A: V3 = [HOOK[0] - 0.15, HOOK[1] - 0.22, HOOK[2]], SC = 0.4;
    const pts = GHOST.map((s) => s.map(([x, y]) => project(this.cam, A[0] + right.x * x * SC, A[1] + y * SC, A[2] + right.z * x * SC)));
    const f = Math.floor(t * 8), wob = (i: number, j: number) => (hash(f * 131 + i * 17 + j, 5) - 0.5) * (PORTRAIT ? 5 : 4);
    const total = pts.reduce((a, s) => a + s.slice(1).reduce((b, p, i) => b + Math.hypot(p.x - s[i]!.x, p.y - s[i]!.y), 0), 0);
    let budget = total * k;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = `rgba(250,238,205,${alpha})`; c.lineWidth = PORTRAIT ? 6 : 5; c.shadowColor = `rgba(255,220,150,${0.7 * alpha})`; c.shadowBlur = 14;
    for (const [i, s] of pts.entries()) {
      if (budget <= 0 || s.some((p) => p.behind)) continue;
      c.beginPath(); c.moveTo(s[0]!.x + wob(i, 0), s[0]!.y + wob(i, 1));
      for (let j = 1; j < s.length && budget > 0; j++) { const seg = Math.hypot(s[j]!.x - s[j - 1]!.x, s[j]!.y - s[j - 1]!.y); const q = Math.min(1, budget / Math.max(seg, 1e-3)); c.lineTo(lerp(s[j - 1]!.x, s[j]!.x, q) + wob(i, j * 2), lerp(s[j - 1]!.y, s[j]!.y, q) + wob(i, j * 2 + 1)); budget -= seg; }
      c.stroke();
    }
    c.restore();
  }

  /** The free hand: to the night-light switch, then to the phone's dial. */
  reach(c: CanvasRenderingContext2D, t: number, light: Light) {
    const T = this.T;
    const k1 = prog(t, T.click - 0.55, T.click - 0.05, ease.outCubic) * (1 - prog(t, T.click + 0.3, T.click + 0.8, ease.inCubic));
    const k2 = prog(t, T.dial1 - 0.5, T.dial1 - 0.05, ease.outCubic) * (1 - prog(t, T.dial2 + 0.6, T.dial2 + 1.0, ease.inCubic));
    const s = 0.055 * pxAt(this.cam, 0.5);
    const from = { x: W * (PORTRAIT ? 0.3 : 0.36), y: H + s * 3 };
    const go = (k: number, p: V3, dx = 0) => {
      if (k <= 0.001) return;
      const q = project(this.cam, ...p);
      const tx = q.behind ? W * 0.5 : clamp(q.x + dx, s * 2, W - s * 2), ty = q.behind ? H * 0.6 : clamp(q.y, H * 0.2, H * 0.9);
      drawOpenHand(c, { x: lerp(from.x + s, tx, k), y: lerp(H + s, ty, k) }, from, s, light, 'point');
    };
    go(k1, [NL[0] - 0.04, NL[1] + 0.02, NL[2]]);
    const circ = (d: number) => [PHONE[0] + Math.cos(-1 - d) * 0.035, PHONE[1] + 0.09, PHONE[2] - 0.05 - Math.sin(-1 - d) * 0.02] as V3;
    const dd = prog(t, T.dial1, T.dial1 + 0.35) * 2.2 * (t < T.dial2 - 0.2 ? 1 : 0) + prog(t, T.dial2, T.dial2 + 0.3) * 1.4;
    go(k2, circ(dd), s * 0.5);
  }
}
void keys;
