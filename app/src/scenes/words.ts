// `words` — «ТЕБЯ СИЛЬНО ОБИЖАЮТ» (TREATMENT p.10·: "more than words can say": language fails; the city keeps
// talking, huge and fluent: «we care about you» scrolls on a building, then the letters come apart and fall like
// rain). City stop: a bus stop on a prospekt in Северо-Восточный (unfamiliar: every sign is mojibake). First person:
//   (a) start        the child walks into the empty bus-stop shelter; across the road a block carries a huge LED
//                    screen: a heart and a line of mojibake (callout: МЫ ЗАБОТИМСЯ О ВАС).
//   (b) «hurt»       the child sits down on the bench, looks up at the screen.
//   (c) «more than words»  the screen's letters come loose one by one on the beat and fall, tumbling, onto the
//                    road; the heart cracks in two and drops; the timetable in the shelter drains to dots.
//   (d) «can say»    silence: the letters lie on the wet asphalt, dying; a night bus comes and goes by without
//                    stopping, its windows empty.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, ease, lerp, smoothstep, keys, mulberry32, hash } from '../engine/util';
import { F, font } from '../engine/type';
import { garble, homeLabel, city } from '../city';
import { type Light } from './_hands';
import {
  LitScene, lit, glowMat, canvasTex, speckle, blotches, asphalt, boxMesh, cyl, ground, concreteTex, streetLight,
  panelBlock, WindowPanes, POST_BASE, LIN, scaleRGB, lin, EYE, type Pov, type V3, type Box,
} from './_kit';
import { logText } from './_motifs';
import { Figure, STRANGER, faceTo } from './_people';

const PROOF = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('proof') : null;
const FZ = -17.5; // the facade across the road
const SY = PORTRAIT ? 9.6 : 9.2; // the screen's centre height
const GW = PORTRAIT ? 1.35 : 1.45, GH = PORTRAIT ? 2.0 : 2.15; // one LED glyph (m)
const SIT_Z = 1.3, SIT_Y = 0.8;
const BUS_Z = -6.5;

interface Shard { m: THREE.Mesh; c: THREE.Vector3; v: THREE.Vector3; spin: THREE.Vector3 }
interface Glyph { shards?: Shard[]; ts?: number; m: THREE.Mesh; mat: THREE.MeshBasicMaterial; tex0?: THREE.Texture; tex1?: THREE.Texture; tb: number; slot: THREE.Vector3; tf: number; vx: number; vz: number; spin: THREE.Vector3; land: number; seed: number }

export default class Words extends LitScene {
  chapter = 'words';
  text = ''; plain = 'МЫ ЗАБОТИМСЯ О ВАС';
  glyphs: Glyph[] = [];
  heart: Glyph[] = [];
  screenBox!: THREE.Mesh;
  scrLight!: THREE.SpotLight; scrSide: THREE.SpotLight[] = []; scrW = 10; scrH = 3;
  table!: THREE.Mesh; tableCv!: HTMLCanvasElement; tableTex!: THREE.CanvasTexture; tableText = '';
  bus!: THREE.Group; busSign = ''; busSignMesh!: THREE.Mesh; busLights: THREE.Light[] = [];
  panes!: WindowPanes;
  lampP: V3 = [0, 0, 0];
  man!: Figure;
  offMat!: THREE.MeshStandardMaterial;

  override init() {
    this.initLit();
    this.hemi.intensity = 0.12;
    this.fogE.density = 0.018;
    const s = this.ctx.start;
    const words = this.ly.linesIn(s, s + 13).flatMap((l) => l.words);
    const w1 = (re: RegExp) => words.find((q) => re.test(q.w))!.start;
    const T: Record<string, number> = { s };
    T.hurt = w1(/^hurt/); T.more = w1(/^more/); T.words = w1(/^words/); T.can = w1(/^can$/); T.say = w1(/^say/);
    T.end = this.ctx.end;
    T.sit0 = T.hurt + 0.05; T.sit1 = T.sit0 + 0.8;
    T.bus = T.say + 1.7; // the bus passes the stop
    this.T = T;
    // shots: from high behind the child walking to the shelter, the screen saying it plainly across the road; in
    // first person on the bench as its letters break and come loose; behind the child on the bench as they rain
    // onto the road; from above the shelter, the letters dying on the asphalt; behind again as the bus goes by
    this.shots = [
      [s, T.hurt + (PORTRAIT ? 0.12 : 0.3), { k: 'wide', d: 0.8, h: 1.0, side: 0.3, ahead: 2.2, aimY: PORTRAIT ? 5.8 : 3.4, fov: PORTRAIT ? 74 : 60 }],
      [T.words + 0.6, T.say + 0.3, { k: 'free', p: PORTRAIT ? [1.3, 1.75, 4.4] : [3.5, 1.8, 4.7], p1: PORTRAIT ? [1.2, 1.7, 4.1] : [3.3, 1.75, 4.4], look: [-0.6, PORTRAIT ? 3.6 : 3.0, -9], look1: [-0.6, PORTRAIT ? 2.4 : 2.0, -9], fov: PORTRAIT ? 80 : 62 }],
      [T.say + 0.3, T.say + 2.5, { k: 'free', p: [2.6, 8.6, 4.8], p1: [2.1, 9.0, 3.8], look: PORTRAIT ? [-0.3, 0, 0.6] : [0.4, 0, -2.6], look1: PORTRAIT ? [-0.4, 0, 0.0] : [0.2, 0, -3.2], fov: PORTRAIT ? 74 : 58 }],
      [T.say + 2.5, T.end + 1, { k: 'free', p: PORTRAIT ? [1.2, 1.1, 4.2] : [3.1, 1.15, 4.4], p1: PORTRAIT ? [1.1, 1.05, 4.0] : [2.9, 1.1, 4.1], look: [-0.8, 0.8, -6.5], fov: PORTRAIT ? 78 : 60 }],
    ];
    this.initKid(19);
    this.text = garble('МЫ ЗАБОТИМСЯ О ВАС');
    this.tableText = garble('РАСПИСАНИЕ');
    this.busSign = garble('Северо-Восточный');
    this.build();
    this.buildScreen();
    this.buildBus();
    this.man = new Figure(this.three, STRANGER, 56); // closer again: along the far pavement, then opposite the stop (r8 note 8)
    this.obstacles = () => { const b = this.screenRect(); return b ? [b] : []; };
  }

