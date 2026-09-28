// Glyph soup by real wrong-codec transforms (TREATMENT item 6 + r8, TESTPLAN A13). A Russian name is encoded
// with one codec and decoded with another, exactly as a mis-configured sign controller would show it:
//   «ПРОДУКТЫ» UTF-8 read as CP1252 -> «ÐŸÐ ÐžÐ”Ð£ÐšÐ¢Ð«»;  CP1251 read as CP866 -> «╧╨╬─╙╩╥█».
// The point is the author's «смотрю, но как прочесть — не ебу»: the output must NOT read as Russian, so the
// readings are Latin-1 and DOS box-drawing ones (mis-decoded Latin/Cyrillic fragments, box glyphs), never a
// Cyrillic-to-Cyrillic shuffle (r7 did that and it read as Russian words; r8 reverts it).
// The byte tables are the browser's own WHATWG decoders (TextDecoder); an encoder is the inverse of the decoder
// over the 256 byte values, so nothing here is hand-drawn. Characters a codec cannot encode become '?', and
// C0/C1 control characters produced by the wrong decoder are dropped (a display shows nothing there).
// `level` < 1 transforms only some characters (a deterministic per-character choice), for names that degrade
// step by step; each transformed character is still the codec's real output for that character.

export type Codec = 'utf8>cp1252' | 'cp1251>cp866' | 'utf8>cp866' | 'cp1251>cp1252';
export const CODECS: Codec[] = ['utf8>cp1252', 'cp1251>cp866', 'utf8>cp866', 'cp1251>cp1252'];
const LABEL: Record<string, string> = { cp1251: 'windows-1251', cp1252: 'windows-1252', cp866: 'ibm866' };
/** How the codec is named for people (Russian, for captions). */
export const CODEC_RU: Record<Codec, string> = {
  'utf8>cp1252': 'юникод прочитан как латиница', 'cp1251>cp866': '1251 прочитан как ДОС',
  'utf8>cp866': 'юникод прочитан как ДОС', 'cp1251>cp1252': '1251 прочитан как латиница',
};

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
