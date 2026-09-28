// The child's own hands in the first-person frame (TESTPLAN B1; author 27.09: «сделай нормальные руки а не
// пушки с кривыми ядрами»). Our own drawing, flat-shaded like the rest of the film:
//   - the sleeve of a child's raincoat that tapers from the bottom edge of the frame to an elasticated cuff,
//     with a few soft folds and a sheen along one edge (no cylinder, no stripe band);
//   - a small hand with a wrist, a palm, four fingers and a thumb. The torch hand is a fist around the torch's
//     body: the back of the hand and the knuckles towards the viewer, the fingers wrapped round under the body,
//     the thumb along the top on the switch. The free hand is open (grabbing an edge, or flat on a surface).
// The torch is placed in camera space (a child holds it about 0.45 m in front of the eye, low and right), so
// its size follows the lens, and the 3D beam leaves the drawn lens along the drawn axis.
import * as THREE from 'three';
import { W, H, PORTRAIT } from '../engine/gl';
import { clamp, lerp } from '../engine/util';
import { mixRgba, rgba } from '../engine/palette';
import { logText } from '../textlog';

type P2 = { x: number; y: number };
const SKIN = '#E2B18F', SKIN_D = '#9A6450', SKIN_H = '#F6D2B4', NAIL = '#F4DCCD';
const COAT = '#C9A441', COAT_D = '#7E6424', COAT_H = '#F0D98A';

export interface Light { amb: number; warm?: number; torch?: number }
const skinC = (l: Light, k = 1) => mixRgba('shadow', SKIN, clamp((0.28 + 0.62 * l.amb + 0.35 * (l.warm ?? 0)) * k));
const skinDC = (l: Light) => mixRgba('shadow', SKIN_D, clamp(0.35 + 0.55 * l.amb + 0.2 * (l.warm ?? 0)));
const skinHC = (l: Light, a = 1) => mixRgba('shadow', SKIN_H, clamp(0.3 + 0.6 * l.amb + 0.4 * (l.warm ?? 0)), a);
const coatC = (l: Light, k = 1) => mixRgba('shadow', COAT, clamp((0.3 + 0.6 * l.amb + 0.25 * (l.warm ?? 0)) * k));
const coatDC = (l: Light) => mixRgba('shadow', COAT_D, clamp(0.3 + 0.6 * l.amb + 0.2 * (l.warm ?? 0)));
const coatHC = (l: Light, a: number) => mixRgba('shadow', COAT_H, clamp(0.3 + 0.6 * l.amb + 0.3 * (l.warm ?? 0)), a);

/** Pixels per metre at a camera-space depth (m), for the current lens. */
export function pxAt(cam: THREE.PerspectiveCamera, depth: number) {
  return (H / 2) / Math.tan((cam.fov * Math.PI) / 360) / Math.max(0.05, depth);
}

// ---------------------------------------------------------------- the torch pose (camera space)
export interface TorchPose {
  head: THREE.Vector3; tail: THREE.Vector3; target: THREE.Vector3; // world
  headC: THREE.Vector3; tailC: THREE.Vector3; // camera space
}
/**
 * Where the torch is this frame. `raise` 0..1 brings it up into the frame; `walk` adds the step bob; the
 * beam sways a little on the beats (`beat` = beat phase 0..1). `aim` nudges the beam (camera-space radians).
 */
