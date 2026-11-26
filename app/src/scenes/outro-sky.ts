// The outro's sky: the intro's rooftop, chain-link fence and city (shader code copied from dusk.ts),
// at deep night, plus the two lights, their trails and the constellation they leave behind.
// Trails and constellation points live in sky space: x in aspect units, h = height above the horizon.
export const NP = 64;
export const NC = 6;
/** Trails are tested in chunks of CH segments, skipped when the pixel is outside the chunk's box. */
export const CH = 8;
export const NB = Math.ceil((NP - 1) / CH);

export const OUTRO_SKY = /* glsl */ `
uniform float uHorizon, uRoof, uTime, uTwinkle, uTrail, uCons, uHead;
uniform vec2 uP0[${NP}], uP1[${NP}];
uniform vec4 uB0[${NB}], uB1[${NB}], uCB; // bounding boxes (with the glow's reach) of 8-segment chunks, and of the constellation
uniform vec2 uC0[${NC}];   // the constellation, one chain of stars
uniform vec3 uL0, uL1;      // the two lights: position (sky space) and intensity
const float A = 16.0 / 9.0;

float skyline(float x) {
  float c = floor(x * 11.0);
  float h = 0.012 + 0.05 * pow(hash11(c * 1.7 + 3.1), 2.0);
  return h + 0.07 * step(0.88, hash11(c + 11.3));
}

float fence(vec2 p, float base, float top) {
  if (p.y < base || p.y > top + 0.01) return 0.0;
  float k = 26.0;
  vec2 q = vec2(p.x + p.y, p.x - p.y) * k;
  vec2 g = abs(fract(q) - 0.5);
  vec2 w = fwidth(q) * 0.9;
  float mesh = max(1.0 - smoothstep(0.0, w.x, 0.5 - g.x), 1.0 - smoothstep(0.0, w.y, 0.5 - g.y));
  mesh *= step(p.y, top);
  float px = abs(fract(p.x * 1.6 + 0.3) - 0.5) / 1.6;
  float post = 1.0 - smoothstep(0.0035, 0.0035 + fwidth(p.x) * 1.5, px);
  float rail = 1.0 - smoothstep(0.003, 0.003 + fwidth(p.y) * 1.5, abs(p.y - top));
  return max(mesh * 0.85, max(post, rail));
}

vec2 pt(int k, int i) { return k == 0 ? uP0[i] : uP1[i]; }

// nearest point of trail k drawn so far: (distance, index along the trail)
vec2 trail(int k, vec2 q) {
  float best = 1e9, bs = 0.0;
  for (int c = 0; c < ${NB}; c++) {
    if (float(c * ${CH}) >= uHead) break;
    vec4 bb = k == 0 ? uB0[c] : uB1[c];
    if (q.x < bb.x || q.y < bb.y || q.x > bb.z || q.y > bb.w) continue;
    for (int j = 0; j < ${CH}; j++) {
    int i = c * ${CH} + j;
    if (i >= ${NP - 1} || float(i) >= uHead) break;
    vec2 a = pt(k, i);
    vec2 b = float(i + 1) > uHead ? mix(a, pt(k, i + 1), fract(uHead)) : pt(k, i + 1);
    vec2 pa = q - a, ba = b - a;
    float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
    float d = length(pa - ba * hh);
    if (d < best) { best = d; bs = float(i) + hh * min(1.0, uHead - float(i)); }
    }
  }
  return vec2(best, bs);
}

vec3 light(vec3 L, vec3 c, vec2 q) {
  float d = length(q - L.xy);
  return c * L.z * (2.6 * exp(-pow(d / 0.0055, 2.0)) + 0.32 * exp(-d * 42.0) + 0.07 * exp(-d * 7.0));
}

void main() {
  vec2 p = vec2((vUv.x - 0.5) * A, vUv.y);
  float h = p.y - uHorizon;
  vec2 q = vec2(p.x, h);

  // deep night sky (the intro's night gradient, a shade darker)
  vec3 col = mix(C_HAZE * 0.26, C_DUSK * 0.42, smoothstep(0.0, 0.1, h));
  col = mix(col, C_NIGHT * 0.85, smoothstep(0.08, 0.6, h));
  col += C_EMBER * 0.06 * exp(-max(h, 0.0) * 16.0);

  // stars
  vec2 sg = vec2(p.x, h) * 64.0;
  vec2 cell = floor(sg);
  vec2 rnd = hash22(cell);
  vec2 c0 = cell + 0.2 + 0.6 * hash22(cell + 7.0);
  float sd = length(sg - c0) * 15.0;
  float on = smoothstep(0.93, 0.94, rnd.x);
  float tw = 0.7 + 0.3 * sin(uTime * (1.3 + 2.7 * rnd.y) + rnd.x * 40.0) + uTwinkle * 0.6 * rnd.y;
  float big = pow(rnd.y, 3.0);
  float star = exp(-sd * sd * mix(1.4, 0.35, big)) * on * tw * smoothstep(0.01, 0.12, h);
  col += C_MOON * star * mix(0.35, 1.8, big);

  // the new constellation: hairlines between its stars, then the stars
  if (uCons > 0.0 && q.x > uCB.x && q.y > uCB.y && q.x < uCB.z && q.y < uCB.w) {
    float ln = 0.0;
    vec3 sc = vec3(0.0);
    for (int i = 0; i < ${NC}; i++) {
      vec2 a = uC0[i];
      float d = length(q - a);
      // stars left by the ember trail keep a little of its warmth; the last one is where they met
      vec3 tint = i == ${NC - 1} ? C_MOON * 1.5 : i % 2 == 0 ? mix(C_MOON, C_EMBER, 0.45) : C_MOON;
      sc += tint * (exp(-pow(d / 0.003, 2.0)) * 1.15 + 0.045 * exp(-d * 60.0));
      if (i < ${NC - 1}) {
        vec2 b = uC0[i + 1];
        float sdl = sdSegment(q, a, b);
        float gap = smoothstep(0.012, 0.02, min(d, length(q - b)));
        ln = max(ln, pxLine(sdl / fwidth(p.x), 0.25, 1.25) * gap);
      }
    }
    col += C_FOG * 0.24 * ln * uCons + sc * uCons;
  }

  // the city, windows lit
  float top = uHorizon + skyline(p.x);
  float bld = 1.0 - smoothstep(top - 0.0012, top + 0.0012, p.y);
  vec2 wq = vec2(p.x * 80.0, (p.y - uHorizon) * 64.0);
  vec2 wc = floor(wq), wf = fract(wq);
  float win = step(0.3, wf.x) * step(wf.x, 0.7) * step(0.35, wf.y) * step(wf.y, 0.65);
  float lit = step(hash12(wc + 3.0), 0.13) * step(p.y, top - 0.01);
  vec3 wcol = mix(C_EMBER, C_FOG, step(0.6, hash12(wc + 9.0))) * 0.8;
  col = mix(col, C_NIGHT * 0.7 + wcol * win * lit, bld);

  // light the two lights throw on the roof and the fence
  float g0 = uL0.z * exp(-length(q - uL0.xy) * 9.0), g1 = uL1.z * exp(-length(q - uL1.xy) * 9.0);
  vec3 spill = C_EMBER * g0 + C_MOON * 0.6 * g1;

  float roof = 1.0 - smoothstep(uRoof - 0.0015, uRoof + 0.0015, p.y);
  col = mix(col, C_NIGHT * 0.45 + spill * 0.05, roof);
  float fc = fence(p, uRoof, uRoof + 0.36);
  col = mix(col, C_NIGHT * 0.3 + spill * 0.16, fc * 0.92);

  // the trails: long, tapering, older light fading
  if (uTrail > 0.0 && uHead > 0.0 && true) {
    for (int k = 0; k < 2; k++) {
      vec2 ts = trail(k, q);
      float age = uHead - ts.y;
      float r = 0.0021 * (0.35 + 0.65 * exp(-age / 16.0));
      float b = uTrail * (0.25 + 0.75 * exp(-age / 22.0));
      vec3 tc = k == 0 ? C_EMBER : C_MOON * 0.9;
      col += tc * b * (1.5 * exp(-pow(ts.x / r, 2.0)) + 0.12 * exp(-ts.x * 70.0));
    }
  }

  col += light(uL0, C_EMBER, q) + light(uL1, C_MOON, q);
  fragColor = vec4(col, 1.0);
}`;
