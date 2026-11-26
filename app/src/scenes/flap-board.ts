// The split-flap departure board of the `flap` scene: layout constants shared with flap.ts, the glyph
// atlas, the painted labels, and the fullscreen shader that renders the board in perspective.
// Board units: one wide flap module is 1.0 wide; y runs down from the top of the board.
import * as THREE from 'three';
import { SCALE } from '../engine/gl';
import { F, font } from '../engine/type';

export const NCOL = 25;
export const NROW = 8;
export const ROWP = 1.62; // row pitch
export const HEAD = 1.3; // header band above row 0
export const NX = 0.64; // narrow (digit) module pitch
/** Board rectangle (x0, y0, x1, y1). */
export const BOARD = [-1.0, -0.3, 25.05, 14.86] as const;

/** Column groups: time (5 narrow), type (2), destination (16), platform (2 narrow). */
export const COL = { time: 0, type: 5, dest: 7, plat: 23 } as const;
export const isNarrow = (c: number) => c < 5 || c >= 23;
/** Centre x of column c. */
export function colX(c: number) {
  if (c < 5) return (c + 0.5) * NX;
  if (c < 7) return 3.75 + (c - 5) + 0.5;
  if (c < 23) return 6.3 + (c - 7) + 0.5;
  return 22.85 + (c - 23 + 0.5) * NX;
}
export const rowY = (r: number) => HEAD + (r + 0.5) * ROWP;

// ---- glyph atlas ----
export const HIRA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽっゃゅょ';
export const KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
export const DIGITS = '0123456789';
export const LATIN = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const PUNCT = ':-・→';
const SLOT_W = 112, SLOT_H = 154, GRID = 16;

