// The kit for the chapters after `lost` (door … close). `lost` built its world from flat solids and lamp-lit
// wireframes; the later chapters keep its first-person grammar (the child's own hands, the torch, one callout
// at a time beside the chapter line, TESTPLAN A1–A13) but light their worlds for real: lit materials, the torch
// as a shadow-casting spotlight, sodium lamps, wet ground that holds the lights, fog. Everything here is a pure
// function of t (seek-safe, sub-frame safe).
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, lerp, hash, mulberry32, frameIdx } from '../engine/util';
import { F, font, measure, assertGlyphs } from '../engine/type';
import { CityScene, LIN, POST_BASE, SAFE, scaleRGB, mixRGB, project, drawCallout, makeLamp, logText, rgba } from './_motifs';
import { drawHeading } from './_ru';
import { torchPose, drawTorchHand, type Light, type TorchPose } from './_hands';
import { entriesOf } from '../contents';
import { Figure, type FigureSpec } from './_people';

export type V3 = [number, number, number];
export type RGB = [number, number, number];
export type Box = { x: number; y: number; w: number; h: number };
export interface Pov { p: V3; yaw: number; pitch: number; walk: number; roll?: number; fov?: number }
/**
 * A third-person shot of the child, relative to where the child is (the POV): `wide` = far behind and above, the
 * child a small silhouette in the scene ahead; `ots` = over the right shoulder; `low` = low, in front and to the
 * side, looking up past the child; `high` = high above and behind, looking down; `side` = beside the child;
 * `free` = an absolute camera (`p`, `look`). `d`, `h`, `side` scale the offsets; `d1` dollies d to d1 over the shot;
 * `ahead` = how far in front of the child the camera aims; `fov` overrides.
 */
export interface Shot { k: 'wide' | 'ots' | 'low' | 'high' | 'side' | 'back' | 'orbit' | 'free'; d?: number; d1?: number; h?: number; side?: number; ahead?: number; yaw?: number; a0?: number; a1?: number; fov?: number; p?: V3; p1?: V3; look?: V3; look1?: V3; aimY?: number }

export const EYE = 1.12; // the child's eye height (m)
export const lin = (hex: string): RGB => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // three parses hex as sRGB -> linear

