// Verifies data/lyrics.json and data/audio.json load cleanly through the
// engine's own loader classes (Lyrics, AudioData), bypassing fetch() (no
// browser here) by reading the files directly and constructing the classes
// the same way Lyrics.load()/AudioData.load() do.
import { readFileSync } from 'fs';
import { Lyrics } from '../src/engine/lyrics';
import { AudioData } from '../src/engine/audio';

const lyricsJson = JSON.parse(readFileSync('../data/lyrics.json', 'utf-8'));
const audioJson = JSON.parse(readFileSync('../data/audio.json', 'utf-8'));

const lyrics = new Lyrics(lyricsJson);
const audio = new AudioData(audioJson);

console.log('Lyrics: lines=%d words=%d', lyrics.lines.length, lyrics.words.length);
console.log('First line:', lyrics.lines[0].text, lyrics.lines[0].start, lyrics.lines[0].end);
console.log('Last line:', lyrics.lines.at(-1)!.text, lyrics.lines.at(-1)!.start, lyrics.lines.at(-1)!.end);

const catWord = lyrics.findWords('cat')[0];
if (!catWord) throw new Error('findWords("cat") found nothing');
console.log('cat word:', catWord.w, catWord.start, catWord.end, 'gi=', catWord.gi, 'line=', catWord.line);

const lost = lyrics.get('lost');
console.log('get("lost") ->', lost.text, lost.start, lost.end);

const wAt = lyrics.wordAt(catWord.start + 0.01);
if (!wAt || wAt.gi !== catWord.gi) throw new Error('wordAt() mismatch for cat');
console.log('wordAt(cat.start+0.01) ->', wAt.w);

const progress = Lyrics.wordProgress(catWord, (catWord.start + catWord.end) / 2);
console.log('wordProgress(cat, mid) ->', progress.toFixed(3), '(expect ~0.5)');

console.log('\nAudio: duration=%d bpm=%d fps beats=%d downbeats=%d sections=%d',
  audio.duration, audio.bpm, audio.beats.length, audio.downbeats.length, audio.sections.length);
console.log('sample(30):', audio.sample(30));
console.log('sample(100):', audio.sample(100));
console.log('beatAt(30) ->', audio.beatAt(30).toFixed(3));
console.log('barAt(100) ->', audio.barAt(100).toFixed(3));
console.log('section(90) ->', audio.section(90));
console.log('section(0) ->', audio.section(0));
console.log('section(176) ->', audio.section(176));
console.log('hit(kick, 90) ->', audio.hit('kick', 90));
console.log('events(vocal, 85, 90) count ->', audio.events('vocal', 85, 90).length);

// Sanity: sections cover [0,duration) with no gaps, in order.
let prevEnd = 0;
for (const s of audio.sections) {
  if (Math.abs(s.start - prevEnd) > 1e-6) throw new Error(`section gap: ${s.name} starts at ${s.start}, prev ended ${prevEnd}`);
  prevEnd = s.end;
}
if (Math.abs(prevEnd - audio.duration) > 1e-6) throw new Error(`sections do not reach duration: ${prevEnd} != ${audio.duration}`);

// Sanity: every lyric word has start < end and is monotonic.
for (let i = 1; i < lyrics.words.length; i++) {
  if (!(lyrics.words[i].start < lyrics.words[i].end)) throw new Error(`word ${i} start>=end`);
  if (lyrics.words[i].start < lyrics.words[i - 1].start) throw new Error(`word ${i} not monotonic`);
}

console.log('\nOK: both files load through the engine loaders with no errors, sections contiguous, words monotonic.');