export function torchPose(cam: THREE.PerspectiveCamera, t: number, o: { raise?: number; walk?: number; beat?: number; aim?: { x: number; y: number } } = {}): TorchPose {
  const raise = clamp(o.raise ?? 1), walk = o.walk ?? 0, beat = o.beat ?? 0;
  const bob = walk * Math.sin(t * 7.4) * 0.012;
  const sway = Math.sin(beat * Math.PI * 2) * 0.018 + Math.sin(t * 1.1) * 0.006;
  // the arm (B7): the torch lies along the forearm, so on screen the forearm is the torch axis continued back past
  // the fist. For that forearm to come up from below the frame (the child's own arm, not one reaching in from the
  // side), the axis from the fist to where the beam points must climb at least ~20°: when the aim would break that,
  // the whole hand moves (lower, or across towards the aim) instead of the wrist bending.
  const ax = -0.2 + (o.aim?.x ?? 0) + sway, ay = -0.1 + (o.aim?.y ?? 0) + walk * Math.sin(t * 7.4 + 1) * 0.02;
  const dirC = new THREE.Vector3(Math.sin(ax), Math.sin(ay), -Math.cos(ax) * Math.cos(ay)).normalize();
  const home = PORTRAIT ? new THREE.Vector3(0.035, -0.19, -0.5) : new THREE.Vector3(0.05, -0.085, -0.5);
  const D = -home.z, tv = Math.tan((cam.fov * Math.PI) / 360), th = tv * cam.aspect;
  // screen units: u, w in -1..1 (w up); v = where the beam's direction vanishes, p = the fist
  const vz = Math.max(0.15, -dirC.z), v = { u: dirC.x / vz / th, w: dirC.y / vz / tv };
  // a child aims where it looks: the beam's vanishing point stays near the frame (an aim far off to the side or
  // behind would lay the arm flat across the whole frame, B1)
  v.u = clamp(v.u, -1.3, 1.3); v.w = clamp(v.w, -0.9, 1.3);
  dirC.set(v.u * th, v.w * tv, -1).normalize();
  const p = { u: home.x / D / th, w: home.y / D / tv };
  // the forearm is the torch axis continued back past the fist. It is a right arm: it may come in from the lower
  // right at a shallow angle, but never from the left, so an aim to the right of the fist must climb steeply (the
  // arm reaches out from the shoulder, the fist moves under the aim) while an aim to the left may be flatter
  const CL = Math.tan((16 * Math.PI) / 180) * (th / tv), CR = Math.tan((58 * Math.PI) / 180) * (th / tv);
  const W_MIN = PORTRAIT ? -0.78 : -0.62, U_LO = PORTRAIT ? -0.35 : -0.02, U_HI = PORTRAIT ? 0.7 : 0.8;
  const climb = (fu: number) => (v.u > fu ? CR : CL) * Math.abs(v.u - fu);
  if (v.u > p.u) p.u += 0.75 * (Math.min(v.u, U_HI) - p.u); // aimed right: the fist goes out under the aim
  if (p.w > v.w - climb(p.u)) {
    p.w = Math.max(W_MIN, v.w - climb(p.u));
    if (v.w - p.w < climb(p.u) && v.u < p.u) p.u = v.u + (v.w - p.w) / CL; // aimed left and low: the fist moves right
  }
  // never under the chapter line (bottom left), and the fist never leaves the frame
  p.u = clamp(p.u, U_LO, U_HI);
  // when the fist cannot go lower or further across, the beam gives way instead: it never points below the climb
  // line from the fist, so the forearm behind it always comes up from the bottom or the lower right of the frame
  const vMin = p.w + climb(p.u);
  if (v.w < vMin) { v.w = vMin; dirC.set(v.u * th, v.w * tv, -1).normalize(); }
  const headC = new THREE.Vector3(p.u * th * D, p.w * tv * D, -D)
    .add(new THREE.Vector3(0.1, -0.3, 0.1).multiplyScalar(1 - easeOut(raise))).add(new THREE.Vector3(sway * 0.4, bob, 0));
  const tailC = headC.clone().sub(dirC.clone().multiplyScalar(0.14));
  cam.updateMatrixWorld();
  const head = cam.localToWorld(headC.clone()), tail = cam.localToWorld(tailC.clone());
  const target = head.clone().add(head.clone().sub(tail).normalize().multiplyScalar(7));
  return { head, tail, target, headC, tailC };
}
const easeOut = (x: number) => 1 - (1 - x) ** 3;

function toScreen(cam: THREE.PerspectiveCamera, pc: THREE.Vector3): P2 {
  const f = (H / 2) / Math.tan((cam.fov * Math.PI) / 360);
  return { x: W / 2 + (pc.x / -pc.z) * f, y: H / 2 - (pc.y / -pc.z) * f };
}

// ---------------------------------------------------------------- the sleeve
/**
 * A raincoat sleeve from `base` (off the bottom edge) to the cuff at `cuff`; `w0`/`w1` are the widths there.
 * Returns the outline (for the QA coverage check).
 */
