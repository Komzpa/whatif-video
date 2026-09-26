// `lost` — p. 22 → 26. docs/TREATMENT.md r4/r4.1: the scene follows the handbook's headings, the sung
// words set the timing.
//   p. 22 ТЫ ПОТЕРЯЛСЯ (you got lost): street level in an unfamiliar district at night, then a crane up
//     to the drone's map from above. The known part of the map ends at the child's yellow dot; beyond it
//     the tiles are grey, hatched and unlabelled. The banner lands on "lost":
//     AREA NOT MAPPED · THIS PART OF THE CITY IS NOT OPEN YET. Callouts YOU, HOME · 6.4 km · UNKNOWN ROUTE.
//   p. 26 НЕ УСПЕЛ ВЫЙТИ ИЗ ВАГОНА МЕТРО (didn't get off the car in time): inside a train car. On "stop"
//     the train stands at the station marked YOUR STOP; the child gets up with the book and walks to the
//     door; DOORS CLOSING; on "closed" the doors shut in front of the child. The platform (and YOUR STOP)
//     slides away, the train carries the child into the dark tunnel, the route display moves on.
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { clamp, ease, lerp, prog, smoothstep, keys, hash, mulberry32, frameIdx } from '../engine/util';
import { F, font, measure } from '../engine/type';
import {
  CityScene, CityBlocks, LitLines, NeonSign, FogCards, GlowBatch, LIN, POST_BASE, SAFE, rgba, mixRgba, scaleRGB, mixRGB, solid, col3, project, pxPerMetre,
  drawChild, drawDrone, droneGlow, drawCallout, drawEntry, drawPanel, drawPageCounter, entryAlpha, makeLamp, flicker, rain, type Tower, type Step,
} from './_motifs';

type V3 = [number, number, number];

// ---------------------------------------------------------------- the district (p. 22)
const STREET = 60, ROAD = 16; // street grid pitch and road width (m); the child stands on a crossing
const CHILD_D: V3 = [0.8, 0, 1.5];
const MAP_SIZE = 420, MAP_C: [number, number] = [0, -10]; // map plane: size and centre (x, z)
/** Is the block centred at (bx, bz) on the map the drone knows? The known part ends at the child. */
const known = (bx: number, bz: number) => bx < 0 || (bx < 60 && bz > 20 && bz < 100);
const HOME_DIR = Math.atan2(-0.22, 1); // screen-ish direction to home (east, a little north)

const DISTRICT_SIGNS: ConstructorParameters<typeof NeonSign>[0][] = [
  { lines: ['YOU ARE LEAVING THE SERVICE AREA'], wall: 'left', pos: [-8, 5.2, -22], height: 1.3, rotY: 1.15, groundY: 0, bright: 1.9, flicker: 0.1, seed: 11 },
  { lines: ['DISTRICT 14', 'PASS HOLDERS ONLY'], wall: 'right', pos: [8, 7, -38], height: 3.2, rotY: -1.1, kind: 'screen', groundY: 0, bright: 1.5, flicker: 0.05, seed: 12 },
  { lines: ['NO ROUTE DATA'], wall: 'right', pos: [8, 13, -75], height: 2.6, rotY: -1.0, groundY: 0, bright: 1.9, flicker: 0.35, seed: 13 },
  { lines: ['CLOSED'], vertical: true, wall: 'left', pos: [-8, 12, -92], height: 9, rotY: 1.1, groundY: 0, bright: 1.6, flicker: 0.08, seed: 14 },
  { lines: ['ENTRY AFTER 21:00', 'BY APPOINTMENT'], wall: 'left', pos: [-8, 8, -110], height: 3.6, rotY: 1.0, kind: 'screen', groundY: 0, color: 'sodium', bright: 1.3, flicker: 0.04, seed: 15 },
];

// ---------------------------------------------------------------- the train (p. 26)
const DOOR_X = 3.5, DOOR_W = 1.3, DOOR_H = 1.9; // the door the child walks to
const WALL_Z = -1.45, WIN_Y0 = 0.88, WIN_Y1 = 1.95, CEIL = 2.35;
const BENCH: V3 = [0.7, 0.46, -1.18]; // where the child sits (facing the window)
const PLATFORM_HALF = 21; // platform length either side of the stop point (m)
const STATIONS = ['OLD MARKET', 'CANAL ST', 'ORCHARD ROW', 'MILL BRIDGE', 'DEPOT'];
const YOURS = 2;

export default class Lost extends CityScene {
  // district
  city!: CityBlocks;
  dLines = new LitLines();
  signs: NeonSign[] = [];
  reflScene = new THREE.Scene();
  glowRefl = new GlowBatch(3000, { screen2D: false, depthTest: false });
  fogCards = new FogCards();
  lamps: V3[] = [];
  mapScene = new THREE.Scene();
  mapMat!: THREE.RawShaderMaterial;
  fog = new THREE.FogExp2(0, 0.012);
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
  steps1: Step[] = [];
  steps2: Step[] = [];

  B = (k: number) => this.au.timeOfBeat(Math.round(this.au.beatAt(this.ctx.start)) + k);

  override init() {
    this.initDistrict();
    this.initMap();
    this.initTrain();
    const B = this.B;
    this.steps1 = [
      { text: 'Stay where you are.', at: B(3) },
      { text: 'Find someone in uniform.', at: B(4) },
      { text: 'Say your address.', at: B(5) },
    ];
    this.steps2 = [
      { text: 'Get off at the next station.', at: B(13) },
      { text: 'Stay on the platform.', at: B(14) },
      { text: 'Wait for your grown-up to come.', at: B(15) },
    ];
  }

