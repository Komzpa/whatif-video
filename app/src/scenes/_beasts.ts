// Real animals for the chapters (TREATMENT r5 item 9: «a real small animal, modelled with care (proportions, walk
// cycle, tail); no cartoon blob»; r4 p.40: big dogs, «not monsters»). One procedural quadruped rig serves the dogs
// and the cat: a body swept along a spine curve (rump, back, withers, neck) with a cross-section profile, a skull
// and muzzle, ears, a tail, and four legs solved by two-bone IK onto feet that plant on the ground and swing
// between steps (no foot sliding: the gait runs on the distance travelled). Eyes carry tapetum shine: they glow when
// a light looks into them. Every pose is a pure function of its inputs (seek-safe).
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../engine/util';
import { lit } from './_kit';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

type V2 = [number, number];
export type RGB3 = [number, number, number];

// ---------------------------------------------------------------- a swept tube with elliptical sections
/** A tube along `pts` (world/local 3D points) with half-width `rz(s)` and half-height `ry(s)` at s ∈ [0,1]. */
export class SweptTube {
  geo: THREE.BufferGeometry; mesh: THREE.Mesh;
  constructor(public rings: number, public seg: number, mat: THREE.Material, public colorAt?: (s: number, a: number) => RGB3) {
    this.geo = new THREE.BufferGeometry();
    const n = rings * seg;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    if (colorAt) this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    if (colorAt) (mat as THREE.MeshStandardMaterial).vertexColors = true;
  }
  /** Rebuild along a curve given by control points (Catmull-Rom), radii as functions of s. */
  update(ctrl: THREE.Vector3[], ry: (s: number) => number, rz: (s: number) => number, o: { twistUp?: THREE.Vector3; ends?: boolean } = {}) {
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const pos = this.geo.attributes.position as THREE.BufferAttribute, col = this.geo.attributes.color as THREE.BufferAttribute | undefined;
    const up = o.twistUp ?? new THREE.Vector3(0, 1, 0);
    const P = new THREE.Vector3(), Tg = new THREE.Vector3(), Z = new THREE.Vector3(), N = new THREE.Vector3();
    for (let i = 0; i < this.rings; i++) {
      const s = i / (this.rings - 1);
      curve.getPointAt(s, P); curve.getTangentAt(s, Tg);
      Z.crossVectors(Tg, up); if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1); Z.normalize();
      N.crossVectors(Z, Tg).normalize();
      const a = ry(s), b = rz(s);
      for (let j = 0; j < this.seg; j++) {
        const th = (j / this.seg) * Math.PI * 2, cy = Math.cos(th), sz = Math.sin(th);
        const k = i * this.seg + j;
        pos.setXYZ(k, P.x + N.x * a * cy + Z.x * b * sz, P.y + N.y * a * cy + Z.y * b * sz, P.z + N.z * a * cy + Z.z * b * sz);
        if (col && this.colorAt) { const c = this.colorAt(s, th); col.setXYZ(k, c[0], c[1], c[2]); }
      }
    }
    pos.needsUpdate = true; if (col) col.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}

// ---------------------------------------------------------------- two-bone IK in a plane
/** Joint position for a two-bone chain root→end with lengths a, b; `bend` +1 / -1 picks the side (in x-y). */
export function ik2(root: V2, end: V2, a: number, b: number, bend: 1 | -1): V2 {
  const dx = end[0] - root[0], dy = end[1] - root[1];
  let d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const base = Math.atan2(dy, dx), ang = base + bend * Math.acos(ca);
  return [root[0] + Math.cos(ang) * a, root[1] + Math.sin(ang) * a];
}

// ---------------------------------------------------------------- the quadruped
export interface QuadSpec {
  withers: number; hip: number; len: number; // heights at the shoulder and hip joints' top line, shoulder-hip distance
  chest: number; chestW: number; waist: number; waistW: number; rump: number; rumpW: number; // half-depths / half-widths
  neckLen: number; neckR: number; neckRise: number; // neck length, radius, angle up (rad)
  skull: [number, number, number]; muzzle: [number, number]; // skull half-extents (len, h, w), muzzle length & radius
  ear: [number, number]; // ear height, base radius
  fore: [number, number, number]; hind: [number, number, number]; // leg segment lengths (upper, lower, foot)
  legR: [number, number]; // thigh radius, pastern radius
  tail: number; tailR: number; tailCurl: number; // tail length, base radius, curl (rad)
  back: RGB3; belly: RGB3; legs: RGB3; muzzleC: RGB3; eye: RGB3;
  gait: 'walk' | 'trot'; cycle: number; // metres of travel per gait cycle
  stripes?: number; // tabby stripe frequency (per metre), 0 = none
}