// ---------------------------------------------------------------- materials
/** A lit material (linear colour). */
export function lit(rgb: RGB | string, o: { rough?: number; metal?: number; emissive?: RGB; emissiveK?: number; map?: THREE.Texture | null; roughMap?: THREE.Texture | null; normalMap?: THREE.Texture | null; normalK?: number; side?: THREE.Side; fog?: boolean; transparent?: boolean; opacity?: number } = {}) {
  const c = typeof rgb === 'string' ? lin(rgb) : rgb;
  const m = new THREE.MeshStandardMaterial({
    roughness: o.rough ?? 0.85, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide, fog: o.fog ?? true,
    map: o.map ?? null, roughnessMap: o.roughMap ?? null, normalMap: o.normalMap ?? null,
    transparent: o.transparent ?? false, opacity: o.opacity ?? 1,
  });
  m.color.setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
  if (o.normalMap) m.normalScale.set(o.normalK ?? 1, o.normalK ?? 1);
  if (o.emissive) { m.emissive.setRGB(o.emissive[0], o.emissive[1], o.emissive[2], THREE.LinearSRGBColorSpace); m.emissiveIntensity = o.emissiveK ?? 1; }
  return m;
}
/** An unlit glowing material (lamp shades, screens): values > 1 bloom. */
export function glowMat(rgb: RGB, k = 1, o: { map?: THREE.Texture | null; fog?: boolean; transparent?: boolean; additive?: boolean } = {}) {
  const m = new THREE.MeshBasicMaterial({ map: o.map ?? null, fog: o.fog ?? true, transparent: o.transparent ?? !!o.additive, depthWrite: !o.additive, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
  m.color.setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k, THREE.LinearSRGBColorSpace);
  return m;
}

// ---------------------------------------------------------------- procedural textures (canvas, deterministic)
export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, o: { repeat?: [number, number]; srgb?: boolean; aniso?: number } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = o.aniso ?? 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
}
/** Soft blotches (stains, damp, grime) in a colour. */
export function blotches(c: CanvasRenderingContext2D, w: number, h: number, n: number, col: (i: number) => string, rMin: number, rMax: number, seed: number) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = lerp(rMin, rMax, r() ** 2);
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col(i)); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
/** Fine speckle noise. */
export function speckle(c: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, seed: number, light = false) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) { const v = light ? 255 : 0; c.fillStyle = `rgba(${v},${v},${v},${a * r()})`; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}
/** Wet asphalt: a colour map and a roughness map (puddles are smooth and dark). */
export function asphalt(seed = 1, rep: [number, number] = [8, 8], o: { puddles?: number; base?: string } = {}) {
  const S = 512;
  const r = mulberry32(seed);
  const pud: [number, number, number, number][] = [];
  for (let i = 0; i < (o.puddles ?? 7); i++) pud.push([r() * S, r() * S, 30 + r() * 90, 0.3 + r() * 0.5]);
  const map = canvasTex(S, S, (c) => {
    c.fillStyle = o.base ?? '#26282b'; c.fillRect(0, 0, S, S);
    speckle(c, S, S, 9000, 0.35, seed + 1); speckle(c, S, S, 5000, 0.12, seed + 2, true);
    blotches(c, S, S, 30, () => 'rgba(0,0,0,0.25)', 20, 80, seed + 3);
    blotches(c, S, S, 14, () => 'rgba(90,80,60,0.10)', 20, 70, seed + 4);
    for (const [x, y, rad] of pud) { c.fillStyle = 'rgba(8,9,10,0.55)'; c.beginPath(); c.ellipse(x, y, rad, rad * 0.55, (x * 0.01) % 3, 0, Math.PI * 2); c.fill(); }
    // cracks
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) { let x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; c.lineTo(x, y); } c.stroke(); }
  }, { repeat: rep });
  const rough = canvasTex(S, S, (c) => {
    c.fillStyle = '#b4b4b4'; c.fillRect(0, 0, S, S);
    speckle(c, S, S, 6000, 0.4, seed + 5, true);
    blotches(c, S, S, 40, () => 'rgba(30,30,30,0.35)', 20, 90, seed + 6);
    for (const [x, y, rad, k] of pud) { const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(10,10,10,${0.95})`); g.addColorStop(0.8, `rgba(20,20,20,${k})`); g.addColorStop(1, 'rgba(20,20,20,0)'); c.fillStyle = g; c.save(); c.translate(x, y); c.scale(1, 0.55); c.translate(-x, -y); c.fillRect(x - rad, y - rad, rad * 2, rad * 2); c.restore(); }
  }, { repeat: rep, srgb: false });
  return { map, rough };
}
/** Concrete panel: map + roughness, with joints every `jx` × `jy` of the texture. */
export function concreteTex(seed = 2, rep: [number, number] = [1, 1], o: { base?: string; joints?: [number, number]; stains?: number } = {}) {
  const S = 512;
  const map = canvasTex(S, S, (c) => {
    c.fillStyle = o.base ?? '#7d7f80'; c.fillRect(0, 0, S, S);
    speckle(c, S, S, 12000, 0.22, seed); speckle(c, S, S, 6000, 0.1, seed + 1, true);
    blotches(c, S, S, o.stains ?? 26, (i) => (i % 3 ? 'rgba(40,36,30,0.22)' : 'rgba(110,100,80,0.12)'), 20, 120, seed + 2);
    // rain streaks running down from the top
    const r = mulberry32(seed + 3);
    for (let i = 0; i < 40; i++) { const x = r() * S, len = 40 + r() * 200; const g = c.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(20,18,15,0.28)'); g.addColorStop(1, 'rgba(20,18,15,0)'); c.fillStyle = g; c.fillRect(x, 0, 2 + r() * 5, len); }
    if (o.joints) { c.strokeStyle = 'rgba(20,20,20,0.6)'; c.lineWidth = 3; for (let k = 0; k <= o.joints[0]; k++) { c.beginPath(); c.moveTo(k * S / o.joints[0], 0); c.lineTo(k * S / o.joints[0], S); c.stroke(); } for (let k = 0; k <= o.joints[1]; k++) { c.beginPath(); c.moveTo(0, k * S / o.joints[1]); c.lineTo(S, k * S / o.joints[1]); c.stroke(); } }
  }, { repeat: rep });
  return map;
}
/** Brick (the water tower, old sheds): map + a bump-like normal map. */
export function brickTex(seed = 3, rep: [number, number] = [4, 8], base = '#6b3a2c') {
  const S = 512, bw = 64, bh = 24;
  const r = mulberry32(seed);
  const map = canvasTex(S, S, (c) => {
    c.fillStyle = '#3a3531'; c.fillRect(0, 0, S, S);
    for (let y = 0, row = 0; y < S; y += bh, row++) for (let x = -(row % 2) * bw / 2; x < S; x += bw) {
      const k = 0.75 + r() * 0.4;
      const col = new THREE.Color(base).multiplyScalar(k);
      c.fillStyle = `#${col.getHexString()}`; c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
    speckle(c, S, S, 9000, 0.25, seed + 1);
    blotches(c, S, S, 20, () => 'rgba(20,15,10,0.3)', 30, 140, seed + 2);
  }, { repeat: rep });
  const nrm = canvasTex(S, S, (c) => {
    c.fillStyle = 'rgb(128,128,255)'; c.fillRect(0, 0, S, S);
    for (let y = 0, row = 0; y < S; y += bh, row++) for (let x = -(row % 2) * bw / 2; x < S; x += bw) {
      c.fillStyle = 'rgb(128,150,240)'; c.fillRect(x + 2, y + 1, bw - 4, 2); // top edge faces up
      c.fillStyle = 'rgb(128,106,240)'; c.fillRect(x + 2, y + bh - 3, bw - 4, 2);
      c.fillStyle = 'rgb(106,128,240)'; c.fillRect(x + 1, y + 2, 2, bh - 4);
      c.fillStyle = 'rgb(150,128,240)'; c.fillRect(x + bw - 3, y + 2, 2, bh - 4);
    }
  }, { repeat: rep, srgb: false });
  return { map, nrm };
}
/** Corrugated sheet metal: vertical ribs (normal map) and rust (map). */
export function corrugatedTex(seed = 4, rep: [number, number] = [6, 1], base = '#5d6569') {
  const S = 512;
  const map = canvasTex(S, S, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 16) { const g = c.createLinearGradient(x, 0, x + 16, 0); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0.10)'); c.fillStyle = g; c.fillRect(x, 0, 16, S); }
    blotches(c, S, S, 30, (i) => (i % 2 ? 'rgba(120,60,25,0.35)' : 'rgba(60,40,25,0.3)'), 15, 90, seed);
    const r = mulberry32(seed + 1);
    for (let i = 0; i < 50; i++) { const x = r() * S, y = r() * S * 0.6, len = 60 + r() * 220; const g = c.createLinearGradient(0, y, 0, y + len); g.addColorStop(0, 'rgba(110,55,20,0.45)'); g.addColorStop(1, 'rgba(110,55,20,0)'); c.fillStyle = g; c.fillRect(x, y, 2 + r() * 4, len); }
    speckle(c, S, S, 6000, 0.2, seed + 2);
  }, { repeat: rep });
  const nrm = canvasTex(S, 8, (c) => {
    for (let x = 0; x < S; x++) { const a = Math.sin((x / 16) * Math.PI * 2); const nx = Math.round(128 + 110 * a); c.fillStyle = `rgb(${nx},128,${Math.round(255 - 60 * Math.abs(a))})`; c.fillRect(x, 0, 1, 8); }
  }, { repeat: rep, srgb: false });
  return { map, nrm };
}

// ---------------------------------------------------------------- geometry helpers
export function boxMesh(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, o: { ry?: number; rx?: number; rz?: number; cast?: boolean; receive?: boolean } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  m.castShadow = o.cast ?? true; m.receiveShadow = o.receive ?? true;
  parent.add(m); return m;
}
export function cyl(parent: THREE.Object3D, a: V3, b: V3, r0: number, mat: THREE.Material, o: { r1?: number; seg?: number; cast?: boolean } = {}) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r1 ?? r0, r0, va.distanceTo(vb), o.seg ?? 12), mat);
  m.position.copy(va.clone().add(vb).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  m.castShadow = o.cast ?? true; m.receiveShadow = true;
  parent.add(m); return m;
}
/** A ground plane (receives shadows). */
export function ground(parent: THREE.Object3D, w: number, d: number, x: number, z: number, mat: THREE.Material, y = 0) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true;
  parent.add(p); return p;
}
/** A textured plane carrying a canvas (a sign, a notice, a screen), lit (paper) or glowing (screen). */
export function planeSign(parent: THREE.Object3D, cv: HTMLCanvasElement, wM: number, pos: V3, o: { ry?: number; rx?: number; rz?: number; glow?: number; rough?: number } = {}) {
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = o.glow ? glowMat([1, 1, 1], o.glow, { map: tex }) : lit([1, 1, 1], { map: tex, rough: o.rough ?? 0.8 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, wM * cv.height / cv.width), mat);
  m.position.set(...pos); m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  m.receiveShadow = !o.glow;
  parent.add(m); return m;
}

