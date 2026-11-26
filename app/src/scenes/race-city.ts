// The night city of the two choruses, as one fullscreen shader: a grid of towers traced exactly with a
// 2D DDA through the cells (ray vs box per cell), an open corridor along -z that the camera races down,
// lit windows filtered by their pixel footprint (they average out at a distance and at grazing angles
// instead of aliasing), streets and an avenue of long-exposure traffic at the bottom of the canyon, a
// starry sky with a hint of dawn far ahead, distance haze, and the glow of the two lights.
export const CITY = /* glsl */ `
uniform vec3 uCamPos;
uniform mat3 uCamRot;          // columns: right, up, forward
uniform float uTanH, uAspect, uPixAng;   // tan(fov/2), aspect, radians per logical px
uniform float uTime, uLights, uWarm, uDawn, uFlash, uFogD, uStars, uHaze, uDim, uTraffic;
uniform vec2 uVP;              // the forward vanishing point, uv
uniform vec4 uHead0, uHead1;   // screen px (x, y down), radius px, intensity
uniform vec3 uHeadCol0, uHeadCol1;
uniform vec3 uShade;           // darken behind the lyric: x centre px, half width px, amount

const float CELL = 12.0, INS = 2.5, MAXH = 360.0, TMAX = 2600.0;

// tower height in cell c (0 = no building). Cells x = -1, 0 are the corridor.
float bHeight(vec2 c) {
  if (c.x == -1.0 || c.x == 0.0) return 0.0;
  float ax = c.x < 0.0 ? -c.x - 1.0 : c.x;                    // 1, 2, ... away from the corridor
  if (ax < 9.0 && hash11(c.y * 0.173 + 7.7) < 0.09) return 0.0; // cross streets that open sideways
  if (hash12(c * vec2(0.731, 1.37) + 4.1) < 0.05) return 0.0;  // plazas
  float near = exp(-(ax - 1.0) * 0.3);
  float h = mix(12.0, 38.0, hash12(c + 13.1)) + near * 130.0 * pow(hash12(c + 2.3), 1.4);
  h += step(0.9, hash12(c + 7.9)) * (40.0 + 160.0 * hash12(c + 1.7)) * mix(0.45, 1.0, near);
  return min(floor(h / 3.2) * 3.2 + 1.0, MAXH - 1.0);
}

vec3 sky(vec3 rd, bool stars) {
  float e = rd.y;
  vec3 col = mix(C_HAZE * 0.3 + C_DUSK * 0.15, C_DUSK * 0.42, smoothstep(-0.03, 0.1, e));
  col = mix(col, C_NIGHT * 0.75, smoothstep(0.06, 0.45, e));
  col += C_EMBER * (0.05 + 0.08 * uWarm) * exp(-max(e, 0.0) * 22.0);      // the city's glow on the haze
  // dawn: a thin warm band far ahead, on the horizon
  float fw = pow(max(-rd.z, 0.0), 8.0);
  col += mix(C_ROSE, C_EMBER, smoothstep(-0.01, 0.04, e)) * uDawn * 0.9 * fw * exp(-max(e + 0.005, 0.0) * 22.0);
  col += C_EMBER * uDawn * 0.22 * fw * exp(-max(e, 0.0) * 6.0);
  if (!stars) return col;
  if (!stars) return col;
  // stars on an angular grid; size in px from the angle
  float az = atan(rd.x, -rd.z), el = asin(clamp(e, -1.0, 1.0));
  vec2 g = vec2(az * cos(el), el) * 90.0;
  vec2 cell = floor(g);
  vec2 rnd = hash22(cell + 3.0);
  vec2 c0 = cell + 0.15 + 0.7 * hash22(cell + 11.0);
  float dpx = length(g - c0) / 90.0 / uPixAng;
  float on = step(1.0 - uStars * 0.075, rnd.x);
  float big = pow(rnd.y, 4.0);
  float tw = 0.75 + 0.25 * sin(uTime * (1.0 + 2.0 * rnd.y) + rnd.x * 50.0);
  col += C_MOON * exp(-dpx * dpx * mix(1.6, 0.45, big)) * on * tw * mix(0.3, 2.4, big) * smoothstep(0.02, 0.15, e);
  return col;
}

// filtered 0..1 pulse: inside [a, b] of a unit cell coordinate f, box-blurred by w (cell units)
float band(float f, float a, float b, float w) {
  w = max(w, 1e-4);
  return sat((min(f + w, b) - max(f - w, a)) / (2.0 * w));
}

vec3 facade(vec3 p, vec3 n, vec3 rd, float t, vec2 cell, float h) {
  float bid = hash12(cell + 91.0);
  vec3 base = C_NIGHT * 0.15 + C_DUSK * 0.06 * sat(p.y / 200.0) + C_EMBER * 0.025 * exp(-p.y / 25.0) * (1.0 + uWarm);
  if (n.y > 0.5) {
    // roof: dark, with a few red aviation lights on the tall ones
    vec2 q = p.xz - (cell + 0.5) * CELL;
    float fp = t * uPixAng / max(abs(rd.y), 0.05) / PX_SCALE;
    float corner = length(abs(q) - (CELL * 0.5 - INS - 0.5));
    float blink = step(0.5, fract(uTime * 0.6 + bid * 7.0)) * step(110.0, h);
    return C_NIGHT * 0.2 + C_ROSE * 3.0 * blink * band(corner, -0.35, 0.35, fp);
  }
  float u = abs(n.x) > 0.5 ? p.z : p.x;
  vec2 wq = vec2(u / 1.5, p.y / 2.4);
  vec2 wc = floor(wq), wf = fract(wq);
  float cosI = max(abs(dot(rd, n)), 0.04);
  float fp = t * uPixAng / PX_SCALE;
  float fu = fp / cosI / 1.5, fv = fp / max(sqrt(1.0 - rd.y * rd.y), 0.2) / 2.4;
  float mask = band(wf.x, 0.24, 0.76, fu * 0.7) * band(wf.y, 0.3, 0.8, fv * 0.7);
  float side = n.x * 3.0 + n.z * 5.0;
  float occ = mix(0.05, 0.4, pow(hash12(cell + 5.0 + side), 1.5)) * uLights;
  float hr = hash13(vec3(wc, bid * 97.0 + side));
  float floorOn = step(0.18, hash12(vec2(wc.y, bid * 13.0 + side)));
  float lit = step(hr, occ) * floorOn * step(p.y, h - 2.0);
  float tone = hash13(vec3(wc + 3.0, bid * 31.0));
  vec3 warm = mix(C_EMBER, C_MOON, 0.3), cool = C_FOG * 1.1;
  vec3 wcol = tone < 0.42 ? warm : tone < 0.85 ? cool : C_MOON;
  wcol = mix(wcol, C_EMBER * 1.1, uWarm * 0.55);
  float hi = hash13(vec3(wc + 7.0, bid)); float inten = 0.22 + 0.95 * hi * hi;
  vec3 avgCol = mix(mix(warm, cool, 0.35), C_EMBER, uWarm * 0.55);
  vec3 avg = avgCol * occ * 0.82 * 0.26 * 0.54;
  float far = smoothstep(0.35, 1.1, max(fu, fv));
  vec3 win = mix(wcol * inten * mask * lit, avg, far);
  // a faint vertical edge light on the corners (rim from the city glow)
  return base + win * 1.05;
}

vec3 ground(vec3 p, vec3 rd, float t) {
  float fp = t * uPixAng / max(abs(rd.y), 0.03) / PX_SCALE;
  vec3 col = C_NIGHT * 0.22;
  if (abs(p.x) < 14.5) {
    // the avenue under the corridor: lanes of long-exposure traffic
    float lane = floor((p.x + 14.5) / 2.9);
    float lx = fract((p.x + 14.5) / 2.9);
    float dir = lane < 5.0 ? -1.0 : 1.0;                                   // tail lights one way, head lights back
    float ph = hash11(lane * 3.7 + 1.0);
    float z = p.z / 28.0 + ph * 10.0 + dir * uTime * (1.2 + 0.6 * ph);
    float id = floor(z);
    float on = step(0.25, hash11(id * 1.3 + lane * 7.1));
    float streak = band(fract(z), 0.0, 0.6 + 0.35 * hash11(id + lane), fp / 28.0);
    float lane1 = band(lx, 0.42, 0.58, fp / 2.9 * 0.8);
    vec3 lc = dir < 0.0 ? mix(C_ROSE, C_EMBER, 0.45) * 1.6 : C_MOON * 1.2;
    float avg = 0.16 * 0.5 * 0.75;
    float far = smoothstep(0.3, 1.0, fp / 2.9);
    col += lc * uTraffic * mix(streak * on * lane1, avg, far) * 1.4;
    col += C_EMBER * 0.06 * uTraffic;
  } else {
  vec2 lc = mod(p.xz, CELL);
  vec2 dd = min(lc, CELL - lc);                    // distance to the street centre lines
  float street = max(band(dd.x, -INS * 0.5, INS * 0.5, fp * 0.7), band(dd.y, -INS * 0.5, INS * 0.5, fp * 0.7));
  // lamps every few metres along the streets, and moving traffic dashes
  vec2 cid = floor(p.xz / CELL + 0.5);
  float lamp = band(fract(p.z / 4.0), 0.4, 0.6, fp / 4.0) * band(dd.x, -0.6, 0.6, fp) + band(fract(p.x / 4.0), 0.4, 0.6, fp / 4.0) * band(dd.y, -0.6, 0.6, fp);
  float dash = band(fract(p.z / 17.0 + uTime * 1.3 * (hash11(cid.x) - 0.5) + hash11(cid.x * 3.1)), 0.0, 0.5, fp / 17.0) * band(dd.x, -0.5, 0.5, fp);
  dash += band(fract(p.x / 17.0 + uTime * 1.3 * (hash11(cid.y) - 0.5) + hash11(cid.y * 2.3)), 0.0, 0.5, fp / 17.0) * band(dd.y, -0.5, 0.5, fp);
  vec3 sc = mix(C_EMBER, C_MOON, 0.15) * mix(1.0, 1.25, uWarm);
  col += sc * (0.18 * street + 1.1 * lamp + 0.9 * dash) * uTraffic;
  }
  return col;
}

vec3 shade(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 rd = normalize(uCamRot * vec3(ndc.x * uAspect * uTanH, ndc.y * uTanH, 1.0));
  vec3 ro = uCamPos;
  vec3 rs = vec3(abs(rd.x) < 1e-5 ? 1e-5 : rd.x, abs(rd.y) < 1e-5 ? 1e-5 : rd.y, abs(rd.z) < 1e-5 ? 1e-5 : rd.z);
  vec3 inv = 1.0 / rs;

  float t0 = 0.0;
  bool skyOnly = false;
  if (ro.y > MAXH) { if (rd.y >= 0.0) skyOnly = true; else t0 = (ro.y - MAXH) / -rd.y; }
  float tGround = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float tEnd = min(tGround, TMAX);
  if (rd.y > 0.0) tEnd = min(tEnd, (MAXH - ro.y) * inv.y);

  int kind = 0;    // 0 sky, 1 building, 2 ground
  float th = 1e9;
  vec3 n = vec3(0.0);
  vec2 hc = vec2(0.0);
  float hh = 0.0;
  if (!skyOnly && t0 < tEnd) {
    vec2 o = ro.xz;
    vec2 d = rs.xz;
    vec2 cell = floor((o + d * t0) / CELL);
    vec2 st = sign(d);
    vec2 tD = abs(CELL / d);
    vec2 tM = ((cell + max(st, 0.0)) * CELL - o) / d;
    for (int i = 0; i < 110; i++) {
      float h = bHeight(cell);
      if (h > 0.0) {
        vec3 bmin = vec3(cell.x * CELL + INS, 0.0, cell.y * CELL + INS);
        vec3 bmax = vec3((cell.x + 1.0) * CELL - INS, h, (cell.y + 1.0) * CELL - INS);
        vec3 ta = (bmin - ro) * inv, tb = (bmax - ro) * inv;
        vec3 tn3 = min(ta, tb), tf3 = max(ta, tb);
        float tn = max(max(tn3.x, tn3.y), tn3.z), tf = min(min(tf3.x, tf3.y), tf3.z);
        if (tn <= tf && tn > 0.0 && tn < tEnd) {
          kind = 1; th = tn; hc = cell; hh = h;
          n = tn == tn3.x ? vec3(-st.x, 0.0, 0.0) : tn == tn3.y ? vec3(0.0, -sign(rs.y), 0.0) : vec3(0.0, 0.0, -st.y);
          break;
        }
      }
      float tx = min(tM.x, tM.y);
      if (tx > tEnd) break;
      if (tM.x < tM.y) { tM.x += tD.x; cell.x += st.x; } else { tM.y += tD.y; cell.y += st.y; }
    }
    if (kind == 0 && tGround < TMAX) { kind = 2; th = tGround; }
  }

  vec3 col;
  float tt = kind == 0 ? TMAX : th;
  if (kind == 1) col = facade(ro + rd * th, n, rd, th, hc, hh);
  else if (kind == 2) col = ground(ro + rd * th, rd, th);
  else col = sky(rd, true);

  // haze: distance fog that takes the sky's colour toward the horizon and the city glow low down
  if (kind != 0) {
    vec3 hz = sky(vec3(rd.x, max(rd.y, 0.0) * 0.6, rd.z), false) * 0.75;
    hz = mix(hz, C_HAZE * 0.5 + C_EMBER * 0.08, uHaze * 0.6);
    hz += (C_EMBER * 0.5 + C_ROSE * 0.2) * uDawn * pow(max(-rd.z, 0.0), 4.0) * 0.45;
    float fa = 1.0 - exp(-tt * uFogD);
    col = mix(col, hz, fa);
  }
  // the whole frame hazes over (the end of the final chorus streams into fog)
  col = mix(col, mix(C_HAZE * 0.45, C_FOG * 0.4, sat(uv.y)) + C_MOON * 0.25 * exp(-length((uv - uVP) * vec2(uAspect, 1.0)) * 3.0), uHaze * 0.85);
  return col;
}

vec3 headGlow(vec4 hd, vec3 c) {
  if (hd.w <= 0.0) return vec3(0.0);
  float r = length(FRAG_PX - vec2(hd.x, 1080.0 - hd.y));
  float R = hd.z;
  return c * hd.w * (exp(-(r * r) / (R * R)) * 1.4 + 0.07 * exp(-r / (R * 3.0)));
}

void main() {
  vec3 col = shade(vUv);
  col += headGlow(uHead0, uHeadCol0) + headGlow(uHead1, uHeadCol1);
  // a blinding flash of white-gold from the vanishing point
  float rv = length((vUv - uVP) * vec2(uAspect, 1.0));
  vec3 gold = mix(C_EMBER, C_MOON, 0.55);
  col += gold * uFlash * (0.22 + 3.5 * exp(-rv * rv * 5.0) + 6.0 * exp(-rv * rv * 60.0));
  col *= 1.0 - uShade.z * (1.0 - smoothstep(0.0, uShade.y, abs(FRAG_PX.x - uShade.x)));
  col *= 1.0 - uDim;
  fragColor = vec4(col, 1.0);
}`;
