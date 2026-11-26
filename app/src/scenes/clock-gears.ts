// Clockwork for the `clock` scene: procedurally generated, correctly meshing gear trains (one per
// depth layer), the escapement (escape wheel, pallet fork, balance wheel with its hairspring) and
// the chapter ring of a dial, all drawn as hairline segments into a LineBatch.
import type { LineBatch } from '../engine/lines';
import { hash, mulberry32, TAU } from '../engine/util';

export type RGB = [number, number, number];

export interface Gear {
  x: number; y: number;
  /** pitch radius, tooth count, angular rate (rad per tick of the drive), phase */
  r: number; n: number; w: number; a0: number;
  kind: 'wheel' | 'escape';
  style: number;
  parent: number;
  /** neighbours in the mesh tree (for paths through the mechanism) */
  links: number[];
  /** missing teeth (the failing clockwork of clock2) */
  broken: Set<number>;
  /** unit-radius outline of the teeth, precomputed: [x0, y0, x1, y1, ...] in gear space */
  outline: Float32Array;
}

/** A camera transform for one depth layer: screen = C + R(rot) * (p - c) * z. */
export interface View { cx: number; cy: number; z: number; cos: number; sin: number; ox: number; oy: number }

export function project(v: View, x: number, y: number): [number, number] {
  const dx = (x - v.cx) * v.z, dy = (y - v.cy) * v.z;
  return [v.ox + dx * v.cos - dy * v.sin, v.oy + dx * v.sin + dy * v.cos];
}

function toothOutline(g: Gear, m: number): Float32Array {
  const pts: number[] = [];
  const a = TAU / g.n;
  if (g.kind === 'escape') {
    // club-tooth escape wheel: a long leaning tooth, a short flat tip, a curved back
    const tip = g.r + m * 1.6, root = g.r - m * 1.4;
    for (let k = 0; k < g.n; k++) {
      const t = k * a;
      pts.push(Math.cos(t) * root, Math.sin(t) * root);
      pts.push(Math.cos(t + 0.18 * a) * tip, Math.sin(t + 0.18 * a) * tip);
      pts.push(Math.cos(t + 0.34 * a) * tip, Math.sin(t + 0.34 * a) * tip);
      for (let s = 1; s <= 3; s++) {
        const u = s / 3, rr = tip + (root - tip) * Math.pow(u, 0.6);
        const tt = t + (0.34 + 0.66 * u) * a;
        pts.push(Math.cos(tt) * rr, Math.sin(tt) * rr);
      }
    }
  } else {
    const tip = g.r + m, root = g.r - m * 1.25;
    for (let k = 0; k < g.n; k++) {
      const t = k * a;
      pts.push(Math.cos(t - 0.27 * a) * root, Math.sin(t - 0.27 * a) * root);
      pts.push(Math.cos(t - 0.14 * a) * tip, Math.sin(t - 0.14 * a) * tip);
      pts.push(Math.cos(t + 0.14 * a) * tip, Math.sin(t + 0.14 * a) * tip);
      pts.push(Math.cos(t + 0.27 * a) * root, Math.sin(t + 0.27 * a) * root);
    }
  }
  return Float32Array.from(pts);
}

export interface TrainOpts {
  seed: number;
  count: number;
  rMin: number; rMax: number;
  /** circular pitch (world px per tooth); equal for all gears of a train so they mesh */
  pitch: number;
  /** generation area: gears stay inside this ellipse around (bx, by) */
  bx: number; by: number; rx: number; ry: number;
  root: { x: number; y: number; n: number; kind: 'wheel' | 'escape'; w: number };
  broken?: number;
  /** keep-out circles (cx, cy, r) */
  avoid?: [number, number, number][];
}

