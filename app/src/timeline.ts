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

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** The downbeat at or before the first word of the matching line (never after the word). */
  const cut = (q: string, tol = 0.02) => {
    const s = ly.get(q).words[0]!.start;
    let best = au.downbeats[0] ?? 0;
    for (const d of au.downbeats) if (d <= s + tol) best = d;
    return best;
  };
  const lastEnd = ly.lines[ly.lines.length - 1]!.end;
  const starts = CHAPTERS.map((id, i) => {
    const sec = au.sections.find((s) => s.name === id);
    if (sec) return sec.start;
    if (i === 0) return 0;
    const first = entriesOf(id)[0];
    if (first) return cut(first.line);
    // the outro: first downbeat after the last sung word
    return au.downbeats.find((d) => d >= lastEnd) ?? lastEnd;
  });

  return CHAPTERS.map((id, i) => {
    const start = starts[i]!, end = i + 1 < CHAPTERS.length ? starts[i + 1]! : au.duration;
    // a chapter without its own module yet plays the placeholder: its contents entries, karaoke per word
    const file = hasScene(id) ? id : 'placeholder';
    return { id, load: scene(file), start, end, params: { chapter: id, file } };
  });
}
