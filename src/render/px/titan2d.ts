import { MODULES, TITAN_SKYLIGHT, TITAN_TOWER } from '../../game/defs';
import type { Game } from '../../game/game';
import { compIndex } from '../../game/systems/titan';
import type { ModuleInst, Tank } from '../../game/tank';
import { RARITIES } from '../../shared/rarity';
import { WEAPONS } from '../../shared/weapons';
import { ctx2d, hash2, makeCanvas, outlineCanvas, shade } from './pixels';

/**
 * The Titan Crawler from above, after the reference sheet: a long graphite hull on four crawlers a side, the
 * faceted prow with its grille and hazard stripes, blue light strips down both flanks, the command tower and the
 * Spine's skylight on the roof, the engine deck with its stacks at the stern and the "07" hull number. Every roof
 * gun is drawn where it's mounted and turns to its target; damage scorches the plating, fires burn in the
 * compartments that are alight, broken crawlers stop turning, and overdrive lights the stacks.
 *
 * The hull is painted in its own frame (forward = +x, starboard = +y) at the size it's shown at, every frame, so
 * it stays crisp at any zoom; the view rotates it into place.
 */

const PADM = 22;

interface Look {
  hull: string;
  dark: string;
  light: string;
  plate: string;
  deck: string;
  strip: string;
  tread: string;
  link: string;
  glass: string;
  glassHi: string;
  mark: string;
}

const PLAYER: Look = {
  hull: '#3c4047', dark: '#26292e', light: '#5a6068', plate: '#464b53', deck: '#33373e', strip: '#38c8ff', tread: '#17181b', link: '#34373d',
  glass: '#17323c', glassHi: '#7fe0ff', mark: '#ece4c8',
};
const RIVAL: Look = { ...PLAYER, hull: '#43383b', dark: '#2a2224', light: '#65565a', plate: '#4d4043', deck: '#3a3033', strip: '#ff3b30', mark: '#ffcdd2' };
const REMOTE: Look = { ...PLAYER, strip: '#e040fb', mark: '#f3e5f5' };
const CLASS_STRIP: Record<string, string> = { juggernaut: '#38c8ff', bastion: '#ffd740', ark: '#76ff03', nightrunner: '#b388ff', dredge: '#ffab40' };

export interface HullLight {
  x: number;
  y: number;
  /** Glow radius (m) and strength (0-1). */
  r: number;
  color: string;
  k: number;
}

export interface Painted {
  canvas: HTMLCanvasElement;
  /** Pixel of the hull's centre in the canvas. */
  cx: number;
  cy: number;
  /** Lights to glow, in hull metres (forward, starboard). */
  lights?: HullLight[];
}

const canvases = new WeakMap<Tank, HTMLCanvasElement>();

/** 3 x 5 pixel digits for the hull number. */
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
};

