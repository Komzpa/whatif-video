// A real tree (TREATMENT `cat`: «the last tree»; `dark`: the tree the child takes for a monster). Late autumn:
// bare limbs with a few leaves left, so the branching reads against the sky glow. A trunk and a handful of
// designed main limbs (so a scene can put a cat on a known branch), then seeded recursive branching down to
// twigs. One merged mesh of tapered cylinders with joint spheres; leaves as one instanced mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../engine/util';
import { lit, canvasTex, blotches, speckle, type V3, type RGB } from './_kit';

export interface Limb { a: THREE.Vector3; b: THREE.Vector3; ra: number; rb: number }
export interface TreeSpec {
  seed: number; height: number; trunkR: number; fork: number; // fork height (m)
  limbs: { dir: V3; len: number; r: number; bend?: number }[]; // main limbs from the fork (dir need not be unit)
  depth?: number; leaves?: number; leafColor?: RGB; bark?: string;
}

function barkTex(seed: number, base: string) {
  return canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    for (let i = 0; i < 90; i++) { // vertical fissures
      const x = r() * w, y = r() * h, L = 40 + r() * 160;
      c.strokeStyle = `rgba(0,0,0,${0.25 + r() * 0.35})`; c.lineWidth = 1 + r() * 3;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + (r() - 0.5) * 12, y + L / 3, x + (r() - 0.5) * 12, y + (2 * L) / 3, x + (r() - 0.5) * 8, y + L); c.stroke();
    }
    blotches(c, w, h, 30, () => `rgba(90,100,70,${0.12 + r() * 0.12})`, 10, 40, seed + 1); // lichen
    speckle(c, w, h, 3000, 0.25, seed + 2);
  }, { repeat: [1, 3] });
}

