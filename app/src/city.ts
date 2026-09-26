// The one city (TREATMENT r5 item 4, r7): data/city.json, loaded once at boot. A Soviet radial-ring city: an old
// centre inside the boulevard ring, six prospekts radiating out, the ring road, microdistricts between them, the
// promzona behind a concrete fence (the forbidden zone), two radial metro lines and a ring line. Every map, line
// diagram, station sign, callout distance and chapter location reads it through this module; no scene invents a
// station name or a distance. Names are Russian; the unfamiliar district shows them as real codec mojibake
// (src/mojibake.ts).
import { rgba, mixRgba } from './engine/palette';
import { F, font } from './engine/type';
import { logText } from './textlog';
import { moji } from './mojibake';

export type XY = [number, number];
export interface District { id: string; name: string; known: boolean; kind?: string; poly: XY[] }
export interface Station { id: string; name: string; at: XY; yourStop?: boolean }
export interface Stop { chapter: string; along: number | 'end'; place?: string; note?: string }
export interface Line { id: string; name: string; color: string; ring?: boolean; stations: Station[] }
export interface City {
  bounds: [number, number, number, number];
  mapFrame: [number, number, number, number];
  rings: { id: string; name: string; r: number }[];
  districts: District[];
  streets: { id: string; name: string; kind: 'prospekt' | 'ring' | 'street'; pts: XY[] }[];
  water: { id: string; name: string; poly: XY[] }[];
  unmapped: string[];
  restricted: { id: string; name: string; sign: string; signs: string[]; poly: XY[]; gate: XY };
  metro: { line: string; lineName: string; color: string; stations: Station[]; lines: Line[] };
  home: { name: string; at: XY; district: string };
  route: { actual?: { boarded?: string; alighted?: string }; walk: XY[]; stops: Stop[] };
  places: { id?: string; name: string; at?: XY }[];
}

let C: City | null = null;

export async function loadCity(): Promise<City> {
  const r = await fetch('data/city.json');
  if (!r.ok) throw new Error('data/city.json not found');
  C = (await r.json()) as City;
  return C;
}
export function city(): City {
  if (!C) throw new Error('city not loaded (loadCity() runs at boot)');
  return C;
}

