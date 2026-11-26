// Bridge: "もう嫌だって疲れたんだって / がむしゃらに差し伸べた僕の手を振り払う君 / もう嫌だって疲れたよなんて /
// 本当は僕も言いたいんだ". A night window in the rain: a cold, out-of-focus city behind fogged glass,
// still droplets and runnels that slide down in fits and starts, each a small inverted lens. The
// lyrics are written into the condensation as if by a finger, glyph by glyph as they are sung (the
// stroke being written catches a little warm light; the next words show 0.9 s early as the ghost
// of old writing on the glass). On 振り払う a hard swipe clears a wide band and the writing with it;
// a breath fogs the glass again and the second もう嫌だって is written into it. 本当は僕も言いたいんだ
// is small and low, in its own patch of breath, while everything else fogs over.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, makeRT, SCALE, scaleContext2D } from '../engine/gl';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, prog } from '../engine/util';
import { glyphStates, verticalForm, type GlyphState } from './_jp';

const CITY = /* glsl */ `
uniform float uB, uTime;
const vec2 RES = vec2(1920.0, 1080.0);

vec3 lamp(float h) {
  if (h < 0.08) return C_EMBER;
  if (h < 0.4) return mix(C_FOG, C_MOON, 0.3);
  if (h < 0.75) return C_MOON;
  return mix(C_HAZE, C_FOG, 0.5);
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * RES;
  float yn = px.y / RES.y;
  vec3 col = mix(C_NIGHT * 0.55, mix(C_HAZE, C_FOG, 0.35) * 0.16, smoothstep(0.15, 1.0, yn));
  // towers: dark masses with window grids, softened with the blur
  float bw = 170.0;
  float bx = floor((px.x + 40.0) / bw);
  float top = mix(330.0, 690.0, hash11(bx * 3.1 + 2.0));
  float inB = smoothstep(top - 4.0 - uB * 30.0, top + 4.0 + uB * 30.0, px.y);
  vec2 wq = vec2(px.x / 15.0, px.y / 19.0);
  vec2 wc = floor(wq), wf = fract(wq);
  float win = smoothstep(0.25, 0.25 + 0.1 + uB * 0.3, wf.x) * smoothstep(0.75, 0.65 - uB * 0.3, wf.x) * smoothstep(0.3, 0.4 + uB * 0.2, wf.y) * smoothstep(0.75, 0.65 - uB * 0.2, wf.y);
  float lit = step(hash12(wc + bx * 7.0), 0.11) * (0.5 + 0.5 * hash12(wc + 5.0));
  float edgeX = abs(fract((px.x + 40.0) / bw) - 0.5);
  float body = inB * smoothstep(0.49, 0.45 - uB * 0.25, edgeX);
  col = mix(col, C_NIGHT * 0.45, body * mix(0.75, 0.4, uB));
  vec3 wcol = mix(mix(C_FOG, C_MOON, 0.4), C_EMBER, step(0.8, hash12(wc + 3.0)));
  col += wcol * mix(win * lit, 0.16 * 0.3, uB) * body * 0.42;

  // bokeh: three depths of lights, more of them low in the frame; the farther, the smaller
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float cell = mix(64.0, 150.0, fl * 0.5);
    float drift = (fl - 1.0) * 3.0 * uTime;
    vec2 q = vec2(px.x + drift, px.y) / cell;
    vec2 id0 = floor(q);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 id = id0 + vec2(i, j);
      vec3 h = hash33(vec3(id, fl * 13.0 + 1.0));
      float yy = (id.y + 0.5) * cell / RES.y;
      float pOn = mix(0.05, 0.5, smoothstep(0.35, 0.95, yy)) * (1.0 - fl * 0.2);
      if (h.x > pOn) continue;
      vec2 c = (id + 0.5 + (h.yz - 0.5) * 0.7) * cell;
      float r = mix(3.0, 8.0, h.z) + uB * mix(26.0, 52.0, fl * 0.5);
      float d = length(vec2(px.x + drift, px.y) - c);
      float soft = 1.5 + uB * r * 0.35;
      float disc = smoothstep(r, r - soft, d);
      disc *= 0.85 + 0.25 * smoothstep(r * 0.5, r, d); // a faint brighter rim, as real bokeh has
      float e = mix(0.3, 1.0, pow(hash11(h.x * 91.0), 2.0)) * 120.0 / (r * r + 40.0);
      float tw = 0.9 + 0.1 * sin(uTime * (0.6 + h.y) + h.z * 30.0);
      col += lamp(fract(h.y * 7.3 + h.z)) * disc * min(e, 1.8) * tw * 0.9;
    }
  }
  // two large streetlights close to the window, far out of focus
  for (int k = 0; k < 2; k++) {
    vec2 c = k == 0 ? vec2(330.0, 230.0) : vec2(1180.0, 860.0);
    float r = (k == 0 ? 26.0 : 18.0) + uB * (k == 0 ? 120.0 : 90.0);
    float d = length(px - c);
    vec3 lc = k == 0 ? mix(C_EMBER, C_MOON, 0.55) : mix(C_FOG, C_MOON, 0.5);
    col += lc * smoothstep(r, r - 2.0 - uB * r * 0.3, d) * min(1.6, 900.0 / (r * r + 200.0)) * 0.9;
    col += lc * exp(-d / (r * 1.6)) * 0.05;
  }
  // traffic far below: pairs of lights sliding along a street
  float ly = 930.0;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float dir = fk < 0.5 ? 1.0 : -1.0;
    float cx = px.x - dir * uTime * 55.0;
    float cell = 230.0;
    float id = floor(cx / cell);
    float hx = hash11(id * 1.7 + fk * 9.0);
    if (hx < 0.55) {
      float c = (id + 0.3 + 0.4 * hx) * cell;
      for (int s = 0; s < 2; s++) {
        float d = length(vec2(cx - c - float(s) * 22.0, px.y - ly - fk * 30.0));
        float r = 3.0 + uB * 36.0;
        vec3 lc = fk < 0.5 ? mix(C_ROSE, C_EMBER, 0.4) : C_MOON;
        col += lc * smoothstep(r, r - 1.5 - uB * r * 0.4, d) * min(1.4, 55.0 / (r * r + 30.0)) * 0.8;
      }
    }
  }
  fragColor = vec4(col, 1.0);
}`;