  // ================================================================ district
  initDistrict() {
    this.fog.color = col3(mixRGB(scaleRGB(LIN.fog, 0.75), scaleRGB(LIN.smog, 0.35), 0.25));
    this.three.fog = this.fog;
    this.reflScene.fog = this.fog;
    const r = mulberry32(31);
    const towers: Tower[] = [];
    for (let i = -4; i <= 4; i++) for (let j = -6; j <= 3; j++) {
      const bx = i * STREET + STREET / 2, bz = j * STREET + STREET / 2;
      const inner = STREET - ROAD;
      // 1-4 towers per block, low-rise near the child (the map reads from above), taller further away
      const n = 1 + Math.floor(r() * 3.5);
      const far = Math.hypot(bx, bz) / 300;
      for (let k = 0; k < n; k++) {
        const w = inner * lerp(0.35, n === 1 ? 0.95 : 0.55, r()), d = inner * lerp(0.35, n === 1 ? 0.95 : 0.55, r());
        const x = bx + (r() - 0.5) * (inner - w), z = bz + (r() - 0.5) * (inner - d);
        towers.push({ x, z, w, d, h: lerp(14, 48, r() ** 1.4) * (1 + far * 1.6), y0: 0, shade: r() * 0.5 });
      }
    }
    this.city = new CityBlocks({
      seed: 7, count: 160, x0: -1300, x1: 1300, z0: -1800, z1: -420, hMin: 60, hMax: 260, mega: 4,
      extra: towers, color: LIN.shadow, yBase: 0, windowRate: 0.08,
      edgeWithin: (tw) => Math.hypot(tw.x, tw.z) < 140 && tw.h < 120, edgeFloors: 4,
    });
    this.three.add(this.city.mesh);
    const gm = solid(scaleRGB(LIN.shadow, 1.0), { transparent: true, opacity: 0.74 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), gm);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -600);
    this.three.add(ground);
    // road markings near the child and streetlamps at every corner
    const L = this.dLines, dim = scaleRGB(LIN.concrete, 0.5);
    for (let k = -4; k <= 4; k++) {
      const c = k * STREET;
      for (let z = -330; z < 200; z += 6) L.seg(c, 0.01, z, c, 0.01, z + 3, dim, 0.5);
      for (let x = -260; x < 260; x += 6) L.seg(x, 0.01, c, x + 3, 0.01, c, dim, 0.5);
      for (let m = -6; m <= 3; m++) for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const px = c + sx * (ROAD / 2 - 0.6), pz = m * STREET + sz * (ROAD / 2 - 0.6);
        if (Math.hypot(px, pz) > 360) continue;
        this.lamps.push([px, 6, pz]);
        L.seg(px, 0, pz, px, 6, pz, scaleRGB(LIN.concrete, 0.8), 0.8);
      }
    }
    // a zebra crossing at the child's corner
    for (let i = 0; i < 7; i++) L.seg(-6 + i * 2, 0.02, 9.5, -6 + i * 2, 0.02, 12.5, scaleRGB(LIN.paper, 0.4), 6);
    for (const o of DISTRICT_SIGNS) {
      const sg = new NeonSign(o);
      this.signs.push(sg);
      this.three.add(sg.mesh);
      if (sg.refl) this.reflScene.add(sg.refl);
    }
    const fc = this.fogCards, fcol = mixRGB(LIN.fog, LIN.smog, 0.2);
    fc.add({ z: -30, w: 400, y0: 0, y1: 60, color: fcol, alpha: 0.2, scale: 0.03, seed: 1, high: 30 });
    fc.add({ z: -90, w: 600, y0: 0, y1: 120, color: fcol, alpha: 0.26, scale: 0.02, seed: 2, high: 60 });
    fc.add({ z: -200, w: 1200, y0: 0, y1: 260, color: mixRGB(LIN.fog, LIN.smog, 0.35), alpha: 0.32, scale: 0.01, seed: 3, high: 120 });
    fc.add({ z: -420, w: 2400, y0: 0, y1: 500, color: mixRGB(LIN.fog, LIN.smog, 0.5), alpha: 0.38, scale: 0.005, seed: 4, high: 260 });
    fc.add({ z: -900, w: 4000, y0: 0, y1: 900, color: mixRGB(LIN.fog, LIN.smog, 0.6), alpha: 0.45, scale: 0.003, seed: 5, high: 450 });
  }

  /** The drone's map: a hologram on the ground, known streets in lamp light, the rest grey and hatched. */
  initMap() {
    const N = 2048, S = MAP_SIZE, px = N / S;
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d')!;
    const X = (x: number) => (x - MAP_C[0] + S / 2) * px, Z = (z: number) => (z - MAP_C[1] + S / 2) * px;
    // unknown tiles: grey, hatched, unlabelled; with a ragged fog-of-war edge of small squares
    for (let i = -5; i <= 5; i++) for (let j = -6; j <= 5; j++) {
      const bx = i * STREET + STREET / 2, bz = j * STREET + STREET / 2;
      if (known(bx, bz)) continue;
      const x0 = X(bx - STREET / 2), z0 = Z(bz - STREET / 2), s = STREET * px;
      c.fillStyle = rgba('concrete', 0.8);
      c.fillRect(x0, z0, s, s);
      c.save();
      c.beginPath(); c.rect(x0, z0, s, s); c.clip();
      c.strokeStyle = rgba('shadow', 0.55); c.lineWidth = 3;
      for (let k = -s; k < s * 2; k += 22) { c.beginPath(); c.moveTo(x0 + k, z0); c.lineTo(x0 + k - s, z0 + s); c.stroke(); }
      c.restore();
      c.strokeStyle = rgba('shadow', 0.6); c.lineWidth = 2;
      c.strokeRect(x0 + 1, z0 + 1, s - 2, s - 2);
      // ragged edge where it meets the known part
      if (known(bx - STREET, bz) || known(bx, bz + STREET) || known(bx, bz - STREET)) {
        for (let q = 0; q < 40; q++) {
          const sq = 10 + hash(i, j, q) * 22;
          const edgeX = known(bx - STREET, bz);
          const qx = edgeX ? x0 - sq * hash(q, 3) : x0 + hash(q, 5) * s;
          const qz = edgeX ? z0 + hash(q, 7) * s : (known(bx, bz + STREET) ? z0 + s : z0 - sq) + (hash(q, 9) - 0.5) * sq;
          c.fillStyle = rgba('concrete', 0.5 + 0.3 * hash(q, 11));
          c.fillRect(qx, qz, sq, sq);
        }
      }
    }
    // known part: blocks outlined, streets as lit lines, a few labels
    c.lineCap = 'round';
    for (let i = -5; i <= 5; i++) for (let j = -6; j <= 5; j++) {
      const bx = i * STREET + STREET / 2, bz = j * STREET + STREET / 2;
      if (!known(bx, bz)) continue;
      const m = ROAD / 2;
      c.fillStyle = rgba('lamp', 0.08);
      c.fillRect(X(bx - STREET / 2 + m), Z(bz - STREET / 2 + m), (STREET - ROAD) * px, (STREET - ROAD) * px);
      c.strokeStyle = rgba('lamp', 0.45); c.lineWidth = 3;
      c.strokeRect(X(bx - STREET / 2 + m), Z(bz - STREET / 2 + m), (STREET - ROAD) * px, (STREET - ROAD) * px);
    }
    c.strokeStyle = rgba('lamp', 0.9); c.lineWidth = 7;
    for (let k = -5; k <= 5; k++) {
      const s0 = k * STREET;
      // street segments that run between two known blocks (or along one)
      for (let j = -6; j <= 5; j++) {
        const z0 = j * STREET, z1 = z0 + STREET;
        if (known(s0 - STREET / 2, z0 + STREET / 2) || (known(s0 + STREET / 2, z0 + STREET / 2) && s0 + STREET / 2 < 60)) { c.beginPath(); c.moveTo(X(s0), Z(z0)); c.lineTo(X(s0), Z(z1)); c.stroke(); }
      }
      for (let i = -5; i <= 5; i++) {
        const x0 = i * STREET, x1 = x0 + STREET;
        if (known(x0 + STREET / 2, s0 - STREET / 2) || known(x0 + STREET / 2, s0 + STREET / 2)) { c.beginPath(); c.moveTo(X(x0), Z(s0)); c.lineTo(X(x1), Z(s0)); c.stroke(); }
      }
    }
    c.font = font(F.mono(600), 34); c.fillStyle = rgba('lamp', 0.85); c.letterSpacing = '6px';
    c.fillText('CANAL ST', X(-STREET) + 14, Z(40));
    c.fillText('PIER RD', X(-170), Z(STREET) - 16);
    c.fillText('MARKET SQ', X(-160), Z(0) - 16);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    this.mapMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `precision highp float; in vec3 position; in vec2 uv; uniform mat4 projectionMatrix, modelViewMatrix, modelMatrix; out vec2 vUv; out vec3 vW;
        void main() { vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `precision highp float; in vec2 vUv; in vec3 vW; out vec4 fragColor;
        uniform sampler2D map; uniform float reveal, alpha; uniform vec2 centre;
        void main() {
          vec4 c = texture(map, vUv);
          float d = length(vW.xz - centre);
          float a = c.a * alpha * smoothstep(reveal, reveal - 18.0, d);
          // the reveal front: a thin bright ring
          float ring = smoothstep(6.0, 0.0, abs(d - reveal)) * alpha * step(reveal, 400.0) * 0.35;
          fragColor = vec4(c.rgb * a + vec3(1.0, 0.91, 0.71) * ring, a + ring);
        }`,
      uniforms: { map: { value: tex }, reveal: { value: 0 }, alpha: { value: 0 }, centre: { value: new THREE.Vector2(CHILD_D[0], CHILD_D[2]) } },
      transparent: true, depthTest: false, depthWrite: false,
    });
    // texture is sRGB: sample it linear through the colour space conversion three applies to map uniforms
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(S, S), this.mapMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(MAP_C[0], 0.3, MAP_C[1]);
    this.mapScene.add(plane);
  }

  renderDistrict(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, B = this.B;
    const cam = this.cam;
    const L1 = this.ly.get('You are lost');
    const wLost = L1.words[L1.words.length - 1]!, wYou = L1.words[0]!;
    // ---- camera: street level behind the child, a slow orbit, then the crane up to the map
    const tUp0 = B(1) + 0.5, tUp1 = B(3);
    const u = prog(t, tUp0, tUp1, ease.inOutCubic);
    const orbit = prog(t, f.start, tUp0);
    const street = new THREE.Vector3(lerp(-4.2, -2.4, orbit), 1.5, lerp(13.5, 12.5, orbit));
    const streetT = new THREE.Vector3(1.5, 3.2, -40);
    const high = new THREE.Vector3(-14, 330, 70), highT = new THREE.Vector3(8, 0, -14);
    const drift = prog(t, tUp1, B(6) + 0.2);
    high.x += drift * 10; high.z -= drift * 8; highT.x += drift * 4;
    cam.position.lerpVectors(street, high, u);
    cam.position.y = lerp(1.5, high.y, Math.pow(u, 1.6));
    const tg = new THREE.Vector3().lerpVectors(streetT, highT, Math.pow(u, 0.7));
    cam.lookAt(tg);
    cam.fov = lerp(50, 44, u);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    this.sky.render(renderer, out, { top: scaleRGB(LIN.shadow, 1.0), horizon: mixRGB(scaleRGB(LIN.fog, 0.9), scaleRGB(LIN.smog, 0.45), 0.35), low: scaleRGB(LIN.shadow, 1.2), horizonY: 0.52, t, haze: 1.0 });
    for (const sg of this.signs) sg.update(t);
    renderer.setRenderTarget(out); renderer.clearDepth(); renderer.render(this.reflScene, cam);
    const gr = this.glowRefl; gr.clear();
    const cp = cam.position;
    for (const p of this.lamps) gr.add(p[0], -p[1] + 0.4, p[2], 0.9, 3.6, LIN.sodium, 0.7 * Math.exp(-Math.hypot(p[0] - cp.x, p[2] - cp.z) * 0.006), 2.5);
    for (const sg of this.signs) sg.glow(gr);
    gr.render(renderer, out, cam);
    this.drawThree(out);
    this.city.edges.emit(this.lines3D, cam, { base: 0.35, fog: 0.01, alpha: 0.6 });
    this.dLines.emit(this.lines3D, cam, { base: 0.6, fog: 0.012 });
    // the drone's lamp: a cone ahead of the child, sweeping (it is looking for a way)
    const C = new THREE.Vector3(...CHILD_D);
    const bob = Math.sin(t * 1.9) * 0.03;
    const dronePos = C.clone().add(new THREE.Vector3(0.45, 1.32 + bob, 0.05));
    const sweep = Math.sin((t - f.start) * 1.3) * 0.45 - 0.1;
    const lamp = makeLamp(dronePos, C.clone().add(new THREE.Vector3(Math.sin(sweep) * 6, 0, -Math.cos(sweep) * 6)), 22, 12, 1.0 * (1 - u));
    this.lines3D.render(renderer, out, cam);
    const g = this.glow3D;
    this.city.emitWindows(g, cam, t, { density: 0.004, gain: 1.4 });
    this.city.emitStrips(g, cam, t, { density: 0.0015, gain: 1.0 });
    for (const p of this.lamps) g.add(p[0], p[1], p[2], 0.45, 0.45, LIN.sodium, 2.2 * Math.exp(-Math.hypot(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z) * 0.006), 4);
    for (const sg of this.signs) sg.glow(g, 0.6);
    g.render(renderer, out, cam);
    this.fogCards.render(renderer, out, cam, t, 1 - u * 0.7);
    this.cone.render(renderer, out, cam, lamp, t, { density: 0.16, floorY: 0, maxDist: 30 });

    // ---- the child and the drone (small, at the crossing)
    const w = this.world.ctx;
    const pf = project(cam, C.x, C.y, C.z), ph = project(cam, C.x, C.y + 1.12, C.z);
    const hPx = Math.max(2, pf.y - ph.y);
    const pd = project(cam, dronePos.x, dronePos.y, dronePos.z);
    const drPx = Math.max(1.5, pxPerMetre(cam, pd.depth) * 0.11);
    const look: [number, number] = [Math.sin(sweep), 0.4];
    if (u < 0.85) {
      drawChild(w, pf.x, pf.y, hPx, { pose: 'stand', t, lit: 0.35 * (1 - u), litSide: 1, shade: 0.25 });
      drawDrone(w, pd.x, pd.y, drPx, { t, lamp: 1, look });
    }
    // under the map: the city dims so the hologram reads
    const mapK = prog(t, tUp1 - 0.4, tUp1 + 0.3);
    if (mapK > 0) { w.fillStyle = rgba('shadow', 0.55 * mapK); w.fillRect(0, 0, W, H); }
    this.composite2D(this.world, out);
    if (u < 0.85) { droneGlow(this.glow2D, pd.x, pd.y, drPx, 1, look); this.glow2D.render(renderer, out); }
    rain(this.lines2D, t, { count: 700, alpha: 0.1 * (1 - u), speed: 1500, angle: 0.08, seed: 9 });
    this.lines2D.render(renderer, out);

    // ---- the map
    const u2 = this.ui.ctx;
    if (mapK > 0) {
      this.mapMat.uniforms.alpha!.value = mapK;
      this.mapMat.uniforms.reveal!.value = lerp(0, 420, prog(t, tUp1 - 0.3, wLost.start - 0.05, ease.inOutQuad));
      renderer.setRenderTarget(out); renderer.render(this.mapScene, cam);
      const dot = project(cam, C.x, 0.3, C.z);
      // the child: the yellow dot, pulsing, on the edge of the known part
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      u2.save();
      u2.globalAlpha = mapK;
      u2.fillStyle = rgba('coat'); u2.beginPath(); u2.arc(dot.x, dot.y, 11, 0, Math.PI * 2); u2.fill();
      u2.strokeStyle = rgba('coat', 0.7 * (1 - pulse)); u2.lineWidth = 2;
      u2.beginPath(); u2.arc(dot.x, dot.y, 14 + pulse * 22, 0, Math.PI * 2); u2.stroke();
      u2.restore();
      this.glow2D.clear(); this.glow2D.add(dot.x, dot.y, 0, 40, 40, LIN.coat, 0.5 * mapK, 3); this.glow2D.render(renderer, out);
      drawCallout(u2, t, { ax: dot.x, ay: dot.y, lx: dot.x - 150, ly: dot.y + 120, side: -1, text: 'YOU', at: wYou.start, color: 'coat', size: 24, plate: 0.6 });
      // home: off the map, into the grey; the route is unknown (a dotted line that gives up)
      const hx = W - SAFE - 30, hy = clamp(dot.y + (hx - dot.x) * Math.tan(HOME_DIR), SAFE + 330, H - SAFE - 160);
      const hk = prog(t, wLost.start + 0.15, wLost.start + 0.7);
      if (hk > 0) {
        u2.save();
        u2.globalAlpha = mapK;
        const n = Math.floor(40 * hk);
        for (let i = 2; i < n; i++) {
          const k = i / 40;
          const x = lerp(dot.x, hx, k), y = lerp(dot.y, hy, k) + Math.sin(k * 30 + i) * 6 * k;
          u2.fillStyle = rgba('lamp', 0.8 * (1 - k * 0.7) * (hash(i, 3) < 0.25 + 0.75 * (1 - k) ? 1 : 0));
          u2.beginPath(); u2.arc(x, y, 3, 0, Math.PI * 2); u2.fill();
        }
        if (hk >= 1) {
          u2.strokeStyle = rgba('lamp', 0.9); u2.lineWidth = 3;
          u2.beginPath(); u2.moveTo(hx - 22, hy - 14); u2.lineTo(hx, hy); u2.lineTo(hx - 22, hy + 14); u2.stroke();
        }
        u2.restore();
        drawCallout(u2, t, { ax: hx - 6, ay: hy, lx: hx - 30, ly: hy + 90, side: -1, text: ['HOME · 6.4 km', 'UNKNOWN ROUTE'], at: wLost.start + 0.7, size: 22, plate: 0.65, ring: false });
      }
      // the banner lands on "lost"
      this.drawBanner(u2, t, wLost.start, dot, mapK);
    }
  }

  /** AREA NOT MAPPED: a hazard-striped strip over the grey part (our own design). */
  drawBanner(c: CanvasRenderingContext2D, t: number, at: number, dot: { x: number; y: number }, alpha: number) {
    const k = prog(t, at - 0.05, at + 0.25, ease.outBack);
    if (k <= 0) return;
    const cx = clamp(dot.x + 420, 700, W - SAFE - 360), cy = clamp(dot.y - 230, 300, H - 380);
    const l1 = 'AREA NOT MAPPED', l2 = 'THIS PART OF THE CITY IS NOT OPEN YET';
    const s1 = 44, s2 = 22;
    const w1 = measure(l1, F.mono(600), s1, s1 * 0.12), w2 = measure(l2, F.mono(500), s2, s2 * 0.08);
    const bw = Math.max(w1, w2) + 150, bh = 132;
    c.save();
    c.globalAlpha = alpha * clamp(k * 3);
    c.translate(cx, cy);
    c.scale(lerp(1.25, 1, clamp(k)), lerp(1.25, 1, clamp(k)));
    c.fillStyle = rgba('shadow', 0.88);
    c.fillRect(-bw / 2, -bh / 2, bw, bh);
    // hazard hatch at both ends
    for (const sx of [-1, 1]) {
      c.save();
      c.beginPath(); c.rect(sx < 0 ? -bw / 2 : bw / 2 - 46, -bh / 2, 46, bh); c.clip();
      c.fillStyle = rgba('neon', 0.85);
      for (let x = -bw / 2 - 60; x < bw / 2 + 60; x += 22) { c.beginPath(); c.moveTo(x, -bh / 2); c.lineTo(x + 11, -bh / 2); c.lineTo(x + 11 - bh * 0.6, bh / 2); c.lineTo(x - bh * 0.6, bh / 2); c.closePath(); c.fill(); }
      c.restore();
    }
    c.strokeStyle = rgba('neon', 0.9); c.lineWidth = 2;
    c.strokeRect(-bw / 2 + 1, -bh / 2 + 1, bw - 2, bh - 2);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.font = font(F.mono(600), s1); c.letterSpacing = `${s1 * 0.12}px`;
    c.fillStyle = rgba('neon');
    const n = Math.floor(Math.max(0, t - at) * 70);
    c.fillText(l1.slice(0, n), 0, -8);
    c.font = font(F.mono(500), s2); c.letterSpacing = `${s2 * 0.08}px`;
    c.fillStyle = rgba('paper', 0.9);
    c.fillText(l2.slice(0, Math.max(0, n - l1.length)), 0, 38);
    c.restore();
  }

  // ================================================================ train
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
    // the far wall: a lower panel, an upper band, pillars between windows, door openings
    const doors = [DOOR_X, DOOR_X - 9.5, DOOR_X + 9.5];
    const spans: [number, number][] = [];
    let s0 = X0;
    for (const d of [...doors].sort((a, b) => a - b)) { spans.push([s0, d - DOOR_W / 2]); s0 = d + DOOR_W / 2; }
    spans.push([s0, X1]);
    for (const [a, b] of spans) {
      box(car, b - a, WIN_Y0, 0.08, (a + b) / 2, WIN_Y0 / 2, WALL_Z, wallM);
      box(car, b - a, CEIL - WIN_Y1, 0.08, (a + b) / 2, (WIN_Y1 + CEIL) / 2, WALL_Z, wallM);
      // window pillars
      for (let x = a; x <= b + 1e-3; x += (b - a) / Math.max(1, Math.round((b - a) / 1.7))) box(car, 0.14, WIN_Y1 - WIN_Y0, 0.1, x, (WIN_Y0 + WIN_Y1) / 2, WALL_Z, darkM);
      L.seg(a, WIN_Y0, WALL_Z + 0.05, b, WIN_Y0, WALL_Z + 0.05, cc, 1.2);
      L.seg(a, WIN_Y1, WALL_Z + 0.05, b, WIN_Y1, WALL_Z + 0.05, cc, 1.2);
      // the long bench under the windows
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
      // door frame over each opening
      box(car, DOOR_W + 0.2, CEIL - DOOR_H, 0.1, d, (DOOR_H + CEIL) / 2, WALL_Z, wallM);
      L.box(d, 0, WALL_Z + 0.06, DOOR_W, DOOR_H, 0.02, cc, 1.3);
    }
    // the two leaves of the child's door (they slide apart outside the wall)
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      const lw = DOOR_W / 2, leafM = m(scaleRGB(LIN.concrete, 0.5)), edgeM = m(scaleRGB(LIN.sodium, 0.9));
      box(leaf, lw, 1.0, 0.05, 0, 0.5, 0, leafM);
      box(leaf, lw, DOOR_H - 1.72, 0.05, 0, (1.72 + DOOR_H) / 2, 0, leafM);
      box(leaf, 0.08, 0.72, 0.05, -lw / 2 + 0.04, 1.36, 0, leafM);
      box(leaf, 0.08, 0.72, 0.05, lw / 2 - 0.04, 1.36, 0, leafM);
      box(leaf, 0.04, DOOR_H, 0.06, -sx * (lw / 2 - 0.02), DOOR_H / 2, 0.01, edgeM); // the meeting edge
      leaf.userData.sx = sx;
      car.add(leaf);
      this.leaves.push(leaf);
    }
    // poles and the handrail (foreground: they slide past the camera)
    for (const x of [DOOR_X - 1.1, DOOR_X + 1.1, -2.2, -6.4, 8.6]) L.seg(x, 0, -0.6, x, CEIL, -0.6, scaleRGB(LIN.concrete, 1.4), 3.2);
    L.seg(X0, 1.95, 0.35, X1, 1.95, 0.35, scaleRGB(LIN.concrete, 1.2), 2.4);
    L.seg(X0, CEIL - 0.02, -1.0, X1, CEIL - 0.02, -1.0, scaleRGB(LIN.concrete, 0.7), 1);
    // ---- outside: the platform (around the stop point) and the tunnel either side
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
    O.seg(-PLATFORM_HALF, 0.01, -1.9, PLATFORM_HALF, 0.01, -1.9, scaleRGB(LIN.sodium, 0.9), 3); // the yellow edge line
    for (let x = -PLATFORM_HALF + 2; x < PLATFORM_HALF; x += 4) this.outLights.push([x, 4.1, -3.2]);
    // station name plates on the wall; the one by the child's door carries the YOUR STOP callout
    for (const x of [-15, -6, 1.6, 10, 18]) {
      const sg = new NeonSign({ lines: [STATIONS[YOURS]!], pos: [x, 2.3, -5.66], height: 0.62, kind: 'screen', color: 'paper', bright: 1.2, flicker: 0.02, seed: x });
      g.add(sg.mesh);
      this.nameSigns.push(sg);
    }
    // tunnel beyond the platform: dark walls, a light every 12 m
    for (const sx of [-1, 1]) {
      box(g, 400, 4.4, 0.2, sx * (PLATFORM_HALF + 200), 2.2, -2.4, tm);
      for (let x = PLATFORM_HALF + 6; x < 400; x += 12) this.tunnelLights.push(sx * x);
      for (const y of [1.2, 1.35, 2.8]) O.seg(sx * PLATFORM_HALF, y, -2.28, sx * (PLATFORM_HALF + 400), y, -2.28, scaleRGB(LIN.concrete, 0.4), 1.2);
    }
  }

  /** Distance the train has moved relative to its stop (m): brakes into the station, stands, leaves. */
  trainS(t: number, tStop: number, tGo: number) {
    if (t < tStop) { const u = prog(t, tStop - 1.35, tStop); return -34 * Math.pow(1 - u, 3); }
    if (t < tGo) return 0;
    return 0.5 * 8 * (t - tGo) ** 2;
  }

  renderTrain(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t, B = this.B;
    const cam = this.cam;
    const L2 = this.ly.get('You missed the stop');
    const wStop = L2.words.find((w) => /stop/i.test(w.w))!, wClosed = L2.words[L2.words.length - 1]!, wThe = L2.words[4]!;
    const tStop = wStop.start, tOpen = tStop + 0.3, tUp = tStop + 0.55, tWalk0 = tUp + 0.35, tWalk1 = wClosed.start - 0.3;
    const tShut0 = wClosed.start - 0.5, tShut1 = wClosed.start, tGo = wClosed.start + 0.45;
    const s = this.trainS(t, tStop, tGo);
    const speed = t < tStop ? (this.trainS(t + 0.01, tStop, tGo) - s) / 0.01 : t > tGo ? 8 * (t - tGo) : 0;
    this.outGroup.position.x = -s;
    // ---- the child's walk: bench → door
    const wk = prog(t, tWalk0, tWalk1, (x) => x);
    const childX = lerp(BENCH[0] + 0.25, DOOR_X - 1.05, wk);
    const childZ = lerp(-0.75, -0.95, wk);
    // ---- camera: across the aisle; follows the child to the door, a slow push after the doors shut
    const k1 = prog(t, f.start, tWalk0, ease.inOutQuad), k2 = prog(t, tWalk0, tWalk1, ease.inOutQuad), k3 = prog(t, tShut1, f.end, ease.inOutQuad);
    const sway = Math.sin(t * 7.3) * 0.004 * Math.min(1, Math.abs(speed) / 10) + Math.sin(t * 1.3) * 0.006;
    const cx = lerp(lerp(-0.9, 0.3, k1), 1.9, k2) + k3 * 0.5;
    cam.position.set(cx, 1.28 + sway - k3 * 0.08, 1.3 - k3 * 0.35);
    cam.lookAt(cx + 0.55 + k2 * 0.45, 1.3 - k3 * 0.02, WALL_Z);
    cam.fov = 60 - k3 * 6;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // ---- outside
    const clear = scaleRGB(LIN.shadow, 0.6);
    renderer.setRenderTarget(out);
    const prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    renderer.setClearColor(new THREE.Color().setRGB(clear[0], clear[1], clear[2], THREE.LinearSRGBColorSpace), 1);
    renderer.clear();
    renderer.setClearColor(prevClear, prevA);
    for (const sg of this.nameSigns) sg.update(t);
    renderer.render(this.outside, cam);
    this.outLines.emit(this.lines3D, cam, { base: 0.6, fog: 0.02, offset: [-s, 0, 0] });
    this.lines3D.render(renderer, out, cam);
    this.lines3D.clear();
    const g = this.glow3D;
    const cold = mixRGB(LIN.concrete, LIN.paper, 0.65);
    const blur = clamp(Math.abs(speed) * 0.035, 0, 6);
    for (const p of this.outLights) { const x = p[0] - s; if (Math.abs(x - cx) < 30) g.add(x, p[1], p[2], 1.4 + blur, 0.18, cold, 1.4, 3); }
    for (const tx of this.tunnelLights) { const x = tx - s; if (Math.abs(x - cx) < 40) g.add(x, 2.6, -2.25, 0.18 + blur, 0.12, LIN.sodium, 2.2, 4); }
    g.render(renderer, out, cam);
    g.clear();
    // ---- the car
    renderer.setRenderTarget(out); renderer.clearDepth();
    const shut = prog(t, tShut0, tShut1, ease.inOutCubic), open = prog(t, tOpen, tOpen + 0.45, ease.inOutCubic);
    const openK = open * (1 - shut);
    for (const leaf of this.leaves) {
      const sx = leaf.userData.sx as number;
      leaf.position.set(DOOR_X + sx * (DOOR_W / 4 + openK * (DOOR_W / 2 - 0.02)), 0, WALL_Z - 0.06);
    }
    renderer.render(this.car, cam);
    const C = new THREE.Vector3(childX, 0, childZ);
    const droneWake = tUp;
    const lampK = t < droneWake ? 0.12 : clamp(prog(t, droneWake, droneWake + 0.1) * flicker(t, t < droneWake + 0.4 ? 0.9 : 0.03, 3));
    const dPos = t < droneWake
      ? new THREE.Vector3(BENCH[0] - 0.42, BENCH[1] + 0.12, BENCH[2] + 0.05)
      : new THREE.Vector3(lerp(BENCH[0] - 0.42, childX - 0.42, prog(t, droneWake, droneWake + 0.8, ease.inOutCubic)), lerp(BENCH[1] + 0.12, 1.22, prog(t, droneWake, droneWake + 0.8, ease.inOutCubic)) + Math.sin(t * 1.9) * 0.025, lerp(BENCH[2] + 0.05, childZ + 0.1, prog(t, droneWake, droneWake + 0.8)));
    const lamp = makeLamp(dPos, new THREE.Vector3(DOOR_X, 1.0, WALL_Z), 30, 5, 0.9 * lampK);
    this.carLines.emit(this.lines3D, cam, { base: 0.75, fog: 0.02, lamps: [lamp], lampGain: 1.5 });
    this.lines3D.render(renderer, out, cam);
    // ceiling light strips, the door lamps (blinking from "the metro")
    this.tubes.clear();
    for (let x = -13; x < 13; x += 2.6) { const c = scaleRGB(cold, 1.05); this.tubes.seg(x, CEIL - 0.03, -0.55, x + 1.9, CEIL - 0.03, -0.55, 0.12, c[0], c[1], c[2], 1); }
    this.tubes.render(renderer, out, cam);
    const warn = t > wThe.start && t < tShut1 + 0.1 ? (Math.floor((t - wThe.start) * 4) % 2 === 0 ? 1 : 0.15) : 0.1;
    for (const sx of [-1, 1]) g.add(DOOR_X + sx * (DOOR_W / 2 + 0.09), 1.62, WALL_Z + 0.08, 0.06, 0.1, LIN.sodium, 3 * warn, 4);
    for (let x = -13; x < 13; x += 2.6) g.add(x + 0.95, CEIL - 0.1, -0.55, 1.4, 0.35, cold, 0.18, 2);
    g.render(renderer, out, cam);
    this.cone.render(renderer, out, cam, lamp, t, { density: 0.1, floorY: 0, maxDist: 8 });

    // ---- figures
    const w = this.world.ctx;
    const pd = project(cam, dPos.x, dPos.y, dPos.z);
    const drPx = Math.max(2, pxPerMetre(cam, pd.depth) * 0.11);
    const lookD: [number, number] = t < droneWake ? [0.2, 0.8] : [1, 0.25];
    if (t < tUp) {
      // on the bench, kneeling up to the window, reading; from behind
      const pb = project(cam, BENCH[0], BENCH[1], BENCH[2] + 0.1), pbh = project(cam, BENCH[0], BENCH[1] + 1.12, BENCH[2] + 0.1);
      const look = prog(t, tStop - 0.1, tStop + 0.3);
      drawChild(w, pb.x, pb.y, pb.y - pbh.y, { pose: look > 0.5 ? 'sit' : 'read', t, lit: 0.25, litSide: -1, shade: 0.15 });
    } else {
      const pf = project(cam, C.x, 0, C.z), ph = project(cam, C.x, 1.12, C.z);
      const walking = t > tWalk0 && t < tWalk1;
      const rise = prog(t, tUp, tUp + 0.3, ease.outCubic);
      drawChild(w, pf.x, pf.y, (pf.y - ph.y) * lerp(0.9, 1, rise), { pose: walking ? 'walk' : 'stand', profile: 0, t, lit: 0.5 * lampK, litSide: -1, shade: 0.15, phase: 0.3 });
    }
    drawDrone(w, pd.x, pd.y, drPx, { t, lamp: lampK, look: lookD, dark: lampK < 0.3 ? 0.4 : 0, tilt: t < droneWake ? 0.35 : undefined });
    this.drawRoute(w, t, tStop, tGo, cam);
    this.composite2D(this.world, out);
    droneGlow(this.glow2D, pd.x, pd.y, drPx, lampK, lookD);
    this.glow2D.render(renderer, out);

    // ---- callouts: YOUR STOP on the station sign (lands on "stop", follows it away), DOORS CLOSING
    const u = this.ui.ctx;
    const stopSign = (sg: NeonSign) => project(cam, sg.pos.x - s - sg.w * 0.3, sg.pos.y + sg.h * 0.2, sg.pos.z);
    const sp = stopSign(this.nameSigns[2]!);
    drawCallout(u, t, { ax: sp.x, ay: sp.y, lx: sp.x + 60, ly: sp.y - 150, side: 1, text: 'YOUR STOP', at: tStop, out: tGo + 0.1, size: 26, plate: 0.65 });
    const sp2 = stopSign(this.nameSigns[3]!);
    const away = sp2.x > 140 && sp2.x < W - 60 ? 1 : 0;
    drawCallout(u, t, { ax: sp2.x, ay: sp2.y, lx: sp2.x + 60, ly: sp2.y + 190, side: 1, text: ['YOUR STOP', 'LEAVING WITHOUT YOU'], at: tGo + 0.35, out: away ? tGo + 3 : t - 0.36, size: 24, plate: 0.65 });
    const dl = project(cam, DOOR_X + DOOR_W / 2 + 0.09, 1.62, WALL_Z + 0.08);
    drawCallout(u, t, { ax: dl.x, ay: dl.y, lx: dl.x + 110, ly: dl.y + 20, side: 1, text: 'DOORS CLOSING', at: wThe.start, out: tGo + 0.4, size: 24, plate: 0.65, color: 'sodium' });
  }

  /** The route display above the door: stations in a row, the train's position light moving along. */
  drawRoute(c: CanvasRenderingContext2D, t: number, tStop: number, tGo: number, cam: THREE.PerspectiveCamera) {
    const x0 = DOOR_X - 0.9, x1 = DOOR_X + 0.9, y0 = CEIL - 0.04, y1 = DOOR_H + 0.05, z = WALL_Z + 0.06;
    const a = project(cam, x0, y0, z), b = project(cam, x1, y0, z), d = project(cam, x0, y1, z);
    if (a.behind) return;
    const DW = 1000, DH = 150;
    c.save();
    c.setTransform((b.x - a.x) / DW, (b.y - a.y) / DW, (d.x - a.x) / DH, (d.y - a.y) / DH, a.x, a.y);
    c.fillStyle = rgba('shadow', 0.95); c.fillRect(0, 0, DW, DH);
    c.strokeStyle = rgba('concrete', 0.6); c.lineWidth = 3; c.strokeRect(2, 2, DW - 4, DH - 4);
    // position along the route (station index, fractional): at YOUR STOP on "stop", then on towards the next
    const pos = t < tStop ? lerp(YOURS - 0.35, YOURS, prog(t, tStop - 1.2, tStop, ease.outCubic)) : t < tGo ? YOURS : YOURS + clamp((t - tGo) / 6) * 0.9;
    const sx = (i: number) => 90 + i * ((DW - 180) / (STATIONS.length - 1));
    const ly = 62;
    c.strokeStyle = rgba('neon', 0.35); c.lineWidth = 6;
    c.beginPath(); c.moveTo(sx(0), ly); c.lineTo(sx(STATIONS.length - 1), ly); c.stroke();
    c.strokeStyle = rgba('neon', 0.9);
    c.beginPath(); c.moveTo(sx(0), ly); c.lineTo(sx(pos), ly); c.stroke();
    STATIONS.forEach((n, i) => {
      const passed = pos > i + 0.02, here = Math.abs(pos - i) < 0.02;
      const blink = here && Math.floor(t * 3) % 2 === 0;
      c.fillStyle = here ? rgba('neon', blink ? 1 : 0.5) : passed ? rgba('neon', 0.8) : rgba('concrete', 0.8);
      c.beginPath(); c.arc(sx(i), ly, here ? 14 : 10, 0, Math.PI * 2); c.fill();
      c.font = font(F.mono(600), 24); c.letterSpacing = '2px'; c.textAlign = 'center';
      c.fillStyle = i === YOURS ? rgba('paper', 0.95) : rgba('paper', 0.6);
      c.fillText(n, sx(i), 118);
    });
    // the train's own light: a small arrow
    c.fillStyle = rgba('paper', 0.95);
    c.beginPath(); c.moveTo(sx(pos) + 18, ly - 30); c.lineTo(sx(pos) - 4, ly - 42); c.lineTo(sx(pos) - 4, ly - 18); c.closePath(); c.fill();
    c.restore();
  }

  // ================================================================ frame
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t;
    this.begin();
    const L1 = this.ly.get('You are lost'), L2 = this.ly.get('You missed the stop');
    const tCut = L2.words[0]!.start; // "You missed": the page flips 22 → 26, we are in the train
    if (t < tCut) this.renderDistrict(f, out); else this.renderTrain(f, out);
    // ---- UI: the entry (with its printed heading), the panel, the counter
    const u2 = this.ui.ctx;
    const ex = SAFE, ew = W - 2 * SAFE - 330;
    drawEntry(u2, this.ly, this.au, L1, t, { x: ex, y: 200, width: ew, size: 62, alpha: entryAlpha(L1, t, 30, tCut - 0.1) });
    drawEntry(u2, this.ly, this.au, L2, t, { x: W - SAFE - 900, y: H - SAFE - 150, width: 900, size: 58, alpha: entryAlpha(L2, t, 30) });
    if (t < tCut) drawPanel(u2, t, { x: SAFE, y: H - SAFE - 230, w: 600, steps: this.steps1, at: this.steps1[0]!.at - 0.3, size: 24, alpha: 1 - smoothstep(tCut - 0.3, tCut - 0.05, t) });
    else drawPanel(u2, t, { x: SAFE, y: SAFE - 30, w: 640, steps: this.steps2, at: this.steps2[0]!.at - 0.3, size: 24 });
    drawPageCounter(u2, this.ly, t, { chapter: 'lost', chapterStart: f.start });
    this.composite2D(this.ui, out);
    const fadeIn = 1 - smoothstep(f.start, f.start + 0.9, t);
    return { ...POST_BASE, fade: fadeIn * 0.9 };
  }
}
