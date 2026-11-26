// Pre-choruses 1 and 3: "いつだってチックタックと…" (n = 1) and "ほらまたチックタックと…" (n = 2).
// The world as a vast clockwork at night, drawn in luminous hairlines across three depth layers
// (near train with its escapement, the chapter ring of a dial, two far trains), ticking on the beat
// grid. n = 1: the camera starts tight on the escapement and pulls back to the whole mechanism; on
// 心無い言葉 / うるさい声 small gothic fragments of noise swarm in and press around the dial; on
// 涙が零れそうでも a single refractive drop swells under the dial and trembles with every tick
// but never falls; on ありきたりな喜び the noise scatters, and on 二人なら two warm lights travel
// through the meshing gears towards each other and meet on 見つけられる; then the whole mechanism
// spins up and the view launches into the light (into the chorus). n = 2: the same clockwork,
// failing (broken teeth, stuttering ticks); 君の為に用意した言葉 drift up as paper slips (tanzaku)
// that stall short of a faint point (どれも届かない); on 「終わりにしたい」 every mechanism stops dead;
// on 君は初めて笑った the first warm light in a long time blooms at that point, the slips finally
// drift into it and the clockwork starts again, smoothly, into the final chorus.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, makeRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, HEX, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, keys, lerp, prog, pulse, springStep, TAU, type Key } from '../engine/util';
import { columns, glyphStates, verticalForm } from './_jp';
import { buildTrain, circle, drawDial, drawEscapement, drawGear, pathPoints, project, treePath, type Gear, type RGB, type View } from './clock-gears';

const BG = /* glsl */ `
uniform float uTime, uLift;
void main() {
  vec2 p = (vUv - vec2(0.42, 0.52)) * vec2(1.7778, 1.0);
  float r = length(p);
  vec3 col = mix(C_DUSK * 0.42, C_NIGHT * 0.62, smoothstep(0.0, 0.95, r));
  col = mix(col, C_NIGHT * 0.35, smoothstep(0.7, 1.3, r));
  // a slow, very soft haze drifting through the mechanism
  float n = fbm(vec3(p * vec2(1.6, 2.2), uTime * 0.025), 4) * 0.5 + 0.5;
  col += C_HAZE * 0.035 * n * (1.0 - smoothstep(0.2, 1.1, r));
  col *= uLift;
  fragColor = vec4(col, 1.0);
}`;

const FIN = /* glsl */ `
uniform sampler2D uSrc;
uniform vec3 uDrop;      // x, y (logical px, y down), radius
uniform vec2 uDropTop;   // where it hangs from
uniform float uDropA, uWob, uDim, uScrim;
uniform vec4 uL[3];      // lights: x, y, core radius, intensity
uniform float uLw[3];    // warmth 0 (cold fog) .. 1 (ember)
uniform vec4 uRipple;    // x, y, radius, strength
uniform vec3 uLaunch;    // x, y, strength of the radial rush
const vec2 RES = vec2(1920.0, 1080.0);

vec3 src(vec2 px) { return texture(uSrc, vec2(px.x / RES.x, 1.0 - px.y / RES.y)).rgb; }

float dropSD(vec2 p) {
  vec2 c = uDrop.xy; float r = uDrop.z;
  vec2 q = p - c;
  q.x *= 1.0 + uWob; q.y *= 1.0 - uWob * 0.6;
  float body = length(q) - r;
  vec2 a = uDropTop;
  float h = clamp((p.y - a.y) / max(c.y - a.y, 1.0), 0.0, 1.0);
  float neck = abs(p.x - mix(a.x, c.x, h)) - mix(r * 0.16, r * 0.8, h * h);
  neck = max(neck, max(a.y - p.y, p.y - c.y));
  return smin(body, neck, r * 0.4);
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * RES;
  vec3 col;
  if (uLaunch.z > 0.0005) {
    vec2 c = uLaunch.xy;
    vec3 acc = vec3(0.0); float ws = 0.0;
    float j = hash12(gl_FragCoord.xy) / 47.0;
    for (int i = 0; i < 48; i++) {
      float k = float(i) / 47.0 + j;
      float w = 1.0 - 0.7 * k;
      acc += src(c + (px - c) * (1.0 - uLaunch.z * k)) * w; ws += w;
    }
    col = acc / ws;
  } else col = src(px);
  col *= uDim;
  // a soft shade under the lyric columns
  col *= 1.0 - uScrim * smoothstep(1100.0, 1480.0, px.x) * (1.0 - smoothstep(1780.0, 1920.0, px.x) * 0.5);

  // the ripple when the two lights meet (or the light blooms): a ring that brightens the linework
  if (uRipple.w > 0.0) {
    float d = length(px - uRipple.xy) - uRipple.z;
    col *= 1.0 + uRipple.w * exp(-d * d / 1800.0) * 2.5;
  }

  // the drop: an inverted, magnified view of the clockwork, a dark rim, a highlight
  if (uDropA > 0.001 && uDrop.z > 0.5) {
    float d = dropSD(px);
    float fw = max(fwidth(d), 1e-3);
    float m = 1.0 - smoothstep(-fw, fw, d);
    if (m > 0.0) {
      float r = uDrop.z; vec2 c = uDrop.xy;
      vec2 e = vec2(1.0, 0.0);
      vec2 n = normalize(vec2(dropSD(px + e.xy) - dropSD(px - e.xy), dropSD(px + e.yx) - dropSD(px - e.yx)) + 1e-5);
      float depth = sqrt(clamp(-d / (r * 0.9), 0.0, 1.0));
      // a ball lens: the world behind, inverted and minified, brighter than around it
      vec2 sp = c - (px - c) * 2.4 + n * r * 1.2 * (1.0 - depth);
      vec3 inside = src(sp) * vec3(0.92, 0.98, 1.08) * 1.9 + C_DUSK * 0.05 + C_FOG * 0.03 * depth;
      inside *= 1.0 - 0.75 * smoothstep(-r * 0.22, -r * 0.02, d);
      // a fine bright edge, strongest towards the light (upper left), a caustic crescent low inside
      float edge = exp(-pow((d + 1.2) / 1.0, 2.0));
      inside += C_MOON * edge * (0.25 + 0.5 * smoothstep(-0.3, 0.8, dot(n, normalize(vec2(-0.6, -0.8)))));
      vec2 hs = c + vec2(-0.34, -0.38) * r;
      inside += C_MOON * 3.2 * exp(-dot(px - hs, px - hs) / pow(r * 0.09, 2.0));
      inside += C_MOON * 0.6 * exp(-dot(px - hs, px - hs) / pow(r * 0.25, 2.0)) * 0.3;
      float cres = exp(-pow((d + r * 0.16) / (r * 0.07), 2.0)) * smoothstep(0.2, 0.9, n.y);
      inside += mix(C_MOON, C_FOG, 0.4) * cres * 0.55;
      col = mix(col, inside, m * uDropA);
    }
  }

  // lights: they warm the linework around them, and glow
  for (int i = 0; i < 3; i++) {
    vec4 L = uL[i];
    if (L.w <= 0.0) continue;
    float d = length(px - L.xy);
    float core = exp(-d * d / (L.z * L.z));
    float halo = exp(-d / (L.z * 7.0));
    vec3 lc = mix(C_FOG, C_EMBER, uLw[i]);
    col = mix(col, luma(col) * C_EMBER * 2.6, clamp(halo * 1.8 * L.w, 0.0, 0.9) * uLw[i]);
    col += lc * (core * 2.6 + halo * 0.07 + exp(-d / (L.z * 30.0)) * 0.025) * L.w;
  }
  fragColor = vec4(col, 1.0);
}`;

