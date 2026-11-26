// Outro: "繋いだ手を離さないでよ / 二人今、夜に駆け出していく", then the music to the end.
// It bookends the intro: the same rooftop and chain-link fence, now deep night under the stars.
// On 繋いだ手を two small lights, ember and moon, drift together at the fence and are held close
// through 離さないでよ. On 二人今 they lift; on 駆け出していく they race over the fence and up into
// the sky, braiding round each other, the view tilting up after them as in the intro. Their long
// trails fade into a new constellation, and the credits are set vertically on the left like the
// intro's title. A slow hold, then a fade to black at the very end.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, keys, lerp, noise1, prog } from '../engine/util';
import { columns, glyphStates, verticalForm } from './_jp';
import { CH, NB, NC, NP, OUTRO_SKY } from './outro-sky';

type P = [number, number];
/** The path the lights race along, in sky space (x in aspect units, height above the horizon). */
const PATH: P[] = [[-0.1, -0.085], [-0.08, 0.07], [-0.02, 0.21], [0.12, 0.36], [0.23, 0.52], [0.17, 0.64], [0.0, 0.71], [-0.15, 0.67]];
/** The constellation: points of alternate trails (ember, moon, ...), ending where the two met. */
const STARS: [number, number][] = [[0, 8], [1, 20], [0, 31], [1, 42], [0, 52], [2, NP - 1]];

