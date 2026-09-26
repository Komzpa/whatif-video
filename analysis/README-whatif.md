# "What if" analysis pipeline

This `analysis/` directory started as a copy of `mexicat/pdoom-video`'s pipeline
(MIT), written for a different song ("P(doom)") and for macOS (`mlx-whisper` on
Apple Silicon). This note is what was run and changed to produce
`data/lyrics.json` and `data/audio.json` for **"What if"** (`audio/whatif.mp3`,
176.28 s, komzpa) on this Linux box (RTX 5070 Ti).

## What was run

```
cd analysis
uv sync                              # deps (mlx-whisper dropped, numba added)
ffmpeg -i ../audio/whatif.mp3 -ar 44100 -ac 2 work/whatif.wav   # gapless decode
python -m demucs -n htdemucs -d cuda -o stems work/whatif.wav   # 15s on GPU
uv run python ctc_emissions.py       # MMS_FA + wav2vec2-lv60k, mono+L+R (GPU)
uv run python vocal_feats.py         # RMS/pitch/onset features, 5 ms hop
uv run python whisper_run.py         # whisper.cpp large-v3 cross-check
uv run python align.py               # -> ../data/lyrics.json
uv run python analyze.py             # -> ../data/audio.json
cd ../app && bun install && bun run scripts/verify_data.ts   # loads both JSONs
```

## What changed from the pdoom pipeline

- **`mlx-whisper` -> whisper.cpp.** pdoom's `whisper_run.py` called
  `mlx_whisper.transcribe` (Apple-only). This machine has no mlx; `whisper_run.py`
  now shells out to `whisper.cpp`'s `whisper-cli` (`ggml-large-v3.bin`, already
  built at `/home/kom/.openclaw/local/whisper.cpp`) with `-ml 1 -ojf` and
  reconstructs words from its per-BPE-token JSON (a new word starts at a token
  whose text has a leading space, the standard tokenizer word-boundary marker).
  Run **without** an `--prompt`: an early attempt with the full lyric text as
  the initial prompt made whisper.cpp recite the prompt instead of listening to
  the first ~30 s of real audio (a known failure mode when the prompt echoes
  the expected transcript too closely) -- dropping the prompt gave a clean,
  correctly-ordered 113-word transcript across the whole song.
- **No stem-time offset.** pdoom ran Demucs on the raw `pdoom.mp3` and had to
  measure/undo the mp3 decoder's own timing vs. the "gapless" reference decode
  (LAME encoder delay, ~23 ms). Here, `ffmpeg -i whatif.mp3 ... whatif.wav`
  decodes gaplessly first (verified: 176.280 s, matching the source's reported
  duration exactly), and Demucs runs on that WAV -- so stem sample 0 already
  equals song time 0, no correction needed. `common.STEM_OFFSET_SEC` is kept
  at 0 rather than removed, for anything still written against the pdoom API.
- **No karaoke "lead" stem.** pdoom ran an extra mel-band-roformer model to
  isolate a single lead vocal for its double-tracked final chorus. Not needed
  here (no such passage); `ctc_emissions.py`/`align.py` fuse MMS_FA +
  wav2vec2-lv60k on the Demucs vocal stem's mono sum, left and right channel
  only (`fused6` = 6 emissions: 2 models x {mono, L, R}).
- **`pron.py`** dropped pdoom's acronym/odd-word spelling dict (AGI, P(doom),
  NVDA, ChatGPT, ...) -- this song's lyrics have no acronyms or parenthesised
  words, so every token falls through to the generic letters-only rule.
- **13 lines, not 46; no bar-numbered verse/chorus form.** pdoom's lyrics are
  46 lines across a verse/pre/chorus/bridge form with a known chord chart
  (its own producer knew the DAW tempo and where "DOOM" lands on which bar).
  "What if" is 13 short sung lines, one per handbook page reference (see
  "Sung line split" below), with no repeated chorus and no chord chart handed
  to this pipeline. `align.py`'s `LINE_WINDOWS` (rough per-line time windows)
  come from `analysis/whisper-cpp-large-v3-segments.json` (the mix-based
  whisper.cpp reference already in the repo) instead of manual inspection of a
  known song structure; `analyze.py`'s sections are built at runtime from the
  aligned line starts snapped to the nearest downbeat, not a hand-authored
  `SECTION_BARS` bar-number table.