/** A tree of meshing gears grown from a root wheel. */
export function buildTrain(o: TrainOpts): Gear[] {
  const rnd = mulberry32(o.seed);
  const m = o.pitch / Math.PI; // module
  const gears: Gear[] = [];
  const mk = (x: number, y: number, n: number, kind: 'wheel' | 'escape', w: number, a0: number, parent: number): Gear => {
    const g: Gear = { x, y, r: (n * o.pitch) / TAU, n, w, a0, kind, style: Math.floor(rnd() * 4), parent, links: [], broken: new Set(), outline: new Float32Array() };
    g.outline = toothOutline(g, m);
    // hashed, not drawn from rnd: the same layout with or without broken teeth
    if (o.broken) for (let k = 0; k < n; k++) if (hash(o.seed, gears.length, k) < o.broken) g.broken.add(k);
    return g;
  };
  gears.push(mk(o.root.x, o.root.y, o.root.n, o.root.kind, o.root.w, 0, -1));
  const fits = (x: number, y: number, r: number, parent: number) => {
    const ex = (x - o.bx) / o.rx, ey = (y - o.by) / o.ry;
    if (ex * ex + ey * ey > 1) return false;
    for (const [ax, ay, ar] of o.avoid ?? []) if (Math.hypot(x - ax, y - ay) < ar + r) return false;
    for (let i = 0; i < gears.length; i++) {
      if (i === parent) continue;
      const g = gears[i]!;
      if (Math.hypot(g.x - x, g.y - y) < g.r + r + m * 4) return false;
    }
    return true;
  };
  for (let tries = 0; gears.length < o.count && tries < 4000; tries++) {
    // prefer growing from recent gears: long chains, not stars
    const pi = Math.max(0, gears.length - 1 - Math.floor(Math.pow(rnd(), 2) * gears.length));
    const p = gears[pi]!;
    if (p.kind === 'escape' && gears.length > 1) continue;
    const r = o.rMin + (o.rMax - o.rMin) * Math.pow(rnd(), 1.6);
    const n = Math.max(10, Math.round((TAU * r) / o.pitch));
    const rr = (n * o.pitch) / TAU;
    const phi = rnd() * TAU;
    const d = p.r + rr;
    const x = p.x + Math.cos(phi) * d, y = p.y + Math.sin(phi) * d;
    if (!fits(x, y, rr + m, pi)) continue;
    // mesh phase: parent tooth phase at the contact direction plus the child's equals 1/2
    const sp = (((phi - p.a0) * p.n) / TAU) % 1;
    const a0 = phi + Math.PI - ((TAU / n) * (0.5 - sp));
    const g = mk(x, y, n, 'wheel', (-p.w * p.n) / n, a0, pi);
    g.links.push(pi);
    p.links.push(gears.length);
    gears.push(g);
  }
  return gears;
}

/** Gear indices along the mesh tree from a to b. */
export function treePath(gears: Gear[], a: number, b: number): number[] {
  const prev = new Map<number, number>([[a, -1]]);
  const q = [a];
  while (q.length) {
    const i = q.shift()!;
    if (i === b) break;
    for (const j of gears[i]!.links) if (!prev.has(j)) { prev.set(j, i); q.push(j); }
  }
  const out: number[] = [];
  for (let i: number | undefined = b; i !== undefined && i !== -1; i = prev.get(i)) out.push(i);
  return out.reverse();
}

/** Points along the mechanism from gear a to gear b: arbor, mesh point, arbor... */
export function pathPoints(gears: Gear[], ids: number[]): [number, number][] {
  const pts: [number, number][] = [];
  ids.forEach((id, k) => {
    const g = gears[id]!;
    pts.push([g.x, g.y]);
    const nx = ids[k + 1];
    if (nx !== undefined) {
      const h = gears[nx]!;
      const t = g.r / (g.r + h.r);
      pts.push([g.x + (h.x - g.x) * t, g.y + (h.y - g.y) * t]);
    }
  });
  return pts;
}

// ---- drawing --------------------------------------------------------------------------------------

