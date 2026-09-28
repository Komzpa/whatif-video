#!/usr/bin/env bun
// TESTPLAN A14 (static half): every recurring element is one shared asset (TREATMENT r8 continuity table).
//   child    every chapter builds its child from KID (_kit.ts) via initKid or `{ ...KID }`; the yellow coat is
//            never re-typed inline elsewhere
//   torch    the first-person torch hand is drawn only by drawTorchHand (_hands.ts), from _kit.ts or lost.ts
//   cat      every cat Quadruped is OUR_CAT (directly or through a `catSpec = OUR_CAT` field); CAT is never used raw
//   stranger tease, alone, words and stranger build the man from STRANGER (_people.ts); no inline hat+long-coat spec
//   home     door and close both place the block with buildHome (_home.ts); no other file builds a home block
//   counter  «ДОМ · x км» monotonic along the timeline is the dynamic A5 in qa-reading-time.ts
// The visual half is scripts/proof-continuity.py (one row of stills per element, both aspects).
// Usage: bun scripts/qa-continuity.ts
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = process.env.QA_SCENES ?? path.resolve(import.meta.dir, '../src/scenes'); // QA_SCENES: a mutated copy for the negative control
const code = (f: string) => readFileSync(path.join(DIR, f), 'utf-8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));
const chapters = files.filter((f) => !f.startsWith('_'));
const src = Object.fromEntries(files.map((f) => [f, code(f)]));
const bad: string[] = [];
const ok = (el: string, msg: string) => console.log(`A14 ${el.padEnd(8)} ${msg}`);

// child
const kidCh = chapters.filter((f) => /this\.kid\b|initKid|kidW/.test(src[f]));
const kidBad = kidCh.filter((f) => !/initKid\(|\.\.\.KID\b/.test(src[f]));
const coatDup = files.filter((f) => f !== '_kit.ts' && /coat:\s*\[0\.6,\s*0\.47,\s*0\.08\]/.test(src[f]));
for (const f of kidBad) bad.push(`child    ${f}: a child figure not built from KID`);
for (const f of coatDup) bad.push(`child    ${f}: the yellow coat re-typed inline`);
ok('child', `${kidCh.length} chapters, all from KID: ${kidBad.length + coatDup.length ? 'NO' : 'yes'}`);

// torch
const torchCallers = files.filter((f) => f !== '_hands.ts' && /drawTorchHand\s*\(/.test(src[f]));
const torchBad = torchCallers.filter((f) => !['_kit.ts', 'lost.ts'].includes(f));
const handDup = files.filter((f) => f !== '_hands.ts' && /function\s+drawTorchHand|function\s+drawFist/.test(src[f]));
for (const f of [...torchBad, ...handDup]) bad.push(`torch    ${f}: a torch hand drawn outside _hands.ts/_kit.ts`);
ok('torch', `drawn by drawTorchHand from ${torchCallers.join(', ')}`);

// cat
let cats = 0;
for (const f of files) {
  for (const m of src[f].matchAll(/new\s+Quadruped\(\s*([^,]+),/g)) {
    const a = m[1].trim();
    if (/dogs|DOG|r\.spec/.test(a)) continue; // dogs chapter: the pack, not the cat
    cats++;
    const viaField = a === 'this.catSpec' && /catSpec:\s*QuadSpec\s*=\s*OUR_CAT\b/.test(src[f]);
    if (a !== 'OUR_CAT' && !viaField) bad.push(`cat      ${f}: Quadruped(${a}) is not OUR_CAT`);
  }
  if (f !== '_beasts.ts' && /\bCAT\b(?!_)/.test(src[f].replace(/OUR_CAT/g, ''))) bad.push(`cat      ${f}: raw CAT spec used`);
}
ok('cat', `${cats} cat figures`);

// stranger
const needMan = ['tease.ts', 'alone.ts', 'words.ts', 'stranger.ts'];
for (const f of needMan) if (!/new\s+Figure\([^)]*\bSTRANGER\b/.test(src[f] ?? '')) bad.push(`stranger ${f}: the man not built from STRANGER`);
for (const f of files) if (f !== '_people.ts' && /hat:\s*true[^}]*longCoat:\s*true|longCoat:\s*true[^}]*hat:\s*true/.test(src[f])) bad.push(`stranger ${f}: inline hat+long-coat spec`);
ok('stranger', `STRANGER in ${needMan.filter((f) => /\bSTRANGER\b/.test(src[f] ?? '')).join(', ')}`);

// home
const homes = files.filter((f) => /buildHome\s*\(/.test(src[f]) && f !== '_home.ts');
for (const f of ['door.ts', 'close.ts']) if (!homes.includes(f)) bad.push(`home     ${f}: home block not from buildHome`);
ok('home', `buildHome in ${homes.join(', ')}`);

for (const b of bad) console.log(`A14 FAIL ${b}`);
console.log(bad.length ? `FAIL (${bad.length})` : 'PASS');
process.exit(bad.length ? 1 : 0);
