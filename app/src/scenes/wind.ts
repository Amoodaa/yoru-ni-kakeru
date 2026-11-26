// "沈むように溶けてゆくように / 染み付いた霧が晴れる / 忘れてしまいたくて閉じ込めた日々に /
// 差し伸べてくれた君の手を取る / 涼しい風が空を泳ぐように今吹き抜けていく".
// High above the city in a thick night fog (the final chorus streamed into it). The intro's first
// line returns, set where it stood at sunset, now at night. On 霧が晴れる the fog tears open from the
// middle of the sky, ragged and advected, and the view tilts up to an immense starry sky with the milky
// way; a sea of fog stays over the city lights below. On 差し伸べて two lights, ember and moon, drift
// toward each other from either side and join on 手を取る in a flare. On 涼しい風 the wind becomes
// visible: hundreds of curl-noise streamlines sweep in from the left across the whole sky, and the
// last line is carried in on them, glyph by glyph, along the wind. The joined lights rise toward the
// stars at the end, into the outro.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, keys, lerp, prog, pulse, type Key } from '../engine/util';
import { columns, glyphStates, verticalForm } from './_jp';
import { WIND_SKY } from './wind-sky';

type RGB = [number, number, number];
const add = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/** The wind: a steady drift to the right plus a divergence-free swirl (the curl of a sum of waves). */
const WAVES = [
  { kx: 1 / 520, ky: 1 / 410, w: 0.35, ph: 0.3, a: 150 },
  { kx: -1 / 760, ky: 1 / 300, w: -0.28, ph: 2.1, a: 120 },
  { kx: 1 / 300, ky: -1 / 640, w: 0.5, ph: 4.0, a: 70 },
  { kx: 1 / 1100, ky: 1 / 900, w: 0.2, ph: 1.0, a: 260 },
];
function windAt(x: number, y: number, t: number): [number, number] {
  let vx = 1, vy = -0.1;
  for (const k of WAVES) {
    const c = Math.cos(k.kx * x + k.ky * y + k.w * t + k.ph) * k.a;
    vx += c * k.ky;          //  dψ/dy
    vy -= c * k.kx;          // -dψ/dx
  }
  return [vx, vy];
}

export default class Wind extends Scene {
  sky = new FSPass(WIND_SKY, {
    uHorizon: { value: 0.3 }, uTime: { value: 0 }, uFog: { value: 1 }, uClear: { value: 0 }, uStars: { value: 0 }, uSea: { value: 0 }, uGlow: { value: 1 },
    uTear: { value: new THREE.Vector2(0, 0.6) },
    uHead0: { value: new THREE.Vector4() }, uHead1: { value: new THREE.Vector4() },
    uHeadCol0: { value: new THREE.Vector3(...LIN.ember) }, uHeadCol1: { value: new THREE.Vector3(...add(LIN.fog, LIN.moon, 0.6)) },
  });
  lines = new LineBatch(14000);
  text = new Layer2D();
  L: Line[] = [];
  tClear = 0; tReach = 0; tTake = 0; tWind = 0; tWindFull = 0;

  override init() {
    const ly = this.ctx.lyrics;
    const l49 = ly.get('沈むように', 1), l50 = ly.get('霧が晴れる'), l52 = ly.get('手を取る'), l53 = ly.get('涼しい風');
    this.L = ly.lines.slice(l49.i, l53.i + 1);
    this.tClear = l50.words[2]!.start;              // 晴れる
    this.tReach = l52.words[0]!.start;              // 差し伸べて
    this.tTake = l52.words[4]!.start;               // 取る
    this.tWind = l53.start;                         // 涼しい
    this.tWindFull = l53.words[2]!.end;             // 空を
  }

