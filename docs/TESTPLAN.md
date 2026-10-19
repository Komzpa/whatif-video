# What if — test plan for every draft shown to the author

A draft reaches the author only after every gate below passes, in order. A failed gate stops the pipeline:
fix, then restart from that gate. The lead (not the builder) runs gates 5 and 6 and opens the file.

## Acceptance scenario (fixed)
The author opens `out/whatif-video-draft-<chapter>-<date>-rN.mp4` and `…-rN-tiktok.mp4` in Chrome and watches
each once, with sound. After one viewing:
- they can retell what happened to the child, beat by beat, without reading the lyric;
- they never think "that's a UI", "that's a sticker", "that's Kenny" or "that's a cannon";
- every frame they pause on is worth a screenshot.

## Regression list (every item is a past rejection by the author; each has a check below)
| # | Rejected | Date | Check |
|---|---|---|---|
| R1 | Text flashes and disappears before it can be read | 26.09 | A1 |
| R2 | The hero looks like Kenny from South Park | 26.09 | B2, C |
| R3 | Time spent on the book; then the whole cut built on the book | 26.09, 27.09 | A2 |
| R4 | The city map is inconsistent between shots | 26.09 | A5 |
| R5 | The missed stop is not woven into "lost" | 26.09 | C |
| R6 | The drone kills the lost/helpless mood | 26.09 | A6 |
| R7 | "No one stays" has no one alive to leave | 26.09 | C |
| R8 | Tube arms with glove claws ("cannons with crooked cannonballs") | 27.09 | B1 |
| R9 | The roller shutter is a floating slab with a gap | 27.09 | B3 |
| R10 | Overlays pile up: counters, map, callouts, signs, lyric, title | 27.09 | A3, A4 |
| R12 | English text on screen; a grid ("квадратно-гнездовой") city | 27.09 | A13, A5 |
| R11 | In-car line map: staircase stations, labels on dots, clipped names, floating marker | 27.09 | A12, B6 |

## Gate 1: proof stills before any full render (builder)
Render single frames at 1920×1080 and 1080×1920 of every new or changed asset, alone and in its shot:
- the hand holding the torch (B1);
- the shutter half down and fully closed (B3);
- the child's silhouette in any wide shot (B2);
- one frame per new location.
The lead looks at them against section B. The full render starts only after the lead accepts the stills.

## Gate 2: automated checks (builder; `bun scripts/qa-*.ts`, both aspects, full range)
Each check must fail on the rejected draft named in its row (baseline proof) and pass on the new one.
| Id | Check | Pass | Baseline that must fail |
|---|---|---|---|
| A1 | Reading time of every line meant to be read, from fully settled to start of exit | ≥ max(1.5 s, 0.4 s + chars/14) and ≥ 0.3 s/word | lost r1 |
| A2 | Screen time of any book, page, cover, printed steps or page counter | 0 s | lost r3 |
| A3 | Non-diegetic overlays at once (lyric line counts) | ≤ 2 | lost r3 |
| A4 | Text boxes intersecting signs, boards, lyric or each other | 0 | lost r3 (≈20.5 s) |
| A5 | Every place name, line and distance on screen comes from `data/city.json`, and HOME · x km only decreases | all match | — |
| A6 | Drone objects in the scene graph | 0 | lost r2 |
| A7 | Lower 40% of the frame covered by a single prop | ≤ 20% of frames | lost r3 |
| A8 | TikTok safe area (top 150, bottom 480, right 140 px) holds every readable item; karaoke cap height ≥ 70 px | all | — |
| A9 | WCAG contrast of readable text against its local background | ≥ 4.5:1 (≥ 3:1 for text ≥ 48 px) | — |
| A10 | Loudness and sync: integrated LUFS −14 ± 1; each lyric line starts within ±60 ms of its aligned word | all | — |
| A12 | Line-map labels intersecting a station dot, the line or the board edge; stations not evenly spaced on one straight line | 0 | lost r3 (≈9 s) |
| A13 | Latin letters or box-drawing glyphs in any on-screen text outside glyph soup; every glyph-soup ('garble') string must re-derive from its logged Russian source by CP1251 read as CP1252 only (TREATMENT r9 note 1: no UTF-8 or CP866 readings), garbled whole or word by word: each word either clean or garbled whole, never a word mixing Cyrillic and Latin letters; Georgian (r9 note 2) only on background ('scenery') signs | 0 | full r3 (`7767e7d`: «Ïрîсïåêт Строèтелей», «ЗаводсÐºÐ°я» on the `lost` board, CP866 «╨Ч╨Р╨Т╨Ю╨Ф») |
| A14 | Continuity (`qa-continuity.ts`, static): child from `KID`, torch hand only via `drawTorchHand`, every cat `OUR_CAT`, the man in tease/alone/words/stranger from `STRANGER`, the home in door and close from `buildHome` (TREATMENT r8 continuity table; visual half `proof-continuity.py`) | 0 | r1 (252b4c1: 18 faults) |
| A11 | Draft identity: file name carries rN, and a `…-rN.json` next to it holds the content sha of the render inputs (code, data, audio) | present, sha differs from r(N−1) | — |

