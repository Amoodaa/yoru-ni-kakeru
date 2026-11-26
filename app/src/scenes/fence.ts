// Verse 1: "「さよなら」だけだった … 寂しい目をしてたんだ". The memory of the day they met.
// A close-up of the chain-link fence, slightly turned away from the camera, in shallow depth of
// field, with the sunset behind it as soft bokeh. The whole verse is written into the fence, one
// glyph per diamond cell, right to left, and the camera tracks along the wire following the voice.
// Unsung glyphs sit in the wire's plane and share its blur; a glyph lights (and lights its cell and
// the wire around it) as it is sung. Rack focus: the fence is a shadow at first; on 全てが分かった it
// snaps sharp. On 日が沈み出した the focus drifts back to the sky and the sun sinks; on 君の姿 a warm
// presence of light appears behind the fence and the focus goes to it; on 重なっていた the fence comes
// back over it, its wires rim-lit by the light. On 奪った every sung glyph is pulled out of its cell
// into that light. On 儚い / 寂しい the sun is gone, the light cools, thins and flickers out.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, keys, lerp, prog, hash, type Key } from '../engine/util';
import { glyphStates, verticalForm, type GlyphState } from './_jp';

// Fence geometry, shared by the shader and the glyph layout. The fence is a plane through
// (0, 0, Z0) turned by TH around the vertical axis; σ is the coordinate along it, Y up it.
const FOC = 1000; // focal length, logical px
const TH = 0.2;
const Z0 = 4;
const A = 0.28; // half-diagonal of a diamond cell (world): 70 px at Z0
const YOFF = 1.48; // Y of the top row of cell centres (y ≈ 170 px)
const RW = 0.0105; // wire radius
const KB = 112; // blur px per unit of |1/z - 1/zf|
const GLYPH = 62; // glyph size at Z0
const MAXCELLS = 40;
const cT = Math.cos(TH), sT = Math.sin(TH);

function project(sig: number, Y: number, track: number) {
  const s = sig - track;
  const z = Z0 + s * sT;
  return { x: 960 + (FOC * s * cT) / z, y: 540 - (FOC * Y) / z, z };
}