  /** The two lights (screen px) at τ: apart, reaching, joined, then rising. */
  heads(tau: number): [[number, number], [number, number]] {
    const u = prog(tau, this.tReach - 0.6, this.tTake, ease.inOutCubic);
    const after = Math.max(0, tau - this.tTake);
    const rise = keys(tau, [[this.tTake, 0], [this.tWind + 1, 40, ease.inOutQuad], [this.ctx.end, 330, ease.inQuad]] as Key[]);
    const mx = 820 + 120 * prog(tau, this.tTake, this.ctx.end, ease.inOutQuad) + 14 * Math.sin(after * 0.9);
    const my = 600 - rise;
    const r = 7 * u;
    const w = 3.2 * tau;
    const ja: [number, number] = [mx + r * Math.cos(w), my + r * Math.sin(w)];
    const jb: [number, number] = [mx - r * Math.cos(w), my - r * Math.sin(w)];
    const sa: [number, number] = [250 + 30 * Math.sin(tau * 0.7), 880 + 20 * Math.sin(tau * 1.1)];
    const sb: [number, number] = [1690 + 25 * Math.sin(tau * 0.6 + 2), 1000 + 14 * Math.sin(tau * 0.9)];
    // they curve toward each other, rising
    const arc = Math.sin(Math.PI * u) * 120;
    return [[lerp(sa[0], ja[0], u), lerp(sa[1], ja[1], u) - arc], [lerp(sb[0], jb[0], u), lerp(sb[1], jb[1], u) - arc * 0.6]];
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t;
    const u = this.sky.u;
    const clear = prog(t, this.tClear - 0.5, this.tClear + 4.5, ease.inOutCubic);
    u.uTime!.value = t;
    u.uHorizon!.value = keys(t, [[this.ctx.start, 0.34], [this.tClear - 0.3, 0.31], [this.tClear + 4.5, 0.17, ease.inOutCubic], [this.ctx.end, 0.15]] as Key[]);
    u.uFog!.value = 1.15;
    u.uClear!.value = clear * 2.6;
    u.uStars!.value = prog(t, this.tClear - 0.2, this.tClear + 3.5, ease.inOutQuad);
    u.uSea!.value = prog(t, this.tClear, this.tClear + 3, ease.inOutQuad);
    u.uGlow!.value = 1 + 0.6 * pulse(t, this.tTake, 0.6) * (t >= this.tTake ? 1 : 0);
    (u.uTear!.value as THREE.Vector2).set(-0.12, 0.62);

    // the lights
    const lb = this.lines;
    lb.clear();
    const lightA = prog(t, this.tReach - 1.6, this.tReach - 0.2);
    const cA: RGB = add(LIN.ember, LIN.rose, 0.1), cB: RGB = add(LIN.fog, LIN.moon, 0.6);
    if (lightA > 0) {
      const T = 0.9, M = 30;
      let prev = this.heads(t - T);
      for (let i = 1; i <= M; i++) {
        const h = this.heads(t - T * (1 - i / M));
        const a = Math.pow(i / M, 1.4) * lightA;
        for (let k = 0; k < 2; k++) {
          const c = k === 0 ? cA : cB;
          lb.seg2(prev[k]![0], prev[k]![1], h[k]![0], h[k]![1], 2.2, mul(c, 2.2), a * 0.8);
          lb.seg2(prev[k]![0], prev[k]![1], h[k]![0], h[k]![1], 9, c, a * 0.1);
        }
        prev = h;
      }
    }
    const hh = this.heads(t);
    const flare = t >= this.tTake ? pulse(t, this.tTake, 0.35) : 0;
    const hu = [u.uHead0!, u.uHead1!];
    for (let k = 0; k < 2; k++) (hu[k]!.value as THREE.Vector4).set(hh[k]![0], hh[k]![1], 9 + 26 * flare, lightA * (1.6 + 5 * flare + 0.3 * audio.env('vocal', t)));

    // the wind: streamlines sweeping in from the left across the whole sky
    this.wind(t, lb, audio.env('vocal', t));

    this.sky.render(renderer, out);
    lb.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    this.columns(c, t);
    this.carried(c, t);
    comp.draw(renderer, this.text.upload(), out);

    return { bloom: 0.75, bloomThreshold: 0.95, halation: 0.2, halationColor: [1.0, 0.45, 0.28], grain: 0.035, vignette: 0.42, ca: 0.6, flash: 0.05 * flare };
  }

  windFront(t: number) { return lerp(-500, W + 1000, prog(t, this.tWind - 0.7, this.tWindFull, ease.inOutCubic)); }

