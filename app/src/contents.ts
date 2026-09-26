// The handbook's contents page, as the song sings it: one entry per lyric line, with its page.
// This table is the only place that maps lyric lines to chapters and page numbers (docs/TREATMENT.md
// "Chapters"). Pages ending in '·' are the ones the photo cuts off: the last digit is never shown whole.
// `heading` is the heading as printed in the handbook (reference/handbook-contents-photo-2.png,
// docs/TREATMENT.md r4): the staging follows it, and each chapter shows it small under the sung line
// as the translation note.
export interface ContentsEntry { chapter: string; line: string; page: string; heading: string }

/** The introduction: the first line of the printed contents, above WHAT TO DO IF… (the `book` intro). */
export const INTRO = { chapter: 'book', label: 'INTRODUCTION', heading: 'ВВЕДЕНИЕ', page: '12' };

export const CONTENTS: ContentsEntry[] = [
  { chapter: 'lost', line: 'You are lost', page: '22', heading: 'ТЫ ПОТЕРЯЛСЯ' },
  { chapter: 'lost', line: 'You missed the stop', page: '26', heading: 'НЕ УСПЕЛ ВЫЙТИ ИЗ ВАГОНА МЕТРО' },
  { chapter: 'door', line: 'home alone', page: '32', heading: 'ТЫ ОДИН ДОМА, А В ДВЕРЬ ЗВОНЯТ' },
  { chapter: 'dogs', line: 'Stray dogs', page: '40', heading: 'ТЕБЕ ПОВСТРЕЧАЛИСЬ ЧУЖИЕ СОБАКИ' },
  { chapter: 'cat', line: 'Your cat', page: '48', heading: 'ТВОЯ КОШКА ЗАЛЕЗЛА НА ДЕРЕВО' },
  { chapter: 'temp', line: 'far too hot', page: '52', heading: 'СЛИШКОМ ЖАРКО' },
  { chapter: 'temp', line: 'far too cold', page: '62', heading: 'СЛИШКОМ ХОЛОДНО' },
  { chapter: 'storm', line: 'weather turns', page: '70', heading: 'ПОГОДА СТАНОВИТСЯ ОПАСНОЙ' },
  { chapter: 'tease', line: 'They tease', page: '7·', heading: 'ТЕБЯ ДРАЗНЯТ РЕБЯТА' },
  { chapter: 'alone', line: 'No one stays', page: '8·', heading: 'С ТОБОЙ НИКТО НЕ ДРУЖИТ' },
  { chapter: 'words', line: 'They hurt', page: '10·', heading: 'ТЕБЯ СИЛЬНО ОБИЖАЮТ' },
  { chapter: 'stranger', line: 'A stranger', page: '11·', heading: 'ПРИСТАЁТ НЕЗНАКОМЫЙ ЧЕЛОВЕК' },
  { chapter: 'dark', line: 'scared of dark', page: '13·', heading: 'ТЫ БОИШЬСЯ ТЕМНОТЫ И МОНСТРОВ' },
];

/** Chapter ids in order: the intro, one per contents chapter, the outro. */
export const CHAPTERS: string[] = ['book', ...CONTENTS.map((e) => e.chapter).filter((c, i, a) => a.indexOf(c) === i), 'close'];

/** The contents entries of a chapter, in order. */
export const entriesOf = (chapter: string) => CONTENTS.filter((e) => e.chapter === chapter);