export const DOG: QuadSpec = {
  withers: 0.66, hip: 0.62, len: 0.62,
  chest: 0.165, chestW: 0.135, waist: 0.105, waistW: 0.1, rump: 0.125, rumpW: 0.12,
  neckLen: 0.21, neckR: 0.08, neckRise: 0.72,
  skull: [0.105, 0.085, 0.08], muzzle: [0.1, 0.05],
  ear: [0.115, 0.05],
  fore: [0.22, 0.21, 0.07], hind: [0.26, 0.25, 0.15],
  legR: [0.06, 0.022],
  tail: 0.42, tailR: 0.035, tailCurl: 0.6,
  back: [0.022, 0.019, 0.017], belly: [0.2, 0.095, 0.035], legs: [0.19, 0.09, 0.033], muzzleC: [0.03, 0.025, 0.02], eye: [0.9, 0.75, 0.35],
  gait: 'trot', cycle: 1.35,
};
export const CAT: QuadSpec = {
  withers: 0.25, hip: 0.25, len: 0.25,
  chest: 0.078, chestW: 0.058, waist: 0.066, waistW: 0.056, rump: 0.07, rumpW: 0.06,
  neckLen: 0.06, neckR: 0.04, neckRise: 0.75,
  skull: [0.055, 0.05, 0.053], muzzle: [0.022, 0.022],
  ear: [0.04, 0.022],
  fore: [0.08, 0.075, 0.028], hind: [0.095, 0.09, 0.06],
  legR: [0.028, 0.011],
  tail: 0.28, tailR: 0.015, tailCurl: 0.9,
  back: [0.2, 0.12, 0.06], belly: [0.55, 0.42, 0.28], legs: [0.45, 0.3, 0.15], muzzleC: [0.6, 0.5, 0.4], eye: [0.55, 0.9, 0.35],
  gait: 'walk', cycle: 0.55,
};

export interface QuadPose {
  pos: THREE.Vector3; heading: number; // root on the ground (between the feet), facing +x rotated by heading about y
  dist: number; speed: number; // distance travelled (drives the gait), speed m/s (0 = standing)
  look?: THREE.Vector3 | null; // a world point the head turns to
  lookK?: number;
  sit?: number; // 0 stand .. 1 sit (hind down)
  crouch?: number; // 0 .. 1 (lowers the body, the cat before a jump / the dog stalking)
  tailWag?: number; tailUp?: number; // wag amplitude, tail raised 0..1
  earBack?: number;
  pitch?: number; // whole-body pitch (rad), e.g. climbing down
  t: number;
  jump?: number; // 0..1 phase of a leap: legs stretched
  lying?: number;
}

// ---------------------------------------------------------------- an implicit (SDF) body, polygonised per frame
/** One smooth closed skin: tapered capsules and ellipsoids joined with a smooth minimum (flesh blending into flesh:
 *  the thigh into the flank, the neck into the chest), polygonised with marching cubes inside a local box. */
