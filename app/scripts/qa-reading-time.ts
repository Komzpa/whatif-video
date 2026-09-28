#!/usr/bin/env bun
// QA for every draft (docs/TREATMENT.md r5 items 1, 4, 6, 7). Renders the timeline frame by frame in
// headless Chrome, reads every text item each frame drew (window.__video.texts(t), see src/textlog.ts)
// and checks:
//   reading time : each text stays fully visible (reveal finished, not fading, on screen) for at least
//                  max(1.5 s, 0.4 s + characters / 14) per appearance. Karaoke words, the page counter and
//                  props are exempt. In-world signs (kinds 'sign', 'place') must be readable that long at
//                  least once (a pan may glimpse them again briefly). Glyph soup ('garble') is exempt from the
//                  formula but must be on screen ≥ 1.5 s at least once.
//   city names   : every place name on screen exists in data/city.json (kind 'place', and names a scene
//                  declares inside other text), and no other text looks like an invented place name.
//   vertical cut : with --aspect 9:16, karaoke, notes, callouts, WHAT TO DO steps, the counter, chips and
//                  banners stay inside the TikTok safe area (not in the top 150 px, bottom 480 px, right
//                  140 px), and the karaoke cap height is ≥ 70 px.
//   frame checks (r4/r6, every frame):
//     book         : the handbook as a picture (a book object, printed steps, the cover title, printed contents)
//                    is on screen for ≤ --book-max seconds (default 0: TREATMENT r6, no book on screen);
//                    the page counter never appears (r6: no page numbers).
//     overlays     : at most 2 non-diegetic overlays at once, the sung line (karaoke + its note) counting as
//                    one. Overlays: callouts, banners, chips, the map card (labels inside the card belong to it),
//                    the counter, titles, system lines, printed steps.
//     prop cover   : a frame is "covered" when one prop (book, hand with sleeve) covers ≥ 35% of the lower
//                    40% of the frame; covered frames must be ≤ 20% of the window.
//     lyric clear  : the sung line, its note and titles never overlap a sign, board or station name.
// Usage: bun scripts/qa-reading-time.ts [--from 0] [--to 26.4] [--fps 20] [--aspect 9:16] [--url http://localhost:5391]
// Exit code 1 when anything fails; the offenders are listed with their shortfall.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { mojibake, type Codec } from '../src/mojibake';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const APP = path.resolve(import.meta.dir, '..'), ROOT = path.resolve(APP, '..');
const PORTRAIT = opt('aspect', '16:9') === '9:16';
const LW = PORTRAIT ? 1080 : 1920, LH = PORTRAIT ? 1920 : 1080;
const FPS = +opt('fps', '20')!, DT = 1 / FPS;
const NV_EGL = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json';

type Kind = 'drone' | 'karaoke' | 'note' | 'callout' | 'step' | 'system' | 'sign' | 'banner' | 'chip' | 'title' | 'place' | 'garble' | 'counter' | 'prop' | 'book' | 'hand' | 'map';
type Box = { x: number; y: number; w: number; h: number };
interface Item { id: string; text: string; kind: Kind; full: boolean; box?: Box; cap?: number; places?: string[]; poly?: [number, number][]; moji?: ({ src: string; codec: Codec; level: number } | null)[]; bad?: string; clip?: boolean; wristDeg?: number; maybe?: boolean }
const OBJECTS: Kind[] = ['book', 'hand', 'map', 'drone'];

// ------------------------------------------------------------------ city names
const cityFile = [path.join(ROOT, 'data/city.json'), path.join(APP, 'src/data-fallback/city.json')].find(existsSync);
if (!cityFile) { console.error('FAIL: no data/city.json (nor the app fallback)'); process.exit(1); }
const C = JSON.parse(readFileSync(cityFile, 'utf-8'));
const nm = (a: any[] | undefined) => (a ?? []).map((x: any) => x.name);
const NAMES = new Set<string>([
  ...nm(C.districts), ...nm(C.streets), ...nm(C.water), ...nm(C.metro.stations), ...nm(C.places),
  ...(C.metro.lines ?? []).flatMap((l: any) => [l.name, ...nm(l.stations)]),
  C.restricted.name, C.restricted.sign, ...(C.restricted.signs ?? []), C.home.name, C.metro.line, C.metro.lineName,
].filter(Boolean));
// words that make a string look like an invented place name (Russian; «станция» alone is a word in «СТАНЦИЯ ЗАКРЫТА»)
const PLACEY = /(?<!\p{L})(УЛИЦА|УЛ\.|ПРОСПЕКТ|ШОССЕ|ПЛОЩАДЬ|ПЕРЕУЛОК|БУЛЬВАР|РАЙОН|ПОС[ЕЁ]ЛОК|МИКРОРАЙОН|ПРОМЗОНА)(?!\p{L})/iu;

