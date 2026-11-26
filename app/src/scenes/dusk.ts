// Intro: "沈むように溶けてゆくように / 二人だけの空が広がる夜に".
// A rooftop at sunset, seen through the chain-link fence of the story's first scene. During the
// instrumental the title sits quietly on the left. On 沈むように the sun sinks; on 溶けてゆくように
// its lower edge melts sideways into the horizon and the sky turns to night. On 空が広がる the
// view tilts up (horizon and fence drop away), the sky widens and fills with stars. City windows
// switch on as it darkens. The lyrics are set vertically in Mincho, one glyph lit as it is sung.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, keys, lerp, prog } from '../engine/util';
import { columns, glyphStates, verticalForm } from './_jp';

const SKY = /* glsl */ `
uniform float uHorizon, uRoof, uMelt, uNight, uStars, uTime, uTwinkle, uLights, uSunR;
uniform vec2 uSun;
const float A = 16.0 / 9.0;

// skyline height above the horizon (uv units) at x (aspect units)
float skyline(float x) {
  float c = floor(x * 11.0);
  float h = 0.012 + 0.05 * pow(hash11(c * 1.7 + 3.1), 2.0);
  return h + 0.07 * step(0.88, hash11(c + 11.3));
}

// chain-link fence: diamond mesh, posts and a top rail; returns coverage 0..1
float fence(vec2 p, float base, float top) {
  if (p.y < base || p.y > top + 0.01) return 0.0;
  float k = 26.0;                                  // diamonds per aspect unit
  vec2 q = vec2(p.x + p.y, p.x - p.y) * k;
  vec2 g = abs(fract(q) - 0.5);
  vec2 w = fwidth(q) * 0.9;
  float mesh = max(1.0 - smoothstep(0.0, w.x, 0.5 - g.x), 1.0 - smoothstep(0.0, w.y, 0.5 - g.y));
  mesh *= step(p.y, top);
  float px = abs(fract(p.x * 1.6 + 0.3) - 0.5) / 1.6;  // posts
  float post = 1.0 - smoothstep(0.0035, 0.0035 + fwidth(p.x) * 1.5, px);
  float rail = 1.0 - smoothstep(0.003, 0.003 + fwidth(p.y) * 1.5, abs(p.y - top));
  return max(mesh * 0.85, max(post, rail));
}

void main() {
  vec2 p = vec2((vUv.x - 0.5) * A, vUv.y);
  float h = p.y - uHorizon;

  // sky: dusk gradient -> night
  vec3 dusk = mix(C_EMBER, C_ROSE, smoothstep(0.0, 0.07, h));
  dusk = mix(dusk, C_HAZE, smoothstep(0.04, 0.22, h));
  dusk = mix(dusk, C_DUSK, smoothstep(0.18, 0.62, h));
  vec3 night = mix(C_HAZE * 0.32, C_DUSK * 0.5, smoothstep(0.0, 0.1, h));
  night = mix(night, C_NIGHT, smoothstep(0.08, 0.6, h));
  vec3 col = mix(dusk, night, uNight);
  col += C_EMBER * 0.3 * exp(-max(h, 0.0) * 16.0) * (1.0 - 0.75 * uNight); // afterglow on the horizon

  // stars, in sky space (they stay put relative to the horizon as the view tilts)
  vec2 sg = vec2(p.x, h) * 64.0;
  vec2 cell = floor(sg);
  vec2 rnd = hash22(cell);
  vec2 c0 = cell + 0.2 + 0.6 * hash22(cell + 7.0);
  float sd = length(sg - c0) * 15.0;                    // ~px from the star
  float rank = rnd.x;                                    // brighter stars appear first
  float on = smoothstep(1.0 - uStars * 0.07, 1.0 - uStars * 0.07 + 0.01, rank);  // ~450 stars at full
  float tw = 0.7 + 0.3 * sin(uTime * (1.3 + 2.7 * rnd.y) + rnd.x * 40.0) + uTwinkle * 0.6 * rnd.y;
  float big = pow(rnd.y, 3.0);                           // a few bright ones, mostly faint
  float star = exp(-sd * sd * mix(1.4, 0.35, big)) * on * tw * smoothstep(0.01, 0.12, h);
  col += C_MOON * star * mix(0.35, 1.8, big);

  // sun: a disc that melts sideways into the horizon as it sinks
  vec2 sp = vec2((uSun.x - 0.5) * A, uSun.y);
  vec2 d = p - sp;
  float nearH = exp(-max(h, 0.0) * 24.0);
  d.x /= 1.0 + uMelt * 6.0 * nearH;
  d.y *= 1.0 + uMelt * 1.2 * nearH;
  float r = length(d);
  float disc = (1.0 - smoothstep(uSunR - 0.002, uSunR, r)) * step(0.0, h);
  vec3 sunCol = mix(C_ROSE, C_EMBER, smoothstep(-uSunR, uSunR, p.y - sp.y)) * 2.4;
  col = mix(col, sunCol, disc);
  col += C_EMBER * 0.45 * exp(-r * 8.0) * step(0.0, h) * (1.0 - uNight);

  // the city: skyline silhouette with windows that switch on as night falls
  float top = uHorizon + skyline(p.x);
  float bld = 1.0 - smoothstep(top - 0.0012, top + 0.0012, p.y);
  vec3 sil = mix(C_DUSK * 0.55, C_NIGHT * 0.7, uNight);
  vec2 wq = vec2(p.x * 80.0, (p.y - uHorizon) * 64.0);
  vec2 wc = floor(wq), wf = fract(wq);
  float win = step(0.3, wf.x) * step(wf.x, 0.7) * step(0.35, wf.y) * step(wf.y, 0.65);
  float lit = step(hash12(wc + 3.0), uLights * 0.16) * step(p.y, top - 0.01);
  vec3 wcol = mix(C_EMBER, C_FOG, step(0.6, hash12(wc + 9.0))) * 0.9;
  vec3 city = sil + wcol * win * lit;
  col = mix(col, city, bld);

  // the rooftop: a dark slab, and the fence standing on its edge
  float roof = 1.0 - smoothstep(uRoof - 0.0015, uRoof + 0.0015, p.y);
  col = mix(col, C_NIGHT * 0.45, roof);
  float fc = fence(p, uRoof, uRoof + 0.36);
  vec3 fcol = mix(C_NIGHT * 0.35 + C_EMBER * 0.05, C_NIGHT * 0.3, uNight);
  col = mix(col, fcol, fc * 0.92);

  fragColor = vec4(col, 1.0);
}`;