function inView(v: View, x: number, y: number, r: number, pad = 40) {
  const [sx, sy] = project(v, x, y);
  const R = r * v.z + pad;
  return sx > -R && sx < 1920 + R && sy > -R && sy < 1080 + R;
}

/** A circle (or an arc) in world space. */
export function circle(lb: LineBatch, v: View, x: number, y: number, r: number, w: number, c: RGB, a: number, a0 = 0, a1 = TAU) {
  const sr = r * v.z;
  if (sr < 0.5) return;
  const n = Math.max(10, Math.min(200, Math.ceil((sr * Math.abs(a1 - a0)) / 9)));
  let [px, py] = project(v, x + Math.cos(a0) * r, y + Math.sin(a0) * r);
  for (let i = 1; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    const [qx, qy] = project(v, x + Math.cos(t) * r, y + Math.sin(t) * r);
    lb.seg2(px, py, qx, qy, w, c, a);
    px = qx; py = qy;
  }
}

export function seg(lb: LineBatch, v: View, ax: number, ay: number, bx: number, by: number, w: number, c: RGB, a: number) {
  const [px, py] = project(v, ax, ay), [qx, qy] = project(v, bx, by);
  lb.seg2(px, py, qx, qy, w, c, a);
}

/** One gear at angle th: teeth, rim, spokes / holes, hub, arbor, a jewel. */
export function drawGear(lb: LineBatch, v: View, g: Gear, th: number, w: number, c: RGB, a: number, jewel: RGB | null) {
  if (!inView(v, g.x, g.y, g.r * 1.1)) return;
  const cs = Math.cos(th), sn = Math.sin(th);
  const o = g.outline;
  const per = g.kind === 'escape' ? 6 : 4;
  const N = o.length / 2;
  const P = (i: number): [number, number] => {
    const x = o[i * 2]!, y = o[i * 2 + 1]!;
    return project(v, g.x + x * cs - y * sn, g.y + x * sn + y * cs);
  };
  let prev = P(0);
  for (let i = 1; i <= N; i++) {
    const cur = P(i % N);
    const tooth = Math.floor((i - 1) / per);
    if (!g.broken.has(tooth)) lb.seg2(prev[0], prev[1], cur[0], cur[1], w, c, a);
    else if ((i - 1) % per === 0) {
      // a broken tooth: the root line runs straight across the gap
      const nx = P(Math.min(N, i - 1 + per) % N);
      lb.seg2(prev[0], prev[1], nx[0], nx[1], w, c, a * 0.8);
    }
    prev = cur;
  }
  const r = g.r;
  const big = r * v.z > 26;
  const rim = r * (g.kind === 'escape' ? 0.62 : 0.8);
  const hub = r * 0.2;
  if (big) circle(lb, v, g.x, g.y, rim, w * 0.9, c, a * 0.85);
  circle(lb, v, g.x, g.y, hub, w * 0.9, c, a);
  circle(lb, v, g.x, g.y, r * 0.06, w, c, a);
  if (!big) return;
  const st = g.kind === 'escape' ? 1 : g.style;
  const k = [5, 4, 6, 3][st]!;
  for (let s = 0; s < k; s++) {
    const t = th + (s * TAU) / k;
    if (st === 2) {
      // a disc with round lightening holes
      const hr = (rim - hub) * 0.32, hd = (rim + hub) / 2;
      circle(lb, v, g.x + Math.cos(t) * hd, g.y + Math.sin(t) * hd, hr, w * 0.8, c, a * 0.8);
      continue;
    }
    // double-line spokes; style 0 curves them (a watch "crossing")
    const half = r * (st === 3 ? 0.05 : 0.035);
    const nx = -Math.sin(t), ny = Math.cos(t);
    const bend = st === 0 ? 0.35 : 0;
    for (const side of [-1, 1]) {
      let px = g.x + Math.cos(t) * hub + nx * half * side, py = g.y + Math.sin(t) * hub + ny * half * side;
      const steps = bend ? 5 : 1;
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        const rr = hub + (rim - hub) * u;
        const tt = t + bend * Math.sin(u * Math.PI) * 0.5 * (1 - u * 0.3);
        const qx = g.x + Math.cos(tt) * rr + -Math.sin(tt) * half * side, qy = g.y + Math.sin(tt) * rr + Math.cos(tt) * half * side;
        seg(lb, v, px, py, qx, qy, w * 0.85, c, a * 0.85);
        px = qx; py = qy;
      }
    }
  }
  if (st === 3) circle(lb, v, g.x, g.y, (rim + hub) * 0.55, w * 0.6, c, a * 0.5);
  if (jewel) {
    // the ruby bearing at the arbor: a small dot of rose
    const [sx, sy] = project(v, g.x, g.y);
    const d = Math.min(5, Math.max(1.6, r * 0.09 * v.z));
    lb.seg2(sx, sy, sx + 0.01, sy, d, jewel, 1);
  }
}