const GLASS = /* glsl */ `
uniform sampler2D uSharp, uBlur, uMask;
uniform float uTime, uSwAge, uSwDur, uGrade;
uniform vec4 uSw;        // swipe from (x, y) to (z, w), logical px
uniform vec2 uSwR;       // swipe half-sizes: along, across
uniform vec4 uBr0, uBr1; // breath patches: x, y, radius, amount
const vec2 RES = vec2(1920.0, 1080.0);

vec2 toUv(vec2 px) { return vec2(px.x / RES.x, 1.0 - px.y / RES.y); }
vec3 sharpAt(vec2 px) { return texture(uSharp, toUv(px)).rgb; }
vec3 blurAt(vec2 px) { return texture(uBlur, toUv(px)).rgb; }
vec3 maskAt(vec2 px) { return toSRGB(texture(uMask, toUv(px)).rgb); }

// runnels: a drop per column that slides down in fits and starts, leaving a clear trail and beads
// returns x: trail clear, y: head mask, zw: lens offset
vec4 runnels(vec2 px) {
  vec4 o = vec4(0.0);
  float cw = 96.0;
  float ci0 = floor(px.x / cw);
  for (int k = -1; k <= 1; k++) {
    float ci = ci0 + float(k);
    vec3 h = hash33(vec3(ci, 3.0, 7.0));
    float v = mix(0.07, 0.16, h.x);
    float s = uTime * v + h.y * 7.0;
    float cyc = floor(s);
    if (hash12(vec2(ci, cyc)) > 0.5) continue;
    float f = fract(s);
    float g = f - 0.85 * sin(6.2832 * f * 4.0) / (6.2832 * 4.0); // stop and go
    float yh = mix(-120.0, 1240.0, g);
    float rh = mix(7.0, 12.0, h.z);
    float x0 = (ci + 0.5 + (h.z - 0.5) * 0.5) * cw;
    float xc = x0 + 9.0 * sin(px.y * 0.006 + h.x * 6.0) + 3.0 * sin(px.y * 0.021 + h.y * 4.0);
    // trail above the head (y down): fades as the glass fogs again behind it
    float dy = yh - px.y;
    if (dy > 0.0 && dy < 330.0) {
      float w = rh * 0.55 * (1.0 - dy / 330.0) + 1.2;
      float tr = smoothstep(w, w * 0.4, abs(px.x - xc)) * (1.0 - dy / 330.0);
      o.x = max(o.x, tr);
      // beads left behind, fixed on the glass
      float by = floor(px.y / 22.0);
      vec2 bh = hash22(vec2(ci * 3.0, by));
      if (bh.x < 0.45) {
        vec2 bc = vec2(xc + (bh.y - 0.5) * 10.0, (by + 0.5) * 22.0);
        float br = mix(1.6, 3.6, bh.y) * (1.0 - dy / 330.0 * 0.5);
        vec2 q = (px - bc) / br;
        float m = smoothstep(1.0, 0.75, length(q));
        if (m > o.y) { o.y = m; o.zw = -q * br * 2.0; }
      }
    }
    vec2 q = (px - vec2(xc, yh)) / vec2(rh, rh * 1.25);
    q.y -= 0.15 * max(q.y, 0.0);
    float m = smoothstep(1.0, 0.85, length(q));
    if (m > o.y) { o.y = m; o.zw = -q * rh * 2.6; }
  }
  return o;
}

// still droplets on the glass: two sizes
vec3 droplets(vec2 px, float cell, float rMin, float rMax, float pOn, float seed) {
  vec2 id = floor(px / cell);
  vec3 h = hash33(vec3(id, seed));
  if (h.x > pOn) return vec3(0.0);
  vec2 c = (id + 0.5 + (h.yz - 0.5) * 0.55) * cell;
  float r = mix(rMin, rMax, h.y * h.y);
  vec2 q = (px - c) / r;
  float m = smoothstep(1.0, 0.8, length(q));
  return vec3(m, -q * r * 2.2);
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * RES;

  // the swipe: an ellipse dragged from A to B; how long ago it passed here; streaks along it
  vec2 A = uSw.xy, B = uSw.zw;
  vec2 dA = normalize(B - A), nA = vec2(-dA.y, dA.x);
  float L = length(B - A);
  float u = dot(px - A, dA), vv = dot(px - A, nA);
  float swClear = 0.0;
  if (uSwAge > 0.0) {
    float prog = clamp(uSwAge / uSwDur, 0.0, 1.0);
    float front = L * (1.0 - (1.0 - prog) * (1.0 - prog));
    float uc = clamp(u, 0.0, front);
    float de = length(vec2((u - uc) / uSwR.x, vv / uSwR.y * (1.0 + 0.08 * sin(u * 0.01)))) + 0.1 * snoise(px / 90.0) + 0.05 * snoise(px / 23.0);
    float swept = smoothstep(1.0, 0.78, de);
    // when the palm passed this point (inverse of the ease), and the fog creeping back from the edges
    float k = clamp(uc / max(L, 1.0), 0.0, 0.999);
    float tPass = (1.0 - sqrt(1.0 - k)) * uSwDur;
    float age = uSwAge - tPass;
    float creep = 0.9 + 1.4 * (1.0 - de) + 0.5 * fbm(px / 260.0, 3);
    swClear = swept * (1.0 - smoothstep(0.3, creep, age));
    float streak = 0.5 + 0.5 * sin(vv * 0.21 + 3.0 * snoise(vec2(vv * 0.01, u * 0.002)));
    swClear *= 1.0 - 0.22 * streak * smoothstep(0.0, 0.9, de);
  }

  float breath = uBr0.w * smoothstep(uBr0.z, uBr0.z * 0.2, length((px - uBr0.xy) * vec2(1.0, 1.3)) + uBr0.z * 0.4 * fbm(px / 170.0, 3))
               + uBr1.w * smoothstep(uBr1.z, uBr1.z * 0.2, length((px - uBr1.xy) * vec2(1.0, 1.3)) + uBr1.z * 0.4 * fbm(px / 130.0 + 7.0, 3));
  breath *= 0.75 + 0.25 * fbm(px / 60.0 + 2.0, 2);
  breath = clamp(breath, 0.0, 1.0);

  // the writing: R = cleared by the finger, G = the stroke being written, B = the ghost of what comes next
  vec3 m0 = maskAt(px);
  float e = 2.0;
  vec3 mx0 = maskAt(px - vec2(e, 0.0)), mx1 = maskAt(px + vec2(e, 0.0));
  vec3 my0 = maskAt(px - vec2(0.0, e)), my1 = maskAt(px + vec2(0.0, e));
  vec3 mBlur = (m0 * 2.0 + mx0 + mx1 + my0 + my1) / 6.0;
  float txt = smoothstep(0.15, 0.85, mBlur.r);
  vec2 grad = vec2(mx1.r - mx0.r, my1.r - my0.r) / (2.0 * e);

  vec4 rn = runnels(px);
  float fogV = fbm(px / 340.0 + 3.0, 3);
  float fogN = 0.97 + 0.03 * fogV;
  float fog = fogN * (1.0 - swClear * (1.0 - breath));
  fog = max(fog, breath * 0.92);
  fog *= 1.0 - rn.x * 0.32;
  fog *= 1.0 - mBlur.b * 0.4;
  fog *= 1.0 - txt * 0.97;

  vec3 sharp = sharpAt(px);
  vec3 blurred = blurAt(px);
  // condensation scatters light: milky, brighter, blurred; fresh breath is whiter
  float yn = px.y / RES.y;
  vec3 fogged = blurred * (0.95 + 0.15 * fogV) + C_FOG * mix(0.02, 0.045, yn) + C_HAZE * 0.03 * smoothstep(0.35, 1.0, yn) + C_MOON * 0.035 * breath + blurAt(px + vec2(0.0, 70.0)) * 0.22;
  vec3 col = mix(sharp * 0.85, fogged, fog);
  // inside a stroke being written, a little warmth (the city's warm lights coming through)
  col += C_EMBER * 0.05 * smoothstep(0.2, 0.8, mBlur.g) * txt;

  // drops (still droplets are wiped away where the palm passed)
  vec3 d1 = droplets(px, 34.0, 1.6, 5.0, 0.26, 1.0);
  vec3 d2 = droplets(px + vec2(17.0, 9.0), 76.0, 4.0, 10.5, 0.35, 2.0);
  vec3 dd = d2.x > d1.x ? d2 : d1;
  float wiped = uSwAge > 0.0 ? smoothstep(1.0, 0.8, length(vec2((u - clamp(u, 0.0, L)) / uSwR.x, vv / uSwR.y))) * step(0.0, uSwAge - 0.05) : 0.0;
  dd.x *= (1.0 - wiped) * (1.0 - rn.x) * (1.0 - txt * 0.6);
  if (rn.y > dd.x) dd = vec3(rn.y, rn.zw);
  if (dd.x > 0.0) {
    vec3 lens = sharpAt(px + dd.yz) * 1.5 + blurAt(px + dd.yz * 3.0) * 0.55 + C_FOG * 0.03;
    float rim = smoothstep(0.35, 1.0, length(dd.yz) / 12.0);
    lens *= 1.0 - 0.3 * rim;
    // a highlight on the upper left of each drop
    float hl = smoothstep(0.6, 1.0, dot(normalize(dd.yz + 1e-4), normalize(vec2(5.0, 6.0)))) * smoothstep(0.3, 0.9, length(dd.yz) / 14.0);
    lens += C_MOON * hl * 0.32;
    col = mix(col, lens, dd.x);
  }

  // cold, desaturated grade
  float lu = luma(col);
  col = mix(vec3(lu), col, 0.5) * vec3(0.9, 0.98, 1.1) * uGrade;

  // water gathers along the lower edges of the strokes and catches light; ember while being written
  float rimA = clamp(-grad.y * 5.0, 0.0, 1.0) * 0.3;
  vec3 rimC = mix(C_MOON * 0.42, C_EMBER * 0.95, smoothstep(0.2, 0.7, mBlur.g));
  col += rimC * rimA * (1.0 - swClear * 0.8);
  fragColor = vec4(col, 1.0);
}`;

