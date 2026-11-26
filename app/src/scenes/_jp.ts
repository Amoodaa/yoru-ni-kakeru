// Shared helpers for Japanese lyric typesetting: per-glyph sung progress, and vertical (tategaki)
// column layout. Scenes draw the glyphs themselves, in their own style.
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp } from '../engine/util';

export interface GlyphState {
  ch: string;
  word: Word;
  /** Index of the glyph within its word, and within the line. */
  wi: number;
  li: number;
  /** 0 = not sung yet, 1 = sung; in between while the voice is on it. */
  k: number;
}

/**
 * Every glyph of a line with its sung progress at t. A word's glyphs fill in order across its timed
 * morae (Lyrics.wordProgress), so a kanji with a long reading (一言 = ひと・こと) is lit over all of them.
 */
export function glyphStates(line: Line, t: number): GlyphState[] {
  const out: GlyphState[] = [];
  let li = 0;
  for (const w of line.words) {
    const chars = [...w.w];
    const p = Lyrics.wordProgress(w, t) * chars.length;
    chars.forEach((ch, wi) => out.push({ ch, word: w, wi, li: li++, k: clamp(p - wi) }));
  }
  return out;
}

/** Glyphs that sit beside the column's centre line in vertical text, not on it. */
const SMALL = new Set([...'ゃゅょぁぃぅぇぉっゎャュョァィゥェォッヮ']);
/** Glyphs that turn 90° in vertical text. */
const ROTATE = new Set([...'ー〜～…‥―—–-']);
/** Brackets and commas have their own vertical forms. */
const VERTICAL: Record<string, string> = { '「': '﹁', '」': '﹂', '『': '﹃', '』': '﹄', '、': '︑', '。': '︒', '（': '︵', '）': '︶' };

/** How to draw glyph `ch` in a vertical column: the character to draw, an offset in em, and a rotation. */
export function verticalForm(ch: string): { ch: string; dx: number; dy: number; rot: number } {
  if (VERTICAL[ch]) return { ch: VERTICAL[ch]!, dx: 0, dy: 0, rot: 0 };
  if (ROTATE.has(ch)) return { ch, dx: 0, dy: 0, rot: Math.PI / 2 };
  if (SMALL.has(ch)) return { ch, dx: 0.1, dy: -0.1, rot: 0 };
  return { ch, dx: 0, dy: 0, rot: 0 };
}

/**
 * Split a line's glyphs into vertical columns of at most `max` glyphs, breaking only between words
 * (a word longer than `max` gets its own column). Columns read right to left.
 */
export function columns(gs: GlyphState[], max: number): GlyphState[][] {
  const cols: GlyphState[][] = [];
  let cur: GlyphState[] = [];
  for (const w of new Set(gs.map((g) => g.word))) {
    const wg = gs.filter((g) => g.word === w);
    if (cur.length && cur.length + wg.length > max) { cols.push(cur); cur = []; }
    cur.push(...wg);
  }
  if (cur.length) cols.push(cur);
  return cols;
}