/** Depth layers: zoom = FOCAL / (D + depth). */
const sine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const FOCAL = 1.4;
const DEPTH = { near: 0, dial: 0.45, mid: 1.5, far: 3.8 };
const C0: [number, number] = [960, 540];

const NOISE_WORDS = ['うるさい', 'なんで', 'ちゃんとして', '普通は', '早く', 'だめ', '聞いてる？', 'どうせ', '無理', '邪魔', '黙って', '知らない', 'またそれ', '意味ない', 'いらない', 'ねえ', 'なに', 'もういい', 'わからない', 'いい加減に', 'ちがう', 'つまらない', '面倒', '期待してない', '誰も', '見てない', 'ほら', 'しっかりして', 'うざい', '静かに'];
const SLIP_WORDS = ['大丈夫', 'ここにいる', '一緒に帰ろう', '明日も', 'そばにいて', 'また明日', 'ありがとう', '笑って', '君がいい', '待ってる', '行かないで', 'ひとりじゃない', 'またね', '会いたい'];

interface Frag { text: string; ang: number; R: number; ta: number; tc: number; size: number; bold: boolean; vert: boolean; col: string; a: number; jit: number; dir: number; flick: boolean }
interface Slip { text: string; ts: number; sx: number; sy: number; smax: number; ph: number; scale: number; tArr: number; lat: number }

type CamKey = [t: number, D: number, cx: number, cy: number, rot: number, e?: (x: number) => number];

const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const cssMix = (a: string, b: string, k: number, al: number) => {
  const p = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const x = p(a), y = p(b);
  return `rgba(${x.map((v, i) => Math.round(lerp(v, y[i]!, k))).join(',')},${al})`;
};

export default class Clock extends Scene {
  n = 1;
  bg = new FSPass(BG, { uTime: { value: 0 }, uLift: { value: 1 } });
  fin = new FSPass(FIN, {
    uSrc: { value: null }, uDrop: { value: [0, 0, 0] }, uDropTop: { value: [0, 0] }, uDropA: { value: 0 }, uWob: { value: 0 }, uDim: { value: 1 }, uScrim: { value: 0.45 },
    uL: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uLw: { value: [0, 0, 0] }, uRipple: { value: [0, 0, 0, 0] }, uLaunch: { value: [960, 540, 0] },
  });
  rt = makeRT();
  lb = new LineBatch(120000, { blend: 'add' });
  text = new Layer2D();

