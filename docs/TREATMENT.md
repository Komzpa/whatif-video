# What if — treatment and style bible

Song: `audio/whatif.mp3`, "What if" by komzpa, 2:56. Lyrics: `lyrics/lyrics.txt` (the author's own text).
Engine: forked from mexicat/pdoom-video (MIT, commit in `reference/pdoom-video-commit.txt`); see `docs/ENGINE.pdoom.md`.
Nothing from the pdoom video's scenes, lyrics or plate designs is reused; only the engine
(timeline, post, type, lines, HUD, render script) and the analysis pipeline.

## Where the song comes from (the viewer must get this in the first 15 seconds)

The lyric is the table of contents of a Russian children's safety handbook, "What to do if…".
Each chapter is a situation a child might face: you got lost, you missed your metro stop, you are
home alone and the doorbell rings, stray dogs, a cat up a tree, heat, cold, bad weather, teasing,
no friends, being hurt, a stranger, fear of the dark. The joke that started it: remove the page
numbers and the contents page reads like a sad indie song. The song takes that literally.

What makes it a song and not a list: the order. It starts with practical accidents (a missed stop,
a cat), passes through weather, and ends with loneliness, cruelty and fear. A handbook has an answer
page for each. The song never turns to the page. The video turns to it every time, and the answers
stop working.

## The idea in one paragraph

The video is **the handbook rebuilt as a night-time 3D interface**. Every chapter is a dark 3D
scene that a **flashlight** explores: its cone reveals wireframe geometry, and an annotation layer
labels what the light finds (sci-fi / cyberpunk HUD built from the book's own typography). Each
chapter carries a **"WHAT TO DO" panel**: short numbered instructions, written in the dry, kind voice
of a children's safety book. In the first half the instructions are useful and a little funny. From
"They tease you" on, the procedures begin to fail: steps that don't fit, "see page 84", pages that
are missing, a panel that can't find words. In the last chapter the flashlight dies, and the only
light left is a small night-light.

## Signature devices (what makes it this song's video, not a generic HUD video)

1. **The dot leader.** `YOU ARE LOST ............ 22`. The contents page's dotted leader is the
   whole UI language: every callout line is a dotted leader that ends in a **red page number** or a
   label. Leaders draw in dot by dot on the beat.
2. **Page numbers are the clock.** The numbers the joke removed come back as the HUD's chapter
   counter (large red numerals, page-flip digit change at each chapter cut). Known pages from the
   photo: 22, 26, 32, 40, 48, 52, 62, 70. The photo cuts off the rest (7·, 8·, 10·, 11·, 13·); we show
   them as numbers that run off the page edge, the last digit clipped by the frame. That is honest
   and it becomes a motif: as the song gets heavier, the numbers are harder to read.
3. **The flashlight.** One warm cone of light, the only light source in most scenes. It sweeps on
   beats and snaps to what the lyric names (the door, the dogs' eyes, the cat). It flickers on
   "unsafe" and dies on "dark".
4. **WHAT TO DO panel.** Bottom-right, mono, numbered steps typed in step by step. Our own text, never
   copied from the book. It explains the scene to a viewer who doesn't know the premise, and it
   carries the emotional arc (see per-chapter notes).
5. **The book itself** frames the video: we open on the handbook in 3D, and we close it at the end.

## Tone

- Melancholic, tender, a little funny. The HUD is a child's idea of a serious machine: precise,
  earnest, slightly absurd ("CAT ALTITUDE 4.6 m").
- Motion follows the song: the music is slow and spacious, so camera moves are long, eased and
  continuous; cuts land on downbeats and chapter boundaries; small HUD elements tick on beats.
  Nothing frantic. The heaviest visual change is saved for the last chapter.
- Always something to read: every scene has at least three annotations that explain what is shown.
  A viewer with no context should be able to follow the premise from the screen alone.
- Not slop: no purple/cyan neon, no code rain, no glowing brains, no lens-flare soup, no stock
  "sad child" imagery, **no human faces or figures drawn realistically**. People are nodes,
  silhouettes made of lines, or implied (a shadow under a door, a name label). All drawings original.

## Palette

The book's own: the contents page is off-white paper, black condensed caps, **red page numbers**.
- **night** `#07090D` background, **night2** `#10141B` panels
- **paper** `#EDE6D6` book pages, main type
- **ink** `#16140F` type on paper scenes
- **red** `#D7362B` page numbers, the sung word's highlight, warnings (the only saturated hue)
- **torch** `#FFE3A8` the flashlight cone and the night-light (the only thing that blooms)
- **steel** `#6D7682` wireframes, secondary HUD; **fog** `#2A313B` far geometry
Paper chapters (the open, the contents page, "no one stays") invert to paper background, ink lines.

## Typography

- **Archivo condensed** (width 62, weight 800–900, all caps): the book's chapter headings, the sung
  line. Animate width: held notes stretch ("unsafe", "alone"), pressure condenses.
- **IBM Plex Mono**: HUD, labels, WHAT TO DO steps, page references, measurements.
- **Cormorant Garamond italic**: very rare; the handbook's title page and the last line.
- The dotted leader is typeset with Plex Mono periods, spaced exactly.

## Karaoke rules

- Every lyric word appears or highlights at its aligned `start` (`data/lyrics.json`), never before
  its voice; dim anticipation up to 0.4 s early is fine.
- The sung line is always typeset **as a contents entry**: caps heading + dotted leader + red page
  number. Where it sits changes per scene (on a metro sign, in a peephole, on a thermometer scale,
  as a node label), but it is always the same entry format, so the premise stays visible.
- Keep lyric text inside title-safe (≥ 96 px from the edges) and clear of the HUD panels.

## Structure

Exact section times come from `data/audio.json` and `data/lyrics.json`. Whisper's rough line times
(large-v3, `analysis/whisper-cpp-large-v3-segments.json`) put the first line near 0–22 s and the last
near 2:30–2:38, with instrumental space between lines. Whisper hallucinated repeats after 2:38;
ignore them.

## Chapters (scene modules in `app/src/scenes/`)

| id | lyric | page |
|---|---|---|
| `book` | intro (instrumental) | cover, contents |
| `lost` | You are lost. You missed the stop, the metro closed. | 22, 26 |
| `door` | You’re home alone, the doorbell rings. | 32 |
| `dogs` | Stray dogs cross your path at night. | 40 |
| `cat` | Your cat is stuck up in a tree. | 48 |
| `temp` | It’s far too hot. It’s far too cold. | 52, 62 |
| `storm` | The weather turns, it feels unsafe. | 70 |
| `tease` | They tease you, laugh, they call your name. | 7· |
| `alone` | No one stays. No one’s your friend. | 8· |
| `words` | They hurt you more than words can say. | 10· |
| `stranger` | A stranger won’t leave you alone. | 11· |
| `dark` | You’re scared of dark and things you can’t see. | 13· |
| `close` | outro | back cover |

### `book` — "Contents"
Darkness. A click, and the flashlight cone opens on a wireframe book lying on a table. HUD:
`OBJECT: HANDBOOK · CHILDREN'S SAFETY · RU` and `TITLE: WHAT TO DO IF…` (translation note). The cover
opens (page-turn as a curved line mesh) onto a contents page we typeset ourselves: the thirteen
entries in English as caps with dotted leaders and red numbers. A mono footnote types in:
`* they say if you remove the page numbers, it reads like a song.` On a downbeat the red numbers lift
off the page one by one and fly to the HUD's page counter; the leaders go loose. The camera dives
into the first entry and through the paper into the dark: chapter one.

### `lost` — p. 22 → 26
A 3D metro map as a floating network of lines and stations (our own map, no real city), seen from
above, then the camera drops to platform level. A red dot is "you". `YOU ARE HERE` callout. "You missed
the stop": a train (a row of lit windows, all lines) slides past and away; the station name you needed
slides away with it, labelled `YOUR STOP`. "The metro closed": gates roll down as horizontal lines;
the station lights go off one by one along the map. WHAT TO DO: `1. Stay where you are. 2. Find someone
in uniform. 3. Say your address.` The page counter flips 22 → 26 on "You missed".

### `door` — p. 32
Wireframe apartment from above (floorplan extruded to 3D, a nod to the author's own floorplan twin).
The flashlight is in the hallway. "The doorbell rings": the ring is drawn as concentric sound rings
from the door, on beats, with `DB 62 · 2 RINGS` readout. Cut to the peephole: a fisheye circle, a dark
shape behind it labelled `UNKNOWN`. A line of light under the door; a shadow crosses it.
WHAT TO DO: `1. Do not open the door. 2. Do not say you are alone. 3. Call a parent.`

### `dogs` — p. 40
Night street, long perspective, streetlights as cones (the torch colour, dimmer). The flashlight
sweeps; pairs of eye-dots light up in the dark with detection boxes: `DOG · 0.91`, `DOG · 0.87`,
`DOG · 0.63`, a count ticking up on beats. Dogs are drawn as a few loose lines (walking contour),
never detailed. WHAT TO DO: `1. Do not run. 2. Do not look them in the eye. 3. Stand still like a tree.`
The last step hands off to the next chapter's tree.

### `cat` — p. 48
A tree as a point cloud / branching line structure, the camera orbits it like a rescue drone. At the
top, a small cluster highlighted red: `CAT · 1` with a height callout `4.6 m` and a vertical dotted
leader down to the ground. Gently funny: `CAT STATUS: FINE · OWNER STATUS: NOT FINE`. WHAT TO DO:
`1. Do not climb. 2. Wait. Cats come down. 3. Call an adult.`

### `temp` — p. 52 → 62
One instrument, two states: a big thermometer / dial gauge in 3D. "Far too hot": the needle slams right,
heat shimmer warps the lines, the sun as a hard disc. "Far too cold": the needle slams left, frost
crystals grow across the frame as branching lines (reuse the tree's branching code, deliberately).
Readouts `+41 °C` and `−27 °C`. WHAT TO DO flips: `Drink water. Find shade.` → `Wear a hat. Keep moving.`

### `storm` — p. 70
A radar map: a storm front rotates in as contour bands, the sweep line circling. A warning banner
types `WEATHER WARNING`. On "unsafe" the flashlight flickers for the first time (a two-frame dropout),
the held word stretches in width, and the HUD shows its first glitch: the page number misprints.
WHAT TO DO: `1. Go inside. 2. Stay away from windows.` This is the last chapter where the advice works.

### `tease` — p. 7·
The shift to people. A playground seen from above as a social graph: "you" is one node in the middle,
other nodes circle it; arrows point in. "They call your name": your name label (`NAME`) is repeated by
the other nodes, the labels flying at you and stacking, overlapping, until the label itself is
unreadable. WHAT TO DO types slowly: `1. Ignore them. 2. Tell a teacher. 3.` and step 3 is blank.

### `alone` — p. 8·
Paper chapter (inverted: paper background, ink lines). The same graph, printed. "No one stays": on
each beat an edge detaches and its node drifts off the page. Counter `FRIENDS 5 → 4 → … → 0`. At 0,
one empty node remains with a leader line to a label that just says `YOU`. WHAT TO DO:
`See page 84.` The page counter shows 8· — the reference points to itself.

### `words` — p. 10·
"They hurt you more than words can say": the language fails. The WHAT TO DO panel tries to type and
its glyphs come apart into strokes; the sung line's letters disassemble into their stroke skeletons
(single-stroke font) and hang in space; the dotted leader breaks into loose dots. HUD labels say
`NO PROCEDURE`. The flashlight is weak and warm here, close to the ground.

### `stranger` — p. 11·
Callback to `lost`: the metro map again, but now a second dot follows yours. A tracking reticle, a
distance readout counting down `12 m · 9 m · 6 m` on beats. You move, it moves. WHAT TO DO:
`1. Say NO loudly. 2. Go where there are people.` and the map around you is empty of people.

### `dark` — p. 13·
The last chapter. The flashlight flickers and dies on "dark". Blackness, then sparse scan pulses (a
lidar sweep from where you stand) reveal half-shapes that are never the same twice, each labelled
`UNKNOWN`, `UNKNOWN`, `NOT FOUND`. "Things you can't see": labels with no objects, callouts pointing at
nothing. WHAT TO DO is empty. Then one small warm point turns on: a night-light by the floor.
Its glow is the only bloom in the chapter.

### `close` — outro
Pull back from the night-light: it is on the book, which lies open on the table where we started, at
the last chapter's page. The page reads, in our own words, `Turn on the light. Monsters are not
real. You can call someone.` The camera rises; the book closes; the back cover. Final frame: the
night-light still on in the dark.