export function paintTitan(t: Tank, ppm: number, g: Game | null, time: number): Painted {
  const L = t.stats.length, W = t.stats.width;
  const cw = Math.ceil((L + PADM * 2) * ppm), chh = Math.ceil((W + PADM * 2) * ppm);
  let c = canvases.get(t);
  if (!c) {
    c = makeCanvas(cw, chh);
    canvases.set(t, c);
  }
  if (c.width !== cw || c.height !== chh) {
    c.width = cw;
    c.height = chh;
  }
  const x = ctx2d(c);
  x.clearRect(0, 0, cw, chh);
  const base = t.kind === 'rival' ? RIVAL : t.kind === 'remote' ? REMOTE : PLAYER;
  // Each hull class runs its own colour down the light strips (the Juggernaut keeps the flagship blue).
  const look = t.kind === 'main' && CLASS_STRIP[t.klass] ? { ...base, strip: CLASS_STRIP[t.klass] } : base;
  const ox = (L / 2 + PADM) * ppm, oy = (W / 2 + PADM) * ppm;
  const X = (m: number): number => Math.round(ox + m * ppm), Y = (m: number): number => Math.round(oy + m * ppm);
  /** Rectangle in hull metres (x forward from the centre, y to starboard). */
  const R = (x0: number, y0: number, w: number, h: number, col: string): void => {
    const a = X(x0), b = Y(y0);
    x.fillStyle = col;
    x.fillRect(a, b, Math.max(1, X(x0 + w) - a), Math.max(1, Y(y0 + h) - b));
  };
  const disc = (mx: number, my: number, r: number, col: string): void => {
    x.fillStyle = col;
    const cx = ox + mx * ppm, cy = oy + my * ppm, rr = Math.max(0.6, r * ppm);
    for (let yy = Math.floor(cy - rr); yy <= Math.ceil(cy + rr); yy++) {
      const k = (yy + 0.5 - cy) / rr;
      if (Math.abs(k) > 1) continue;
      const hw = rr * Math.sqrt(1 - k * k);
      const a = Math.round(cx - hw), b = Math.round(cx + hw);
      if (b > a) x.fillRect(a, yy, b - a, 1);
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, w: number, col: string): void => {
    x.fillStyle = col;
    const px0 = ox + x0 * ppm, py0 = oy + y0 * ppm, px1 = ox + x1 * ppm, py1 = oy + y1 * ppm;
    const n = Math.max(1, Math.ceil(Math.hypot(px1 - px0, py1 - py0) / 0.7));
    const s = Math.max(1, Math.round(w * ppm));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      x.fillRect(Math.round(px0 + (px1 - px0) * f - s / 2), Math.round(py0 + (py1 - py0) * f - s / 2), s, s);
    }
  };
  const fine = ppm * 5 >= 3;
  const detail = ppm * 2 >= 2;
  /** Lights on the hull (local metres) the view makes glow. */
  const lights: HullLight[] = [];

  /* ---- Crawlers: four a side, treads running at each side's speed, fenders over their inner halves ---- */
  const cl = L * 0.22, cwid = W * 0.16, gap = (L * 0.96 - cl * 4) / 3;
  const hw = W * 0.345;
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const k = i % 4;
    const x0 = L * 0.48 - cl - k * (cl + gap);
    const y0 = side < 0 ? -W / 2 : W / 2 - cwid;
    const health = g && t === g.player ? g.titan.crawlers[i] : 1;
    const lift = t.susp[i] ?? 0;
    R(x0, y0, cl, cwid, look.tread);
    // Track links slide back as the side drives forward; grousers glint at the edges.
    const pitch = 2.4;
    const phase = ((t.sidePhase[side < 0 ? 0 : 1] % pitch) + pitch) % pitch;
    if (health > 0.1 && ppm * pitch >= 1.4) {
      for (let m = x0 + cl - phase; m > x0 + 0.3; m -= pitch) {
        R(m, y0 + 0.4, Math.max(0.5, 0.42 * pitch), cwid - 0.8, look.link);
        if (detail) {
          R(m, y0 + 0.4, 0.6, 1, '#5d6067');
          R(m, y0 + cwid - 1.4, 0.6, 1, '#5d6067');
        }
      }
    }
    // Sprockets at each end (rounded ends of the track).
    R(x0, y0 + 1.5, 1.6, cwid - 3, '#0b0b0d');
    R(x0 + cl - 1.6, y0 + 1.5, 1.6, cwid - 3, '#0b0b0d');
    R(x0 + 0.6, y0 + 0.6, 1, 1, '#0b0b0d');
    // The fender over the inner half, riding up with the suspension.
    const fy = side < 0 ? y0 + cwid * 0.5 : y0, fw = cwid * 0.5;
    const fc = lift > 0.4 ? shade(look.plate, 0.1) : look.plate;
    R(x0 + 1.5, fy, cl - 3, fw, fc);
    R(x0 + 1.5, fy, cl - 3, 0.8, shade(fc, 0.22));
    R(x0 + 1.5, fy + fw - 0.8, cl - 3, 0.8, shade(fc, -0.3));
    if (fine) for (let m = x0 + 4; m < x0 + cl - 3; m += 9) {
      R(m, fy + fw * 0.35, 0.8, 0.8, shade(fc, -0.4));
      R(m + 0.1, fy + fw * 0.35 - 0.3, 0.4, 0.4, shade(fc, 0.35));
    }
    if (health < 0.35) {
      R(x0 + cl * 0.3, y0 + cwid * 0.2, cl * 0.4, cwid * 0.6, health <= 0.1 ? '#2a1208' : '#5a2a14');
      if (health <= 0.1) R(x0 + cl * 0.45, y0, 2.5, cwid, '#050505');
    }
  }
  // Between the crawlers: the suspension housings.
  for (let k = 0; k < 3; k++) {
    const gx = L * 0.48 - cl - k * (cl + gap) - gap;
    for (const side of [-1, 1]) {
      const y0 = side < 0 ? -W / 2 + 1 : W / 2 - cwid + 1;
      R(gx, y0, gap, cwid - 2, '#1a1c20');
      R(gx + gap * 0.25, y0 + 2, gap * 0.5, cwid - 6, '#2b2e34');
    }
  }

  /* ---- Hull: armour plates, each bevelled against the light, with rivets at the corners ---- */
  const bow = L * 0.39, stern = -L * 0.49;
  R(stern, -hw, bow - stern, hw * 2, look.dark);
  const lanes = 4, laneW = (hw * 2 - W * 0.1) / lanes, plateL = 12;
  for (let m = stern + 1; m < bow - 0.5; m += plateL) {
    for (let ln = 0; ln < lanes; ln++) {
      const px0 = m + 0.35, py0 = -hw + W * 0.05 + ln * laneW + 0.35, pw = Math.min(plateL, bow - m) - 0.7, ph = laneW - 0.7;
      const v = (hash2(Math.round(m), ln, t.id) - 0.5) * 0.1;
      const col = shade(look.hull, v + (ln < lanes / 2 ? 0.04 : -0.03));
      R(px0, py0, pw, ph, col);
      if (fine) {
        R(px0, py0, pw, Math.max(0.4, 0.7 / ppm), shade(col, 0.2));
        R(px0, py0, Math.max(0.4, 0.7 / ppm), ph, shade(col, 0.12));
        R(px0, py0 + ph - Math.max(0.4, 0.7 / ppm), pw, Math.max(0.4, 0.7 / ppm), shade(col, -0.28));
      }
      if (detail) {
        for (const [rx, ry] of [[1, 1], [pw - 1.6, 1], [1, ph - 1.6], [pw - 1.6, ph - 1.6]]) R(px0 + rx, py0 + ry, 0.6, 0.6, shade(col, -0.35));
        // Weathering: rust runs and scuffs.
        if (hash2(Math.round(m), ln, 77) > 0.72) R(px0 + pw * hash2(ln, Math.round(m), 5), py0 + ph * 0.3, 0.6, ph * 0.5, 'rgba(110,60,30,0.55)');
      }
    }
  }
  // Side armour rails with the light strips and vent slots.
  for (const side of [-1, 1]) {
    const ry = side < 0 ? -hw : hw - W * 0.05;
    R(stern, ry, bow - stern, W * 0.05, side < 0 ? look.plate : shade(look.plate, -0.18));
    R(stern, side < 0 ? ry : ry + W * 0.05 - 0.6, bow - stern, 0.6, side < 0 ? shade(look.plate, 0.25) : shade(look.plate, -0.4));
    if (detail) for (let m = stern + 4; m < bow - 4; m += 7) R(m, ry + W * 0.015, 2.2, W * 0.02, '#16181b');
  }
  const pulse = 0.55 + 0.45 * Math.sin(time * 2.4);
  const strip = shade(look.strip, -0.3 + 0.3 * pulse);
  const sw = Math.max(0.8, 1 / ppm);
  for (let m = stern + 6; m < bow - 6; m += 9) {
    R(m, -hw + W * 0.05, 6, sw, strip);
    R(m, hw - W * 0.05 - sw, 6, sw, strip);
    lights.push({ x: m + 3, y: -hw + W * 0.05, r: 5, color: look.strip, k: 0.35 * pulse }, { x: m + 3, y: hw - W * 0.05, r: 5, color: look.strip, k: 0.35 * pulse });
  }

  /* ---- Deck furniture: hatches, vents, a pipe run down each side, cargo at the stern ---- */
  if (fine) {
    for (const side of [-1, 1]) {
      const py = side * hw * 0.62;
      R(stern + 30, py - 0.6, bow - stern - 45, 1.2, '#50555d');
      if (detail) for (let m = stern + 34; m < bow - 15; m += 16) R(m, py - 1, 1, 2, '#6c727b');
      for (let m = stern + 40; m < bow - 20; m += 26) {
        const hx = m + hash2(Math.round(m), side, 3) * 6, hy = side * hw * 0.35 - 2;
        R(hx, hy, 4, 4, '#1e2126');
        R(hx + 0.5, hy + 0.5, 3, 3, shade(look.plate, 0.05));
        if (detail) {
          R(hx + 1.8, hy + 0.5, 0.5, 3, shade(look.plate, -0.3));
          R(hx + 0.5, hy + 1.8, 3, 0.5, shade(look.plate, -0.3));
        }
      }
    }
    // Cargo containers lashed down aft of the tower.
    const cargoCols = ['#5d6b3a', '#7a4a2e', '#46607a', '#6b5d3a'];
    for (let k = 0; k < 4; k++) {
      const cx0 = stern + L * 0.2 + (k % 2) * 7, cy0 = (k < 2 ? -1 : 1) * hw * 0.55 - 3;
      const col = cargoCols[(k + t.id) % 4];
      R(cx0, cy0, 6, 6, shade(col, -0.35));
      R(cx0 + 0.4, cy0 + 0.4, 5.2, 5.2, col);
      if (detail) for (let q = 1; q < 6; q += 1.2) R(cx0 + q, cy0 + 0.6, 0.35, 4.8, shade(col, -0.2));
    }
  }

  /* ---- The prow: stacked armour facets, the big grille, headlights and the ram edge ---- */
  const tip = L * 0.5;
  const cols = Math.max(1, Math.ceil((tip - bow) * ppm));
  for (let i = 0; i < cols; i++) {
    const m = bow + i / ppm;
    const f = (m - bow) / (tip - bow);
    const half = hw * (1 - f * 0.7);
    const band = f < 0.35 ? 0.1 : f < 0.7 ? 0.02 : -0.04;
    R(m, -half, 1 / ppm + 0.01, half, shade(look.hull, 0.16 + band));
    R(m, 0, 1 / ppm + 0.01, half, shade(look.hull, -0.14 + band));
    R(m, -half, 1 / ppm + 0.01, Math.max(0.6, 0.8 / ppm), shade(look.hull, 0.35));
    R(m, half - Math.max(0.6, 0.8 / ppm), 1 / ppm + 0.01, Math.max(0.6, 0.8 / ppm), '#121316');
    if (fine && f > 0.12 && f < 0.62 && Math.floor(m * 1.1) % 2 === 0) R(m, -half * 0.5, 1 / ppm + 0.01, half, '#15171a');
    if (f > 0.84) R(m, -half, 1 / ppm + 0.01, half * 2, Math.floor((m - f * 3) * 0.7) % 2 ? '#e6b422' : '#16161a');
  }
  if (fine) for (const k of [0.35, 0.7]) R(bow + (tip - bow) * k, -hw * (1 - k * 0.7), 0.6, hw * 2 * (1 - k * 0.7), '#101114');
  for (const side of [-1, 1]) {
    const hx = tip - 8, hy = side * hw * 0.42;
    disc(hx, hy, 1.8, '#20232a');
    disc(hx, hy, 1.2, '#fff8d6');
    lights.push({ x: hx, y: hy, r: 9, color: '#fff3c4', k: 0.6 }, { x: tip + 18, y: hy * 1.3, r: 22, color: '#fff3c4', k: 0.12 });
  }

  /* ---- The stern: engine deck with radiator fans and stacks, the rear ramp, tail lights ---- */
  R(stern, -hw * 0.82, L * 0.17, hw * 1.64, look.deck);
  R(stern, -hw * 0.82, L * 0.17, 0.8, shade(look.deck, 0.25));
  if (detail) for (let m = stern + 3; m < stern + L * 0.07; m += 1.6) R(m, -hw * 0.3, 0.7, hw * 0.6, '#16181b');
  const od = g && t === g.player && g.helm.overdrive;
  const moving = Math.min(1, Math.abs(t.speed) / 8);
  for (const side of [-1, 1]) {
    // Radiator fans, spinning with the engine load.
    const fx = stern + L * 0.12, fy = side * hw * 0.5, fr = 6;
    disc(fx, fy, fr, '#15171a');
    disc(fx, fy, fr - 0.8, '#2b2f35');
    const spin = time * (4 + moving * 18) * side;
    for (let b = 0; b < 5; b++) {
      const a = spin + (b * Math.PI * 2) / 5;
      line(fx, fy, fx + Math.cos(a) * (fr - 1.2), fy + Math.sin(a) * (fr - 1.2), 1.1, '#4d535b');
    }
    disc(fx, fy, 1.2, '#8a9099');
  }
  for (const sy of [-0.78, -0.2, 0.2, 0.78]) {
    const sx = stern + L * 0.035, syy = sy * hw;
    disc(sx, syy, 3.2, '#101114');
    disc(sx - 0.4, syy - 0.4, 2.4, '#26282d');
    const glow = od ? (Math.sin(time * 30 + sy * 9) > 0 ? '#ffcc40' : '#ff6d00') : moving > 0.2 ? '#7a3c1c' : '#1a1a1c';
    disc(sx, syy, 1.5, glow);
    if (od) lights.push({ x: sx, y: syy, r: 7, color: '#ff9100', k: 0.7 });
  }
  // Hull number on the engine deck.
  const digitH = 9, px = digitH / 5;
  if (digitH * ppm >= 5) {
    const text = '07';
    for (let k = 0; k < text.length; k++) {
      const rows = DIGITS[text[k]];
      for (let ry = 0; ry < 5; ry++) {
        for (let rx = 0; rx < 3; rx++) {
          if (rows[ry][rx] !== '1') continue;
          R(stern + L * 0.19 + (4 - ry) * px, -3.8 * px + k * 4 * px + rx * px, px, px, look.mark);
        }
      }
    }
  }
  for (const side of [-1, 1]) {
    R(stern, side < 0 ? -hw : hw - 4, 1.4, 4, '#ff1744');
    lights.push({ x: stern, y: side * (hw - 2), r: 6, color: '#ff1744', k: 0.5 });
  }

  /* ---- Roof: the Spine's skylight, the command tower, then everything built up there ---- */
  const cell = t.cell;
  const cellX = (cy: number): number => (t.rows / 2 - cy) * cell;
  const cellY = (cx: number): number => (cx - t.cols / 2) * cell;
  if (t.titan) {
    const sk = TITAN_SKYLIGHT;
    R(cellX(sk.r1 + 1), cellY(sk.c0), (sk.r1 + 1 - sk.r0) * cell, (sk.c1 + 1 - sk.c0) * cell, look.glass);
    if (fine) for (let r = sk.r0; r <= sk.r1; r += 2) R(cellX(r + 1) + 0.5, cellY(sk.c0) + 0.8, 1, 2, look.glassHi);
    const tw = TITAN_TOWER;
    const tx0 = cellX(tw.r1 + 1), ty0 = cellY(tw.c0), tl = (tw.r1 + 1 - tw.r0) * cell, tww = (tw.c1 + 1 - tw.c0) * cell;
    R(tx0 - 1.5, ty0 + 1.5, tl, tww, '#101114');
    R(tx0, ty0, tl, tww, look.light);
    R(tx0 + 1, ty0 + 1, tl - 2, tww - 2, look.plate);
    R(tx0 + tl - 3, ty0 + 2, 2, tww - 4, look.glass);
    if (fine) for (let k = 0; k < 4; k++) R(tx0 + tl - 2.6, ty0 + 3 + k * (tww - 6) / 3, 1.2, 1.2, look.glassHi);
    // Radar dish on the tower.
    const ra = time * 1.4;
    line(tx0 + tl * 0.35, ty0 + tww / 2, tx0 + tl * 0.35 + Math.cos(ra) * 5, ty0 + tww / 2 + Math.sin(ra) * 5, 1, '#cfd8dc');
  }
  for (const m of t.modules) {
    if (m.deck !== 0) continue;
    const d = MODULES[m.key];
    const x0 = cellX(m.cy + d.h), y0 = cellY(m.cx), mw = d.h * cell, mh = d.w * cell;
    if (d.hardpoint || m.key === 'pad' || m.key === 'main_gun') turret(m, x0, y0, mw, mh);
    else roofBlock(m, x0, y0, mw, mh);
  }

  function turret(m: ModuleInst, x0: number, y0: number, mw: number, mh: number): void {
    const main = m.key === 'main_gun';
    R(x0 + 0.5, y0 + 0.5, mw - 1, mh - 1, look.dark);
    R(x0 + 1, y0 + 1, mw - 2, mh - 2, shade(look.plate, -0.08));
    if (!m.weapon) return;
    const wd = WEAPONS[m.weapon.key];
    const size = wd?.size ?? 'medium';
    const cx = x0 + mw / 2, cy = y0 + mh / 2;
    const rr = Math.min(mw, mh) * (main ? 0.42 : 0.36);
    const a = m.aim - t.rot;
    const len = main ? L * 0.16 : size === 'heavy' ? 16 : size === 'medium' ? 10 : 7;
    const back = Math.min(0.35, m.recoil ?? 0) * len;
    const bw = main ? 1.8 : size === 'heavy' ? 1.5 : 1;
    const ca = Math.cos(a), sa = Math.sin(a);
    const twin = main || size === 'heavy' ? [-1, 1] : [0];
    for (const k of twin) {
      const off = k * bw * 1.1;
      line(cx - sa * off, cy + ca * off, cx - sa * off + ca * (len - back), cy + ca * off + sa * (len - back), bw, '#1d1f23');
      if (detail) line(cx - sa * off + ca * (len - back - 1.5), cy + ca * off + sa * (len - back - 1.5), cx - sa * off + ca * (len - back), cy + ca * off + sa * (len - back), bw * 1.3, '#0c0c0e');
    }
    disc(cx, cy, rr, look.light);
    disc(cx - 0.4, cy - 0.4, rr * 0.75, look.plate);
    // A band of the gun's rarity colour.
    disc(cx + ca * rr * 0.4, cy + sa * rr * 0.4, Math.max(0.8, rr * 0.25), RARITIES[m.weapon.rarity]?.color ?? '#b8c0c8');
  }

  function roofBlock(m: ModuleInst, x0: number, y0: number, mw: number, mh: number): void {
    const col = m.key === 'shield' ? '#29b6f6' : m.key === 'tesla' ? '#b388ff' : m.key.startsWith('nest') ? '#8d6e63' : m.key === 'radar' ? '#90a4ae' : m.key.includes('bay') || m.key.includes('hangar') ? '#607d8b' : '#546e7a';
    R(x0 + 0.5, y0 + 0.5, mw - 1, mh - 1, look.dark);
    R(x0 + 1, y0 + 1, mw - 2, mh - 2, shade(col, -0.35));
    R(x0 + 1, y0 + 1, mw - 2, 1, shade(col, -0.1));
    const cx = x0 + mw / 2, cy = y0 + mh / 2;
    if (m.key === 'radar') {
      const a = time * 2;
      line(cx, cy, cx + Math.cos(a) * mw * 0.45, cy + Math.sin(a) * mh * 0.45, 1, '#e0f7fa');
    } else if (m.key === 'tesla') disc(cx, cy, Math.min(mw, mh) * 0.25, Math.sin(time * 9) > 0 ? '#ea80fc' : '#7c4dff');
    else if (m.key === 'shield') disc(cx, cy, Math.min(mw, mh) * 0.28, shade('#40c4ff', -0.2 + 0.3 * pulse));
    else if (m.key.startsWith('nest')) {
      // Soldiers on the roof (they go inside in a storm).
      if (!t.indoors) for (let k = 0; k < 3; k++) disc(x0 + 1.5 + k * (mw - 3) / 2, cy + Math.sin(k * 2) * mh * 0.2, 0.7, '#ffcc80');
    } else if (m.built) R(cx - 1, cy - 1, 2, 2, shade(col, 0.2));
  }

  /* ---- Wear and battle damage ---- */
  const hpFrac = Math.max(0, t.hp / Math.max(1, t.stats.maxHp));
  const scorch = Math.floor((1 - hpFrac) * 16);
  for (let k = 0; k < scorch; k++) {
    const sx = stern + hash2(k, t.id, 3) * (bow - stern), sy = (hash2(k, t.id, 5) - 0.5) * hw * 1.8;
    const s = 2 + hash2(k, t.id, 9) * 6;
    disc(sx, sy, s, 'rgba(20,14,10,0.55)');
    if (k % 3 === 0) disc(sx, sy, s * 0.35, 'rgba(255,120,40,0.35)');
  }
  if (g && t === g.player) {
    const z = g.titan.zones;
    const crack = (x0: number, y0: number, x1: number, y1: number, worn: number): void => {
      if (worn > 0.5) return;
      const n = Math.ceil((0.5 - worn) * 14);
      for (let k = 0; k < n; k++) {
        const a = x0 + hash2(k, 11) * (x1 - x0), b = y0 + hash2(k, 13) * (y1 - y0);
        line(a, b, a + (hash2(k, 17) - 0.5) * 8, b + (hash2(k, 19) - 0.5) * 6, 0.5, '#120c0a');
      }
    };
    crack(bow - 10, -hw, tip, hw, z.bow);
    crack(stern, -hw, stern + 20, hw, z.stern);
    crack(stern, -hw, bow, -hw * 0.6, z.port);
    crack(stern, hw * 0.6, bow, hw, z.starboard);
    // Fires in the compartments that are burning: bow, midships or stern of whichever deck.
    for (let deck = 1; deck <= 7; deck++) {
      for (let s = 0; s < 3; s++) {
        const f = g.titan.fire[compIndex(deck, s)] ?? 0;
        if (f <= 0.02) continue;
        const fx = (1 - s) * L * 0.3 + (hash2(deck, s, 1) - 0.5) * 20, fy = ((deck % 3) - 1) * hw * 0.55;
        const n = 3 + Math.floor(f * 8);
        for (let k = 0; k < n; k++) {
          const flick = Math.sin(time * 14 + k * 3.1 + deck) * 0.5 + 0.5;
          const r = (1.2 + f * 3.2) * (0.6 + flick * 0.6);
          disc(fx + (hash2(k, deck, s) - 0.5) * 10 * f, fy + (hash2(k, s, deck) - 0.5) * 8 * f, r, k % 3 === 0 ? '#ffe082' : k % 3 === 1 ? '#ff9100' : '#ff3d00');
        }
        lights.push({ x: fx, y: fy, r: 8 + f * 10, color: '#ff6d00', k: 0.35 + f * 0.4 });
      }
    }
  }
  if (t.hitFlash > 0) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = `rgba(255,255,255,${Math.min(0.5, t.hitFlash * 3)})`;
    x.fillRect(0, 0, cw, chh);
    x.globalCompositeOperation = 'source-over';
  }
  if (t.dead) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(20,16,14,0.65)';
    x.fillRect(0, 0, cw, chh);
    x.globalCompositeOperation = 'source-over';
  }
  outlineCanvas(c);
  return { canvas: c, cx: ox, cy: oy, lights: t.dead ? [] : lights };
}

