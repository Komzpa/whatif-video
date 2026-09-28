#!/usr/bin/env bun
// TESTPLAN A10 and A11 on a delivered file.
//   A10 loudness : integrated loudness of the file's audio is −14 ± 1 LUFS (ffmpeg ebur128).
//   A10 sync     : the audio stream starts at 0 and lasts as long as the video (± one frame + one AAC frame);
//                  each lyric line of data/lyrics.json that starts inside the file lights its first letter
//                  within ±60 ms of its first aligned word — measured on the file's own frames: the chapter
//                  line's box comes from the page's text log, and the first frame whose box holds the red front
//                  letter is the line's start (frame times are n / fps, the audio starts at 0).
//   A11 identity : the name carries rN; the …-rN.json next to it holds the content sha of the render inputs,
//                  which equals the work tree's (scripts/identity.ts), and differs from the previous draft's
//                  (recomputed from the commit named in the manifest, or read from an r(N−1) manifest);
//                  the file's sha256 matches the manifest.
// Usage: bun scripts/qa-av.ts --video ../out/whatif-video-draft-lost-2026-09-27-r4.mp4 [--aspect 9:16] [--url http://localhost:5391]
import { chromium } from 'playwright-core';
import path from 'node:path';
import { existsSync, readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { identity, fileSha } from './identity';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const APP = path.resolve(import.meta.dir, '..'), ROOT = path.resolve(APP, '..');
const video = path.resolve(opt('video')!);
const PORTRAIT = opt('aspect', /-tiktok\.mp4$/.test(video) ? '9:16' : '16:9') === '9:16';
const LW = PORTRAIT ? 1080 : 1920, LH = PORTRAIT ? 1920 : 1080;
const NV_EGL = '/usr/share/glvnd/egl_vendor.d/10_nvidia.json';
const bad: string[] = [], lines: string[] = [];
function run(args: string[]): string {
  const r = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error(`${args.join(' ')}\n${r.stderr.toString().slice(-1500)}`);
  return r.stdout.toString() + r.stderr.toString();
}
if (!existsSync(video)) throw new Error(`no ${video}`);
const pr = JSON.parse(run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,r_frame_rate,start_time,duration,width,height', '-show_entries', 'format=duration', '-of', 'json', video]));
const vs = pr.streams.find((s: any) => s.codec_type === 'video'), as = pr.streams.find((s: any) => s.codec_type === 'audio');
const [fn, fd] = vs.r_frame_rate.split('/').map(Number), FPS = fn / fd;

// ------------------------------------------------------------------ A10 loudness
const eb = run(['ffmpeg', '-hide_banner', '-nostats', '-i', video, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
const I = +eb.match(/I:\s+(-?[\d.]+) LUFS/g)!.pop()!.match(/-?[\d.]+/)![0];
const peak = eb.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop()?.match(/-?[\d.]+/)?.[0];
lines.push(`A10 loudness  integrated ${I} LUFS (need −14 ± 1), true peak ${peak} dBFS`);
if (!(Math.abs(I + 14) <= 1)) bad.push(`A10      integrated loudness ${I} LUFS is outside −14 ± 1`);

// ------------------------------------------------------------------ A10 stream sync
if (!as) bad.push('A10      no audio stream');
else {
  const a0 = +as.start_time, ad = +as.duration, vd = +vs.duration;
  lines.push(`A10 streams   audio starts ${a0.toFixed(3)}s, lasts ${ad.toFixed(3)}s; video ${vd.toFixed(3)}s at ${FPS} fps`);
  if (Math.abs(a0) > 0.001) bad.push(`A10      the audio starts at ${a0}s, not 0`);
  if (Math.abs(ad - vd) > 1 / FPS + 1024 / 48000 + 1e-3) bad.push(`A10      audio ${ad}s vs video ${vd}s`);
}

// ------------------------------------------------------------------ A10 lyric starts, on the file's frames
const L = JSON.parse(readFileSync(path.join(ROOT, 'data/lyrics.json'), 'utf-8'));
const dur = +pr.format.duration;
const starts: { text: string; t: number }[] = L.lines.map((l: any) => ({ text: l.text, t: l.words[0].start })).filter((l: any) => l.t < dur);
async function reachable(u: string) { try { return (await fetch(u, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } }
let url = opt('url'), stopServer = () => {};
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
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'],
  env: { ...process.env, ...(existsSync(NV_EGL) && !process.env.__EGL_VENDOR_LIBRARY_FILENAMES ? { __EGL_VENDOR_LIBRARY_FILENAMES: NV_EGL } : {}) } as Record<string, string>,
});
try {
  const page = await browser.newPage({ viewport: { width: LW, height: LH } });
  await page.goto(`${url}/?export=1${PORTRAIT ? '&aspect=9:16' : ''}`);
  await page.waitForFunction(() => (window as any).__video?.ready || (window as any).__video?.error, null, { timeout: 120000 });
  const tmp = mkdtempSync(path.join(tmpdir(), 'qa-av-'));
  for (const s of starts) {
    if (s.t > dur - 0.2) { lines.push(`A10 lyric     ${JSON.stringify(s.text)} at ${s.t.toFixed(3)}s starts in the file's last 0.2 s (the next chapter's line): not checked`); continue; }
    // the chapter line's box just after the word (the log is only used for where to look)
    const box = await page.evaluate((t) => { const V = (window as any).__video; V.texts(t - 0.5); const it = V.texts(t + 0.12).find((x: any) => x.kind === 'karaoke'); return it ? it.box : null; }, s.t);
    if (!box) { lines.push(`A10 lyric     ${JSON.stringify(s.text)} at ${s.t.toFixed(3)}s: no chapter line drawn`); if (s.t < dur - 0.2) bad.push(`A10      ${JSON.stringify(s.text)} (${s.t}s) has no line on screen`); continue; }
    // the file's frames around the word, cropped to the line's box
    const n0 = Math.max(0, Math.round(s.t * FPS) - 8), n1 = Math.round(s.t * FPS) + 8;
    const sx = vs.width / LW, crop = `${Math.round(box.w * sx)}:${Math.round(box.h * sx)}:${Math.round(box.x * sx)}:${Math.round(box.y * sx)}`;
    for (const f of readdirSync(tmp)) Bun.spawnSync(['rm', '-f', path.join(tmp, f)]);
    run(['ffmpeg', '-loglevel', 'error', '-i', video, '-vf', `select=between(n\\,${n0}\\,${n1}),crop=${crop}`, '-fps_mode', 'passthrough', '-start_number', String(n0), path.join(tmp, 'f%06d.ppm')]);
    let first: number | null = null;
    for (let n = n0; n <= n1 && first === null; n++) {
      const f = path.join(tmp, `f${String(n).padStart(6, '0')}.ppm`);
      if (!existsSync(f)) continue;
      const buf = new Uint8Array(await Bun.file(f).arrayBuffer());
      // PPM P6 header: magic, width, height, maxval, then RGB
      let p = 0, fields = 0; while (fields < 4) { while (buf[p] === 0x20 || buf[p] === 0x0a) p++; while (buf[p] !== 0x20 && buf[p] !== 0x0a) p++; fields++; } p++;
      let red = 0;
      for (let i = p; i + 2 < buf.length; i += 3) if (buf[i]! > 170 && buf[i + 1]! < 120 && buf[i + 2]! < 110 && buf[i]! - buf[i + 1]! > 80) red++; // the sung-word red (R−G ≈ 110), not an orange lamp or its reflection (R−G ≈ 55)
      if (red > 30) first = n;
    }
    if (first === null) { bad.push(`A10      ${JSON.stringify(s.text)} (${s.t}s): no lit letter within ±8 frames`); continue; }
    const err = first / FPS - s.t;
    lines.push(`A10 lyric     ${JSON.stringify(s.text)}  word ${s.t.toFixed(3)}s  first lit frame ${first} (${(first / FPS).toFixed(3)}s)  ${(err * 1000).toFixed(0)} ms`);
    if (Math.abs(err) > 0.06) bad.push(`A10      ${JSON.stringify(s.text)} lights ${(err * 1000).toFixed(0)} ms from its word`);
  }
} finally {
  await browser.close();
  stopServer();
}

// ------------------------------------------------------------------ A11 identity
const m = path.basename(video).match(/-r(\d+)(-tiktok)?\.mp4$/);
if (!m) bad.push(`A11      ${path.basename(video)} does not carry rN`);
else {
  const N = +m[1]!, json = video.replace(/(-tiktok)?\.mp4$/, '.json');
  if (!existsSync(json)) bad.push(`A11      no ${path.basename(json)}`);
  else {
    const J = JSON.parse(readFileSync(json, 'utf-8'));
    const now = identity();
    lines.push(`A11 identity  ${path.basename(json)}: inputs ${J.inputs.sha.slice(0, 16)}… (work tree ${now.sha.slice(0, 16)}…)`);
    if (J.inputs.sha !== now.sha) bad.push(`A11      manifest inputs ${J.inputs.sha} ≠ work tree ${now.sha} (rendered from other inputs)`);
    const fsha = await fileSha(video), rec = J.files?.[path.basename(video)];
    if (!rec || rec.sha256 !== fsha) bad.push(`A11      ${path.basename(video)} sha256 ${fsha} not in the manifest`);
    const prevJson = json.replace(`-r${N}.json`, `-r${N - 1}.json`);
    let prevSha: string | null = null, how = '';
    if (existsSync(prevJson)) { prevSha = JSON.parse(readFileSync(prevJson, 'utf-8')).inputs.sha; how = path.basename(prevJson); }
    else if (J.prev?.rev) { prevSha = identity(J.prev.rev).sha; how = `commit ${J.prev.rev}`; if (prevSha !== J.prev.sha) bad.push(`A11      manifest's r${N - 1} sha ≠ recomputed from ${J.prev.rev}`); }
    lines.push(`A11 previous  r${N - 1}: ${prevSha ? prevSha.slice(0, 16) + '…' : 'unknown'} (${how || 'no manifest, no commit'})`);
    if (!prevSha) bad.push(`A11      no r${N - 1} identity to compare with`);
    else if (prevSha === J.inputs.sha) bad.push(`A11      inputs identical to r${N - 1}`);
  }
}

console.log(`qa-av ${path.basename(video)}  ${vs.width}x${vs.height} ${FPS} fps ${dur.toFixed(3)}s`);
for (const l of lines) console.log(`  ${l}`);
if (bad.length) { console.log(`FAIL (${bad.length})`); for (const b of bad) console.log(`  ${b}`); }
else console.log('PASS');
process.exit(bad.length ? 1 : 0);