const SHADER = /* glsl */ `
uniform float uTrack, uInvZf, uBgBlur, uCool, uTime, uSunR, uPresI, uPresW, uHz, uBgShift, uLights, uFlare;
uniform vec2 uSun, uPres;
uniform vec4 uCell[${MAXCELLS}];
uniform float uPost[4];
const float FOC = ${FOC.toFixed(1)}, TH = ${TH}, Z0 = ${Z0.toFixed(1)}, A = ${A}, YOFF = ${YOFF}, RW = ${RW}, KB = ${KB.toFixed(1)};

float sdPoly(vec2 p, float r, float n, float rot) {
  float a = atan(p.y, p.x) + rot;
  float s = TAU / n;
  return cos(floor(0.5 + a / s) * s - a) * length(p) - r;
}

// one out-of-focus highlight: an aperture-shaped disc with a slightly brighter rim
float bokeh(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  if (abs(d.x) > r + 3.0 || abs(d.y) > r + 3.0) return 0.0;
  float sd = mix(length(d) - r, sdPoly(d, r, 7.0, 0.3), 0.55);
  float cov = smoothstep(1.4, -1.4, sd);
  float rim = smoothstep(-r * 0.22, 0.0, sd);
  return cov * (0.78 + 0.45 * rim);
}

vec3 background(vec2 p) {
  float hz = uHz;
  float h = (hz - p.y) / hz; // 0 at the horizon, 1 at the top of the frame
  // the sunset sky, and the same sky an hour later (cool)
  vec3 warm = mix(C_EMBER * 1.05, C_ROSE * 0.85, smoothstep(0.0, 0.28, h));
  warm = mix(warm, C_HAZE * 0.75, smoothstep(0.2, 0.62, h));
  warm = mix(warm, C_DUSK * 0.85, smoothstep(0.55, 1.15, h));
  vec3 cool = mix(C_HAZE * 0.55, C_DUSK * 0.7, smoothstep(0.0, 0.45, h));
  cool = mix(cool, C_NIGHT * 1.1, smoothstep(0.4, 1.2, h));
  vec3 col = mix(warm, cool, uCool);
  // low sun haze
  vec2 sd = p - uSun;
  float sr = length(sd * vec2(0.8, 1.15));
  col += C_EMBER * (0.5 * exp(-sr / 260.0) + 0.25 * exp(-sr / 700.0)) * (1.0 - uCool);

  // a few big, faint discs of haze light around the sun
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = uSun + vec2(hash11(fi * 3.7 + 1.0) - 0.5, hash11(fi * 5.3 + 2.0) - 0.75) * vec2(900.0, 520.0);
    c.x = c.x - uBgShift * 0.6;
    float r = (60.0 + 70.0 * hash11(fi * 9.1)) * uBgBlur;
    vec3 bc = mix(C_EMBER, C_ROSE, hash11(fi * 1.9));
    bc = mix(bc, C_FOG * 0.6, uCool);
    col += bc * bokeh(p, c, r) * 0.07;
  }

  // the sun: a soft disc, sinking into the horizon
  float edge = 2.0 + 16.0 * uBgBlur;
  float disc = smoothstep(uSunR + edge, uSunR - edge, length(sd));
  vec3 sunCol = mix(C_ROSE, C_EMBER * 1.15, smoothstep(uSunR, -uSunR, sd.y)) * 2.6;
  col = mix(col, sunCol, disc * (1.0 - uCool * 0.9));

  // the city below the horizon, out of focus: a soft silhouette
  float xs = p.x + uBgShift;
  float blurH = 6.0 + 26.0 * uBgBlur;
  // blocks of taller buildings, their edges blurred like everything else back there
  float bx = xs / 140.0, bi = floor(bx), bf = fract(bx), bw = clamp(blurH / 140.0, 0.02, 0.5);
  float hb = step(0.75, hash11(bi));
  hb = bf < 0.5 ? mix(step(0.75, hash11(bi - 1.0)), hb, smoothstep(-bw, bw, bf)) : mix(hb, step(0.75, hash11(bi + 1.0)), smoothstep(1.0 - bw, 1.0 + bw, bf));
  float sky = 8.0 * snoise(vec2(xs * 0.004, 1.3)) + 14.0 * hb;
  float below = smoothstep(-blurH, blurH, p.y - (hz - sky));
  vec3 sil = mix(C_DUSK * 0.45 + C_EMBER * 0.04, C_NIGHT * 0.8, uCool);
  col = mix(col, sil * mix(1.0, 0.55, smoothstep(hz, 1080.0, p.y)), below);

  // the presence: a warm, soft column of light behind the fence (no figure, only light)
  if (uPresI > 0.0) {
    vec2 q = p - uPres;
    float sway = 0.12 * snoise(vec2(q.y * 0.004, uTime * 0.35));
    float wx = uPresW * (1.0 + sway);
    float g = exp(-pow(q.x / wx, 2.0) - pow(q.y / (wx * 3.1), 2.0));
    float core = exp(-pow(q.x / (wx * 0.32), 2.0) - pow(q.y / (wx * 2.2), 2.0));
    float shimmer = 0.85 + 0.15 * snoise(vec3(q * 0.006, uTime * 0.4));
    vec3 pc = mix(mix(C_EMBER, C_MOON, 0.3), mix(C_FOG, C_MOON, 0.5), uCool);
    col += pc * uPresI * shimmer * (0.55 * g + 0.9 * core);
  }

  // city lights near the horizon, as bokeh
  if (p.y > hz - 110.0) for (int i = 0; i < 56; i++) {
    float fi = float(i);
    float on = step(hash11(fi * 1.31 + 0.7), uLights);
    if (on == 0.0) continue;
    vec2 c = vec2(mod(hash11(fi * 7.13) * 2600.0 - uBgShift, 2600.0) - 340.0,
                  hz + 14.0 + 260.0 * pow(hash11(fi * 3.31 + 5.0), 1.8) - 40.0 * hash11(fi * 2.1));
    float r = (10.0 + 14.0 * hash11(fi * 4.7) + 0.06 * (c.y - hz)) * (0.55 + 0.75 * uBgBlur);
    float k = hash11(fi * 6.1);
    vec3 bc = k < 0.55 ? C_EMBER : k < 0.8 ? C_MOON * 0.8 : C_FOG;
    bc = mix(bc, k < 0.4 ? C_EMBER * 0.8 : C_FOG, uCool * 0.7);
    float fl = 1.0 - uCool * 0.55 * (0.5 + 0.5 * sin(uTime * (2.0 + 3.0 * k) + fi * 2.7));
    col += bc * bokeh(p, c, r) * (0.28 + 0.55 * hash11(fi * 8.3)) * fl;
  }
  return col;
}

void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y); // logical px, y down
  vec3 bg = background(p);

  // ray -> fence plane
  vec3 d = vec3((p.x - 960.0) / FOC, (540.0 - p.y) / FOC, 1.0);
  float cT = cos(TH), sT = sin(TH);
  float t = Z0 * cT / (cT - sT * d.x);
  vec3 P = t * d;
  float sig = P.x * cT + (P.z - Z0) * sT + uTrack;
  float Y = P.y - YOFF;
  float z = P.z;
  float ppw = FOC / z; // px per world unit
  float b = max(KB * abs(1.0 / z - uInvZf), 0.6);

  // lit cells: a lantern glow inside, light on the wires around
  float L = 0.0;
  for (int i = 0; i < ${MAXCELLS}; i++) {
    vec4 c = uCell[i];
    if (c.z <= 0.0) continue;
    float dd = (abs(p.x - c.x) + abs(p.y - c.y)) / c.w;
    L += c.z * exp(-dd * dd * 2.4);
  }
  vec3 col = bg + C_EMBER * 0.3 * L;

  // chain-link: two families of wires at 45 degrees
  float u = (sig + Y) / (2.0 * A), v = (sig - Y) / (2.0 * A);
  float du = abs(u - floor(u + 0.5)) * 2.0 * A * 0.70711 * ppw;
  float dv = abs(v - floor(v + 0.5)) * 2.0 * A * 0.70711 * ppw;
  float wpx = RW * ppw;
  float peak = min(1.0, 1.7 * wpx / (wpx + b));
  float cu = smoothstep(wpx + b, wpx - b, du) * peak;
  float cv = smoothstep(wpx + b, wpx - b, dv) * peak;
  // weave: at each knot one wire passes over the other; the under one is shaded near it
  vec2 knot = vec2(floor(u + 0.5), floor(v + 0.5));
  bool uTop = mod(knot.x + knot.y, 2.0) < 0.5;
  float sharp = sat(1.0 - b / (wpx * 1.6));
  float occ = mix(1.0, smoothstep(0.0, 3.0 * wpx, uTop ? du : dv), sharp);
  float under = uTop ? cv : cu, over = uTop ? cu : cv;
  // shading across the wire: dark backlit core, edges catching the light behind
  float dw = uTop ? du : dv;
  float across = sat(min(du, dv) / max(wpx, 1e-3));
  float rimP = smoothstep(0.25, 1.0, across);
  vec3 lightBehind = bg * 1.25 + C_EMBER * 1.4 * L;
  vec3 wire = mix(bg * 0.09 + C_EMBER * 0.03 * (1.0 - uCool), lightBehind, 0.6 * sharp * rimP);
  wire = mix(bg * 0.22, wire, mix(0.4, 1.0, sharp));
  float covU = 1.0 - (1.0 - over) * (1.0 - under * occ);
  col = mix(col, wire, covU);
  // a glint where a knot faces the light
  float kd = length(vec2(du, dv));
  float gl = hash12(knot + 17.0);
  col += mix(C_EMBER, C_FOG, uCool) * sharp * step(0.82, gl) * exp(-kd * kd / (wpx * wpx * 1.2)) * (0.6 + 1.6 * L + 0.8 * uFlare);

  // posts: thick round bars in the fence plane
  for (int i = 0; i < 4; i++) {
    float dpx = abs(sig - uPost[i]) * ppw;
    float pr = 0.1 * ppw;
    float pc = smoothstep(pr + b, pr - b, dpx) * min(1.0, 2.0 * pr / (pr + b));
    float n = sat(dpx / pr);
    vec3 pcol = bg * 0.06 + lightBehind * 0.5 * pow(n, 7.0) * sharp;
    col = mix(col, pcol, pc);
  }

  fragColor = vec4(col, 1.0);
}`;

