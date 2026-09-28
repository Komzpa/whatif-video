// People in the chapters: the dog owner, the kids on the roofs, the stranger, the child seen from behind at the end.
// One procedural figure rig (TESTPLAN B2: the child 4.5 heads tall, an adult ~7.5; seen from behind or in
// silhouette, no drawn face). Coat / jacket swept along the torso, limbs as swept tubes bent at knee and elbow,
// a gait driven by the distance walked (feet do not slide), optional hat or hood, a phone held low or raised to
// film. Forward is +x in the figure's local frame (like the quadruped); `heading` is the rotation about y.
import * as THREE from 'three';
import { clamp, lerp, hash } from '../engine/util';
import { lit } from './_kit';
import { SdfBody, type RGB3 } from './_beasts';

export interface FigureSpec {
  height: number; coat: RGB3; trousers?: RGB3; skin?: RGB3; hair?: RGB3; shoes?: RGB3;
  hat?: boolean; hood?: boolean; pack?: RGB3; beanie?: RGB3; kid?: boolean; longCoat?: boolean; bulk?: number; seed?: number;
}
/** The man who follows the child (TREATMENT r8 note 8): ONE figure from the teasing yard to the `stranger` chapter —
 *  a long black coat and a hat, 1.86 m, always black against a light, closer in each chapter (tease ~23 m, alone ~15 m, words ~12 m,
 *  then the chase). The intercom picture in `door` shows the same hat. */
export const STRANGER: FigureSpec = { height: 1.86, coat: [0.035, 0.035, 0.04], trousers: [0.02, 0.02, 0.025], shoes: [0.01, 0.01, 0.01], hat: true, longCoat: true, bulk: 1.1, seed: 11 };
/** The heading that makes a figure (or a quadruped) face from `a` towards `b` on the ground. */
export const faceTo = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(-(b.z - a.z), b.x - a.x);

export interface FigurePose {
  pos: THREE.Vector3; heading: number; t: number;
  dist?: number; speed?: number; // distance walked (m) drives the gait; speed 0 = standing
  phone?: number; // 0..1 hand with phone raised in front of the chest, head bowed
  film?: number; // 0..1 arm stretched forward at eye height (filming)
  look?: number; // head yaw (rad) relative to the body
  headDown?: number; // extra head pitch down (rad)
  armL?: number; // 0..1 left arm raised forward (reaching / pointing)
  sit?: number; // 0..1 sitting on an edge, legs hanging
  bob?: number; // laughing shoulders
  lean?: number; // torso pitch forward (rad)
}

