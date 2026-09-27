// Every on-screen text item, as drawn, for the QA checks (TREATMENT r5 items 1, 4, 6, 7).
// Drawing helpers report each text they put on screen this frame: its identity, its full string, its
// kind, whether it is fully visible (reveal finished, not fading, on screen) and its box in logical px.
// scripts/qa-reading-time.ts renders the timeline frame by frame through `__video.texts(t)` and turns
// the per-frame reports into visible intervals. Logging is off (a no-op) unless a probe is running.

import { MOJI, type Moji } from './mojibake';

export type TextKind =
  | 'karaoke' // the sung entry: timed by the song, exempt from reading time
  | 'note' // the printed heading under the sung line (translation note)
  | 'callout' // the drone's annotations
  | 'step' // a WHAT TO DO step
  | 'system' // the city's system line
  | 'sign' // a city sign that carries meaning (clean text)
  | 'banner' // a big UI banner
  | 'chip' // small persistent HUD chips (HOME · x km)
  | 'title' // the handbook's cover title
  | 'place' // a station/district/place name (must exist in city.json)
  | 'garble' // broken-encoding glyph soup (exempt from reading time and the name check; ≥1.5 s on screen)
  | 'counter' // the page counter numerals (a device, exempt)
  | 'prop' // text that is part of an object (the contents page flashed on the card), exempt
  // objects (not text), logged for the r4/r6 frame checks:
  | 'book' // the handbook as a picture (r6: must never be on screen)
  | 'hand' // the child's hand and sleeve in the POV (a prop: counts for the lower-frame coverage check)
  | 'drone' // the drone (TREATMENT r5 item 8: none; A6)
  | 'map'; // the map card (a non-diegetic overlay; labels inside it belong to it)

export interface TextBox { x: number; y: number; w: number; h: number }
export interface TextItem {
  id: string; text: string; kind: TextKind; full: boolean;
  box?: TextBox;
  /** Karaoke only: cap height in px (vertical cut: ≥ 70). */
  cap?: number;
  /** Place names drawn inside other text (a callout 'YOUR STOP · ORCHARD ROW'): checked against city.json. */
  places?: string[];
  /** Objects: the outline on screen (convex hull is enough) for the coverage check; else `box` is used. */
  poly?: [number, number][];
  /** Mojibake: the source of each ' / '-separated part (from the registry in src/mojibake.ts), for A13. */
  moji?: (Moji | null)[];
  /** A layout self-check failure reported by the drawing code (e.g. a line-map label on a dot: A12). */
  bad?: string;
  /** Cut by scene geometry this frame (e.g. a platform sign half behind a window post): no text may be cut. */
  clip?: boolean;
  /** Runs of glyphs that share one fill colour (css), with their boxes and font size (A9 contrast). */
  ink?: { box: TextBox; fg: string; size: number }[];
  /** The torch hand: the angle (degrees, on screen) between the forearm (cuff → heel) and the torch axis (B7). */
  wristDeg?: number;
  /** Karaoke: how many letters are lit (sung) this frame (A10 sync). */
  lit?: number;
}

let frame: TextItem[] | null = null;

export const textlog = {
  get on() { return frame !== null; },
  begin() { frame = []; },
  push(it: TextItem) { if (frame) frame.push(it); },
  /** Everything logged so far this frame is not fully visible (a fade over the whole frame). */
  dim() { if (frame) for (const it of frame) it.full = false; },
  end(): TextItem[] { const f = frame ?? []; frame = null; return f; },
};

/** Shorthand used by the drawing helpers. */
export function logText(kind: TextKind, text: string, full: boolean, box?: TextBox, extra: Partial<TextItem> = {}) {
  if (!frame) return;
  const mj = kind === 'garble' && !extra.moji ? text.split(' / ').map((p) => MOJI.get(p) ?? null) : extra.moji;
  frame.push({ id: extra.id ?? `${kind}:${text}`, text, kind, full, box, ...extra, ...(mj ? { moji: mj } : {}) });
}