  L: Line[] = [];
  ncols: number[] = [];
  ticks: number[] = [];
  /** per-tick advance (clock2 stutters), and its prefix sums */
  adv: number[] = [];
  cum: number[] = [];
  near: Gear[] = []; mid: Gear[] = []; far: Gear[] = [];
  cam: CamKey[] = [];
  frags: Frag[] = [];
  slips: Slip[] = [];
  /** clock1: the two lights' paths (near-layer world), and when they meet */
  pathA: [number, number][] = []; pathB: [number, number][] = [];
  tLights = 0; tGo = 0; tMeet = 0;
  /** anchors */
  tNoise = 0; tLoud = 0; tTear = 0; tSpill = 0; tClear = 0; tStop = 0; tSmile = 0; tLaugh = 0; tSlips = 0; tSlipsEnd = 0;
  dialR = 620;
  /** clock2: the point the slips drift towards, where the light blooms (near-layer world) */
  goal: [number, number] = [0, 0];

  override init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.n = this.ctx.params.n === 2 ? 2 : 1;
    const n1 = this.n === 1;
    this.L = n1
      ? [ly.get('いつだって'), ly.get('鳴る世界で'), ly.get('触れる心無い'), ly.get('涙が零れ'), ly.get('ありきたりな')]
      : [ly.get('ほらまた'), ly.get('鳴る世界で', 1), ly.get('君の為に'), ly.get('終わりにしたい'), ly.get('釣られて'), ly.get('君は初めて')];
    this.ncols = this.L.map((l) => columns(glyphStates(l, 0), 7).length);

    // the tick grid: real beats, with doubled detections dropped and gaps filled
    const s = this.ctx.start, e = this.ctx.end;
    const raw = au.beats.filter((b) => b > s - 4 && b < e + 2);
    const gaps = raw.slice(1).map((b, i) => b - raw[i]!).sort((a, b) => a - b);
    const med = gaps[gaps.length >> 1] ?? 0.58;
    const ticks: number[] = [];
    for (const b of raw) {
      const last = ticks[ticks.length - 1];
      if (last === undefined) { ticks.push(b); continue; }
      if (b - last < med * 0.8) continue;
      const k = Math.round((b - last) / med);
      for (let i = 1; i < k; i++) ticks.push(last + ((b - last) * i) / k);
      ticks.push(b);
    }
    this.ticks = ticks;
    this.adv = ticks.map((_, i) => {
      if (n1) return 1;
      const h = hash(i, 71);
      return h < 0.6 ? 1 : h < 0.84 ? 0.22 : -0.45; // clock2: some ticks fail, some slip back
    });
    let acc = 0;
    this.cum = this.adv.map((a) => { const c = acc; acc += a; return c; });

    // the clockwork (the same layout for both entries; clock2 has broken teeth)
    const brk = n1 ? 0 : 0.07;
    const escN = 15, escPitch = 16;
    const er = (escN * escPitch) / TAU;
    const ex = -230, ey = 70;
    this.near = buildTrain({
      seed: 16, count: 28, rMin: 28, rMax: 170, pitch: 16, bx: 0, by: 0, rx: 1300, ry: 640,
      root: { x: ex, y: ey, n: escN, kind: 'escape', w: TAU / 30 }, broken: brk,
      avoid: [[ex, ey - er * 3.97, er * 1.5], [ex, ey - er * 1.42, er * 0.5]],
    });
    this.mid = buildTrain({ seed: 23, count: 24, rMin: 80, rMax: 380, pitch: 30, bx: 0, by: 0, rx: 2600, ry: 1600, root: { x: 380, y: -160, n: 44, kind: 'wheel', w: TAU / 260 }, broken: brk });
    this.far = buildTrain({ seed: 37, count: 20, rMin: 200, rMax: 720, pitch: 56, bx: 0, by: 0, rx: 4600, ry: 2800, root: { x: -700, y: 380, n: 64, kind: 'wheel', w: -TAU / 900 }, broken: brk });

    const E = this.near[0]!;
    const word = (l: Line, i: number) => l.words[i]!;
    const tgt = (D: number, depth: number, T: [number, number], S: [number, number], rot: number): [number, number] => {
      const z = FOCAL / (D + depth);
      const dx = (S[0] - C0[0]) / z, dy = (S[1] - C0[1]) / z;
      const c = Math.cos(rot), sn = Math.sin(rot);
      return [T[0] - (dx * c + dy * sn), T[1] - (-dx * sn + dy * c)];
    };
    const K = (t: number, D: number, depth: number, T: [number, number], S: [number, number], rot: number, ef?: (x: number) => number): CamKey => {
      const c = tgt(D, depth, T, S, rot);
      return [t, D, c[0], c[1], rot, ef];
    };
    const escC: [number, number] = [E.x, E.y - er * 1.9];
    const dropW: [number, number] = [0, this.dialR + 4];

