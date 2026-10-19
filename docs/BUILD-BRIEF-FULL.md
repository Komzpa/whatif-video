# Build brief: What if, phase 2 — every remaining chapter, then the whole song

You build the rest of the code-rendered music video in ~/proj/whatif-video (local git repo, branch main, no remote).
Commit your own work with `git commit -m ... -- <paths>`; no Co-Authored-By trailer. Run renders with
`nice -n 19 ionice -c3`. No network uploads, no browser window on the desktop (headless Chrome from the render
script is fine), never send anything to Telegram or any chat.

## State
- Chapter `lost` (0–26.4 s) is done: r4 passed every TESTPLAN gate and the author has it.
  Engine, `_motifs.ts`, `_hands.ts`, `_ru.ts`, `data/city.json` (radial-ring Soviet city), QA scripts
  `app/scripts/qa-*.ts`, delivery script and identity manifest exist. Reuse them; don't rebuild what works.
- Every other chapter plays `placeholder.ts`. Remaining: `door`, `dogs`, `cat`, `temp`, `storm`, `tease`, `alone`,
  `words`, `stranger`, `dark`, `close` (outro). `book` stays dropped (r6).

## Contract (read fully before any code)
- docs/TREATMENT.md. **The r7, r6 and r5 sections at the top override the per-chapter text below them.** In practice:
  - every word on screen is Russian: the handbook heading per chapter (table under "r4"), signs, callouts;
  - Soviet radial city from `city.json`; no book on screen; no drone (A6 = 0 drone objects: where a chapter's text
    says the drone lights or helps, use the child's own torch, a street lamp, a window; nobody solves anything for the child);
  - the cat from `lost`'s TREATMENT requirement is present through `temp`, `storm` and `tease` and leaves on «No one stays»
    (see TESTPLAN C);
  - English strings in the chapter text (`VISITOR · FACE NOT RECOGNISED`, `KINDNESS WEEK`, `INCIDENT NOT DETECTED`…) are
    ideas: render them as Russian Soviet-register signage/screens, sparingly (A3 ≤ 2 non-diegetic overlays at once).
- docs/TESTPLAN.md: every regression R1–R12 and checks A1–A13, B1–B6, C apply to every chapter.

## Phase A — Gate 1 for all chapters, then STOP
For each remaining chapter, in song order: write `app/src/scenes/<id>.ts`, render proof stills at 1920×1080 and
1080×1920 (every new asset alone and in its shot, one frame per location, the chapter's key beat), look at them
yourself against section B and C and fix what fails. Put them in `out/wip/full-gate1/<id>/`. Commit per chapter.
Then stop and report: per chapter, the still paths, its start/end from the timeline, and what you are unsure of.
**Do not start the full render until the lead accepts the stills** (the lead will message you).

## Phase B — after the lead's acceptance
Gates 2, 3, 4 on the whole song (0 → end), both aspects:
- all `qa-*.ts` over the full range; fix every failure (extend a check if a new chapter needs it, keeping its baseline);
- 4×4 contact sheets at 0.5 fps per aspect, split into several sheets for the full length, plus one still from the middle
  of every transition; answer "story or UI?" and "which frame would I post?" per sheet;
- render `out/whatif-video-full-2026-09-27-r1.mp4` and `…-r1-tiktok.mp4` with the delivery script (poster as frame 0,
  −14 LUFS, identity manifest `…-r1.json`). Both must be under 50 MB each (Telegram limit); lower bitrate if needed.
Report: paths, sizes, QA output, sheet paths, known flaws, commit shas.
