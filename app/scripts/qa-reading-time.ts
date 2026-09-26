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
// Usage: bun scripts/qa-reading-time.ts [--from 0] [--to 26.4] [--fps 20] [--aspect 9:16] [--url http://localhost:5391]
// Exit code 1 when anything fails; the offenders are listed with their shortfall.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const APP = path.resolve(import.meta.dir, '..'), ROOT = path.resolve(APP, '..');
const PORTRAIT = opt('aspect', '16:9') === '9:16';
const LW = PORTRAIT ? 1080 : 1920, LH = PORTRAIT ? 1920 : 1080;
const FPS = +opt('fps', '20')!, DT = 1 / FPS;
const NV_EGL = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json';

type Kind = 'karaoke' | 'note' | 'callout' | 'step' | 'system' | 'sign' | 'banner' | 'chip' | 'title' | 'place' | 'garble' | 'counter' | 'prop';
interface Item { id: string; text: string; kind: Kind; full: boolean; box?: { x: number; y: number; w: number; h: number }; cap?: number; places?: string[] }

// ------------------------------------------------------------------ city names
const cityFile = [path.join(ROOT, 'data/city.json'), path.join(APP, 'src/data-fallback/city.json')].find(existsSync);
if (!cityFile) { console.error('FAIL: no data/city.json (nor the app fallback)'); process.exit(1); }
const C = JSON.parse(readFileSync(cityFile, 'utf-8'));
const NAMES = new Set<string>([
  ...C.districts.map((d: any) => d.name), ...C.water.map((w: any) => w.name), ...C.metro.stations.map((s: any) => s.name),
  ...C.places.map((p: any) => p.name), C.restricted.name, C.restricted.sign, C.home.name, C.metro.line,
]);
const PLACEY = /\b(ST|RD|ROW|SQ|AVE|LANE|BRIDGE|YARDS?|MARKET|DEPOT|DISTRICT \d+|QUARTER|HILL|DOCKS?)\b/;

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
  const need = (text: string) => Math.max(1.5, 0.4 + text.replace(/ \/ /g, ' ').length / 14);
  const offenders: string[] = [];
  const UI: Kind[] = ['note', 'callout', 'step', 'system', 'banner', 'chip', 'title'];
  for (const [id, { item, runs: rs }] of runs) {
    const k = item.kind;
    if (k === 'karaoke' || k === 'counter' || k === 'prop') continue;
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
    if (it.kind === 'garble' || it.kind === 'prop' || it.kind === 'karaoke' || it.kind === 'counter') continue;
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

  const kinds = new Map<string, number>();
  for (const { item } of runs.values()) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
  console.log(`qa-reading-time ${PORTRAIT ? '9:16' : '16:9'}  ${from.toFixed(2)}–${to.toFixed(2)}s  ${frames.length} frames @ ${FPS} fps  city: ${path.relative(ROOT, cityFile)}`);
  console.log(`text items: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  if (offenders.length) { failed = true; console.log(`FAIL (${offenders.length})`); for (const o of offenders) console.log('  ' + o); }
  else console.log('PASS');
} finally {
  await browser.close();
  stopServer();
}
process.exit(failed ? 1 : 0);
