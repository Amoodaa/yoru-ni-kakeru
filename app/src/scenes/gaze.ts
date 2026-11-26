// Verse 2: "君にしか見えない / 何かを見つめる君が嫌いだ / 見惚れているかのような恋するような /
// そんな顔が嫌いだ". Something only she can see. In a near-black sky hangs a gate of light: a
// breathing ring with a pearl-iridescent lip and aurora-like curtains streaming off it, turning one
// way while its inner film turns the other, bending the stars around it into arcs, its centre darker
// than the night. You never get a clean look: heat-haze refraction, and parts of it are simply not
// there from one moment to the next. It surfaces in fragments on 君にしか見えない and is whole by
// 見つめる. The sung words don't stay: they lean toward it and are drawn in, spiralling into the lip,
// which brightens as it feeds; on 見惚れて / 恋するような it opens, warmer, and takes the glyphs almost
// as they are sung. 嫌いだ is jealousy: a hard cut on every mora, alternating black (the glow knocked
// out, only the words left) and a jarring punched-in, tilted look at it with the glow crushed. After
// the first 嫌いだ it comes back; after the second it is dead, a cold afterimage fading to black.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, keys, lerp, prog, hash, frameIdx } from '../engine/util';
import { columns, glyphStates, verticalForm, type GlyphState } from './_jp';

const SHADER = /* glsl */ `
uniform float uTime, uSeen, uAllure, uKO, uBreath, uFeed, uZoom, uTilt, uI, uAfter, uStarsI, uR;
uniform vec2 uC, uOff;

// pearl iridescence, in the palette's own colours (cyclic)
vec3 iri(float x) {
  x = fract(x) * 5.0;
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  if (x < 1.0) return mix(C_ROSE, C_HAZE * 1.5, f);
  if (x < 2.0) return mix(C_HAZE * 1.5, C_FOG * 1.1, f);
  if (x < 3.0) return mix(C_FOG * 1.1, C_MOON, f);
  if (x < 4.0) return mix(C_MOON, C_EMBER, f);
  return mix(C_EMBER, C_ROSE, f);
}

float stars(vec2 p) {
  vec2 g = p / 34.0;
  vec2 c = floor(g);
  vec2 h = hash22(c);
  vec2 o = c + 0.2 + 0.6 * hash22(c + 7.0);
  float d = length(g - o) * 34.0;
  return step(0.86, h.x) * exp(-d * d * 0.8) * (0.25 + 0.75 * h.y * h.y);
}

void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  // the phenomenon's own camera (the jealous punch-ins move only it)
  vec2 pc = rot2(uTilt) * ((p - uC) / uZoom) - uOff;
  float rr = length(pc) / uR;
  // heat-haze refraction: never a clean look
  vec2 w = vec2(snoise(vec3(pc * 0.0055, uTime * 0.22)), snoise(vec3(pc * 0.0055 + 9.1, uTime * 0.22)));
  w += 0.4 * vec2(snoise(vec3(pc * 0.02, uTime * 0.6)), snoise(vec3(pc * 0.02 + 3.3, uTime * 0.6)));
  pc += w * uR * 0.045 * smoothstep(3.0, 0.7, rr);
  // a gate seen at an angle: an ellipse, tilted
  vec2 q = rot2(0.28) * (pc / uR);
  q.y /= 0.74;
  float r = length(q);
  vec2 dir = q / max(r, 1e-4);

  // near-black sky
  vec3 col = mix(C_NIGHT * 0.32, C_DUSK * 0.22, smoothstep(0.0, 1080.0, p.y));
  // stars, bent around the gate into arcs (a point-lens mapping)
  vec2 src = q - q * (0.62 / max(r * r, 0.08));
  float st = stars(uC + src * uR) + 0.5 * stars(p * 1.7 + 51.0) * smoothstep(1.0, 2.5, r);
  col += C_MOON * st * uStarsI * smoothstep(0.92, 1.05, r);

  // the ring: radius breathes and wavers; it opens when she is lost in it
  float Rr = 1.0 + 0.045 * sin(uBreath) + 0.035 * snoise(vec3(dir * 1.6, uTime * 0.2)) + 0.06 * uAllure;
  float d = r - Rr;
  // the lip: thin and bright
  float lip = exp(-d * d / 0.0003) + 0.35 * exp(-d * d / 0.004);
  // curtains streaming outward, turning one way...
  vec2 dr = rot2(uTime * 0.06) * dir;
  float c1 = snoise(vec3(dr * 2.6, uTime * 0.11));
  float c2 = snoise(vec3(dr * 9.0, uTime * 0.19 + r * 0.7));
  float curtain = pow(sat(0.55 + 0.6 * c1), 2.0) * (0.55 + 0.45 * c2);
  float ext = 0.16 + 0.2 * uAllure + 0.1 * sat(c1);
  float outer = smoothstep(-0.015, 0.02, d) * exp(-max(d, 0.0) / ext);
  // ...fine filaments turning the other way (it is not quite right)
  vec2 dr2 = rot2(-uTime * 0.09) * dir;
  float fil = pow(0.5 + 0.5 * snoise(vec3(dr2 * 34.0, r * 2.5 - uTime * 0.35)), 3.0);
  float veil = curtain * outer * (0.35 + 1.1 * fil);
  // a film across the gate, drawn inward
  vec2 qs = rot2(-uTime * 0.12 + 2.2 * (1.0 - r)) * q; // a slow swirl, tighter toward the middle
  float film = smoothstep(-0.05, -0.6, d) * pow(0.5 + 0.5 * snoise(vec3(qs * 2.2, uTime * 0.1)), 3.0);
  // iridescence slides against the rotation
  float ph = d * 2.4 + 0.4 * snoise(vec3(q * 1.5, uTime * 0.07)) + uTime * 0.035 + 0.25 * uAllure;
  vec3 ic = iri(ph);
  vec3 ic2 = iri(ph + 0.37);

  // inside: darker than the night
  float inside = smoothstep(0.03, -0.12, d);
  col *= 1.0 - inside * 0.95 * sat(uI * 1.6) * (1.0 - uKO * 0.5);

  vec3 light = ic * (1.5 * lip * (0.55 + 0.45 * curtain)) + ic2 * (0.85 * veil) + C_HAZE * 0.12 * film
             + mix(iri(ph + 0.6), C_HAZE, 0.4) * 0.05 * exp(-abs(d) * 3.2);
  light *= (0.85 + 0.15 * sin(uBreath)) * (1.0 + 0.6 * uFeed) * (1.0 + 0.5 * uAllure);
  // half-seen: parts of it are not there this moment
  float seen = smoothstep(-0.2, 0.3, snoise(vec3(q * 1.3, uTime * 0.16)) - 0.6 + 1.4 * uSeen);
  light *= mix(seen, 1.0, 0.25 * uSeen);
  col += light * uI * (1.0 - uKO);
  // what is left when the glow is knocked out: a cold dead rim
  col += C_FOG * 0.05 * exp(-d * d / 0.0008) * uKO * uI;
  // afterimage, after it's gone
  col += C_FOG * 0.07 * uAfter * exp(-d * d / 0.003);

  fragColor = vec4(col, 1.0);
}`;