interface Placed {
  g: GlyphState;
  line: number; // index into this.lines
  k: number; // lattice column (odd)
  l: number; // lattice row (even, 0 = top)
  tOn: number; // when it starts being sung
  tDone: number; // when it is fully sung
  pull: number; // when it is pulled out of its cell (Infinity = never)
}

/** Columns of at most `max` glyphs, broken between words; a longer word is split near its middle. */
function fenceColumns(gs: GlyphState[], max: number): GlyphState[][] {
  const cols: GlyphState[][] = [];
  let cur: GlyphState[] = [];
  for (const w of new Set(gs.map((g) => g.word))) {
    const wg = gs.filter((g) => g.word === w);
    const parts = wg.length > max ? [wg.slice(0, Math.ceil(wg.length / 2)), wg.slice(Math.ceil(wg.length / 2))] : [wg];
    for (const part of parts) {
      if (cur.length && cur.length + part.length > max) { cols.push(cur); cur = []; }
      cur.push(...part);
    }
  }
  if (cur.length) cols.push(cur);
  return cols;
}

export default class Fence extends Scene {
  pass = new FSPass(SHADER, {
    uTrack: { value: 0 }, uInvZf: { value: 0 }, uBgBlur: { value: 0.5 }, uCool: { value: 0 }, uTime: { value: 0 },
    uSunR: { value: 90 }, uPresI: { value: 0 }, uPresW: { value: 90 }, uHz: { value: 760 }, uBgShift: { value: 0 },
    uLights: { value: 0.4 }, uFlare: { value: 0 },
    uSun: { value: [560, 520] }, uPres: { value: [620, 470] },
    uCell: { value: new Float32Array(MAXCELLS * 4) },
    uPost: { value: [-99, -99, -99, -99] },
  });
  text = new Layer2D();
  lines: Line[] = [];
  placed: Placed[] = [];
  trackKeys: Key[] = [];
  focusKeys: Key[] = [];
  posts: number[] = [];
  w: Record<string, Word> = {};
  cellBuf = new Float32Array(MAXCELLS * 4);

