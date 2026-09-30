import type { Game } from '../game/game';
import { MODULES } from '../game/defs';
import { specOf } from '../game/systems/engine';
import { TOP_MARKS, TOP_PX, topScale } from '../render/px/shipArt';
import { TOROID_SHEET } from '../render/px/toroids';

/**
 * Your Titan as the cab sees it when you look round: not a flat slab but a height field in hull metres, rebuilt a
 * few times a second. The deck (coloured from the tactical view's paint job) sloping down to the bow, the bulwark
 * round its edge with hazard stripes, every turret on the roof with its barrels turned where they're aiming, the
 * soldier nests' sandbags, masts and coils, the exhaust stacks at the stern (their flames are drawn over the view),
 * and the four toroids out on their pylons with their cores glowing.
 */

export interface HullShape {
  /** Local coordinates of cell (0, 0) (forward, starboard) and the grid size; one cell is a metre. */
  x0: number;
  z0: number;
  w: number;
  d: number;
  /** Height of the top above the ground (0 = nothing), and its colour (packed ABGR). */
  h: Float32Array;
  col: Uint32Array;
  /** Where flames come out: stack tops (pointing up) and the stern nozzles (pointing aft). */
  stacks: { lx: number; lz: number; z: number }[];
  nozzles: { lx: number; lz: number; z: number }[];
  /** The toroids' cores (for their glow). */
  cores: { lx: number; lz: number; z: number; on: number }[];
}

type Pack = (r: number, g: number, b: number) => number;