export default class Dusk extends Scene {
  sky = new FSPass(SKY, {
    uHorizon: { value: 0 }, uRoof: { value: 0 }, uMelt: { value: 0 }, uNight: { value: 0 }, uStars: { value: 0 },
    uTime: { value: 0 }, uTwinkle: { value: 0 }, uLights: { value: 0 }, uSunR: { value: 0.07 },
    uSun: { value: [0.34, 0.5] },
  });
  text = new Layer2D();
  L0!: Line; L1!: Line;
  /** time anchors, all from the aligned lyrics */
  tSink = 0; tMelt = 0; tSky = 0; tWide = 0;

  override init() {
    const ly = this.ctx.lyrics;
    this.L0 = ly.get('沈むように');
    this.L1 = ly.get('二人だけの');
    this.tSink = this.L0.words[0]!.start;           // 沈むように
    this.tMelt = this.L0.words[1]!.start;           // 溶けてゆくように
    this.tSky = this.L1.words[1]!.start;            // 空が
    this.tWide = this.L1.words[2]!.start;           // 広がる
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const u = this.sky.u;
    // the view tilts up as the sky widens (horizon and roof drop out of frame)
    const tilt = prog(t, this.tSky - 0.3, this.tWide + 2.2, ease.inOutCubic);
    const hz = lerp(0.34, 0.07, tilt);
    u.uHorizon!.value = hz;
    u.uRoof!.value = lerp(0.12, -0.42, tilt);
    // the sun drifts down through the intro, sinks on 沈む and is gone by the end of the line
    const sunY = keys(t, [[0, hz + 0.2], [this.tSink, hz + 0.13, ease.inOutQuad], [this.tMelt + 0.4, hz + 0.045, ease.inOutCubic], [this.L0.end + 0.6, hz - 0.09, ease.inCubic]]);
    (u.uSun!.value as number[])[1] = sunY;
    u.uMelt!.value = prog(t, this.tMelt - 0.4, this.L0.end, ease.inOutQuad);
    u.uNight!.value = prog(t, this.tMelt, this.tSky + 1.5, ease.inOutQuad);
    u.uStars!.value = prog(t, this.L0.end - 1.0, this.tWide + 3.5, ease.outQuad);
    u.uLights!.value = prog(t, this.tMelt + 0.5, this.L1.end, ease.inQuad);
    u.uTime!.value = t;
    u.uTwinkle!.value = f.a.hat;
    this.sky.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    this.title(c, t);
    // line 0 sinks away as line 1 arrives; line 1's columns spread apart as the sky widens
    const out0 = prog(t, this.L1.start - 1.4, this.L1.start - 0.2, ease.inCubic);
    this.lyric(c, this.L0, t, { x: 1590, y: 150, alpha: 1 - out0, sink: 120 * out0, spread: 0 });
    const out1 = prog(t, this.L1.end + 0.4, this.ctx.end, ease.inQuad);
    this.lyric(c, this.L1, t, { x: 1590, y: 150, alpha: 1 - out1, sink: 0, spread: 70 * prog(t, this.tWide, this.tWide + 2.5, ease.outCubic) });
    comp.draw(renderer, this.text.upload(), out);

    return { bloom: 0.6, bloomThreshold: 0.95, halation: 0.18, halationColor: [1.0, 0.42, 0.25], grain: 0.035, vignette: 0.4, ca: 0.6, fade: 1 - prog(t, 0, 1.5) };
  }

  /** The title, during the instrumental intro. */
  title(c: CanvasRenderingContext2D, t: number) {
    const a = prog(t, 2.0, 4.5, ease.inOutQuad) * (1 - prog(t, this.tSink - 4.0, this.tSink - 1.0, ease.inOutQuad));
    if (a <= 0) return;
    c.save();
    c.globalAlpha = a;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = rgba('moon');
    c.font = font(F.mincho(800), 64);
    [...'夜に駆ける'].forEach((ch, i) => c.fillText(ch, 250, 230 + i * 76));
    c.fillStyle = rgba('fog', 0.85);
    c.font = font(F.gothic(400), 20);
    ['YOASOBI', 'ikura · Spotted: Sapporo'].forEach((s, i) => {
      c.save();
      c.translate(176 - i * 34, 230);
      c.rotate(Math.PI / 2);
      c.textAlign = 'left';
      c.fillText(s, 0, 0);
      c.restore();
    });
    c.restore();
  }

  /** A lyric line in vertical columns (right to left), lit glyph by glyph as it is sung. */
  lyric(c: CanvasRenderingContext2D, line: Line, t: number, o: { x: number; y: number; alpha: number; sink: number; spread: number }) {
    const appear = prog(t, line.start - 0.9, line.start - 0.1, ease.outCubic);
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
        // sung glyphs settle down a touch; the sinking exit pulls later glyphs further
        const y = o.y + i * adv + adv / 2 + v.dy * size + o.sink * (0.4 + (g.li / 12)) - 6 * clamp(g.k);
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