interface G {
  g: GlyphState;
  line: number;
  x: number;
  y: number;
  tOn: number;
  tDone: number;
  /** when it starts to be drawn into the ring (Infinity: never) */
  pull: number;
}

const SIZE = 80;
const ADV = SIZE * 1.16;
const GAP = SIZE * 1.6;

export default class Gaze extends Scene {
  pass = new FSPass(SHADER, {
    uTime: { value: 0 }, uSeen: { value: 0 }, uAllure: { value: 0 }, uKO: { value: 0 }, uBreath: { value: 0 },
    uFeed: { value: 0 }, uZoom: { value: 1 }, uTilt: { value: 0 }, uI: { value: 0 }, uAfter: { value: 0 },
    uStarsI: { value: 1 }, uR: { value: 240 }, uC: { value: [640, 520] }, uOff: { value: [0, 0] },
  });
  text = new Layer2D();
  lines: Line[] = [];
  gl: G[] = [];
  kirai: Word[] = [];
  C = { x: 640, y: 520 };

  override init() {
    const ly = this.ctx.lyrics;
    const first = ly.get('君にしか');
    this.lines = ly.lines.slice(first.i, first.i + 4);
    this.kirai = [this.lines[1]!, this.lines[3]!].map((l) => l.words.find((w) => w.w.includes('嫌い'))!);
    // how soon a sung glyph is drawn in, per line: slowly at first, almost at once when she is lost in it
    const delay = [1.1, 0.7, 0.3, 0.5];
    // each line a little closer to it; after the last 嫌いだ the words pull back to the edge
    const x0 = [1730, 1580, 1370, 1730];
    this.lines.forEach((line, li) => {
      columns(glyphStates(line, line.start), 8).forEach((col, ci) => {
        col.forEach((g, i) => {
          const tOn = this.scan(line, g.li, (k) => k > 0);
          const tDone = this.scan(line, g.li, (k) => k >= 1);
          const isKirai = this.kirai.includes(g.word);
          this.gl.push({ g, line: li, x: x0[li]! - ci * GAP, y: 160 + i * ADV + ADV / 2, tOn, tDone, pull: isKirai ? Infinity : tDone + delay[li]! + 0.1 * hash(li, g.li) });
        });
      });
    });
  }