/**
 * A painted tin plate lettered in Georgian (TREATMENT r9 note 2: a few background shop signs or wall lettering in the
 * late unfamiliar district; real words, never a beat's main sign, never instead of the CP1251 glyph soup). Every
 * character is checked against the font before it is drawn (no tofu). Log it with `logPlane(..., 'sign', { scenery })`.
 */
export const KA_WORDS = { bread: 'პური', pharmacy: 'აფთიაქი', workshop: 'სახელოსნო' } as const;
export function kaPlate(parent: THREE.Object3D, text: string, wM: number, pos: V3, o: { ry?: number; bg?: string; ink?: string; glow?: number } = {}) {
  assertGlyphs(F.georgian(), text);
  const cv = document.createElement('canvas');
  const c0 = cv.getContext('2d')!; c0.font = font(F.georgian(), 96);
  const tw = c0.measureText(text).width;
  cv.width = Math.ceil(tw + 96); cv.height = 150;
  const c = cv.getContext('2d')!;
  c.fillStyle = o.bg ?? '#7a2e22'; c.fillRect(0, 0, cv.width, cv.height);
  speckle(c, cv.width, cv.height, 900, 0.18, 77);
  c.strokeStyle = 'rgba(235,225,205,0.7)'; c.lineWidth = 6; c.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  c.fillStyle = o.ink ?? '#ece3cf'; c.font = font(F.georgian(), 96); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, cv.width / 2, cv.height / 2 + 4);
  return planeSign(parent, cv, wM, pos, { ry: o.ry ?? 0, glow: o.glow, rough: 0.7 });
}

// ---------------------------------------------------------------- the lit scene
export interface ShotLights { amb: number; warm: number }

/**
 * The base class of the lit chapters. Owns: the scene's lights (hemisphere + the torch spotlight with shadows),
 * the first-person camera, the torch pose and hand, the chapter line, callout placement clear of signs.
 */
/** The child: ONE outfit in every chapter (TREATMENT r8 continuity): the yellow coat, dark trousers, dark hair, the
 *  small red-brown backpack, 1.24 m (about 4.5 heads). */
export const KID: FigureSpec = { height: 1.24, kid: true, coat: [0.6, 0.47, 0.08], trousers: [0.05, 0.055, 0.08], shoes: [0.03, 0.02, 0.02], hair: [0.03, 0.02, 0.015], pack: [0.16, 0.05, 0.04] };

export abstract class LitScene extends CityScene {
  hemi = new THREE.HemisphereLight(0x6f7e92, 0x1a1612, 0.35);
  torchL = new THREE.SpotLight(0xffe8b5, 0, 0, 0.36, 0.7, 2);
  fogE = new THREE.FogExp2(0x10151b, 0.03);
  T: Record<string, number> = {};
  base = 0;
  /** The chapter's id (for the chapter line and ДОМ · x км). */
  abstract chapter: string;
  obstacles: (t: number) => Box[] = () => [];
  labelCache = new Map<string, { dx: number; dy: number; side: 1 | -1 }>();

  /** The child seen from outside (TESTPLAN B2), used by the third-person shots. */
  kid: Figure | null = null;
  /** The third-person shots: [t0, t1, shot]; outside them the camera is the child's eyes. */
  shots: [number, number, Shot][] = [];
  /** True while a third-person shot is on (no first-person hands are drawn). */
  third = false;
  beamReq: { on: number; k: number; maxDist: number; pose: TorchPose } | null = null;

  B = (k: number) => this.au.timeOfBeat(this.base + k);
  /** Beat nearest to t. */
  nearBeat(t: number) { return this.au.timeOfBeat(Math.round(this.au.beatAt(t))); }
  word(line: string, re: RegExp, nth = 0) { const L = this.ly.get(line); return L.words.filter((w) => re.test(w.w))[nth]!; }

