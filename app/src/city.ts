// The one city (TREATMENT r5 item 4): data/city.json, loaded once at boot. Every map, route display,
// station sign, callout distance and chapter location reads it through this module; no scene invents a
// station name or a distance. Also: the broken-encoding glyphs of the unfamiliar city (r5 item 6), made
// deterministically from the real names, and the drone's map drawn from the data.
import { hash } from './engine/util';
import { rgba } from './engine/palette';
import { F, font } from './engine/type';
import { logText } from './textlog';

export type XY = [number, number];
type Rect = [number, number, number, number];
export interface District { id: string; name: string; known: boolean; rects: Rect[] }
export interface Station { id: string; name: string; at: XY; district: string; yourStop?: boolean }
export interface Stop { chapter: string; along: number | 'end'; place?: string; note?: string }
export interface City {
  tile: number; bounds: Rect;
  districts: District[];
  water: { id: string; name: string; rects: Rect[] }[];
  unmapped: string[];
  restricted: { id: string; name: string; sign: string; rects: Rect[]; gate: XY };
  metro: { line: string; stations: Station[] };
  home: { name: string; at: XY; district: string };
  route: { walk: XY[]; stops: Stop[] };
  places: { name: string; at?: XY; in?: string }[];
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
export const stations = () => city().metro.stations;
export const station = (id: string) => { const s = stations().find((x) => x.id === id); if (!s) throw new Error(`no station ${id} in city.json`); return s; };
export const stationIndex = (id: string) => stations().findIndex((x) => x.id === id);
export const yourStop = () => stations().find((s) => s.yourStop)!;
export const district = (id: string) => city().districts.find((d) => d.id === id);
const inRects = (rs: Rect[], x: number, y: number) => rs.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
export const inRestricted = (x: number, y: number) => inRects(city().restricted.rects, x, y);
export const inWater = (x: number, y: number) => city().water.some((w) => inRects(w.rects, x, y));
/** Known (clean signs, lit map) vs. unfamiliar (glyph soup, grey hatched map). */
export function isKnown(x: number, y: number) {
  if (inRestricted(x, y)) return false;
  const d = city().districts.find((q) => inRects(q.rects, x, y));
  return d ? d.known : false;
}
/** The station where the child got off: the last one the train reached (route.actual.alighted). */
export const exitStation = () => station((city().route as any).actual?.alighted ?? stations()[stations().length - 1]!.id);

/** Every name the screen may show (stations, districts, places, zone, home, line, water). */
export function cityNames(c: City = city()): Set<string> {
  const s = new Set<string>();
  for (const d of c.districts) s.add(d.name);
  for (const w of c.water) s.add(w.name);
  for (const st of c.metro.stations) s.add(st.name);
  for (const p of c.places) s.add(p.name);
  s.add(c.restricted.name); s.add(c.restricted.sign); s.add(c.home.name); s.add(c.metro.line);
  return s;
}

// ------------------------------------------------------------------ the route on foot
const dist = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export function walkLength() { const w = city().route.walk; let L = 0; for (let i = 1; i < w.length; i++) L += dist(w[i - 1]!, w[i]!); return L; }
/** The point `km` along the walking route (clamped). */
export function pointAlong(km: number): XY {
  const w = city().route.walk;
  let left = Math.max(0, km);
  for (let i = 1; i < w.length; i++) {
    const d = dist(w[i - 1]!, w[i]!);
    if (left <= d) { const k = d ? left / d : 0; return [w[i - 1]![0] + (w[i]![0] - w[i - 1]![0]) * k, w[i - 1]![1] + (w[i]![1] - w[i - 1]![1]) * k]; }
    left -= d;
  }
  return w[w.length - 1]!;
}
export function stopOf(chapter: string) { return city().route.stops.find((s) => s.chapter === chapter); }
export function alongOf(chapter: string) { const s = stopOf(chapter); if (!s) return 0; return s.along === 'end' ? walkLength() : s.along; }
/** Remaining distance home (km) at a chapter's stop on the route: the HOME · x km countdown. */
export const homeKm = (chapter: string) => Math.max(0, walkLength() - alongOf(chapter));
export const fmtKm = (km: number) => `${km.toFixed(1)} km`;
/** Metro track length between two stations (km, along the line's station polyline). */
export function metroKm(a: string, b: string) {
  const s = stations(); let i = stationIndex(a), j = stationIndex(b); if (i > j) [i, j] = [j, i];
  let L = 0; for (let k = i + 1; k <= j; k++) L += dist(s[k - 1]!.at, s[k]!.at); return L;
}

/** Map km → the 3D world of the scenes (metres; y up, -z north), centred on `origin` (km). 1 km = 120 m. */
export const M_PER_KM = 120;
export function toWorld(p: XY, origin: XY): [number, number] { return [(p[0] - origin[0]) * M_PER_KM, -(p[1] - origin[1]) * M_PER_KM]; }

// ------------------------------------------------------------------ broken encoding (r5 item 6)
// Mis-decoded Latin/Cyrillic fragments, box and block characters: our own glyph soup, never a real word.
const SOUP = [
  'Ð', 'Ñ', 'Ã', 'Â', 'â€', 'Ђ', 'Ћ', 'Џ', 'Ї', 'Ґ', 'Ѓ', 'њ', 'ќ', 'џ', 'Љ', 'Р', 'С', 'ї', 'ґ', 'Ў', 'ё', 'Ы', 'Ж', 'Щ', 'Ъ', 'Ю', 'ÿ', 'þ', 'ß', 'æ', 'ø', 'µ', '¤', '¦', '§', '¿',
  '╬', '╪', '╫', '╦', '╩', '╠', '╣', '▓', '▒', '░', '█', '▄', '▀', '▌', '▐', '■', '□', '▪', '┼', '┤', '├', '┬', '┴', '═', '║',
];
/**
 * The name as the child sees it in the unfamiliar city: deterministic glyph soup of the same rhythm (spaces
 * kept). `level` 0..1 degrades step by step: each character has its own threshold, so a name breaks up
 * letter by letter and always into the same glyphs.
 */
export function garble(name: string, level = 1): string {
  if (level <= 0) return name;
  const seed = Array.from(name).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7);
  return Array.from(name).map((ch, i) => {
    if (ch === ' ' || ch === '·') return ch;
    if (hash(seed, i, 3) >= level) return ch;
    return SOUP[Math.floor(hash(seed, i, 11) * SOUP.length)]!;
  }).join('');
}