function catmull(t: number): P {
  const n = PATH.length - 1;
  const x = clamp(t) * n, i = Math.min(n - 1, Math.floor(x)), u = x - i;
  const p0 = PATH[Math.max(0, i - 1)]!, p1 = PATH[i]!, p2 = PATH[i + 1]!, p3 = PATH[Math.min(n, i + 2)]!;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export default class Outro extends Scene {
  sky = new FSPass(OUTRO_SKY, {
    uHorizon: { value: 0.34 }, uRoof: { value: 0.12 }, uTime: { value: 0 }, uTwinkle: { value: 0 },
    uTrail: { value: 0 }, uCons: { value: 0 }, uHead: { value: 0 },
    uP0: { value: [] as THREE.Vector2[] }, uP1: { value: [] as THREE.Vector2[] },
    uC0: { value: [] as THREE.Vector2[] },
    uB0: { value: [] as THREE.Vector4[] }, uB1: { value: [] as THREE.Vector4[] }, uCB: { value: new THREE.Vector4() },
    uL0: { value: new THREE.Vector3() }, uL1: { value: new THREE.Vector3() },
  });
  text = new Layer2D();
  L0!: Line; L1!: Line;
  trails: P[][] = [[], []];
  tHold = 0; tLift = 0; tRun = 0; tArrive = 0; tCredits = 0;

  override init() {
    const ly = this.ctx.lyrics;
    this.L0 = ly.get('繋いだ手を');
    this.L1 = ly.get('二人今');
    this.tHold = this.L0.words[0]!.end;          // the hands are joined
    this.tLift = this.L1.words[0]!.start;        // 二人
    this.tRun = this.L1.words[3]!.start;         // 駆け出していく
    this.tArrive = this.L1.end + 1.6;
    this.tCredits = this.L1.end + 3.0;

    // a dense, evenly spaced centre line, then two strands braided round it that meet at the end
    const dense: P[] = [];
    for (let i = 0; i <= 600; i++) dense.push(catmull(i / 600));
    const acc = [0];
    for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1]! + Math.hypot(dense[i]![0] - dense[i - 1]![0], dense[i]![1] - dense[i - 1]![1]));
    const total = acc[acc.length - 1]!;
    let j = 0;
    for (let i = 0; i < NP; i++) {
      const s = i / (NP - 1), target = s * total;
      while (j < dense.length - 2 && acc[j + 1]! < target) j++;
      const u = (target - acc[j]!) / Math.max(1e-9, acc[j + 1]! - acc[j]!);
      const a = dense[j]!, b = dense[j + 1]!;
      const c: P = [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n: P = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const w = lerp(0.03, 0.016, s) * Math.cos(s * Math.PI * 2.5) + 0.005 * s;
      this.trails[0]!.push([c[0] + n[0] * w, c[1] + n[1] * w]);
      this.trails[1]!.push([c[0] - n[0] * w, c[1] - n[1] * w]);
    }
    const u = this.sky.u;
    u.uP0!.value = this.trails[0]!.map((p) => new THREE.Vector2(...p));
    u.uP1!.value = this.trails[1]!.map((p) => new THREE.Vector2(...p));
    u.uC0!.value = STARS.map(([k, i]) => {
      const a = this.trails[0]![i]!, b = this.trails[1]![i]!;
      return k === 2 ? new THREE.Vector2((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) : new THREE.Vector2(...(k === 0 ? a : b));
    });
    if (STARS.length !== NC) throw new Error('outro: star count');
    // boxes around each chunk of trail (and the constellation), grown by how far their glow reaches
    const box = (pts: { x: number; y: number }[], m: number) => new THREE.Vector4(
      Math.min(...pts.map((p) => p.x)) - m, Math.min(...pts.map((p) => p.y)) - m, Math.max(...pts.map((p) => p.x)) + m, Math.max(...pts.map((p) => p.y)) + m);
    for (let k = 0; k < 2; k++) {
      const pts = (k ? u.uP1 : u.uP0)!.value as THREE.Vector2[];
      ((k ? u.uB1 : u.uB0)!.value as THREE.Vector4[]).push(...Array.from({ length: NB }, (_, c) => box(pts.slice(c * CH, Math.min(NP, c * CH + CH + 1)), 0.09)));
    }
    u.uCB!.value = box(u.uC0!.value as THREE.Vector2[], 0.09);
  }

  /** Position of light k at path index x (0..NP-1). */
  at(k: number, x: number): P {
    const tr = this.trails[k]!;
    const i = Math.min(NP - 2, Math.floor(x)), f = clamp(x - i);
    return [lerp(tr[i]![0], tr[i + 1]![0], f), lerp(tr[i]![1], tr[i + 1]![1], f)];
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const u = this.sky.u;

    // the race: a slow lift on 二人今, then a rush over the fence and up into the stars
    const s = keys(t, [[this.tLift, 0], [this.tRun, 0.07, ease.inOutQuad], [this.tRun + 0.9, 0.3, ease.inQuad], [this.tArrive, 1, ease.outCubic]]);
    const head = s * (NP - 1);
    // the view tilts up after them, as it did in the intro
    const tilt = prog(t, this.tRun - 0.8, this.tArrive - 0.2, ease.inOutQuad);
    u.uHorizon!.value = lerp(0.34, 0.07, tilt);
    u.uRoof!.value = lerp(0.12, -0.42, tilt);
    u.uTime!.value = t;
    u.uTwinkle!.value = f.a.hat;
    u.uHead!.value = head;
    u.uTrail!.value = 1 - prog(t, this.tArrive + 0.4, this.tArrive + 6.0, ease.inOutQuad);
    u.uCons!.value = prog(t, this.tArrive - 0.2, this.tArrive + 4.5, ease.inOutQuad);

    // the two lights: apart at first, drifting together on 繋いだ, held close, then away
    const gap = keys(t, [[this.ctx.start, 3.2], [this.L0.words[0]!.start, 2.6, ease.linear], [this.tHold, 1.0, ease.inOutCubic]]);
    const appear = prog(t, this.ctx.start, this.ctx.start + 0.9, ease.outCubic);
    const fadeOut = 1 - prog(t, this.tArrive - 0.3, this.tArrive + 2.0, ease.inOutQuad);
    const breath = 1 + 0.12 * f.a.vocal + 0.05 * Math.sin(t * 2.1);
    const bob = s <= 0 ? 0.004 * noise1(t * 0.6, 7) : 0;
    const p0 = this.at(0, head), p1 = this.at(1, head);
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    const g = s <= 0.02 ? lerp(gap, 1, s / 0.02) : 1;
    (u.uL0!.value as THREE.Vector3).set(mx + (p0[0] - mx) * g, my + (p0[1] - my) * g + bob, 1.1 * appear * fadeOut * breath);
    (u.uL1!.value as THREE.Vector3).set(mx + (p1[0] - mx) * g, my + (p1[1] - my) * g - bob, 1.0 * appear * fadeOut * breath);
    this.sky.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    // line 0 sinks away just as its last glyph ends; line 1 comes in on its first word, no earlier (no overlap)
    const out0 = prog(t, this.L0.end - 0.3, this.L0.end + 0.02, ease.inQuad);
    this.lyric(c, this.L0, t, { x: 1590, y: 150, alpha: 1 - out0, sink: 120 * out0, spread: 0, lead: 0.9 });
    const out1 = prog(t, this.tArrive + 0.5, this.tCredits + 1.5, ease.inQuad);
    this.lyric(c, this.L1, t, { x: 1590, y: 150, alpha: 1 - out1, sink: 0, spread: 60 * prog(t, this.tRun, this.tRun + 2.0, ease.outCubic), lead: 0.1 });
    this.credits(c, t);
    comp.draw(renderer, this.text.upload(), out);

    return { bloom: 0.7, bloomThreshold: 0.95, halation: 0.2, halationColor: [1.0, 0.42, 0.25], grain: 0.035, vignette: 0.42, ca: 0.6, fade: prog(t, this.ctx.end - 4.5, this.ctx.end - 0.05, ease.inOutQuad) };
  }

  /** The credits, set like the intro's title. */
  credits(c: CanvasRenderingContext2D, t: number) {
    const a = prog(t, this.tCredits, this.tCredits + 3.0, ease.inOutQuad);
    if (a <= 0) return;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = a;
    c.fillStyle = rgba('moon');
    c.font = font(F.mincho(800), 64);
    [...'夜に駆ける'].forEach((ch, i) => c.fillText(ch, 300, 230 + i * 76));
    const small = (s: string, x: number, size: number, col: string, delay: number) => {
      c.save();
      c.globalAlpha = prog(t, this.tCredits + delay, this.tCredits + delay + 2.5, ease.inOutQuad);
      c.fillStyle = col;
      c.font = font(F.gothic(400), size);
      c.translate(x, 230);
      c.rotate(Math.PI / 2);
      c.textAlign = 'left';
      c.fillText(s, 0, 0);
      c.restore();
    };
    small('YOASOBI', 226, 20, rgba('fog', 0.85), 0.8);
    small('ikura · Spotted: Sapporo', 192, 20, rgba('fog', 0.85), 1.2);
    small('music & lyrics: Ayase', 158, 20, rgba('fog', 0.85), 1.6);
    small('video rendered in code', 124, 15, rgba('fog', 0.62), 2.6);
    c.restore();
  }

  /** A lyric line in vertical columns (right to left), lit glyph by glyph as it is sung (as in dusk.ts). */
  lyric(c: CanvasRenderingContext2D, line: Line, t: number, o: { x: number; y: number; alpha: number; sink: number; spread: number; lead: number }) {
    const appear = prog(t, line.start - o.lead, line.start + 0.12, ease.outCubic);
    const alpha = appear * o.alpha;
    if (alpha <= 0.001) return;
    const size = 86, adv = size * 1.14, gap = size * 1.5 + o.spread;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(F.mincho(700), size);
    columns(glyphStates(line, t), 8).forEach((col, ci) => {
      col.forEach((g, i) => {
        const v = verticalForm(g.ch);
        const x = o.x - ci * gap + v.dx * size;
        const y = o.y + i * adv + adv / 2 + v.dy * size + o.sink * (0.4 + g.li / 12) - 6 * clamp(g.k);
        c.globalAlpha = alpha * (g.k > 0 ? 1 : 0.32);
        c.fillStyle = g.k > 0 && g.k < 1 ? rgba('ember') : g.k >= 1 ? rgba('moon') : rgba('fog');
        c.save();
        c.translate(x, Math.min(y, H + size));
        if (v.rot) c.rotate(v.rot);
        c.fillText(v.ch, 0, 0);
        c.restore();
      });
    });
    c.restore();
  }
}
