#!/usr/bin/env bun
// Gate 4 delivery (TESTPLAN): from the full-quality renders (scripts/render.ts video) make the viewing copies
//   out/whatif-video-draft-<chapter>-<date>-r<N>.mp4 and …-r<N>-tiktok.mp4
// - the poster (a settled frame picked by the builder) baked in as frame 0: the frame is replaced, not added,
//   so duration, frame count and audio timing stay as rendered (brag step 4);
// - audio at integrated −14 LUFS (TESTPLAN A10): a fixed gain found by measuring the processed audio, and a
//   −1 dBFS limiter so the gain cannot clip; the song's timing is untouched;
// - h264 two-pass sized under --max-mb (default 15) at the render's resolution and frame rate;
// - the identity manifest …-r<N>.json (TESTPLAN A11): the content sha of the render inputs
//   (scripts/identity.ts), the previous draft's sha (from its commit), and each file's sha256, poster,
//   loudness, frames and duration.
// Usage: bun scripts/deliver.ts --r 4 --date 2026-09-27 --chapter lost --prev-rev 22d2122 --poster 17.6
//          [--poster-v 17.6] [--master ../out/draft-lost-r4.mp4] [--master-v ../out/draft-lost-r4-tiktok.mp4]
//          [--render "<render command>"] [--max-mb 15] [--name whatif-video-full] [--tag hq]
//        --max-mb is required for masters longer than 60 s (a full song: 200 for posting at 9 Mb/s, 49 for Telegram)
import path from 'node:path';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { identity, fileSha } from './identity';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(import.meta.dir, '../..'), OUT = path.join(ROOT, 'out');
const R = +opt('r')!, DATE = opt('date')!, CH = opt('chapter', 'lost')!, PREV = opt('prev-rev');
if (!R || !DATE) throw new Error('--r and --date are required');
// the size cap: 15 MB suits a chapter (~26 s); a whole song at 15 MB fell apart into blocks (r4, 176 s at
// ~0.5 Mb/s), so anything longer than 60 s must name its cap (--max-mb 200 = the 9 Mb/s ceiling; 49 for Telegram)
const MAXMB_OPT = opt('max-mb'), MAXMB = +(MAXMB_OPT ?? '15');
// an optional tag after rN for extra copies of the same draft: --tag hq -> …-rN-hq.mp4, …-rN-hq-tiktok.mp4, …-rN-hq.json
const TAG = opt('tag'), T = TAG ? `-${TAG}` : '';
if (TAG && !/^[a-z0-9]+$/.test(TAG)) throw new Error('--tag: lowercase letters and digits only');
// the delivered name's stem: a chapter draft by default, `--name whatif-video-full` for the whole song
const NAME = opt('name', `whatif-video-draft-${CH}`)!;
const LUFS = -14, TP = 0.891; // −1 dBFS

function run(args: string[]): string {
  const r = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) throw new Error(`${args.join(' ')}\n${r.stderr.toString().slice(-2000)}`);
  return r.stdout.toString() + r.stderr.toString();
}
const probe = (f: string) => JSON.parse(run(['ffprobe', '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames,r_frame_rate,width,height,start_time,duration:format=duration', '-of', 'json', f]));
/** Integrated loudness (LUFS) and true peak (dBFS) of a file's audio after an optional filter. */
function loudness(f: string, af = ''): { I: number; peak: number } {
  const o = run(['ffmpeg', '-hide_banner', '-nostats', '-i', f, '-vn', '-af', `${af ? af + ',' : ''}ebur128=peak=true`, '-f', 'null', '-']);
  const I = +o.match(/I:\s+(-?[\d.]+) LUFS/g)!.pop()!.match(/-?[\d.]+/)![0];
  const peak = +(o.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/g)?.pop()?.match(/-?[\d.]+/)?.[0] ?? '-99');
  return { I, peak };
}

const id = identity();
const head = run(['git', '-C', ROOT, 'rev-parse', '--short', 'HEAD']).trim();
const idHead = identity('HEAD');
const prev = PREV ? { r: R - 1, rev: PREV, sha: identity(PREV).sha } : null;
if (prev && prev.sha === id.sha) throw new Error(`inputs unchanged since r${R - 1} (${PREV}): nothing new to deliver`);

