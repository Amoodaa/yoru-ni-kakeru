// Pre-chorus 2: "信じていたいけど信じれないこと … 分かり合えるさ信じてるよ" and the instrumental after it.
// A huge split-flap departure board in a night station. Each lyric line is a destination of a night
// train: its row re-times itself, then every glyph cascades through random kana and lands on its
// exact sung timing (ember while sung, moon after). それでもきっと / いつかはきっと / 僕らはきっと are
// three rows with their きっと stacked in one column: three hard flips with no cascade, the board
// jolting each time. On 信じてるよ the board settles: the other rows dim and a warm lamp lights the
// last row, the night train (夜行). In the instrumental the board flips to the beat in waves:
// timetable codes, then rings of kana noise, then rows dimly spelling the next words of the song.
// At the end it all flips to blank and the lights go out.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass } from '../engine/gl';
import { LIN } from '../engine/palette';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, keys, lerp, mulberry32, noise1, prog, pulse, type Key } from '../engine/util';
import { Atlas, BOARD_GLSL, COL, DIGITS, HIRA, KATA, LATIN, NCOL, NROW, colX, isNarrow, paintTexture, rowY } from './flap-board';

type RGB = readonly [number, number, number];
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
/** A flap's print colour: fixed, or a lyric glyph's karaoke state. */
type Tint = RGB | { w: Word; wi: number; n: number };
interface Target { t: number; ch: string; tint: Tint; n: number; dur: number }
interface Cell { s: number[]; g: number[]; dur: number[]; tint: Tint[] }

const DUR = 0.06; // one flap falling
const DUR_HARD = 0.042;
const IV = 0.075; // flip interval inside a cascade
const BLUR = 0.014; // shutter (s) of the flap's motion blur
const T_NOISE = mul(LIN.fog, 0.42);
const T_CODE = mul(LIN.moon, 0.6);
const T_FOG = mul(LIN.fog, 0.62);
const T_GHOST = mul(LIN.fog, 0.4);
const TYPE_TINT: Record<string, RGB> = { 特急: mul(LIN.rose, 0.85), 快速: mul(LIN.ember, 0.72), 急行: mul(LIN.ember, 0.6), 夜行: mul(LIN.moon, 0.75) };

/** Earliest time a glyph of a word counts as sung (glyphStates' k > 0): the word's progress passes wi/n. */
function glyphStart(w: Word, wi: number, n: number) {
  if (wi === 0) return w.start;
  let a = w.start, b = w.end;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (Lyrics.wordProgress(w, m) * n > wi) b = m; else a = m;
  }
  return b;
}

/** A destination row of the board: the words it shows and where it starts. */
interface Row { words: Word[]; off: number; time: string; type: string; plat: string }

export default class Flap extends Scene {
  atlas!: Atlas;
  data = new Float32Array(NCOL * NROW * 3 * 4);
  state = new THREE.DataTexture(this.data, NCOL, NROW * 3, THREE.RGBAFormat, THREE.FloatType);
  board!: FSPass;
  cells: Cell[] = [];
  targets: Target[][] = [];
  rows: Row[] = [];
  rowStart: number[] = [];
  L32!: Line;
  tKitto: number[] = [];
  tShin = 0; tSettle = 0; dA = 0; dB = 0; dC = 0; dZ = 0;
  camKeys: { x: Key[]; y: Key[]; v: Key[] } = { x: [], y: [], v: [] };