export class SdfBody {
  mc: MarchingCubes; d: Float32Array; col: Float32Array; n: number;
  lo: THREE.Vector3; step: THREE.Vector3;
  private tA = new THREE.Vector3(); private tB = new THREE.Vector3();
  constructor(parent: THREE.Object3D, public lo0: THREE.Vector3, public hi0: THREE.Vector3, res: number, mat: THREE.MeshStandardMaterial) {
    mat.vertexColors = true;
    this.mc = new MarchingCubes(res, mat, false, true, 90000);
    this.mc.isolation = 0; this.mc.castShadow = true; this.mc.receiveShadow = true; this.mc.frustumCulled = false;
    this.n = res; this.d = new Float32Array(res * res * res); this.col = this.mc.palette;
    this.lo = lo0.clone(); this.step = hi0.clone().sub(lo0).divideScalar(res - 1);
    // the MC grid spans [-1,1] over cells 0..res; map it onto the box
    const c = lo0.clone().add(hi0).multiplyScalar(0.5), ext = hi0.clone().sub(lo0).multiplyScalar(0.5 * res / (res - 1));
    this.mc.position.copy(c).sub(this.step.clone().multiplyScalar(0));
    this.mc.scale.copy(ext);
    // cell i sits at (i - res/2)/(res/2) in MC space -> local c + that * ext
    this.lo = c.clone().sub(ext);
    this.step = ext.clone().multiplyScalar(2 / res);
    parent.add(this.mc);
  }
  begin() { this.d.fill(0.25); this.col.fill(0); }
  private range(minv: number, maxv: number, axis: 'x' | 'y' | 'z'): [number, number] {
    const o = this.lo[axis], st = this.step[axis];
    return [Math.max(0, Math.floor((minv - o) / st)), Math.min(this.n - 1, Math.ceil((maxv - o) / st))];
  }
  private blendIn(i: number, dn: number, k: number, r: number, g: number, b: number) {
    const a = this.d[i]!;
    if (dn - k > a) return;
    const h = clamp(0.5 + 0.5 * (dn - a) / k, 0, 1); // h = 1 keeps the old
    this.d[i] = lerp(dn, a, h) - k * h * (1 - h);
    const c3 = i * 3, cw = this.col;
    if (a >= 0.25) { cw[c3] = r; cw[c3 + 1] = g; cw[c3 + 2] = b; return; }
    cw[c3] = lerp(r, cw[c3]!, h); cw[c3 + 1] = lerp(g, cw[c3 + 1]!, h); cw[c3 + 2] = lerp(b, cw[c3 + 2]!, h);
  }
  /** A tapered capsule a->b with radii ra/rb (y-ish) and za/zb across local z; colours cA->cB along, cU underneath. */
  cap(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, k: number, cA: RGB3, cB: RGB3 = cA, o: { za?: number; zb?: number; under?: RGB3; underK?: number } = {}) {
    const za = o.za ?? ra, zb = o.zb ?? rb;
    const R = Math.max(ra, rb, za, zb) + k + 0.02;
    const [x0, x1] = this.range(Math.min(a.x, b.x) - R, Math.max(a.x, b.x) + R, 'x');
    const [y0, y1] = this.range(Math.min(a.y, b.y) - R, Math.max(a.y, b.y) + R, 'y');
    const [z0, z1] = this.range(Math.min(a.z, b.z) - R, Math.max(a.z, b.z) + R, 'z');
    const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z, L2 = bax * bax + bay * bay + baz * baz + 1e-9;
    const n = this.n, lo = this.lo, st = this.step, U = o.under, uk = o.underK ?? 0.6;
    for (let z = z0; z <= z1; z++) { const pz = lo.z + z * st.z;
      for (let y = y0; y <= y1; y++) { const py = lo.y + y * st.y;
        for (let x = x0; x <= x1; x++) { const px = lo.x + x * st.x;
          const apx = px - a.x, apy = py - a.y, apz = pz - a.z;
          const t = clamp((apx * bax + apy * bay + apz * baz) / L2, 0, 1);
          const qx = apx - bax * t, qy = apy - bay * t, qz = apz - baz * t;
          const ry = ra + (rb - ra) * t, rz = za + (zb - za) * t;
          const e = Math.sqrt((qx * qx + qy * qy) / (ry * ry) + (qz * qz) / (rz * rz));
          const dn = (e - 1) * Math.min(ry, rz);
          let r = cA[0] + (cB[0] - cA[0]) * t, g = cA[1] + (cB[1] - cA[1]) * t, bb = cA[2] + (cB[2] - cA[2]) * t;
          if (U) { const w = (1 - smoothstep(-0.75, 0.1, qy / ry)) * uk; r += (U[0] - r) * w; g += (U[1] - g) * w; bb += (U[2] - bb) * w; }
          this.blendIn(x + y * n + z * n * n, dn, k, r, g, bb);
        } } }
  }
  /** An ellipsoid given by a matrix (local -> ellipsoid frame, unit sphere = the surface scaled by radii). */
  ell(m: THREE.Matrix4, radii: THREE.Vector3, k: number, c: RGB3, under?: RGB3) {
    const inv = m.clone().invert(), e = inv.elements;
    const ctr = new THREE.Vector3().setFromMatrixPosition(m);
    const R = Math.max(radii.x, radii.y, radii.z) + k + 0.02;
    const [x0, x1] = this.range(ctr.x - R, ctr.x + R, 'x'), [y0, y1] = this.range(ctr.y - R, ctr.y + R, 'y'), [z0, z1] = this.range(ctr.z - R, ctr.z + R, 'z');
    const n = this.n, lo = this.lo, st = this.step, rx = radii.x, ryy = radii.y, rz = radii.z;
    for (let z = z0; z <= z1; z++) { const pz = lo.z + z * st.z;
      for (let y = y0; y <= y1; y++) { const py = lo.y + y * st.y;
        for (let x = x0; x <= x1; x++) { const px = lo.x + x * st.x;
          const qx = e[0]! * px + e[4]! * py + e[8]! * pz + e[12]!, qy = e[1]! * px + e[5]! * py + e[9]! * pz + e[13]!, qz = e[2]! * px + e[6]! * py + e[10]! * pz + e[14]!;
          const k0 = Math.sqrt((qx * qx) / (rx * rx) + (qy * qy) / (ryy * ryy) + (qz * qz) / (rz * rz));
          const k1 = Math.sqrt((qx * qx) / (rx ** 4) + (qy * qy) / (ryy ** 4) + (qz * qz) / (rz ** 4)) + 1e-9;
          const dn = (k0 * (k0 - 1)) / k1;
          let r = c[0], g = c[1], b = c[2];
          if (under) { const w = (1 - smoothstep(-0.8, 0.1, qy / ryy)) * 0.8; r += (under[0] - r) * w; g += (under[1] - g) * w; b += (under[2] - b) * w; }
          this.blendIn(x + y * n + z * n * n, dn, k, r, g, b);
        } } }
  }
  /** Recolour the cells near the surface: fn(x, y, z, rgb) scales the colour in place (fur markings). */
  modulate(fn: (x: number, y: number, z: number) => number, band = 0.03) {
    const n = this.n, lo = this.lo, st = this.step, d = this.d, c = this.col;
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = x + y * n + z * n * n;
      if (Math.abs(d[i]!) > band) continue;
      const k = fn(lo.x + x * st.x, lo.y + y * st.y, lo.z + z * st.z);
      c[i * 3] *= k; c[i * 3 + 1] *= k; c[i * 3 + 2] *= k;
    }
  }
  end() {
    const f = this.mc.field, d = this.d;
    for (let i = 0; i < d.length; i++) f[i] = -d[i]!;
    this.mc.normal_cache.fill(0);
    this.mc.update();
  }
}