  override init() {
    const ly = this.ctx.lyrics;
    const first = ly.get('さよなら');
    this.lines = ly.lines.slice(first.i, first.i + 8); // L2..L9
    const W = (q: string, line: string) => ly.get(line).words.find((w) => w.w.includes(q))!;
    this.w = {
      sayonara: W('さよなら', 'さよなら'), dake: W('だけだった', 'さよなら'),
      hitokoto: W('一言で', 'その一言で'), subete: W('全てが', 'その一言で'),
      higa: W('日が', '日が沈み'), shizumi: W('沈み出した', '日が沈み'), sorato: W('空と', '日が沈み'), kimino: W('君の', '日が沈み'),
      kasanatte: W('重なって', 'フェンス越し'), hajimete: W('初めて', '初めて会った'),
      ubatta: W('奪った', '僕の心の'), hakanai: W('儚い', 'どこか儚い'), sabishii: W('寂しい', '寂しい目'),
    };

    // lay the verse into the fence, right to left: one cell per glyph, a free column between lines
    let k = 41;
    const colMid: [number, number][] = []; // [time the column is sung, σ]
    this.lines.forEach((line, li) => {
      const gs = glyphStates(line, line.start);
      const cols = fenceColumns(gs, 6);
      if (li > 0) {
        // the posts stand in the gap between couplets
        if (li % 2 === 0) this.posts.push(A * k);
        k -= 2;
      }
      cols.forEach((col) => {
        col.forEach((g, i) => {
          const tOn = this.scan(line, g.li, (kk) => kk > 0);
          const tDone = this.scan(line, g.li, (kk) => kk >= 1);
          this.placed.push({ g, line: li, k, l: -2 * i, tOn, tDone, pull: Infinity });
        });
        const sung = col.map((g) => this.scan(line, g.li, (kk) => kk > 0));
        colMid.push([(sung[0]! + sung[sung.length - 1]!) / 2, A * k]);
        k -= 2;
      });
    });
    // the camera follows the voice: the column being sung sits right of centre
    const off = 0.6;
    this.trackKeys = colMid.map(([t, s], i) => [t, s - off, i === 0 ? ease.linear : ease.inOutQuad] as Key);
    this.trackKeys.unshift([this.ctx.start, colMid[0]![1] - off + 0.75]);
    const last = colMid[colMid.length - 1]!;
    this.trackKeys.push([this.ctx.end, last[1] - off - 0.35, ease.outQuad]);

    // 奪った: everything sung so far in this couplet is pulled out of its cell; 奪った itself as it is sung
    const ub = this.w.ubatta!;
    // nearest the light (leftmost) first, top to bottom: a stream of glyphs into the light
    const pulled = this.placed.filter((p) => (p.line === 4 || p.line === 5) && p.g.word !== ub).sort((a, b) => a.k - b.k || b.l - a.l);
    pulled.forEach((p, i) => (p.pull = ub.start + 0.02 + 0.065 * i));
    for (const p of this.placed) if (p.g.word === ub) p.pull = p.tDone + 0.06;

    const au = this.ctx.audio;
    const nb = (t: number) => au.nearestBeat(t);
    const w = this.w;
    this.focusKeys = [
      [this.ctx.start, 0.0],
      [w.sayonara!.start, 0.06],
      [w.dake!.end, 0.4, ease.inOutCubic],
      [nb(w.hitokoto!.start), 0.4],
      [w.subete!.start - 0.04, 0.22, ease.inOutQuad],
      [w.subete!.start + 0.28, 1.0, ease.outExpo], // 全てが分かった: snap
      [nb(w.shizumi!.start), 1.0],
      [w.sorato!.start + 0.3, 0.55, ease.inOutCubic],
      [w.kimino!.start + 0.7, 0.1, ease.inOutCubic], // focus to her light
      [w.kasanatte!.start - 0.05, 0.16],
      [w.kasanatte!.start + 1.3, 0.78, ease.inOutCubic], // the fence comes over it
      [w.hajimete!.start, 0.85],
      [ub.start, 0.95],
      [ub.start + 0.6, 0.3, ease.outCubic], // heart pulled away, the fence goes soft
      [w.hakanai!.start + 0.4, 0.72, ease.inOutCubic],
      [w.sabishii!.start, 0.62],
      [this.ctx.end, 0.32, ease.inOutQuad],
    ];
  }