export class Atlas {
  index = new Map<string, number>();
  texture: THREE.CanvasTexture;
  constructor(extra: string) {
    const chars = [...new Set([...HIRA, ...KATA, ...DIGITS, ...LATIN, ...PUNCT, ...extra])].filter((c) => c.trim());
    if (chars.length >= GRID * GRID) throw new Error(`flap atlas overflow: ${chars.length}`);
    const sw = SLOT_W * SCALE, sh = SLOT_H * SCALE;
    const cv = document.createElement('canvas');
    cv.width = sw * GRID;
    cv.height = sh * GRID;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const mincho = font(F.mincho(700), Math.round(sw * 0.76));
    const gothic = font(F.gothic(700), Math.round(sh * 0.6));
    // baseline that centres an ideograph's ink box in the slot, per font
    const base = (f: string, ref: string) => {
      c.font = f;
      const m = c.measureText(ref);
      return (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    };
    const bM = base(mincho, '永'), bG = base(gothic, '0');
    chars.forEach((ch, i) => {
      const slot = i + 1; // slot 0 stays blank
      const x = (slot % GRID) * sw + sw / 2, y = Math.floor(slot / GRID) * sh + sh / 2;
      const g = /[0-9A-Z:\-→]/.test(ch);
      c.font = g ? gothic : mincho;
      c.fillText(ch, x, y + (g ? bG : bM));
      this.index.set(ch, slot);
    });
    this.texture = new THREE.CanvasTexture(cv);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.flipY = false;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = 8;
  }
  g(ch: string) { return ch === ' ' ? 0 : this.index.get(ch) ?? 0; }
}

/** Painted labels on the board housing (header captions, rules), in board space. Alpha only. */
export function paintTexture() {
  const PPU = 64 * SCALE;
  const [x0, y0, x1, y1] = BOARD;
  const cv = document.createElement('canvas');
  cv.width = Math.round((x1 - x0) * PPU);
  cv.height = Math.round((y1 - y0) * PPU);
  const c = cv.getContext('2d')!;
  c.scale(PPU, PPU);
  c.translate(-x0, -y0);
  c.fillStyle = '#fff';
  c.textBaseline = 'middle';
  const label = (s: string, x: number, align: CanvasTextAlign, size = 0.36, track = 0.12) => {
    c.font = font(F.gothic(700), size);
    c.textAlign = align;
    (c as any).letterSpacing = `${track}px`;
    c.fillText(s, x, 0.78);
  };
  label('時刻', 1.6, 'center');
  label('種別', 4.75, 'center');
  label('行先', 6.35, 'left');
  label('番線', 23.49, 'center');
  label('夜行列車　発車案内', 22.3, 'right', 0.3, 0.1);
  // a thin rule under the header
  c.fillRect(-0.4, 1.12, 24.9, 0.018);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export const BOARD_GLSL = /* glsl */ `
uniform sampler2D uAtlas, uState, uPaint;
uniform vec3 uCam;          // look-at point on the board (x, y) and camera distance
uniform vec3 uRot;          // pitch, yaw, roll
uniform float uLight, uTubes, uTime;
uniform float uRowLight[8], uRowWarm[8], uRowLamp[8];

const float NX = ${NX.toFixed(3)}, ROWP = ${ROWP.toFixed(3)}, HEAD = ${HEAD.toFixed(3)}, HH = 0.6, FOV = 1.8;
const vec4 BOARD = vec4(${BOARD.map((v) => v.toFixed(3)).join(',')});
const vec3 CARD = vec3(0.020, 0.021, 0.029);
const vec3 METAL = vec3(0.0042, 0.0046, 0.0068);

vec2 gdx, gdy;

int colAt(float x, out float cc, out float hw) {
  hw = 0.0; cc = 0.0;
  if (x >= 0.0 && x < 5.0 * NX) { float i = floor(x / NX); cc = (i + 0.5) * NX; hw = 0.265; return int(i); }
  if (x >= 3.75 && x < 5.75) { float i = floor(x - 3.75); cc = 3.75 + i + 0.5; hw = 0.445; return 5 + int(i); }
  if (x >= 6.3 && x < 22.3) { float i = floor(x - 6.3); cc = 6.3 + i + 0.5; hw = 0.445; return 7 + int(i); }
  if (x >= 22.85 && x < 22.85 + 2.0 * NX) { float i = floor((x - 22.85) / NX); cc = 22.85 + (i + 0.5) * NX; hw = 0.265; return 23 + int(i); }
  return -1;
}

// flap angle (0 = upright, PI = down) against flip phase; gravity accelerates it, then it clatters
float flapAngle(float ph) {
  if (ph <= 0.0) return 0.0;
  if (ph < 1.0) return PI * pow(ph, 1.7);
  float b = clamp((ph - 1.0) / 0.5, 0.0, 1.0);
  return PI - 0.3 * abs(sin(b * TAU * 1.5)) * (1.0 - b) * (1.0 - b);
}

float glyphA(float g, vec2 c) {
  if (g < 0.5) return 0.0;
  float gi = floor(g + 0.5);
  vec2 slot = vec2(mod(gi, 16.0), floor(gi / 16.0));
  vec2 uv = (slot + vec2(clamp(c.x / 0.9 + 0.5, 0.01, 0.99), clamp(0.5 - c.y / 1.24, 0.01, 0.99))) / 16.0;
  return textureGrad(uAtlas, uv, gdx, gdy).a;
}

// a half card's face at card coords c (y up): matte charcoal plastic with its printed glyph
vec3 face(float g, vec3 tint, vec2 c, float hw, float s) {
  float yy = c.y / HH;
  float sheen = s > 0.0 ? 1.16 - 0.2 * yy : 0.84 + 0.14 * yy;
  float edge = smoothstep(hw, hw - 0.09, abs(c.x));
  vec3 base = CARD * sheen * mix(0.7, 1.0, edge);
  return mix(base, tint, glyphA(g, c));
}

float box1(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }

vec3 cellCol(vec2 q, float hw, float gP, float gN, vec3 tP, vec3 tN, float th, vec2 aa, out float cov) {
  float ct = cos(th), st = sin(th);
  float ye = HH * ct;
  const float GAPH = 0.008, R = 0.045;
  float mT = box1(sdBox(q - vec2(0.0, HH * 0.5 + GAPH * 0.5), vec2(hw, HH * 0.5 - GAPH * 0.5) - R) - R, aa.x);
  float mB = box1(sdBox(q - vec2(0.0, -HH * 0.5 - GAPH * 0.5), vec2(hw, HH * 0.5 - GAPH * 0.5) - R) - R, aa.x);
  vec3 top = face(gN, tN, q, hw, 1.0);
  vec3 bot = face(gP, tP, q, hw, -1.0);
  if (ct > 0.0) top *= 1.0 - 0.45 * st * exp(-max(q.y - ye, 0.0) / 0.07);
  else bot *= 1.0 - 0.75 * st * exp(-max(ye - q.y, 0.0) / 0.16);
  vec3 col = top * mT + bot * mB;
  cov = max(mT, mB);
  if (ct > 0.0 && q.y >= 0.0 && ye > 0.002) {
    float v = q.y / ye, pr = 1.0 + 0.16 * st * v;
    vec2 c = vec2(q.x / pr, v * HH);
    float m = box1(abs(q.x) - hw * pr, aa.x) * box1(q.y - ye, aa.y) * (1.0 - box1(q.y - GAPH * 0.5, aa.y));
    vec3 fc = face(gP, tP, c, hw, 1.0) * (1.0 + 1.1 * st);
    col = mix(col, fc, m); cov = max(cov, m);
  } else if (ct <= 0.0 && q.y <= 0.0 && ye < -0.002) {
    float v = q.y / ye, pr = 1.0 + 0.16 * st * v;
    vec2 c = vec2(q.x / pr, -v * HH);
    float m = box1(abs(q.x) - hw * pr, aa.x) * box1(ye - q.y, aa.y) * (1.0 - box1(-GAPH * 0.5 - q.y, aa.y));
    vec3 fc = face(gN, tN, c, hw, -1.0) * mix(0.3, 1.0, -ct);
    col = mix(col, fc, m); cov = max(cov, m);
  }
  // the card's edge catching the overhead light as it passes horizontal
  float pr = 1.0 + 0.16 * st;
  float ed = box1(abs(q.y - ye) - 0.006 * st, aa.y) * box1(abs(q.x) - hw * pr, aa.x);
  col = mix(col, vec3(0.09, 0.09, 0.1), ed * st * st);
  cov = max(cov, ed * st);
  return col;
}

vec3 wall(vec2 p, vec2 aa) {
  vec3 col = C_NIGHT * 0.22;
  // three fluorescent tubes hanging above the board
  float glow = 0.0, core = 0.0, fix = 0.0;
  for (int i = 0; i < 3; i++) {
    float cx = 3.6 + float(i) * 8.4;
    float d = sdSegment(p, vec2(cx - 2.8, -2.25), vec2(cx + 2.8, -2.25));
    core = max(core, box1(d - 0.07, max(aa.y, 0.01)));
    glow += exp(-d * 0.9);
    fix = max(fix, box1(sdBox(p - vec2(cx, -2.45), vec2(3.0, 0.12)), aa.y));
  }
  col += vec3(0.75, 0.8, 1.0) * C_FOG * 0.05 * glow * uTubes;
  col = mix(col, vec3(0.006), fix);
  col = mix(col, mix(C_MOON, C_FOG, 0.25) * 4.0 * uTubes + 0.004, core);
  // hanging rods
  for (int i = 0; i < 2; i++) {
    float rx = i == 0 ? 1.2 : 22.8;
    float rod = box1(abs(p.x - rx) - 0.035, aa.x) * step(p.y, BOARD.y) * step(-12.0, p.y);
    col = mix(col, vec3(0.012, 0.012, 0.016) * (0.4 + uLight), rod);
  }
  return col;
}

void main() {
  vec2 sp = (FRAG_PX - vec2(960.0, 540.0)) / 1080.0;
  sp.y = -sp.y;
  mat2 Rp = rot2(uRot.x), Ry = rot2(uRot.y);
  vec3 f0 = vec3(0.0, 0.0, 1.0); f0.yz = Rp * f0.yz; f0.xz = Ry * f0.xz;
  vec3 d = normalize(vec3(rot2(uRot.z) * sp, FOV)); d.yz = Rp * d.yz; d.xz = Ry * d.xz;
  vec3 C = vec3(uCam.xy, 0.0) - f0 * uCam.z;
  vec2 p = (C + d * (-C.z / d.z)).xy;
  vec2 aa = fwidth(p);
  gdx = dFdx(p) * vec2(1.0 / 0.9 / 16.0, -1.0 / 1.24 / 16.0);
  gdy = dFdy(p) * vec2(1.0 / 0.9 / 16.0, -1.0 / 1.24 / 16.0);

  // overhead light: strongest at the top of the board, pooling under the tubes
  float pool = 0.82 + 0.18 * cos((p.x - 3.6) / 8.4 * TAU);
  float lit = uLight * (0.5 + 0.62 * exp(-max(p.y + 0.4, 0.0) / 7.5)) * pool;

  vec3 col = wall(p, aa);
  if (p.x > BOARD.x && p.x < BOARD.z && p.y > BOARD.y && p.y < BOARD.w) {
    // housing: dark painted steel with a faint brushed grain
    float grain = 0.9 + 0.1 * snoise(vec2(p.x * 0.6, p.y * 40.0));
    col = METAL * grain * lit;
    float bev = min(min(p.x - BOARD.x, BOARD.z - p.x), min(p.y - BOARD.y, BOARD.w - p.y));
    col += vec3(0.03) * lit * box1(abs(bev - 0.05) - 0.012, aa.x);
    col *= mix(0.5, 1.0, smoothstep(0.0, 0.3, bev));
    // painted captions
    vec2 puv = (p - BOARD.xy) / (BOARD.zw - BOARD.xy);
    col = mix(col, C_FOG * 0.42 * lit, texture(uPaint, puv).a);

    float ry = (p.y - HEAD) / ROWP;
    float ri = floor(ry);
    if (ri >= 0.0 && ri < 8.0) {
      int r = int(ri);
      float ly = (fract(ry) - 0.5) * ROWP;
      // rails between the rows, top edge lit
      float rail = abs(ly) - (ROWP * 0.5 - 0.06);
      col = mix(col, vec3(0.008, 0.0085, 0.011) * lit, box1(-rail, aa.y));
      col += vec3(0.035) * lit * box1(abs(ly + ROWP * 0.5 - 0.065) - 0.006, aa.y);
      // a warm lamp strip on the rail above a row
      float warm = uRowWarm[r];
      col += C_EMBER * 2.2 * warm * box1(abs(ly + ROWP * 0.5 - 0.035) - 0.018, aa.y) * step(-0.6, p.x) * step(p.x, 24.6);
      // the row's indicator lamp
      vec2 lp = vec2(p.x + 0.5, ly);
      float ld = length(lp);
      float lamp = uRowLamp[r];
      col = mix(col, vec3(0.002), box1(ld - 0.17, aa.x));
      col = mix(col, mix(vec3(0.02, 0.008, 0.005), C_EMBER * 3.2, sat(lamp)) * (1.0 + 0.6 * max(lamp - 1.0, 0.0)), box1(ld - 0.12, aa.x));
      col += C_EMBER * 0.12 * lamp * exp(-ld * 5.0);

      float cc, hw;
      int ci = colAt(p.x, cc, hw);
      if (ci >= 0) {
        vec2 q = vec2(p.x - cc, -ly);
        // module recess around the card, and the hinge brackets either side of the split
        float rec = sdBox(q, vec2(hw + 0.035, HH + 0.04));
        col = mix(col, vec3(0.0012, 0.0013, 0.002) * lit, box1(rec, aa.x));
        float br = box1(sdBox(vec2(abs(q.x) - hw - 0.012, q.y), vec2(0.022, 0.06)), aa.x);
        col = mix(col, vec3(0.03, 0.03, 0.034) * lit, br);

        vec4 s0 = texelFetch(uState, ivec2(ci, r), 0);
        vec3 tP = texelFetch(uState, ivec2(ci, r + 8), 0).rgb;
        vec3 tN = texelFetch(uState, ivec2(ci, r + 16), 0).rgb;
        float rl = uRowLight[r];
        vec3 light = vec3(lit * rl) + vec3(1.0, 0.62, 0.42) * warm * 0.9;
        vec3 cs = vec3(0.0); float cov = 0.0;
        if (s0.z < 0.0) {
          cs = cellCol(q, hw, s0.x, s0.y, tP, tN, PI, aa, cov);
        } else {
          // motion blur of the falling flap: average over the shutter
          for (int k = 0; k < 5; k++) {
            float ph = s0.z + (float(k) / 4.0 - 0.5) * s0.w;
            float cv;
            cs += cellCol(q, hw, s0.x, s0.y, tP, tN, flapAngle(clamp(ph, 0.0, 1.5)), aa, cv);
            cov += cv;
          }
          cs /= 5.0; cov /= 5.0;
        }
        col = col * (1.0 - sat(cov)) + cs * light; // cs is premultiplied by the card coverage
        // a little warm bounce on the cards of the warm row
        col += C_EMBER * 0.012 * warm * exp(-abs(q.y - HH) * 3.0) * sat(cov);
      }
    }
  }
  fragColor = vec4(col, 1.0);
}`;
