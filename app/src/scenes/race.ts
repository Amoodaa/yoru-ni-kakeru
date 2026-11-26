// The two choruses: racing into the night through a city. One module, two entries (params.n).
// The camera flies down an open corridor between towers of windows (race-city.ts traces the city
// exactly per pixel), above an elevated track, through long-exposure light trails; its speed is
// integrated from the vocal and the beats, so it surges with the voice. Two lights race ahead of it,
// their trails stretching back past the camera.
//
// n = 1 (騒がしい日々に … 二人でいよう, then the talk): the lights run apart in their own lanes, one
// ember low on the left, one moon-pale high on the right. 眩しい明日を: a blinding white-gold flash
// from the vanishing point and a surge of speed. 落ちてゆく前に: the camera pitches down into the
// canyon, toward the avenue of traffic far below, and pulls up on 前に. 僕の手を掴んで: the two lights
// cross to each other and lock into a braided pair that runs together from then on. 溶かす: the
// windows and the trails warm. 日が昇るまで: a thin dawn band appears on the far horizon.
// 二人でいよう: the city decelerates to stillness; the trails shrink back into two hovering lights.
// Through the talk and the silence the frame holds, near-static, drifting, and darkens for the cut.
//
// n = 2 (騒がしい日々に笑えなくなっていた … 終わりへと誘う): the same world, higher and faster, with
// the pair from the start. 綺麗だ: the camera rises above the rooftops and the view opens wide.
// 溢れた涙: light falls through the frame like tears and melts into warm light (溶けていく).
// 終わりへと誘う: everything streams into one vanishing point ahead and the frame hazes over into the
// fog the next scene (wind) starts in.
//
// The lyrics are big vertical Mincho 800 columns, alternating sides around the corridor; each line
// rises out of the depth toward its place and, when the next one comes, flies apart past the camera.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, keys, lerp, prog, pulse, type Key } from '../engine/util';
import { columns, glyphStates, verticalForm } from './_jp';
import { CITY } from './race-city';

type V3 = [number, number, number];
type RGB = [number, number, number];
const ASPECT = W / H;
const add = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

interface Lane { x: number; y: number; dir: number; v: number; period: number; len: number; ph: number; col: RGB; w: number }

export default class Race extends Scene {
  city = new FSPass(CITY, {
    uCamPos: { value: new THREE.Vector3() }, uCamRot: { value: new THREE.Matrix3() },
    uTanH: { value: 0.6 }, uAspect: { value: ASPECT }, uPixAng: { value: 0.001 },
    uTime: { value: 0 }, uLights: { value: 1 }, uWarm: { value: 0 }, uDawn: { value: 0 }, uFlash: { value: 0 },
    uFogD: { value: 0.0011 }, uStars: { value: 1 }, uHaze: { value: 0 }, uDim: { value: 0 }, uTraffic: { value: 1 },
    uVP: { value: new THREE.Vector2(0.5, 0.5) },
    uHead0: { value: new THREE.Vector4() }, uHead1: { value: new THREE.Vector4() },
    uHeadCol0: { value: new THREE.Vector3() }, uHeadCol1: { value: new THREE.Vector3() },
    uShade: { value: new THREE.Vector3() },
  });
  lines3 = new LineBatch(9000);
  lines2 = new LineBatch(3000);
  text = new Layer2D();
  n = 1;
  L: Line[] = [];
  /** anchors (song s), all from the lyrics */
  A: Record<string, number> = {};
  /** distance flown, tabulated from the integrated speed */
  t0 = 0; dt = 1 / 200; dist = new Float64Array(0);
  lanes: Lane[] = [];
  baseY = 46;
  // camera state for the frame (set by camera())
  cp: V3 = [0, 0, 0]; cr: V3 = [1, 0, 0]; cu: V3 = [0, 1, 0]; cf: V3 = [0, 0, -1]; tanH = 0.6; fpx = 900;