/** A column of glyphs at a place on the glass. */
interface Col { line: Line; words: number[]; x: number; y: number; size: number; erase?: boolean; fadeAt?: number }

export default class Rain extends Scene {
  city = new FSPass(CITY, { uB: { value: 0 }, uTime: { value: 0 } });
  glass = new FSPass(GLASS, {
    uSharp: { value: null }, uBlur: { value: null }, uMask: { value: null }, uTime: { value: 0 },
    uSwAge: { value: -1 }, uSwDur: { value: 0.3 }, uSw: { value: [2050, 300, 1180, 600] }, uSwR: { value: [170, 440] },
    uBr0: { value: [0, 0, 1, 0] }, uBr1: { value: [0, 0, 1, 0] }, uGrade: { value: 1 },
  });
  sharp = makeRT();
  blur = makeRT(960, 540);
  mask = new Layer2D();
  /** scratch for the glyph being written (clipped to the finger's progress) */
  scratch!: HTMLCanvasElement;
  sx!: CanvasRenderingContext2D;
  cols: Col[] = [];
  L: Line[] = [];
  tSwipe = 0; tBreath = 0; tConf = 0;

  override init() {
    const ly = this.ctx.lyrics;
    const [l33, l34, l35, l36] = this.L = [ly.get('疲れたんだって'), ly.get('がむしゃらに'), ly.get('疲れたよなんて'), ly.get('本当は僕も')];
    this.tSwipe = l34.words[4]!.start - 0.04;     // 振り払う
    this.tBreath = l35.start - 0.75;
    this.tConf = l36.start;
    const S = 92, s2 = 58;
    const fadeLate = l36.start + 0.4;
    this.cols = [
      { line: l33, words: [0, 1], x: 1700, y: 112, size: S, erase: true },
      { line: l33, words: [2], x: 1562, y: 112, size: S, erase: true },
      { line: l34, words: [0], x: 1396, y: 112, size: S, erase: true },
      { line: l34, words: [1], x: 1258, y: 112, size: S, erase: true },
      { line: l34, words: [2, 3], x: 1120, y: 112, size: S, erase: true },
      { line: l34, words: [4, 5], x: 880, y: 150, size: S, fadeAt: fadeLate },
      { line: l35, words: [0, 1], x: 1660, y: 150, size: S, fadeAt: fadeLate + 0.6 },
      { line: l35, words: [2, 3], x: 1520, y: 150, size: S, fadeAt: fadeLate + 0.9 },
      { line: l36, words: [0, 1], x: 620, y: 520, size: s2 },
      { line: l36, words: [2], x: 530, y: 520, size: s2 },
    ];
    this.scratch = document.createElement('canvas');
    this.scratch.width = this.scratch.height = Math.ceil(160 * SCALE);
    this.sx = scaleContext2D(this.scratch.getContext('2d')!, SCALE);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    this.city.u.uTime!.value = t;
    this.city.u.uB!.value = 0.45;
    this.city.render(renderer, this.sharp);
    this.city.u.uB!.value = 1.0;
    this.city.render(renderer, this.blur);

    this.drawMask(t);

    const g = this.glass.u;
    g.uSharp!.value = this.sharp.texture;
    g.uBlur!.value = this.blur.texture;
    g.uMask!.value = this.mask.upload();
    g.uTime!.value = t;
    g.uSwAge!.value = t - this.tSwipe;
    const b0 = g.uBr0!.value as number[];
    const br0 = prog(t, this.tBreath, this.tBreath + 0.45, ease.outCubic) * (1 - 0.55 * prog(t, this.tBreath + 1.2, this.tBreath + 6, ease.inOutQuad));
    b0.splice(0, 4, 1440, 470, 320 + 260 * prog(t, this.tBreath, this.tBreath + 0.8, ease.outCubic), br0);
    const b1 = g.uBr1!.value as number[];
    const tb1 = this.tConf - 0.7;
    const br1 = prog(t, tb1, tb1 + 0.5, ease.outCubic) * (1 - 0.4 * prog(t, tb1 + 2, tb1 + 6));
    b1.splice(0, 4, 590, 690, 240 + 170 * prog(t, tb1, tb1 + 0.9, ease.outCubic), br1);
    // the glass dims a touch for the confession
    g.uGrade!.value = 1 - 0.18 * prog(t, this.tConf - 0.5, this.tConf + 2, ease.inOutQuad);
    this.glass.render(renderer, out);
    return { bloom: 0.35, bloomThreshold: 0.95, halation: 0.08, grain: 0.04, vignette: 0.55, ca: 0.4 };
  }

