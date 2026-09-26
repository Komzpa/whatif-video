#!/usr/bin/env bun
// TESTPLAN A6 (static half): the scene code of the checked chapters never draws a drone (TREATMENT r5 item 8).
// The dynamic half is in scripts/qa-reading-time.ts (no 'drone' object logged in any frame). This half also
// runs on an old commit, which has no text log to probe: `--rev 1ac97b4` (lost r2, the baseline that must fail).
// Usage: bun scripts/qa-drone.ts [--rev <git rev>] [--chapters lost,book]
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(import.meta.dir, '../..');
const rev = opt('rev');
const chapters = opt('chapters', 'lost')!.split(',');
const DRONE = /\b(drawDrone|droneGlow|drawChildAndDrone|new\s+Drone)\s*\(/g;
const read = (rel: string): string | null => {
  if (!rev) { const f = path.join(ROOT, rel); return existsSync(f) ? readFileSync(f, 'utf-8') : null; }
  const r = Bun.spawnSync(['git', 'show', `${rev}:${rel}`], { cwd: ROOT });
  return r.exitCode === 0 ? r.stdout.toString() : null;
};
let bad = 0;
for (const ch of chapters) {
  const rel = `app/src/scenes/${ch}.ts`, src = read(rel);
  if (src === null) { console.log(`A6  ${rel}: missing${rev ? ` at ${rev}` : ''}`); bad++; continue; }
  const hits = src.split('\n').flatMap((l, i) => (l.replace(/\/\/.*$/, '').match(DRONE) ? [`${rel}:${i + 1}: ${l.trim().slice(0, 100)}`] : []));
  console.log(`A6  ${rel}${rev ? ` @ ${rev}` : ''}: ${hits.length} drone draw call(s)`);
  for (const h of hits.slice(0, 5)) console.log(`      ${h}`);
  bad += hits.length;
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