// ------------------------------------------------------------------ browser
async function reachable(url: string) { try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } }
let stopServer = () => {};
let url = opt('url');
if (url) { if (!(await reachable(url))) throw new Error(`--url ${url} is not reachable`); }
else {
  const port = 5300 + Math.floor(Math.random() * 500);
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], { cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, VIDEO_NO_HMR: '1' } });
  url = `http://localhost:${port}`;
  for (let i = 0; i < 100 && !(await reachable(url)); i++) await Bun.sleep(100);
  stopServer = () => proc.kill();
}
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  env: { ...process.env, ...(existsSync(NV_EGL) && !process.env.__EGL_VENDOR_LIBRARY_FILENAMES ? { __EGL_VENDOR_LIBRARY_FILENAMES: NV_EGL } : {}) } as Record<string, string>,
});
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: LW, height: LH } });
  await page.goto(`${url}/?export=1${PORTRAIT ? '&aspect=9:16' : ''}`);
  await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, { timeout: 120000 });
  const err = await page.evaluate(() => (window as any).__video.error);
  if (err) throw new Error(err);
  const duration: number = await page.evaluate(() => (window as any).__video.duration);
  const from = +opt('from', '0')!, to = Math.min(duration, +opt('to', String(duration))!);
  const times: number[] = [];
  for (let n = Math.round(from * FPS); n / FPS < to - 1e-9; n++) times.push(n / FPS);
  // frames in batches (fewer round trips)
  const frames: Item[][] = [];
  for (let i = 0; i < times.length; i += 40) {
    const batch = times.slice(i, i + 40);
    frames.push(...await page.evaluate((ts) => ts.map((t: number) => (window as any).__video.texts(t)), batch));
  }

  // maybe-translations flicker by design (TREATMENT r8 note 4): bridge their dropouts ≤ 0.45 s for reading time
  {
    const gap = Math.round(0.45 * FPS), lastFull = new Map<string, number>();
    frames.forEach((fr, i) => {
      for (const it of fr) {
        if (!it.maybe || !it.full) continue;
        const j = lastFull.get(it.id);
        if (j !== undefined && i - j > 1 && i - j <= gap + 1) for (let k = j + 1; k < i; k++) {
          const f = frames[k]!, cur = f.find((x) => x.id === it.id);
          if (cur) cur.full = true; else f.push({ ...it });
        }
        lastFull.set(it.id, i);
      }
    });
  }
  // --debug <text>: print, per frame, whether items matching the text were drawn and fully visible
  const dbg = opt('debug');
  if (dbg) frames.forEach((fr, i) => { const m = fr.filter((x) => x.text.includes(dbg)); if (m.length) console.log(times[i]!.toFixed(2), m.map((x) => `${x.id}:${x.full ? "FULL" : "part"}${x.box ? ` [${Math.round(x.box.x)},${Math.round(x.box.y)} ${Math.round(x.box.w)}x${Math.round(x.box.h)}]` : ""}`).join(' ')); });
  // ---------------------------------------------------------------- intervals of full visibility
  interface Run { a: number; b: number; openA: boolean; openB: boolean }
  const runs = new Map<string, { item: Item; runs: Run[] }>();
  const on = new Map<string, number>(); // id -> run start index
  const seenAt = (i: number) => new Set(frames[i]!.filter((x) => x.full).map((x) => x.id));
  const last = frames.length - 1;
  const openEnd = to < duration - 1e-6;
  frames.forEach((fr, i) => {
    const full = new Map(fr.filter((x) => x.full).map((x) => [x.id, x] as const));
    for (const [id, it] of full) {
      if (!runs.has(id)) runs.set(id, { item: it, runs: [] });
      if (!on.has(id)) on.set(id, i);
    }
    for (const [id, s] of [...on]) {
      const ends = !full.has(id) || i === last;
      if (!ends) continue;
      const e = full.has(id) ? i : i - 1;
      runs.get(id)!.runs.push({ a: times[s]!, b: times[e]! + DT, openA: s === 0 && from > 0, openB: e === last && openEnd });
      on.delete(id);
    }
  });
  void seenAt;
  // --garble-list: every glyph-soup item with its longest fully visible run (for the proof sheet of garbled signs)
  if (argv.includes('--garble-list')) for (const [id, { item, runs: rs }] of runs) {
    if (item.kind !== 'garble' || !rs.length) continue;
    const best = rs.reduce((x, y) => (y.b - y.a > x.b - x.a ? y : x));
    console.log(`GARBLE ${id}\t${((best.a + best.b) / 2).toFixed(2)}\t${best.a.toFixed(2)}-${best.b.toFixed(2)}\t${(best.b - best.a).toFixed(2)}s\t${JSON.stringify(item.text)}`);
  }
  const need = (text: string) => { const t = text.replace(/ \/ /g, ' '); return Math.max(1.5, 0.4 + t.length / 14, 0.3 * t.split(/\s+/).filter(Boolean).length); };
  const offenders: string[] = [];
  const UI: Kind[] = ['note', 'callout', 'step', 'system', 'banner', 'chip', 'title'];
  for (const [id, { item, runs: rs }] of runs) {
    const k = item.kind;
    if (k === 'karaoke' || k === 'counter' || k === 'prop' || OBJECTS.includes(k)) continue;
    if (id.startsWith('scenery:')) continue; // a background sign glimpsed in a pan: A4/A13 still apply, reading time does not
    if (UI.includes(k)) {
      for (const r of rs) {
        if (r.openA || r.openB) continue;
        const d = r.b - r.a, n = need(item.text);
        if (d + 1e-6 < n) offenders.push(`reading  ${k.padEnd(7)} ${JSON.stringify(item.text)}  ${r.a.toFixed(2)}–${r.b.toFixed(2)}s  visible ${d.toFixed(2)}s < ${n.toFixed(2)}s  (short ${(n - d).toFixed(2)}s)`);
      }
    } else {
      const best = rs.reduce((m, r) => Math.max(m, r.b - r.a), 0);
      const anyOpen = rs.some((r) => r.openA || r.openB);
      const n = k === 'garble' ? 1.5 : need(item.text);
      if (best + 1e-6 < n && !anyOpen) offenders.push(`reading  ${k.padEnd(7)} ${JSON.stringify(item.text)}  longest ${best.toFixed(2)}s < ${n.toFixed(2)}s  (short ${(n - best).toFixed(2)}s)`);
    }
    void id;
  }

  // UI text that was drawn but never became fully visible (cut off, off screen, or faded out mid-reveal)
  const drawn = new Map<string, Item>();
  for (const fr of frames) for (const it of fr) if (!drawn.has(it.id)) drawn.set(it.id, it);
  for (const [id, it] of drawn) if (UI.includes(it.kind) && !runs.has(id)) offenders.push(`reading  ${it.kind.padEnd(7)} ${JSON.stringify(it.text)}  drawn but never fully visible`);

  // ---------------------------------------------------------------- city names
  const nameBad = new Map<string, string>();
  for (const fr of frames) for (const it of fr) {
    if (it.kind === 'garble' || it.kind === 'prop' || it.kind === 'karaoke' || it.kind === 'counter' || OBJECTS.includes(it.kind)) continue;
    if (it.kind === 'place' && !NAMES.has(it.text)) nameBad.set(it.text, `place not in city.json: ${JSON.stringify(it.text)}`);
    for (const p of it.places ?? []) if (!NAMES.has(p)) nameBad.set(p, `declared place not in city.json: ${JSON.stringify(p)} (in ${JSON.stringify(it.text)})`);
    if (PLACEY.test(it.text) && ![...NAMES].some((n) => it.text.includes(n))) nameBad.set(it.text, `looks like a place name but no city.json name in it: ${JSON.stringify(it.text)}`);
  }
  offenders.push(...[...nameBad.values()].map((s) => `city     ${s}`));

  // ---------------------------------------------------------------- vertical safe area
  if (PORTRAIT) {
    const SAFE_KINDS: Kind[] = ['karaoke', 'note', 'callout', 'step', 'counter', 'chip', 'banner'];
    const x1 = LW - 140, y0 = 150, y1 = LH - 480;
    const worst = new Map<string, string>();
    frames.forEach((fr, i) => {
      for (const it of fr) {
        if (!it.full || !it.box || !SAFE_KINDS.includes(it.kind)) continue;
        const b = it.box, out: string[] = [];
        if (b.x < -0.5) out.push(`left ${(-b.x).toFixed(0)}px`);
        if (b.x + b.w > x1 + 0.5) out.push(`right +${(b.x + b.w - x1).toFixed(0)}px`);
        if (b.y < y0 - 0.5) out.push(`top +${(y0 - b.y).toFixed(0)}px`);
        if (b.y + b.h > y1 + 0.5) out.push(`bottom +${(b.y + b.h - y1).toFixed(0)}px`);
        if (out.length && !worst.has(it.id)) worst.set(it.id, `safe     ${it.kind.padEnd(7)} ${JSON.stringify(it.text)} at ${times[i]!.toFixed(2)}s: ${out.join(', ')}`);
        if (it.kind === 'karaoke' && it.cap !== undefined && it.cap < 70 && !worst.has(`cap:${it.id}`)) worst.set(`cap:${it.id}`, `safe     karaoke ${JSON.stringify(it.text)} cap height ${it.cap.toFixed(0)}px < 70px`);
      }
    });
    offenders.push(...worst.values());
  }


  // ---------------------------------------------------------------- frame checks (r4 / r6)
  const bookMax = +opt('book-max', '0')!;
  const isBook = (it: Item) => it.kind === 'book' || it.kind === 'step' || it.kind === 'title' || it.kind === 'prop';
  const bookFrames = frames.filter((fr) => fr.some(isBook)).length;
  const bookSec = bookFrames * DT;
  if (bookSec > bookMax + 1e-6) {
    const first = times[frames.findIndex((fr) => fr.some(isBook))]!;
    offenders.push(`book     the handbook is on screen ${bookSec.toFixed(2)}s > ${bookMax.toFixed(2)}s (first at ${first.toFixed(2)}s)`);
  }
  const counterFrames = frames.filter((fr) => fr.some((it) => it.kind === 'counter')).length;
  if (counterFrames) offenders.push(`book     the page counter is on screen ${(counterFrames * DT).toFixed(2)}s (r6: no page numbers)`);
  // A6: no drone on screen (TREATMENT r5 item 8); scripts/qa-drone.ts checks the scene code statically
  const droneFrames = frames.filter((fr) => fr.some((it) => it.kind === 'drone')).length;
  if (droneFrames) offenders.push(`A6       a drone is drawn in ${droneFrames} frames (first at ${times[frames.findIndex((fr) => fr.some((it) => it.kind === 'drone'))]!.toFixed(2)}s)`);
  // overlays
  const OVERLAY: Kind[] = ['callout', 'banner', 'chip', 'counter', 'map', 'title', 'system', 'step'];
  const inside = (b: Box, m: Box) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx >= m.x && cx <= m.x + m.w && cy >= m.y && cy <= m.y + m.h; };
  let maxOv = 0, maxAt = 0, overFrames = 0;
  const overAt: string[] = [];
  frames.forEach((fr, i) => {
    const maps = fr.filter((it) => it.kind === 'map' && it.box).map((it) => it.box!);
    const ov = fr.filter((it) => OVERLAY.includes(it.kind) && !(it.kind !== 'map' && it.box && maps.some((m) => inside(it.box!, m))));
    const ids = new Set(ov.map((it) => it.id));
    const n = ids.size + (fr.some((it) => it.kind === 'karaoke' || it.kind === 'note') ? 1 : 0);
    if (n > maxOv) { maxOv = n; maxAt = times[i]!; }
    if (n > 2) { overFrames++; if (overAt.length < 4) overAt.push(`${times[i]!.toFixed(2)}s [${[...ids].join(' | ')}]`); }
  });
  if (maxOv > 2) offenders.push(`overlay  up to ${maxOv} overlays at once incl. the sung line (max 2) for ${(overFrames * DT).toFixed(2)}s, e.g. ${overAt.join('; ')}`);
  // prop coverage of the lower 40% of the frame
  const bandY = LH * 0.6, bandA = LW * (LH - bandY);
  const hull = (pts: [number, number][]) => {
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
    const lo: [number, number][] = [], up: [number, number][] = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
    for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop(); up.push(q); }
    return [...lo.slice(0, -1), ...up.slice(0, -1)];
  };
  const clipTo = (poly: [number, number][], inside: (q: [number, number]) => boolean, cut: (a: [number, number], b: [number, number]) => [number, number]) => {
    const out: [number, number][] = [];
    poly.forEach((cur, i) => {
      const prev = poly[(i + poly.length - 1) % poly.length]!;
      if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(cut(prev, cur));
    });
    return out;
  };
  const cutX = (x: number) => (a: [number, number], b: [number, number]): [number, number] => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])];
  const cutY = (y: number) => (a: [number, number], b: [number, number]): [number, number] => [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y];
  const bandCover = (it: Item) => {
    const b = it.box;
    let p: [number, number][] = it.poly ?? (b ? [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] : []);
    if (p.length < 3) return 0;
    p = hull(p);
    p = clipTo(p, (q) => q[1] >= bandY, cutY(bandY));
    p = clipTo(p, (q) => q[1] <= LH, cutY(LH));
    p = clipTo(p, (q) => q[0] >= 0, cutX(0));
    p = clipTo(p, (q) => q[0] <= LW, cutX(LW));
    let a = 0;
    p.forEach((q, i) => { const r = p[(i + 1) % p.length]!; a += q[0] * r[1] - r[0] * q[1]; });
    return Math.abs(a) / 2 / bandA;
  };
  let covered = 0, worstCover = 0;
  for (const fr of frames) {
    const c = Math.max(0, ...fr.filter((it) => it.kind === 'book' || it.kind === 'hand').map(bandCover));
    worstCover = Math.max(worstCover, c);
    if (c >= 0.35) covered++;
  }
  const coverFrac = frames.length ? covered / frames.length : 0;
  if (coverFrac > 0.2) offenders.push(`cover    one prop covers ≥35% of the lower 40% of the frame in ${(coverFrac * 100).toFixed(0)}% of frames (max 20%)`);
  // the sung line and titles vs signs and boards
  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const clash = new Map<string, string>();
  frames.forEach((fr, i) => {
    const lyr = fr.filter((it) => (it.kind === 'karaoke' || it.kind === 'note' || it.kind === 'title') && it.box);
    const sg = fr.filter((it) => (it.kind === 'sign' || it.kind === 'garble' || it.kind === 'place') && it.box);
    for (const a of lyr) for (const b of sg) if (overlap(a.box!, b.box!) > 4 && !clash.has(a.id + b.id)) clash.set(a.id + b.id, `${times[i]!.toFixed(2)}s ${JSON.stringify(a.text)} over ${b.kind} ${JSON.stringify(b.text)}`);
  });
  offenders.push(...[...clash.values()].slice(0, 12).map((s) => `clear    the sung line overlaps a sign: ${s}`));
  if (clash.size > 12) offenders.push(`clear    … and ${clash.size - 12} more`);
  // A4: text boxes (callouts, banners, chips, notes, the sung line, titles, the map card) never intersect a sign,
  // a board or each other. Labels inside the map card belong to the card.
  const TEXTBOX: Kind[] = ['callout', 'banner', 'chip', 'note', 'karaoke', 'title', 'system', 'step', 'map'];
  const a4 = new Map<string, string>();
  frames.forEach((fr, i) => {
    const maps = fr.filter((it) => it.kind === 'map' && it.box).map((it) => it.box!);
    const inMap = (it: Item) => it.kind !== 'map' && !!it.box && maps.some((m) => inside(it.box!, m));
    const tb = fr.filter((it) => TEXTBOX.includes(it.kind) && it.box && it.full);
    const sg = fr.filter((it) => (it.kind === 'sign' || it.kind === 'garble' || it.kind === 'place') && it.box && it.full);
    for (const a of tb) {
      if (!inMap(a)) for (const b of sg) if (overlap(a.box!, b.box!) > 4) { const k = `${a.id}|${b.id}`; if (!a4.has(k)) a4.set(k, `${times[i]!.toFixed(2)}s ${a.kind} ${JSON.stringify(a.text)} × ${b.kind} ${JSON.stringify(b.text)}`); }
      for (const b of tb) {
        if (b === a || a.id >= b.id) continue;
        if (a.kind === 'map' && inMap(b) || b.kind === 'map' && inMap(a) || inMap(a) && inMap(b)) continue;
        if (overlap(a.box!, b.box!) > 4) { const k = `${a.id}|${b.id}`; if (!a4.has(k)) a4.set(k, `${times[i]!.toFixed(2)}s ${a.kind} ${JSON.stringify(a.text)} × ${b.kind} ${JSON.stringify(b.text)}`); }
      }
    }
  });
  offenders.push(...[...a4.values()].slice(0, 12).map((s) => `A4       text boxes intersect: ${s}`));
  if (a4.size > 12) offenders.push(`A4       … and ${a4.size - 12} more`);
  // A5: HOME · x km only decreases along the timeline
  let lastKm = Infinity, kmBad = '';
  frames.forEach((fr, i) => { for (const it of fr) { const m = /ДОМ · (\d+(?:,\d+)?) км/.exec(it.text); if (!m) continue; const km = +m[1]!.replace(',', '.'); if (km > lastKm + 1e-9 && !kmBad) kmBad = `${times[i]!.toFixed(2)}s ДОМ ${km} км after ${lastKm} км`; lastKm = Math.min(lastKm, km); } });
  if (kmBad) offenders.push(`A5       HOME distance increases: ${kmBad}`);
  // A12: the line diagram's own layout check (labels vs dots, the line, the header and the edge)
  const a12 = new Map<string, string>();
  frames.forEach((fr, i) => { for (const it of fr) if (it.bad && !a12.has(it.id)) a12.set(it.id, `${times[i]!.toFixed(2)}s ${JSON.stringify(it.text)}: ${it.bad}`); });
  offenders.push(...[...a12.values()].map((s) => `A12      ${s}`));
  // A13: Latin letters and box-drawing glyphs appear only in glyph soup (TREATMENT item 6 + r8): every 'garble'
  // item must re-derive from a Russian source by its logged codec; everything else on screen stays Cyrillic
  const a13 = new Map<string, string>();
  const LATIN = /[A-Za-z\u00C0-\u024F]/, BOXDRAW = /[\u2500-\u259F]/;
  for (const fr of frames) for (const it of fr) {
    if (OBJECTS.includes(it.kind) || it.kind === 'prop' || a13.has(it.text)) continue;
    if (it.kind === 'garble') {
      const parts = it.text.split(' / ');
      const ok = parts.every((p, k) => { const m = it.moji?.[k]; return !!m && /[А-яЁё]/.test(m.src) && mojibake(m.src, m.codec, m.level) === p; });
      if (!ok) a13.set(it.text, `garble ${JSON.stringify(it.text)} is not a codec transform of a logged Russian source`);
      continue;
    }
    if (LATIN.test(it.text)) { a13.set(it.text, `${it.kind} ${JSON.stringify(it.text)} has Latin letters outside glyph soup`); continue; }
    if (BOXDRAW.test(it.text)) { a13.set(it.text, `${it.kind} ${JSON.stringify(it.text)} has box-drawing glyphs outside glyph soup`); continue; }
  }
  offenders.push(...[...a13.values()].slice(0, 12).map((s) => `A13      ${s}`));
  if (a13.size > 12) offenders.push(`A13      … and ${a13.size - 12} more`);
  // B1: the torch hand with its sleeve stays within 25% of the frame
  const polyArea = (pts: [number, number][]) => { const p = hull(pts); let a = 0; p.forEach((q, i) => { const r = p[(i + 1) % p.length]!; a += q[0] * r[1] - r[0] * q[1]; }); return Math.abs(a) / 2; };
  let handMax = 0, handAt = 0;
  frames.forEach((fr, i) => { for (const it of fr) if (it.kind === 'hand' && it.poly && it.poly.length > 2) { const clipped = [clipTo, clipTo, clipTo, clipTo].reduce((p, f, k) => f(p, [(q: [number, number]) => q[1] >= 0, (q: [number, number]) => q[1] <= LH, (q: [number, number]) => q[0] >= 0, (q: [number, number]) => q[0] <= LW][k]!, [cutY(0), cutY(LH), cutX(0), cutX(LW)][k]!), hull(it.poly)); const a = clipped.length > 2 ? polyArea(clipped) / (LW * LH) : 0; if (a > handMax) { handMax = a; handAt = times[i]!; } } });
  // B7: the torch follows the forearm: the angle between the forearm (cuff → heel) and the torch axis stays ≤ 30°
  // on every first-person frame (a torch at 90° to the arm reads as a broken wrist)
  let wristMax = 0, wristAt = 0;
  frames.forEach((fr, i) => { for (const it of fr) if (it.kind === 'hand' && typeof it.wristDeg === 'number' && it.wristDeg > wristMax) { wristMax = it.wristDeg; wristAt = times[i]!; } });
  if (wristMax > 30) offenders.push(`B7       the torch bends ${wristMax.toFixed(0)}° off the forearm at ${wristAt.toFixed(2)}s (max 30°): a broken wrist`);
  if (handMax > 0.25) offenders.push(`B1       a hand with its sleeve covers ${(handMax * 100).toFixed(0)}% of the frame at ${handAt.toFixed(2)}s (max 25%)`);
  // C1: readable text is never cut by the frame edge or by scene geometry for longer than a pan's or a moving
  // train's crossing (0.5 s)
  const CUTK: Kind[] = ['sign', 'garble', 'place', 'callout', 'banner', 'chip', 'note', 'karaoke', 'title'];
  const cutRun = new Map<string, number>(), cutBad = new Map<string, string>();
  frames.forEach((fr, i) => {
    const now = new Set<string>();
    for (const it of fr) {
      if (!CUTK.includes(it.kind) || !it.box) continue;
      const b = it.box, on = b.x + b.w > 0 && b.x < LW && b.y + b.h > 0 && b.y < LH;
      const inside = b.x >= -1 && b.y >= -1 && b.x + b.w <= LW + 1 && b.y + b.h <= LH + 1;
      if (!it.clip && (!on || inside || b.h < 14)) continue;
      now.add(it.id);
      const n = (cutRun.get(it.id) ?? 0) + 1; cutRun.set(it.id, n);
      if (n * DT > 0.5 + 1e-6 && !cutBad.has(it.id)) cutBad.set(it.id, `${it.kind} ${JSON.stringify(it.text)} cut by ${it.clip ? 'scene geometry' : 'the frame edge'} for > 0.5 s (from ${(times[i]! - (n - 1) * DT).toFixed(2)}s)`);
    }
    for (const id of [...cutRun.keys()]) if (!now.has(id)) cutRun.delete(id);
  });
  offenders.push(...[...cutBad.values()].slice(0, 12).map((s) => `C1       ${s}`));
  const frameLine = `frame checks: A4 intersections ${a4.size} · A12 board faults ${a12.size} · A13 Latin/moji ${a13.size} · A5 ${kmBad ? 'FAIL' : 'ok'} · B1 hand ≤ ${(handMax * 100).toFixed(0)}% · B7 wrist ≤ ${wristMax.toFixed(0)}° · C1 cut ${cutBad.size} · `
    + `A6 drone ${(droneFrames * DT).toFixed(2)}s · book ${bookSec.toFixed(2)}s · counter ${(counterFrames * DT).toFixed(2)}s · max overlays ${maxOv} (at ${maxAt.toFixed(2)}s) · lower-40% covered in ${(coverFrac * 100).toFixed(1)}% of frames (worst ${(worstCover * 100).toFixed(0)}%) · sung-line/sign overlaps ${clash.size}`;
  const kinds = new Map<string, number>();
  for (const { item } of runs.values()) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
  console.log(`qa-reading-time ${PORTRAIT ? '9:16' : '16:9'}  ${from.toFixed(2)}–${to.toFixed(2)}s  ${frames.length} frames @ ${FPS} fps  city: ${path.relative(ROOT, cityFile)}`);
  console.log(`text items: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(frameLine);
  if (offenders.length) { failed = true; console.log(`FAIL (${offenders.length})`); for (const o of offenders) console.log('  ' + o); }
  else console.log('PASS');
} finally {
  await browser.close();
  stopServer();
}
process.exit(failed ? 1 : 0);