- **Tempo search range.** pdoom hardcoded 125-138 BPM (known DAW tempo). Here
  a blind 50-200 BPM onset-alignment search found candidates at 74 BPM and its
  octaves 37/148/222 (the classic tempo-tracking ambiguity: a sparser grid
  scores higher almost for free). 74 BPM was picked because (a) fitting the
  sparse kick onsets to a 74 BPM grid gives low jitter (13 ms std over 65
  kicks) with a self-consistent kick-onset phase, and (b) it matches the
  treatment's "slow and spacious" description (148 BPM would read as a
  moderately fast pop tempo, not a ballad). `analyze.py`'s search range is now
  `BPM_LO, BPM_HI = 60.0, 90.0`, documented at the point of use.
- **Downbeat phase found automatically, not by ear.** pdoom's chord chart told
  it which beat is bar 1. Here, `analyze.py.pick_downbeat_phase()` computes
  beat-synchronous chroma on the bass+other stems and picks the beat-mod-4
  phase with the highest frame-to-frame chroma novelty (chord changes land on
  downbeats): phase 1 scored 0.30 vs. 0.035-0.095 for the other three phases,
  a clear winner.
- **Sections are chapter-based, not verse/chorus-based**, matching
  `docs/TREATMENT.md`'s chapter table (`book, lost, door, dogs, cat, temp,
  storm, tease, alone, words, stranger, dark, close`) -- see "Sections" below.
- Two small QA-plot cosmetic fixes (`qa_plot.py`, `zoom.py`): the hardcoded
  "132 BPM" grid overlay and a `alt["fused_lead"]` plot line that referenced
  the (here nonexistent) lead stem were updated/removed.

## Sung-line split

`lyrics/lyrics.txt` groups the words into stanzas separated by blank lines,
but stanza breaks don't always match sung-phrase breaks. The 13 sung lines
(one per handbook page reference in `docs/TREATMENT.md`'s chapter table: 22,
26, 32, 40, 48, 52, 62, 70, 7·, 8·, 10·, 11·, 13·) are:

```
 0. You are lost.                                    (p.22)
 1. You missed the stop, the metro closed.           (p.26)
 2. You're home alone, the doorbell rings.            (p.32)
 3. Stray dogs cross your path at night.              (p.40)
 4. Your cat is stuck up in a tree.                   (p.48)
 5. It's far too hot.                                 (p.52)
 6. It's far too cold.                                (p.62)
 7. The weather turns, it feels unsafe.               (p.70)
 8. They tease you, laugh, they call your name.       (p.7·)
 9. No one stays. No one's your friend.               (p.8·)