    if (n1) {
      const [l10, l11, l12, l13, l14] = this.L as [Line, Line, Line, Line, Line];
      this.tNoise = word(l12, 1).start; this.tLoud = word(l12, 3).start;
      this.tTear = word(l13, 0).start; this.tSpill = word(l13, 1).start; this.tClear = word(l14, 0).start;
      this.tLights = word(l14, 1).start; this.tGo = word(l14, 3).start; this.tMeet = word(l14, 4).start + 1.0;
      // two lights, far apart in the near train, joined through the mesh
      let best = { s: -1e9, a: 1, b: 2 };
      const ok = (g: Gear) => Math.abs(g.x) < 820 && Math.abs(g.y) < 440 && g.kind === 'wheel';
      for (let i = 1; i < this.near.length; i++) for (let j = i + 1; j < this.near.length; j++) {
        const A = this.near[i]!, B = this.near[j]!;
        if (!ok(A) || !ok(B)) continue;
        const hops = treePath(this.near, i, j).length;
        const d = Math.hypot(A.x - B.x, A.y - B.y);
        const sc = -Math.abs(d - 1150) - 60 * Math.max(0, 5 - hops, hops - 10) - 0.4 * Math.abs(A.y + B.y);
        if (sc > best.s) best = { s: sc, a: A.x < B.x ? i : j, b: A.x < B.x ? j : i };
      }
      const full = pathPoints(this.near, treePath(this.near, best.a, best.b));
      // split the path at its middle (by length): each light walks its half
      const lens = [0];
      for (let i = 1; i < full.length; i++) lens.push(lens[i - 1]! + Math.hypot(full[i]![0] - full[i - 1]![0], full[i]![1] - full[i - 1]![1]));
      const half = lens[lens.length - 1]! / 2;
      const mid = this.at(full, lens, half);
      const k = lens.findIndex((l) => l > half);
      this.pathA = [...full.slice(0, k), mid];
      this.pathB = [...full.slice(k).reverse(), mid];
      const M = mid;
      this.cam = [
        K(s, 0.5, DEPTH.near, escC, [820, 560], 0),
        K(word(l11, 0).start, 0.62, DEPTH.near, escC, [820, 560], 0.0, ease.inOutQuad),
        K(word(l11, 2).end + 0.3, 2.5, DEPTH.dial, [0, 60], [760, 540], -0.03, ease.inOutCubic),
        K(word(l12, 4).end, 2.05, DEPTH.dial, [0, 60], [760, 540], 0.03, sine),
        K(this.tSpill, 0.95, DEPTH.dial, dropW, [760, 430], 0.0, ease.inOutCubic),
        K(this.tClear + 0.15, 1.02, DEPTH.dial, dropW, [760, 430], 0.0, sine),
        K(word(l14, 1).end, 2.7, DEPTH.near, [(this.pathA[0]![0] + this.pathB[0]![0]) / 2, M[1]], [800, 540], -0.025, ease.inOutCubic),
        K(this.tGo, 2.55, DEPTH.near, [(this.pathA[0]![0] + this.pathB[0]![0]) / 2, M[1]], [800, 540], -0.02, sine),
        K(this.tMeet, 1.35, DEPTH.near, M, [780, 540], 0.0, ease.inOutCubic),
        K(e, 0.3, DEPTH.near, M, [780, 540], 0.06, ease.inExpo),
      ];
      // noise: fragments that swarm in and press around the dial, and scatter on ありきたりな
      for (let i = 0; i < 58; i++) {
        const h = (k: number) => hash(i, k, 5);
        const loud = h(1) < 0.22;
        const ta = loud ? this.tLoud + h(2) * 0.55 : lerp(this.tNoise - 0.15, word(l12, 4).end + 0.3, Math.pow(h(3), 0.9));
        const sz = loud ? 24 + h(4) * 10 : 13 + h(4) * 11;
        const r = h(5);
        this.frags.push({
          text: NOISE_WORDS[Math.floor(h(6) * NOISE_WORDS.length)]!, ang: h(7) * TAU, R: lerp(230, 640, Math.sqrt(h(8))), ta, tc: this.tClear + h(9) * 0.55,
          size: sz, bold: loud, vert: h(10) < 0.28, col: r < 0.06 ? HEX.rose : r < 0.18 ? HEX.moon : HEX.fog,
          a: loud ? 0.8 : 0.4 + 0.35 * h(11), jit: loud ? 1.8 : h(12) < 0.3 ? 1 : 0, dir: h(13) < 0.5 ? -1 : 1, flick: h(14) < 0.22,
        });
      }
    } else {
      const [, l38, l39, l40, , l42] = this.L as [Line, Line, Line, Line, Line, Line];
      this.tStop = word(l40, 0).start; this.tSmile = word(l42, 0).start; this.tLaugh = word(l42, 2).start;
      this.tSlips = word(l39, 1).start; this.tSlipsEnd = word(l39, 5).start;
      // the goal: a gear up and to the left in the near train
      let gi = 1, bd = 1e9;
      this.near.forEach((g, i) => { const d = Math.hypot(g.x + 560, g.y + 300); if (i > 0 && d < bd) { bd = d; gi = i; } });
      this.goal = [this.near[gi]!.x, this.near[gi]!.y];
      const G = this.goal;
      this.cam = [
        K(s, 0.62, DEPTH.near, escC, [840, 560], 0.0),
        K(word(l38, 0).start, 0.55, DEPTH.near, escC, [840, 560], 0.01, ease.inOutQuad),
        K(word(l38, 2).end, 2.3, DEPTH.near, [G[0] + 520, G[1] + 260], [960, 560], 0.035, ease.inOutCubic),
        K(this.tStop, 2.5, DEPTH.near, [G[0] + 520, G[1] + 260], [960, 560], 0.05, sine),
        K(this.tStop + 0.12, 2.5, DEPTH.near, [G[0] + 520, G[1] + 260], [960, 560], 0.05, ease.outQuad),
        K(this.tSmile, 2.47, DEPTH.near, [G[0] + 520, G[1] + 260], [960, 560], 0.05, ease.linear),
        K(word(l42, 2).end, 1.45, DEPTH.near, G, [720, 470], 0.0, sine),
        K(e, 1.2, DEPTH.near, G, [720, 480], -0.01, sine),
      ];
      const words39 = l39.words;
      for (let i = 0; i < 16; i++) {
        const h = (k: number) => hash(i, k, 9);
        // slips go up as the line is sung, a few on each word from 為に to どれも
        const ts = lerp(this.tSlips - 0.1, this.tSlipsEnd + 0.4, (i + h(1) * 0.8) / 16);
        this.slips.push({
          text: SLIP_WORDS[i % SLIP_WORDS.length]!, ts, sx: lerp(560, 1280, ((i * 5) % 16 + h(2)) / 16), sy: 1140 + h(3) * 120,
          smax: lerp(0.3, 0.62, h(4)), lat: ((i * 7) % 16 / 15 - 0.5) * 2, ph: h(5) * TAU, scale: lerp(0.78, 1.25, h(6)), tArr: this.tLaugh + 0.3 + h(7) * 2.6,
        });
      }
      void words39;
    }
  }

  /** Point at arc length s along a polyline. */
  at(pts: [number, number][], lens: number[], s: number): [number, number] {
    for (let i = 1; i < pts.length; i++) {
      if (lens[i]! >= s) {
        const u = (s - lens[i - 1]!) / Math.max(1e-6, lens[i]! - lens[i - 1]!);
        return [lerp(pts[i - 1]![0], pts[i]![0], u), lerp(pts[i - 1]![1], pts[i]![1], u)];
      }
    }
    return pts[pts.length - 1]!;
  }
  along(pts: [number, number][], u: number): [number, number] {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
    return this.at(pts, lens, clamp(u) * lens[lens.length - 1]!);
  }

  /** Index of the last tick at or before t (-1 before the first). */
  tickIdx(t: number) {
    const T = this.ticks;
    let lo = 0, hi = T.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (T[m]! <= t) lo = m + 1; else hi = m; }
    return lo - 1;
  }

  /** Motion time: clock2 freezes between 終わりにしたい and the smile. */
  tm(t: number) {
    if (this.n === 1 || t < this.tStop) return t;
    return this.tStop;
  }

  /** The drive, in ticks: every gear's angle is a0 + w * drive. */
  drive(t: number) {
    const tt = this.tm(t);
    const i = this.tickIdx(tt);
    let d = 0;
    if (i >= 0) d = this.cum[i]! + this.adv[i]! * springStep(tt - this.ticks[i]!, 8, 0.42);
    if (this.n === 1) d += 30 * Math.pow(prog(t, this.tMeet - 0.4, this.ctx.end), 2.4);
    else if (t > this.tStop) {
      // after the smile it starts again, smoothly: healed, not ticking
      const au = this.ctx.audio;
      const r = prog(t, this.tLaugh - 0.6, this.tLaugh + 3.5, sine);
      d += r * 0.8 * (au.beatAt(t) - au.beatAt(this.tLaugh - 0.6));
    }
    return d;
  }

  view(layer: keyof typeof DEPTH, D: number, cx: number, cy: number, rot: number): View {
    return { cx, cy, z: FOCAL / (D + DEPTH[layer]), cos: Math.cos(rot), sin: Math.sin(rot), ox: C0[0], oy: C0[1] };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const n1 = this.n === 1;
    const tc = this.tm(t);
    const ck = (j: number) => keys(t, this.cam.map((k) => [k[0], k[j] as number, k[5]] as Key));
    // a slow breathing drift, frozen with the rest in clock2
    const br = Math.sin(tc * 0.7) * 6, br2 = Math.cos(tc * 0.53) * 5;
    const D = ck(1), cx = ck(2) + br, cy = ck(3) + br2, rot = ck(4);
    const V = {
      near: this.view('near', D, cx, cy, rot), dial: this.view('dial', D, cx, cy, rot),
      mid: this.view('mid', D, cx, cy, rot), far: this.view('far', D, cx, cy, rot),
    };
    const drive = this.drive(t);
    const ti = this.tickIdx(tc);
    const tick0 = ti >= 0 ? this.ticks[ti]! : this.ctx.start;
    const tick1 = this.ticks[ti + 1] ?? tick0 + 0.6;
    const hot = tc < (n1 ? 1e9 : this.tStop) ? pulse(tc, tick0, 0.07) * Math.abs(this.adv[Math.max(0, ti)]!) : 0;

    // brightness: clock2 is dimmer, goes dark on the stop, warms after the smile
    const stopDim = n1 ? 1 : lerp(1, 0.62, prog(t, this.tStop, this.tStop + 0.18)) * lerp(1, 1.25, prog(t, this.tLaugh, this.tLaugh + 4));
    const base = n1 ? 1 + 0.35 * prog(t, this.tMeet, this.ctx.end, ease.inQuad) : 0.78;
    const fl = frameIdx(t);

    this.bg.u.uTime!.value = tc;
    this.bg.u.uLift!.value = n1 ? 1 : 0.85;
    this.bg.render(renderer, this.rt);

    const lb = this.lb;
    lb.clear();
    const cNear: RGB = mul(LIN.moon, 0.4 * base);
    const cDial: RGB = mix3(LIN.fog, LIN.moon, 0.5);
    const cMid: RGB = mul(LIN.fog, 0.17 * base);
    const cFar: RGB = mul(mix3(LIN.haze, LIN.fog, 0.4), 0.16 * base);
    const jewel: RGB = mul(LIN.rose, 0.8);
    const flick = (i: number, layer: number) => (!n1 && t < this.tStop && hash(i, layer, Math.floor(fl / 3)) < 0.025 ? 0.25 : 1);
    this.far.forEach((g, i) => drawGear(lb, V.far, g, g.a0 + g.w * drive, 1.0, cFar, flick(i, 3), null));
    this.mid.forEach((g, i) => drawGear(lb, V.mid, g, g.a0 + g.w * drive, 1.0, cMid, flick(i, 2), null));
    // the dial: chapter ring and hands (the seconds hand jumps with each tick)
    const dz = V.dial.z;
    drawDial(lb, V.dial, this.dialR, [5.35 + drive * 0.00015, 1.2 + drive * (TAU / 3600), drive * (TAU / 60)], Math.max(0.8, 0.75 * dz), mul(cDial, 0.3 * base), 1, mul(LIN.moon, 0.46 * base));
    // near train and escapement
    const wN = clamp(0.62 * V.near.z, 0.9, 2.2);
    const tickBoost = 1 + 0.25 * hot;
    this.near.forEach((g, i) => drawGear(lb, V.near, g, g.a0 + g.w * drive, wN, mul(cNear, tickBoost), flick(i, 1), i % 3 === 0 ? jewel : null));
    const E = this.near[0]!;
    const sgn = (k: number) => (k % 2 === 0 ? 1 : -1);
    const anchor = 0.13 * lerp(sgn(ti - 1), sgn(ti), springStep(tc - tick0, 8, 0.45));
    const bAmp = n1 ? 2.3 + 1.2 * prog(t, this.tMeet, this.ctx.end) : lerp(1.6, 0, prog(t, this.tStop - 0.01, this.tStop)) + 1.8 * prog(t, this.tLaugh, this.tLaugh + 3);
    const phase = clamp((tc - tick0) / Math.max(0.2, tick1 - tick0));
    const balance = bAmp * Math.sin(Math.PI * (ti + phase));
    drawEscapement(lb, V.near, E, anchor, balance, wN, cNear, 1, hot);

    // lights
    const Lu = this.fin.u.uL!.value as THREE.Vector4[];
    const Lw = this.fin.u.uLw!.value as number[];
    Lu.forEach((l) => l.set(0, 0, 1, 0));
    const rip = this.fin.u.uRipple!.value as number[];
    rip[3] = 0;
    const launch = this.fin.u.uLaunch!.value as number[];
    launch[2] = 0;
    if (n1) {
      const appear = prog(t, this.tLights - 0.2, this.tLights + 1.0, ease.outCubic);
      if (appear > 0) {
        const go = (x: number) => prog(x, this.tGo, this.tMeet, sine);
        const beatPulse = 0.85 + 0.15 * Math.cos(TAU * this.ctx.audio.beatAt(t));
        const joined = prog(t, this.tMeet - 0.05, this.tMeet + 0.35);
        const grow = prog(t, this.tMeet, this.ctx.end, ease.inQuad);
        [this.pathA, this.pathB].forEach((path, k) => {
          // the trail: where the light was over the last ~1.2 s
          let prev: [number, number] | null = null;
          for (let s = 0; s <= 36; s++) {
            const tt = t - s * 0.035;
            if (tt < this.tGo) break;
            const w = this.along(path, go(tt));
            const p = project(V.near, w[0], w[1]);
            if (prev) lb.seg2(prev[0], prev[1], p[0], p[1], 2.2, mul(LIN.ember, 0.9), (1 - s / 36) * appear * (1 - 0.7 * joined));
            prev = p;
          }
          const w = this.along(path, go(t));
          const p = project(V.near, w[0], w[1]);
          Lu[k]!.set(p[0], p[1], lerp(4.5, 7, joined) + grow * 7, appear * beatPulse * lerp(1, 0.6, joined) * (1 + grow * 1.1));
          Lw[k] = 1;
        });
        if (t > this.tMeet - 0.05) {
          const age = t - this.tMeet;
          const [mx, my] = project(V.near, ...this.pathA[this.pathA.length - 1]!);
          rip[0] = mx; rip[1] = my; rip[2] = Math.max(0, age) * 900; rip[3] = 0.6 * Math.exp(-Math.max(0, age) * 1.6) * prog(t, this.tMeet - 0.05, this.tMeet + 0.05);
          launch[0] = mx; launch[1] = my;
          launch[2] = 0.35 * prog(t, this.ctx.end - 1.2, this.ctx.end, ease.inQuad);
        }
      }
    } else {
      // the goal: a faint cold point until the smile, then a warm light blooms there
      const [gx, gy] = project(V.near, ...this.goal);
      const bloom = prog(t, this.tSmile, this.tLaugh + 2.5, sine);
      const faint = 0.8 * prog(t, this.tSlips - 0.5, this.tSlips + 1) * (1 - 0.6 * prog(t, this.tStop, this.tStop + 0.2));
      Lu[0]!.set(gx, gy, lerp(4.5, 8, bloom) + 4 * prog(t, this.tLaugh, this.ctx.end), faint * (1 - bloom) + bloom * (0.9 + 0.15 * Math.sin(t * 1.3)));
      Lw[0] = bloom;
      if (t > this.tLaugh) {
        const age = t - this.tLaugh;
        rip[0] = gx; rip[1] = gy; rip[2] = age * 380; rip[3] = 0.35 * Math.exp(-age * 0.8) * prog(t, this.tLaugh, this.tLaugh + 0.2);
      }
    }
    lb.render(renderer, this.rt);

    // the drop (clock1)
    const fu = this.fin.u;
    fu.uSrc!.value = this.rt.texture;
    fu.uDim!.value = stopDim * (n1 ? 1 - 0.3 * prog(t, this.tNoise, this.tLoud + 0.6) * (1 - prog(t, this.tClear, this.tClear + 1.2)) : 1);
    fu.uDropA!.value = 0;
    if (n1 && t > this.tTear - 0.1) {
      const grow = 0.35 * prog(t, this.tTear, this.tTear + 0.8, ease.outCubic) + 0.65 * prog(t, this.tSpill, this.tSpill + 1.5, ease.inOutCubic);
      const gone = prog(t, this.tClear + 0.25, this.tClear + 1.7, ease.inOutCubic);
      const r = 58 * dz * grow * (1 - gone);
      // every tick makes it shiver; it swells on each mora of 零れそうでも, but holds
      const st = t - tick0;
      let wob = 0.09 * Math.exp(-st * 7) * Math.sin(st * TAU * 9);
      for (const m of this.L[3]!.words[1]!.mora ?? []) { const d = t - m[1]; if (d > 0 && d < 0.6) wob += 0.045 * Math.exp(-d * 6) * Math.sin(d * TAU * 6); }
      const top = project(V.dial, 0, this.dialR + 2);
      const hang = r * (1.15 + 0.45 * grow);
      (fu.uDrop!.value as number[]).splice(0, 3, top[0], top[1] + hang, r);
      (fu.uDropTop!.value as number[]).splice(0, 2, top[0], top[1]);
      fu.uWob!.value = wob;
      fu.uDropA!.value = clamp(r / 3);
    }
    this.fin.render(renderer, out);

    // type: noise / slips, then the lyric
    const c = this.text.ctx;
    this.text.clear();
    if (n1) this.drawNoise(c, t, fl);
    else this.drawSlips(c, t, V.near);
    this.lyrics(c, t);
    comp.draw(renderer, this.text.upload(), out);

    return {
      bloom: 0.7, bloomThreshold: 0.95, halation: 0.16, halationColor: [1.0, 0.45, 0.25], grain: 0.035, vignette: 0.5, ca: 0.5,
    };
  }

  drawNoise(c: CanvasRenderingContext2D, t: number, fl: number) {
    if (t < this.tNoise - 0.3 || t > this.tClear + 1.6) return;
    const press = 1 - 0.22 * prog(t, this.tTear, this.tSpill + 1.2, sine);
    const cx = 760, cy = lerp(560, 470, prog(t, this.tTear - 0.4, this.tTear + 0.4));
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [i, g] of this.frags.entries()) {
      const tin = prog(t, g.ta, g.ta + 1.1, ease.outCubic);
      if (tin <= 0) continue;
      const out = prog(t, g.tc, g.tc + 0.9, ease.inCubic);
      let a = g.a * prog(t, g.ta, g.ta + 0.25) * (1 - out);
      if (a <= 0.003) continue;
      if (g.flick) a *= 0.55 + 0.45 * hash(i, fl >> 1, 3);
      const R = lerp(1250, g.R * press, tin) * (1 + 2.2 * out) + 14 * Math.sin(t * 2.1 + i);
      const ang = g.ang + g.dir * 0.05 * (t - g.ta) + out * 0.3 * g.dir;
      let x = cx + Math.cos(ang) * R * 1.05, y = cy + Math.sin(ang) * R * 0.62;
      if (x > 1000) x = 1000 - (x - 1000) * 0.3;
      x += (hash(i, fl, 1) - 0.5) * 2 * g.jit;
      y += (hash(i, fl, 2) - 0.5) * 2 * g.jit;
      c.globalAlpha = a;
      c.fillStyle = cssMix(g.col, g.col, 0, 1);
      c.font = font(F.gothic(g.bold ? 700 : 400), g.size);
      if (g.vert) {
        [...g.text].forEach((ch, k) => c.fillText(ch, x, y + (k - (g.text.length - 1) / 2) * g.size * 1.05));
      } else c.fillText(g.text, x, y);
    }
    c.restore();
  }

  drawSlips(c: CanvasRenderingContext2D, t: number, v: View) {
    const tm = this.tm(t);
    const [gx, gy] = project(v, ...this.goal);
    const warm = prog(t, this.tLaugh - 0.5, this.tLaugh + 1.5, sine);
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [i, s] of this.slips.entries()) {
      if (tm < s.ts) continue;
      const rise = s.smax * prog(tm, s.ts, s.ts + 3.6, ease.outCubic);
      const arrive = prog(t, s.tArr, s.tArr + 3.2, sine);
      const u = lerp(rise, 1, arrive);
      const sag = 40 * prog(tm, s.ts + 2.6, s.ts + 6, sine) * (1 - arrive);
      const sway = Math.sin(u * Math.PI * 2.2 + s.ph) * 60 * (1 - u) + s.lat * 330 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u * 0.9);
      const dx = gx - s.sx, dy = gy - s.sy, L = Math.hypot(dx, dy);
      const x = s.sx + dx * u + (-dy / L) * sway;
      const y = s.sy + dy * u + (dx / L) * sway + sag;
      const fade = prog(tm, s.ts, s.ts + 0.5) * (1 - prog(u, 0.9, 1.0)) * (1 - 0.35 * prog(t, this.tStop + 2.5, this.tSmile, sine) * (1 - arrive));
      if (fade <= 0.003) continue;
      const tt = t > this.tLaugh ? tm + (t - this.tLaugh) : tm;
      const flip = Math.abs(Math.cos(tt * (0.9 + hash(i, 4) * 0.8) + s.ph));
      const rot = 0.35 * Math.sin(tt * 0.8 + s.ph) - 0.25;
      const sc = s.scale * lerp(1, 0.6, u);
      const w = 36 * sc, h = 112 * sc;
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.scale(0.2 + 0.8 * flip, 1);
      c.globalAlpha = fade;
      c.fillStyle = cssMix(HEX.moon, HEX.ember, warm, 0.05 + 0.02 * warm);
      c.fillRect(-w / 2, -h / 2, w, h);
      c.strokeStyle = cssMix(HEX.moon, HEX.ember, warm, 0.42 + 0.2 * warm);
      c.lineWidth = 1;
      c.strokeRect(-w / 2, -h / 2, w, h);
      c.fillStyle = cssMix(HEX.moon, HEX.ember, warm * 0.6, 0.85);
      const fs = 14 * sc;
      c.font = font(F.mincho(400), fs);
      const chars = [...s.text];
      chars.forEach((ch, k) => {
        const vf = verticalForm(ch);
        c.fillText(vf.ch, vf.dx * fs, (k - (chars.length - 1) / 2) * fs * 1.08 + vf.dy * fs);
      });
      c.restore();
    }
    c.restore();
  }

  /** Lyric lines as a scroll of vertical columns: each new line comes in from the left, the old one leaves right. */
  lyrics(c: CanvasRenderingContext2D, t: number) {
    const size = 74, adv = size * 1.14, gap = size * 1.62, lineGap = size * 0.9;
    const X0 = 1680, Y0 = 150;
    const L = this.L;
    let S = 0;
    for (let j = 1; j < L.length; j++) S += prog(t, L[j]!.start - 0.12, L[j]!.start + 0.42, ease.inOutCubic) * (this.ncols[j - 1]! * gap + lineGap);
    let off = 0;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    L.forEach((line, i) => {
      const x0 = X0 - off + S;
      off += this.ncols[i]! * gap + lineGap;
      const next = L[i + 1];
      const appear = prog(t, line.start - 0.9, line.start - 0.1, ease.outCubic);
      const leave = next ? prog(t, next.start - 0.1, next.start + 0.25, ease.inQuad) : 0;
      const alpha = appear * (1 - leave);
      if (alpha <= 0.002) return;
      columns(glyphStates(line, t), 7).forEach((col, ci) => {
        const x = x0 - ci * gap;
        if (x < -100 || x > 2000) return;
        // a hairline scale beside each column, with a tick per glyph and an ember marker on the voice
        c.globalAlpha = alpha * 0.22;
        c.fillStyle = rgba('fog');
        const rx = x + size * 0.68;
        c.fillRect(rx, Y0, 1, col.length * adv);
        col.forEach((g, k) => {
          const y = Y0 + k * adv;
          c.globalAlpha = alpha * (g.k > 0 ? 0.5 : 0.22);
          c.fillRect(rx - 3, y, 7, 1);
          if (g.k > 0 && g.k < 1) {
            c.globalAlpha = alpha;
            c.fillStyle = rgba('ember');
            c.fillRect(rx - 5, y + adv * g.k - 1, 11, 2);
            c.fillStyle = rgba('fog');
          }
        });
        c.font = font(F.mincho(700), size);
        col.forEach((g, k) => {
          const v = verticalForm(g.ch);
          const y = Y0 + k * adv + adv / 2 + v.dy * size - 5 * clamp(g.k);
          c.globalAlpha = alpha * (g.k > 0 ? 1 : 0.32);
          c.fillStyle = g.k > 0 && g.k < 1 ? rgba('ember') : g.k >= 1 ? rgba('moon') : rgba('fog');
          c.save();
          c.translate(x + v.dx * size, y);
          if (v.rot) c.rotate(v.rot);
          c.fillText(v.ch, 0, 0);
          c.restore();
        });
      });
    });
    c.restore();
  }
}