export class Tree {
  g = new THREE.Group();
  limbs: Limb[] = []; // every segment (world = group-local)
  mains: Limb[][] = []; // the designed main limbs as chains of segments
  tips: THREE.Vector3[] = [];
  leaves: THREE.InstancedMesh | null = null;
  constructor(parent: THREE.Object3D, public S: TreeSpec, pos: V3) {
    const r = mulberry32(S.seed);
    const add = (a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number) => { const l = { a: a.clone(), b: b.clone(), ra, rb }; this.limbs.push(l); return l; };
    // trunk: a slight lean and wobble up to the fork
    const base = new THREE.Vector3(0, -0.1, 0);
    let p = base.clone(), rad = S.trunkR * 1.25;
    const nT = 5;
    for (let i = 1; i <= nT; i++) {
      const q = new THREE.Vector3((r() - 0.5) * 0.12 + i * 0.02, (S.fork * i) / nT, (r() - 0.5) * 0.12);
      const r1 = S.trunkR * (1.15 - 0.3 * (i / nT));
      add(p, q, rad, r1); p = q; rad = r1;
    }
    const fork = p.clone();
    // recursive branching
    const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number, chain: Limb[] | null) => {
      const n = depth > 1 ? 3 : 2;
      let q = from.clone(), d = dir.clone().normalize(), rr = r0;
      for (let i = 0; i < n; i++) {
        // curve up (phototropism) and wander
        d.add(new THREE.Vector3((r() - 0.5) * 0.35, 0.12 + (r() - 0.5) * 0.2, (r() - 0.5) * 0.35)).normalize();
        const nq = q.clone().addScaledVector(d, len / n);
        const nr = rr * (depth > 0 ? 0.8 : 0.62);
        const l = add(q, nq, rr, nr);
        if (chain) chain.push(l);
        // side branches off this segment
        if (depth > 0) {
          const kids = depth > 2 ? 2 : r() < 0.8 ? 2 : 1;
          for (let k = 0; k < kids; k++) {
            const side = new THREE.Vector3(r() - 0.5, r() * 0.6, r() - 0.5).normalize();
            const nd = d.clone().multiplyScalar(0.55).add(side).normalize();
            grow(q.clone().lerp(nq, 0.3 + r() * 0.6), nd, len * (0.45 + r() * 0.2), nr * 0.62, depth - 1, null);
          }
        } else this.tips.push(nq.clone());
        q = nq; rr = nr;
      }
      if (depth > 0) grow(q, d, len * 0.55, rr, depth - 1, chain);
    };
    const depth = S.depth ?? 3;
    for (const L of S.limbs) {
      const chain: Limb[] = [];
      grow(fork, new THREE.Vector3(...L.dir), L.len, L.r, depth, chain);
      this.mains.push(chain);
    }
    // geometry: tapered cylinders + joint spheres, merged
    const geos: THREE.BufferGeometry[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const l of this.limbs) {
      const d = l.b.clone().sub(l.a), len = d.length();
      if (len < 1e-4) continue;
      const seg = l.ra > 0.05 ? 12 : l.ra > 0.015 ? 7 : 4;
      const cg = new THREE.CylinderGeometry(l.rb, l.ra, len, seg, 1, true);
      cg.translate(0, len / 2, 0);
      cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
      cg.translate(l.a.x, l.a.y, l.a.z);
      geos.push(cg.toNonIndexed());
      if (l.ra > 0.012) { const sg = new THREE.SphereGeometry(l.rb, seg, Math.max(3, seg >> 1)); sg.translate(l.b.x, l.b.y, l.b.z); geos.push(sg.toNonIndexed()); }
    }
    for (const gg of geos) { gg.deleteAttribute('uv'); }
    const merged = mergeGeometries(geos.map((gg) => { const q = gg.clone(); const n = q.attributes.position!.count; const uv = new Float32Array(n * 2); const P = q.attributes.position!; for (let i = 0; i < n; i++) { uv[i * 2] = (Math.atan2(P.getZ(i), P.getX(i)) / Math.PI) * 0.5 + 0.5; uv[i * 2 + 1] = P.getY(i) * 0.6; } q.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return q; }), false)!;
    merged.computeVertexNormals();
    const tex = barkTex(S.seed, S.bark ?? '#3b322b');
    const mesh = new THREE.Mesh(merged, lit([0.85, 0.85, 0.85], { map: tex, rough: 0.95 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.g.add(mesh);
    // the last leaves
    const nLeaves = S.leaves ?? 160;
    if (nLeaves > 0 && this.tips.length) {
      const lg = new THREE.PlaneGeometry(0.07, 0.09);
      const lc = S.leafColor ?? [0.45, 0.28, 0.05];
      const lm = lit(lc, { rough: 0.8, side: THREE.DoubleSide });
      const im = new THREE.InstancedMesh(lg, lm, nLeaves);
      const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler();
      const col = new THREE.Color();
      for (let i = 0; i < nLeaves; i++) {
        const tip = this.tips[Math.floor(r() * this.tips.length)]!;
        e.set(r() * 6.28, r() * 6.28, r() * 6.28); qq.setFromEuler(e);
        m.compose(tip.clone().add(new THREE.Vector3((r() - 0.5) * 0.25, (r() - 0.5) * 0.2, (r() - 0.5) * 0.25)), qq, new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + r() * 0.6));
        im.setMatrixAt(i, m);
        const k = 0.6 + r() * 0.6; col.setRGB(lc[0] * k, lc[1] * k * (0.7 + r() * 0.5), lc[2] * k, THREE.LinearSRGBColorSpace); im.setColorAt(i, col);
      }
      im.castShadow = true;
      this.leaves = im; this.g.add(im);
    }
    this.g.position.set(...pos);
    parent.add(this.g);
  }
  /** A point along a designed main limb (0 = the fork, 1 = its end of the first chain), group-local. */
  along(main: number, s: number) {
    const ch = this.mains[main]!;
    const L = ch.map((l) => l.a.distanceTo(l.b)), tot = L.reduce((x, y) => x + y, 0);
    let left = Math.max(0, Math.min(1, s)) * tot;
    for (let i = 0; i < ch.length; i++) {
      if (left <= L[i]! || i === ch.length - 1) { const l = ch[i]!; const u = Math.min(1, left / L[i]!); return { p: l.a.clone().lerp(l.b, u), r: l.ra + (l.rb - l.ra) * u, dir: l.b.clone().sub(l.a).normalize() }; }
      left -= L[i]!;
    }
    const l = ch[ch.length - 1]!; return { p: l.b.clone(), r: l.rb, dir: l.b.clone().sub(l.a).normalize() };
  }
  world(p: THREE.Vector3) { return p.clone().add(this.g.position); }
}
