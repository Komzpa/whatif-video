// Cyrillic mojibake by real wrong-codec transforms (TREATMENT r7, TESTPLAN A13). A Russian string is encoded
// with one codec and decoded with another, exactly as a mis-configured sign controller would show it:
//   «ПРОЕЗД» UTF-8 read as CP1251 -> «РџР РћР•Р—Р”»;  «ВЫХОД В ГОРОД» KOI8-R read as CP1251 -> «бшунд б цнпнд».
// Only Cyrillic-to-Cyrillic confusions are used (TREATMENT r7, coordinator 27.09): the output is Cyrillic and
// punctuation, never Latin letters (a CP1252 or CP866 reading would put «Ð…» or «®» on a Russian street).
// The byte tables are the browser's own WHATWG decoders (TextDecoder); an encoder is the inverse of the decoder
// over the 256 byte values, so nothing here is hand-drawn glyph soup. Characters a codec cannot encode become
// '?', and C0/C1 control characters produced by the wrong decoder are dropped (a display shows nothing there).
// `level` < 1 transforms only some characters (a deterministic per-character choice), for names that degrade
// step by step; each transformed character is still the codec's real output for that character.

export type Codec = 'utf8>cp1251' | 'koi8>cp1251' | 'cp1251>koi8';
export const CODECS: Codec[] = ['utf8>cp1251', 'koi8>cp1251', 'cp1251>koi8'];
const LABEL: Record<string, string> = { cp1251: 'windows-1251', koi8: 'koi8-r' };
/** How the codec is named for people (Russian, for captions). */
export const CODEC_RU: Record<Codec, string> = { 'utf8>cp1251': 'юникод прочитан как 1251', 'koi8>cp1251': 'КОИ-8 прочитан как 1251', 'cp1251>koi8': '1251 прочитан как КОИ-8' };

const dec = new Map<string, TextDecoder>();
const decoder = (cs: string) => { let d = dec.get(cs); if (!d) { d = new TextDecoder(LABEL[cs]!); dec.set(cs, d); } return d; };
const encTables = new Map<string, Map<string, number>>();
function encTable(cs: string) {
  let m = encTables.get(cs);
  if (!m) {
    m = new Map();
    const d = decoder(cs);
    for (let b = 0; b < 256; b++) { const ch = d.decode(new Uint8Array([b])); if (ch !== '�' && !m.has(ch)) m.set(ch, b); }
    encTables.set(cs, m);
  }
  return m;
}
function encode(s: string, cs: string): Uint8Array {
  if (cs === 'utf8') return new TextEncoder().encode(s);
  const m = encTable(cs);
  return new Uint8Array([...s].map((ch) => m.get(ch) ?? 0x3f));
}
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

/** The whole string through one wrong-codec round trip. */
export function transcode(s: string, codec: Codec): string {
  const [from, to] = codec.split('>') as [string, string];
  return decoder(to).decode(encode(s, from)).replace(CONTROL, '');
}

function h(s: string, i: number) {
  let x = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) { x ^= s.charCodeAt(k); x = Math.imul(x, 16777619); }
  x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** The codec a given name gets on a broken sign (deterministic per name). */
export function codecFor(name: string): Codec { return CODECS[Math.floor(h(name, 7) * CODECS.length)]!; }

/** Mojibake of `s` (level 1 = the whole string; < 1 = only some characters, per-character deterministic). */
export function mojibake(s: string, codec: Codec = codecFor(s), level = 1): string {
  if (level >= 1) return transcode(s, codec);
  if (level <= 0) return s;
  return [...s].map((ch, i) => (ch !== ' ' && h(s, i) < level ? transcode(ch, codec) : ch)).join('');
}

// ---------------------------------------------------------------- the registry (for QA)
/** Every mojibake string drawn, with its source, so QA can re-derive it (TESTPLAN A13). */
export interface Moji { src: string; codec: Codec; level: number }
export const MOJI = new Map<string, Moji>();
/** Mojibake that registers itself: use this for everything drawn on screen. */
export function moji(s: string, level = 1, codec: Codec = codecFor(s)): string {
  const out = mojibake(s, codec, level);
  if (out !== s) MOJI.set(out, { src: s, codec, level });
  return out;
}
