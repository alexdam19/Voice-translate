import { batteryLocal, MODULES } from '../../game/defs';
import type { Game } from '../../game/game';
import { compIndex, toroidOut } from '../../game/systems/titan';
import { drawToroid, TOROID_FRAMES, TOROID_SHEET, toroidFrames } from './toroids';
import type { ModuleInst, Tank } from '../../game/tank';
import { hash2, makeCanvas, shade } from './pixels';
import { GUN_PX, TOP_MARKS, TOP_PX, topScale, topToHull } from './shipArt';
import { crawlerRects, nozzleSpots, stackSpots, titanSil, titanTop, topPalette, type TopPal } from './titanTop';
import { engineDef } from '../../game/systems/engine';
import type { HullLight } from './titan2d';
import { TURRET_PIVOT, TURRET_R, TURRET_S, turretFamily, turretRing, turretSprite } from './turretArt';
import { RARITIES } from '../../shared/rarity';
import { WEAPONS } from '../../shared/weapons';

/**
 * The Titan in the tactical view, painted from code (see titanTop.ts for the hull) so it's a whole ship at every
 * zoom: the hull straight down; the crawler banks' tread links running at each side's speed (red-hot and broken
 * where the horde has mauled a bank); the four toroids turning; the main batteries painted and turned to their
 * targets (barrels recoiling, red laser sights); every gun you've mounted on the pads; nests, radar, coils, shield
 * emitters and armour on the roof; crew walking the side walkways; the light strips pulsing; the exhaust stacks
 * flaring and the engine pods throwing flames astern (longer for a bigger engine, far longer in overdrive); scorch
 * marks where the armour has been hammered; fires through the deck.
 *
 * Everything is drawn straight into the view in hull metres (forward +x, starboard +y).
 */

/** Tread link pitch (m). */
const TREAD_PITCH = 1.6;

/** Per-hull animation state: last draw time, each side's tread offset, each toroid's spin. */
const anim = new WeakMap<Tank, { t: number; tread: [number, number]; spin: number[] }>();

let scorchImg: HTMLCanvasElement | null = null;

/** A burn mark: a ragged black-brown blotch with a few embers. */
function scorch(): HTMLCanvasElement {
  if (scorchImg) return scorchImg;
  const S = 28;
  const c = makeCanvas(S, S);
  const x = c.getContext('2d')!;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const dx = (i + 0.5 - S / 2) / (S / 2), dy = (j + 0.5 - S / 2) / (S / 2);
      const r = Math.hypot(dx, dy) + (hash2(i >> 1, j >> 1, 7) - 0.5) * 0.45;
      if (r > 1) continue;
      const a = Math.min(1, (1 - r) * 1.9);
      const v = 8 + hash2(i, j, 3) * 14;
      x.fillStyle = `rgba(${v + 6},${v},${v - 4},${a * 0.85})`;
      x.fillRect(i, j, 1, 1);
    }
  }
  for (let k = 0; k < 5; k++) {
    x.fillStyle = k % 2 ? '#ff9100' : '#ffcc40';
    x.fillRect(Math.floor(S / 2 + (hash2(k, 1, 9) - 0.5) * S * 0.5), Math.floor(S / 2 + (hash2(k, 2, 9) - 0.5) * S * 0.5), 1, 1);
  }
  scorchImg = c;
  return c;
}

/** Where each armour zone's scorch marks go (fractions of half-length, half-width). */
const ZONE_BOX: Record<string, [number, number, number, number]> = {
  bow: [0.5, 0.9, -0.55, 0.55],
  stern: [-0.9, -0.55, -0.6, 0.6],
  port: [-0.55, 0.5, -0.82, -0.45],
  starboard: [-0.55, 0.5, 0.45, 0.82],
  roof: [-0.45, 0.45, -0.35, 0.35],
};

/**
 * Draws a Titan at screen position (sx, sy), turned to `a` (heading plus the view's turn), at `ppm` screen pixels per
 * metre. Returns the lights to glow.
 */
