#!/usr/bin/env bun
// QA (TREATMENT r9 note 4, TESTPLAN A15): text never covers the beat's main subject. Renders the timeline frame by
// frame in headless Chrome (window.__video.texts(t), src/textlog.ts) and reads, per frame:
//   subjects : every living body the scene shows (the child, the stranger, people, dogs, cats), as the screen box
//              of its polygonised skin through the scene camera (CityScene.logFrame, SdfBody.screenBox), and the
//              child's own POV hands (torch hand, free hand: kind 'hand'), measured on their outline polygon;
//   overlays : the callouts (label box), the sung line and its heading, chips, banners, system lines, steps,
//              titles, the map card, and the kids' speech balloons in `tease`.
// A frame fails when an overlay box covers ≥ --min-frac (default 4%) of a subject's on-screen box and ≥ 100 px²;
// an offender is a (overlay, subject) pair that fails on ≥ 2 sampled frames. Subjects smaller than 600 px² on
// screen are ignored (a speck in the distance is not the beat's subject).
// Usage: bun scripts/qa-overlap.ts [--from 0] [--to <end>] [--fps 10] [--aspect 9:16] [--url ...] [--list]
// Exit code 1 when anything fails; each offender is listed with its time span and worst frame.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const APP = path.resolve(import.meta.dir, '..');
const PORTRAIT = opt('aspect', '16:9') === '9:16';
const LW = PORTRAIT ? 1080 : 1920, LH = PORTRAIT ? 1920 : 1080;
const FPS = +opt('fps', '10')!;
const MIN_FRAC = +opt('min-frac', '0.04')!;
const NV_EGL = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json';

