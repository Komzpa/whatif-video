#!/usr/bin/env bun
// QA (TREATMENT r9 note 3, TESTPLAN A16): the camera moves with the music, not in snaps. Renders the timeline in
// headless Chrome and reads the camera every frame (CityScene.logFrame -> textlog kind 'cam'): position, forward
// vector, fov and the post zoom (punch-ins). Checks:
//   cuts    : a jump (≥ --cut-deg degrees of view direction, or ≥ --cut-m metres, or a fov jump ≥ 8° in one frame,
//             or a chapter change) is a cut; every cut lands within ±--tol s of a beat of data/audio.json. Jumps on
//             several frames running are a whip (a snap), not a cut, and fail.
//   punches : the start of every post zoom punch (zoom leaves 1) lands within ±--tol s of a beat.
//   snaps   : between cuts the view turns at most --max-vel °/s, and its angular acceleration stays under
//             --max-acc °/s² (an eased move ramps up and down; a snap jumps to full speed in a frame or two).
//   starts  : a move that starts from rest (≥ 0.3 s under 4 °/s, then over 15 °/s) starts within ±--tol-start s
//             of a beat (the moment it leaves 2 °/s).
//   walk    : (static) no step clock of its own (`t * 7.4` bobs) and no hard-coded beat period in src/scenes.
// Usage: bun scripts/qa-camera.ts [--from 0] [--to <end>] [--fps 30] [--aspect 9:16] [--list]
// Exit code 1 when anything fails; each offender is listed with its time.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const APP = path.resolve(import.meta.dir, '..'), ROOT = path.resolve(APP, '..');
const PORTRAIT = opt('aspect', '16:9') === '9:16';
const LW = PORTRAIT ? 1080 : 1920, LH = PORTRAIT ? 1920 : 1080;
const FPS = +opt('fps', '30')!, DT = 1 / FPS;
const CUT_DEG = +opt('cut-deg', '10')!, CUT_M = +opt('cut-m', '0.6')!;
const TOL = +opt('tol', '0.06')!, TOL_START = +opt('tol-start', '0.12')!;
const MAX_VEL = +opt('max-vel', '120')!, MAX_ACC = +opt('max-acc', '800')!;
const NV_EGL = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json';
const AU = JSON.parse(readFileSync(path.join(ROOT, 'data/audio.json'), 'utf-8'));
const BEATS: number[] = AU.beats;
const nearBeat = (t: number) => BEATS.reduce((m, b) => (Math.abs(b - t) < Math.abs(m - t) ? b : m), BEATS[0]!);

