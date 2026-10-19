// Glyph soup by a real wrong-codec transform (TREATMENT item 6, r8, r9 note 1; TESTPLAN A13). A Russian name is
// encoded as Windows-1251 and decoded as Windows-1252, exactly as a Win95 machine with the wrong code page showed
// it: «Проспект Строителей» -> «Ïðîñïåêò Ñòðîèòåëåé». r9 (author): «как бы язык но как бы не тот и странный» —
// one byte per letter, so the word keeps its length and rhythm and reads as some other European language. The
// UTF-8 readings («ÐŸÐ ÐžÐ”») show the Unicode pattern and the DOS ones (CP866, «╧╨╬─») box glyphs: both removed.
// Never a Cyrillic-to-Cyrillic shuffle (r7 did that and it read as Russian words; r8 reverted it).
// The byte tables are the browser's own WHATWG decoders (TextDecoder); an encoder is the inverse of the decoder
// over the 256 byte values, so nothing here is hand-drawn. Characters a codec cannot encode become '?', and
// C0/C1 control characters produced by the wrong decoder are dropped (a display shows nothing there).
// `level` < 1 garbles only some WORDS (a deterministic per-word choice), for names that degrade step by step: a
// word is either clean or garbled whole, never a Cyrillic word with single Latin letters inside (r9 note 1).

export type Codec = 'cp1251>cp1252';
export const CODECS: Codec[] = ['cp1251>cp1252'];
const LABEL: Record<string, string> = { cp1251: 'windows-1251', cp1252: 'windows-1252' };
/** How the codec is named for people (Russian, for captions). */
export const CODEC_RU: Record<Codec, string> = { 'cp1251>cp1252': '1251 прочитан как латиница (Win95)' };

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

/**
 * Mojibake of `s`: level 1 = the whole string; < 1 = only some whole words. The words garble in a fixed
 * per-string order (deterministic), so a rising level adds words and never takes one back.
 */
export function mojibake(s: string, codec: Codec = codecFor(s), level = 1): string {
  if (level >= 1) return transcode(s, codec);
  if (level <= 0) return s;
  const parts = s.split(/(\s+)/), words = parts.map((p, i) => (i % 2 === 0 && p ? i : -1)).filter((i) => i >= 0);
  const order = [...words].sort((a, b) => h(s, a) - h(s, b));
  const n = Math.min(words.length, Math.ceil(level * words.length - 1e-9)); // any level > 0 garbles at least one word
  const pick = new Set(order.slice(0, n));
  return parts.map((p, i) => (pick.has(i) ? transcode(p, codec) : p)).join('');
}
/** True when `out` is `src` with each whitespace-separated word either kept or garbled whole by `codec` (A13). */
export function wordwise(src: string, out: string, codec: Codec): boolean {
  const a = src.split(/(\s+)/), b = out.split(/(\s+)/);
  if (a.length !== b.length) return false;
  return a.every((p, i) => (i % 2 === 1 ? p === b[i] : b[i] === p || b[i] === transcode(p, codec)));
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