  build() {
    const S = this.three;
    const { map, rough } = asphalt(141, [8, 2], { puddles: 10, base: '#202225' });
    ground(S, 160, 14, 0, -8, lit([0.6, 0.6, 0.6], { map, roughMap: rough, rough: 0.35 }));
    const pav = concreteTex(142, [30, 2], { base: '#56554f', joints: [30, 2], stains: 40 });
    ground(S, 160, 8, 0, 3, lit([0.6, 0.6, 0.6], { map: pav, rough: 0.85 }), 0.02);
    ground(S, 160, 10, 0, -19, lit([0.6, 0.6, 0.6], { map: pav, rough: 0.85 }), 0.02);
    for (const z of [-1.0, -15.0]) boxMesh(S, 160, 0.15, 0.25, 0, 0.075, z, lit([0.45, 0.45, 0.43], { map: concreteTex(143, [60, 1]), rough: 0.85 }));
    // lane markings
    const mark = lit([0.7, 0.7, 0.66], { rough: 0.6 });
    for (let x = -80; x < 80; x += 6) boxMesh(S, 3, 0.005, 0.12, x, 0.01, -8, mark, { cast: false });
    // ---- the block with the screen, and its neighbours
    const wins = panelBlock(S, { cx: 0, cz: FZ - 6, len: 72, floors: 9, ang: 0, seed: 144, litRate: 0.1 });
    wins.push(...panelBlock(S, { cx: -58, cz: -34, len: 40, floors: 12, ang: 0.35, seed: 145, litRate: 0.1 }));
    wins.push(...panelBlock(S, { cx: 60, cz: -38, len: 44, floors: 12, ang: -0.3, seed: 146, litRate: 0.1 }));
    wins.push(...panelBlock(S, { cx: 0, cz: 30, len: 80, floors: 9, ang: 0, seed: 147, litRate: 0.12 }));
    // keep the screen's area of the facade clear of lit windows
    const clear = wins.filter((w) => !(w.p[2] > FZ - 1 && Math.abs(w.p[0]) < 17 && Math.abs(w.p[1] - SY) < 4.5));
    this.panes = new WindowPanes(S, clear);
    // ---- the bus-stop shelter: steel frame, a roof, a back glass wall, a side panel with the timetable, a bench
    const steel = lit([0.3, 0.32, 0.33], { rough: 0.5, metal: 0.3 });
    for (const x of [-1.8, 1.8]) for (const z of [0.2, 2.0]) cyl(S, [x, 0, z], [x, 2.5, z], 0.04, steel, { seg: 8 });
    for (const z of [0.05, 2.15]) boxMesh(S, 4.0, 0.08, 0.1, 0, 2.55, z, steel);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.1), new THREE.MeshStandardMaterial({ color: 0x8a9aa4, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    roof.rotation.x = -Math.PI / 2; roof.position.set(0, 2.58, 1.1); S.add(roof);
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.18 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), glass); back.position.set(0, 1.3, 2.0); back.rotation.y = Math.PI; S.add(back);
    boxMesh(S, 3.4, 0.06, 0.4, 0, 0.46, 1.55, lit([0.35, 0.22, 0.12], { rough: 0.7 }));
    for (const x of [-1.4, 1.4]) boxMesh(S, 0.06, 0.46, 0.35, x, 0.23, 1.55, steel);
    // the side panel (left) with the timetable
    boxMesh(S, 0.06, 2.0, 1.6, -1.8, 1.25, 1.1, lit([0.12, 0.13, 0.14], { rough: 0.5 }));
    this.tableCv = document.createElement('canvas'); this.tableCv.width = 256; this.tableCv.height = 320;
    this.tableTex = new THREE.CanvasTexture(this.tableCv); this.tableTex.colorSpace = THREE.SRGBColorSpace;
    this.table = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.375), new THREE.MeshBasicMaterial({ map: this.tableTex, toneMapped: false, fog: true, color: new THREE.Color(0.35, 0.35, 0.35) }));
    this.table.position.set(-1.76, 1.35, 1.1); this.table.rotation.y = Math.PI / 2; S.add(this.table);
    this.addPoint([-1.2, 1.4, 1.1], [0.6, 0.9, 0.7], 0.8, 4);
    this.addPoint([0.2, 2.4, 1.2], [0.75, 0.85, 0.95], 2.4, 4.5); // the shelter's own tube under the roof
    // ---- streetlights along the road
    for (const x of [-26, 4, 34]) { const hp = streetLight(S, x, -1.5, { h: 8, arm: [0, 0, -1.8] }); this.addLamp(hp, { k: 60, angle: 0.8, shadow: x === 4, target: [hp[0], 0, hp[2] - 2] }); if (x === 4) this.lampP = hp; else (this as unknown as { lampsX: V3[] }).lampsX = [...((this as unknown as { lampsX?: V3[] }).lampsX ?? []), hp]; }
    void glowMat; void canvasTex; void speckle; void blotches; void lin;
  }

  /** One LED glyph texture: the character sampled onto a dot grid (amber). */
  ledTex(ch: string, heart = 0) {
    const cv = document.createElement('canvas'); cv.width = 80; cv.height = 120;
    const c = cv.getContext('2d')!;
    const m = document.createElement('canvas'); m.width = 20; m.height = 30;
    const mc = m.getContext('2d')!;
    mc.fillStyle = '#000'; mc.fillRect(0, 0, 20, 30); mc.fillStyle = '#fff';
    if (heart) {
      // one half of a heart (left or right), drawn on a 20x30 mask
      mc.beginPath();
      const hx = heart < 0 ? 20 : 0;
      mc.moveTo(hx, 26); mc.bezierCurveTo(hx + heart * 2, 20, hx + heart * 19, 16, hx + heart * 19, 9); mc.bezierCurveTo(hx + heart * 19, 3, hx + heart * 10, 1, hx, 8); mc.closePath(); mc.fill();
    } else { mc.font = font(F.metro(900), 26); mc.textAlign = 'center'; mc.textBaseline = 'middle'; mc.fillText(ch, 10, 16); }
    const d = mc.getImageData(0, 0, 20, 30).data;
    c.fillStyle = '#080605'; c.fillRect(0, 0, 80, 120);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 20; x++) {
      const on = d[(y * 20 + x) * 4]! > 100;
      c.fillStyle = on ? (heart ? '#ff3344' : '#ffb03a') : 'rgba(70,40,10,0.5)';
      c.beginPath(); c.arc(x * 4 + 2, y * 4 + 2, on ? 1.7 : 1.1, 0, Math.PI * 2); c.fill();
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  buildScreen() {
    const S = this.three, T = this.T, r = mulberry32(151);
    // the screen first says it plainly, in its own language; each letter then breaks into mojibake before it falls
    // a module switched off: black plastic, the dead dot grid (r2 author 7: modules go dark BEFORE they fall)
    {
      const cv = document.createElement('canvas'); cv.width = 80; cv.height = 120;
      const c = cv.getContext('2d')!;
      c.fillStyle = '#0d0c0b'; c.fillRect(0, 0, 80, 120);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 20; x++) { c.fillStyle = 'rgba(95,90,82,0.55)'; c.beginPath(); c.arc(x * 4 + 2, y * 4 + 2, 1.15, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = 'rgba(190,185,175,0.75)'; c.lineWidth = 3; c.strokeRect(1, 1, 78, 118);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      this.offMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide });
    }
    const chars = [...this.plain], bad = [...this.text];
    const broken = (i: number) => (bad.length === chars.length ? bad[i]! : garble(chars[i]!));
    const rows = PORTRAIT ? [chars.slice(0, 2), chars.slice(3, 12), chars.slice(13)] : [chars];
    const rowOff = PORTRAIT ? [0, 3, 13] : [0];
    const perRow = Math.max(...rows.map((q) => q.length));
    const wTot = (perRow + 2.6) * GW, hTot = rows.length * (GH + 0.2) + 0.8;
    this.screenBox = boxMesh(S, wTot + 0.8, hTot, 0.3, 0, SY, FZ + 0.1, lit([0.03, 0.03, 0.03], { rough: 0.5, metal: 0.2 }));
    // a physical LED panel: a steel frame round the black box; its light spills down the facade from under the
    // bottom edge (a spot aimed down: the top of the spill is the panel's own edge, no soft oval over the wall)
    const frameM = lit([0.32, 0.31, 0.3], { rough: 0.45, metal: 0.6 });
    const fw = wTot + 1.0, fh = hTot + 0.2;
    boxMesh(S, fw, 0.14, 0.4, 0, SY + fh / 2, FZ + 0.12, frameM); boxMesh(S, fw, 0.14, 0.4, 0, SY - fh / 2, FZ + 0.12, frameM);
    boxMesh(S, 0.14, fh, 0.4, -fw / 2, SY, FZ + 0.12, frameM); boxMesh(S, 0.14, fh, 0.4, fw / 2, SY, FZ + 0.12, frameM);
    for (const sx of [-0.3, 0.3]) boxMesh(S, 0.12, 1.6, 0.12, sx * wTot, SY + fh / 2 + 0.8, FZ + 0.2, frameM); // roof brackets
    this.scrW = wTot; this.scrH = hTot;
    this.scrLight = this.addLamp([0, SY - hTot / 2 - 0.35, FZ + 1.6], { color: [1.0, 0.6, 0.2], k: 120, angle: 0.75, penumbra: 0.25, target: [0, SY - 8, FZ], dist: 16 });
    this.scrSide = [-1, 1].map((sx) => this.addLamp([sx * wTot / 3, SY - hTot / 2 - 0.35, FZ + 1.6], { color: [1.0, 0.6, 0.2], k: 0, angle: 0.75, penumbra: 0.25, target: [sx * wTot / 3, SY - 8, FZ], dist: 16 }));
    // the panel's backplate: dark, with the faint warm sheen of the LED rows so the rectangle reads behind the letters
    (this.screenBox.material as THREE.MeshStandardMaterial).color.setRGB(0.07, 0.065, 0.06, THREE.LinearSRGBColorSpace);
    (this.screenBox.material as THREE.MeshStandardMaterial).emissive.setRGB(0.035, 0.015, 0.005, THREE.LinearSRGBColorSpace);
    // the fall order: shuffled, on beats from «words», faster towards «say»
    const beats: number[] = [];
    for (let k = 0; ; k++) { const b = this.au.timeOfBeat(Math.ceil(this.au.beatAt(T.more)) + k); if (b > T.say + 1.2) break; beats.push(b); }
    const times: number[] = [];
    for (let i = 0; times.length < chars.length + 2; i++) { const b = beats[Math.min(i, beats.length - 1)]!; times.push(b); if (i > 2) times.push(b + 0.18); if (i > 5) times.push(b + 0.33); }
    const idx = chars.map((_, i) => i).sort(() => r() - 0.5);
    const x0 = -wTot / 2 + 2.6 * GW + GW / 2;
    rows.forEach((row, ri) => {
      const y = SY + ((rows.length - 1) / 2 - ri) * (GH + 0.2);
      row.forEach((ch, ci) => {
        if (ch === ' ') return;
        const i = rowOff[ri]! + ci;
        const tex0 = this.ledTex(ch), tex1 = this.ledTex(broken(i));
        const mat = new THREE.MeshBasicMaterial({ map: tex0, toneMapped: false, fog: true, side: THREE.DoubleSide });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(GW * 0.96, GH), mat);
        const slot = new THREE.Vector3(x0 + ci * GW + (perRow - row.length) * GW / 2, y, FZ + 0.27);
        m.position.copy(slot); S.add(m);
        const order = idx.indexOf(i);
        const tf = times[Math.min(order + 1, times.length - 1)]!;
        this.glyphs.push({ m, mat, tex0, tex1, tb: Math.max(T.s + 2.7 + hash(i, 21) * 0.6, tf - 1.3 + hash(i, 22) * 0.4), slot, tf, vx: (r() - 0.5) * 2, vz: 5.9 + r() * 1.6, spin: new THREE.Vector3((r() - 0.5) * 7, (r() - 0.5) * 3, (r() - 0.5) * 5), land: 0, seed: i });
      });
    });
    // the heart (two halves) to the left of the text
    for (const side of [-1, 1]) {
      const mat = new THREE.MeshBasicMaterial({ map: this.ledTex('', side), toneMapped: false, fog: true, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), mat);
      const slot = new THREE.Vector3(-wTot / 2 + 1.25 * GW + side * GW / 2, SY, FZ + 0.27);
      m.position.copy(slot); S.add(m);
      this.heart.push({ m, mat, tb: 1e9, slot, tf: times[0]! - 0.05 + (side > 0 ? 0.12 : 0), vx: side * 1.5, vz: 6.6, spin: new THREE.Vector3(2, 0, side * 3), land: 0, seed: 90 + side });
    }
  }

  buildBus() {
    const S = this.three;
    this.bus = new THREE.Group(); S.add(this.bus);
    // a LiAZ-like city bus: a long box body, a rounded roof, a window band lit from inside (empty), wheels
    const body = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.55, 0.42, 0.12, THREE.LinearSRGBColorSpace), roughness: 0.45, metalness: 0.2 });
    const L = 11.4, Hh = 2.9, D = 2.5;
    const bb = boxMesh(this.bus, L, Hh - 0.9, D, 0, 0.45 + (Hh - 0.9) / 2, 0, body);
    void bb;
    boxMesh(this.bus, L - 0.1, 0.3, D - 0.1, 0, Hh + 0.02, 0, body);
    const wc = document.createElement('canvas'); wc.width = 1024; wc.height = 96;
    const c = wc.getContext('2d')!;
    c.fillStyle = '#1a1c1d'; c.fillRect(0, 0, 1024, 96);
    for (let i = 0; i < 9; i++) { const x = 20 + i * 110; const g = c.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, '#fff3d0'); g.addColorStop(1, '#d9b870'); c.fillStyle = g; c.fillRect(x, 8, 96, 80); c.fillStyle = 'rgba(120,90,40,0.5)'; c.fillRect(x, 60, 96, 6); for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(90,60,20,0.6)'; c.fillRect(x + 10 + k * 30, 72, 18, 16); } }
    const wt = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace;
    const wm = new THREE.MeshBasicMaterial({ map: wt, toneMapped: false, fog: true });
    for (const side of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.6, 0.95), wm); p.position.set(0, 2.05, side * (D / 2 + 0.01)); p.rotation.y = side > 0 ? 0 : Math.PI; this.bus.add(p); }
    // the route display on the side, in mojibake
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 64;
    const s2 = sc.getContext('2d')!; s2.fillStyle = '#050505'; s2.fillRect(0, 0, 512, 64); s2.fillStyle = '#ff9a2a'; s2.font = font(F.metro(900), 40); s2.textBaseline = 'middle'; s2.fillText('23  ' + this.busSign, 12, 34);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    this.busSignMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.35), new THREE.MeshBasicMaterial({ map: st, toneMapped: false, fog: true }));
    this.busSignMesh.position.set(1.8, 2.72, D / 2 + 0.02); this.bus.add(this.busSignMesh);
    const tyre = lit([0.03, 0.03, 0.03], { rough: 0.8 });
    for (const x of [-3.6, 3.4]) for (const side of [1, -1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20), tyre); w.rotation.x = Math.PI / 2; w.position.set(x, 0.5, side * (D / 2 - 0.1)); this.bus.add(w); }
    const inner = new THREE.PointLight(0xffe0a0, 0, 8, 2); inner.position.set(0, 1.8, 0); this.bus.add(inner); this.busLights.push(inner);
    const head = new THREE.SpotLight(0xfff0d0, 0, 50, 0.45, 0.5, 2); head.position.set(-L / 2 - 0.1, 0.9, 0); head.target.position.set(-L / 2 - 20, 0, 0); this.bus.add(head, head.target); this.busLights.push(head);
    this.bus.visible = false;
  }

  busX(t: number) { const T = this.T; return 70 - 26 * (t - T.bus + 2.7); } // passes x = 0 at T.bus

  /** The union box of the screen's glyphs while they hang (for QA and the callout's clearance). */
  screenRect(): Box | null {
    const bs = this.glyphs.filter((g) => g.m.visible).map((g) => this.planeBox(g.m)).filter((b): b is Box => !!b);
    if (!bs.length) return null;
    const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y)), x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  placeGlyph(g: Glyph, t: number) {
    const d = t - g.tf;
    const on0 = this.T.s + 0.3 + (g.seed % 20) * 0.03;
    if (t < on0 + 0.25) { g.m.position.copy(g.slot); g.m.rotation.set(0, 0, 0); g.mat.color.setScalar(t < on0 ? 0.04 : hash(Math.floor(t * 30), g.seed) < 0.5 ? 0.3 : 1.25); return; }
    if (g.tex0 && g.tex1) {
      // plain until tb, a stutter between the two, then mojibake
      const e = t - g.tb;
      const want = e < 0 ? g.tex0 : e < 0.35 ? (hash(Math.floor(t * 24), g.seed + 40) < 0.5 ? g.tex0 : g.tex1) : g.tex1;
      if (g.mat.map !== want) { g.mat.map = want; g.mat.needsUpdate = true; }
    }
    const off = (dark: boolean) => { const want = dark ? this.offMat : g.mat; if (g.m.material !== want) g.m.material = want; };
    if (d <= 0) {
      // before the fall: a loose letter shivers, stutters and switches OFF (dark, no dots) before it lets go
      const shiver = d > -0.5 ? Math.sin(t * 60 + g.seed) * 0.03 * (1 + d * 2) : 0;
      g.m.position.copy(g.slot); g.m.position.x += shiver; g.m.rotation.set(0, 0, shiver * 0.5);
      const dying = d > -0.32 && d <= -0.1, dead = d > -0.1;
      off(dead || (dying && hash(Math.floor(t * 26), g.seed + 7) < 0.55));
      g.mat.color.setScalar(dying ? 0.6 : 1.25);
      return;
    }
    off(true);
    const gv = 9.8;
    const yLand = 0.05;
    const tLand = Math.sqrt((2 * (g.slot.y - yLand)) / gv);
    if (d < tLand) {
      g.m.visible = true;
      g.m.position.set(g.slot.x + g.vx * d, g.slot.y - 0.5 * gv * d * d, g.slot.z + g.vz * d);
      g.m.rotation.set(g.spin.x * d, g.spin.y * d, g.spin.z * d);
      return;
    }
    // on the ground: lying flat, face up, dead
    const k = d - tLand;
    const skid = (1 - Math.exp(-k * 2.5)) / 2.5 * 0.45;
    g.m.position.set(g.slot.x + g.vx * (tLand + skid), yLand + 0.02 * Math.abs(Math.sin(k * 14)) * Math.exp(-k * 6), g.slot.z + g.vz * (tLand + skid));
    g.m.rotation.set(-Math.PI / 2, 0, g.spin.z * 0.3);
    g.land = 1;
    // the bus runs over it: the module cracks and shatters into pieces that skitter along the asphalt
    const ts = this.shatterAt(g);
    if (ts === null || t < ts) { g.m.visible = true; if (g.shards) for (const q of g.shards) q.m.visible = false; return; }
    g.m.visible = false;
    if (!g.shards) g.shards = this.makeShards(g);
    const e = t - ts;
    g.m.updateMatrixWorld(true);
    for (const q of g.shards) {
      q.m.visible = true;
      const home = q.c.clone().applyMatrix4(g.m.matrixWorld);
      const fr = 1 - Math.exp(-e * 3.2); // sliding with friction
      const up = Math.max(0, q.v.y * e - 4.9 * e * e);
      q.m.position.set(home.x + q.v.x / 3.2 * fr, yLand + 0.01 + up, home.z + q.v.z / 3.2 * fr);
      q.m.rotation.set(-Math.PI / 2 + (up > 0 ? q.spin.x * e : 0), up > 0 ? q.spin.y * e : 0, g.spin.z * 0.3 + q.spin.z * fr);
    }
  }

  /** When the bus's front wheels reach a module lying in its lane (null: not in the lane). */
  shatterAt(g: Glyph): number | null {
    if (g.ts !== undefined) return g.ts < 0 ? null : g.ts;
    const tLand = Math.sqrt((2 * (g.slot.y - 0.05)) / 9.8);
    const x = g.slot.x + g.vx * (tLand + 0.18), z = g.slot.z + g.vz * (tLand + 0.18);
    // front axle reaches it, or (if it landed just after the front passed) the rear axle 7 m behind
    const front = this.T.bus - 2.7 + (70 - 3.6 - x) / 26, rear = front + 7 / 26, land = g.tf + tLand;
    g.ts = Math.abs(z - BUS_Z) < 1.7 ? (land <= front ? front : land <= rear ? rear : -1) : -1;
    return g.ts < 0 ? null : g.ts;
  }

  /** The module's plane fractured into triangles fanned from a crack point (real pieces of the same face). */
  makeShards(g: Glyph): Shard[] {
    const r = mulberry32(700 + g.seed), w = g.seed >= 89 ? GW : GW * 0.96, h = GH;
    const cx = (r() - 0.5) * w * 0.4, cy = (r() - 0.5) * h * 0.4;
    const rim: [number, number][] = [];
    const per = [[-w / 2, -h / 2, w / 2, -h / 2], [w / 2, -h / 2, w / 2, h / 2], [w / 2, h / 2, -w / 2, h / 2], [-w / 2, h / 2, -w / 2, -h / 2]];
    for (const [x0, y0, x1, y1] of per) { rim.push([x0!, y0!]); const n = 1 + Math.floor(r() * 2); for (let k = 1; k <= n; k++) { const u = (k + (r() - 0.5) * 0.6) / (n + 1); rim.push([lerp(x0!, x1!, u), lerp(y0!, y1!, u)]); } }
    const out: Shard[] = [];
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i]!, b = rim[(i + 1) % rim.length]!;
      const mx = (a[0] + b[0] + cx) / 3, my = (a[1] + b[1] + cy) / 3;
      const pos = [cx - mx, cy - my, 0, a[0] - mx, a[1] - my, 0, b[0] - mx, b[1] - my, 0];
      const uv = [cx / w + 0.5, cy / h + 0.5, a[0] / w + 0.5, a[1] / h + 0.5, b[0] / w + 0.5, b[1] / h + 0.5];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.offMat); m.visible = false; this.three.add(m);
      // pieces fly outwards from the crack and are dragged along the bus's heading (-x)
      const dx = mx, dz = -my, L = Math.hypot(dx, dz) || 1;
      out.push({ m, c: new THREE.Vector3(mx, my, 0), v: new THREE.Vector3(dx / L * (1.5 + r() * 2.5) - 3 - r() * 4, 0.8 + r() * 1.6, dz / L * (1.5 + r() * 2.5)), spin: new THREE.Vector3((r() - 0.5) * 14, (r() - 0.5) * 10, (r() - 0.5) * 4) });
    }
    return out;
  }

  firstBreak() { return Math.min(...this.glyphs.map((g) => g.tb)); }

  drawTable(t: number) {
    const T = this.T, c = this.tableCv.getContext('2d')!;
    c.fillStyle = '#e8efe6'; c.fillRect(0, 0, 256, 320);
    c.fillStyle = '#1d4a33'; c.fillRect(0, 0, 256, 44);
    const drain = smoothstep(T.words, T.say + 1, t);
    // plain Russian until the slogan starts breaking, then it breaks with it, top line first
    const fb = this.firstBreak(), br = (i: number) => t >= fb + i * 0.07;
    c.fillStyle = '#fff'; c.font = font(F.metro(900), 24); c.textAlign = 'center'; c.fillText(br(0) ? this.tableText : 'РАСПИСАНИЕ', 128, 30);
    c.font = font(F.metro(400), 18); c.textAlign = 'left';
    const r = mulberry32(161);
    for (let i = 0; i < 10; i++) {
      const y = 70 + i * 24;
      const line = `${String(5 + Math.floor(r() * 18)).padStart(2, '0')}:${String(Math.floor(r() * 6) * 10).padStart(2, '0')}  ${((n: string) => (br(i + 1) ? garble(n) : n))(['ЦЕНТР', 'ВОКЗАЛ', 'ЗАВОД', 'КОЛЬЦЕВАЯ', 'ПАРК'][i % 5]!)}`;
      // the words drain into loose dots, line by line from the bottom
      const gone = drain * 12 - (9 - i);
      if (gone <= 0) { c.fillStyle = '#233'; c.fillText(line, 16, y); }
      else { c.fillStyle = `rgba(20,40,40,${clamp(1 - gone) * 0.8})`; for (let k = 0; k < 18; k++) c.fillRect(16 + r() * 200, y - 12 + gone * 30 * r(), 2, 2); }
    }
    this.tableTex.needsUpdate = true;
  }

  camY(t: number) { const T = this.T; return lerp(EYE, SIT_Y, ease.inOutCubic(smoothstep(T.sit0, T.sit1, t))); }
  camU(t: number) { const T = this.T; return clamp((t - T.s) / (T.sit0 - T.s + 0.2)); }
  camZ(t: number) { return lerp(3.0, SIT_Z, ease.outCubic(this.camU(t))); }
  camX(t: number) { return lerp(2.6, 0.15, this.camU(t) ** 3); }

  pov(t: number): Pov {
    const T = this.T;
    if (PROOF === 'screen') return { p: [0, 5, -6], yaw: 0, pitch: 0.42, walk: 0, fov: PORTRAIT ? 70 : 50 };
    if (PROOF === 'stop') return { p: [3.2, 1.3, -2.2], yaw: this.yawTo([3.2, 1.3, -2.2], [0, 1.2, 1.2]), pitch: 0.02, walk: 0 };
    if (PROOF === 'bus') return { p: [6, 1.4, -1], yaw: this.yawTo([6, 1.4, -1], [0, 1.4, BUS_Z]), pitch: 0.05, walk: 0 };
    if (PROOF === 'letters') return { p: [3.5, 1.2, 0.5], yaw: this.yawTo([3.5, 1.2, 0.5], [0, 0, -7]), pitch: -0.2, walk: 0 };
    if (PROOF === 'table') return { p: [-0.6, 1.35, 1.1], yaw: Math.PI / 2, pitch: 0, walk: 0, fov: PORTRAIT ? 60 : 44 };
    const E = ease.inOutCubic, P = PORTRAIT;
    const cam: V3 = [this.camX(t), this.camY(t), this.camZ(t)];
    const up = this.pitchTo(cam, [0, SY, FZ]);
    const yaw = keys(t, [[T.s, 0.24], [T.hurt - 0.2, 0.1, E], [T.sit1, 0.02, E], [T.words, 0.0, E], [T.say, -0.04, E], [T.bus - 0.8, 0.02, E], [T.bus + 1.2, -0.02, E], [T.end, 0.0, E]]);
    const pitch = keys(t, [[T.s, 0.1], [T.hurt - 0.2, 0.2, E], [T.sit1, up - (P ? 0.12 : 0.1), E], [T.words, up - (P ? 0.12 : 0.1), E], [T.can, 0.18, E], [T.say + 0.8, P ? -0.16 : -0.12, E], [T.bus - 0.8, P ? -0.1 : -0.08, E], [T.end, P ? -0.22 : -0.16, E]]);
    const walk = 1 - smoothstep(T.hurt - 0.4, T.sit0, t);
    const drop = Math.sin(clamp((t - T.sit1 + 0.15) / 0.3) * Math.PI) * 0.03;
    return { p: [cam[0], cam[1] - drop, cam[2]], yaw, pitch, walk };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, { renderer } = this.ctx;
    this.begin();
    this.fogE.color.setRGB(0.02, 0.022, 0.03);
    for (const g of this.glyphs) this.placeGlyph(g, t);
    for (const g of this.heart) this.placeGlyph(g, t);
    const lit0 = this.glyphs.filter((g) => t < g.tf).length / Math.max(1, this.glyphs.length);
    this.scrLight.intensity = 60 * (0.25 + 0.75 * lit0); for (const L of this.scrSide) L.intensity = this.scrLight.intensity;
    this.drawTable(t);
    // the bus
    const bx = this.busX(t);
    this.bus.visible = bx > -70 && bx < 70;
    this.bus.position.set(bx, 0, BUS_Z);
    { // the man: along the far pavement while the letters fall, stops opposite the stop; there when the bus has gone
      const u = smoothstep(T.words, T.say + 0.6, t), mp = new THREE.Vector3(lerp(-16, 3.2, u), 0, -10.6);
      this.man.g.visible = t > T.words - 0.2;
      this.man.pose({ pos: mp, heading: u < 1 ? faceTo(mp, { x: 20, z: -10.6 }) * (1 - smoothstep(T.say + 0.3, T.say + 0.9, t)) + faceTo(mp, { x: 0.15, z: 1.3 }) * smoothstep(T.say + 0.3, T.say + 0.9, t) : faceTo(mp, { x: 0.15, z: 1.3 }), t, speed: u < 1 ? 1.2 : 0, dist: u * 19, look: 0, headDown: 0.05 });
    }
    for (const l of this.busLights) l.intensity = this.bus.visible ? (l instanceof THREE.SpotLight ? 90 : 5) : 0;
    const P = this.pov(t);
    this.setCam(P, t, P.walk);
    const cam = this.cam;
    const fallen = this.glyphs.filter((g) => g.land);
    const ground = fallen.length ? fallen.reduce((a, g) => a.add(g.m.position), new THREE.Vector3()).multiplyScalar(1 / fallen.length) : new THREE.Vector3(0.3, 0.1, -9);
    const aim = new THREE.Vector3(0.3, 0.2, cam.position.z - 5.5).lerp(new THREE.Vector3(0, SY - 1, FZ), smoothstep(T.sit0, T.sit1, t) * (1 - smoothstep(T.words + 0.5, T.can, t))).lerp(ground, smoothstep(T.words + 0.8, T.say, t));
    const pose = this.torch(t, { raise: 1, on: PROOF ? 0 : 1, walk: P.walk, aimAt: PROOF ? null : aim, aimK: PROOF ? 0 : 0.8, spot: clamp(20 * (aim.distanceTo(cam.position) / 5) ** 2, 3, 26) });
    if (!PROOF) this.cut(t, P, pose, { speed: P.walk * 1.2, sit: smoothstep(T.sit0, T.sit1, t) });
    this.renderWorld(out, t, { sky: { top: [0.008, 0.01, 0.018], horizon: scaleRGB(LIN.smog, 0.1), low: scaleRGB(LIN.shadow, 0.8), horizonY: 0.5, haze: 1 } });
    const gb = this.glow3D;
    gb.add(this.lampP[0], this.lampP[1], this.lampP[2], 0.45, 0.35, LIN.sodium, 2.2, 4);
    for (const hp of (this as unknown as { lampsX?: V3[] }).lampsX ?? []) gb.add(hp[0], hp[1], hp[2], 0.45, 0.35, LIN.sodium, 2.2, 4);
    // the screen's halo while it talks
    if (lit0 > 0) gb.add(0, SY, FZ + 0.45, this.scrW * 0.56, this.scrH * 0.64, [1.0, 0.6, 0.2], 0.03 * lit0, 8); // a tight halo round the panel
    // the modules switch off before they fall: no trails, no glow on the asphalt (r2 author 7)
    for (const g of [...this.glyphs, ...this.heart]) {
      const ts = g.land ? this.shatterAt(g) : null;
      if (ts === null || t < ts || t > ts + 0.3) continue;
      const k = (t - ts) / 0.3; // cold glints of breaking plastic and glass under the wheel (not lit LEDs)
      for (let q = 0; q < 7; q++) { const an = hash(g.seed, q + 30) * 6.28, rr = 0.2 + k * (0.6 + hash(g.seed, q + 40) * 1.4); gb.add(g.m.position.x + Math.cos(an) * rr - k * 1.2, 0.12 + 0.3 * hash(q, g.seed) * (1 - k), g.m.position.z + Math.sin(an) * rr, 0.05, 0.05, [0.85, 0.9, 1], 1.6 * (1 - k), 3); }
    }
    if (this.bus.visible) { gb.add(bx - 5.8, 0.9, BUS_Z + 0.9, 0.35, 0.35, [1, 0.95, 0.8], 3, 3); gb.add(bx - 5.8, 0.9, BUS_Z - 0.9, 0.35, 0.35, [1, 0.95, 0.8], 3, 3); gb.add(bx + 5.75, 0.8, BUS_Z + 1.0, 0.15, 0.15, [1, 0.1, 0.05], 2, 3); }
    this.flushGlow(out);
    this.beam(out, t, pose, PROOF ? 0 : 1, { density: 0.02 * (1 - 0.75 * smoothstep(12, 16, aim.distanceTo(cam.position))), maxDist: clamp(aim.distanceTo(cam.position) - 0.5, 0.8, 8) });
    // ---- QA text: the screen line (mojibake) while it hangs whole; the timetable; the bus's route display
    const sb = this.screenRect();
    const lastOn = T.s + 0.3 + 19 * 0.03 + 0.25, firstBreak = Math.min(...this.glyphs.map((g) => g.tb));
    if (sb && t < Math.min(...this.glyphs.map((g) => g.tf))) {
      const inFrame = sb.x >= 0 && sb.y >= 0 && sb.x + sb.w <= W && sb.y + sb.h <= H;
      if (t >= lastOn && t < firstBreak) logText('sign', this.plain, inFrame && sb.h > 14, sb, { id: 'sign:words-screen' });
      else if (t >= firstBreak) logText('garble', this.text, inFrame && sb.h > 14, sb, { id: 'scenery:words-screen' });
    }
    const tb0 = t >= this.firstBreak();
    this.logPlane(this.table, tb0 ? this.tableText : 'РАСПИСАНИЕ', tb0 ? 'garble' : 'sign', { frac: [0.05, 0.0, 0.95, 0.14], minPx: 10, id: 'scenery:words-table', scenery: true });
    if (this.bus.visible) this.logPlane(this.busSignMesh, this.busSign, 'garble', { minPx: 10, id: 'scenery:words-bus', scenery: true });
    // ---- hands and UI
    const u = this.ui.ctx;
    this.glow2D.clear();
    const light: Light = { amb: 0.2 + 0.15 * lit0, warm: 0.3 * lit0, torch: 1 };
    if (!PROOF) {
      this.torchHand(u, pose, light);
      this.heading(u, t, f);
      this.callout(u, t, homeLabel('words'), T.s + 0.05, T.s + 2.05, () => this.onScreen(this.heart[0]!.slot.x + 0.6, SY - (PORTRAIT ? 4.3 : 2.4), FZ + 0.3), { places: [city().home.name] });
      // the grown-up's reading of the broken timetable, flickering: maybe it says that, maybe not (r8 note 4)
      this.callout(u, t, 'РАСПИСАНИЕ', this.firstBreak() + 0.9, T.say + 0.5, () => this.onScreen(-1.74, 1.98, 1.1), { maybe: true });
    }
    this.composite2D(this.ui, out);
    this.glow2D.render(renderer, out);
    return { ...POST_BASE, vignette: 0.55 };
  }
}
void H; void mulberry32;