  /** The finger-written mask: R = written, G = being written, B = ghost (anticipation). */
  drawMask(t: number) {
    const c = this.mask.ctx;
    this.mask.clear('#000');
    c.globalCompositeOperation = 'lighter';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const swipeFront = (x: number, y: number) => {
      // along-swipe coordinate of a point vs the palm's leading edge (same maths as the shader)
      const [ax, ay, bx, by] = [2050, 300, 1180, 600];
      const L = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / L, dy = (by - ay) / L;
      const u = (x - ax) * dx + (y - ay) * dy;
      const p = clamp((t - this.tSwipe) / 0.3);
      const front = L * (1 - (1 - p) * (1 - p)) + 170;
      return t < this.tSwipe ? 0 : clamp((front - u + 30) / 90);
    };
    for (const col of this.cols) {
      const gs = glyphStates(col.line, t).filter((g) => col.words.includes(g.word.index));
      const fade = col.fadeAt ? 1 - prog(t, col.fadeAt, col.fadeAt + 2.6, ease.inOutQuad) : 1;
      if (fade <= 0) continue;
      const adv = col.size * 1.12;
      c.font = font(F.mincho(700), col.size);
      gs.forEach((g, i) => {
        const x = col.x, y = col.y + i * adv + adv / 2;
        let a = fade;
        if (col.erase) a *= 1 - swipeFront(x, y);
        if (a <= 0.003) return;
        // ghost: what is about to be written, like old writing showing in the breath
        const ghost = prog(t, g.word.start - 0.9, g.word.start - 0.1) * (g.k >= 1 ? 0 : 1);
        if (ghost > 0) this.glyph(c, g, x, y, col.size, `rgba(0,0,255,${ghost * 0.9 * a})`, 1);
        if (g.k > 0) {
          this.glyph(c, g, x, y, col.size, `rgba(255,0,0,${a})`, g.k);
          if (g.k < 1) this.glyph(c, g, x, y, col.size, `rgba(0,255,0,${a})`, g.k);
        }
      });
    }
    c.globalCompositeOperation = 'source-over';
  }

