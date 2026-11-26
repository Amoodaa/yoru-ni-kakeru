// The wind scene's sky: night above the city, a thick advected fog that tears open to an immense
// starry sky (a milky way band, two star layers), the city's lights far below under a sea of fog,
// and the glow of the two lights.
export const WIND_SKY = /* glsl */ `
uniform float uHorizon, uTime, uFog, uClear, uStars, uSea, uGlow;
uniform vec2 uTear;            // centre of the tear, aspect units
uniform vec4 uHead0, uHead1;   // screen px (x, y down), radius px, intensity
uniform vec3 uHeadCol0, uHeadCol1;
const float A = 16.0 / 9.0;

// a star layer on a grid of n cells per unit; px-sized points (logical px), dens = fraction lit
vec3 starLayer(vec2 q, float n, float dens, float seed, float boost) {
  vec2 g = q * n;
  vec2 cell = floor(g);
  vec2 rnd = hash22(cell + seed);
  vec2 c0 = cell + 0.15 + 0.7 * hash22(cell + seed + 17.0);
  float sd = length(g - c0) / n * 1080.0;                 // logical px from the star
  float on = step(1.0 - dens, rnd.x);
  float big = pow(rnd.y, 5.0);
  float tw = 0.75 + 0.25 * sin(uTime * (1.2 + 2.5 * rnd.y) + rnd.x * 60.0);
  float core = exp(-sd * sd * mix(1.5, 0.35, big));
  vec3 tint = mix(C_MOON, mix(C_FOG, C_EMBER, step(0.5, hash12(cell + seed + 3.0))), 0.35 * rnd.y);
  return tint * core * on * tw * mix(0.28, 2.4, big) * boost;
}

float band(float f, float a, float b, float w) { w = max(w, 1e-4); return sat((min(f + w, b) - max(f - w, a)) / (2.0 * w)); }

vec3 headGlow(vec4 hd, vec3 c) {
  if (hd.w <= 0.0) return vec3(0.0);
  float r = length(FRAG_PX - vec2(hd.x, 1080.0 - hd.y));
  float R = hd.z;
  return c * hd.w * (exp(-(r * r) / (R * R)) * 1.4 + 0.09 * exp(-r / (R * 3.5)));
}

void main() {
  vec2 p = vec2((vUv.x - 0.5) * A, vUv.y);
  float h = p.y - uHorizon;

  // the night sky
  vec3 col = mix(C_HAZE * 0.2 + C_DUSK * 0.2, C_DUSK * 0.38, smoothstep(0.0, 0.14, h));
  col = mix(col, C_NIGHT * 0.8, smoothstep(0.12, 0.8, h));
  vec2 s = vec2(p.x, h);
  // the milky way: a soft diagonal band with dust lanes
  vec2 m = rot2(0.5) * (s - vec2(0.25, 0.42));
  float bw = exp(-m.y * m.y * 16.0);
  float cl = fbm(m * vec2(2.0, 5.0) + 3.0, 5) * 0.5 + 0.5;
  float dust = smoothstep(0.0, 0.4, fbm(m * vec2(4.5, 10.0) - 7.0, 4));
  vec3 mw = (C_FOG * 0.15 + C_HAZE * 0.12 + C_EMBER * 0.025) * bw * cl * cl * (1.0 - 0.75 * dust * bw);
  float skyVis = smoothstep(-0.01, 0.1, h);
  col += mw * uStars * skyVis;
  vec3 st = starLayer(s, 70.0, 0.1 + 0.25 * bw, 1.0, 1.0) + starLayer(s + 0.37, 160.0, 0.05 + 0.3 * bw * (1.0 - dust), 9.0, 0.6);
  col += st * uStars * skyVis;

  // the city far below, a plane of lights in perspective
  if (h < 0.0) {
    float d = max(-h, 1e-3);
    vec2 g = vec2(p.x / d, 1.0 / d) * 0.9;
    vec2 fw = max(fwidth(g), vec2(1e-4)) * PX_SCALE;       // cells per logical px
    vec2 cell = floor(g);
    vec2 c0 = cell + 0.2 + 0.6 * hash22(cell + 5.0);
    vec2 dd = (g - c0) / fw;
    float lit = step(0.62, hash12(cell + 2.0)) * (0.5 + 0.5 * sin(uTime * (0.5 + hash12(cell + 4.0)) + hash12(cell) * 30.0) * step(0.85, hash12(cell + 6.0)) + 0.5);
    float pt = exp(-dot(dd, dd) * 0.9) * lit;
    float far = smoothstep(0.25, 0.9, max(fw.x, fw.y));
    vec3 lc = mix(C_EMBER, C_MOON, step(0.7, hash12(cell + 8.0))) * 1.3;
    vec3 city = mix(lc * pt, mix(C_EMBER, C_MOON, 0.3) * 0.55 * 0.06, far);
    // avenues: warm lines along the depth
    col = C_NIGHT * 0.25 + city * (0.6 + 0.4 * uGlow);
    col = mix(col, C_HAZE * 0.26 + C_DUSK * 0.12 + C_EMBER * 0.04, exp(-d * 9.0));   // distance haze at the horizon
  }

  col += (C_HAZE * 0.1 + C_EMBER * 0.025) * exp(-abs(h) * 28.0);   // a soft glow along the horizon

  // fog: fbm advected by a slower fbm, drifting with the wind
  float tt = uTime;
  vec2 fp = vec2(p.x, h) * vec2(1.0, 1.8);
  vec2 w = vec2(fbm(vec3(fp * 1.1, tt * 0.05), 3), fbm(vec3(fp * 1.1 + 5.2, tt * 0.05 + 3.0), 3));
  float f = fbm(fp * 1.5 + 0.35 * w + vec2(-tt * 0.06, tt * 0.01), 5);
  float f2 = fbm(fp * 3.5 + 0.6 * w + vec2(-tt * 0.12, 0.0), 3);
  float dens = sat(uFog * (0.93 + 0.45 * f + 0.12 * f2));
  // the tear: a hole that opens from uTear, its edge ragged by the same noise
  float r = length((p - uTear) * vec2(0.8, 1.25));
  float edge = r + 0.24 * f + 0.08 * f2;
  float open = smoothstep(uClear - 0.12, uClear + 0.1, edge);
  open = mix(1.0, open, smoothstep(0.0, 0.2, uClear));
  dens *= open;
  // after it clears: a sea of fog over the city below, and thin wisps
  float sea = smoothstep(0.04, -0.14, h) * sat(0.55 + 0.6 * f) * uSea;
  float wisp = smoothstep(0.15, 0.6, f2 + 0.4 * f) * 0.18 * uSea * smoothstep(0.5, 0.0, h);
  float D = max(max(dens, sea), wisp);
  vec3 fogC = mix(C_HAZE * 0.36 + C_EMBER * 0.07 * uGlow, C_FOG * 0.26 + C_DUSK * 0.12, smoothstep(-0.25, 0.45, h));
  fogC *= 0.86 + 0.24 * sat(0.5 + f) + 0.06 * f2;
  // the torn edge catches the starlight
  fogC += C_MOON * 0.06 * (1.0 - smoothstep(0.0, 0.3, edge - uClear)) * step(0.001, uClear);
  col = mix(col, fogC, D);

  col += headGlow(uHead0, uHeadCol0) + headGlow(uHead1, uHeadCol1);
  fragColor = vec4(col, 1.0);
}`;
