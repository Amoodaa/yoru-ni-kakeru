import { hexToLinear } from './util';

// The project's palette. This is the one file a new video changes to restyle the whole engine:
// every entry becomes LIN.<name> (linear RGB for GL), rgba('<name>', a) (Canvas2D) and a GLSL
// constant C_<NAME> in every FSPass (see glsl/common.ts). See docs/TREATMENT.md for how each is used.
export const HEX = {
  night: '#0A0E22', // background: deep indigo night
  dusk: '#251E48', // raised dark: the sky's upper band at dusk
  haze: '#6B5A8E', // muted lilac haze near the horizon
  ember: '#F08A5D', // the setting sun, warm light, the sung word
  rose: '#D9566A', // the sun's lower edge, rare accent
  fog: '#8E97B8', // unsung type, distant lights
  moon: '#F3EEE4', // primary type, stars, the moon
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