const aspects = [
  { key: 'h', aspect: '16:9', master: opt('master', path.join(OUT, `draft-${CH}-r${R}.mp4`))!, poster: +opt('poster')!, suffix: '' },
  { key: 'v', aspect: '9:16', master: opt('master-v', path.join(OUT, `draft-${CH}-r${R}-tiktok.mp4`))!, poster: +(opt('poster-v') ?? opt('poster'))!, suffix: '-tiktok' },
];
const files: Record<string, unknown> = {};
mkdirSync(path.join(OUT, 'wip'), { recursive: true });
for (const a of aspects) {
  if (!existsSync(a.master)) throw new Error(`missing master ${a.master}`);
  if (!Number.isFinite(a.poster)) throw new Error('--poster <t> is required');
  const out = path.join(OUT, `${NAME}-${DATE}-r${R}${T}${a.suffix}.mp4`);
  const pm = probe(a.master), vs = pm.streams.find((s: any) => s.codec_type === 'video');
  const [fn, fd] = vs.r_frame_rate.split('/').map(Number), fps = fn / fd, dur = +pm.format.duration;
  if (MAXMB_OPT === undefined && dur > 60) throw new Error(`${path.basename(a.master)} runs ${dur.toFixed(0)} s: name the size cap (--max-mb 200 for the 9 Mb/s posting copy, 49 for Telegram); the 15 MB chapter default would starve it`);
  // the poster: the master's own frame at the chosen time (exact frame index, no re-render)
  const n = Math.round(a.poster * fps), poster = path.join(OUT, 'wip', `r${R}-poster-${a.key}.png`);
  run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a.master, '-vf', `select=eq(n\\,${n})`, '-frames:v', '1', poster]);
  // loudness: gain so the processed audio integrates at −14 LUFS (two corrections are plenty)
  const src = loudness(a.master);
  let gain = LUFS - src.I, got = src;
  const af = (g: number) => `volume=${g.toFixed(2)}dB,alimiter=limit=${TP}:level=disabled:attack=5:release=80`;
  for (let k = 0; k < 3; k++) { got = loudness(a.master, af(gain)); if (Math.abs(got.I - LUFS) < 0.2) break; gain += LUFS - got.I; }
  // h264 two-pass sized under the cap (audio 192 kb/s)
  const vkbps = Math.min(9000, Math.floor(((MAXMB * 0.94 * 8e6) / dur - 192e3) / 1000));
  const log = path.join(OUT, 'wip', `r${R}-x264-${a.key}`);
  const common = ['-i', a.master, '-i', poster, '-filter_complex', "[0:v][1:v]overlay=0:0:enable='eq(n,0)':eof_action=repeat[v]", '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-b:v', `${vkbps}k`, '-maxrate', `${Math.round(vkbps * 1.6)}k`, '-bufsize', `${vkbps * 2}k`, '-passlogfile', log];
  run(['ffmpeg', '-y', '-loglevel', 'error', ...common, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
  run(['ffmpeg', '-y', '-loglevel', 'error', ...common, '-pass', '2', '-map', '0:a', '-af', af(gain), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  const po = probe(out), ov = po.streams.find((s: any) => s.codec_type === 'video'), oa = po.streams.find((s: any) => s.codec_type === 'audio');
  const fin = loudness(out);
  if (+ov.nb_read_frames !== +vs.nb_read_frames) throw new Error(`${out}: ${ov.nb_read_frames} frames, master has ${vs.nb_read_frames}`);
  files[path.basename(out)] = {
    aspect: a.aspect, bytes: statSync(out).size, sha256: await fileSha(out),
    size: `${ov.width}x${ov.height}`, fps, frames: +ov.nb_read_frames, duration: +po.format.duration,
    audio: { start: +oa.start_time, duration: +oa.duration, lufs: fin.I, truePeakDb: fin.peak, sourceLufs: src.I, gainDb: +gain.toFixed(2), limiterDb: -1 },
    poster: { t: a.poster, frame: n, png: path.relative(ROOT, poster), bakedAsFrame: 0 },
    master: { file: path.relative(ROOT, a.master), sha256: await fileSha(a.master), frames: +vs.nb_read_frames },
  };
  console.log(`${path.relative(ROOT, out)}  ${(statSync(out).size / 1e6).toFixed(2)} MB  ${ov.width}x${ov.height} ${fps} fps ${ov.nb_read_frames} frames  ${fin.I} LUFS (source ${src.I}, gain ${gain.toFixed(2)} dB)  poster ${a.poster}s`);
}
const manifest = {
  draft: `${NAME}-${DATE}-r${R}${T}`, chapter: CH, r: R, date: DATE,
  inputs: { sha: id.sha, files: id.files, committed: idHead.sha === id.sha, head, list: id.inputs },
  prev, render: opt('render') ?? null, files,
};
const json = path.join(OUT, `${NAME}-${DATE}-r${R}${T}.json`);
writeFileSync(json, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${path.relative(ROOT, json)}  inputs ${id.sha.slice(0, 16)}… (${id.files} files, ${manifest.inputs.committed ? 'committed' : 'NOT committed'} at ${head})${prev ? `, r${prev.r} ${prev.sha.slice(0, 16)}…` : ''}`);