  initLit() {
    const r = this.ctx.renderer;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    this.three.add(this.hemi);
    this.torchL.castShadow = true; this.torchL.shadow.mapSize.set(1024, 1024); this.torchL.shadow.bias = -0.0004; this.torchL.shadow.normalBias = 0.02;
    this.torchL.shadow.camera.near = 0.1; this.torchL.shadow.camera.far = 40;
    this.three.add(this.torchL, this.torchL.target);
    this.three.fog = this.fogE;
  }
  /** A sodium (or any) lamp: a spotlight pointing down + its bulb glow; optional shadows. */
  addLamp(p: V3, o: { color?: RGB; k?: number; angle?: number; shadow?: boolean; target?: V3; dist?: number; penumbra?: number } = {}) {
    const col = o.color ?? LIN.sodium;
    const L = new THREE.SpotLight(new THREE.Color().setRGB(col[0], col[1], col[2], THREE.LinearSRGBColorSpace), o.k ?? 60, o.dist ?? 0, o.angle ?? 1.0, o.penumbra ?? 0.8, 2);
    L.position.set(...p);
    const tg = o.target ?? [p[0], 0, p[2]];
    L.target.position.set(...tg);
    if (o.shadow) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.0005; L.shadow.normalBias = 0.03; L.shadow.camera.near = 0.3; L.shadow.camera.far = 60; }
    this.three.add(L, L.target);
    return L;
  }
  addPoint(p: V3, color: RGB, k: number, dist = 0) {
    const L = new THREE.PointLight(new THREE.Color().setRGB(color[0], color[1], color[2], THREE.LinearSRGBColorSpace), k, dist, 2);
    L.position.set(...p); this.three.add(L); return L;
  }

  // ---- third-person shots
  /** The child in a yellow raincoat with the hood up (the sleeve of the first-person shots), about 4.5 heads tall. */
  initKid(seed = 31) {
    // hood down (a hood up reads as a round ball on a round body: R2 «Kenny»), dark hair, a small backpack
    this.kid = new Figure(this.three, { ...KID, seed }, 64);
    this.kid.visible = false;
    return this.kid;
  }
  shotAt(t: number): { s: Shot; u: number } | null {
    for (const [a, b, s] of this.shots) if (t >= a && t < b) return { s, u: (t - a) / Math.max(b - a, 1e-3) };
    return null;
  }
  /**
   * Call after torch(): while a shot is on, the child's figure stands where the eyes were, the torch light moves to
   * the figure's hand and the camera cuts outside. `floor` = the ground under the child, `speed` for the gait.
   */
  cut(t: number, P: Pov, pose: TorchPose | null, o: { floor?: number; speed?: number; dist?: number; look?: number; phone?: number; film?: number; headDown?: number; sit?: number; armL?: number; force?: { s: Shot; u: number } | null } = {}) {
    const sh = o.force !== undefined ? o.force : this.shotAt(t);
    this.third = !!sh;
    if (!this.kid) { if (!sh) return; this.initKid(); }
    const kid = this.kid!;
    kid.visible = !!sh;
    if (!sh) return;
    const { s, u } = sh;
    const floor = o.floor ?? 0;
    const feet = new THREE.Vector3(P.p[0], floor, P.p[2]);
    const sy = P.yaw + (s.yaw ?? 0);
    const f = new THREE.Vector3(-Math.sin(sy), 0, -Math.cos(sy)), r = new THREE.Vector3(Math.cos(sy), 0, -Math.sin(sy));
    const speed = o.speed ?? P.walk * 1.3;
    kid.pose({ pos: feet, heading: P.yaw + Math.PI / 2, t, speed, dist: o.dist ?? t * speed, film: o.film ?? (pose ? 0.85 : 0), phone: o.phone ?? 0, look: o.look ?? 0, headDown: o.headDown ?? -P.pitch * 0.5, sit: o.sit ?? 0, armL: o.armL ?? 0 });
    if (pose) { // the light leaves the figure's hand, along the same aim
      const dir = pose.target.clone().sub(pose.head).normalize();
      this.torchL.position.copy(kid.hR).addScaledVector(dir, 0.08);
      this.torchL.target.position.copy(this.torchL.position).addScaledVector(dir, 7);
      this.torchL.target.updateMatrixWorld();
    }
    const d = lerp(s.d ?? 1, s.d1 ?? s.d ?? 1, u), h = s.h ?? 1, sd = s.side ?? 1;
    const eye = feet.clone().add(new THREE.Vector3(0, EYE, 0));
    let cp: THREE.Vector3, look: THREE.Vector3, fov = s.fov;
    const ahead = s.ahead ?? 1;
    switch (s.k) {
      case 'wide': cp = feet.clone().addScaledVector(f, -7 * d).addScaledVector(r, 1.2 * sd).add(new THREE.Vector3(0, 2.6 * h, 0)); look = feet.clone().addScaledVector(f, 5 * ahead).add(new THREE.Vector3(0, 1.0 + (s.aimY ?? 0), 0)); fov ??= PORTRAIT ? 64 : 46; break;
      case 'ots': cp = eye.clone().addScaledVector(f, -0.95 * d).addScaledVector(r, 0.42 * sd).add(new THREE.Vector3(0, 0.22 * h, 0)); look = eye.clone().addScaledVector(f, 6 * ahead).add(new THREE.Vector3(0, Math.tan(P.pitch) * 6 + (s.aimY ?? 0), 0)); fov ??= PORTRAIT ? 66 : 50; break;
      case 'low': cp = feet.clone().addScaledVector(f, 2.4 * d).addScaledVector(r, 1.5 * sd).add(new THREE.Vector3(0, 0.25 * h, 0)); look = eye.clone().add(new THREE.Vector3(0, 0.25 + (s.aimY ?? 0), 0)).addScaledVector(f, -0.6 * ahead); fov ??= PORTRAIT ? 72 : 56; break;
      case 'back': cp = feet.clone().addScaledVector(f, -2.0 * d).addScaledVector(r, 0.55 * sd).add(new THREE.Vector3(0, 0.38 * h, 0)); look = eye.clone().addScaledVector(f, 5 * ahead).add(new THREE.Vector3(0, 0.3 + (s.aimY ?? 0), 0)); fov ??= PORTRAIT ? 70 : 54; break;
      case 'high': cp = feet.clone().addScaledVector(f, -3.2 * d).addScaledVector(r, 0.8 * sd).add(new THREE.Vector3(0, 7.5 * h, 0)); look = feet.clone().addScaledVector(f, 2.2 * ahead).add(new THREE.Vector3(0, s.aimY ?? 0, 0)); fov ??= PORTRAIT ? 64 : 48; break;
      case 'side': cp = feet.clone().addScaledVector(r, 3.6 * d * sd).addScaledVector(f, 0.6).add(new THREE.Vector3(0, 1.0 * h, 0)); look = feet.clone().addScaledVector(f, 1.2 * ahead).add(new THREE.Vector3(0, 0.75 + (s.aimY ?? 0), 0)); fov ??= PORTRAIT ? 66 : 50; break;
      case 'orbit': { // around s.p (centre on the ground) at radius d, height h, angle a0 -> a1, looking at s.look
        const e = u * u * (3 - 2 * u), a = lerp(s.a0 ?? 0, s.a1 ?? 1, e), c0 = s.p ?? [0, 0, 0];
        cp = new THREE.Vector3(c0[0] + Math.cos(a) * d, c0[1] + h, c0[2] + Math.sin(a) * d);
        look = new THREE.Vector3(...(s.look ?? c0)); fov ??= PORTRAIT ? 64 : 48; break;
      }
      default: {
        const a = new THREE.Vector3(...(s.p ?? [0, 2, 5])), b = new THREE.Vector3(...(s.p1 ?? s.p ?? [0, 2, 5]));
        const la = new THREE.Vector3(...(s.look ?? [P.p[0], 0.8, P.p[2]])), lb = new THREE.Vector3(...(s.look1 ?? s.look ?? [P.p[0], 0.8, P.p[2]]));
        const e = u * u * (3 - 2 * u);
        cp = a.lerp(b, e); look = la.lerp(lb, e); fov ??= PORTRAIT ? 64 : 48;
      }
    }
    const p: V3 = [cp.x, cp.y, cp.z], q: V3 = [look.x, look.y, look.z];
    this.setCam({ p, yaw: this.yawTo(p, q), pitch: this.pitchTo(p, q), walk: 0, fov }, t, 0.3);
  }

  // ---- camera
  setCam(c: Pov, t: number, moving = 0) {
    const cam = this.cam;
    const bob = c.walk * Math.abs(Math.sin(t * 7.4)) * 0.03, sway = c.walk * Math.sin(t * 3.7) * 0.012;
    const swayY = Math.sin(t * 7.3) * 0.006 * moving + Math.sin(t * 1.3) * 0.003;
    cam.position.set(c.p[0] + sway * Math.cos(c.yaw), c.p[1] + bob + swayY, c.p[2] - sway * Math.sin(c.yaw));
    const dir = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch));
    const roll = (c.roll ?? 0) + c.walk * Math.sin(t * 3.7) * 0.01 + Math.sin(t * 5.3) * 0.004 * moving;
    cam.up.set(Math.sin(roll) * Math.cos(c.yaw), Math.cos(roll), -Math.sin(roll) * Math.sin(c.yaw));
    cam.lookAt(cam.position.clone().add(dir));
    cam.up.set(0, 1, 0);
    cam.fov = c.fov ?? (PORTRAIT ? 74 : 56);
    cam.near = 0.05; cam.far = 2500;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
  /** Yaw that looks from p towards q (the camera's convention: yaw 0 looks down -z). */
  yawTo(p: V3 | THREE.Vector3, q: V3 | THREE.Vector3) {
    const a = Array.isArray(p) ? p : [p.x, p.y, p.z], b = Array.isArray(q) ? q : [q.x, q.y, q.z];
    return Math.atan2(-(b[0]! - a[0]!), -(b[2]! - a[2]!));
  }
  pitchTo(p: V3, q: V3) { return Math.atan2(q[1] - p[1], Math.hypot(q[0] - p[0], q[2] - p[2])); }

  // ---- torch
  /** The torch this frame: its pose (camera space) and the spotlight on it. `aimAt` points the beam at a world point. */
  torch(t: number, o: { raise?: number; on?: number; walk?: number; beat?: number; aimAt?: THREE.Vector3 | null; aimK?: number; spot?: number; angle?: number }) {
    const cam = this.cam, raise = o.raise ?? 1;
    if (raise <= 0.001) { this.torchL.intensity = 0; return null; }
    let pose = torchPose(cam, t, { raise, walk: o.walk ?? 0, beat: o.beat ?? 0 });
    if (o.aimAt && (o.aimK ?? 1) > 0.001) {
      const k = o.aimK ?? 1;
      let aim = { x: 0, y: 0 };
      for (let it = 0; it < 3; it++) {
        const want = cam.worldToLocal(o.aimAt.clone()).sub(pose.headC).normalize();
        const got = pose.tailC.clone().sub(pose.headC).negate().normalize();
        const dx = Math.atan2(want.x, -want.z) - Math.atan2(got.x, -got.z), dy = Math.asin(clamp(want.y, -1, 1)) - Math.asin(clamp(got.y, -1, 1));
        aim = { x: aim.x + dx * k, y: aim.y + dy * k };
        pose = torchPose(cam, t, { raise, walk: o.walk ?? 0, beat: o.beat ?? 0, aim });
      }
    }
    const on = (o.on ?? 1) * (raise > 0.5 ? 1 : 0);
    this.torchL.position.copy(pose.head);
    this.torchL.target.position.copy(pose.target);
    this.torchL.target.updateMatrixWorld();
    this.torchL.intensity = (o.spot ?? 9) * on;
    this.torchL.angle = o.angle ?? 0.36;
    return pose;
  }
  /** The torch's volumetric beam in the haze. */
  beam(out: THREE.WebGLRenderTarget, t: number, pose: TorchPose | null, on: number, o: { density?: number; maxDist?: number; floorY?: number; half?: number } = {}) {
    // The light itself lands on surfaces as the SpotLight's pool (with shadows). The haze is only a faint wedge drawn
    // from the lens along the torch axis (drawn with the hands, so it starts exactly at the lens: TESTPLAN B1); a
    // ray-marched cone ignored depth and read as a grey smudge floating in the air.
    this.beamReq = pose && on > 0.01 ? { on, k: clamp((o.density ?? 0.02) / 0.02, 0.3, 1.5), maxDist: o.maxDist ?? 7, pose } : null;
    void out; void t; void makeLamp;
  }
  /** The faint haze wedge from `from` (screen) along the torch's world axis. */
  beamWedge(c: CanvasRenderingContext2D, lens: { x: number; y: number } | null) {
    const b = this.beamReq; if (!b) return;
    const o = this.third ? this.torchL.position.clone() : b.pose.head.clone();
    const dir = (this.third ? this.torchL.target.position.clone().sub(this.torchL.position) : b.pose.target.clone().sub(b.pose.head)).normalize();
    const L = clamp(b.maxDist, 0.8, 7);
    const a = project(this.cam, o.x, o.y, o.z), e3 = o.clone().addScaledVector(dir, L), e = project(this.cam, e3.x, e3.y, e3.z);
    if (a.behind || e.behind) return;
    const s0 = lens ?? { x: a.x, y: a.y };
    const dx = e.x - s0.x, dy = e.y - s0.y, len = Math.hypot(dx, dy); if (len < 4) return;
    const nx = -dy / len, ny = dx / len;
    const dEnd = Math.max(0.3, e3.clone().applyMatrix4(this.cam.matrixWorldInverse).z * -1);
    const w1 = Math.min(W * 0.25, (H / 2) / Math.tan((this.cam.fov * Math.PI) / 360) * (L * 0.13) / dEnd), w0 = 3;
    const a0 = 0.03 * b.on * b.k;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const q of [1, 0.66, 0.36]) { // nested wedges: soft edges without a blur filter (which banded)
      const g = c.createLinearGradient(s0.x, s0.y, e.x, e.y);
      g.addColorStop(0, `rgba(255,228,178,${a0})`); g.addColorStop(0.45, `rgba(255,228,178,${a0 * 0.35})`); g.addColorStop(1, 'rgba(255,228,178,0)');
      c.fillStyle = g; const w = w1 * q, v0 = w0 * q;
      c.beginPath(); c.moveTo(s0.x + nx * v0, s0.y + ny * v0); c.lineTo(e.x + nx * w, e.y + ny * w); c.lineTo(e.x - nx * w, e.y - ny * w); c.lineTo(s0.x - nx * v0, s0.y - ny * v0); c.closePath(); c.fill();
    }
    c.restore();
  }
  /** Draw the torch hand (and its lens glow). */
  torchHand(c: CanvasRenderingContext2D, pose: TorchPose | null, light: Light) {
    if (this.third) { // the torch in the child's hand, seen from outside: a small lens glow and the wedge
      if (pose && this.beamReq && this.kid) { const q = this.torchL.position; const a = project(this.cam, q.x, q.y, q.z); if (!a.behind) { const body = this.kid.g.position.clone().setY(this.kid.g.position.y + 0.7); const hid = this.cam.position.distanceTo(q) > this.cam.position.distanceTo(body) + 0.08; if (!hid) { this.glow2D.add(a.x, a.y, 0, 18, 18, LIN.lamp, 0.7 * this.beamReq.on, 3); this.beamWedge(c, { x: a.x, y: a.y }); } } }
      return null;
    }
    if (!pose) return null;
    const r = drawTorchHand(c, this.cam, pose, light);
    this.glow2D.add(r.lens.x, r.lens.y, 0, 50, 50, LIN.lamp, 0.8 * (light.torch ?? 0), 3);
    this.beamWedge(c, r.lens);
    return r;
  }

  // ---- world render
  /** sky -> lit three.js scene -> 3D glows -> torch beam. */
  renderWorld(out: THREE.WebGLRenderTarget, t: number, o: { sky?: { top: RGB; horizon: RGB; low: RGB; horizonY?: number; haze?: number }; clear?: RGB } = {}) {
    const { renderer } = this.ctx;
    if (o.sky) this.sky.render(renderer, out, { ...o.sky, t });
    else {
      const cl = o.clear ?? scaleRGB(LIN.shadow, 0.6);
      renderer.setRenderTarget(out);
      const pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha();
      renderer.setClearColor(new THREE.Color().setRGB(cl[0], cl[1], cl[2], THREE.LinearSRGBColorSpace), 1);
      renderer.clear();
      renderer.setClearColor(pc, pa);
    }
    this.drawThree(out);
  }
  flushGlow(out: THREE.WebGLRenderTarget) { this.glow3D.render(this.ctx.renderer, out, this.cam); this.glow3D.clear(); }

  // ---- text in the world
  /** A mesh plane's box on screen, or null (behind the camera). */
  planeBox(m: THREE.Mesh): Box | null {
    const { width: w, height: h } = (m.geometry as THREE.PlaneGeometry).parameters;
    m.updateMatrixWorld(true);
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => { const v = new THREE.Vector3(x, y, 0).applyMatrix4(m.matrixWorld); return project(this.cam, v.x, v.y, v.z); });
    if (pts.some((q) => q.behind)) return null;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  /**
   * Log a textured plane's text. `frac` = the text's box within the plane (u0, v0, u1, v1 in 0..1, v down) so the
   * reported box is the lettering, not the whole plate; `minPx` = the least letter height that reads.
   */
  logPlane(m: THREE.Mesh, text: string, kind: 'garble' | 'sign' | 'place', o: { frac?: [number, number, number, number]; minPx?: number; id?: string; scenery?: boolean; lit?: boolean; letterFrac?: number } = {}) {
    if (!m.visible) return;
    const { width: w, height: h } = (m.geometry as THREE.PlaneGeometry).parameters;
    const [u0, v0, u1, v1] = o.frac ?? [0, 0, 1, 1];
    m.updateMatrixWorld(true);
    const pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => { const p = new THREE.Vector3((u! - 0.5) * w, (0.5 - v!) * h, 0).applyMatrix4(m.matrixWorld); return project(this.cam, p.x, p.y, p.z); });
    if (pts.some((q) => q.behind)) return;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (b.x + b.w < 0 || b.x > W || b.y + b.h < 0 || b.y > H) return;
    const inFrame = b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;
    const letter = b.h * (o.letterFrac ?? 1);
    const id = o.id ?? `${kind}:${text}`;
    logText(kind, text, (o.lit ?? true) && inFrame && letter >= (o.minPx ?? 14), b, { id: o.scenery ? `scenery:${kind}:${text}` : id });
  }

  // ---- the non-diegetic layer
  lyricBox(): Box { return PORTRAIT ? { x: 30, y: 1416 - 100 * 3 - 90, w: W - 60, h: 440 } : { x: SAFE - 30, y: H - 96 - 64 * 2 - 70, w: 1080, h: 290 }; }
  /** The chapter line(s): the handbook's heading lit as each line is sung (bottom left). */
  heading(c: CanvasRenderingContext2D, t: number, f: Frame) {
    const es = entriesOf(this.chapter);
    const hx = PORTRAIT ? 60 : SAFE, hy = PORTRAIT ? 1416 : H - 96, hw = PORTRAIT ? W - 210 : 1000, hs = PORTRAIT ? 100 : 64;
    es.forEach((e, i) => {
      const L = this.ly.get(e.line);
      const until = es[i + 1] ? this.ly.get(es[i + 1]!.line).words[0]!.start : f.end + 1;
      drawHeading(c, L, e.heading, t, { x: hx, y: hy, width: hw, size: hs, until, plate: 0.93 }); // dense enough that glare behind the plate keeps A9 contrast
    });
  }
  labelBox(text: string | string[], size: number, lx: number, ly: number, side: 1 | -1): Box {
    const lines = Array.isArray(text) ? text : [text];
    const w = Math.max(...lines.map((ln) => measure(ln, F.mono(500), size, size * 0.06)));
    return { x: (side > 0 ? lx : lx - w) - size * 0.5, y: ly - size * 1.15, w: w + size, h: size * (0.75 + 1.35 * lines.length) };
  }
  clampLabel(b: Box): Box {
    const x0 = 40, x1 = W - (PORTRAIT ? 145 : 40), y0 = PORTRAIT ? 155 : 40, y1 = H - (PORTRAIT ? 485 : 40);
    return { ...b, x: clamp(b.x, x0, x1 - b.w), y: clamp(b.y, y0, y1 - b.h) };
  }
  /** Set the camera (and moving parts) as at t, run fn, restore. Scenes override `poseAt` to apply their motion. */
  poseAt(t: number) { this.setCam(this.pov(t), t, 0); }
  abstract pov(t: number): Pov;
  withCamAt<R>(t: number, fn: () => R): R {
    const cam = this.cam;
    const saved = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    this.poseAt(t);
    const r = fn();
    cam.position.copy(saved.p); cam.quaternion.copy(saved.q); cam.fov = saved.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    return r;
  }
  /** A label offset that stays clear of the obstacles and the chapter line over the callout's life (cached). */
  pickLabel(text: string | string[], size: number, at: number, out: number, anchor: (t: number) => { x: number; y: number } | null) {
    const key = `${JSON.stringify(text)}@${at.toFixed(3)}`;
    const hit = this.labelCache.get(key);
    if (hit) return hit;
    const cands: [number, number, 1 | -1][] = [[50, -90, 1], [-50, -90, -1], [50, 120, 1], [-50, 120, -1], [110, -20, 1], [-110, -20, -1], [50, -180, 1], [-50, -180, -1], [60, 210, 1], [-60, 210, -1], [50, -280, 1], [-50, -280, -1]];
    const samples: { a: { x: number; y: number }; obst: Box[] }[] = [];
    const t1 = Math.min(out, at + 5);
    for (let k = 0; k <= 16; k++) {
      const t = lerp(at + 0.1, t1, k / 16);
      const r = this.withCamAt(t, () => ({ a: anchor(t), obst: this.obstacles(t) }));
      if (r.a) samples.push({ a: r.a, obst: [this.lyricBox(), ...r.obst] });
    }
    let best = cands[0]!, bestA = Infinity;
    for (const cd of cands) {
      let a = 0;
      for (const sm of samples) {
        const b = this.labelBox(text, size, sm.a.x + cd[0], sm.a.y + cd[1], cd[2]);
        const c = this.clampLabel(b);
        a += 40 * (Math.abs(c.x - b.x) + Math.abs(c.y - b.y));
        for (const o of sm.obst) a += Math.max(0, Math.min(c.x + c.w, o.x + o.w) - Math.max(c.x, o.x) + 6) * Math.max(0, Math.min(c.y + c.h, o.y + o.h) - Math.max(c.y, o.y) + 6);
      }
      if (a < bestA) { bestA = a; best = cd; }
      if (a === 0) break;
    }
    const r = { dx: best[0], dy: best[1], side: best[2] };
    this.labelCache.set(key, r);
    return r;
  }
  placeLabel(text: string | string[], size: number, a: { x: number; y: number }, o: { dx: number; dy: number; side: 1 | -1 }) {
    const lx = a.x + o.dx, ly = a.y + o.dy;
    const b = this.labelBox(text, size, lx, ly, o.side), c = this.clampLabel(b);
    return { lx: lx + c.x - b.x, ly: ly + c.y - b.y, side: o.side };
  }
  /** One callout: a ring on its object, a short dotted leader, the mono label (clear of signs and the chapter line). */
  callout(c: CanvasRenderingContext2D, t: number, text: string | string[], at: number, out: number, anchor: (t: number) => { x: number; y: number } | null, extra: Partial<Parameters<typeof drawCallout>[2]> = {}) {
    if (t < at - 0.05 || t > out + 0.4) return;
    const S = PORTRAIT ? 34 : 26;
    const o = this.pickLabel(text, S, at, out, anchor);
    const a = anchor(t);
    if (!a) return;
    drawCallout(c, t, { ax: a.x, ay: a.y, ...this.placeLabel(text, S, a, o), text, at, cps: 150, out, size: S, plate: 0.93, ...extra });
  }
  /** Screen point of a world point, or null when off screen / behind. */
  onScreen(x: number, y: number, z: number, m = 20) {
    const p = project(this.cam, x, y, z);
    return !p.behind && p.x > m && p.x < W - m && p.y > m && p.y < H - m ? { x: p.x, y: p.y } : null;
  }
}

