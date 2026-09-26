# What if — a code-rendered music video

Song: "What if" by komzpa (`audio/whatif.mp3`, lyrics in `lyrics/lyrics.txt`, the author's own text).
Concept, palette, type and chapters: `docs/TREATMENT.md`. Build scope: `docs/BUILD-BRIEF.md`.

The video is a web app (`app/`, TypeScript + three.js, bun + Vite). It renders any song time
deterministically at 1920×1080 (or 3840×2160 with `--scale 2`), and as a native vertical cut at
1080×1920 (`--aspect 9:16`, each scene frames its own shots for it, TREATMENT r5 item 7); the same
code drives the live preview (`?aspect=9:16`) and the offline export.

## Engine credit

The engine (`app/src/engine/*`, `app/scripts/render.ts`) and the analysis pipeline (`analysis/`)
are forked from [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT, commit in
`reference/pdoom-video-commit.txt`; see `LICENSE`). None of the pdoom scenes, lyrics or plate designs
are used: every scene here is written from scratch for this song. Engine API notes for scene
authors: `docs/ENGINE.pdoom.md` (written for pdoom; the P(doom) HUD, plates and the spark/mask motifs
it mentions were removed in this fork, see below).

## Layout

- `data/lyrics.json`, `data/audio.json`: word timings, beats and chapter sections (from `analysis/`).
  The dev server serves `data/` and `audio/` from the repo root; `app/src/data-fallback/` stands in
  for a missing data file.
- `data/city.json`: the one city (TREATMENT r5 item 4): districts, water, LINE 3 and its stations in
  order (with YOUR STOP), home, the unmapped area, the restricted zone, the walking route home and each
  chapter's stop on it. Until the data step writes `data/city.json`, the app lane's stand-in
  `app/src/data-fallback/city.json` is served in its place. `app/src/city.ts` loads it at boot and is
  the only reader: lookups, the route length and `HOME · x km` per chapter, the map drawing
  (`drawCityMap`), and `garble()`, the deterministic broken-encoding glyph soup of the unfamiliar city.
- `app/src/contents.ts`: the contents table (lyric line → chapter → page → the heading as printed in
  the handbook, plus the introduction row, p. 12). The only place that maps lines to pages; the
  printed heading is shown small under each sung line as the translation note.
- `app/src/timeline.ts`: one entry per chapter; boundaries come from `data/audio.json` sections, except
  the book card (ends on the last beat before 3 s) and `lost`, which runs on to the beat before the
  next line. A chapter without its own scene module plays `scenes/placeholder.ts`.
- `app/src/textlog.ts`: every text item a frame draws (kind, full visibility, box) for the QA script.
- `app/src/scenes/_motifs.ts`: shared motifs — contents entry with dot leader and per-word karaoke,
  red page numbers and the split-flap page counter, callouts, first person (`drawPOV`: the child's
  yellow sleeves and hands, the handbook, the torch; `drawHandbookSpread`: the printed page with
  WHAT TO DO typed as the eye reads it), the torch (volumetric cone, CPU line lighting, flicker),
  sky/fog/rain/glows, depth kit (`FogCards`, `LightShafts`, `NeonSign` incl. dot-matrix `led` boards
  with a clean header), city blocks, system lines and signage, and the `CityScene` base class. Every
  text helper reports to the text log. (The old drone and third-person child drawings are unused.)
- `app/src/scenes/book.ts`: the title card (≤ 3 s): the cover, then the contents spread flashes and
  the red 12 lifts into the page counter.
- `app/src/scenes/lost.ts`: one first-person sequence: the train on LINE 3, the doors close at YOUR
  STOP, the display's names turn to glyph soup, out at the last station in the unmapped district, the
  map card (AREA NOT MAPPED, the route back to YOUR STOP), the shutter comes down on "closed", the map
  recalculates through the restricted zone, `HOME · 6.4 km`, and in through the zone's gate.

## QA

```sh
cd app
bun scripts/qa-reading-time.ts --from 0 --to 26.4                  # 16:9
bun scripts/qa-reading-time.ts --from 0 --to 26.4 --aspect 9:16    # the vertical cut, plus its safe area
```

Reading time (every text fully visible ≥ max(1.5 s, 0.4 s + chars/14); karaoke, counter and props
exempt; glyph soup ≥ 1.5 s), city names (every place on screen exists in city.json) and, for the
vertical cut, the TikTok safe area (top 150, bottom 480, right 140 px; karaoke cap height ≥ 70 px).
Exit code 1 lists each offender with its shortfall; `--debug <text>` prints per-frame visibility.

## Running

```sh
cd app
bun install
bunx vite                                  # preview at the printed URL (?t=12.5 to seek)
bun scripts/render.ts stills --t 5,14 --out ../out/stills
bun scripts/render.ts sheet --cuts --out ../out/sheets/cuts.png   # 4 frames around every chapter cut
nice -n 19 ionice -c3 bun scripts/render.ts video --samples 4 --from 0 --to 26.4 --out ../out/draft-lost-r3.mp4
nice -n 19 ionice -c3 bun scripts/render.ts video --aspect 9:16 --samples 4 --from 0 --to 26.4 --out ../out/draft-lost-r3-tiktok.mp4
```

`render.ts` starts its own Vite server without live reload (or uses `--url`). On Linux, headless
Chrome gets hardware WebGL2 only through ANGLE on EGL; the script selects NVIDIA's EGL vendor when
present (`/usr/share/glvnd/egl_vendor.d/10_nvidia.json`) and prints the WebGL renderer it got.
`--swgl` forces software WebGL (SwiftShader); `--angle <backend>` picks another ANGLE backend.

## Changes to the forked engine

- Palette replaced with the TREATMENT palette (GLSL gets `C_<NAME>` for every key).
- P(doom) HUD readout, `plates.json`, the `plates` render mode and `public/plates` removed; the HUD
  keeps only the (off by default) crop marks and optional captions.
- The app loads `audio/whatif.mp3`; the export API is `window.__video`; the env switch is `VIDEO_NO_HMR`.