  wind(t: number, lb: LineBatch, vocal: number) {
    if (t < this.tWind - 0.8) return;
    const front = this.windFront(t);
    const N = 280, K = 24, ds = 17;
    const span = W * 1.5;
    const gain = 0.85 + 0.35 * vocal;
    for (let i = 0; i < N; i++) {
      const sp = lerp(220, 380, hash(i, 1));
      const x0 = (((hash(i, 2) * span + sp * t) % span) + span) % span - W * 0.3;
      let x = x0, y = lerp(40, H - 60, hash(i, 3));
      const lane = hash(i, 4);
      const base = lane < 0.12 ? 0.95 : lerp(0.18, 0.5, hash(i, 5));
      const col = mul(lane < 0.7 ? add(LIN.fog, LIN.moon, 0.4 * hash(i, 6)) : add(LIN.fog, LIN.ember, 0.35), base * gain);
      const w = lerp(1.0, 2.0, hash(i, 7));
      const edge = clamp((x0 + W * 0.3) / (W * 0.25));          // hides the wrap on the left
      for (let k = 0; k < K; k++) {
        const [vx, vy] = windAt(x, y, t);
        const l = Math.hypot(vx, vy) || 1;
        const nx = x + (vx / l) * ds, ny = y + (vy / l) * ds;
        const s = (k + 0.5) / K;
        const reveal = clamp((front - nx) / 400);
        const a = Math.pow(Math.sin(Math.PI * s), 0.9) * reveal * edge;
        if (a > 0.003) lb.seg2(x, y, nx, ny, w, col, a);
        x = nx; y = ny;
      }
    }
  }

  /** Lines 49–52: vertical columns where the intro set its first line. */
  columns(c: CanvasRenderingContext2D, t: number) {
    const size = 86, adv = size * 1.14, gap = size * 1.5;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(F.mincho(700), size);
    for (let li = 0; li < this.L.length - 1; li++) {
      const line = this.L[li]!, next = this.L[li + 1]!;
      const appear = prog(t, line.start - 0.9, line.start - 0.1, ease.outCubic);
      const last = li === this.L.length - 2;
      const out = last ? prog(t, line.end, line.end + 0.45, ease.inQuad) : prog(t, next.start - 0.25, next.start + 0.6, ease.inCubic);
      const alpha = appear * (1 - out);
      if (alpha <= 0.001) continue;
      const sink = 90 * out;
      columns(glyphStates(line, t), 8).forEach((col, ci) => {
        col.forEach((g, i) => {
          const v = verticalForm(g.ch);
          const x = (li % 2 ? 1220 : 1590) - ci * gap + v.dx * size;
          const y = 150 + i * adv + adv / 2 + v.dy * size + sink * (0.4 + g.li / 12) - 6 * clamp(g.k);
          c.globalAlpha = alpha * (g.k > 0 ? 1 : 0.32);
          c.fillStyle = g.k > 0 && g.k < 1 ? rgba('ember') : g.k >= 1 ? rgba('moon') : rgba('fog');
          c.save();
          c.translate(x, Math.min(y, H + size));
          if (v.rot) c.rotate(v.rot);
          c.fillText(v.ch, 0, 0);
          c.restore();
        });
      });
    }
    c.restore();
  }

  /** Line 53, carried in on the wind: each glyph flies in along the wind to its place on a wave. */
  carried(c: CanvasRenderingContext2D, t: number) {
    const line = this.L[this.L.length - 1]!;
    const gs = glyphStates(line, t);
    const size = 66, adv = 74;
    const x0 = (W - gs.length * adv) / 2 + adv / 2;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(F.mincho(700), size);
    const pathY = (x: number) => 842 + 22 * Math.sin(x / 240 - t * 0.9) + 10 * Math.sin(x / 97 + t * 0.6);
    gs.forEach((g, i) => {
      const tA = g.word.start - 0.9 + 0.05 * g.wi;
      const e = prog(t, tA, tA + 0.75, ease.outCubic);
      if (e <= 0) return;
      const drift = Math.max(0, t - line.start) * 7;   // the whole line drifts with the wind
      const x = x0 + i * adv - (1 - e) * 260 + drift;
      const y = pathY(x) - (1 - e) * (150 + 40 * Math.sin(i * 1.7)) - drift * 0.4;
      const slope = (pathY(x + 6) - pathY(x - 6)) / 12;
      c.globalAlpha = e * (g.k > 0 ? 1 : 0.34);
      c.fillStyle = g.k > 0 && g.k < 1 ? rgba('ember') : g.k >= 1 ? rgba('moon') : rgba('fog');
      c.save();
      c.translate(x, y - 6 * clamp(g.k));
      c.rotate(Math.atan(slope) * 0.7 + (1 - e) * 0.5);
      c.fillText(g.ch, 0, 0);
      c.restore();
    });
    c.restore();
  }
}