function drawSleeve(c: CanvasRenderingContext2D, base: P2, cuff: P2, w0: number, w1: number, l: Light, bend = 1): [number, number][] {
  const dx = cuff.x - base.x, dy = cuff.y - base.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const at = (s: number, o: number): P2 => ({ x: base.x + dx * s + nx * o, y: base.y + dy * s + ny * o });
  const wAt = (s: number) => lerp(w0, w1, s ** 0.8) + Math.sin(s * Math.PI) * w1 * 0.12;
  const bow = (s: number) => Math.sin(s * Math.PI) * L * 0.035 * bend; // a soft bend at the elbow side
  const N = 10;
  const left: P2[] = [], right: P2[] = [];
  for (let i = 0; i <= N; i++) { const s = i / N; left.push(at(s, bow(s) + wAt(s) / 2)); right.push(at(s, bow(s) - wAt(s) / 2)); }
  const path = () => {
    c.beginPath();
    c.moveTo(left[0]!.x, left[0]!.y);
    for (let i = 1; i <= N; i++) c.lineTo(left[i]!.x, left[i]!.y);
    for (let i = N; i >= 0; i--) c.lineTo(right[i]!.x, right[i]!.y);
    c.closePath();
  };
  // body with a gradient across (light from above-left, the far edge in shade)
  const g = c.createLinearGradient(at(0.6, w1).x, at(0.6, w1).y, at(0.6, -w1).x, at(0.6, -w1).y);
  g.addColorStop(0, coatC(l, 1.08)); g.addColorStop(0.55, coatC(l, 0.95)); g.addColorStop(1, coatC(l, 0.62));
  c.fillStyle = g; path(); c.fill();
  // folds: soft creases across the forearm, each a shadow line with a lit ridge under it
  c.save(); path(); c.clip();
  c.lineCap = 'round';
  for (const [s, k, skew] of [[0.3, 0.9, 0.12], [0.5, 0.75, -0.08], [0.68, 0.6, 0.1], [0.8, 0.45, -0.05]] as const) {
    const w = wAt(s);
    const a = at(s, bow(s) + w * 0.52), b = at(s + skew, bow(s) - w * (0.1 + 0.25 * k)), m = at(s + skew * 0.5 + 0.03, bow(s) + w * 0.15);
    c.strokeStyle = coatDC(l); c.globalAlpha = 0.55; c.lineWidth = Math.max(1.5, w1 * 0.07);
    c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(m.x, m.y, b.x, b.y); c.stroke();
    c.strokeStyle = coatHC(l, 0.35); c.lineWidth = Math.max(1, w1 * 0.035);
    c.beginPath(); c.moveTo(a.x - ux * w1 * 0.08, a.y - uy * w1 * 0.08); c.quadraticCurveTo(m.x - ux * w1 * 0.08, m.y - uy * w1 * 0.08, b.x - ux * w1 * 0.08, b.y - uy * w1 * 0.08); c.stroke();
  }
  c.globalAlpha = 1;
  // the plastic's sheen along the lit edge
  c.strokeStyle = coatHC(l, 0.55); c.lineWidth = Math.max(1.5, w1 * 0.06);
  c.beginPath();
  for (let i = 1; i < N; i++) { const s = i / N, p = at(s, bow(s) + wAt(s) * 0.36); if (i === 1) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); }
  c.stroke();
  c.restore();
  // the cuff: an elasticated band, slightly gathered, a touch wider than the sleeve end
  const cw = w1 * 1.06, cl = w1 * 0.3;
  const c0 = at(1 - cl / L, bow(1)), c1 = cuff;
  const q = (p: P2, o: number): P2 => ({ x: p.x + nx * o, y: p.y + ny * o });
  c.fillStyle = coatC(l, 0.8);
  c.beginPath();
  c.moveTo(q(c0, cw / 2).x, q(c0, cw / 2).y);
  c.quadraticCurveTo(q({ x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 }, cw * 0.56).x, q({ x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 }, cw * 0.56).y, q(c1, cw / 2).x, q(c1, cw / 2).y);
  c.lineTo(q(c1, -cw / 2).x, q(c1, -cw / 2).y);
  c.quadraticCurveTo(q({ x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 }, -cw * 0.56).x, q({ x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 }, -cw * 0.56).y, q(c0, -cw / 2).x, q(c0, -cw / 2).y);
  c.closePath(); c.fill();
  c.strokeStyle = coatDC(l); c.lineWidth = Math.max(1, w1 * 0.025); c.globalAlpha = 0.7;
  for (let i = -3; i <= 3; i++) { const o = (i / 3.6) * cw / 2; const a = q(c0, o), b = q(c1, o * 1.02); c.beginPath(); c.moveTo(a.x + ux * cl * 0.2, a.y + uy * cl * 0.2); c.lineTo(b.x - ux * cl * 0.2, b.y - uy * cl * 0.2); c.stroke(); }
  c.globalAlpha = 1;
  // the opening: the dark inside of the sleeve the wrist comes out of
  c.fillStyle = mixRgba('shadow', COAT_D, 0.25);
  c.beginPath(); c.ellipse(c1.x, c1.y, cw * 0.47, cw * 0.14, Math.atan2(ny, nx), 0, Math.PI * 2); c.fill();
  return [...left, ...right.reverse()].map((p) => [p.x, p.y] as [number, number]);
}

