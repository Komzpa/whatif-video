// The child's home block: ONE model for every chapter that shows it (TREATMENT r8 notes 3 and 8: the house seen
// far off at ~0:30 in `door` must be the same building as the one in `close`). A five-storey panel block, 48 m of
// facade in 3.2 m panels, our window on the second floor in the middle panel, a lift room on the roof above the
// left entrance, the entrance canopy two panels left of our window. Local frame: the facade is the plane z = 0.3
// facing +z, x along it, y up from the ground; `buildHome` places that frame anywhere.
import * as THREE from 'three';
import { lit, canvasTex, speckle, blotches, boxMesh, concreteTex, glowMat, type V3, type LitWindow } from './_kit';
import { mulberry32 } from '../engine/util';

export const HOME = {
  PANEL_W: 3.2, FLOOR_H: 2.8, PLINTH: 0.6, FLOORS: 5, LEN: 48, DEPTH: 12,
  /** Our window in the local frame (the second floor, the middle panel). */
  WIN: { x0: -0.7, x1: 0.7, y0: 0.6 + 2.8 + 0.85, y1: 0.6 + 2.8 + 2.3 },
  /** The entrance (подъезд) under its canopy, two panels left of our window. */
  ENTRANCE_X: -6.4,
};

export interface Home { g: THREE.Group; windows: LitWindow[]; our: V3; toWorld: (p: V3) => V3; ry: number }

/**
 * The block. `hole`: the room behind our window is built by the chapter; otherwise our window gets an inner sill
 * and a pane of its own behind the glass (`ourLight`: its warm glow 0..1, a lamp left on inside). `windows` are the neighbours'
 * windows (world coordinates, all of them; the chapter decides which are lit).
 */