export class Quadruped {
  g = new THREE.Group();
  sdf: SdfBody;
  head = new THREE.Group();
  eyes: THREE.Mesh[] = []; eyeMat: THREE.MeshBasicMaterial;
  ears: THREE.Mesh[] = [];
  constructor(public S: QuadSpec, parent: THREE.Object3D, res = 88) {
    parent.add(this.g);
    const w = S.withers;
    // the box: long enough for the head stretched forward and the tail, tall enough for a raised head
    this.sdf = new SdfBody(this.g, new THREE.Vector3(-w * 1.85, -0.01, -w * 0.6), new THREE.Vector3(w * 1.45, w * 1.6, w * 0.6), res, furMat());
    const nose = new THREE.Mesh(new THREE.SphereGeometry(S.muzzle[1] * 0.5, 10, 8), lit([0.015, 0.015, 0.015], { rough: 0.2 }));
    nose.position.set(S.skull[0] * 0.7 + S.muzzle[0] + S.muzzle[1] * 0.1, -S.skull[1] * 0.28, 0); this.head.add(nose);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(S.ear[1], S.ear[0], 5, 1), lit(S.back, { rough: 0.9, side: THREE.DoubleSide }));
      ear.scale.set(0.45, 1, 1);
      ear.position.set(-S.skull[0] * 0.2, S.skull[1] * 0.72 + S.ear[0] * 0.38, side * S.skull[2] * 0.6);
      ear.castShadow = true; this.head.add(ear); this.ears.push(ear);
    }
    this.eyeMat = new THREE.MeshBasicMaterial({ fog: true, toneMapped: false });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(S.skull[1] * 0.19, 10, 8), this.eyeMat);
      eye.position.set(S.skull[0] * 0.66, S.skull[1] * 0.22, side * S.skull[2] * 0.56);
      this.head.add(eye); this.eyes.push(eye);
    }
    this.g.add(this.head);
  }

  /** Eye shine: how much a light at `from` (looking along dir) reflects back from the eyes (0..1). */
  shine(from: THREE.Vector3, dir: THREE.Vector3 | null, cone = 0.93) {
    const e = new THREE.Vector3(); this.eyes[0]!.getWorldPosition(e);
    const toEye = e.clone().sub(from).normalize();
    const lightOn = dir ? smoothstep(cone - 0.08, cone + 0.03, toEye.dot(dir)) : 1;
    // the eyes must face the light
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(this.head.getWorldQuaternion(new THREE.Quaternion()));
    const facing = smoothstep(0.2, 0.8, -fwd.dot(toEye));
    return lightOn * facing;
  }
  setShine(k: number, gain = 3) {
    const c = this.S.eye;
    this.eyeMat.color.setRGB(0.02 + c[0] * k * gain, 0.02 + c[1] * k * gain, 0.02 + c[2] * k * gain, THREE.LinearSRGBColorSpace);
  }

  /** Pose the animal (all in the group's local frame: +x forward, +y up, +z left). */
  pose(p: QuadPose) {
    const S = this.S, t = p.t;
    this.g.position.copy(p.pos);
    this.g.rotation.set(0, p.heading, p.pitch ?? 0, 'YXZ');
    this.g.updateMatrixWorld(true);
    const sit = clamp(p.sit ?? 0), crouch = clamp(p.crouch ?? 0), jump = clamp(p.jump ?? 0), lying = clamp(p.lying ?? 0);
    const moving = clamp(p.speed / 0.3);
    const cyc = p.dist / S.cycle;
    const trot = S.gait === 'trot';
    // the body: bob (twice per cycle in a trot), the sit drops and tips the hind end
    const bob = moving * (trot ? 0.018 : 0.008) * (S.withers / 0.66) * Math.cos(cyc * Math.PI * 4);
    const breathe = 0.004 * (S.withers / 0.66) * Math.sin(t * (trot ? 5 : 2.2));
    const lower = crouch * 0.18 * S.withers + lying * 0.62 * S.withers;
    const shY = S.withers - 0.2 * S.withers + bob - lower * 0.9 + breathe - sit * 0.05 * S.withers;
    const hipY = S.hip - 0.18 * S.hip + bob * 0.8 - lower - sit * 0.62 * S.hip;
    const L = S.len;
    const hipX = -L / 2 + sit * 0.12 * L, shX = L / 2 + sit * 0.05 * L;
    const stretch = 1 + jump * 0.12;
    const sh = new THREE.Vector3(shX * stretch, shY, 0), hp = new THREE.Vector3(hipX * stretch, hipY, 0);
    const bodyAng = Math.atan2(sh.y - hp.y, sh.x - hp.x);
    // the spine: rump end, hip, mid-back (a slight dip), withers, neck, head base
    const dirB = new THREE.Vector3(Math.cos(bodyAng), Math.sin(bodyAng), 0);
    const nrm = new THREE.Vector3(-Math.sin(bodyAng), Math.cos(bodyAng), 0);
    const rumpEnd = hp.clone().addScaledVector(dirB, -S.rump * 0.9).addScaledVector(nrm, S.rump * 0.15);
    const mid = hp.clone().lerp(sh, 0.5).addScaledVector(nrm, S.waist * 0.2 - 0.008);
    const withers = sh.clone().addScaledVector(dirB, S.chest * 0.25).addScaledVector(nrm, S.chest * 0.12);
    // the neck rises from the withers; the head turns towards `look`
    let lookYaw = 0, lookPitch = 0;
    if (p.look && (p.lookK ?? 1) > 0) {
      const lp = this.g.worldToLocal(p.look.clone());
      const neckBase = withers.clone();
      const d = lp.clone().sub(neckBase);
      lookYaw = clamp(Math.atan2(-d.z, d.x), -1.4, 1.4) * (p.lookK ?? 1);
      lookPitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.7, 0.6) * (p.lookK ?? 1);
      // looking back over the shoulder turns the neck, not only the head
    }
    const rise = S.neckRise + lookPitch * 0.5 - crouch * 0.5 - jump * 0.4 + lying * -0.4;
    const nk1 = withers.clone().add(new THREE.Vector3(Math.cos(rise) * Math.cos(lookYaw * 0.6), Math.sin(rise), -Math.sin(lookYaw * 0.6) * Math.cos(rise)).multiplyScalar(S.neckLen * 0.55));
    const nk2 = withers.clone().add(new THREE.Vector3(Math.cos(rise) * Math.cos(lookYaw * 0.8), Math.sin(rise) * 0.95, -Math.sin(lookYaw * 0.8) * Math.cos(rise)).multiplyScalar(S.neckLen));
    const ctrl = [rumpEnd, hp.clone().addScaledVector(nrm, S.rump * 0.05), mid, sh.clone(), withers, nk1, nk2];
    // section profile along the spine (0 rump .. ~0.62 withers .. 1 head end)
    const sW = 0.6;
    const ry = (s: number) => {
      if (s < 0.06) return lerp(0.35, 1, s / 0.06) * S.rump;
      if (s < 0.2) return lerp(S.rump, S.rump * 0.95, (s - 0.06) / 0.14);
      if (s < 0.38) return lerp(S.rump * 0.95, S.waist, smoothstep(0.2, 0.38, s));
      if (s < sW) return lerp(S.waist, S.chest, smoothstep(0.38, sW, s));
      if (s < 0.72) return lerp(S.chest, S.neckR * 1.25, smoothstep(sW, 0.72, s));
      return lerp(S.neckR * 1.25, S.neckR * 0.9, (s - 0.72) / 0.28);
    };
    const rz = (s: number) => {
      if (s < 0.06) return lerp(0.35, 1, s / 0.06) * S.rumpW;
      if (s < 0.2) return S.rumpW;
      if (s < 0.38) return lerp(S.rumpW, S.waistW, smoothstep(0.2, 0.38, s));
      if (s < sW) return lerp(S.waistW, S.chestW, smoothstep(0.38, sW, s));
      if (s < 0.72) return lerp(S.chestW, S.neckR, smoothstep(sW, 0.72, s));
      return S.neckR * 0.95;
    };
    // the chest hangs deeper than the back is high: shift the sections down where the chest is deep
    const drop = (s: number) => (s > 0.35 && s < 0.75 ? smoothstep(0.35, 0.58, s) * (1 - smoothstep(0.62, 0.75, s)) * S.chest * 0.45 : 0);
    const ctrl2 = ctrl.map((q, i) => { const s = i / (ctrl.length - 1); return q.clone().addScaledVector(nrm, -drop(s * 0.9 + 0.05)); });
    const B = this.sdf; B.begin();
    const kb = S.withers * 0.05;
    {
      const curve = new THREE.CatmullRomCurve3(ctrl2, false, 'centripetal');
      const N = 12; let prev: THREE.Vector3 | null = null, pr = 0, pz = 0;
      for (let i = 0; i <= N; i++) {
        const s = i / N, q = curve.getPointAt(s), r = ry(s), z = rz(s);
        if (prev) B.cap(prev, q, pr, r, kb, mixc(S.back, S.back, 0), S.back, { za: pz, zb: z, under: S.belly, underK: s > 0.72 ? 0.3 : 0.75 });
        prev = q; pr = r; pz = z;
      }
    }
    // the head at the end of the neck
    this.head.position.copy(nk2).add(new THREE.Vector3(Math.cos(lookYaw) * S.skull[0] * 0.5, S.skull[1] * 0.2, -Math.sin(lookYaw) * S.skull[0] * 0.5));
    const headPitch = -0.35 + lookPitch * 0.7 + crouch * 0.1 - lying * 0.1;
    this.head.rotation.set(0, lookYaw, headPitch, 'YXZ');
    this.head.updateMatrix();
    {
      const hm = this.head.matrix;
      const sk = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)).premultiply(hm);
      B.ell(sk, new THREE.Vector3(S.skull[0], S.skull[1], S.skull[2]), kb * 0.6, S.back);
      const ch = new THREE.Matrix4().makeTranslation(S.skull[0] * 0.3, -S.skull[1] * 0.32, 0).premultiply(hm);
      B.ell(ch, new THREE.Vector3(S.skull[0] * 0.8, S.skull[1] * 0.62, S.skull[2] * 0.95), kb * 0.6, mixc(S.back, S.belly, 0.5), S.belly);
      const m0 = new THREE.Vector3(S.skull[0] * 0.55, -S.skull[1] * 0.3, 0).applyMatrix4(hm), m1 = new THREE.Vector3(S.skull[0] * 0.7 + S.muzzle[0], -S.skull[1] * 0.32, 0).applyMatrix4(hm);
      B.cap(m0, m1, S.muzzle[1] * 1.2, S.muzzle[1] * 0.92, kb * 0.5, S.muzzleC, S.muzzleC, { za: S.muzzle[1] * 1.1, zb: S.muzzle[1] * 0.85 });
      const jw = new THREE.Matrix4().makeTranslation(S.skull[0] * 0.75 + S.muzzle[0] * 0.35, -S.skull[1] * 0.62, 0).premultiply(hm);
      B.ell(jw, new THREE.Vector3(S.muzzle[0] * 0.6, S.muzzle[1] * 0.55, S.muzzle[1] * 0.85), kb * 0.4, mixc(S.muzzleC, S.belly, 0.5));
    }
    const eb = clamp(p.earBack ?? 0);
    this.ears.forEach((e, i) => { const side = i ? 1 : -1; e.rotation.set(side * (0.25 + eb * 0.5), 0, 0.12 - eb * 0.9 + 0.05 * Math.sin(t * 3 + i)); });
    // legs: feet from the gait; front joints bend back at the elbow, hind stifles forward
    const duty = trot ? 0.5 : 0.62;
    const offs = trot ? [0, 0.5, 0.5, 0] : [0.25, 0.75, 0, 0.5]; // LF, RF, LH, RH
    const strideAmp = moving * (1 - sit) * (1 - lying);
    const legs = [
      { root: new THREE.Vector3(sh.x + S.chest * 0.1, sh.y - S.chest * 0.2, S.chestW * 0.62), front: true },
      { root: new THREE.Vector3(sh.x + S.chest * 0.1, sh.y - S.chest * 0.2, -S.chestW * 0.62), front: true },
      { root: new THREE.Vector3(hp.x, hp.y - S.rump * 0.25, S.rumpW * 0.7), front: false },
      { root: new THREE.Vector3(hp.x, hp.y - S.rump * 0.25, -S.rumpW * 0.7), front: false },
    ];
    legs.forEach((lg, i) => {
      const seg = lg.front ? S.fore : S.hind;
      const ph = (((cyc + offs[i]!) % 1) + 1) % 1;
      const C = S.cycle;
      let fx: number, fy = 0;
      if (ph < duty) fx = C * duty * (0.5 - ph / duty);
      else { const q = (ph - duty) / (1 - duty); fx = C * duty * (-0.5 + q); fy = Math.sin(q * Math.PI) * (lg.front ? 0.09 : 0.07) * (S.withers / 0.66); }
      fx *= strideAmp; fy *= strideAmp;
      // rest positions under the joints; sitting brings the hind feet forward under the hips; a leap stretches the legs
      let restX = lg.front ? lg.root.x + 0.01 : lg.root.x + 0.02 * S.withers;
      if (!lg.front) restX += sit * 0.3 * L;
      if (lg.front) restX += sit * 0.02 * L;
      const jx = jump * (lg.front ? 0.35 : -0.35) * S.withers;
      const jy = jump * 0.25 * S.withers;
      const lieX = lying * (lg.front ? 0.35 : 0.1) * S.withers;
      const foot = new THREE.Vector3(restX + fx + jx + lieX, fy + jy + 0.012 * (S.withers / 0.66), lg.root.z * 0.92);
      if (lying > 0) foot.y = Math.max(foot.y, lying * 0.02);
      const [a, b, c] = seg;
      // the foot segment (pastern / metatarsus): nearly vertical, tipped back; tucked up in the swing
      const swingK = fy > 0 ? fy / 0.09 : 0;
      const ang = lg.front ? 0.32 - swingK * 1.7 - jump * 0.7 + sit * 0.1 : 0.18 + sit * 1.25 + swingK * 0.35 - jump * 0.4;
      const ankle = new THREE.Vector3(foot.x - Math.sin(ang) * c, foot.y + Math.cos(ang) * c, foot.z);
      const knee2 = ik2([lg.root.x, lg.root.y], [ankle.x, ankle.y], a, b, lg.front ? -1 : 1);
      // front: the elbow points back (bend +1 puts the joint behind for a leg hanging down: check sign by geometry)
      const knee = new THREE.Vector3(knee2[0], knee2[1], lg.root.z * 0.96);
      const top = lg.root.clone().add(new THREE.Vector3(0, lg.front ? S.chest * 0.35 : S.rump * 0.35, -lg.root.z * 0.25));
      const pts = [top, lg.root.clone(), knee, ankle, foot.clone().add(new THREE.Vector3(0.005, 0.006, 0))];
      const r0 = S.legR[0], r1 = S.legR[1];
      const rad = (s: number) => (s < 0.25 ? lerp(r0 * (lg.front ? 1.1 : 1.35), r0 * (lg.front ? 0.9 : 1.1), s / 0.25) : s < 0.55 ? lerp(r0 * (lg.front ? 0.9 : 1.1), r0 * 0.55, (s - 0.25) / 0.3) : lerp(r0 * 0.5, r1, (s - 0.55) / 0.45));
      void rad;
      const kl = kb * 0.7, up = S.back, low = S.legs;
      if (lg.front) {
        B.cap(top, lg.root, r0 * 1.5, r0 * 1.2, kb, up, up);
        B.cap(lg.root, knee, r0 * 1.15, r0 * 0.75, kl, up, mixc(up, low, 0.5));
        B.cap(knee, ankle, r0 * 0.62, r1 * 1.05, kl * 0.6, mixc(up, low, 0.5), low);
      } else {
        // the ham: a broad thigh that merges into the flank
        const mid = lg.root.clone().lerp(knee, 0.4);
        B.cap(top, mid, r0 * 1.9, r0 * 1.6, kb * 1.2, up, up, { za: r0 * 1.3, zb: r0 * 1.1 });
        B.cap(mid, knee, r0 * 1.4, r0 * 0.7, kl, up, up, { za: r0 * 0.95, zb: r0 * 0.6 });
        B.cap(knee, ankle, r0 * 0.62, r1 * 1.0, kl * 0.6, up, low, { za: r0 * 0.42, zb: r1 * 0.95 });
      }
      B.cap(ankle, foot.clone().add(new THREE.Vector3(0, r1 * 0.4, 0)), r1 * 1.05, r1 * 1.0, kl * 0.4, low, low);
      const pm = new THREE.Matrix4().makeTranslation(foot.x + r1 * 0.8, foot.y + r1 * 0.75, foot.z);
      B.ell(pm, new THREE.Vector3(r1 * 1.9, r1 * 0.95, r1 * 1.35), kl * 0.35, low);
    });
    // the tail: from the rump, hanging then curving up; wagging side to side
    const wag = (p.tailWag ?? 0.15) * Math.sin(t * (p.tailWag ? 9 : 2));
    const tup = clamp(p.tailUp ?? 0.2);
    const tb = rumpEnd.clone().addScaledVector(nrm, S.rump * 0.35);
    const tp: THREE.Vector3[] = [tb];
    let ang = Math.PI + 0.9 - tup * 1.6 + jump * 0.6 - sit * 0.3, x = tb.x, y = tb.y, z = 0;
    const n = 6, segL = S.tail / n;
    for (let k = 1; k <= n; k++) {
      ang += (-S.tailCurl * (tup - 0.3) * 0.45 + (sit ? -0.05 : 0.08) * (1 - tup)) * (k / n) + (sit > 0.5 ? 0.22 * sit : 0);
      x += Math.cos(ang) * segL; y += Math.sin(ang) * segL; z += wag * segL * 0.9 * (k / n);
      if (sit > 0.2 && y < 0.02) y = 0.02;
      tp.push(new THREE.Vector3(x, y, z));
    }
    const minR = Math.max(this.sdf.step.x, this.sdf.step.z) * 0.9;
    for (let k = 1; k < tp.length; k++) {
      const s0 = (k - 1) / (tp.length - 1), s1 = k / (tp.length - 1);
      B.cap(tp[k - 1]!, tp[k]!, Math.max(minR, lerp(S.tailR * 1.2, S.tailR * 0.45, s0)), Math.max(minR, lerp(S.tailR * 1.2, S.tailR * 0.45, s1)), k === 1 ? kb : kb * 0.3, S.back, mixc(S.back, S.belly, 0.3 * s1));
    }
    if (S.stripes) {
      // tabby: dark bands across the back and flanks, fading on the belly; rings on the tail
      const f = S.stripes, top = shY;
      B.modulate((x, y, z) => {
        const band = Math.sin(x * f + Math.sin(z * 31 + x * 7) * 0.9 + y * 11);
        const onTop = smoothstep(top * 0.55, top * 1.05, y);
        return 1 - 0.55 * smoothstep(0.35, 0.8, band) * onTop;
      }, this.sdf.step.y * 2.5);
    }
    B.end();
  }
}

/** Fur: diffuse with a weak specular and a soft sheen (the rim light on a coat), so a black dog stays black in a torch. */
export function furMat() {
  return new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, specularIntensity: 0.15, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.18, 0.15, 0.12) });
}
function mixc(a: RGB3, b: RGB3, k: number): RGB3 { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
export { mixc };