  scan(line: Line, li: number, ok: (k: number) => boolean) {
    for (let t = line.start - 0.05; t < line.end + 0.5; t += 0.005) if (ok(glyphStates(line, t)[li]!.k)) return t;
    return line.end;
  }

  /** The jealous cuts: which mora of a 嫌いだ we are on (-1: none), and which 嫌いだ. */
  cut(t: number): { n: number; i: number } {
    for (let n = 0; n < this.kirai.length; n++) {
      const m = this.kirai[n]!.mora!;
      if (t < m[0]![1] || t >= m[m.length - 1]![2]) continue;
      for (let i = m.length - 1; i >= 0; i--) if (t >= m[i]![1]) return { n, i };
    }
    return { n: -1, i: -1 };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const u = this.pass.u;
    const [L0, L1, L2, L3] = this.lines as [Line, Line, Line, Line];
    const [K0, K1] = this.kirai as [Word, Word];
    const E = this.ctx.end;

    const cut = this.cut(t);
    const black = cut.i >= 0 && cut.i % 2 === 0; // き, い: black
    const punch = cut.i >= 0 && cut.i % 2 === 1; // ら, だ: a jarring look at it, glow crushed
    // how much of it there is
    const seen = keys(t, [[this.ctx.start, 0.0], [L0.words[1]!.start, 0.35, ease.inOutQuad], [L0.end + 0.3, 0.75], [L1.words[1]!.end, 1.0], [L3.end, 1.0]]);
    const intensity = keys(t, [[this.ctx.start, 0.15], [L0.words[1]!.start, 0.55, ease.inOutQuad], [L1.words[1]!.start, 1.0, ease.inOutQuad]]);
    const allure = keys(t, [[L1.start, 0], [L2.start, 0.15], [L2.words[0]!.end, 0.55, ease.inOutQuad], [L2.end, 1.0, ease.inOutQuad], [L3.words[1]!.end, 0.85], [K1.start, 1.0, ease.inQuad]]);
    // knocked out: after the first 嫌いだ it recovers (見惚れて), after the second it's dead
    let ko = punch ? 0.85 : 0;
    if (t >= K0.end) ko = Math.max(ko, 1 - prog(t, K0.end, K0.end + 1.4, ease.inOutQuad));
    if (t >= K1.end) ko = 1;
    let I = intensity;
    if (black) I = 0;
    if (t >= K1.end) I = 1 - prog(t, K1.end, K1.end + 0.25);
    // feeding: brightens as the drawn-in glyphs arrive
    let feed = 0;
    for (const g of this.gl) {
      const a = t - (g.pull + 2.4);
      if (a > -0.4 && a < 1.2) feed += 0.25 * Math.exp(-Math.abs(a) * 3);
    }
    u.uTime!.value = t;
    u.uSeen!.value = seen;
    u.uAllure!.value = allure;
    u.uKO!.value = ko;
    u.uI!.value = I;
    u.uBreath!.value = t * (Math.PI * 2 / 4.6) + 0.6 * Math.sin(t * 0.7);
    u.uFeed!.value = Math.min(1, feed);
    u.uAfter!.value = t >= K1.end ? Math.exp(-(t - K1.end) * 1.6) * (1 - prog(t, E - 0.35, E)) : 0;
    u.uStarsI!.value = black ? 0.15 : t >= K1.end ? 0.3 : 1;
    // punch-ins: a different, wrong framing on each
    if (punch) {
      const s = hash(cut.n, cut.i);
      u.uZoom!.value = lerp(1.7, 2.4, s);
      (u.uOff!.value as number[])[0] = (hash(cut.n, cut.i, 1) - 0.5) * 260;
      (u.uOff!.value as number[])[1] = (hash(cut.n, cut.i, 2) - 0.5) * 200 - 120;
      u.uTilt!.value = (hash(cut.n, cut.i, 3) - 0.5) * 0.5;
    } else {
      // otherwise the slowest drift in toward it
      u.uZoom!.value = lerp(1.0, 1.12, prog(t, this.ctx.start, K1.start, ease.inOutQuad));
      (u.uOff!.value as number[])[0] = 0;
      (u.uOff!.value as number[])[1] = 0;
      u.uTilt!.value = 0.02 * Math.sin(t * 0.21);
    }
    this.pass.render(renderer, out);

    // lyrics
    const c = this.text.ctx;
    this.text.clear();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const C = this.C;
    const R = (u.uR!.value as number) * (1 + 0.06 * allure);
    for (const g of this.gl) {
      const line = this.lines[g.line]!;
      const isKirai = this.kirai.includes(g.g.word);
      // anticipation, but never over the previous line's 嫌いだ, which is cut away at its end
      let appear = line.start - 0.7;
      if (g.line === 2) appear = K0.end;
      let alpha = prog(t, appear, appear + 0.3, ease.outCubic);
      if (g.line === 2 && t >= K0.end) alpha = 1;
      if (g.line === 1 && isKirai && t >= K0.end) alpha = 0;
      if (g.line === 3 && t >= K1.end) alpha *= 1 - prog(t, E - 0.6, E - 0.1);
      if (alpha <= 0.002) continue;
      // on the black cuts only 嫌いだ is left
      if (black && !isKirai) continue;
      const k = t >= g.tDone ? 1 : t >= g.tOn ? (t - g.tOn) / Math.max(1e-3, g.tDone - g.tOn) : 0;
      const singing = k > 0 && k < 1;
      let x = g.x, y = g.y, rot = 0, size = SIZE, blur = 0;
      let col = singing ? rgba('ember') : k >= 1 ? rgba('moon') : rgba('fog');
      // leaning toward it: sung glyphs are pulled a little as they wait
      const dx = C.x - x, dy = C.y - y;
      const dist = Math.hypot(dx, dy);
      const lean = (k > 0 ? 1 : 0.4) * (18 + 40 * allure) * prog(t, g.tOn - 0.5, g.tOn + 0.6) * (isKirai ? 0.2 : 1);
      x += (dx / dist) * lean;
      y += (dy / dist) * lean;
      // drawn in: spiral into the lip
      const pu = t - g.pull;
      if (pu > 0) {
        if (punch || ko > 0.5) continue; // the cuts knock the drifting words out too
        // it shrinks to a mote first, then streams in
        const e = prog(pu, 0.25, 2.4, ease.inOutCubic);
        const shrink = prog(pu, 0, 0.6, ease.inOutQuad);
        const r0 = Math.hypot(x - C.x, y - C.y);
        const a0 = Math.atan2(y - C.y, x - C.x);
        const r = lerp(r0, R * 1.02, e);
        const a = a0 + 1.5 * e * e;
        x = C.x + Math.cos(a) * r;
        y = C.y + Math.sin(a) * r;
        rot = (a - a0) * 0.8;
        size *= lerp(1, 0.2, shrink) * lerp(1, 0.7, e);
        alpha *= 1 - prog(e, 0.7, 1);
        blur = 2 * shrink;
        const pearl = prog(e, 0.2, 0.9);
        col = `rgba(${Math.round(lerp(243, 217, pearl))},${Math.round(lerp(238, 170, pearl))},${Math.round(lerp(228, 200, pearl))},1)`;
      }
      if (alpha <= 0.002) continue;
      const v = verticalForm(g.g.ch);
      c.save();
      c.globalAlpha = alpha * (k > 0 ? 1 : 0.3);
      c.fillStyle = col;
      c.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : 'none';
      // on the punch-ins the words jolt too
      const j = punch ? (hash(cut.n, cut.i, 9) - 0.5) * 14 : 0;
      c.font = font(F.mincho(700), size);
      c.translate(x + v.dx * size + j, y + v.dy * size);
      c.rotate(rot + v.rot);
      c.fillText(v.ch, 0, 0);
      c.restore();
    }
    comp.draw(renderer, this.text.upload(), out);

    const shake: [number, number] = punch ? [(hash(frameIdx(t), 1) - 0.5) * 10, (hash(frameIdx(t), 2) - 0.5) * 8] : [0, 0];
    return {
      bloom: 0.75, bloomThreshold: 0.95, halation: 0.15, halationColor: [0.9, 0.5, 0.6], grain: 0.045,
      vignette: 0.55, ca: punch ? 4.0 : 1.4, shake,
    };
  }
}