  /** First time (at 5 ms resolution) the glyph's sung progress satisfies `ok`. */
  scan(line: Line, li: number, ok: (k: number) => boolean) {
    for (let t = line.start - 0.05; t < line.end + 0.5; t += 0.005) if (ok(glyphStates(line, t)[li]!.k)) return t;
    return line.end;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const u = this.pass.u;
    const w = this.w;
    const S = this.ctx.start, E = this.ctx.end;

    const track = keys(t, this.trackKeys);
    const cool = keys(t, [[w.hakanai!.start - 1.2, 0], [w.sabishii!.start, 0.65, ease.inOutQuad], [E, 1, ease.inOutQuad]]);
    let focus = keys(t, this.focusKeys);
    // fragile: the focus can't settle at the end
    focus += 0.06 * Math.sin(t * 2.1) * Math.sin(t * 0.77 + 1.0) * prog(t, w.hakanai!.start, w.hakanai!.end);
    focus = clamp(focus);
    const invFar = 1 / 40, invNear = 1 / (Z0 + 0.12);
    u.uTrack!.value = track;
    u.uInvZf!.value = lerp(invFar, invNear, focus);
    u.uBgBlur!.value = lerp(0.35, 1.0, focus);
    u.uCool!.value = cool;
    u.uTime!.value = t;
    u.uBgShift!.value = (track - this.trackKeys[0]![1]) * 250 * 0.05;
    u.uLights!.value = lerp(0.35, 0.95, prog(t, w.shizumi!.start, E));
    // the sun sinks through the verse and is gone by 儚い
    const sunY = keys(t, [[S, 470], [w.shizumi!.start, 520, ease.inOutQuad], [w.kimino!.start, 640, ease.inOutQuad], [w.ubatta!.start, 735, ease.inOutQuad], [w.hakanai!.end, 900, ease.inQuad]]);
    (u.uSun!.value as number[])[0] = 470 - (u.uBgShift!.value as number) * 0.6;
    (u.uSun!.value as number[])[1] = sunY;
    u.uSunR!.value = lerp(62, 96, focus * 0.6 + 0.4);
    // the presence: arrives on 君の, overlaps the fence on 重なっていた, flares as the glyphs fly in,
    // then thins and goes out
    const ub = w.ubatta!;
    const flare = prog(t, ub.start, ub.start + 0.6, ease.outQuad) * (1 - prog(t, ub.end - 0.2, ub.end + 1.4, ease.inOutQuad));
    const presI = keys(t, [[w.kimino!.start - 0.2, 0], [w.kimino!.end + 0.8, 0.75, ease.inOutQuad], [w.kasanatte!.start + 1.0, 1.0], [ub.start, 0.85], [w.hakanai!.end, 0.5], [w.sabishii!.end, 0.22], [E - 0.3, 0, ease.inQuad]]);
    const flick = cool > 0.3 ? 1 - 0.35 * cool * (0.5 + 0.5 * Math.sin(t * 9.3) * Math.sin(t * 3.7 + 1)) : 1;
    u.uPresI!.value = (0.75 * presI + 0.35 * flare) * flick;
    u.uPresW!.value = keys(t, [[w.kimino!.start, 70], [w.kasanatte!.start + 1.5, 105], [ub.start + 0.6, 125], [w.hakanai!.start, 90], [E, 38]]);
    (u.uPres!.value as number[])[0] = keys(t, [[w.kimino!.start, 560], [w.kasanatte!.end, 700], [ub.end, 650], [E, 600]]);
    (u.uPres!.value as number[])[1] = keys(t, [[w.kimino!.start, 520], [w.kasanatte!.end, 480], [E, 470]]);
    u.uFlare!.value = flare;
    const posts = u.uPost!.value as number[];
    for (let i = 0; i < 4; i++) posts[i] = this.posts[i] ?? -99;

    // glyphs
    const c = this.text.ctx;
    this.text.clear();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const cells = this.cellBuf;
    cells.fill(0);
    let nc = 0;
    const pres = { x: (u.uPres!.value as number[])[0]!, y: (u.uPres!.value as number[])[1]! };
    const invZf = u.uInvZf!.value as number;
    for (const p of this.placed) {
      const line = this.lines[p.line]!;
      const next2 = this.lines[p.line + 2];
      let alpha = prog(t, line.start - 0.9, line.start - 0.1, ease.outCubic);
      if (next2 && p.pull === Infinity) alpha *= 1 - prog(t, next2.start - 1.1, next2.start - 0.2, ease.inOutQuad);
      if (alpha <= 0.002) continue;
      const pos = project(A * p.k, YOFF + A * p.l, track);
      alpha *= 1 - prog(pos.x, 1660, 1800);
      alpha *= prog(pos.x, 110, 220);
      if (alpha <= 0.002) continue;
      const gk = t >= p.tDone ? 1 : t >= p.tOn ? clamp((t - p.tOn) / Math.max(1e-3, p.tDone - p.tOn)) : 0;
      const singing = gk > 0 && gk < 1;
      const scale = Z0 / pos.z;
      const cellPx = A * FOC / pos.z;
      const blurPx = KB * Math.abs(1 / pos.z - invZf);
      let x = pos.x, y = pos.y, size = GLYPH * scale, blur = gk > 0 ? 0 : Math.min(7, blurPx * 0.4);
      let glow = singing ? 1.0 : gk >= 1 ? 0.32 : 0;
      // pulled out of the cell into the light
      // pulled out of the cell: it unhooks, shrinks back through the wire into a point of light,
      // and drifts into the presence behind the fence
      const dt = t - p.pull;
      let pu = 0;
      if (dt > 0) {
        const pop = prog(dt, 0, 0.3);
        const shrink = prog(dt, 0.22, 0.85, ease.inOutQuad);
        const go = prog(dt, 0.3, 2.1, ease.inOutCubic);
        pu = Math.max(pop, shrink);
        const tx = pres.x + (hash(p.g.li, p.line, 1) - 0.5) * 70;
        const ty = pres.y + (hash(p.g.li, p.line, 2) - 0.5) * 380;
        const arc = Math.sin(Math.PI * go) * (40 + 90 * hash(p.g.li, p.line, 3));
        x = lerp(pos.x, tx, go);
        y = lerp(pos.y, ty, go) - arc;
        size *= (1 + 0.14 * Math.sin(Math.PI * pop)) * lerp(1, 0.22, shrink);
        blur = 4.5 * shrink;
        alpha *= 1 - prog(go, 0.75, 1);
        const light = alpha * (0.4 * Math.sin(Math.PI * pop) + 1.6 * shrink);
        if (nc < MAXCELLS && light > 0.01) { cells.set([x, y, light, 16 + 30 * (1 - shrink)], nc * 4); nc++; }
        // the empty cell keeps a short afterglow
        if (nc < MAXCELLS && dt < 0.6) { cells.set([pos.x, pos.y, 0.7 * (1 - dt / 0.6), cellPx], nc * 4); nc++; }
        glow = 0;
      }
      if (alpha <= 0.002) continue;
      if (glow > 0 && nc < MAXCELLS) { cells.set([pos.x, pos.y, glow * alpha, cellPx], nc * 4); nc++; }
      const v = verticalForm(p.g.ch);
      c.save();
      c.globalAlpha = alpha * (gk > 0 ? 1 : 0.34 + 0.1 * focus);
      c.fillStyle = singing ? rgba('ember') : gk >= 1 ? (pu > 0 ? `rgba(255,${Math.round(lerp(238, 214, pu))},${Math.round(lerp(228, 176, pu))},1)` : rgba('moon')) : rgba('fog');
      c.filter = blur > 0.4 ? `blur(${blur.toFixed(1)}px)` : 'none';
      c.font = font(F.mincho(700), size);
      c.translate(x + v.dx * size, y + v.dy * size);
      if (v.rot) c.rotate(v.rot);
      c.fillText(v.ch, 0, 0);
      c.restore();
    }
    u.uCell!.value = cells;

    this.pass.render(renderer, out);
    comp.draw(renderer, this.text.upload(), out);

    // the cut in from the night: a breath of overexposed memory
    const exposure = lerp(1.0, 1.0 + 0.55 * (1 - cool), 1 - prog(t, S, S + 0.9, ease.outCubic)) * lerp(1, 0.86, prog(t, E - 1.2, E, ease.inQuad));
    return { exposure, bloom: 0.65, bloomThreshold: 0.95, halation: 0.22, halationColor: [1.0, 0.42, 0.25], grain: 0.035, vignette: 0.45, ca: 0.7 };
  }
}
