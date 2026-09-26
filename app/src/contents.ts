// The handbook's contents page, as the song sings it: one entry per lyric line, with its page.
// This table is the only place that maps lyric lines to chapters and page numbers (docs/TREATMENT.md
// "Chapters"). Pages ending in '·' are the ones the photo cuts off: the last digit is never shown whole.
export interface ContentsEntry { chapter: string; line: string; page: string }

export const CONTENTS: ContentsEntry[] = [
  { chapter: 'lost', line: 'You are lost', page: '22' },
  { chapter: 'lost', line: 'You missed the stop', page: '26' },
  { chapter: 'door', line: 'home alone', page: '32' },
  { chapter: 'dogs', line: 'Stray dogs', page: '40' },
  { chapter: 'cat', line: 'Your cat', page: '48' },
  { chapter: 'temp', line: 'far too hot', page: '52' },
  { chapter: 'temp', line: 'far too cold', page: '62' },
  { chapter: 'storm', line: 'weather turns', page: '70' },
  { chapter: 'tease', line: 'They tease', page: '7·' },
  { chapter: 'alone', line: 'No one stays', page: '8·' },
  { chapter: 'words', line: 'They hurt', page: '10·' },
  { chapter: 'stranger', line: 'A stranger', page: '11·' },
  { chapter: 'dark', line: 'scared of dark', page: '13·' },
];

/** Chapter ids in order: the intro, one per contents chapter, the outro. */
export const CHAPTERS: string[] = ['book', ...CONTENTS.map((e) => e.chapter).filter((c, i, a) => a.indexOf(c) === i), 'close'];

/** The contents entries of a chapter, in order. */
export const entriesOf = (chapter: string) => CONTENTS.filter((e) => e.chapter === chapter);
