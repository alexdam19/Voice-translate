import { MODULES, TITAN_SKYLIGHT, TITAN_TOWER } from '../../game/defs';
import type { Game } from '../../game/game';
import { compIndex } from '../../game/systems/titan';
import type { ModuleInst, Tank } from '../../game/tank';
import { RARITIES } from '../../shared/rarity';
import { WEAPONS } from '../../shared/weapons';
import { ctx2d, hash2, makeCanvas, shade } from './pixels';

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

export interface Painted {
  canvas: HTMLCanvasElement;
  /** Pixel of the hull's centre in the canvas. */
  cx: number;
  cy: number;
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
  const look = t.kind === 'rival' ? RIVAL : t.kind === 'remote' ? REMOTE : PLAYER;
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

  /* ---- Crawlers: four a side, treads running at each side's speed ---- */
  const cl = L * 0.22, cwid = W * 0.16, gap = (L * 0.96 - cl * 4) / 3;
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const k = i % 4;
    const x0 = L * 0.48 - cl - k * (cl + gap);
    const y0 = side < 0 ? -W / 2 : W / 2 - cwid;
    const health = g && t === g.player ? g.titan.crawlers[i] : 1;
    R(x0, y0, cl, cwid, look.tread);
    // Track links slide back as the side drives forward.
    const pitch = 2.6;
    const phase = ((t.sidePhase[side < 0 ? 0 : 1] % pitch) + pitch) % pitch;
    if (health > 0.1 && ppm * pitch >= 1.6) for (let m = x0 + cl - phase; m > x0; m -= pitch) R(m, y0 + 0.6, Math.max(0.6, 0.35 * pitch), cwid - 1.2, look.link);
    // Sprockets at each end, and the suspension riding up.
    R(x0, y0 + 1, 1.2, cwid - 2, '#0c0c0e');
    R(x0 + cl - 1.2, y0 + 1, 1.2, cwid - 2, '#0c0c0e');
    const lift = t.susp[i] ?? 0;
    if (lift > 0.4 && detail) R(x0 + cl * 0.2, y0 + (side < 0 ? cwid - 1.5 : 0.5), cl * 0.6, 1, '#3e4148');
    if (health < 0.35) {
      R(x0 + cl * 0.3, y0 + cwid * 0.3, cl * 0.4, cwid * 0.4, health <= 0.1 ? '#2a1208' : '#5a2a14');
      if (health <= 0.1) R(x0 + cl * 0.45, y0, 2, cwid, '#050505');
    }
  }

  /* ---- Hull ---- */
  const hw = W * 0.345;
  const bow = L * 0.39, stern = -L * 0.49;
  R(stern, -hw, bow - stern, hw * 2, look.hull);
  // Side armour and the blue light strips.
  R(stern, -hw, bow - stern, W * 0.05, look.plate);
  R(stern, hw - W * 0.05, bow - stern, W * 0.05, shade(look.plate, -0.18));
  const pulse = 0.55 + 0.45 * Math.sin(time * 2.4);
  const strip = shade(look.strip, -0.35 + 0.35 * pulse);
  for (let m = stern + 6; m < bow - 6; m += 9) {
    R(m, -hw + W * 0.05, 6, Math.max(0.8, 1 / ppm), strip);
    R(m, hw - W * 0.05 - Math.max(0.8, 1 / ppm), 6, Math.max(0.8, 1 / ppm), strip);
  }
  // The faceted prow: a wedge in steps, lit on the port facet, with the grille and hazard stripes.
  const tip = L * 0.5;
  const cols = Math.max(1, Math.ceil((tip - bow) * ppm));
  for (let i = 0; i < cols; i++) {
    const m = bow + i / ppm;
    const f = (m - bow) / (tip - bow);
    const half = hw * (1 - f * 0.72);
    R(m, -half, 1 / ppm + 0.01, half, shade(look.hull, 0.12));
    R(m, 0, 1 / ppm + 0.01, half, shade(look.hull, -0.12));
    if (fine && f > 0.1 && f < 0.75 && Math.floor(m * 0.9) % 2 === 0) R(m, -half * 0.55, 1 / ppm + 0.01, half * 1.1, look.dark);
    if (f > 0.86) R(m, -half, 1 / ppm + 0.01, half * 2, Math.floor(m * 0.8) % 2 ? '#e6b422' : '#111');
  }
  // Plating seams.
  if (fine) {
    for (let m = stern + 10; m < bow; m += 12) R(m, -hw + W * 0.05, 0.5, hw * 2 - W * 0.1, look.dark);
    R(stern, -0.25, bow - stern, 0.5, look.dark);
  }
  // Engine deck: grilles and four stacks.
  R(stern, -hw * 0.8, L * 0.16, hw * 1.6, look.deck);
  if (detail) for (let m = stern + 2; m < stern + L * 0.15; m += 2.2) R(m, -hw * 0.7, 0.8, hw * 1.4, look.dark);
  const od = g && t === g.player && g.helm.overdrive;
  const moving = Math.min(1, Math.abs(t.speed) / 8);
  for (const sy of [-0.62, -0.22, 0.22, 0.62]) {
    const sx = stern + L * 0.06, syy = sy * hw;
    disc(sx, syy, 3.2, '#16171a');
    const glow = od ? (Math.sin(time * 30 + sy * 9) > 0 ? '#ffcc40' : '#ff6d00') : moving > 0.2 ? '#6b3a20' : '#2a2a2c';
    disc(sx, syy, 1.8, glow);
  }
  // Hull number on the engine deck (and the tail lights).
  const digitH = 9, px = digitH / 5;
  if (digitH * ppm >= 5) {
    const text = '07';
    for (let k = 0; k < text.length; k++) {
      const rows = DIGITS[text[k]];
      for (let ry = 0; ry < 5; ry++) {
        for (let rx = 0; rx < 3; rx++) {
          if (rows[ry][rx] !== '1') continue;
          // Read along the hull from the stern: rotate the digits so they face aft.
          R(stern + L * 0.19 + (4 - ry) * px, -3.8 * px + k * 4 * px + rx * px, px, px, look.mark);
        }
      }
    }
  }
  R(stern, -hw, 1.2, 4, '#ff1744');
  R(stern, hw - 4, 1.2, 4, '#ff1744');
  R(tip - 5, -hw * 0.4, 1.5, 2, '#fff9c4');
  R(tip - 5, hw * 0.4 - 2, 1.5, 2, '#fff9c4');

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
  return { canvas: c, cx: ox, cy: oy };
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
  return { canvas: c, cx: ox, cy: oy };
}