type V = THREE.Vector3;
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Figure {
  g = new THREE.Group();
  head = new THREE.Group();
  sdf: SdfBody;
  hR = v(); hL = v(); headW = v();
  u: number; // head unit (m)
  constructor(parent: THREE.Object3D, public S: FigureSpec, res = 72) {
    const H = S.height, kid = !!S.kid;
    this.u = H / (kid ? 4.6 : 7.4);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    this.sdf = new SdfBody(this.g, v(-0.34 * H, -0.01, -0.3 * H), v(0.5 * H, 1.1 * H, 0.3 * H), res, mat);
    this.g.add(this.head);
    parent.add(this.g);
  }

  pose(p: FigurePose) {
    const S = this.S, H = S.height, u = this.u, kid = !!S.kid, bulk = S.bulk ?? 1;
    const coat = S.coat, trousers = S.trousers ?? [0.03, 0.03, 0.035], skin = S.skin ?? [0.4, 0.26, 0.19], hair = S.hair ?? [0.025, 0.018, 0.014], shoe = S.shoes ?? [0.015, 0.015, 0.015];
    this.g.position.copy(p.pos); this.g.rotation.y = p.heading;
    const sit = clamp(p.sit ?? 0), phone = clamp(p.phone ?? 0), film = clamp(p.film ?? 0), armL = clamp(p.armL ?? 0);
    const legL = kid ? H * 0.42 : H * 0.47, hipY0 = legL + H * 0.02;
    const thigh = legL * 0.5, shin = legL * 0.5;
    const shY0 = kid ? H * 0.74 : H * 0.815, hipW = u * (kid ? 0.46 : 0.5) * bulk, shW = u * (kid ? 0.66 : 0.95) * bulk;
    const speed = p.speed ?? 0, stride = legL * 1.3;
    const ph = ((p.dist ?? 0) / stride) * Math.PI * 2 + (S.seed ?? 0);
    const wk = clamp(speed / 1.0) * (1 - sit);
    const bobY = -Math.abs(Math.cos(ph)) * 0.025 * H * wk + 0.012 * H * wk + (p.bob ? Math.abs(Math.sin(p.t * 17)) * 0.012 * H * p.bob : 0);
    const breath = Math.sin(p.t * 1.7 + (S.seed ?? 0)) * 0.003 * H;
    const lean = (p.lean ?? 0) + 0.06 * wk;
    const hipY = lerp(hipY0 + bobY, H * 0.3, sit);
    const shoulder = v(Math.sin(lean) * (shY0 - hipY0) - sit * 0.05 * H, hipY + Math.cos(lean) * (shY0 - hipY0) + breath, 0);
    const B = this.sdf; B.begin();
    const k = u * 0.18;
    // legs
    const tr = u * (kid ? 0.26 : 0.3) * bulk;
    for (let q = 0; q < 2; q++) {
      const side = q === 0 ? 1 : -1, phase = ph + (q === 0 ? 0 : Math.PI);
      const root = v(0, hipY, side * hipW * 0.5);
      let knee: V, ankle: V;
      if (sit > 0.5) {
        knee = v(thigh, hipY, side * hipW * 0.55);
        ankle = v(thigh + 0.05 * Math.sin(p.t * 1.3 + q), hipY - shin, side * hipW * 0.55);
      } else {
        const swing = Math.sin(phase) * 0.42 * wk;
        const kneeBend = (0.08 + Math.max(0, Math.cos(phase)) * 0.9) * wk + 0.04;
        knee = root.clone().add(v(Math.sin(swing) * thigh, -Math.cos(swing) * thigh, 0));
        const sa = swing - kneeBend;
        ankle = knee.clone().add(v(Math.sin(sa) * shin, -Math.cos(sa) * shin, 0));
        // standing: weight on one leg, the other a little forward and out
        const st = 1 - wk; ankle.z += side * hipW * 0.25 * st; if (q === 1) { ankle.x += 0.06 * H * 0.3 * st; knee.x += 0.04 * H * 0.3 * st; }
        const floor = u * 0.12; if (ankle.y < floor) ankle.y = floor;
      }
      B.cap(root, knee, tr, tr * 0.72, k * 0.6, trousers, trousers);
      B.cap(knee, ankle, tr * 0.72, tr * 0.5, k * 0.4, trousers, trousers);
      const sh = new THREE.Matrix4().makeTranslation(ankle.x + u * 0.1, ankle.y - u * 0.06, ankle.z);
      B.ell(sh, v(u * 0.26, u * 0.1, u * 0.12), k * 0.3, shoe);
    }
    // torso (coat): pelvis to chest, broad across (local z), then the shoulders
    const pelvis = v(0, hipY - u * 0.1, 0), chest = shoulder.clone().add(v(0, -u * 0.25, 0));
    const depth = u * (kid ? 0.4 : 0.44) * bulk;
    B.cap(pelvis, chest, depth, depth * 1.08, k, coat, coat, { za: hipW * 1.15, zb: shW * 0.95 });
    B.cap(shoulder.clone().add(v(0, -u * 0.12, shW * 0.8)), shoulder.clone().add(v(0, -u * 0.12, -shW * 0.8)), u * 0.2 * bulk, u * 0.2 * bulk, k, coat, coat);
    if (S.longCoat || kid) {
      const hemY = S.longCoat ? H * 0.3 : hipY - u * 0.45;
      B.cap(pelvis, v(pelvis.x - 0.02, hemY, 0), depth * 1.05, depth * 1.2, k * 0.5, coat, coat, { za: hipW * 1.2, zb: hipW * 1.45 });
    }
    if (S.pack) { // a small backpack on the back (local -x), straps over the shoulders
      B.cap(v(-depth * 1.1, chest.y - u * 0.12, 0), v(-depth * 1.1, chest.y - u * 0.85, 0), u * 0.13, u * 0.15, k * 0.3, S.pack, S.pack, { za: u * 0.3, zb: u * 0.33 });
    }
    // head
    const neck = shoulder.clone().add(v(0, u * 0.12, 0));
    B.cap(neck.clone().add(v(0, -u * 0.1, 0)), neck.clone().add(v(0, u * 0.3, 0)), u * 0.17, u * 0.16, k * 0.5, S.hood ? coat : skin, skin);
    const hc = neck.clone().add(v(0, u * 0.62, 0));
    this.head.position.copy(hc);
    this.head.rotation.set(0, p.look ?? 0, -(phone * 0.5 + (p.headDown ?? 0)) + film * 0.1 - lean * 0.5, 'YXZ');
    this.head.updateMatrix();
    const hm = this.head.matrix;
    B.ell(hm.clone(), v(u * 0.42, u * 0.5, u * 0.38), k * 0.3, skin);
    B.ell(new THREE.Matrix4().makeTranslation(-u * 0.07, u * 0.1, 0).premultiply(hm), v(u * 0.45, u * (kid ? 0.5 : 0.46), u * 0.42), k * 0.2, hair);
    if (kid && !S.hood) { // the hood down: a bunched collar at the back of the neck, the raincoat's colour
      B.ell(new THREE.Matrix4().makeTranslation(neck.x - u * 0.28, neck.y - u * 0.02, 0), v(u * 0.26, u * 0.2, u * 0.42), k * 0.4, coat);
    }
    if (S.hat) {
      B.cap(v(-u * 0.02, u * 0.3, 0).applyMatrix4(hm), v(-u * 0.02, u * 0.62, 0).applyMatrix4(hm), u * 0.44, u * 0.38, k * 0.15, [0.03, 0.03, 0.035], [0.03, 0.03, 0.035]);
      B.ell(new THREE.Matrix4().makeTranslation(0, u * 0.3, 0).premultiply(hm), v(u * 0.8, u * 0.06, u * 0.75), k * 0.1, [0.03, 0.03, 0.035]);
    }
    if (S.beanie) B.ell(new THREE.Matrix4().makeTranslation(-u * 0.05, u * 0.2, 0).premultiply(hm), v(u * 0.46, u * 0.4, u * 0.43), k * 0.15, S.beanie);
    if (S.hood) B.ell(new THREE.Matrix4().makeTranslation(-u * 0.1, u * 0.06, 0).premultiply(hm), v(u * 0.5, u * 0.55, u * 0.46), k * 0.4, coat);
    this.headW.copy(hc).add(v(0, u * 0.1, 0));
    // arms
    const upper = H * (kid ? 0.16 : 0.18), fore = H * (kid ? 0.15 : 0.17), ar = u * (kid ? 0.2 : 0.22) * bulk;
    for (let q = 0; q < 2; q++) {
      const side = q === 0 ? 1 : -1, right = q === 1;
      const phase = ph + (q === 0 ? Math.PI : 0);
      const root = shoulder.clone().add(v(0, -u * 0.18, side * shW));
      let elbow: V, hand: V;
      const raise = right ? Math.max(phone, film) : armL;
      const swing = Math.sin(phase) * 0.35 * wk;
      const hang = root.clone().add(v(Math.sin(swing) * upper, -Math.cos(swing) * upper, side * 0.03));
      const hangHand = hang.clone().add(v(Math.sin(swing + 0.15 + 0.2 * wk) * fore, -Math.cos(swing + 0.15) * fore, side * 0.01));
      if (right && phone >= film && phone > 0) {
        elbow = root.clone().add(v(upper * 0.2, -upper * 0.97, -side * 0.01));
        hand = elbow.clone().add(v(fore * 0.85, fore * 0.4, -side * shW * 0.6));
      } else if (raise > 0) {
        elbow = root.clone().add(v(upper * 0.85, upper * 0.35, -side * 0.05));
        hand = elbow.clone().add(v(fore * 0.96, fore * 0.12, side * 0.06));
      } else { elbow = hang; hand = hangHand; }
      if (raise > 0 && raise < 1) { elbow = hang.clone().lerp(elbow, raise); hand = hangHand.clone().lerp(hand, raise); }
      B.cap(root, elbow, ar, ar * 0.85, k * 0.6, coat, coat);
      B.cap(elbow, hand, ar * 0.85, ar * 0.6, k * 0.4, coat, coat);
      B.ell(new THREE.Matrix4().makeTranslation(hand.x, hand.y - u * 0.04, hand.z), v(u * 0.12, u * 0.14, u * 0.09), k * 0.2, skin);
      (right ? this.hR : this.hL).copy(hand);
    }
    B.end();
    this.g.updateMatrixWorld(true);
    this.g.localToWorld(this.hR); this.g.localToWorld(this.hL); this.g.localToWorld(this.headW);
    void hash;
  }
  handR() { return this.hR.clone(); }
  handL() { return this.hL.clone(); }
  headPos() { return this.headW.clone(); }
  set visible(k: boolean) { this.g.visible = k; }
}
