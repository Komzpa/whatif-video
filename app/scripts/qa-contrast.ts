#!/usr/bin/env bun
// TESTPLAN A9: WCAG contrast of every readable text against its local background, measured on the rendered
// pixels. Each sampled frame is rendered through `__video.texts(t)` (the text log says what was drawn where)
// and read back from the GPU; for every fully visible readable item:
//   - text that logs its inks (the chapter line: sung / front letter / unsung runs, each with its box and fill
//     colour) is measured ink by ink: the fill colour against the median of the run box's pixels that are not
//     that ink (the plate and whatever shows through it);
//   - any other text (callouts, signs, plates, the notice, the wall map) is split by Otsu's threshold on
//     luminance inside its box: the minority class is the lettering; its ink is that class's extreme fifth
//     (stroke cores, not anti-aliased or bloomed edges) against the majority class's median.
// Pass: >= 4.5:1, or >= 3:1 for text >= 48 px. Background signs logged as `scenery:` (glimpsed in a pan, not
// meant to be read) are listed but do not fail. Each item reports its worst sampled frame.
// Usage: bun scripts/qa-contrast.ts [--from 0] [--to 26.2] [--fps 4] [--aspect 9:16] [--url http://localhost:5391]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const APP = path.resolve(import.meta.dir, '..');
const PORTRAIT = opt('aspect', '16:9') === '9:16';
const LW = PORTRAIT ? 1080 : 1920, LH = PORTRAIT ? 1920 : 1080;
const FPS = +opt('fps', '4')!;
const NV_EGL = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json';
const READ = ['karaoke', 'note', 'callout', 'step', 'system', 'sign', 'banner', 'chip', 'title', 'place', 'garble'];

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
interface M { id: string; kind: string; text: string; t: number; ratio: number; need: number; how: string }
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
  const all: M[] = [];
  for (const t of times) {
    const ms: M[] = await page.evaluate(async ({ t, READ }) => {
      const V = (window as any).__video;
      const items = V.texts(t);
      const W = V.width, H = V.height, sc = V.scale ?? 1;
      const px: Uint8Array = await V.engine.readPixelsAsync();
      const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const LUT = new Float32Array(256).map((_, i) => lin(i));
      const lum = (r: number, g: number, b: number) => 0.2126 * LUT[r]! + 0.7152 * LUT[g]! + 0.0722 * LUT[b]!;
      const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const median = (a: number[]) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]!; };
      const parse = (css: string) => { const m = css.match(/[\d.]+/g)!.map(Number); return [m[0]!, m[1]!, m[2]!, m[3] ?? 1] as const; };
      // pixels (r,g,b) inside a logical-px box, top-down, clipped to the frame
      const pixels = (b: { x: number; y: number; w: number; h: number }, pad = 0) => {
        const x0 = Math.max(0, Math.floor((b.x - pad) * sc)), x1 = Math.min(W, Math.ceil((b.x + b.w + pad) * sc));
        const y0 = Math.max(0, Math.floor((b.y - pad) * sc)), y1 = Math.min(H, Math.ceil((b.y + b.h + pad) * sc));
        const out: [number, number, number][] = [];
        const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 40000)));
        for (let y = y0; y < y1; y += step) { const row = (H - 1 - y) * W * 4; for (let x = x0; x < x1; x += step) { const i = row + x * 4; out.push([px[i]!, px[i + 1]!, px[i + 2]!]); } }
        return out;
      };
      const res: any[] = [];
      for (const it of items) {
        if (!it.full || !it.box || !READ.includes(it.kind)) continue;
        if (it.box.w < 2 || it.box.h < 2) continue;
        if (it.ink?.length) {
          const inks = it.ink.map((k: any) => parse(k.fg));
          for (const k of it.ink) {
            const [r, g, b, a] = parse(k.fg);
            const ps = pixels(k.box, 4);
            // background: pixels far from every ink of this item
            const bgp = ps.filter((p) => inks.every((q: readonly number[]) => Math.hypot(p[0] - q[0]!, p[1] - q[1]!, p[2] - q[2]!) > 70));
            if (bgp.length < 8) continue;
            const bgR = median(bgp.map((p) => p[0])), bgG = median(bgp.map((p) => p[1])), bgB = median(bgp.map((p) => p[2]));
            // a translucent ink shows the background through it
            const fr = Math.round(r * a + bgR * (1 - a)), fgc = Math.round(g * a + bgG * (1 - a)), fb = Math.round(b * a + bgB * (1 - a));
            res.push({ id: it.id, kind: it.kind, text: it.text, t, ratio: ratio(lum(fr, fgc, fb), median(bgp.map((p) => lum(p[0], p[1], p[2])))), need: k.size >= 48 ? 3 : 4.5, how: `ink ${k.fg}` });
          }
          continue;
        }
        const ps = pixels(it.box);
        if (ps.length < 16) continue;
        const L = ps.map((p) => lum(p[0], p[1], p[2]));
        // Otsu on 128 bins of luminance
        const bins = new Array(128).fill(0);
        for (const v of L) bins[Math.min(127, Math.floor(v * 128))]++;
        let sum = 0; bins.forEach((n, i) => (sum += n * i));
        let wB = 0, sB = 0, best = -1, th = 0;
        for (let i = 0; i < 128; i++) {
          wB += bins[i]; if (!wB) continue; const wF = L.length - wB; if (!wF) break;
          sB += i * bins[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
          if (v > best) { best = v; th = i; }
        }
        const lo = L.filter((v) => Math.floor(v * 128) <= th), hi = L.filter((v) => Math.floor(v * 128) > th);
        if (!lo.length || !hi.length) { res.push({ id: it.id, kind: it.kind, text: it.text, t, ratio: 1, need: 4.5, how: 'flat box' }); continue; }
        const lines = it.text.split(' / ').length;
        const size = (it.box.h / lines) * 0.75;
        // the lettering is the minority class; its ink is the class's extreme fifth (stroke cores, not the
        // anti-aliased and bloomed edges), the background is the majority class's median
        const darkText = lo.length < hi.length;
        const txt = (darkText ? lo : hi).slice().sort((x, y) => x - y), bg = darkText ? hi : lo;
        const inkL = darkText ? txt[Math.floor(txt.length * 0.2)]! : txt[Math.floor(txt.length * 0.8)]!;
        res.push({ id: it.id, kind: it.kind, text: it.text, t, ratio: ratio(inkL, median(bg)), need: size >= 48 ? 3 : 4.5, how: `otsu ${darkText ? 'dark on light' : 'light on dark'}` });
      }
      return res;
    }, { t, READ });
    all.push(...ms);
  }
  // worst frame per item (the karaoke: per ink colour)
  const worst = new Map<string, M>();
  for (const m of all) { const k = m.kind === 'karaoke' ? `${m.id} ${m.how}` : m.id; const w = worst.get(k); if (!w || m.ratio / m.need < w.ratio / w.need) worst.set(k, m); }
  const rows = [...worst.values()].sort((a, b) => a.ratio / a.need - b.ratio / b.need);
  console.log(`qa-contrast ${PORTRAIT ? '9:16' : '16:9'}  ${from.toFixed(2)}–${to.toFixed(2)}s  ${times.length} frames @ ${FPS} fps  ${rows.length} items (${all.length} measurements)`);
  const bad: string[] = [];
  for (const m of rows) {
    const scenery = m.id.startsWith('scenery:');
    const ok = m.ratio >= m.need;
    if (!ok && !scenery) bad.push(`A9       ${m.kind} ${JSON.stringify(m.text)} ${m.ratio.toFixed(2)}:1 < ${m.need}:1 at ${m.t.toFixed(2)}s (${m.how})`);
    console.log(`  ${ok ? 'ok  ' : scenery ? 'info' : 'FAIL'}  ${m.ratio.toFixed(2).padStart(6)}:1 (need ${m.need})  ${m.t.toFixed(2).padStart(6)}s  ${m.kind.padEnd(8)} ${JSON.stringify(m.text).slice(0, 60)}  ${m.how}${scenery ? '  [scenery]' : ''}`);
  }
  if (!all.length) bad.push('A9       no text measured at all (did the page render?)');
  if (bad.length) { failed = true; console.log(`FAIL (${bad.length})`); for (const b of bad) console.log(`  ${b}`); }
  else console.log('PASS');
} finally {
  await browser.close();
  stopServer();
}
process.exit(failed ? 1 : 0);
