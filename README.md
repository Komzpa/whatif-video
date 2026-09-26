# What if — a code-rendered music video

Song: "What if" by komzpa (`audio/whatif.mp3`, lyrics in `lyrics/lyrics.txt`, the author's own text).
Concept, palette, type and chapters: `docs/TREATMENT.md`. Build scope: `docs/BUILD-BRIEF.md`.

The video is a web app (`app/`, TypeScript + three.js, bun + Vite). It renders any song time
deterministically at 1920×1080 (or 3840×2160 with `--scale 2`); the same code drives the live
preview and the offline export.

## Engine credit

The engine (`app/src/engine/*`, `app/scripts/render.ts`) and the analysis pipeline (`analysis/`)
are forked from [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT, commit in
`reference/pdoom-video-commit.txt`; see `LICENSE`). None of the pdoom scenes, lyrics or plate designs
are used: every scene here is written from scratch for this song. Engine API notes for scene
authors: `docs/ENGINE.pdoom.md` (written for pdoom; the P(doom) HUD, plates and the spark/mask motifs
it mentions were removed in this fork, see below).

## Layout

- `data/lyrics.json`, `data/audio.json`: word timings, beats and chapter sections (from `analysis/`).
  The dev server serves `data/` and `audio/` from the repo root; `app/src/data-fallback/` would stand
  in for a missing data file.
- `app/src/contents.ts`: the contents table (lyric line → chapter → page → the heading as printed in
  the handbook, plus the introduction row, p. 12). The only place that maps lines to pages; the
  printed heading is shown small under each sung line as the translation note (TREATMENT r4).
- `app/src/timeline.ts`: one entry per chapter; boundaries come from `data/audio.json` sections
  (the downbeat at or before each chapter's first line). A chapter without its own scene module
  plays `scenes/placeholder.ts` (its contents entry, sung word by word, and the page counter).
- `app/src/scenes/_motifs.ts`: shared motifs used by every chapter — contents entry with dot leader
  and per-word karaoke, red page numbers and the split-flap page counter, WHAT TO DO panel,
  callouts, the lamp (volumetric cone, CPU line lighting, flicker/die), the child and the
  lantern-drone (incl. the child from behind holding the book), sky/fog/rain/glows/wet reflections,
  depth kit (`FogCards` layered haze that parallaxes, `LightShafts`, `NeonSign` with flicker and a
  wet-ground reflection), city blocks with thousands of lit windows and megastructure light strips,
  system lines and signage, and the `CityScene` base class.
- `app/src/scenes/book.ts`: the intro (the handbook's introduction, p. 12): crane and dolly out of a
  canyon street over the bridge, the child and the drone from behind with the book, the contents page.
- `app/src/scenes/lost.ts`: p. 22 the unmapped district (street level, then the drone's map with the
  grey unmapped area) and p. 26 inside the train car (the doors close on "closed" before the child
  gets off).

## Running

```sh
cd app
bun install
bunx vite                                  # preview at the printed URL (?t=12.5 to seek)
bun scripts/render.ts stills --t 5,14 --out ../out/stills
bun scripts/render.ts sheet --cuts --out ../out/sheets/cuts.png   # 4 frames around every chapter cut
nice -n 19 ionice -c3 bun scripts/render.ts video --samples 4 --from 0 --to 23.793 --out ../out/draft-book-lost-r2.mp4
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