/** Rain streaks lit where they pass through the torch beam (screen space). */
export function beamLit(cam: THREE.PerspectiveCamera, pose: TorchPose | null, on: number) {
  if (!pose || on <= 0.01) return undefined;
  const a = project(cam, pose.head.x, pose.head.y, pose.head.z), b = project(cam, pose.target.x, pose.target.y, pose.target.z);
  if (a.behind) return undefined;
  const bx = b.behind ? a.x + (a.x - b.x) : b.x, by = b.behind ? a.y + (a.y - b.y) : b.y;
  const dx = bx - a.x, dy = by - a.y, L2 = dx * dx + dy * dy || 1;
  return (x: number, y: number) => {
    const u = clamp(((x - a.x) * dx + (y - a.y) * dy) / L2);
    const px = a.x + dx * u, py = a.y + dy * u, d = Math.hypot(x - px, y - py);
    const wdt = 30 + 260 * u;
    return on * clamp(1 - d / wdt) * (0.3 + 0.7 * (1 - u)) * 0.8;
  };
}

/** Per-frame jitter constant over the shutter. */
export const jit = (t: number, seed: number) => hash(frameIdx(t), seed);
export { POST_BASE, LIN, scaleRGB, mixRGB, project, rgba, font, F };

// ---------------------------------------------------------------- Soviet panel blocks (night)
let FACADE: THREE.Texture | null = null;
/** One facade tile: a 3.2 m panel × one 2.8 m floor, a window with its frame, the panel joints, damp stains. */
function facadeTex() {
  if (FACADE) return FACADE;
  FACADE = canvasTex(256, 224, (c, w, h) => {
    c.fillStyle = '#6c6e6c'; c.fillRect(0, 0, w, h);
    speckle(c, w, h, 2500, 0.25, 11); blotches(c, w, h, 6, () => 'rgba(30,28,24,0.25)', 10, 60, 12);
    // joints
    c.fillStyle = 'rgba(25,25,25,0.8)'; c.fillRect(0, 0, w, 4); c.fillRect(0, 0, 4, h);
    // the window (dark glass in a pale frame)
    const x0 = 64, y0 = 58, ww = 128, wh = 112;
    c.fillStyle = '#b8b3a6'; c.fillRect(x0 - 6, y0 - 6, ww + 12, wh + 12);
    c.fillStyle = '#0d1116'; c.fillRect(x0, y0, ww, wh);
    c.fillStyle = '#b8b3a6'; c.fillRect(x0 + ww * 0.62, y0, 6, wh); c.fillRect(x0, y0 + wh * 0.28, ww * 0.62, 5);
    const g = c.createLinearGradient(x0, y0, x0 + ww, y0 + wh); g.addColorStop(0, 'rgba(120,130,140,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x0, y0, ww, wh);
    // sill and a streak below it
    c.fillStyle = '#8a8880'; c.fillRect(x0 - 10, y0 + wh + 6, ww + 20, 6);
    const s = c.createLinearGradient(0, y0 + wh + 12, 0, h); s.addColorStop(0, 'rgba(20,18,15,0.35)'); s.addColorStop(1, 'rgba(20,18,15,0)'); c.fillStyle = s; c.fillRect(x0 + 10, y0 + wh + 12, ww - 20, h - y0 - wh - 12);
  }, { repeat: [1, 1] });
  FACADE.wrapS = FACADE.wrapT = THREE.RepeatWrapping;
  return FACADE;
}
export interface LitWindow { p: V3; ry: number; c: RGB; k: number; tv: number }
/**
 * A panel block (пятиэтажка / девятиэтажка) of `len` m along its axis, `floors` high, rotated `ang` about y, centred
 * at (cx, cz): lit concrete facades with window tiles, a flat roof with a parapet, a few lit windows (returned for the
 * scene to draw as emissive panes, so it can switch them off block by block), entrance canopies.
 */
export function panelBlock(parent: THREE.Object3D, o: { cx: number; cz: number; len: number; floors: number; ang: number; seed: number; litRate?: number; depth?: number; roofLetters?: boolean }): LitWindow[] {
  const FH = 2.8, D = o.depth ?? 12, h = o.floors * FH, len = o.len;
  const g = new THREE.Group(); g.position.set(o.cx, 0, o.cz); g.rotation.y = o.ang; parent.add(g);
  const tex = facadeTex().clone(); tex.needsUpdate = true; tex.repeat.set(Math.round(len / 3.2), o.floors);
  const fm = lit([0.55, 0.55, 0.53], { map: tex, rough: 0.9 });
  const cm = lit([0.24, 0.24, 0.23], { rough: 0.95 });
  // core (dark), two facades, ends
  boxMesh(g, len - 0.1, h, D - 0.1, 0, h / 2, 0, cm);
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), fm); p.position.set(0, h / 2, s * D / 2); p.rotation.y = s > 0 ? 0 : Math.PI; p.receiveShadow = true; g.add(p); }
  boxMesh(g, len + 0.3, 0.6, D + 0.3, 0, h + 0.3, 0, lit([0.2, 0.2, 0.2]));
  const r = mulberry32(o.seed);
  const out: LitWindow[] = [];
  const cols = Math.round(len / 3.2), cw = len / cols;
  const ca = Math.cos(o.ang), sa = Math.sin(o.ang);
  const W2 = (u: number, y: number, v: number): V3 => [o.cx + u * ca + v * sa, y, o.cz - u * sa + v * ca];
  for (const s of [1, -1]) for (let f = 0; f < o.floors; f++) for (let k = 0; k < cols; k++) {
    if (r() > (o.litRate ?? 0.16)) continue;
    const u = -len / 2 + (k + 0.5) * cw, y = f * FH + FH * 0.5;
    const tv = r() < 0.1 ? 1 : 0;
    const warm = r();
    out.push({ p: W2(u, y + 0.08, s * (D / 2 + 0.03)), ry: o.ang + (s > 0 ? 0 : Math.PI), c: tv ? [0.55, 0.62, 0.8] : mixRGB(lin('#ffb85c'), lin('#ffe2b0'), warm), k: 0.6 + r() * 0.7, tv });
  }
  // entrance canopies with a lamp each
  for (let u = -len / 2 + 8; u < len / 2 - 4; u += 16) boxMesh(g, 2.2, 0.15, 1.4, u, 2.6, D / 2 + 0.7, cm);
  return out;
}
/** Emissive window panes (instanced) for a list of lit windows; `setK` changes each pane's brightness. */
export class WindowPanes {
  mesh: THREE.InstancedMesh; list: LitWindow[];
  private col = new THREE.Color();
  constructor(parent: THREE.Object3D, list: LitWindow[], size: [number, number] = [1.25, 1.1]) {
    this.list = list;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ fog: true, toneMapped: false }), Math.max(1, list.length));
    const o = new THREE.Object3D();
    list.forEach((w, i) => { o.position.set(...w.p); o.rotation.set(0, w.ry, 0); o.updateMatrix(); this.mesh.setMatrixAt(i, o.matrix); });
    this.mesh.count = list.length;
    this.set(() => 1);
    parent.add(this.mesh);
  }
  set(k: (w: LitWindow, i: number) => number) {
    this.list.forEach((w, i) => { const v = w.k * k(w, i); this.col.setRGB(w.c[0] * v, w.c[1] * v, w.c[2] * v, THREE.LinearSRGBColorSpace); this.mesh.setColorAt(i, this.col); });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- street furniture
let FENCE_TEX: THREE.Texture | null = null;
/** The promzona's concrete fence (ПО-2 panels with the diamond relief) with barbed wire on brackets, from x0 to x1 along x at z. */
export function concreteFence(parent: THREE.Object3D, x0: number, x1: number, z: number, o: { gap?: [number, number][]; face?: 1 | -1; h?: number } = {}) {
  FENCE_TEX ??= canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#86857f'; c.fillRect(0, 0, w, h);
    speckle(c, w, h, 9000, 0.25, 21); blotches(c, w, h, 16, () => 'rgba(35,30,25,0.3)', 20, 110, 22);
    // the diamond relief: light upper edges, dark lower edges
    for (let k = 0; k < 4; k++) {
      const cx = 64 + k * 128, cy = 128;
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 5; c.beginPath(); c.moveTo(cx - 52, cy); c.lineTo(cx, cy - 90); c.lineTo(cx + 52, cy); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.moveTo(cx - 52, cy); c.lineTo(cx, cy + 90); c.lineTo(cx + 52, cy); c.stroke();
    }
    const s = c.createLinearGradient(0, 0, 0, h); s.addColorStop(0, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(20,18,14,0.45)'); c.fillStyle = s; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(20,20,20,0.9)'; c.fillRect(0, 0, 4, h);
  });
  const H2 = o.h ?? 2.3, PW = 2.5;
  const mat = lit([0.62, 0.62, 0.6], { map: FENCE_TEX, rough: 0.92 });
  const wire = lit([0.32, 0.33, 0.35], { rough: 0.5, metal: 0.6 });
  const f = o.face ?? 1;
  const inGap = (x: number) => (o.gap ?? []).some(([a, b]) => x + PW > a && x < b);
  for (let x = x0; x < x1; x += PW) {
    if (inGap(x)) continue;
    boxMesh(parent, PW - 0.02, H2, 0.14, x + PW / 2, H2 / 2, z, mat);
    // bracket + three strands
    cyl(parent, [x, H2, z], [x, H2 + 0.42, z + f * 0.32], 0.012, wire, { seg: 5, cast: false });
    for (const [dy, dz] of [[0.14, 0.1], [0.28, 0.21], [0.42, 0.32]]) cyl(parent, [x, H2 + dy!, z + f * dz!], [x + PW, H2 + dy!, z + f * dz!], 0.005, wire, { seg: 4, cast: false });
  }
}
/** A Soviet streetlight: a tapered concrete post with a curved steel arm; returns the lamp head position. */
export function streetLight(parent: THREE.Object3D, x: number, z: number, o: { h?: number; arm?: V3; mat?: THREE.Material } = {}): V3 {
  const h = o.h ?? 7.5, arm = o.arm ?? [0, 0, 1.4];
  const m = o.mat ?? lit([0.45, 0.45, 0.43], { rough: 0.9 });
  cyl(parent, [x, 0, z], [x, h, z], 0.13, m, { r1: 0.08, seg: 8 });
  const tip: V3 = [x + arm[0], h + 0.2, z + arm[2]];
  cyl(parent, [x, h - 0.2, z], [x + arm[0] * 0.5, h + 0.28, z + arm[2] * 0.5], 0.04, m, { seg: 6 });
  cyl(parent, [x + arm[0] * 0.5, h + 0.28, z + arm[2] * 0.5], tip, 0.04, m, { seg: 6 });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.16, 12), lit([0.3, 0.3, 0.3], { rough: 0.6, metal: 0.4 }));
  head.position.set(tip[0], tip[1] - 0.06, tip[2]); head.castShadow = true; parent.add(head);
  return [tip[0], tip[1] - 0.16, tip[2]];
}