export function drawTitanSprite(c: CanvasRenderingContext2D, t: Tank, g: Game | null, time: number, sx: number, sy: number, a: number, ppm: number, shadow = true): HullLight[] | null {
  const pal = topPalette(t.kind, t.klass, t.dead);
  const L = t.stats.length, W = t.stats.width;
  const hl = L / 2, hw = W / 2;
  const { kx, ky } = topScale(L, W);
  const ca = Math.cos(a), sa = Math.sin(a);
  const lights: HullLight[] = [];
  const smooth = c.imageSmoothingEnabled;
  const def = engineDef(t.engineKey);
  const rear = t.modules.some((m) => m.key === 'main_gun' && m.cy > t.rows / 2);
  const art = titanTop(L, W, pal, `${t.kind}|${t.klass}|${t.dead}`, def.flame.jets, rear, ppm);
  const sil = titanSil(L, W);

  // Drop shadow to the south-east.
  if (shadow) {
    const off = Math.max(1, Math.round(6 * ppm));
    c.globalAlpha = 0.45;
    c.imageSmoothingEnabled = true;
    c.setTransform(ca * ppm, sa * ppm, -sa * ppm, ca * ppm, sx + off, sy + off * 0.8);
    c.drawImage(sil.shadow, sil.x0, sil.y0, sil.w, sil.h);
    c.globalAlpha = 1;
  }

  // The hull (painted at about this zoom: shrunk smooth, never blown up by much).
  c.setTransform(ca * ppm, sa * ppm, -sa * ppm, ca * ppm, sx, sy);
  c.imageSmoothingEnabled = ppm < art.d * 0.98;
  c.imageSmoothingQuality = 'medium';
  c.drawImage(art.top, art.x0, art.y0, art.w, art.h);

  // Running gear: each side's tread links travel at that side's speed (capped where they'd strobe); a crawler
  // bank the horde or the guns have mauled shows it, red-hot and broken.
  let st = anim.get(t);
  if (!st) {
    st = { t: time, tread: [0, 0], spin: [0, 0, 0, 0] };
    anim.set(t, st);
  }
  const fdt = Math.max(0, Math.min(0.1, time - st.t));
  st.t = time;
  const own = !!(g && t === g.player);
  if (!t.dead) {
    for (let s = 0; s < 2; s++) {
      const v = Math.max(-40, Math.min(40, t.sideSpeed[s] ?? t.speed));
      st.tread[s] = (((st.tread[s] + v * fdt) % TREAD_PITCH) + TREAD_PITCH) % TREAD_PITCH;
    }
  }
  const linkPx = TREAD_PITCH * ppm;
  for (const r of crawlerRects(L, W)) {
    const hp = own ? g!.titan.crawlers[r.i] ?? 1 : 1;
    const side = r.i < 4 ? 0 : 1;
    const broken = hp <= 0.1;
    if (linkPx >= 2.5) {
      c.fillStyle = pal.d3;
      const off = st.tread[side];
      for (let q = r.x0 + off; q < r.x1; q += TREAD_PITCH) {
        if (broken && hash2(Math.floor(q), r.i, 4) < 0.35) continue;
        c.fillRect(q, r.ty0 + 0.3, TREAD_PITCH * 0.45, r.ty1 - r.ty0 - 0.6);
      }
      if (linkPx >= 6) {
        c.fillStyle = pal.d6;
        for (let q = r.x0 + off; q < r.x1; q += TREAD_PITCH) c.fillRect(q, r.ty0 + 0.3, TREAD_PITCH * 0.12, r.ty1 - r.ty0 - 0.6);
      }
    }
    if (hp < 0.7) {
      c.globalAlpha = Math.min(0.55, (0.7 - hp) * 0.9);
      c.fillStyle = broken ? '#ff3d00' : '#ff8a3a';
      c.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      c.globalAlpha = 1;
      if (broken) lights.push({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, r: 10, color: '#ff5a1a', k: 0.35 + 0.15 * Math.sin(time * 9 + r.i) });
    }
  }

  // The four toroidal engines on their pylons, each spinning and glowing with its push.
  const core = pal.glow === '#000000' ? '#18ffff' : t.kind === 'rival' ? '#ff3b30' : t.kind === 'main' ? pal.glow : '#18ffff';
  const turn = Math.max(-1, Math.min(1, t.yawRate / 0.08));
  const push = Math.max(Math.abs(t.throttle) * (own ? t.spool : 1), Math.min(1, Math.abs(t.speed) / 20));
  const thrust: number[] = [];
  const ringM = 28 * kx;
  c.imageSmoothingEnabled = false;
  for (let i = 0; i < 4; i++) {
    const out = own ? toroidOut(g!.titan, g!.helm.toroids, i) : t.dead ? 0 : 1;
    const port = i % 2 === 0;
    // A turn: the outside pair pushes harder, the inside pair eases off.
    const k = out * (0.15 + 0.85 * push) * Math.max(0, 1 + (port ? 0.6 : -0.6) * turn);
    thrust.push(k);
    st.spin[i] = (st.spin[i] + fdt * (0.6 + 14 * k)) % TOROID_FRAMES;
    const [px, py] = TOROID_SHEET[i];
    const lx = (px - TOP_PX.cx) * kx, ly = (py - TOP_PX.cy) * ky;
    const frames = toroidFrames(core, out <= 0 && !(own && !g!.helm.toroids[i]) ? true : false);
    drawToroid(c, lx, ly, ringM, frames[Math.floor(st.spin[i]) % TOROID_FRAMES], port ? ringM * 0.6 : -ringM * 0.6);
  }

  // Scorch marks where the armour's been hammered (your zones; anyone else's by their hull points).
  const burns: [string, number][] = g && t === g.player ? Object.entries(g.titan.zones) : [['roof', t.hp / Math.max(1, t.stats.maxHp)], ['port', t.hp / Math.max(1, t.stats.maxHp)], ['starboard', t.hp / Math.max(1, t.stats.maxHp)]];
  const sc = scorch();
  c.imageSmoothingEnabled = true;
  burns.forEach(([z, v], zi) => {
    const box = ZONE_BOX[z];
    if (!box) return;
    const n = Math.floor((1 - v) * 7 + 0.001);
    for (let k = 0; k < n; k++) {
      const fx = box[0] + (box[1] - box[0]) * hash2(zi, k, 11), fy = box[2] + (box[3] - box[2]) * hash2(k, zi, 12);
      const s = 7 + hash2(zi, k, 13) * 9;
      c.globalAlpha = 0.9;
      c.drawImage(sc, fx * hl - s / 2, fy * hw - s / 2, s, s);
    }
  });
  c.globalAlpha = 1;

  const pulse = 0.6 + 0.4 * Math.sin(time * 2.4);
  const cell = t.cell;
  const cellX = (cy: number): number => (t.rows / 2 - cy) * cell;
  const cellY = (cx: number): number => (cx - t.cols / 2) * cell;

  // Crew going about the deck along the walkways (close up).
  if (!t.dead && !t.indoors && ppm >= 2.5) deckCrew(c, time, hl, hw, ppm);

  // What's built on the roof: guns on the pads and mounts, nests, masts, coils, emitters, hatches.
  c.imageSmoothingEnabled = false;
  for (const m of t.modules) {
    if (m.deck !== 0 || m.key === 'main_gun') continue;
    const d = MODULES[m.key];
    const mx0 = cellX(m.cy + d.h), my0 = cellY(m.cx), mw = d.h * cell, mh = d.w * cell;
    if (d.hardpoint) {
      if (m.weapon) padGun(c, t, m, mx0 + mw / 2, my0 + mh / 2, ppm, lights);
    } else roofThing(c, t, m, mx0, my0, mw, mh, ppm, time, pulse, lights);
  }

  // The main batteries.
  for (const m of t.modules) if (m.key === 'main_gun') battery(c, t, m, pal, kx, ppm, lights);

  // The light strips glow (a wreck's are out).
  if (!t.dead) {
    c.globalCompositeOperation = 'lighter';
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.55 + 0.3 * pulse;
    c.drawImage(art.glow, art.x0, art.y0, art.w, art.h);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    for (const [px, py] of TOP_MARKS.lamps) {
      const [lx, ly] = topToHull(px, py, L, W);
      lights.push({ x: lx, y: ly, r: 7, color: pal.glow, k: 0.3 * pulse + 0.15 });
    }
    // Headlights on the ground ahead.
    for (const s of [-1, 1]) lights.push({ x: hl + 22, y: s * 0.42 * hw, r: 26, color: '#fff3c4', k: 0.1 });
  }

  // Exhaust: the stacks glow and flare, the engine pods throw flames out astern, as long and as hot as the engine
  // is big and hard-driven (and far longer in overdrive, stage by stage).
  if (!t.dead) exhaust(c, t, g, time, push, def.flame, lights);

  // Toroid plumes: a neon wash streaming aft of each ring, as long as it pushes hard.
  const od = own && g!.helm.overdrive;
  if (!t.dead) {
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const k = thrust[i];
      if (k < 0.05) continue;
      const [px, py] = TOROID_SHEET[i];
      const lx = (px - TOP_PX.cx) * kx, ly = (py - TOP_PX.cy) * ky;
      const len = ringM * (0.6 + 2.6 * k) * (od ? 1.5 : 1) * (i < 2 ? 0.6 : 1);
      const flick = 0.85 + 0.15 * Math.sin(time * 37 + i * 2.1);
      const gr = c.createLinearGradient(lx, 0, lx - len, 0);
      gr.addColorStop(0, core);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = Math.min(0.85, 0.25 + 0.6 * k) * flick;
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(lx, ly - ringM * 0.32);
      c.lineTo(lx - len, ly - ringM * 0.08);
      c.lineTo(lx - len, ly + ringM * 0.08);
      c.lineTo(lx, ly + ringM * 0.32);
      c.closePath();
      c.fill();
      lights.push({ x: lx - ringM * 0.3, y: ly, r: ringM * (0.45 + 0.5 * k), color: core, k: 0.12 + 0.3 * k });
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  // Fires in burning compartments show through the deck.
  if (g && t === g.player) {
    for (let deck = 1; deck <= 7; deck++) {
      for (let s = 0; s < 3; s++) {
        const f = g.titan.fire[compIndex(deck, s)] ?? 0;
        if (f <= 0.02) continue;
        const fx = (1 - s) * 0.6 * hl + (hash2(deck, s, 1) - 0.5) * 20, fy = ((deck % 3) - 1) * 0.5 * hw;
        const n = 4 + Math.floor(f * 10);
        for (let k = 0; k < n; k++) {
          const flick = Math.sin(time * 14 + k * 3.1 + deck) * 0.5 + 0.5;
          const r = (1.2 + f * 3.2) * (0.6 + flick * 0.6);
          c.fillStyle = k % 3 === 0 ? '#ffe082' : k % 3 === 1 ? '#ff9100' : '#ff3d00';
          c.beginPath();
          c.arc(fx + (hash2(k, deck, s) - 0.5) * 10 * f, fy + (hash2(k, s, deck) - 0.5) * 8 * f, r, 0, Math.PI * 2);
          c.fill();
        }
        lights.push({ x: fx, y: fy, r: 8 + f * 10, color: '#ff6d00', k: 0.35 + f * 0.4 });
      }
    }
  }

  // Struck: the whole hull flashes.
  if (t.hitFlash > 0 && !t.dead) {
    c.globalAlpha = Math.min(0.4, t.hitFlash * 3);
    c.imageSmoothingEnabled = true;
    c.drawImage(sil.flash, sil.x0, sil.y0, sil.w, sil.h);
    c.globalAlpha = 1;
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = smooth;
  return t.dead ? [] : lights;
}

/** Crew walking the side walkways, up and back, in hi-vis and blue (drawn a little larger than life to read). */
function deckCrew(c: CanvasRenderingContext2D, time: number, hl: number, hw: number, ppm: number): void {
  const a0 = -hl * 0.88, a1 = hl * 0.6;
  const n = 14;
  const k = Math.max(1.4, Math.min(2.2, 12 / ppm));
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1;
    const sp = 1.1 + hash2(i, 3, 5) * 0.8;
    const span = a1 - a0;
    const u = ((time * sp + hash2(i, 1, 5) * span * 2) % (span * 2) + span * 2) % (span * 2);
    const fwd = u < span;
    const px = a0 + (fwd ? u : span * 2 - u);
    const py = s * hw * 0.62 + (hash2(i, 2, 5) - 0.5) * 1.2;
    const bob = Math.sin(time * 9 + i) * 0.06 * k;
    const dir = fwd ? 1 : -1;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(px + 0.3 * k, py + 0.35 * k, 0.45 * k, 0.32 * k, 0, 0, Math.PI * 2);
    c.fill();
    // Shoulders, then the helmet; a tool or rifle carried ahead.
    c.fillStyle = '#0a0c10';
    c.beginPath();
    c.ellipse(px, py + bob, 0.5 * k, 0.36 * k, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = i % 3 === 0 ? '#ff8a1a' : i % 3 === 1 ? '#2a5a9a' : '#d8a820';
    c.beginPath();
    c.ellipse(px, py + bob, 0.42 * k, 0.3 * k, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = i % 3 === 1 ? '#ffd740' : '#e8e8e0';
    c.beginPath();
    c.arc(px + 0.08 * k * dir, py + bob, 0.2 * k, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1a1a1a';
    c.fillRect(px + (dir > 0 ? 0.25 : -0.55) * k, py + bob - 0.05 * k, 0.3 * k, 0.1 * k);
  }
}

/** Stack glow, heat and flame, and the engine pods' jets astern. */
function exhaust(c: CanvasRenderingContext2D, t: Tank, g: Game | null, time: number, push: number, flame: { len: number; outer: string; core: string; jets: number }, lights: HullLight[]): void {
  const L = t.stats.length, W = t.stats.width;
  const own = !!(g && t === g.player);
  const moving = Math.min(1, Math.abs(t.speed) / 10);
  const stage = own && g!.helm.overdrive ? Math.max(1, g!.helm.odStage) : 0;
  const k = own ? Math.max(0.12, push) : Math.max(0.1, moving);
  const size = L / 200;
  c.globalCompositeOperation = 'lighter';
  // The stacks: a hot throat, and a flare from each that grows with the load (and leans aft as she picks up speed).
  for (const s of stackSpots(L, W, flame.jets)) {
    const flick = 0.75 + 0.25 * Math.sin(time * 23 + s.y * 3);
    const r = (2 + 5 * k + 3 * stage) * flick * size;
    const lean = Math.min(1, Math.abs(t.speed) / 25) * r * 1.2;
    const gr = c.createRadialGradient(s.x - lean * 0.4, s.y, 0, s.x - lean * 0.4, s.y, r);
    gr.addColorStop(0, flame.core);
    gr.addColorStop(0.35, flame.outer);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = Math.min(1, 0.35 + 0.65 * k);
    c.fillStyle = gr;
    c.beginPath();
    c.ellipse(s.x - lean * 0.5, s.y, r + lean * 0.5, r, 0, 0, Math.PI * 2);
    c.fill();
    lights.push({ x: s.x, y: s.y, r: r * 1.8, color: flame.outer, k: 0.25 + 0.4 * k });
  }
  // The pods' jets: long flames out astern, a bright core, shock diamonds in overdrive II and III.
  const noz = nozzleSpots(L, W).slice(0, Math.max(2, Math.min(4, flame.jets)));
  for (const n of noz) {
    const flick = 0.85 + 0.15 * Math.sin(time * 41 + n.y * 7);
    const len = flame.len * size * (0.4 + 0.8 * k) * (1 + 0.55 * stage) * flick * (n.big ? 1 : 0.7);
    const wdt = (n.big ? 3.2 : 2.3) * size * (1 + 0.15 * stage);
    const gr = c.createLinearGradient(n.x, 0, n.x - len, 0);
    gr.addColorStop(0, flame.outer);
    gr.addColorStop(0.5, flame.outer + '88');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = Math.min(1, 0.3 + 0.7 * k);
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(n.x, n.y - wdt);
    c.quadraticCurveTo(n.x - len * 0.3, n.y - wdt * 1.35, n.x - len, n.y);
    c.quadraticCurveTo(n.x - len * 0.3, n.y + wdt * 1.35, n.x, n.y + wdt);
    c.closePath();
    c.fill();
    const cg = c.createLinearGradient(n.x, 0, n.x - len * 0.55, 0);
    cg.addColorStop(0, flame.core);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = cg;
    c.beginPath();
    c.moveTo(n.x, n.y - wdt * 0.45);
    c.lineTo(n.x - len * 0.55, n.y);
    c.lineTo(n.x, n.y + wdt * 0.45);
    c.closePath();
    c.fill();
    if (stage >= 2) {
      c.fillStyle = flame.core;
      for (let q = 1; q <= stage + 1; q++) {
        const dx = n.x - (len * q) / (stage + 3);
        c.globalAlpha = 0.5 * flick;
        c.beginPath();
        c.ellipse(dx, n.y, wdt * 0.5, wdt * 0.28, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    lights.push({ x: n.x - len * 0.35, y: n.y, r: Math.max(8, len * 0.6), color: flame.outer, k: Math.min(0.95, 0.25 + 0.5 * k + 0.15 * stage) * flick });
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/**
 * A main battery, painted: the barbette ring it turns on, the long octagonal gunhouse (lit on its sunward facets),
 * the rangefinder across its back, the commander's cupola and hatches, vents, a light strip in the hull's colour,
 * the mantlet, and two long barrels with bore evacuators and muzzle brakes that slide back when it fires. Red laser
 * sights run out ahead of the muzzles.
 */
function battery(c: CanvasRenderingContext2D, t: Tank, m: ModuleInst, P: TopPal, kx: number, ppm: number, lights: HullLight[]): void {
  const L = t.stats.length, W = t.stats.width;
  const rear = m.cy > t.rows / 2;
  const [px, py] = batteryLocal(L, W, rear);
  const u = kx * (rear ? 0.72 : 1);
  const ra = m.aim - t.rot;
  const back = Math.min(0.35, m.recoil ?? 0) * 26;
  const muzzle = GUN_PX.muzzle - GUN_PX.px;
  const fine = ppm * u;
  const house: [number, number][] = [[-34, -18], [-26, -26], [14, -26], [30, -14], [30, 14], [14, 26], [-26, 26], [-34, 18]];
  const polyP = (pts: [number, number][]): void => {
    c.beginPath();
    pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
    c.closePath();
  };
  c.save();
  c.translate(px, py);
  // Its shadow on the deck.
  c.save();
  c.translate(1.6, 1.3);
  c.rotate(ra);
  c.scale(u, u);
  c.globalAlpha = 0.35;
  c.fillStyle = '#000';
  polyP(house);
  c.fill();
  for (const o of GUN_PX.twin) c.fillRect(20 - back, o - 3, muzzle - 20, 6);
  c.globalAlpha = 1;
  c.restore();
  c.rotate(ra);
  c.scale(u, u);
  // Barrels first (they slide back into the mantlet as they recoil).
  for (const o of GUN_PX.twin) {
    const x0 = 20 - back, x1 = muzzle - back;
    c.fillStyle = P.d0;
    c.fillRect(x0, o - 3.3, x1 - x0, 6.6);
    c.fillStyle = P.d5;
    c.fillRect(x0, o - 2.8, 70, 5.6);
    c.fillRect(x0 + 70, o - 2.3, x1 - x0 - 70, 4.6);
    c.fillStyle = P.d7;
    c.fillRect(x0, o - 2.8, 70, 1.4);
    c.fillRect(x0 + 70, o - 2.3, x1 - x0 - 70, 1.1);
    c.fillStyle = P.d3;
    c.fillRect(x0, o + 1.4, x1 - x0, 1.2);
    // Bore evacuator.
    c.fillStyle = P.d6;
    c.fillRect(x0 + 62, o - 3.5, 16, 7);
    c.fillStyle = P.d7;
    c.fillRect(x0 + 62, o - 3.5, 16, 1.5);
    // Muzzle brake.
    c.fillStyle = P.d0;
    c.fillRect(x1 - 13, o - 4.2, 14, 8.4);
    c.fillStyle = P.d5;
    c.fillRect(x1 - 12.5, o - 3.7, 13, 7.4);
    if (fine >= 0.35) {
      c.fillStyle = P.d1;
      for (const q of [x1 - 10, x1 - 6, x1 - 2]) c.fillRect(q, o - 3.7, 1.4, 7.4);
    }
  }
  // The gunhouse.
  c.fillStyle = P.d0;
  c.save();
  c.scale(1.04, 1.04);
  polyP(house);
  c.fill();
  c.restore();
  c.fillStyle = P.d4;
  polyP(house);
  c.fill();
  // Sunward (port) facets lit, the far ones shaded, the roof plate raised in the middle.
  c.fillStyle = P.d6;
  polyP([[-26, -26], [14, -26], [30, -14], [20, -14], [8, -19], [-22, -19]]);
  c.fill();
  c.fillStyle = P.d2;
  polyP([[-26, 26], [14, 26], [30, 14], [20, 14], [8, 19], [-22, 19]]);
  c.fill();
  c.fillStyle = P.d5;
  polyP([[-28, -16], [-22, -19], [8, -19], [20, -14], [20, 14], [8, 19], [-22, 19], [-28, 16]]);
  c.fill();
  c.fillStyle = shade(P.d5, 0.12);
  c.fillRect(-24, -16, 40, 3);
  // Rangefinder across the back, its lenses out past the sides.
  c.fillStyle = P.d0;
  c.fillRect(-17, -33, 9, 66);
  c.fillStyle = P.d4;
  c.fillRect(-16.5, -32.5, 8, 65);
  c.fillStyle = P.d6;
  c.fillRect(-16.5, -32.5, 8, 2);
  c.fillStyle = P.glass;
  c.fillRect(-15, -33.5, 5, 2);
  c.fillRect(-15, 31.5, 5, 2);
  // Mantlet.
  c.fillStyle = P.d0;
  c.fillRect(22, -15, 11, 30);
  c.fillStyle = P.d5;
  c.fillRect(22.5, -14.5, 10, 29);
  c.fillStyle = P.d6;
  c.fillRect(22.5, -14.5, 10, 2);
  if (fine >= 0.25) {
    // Cupola, hatch, periscopes, rear vents, bolts.
    c.fillStyle = P.d0;
    c.beginPath();
    c.arc(-4, 11, 6.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = P.d6;
    c.beginPath();
    c.arc(-4, 11, 5.8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = P.d3;
    c.beginPath();
    c.arc(-4, 11, 3.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = P.glass;
    for (let k = 0; k < 5; k++) {
      const an = -Math.PI / 2 + (k - 2) * 0.55;
      c.fillRect(-4 + Math.cos(an) * 5 - 0.8, 11 + Math.sin(an) * 5 - 0.8, 1.6, 1.6);
    }
    c.fillStyle = P.d0;
    c.fillRect(-2, -14, 9, 9);
    c.fillStyle = P.d6;
    c.fillRect(-1.5, -13.5, 8, 8);
    c.fillStyle = P.d3;
    c.fillRect(0, -12, 5, 1);
    c.fillStyle = P.d1;
    for (let k = 0; k < 6; k++) c.fillRect(-31, -12 + k * 4.2, 6, 2);
    c.fillStyle = P.d7;
    for (let k = 0; k < 7; k++) {
      c.fillRect(-22 + k * 6, -24.5, 1, 1);
      c.fillRect(-22 + k * 6, 23.5, 1, 1);
    }
  }
  // The light strip in the hull's colour.
  if (!t.dead) {
    c.fillStyle = P.glow;
    c.fillRect(-22, -21.5, 36, 1.2);
    c.fillRect(-22, 20.3, 36, 1.2);
  }
  const reach = muzzle - back;
  // Red laser sights off both muzzles.
  if (!t.dead && m.weapon) {
    c.strokeStyle = 'rgba(255,48,40,0.55)';
    c.lineWidth = Math.max(0.12, 1 / ppm) / u;
    c.beginPath();
    for (const o of GUN_PX.twin) {
      c.moveTo(reach, o);
      c.lineTo(reach + 70 / u, o);
    }
    c.stroke();
    c.fillStyle = '#ff5a4a';
    for (const o of GUN_PX.twin) c.fillRect(reach - 1, o - 1, 2, 2);
  }
  c.restore();
  if ((m.recoil ?? 0) > 0.25) lights.push({ x: px + Math.cos(ra) * reach * u, y: py + Math.sin(ra) * reach * u, r: 12, color: '#fff3a0', k: 0.9 });
}

/** Something built on the roof that isn't a gun, drawn to sit on the sheet's plating rather than hide it. */
function roofThing(c: CanvasRenderingContext2D, t: Tank, m: ModuleInst, x0: number, y0: number, mw: number, mh: number, ppm: number, time: number, pulse: number, lights: HullLight[]): void {
  const px = 1 / ppm;
  const cx = x0 + mw / 2, cy = y0 + mh / 2;
  if (!m.built) {
    // Going up: hazard tape round a scaffold.
    c.fillStyle = 'rgba(10,12,16,0.55)';
    c.fillRect(x0 + 0.5, y0 + 0.5, mw - 1, mh - 1);
    for (let k = 0; k < mw; k += 1.5) {
      c.fillStyle = Math.floor(k / 1.5) % 2 ? '#141414' : '#e0b020';
      c.fillRect(x0 + k, y0, 1.5, 0.7);
      c.fillRect(x0 + k, y0 + mh - 0.7, 1.5, 0.7);
    }
    for (let k = 0; k < mh; k += 1.5) {
      c.fillStyle = Math.floor(k / 1.5) % 2 ? '#141414' : '#e0b020';
      c.fillRect(x0, y0 + k, 0.7, 1.5);
      c.fillRect(x0 + mw - 0.7, y0 + k, 0.7, 1.5);
    }
    return;
  }
  const d = MODULES[m.key];
  if (m.key === 'armor' || m.key === 'heavy_armor') {
    // Bolted armour: a thick slab with a bevel, its bolts, heavier plate doubled up.
    const heavy = m.key === 'heavy_armor';
    c.fillStyle = '#07090c';
    c.fillRect(x0 + 0.2, y0 + 0.2, mw - 0.4, mh - 0.4);
    c.fillStyle = heavy ? '#4a4f58' : '#40464f';
    c.fillRect(x0 + 0.5, y0 + 0.5, mw - 1, mh - 1);
    c.fillStyle = '#6a7482';
    c.fillRect(x0 + 0.5, y0 + 0.5, mw - 1, 0.5);
    c.fillStyle = '#23272e';
    c.fillRect(x0 + 0.5, y0 + mh - 1, mw - 1, 0.5);
    if (heavy) {
      c.fillStyle = '#353a42';
      c.fillRect(x0 + 1.4, y0 + 1.4, mw - 2.8, mh - 2.8);
    }
    if (ppm >= 2) {
      c.fillStyle = '#9aa2ac';
      for (const bx of [x0 + 1, x0 + mw - 1.4]) for (const by of [y0 + 1, y0 + mh - 1.4]) c.fillRect(bx, by, 0.4, 0.4);
    }
    return;
  }
  if (d.nest) {
    // A ring of sandbags round a dark pit, its soldiers at the parapet.
    const rx = mw / 2 - 1.3, ry = mh / 2 - 1.3;
    c.fillStyle = 'rgba(8,9,12,0.7)';
    c.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    const n = 14;
    for (let k = 0; k < n; k++) {
      const u = (k / n) * Math.PI * 2;
      const bx = cx + Math.cos(u) * rx, by = cy + Math.sin(u) * ry;
      c.fillStyle = '#2a261e';
      c.beginPath();
      c.ellipse(bx, by, 1.25, 0.85, u + Math.PI / 2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = k % 2 ? '#8a7c5c' : '#9c8e6a';
      c.beginPath();
      c.ellipse(bx - 0.1, by - 0.1, 1.05, 0.65, u + Math.PI / 2, 0, Math.PI * 2);
      c.fill();
    }
    if (!t.indoors) for (let k = 0; k < 4; k++) {
      const u = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const sx = cx + Math.cos(u) * (rx - 1.4), sy = cy + Math.sin(u) * (ry - 1.4);
      c.fillStyle = '#1c2016';
      c.beginPath();
      c.arc(sx, sy, 0.75, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5a6a3a';
      c.beginPath();
      c.arc(sx - 0.08, sy - 0.08, 0.55, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#20241a';
      c.fillRect(sx, sy - 0.12, Math.cos(u) * 1.6 || 0.2, 0.25);
    }
    void px;
    return;
  }
  // A base plate in the hull's own dark steel, lit along its top edge.
  c.fillStyle = '#0c0e12';
  c.fillRect(x0 + 0.6, y0 + 0.6, mw - 1.2, mh - 1.2);
  c.fillStyle = '#262c36';
  c.fillRect(x0 + 1, y0 + 1, mw - 2, mh - 2);
  c.fillStyle = '#56627a';
  c.fillRect(x0 + 1, y0 + 1, mw - 2, px);
  if (m.key === 'radar') {
    const ra = time * 2;
    c.strokeStyle = '#d0dce8';
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(cx - Math.cos(ra) * mw * 0.42, cy - Math.sin(ra) * mh * 0.42);
    c.lineTo(cx + Math.cos(ra) * mw * 0.42, cy + Math.sin(ra) * mh * 0.42);
    c.stroke();
    c.fillStyle = Math.floor(time * 1.5) % 2 ? '#ff3a30' : '#4a0e0a';
    c.fillRect(cx - 0.4, cy - 0.4, 0.8, 0.8);
  } else if (m.key === 'tesla') {
    const on = Math.sin(time * 9) > 0;
    c.fillStyle = '#3a2a5a';
    c.beginPath();
    c.arc(cx, cy, Math.min(mw, mh) * 0.34, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = on ? '#ea80fc' : '#7c4dff';
    c.beginPath();
    c.arc(cx, cy, Math.min(mw, mh) * 0.2, 0, Math.PI * 2);
    c.fill();
    lights.push({ x: cx, y: cy, r: 5, color: '#b388ff', k: on ? 0.7 : 0.35 });
  } else if (m.key === 'shield') {
    c.fillStyle = '#10283a';
    c.beginPath();
    c.arc(cx, cy, Math.min(mw, mh) * 0.36, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = `rgba(64,196,255,${0.5 + 0.4 * pulse})`;
    c.beginPath();
    c.arc(cx, cy, Math.min(mw, mh) * 0.22, 0, Math.PI * 2);
    c.fill();
    lights.push({ x: cx, y: cy, r: 7, color: '#40c4ff', k: 0.35 + 0.3 * pulse });
  } else {
    // A hangar or bay: a hatch with hazard chevrons.
    c.fillStyle = '#161a20';
    c.fillRect(x0 + 2, y0 + 2, mw - 4, mh - 4);
    for (let k = 0; k < mw - 4; k += 2) {
      c.fillStyle = Math.floor(k / 2) % 2 ? '#141414' : '#c89a20';
      c.fillRect(x0 + 2 + k, y0 + 2, 1, 0.8);
      c.fillRect(x0 + 2 + k, y0 + mh - 2.8, 1, 0.8);
    }
    c.fillStyle = '#3a4250';
    c.fillRect(cx - 0.2, y0 + 3, 0.4, mh - 6);
  }
}

/**
 * A gun on a pad or mount, drawn like the sheet's own small turrets: a dark armoured box on a ring, lit along its
 * edge, barrels (twin on the bigger guns) with muzzle brakes, a red sight at the muzzle, the rarity on a stripe.
 */
function padGun(c: CanvasRenderingContext2D, t: Tank, m: ModuleInst, cx: number, cy: number, ppm: number, lights: HullLight[]): void {
  const def = WEAPONS[m.weapon!.key];
  const size = def?.size ?? 'medium';
  const r = size === 'heavy' ? 4 : size === 'medium' ? 3 : 2.2;
  const reach = t.muzzleReach(m);
  // Painted turret: `unit` metres per sprite unit (the housing is TURRET_R units across its radius).
  const unit = r / TURRET_R;
  const sp = TURRET_S / 32;
  const mpp = unit / sp;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = ppm * mpp < 0.9;
  const ring = turretRing();
  const rs = (ring.width * mpp) / 1;
  c.drawImage(ring, cx - rs / 2, cy - rs / 2, rs, rs);
  const back = Math.min(0.35, m.recoil ?? 0) * r;
  const fam = turretFamily(def?.kind ?? 'bullet');
  const accent = t.kind === 'rival' ? '#ff3b30' : '#3ab4ff';
  const img = turretSprite(fam, def?.color ?? '#ffd740', accent);
  c.save();
  c.translate(cx, cy);
  c.rotate(m.aim - t.rot);
  const pivx = (1 + TURRET_PIVOT[0] * sp) * mpp, pivy = (1 + TURRET_PIVOT[1] * sp) * mpp;
  c.drawImage(img, -pivx - back, -pivy, img.width * mpp, img.height * mpp);
  // The rarity stripe on the housing's back edge.
  c.fillStyle = RARITIES[m.weapon!.rarity]?.color ?? '#b8c0c8';
  c.fillRect(-r * 0.95 - back, -r * 0.55, Math.max(1 / ppm, r * 0.14), r * 1.1);
  c.restore();
  c.imageSmoothingEnabled = smooth;
  const ra = m.aim - t.rot;
  const tipx = cx + Math.cos(ra) * (reach - back), tipy = cy + Math.sin(ra) * (reach - back);
  if ((m.recoil ?? 0) > 0.25) lights.push({ x: tipx, y: tipy, r: size === 'heavy' ? 7 : 4, color: fam === 'energy' || fam === 'rail' || fam === 'tesla' ? def?.color ?? '#fff3a0' : '#fff3a0', k: 0.9 });
}

const flats = new WeakMap<Tank, HTMLCanvasElement>();

/**
 * The hull as a flat picture, bow to +x at `ppm` pixels per metre, guns and all (for views that sample it, like
 * the cabin's look back over the roof). Null until the art has loaded.
 */
export function paintTitanFlat(t: Tank, ppm: number, g: Game | null, time: number): { canvas: HTMLCanvasElement; cx: number; cy: number } | null {
  const { kx, ky } = topScale(t.stats.length, t.stats.width);
  const pad = 30;
  const w = Math.ceil((TOP_PX.w * kx + pad * 2) * ppm), h = Math.ceil((TOP_PX.h * ky + pad * 2) * ppm);
  let cv = flats.get(t);
  if (!cv) {
    cv = makeCanvas(w, h);
    flats.set(t, cv);
  }
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const x = cv.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  return drawTitanSprite(x, t, g, time, cx, cy, 0, ppm, false) ? { canvas: cv, cx, cy } : null;
}