  /** One glyph, as a finger would leave it: thickened strokes, revealed top-left to bottom-right up to k. */
  glyph(c: CanvasRenderingContext2D, g: GlyphState, x: number, y: number, size: number, style: string, k: number) {
    const v = verticalForm(g.ch);
    const draw = (cc: CanvasRenderingContext2D, ox: number, oy: number) => {
      cc.save();
      cc.translate(ox + v.dx * size, oy + v.dy * size);
      if (v.rot) cc.rotate(v.rot);
      cc.fillStyle = style;
      cc.strokeStyle = style;
      cc.lineWidth = size * 0.055;
      cc.lineJoin = 'round';
      cc.font = font(F.mincho(700), size);
      cc.textAlign = 'center';
      cc.textBaseline = 'middle';
      cc.fillText(v.ch, 0, 0);
      cc.strokeText(v.ch, 0, 0);
      cc.restore();
    };
    if (k >= 1) { draw(c, x, y); return; }
    // the finger's progress: a soft diagonal wipe through the glyph
    const s = this.sx, H = 80;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, 160, 160);
    draw(s, H, H);
    s.globalCompositeOperation = 'destination-in';
    const half = size * 0.62;
    const gr = s.createLinearGradient(H - half * 0.6, H - half, H + half * 0.6, H + half);
    const e = clamp(k * 1.15, 0, 1);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(Math.max(0.001, e - 0.08), 'rgba(0,0,0,1)');
    gr.addColorStop(Math.min(1, Math.max(e + 0.0001, 0.0011)), 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = gr;
    s.fillRect(0, 0, 160, 160);
    s.globalCompositeOperation = 'source-over';
    c.drawImage(this.scratch, x - H, y - H, 160, 160);
  }
}