type Cam = { p: [number, number, number]; f: [number, number, number]; fov: number; zoom?: number };
interface Item { id: string; text: string; kind: string; cam?: Cam }

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
  const cams: ({ chap: string; c: Cam } | null)[] = [];
  for (let i = 0; i < times.length; i += 60) {
    const batch = times.slice(i, i + 60);
    const got: (Item | null)[] = await page.evaluate((ts) => ts.map((t: number) => { const f = (window as any).__video.texts(t).filter((it: any) => it.kind === 'cam'); return f.length ? f[f.length - 1] : null; }), batch);
    cams.push(...got.map((it) => (it?.cam ? { chap: it.text, c: it.cam } : null)));
  }
  const ang = (a: number[], b: number[]) => { const d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!; return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI; };
  const offenders: string[] = [];
  const cutAt: number[] = [];
  // per-frame angular speed (°/s) between frame i-1 and i, NaN across a cut
  const vel: number[] = new Array(cams.length).fill(NaN);
  const jump: boolean[] = new Array(cams.length).fill(false);
  for (let i = 1; i < cams.length; i++) {
    const a = cams[i - 1], b = cams[i];
    if (!a || !b) continue;
    const dA = ang(a.c.f, b.c.f), dP = Math.hypot(b.c.p[0] - a.c.p[0], b.c.p[1] - a.c.p[1], b.c.p[2] - a.c.p[2]), dF = Math.abs(b.c.fov - a.c.fov);
    if (a.chap !== b.chap || dA >= CUT_DEG || dP >= CUT_M || dF >= 8) { jump[i] = true; continue; }
    vel[i] = dA / DT;
  }
  // one jump frame is a cut; a run of them is a whip (a move faster than a cut can be told from), a snap
  const whips: string[] = [];
  for (let i = 1; i < cams.length; i++) {
    if (!jump[i]) continue;
    let j = i; while (j + 1 < cams.length && jump[j + 1] && cams[j + 1]!.chap === cams[i]!.chap) j++;
    if (j === i || cams[i - 1]!.chap !== cams[i]!.chap) cutAt.push(times[i]!);
    else whips.push(`${times[i]!.toFixed(2)}–${times[j]!.toFixed(2)}s ${cams[i]!.chap}: the view jumps ≥ ${CUT_DEG}° or ≥ ${CUT_M} m on ${j - i + 1} frames running`);
    i = j;
  }
  offenders.push(...whips.map((s) => `A16 whip  ${s}`));
  // cuts on beats (the cut happens between frames i-1 and i: it is on screen from times[i])
  const cutBad: string[] = [];
  for (const t of cutAt) { const b = nearBeat(t); if (Math.abs(b - t) > TOL + DT / 2) cutBad.push(`${t.toFixed(3)}s (beat ${b.toFixed(3)}, off by ${(t - b >= 0 ? '+' : '') + (t - b).toFixed(3)}s)`); }
  if (cutBad.length) offenders.push(...cutBad.map((s) => `A16 cut   not on a beat: ${s}`));
  // punches: zoom leaving 1
  for (let i = 1; i < cams.length; i++) {
    const a = cams[i - 1], b = cams[i];
    if (!a || !b) continue;
    if ((a.c.zoom ?? 1) <= 1.0005 && (b.c.zoom ?? 1) > 1.0005) { const t = times[i]!, nb = nearBeat(t); if (Math.abs(nb - t) > TOL + DT / 2) offenders.push(`A16 punch not on a beat: ${t.toFixed(3)}s (beat ${nb.toFixed(3)})`); }
  }
  // snaps: speed and acceleration between cuts (a 3-frame median keeps one-frame noise out)
  const med = vel.map((_, i) => { const w = [vel[i - 1], vel[i], vel[i + 1]].filter((x): x is number => x !== undefined && !Number.isNaN(x)); return w.length === 3 ? w.sort((x, y) => x - y)[1]! : NaN; });
  let vMax = 0, vAt = 0, aMax = 0, aAt = 0;
  const velBad = new Map<number, string>(), accBad = new Map<number, string>();
  for (let i = 1; i < med.length; i++) {
    const v = med[i]!, v0 = med[i - 1]!;
    if (Number.isNaN(v)) continue;
    if (v > vMax) { vMax = v; vAt = times[i]!; }
    if (v > MAX_VEL) { const k = Math.floor(times[i]! * 2); if (!velBad.has(k)) velBad.set(k, `${times[i]!.toFixed(2)}s ${cams[i]!.chap}: turns ${v.toFixed(0)}°/s > ${MAX_VEL}°/s`); }
    if (Number.isNaN(v0)) continue;
    if (jump.slice(Math.max(0, i - 3), i + 2).some(Boolean)) continue; // a cut may change the motion: that is the cut, not a snap
    const acc = Math.abs(v - v0) / DT;
    if (acc > aMax) { aMax = acc; aAt = times[i]!; }
    if (acc > MAX_ACC) { const k = Math.floor(times[i]! * 2); if (!accBad.has(k)) accBad.set(k, `${times[i]!.toFixed(2)}s ${cams[i]!.chap}: jerks ${acc.toFixed(0)}°/s² > ${MAX_ACC}°/s² (${v0.toFixed(0)} → ${v.toFixed(0)}°/s)`); }
  }
  offenders.push(...[...velBad.values()].map((s) => `A16 fast  ${s}`), ...[...accBad.values()].map((s) => `A16 snap  ${s}`));
  // move starts from rest on a beat
  let rest = 0;
  const startBad: string[] = [];
  for (let i = 1; i < med.length; i++) {
    const v = med[i]!;
    if (Number.isNaN(v)) { rest = 0; continue; }
    if (v < 4) { rest += DT; continue; }
    if (v > 15 && rest >= 0.3) {
      let j = i; while (j > 0 && !Number.isNaN(med[j - 1]!) && med[j - 1]! >= 2) j--;
      const t = times[j]!, b = nearBeat(t);
      if (Math.abs(b - t) > TOL_START) startBad.push(`${t.toFixed(2)}s ${cams[i]!.chap} (beat ${b.toFixed(2)}, off by ${(t - b >= 0 ? '+' : '') + (t - b).toFixed(2)}s)`);
      rest = 0;
    } else if (v >= 4) rest = 0;
  }
  offenders.push(...startBad.map((s) => `A16 start not on a beat: ${s}`));
  // static: the walk runs on the beat grid (CityScene.steps), not on a clock of its own or an invented tempo
  for (const f of readdirSync(path.join(APP, 'src/scenes')).filter((n) => n.endsWith('.ts'))) {
    readFileSync(path.join(APP, 'src/scenes', f), 'utf-8').split('\n').forEach((ln, i) => {
      if (/\bt \* (7\.[0-9]|3\.7)\b/.test(ln) && /bob|sway|roll/.test(ln)) offenders.push(`A16 walk  src/scenes/${f}:${i + 1}: a step clock of its own (use steps(t))`);
      if (/\/ 0\.81\d*\b/.test(ln)) offenders.push(`A16 tempo src/scenes/${f}:${i + 1}: a hard-coded beat period (use the beat grid)`);
    });
  }
  console.log(`qa-camera ${PORTRAIT ? '9:16' : '16:9'}  ${from.toFixed(2)}–${to.toFixed(2)}s  ${cams.length} frames @ ${FPS} fps  cuts ${cutAt.length} (off-beat ${cutBad.length}) · max turn ${vMax.toFixed(0)}°/s at ${vAt.toFixed(2)}s · max jerk ${aMax.toFixed(0)}°/s² at ${aAt.toFixed(2)}s · fast ${velBad.size} · snaps ${accBad.size} · off-beat starts ${startBad.length} · whips ${whips.length}`);
  if (argv.includes('--list')) console.log(`CUTS ${cutAt.map((t) => t.toFixed(3)).join(' ')}`);
  if (!cams.some(Boolean)) offenders.push('probe    no camera logged at all: the probe is broken');
  if (offenders.length) { failed = true; console.log(`FAIL (${offenders.length})`); for (const o of offenders) console.log('  ' + o); }
  else console.log('PASS');
} finally {
  await browser.close();
  stopServer();
}
process.exit(failed ? 1 : 0);