  override init() {
    const { lyrics: ly, audio: au } = this.ctx;
    const L = [27, 28, 29, 30].map((i) => ly.get(['信じていたい', 'そんなのどうしたって', 'これからだって', 'そのたんび'][i - 27]!));
    const L31 = ly.get('それでもきっと');
    this.L32 = ly.get('分かり合えるさ');
    const nextLines = [ly.get('もう嫌だって疲れたんだって'), ly.get('がむしゃらに'), ly.get('もう嫌だって疲れたよ'), ly.get('本当は僕も')];
    const w31 = L31.words;
    this.rows = [
      { words: L[0]!.words, off: 0, time: '23:41', type: '各停', plat: ' 1' },
      { words: L[1]!.words, off: 0, time: '23:47', type: '快速', plat: ' 3' },
      { words: L[2]!.words, off: 0, time: '23:52', type: '普通', plat: ' 2' },
      { words: L[3]!.words, off: 0, time: '23:58', type: '急行', plat: ' 4' },
      { words: [w31[0]!, w31[1]!], off: 0, time: '00:03', type: '特急', plat: ' 5' },
      { words: [w31[2]!, w31[3]!], off: 0, time: '00:09', type: '特急', plat: ' 5' },
      { words: [w31[4]!, w31[5]!], off: 1, time: '00:15', type: '特急', plat: ' 6' }, // きっと stacks with the rows above
      { words: this.L32.words, off: 0, time: '00:24', type: '夜行', plat: ' 7' },
    ];
    this.rowStart = this.rows.map((r) => r.words[0]!.start);
    this.tKitto = [w31[1]!.start, w31[3]!.start, w31[5]!.start];
    this.tShin = this.L32.words[1]!.start;
    this.tSettle = this.L32.end;
    // the instrumental, in bars from the first downbeat after the last line
    const downs = au.downbeats.filter((d) => d > this.L32.end + 0.3 && d < this.ctx.end - 0.2);
    this.dA = downs[0]!; this.dB = downs[2]!; this.dC = downs[4]!; this.dZ = downs[6] ?? downs[downs.length - 1]!;

    let extra = '';
    for (const r of this.rows) extra += r.words.map((w) => w.w).join('') + r.type;
    for (const l of nextLines) extra += l.text;
    extra += '回送臨時';
    this.atlas = new Atlas(extra);

    for (let i = 0; i < NCOL * NROW; i++) { this.cells.push({ s: [], g: [], dur: [], tint: [] }); this.targets.push([]); }
    const put = (r: number, c: number, t: number, ch: string, tint: Tint, n = 4, dur = DUR) => this.targets[r * NCOL + c]!.push({ t, ch, tint, n, dur });
    const putText = (r: number, c0: number, s: string, t: (i: number) => number, tint: (i: number, ch: string) => Tint, n: (i: number) => number) =>
      [...s].forEach((ch, i) => put(r, c0 + i, t(i), ch, tint(i, ch), n(i)));
    const typeTint = (s: string) => TYPE_TINT[s] ?? T_FOG;
    const rowMeta = (r: number, t: number, time: string, type: string, plat: string, dim = 1) => {
      putText(r, COL.time, time, (i) => t + i * 0.03, () => mul(T_CODE, dim), (i) => 4 + (i % 3));
      putText(r, COL.type, type, (i) => t + 0.08 + i * 0.04, () => mul(typeTint(type), dim), () => 5);
      putText(r, COL.plat, plat, (i) => t + 0.12 + i * 0.03, () => mul(T_CODE, dim), () => 6);
    };

    // the board as it stands when the lights come on: tonight's timetable, destinations not yet shown
    const t0 = -1e9;
    const initial = [['23:38', '回送'], ['23:44', '普通'], ['23:50', '各停'], ['23:55', '快速'], ['00:01', '普通'], ['00:07', '各停'], ['00:12', '快速'], ['00:20', '臨時']];
    initial.forEach(([time, type], r) => rowMeta(r, t0, time!, type!, ' ' + ((r * 3) % 7 + 1), 0.75));

    // lyric rows: the row re-times as it comes up, then each glyph cascades onto its sung time
    this.rows.forEach((row, r) => {
      rowMeta(r, this.rowStart[r]! - 0.45, row.time, row.type, row.plat);
      let col = COL.dest + row.off;
      for (const w of row.words) {
        const chars = [...w.w];
        const hard = this.tKitto.includes(w.start);
        chars.forEach((ch, wi) => {
          const tint = { w, wi, n: chars.length };
          if (hard) put(r, col, w.start, ch, tint, 0, DUR_HARD);
          else put(r, col, glyphStart(w, wi, chars.length), ch, tint, 4 + Math.floor(hash(r, col, 3) * 4));
          col++;
        });
      }
    });

    // instrumental A: timetable codes, half the rows re-written on every beat, in a sweep
    const beats = au.beats.filter((b) => b >= this.dA - 0.01 && b < this.ctx.end);
    beats.forEach((b, bi) => {
      if (b >= this.dB - 0.01) return;
      const rng = mulberry32(1000 + bi);
      for (let r = bi % 2; r < NROW; r += 2) {
        if (r === 7 && b < downs[1]! - 0.01) continue; // the warm row holds a bar longer
        const tr = b + r * 0.03;
        const hh = rng() < 0.5 ? '00' : '01';
        rowMeta(r, tr, `${hh}:${Math.floor(rng() * 6)}${Math.floor(rng() * 10)}`, ['回送', '臨時', '夜行', '各停'][Math.floor(rng() * 4)]!, ` ${Math.floor(rng() * 9) + 1}`);
        putText(r, COL.dest, codeLine(rng), (i) => tr + 0.05 + i * 0.022, () => T_CODE, () => 1 + Math.floor(rng() * 2));
      }
    });
    // instrumental B: rings of kana noise from the centre of the board, one on every beat
    beats.forEach((b, bi) => {
      if (b < this.dB - 0.01 || b >= this.dC - 0.01) return;
      const cx = bi % 2 ? 14.3 : 9.5, cy = 7.3;
      for (let r = 0; r < NROW; r++) for (let c = 0; c < NCOL; c++) {
        const d = Math.hypot(colX(c) - cx, rowY(r) - cy);
        const pool = isNarrow(c) ? DIGITS : HIRA + KATA;
        const ch = pool[Math.floor(hash(r, c, bi, 7) * pool.length)]!;
        const bright = 0.75 + 0.5 * hash(r, c, bi, 9);
        put(r, c, b + d * 0.032, ch, mul(T_NOISE, bright), 1);
      }
    });
    // instrumental C: the next words of the song, dimly, row by row; the empty rows blank out
    const ghost: (string | null)[] = [null, nextLines[0]!.text, 'がむしゃらに差し伸べた', '僕の手を振り払う君', nextLines[2]!.text, nextLines[3]!.text, null, null];
    const beat = (this.dC - this.dB) / 8;
    ghost.forEach((s, r) => {
      const tr = this.dC + r * beat * 0.5;
      if (s) rowMeta(r, tr, `00:${31 + r * 4}`, '夜行', ` ${r + 1}`, 0.6);
      else rowMeta(r, tr, '  :  ', '  ', '  ');
      const text = (s ?? '').padEnd(16, ' ');
      putText(r, COL.dest, text, (i) => tr + 0.06 + i * 0.03, () => T_GHOST, () => 3 + Math.floor(hash(r, 11) * 3));
    });
    // the end: everything flips to blank, right to left
    for (let r = 0; r < NROW; r++) for (let c = 0; c < NCOL; c++) put(r, c, this.dZ + (NCOL - 1 - c) * 0.018 + r * 0.02, ' ', T_NOISE, 2);

    // expand targets into flips (cascades never overlap the previous flip in a cell)
    this.targets.forEach((ts, i) => {
      const cell = this.cells[i]!;
      const c = i % NCOL, r = Math.floor(i / NCOL);
      const pool = isNarrow(c) ? DIGITS : HIRA;
      ts.sort((a, b) => a.t - b.t);
      for (const tg of ts) {
        const last = cell.s.length ? cell.s[cell.s.length - 1]! + cell.dur[cell.dur.length - 1]! * 1.5 : -Infinity;
        const tl = Math.max(tg.t, last);
        let n = tg.n;
        while (n > 0 && tl - n * IV < last) n--;
        for (let k = n; k >= 1; k--) {
          cell.s.push(tl - k * IV); cell.dur.push(DUR); cell.tint.push(T_NOISE);
          cell.g.push(this.atlas.g(pool[Math.floor(hash(r, c, tl * 100, k) * pool.length)]!));
        }
        cell.s.push(tl); cell.dur.push(tg.dur); cell.tint.push(tg.tint); cell.g.push(this.atlas.g(tg.ch));
      }
    });

    this.state.minFilter = this.state.magFilter = THREE.NearestFilter;
    this.board = new FSPass(BOARD_GLSL, {
      uAtlas: { value: this.atlas.texture }, uState: { value: this.state }, uPaint: { value: paintTexture() },
      uCam: { value: new THREE.Vector3() }, uRot: { value: new THREE.Vector3() },
      uLight: { value: 1 }, uTubes: { value: 1 }, uTime: { value: 0 },
      uRowLight: { value: new Array(8).fill(1) }, uRowWarm: { value: new Array(8).fill(0) }, uRowLamp: { value: new Array(8).fill(0) },
    });

    // camera: close on the rows as they fill, tight on the きっと stack, wide for the last line,
    // pushing in on the warm row, wide again for the instrumental
    const rs = this.rowStart, e = ease.inOutCubic, s0 = this.ctx.start;
    const wide = this.L32.start + 0.4;
    this.camKeys.x = [[s0, 11.9], [rs[2]!, 11.9], [rs[3]!, 12.6, e], [rs[4]!, 12.0, e], [rs[6]! + 0.5, 11.4, e], [wide, 12.05, e], [this.tShin, 12.05], [this.tSettle + 0.3, 12.1, e], [this.dA - 1.2, 12.1], [this.dA, 12.05, e], [this.ctx.end, 12.3, e]];
    this.camKeys.y = [[s0, 4.4], [rs[1]!, 4.6], [rs[2]!, 5.3, e], [rs[3]!, 6.3, e], [rs[4]!, 8.2, e], [rs[5]!, 9.3, e], [rs[6]!, 10.0, e], [rs[6]! + 0.5, 10.0], [wide, 7.3, e], [this.tShin, 7.5], [this.tSettle + 0.3, 10.4, e], [this.dA - 1.2, 10.6], [this.dA, 7.35, e], [this.dC, 7.35], [this.ctx.end, 7.6, e]];
    this.camKeys.v = [[s0, 13.0], [rs[2]!, 12.6], [rs[3]!, 11.6, e], [rs[4]!, 10.4, e], [rs[6]!, 10.2, e], [rs[6]! + 0.5, 10.2], [wide, 17.0, e], [this.tShin, 16.6], [this.tSettle + 0.3, 14.4, e], [this.dA - 1.2, 14.0], [this.dA, 17.6, e], [this.dC, 16.8, e], [this.ctx.end, 15.4, ease.linear]];
  }