/** The escapement: pallet fork above the escape wheel, rocking once per tick, and the balance wheel. */
export function drawEscapement(lb: LineBatch, v: View, e: Gear, anchor: number, balance: number, w: number, c: RGB, a: number, hot: number) {
  const px = e.x, py = e.y - e.r * 1.42; // pallet arbor
  const cs = Math.cos(anchor), sn = Math.sin(anchor);
  const T = (x: number, y: number): [number, number] => [px + x * cs - y * sn, py + x * sn + y * cs];
  const R = e.r;
  const glow: RGB = [c[0] * (1 + hot * 1.4), c[1] * (1 + hot * 1.4), c[2] * (1 + hot * 1.4)];
  // the anchor: two arms reaching down to the pallets on the wheel's rim, and the fork up to the balance
  const arm = (sd: number) => {
    const pts: [number, number][] = [[0, 0], [sd * R * 0.48, R * 0.32], [sd * R * 0.66, R * 0.78], [sd * R * 0.56, R * 0.86], [sd * R * 0.4, R * 0.42], [0, R * 0.14]];
    for (let i = 1; i < pts.length; i++) {
      const p = T(...pts[i - 1]!), q = T(...pts[i]!);
      seg(lb, v, p[0], p[1], q[0], q[1], w, i === 2 || i === 3 ? glow : c, a);
    }
  };
  arm(-1); arm(1);
  const fork: [number, number][] = [[-R * 0.06, 0], [-R * 0.04, -R * 1.1], [-R * 0.14, -R * 1.22], [-R * 0.1, -R * 1.3], [0, -R * 1.18], [R * 0.1, -R * 1.3], [R * 0.14, -R * 1.22], [R * 0.04, -R * 1.1], [R * 0.06, 0]];
  for (let i = 1; i < fork.length; i++) {
    const p = T(...fork[i - 1]!), q = T(...fork[i]!);
    seg(lb, v, p[0], p[1], q[0], q[1], w, c, a);
  }
  circle(lb, v, px, py, R * 0.12, w, c, a);
  circle(lb, v, px, py, R * 0.04, w, c, a);
  // balance wheel: a heavy rim with timing screws, three arms, and the hairspring breathing with it
  const bx = px, by = py - R * 2.55, BR = R * 1.25;
  const bc = Math.cos(balance), bs = Math.sin(balance);
  circle(lb, v, bx, by, BR, w * 1.1, c, a);
  circle(lb, v, bx, by, BR * 0.9, w * 0.9, c, a * 0.8);
  for (let s = 0; s < 3; s++) {
    const t = balance + (s * TAU) / 3 + 0.5;
    seg(lb, v, bx + Math.cos(t) * BR * 0.1, by + Math.sin(t) * BR * 0.1, bx + Math.cos(t) * BR * 0.9, by + Math.sin(t) * BR * 0.9, w, c, a * 0.85);
  }
  for (let s = 0; s < 14; s++) {
    const t = balance + (s * TAU) / 14;
    circle(lb, v, bx + Math.cos(t) * BR * 1.06, by + Math.sin(t) * BR * 1.06, R * 0.045, w * 0.8, c, a * 0.9);
  }
  // impulse pin down into the fork
  const ip = [bx + -bs * BR * 0 + bc * 0, by + BR * 0.32] as const;
  circle(lb, v, ip[0] + Math.sin(balance) * BR * 0.32, by + Math.cos(balance) * BR * 0.32, R * 0.05, w, glow, a);
  const turns = 11, steps = 360;
  let q = project(v, bx + BR * 0.08, by);
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const rr = BR * (0.08 + 0.58 * s);
    const t = s * turns * TAU + balance * (1 - s);
    const p = project(v, bx + Math.cos(t) * rr, by + Math.sin(t) * rr);
    lb.seg2(q[0], q[1], p[0], p[1], w * 0.6, c, a * 0.75);
    q = p;
  }
  circle(lb, v, bx, by, R * 0.08, w, c, a);
}