// ---------------------------------------------------------------- the torch hand
/**
 * The right hand holding the torch, drawn around the projected torch. Returns the head's screen point (the
 * lens) and the outline of hand + sleeve.
 */
export function drawTorchHand(c: CanvasRenderingContext2D, cam: THREE.PerspectiveCamera, pose: TorchPose, l: Light, o: { log?: boolean } = {}) {
  const Hs = toScreen(cam, pose.headC), Ts0 = toScreen(cam, pose.tailC);
  const depth = -(pose.headC.z + pose.tailC.z) / 2;
  const r = 0.0165 * pxAt(cam, depth); // the torch body's radius (a child's torch: 33 mm across)
  let ax = Hs.x - Ts0.x, ay = Hs.y - Ts0.y;
  const len0 = Math.hypot(ax, ay) || 1;
  ax /= len0; ay /= len0;
  // seen nearly end-on the body would shrink to a stub: keep a readable three-quarter length
  const len = Math.max(len0, 9.4 * r);
  const Ts = { x: Hs.x - ax * len, y: Hs.y - ay * len };
  const th = Math.atan2(ay, ax);
  // local frame: +x along the torch towards the lens, +y towards the fingers' side (under the body)
  // the fingers wrap under the body, the knuckles up or out: the fingers' side is always the lower one on screen
  // (aimed up-right the fist is mirrored rather than twisted so the back of the hand never turns to the camera)
  const mir = -Math.cos(th) < 0 ? -1 : 1;
  const L2S = (x: number, y: number): P2 => {
    const nx = Math.sin(th) * mir, ny = -Math.cos(th) * mir; // +y (fingers) = the lower side on screen
    return { x: Ts.x + (ax * x + nx * y) * r, y: Ts.y + (ay * x + ny * y) * r };
  };
  const on = pose ? clamp(l.torch ?? 0) : 0;
  // --- sleeve and wrist: the forearm comes up from below the frame to the heel of the hand
  const heel = L2S(0.1, -1.45); // the wrist enters the back of the fist, which sits over the top of the body (the fingers wrap round under it)
  // the forearm continues the torch axis back out of the frame (B7: the torch follows the forearm, the wrist is straight)
  const down = { x: -ax, y: -ay };
  const dn = 1;
  // portrait holds the hand low in the frame: a shorter bare wrist keeps the cuff and the sleeve on screen
  const wl = PORTRAIT ? 0.9 : 1.6;
  const cuff = { x: heel.x + (down.x / dn) * r * wl, y: heel.y + (down.y / dn) * r * wl };
  const exitT = Math.min(down.x > 1e-3 ? (W - cuff.x) / down.x : down.x < -1e-3 ? -cuff.x / down.x : 1e9, down.y > 1e-3 ? (H - cuff.y) / down.y : down.y < -1e-3 ? -cuff.y / down.y : 1e9);
  const base = { x: cuff.x + down.x * (Math.max(0, exitT) + r * 9), y: cuff.y + down.y * (Math.max(0, exitT) + r * 9) };
  const outline = drawSleeve(c, base, cuff, r * 6.6, r * 3.9, l, 1);
  // the wrist, out of the cuff into the heel of the hand
  c.lineCap = 'round';
  c.strokeStyle = skinC(l, 0.95); c.lineWidth = r * 2.6;
  c.beginPath(); c.moveTo(cuff.x, cuff.y); c.lineTo(heel.x, heel.y); c.stroke();
  // --- the torch: body, bevelled head, the lens rim
  c.save();
  c.translate(Ts.x, Ts.y); c.rotate(th); c.scale(r, r);
  const metal = (k: number) => mixRgba('shadow', '#3A4048', clamp(0.55 + 0.5 * l.amb + 0.3 * (l.warm ?? 0)) * k);
  const gb = c.createLinearGradient(0, -1, 0, 1);
  gb.addColorStop(0, metal(1.5)); gb.addColorStop(0.3, metal(2.1)); gb.addColorStop(0.65, metal(1)); gb.addColorStop(1, metal(0.6));
  c.fillStyle = gb;
  c.beginPath(); c.roundRect(0.2, -1, len / r - 1.8, 2, 0.35); c.fill();
  // knurled grip rings just ahead of the fist
  c.strokeStyle = metal(0.5); c.lineWidth = 0.08;
  for (let x = 5.3; x < len / r - 2.2; x += 0.28) { c.beginPath(); c.moveTo(x, -0.95); c.lineTo(x, 0.95); c.stroke(); }
  // the head: flares to 1.3 r, a chrome bezel, the lens facing away (only its rim catches light)
  const hx = len / r;
  const gh = c.createLinearGradient(0, -1.3, 0, 1.3);
  gh.addColorStop(0, metal(1.8)); gh.addColorStop(0.3, metal(2.4)); gh.addColorStop(1, metal(0.7));
  c.fillStyle = gh;
  c.beginPath(); c.moveTo(hx - 1.9, -1); c.lineTo(hx - 0.35, -1.32); c.lineTo(hx, -1.32); c.lineTo(hx, 1.32); c.lineTo(hx - 0.35, 1.32); c.lineTo(hx - 1.9, 1); c.closePath(); c.fill();
  c.fillStyle = mixRgba('#8A929C', 'lamp', 0.5 * on, 0.9);
  c.fillRect(hx - 0.3, -1.32, 0.3, 2.64);
  c.fillStyle = rgba('lamp', 0.25 + 0.75 * on);
  c.beginPath(); c.ellipse(hx + 0.02, 0, 0.12, 1.12, 0, 0, Math.PI * 2); c.fill();
  c.restore();
  // --- the lanyard: a thin cord loop from the tail cap, hanging straight down on screen (reference photos 28.09)
  {
    const gx = Math.sin(th), gy = -Math.cos(th) * mir; // screen-down in the local frame (+y = the lower side)
    const T0 = L2S(0.15, 0.55), dl = 6.2, sw = 0.55;
    const P = (x: number, y: number) => L2S(x, y);
    const bot = P(0.15 + gx * dl, 0.55 + gy * dl), a1 = P(0.15 + gx * dl * 0.5 - gy * sw, 0.55 + gy * dl * 0.5 + gx * sw), a2 = P(0.15 + gx * dl * 0.5 + gy * sw * 0.4, 0.55 + gy * dl * 0.5 - gx * sw * 0.4);
    c.strokeStyle = mixRgba('shadow', '#9EA3A6', clamp(0.35 + 0.55 * l.amb + 0.3 * (l.warm ?? 0))); c.lineWidth = Math.max(1.2, r * 0.16); c.lineCap = 'round';
    c.beginPath(); c.moveTo(T0.x, T0.y); c.quadraticCurveTo(a1.x, a1.y, bot.x, bot.y); c.quadraticCurveTo(a2.x, a2.y, T0.x, T0.y); c.stroke();
  }
  // --- the fist round the body (local units of r; +y = the lower side on screen). Reference: a closed fist
  // round the barrel, the back of the hand and the knuckle row on top towards the viewer, four curled fingers
  // crossing over the body and tucking under it, the thumb along the top towards the head; the body continues
  // out of the front of the fist, the tail and its lanyard out of the back.
  c.save();
  c.translate(Ts.x, Ts.y); c.rotate(th); c.scale(r, -r * mir);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const edge = skinDC(l), ow = 0.075;
  const stroke = (p: Path2D, a = 0.85, w = ow) => { c.strokeStyle = edge; c.globalAlpha = a; c.lineWidth = w; c.stroke(p); c.globalAlpha = 1; };
  // the heel of the palm and the fingertips tucked under the body (the shadow side)
  const under = new Path2D();
  under.moveTo(0.1, 0.4);
  under.bezierCurveTo(0.2, 1.55, 1.2, 2.05, 2.4, 2.0);
  under.bezierCurveTo(3.5, 1.95, 4.4, 1.7, 4.7, 1.1);
  under.lineTo(4.6, 0.3); under.closePath();
  c.fillStyle = skinC(l, 0.72); c.fill(under); stroke(under, 0.7);
  // the back of the hand, over the top of the body: heel to the knuckle row
  const back = new Path2D();
  back.moveTo(-0.55, -1.0);
  back.bezierCurveTo(-0.7, -2.1, 0.2, -3.05, 1.5, -3.1);
  back.bezierCurveTo(2.7, -3.15, 4.0, -2.8, 4.75, -2.15);
  back.bezierCurveTo(5.05, -1.85, 4.95, -1.4, 4.6, -1.25);
  back.lineTo(0.9, -0.9); back.closePath();
  const gk = c.createLinearGradient(0, -3.1, 0, -0.9);
  gk.addColorStop(0, skinHC(l)); gk.addColorStop(0.55, skinC(l, 1.03)); gk.addColorStop(1, skinC(l, 0.9));
  c.fillStyle = gk; c.fill(back); stroke(back);
  // tendons fanning from the wrist to the knuckles, faint
  c.strokeStyle = edge; c.globalAlpha = 0.25; c.lineWidth = 0.08;
  for (const kx of [1.3, 2.3, 3.25, 4.15]) { c.beginPath(); c.moveTo(0.1, -2.0); c.quadraticCurveTo((kx + 0.1) / 2, -2.55, kx, -2.1); c.stroke(); }
  c.globalAlpha = 1;
  // four curled fingers (little finger at the wrist end, index at the head end): from the knuckle down over the
  // body's face to the tip tucked under it; each a rounded band across the body, split by dark gaps
  const F = [{ x: 1.3, w: 0.9, t: 1.35 }, { x: 2.25, w: 1.0, t: 1.6 }, { x: 3.25, w: 1.02, t: 1.62 }, { x: 4.2, w: 0.95, t: 1.4 }];
  for (const q of F) {
    const x0 = q.x - q.w / 2, x1 = q.x + q.w / 2, lean = 0.18; // the fingers lean a little towards the head as they curl
    const p = new Path2D();
    p.moveTo(x0, -2.15);
    p.bezierCurveTo(x0 - 0.05, -2.45, x1 + 0.05, -2.45, x1, -2.15); // the knuckle's dome
    p.bezierCurveTo(x1 + 0.1, -0.8, x1 + lean, 0.4, x1 + lean * 0.6, q.t - 0.35);
    p.bezierCurveTo(x1 + lean * 0.5, q.t + 0.05, x0 + lean * 0.5, q.t + 0.05, x0 + lean * 0.6, q.t - 0.35); // the rounded tip
    p.bezierCurveTo(x0 + lean, 0.4, x0 - 0.1, -0.8, x0, -2.15);
    p.closePath();
    const gf = c.createLinearGradient(0, -2.4, 0, q.t);
    gf.addColorStop(0, skinHC(l)); gf.addColorStop(0.3, skinC(l, 1.02)); gf.addColorStop(0.7, skinC(l, 0.88)); gf.addColorStop(1, skinC(l, 0.72));
    c.fillStyle = gf; c.fill(p); stroke(p, 0.95, 0.085);
    // the two joint creases across the finger and the knuckle's highlight
    c.strokeStyle = edge; c.lineWidth = 0.06; c.globalAlpha = 0.6;
    for (const yy of [-0.95, 0.45]) { const sh = lean * (yy + 2.15) / 3.2; c.beginPath(); c.moveTo(x0 + 0.14 + sh, yy); c.quadraticCurveTo(q.x + sh, yy + 0.12, x1 - 0.14 + sh, yy); c.stroke(); }
    c.globalAlpha = 1;
    c.strokeStyle = skinHC(l, 0.7); c.lineWidth = 0.11;
    c.beginPath(); c.arc(q.x, -2.05, q.w * 0.28, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  }
  // the thumb: from the side of the hand over the top of the body, lying along it towards the head
  const thumb = new Path2D();
  thumb.moveTo(4.0, -2.5);
  thumb.bezierCurveTo(4.9, -2.6, 6.0, -1.9, 6.75, -1.25);
  thumb.bezierCurveTo(7.1, -0.95, 7.0, -0.35, 6.55, -0.3);
  thumb.bezierCurveTo(5.9, -0.3, 5.1, -0.65, 4.55, -1.05);
  thumb.closePath();
  const gt = c.createLinearGradient(0, -2.6, 0, -0.3);
  gt.addColorStop(0, skinHC(l)); gt.addColorStop(0.5, skinC(l, 1.02)); gt.addColorStop(1, skinC(l, 0.84));
  c.fillStyle = gt; c.fill(thumb); stroke(thumb, 0.95, 0.085);
  // nail and joint
  c.fillStyle = mixRgba('shadow', NAIL, clamp(0.35 + 0.6 * l.amb + 0.5 * on));
  c.beginPath(); c.ellipse(6.45, -0.95, 0.42, 0.27, 0.55, 0, Math.PI * 2); c.fill();
  c.strokeStyle = edge; c.lineWidth = 0.06; c.globalAlpha = 0.55;
  c.beginPath(); c.moveTo(5.35, -2.05); c.quadraticCurveTo(5.35, -1.4, 5.0, -0.85); c.stroke();
  c.globalAlpha = 1;
  // the lens's warm spill on the thumb tip and the index finger
  if (on > 0.02) {
    const gw = c.createRadialGradient(len / r, 0, 0, len / r, 0, 4.2);
    gw.addColorStop(0, rgba('lamp', 0.3 * on)); gw.addColorStop(1, rgba('lamp', 0));
    c.save(); c.clip(thumb); c.fillStyle = gw; c.fillRect(3, -3, 6, 4); c.restore();
  }
  c.restore();
  const hand = [L2S(-0.8, -2.2), L2S(1.5, -3.2), L2S(4.9, -2.6), L2S(7.1, -1.2), L2S(len / r + 0.2, -1.4), L2S(len / r + 0.2, 1.4), L2S(4.7, 1.9), L2S(2.4, 2.1), L2S(0.1, 1.2)].map((p) => [p.x, p.y] as [number, number]);
  const poly = [...outline, ...hand];
  // B7: the on-screen angle between the forearm (cuff → heel) and the torch axis (tail → head)
  const fx = heel.x - cuff.x, fy = heel.y - cuff.y, fl = Math.hypot(fx, fy) || 1;
  const wristDeg = (Math.acos(clamp((fx * ax + fy * ay) / fl, -1, 1)) * 180) / Math.PI;
  if (o.log !== false) logText('hand', 'torch hand', true, boxOf(poly), { id: 'hand:right', poly, wristDeg });
  return { lens: Hs, r, poly };
}

// ---------------------------------------------------------------- the free (left) hand
/**
 * The left hand, open: `tip` is where the middle fingertip lands, `from` the direction the forearm comes in
 * from (a point off the frame edge). `mode` 'grab' hooks the fingers over an edge; 'flat' presses the palm flat
 * (fingers straight, a little spread). `s` is the palm's width in px.
 */
export function drawOpenHand(c: CanvasRenderingContext2D, tip: P2, from: P2, s: number, l: Light, mode: 'grab' | 'flat' | 'point' = 'flat', o: { log?: boolean; curl?: number } = {}) {
  // 'point': the index finger straight out (pressing a switch, a finger in the phone's dial), the others curled in
  const q = s / 4;
  let fx = tip.x - from.x, fy = tip.y - from.y;
  const fl = Math.hypot(fx, fy) || 1;
  fx /= fl; fy /= fl;
  const handLen = q * (3.4 + (mode === 'grab' ? 2.2 : 3.2));
  void 0;
  const wrist = { x: tip.x - fx * handLen, y: tip.y - fy * handLen };
  const cuff = { x: wrist.x - fx * q * 1.6, y: wrist.y - fy * q * 1.6 };
  const outline = drawSleeve(c, from, cuff, s * 2.6, s * 1.1, l, -1);
  const th = Math.atan2(fy, fx);
  c.save();
  c.translate(wrist.x, wrist.y); c.rotate(th); c.scale(q, q);
  c.lineCap = 'round'; c.lineJoin = 'round';
  // wrist out of the cuff
  c.strokeStyle = skinC(l, 0.82); c.lineWidth = 2.7;
  c.beginPath(); c.moveTo(-1.8, 0); c.lineTo(0.4, 0); c.stroke();
  // fingers first (the back of the hand overlaps their roots). +y is the thumb side (left hand, back view)
  const curl = clamp(o.curl ?? (mode === 'grab' ? 1 : 0));
  const F = [
    { y: 1.45, L: 2.9, w: 0.95, a: 0.07 }, // index
    { y: 0.48, L: 3.25, w: 0.98, a: 0.02 },
    { y: -0.48, L: 3.05, w: 0.92, a: -0.04 },
    { y: -1.38, L: 2.4, w: 0.8, a: -0.11 }, // little finger
  ];
  for (const [fi, f] of F.entries()) {
    const cf = mode === 'point' ? (fi === 0 ? 0 : Math.max(curl, 0.92)) : curl;
    const Lf = f.L * lerp(1, mode === 'point' && fi > 0 ? 0.42 : 0.62, cf);
    c.save();
    c.translate(3.2, f.y * 0.95); c.rotate(f.a * (mode === 'flat' ? 1.6 : 1));
    const p = new Path2D();
    p.moveTo(0, -f.w / 2);
    p.lineTo(Lf - f.w * 0.45, -f.w * 0.44);
    p.quadraticCurveTo(Lf + f.w * 0.05, -f.w * 0.4, Lf + f.w * 0.05, 0);
    p.quadraticCurveTo(Lf + f.w * 0.05, f.w * 0.4, Lf - f.w * 0.45, f.w * 0.44);
    p.lineTo(0, f.w / 2);
    p.closePath();
    const g = c.createLinearGradient(0, -f.w / 2, 0, f.w / 2);
    g.addColorStop(0, skinC(l, 0.78)); g.addColorStop(0.45, skinC(l, 1)); g.addColorStop(1, skinC(l, 0.86));
    c.fillStyle = g; c.fill(p);
    c.strokeStyle = skinDC(l); c.lineWidth = 0.06; c.globalAlpha = 0.75; c.stroke(p); c.globalAlpha = 1;
    // curled fingertips hook over the edge: the last segment darker (turned away)
    if (cf > 0.05) { c.fillStyle = mixRgba('shadow', SKIN_D, 0.5, 0.55 * cf); c.fillRect(Lf - f.w * 0.9, -f.w * 0.44, f.w * 0.9, f.w * 0.88); }
    else {
      c.fillStyle = mixRgba('shadow', NAIL, clamp(0.35 + 0.6 * l.amb));
      c.beginPath(); c.roundRect(Lf - f.w * 0.78, -f.w * 0.27, f.w * 0.7, f.w * 0.54, f.w * 0.25); c.fill();
    }
    c.strokeStyle = skinDC(l); c.lineWidth = 0.055; c.globalAlpha = 0.55;
    for (const k of [0.42, 0.72]) { const x = Lf * k; c.beginPath(); c.moveTo(x, -f.w * 0.3); c.quadraticCurveTo(x - 0.08, 0, x, f.w * 0.3); c.stroke(); }
    c.globalAlpha = 1;
    c.restore();
  }
  // thumb: from the side of the palm, angled out
  c.save();
  c.translate(1.0, 1.55); c.rotate(mode === 'grab' ? 0.55 : mode === 'point' ? 0.3 : 0.8);
  const tp = new Path2D();
  tp.moveTo(0, -0.55); tp.lineTo(2.1, -0.46); tp.quadraticCurveTo(2.65, -0.4, 2.65, 0); tp.quadraticCurveTo(2.65, 0.45, 2.1, 0.5); tp.lineTo(0, 0.6); tp.closePath();
  const gt = c.createLinearGradient(0, -0.55, 0, 0.6);
  gt.addColorStop(0, skinC(l, 0.9)); gt.addColorStop(1, skinC(l, 0.75));
  c.fillStyle = gt; c.fill(tp);
  c.strokeStyle = skinDC(l); c.lineWidth = 0.06; c.globalAlpha = 0.75; c.stroke(tp); c.globalAlpha = 1;
  c.fillStyle = mixRgba('shadow', NAIL, clamp(0.35 + 0.6 * l.amb));
  c.beginPath(); c.roundRect(1.85, -0.3, 0.7, 0.6, 0.25); c.fill();
  c.restore();
  // the back of the hand: wrist to the knuckle line
  const bk = new Path2D();
  bk.moveTo(0, -1.4);
  bk.bezierCurveTo(1.2, -1.6, 2.4, -2.0, 3.35, -1.85);
  bk.quadraticCurveTo(3.7, 0, 3.35, 1.95);
  bk.bezierCurveTo(2.3, 2.2, 1.1, 1.75, 0, 1.4);
  bk.closePath();
  const gb = c.createLinearGradient(0, -2, 0, 2);
  gb.addColorStop(0, skinC(l, 0.8)); gb.addColorStop(0.5, skinC(l, 1.02)); gb.addColorStop(1, skinHC(l));
  c.fillStyle = gb; c.fill(bk);
  c.strokeStyle = skinDC(l); c.lineWidth = 0.06; c.globalAlpha = 0.5; c.stroke(bk); c.globalAlpha = 1;
  // knuckles
  c.strokeStyle = skinHC(l, 0.55); c.lineWidth = 0.1;
  for (const f of F) { c.beginPath(); c.arc(3.15, f.y * 0.95, f.w * 0.32, -Math.PI * 0.35, Math.PI * 0.35); c.stroke(); }
  c.restore();
  const tipBox: [number, number][] = [[tip.x + fy * s, tip.y - fx * s], [tip.x - fy * s, tip.y + fx * s]];
  const poly = [...outline, ...tipBox];
  if (o.log !== false) logText('hand', 'free hand', true, boxOf(poly), { id: 'hand:left', poly });
  return { poly, wrist };
}

function boxOf(p: [number, number][]) {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