  tint(k: Tint, t: number): RGB {
    if (Array.isArray(k)) return k as RGB;
    const { w, wi, n } = k as { w: Word; wi: number; n: number };
    const g = clamp(Lyrics.wordProgress(w, t) * n - wi);
    return g <= 0 ? T_NOISE : g < 1 ? mul(LIN.ember, 0.95) : mul(LIN.moon, 0.8);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, audio } = this.ctx;
    const d = this.data;
    // per-cell flip state at t
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]!;
      let lo = 0, hi = cell.s.length; // first flip after t
      while (lo < hi) { const m = (lo + hi) >> 1; if (cell.s[m]! <= t) lo = m + 1; else hi = m; }
      const k = lo - 1;
      const o = i * 4, o1 = (i + NCOL * NROW) * 4, o2 = (i + 2 * NCOL * NROW) * 4;
      const gN = k >= 0 ? cell.g[k]! : 0, gP = k >= 1 ? cell.g[k - 1]! : 0;
      const ph = k >= 0 ? (t - cell.s[k]!) / cell.dur[k]! : 2;
      const tN = k >= 0 ? this.tint(cell.tint[k]!, t) : T_NOISE, tP = k >= 1 ? this.tint(cell.tint[k - 1]!, t) : T_NOISE;
      d[o] = gP; d[o + 1] = gN; d[o + 2] = ph < 1.5 ? ph : -1; d[o + 3] = k >= 0 ? BLUR / cell.dur[k]! : 0;
      d[o1] = tP[0]; d[o1 + 1] = tP[1]; d[o1 + 2] = tP[2];
      d[o2] = tN[0]; d[o2 + 1] = tN[1]; d[o2 + 2] = tN[2];
    }
    this.state.needsUpdate = true;

    // lights: they stutter on at the cut, dim as the board settles, and go out at the end
    const lt = t - this.ctx.start;
    const fi = frameIdx(t);
    const on = lt < 0.06 ? 0 : lt < 0.1 ? 0.7 : lt < 0.17 ? 0.08 : lt < 0.22 ? 0.85 : lt < 0.27 ? 0.3 : prog(lt, 0.27, 0.6, ease.outCubic) * 0.25 + 0.75;
    const tOut = this.ctx.end - 0.95;
    const outK = t < tOut ? 1 : t < tOut + 0.08 ? 0.35 : t < tOut + 0.16 ? 0.9 : t < tOut + 0.24 ? 0.15 : t < tOut + 0.3 ? 0.6 : (1 - prog(t, tOut + 0.3, tOut + 0.55, ease.outCubic)) * 0.25 * (hash(fi, 5) > 0.4 ? 1 : 0.4);
    const settle = prog(t, this.tShin - 0.3, this.tShin + 1.6, ease.inOutQuad) * (1 - prog(t, this.dA - 1.0, this.dA + 0.2, ease.inOutQuad));
    const u = this.board.u;
    u.uLight!.value = on * outK * lerp(1, 0.5, settle);
    u.uTubes!.value = on * outK * lerp(1, 0.55, settle);
    u.uTime!.value = t;

    const rl = u.uRowLight!.value as number[], rw = u.uRowWarm!.value as number[], rp = u.uRowLamp!.value as number[];
    const kick = this.tKitto.reduce((s, tk) => s + pulse(t, tk, 0.09), 0);
    const bi = Math.floor(audio.beatAt(t));
    for (let r = 0; r < NROW; r++) {
      const start = this.rowStart[r]!, next = this.rowStart[r + 1] ?? this.tShin;
      const active = t >= start - 0.3 && t < next - 0.2;
      // past rows stay lit but a step back; the board narrows to one row as it settles
      const past = prog(t, next - 0.2, next + 0.4) * (r < 7 ? 1 : 0);
      rl[r] = lerp(lerp(1, 0.78, past), r === 7 ? 1 : 0.32, settle);
      rw[r] = r === 7 ? prog(t, this.tShin - 0.2, this.tShin + 1.4, ease.inOutQuad) * (1 - prog(t, this.dA + 1.0, this.dA + 3.5, ease.inOutQuad)) : 0;
      let lamp = active ? 1 : 0;
      if (r >= 4 && r <= 6) lamp += 2.5 * pulse(t, this.tKitto[r - 4]!, 0.14);
      if (r === 7 && t >= this.rowStart[7]! - 0.3) lamp = Math.max(lamp, 1 - prog(t, this.dA, this.dA + 0.4));
      // the instrumental: the lamps chase down the board on the beat
      if (t >= this.dA && t < this.dZ) lamp = Math.max(lamp, bi % NROW === r ? 1 - (audio.beatAt(t) % 1) * 0.6 : 0);
      rp[r] = lamp * on * outK;
    }

    // camera
    const ck = this.camKeys;
    const vis = keys(t, ck.v);
    const sway = noise1(t * 0.25, 3) * 0.05;
    (u.uCam!.value as THREE.Vector3).set(keys(t, ck.x) + noise1(t * 0.4, 1) * 0.08, keys(t, ck.y) + noise1(t * 0.4, 2) * 0.05 + kick * 0.04, vis * 1.8);
    (u.uRot!.value as THREE.Vector3).set(-0.07 + noise1(t * 0.2, 4) * 0.015, -0.05 + sway + 0.04 * Math.sin((t - this.ctx.start) * 0.11), noise1(t * 0.3, 6) * 0.006);
    this.board.render(renderer, out);

    return {
      bloom: 0.65, bloomThreshold: 0.95, halation: 0.16, halationColor: [1.0, 0.42, 0.25], grain: 0.04, vignette: 0.5, ca: 0.5,
      shake: [Math.sin(t * 91) * 5 * kick, Math.cos(t * 77) * 4 * kick], zoom: 1 + 0.012 * kick,
    };
  }
}

/** A line of timetable codes for the destination field: train numbers, station codes, dots. */
function codeLine(rng: () => number) {
  const L = () => LATIN[Math.floor(rng() * LATIN.length)]!;
  const D = () => DIGITS[Math.floor(rng() * 10)]!;
  const toks = [() => L() + L() + '-' + D() + D() + D(), () => D() + D() + D() + D(), () => L() + L() + L(), () => '・', () => '→', () => D() + D() + ':' + D() + D()];
  let s = '';
  while (s.length < 16) {
    const tk = toks[Math.floor(rng() * toks.length)]!();
    if (s.length + tk.length > 16) break;
    s += tk + ' ';
  }
  return s.slice(0, 16).padEnd(16, ' ');
}