## Gate 3: visual self-check (builder)
- Make a 4×4 contact sheet at 0.5 fps per aspect, plus one still from the middle of every transition.
- Fix muddy double exposures (use a staggered out/in or a dip), collisions, overflow and low contrast.
- Answer in the report, per sheet: "story or UI?" and "which frame would I post?".

## Gate 4: render and poster (builder)
Render both aspects. Pick the strongest settled frame as the poster and bake it as frame 0, keeping duration and
audio unchanged (brag step 4). Report paths, sizes, QA output, sheet paths, known flaws.

## Gate 5: stranger test (lead dispatches a fresh Sonnet reviewer who has not seen the treatment)
Give the reviewer only the contact sheets and the transition stills, without the lyric or TREATMENT. It must:
- retell the story beat by beat;
- name anything that reads as UI, a sticker, a cartoon clone or a physically impossible object.
Pass: the retelling matches the chapter's beats in TREATMENT and no regression item is named.

## Gate 6: the lead's look (lead)
The lead watches both files in full and checks section B and C by eye.
Only then open them for the author, saying which version changed and what changed since the last verdict.

## B. Asset checklist (by eye at gates 1, 3 and 6)
- **B1 Hands.**
  - A child's raincoat sleeve that tapers to a cuff and a wrist.
  - Palm, four fingers and a thumb wrapped around the torch.
  - The beam leaves the lens along the torch axis.
  - Shaded by the torch spill and ambient light like the scene.
  - ≤ 25% of the frame. No mitten, no glove, no thumbs-up, no cylinder.
- **B2 The child.**
  - A child's proportions, about 4.5 heads tall.
  - Seen from behind or in silhouette; no face.
  - Never a round head on a round body.
- **B3 Roller shutter.**
  - The drum housing sits on the lintel, with guide rails on both sides.
  - Corrugated slats fill the opening edge to edge.
  - It comes down out of the drum inside the rails, slows near the floor and lands on a beat with no gap.
  - Signs are on the wall above it; only a taped notice is on the slats.
- **B4 Signs in unfamiliar districts.**
  - Garbled script, generated from `city.json`.
  - A callout gives the translation only where the story needs it.
- **B5 Scale and depth.**
  - Every object stands on something: floor, wall, rails.
  - Nothing is a flat card in front of a void.

- **B6 Line map board.**
  - One straight line with evenly spaced stations.
  - Labels on one side at 45°, or strictly alternating, never clipped.
  - Passed stations grey, the current/next one a ring with the direction arrow on the line.
  - Garbled script only past the child's stop.
  - Shot nearly frontal and readable.

## C. Story checklist per chapter (by eye at gates 5 and 6)
- The chapter's beats, as listed in TREATMENT, are each a full-frame event, in order.
- The first 2 seconds hook: something happens to the child; the video never opens on a title card or a book.
- The mood is lost and helpless. No adult proxy (drone, helper UI) solves anything for the child.
- A living creature is present where TREATMENT requires one (the cat through temp, storm and tease; it leaves on
  "No one stays"; r8: it is also seen waiting at home in our window in `door`, and greets the child in `close`).
- Every frozen frame is worth posting (brag's "every frame postable").
