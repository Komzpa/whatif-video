import { hexToLinear } from './util';

// The What if palette (docs/TREATMENT.md "Palette"): future-city dusk, warm polluted haze against
// cold shadow, sparse neon. Rules: neon belongs to the city and never highlights lyrics; red belongs
// to the handbook (page numbers, the sung word); lamp belongs to the drone (the only soft bloom).
export const HEX = {
  smog: '#B8672F', // amber haze, low end of the wide-shot gradient
  smog2: '#E0A25A', // amber haze, high end
  shadow: '#0B1016', // night
  deep: '#131B24', // near geometry at night
  concrete: '#6F7780', // wireframes and structures
  fog: '#2B343F', // far layers
  neon: '#FF3D7F', // city signage only
  sodium: '#FFB547', // streetlights
  paper: '#EDE6D6', // the handbook
  ink: '#16140F', // print on paper
  red: '#D7362B', // page numbers, the sung word
  lamp: '#FFE8B5', // the drone's light, the night-light
  coat: '#C9A441', // the child's raincoat
  // engine aliases (post flash, HUD): kept so engine code needs no palette knowledge
  bone: '#EDE6D6',
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mix two palette colours (sRGB, for Canvas2D) at k, as an rgba() string. */
export function mixRgba(a: PaletteKey | string, b: PaletteKey | string, k: number, alpha = 1): string {
  const p = (x: string) => { const n = parseInt(((HEX as Record<string, string>)[x] ?? x).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const pa = p(a), pb = p(b);
  return `rgba(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')},${alpha})`;
}