type Box = { x: number; y: number; w: number; h: number };
interface Item { id: string; text: string; kind: string; full: boolean; box?: Box; poly?: [number, number][] }
const OVERLAY = ['karaoke', 'note', 'callout', 'chip', 'banner', 'system', 'step', 'title', 'map'];
const isOverlay = (it: Item) => OVERLAY.includes(it.kind) || /^garble:tease-say/.test(it.id);

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
  // a fresh vite server can drop the first navigation while it pre-bundles: retry before calling it broken
  for (let k = 0; ; k++) { try { await page.goto(`${url}/?export=1${PORTRAIT ? '&aspect=9:16' : ''}`, { timeout: 120000 }); break; } catch (e) { if (k >= 3) throw e; await Bun.sleep(2000); } }
  await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, { timeout: 120000 });
  const err = await page.evaluate(() => (window as any).__video.error);
  if (err) throw new Error(err);
  const duration: number = await page.evaluate(() => (window as any).__video.duration);
  const from = +opt('from', '0')!, to = Math.min(duration, +opt('to', String(duration))!);
  const times: number[] = [];
  for (let n = Math.round(from * FPS); n / FPS < to - 1e-9; n++) times.push(n / FPS);
  const frames: Item[][] = [];
  for (let i = 0; i < times.length; i += 40) {
    const batch = times.slice(i, i + 40);
    frames.push(...await page.evaluate((ts) => ts.map((t: number) => { const all = (window as any).__video.texts(t); const cam = all.find((it: any) => it.kind === 'cam'); return all.filter((it: any) => it.box && it.kind !== 'cam').map((it: any) => it.kind === 'hand' ? { ...it, id: `${it.id}:${cam?.text ?? '?'}`, text: it.text } : it); }), batch));
  }
  const clip = (b: Box): Box => { const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(LW, b.x + b.w), y1 = Math.min(LH, b.y + b.h); return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }; };
  const inter = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  // a POV hand is measured on its outline: the polygon clipped to a box (Sutherland–Hodgman), then its area
  const polyArea = (q: [number, number][]) => { let a = 0; for (let i = 0; i < q.length; i++) { const [x0, y0] = q[i]!, [x1, y1] = q[(i + 1) % q.length]!; a += x0 * y1 - x1 * y0; } return Math.abs(a) / 2; };
  const clipPoly = (q: [number, number][], b: Box) => {
    const edges: [(p: [number, number]) => number][] = [[(p) => p[0] - b.x], [(p) => b.x + b.w - p[0]], [(p) => p[1] - b.y], [(p) => b.y + b.h - p[1]]];
    let out = q;
    for (const [f] of edges) {
      const inp = out; out = [];
      for (let i = 0; i < inp.length; i++) {
        const P = inp[i]!, Q = inp[(i + 1) % inp.length]!, fp = f(P), fq = f(Q);
        if (fp >= 0) out.push(P);
        if ((fp >= 0) !== (fq >= 0)) { const u = fp / (fp - fq); out.push([P[0] + u * (Q[0] - P[0]), P[1] + u * (Q[1] - P[1])]); }
      }
      if (!out.length) break;
    }
    return out;
  };
  const SCREEN: Box = { x: 0, y: 0, w: LW, h: LH };
  interface Hit { n: number; a: number; b: number; worst: number; worstT: number; text: string; subj: string }
  const hits = new Map<string, Hit>();
  let subjFrames = 0, ovFrames = 0;
  frames.forEach((fr, i) => {
    const subs = fr.filter((it) => it.kind === 'subject' || (it.kind === 'hand' && !!it.poly && it.poly.length > 2)).map((it) => {
      const b = clip(it.box!);
      if (it.kind !== 'hand') return { it, b, area: b.w * b.h, cover: (o: Box) => inter(clip(o), b) };
      const q = it.poly as [number, number][];
      return { it, b, area: polyArea(clipPoly(q, SCREEN)), cover: (o: Box) => polyArea(clipPoly(q, clip(o))) };
    }).filter((s) => s.area >= 600);
    const ovs = fr.filter(isOverlay);
    if (subs.length) subjFrames++;
    if (ovs.length) ovFrames++;
    for (const s of subs) for (const o of ovs) {
      const a = s.cover(o.box!), frac = a / s.area;
      if (a < 100 || frac < MIN_FRAC) continue;
      const chap = s.it.kind === 'hand' ? s.it.id.split(':')[2] : s.it.id.split(':')[1];
      const k = `${chap}|${o.id}|${s.it.id}`;
      const h = hits.get(k) ?? { n: 0, a: times[i]!, b: times[i]!, worst: 0, worstT: times[i]!, text: o.text, subj: `${s.it.text} (${chap})` };
      h.n++; h.b = times[i]! + 1 / FPS;
      if (frac > h.worst) { h.worst = frac; h.worstT = times[i]!; }
      hits.set(k, h);
    }
  });
  const bad = [...hits.entries()].filter(([, h]) => h.n >= 2).sort((x, y) => x[1].a - y[1].a);
  console.log(`qa-overlap ${PORTRAIT ? '9:16' : '16:9'}  ${from.toFixed(2)}–${to.toFixed(2)}s  ${frames.length} frames @ ${FPS} fps  (subjects in ${subjFrames} frames, overlays in ${ovFrames})`);
  // a probe that saw nothing is broken, not clean (a wrong server, a scene that failed to load)
  if (!ovFrames) bad.push(['probe', { n: 0, a: from, b: to, worst: 0, worstT: from, text: '(no overlay text logged at all: the probe is broken)', subj: 'frame' }]);
  if (argv.includes('--list')) for (const [k, h] of bad) console.log(`OVERLAP\t${h.worstT.toFixed(2)}\t${k}`);
  if (bad.length) {
    failed = true;
    console.log(`FAIL (${bad.length})`);
    for (const [, h] of bad) console.log(`  A15      ${JSON.stringify(h.text)} covers the ${h.subj} ${h.a.toFixed(2)}–${h.b.toFixed(2)}s on ${h.n} frames, worst ${(h.worst * 100).toFixed(0)}% of it at ${h.worstT.toFixed(2)}s`);
  } else console.log('PASS');
} finally {
  await browser.close();
  stopServer();
}
process.exit(failed ? 1 : 0);