/* ---------------------------------------------------------------------- */
/* Small hulls: raider tanks, outposts and your outrider                   */
/* ---------------------------------------------------------------------- */

const small = new WeakMap<Tank, HTMLCanvasElement>();

export function paintSmallTank(t: Tank, ppm: number, time: number): Painted {
  const L = t.stats.length, W = t.stats.width;
  const pad = Math.max(3, L * 0.4);
  const cw = Math.max(4, Math.ceil((L + pad * 2) * ppm)), chh = Math.max(4, Math.ceil((W + pad * 2) * ppm));
  let c = small.get(t);
  if (!c) {
    c = makeCanvas(cw, chh);
    small.set(t, c);
  }
  if (c.width !== cw || c.height !== chh) {
    c.width = cw;
    c.height = chh;
  }
  const x = ctx2d(c);
  x.clearRect(0, 0, cw, chh);
  const ox = (L / 2 + pad) * ppm, oy = (W / 2 + pad) * ppm;
  const R = (x0: number, y0: number, w: number, h: number, col: string): void => {
    const a = Math.round(ox + x0 * ppm), b = Math.round(oy + y0 * ppm);
    x.fillStyle = col;
    x.fillRect(a, b, Math.max(1, Math.round(ox + (x0 + w) * ppm) - a), Math.max(1, Math.round(oy + (y0 + h) * ppm) - b));
  };
  const enemy = t.team === 'enemy';
  const body = t.kind === 'outpost' ? '#5d4037' : t.kind === 'outrider' ? '#26a69a' : enemy ? '#8d3a2a' : '#546e7a';
  if (t.kind === 'outpost') {
    R(-L / 2, -W / 2, L, W, shade(body, -0.4));
    R(-L / 2 + 1, -W / 2 + 1, L - 2, W - 2, body);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) R(a * L * 0.35 - 1, b * W * 0.35 - 1, 2, 2, '#212121');
  } else {
    R(-L / 2, -W / 2, L, W * 0.22, '#1c1c1e');
    R(-L / 2, W / 2 - W * 0.22, L, W * 0.22, '#1c1c1e');
    const ph = (t.treadPhase * 2) % 1.4;
    for (let m = -L / 2 + ph; m < L / 2; m += 1.4) {
      R(m, -W / 2, 0.4, W * 0.22, '#3a3a3e');
      R(m, W / 2 - W * 0.22, 0.4, W * 0.22, '#3a3a3e');
    }
    R(-L / 2 + 0.3, -W * 0.3, L - 0.6, W * 0.6, body);
    R(-L / 2 + 0.3, -W * 0.3, L - 0.6, Math.max(0.3, 1 / ppm), shade(body, 0.3));
    R(L / 2 - 1.2, -W * 0.25, 0.8, W * 0.5, shade(body, -0.3));
  }
  // Turret and gun: toward the first mounted weapon's aim.
  const gun = t.modules.find((m) => m.weapon);
  const a = (gun ? gun.aim : t.rot) - t.rot;
  const tr = Math.min(L, W) * 0.28;
  const n = Math.max(1, Math.ceil(L * 0.55 * ppm));
  x.fillStyle = '#111';
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * L * 0.55;
    x.fillRect(Math.round(ox + Math.cos(a) * f * ppm), Math.round(oy + Math.sin(a) * f * ppm), Math.max(1, Math.round(0.35 * ppm)), Math.max(1, Math.round(0.35 * ppm)));
  }
  x.fillStyle = shade(body, 0.15);
  const rp = Math.max(1, tr * ppm);
  x.fillRect(Math.round(ox - rp), Math.round(oy - rp), Math.round(rp * 2), Math.round(rp * 2));
  x.fillStyle = enemy ? '#ff5252' : '#4dd0e1';
  x.fillRect(Math.round(ox - 0.5), Math.round(oy - 0.5), 1, 1);
  if (t.hitFlash > 0) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = `rgba(255,255,255,${Math.min(0.6, t.hitFlash * 4)})`;
    x.fillRect(0, 0, cw, chh);
    x.globalCompositeOperation = 'source-over';
  }
  void time;
  outlineCanvas(c);
  return { canvas: c, cx: ox, cy: oy };
}