/** The dial's chapter ring: rings, minute and seconds track, and the three hands. */
export function drawDial(lb: LineBatch, v: View, R: number, hands: [number, number, number], w: number, c: RGB, a: number, hc: RGB) {
  circle(lb, v, 0, 0, R, w * 1.2, c, a);
  circle(lb, v, 0, 0, R * 0.985, w * 0.7, c, a * 0.7);
  circle(lb, v, 0, 0, R * 0.88, w * 0.8, c, a * 0.8);
  circle(lb, v, 0, 0, R * 0.86, w * 0.6, c, a * 0.5);
  for (let i = 0; i < 300; i++) {
    const t = (i / 300) * TAU - Math.PI / 2;
    const five = i % 25 === 0, one = i % 5 === 0;
    const r0 = five ? R * 0.89 : one ? R * 0.915 : R * 0.95;
    const r1 = five ? R * 0.975 : R * 0.975;
    seg(lb, v, Math.cos(t) * r0, Math.sin(t) * r0, Math.cos(t) * r1, Math.sin(t) * r1, five ? w * 2.4 : one ? w * 1.1 : w * 0.55, c, five ? a : one ? a * 0.9 : a * 0.55);
  }
  const [hh, mm, ss] = hands;
  const hand = (ang: number, len: number, wid: number, tail: number, ring: boolean) => {
    const t = ang - Math.PI / 2;
    const dx = Math.cos(t), dy = Math.sin(t), nx = -dy, ny = dx;
    const P = (u: number, s: number): [number, number] => [dx * u + nx * s, dy * u + ny * s];
    const pts: [number, number][] = [P(-tail, 0), P(0, wid), P(len * 0.72, wid * 0.4), P(len, 0), P(len * 0.72, -wid * 0.4), P(0, -wid), P(-tail, 0)];
    for (let i = 1; i < pts.length; i++) seg(lb, v, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], w, hc, a);
    if (ring) { const [x, y] = P(len * 0.72, 0); circle(lb, v, x, y, wid * 1.3, w, hc, a); }
  };
  hand(hh, R * 0.5, R * 0.035, R * 0.06, true);
  hand(mm, R * 0.78, R * 0.025, R * 0.08, true);
  const t = ss - Math.PI / 2;
  seg(lb, v, -Math.cos(t) * R * 0.2, -Math.sin(t) * R * 0.2, Math.cos(t) * R * 0.94, Math.sin(t) * R * 0.94, w * 0.9, hc, a);
  circle(lb, v, -Math.cos(t) * R * 0.17, -Math.sin(t) * R * 0.17, R * 0.022, w, hc, a);
  circle(lb, v, 0, 0, R * 0.03, w, hc, a);
  circle(lb, v, 0, 0, R * 0.012, w, hc, a);
}
