#!/usr/bin/env bun
// Draft identity (TESTPLAN A11): the content sha of a render's inputs — the app code and assets, the render
// pipeline, the song data and the song itself. Each input file contributes its git blob id (content only,
// so the same bytes give the same id in the work tree and in any commit); the identity is the sha256 of the
// sorted `path blob` list. `--rev <commit>` computes it for an old draft from git alone.
// Usage: bun scripts/identity.ts [--rev <commit>] [--list]
import path from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = path.resolve(import.meta.dir, '../..');
/** What a render reads: code, fonts and assets, the render/delivery scripts, data, audio. */
export const INPUTS = ['app/src', 'app/public', 'app/index.html', 'app/package.json', 'app/bun.lock', 'app/bun.lockb', 'app/vite.config.ts', 'app/tsconfig.json', 'app/scripts/render.ts', 'app/scripts/deliver.ts', 'data', 'audio/whatif.mp3'];

function git(args: string[], input?: string): string {
  const r = Bun.spawnSync(['git', ...args], { cwd: ROOT, stdin: input !== undefined ? new TextEncoder().encode(input) : undefined });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

export interface Identity { sha: string; rev: string | null; files: number; inputs: [string, string][] }

/** The identity of the work tree (tracked and untracked, not ignored) or of a commit. */
export function identity(rev?: string): Identity {
  let pairs: [string, string][];
  if (rev) {
    const out = git(['ls-tree', '-r', rev, '--', ...INPUTS]);
    pairs = out.trim().split('\n').filter(Boolean).map((l) => { const [meta, p] = l.split('\t'); return [p!, meta!.split(' ')[2]!] as [string, string]; });
  } else {
    const files = git(['ls-files', '-co', '--exclude-standard', '--', ...INPUTS]).trim().split('\n').filter(Boolean)
      .filter((p) => existsSync(path.join(ROOT, p))); // a tracked file deleted in the work tree is not an input
    const blobs = git(['hash-object', '--stdin-paths'], files.join('\n') + '\n').trim().split('\n');
    pairs = files.map((p, i) => [p, blobs[i]!] as [string, string]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const h = new Bun.CryptoHasher('sha256');
  for (const [p, b] of pairs) h.update(`${p} ${b}\n`);
  return { sha: h.digest('hex'), rev: rev ?? null, files: pairs.length, inputs: pairs };
}

/** sha256 of a file's bytes. */
export async function fileSha(file: string): Promise<string> {
  const h = new Bun.CryptoHasher('sha256');
  h.update(new Uint8Array(await Bun.file(file).arrayBuffer()));
  return h.digest('hex');
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--rev');
  const id = identity(i >= 0 ? argv[i + 1] : undefined);
  console.log(`${id.sha}  ${id.files} input files${id.rev ? ` @ ${id.rev}` : ' (work tree)'}`);
  if (argv.includes('--list')) for (const [p, b] of id.inputs) console.log(`  ${b}  ${p}`);
}