  override init() {
    const ly = this.ctx.lyrics;
    this.n = this.ctx.params.n === 2 ? 2 : 1;
    const A = this.A;
    if (this.n === 1) {
      const l15 = ly.get('騒がしい日々に笑えない'), l16 = ly.get('眩しい明日'), l17 = ly.get('落ちてゆく前に'), l18 = ly.get('僕の手を掴んで');
      const l20 = ly.get('溶かすから'), l21 = ly.get('日が昇るまで'), l22 = ly.get('二人でいよう');
      this.L = ly.lines.slice(l15.i, l22.i + 1);
      A.flash = l16.words[2]!.start;                  // 眩しい
      A.fall = l17.words[2]!.start;                   // 落ちてゆく
      A.up = l17.words[3]!.start;                     // 前に
      A.upEnd = l17.end;
      A.hand = l18.words[0]!.start;                   // 僕の
      A.grab = l18.words[2]!.start;                   // 掴んで
      A.grabEnd = l18.words[2]!.end;
      A.melt = l20.words[2]!.start;                   // 溶かすから
      A.dawn = l21.words[2]!.start;                   // 日が
      A.two = l22.start;                              // 二人で
      A.still = l22.end;                              // いよう (end)
      this.baseY = 46;
    } else {
      const l43 = ly.get('笑えなくなっていた'), l44 = ly.get('綺麗だ'), l45 = ly.get('溢れた涙'), l46 = ly.get('笑顔に溶けて');
      const l48 = ly.get('終わりへと誘う');
      this.L = ly.lines.slice(l43.i, l48.i + 1);
      A.first = l43.start;
      A.awe = l44.words[4]!.start;                    // 綺麗だ
      A.aweEnd = l44.end;
      A.tears = l45.words[2]!.start;                  // 溢れた
      A.tearsEnd = l45.end;
      A.melt = l46.words[2]!.start;                   // 溶けていく
      A.meltEnd = l46.end;
      A.end0 = l48.words[2]!.start;                   // 終わりへと
      this.baseY = 112;
    }
    // integrate the speed into the distance flown (a pure function of t, tabulated once)
    this.t0 = this.ctx.start - 3;
    const N = Math.ceil((this.ctx.end + 3 - this.t0) / this.dt);
    this.dist = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) {
      const t = this.t0 + (i - 0.5) * this.dt;
      this.dist[i] = this.dist[i - 1]! + this.speed(t) * this.dt;
    }
    // long-exposure lanes of traffic on other elevated tracks, all running along the corridor
    const rnd = (i: number, k: number) => hash(i, k, this.n * 17);
    for (let i = 0; i < 34; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * lerp(2.5, 11.2, rnd(i, 1));
      const y = this.baseY + lerp(-34, 30, rnd(i, 2)) * (this.n === 2 ? 1.6 : 1);
      const dir = rnd(i, 3) < 0.55 ? -1 : 1;
      const tone = rnd(i, 4);
      const col: RGB = dir < 0 ? (tone < 0.6 ? add(LIN.rose, LIN.ember, 0.5) : LIN.ember) : tone < 0.5 ? LIN.moon : LIN.fog;
      this.lanes.push({ x, y, dir, v: lerp(15, 45, rnd(i, 5)), period: lerp(60, 160, rnd(i, 6)), len: lerp(18, 70, rnd(i, 7)), ph: rnd(i, 8) * 500, col: mul(col, lerp(0.9, 2.2, rnd(i, 9))), w: lerp(0.12, 0.3, rnd(i, 10)) });
    }
  }

  /** Forward speed, m/s: it surges with the voice and the kicks, and follows the story. */
  speed(t: number): number {
    const A = this.A, au = this.ctx.audio;
    const s = this.ctx.start;
    let v: number;
    if (this.n === 1) {
      v = keys(t, [[s, 72], [A.flash! - 0.2, 70], [A.flash! + 0.35, 140, ease.outCubic], [A.flash! + 3.0, 88], [A.fall!, 92], [A.up!, 110], [A.upEnd!, 95], [A.grab!, 100], [A.melt!, 84], [A.dawn!, 76], [A.two!, 68], [A.still! - 0.4, 0, ease.inOutCubic]] as Key[]);
    } else {
      v = keys(t, [[s, 150], [A.awe! - 0.5, 160], [A.awe! + 1.5, 95], [A.tears!, 120], [A.melt!, 135], [A.end0!, 150], [this.ctx.end, 330, ease.inCubic]] as Key[]);
    }
    const drive = 1 + 0.22 * au.env('vocal', t) + 0.14 * au.hit('kick', t, 0.12);
    v *= drive;
    if (this.n === 1) v += 0.9 * prog(t, A.still! - 1, A.still! + 1.5);   // a gentle drift once still
    return v;
  }

  distAt(t: number) {
    const x = (t - this.t0) / this.dt;
    const i = Math.max(0, Math.min(this.dist.length - 2, Math.floor(x)));
    const f = clamp(x - i);
    return this.dist[i]! * (1 - f) + this.dist[i + 1]! * f;
  }

  /** Camera height above the street, and pitch (rad), at t. */
  height(t: number) {
    const A = this.A;
    if (this.n === 1) return this.baseY + keys(t, [[A.fall! - 0.5, 0], [A.up!, -12, ease.inOutQuad], [A.upEnd! + 0.6, 6, ease.inOutCubic], [A.grab!, 2], [A.two!, 4], [A.still! + 2, 8]] as Key[]);
    return this.baseY + keys(t, [[A.awe! - 0.8, 0], [A.awe! + 2.4, 120, ease.inOutCubic], [A.tears! + 0.4, 110], [A.tearsEnd! + 1.2, 20, ease.inOutCubic], [A.end0!, 6], [this.ctx.end, -20, ease.inQuad]] as Key[]);
  }

  /** Where the two lights are at τ (world), and how far joined. */
  heads(tau: number): [V3, V3] {
    const A = this.A;
    const z = -this.distAt(tau) - (this.n === 1 ? 52 : 60);
    const y0 = this.height(tau) - (this.n === 1 ? 5.5 : 7);
    const j = this.n === 2 ? 1 : prog(tau, A.hand!, A.grabEnd!, ease.inOutCubic);
    const r = lerp(2.6, this.n === 2 ? 1.3 : 0.95, j), w = 4.2 * tau;
    const pa: V3 = [r * Math.cos(w), y0 + r * Math.sin(w), z];
    const pb: V3 = [-r * Math.cos(w), y0 - r * Math.sin(w), z];
    if (j < 1) {
      const sa: V3 = [-8.6 + 1.6 * Math.sin(0.9 * tau), y0 - 6 + 1.4 * Math.sin(1.3 * tau + 1), z];
      const sb: V3 = [8.4 + 1.6 * Math.sin(0.8 * tau + 2), y0 + 8 + 1.8 * Math.sin(1.1 * tau), z];
      for (let k = 0; k < 3; k++) { pa[k] = lerp(sa[k]!, pa[k]!, j); pb[k] = lerp(sb[k]!, pb[k]!, j); }
    }
    return [pa, pb];
  }

  camera(t: number) {
    const A = this.A, a = this.ctx.audio;
    const z = -this.distAt(t);
    const y = this.height(t);
    const x = 1.2 * Math.sin(t * 0.37) + 0.6 * Math.sin(t * 0.83 + 1);
    let pitch: number, yaw = 0.025 * Math.sin(t * 0.29 + 0.5), roll = -0.035 * Math.cos(t * 0.37) + 0.01 * Math.sin(t * 1.3);
    let fov: number;
    const v = this.speed(t);
    if (this.n === 1) {
      pitch = keys(t, [[A.fall! - 0.4, -0.06], [A.fall! + 0.9, -0.78, ease.inOutCubic], [A.up! + 0.2, -0.7], [A.upEnd! + 0.5, 0.06, ease.inOutCubic], [A.grab!, -0.04], [A.dawn!, -0.03], [A.two! + 1, 0.035], [A.still! + 1.5, 0.06], [A.still! + 7, 0.3, ease.inOutQuad]] as Key[]);
      roll += keys(t, [[A.fall!, 0], [A.fall! + 1.2, 0.12], [A.upEnd! + 0.6, -0.05], [A.grab!, 0]] as Key[]);
      const calm = prog(t, A.two!, A.still! + 1, ease.inOutQuad);
      roll *= 1 - 0.7 * calm; yaw *= 1 - 0.5 * calm;
      fov = 58 + v * 0.07;
    } else {
      pitch = keys(t, [[A.awe! - 0.8, -0.13], [A.awe! + 2.4, 0.03, ease.inOutCubic], [A.tears! + 0.4, 0.0], [A.tearsEnd! + 1.2, -0.1, ease.inOutCubic], [A.end0!, -0.06], [this.ctx.end, -0.005]] as Key[]);
      roll *= 1 - prog(t, A.end0!, this.ctx.end);
      fov = 62 + v * 0.05 + 16 * prog(t, A.awe! - 0.5, A.awe! + 2.4, ease.inOutCubic) * (1 - prog(t, A.tears!, A.tearsEnd! + 1, ease.inOutQuad));
    }
    fov += 1.6 * a.hit('kick', t, 0.1);
    const cp = Math.cos(pitch);
    const f: V3 = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
    const rl = Math.hypot(f[2], f[0]);
    const r0: V3 = [-f[2] / rl, 0, f[0] / rl];
    const u0: V3 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
    const c = Math.cos(roll), s = Math.sin(roll);
    this.cr = [r0[0] * c + u0[0] * s, r0[1] * c + u0[1] * s, r0[2] * c + u0[2] * s];
    this.cu = [u0[0] * c - r0[0] * s, u0[1] * c - r0[1] * s, u0[2] * c - r0[2] * s];
    this.cf = f;
    this.cp = [x, y, z];
    this.tanH = Math.tan((fov * Math.PI) / 360);
    this.fpx = H / 2 / this.tanH;
  }

  /** World point -> camera space [x, y, depth]. */
  view(p: V3): V3 {
    const d0 = p[0] - this.cp[0], d1 = p[1] - this.cp[1], d2 = p[2] - this.cp[2];
    return [d0 * this.cr[0] + d1 * this.cr[1] + d2 * this.cr[2], d0 * this.cu[0] + d1 * this.cu[1] + d2 * this.cu[2], d0 * this.cf[0] + d1 * this.cf[1] + d2 * this.cf[2]];
  }
  scr(v: V3): [number, number] { return [W / 2 + (v[0] / v[2]) * this.fpx, H / 2 - (v[1] / v[2]) * this.fpx]; }

  /** A world segment, clipped at the near plane, with a world-space width (px clamped). */
  seg3(a: V3, b: V3, wWorld: number, col: RGB, alpha: number, wMax = 40, fogD = 0.0011) {
    let va = this.view(a), vb = this.view(b);
    const near = 0.6;
    if (va[2] < near && vb[2] < near) return;
    if (va[2] < near || vb[2] < near) {
      const k = (near - va[2]) / (vb[2] - va[2]);
      const m: V3 = [lerp(va[0], vb[0], k), lerp(va[1], vb[1], k), near];
      if (va[2] < near) va = m; else vb = m;
    }
    const zm = (va[2] + vb[2]) / 2;
    const w = Math.min(wMax, Math.max(0.7, (wWorld * this.fpx) / zm));
    const fog = Math.exp(-zm * fogD);
    const [ax, ay] = this.scr(va), [bx, by] = this.scr(vb);
    if ((ax < -200 && bx < -200) || (ax > W + 200 && bx > W + 200) || (ay < -200 && by < -200) || (ay > H + 200 && by > H + 200)) return;
    this.lines3.seg2(ax, ay, bx, by, w, col, alpha * fog);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, A = this.A, n1 = this.n === 1;
    this.camera(t);
    const u = this.city.u;
    (u.uCamPos!.value as THREE.Vector3).set(...this.cp);
    const R = this.cr, U = this.cu, Fw = this.cf;
    (u.uCamRot!.value as THREE.Matrix3).set(R[0], U[0], Fw[0], R[1], U[1], Fw[1], R[2], U[2], Fw[2]);
    u.uTanH!.value = this.tanH;
    u.uPixAng!.value = (2 * this.tanH) / H;
    u.uTime!.value = t;

    // story uniforms
    let flash = 0, warm = 0, dawn = 0, haze = 0, dim = 0, traffic = 1, stars = 1;
    if (n1) {
      flash = 0.8 * pulse(t, this.ctx.start, 0.18) + keys(t, [[A.flash! - 0.12, 0], [A.flash! + 0.08, 1.0, ease.outQuad], [A.flash! + 1.6, 0.1, ease.outCubic], [A.flash! + 3.2, 0, ease.inOutQuad]] as Key[]);
      flash += 0.12 * pulse(t, A.grabEnd! - 0.05, 0.25) * (t > A.grabEnd! - 0.05 ? 1 : 0);
      warm = prog(t, A.melt!, A.melt! + 2.2, ease.inOutQuad) * (1 - 0.5 * prog(t, A.still!, A.still! + 4));
      dawn = prog(t, A.dawn! - 0.2, A.dawn! + 3.2, ease.inOutQuad) * (1 - 0.6 * prog(t, A.still! + 1, this.ctx.end));
      dim = 0.62 * prog(t, A.still! + 2, this.ctx.end, ease.inOutQuad);
      traffic = 1 - 0.35 * prog(t, A.two!, A.still! + 2);
    } else {
      flash = 0.6 * pulse(t, this.ctx.start, 0.22) + 0.08 * keys(t, [[A.awe! - 0.1, 0], [A.awe! + 0.5, 1, ease.outQuad], [A.awe! + 3, 0, ease.inOutQuad]] as Key[]);
      warm = 0.25 + 0.75 * prog(t, A.tearsEnd! - 0.5, A.melt! + 2.5, ease.inOutQuad);
      dawn = 0.35 * prog(t, A.awe!, A.awe! + 2.5) * (1 - prog(t, A.tears!, A.melt!));
      haze = prog(t, A.end0! + 0.2, this.ctx.end, ease.inQuad);
      stars = 1 + 0.5 * prog(t, A.awe!, A.awe! + 2.5);
    }
    u.uFlash!.value = flash; u.uWarm!.value = warm; u.uDawn!.value = dawn; u.uHaze!.value = haze; u.uDim!.value = dim;
    u.uTraffic!.value = traffic; u.uStars!.value = stars;
    const fogD = n1 ? 0.0011 : 0.0008;
    u.uFogD!.value = fogD;

    // the vanishing point of the corridor
    const vpv = this.view([this.cp[0], this.cp[1], this.cp[2] - 1e5]);
    const vp = this.scr(vpv);
    (u.uVP!.value as THREE.Vector2).set(vp[0] / W, 1 - vp[1] / H);

    // ---- lines in the world ----
    const lb = this.lines3;
    lb.clear();
    const camZ = this.cp[2];
    const zFar = camZ - 1500, zNear = camZ + 30;
    const laneK = n1 ? 1 - 0.97 * prog(t, A.two! + 1, A.still! + 2.5, ease.inOutQuad) : 1;
    for (const ln of this.lanes) {
      const z0 = ln.ph + ln.dir * ln.v * t;      // lane pattern offset
      const k0 = Math.ceil((zFar - z0) / ln.period), k1 = Math.floor((zNear - z0) / ln.period);
      for (let k = k0; k <= k1; k++) {
        const za = z0 + k * ln.period;
        if (hash(k, ln.ph) < 0.22) continue;
        const zb = za - ln.len;
        // three pieces so the width follows the depth
        for (let q = 0; q < 3; q++) {
          const a0 = lerp(za, zb, q / 3), b0 = lerp(za, zb, (q + 1) / 3);
          const fade = q === 2 ? 0.55 : 1;
          this.seg3([ln.x, ln.y, a0], [ln.x, ln.y, b0], ln.w, ln.col, 0.9 * fade * laneK, 18, fogD);
          this.seg3([ln.x, ln.y, a0], [ln.x, ln.y, b0], ln.w * 3.5, ln.col, 0.07 * fade * laneK, 22, fogD);
        }
      }
    }
    // the elevated track below the camera (n = 1): two faint rails and lamps every 24 m
    if (n1) {
      const ty = this.baseY - 9;
      const rail = mul(LIN.fog, 0.18);
      for (const rx of [-1.7, 1.7]) {
        for (let z = Math.floor(zNear / 40) * 40; z > camZ - 900; z -= 40) this.seg3([rx, ty, z], [rx, ty, z - 40], 0.12, rail, 1, 6, fogD);
        for (let z = Math.floor(zNear / 24) * 24; z > camZ - 900; z -= 24) this.seg3([rx, ty + 0.2, z], [rx, ty + 0.2, z - 0.8], 0.35, mul(add(LIN.ember, LIN.moon, 0.3), 2.2), 1, 14, fogD);
      }
      for (const [rx, ry] of [[-10.5, ty - 12], [10.8, ty + 16]] as [number, number][]) {
        for (let z = Math.floor(zNear / 30) * 30; z > camZ - 900; z -= 30) this.seg3([rx, ry, z], [rx, ry, z - 0.8], 0.4, mul(LIN.fog, 1.4), 1, 14, fogD);
      }
    }
    // the two lights and their long-exposure trails
    const T = n1 ? 1.5 : 1.25, M = 56;
    let cA: RGB = add(LIN.ember, LIN.rose, 0.15), cB: RGB = add(LIN.fog, LIN.moon, 0.5);
    cB = add(cB, add(LIN.ember, LIN.moon, 0.5), warm * 0.7);
    cA = add(cA, add(LIN.ember, LIN.moon, 0.25), warm * 0.4);
    const join = n1 ? prog(t, A.grab! - 0.2, A.grabEnd! + 0.3) : 1;
    let prev: [V3, V3] | null = null;
    for (let i = 0; i <= M; i++) {
      const tau = t - T * (1 - i / M);
      const h = this.heads(tau);
      if (prev) {
        const s = i / M, a = Math.pow(s, 0.7);
        for (let k = 0; k < 2; k++) {
          const c = k === 0 ? cA : cB;
          this.seg3(prev[k]!, h[k]!, 0.16, mul(c, 3.2), a, 9, fogD * 0.5);
          this.seg3(prev[k]!, h[k]!, 0.7, c, 0.18 * a, 30, fogD * 0.5);
        }
        // once joined, a soft shared glow between them
        if (join > 0) {
          const mid = (p: [V3, V3]): V3 => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2, (p[0][2] + p[1][2]) / 2];
          this.seg3(mid(prev), mid(h), 2.4, add(cA, cB, 0.5), 0.04 * a * join, 60, fogD * 0.5);
        }
      }
      prev = h;
    }
    // head glows (in the city shader, so they bloom with it)
    const hh = this.heads(t);
    const headU = [u.uHead0!, u.uHead1!];
    const headC = [u.uHeadCol0!, u.uHeadCol1!];
    const boost = 1 + (n1 ? 0.8 * pulse(t, A.grabEnd! - 0.05, 0.35) * (t > A.grabEnd! - 0.05 ? 1 : 0) : 0);
    for (let k = 0; k < 2; k++) {
      const v = this.view(hh[k]!);
      const c = k === 0 ? cA : cB;
      (headC[k]!.value as THREE.Vector3).set(c[0], c[1], c[2]);
      if (v[2] < 1) { (headU[k]!.value as THREE.Vector4).set(0, 0, 1, 0); continue; }
      const [sx, sy] = this.scr(v);
      const rad = clamp((0.9 * this.fpx) / v[2], 3, 30);
      (headU[k]!.value as THREE.Vector4).set(sx, sy, rad, 1.8 * boost * (1 + 0.4 * audio.env('vocal', t)));
    }

    // ---- 2D light: tears (n = 2), and the final stream into the vanishing point ----
    const l2 = this.lines2;
    l2.clear();
    if (!n1) this.tears(t, l2);
    if (!n1) this.stream(t, l2, vp);

    // lyric layout first (the city shades the column behind it)
    const lay = this.lyricLayout(t);
    (u.uShade!.value as THREE.Vector3).set(lay.cx, lay.hw, 0.42 * lay.a);

    this.city.render(renderer, out);
    lb.render(renderer, out);
    if (l2.count) l2.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    this.lyrics(c, t, vp);
    comp.draw(renderer, this.text.upload(), out);

    const shake = 1.4 * audio.hit('kick', t, 0.08) * (n1 ? 1 - prog(t, A.two!, A.still!) : 1);
    return {
      bloom: 0.9, bloomThreshold: 0.95, bloomRadius: 0.8, halation: 0.28, halationColor: [1.0, 0.45, 0.25], grain: 0.035, vignette: 0.45, ca: 0.9,
      flash: n1 ? 0.25 * Math.max(0, flash - 0.3) : 0.1 * flash, shake: [shake * Math.sin(t * 91), shake * Math.cos(t * 77)],
    };
  }

  /** 溢れた涙: drops of light fall through the frame and melt into warm light as they land. */
  tears(t: number, lb: LineBatch) {
    const A = this.A;
    const t0 = A.tears! - 0.2, span = A.melt! - t0 + 1.2;
    for (let i = 0; i < 170; i++) {
      const tb = t0 + span * Math.pow(hash(i, 1), 1.3);
      const age = t - tb;
      if (age < 0 || age > 3.2) continue;
      const x = 120 + (W - 240) * hash(i, 2);
      const v = lerp(380, 700, hash(i, 3));
      const yLand = H * lerp(0.5, 0.92, hash(i, 4));
      const tLand = (-v + Math.sqrt(v * v + 480 * (yLand + 60))) / 240;
      const ya = Math.min(-60 + v * age + 120 * age * age, yLand);
      const landed = prog(age, tLand, tLand + 1.0, ease.outQuad);
      const k = prog(age, 0, tLand, ease.inQuad);
      const col = add(mul(LIN.moon, 1.5), mul(add(LIN.ember, LIN.moon, 0.2), 2.2), k);
      const a = prog(age, 0, 0.15);
      if (landed <= 0) {
        const len = lerp(50, 110, hash(i, 5)) * (0.6 + 0.4 * k);
        const w = lerp(1.4, 2.6, hash(i, 6));
        for (let q = 0; q < 4; q++) lb.seg2(x, ya - len * (1 - q / 4), x, ya - len * (1 - (q + 1) / 4), w * (0.5 + q * 0.15), col, a * (0.12 + 0.22 * q));
        lb.seg2(x, ya - 1, x, ya + 1, w * 2.2, col, a);
      } else {
        // the melt: a warm bead that swells, softens and fades where the drop landed
        const r = 4 + 26 * landed;
        lb.seg2(x, ya, x, ya + 0.1, r, mul(LIN.ember, 1.2), 0.32 * (1 - landed));
        lb.seg2(x, ya, x, ya + 0.1, r * 0.35, mul(add(LIN.ember, LIN.moon, 0.4), 2), 0.6 * (1 - landed) * (1 - landed));
      }
    }
  }

  /** 終わりへと誘う: streaks from every side stream into one vanishing point. */
  stream(t: number, lb: LineBatch, vp: [number, number]) {
    const A = this.A;
    const a = prog(t, A.end0! - 0.4, A.end0! + 0.6, ease.inOutQuad);
    if (a <= 0) return;
    for (let i = 0; i < 280; i++) {
      const th = hash(i, 11) * Math.PI * 2;
      const rate = lerp(0.6, 1.3, hash(i, 12));
      const ph = (hash(i, 13) + (t - A.end0!) * rate) % 1;
      const r = 1300 * Math.pow(1 - ph, 1.6) + 6;
      const len = r * lerp(0.15, 0.4, hash(i, 14));
      const cx = Math.cos(th), cy = Math.sin(th) * 0.7;
      const col = hash(i, 15) < 0.4 ? mul(LIN.ember, 1.8) : mul(LIN.moon, 1.4);
      const al = a * 0.55 * Math.min(1, ph * 3), wd = lerp(1, 2.4, hash(i, 16));
      lb.seg2(vp[0] + cx * r, vp[1] + cy * r, vp[0] + cx * (r + len * 0.5), vp[1] + cy * (r + len * 0.5), wd, col, al);
      lb.seg2(vp[0] + cx * (r + len * 0.5), vp[1] + cy * (r + len * 0.5), vp[0] + cx * (r + len), vp[1] + cy * (r + len), wd * 0.8, col, al * 0.4);
    }
  }

  /** The line on screen and the one leaving; their side alternates around the corridor. */
  lyricLayout(t: number) {
    const L = this.L;
    let cx = 0, hw = 0, a = 0;
    L.forEach((line, i) => {
      const enter = prog(t, line.start - 0.9, line.start - 0.1, ease.outCubic);
      const exitT = this.exitTime(i);
      const vis = enter * (1 - prog(t, exitT, exitT + 0.5));
      if (vis > a) {
        const g = this.geom(line, i);
        a = vis; cx = (g.x0 + g.x1) / 2; hw = (g.x1 - g.x0) / 2 + 170;
      }
    });
    return { cx, hw, a };
  }

  exitTime(i: number) {
    const next = this.L[i + 1];
    if (next) return next.start - 0.45;
    return this.n === 1 ? this.A.still! + 1.6 : this.ctx.end + 1;
  }

  geom(line: Line, i: number) {
    const ncol = columns(glyphStates(line, line.start), 8).length;
    const gap = 132;
    const right = i % 2 === 0;
    const xr = right ? 1690 : 230 + (ncol - 1) * gap;          // the first (rightmost) column
    return { xr, gap, ncol, x0: xr - (ncol - 1) * gap, x1: xr };
  }

  lyrics(c: CanvasRenderingContext2D, t: number, vp: [number, number]) {
    const size = 96, adv = size * 1.1;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(F.mincho(800), size);
    this.L.forEach((line, li) => {
      const enter = prog(t, line.start - 0.9, line.start - 0.1, ease.outCubic);
      const exitT = this.exitTime(li);
      const ex = prog(t, exitT, exitT + 0.5, ease.inQuad);
      if (enter <= 0 || ex >= 1) return;
      const g = this.geom(line, li);
      const cols = columns(glyphStates(line, t), 8);
      cols.forEach((col, ci) => {
        const top = 118 + (8 - col.length) * adv * 0.12;
        col.forEach((gs, i) => {
          const v = verticalForm(gs.ch);
          let x = g.xr - ci * g.gap + v.dx * size;
          let y = top + i * adv + adv / 2 + v.dy * size;
          // rising out of the depth (from the vanishing point) and flying apart past the camera
          const e = clamp(enter * 1.15 - (gs.li / 40));
          const k = 0.78 + 0.22 * ease.outCubic(e) + 0.9 * ex;
          x = vp[0] + (x - vp[0]) * k;
          y = vp[1] + (y - vp[1]) * k;
          const s = (0.82 + 0.18 * e + 0.7 * ex) * (gs.k > 0 && gs.k < 1 ? 1.06 : 1);
          const alpha = e * (1 - ex);
          c.globalAlpha = alpha * (gs.k > 0 ? 1 : 0.34);
          c.fillStyle = gs.k > 0 && gs.k < 1 ? rgba('ember') : gs.k >= 1 ? rgba('moon') : rgba('fog');
          c.save();
          c.translate(x, y - 6 * clamp(gs.k));
          c.scale(s, s);
          if (v.rot) c.rotate(v.rot);
          c.fillText(v.ch, 0, 0);
          c.restore();
        });
      });
    });
    c.globalAlpha = 1;
  }
}
