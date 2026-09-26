# Build brief: What if music video, phase 1 (engine port + first two chapters)

You are building a code-rendered music video in ~/proj/whatif-video (local git repo, branch main, no
remote). Commit your own work with `git commit -m ... -- <paths>`; no Co-Authored-By trailer.

## Read first
- docs/TREATMENT.md: the concept, palette, type, karaoke rules and every chapter. It is the
  acceptance contract for how the video looks. Do not change it; propose changes in your report.
- docs/ENGINE.pdoom.md and app/src/engine/*: the engine, forked from mexicat/pdoom-video (MIT).
  Keep the LICENSE and credit the engine in README.md.
- data/lyrics.json and data/audio.json: word timings and beats (produced by the analysis step,
  see analysis/README-whatif.md).
- reference/handbook-contents-photo.png: the contents page the song comes from.
- The original pdoom scenes are NOT in this repo on purpose. Do not fetch or copy them; write every
  scene from scratch for this song. You may read the pdoom repo's engine docs online for API
  questions only.

## Phase 1 scope
1. **Engine port.** app/src/main.ts and app/src/timeline.ts still reference pdoom scenes and data.
   Make the app load our song (audio/whatif.mp3), our data, our palette (TREATMENT "Palette") and
   our timeline (chapters in TREATMENT "Chapters"; boundaries from lyric lines snapped to beats,
   the way the old timeline did). Remove pdoom-specific names (P(doom) HUD, plates.json, the
   `public/plates` montage) or make them inert. Scenes that don't exist yet render a placeholder:
   the chapter's contents entry (caps heading + dotted leader + red page number) with its karaoke
   per word, so the whole song is watchable end to end from the start.
2. **Shared motifs module** (`app/src/scenes/_motifs.ts`): contents entry with dotted leader and
   per-word karaoke; red page counter with page-flip; WHAT TO DO panel (numbered steps typed on
   beats, supports a blank step and a glitching step); annotation callout (dotted leader from a 3D
   point to a mono label); flashlight cone (warm light that reveals line geometry, with flicker and
   die); the child figure (raincoat silhouette, no face) and the lantern-drone, both original
   designs per TREATMENT; haze/fog planes, rain lines and wet-ground reflections for the city;
   the city system line (small screen text). Every later chapter uses these.
3. **Chapters `book` and `lost`**, fully, as TREATMENT describes.

## Acceptance (check before you report)
- Every chapter still must pass TREATMENT's two tests (child test, adult test); say in the report how
  `book` and `lost` pass each.
- `cd app && bunx vite` serves, and a headless render of stills works:
  `bun scripts/render.ts stills` (or `sheet --cuts`) produces frames for every chapter boundary.
  Look at the stills yourself (read the PNGs) and fix what's wrong before reporting.
- Karaoke: for 3 words across the song, render the frame 0.1 s before and 0.1 s after the word's
  `start` from data/lyrics.json and show the highlight changes on the right side only.
- A short draft render of `book` + `lost` with audio: `bun scripts/render.ts video --samples 4
  --from 0 --to <end of lost> --out ../out/draft-book-lost.mp4` (out/ is gitignored).
- No network uploads. Do not open any browser window on the desktop; headless Chrome from the
  render script is fine. Run renders with `nice -n 19 ionice -c3`.

## Report
Commit sha(s), the chapter table with start/end times from the timeline, paths of the contact sheet
and the draft video, what you could not do, and any TREATMENT changes you propose.
