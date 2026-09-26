# What if — treatment and style bible (r5)

Song: `audio/whatif.mp3`, "What if" by komzpa, 2:56. Lyrics: `lyrics/lyrics.txt` (the author's own text).
Engine: forked from mexicat/pdoom-video (MIT, commit in `reference/pdoom-video-commit.txt`); see `docs/ENGINE.pdoom.md`.
Nothing from the pdoom video's scenes, lyrics or plate designs is reused; only the engine and the
analysis pipeline.

r2 (author's direction, 2026-09-26): the mood is **dystopian future, not cyberpunk**: a lived-in
future city with neon and technology where things are quietly not okay (the register of films like
Blade Runner 2049: haze, scale, loneliness, beauty in decay). The audience model is **"interesting to
adults, understandable to children"**: the viewer is a child; every scene reads plainly at a child's
level and carries a deeper philosophical or psychological layer for adults. All designs are our own:
no characters, vehicles, logos, buildings or shots copied from any film or cartoon.

## Where the song comes from (the viewer must get this in the first 15 seconds)

The lyric is the table of contents of a Russian children's safety handbook, "What to do if…". Each
chapter is a situation a child might face: lost, a missed metro stop, home alone with the doorbell
ringing, stray dogs, a cat up a tree, heat, cold, bad weather, teasing, no friends, being hurt, a
stranger, fear of the dark. The joke that started it: remove the page numbers and the contents page
reads like a sad indie song. The song takes that literally.

The order is the song's meaning: practical accidents, then weather, then loneliness, cruelty and
fear. A handbook has an answer page for each. The song never turns to the page. The video does, and
the answers stop fitting.

## r4: the book's contents are the source, the song is secondary (author, 2026-09-26)
Stage every chapter from the handbook's own heading (photo: `reference/handbook-contents-photo-2.png`),
not from the English lyric's wording. The lyric is a loose translation; where they differ, the heading wins.
Each chapter shows its original heading small under the sung line as the translation note, with its page.
The song still sets the timing, and the picture stays roughly aligned with the words: each chapter plays
while its line is sung, and the key action lands on the matching sung word (the doors shut on "closed",
the cat appears on "cat", the needle slams on "hot"/"cold", the light dies on "dark"). The heading decides
what the scene is; the lyric decides when things happen. No scene may contradict the line being sung.
| page | heading (as printed) | what it means for the staging |
|---|---|---|
| 12 | ВВЕДЕНИЕ | the `book` intro is the handbook's introduction page |
| 22 | ТЫ ПОТЕРЯЛСЯ | you got lost: the unmapped district |
| 26 | НЕ УСПЕЛ ВЫЙТИ ИЗ ВАГОНА МЕТРО | you didn't get off in time: the doors close before you step out and the train carries you away from your stop; "the metro closed" in the lyric is the doors closing |
| 32 | ТЫ ОДИН ДОМА, А В ДВЕРЬ ЗВОНЯТ | home alone, the doorbell rings (as written) |
| 40 | ТЕБЕ ПОВСТРЕЧАЛИСЬ ЧУЖИЕ СОБАКИ | somebody else's dogs, not strays: big dogs off the leash, the owner far away or absent |
| 48 | ТВОЯ КОШКА ЗАЛЕЗЛА НА ДЕРЕВО | your cat climbed a tree (as written) |
| 52 / 62 | СЛИШКОМ ЖАРКО / СЛИШКОМ ХОЛОДНО | too hot / too cold (as written) |
| 70 | ПОГОДА СТАНОВИТСЯ ОПАСНОЙ | the weather turns dangerous (as written) |
| 7· | ТЕБЯ ДРАЗНЯТ РЕБЯТА | the other kids tease you |
| 8· | С ТОБОЙ НИКТО НЕ ДРУЖИТ | nobody is friends with you |
| 10· | ТЕБЯ СИЛЬНО ОБИЖАЮТ | you are badly hurt, badly wronged |
| 11· | ПРИСТАЁТ НЕЗНАКОМЫЙ ЧЕЛОВЕК | a stranger won't leave you alone |
| 13· | ТЫ БОИШЬСЯ ТЕМНОТЫ И МОНСТРОВ | afraid of the dark **and monsters**: the child's imagination turns the unknown shapes into monsters |

## r5: author's review of r2 (2026-09-27 00:05 +04) — overrides older text where they differ

The author's words: «надписи надо держать на экране столько времени чтобы они читались нормально, там у тебя они
появляются и тут же прячутся · главный герой слишком Кенни из сауспарка какой-то. надо лучше выбирать ракурсы и
моделировать, или от первого лица уж · на книжку время не трать · карта города неконсистентна · you missed the stop
надо лучше вшить в "you are lost" - типа ты сначала двери закрылись, потом ты едешь не туда, потом не в той части
города, потом метро закрыто - и это открывает путь к дальше приключениям потому что короткого пути типа метро нету и
надо переться через "запрещённый" и там остальное происходит».

1. **Reading time is a hard rule.** Every on-screen text (callout, system line, WHAT TO DO step, sign that carries
   meaning) stays fully visible for at least `max(1.5 s, 0.4 s + characters / 14 per s)`, measured from the end of
   its reveal animation to the start of its exit. Karaoke words are exempt (the song sets them). If a scene cannot
   fit the text for that long, cut the text, not the time. The timeline exposes every text item's visible
   interval, and `scripts/qa-reading-time.ts` fails the build listing each offender with its shortfall.
2. **The child: first person by default.** Most shots are the child's POV: yellow raincoat sleeves and small hands
   at the bottom of frame, holding the handbook or a phone-less ticket, the drone floating at the edge of view.
   Third person only as a small, readable silhouette in wide shots (child proportions: about 4.5 heads tall, legs,
   arms, a backpack, the hood up; never a blob; a real three-quarter-back or profile angle, low camera at child
   height). No close third-person shot of the child's back as the main image of a beat (r2's Kenny problem).
3. **The book is a title card, not a scene.** At most 3 s: the cover and the contents page as a quick flash, then
   straight into the story. The page counter and the headings stay as the chapter device.
4. **One city.** A single `data/city.json` holds the districts, the metro line and its stations in order
   (including `YOUR STOP`), home, the unmapped area and the restricted zone, and the route. Every map, route
   display, station sign, callout distance and later chapter location reads it. No scene invents a station name or
   distance. The QA script checks that every station/district string on screen exists in city.json.
5. **`lost` is one continuous story, and it opens the whole video's journey** (see the rewritten `lost` below):
   doors close at your stop → the train carries you the wrong way → you get out in the wrong part of the city →
   the metro closes behind you → there is no short way home, the only route runs through the forbidden zone.
   Every later chapter happens along that route through the forbidden zone, and `close` is arriving home. The map
   callout `HOME · x km` counts down chapter by chapter.

6. **The unfamiliar part of the city is unreadable** (author, 00:15: «в незнакомой части города можно брать
   непонятный алфавит битой кодировки чтобы был вайб "смотрю но как прочесть не ебу»). Reference:
   `reference/garbled-bus-board-sakhalin.png`, a real dot-matrix stop board showing broken-encoding glyph soup under
   a readable header. Rules: in known districts signs are clean; as the train leaves the known part, station names
   on the route display degrade into garbled glyphs step by step; in the unmapped district and the restricted zone
   every sign, board and screen is broken-encoding glyph soup (our own generated glyphs: mis-decoded Latin/Cyrillic
   fragments, box and block characters, dot-matrix rendering), with only the frame/header readable. Each garbled
   string is generated deterministically from the real city.json name (so it is the same sign every time it
   appears). The drone may try and fail: callout `TRANSLATION UNAVAILABLE`. Garbled strings are exempt from the
   reading-time rule and from the city.json name check, but stay on screen long enough (≥1.5 s) to register as
   "I'm looking and can't read it". Child layer: I can't read anything here. Adult layer: a city that stops
   speaking your language.

## The idea in one paragraph

A small child walks through a huge, hazy future city at night with **an old paper handbook** and **a
little lantern-drone**, the child's guide. The drone reads the handbook aloud as on-screen
instructions and lights the way. Each chapter is one situation from the contents, staged in this
city. At a child's level every scene is simple and clear: here is the problem, here is what to do.
At an adult's level the city answers every problem with a system (a camera, a queue, an ad, an
automated voice), none of which can help with what the child actually feels. The practical advice
works for the missed stop and the storm. It stops fitting at "They tease you", and in the last
chapter the lantern goes out. The child is not rescued by a system; the ending is small and human:
a night-light, and the handbook's last page in the child's own hand.

## Two layers in every scene (the Smeshariki rule)

Every chapter must pass both tests:
- **Child test:** with the sound off and no English, a six-year-old can say what is happening
  ("the cat is up the tree", "nobody wants to play"). One clear subject, big readable shapes, the
  lantern points at it, the WHAT TO DO panel says what to do in short words.
- **Adult test:** there is a second thing to read, never louder than the first: city signage, system
  messages and small print that show how the world is built (surveillance that watches but doesn't
  help, help lines with queues, ads selling a friend, forecasts that sound like threats). Written
  deadpan, never preachy, never a slogan. The adult layer comments; it never explains the joke.

The deep themes, one per chapter, carried by the image and never stated: being lost and the fear of
missing your moment; the danger at the door and who we let in; fear of the other; helplessness when
someone you love is stuck; a body in a world that is too much; the world becoming unsafe; cruelty
and naming; loneliness; pain beyond language; being followed; the unknown.

## The protagonist and the guide (original designs)

- **The child:** a small figure in a long, too-big raincoat and a hood, mostly seen from behind or far
  away, drawn as clean lines and a flat silhouette; no face ever shown. The coat is the one warm
  colour on the figure (faded yellow). Scale is the point: the child is tiny against the city.
- **The lantern-drone:** a palm-sized round drone with one soft lamp, hovering at the child's
  shoulder. It is the flashlight, the voice of the WHAT TO DO panel and the karaoke's pointer. It is
  earnest and slightly old (a scuffed shell, one wobbling rotor). Its light is the warm cone that
  reveals line geometry. It flickers on "unsafe", fails on "dark".
- **The handbook:** the paper book, the only paper thing in a city of screens. Its contents page
  frames the video.

## Signature devices

1. **The dot leader.** `YOU ARE LOST ............ 22`. The contents page's dotted leader is the UI
   language of the drone: every callout is a dotted leader that ends in a red page number or a
   label. Leaders draw in dot by dot on the beat.
2. **Page numbers are the clock.** The numbers the joke removed come back as the chapter counter
   (large red numerals, page-flip on each chapter cut). Known pages from the photo: 22, 26, 32, 40,
   48, 52, 62, 70. The photo cuts off the rest (7·, 8·, 10·, 11·, 13·): shown with the last digit
   clipped by the frame edge, so as the song gets heavier the numbers are harder to read.
3. **Paper against neon.** The handbook's typography (condensed caps, dot leaders, red numbers) is
   printed, warm and small. The city's typography is huge, glowing, cold and indifferent. Every
   scene shows both, and the child sits between them.
4. **WHAT TO DO panel.** The drone's panel: short numbered steps in a child's vocabulary, our own
   text, never copied from the book. It explains the scene and carries the arc.
5. **The city system line.** One line of small system text per scene (a public screen, an ad, a
   camera overlay): the adult layer. Examples are given per chapter; keep them this dry.

## Tone and motion

- Melancholic, tender, a little funny. Beautiful, never grim for its own sake.
- Slow and spacious like the song: long eased camera moves, wide shots that dwarf the child, then a
  close shot on the one thing that matters. Cuts on downbeats and chapter boundaries; small UI ticks
  on beats. The heaviest visual change is saved for the last chapter.
- Haze and depth: layered fog planes, light shafts, rain as fine lines, reflections on wet ground,
  distant megastructures as silhouettes with a few lit windows.
- Not slop: no purple/cyan cyberpunk gloss, no code rain, no glowing brains, no lens-flare soup, no
  random neon clutter (every sign has something to say), no realistic human faces, no copied film
  imagery (no spinners, no known skylines or characters).

## Palette

Future-city dusk: warm polluted haze against cold shadow, with sparse neon.
- **smog** `#B8672F` → `#E0A25A` the amber haze gradient in wide shots (the city's daylight)
- **shadow** `#0B1016`, **deep** `#131B24` night and near geometry
- **concrete** `#6F7780` wireframes and structures, **fog** `#2B343F` far layers
- **neon** `#FF3D7F` (sparse, city signage only) and **sodium** `#FFB547` streetlights
- **paper** `#EDE6D6` the handbook, **ink** `#16140F`
- **red** `#D7362B` page numbers and the sung word's highlight (the handbook's colour)
- **lamp** `#FFE8B5` the drone's light and the night-light: the only thing that blooms softly
- **coat** `#C9A441` the child's raincoat
Rules: neon belongs to the city and never highlights lyrics; red belongs to the handbook; lamp
belongs to the drone. Night-time chapters sit on shadow; wide establishing shots sit in smog.

## Typography

- **Archivo condensed** (width 62, weight 800–900, caps): the handbook's headings and the sung line.
  Held notes stretch ("unsafe", "alone"); pressure condenses.
- **IBM Plex Mono**: the drone's panel, callouts, measurements, the city's system lines.
- **Archivo wide** (width 125, light, huge, tracked out): city signage and public screens.
- **Cormorant Garamond italic**: very rare; the handbook's title page and the last page.

## Karaoke rules

- Every lyric word appears or highlights at its aligned `start` (`data/lyrics.json`), never before
  its voice; dim anticipation up to 0.4 s early is fine.
- The sung line is always typeset **as a contents entry** (caps heading + dotted leader + red page
  number), projected by the drone into the scene. Its placement changes per scene; its format never
  does, so the premise stays visible.
- Lyric text stays inside title-safe (≥ 96 px from the edges) and clear of the panels.

## Structure

Exact section times come from `data/audio.json` and `data/lyrics.json`. Whisper's rough times put the
first line near 0–22 s and the last near 2:30–2:38, with instrumental space between lines.

## Chapters (scene modules in `app/src/scenes/`)

| id | lyric | page | theme (adult layer, never stated) |
|---|---|---|---|
| `book` | intro | cover, contents | a manual for a world that can't be manualised |
| `lost` | You are lost. You missed the stop, the metro closed. | 22, 26 | missing your moment |
| `door` | You’re home alone, the doorbell rings. | 32 | who we let in |
| `dogs` | Stray dogs cross your path at night. | 40 | fear of the other |
| `cat` | Your cat is stuck up in a tree. | 48 | helplessness for someone you love |
| `temp` | It’s far too hot. It’s far too cold. | 52, 62 | a body in a world that is too much |
| `storm` | The weather turns, it feels unsafe. | 70 | the world stops being safe |
| `tease` | They tease you, laugh, they call your name. | 7· | naming as cruelty |
| `alone` | No one stays. No one’s your friend. | 8· | loneliness |
| `words` | They hurt you more than words can say. | 10· | pain beyond language |
| `stranger` | A stranger won’t leave you alone. | 11· | being followed |
| `dark` | You’re scared of dark and things you can’t see. | 13· | the unknown |
| `close` | outro | last page | small human comfort |

### `book` — "Contents" (r4: the handbook's introduction, p. 12)
A wide shot in smog: the city, megastructures in haze, one tiny yellow coat on a bridge. Push in to
the child sitting under an overhang in the rain, opening the handbook; the drone wakes with a click and
lights the page. Drone callout: `HANDBOOK · CHILDREN'S SAFETY · PRINTED ON PAPER` and a translation
note `WHAT TO DO IF…`. The contents page (typeset by us, the thirteen English entries with leaders and
red numbers). A footnote in mono: `* they say if you remove the page numbers, it reads like a song.`
On a downbeat the red numbers lift off the page and fly to the drone's page counter. System line on
a distant public screen: `CURFEW FOR MINORS 22:00 · FOR YOUR SAFETY`. Camera dives into the first entry.

### `lost` — p. 22 → 26 (r5: one continuous sequence; roughly aligned to the song)
The viewer always knows where the child is; the city is city.json.
- **Instrumental before the first word (after the ≤3 s book card, to 13.4 s): the missed stop.** POV inside a
  night train car: the route display above the door lights the next station `YOUR STOP`; the platform slides in,
  the POV stands up, hands with the book, walks to the door; the doors close in front of the hands
  (`DOORS CLOSING`). The platform with `YOUR STOP` slides away. The train goes on: the route display passes
  stations whose names get less familiar, the tunnel, the line crosses onto the part of the map the child has
  never been to.
- **13.4 "You are lost."** The doors open on a strange platform; POV steps out into an unfamiliar district. The
  drone's map from above: the yellow dot at the edge of the known area, beyond it grey hatched tiles,
  `AREA NOT MAPPED · THIS PART OF THE CITY IS NOT OPEN YET`. Callout `HOME · 6.4 km`.
- **15.7 "You missed the stop"**: on the map the route line draws back to `YOUR STOP`, far behind.
  **"the metro closed"**: POV turns back to the station; the shutter comes down on "closed", sign `CLOSED ·
  LAST TRAIN LEFT`. 
- **Until the next line (26.4): no short way.** The drone recalculates: the metro route greys out, the only
  remaining route runs through a zone marked `RESTRICTED · NO ENTRY FOR MINORS`. POV looks at the fence gate, the
  drone's lamp points through it; the child goes in. This is the journey the rest of the video follows.
WHAT TO DO (each held for its reading time): `1. Stay where you are. 2. Find someone in uniform. 3. Say your
address.` then, after "closed", `1. Get off at the next station. 2. Don't go on alone. 3. Wait for your grown-up.`
The last step glitches as the child walks into the restricted zone (adult layer: the manual has no page for
this). The page counter flips 22 → 26 on "You missed".

### `door` — p. 32
A tiny apartment in a huge block (the camera starts outside: thousands of identical windows; one lit).
Inside, a wireframe floorplan extruded to 3D; the child in the hallway, the drone lighting the door.
The doorbell as concentric rings from the door on beats. The peephole: a fisheye circle, a dark shape
labelled `UNKNOWN`. Door panel system line: `VISITOR · FACE NOT RECOGNISED · OPEN? [YES] [NO]`, the
YES button glowing bigger than NO. WHAT TO DO: `1. Do not open the door. 2. Do not say you are alone.
3. Call a parent.` The phone screen: `PARENT · AT WORK · CALL BACK LATER`.

### `dogs` — p. 40 (r4: somebody else's dogs, per the heading)
A residential street under an elevated highway, sodium lights in the haze, wet reflections. Two or three
big dogs off the leash come round the corner: they belong to someone (collars glint, a leash drags on the
ground), but the owner is nowhere, a tiny far-away figure on a phone or not there at all. Detection boxes
`DOG · OWNER: UNKNOWN`, `LEASH: NONE`, a distance ticking on beats. The dogs are drawn as loose, gentle
lines, big but not monsters. A sign on the fence: `ALL DOGS MUST BE LEASHED · FINE 500`. Adult layer: the
rule exists and nobody is enforcing it; the danger is somebody else's carelessness. WHAT TO DO:
`1. Do not run. 2. Do not look them in the eye. 3. Stand still like a tree.` Step 3 hands off to the tree.

### `cat` — p. 48
The last tree in a concrete plaza (a single real tree fenced off, `HERITAGE TREE · DO NOT CLIMB`). The
camera orbits it like a rescue drone. At the top, the cat: a small warm cluster, `CAT · 1`, height
callout `4.6 m` with a dotted leader down to the child. `CAT STATUS: FINE · OWNER STATUS: NOT FINE`.
System line: `ANIMAL RESCUE · YOUR PLACE IN QUEUE: 318`. WHAT TO DO: `1. Do not climb. 2. Wait. Cats
come down. 3. Call an adult.` The drone flies up to keep the cat company; its light on the cat.

### `temp` — p. 52 → 62
A giant public thermometer on a tower, the city beneath. "Far too hot": the needle slams right, heat
shimmer bends the skyline, the smog goes orange-white; `+41 °C · STAY INDOORS · COOLING CENTERS FULL`.
"Far too cold": the needle slams left, frost grows across the frame as branching lines (reuse the
tree's branching), the haze turns blue-grey; `−27 °C · HEATING QUOTA EXCEEDED`. WHAT TO DO flips:
`Drink water. Find shade.` → `Wear a hat. Keep moving.` The child between the two, pulling the coat.

### `storm` — p. 70
A radar map projected by the drone over the real sky: a storm front rotates in as contour bands, the
sweep line circling, then the real storm arrives (rain lines thicken, neon signs flicker). Public
screens switch to `WEATHER WARNING · SHELTER IN PLACE`. On "unsafe" the drone's light flickers for the
first time, the held word stretches, and the page number misprints. WHAT TO DO: `1. Go inside.
2. Stay away from windows.` The child finds shelter. This is the last chapter where the advice works.

### `tease` — p. 7·
A schoolyard on a rooftop, seen from above: children as simple silhouettes (no faces), arranged as a
social graph; the child is one node in the middle; arrows point in. "They call your name": the name
label `NAME` repeats from every node, flying at the child and stacking until it is unreadable. The
school's screen shows `KINDNESS WEEK ·` with a smiling pictogram. WHAT TO DO types slowly: `1. Ignore
them. 2. Tell a teacher. 3.` — step 3 stays blank, the cursor blinking.

### `alone` — p. 8·
Paper chapter (inverted to paper and ink): the handbook's page itself, the graph printed on it. "No one
stays": on each beat an edge detaches and its node walks off the page. Counter `FRIENDS 5 → 4 → … → 0`.
At 0 one node is left with a leader to a label: `YOU`. A torn-in ad from the city: `LONELY? RENT A
COMPANION · FIRST HOUR FREE`. WHAT TO DO: `See page 84.` The counter shows 8· — the reference points to
itself.

### `words` — p. 10·
"More than words can say": language fails. The drone's panel tries to type and its glyphs come apart
into strokes; the sung line's letters break into single-stroke skeletons and hang in the air; the dot
leader breaks into loose dots that fall like rain. Callouts say `NO PROCEDURE`. The city in the
background keeps talking, huge and fluent: `WE CARE ABOUT YOU` scrolls on a building. The drone hovers
lower, its light small and warm, near the child's hand.

### `stranger` — p. 11·
Callback to `lost`: the metro map again, but a second dot follows the child's. A reticle, a distance
counting down `12 m · 9 m · 6 m` on beats. Cameras on every corner turn to watch; not one does
anything: `INCIDENT NOT DETECTED`. WHAT TO DO: `1. Say NO loudly. 2. Go where there are people.` and
the map around the child has no people on it. The child runs to the one lit window (a noodle stall).

### `dark` — p. 13· (r4: the dark and monsters, per the heading)
The last chapter. City-wide blackout: the neon goes off block by block on the beat, then the drone's
light fails on "dark". Black. Sparse scan pulses from the drone's last battery reveal half-shapes that
are never the same twice. In the child's eyes they become monsters: a coat on a hook grows a long head,
a stack of boxes gets teeth, a crane outside the window turns into a giant; each is drawn as the child
imagines it (simple, childlike line monsters of our own design), then the next pulse shows what it really
is. Callouts flip: `MONSTER?` → `COAT`, `MONSTER?` → `BOXES`, and finally one that stays `NOT FOUND`.
"Things you can't see": callouts pointing at nothing. WHAT TO DO is empty. The child sits down. Then one
small warm point turns on at floor level.

### `close` — outro
The warm point is a night-light the child has switched on, and in its glow the handbook lies open at
the last page. The printed text is replaced, in the child's handwriting (single-stroke font), by the
child's own three steps: `Turn on the light. Monsters are not real. Call someone.` The drone, dark,
rests beside it; its lamp blinks once, back on, dimly. Pull back through the window into the huge
city, still dark except for a few windows lighting up one by one. Final frame: one yellow window.
