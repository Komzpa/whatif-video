// The edit: which scene plays when. One entry per chapter of docs/TREATMENT.md "Chapters".
// Boundaries come from the data, never hard-coded: data/audio.json `sections` already names each
// chapter and starts it on the downbeat at or before its first lyric line (the analysis step does that
// derivation once). If a section is missing, the same rule is applied here to the chapter's first line.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import { CHAPTERS, entriesOf } from './contents';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};
const hasScene = (name: string) => !!modules[`./scenes/${name}.ts`];

// TREATMENT r6: no book on screen and no title card; the film opens in the carriage (the `book` chapter of the
// contents list plays for 0 s and is dropped from the edit).
const NO_CARD = new Set(['book']);
const RUNS_TO_NEXT_LINE = new Set(['lost']);

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** The downbeat at or before the first word of the matching line (never after the word). */
  const cut = (q: string, tol = 0.02) => {
    const s = ly.get(q).words[0]!.start;
    let best = au.downbeats[0] ?? 0;
    for (const d of au.downbeats) if (d <= s + tol) best = d;
    return best;
  };
  /** The beat at or before t. */
  const beatBefore = (t: number, tol = 0.02) => { let b = 0; for (const x of au.beats) if (x <= t + tol) b = x; return b; };
  const lastEnd = ly.lines[ly.lines.length - 1]!.end;
  const starts = CHAPTERS.map((id, i) => {
    if (NO_CARD.has(CHAPTERS[i]!)) return i === 0 ? 0 : null;
    if (i > 0 && CHAPTERS.slice(0, i).every((id) => NO_CARD.has(id))) return 0;
    // r5 item 5: `lost` runs on until the next line is sung; the chapter after it starts on the beat at or
    // before its first word
    if (i > 0 && RUNS_TO_NEXT_LINE.has(CHAPTERS[i - 1]!)) { const first = entriesOf(id)[0]; if (first) return beatBefore(ly.get(first.line).words[0]!.start); }
    const sec = au.sections.find((s) => s.name === id);
    if (sec) return sec.start;
    if (i === 0) return 0;
    const first = entriesOf(id)[0];
    if (first) return cut(first.line);
    // the outro: first downbeat after the last sung word
    return au.downbeats.find((d) => d >= lastEnd) ?? lastEnd;
  });

  const next = (i: number) => { for (let j = i + 1; j < CHAPTERS.length; j++) if (!NO_CARD.has(CHAPTERS[j]!)) return starts[j] as number; return au.duration; };
  return CHAPTERS.flatMap((id, i) => {
    if (NO_CARD.has(id)) return [];
    const start = starts[i] as number, end = next(i);
    // a chapter without its own module yet plays the placeholder: its contents entries, karaoke per word
    const file = hasScene(id) ? id : 'placeholder';
    return [{ id, load: scene(file), start, end, params: { chapter: id, file } }];
  });
}