10. They hurt you more than words can say.            (p.10·)
11. A stranger won't leave you alone.                 (p.11·)
12. You're scared of dark and things you can't see.   (p.13·)
```

Two of `lyrics.txt`'s stanzas (the "lost" stanza: "You are lost." / "You
missed the stop, the metro closed."; and the "temp" stanza: "It's far too
hot." / "It's far too cold.") each hold **two** sung lines, one per page
(22/26, 52/62). The final stanza ("You're scared of dark" / "and things you
can't see.") is the opposite case: two *text* lines (wrapped for readability)
that are **one** sung line/page (13·) -- confirmed by the CTC alignment (no
line-window needed to force a split) and by both whisper.cpp cross-checks,
which transcribe it as one continuous phrase. `common.py`'s `LYRICS_LINES`
hardcodes this 13-line split (`load_lyrics_src()` returns it with dummy
start/end placeholders, matching the pdoom API which ignores those two
fields).

## Alignment: line/word timings

`data/lyrics.json` word count matches `lyrics/lyrics.txt` word-for-word (83
words, verified programmatically), every word has `start < end`, and starts
are monotonic across the whole song.

| # | start | end | text |
|---|------:|----:|------|
| 0 | 13.410 | 15.605 | You are lost. |
| 1 | 15.680 | 21.835 | You missed the stop, the metro closed. |
| 2 | 26.380 | 35.055 | You're home alone, the doorbell rings. |
| 3 | 39.760 | 47.756 | Stray dogs cross your path at night. |
| 4 | 52.810 | 63.052 | Your cat is stuck up in a tree. |
| 5 | 66.120 | 69.736 | It's far too hot. |
| 6 | 69.736 | 74.236 | It's far too cold. |
| 7 | 79.395 | 89.621 | The weather turns, it feels unsafe. |
| 8 | 89.621 | 111.636 | They tease you, laugh, they call your name. |
| 9 | 112.070 | 120.531 | No one stays. No one's your friend. |
| 10 | 124.542 | 137.093 | They hurt you more than words can say. |
| 11 | 137.662 | 146.452 | A stranger won't leave you alone. |
| 12 | 150.620 | 158.729 | You're scared of dark and things you can't see. |

The song has ~13 s of instrumental intro before the vocal enters (line 0
starts at 13.41 s, not ~0 s despite `whisper-cpp-large-v3-segments.json`'s
mix-based segment starting its "0.00-21.94" guess at 0.00 -- whisper's
segment-level timestamp for the very start of a track is not reliable; the
CTC path and the isolated-clip whisper.cpp re-checks below both agree on
~13.4 s).

### A real placement bug, found and fixed

The first unconstrained run placed line 8 ("They tease you, laugh, they call
your name.") entirely inside 98.6-111.6 s, an implausibly compressed 3.2 s for
"They tease you, laugh," (4 tokens + 2 comma-pauses), while nothing in 85.7-98.6
s was attributed to any lyric word at all. Diagnosis: the vocal-stem RMS never
drops during that stretch (continuous legato singing / reverb tail, no clean
silence), so `refine()`'s end-of-word heuristic (extend until RMS drops 15 dB
or the next word starts) had nothing to stop on, and separately the Viterbi
path found stronger evidence for "they call" at ~102 s than for "they tease"
earlier, pulling the whole first half of the line later.

Two independent whisper.cpp re-transcriptions of isolated clips (83-102 s and
88-113 s, run *without* any full-song context) both put a "They" utterance
around 88-94 s -- inconsistent with each other on exact word-internal timing
(whisper's cross-attention timestamps are not a real forced aligner,
especially over held notes), but consistent on the outer edge. Independently,
raw onset+sibilance features (not whisper, not the CTC language model) show a
strong, unambiguous /t/-/z/ affricate spike at 98.3-99.5 s -- i.e. "tease"
really does start there. Conclusion: "they" (first) is sung around 89.6-92 s,
followed by ~6 s of held/wordless vocal (possibly a sustained "they" tail,
possibly a backing ad-lib -- genuinely ambiguous from the signal alone) before
"tease" begins at 98.6 s. `align.py`'s `ANCHORS` and `FIX` now encode this:
"they" (first) is anchored to 88-95 s and manually capped to `end=92.0` (conf
0.4, i.e. flagged low -- the exact cutoff is a judgement call); the 92.1-98.33
s remainder shows up in `data/lyrics.json["extras"]` as unlisted vocal
activity rather than being silently absorbed into "they"'s displayed
duration. "unsafe." (line 7's last word), which had been stretched by the same
mechanism all the way to 98.2 s, correctly snapped back to 89.621 s once
"They"'s start moved earlier.

### Low-confidence words (conf < 0.6)

| word | start-end | conf | how checked |
|---|---|---|---|
| They (l.8, first) | 89.621-92.000 | 0.40 | manual `FIX`, see above; onset/sibilance-confirmed boundary with "tease", but the they/hold cutoff itself is a judgement call |
| name. (l.8, last) | 106.060-111.636 | 0.55 | agrees with `whisper-cpp-large-v3-segments.json`'s mix-based "101.76-111.54 They call your name" end; end likely runs a little into the following instrumental (same RMS-never-drops effect as "unsafe.", but here word identity/order is not in doubt) |
| one's (l.9) | 115.780-118.180 | 0.47 | isolated-clip whisper.cpp re-check (1.5 s clip around 116.9 s) returned "Amen." -- not useful; flagged for manual listening before use in the video |
| won't (l.11) | 140.460-141.200 | 0.53 | isolated-clip whisper.cpp re-check (1.5 s clip around 140.5 s) returned "Angel only." -- not useful; flagged for manual listening before use in the video |

`data/lyrics.json["extras"]` lists one unlisted-vocal region: `92.1-98.33 s`
(the "they"/held-note tail discussed above).

### Spot-checks (acceptance criterion)

Each target word's 1.5 s clip (`[start-0.75, start+1.5]`, clamped to the vocal
stem's 16 kHz mono track `analysis/work/vocals16k.wav`) was transcribed with
`whisper-cli -m ggml-large-v3.bin` fresh (no prior text/prompt context):

| word | our start | clip | whisper.cpp heard | verdict |
|---|---:|---|---|---|
| first word "You" | 13.410 | 12.66-14.16 | "You are loved." | match ("You" onset correct; "lost"->"loved" is the usual whisper mis-hearing on a 1.5 s fragment) |
| "cat" | 53.220 | 52.47-53.97 | "Your car." | close match (same onset consonant/vowel; final /t/ dropped in a clipped fragment) |
| "unsafe" | 85.730 | 84.98-86.48 | "unsaid." | close match (same "un-s-" onset, confirms timing) |
| "friend" | 118.396 | 117.65-119.15 | "your friends." | match (singular/plural only) |
| last word "see" | 157.826 | 157.08-158.58 | "can't see" | exact match, including the preceding word |

All five land the target word at or very near the clip center as expected,
confirming the CTC-aligned starts are accurate to within roughly the clip's
0.75 s half-window (in practice the two "exact"/"match" cases and the
onset+sibilance cross-checks above suggest actual accuracy is much tighter,
tens of ms, away from the two flagged held-note regions).

## `data/audio.json`

- **Tempo**: 73.981 BPM, constant (period 0.81102 s = 60/73.981, exact by
  construction). 218 beats, 55 downbeats (every 4th beat, phase 1, see
  above).
- **Drums are silent for most of the song**: the drums stem's RMS is ~-70 dB
  (noise floor) for 0-80 s and after ~155 s, and only real (~-25 dB) from
  ~80 s to ~155 s -- i.e. percussion plays under `storm`..`dark` only. Kick/
  snare/hat onset counts (131/51/71) are correspondingly small and
  concentrated in that window; the beat/downbeat grid itself still covers the
  whole song (fitted mainly on the mix onset envelope where drums are silent).
- **Sections** (13, chapter-based per `docs/TREATMENT.md`, each starting at
  the downbeat at-or-before its first line's aligned start, contiguous,
  covering `[0, 176.28)` with no gaps):

| section | start | end |
|---|---:|---:|
| book | 0.000 | 10.817 |
| lost | 10.817 | 23.793 |
| door | 23.793 | 36.770 |
| dogs | 36.770 | 49.746 |
| cat | 49.746 | 65.966 |
| temp | 65.966 | 78.943 |
| storm | 78.943 | 88.675 |
| tease | 88.675 | 111.384 |
| alone | 111.384 | 124.360 |
| words | 124.360 | 137.336 |
| stranger | 137.336 | 150.312 |
| dark | 150.312 | 160.045 |
| close | 160.045 | 176.280 |

- **Envelopes**: `rms/low/mid/high` (full mix) + `vocal/drums/bass/other`
  (Demucs stem RMS), 100 fps, 17628 samples each, each clipped to its own 99th
  percentile in `[0, 1]`. Same method as pdoom (unchanged).
- **Onsets**: `kick`/`snare`/`hat` (drums stem, same band-attack heuristics as
  pdoom; sparse and only present ~80-155 s here, see above) and `vocal` (210
  note onsets from the vocal stem, spectral-flux peaks + legato pitch jumps).

## Verification (acceptance)

- `python3` check: every `lyrics/lyrics.txt` word (83, normalized) appears in
  `data/lyrics.json` in order, all `start < end`, starts monotonic. Pass.
- `data/audio.json` sections cover `[0, 176.28)` contiguously (each section's
  `start` equals the previous section's `end`; last section's `end` equals
  `duration`). Pass.
- `cd app && bun install && bun run scripts/verify_data.ts`: loads both JSON
  files through the actual engine classes (`Lyrics`, `AudioData` from
  `src/engine/lyrics.ts`/`audio.ts`), exercises `findWords`, `get`, `wordAt`,
  `wordProgress`, `sample`, `beatAt`, `barAt`, `section`, `hit`, `events`, and
  re-checks the section-contiguity/word-monotonicity invariants from inside
  the engine's own types. Exits 0, no errors.