export function buildHome(parent: THREE.Object3D, o: { pos?: V3; ry?: number; hole?: boolean; ourLight?: number } = {}): Home {
  const { PANEL_W, FLOOR_H, PLINTH, FLOORS, LEN, DEPTH, WIN } = HOME;
  const g = new THREE.Group(); const pos = o.pos ?? [0, 0, 0], ry = o.ry ?? 0;
  g.position.set(...pos); g.rotation.y = ry; parent.add(g);
  const ca = Math.cos(ry), sa = Math.sin(ry);
  const toWorld = (p: V3): V3 => [pos[0] + p[0] * ca + p[2] * sa, pos[1] + p[1], pos[2] - p[0] * sa + p[2] * ca];
  // the facade texture: one panel per tile (3.2 x 2.8 m), a window in each
  const fac = canvasTex(512, 448, (c) => {
    c.fillStyle = '#77756d'; c.fillRect(0, 0, 512, 448);
    speckle(c, 512, 448, 8000, 0.22, 212); blotches(c, 512, 448, 10, () => 'rgba(30,28,24,0.25)', 20, 90, 213);
    c.strokeStyle = 'rgba(25,25,25,0.8)'; c.lineWidth = 4; c.strokeRect(0, 0, 512, 448);
    const wx0 = (1.6 - 0.7) / 3.2 * 512, wx1 = (1.6 + 0.7) / 3.2 * 512, wy0 = 448 - (2.3 / 2.8) * 448, wy1 = 448 - (0.85 / 2.8) * 448;
    c.fillStyle = '#0b0d10'; c.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    c.strokeStyle = '#b8b4a6'; c.lineWidth = 7; c.strokeRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    c.beginPath(); c.moveTo((wx0 + wx1) / 2, wy0); c.lineTo((wx0 + wx1) / 2, wy1); c.moveTo(wx0, wy0 + 50); c.lineTo(wx1, wy0 + 50); c.stroke();
    c.fillStyle = '#5a5850'; c.fillRect(wx0 - 10, wy1, wx1 - wx0 + 20, 10);
  });
  fac.wrapS = fac.wrapT = THREE.RepeatWrapping;
  fac.repeat.set(1 / PANEL_W, 1 / FLOOR_H); fac.offset.set(0.5, -PLINTH / FLOOR_H);
  const top = PLINTH + FLOORS * FLOOR_H;
  const shape = new THREE.Shape(); shape.moveTo(-LEN / 2, PLINTH); shape.lineTo(LEN / 2, PLINTH); shape.lineTo(LEN / 2, top); shape.lineTo(-LEN / 2, top); shape.closePath();
  { const hole = new THREE.Path(); hole.moveTo(WIN.x0, WIN.y0); hole.lineTo(WIN.x0, WIN.y1); hole.lineTo(WIN.x1, WIN.y1); hole.lineTo(WIN.x1, WIN.y0); hole.closePath(); shape.holes.push(hole); }
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(shape), lit([0.75, 0.75, 0.75], { map: fac, rough: 0.9 }));
  wall.position.z = 0.3; wall.receiveShadow = true; g.add(wall);
  boxMesh(g, LEN, PLINTH, 0.4, 0, PLINTH / 2, 0.2, lit([0.3, 0.3, 0.29], { map: concreteTex(214, [12, 1]), rough: 0.9 }));
  boxMesh(g, LEN, 0.3, DEPTH, 0, top + 0.15, -5.7, lit([0.2, 0.2, 0.2], { rough: 0.9 })); // roof
  boxMesh(g, LEN, top, 11.4, 0, top / 2, -12.6, lit([0.1, 0.1, 0.1], { rough: 0.9 }), { cast: false }); // the block's body
  for (const sx of [-1, 1]) boxMesh(g, 0.3, FLOORS * FLOOR_H, 3.9, sx * LEN / 2, PLINTH + FLOORS * FLOOR_H / 2, -1.65, lit([0.3, 0.3, 0.28], { rough: 0.9 }));
  // the landmarks that make it this house from anywhere: the lift room on the roof, the entrance canopy and its lamp
  boxMesh(g, 4.0, 2.2, 4.0, HOME.ENTRANCE_X, top + 1.1, -3.0, lit([0.22, 0.22, 0.21], { rough: 0.9 }));
  const cm = lit([0.3, 0.3, 0.29], { rough: 0.9 });
  boxMesh(g, 2.6, 0.18, 1.6, HOME.ENTRANCE_X, 2.7, 1.1, cm);
  boxMesh(g, 1.2, 2.1, 0.08, HOME.ENTRANCE_X, 1.05 + 0.1, 0.36, lit([0.16, 0.12, 0.09], { rough: 0.7 }));
  const eLamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowMat([1, 0.8, 0.5], 1.8)); eLamp.position.set(HOME.ENTRANCE_X + 0.9, 2.45, 0.45); g.add(eLamp);
  // the reveal round our window (the wall's thickness), the sill, the white wooden frame with its cross, the glass
  const rev = lit([0.55, 0.54, 0.5], { rough: 0.9 });
  boxMesh(g, 1.4, 0.05, 0.3, 0, WIN.y0 - 0.025, 0.15, rev); boxMesh(g, 1.4, 0.05, 0.3, 0, WIN.y1 + 0.025, 0.15, rev);
  boxMesh(g, 0.05, 1.45, 0.3, WIN.x0 - 0.025, (WIN.y0 + WIN.y1) / 2, 0.15, rev); boxMesh(g, 0.05, 1.45, 0.3, WIN.x1 + 0.025, (WIN.y0 + WIN.y1) / 2, 0.15, rev);
  boxMesh(g, 1.6, 0.04, 0.28, 0, WIN.y0 - 0.06, 0.42, lit([0.4, 0.4, 0.4], { metal: 0.5, rough: 0.5 }));
  const frameM = lit([0.8, 0.78, 0.72], { rough: 0.6 });
  boxMesh(g, 1.4, 0.06, 0.08, 0, WIN.y0 + 0.03, 0.05, frameM); boxMesh(g, 1.4, 0.06, 0.08, 0, WIN.y1 - 0.03, 0.05, frameM);
  boxMesh(g, 0.06, 1.45, 0.08, WIN.x0 + 0.03, (WIN.y0 + WIN.y1) / 2, 0.05, frameM); boxMesh(g, 0.06, 1.45, 0.08, WIN.x1 - 0.03, (WIN.y0 + WIN.y1) / 2, 0.05, frameM);
  boxMesh(g, 0.05, 1.45, 0.07, 0, (WIN.y0 + WIN.y1) / 2, 0.05, frameM); boxMesh(g, 1.4, 0.05, 0.07, 0, WIN.y1 - 0.33, 0.05, frameM);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.41), new THREE.MeshStandardMaterial({ color: 0xa8b8c0, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.1, depthWrite: false }));
  glass.position.set(0, (WIN.y0 + WIN.y1) / 2, 0.06); g.add(glass);
  if (!o.hole) {
    // no room behind: a warm curtain-lit pane a little behind the glass (the lamp left on at home)
    const k = o.ourLight ?? 0;
    const curtain = canvasTex(128, 128, (c) => {
      const gr = c.createRadialGradient(64, 40, 4, 64, 60, 90); gr.addColorStop(0, '#ffd9a0'); gr.addColorStop(1, '#b0602a');
      c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 9) { c.fillStyle = 'rgba(90,40,10,0.25)'; c.fillRect(x, 0, 3, 128); } // tulle folds
    });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 1.39), k > 0 ? glowMat([1, 1, 1], 0.5 + 1.2 * k, { map: curtain }) : lit([0.02, 0.02, 0.025]));
    pane.position.set(0, (WIN.y0 + WIN.y1) / 2, -0.45); g.add(pane);
    boxMesh(g, 1.4, 0.04, 0.45, 0, WIN.y0 - 0.02, -0.2, lit([0.7, 0.68, 0.62], { rough: 0.6 })); // the inner sill (the cat sits here)
  }
  // the neighbours' windows on our facade (world coordinates; the chapter lights them)
  const windows: LitWindow[] = [];
  const r = mulberry32(215);
  for (let f = 0; f < FLOORS; f++) for (let k = -7; k <= 7; k++) {
    if (f === 1 && k === 0) continue;
    windows.push({ p: toWorld([k * PANEL_W, PLINTH + f * FLOOR_H + 1.575, 0.31]), ry, c: r() < 0.6 ? [0.5, 0.58, 0.78] : [0.8, 0.66, 0.5], k: 0.3 + r() * 0.25, tv: 0 });
  }
  return { g, windows, our: toWorld([0, (WIN.y0 + WIN.y1) / 2, 0.3]), toWorld, ry };
}