const hexRGB = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function buildHullShape(g: Game, img: { d: Uint8ClampedArray; w: number; h: number; cx: number; cy: number; ppm: number }, pack: Pack, bowLx: number, t: number): HullShape {
  const p = g.player;
  const L2 = p.stats.length / 2, W2 = p.stats.width / 2;
  const roof = p.deckY(0);
  const pad = 18;
  const x0 = Math.floor(-L2 - 2), z0 = Math.floor(-W2 - pad);
  const w = Math.ceil(L2 * 2 + 4), d = Math.ceil(W2 * 2 + pad * 2);
  const h = new Float32Array(w * d);
  const col = new Uint32Array(w * d);
  const at = (lx: number, lz: number): number => {
    const ix = Math.floor(lx - x0), iz = Math.floor(lz - z0);
    return ix >= 0 && iz >= 0 && ix < w && iz < d ? iz * w + ix : -1;
  };
  const paint = (lx: number, lz: number): [number, number, number] => {
    const hx = Math.round(img.cx + lx * img.ppm), hy = Math.round(img.cy + lz * img.ppm);
    const q = (hy * img.w + hx) * 4;
    if (hx >= 0 && hy >= 0 && hx < img.w && hy < img.h && img.d[q + 3] > 0) return [img.d[q], img.d[q + 1], img.d[q + 2]];
    return [70, 72, 76];
  };
  const set = (lx: number, lz: number, top: number, c: number): void => {
    const q = at(lx, lz);
    if (q < 0 || top <= h[q]) return;
    h[q] = top;
    col[q] = c;
  };
  // The deck, sloping away at the bow; the bulwark round the edge.
  for (let iz = 0; iz < d; iz++) {
    for (let ix = 0; ix < w; ix++) {
      const lx = x0 + ix + 0.5, lz = z0 + iz + 0.5;
      if (Math.abs(lx) > L2 || Math.abs(lz) > W2) continue;
      const q = iz * w + ix;
      const [r, gg, b] = paint(lx, lz);
      const edge = Math.abs(lz) > W2 - 1.5 || lx < -L2 + 1.5;
      let top = lx > bowLx ? roof - 3 - (lx - bowLx) * 4 : roof;
      if (edge && lx < bowLx - 4) {
        top += 1.4;
        const stripe = Math.floor((lx + 1000) / 4) % 2 === 0;
        h[q] = top;
        col[q] = stripe && Math.floor((lx + 1000) / 24) % 3 === 0 ? pack(200, 160, 30) : pack(r * 0.7 + 20, gg * 0.7 + 22, b * 0.7 + 26);
        continue;
      }
      h[q] = Math.max(1, top);
      col[q] = pack(r, gg, b);
    }
  }
  // Everything built on the roof.
  for (const m of p.modules) {
    if (m.deck !== 0 || !m.built) continue;
    const def = MODULES[m.key];
    if (!def) continue;
    const c = p.moduleLocal(m);
    const fx = (def.h * p.cell) / 2, fz = (def.w * p.cell) / 2;
    const [r, gg, b] = paint(c.lx, c.lz);
    if (def.hardpoint || m.key === 'pad' || m.key === 'main_gun') {
      const big = m.key === 'main_gun';
      const rad = big ? Math.min(fx, fz) * 0.85 : Math.min(fx, fz) * 0.7;
      const top = roof + (big ? 5.5 : 3);
      // The turret: a lit dome of armour plate with a darker ring and a hatch.
      for (let a = -rad; a <= rad; a += 0.6) for (let bz = -rad; bz <= rad; bz += 0.6) {
        const rr = a * a + bz * bz;
        if (rr > rad * rad) continue;
        const k = 1 - Math.sqrt(rr) / rad;
        const lit = 0.85 + 0.35 * k - (a + bz) / (rad * 6);
        const ring = rr > (rad - 1.2) * (rad - 1.2);
        set(c.lx + a, c.lz + bz, top - (ring ? 0.6 : 0), ring ? pack(46, 50, 56) : pack((r * 0.3 + 70) * lit, (gg * 0.3 + 76) * lit, (b * 0.3 + 86) * lit));
      }
      set(c.lx - rad * 0.3, c.lz + rad * 0.3, top + 0.8, pack(150, 156, 166));
      if (m.weapon) {
        const ang = m.aim - p.rot;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const reach = p.muzzleReach(m);
        const pairs = big ? [-1.6, 1.6] : [0];
        for (const off of pairs) {
          for (let k = rad * 0.5; k < reach; k += 0.6) {
            for (const wv of [-0.5, 0, 0.5]) set(c.lx + ca * k - sa * (off + wv), c.lz + sa * k + ca * (off + wv), top - (big ? 1 : 0.6), pack(40, 42, 46));
          }
        }
      }
      continue;
    }
    if (def.nest) {
      for (let a = -fx; a <= fx; a += 0.7) for (let bz = -fz; bz <= fz; bz += 0.7) {
        const rim = Math.abs(a) > fx - 1.4 || Math.abs(bz) > fz - 1.4;
        if (rim) set(c.lx + a, c.lz + bz, roof + 1.3, pack(168, 152, 104));
      }
      continue;
    }
    if (m.key === 'radar' || m.key === 'tesla') {
      const top = roof + (m.key === 'radar' ? 13 : 8);
      const cc = m.key === 'tesla' ? pack(120, 230, 255) : pack(200, 204, 210);
      for (let a = -1; a <= 1; a += 0.5) for (let bz = -1; bz <= 1; bz += 0.5) set(c.lx + a, c.lz + bz, top, cc);
      continue;
    }
    if (m.key === 'shield') {
      const rad = Math.min(fx, fz);
      for (let a = -rad; a <= rad; a += 0.6) for (let bz = -rad; bz <= rad; bz += 0.6) {
        const k = 1 - (a * a + bz * bz) / (rad * rad);
        if (k > 0) set(c.lx + a, c.lz + bz, roof + 4 * Math.sqrt(k), pack(90, 170, 220));
      }
      continue;
    }
    const top = roof + Math.max(1.2, def.height * 5);
    for (let a = -fx + 0.5; a <= fx - 0.5; a += 0.7) for (let bz = -fz + 0.5; bz <= fz - 0.5; bz += 0.7) set(c.lx + a, c.lz + bz, top, pack(r * 1.1 + 14, gg * 1.1 + 14, b * 1.1 + 16));
  }
  // The exhaust stacks at the stern: as many as the engine has jets, taller with bigger stacks fitted.
  const spec = specOf(p);
  const n = Math.max(2, spec.flame.jets);
  const stackTop = roof + 9 + p.engine.exhaust * 0.8;
  const stacks: HullShape['stacks'] = [];
  for (let i = 0; i < n; i++) {
    const lz = (((i + 0.5) / n) - 0.5) * W2 * 1.1;
    const lx = -L2 + 16;
    for (let a = -2.4; a <= 2.4; a += 0.5) for (let bz = -2.4; bz <= 2.4; bz += 0.5) {
      if (a * a + bz * bz > 2.4 * 2.4) continue;
      const band = a * a + bz * bz > 1.8 * 1.8;
      set(lx + a, lz + bz, stackTop, band ? pack(70, 60, 54) : pack(20, 18, 18));
    }
    stacks.push({ lx, lz, z: stackTop });
  }
  // The toroids on their pylons.
  const { kx, ky } = topScale(p.stats.length, p.stats.width);
  const ring = 14 * kx;
  const cores: HullShape['cores'] = [];
  for (let i = 0; i < 4; i++) {
    const [px, py] = TOROID_SHEET[i];
    const lx = (px - TOP_PX.cx) * kx, lz = (py - TOP_PX.cy) * ky;
    const on = g.helm.toroids[i] ? g.titan.toroids[i] : 0;
    const core = hexRGB('#18ffff');
    const glow = 0.25 + 0.75 * on * (0.3 + 0.7 * p.spool);
    for (let a = -ring; a <= ring; a += 0.5) for (let bz = -ring; bz <= ring; bz += 0.5) {
      const rr = Math.hypot(a, bz);
      if (rr > ring) continue;
      if (rr > ring * 0.55) set(lx + a, lz + bz, roof - 2, pack(58, 64, 80));
      else set(lx + a, lz + bz, roof - 4, pack(core[0] * glow, core[1] * glow, core[2] * glow));
    }
    // Pylon back to the hull side.
    const side = lz < 0 ? -1 : 1;
    for (let zz = Math.min(lz, side * W2); zz <= Math.max(lz, side * W2); zz += 0.5) for (let a = -1.2; a <= 1.2; a += 0.6) set(lx + a, zz, roof - 3, pack(34, 36, 44));
    cores.push({ lx, lz, z: roof - 4, on });
  }
  // The engine pods' nozzles at the stern.
  const nozzles = TOP_MARKS.nozzles.slice(0, n).map(([nx, ny]) => ({ lx: (nx - TOP_PX.cx) * kx, lz: (ny - TOP_PX.cy) * ky, z: roof - 6 }));
  void t;
  return { x0, z0, w, d, h, col, stacks, nozzles, cores };
}