// ------------------------------------------------------------------ the drone's map
export interface MapView { ox: number; oy: number; s: number } // px = ox + x*s, py = oy - y*s
export interface MapOpts {
  alpha?: number;
  /** The drone's metro line: 1 = lit, 0 = greyed out (closed). */
  metro?: number;
  /** Labels for the known stations. */
  stationLabels?: boolean;
  /** Label the restricted zone with its sign text (the drone reads it). */
  zoneLabel?: number;
  /** Line width scale (small maps: thicker). */
  weight?: number;
  home?: boolean;
  districtLabels?: boolean;
}

/** Draw the city map from city.json: known tiles lit, unmapped grey and hatched, the zone, water, LINE 3. */
export function drawCityMap(c: CanvasRenderingContext2D, v: MapView, o: MapOpts = {}) {
  const CT = city(), T = CT.tile, wgt = o.weight ?? 1;
  const X = (x: number) => v.ox + x * v.s, Y = (y: number) => v.oy - y * v.s;
  const [bx0, by0, bx1, by1] = CT.bounds;
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  const ts = T * v.s;
  for (let x = bx0; x < bx1 - 1e-6; x += T) for (let y = by0; y < by1 - 1e-6; y += T) {
    const cx = x + T / 2, cy = y + T / 2;
    const px = X(x), py = Y(y + T);
    if (inWater(cx, cy)) continue;
    if (inRestricted(cx, cy)) {
      c.fillStyle = rgba('neon', 0.1); c.fillRect(px + 1, py + 1, ts - 2, ts - 2);
      c.save(); c.beginPath(); c.rect(px, py, ts, ts); c.clip();
      c.strokeStyle = rgba('neon', 0.35); c.lineWidth = 1.5 * wgt;
      for (let k = -ts; k < ts * 2; k += ts / 4) { c.beginPath(); c.moveTo(px + k, py); c.lineTo(px + k + ts, py + ts); c.stroke(); }
      c.restore();
    } else if (isKnown(cx, cy)) {
      const m = ts * 0.14;
      c.fillStyle = rgba('lamp', 0.1); c.fillRect(px + m, py + m, ts - 2 * m, ts - 2 * m);
      c.strokeStyle = rgba('lamp', 0.5); c.lineWidth = 1.4 * wgt; c.strokeRect(px + m, py + m, ts - 2 * m, ts - 2 * m);
    } else {
      c.fillStyle = rgba('concrete', 0.55); c.fillRect(px + 1, py + 1, ts - 2, ts - 2);
      c.save(); c.beginPath(); c.rect(px, py, ts, ts); c.clip();
      c.strokeStyle = rgba('shadow', 0.55); c.lineWidth = 1.6 * wgt;
      for (let k = -ts; k < ts * 2; k += ts / 5) { c.beginPath(); c.moveTo(px + k, py); c.lineTo(px + k - ts, py + ts); c.stroke(); }
      c.restore();
    }
  }
  // the restricted zone's border (hazard dashes) and the gate
  for (const [x0, y0, x1, y1] of CT.restricted.rects) {
    c.strokeStyle = rgba('neon', 0.9); c.lineWidth = 3 * wgt; c.setLineDash([10 * wgt, 7 * wgt]);
    c.strokeRect(X(x0), Y(y1), (x1 - x0) * v.s, (y1 - y0) * v.s);
    c.setLineDash([]);
  }
  // water
  for (const w of CT.water) for (const [x0, y0, x1, y1] of w.rects) {
    c.fillStyle = rgba('fog', 0.95); c.fillRect(X(x0), Y(y1), (x1 - x0) * v.s, (y1 - y0) * v.s);
    c.strokeStyle = rgba('concrete', 0.5); c.lineWidth = 1 * wgt;
    for (let y = y0 + 0.08; y < y1; y += 0.16) { c.beginPath(); c.moveTo(X(x0 + 0.05), Y(y)); c.lineTo(X(x1 - 0.05), Y(y + 0.04)); c.stroke(); }
  }
  // LINE 3
  const ml = o.metro ?? 1, st = CT.metro.stations;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = ml > 0.5 ? rgba('lamp', 0.35 + 0.5 * ml) : rgba('concrete', 0.7);
  c.lineWidth = 5 * wgt;
  c.beginPath(); st.forEach((s, i) => (i ? c.lineTo(X(s.at[0]), Y(s.at[1])) : c.moveTo(X(s.at[0]), Y(s.at[1])))); c.stroke();
  st.forEach((s, si) => {
    c.fillStyle = rgba('shadow', 1); c.beginPath(); c.arc(X(s.at[0]), Y(s.at[1]), 7 * wgt, 0, Math.PI * 2); c.fill();
    c.strokeStyle = ml > 0.5 ? rgba('lamp', 0.9) : rgba('concrete', 0.8); c.lineWidth = 2.5 * wgt; c.stroke();
    if (o.stationLabels !== false && isKnown(s.at[0], s.at[1])) {
      c.font = font(F.mono(600), 13 * wgt); c.letterSpacing = `${1.5 * wgt}px`;
      c.fillStyle = rgba('lamp', 0.85 * (0.5 + 0.5 * ml));
      // alternate below/above the line so neighbouring names don't collide
      c.textAlign = 'center'; c.fillText(s.name, X(s.at[0]), Y(s.at[1]) + (si % 2 ? -16 : 28) * wgt);
      logText('place', s.name, c.globalAlpha >= 0.97, undefined, { id: `map:${s.id}` });
    }
  });
  c.textAlign = 'left'; c.letterSpacing = '0px';
  if (o.districtLabels) {
    c.font = font(F.mono(500), 13 * wgt); c.letterSpacing = `${4 * wgt}px`;
    for (const d of CT.districts) if (d.known) { const r = d.rects[0]!; c.fillStyle = rgba('lamp', 0.5); c.fillText(d.name, X(r[0]) + 8 * wgt, Y(r[3]) + 20 * wgt); }
    c.letterSpacing = '0px';
  }
  if (o.zoneLabel) {
    const r = CT.restricted.rects[0]!;
    c.save(); c.globalAlpha *= o.zoneLabel;
    c.font = font(F.mono(600), 15 * wgt); c.letterSpacing = `${2 * wgt}px`;
    c.fillStyle = rgba('shadow', 0.85);
    const tw = c.measureText(CT.restricted.sign).width;
    const lx = X((r[0] + r[2]) / 2) - tw / 2, ly = Y(r[3]) + 30 * wgt;
    c.fillRect(lx - 8 * wgt, ly - 18 * wgt, tw + 16 * wgt, 26 * wgt);
    c.fillStyle = rgba('neon', 0.95); c.fillText(CT.restricted.sign, lx, ly);
    c.restore();
  }
  if (o.home !== false) {
    const [hx, hy] = CT.home.at, s = 13 * wgt;
    c.strokeStyle = rgba('lamp', 0.95); c.fillStyle = rgba('shadow', 0.9); c.lineWidth = 2.5 * wgt;
    c.beginPath(); c.moveTo(X(hx) - s, Y(hy) + s * 0.8); c.lineTo(X(hx) - s, Y(hy) - s * 0.2); c.lineTo(X(hx), Y(hy) - s); c.lineTo(X(hx) + s, Y(hy) - s * 0.2); c.lineTo(X(hx) + s, Y(hy) + s * 0.8); c.closePath(); c.fill(); c.stroke();
  }
  c.restore();
}

/** Screen position of a map point in a view. */
export const mapPx = (v: MapView, p: XY) => ({ x: v.ox + p[0] * v.s, y: v.oy - p[1] * v.s });