// ------------------------------------------------------------------ lookups
/** The line the child rides (Линия 2): its stations in order from the centre out. */
export const stations = () => city().metro.stations;
export const station = (id: string) => { const s = stations().find((x) => x.id === id); if (!s) throw new Error(`no station ${id} in city.json`); return s; };
export const stationIndex = (id: string) => stations().findIndex((x) => x.id === id);
export const yourStop = () => stations().find((s) => s.yourStop)!;
export const district = (id: string) => city().districts.find((d) => d.id === id);
export function inPoly(poly: XY[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const inRestricted = (x: number, y: number) => inPoly(city().restricted.poly, x, y);
export const inWater = (x: number, y: number) => city().water.some((w) => inPoly(w.poly, x, y));
export const districtAt = (x: number, y: number) => city().districts.find((d) => inPoly(d.poly, x, y));
/** Known (clean signs, lit map) vs. unfamiliar (mojibake, grey hatched map). */
export function isKnown(x: number, y: number) {
  if (inRestricted(x, y)) return false;
  return districtAt(x, y)?.known ?? false;
}
/** The station where the child got off: the last one the train reached (route.actual.alighted). */
export const exitStation = () => station(city().route.actual?.alighted ?? stations()[stations().length - 1]!.id);

/** Every name the screen may show (stations of every line, districts, streets, places, zone, home, lines). */
export function cityNames(c: City = city()): Set<string> {
  const s = new Set<string>();
  for (const d of c.districts) s.add(d.name);
  for (const st of c.streets) s.add(st.name);
  for (const w of c.water) s.add(w.name);
  for (const l of c.metro.lines) { s.add(l.name); for (const x of l.stations) s.add(x.name); }
  for (const p of c.places) s.add(p.name);
  s.add(c.restricted.name); s.add(c.restricted.sign); for (const x of c.restricted.signs) s.add(x);
  s.add(c.home.name); s.add(c.metro.line); s.add(c.metro.lineName);
  return s;
}

// ------------------------------------------------------------------ the walk home and distances
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function walkLength() { const w = city().route.walk; let L = 0; for (let i = 1; i < w.length; i++) L += dist(w[i - 1]!, w[i]!); return L; }
/** The point `km` along the walk home. */
export function pointAlong(km: number): XY {
  const w = city().route.walk;
  let left = km;
  for (let i = 1; i < w.length; i++) {
    const d = dist(w[i - 1]!, w[i]!);
    if (left <= d) { const q = d ? left / d : 0; return [w[i - 1]![0] + (w[i]![0] - w[i - 1]![0]) * q, w[i - 1]![1] + (w[i]![1] - w[i - 1]![1]) * q]; }
    left -= d;
  }
  return w[w.length - 1]!;
}
export function stopOf(chapter: string) { return city().route.stops.find((s) => s.chapter === chapter); }
export function alongOf(chapter: string) { const s = stopOf(chapter); if (!s) return 0; return s.along === 'end' ? walkLength() : s.along; }
export const homeKm = (chapter: string) => Math.max(0, walkLength() - alongOf(chapter));
/** Russian number format: one decimal with a comma, «6,3 км». */
export const fmtKm = (km: number) => `${km.toFixed(1).replace('.', ',')} км`;
/** «ДОМ · 6,3 км» for a chapter. */
export const homeLabel = (chapter: string) => `${city().home.name} · ${fmtKm(homeKm(chapter))}`;
export function metroKm(a: string, b: string) {
  const st = stations(), i = stationIndex(a), j = stationIndex(b);
  let L = 0;
  for (let k = Math.min(i, j); k < Math.max(i, j); k++) L += dist(st[k]!.at, st[k + 1]!.at);
  return L;
}
export const M_PER_KM = 120;
export function toWorld(p: XY, origin: XY): [number, number] { return [(p[0] - origin[0]) * M_PER_KM, -(p[1] - origin[1]) * M_PER_KM]; }

// ------------------------------------------------------------------ broken encoding (r5 item 6, r7)
/**
 * A name as the child sees it in the unfamiliar district: real codec mojibake of the Russian name
 * (src/mojibake.ts; the codec is chosen per name). `level` 0..1 degrades step by step, character by character.
 */
export function garble(name: string, level = 1): string { return moji(name, level); }

// ------------------------------------------------------------------ the map (the film's layer)
export interface MapView { ox: number; oy: number; s: number } // px = ox + x*s, py = oy - y*s
export interface MapOpts {
  alpha?: number;
  /** The ride line: 1 = lit, 0 = greyed out (closed). */
  metro?: number;
  /** Line width scale (small maps: thicker). */
  weight?: number;
  home?: boolean;
  /** Clip to this rectangle (px). */
  clip?: { x: number; y: number; w: number; h: number };
}

/**
 * The city from city.json: microdistricts (known lit, unfamiliar grey and hatched), the promzona behind its
 * dashed fence, the prospekts and rings, the ride line with its stations, home.
 */
export function drawCityMap(c: CanvasRenderingContext2D, v: MapView, o: MapOpts = {}) {
  const CT = city(), wgt = o.weight ?? 1;
  const X = (x: number) => v.ox + x * v.s, Y = (y: number) => v.oy - y * v.s;
  const path = (pts: XY[], close = true) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); if (close) c.closePath(); };
  const hatch = (col: string, step: number, dir: 1 | -1) => {
    const b = o.clip ?? { x: 0, y: 0, w: 4000, h: 4000 };
    c.strokeStyle = col; c.lineWidth = 1.4 * wgt;
    for (let k = b.x - b.h; k < b.x + b.w + b.h; k += step) { c.beginPath(); c.moveTo(k, b.y); c.lineTo(k + dir * b.h, b.y + b.h); c.stroke(); }
  };
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  if (o.clip) { c.beginPath(); c.rect(o.clip.x, o.clip.y, o.clip.w, o.clip.h); c.clip(); }
  // microdistricts
  for (const d of CT.districts) {
    path(d.poly);
    if (d.known) { c.fillStyle = rgba('lamp', 0.1); c.fill(); c.strokeStyle = rgba('lamp', 0.4); c.lineWidth = 1.2 * wgt; c.stroke(); }
    else { c.fillStyle = rgba('concrete', 0.42); c.fill(); c.save(); path(d.poly); c.clip(); hatch(rgba('shadow', 0.5), 9 * wgt, -1); c.restore(); }
  }
  // the promzona: neon hatch behind the dashed line of its concrete fence
  path(CT.restricted.poly);
  c.fillStyle = rgba('neon', 0.1); c.fill();
  c.save(); path(CT.restricted.poly); c.clip(); hatch(rgba('neon', 0.3), 11 * wgt, 1); c.restore();
  path(CT.restricted.poly);
  c.strokeStyle = rgba('neon', 0.9); c.lineWidth = 2.6 * wgt; c.setLineDash([9 * wgt, 6 * wgt]); c.stroke(); c.setLineDash([]);
  // streets: prospekts and rings brighter, microdistrict streets fine
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of CT.streets) {
    path(s.pts, false);
    c.strokeStyle = s.kind === 'street' ? rgba('paper', 0.22) : rgba('paper', 0.42);
    c.lineWidth = (s.kind === 'street' ? 1.2 : s.kind === 'ring' ? 2.4 : 2.0) * wgt;
    c.stroke();
  }
  // the ride line
  const ml = o.metro ?? 1, st = CT.metro.stations;
  path(st.map((s) => s.at), false);
  c.strokeStyle = ml > 0.5 ? mixRgba('shadow', CT.metro.color, 0.35 + 0.65 * ml) : rgba('concrete', 0.7);
  c.lineWidth = 5 * wgt; c.stroke();
  for (const s of st) {
    c.fillStyle = rgba('shadow', 1); c.beginPath(); c.arc(X(s.at[0]), Y(s.at[1]), 6 * wgt, 0, Math.PI * 2); c.fill();
    c.strokeStyle = ml > 0.5 ? mixRgba('shadow', CT.metro.color, 1) : rgba('concrete', 0.8); c.lineWidth = 2.4 * wgt; c.stroke();
  }
  if (o.home !== false) {
    const [hx, hy] = CT.home.at, s = 12 * wgt;
    c.strokeStyle = rgba('lamp', 0.95); c.fillStyle = rgba('shadow', 0.9); c.lineWidth = 2.5 * wgt;
    c.beginPath(); c.moveTo(X(hx) - s, Y(hy) + s * 0.8); c.lineTo(X(hx) - s, Y(hy) - s * 0.2); c.lineTo(X(hx), Y(hy) - s); c.lineTo(X(hx) + s, Y(hy) - s * 0.2); c.lineTo(X(hx) + s, Y(hy) + s * 0.8); c.closePath(); c.fill(); c.stroke();
  }
  c.restore();
}

/** A station name on the map, logged for the QA name check. */
export function mapLabel(c: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, alpha = 1, align: CanvasTextAlign = 'left') {
  c.save();
  c.font = font(F.metro(700), size); c.textAlign = align; c.fillStyle = rgba('paper', 0.9 * alpha);
  c.fillText(name, x, y);
  const w = c.measureText(name).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  c.restore();
  logText('place', name, alpha >= 0.97, { x: x0, y: y - size, w, h: size * 1.2 }, { id: `map:${name}` });
}

/** Screen position of a map point in a view. */
export const mapPx = (v: MapView, p: XY) => ({ x: v.ox + p[0] * v.s, y: v.oy - p[1] * v.s });
