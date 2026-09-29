import { batteryLocal, MODULES } from '../../game/defs';
import type { Game } from '../../game/game';
import { compIndex, toroidOut } from '../../game/systems/titan';
import { drawToroid, TOROID_FRAMES, TOROID_SHEET, toroidFrames } from './toroids';
import type { ModuleInst, Tank } from '../../game/tank';
import { hash2, makeCanvas } from './pixels';
import { GUN_PX, scaledTo, shipArtFor, TOP_MARKS, TOP_PX, topScale, topToHull, type ShipArt } from './shipArt';
import type { HullLight } from './titan2d';
import { TURRET_PIVOT, TURRET_R, TURRET_S, turretFamily, turretRing, turretSprite } from './turretArt';
import { RARITIES } from '../../shared/rarity';
import { WEAPONS } from '../../shared/weapons';

/**
 * The Titan drawn from its design sheet: the top view as the hull, straight down, exactly as drawn; the main
 * battery lifted off it and turned to its target (barrels recoiling, red laser sights); the sheet's lamps and light
 * strips glowing and pulsing; engine pods glowing when she moves (white-hot in overdrive); scorch marks where the
 * armour has been hammered; fires through the deck; and whatever you've built on the roof (turrets on the pads,
 * nests, radar, tesla coils, shield emitters, hangar hatches).
 *
 * Everything is drawn straight into the view in hull metres (forward +x, starboard +y); nothing is repainted per
 * frame but the few things that move.
 */

/**
 * The crawler treads on the sheet (pixels: x, y, w, h on the port side; the starboard ones mirror them). Their links
 * repeat every TREAD_PITCH pixels, so sliding the picture by the tread's travel (modulo the pitch) runs them.
 */
const TREADS: [number, number, number, number][] = [[437, 11, 150, 14], [528, 25, 58, 19], [11, 26, 38, 15]];
const TREAD_PITCH = 5;

/** Per-hull animation state: last draw time, each side's tread offset, each toroid's spin. */
const anim = new WeakMap<Tank, { t: number; tread: [number, number]; spin: number[] }>();

const CLASS_GLOW: Record<string, string> = { juggernaut: '#3ab4ff', bastion: '#ffd740', ark: '#76ff03', nightrunner: '#b388ff', dredge: '#ffab40' };

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
 * Draws a Titan from its sprite at screen position (sx, sy), turned to `a` (heading plus the view's turn), at
 * `ppm` screen pixels per metre. Returns the lights to glow, or null if the art hasn't loaded yet.
 */
export function drawTitanSprite(c: CanvasRenderingContext2D, t: Tank, g: Game | null, time: number, sx: number, sy: number, a: number, ppm: number, shadow = true): HullLight[] | null {
  const light = t.kind === 'main' ? CLASS_GLOW[t.klass] ?? null : null;
  const art = shipArtFor(t.kind, light, t.dead);
  if (!art) return null;
  const L = t.stats.length, W = t.stats.width;
  const hl = L / 2, hw = W / 2;
  const { kx, ky } = topScale(L, W);
  const ca = Math.cos(a), sa = Math.sin(a);
  const lights: HullLight[] = [];
  const smooth = c.imageSmoothingEnabled;
  // Sheet pixels on screen: grow them crisp, shrink them smooth (from a copy made at about the size shown).
  const spx = kx * ppm;
  c.imageSmoothingEnabled = spx < 1.6;
  c.imageSmoothingQuality = 'low';
  const hullImg = spx < 1 ? scaledTo(art.top, spx) : art.top;
  const dw = TOP_PX.w * kx, dh = TOP_PX.h * ky;
  const x0 = -TOP_PX.cx * kx, y0 = -TOP_PX.cy * ky;

  // Drop shadow to the south-east.
  if (shadow) {
    const off = Math.max(1, Math.round(6 * ppm));
    c.globalAlpha = 0.45;
    c.setTransform(ca * ppm, sa * ppm, -sa * ppm, ca * ppm, sx + off, sy + off * 0.8);
    c.drawImage(art.shadow, x0, y0, dw, dh);
    c.globalAlpha = 1;
  }

  // The hull.
  c.setTransform(ca * ppm, sa * ppm, -sa * ppm, ca * ppm, sx, sy);
  c.drawImage(hullImg, x0, y0, dw, dh);

  // Running gear: each side's treads slide at that side's speed (capped where it would strobe), and the toroids
  // spin up with their push.
  let st = anim.get(t);
  if (!st) {
    st = { t: time, tread: [0, 0], spin: [0, 0, 0, 0] };
    anim.set(t, st);
  }
  const fdt = Math.max(0, Math.min(0.1, time - st.t));
  st.t = time;
  if (!t.dead) {
    for (let s = 0; s < 2; s++) {
      const v = Math.max(-110, Math.min(110, (t.sideSpeed[s] ?? t.speed) / kx));
      st.tread[s] = (((st.tread[s] + v * fdt) % TREAD_PITCH) + TREAD_PITCH) % TREAD_PITCH;
    }
    if (spx >= 0.5) {
      c.imageSmoothingEnabled = false;
      for (const [rx, ry, rw, rh] of TREADS) {
        for (let s = 0; s < 2; s++) {
          const yy = s === 0 ? ry : TOP_PX.h - ry - rh;
          const sh = Math.floor(st.tread[s]);
          if (!sh) continue;
          // Links travel toward the bow along the top run: the strip shifted aft by `sh`, wrapped.
          c.drawImage(art.top, rx, yy, rw - sh, rh, x0 + (rx + sh) * kx, y0 + yy * ky, (rw - sh) * kx, rh * ky);
          c.drawImage(art.top, rx + rw - sh, yy, sh, rh, x0 + rx * kx, y0 + yy * ky, sh * kx, rh * ky);
        }
      }
      c.imageSmoothingEnabled = spx < 1.6;
    }
  }

  // The four toroidal engines on their pylons, each spinning and glowing with its push.
  const own = !!(g && t === g.player);
  const core = light ?? (t.kind === 'rival' ? '#ff3b30' : '#18ffff');
  const turn = Math.max(-1, Math.min(1, t.yawRate / 0.08));
  const push = Math.max(Math.abs(t.throttle) * (own ? t.spool : 1), Math.min(1, Math.abs(t.speed) / 20));
  const thrust: number[] = [];
  const ringM = 28 * kx;
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
  c.imageSmoothingEnabled = spx < 1.6;
  const gunImg = spx < 1 ? scaledTo(art.gun, spx) : art.gun;
  for (const m of t.modules) if (m.key === 'main_gun') battery(c, t, m, art, gunImg, kx, ky, ppm, lights);

  // The sheet's lamps and light strips glow (a wreck's are out).
  if (!t.dead) {
    c.globalCompositeOperation = 'lighter';
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.45 + 0.25 * pulse;
    c.drawImage(art.glow, x0, y0, dw, dh);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    for (const [px, py] of TOP_MARKS.lamps) {
      const [lx, ly] = topToHull(px, py, L, W);
      lights.push({ x: lx, y: ly, r: 7, color: light ?? (t.kind === 'rival' ? '#ff3b30' : '#8fd8ff'), k: 0.45 * pulse + 0.2 });
    }
    // Headlights on the ground ahead.
    for (const s of [-1, 1]) lights.push({ x: hl + 22, y: s * 0.42 * hw, r: 26, color: '#fff3c4', k: 0.1 });
  }

  // The engine pods: dark at rest, glowing as she gets going, white-hot in overdrive.
  const moving = Math.min(1, Math.abs(t.speed) / 10);
  const od = !!(g && t === g.player && g.helm.overdrive);
  if (!t.dead && (moving > 0.1 || od)) {
    for (const [px, py] of TOP_MARKS.nozzles) {
      const [lx, ly] = topToHull(px, py, L, W);
      const big = Math.abs(py - TOP_PX.cy) < 70;
      const flick = 0.8 + 0.2 * Math.sin(time * 31 + py);
      c.fillStyle = od ? (flick > 0.9 ? '#fff4c0' : '#ffb040') : '#ff7a1a';
      c.globalAlpha = Math.min(1, (od ? 1 : moving) * flick);
      const r = big ? 2.4 : 1.2;
      c.fillRect(lx - r * 0.6, ly - r, r * 1.2, r * 2);
      c.globalAlpha = 1;
      lights.push({ x: lx - 2, y: ly, r: (big ? 9 : 5) * (od ? 1.6 : 0.6 + moving * 0.6), color: od ? '#ffb040' : '#ff7a1a', k: (od ? 0.95 : 0.35 + 0.35 * moving) * flick });
    }
  }

  // Toroid plumes: a neon wash streaming aft of each ring, as long as it pushes hard.
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
    c.drawImage(art.flash, x0, y0, dw, dh);
    c.globalAlpha = 1;
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = smooth;
  return t.dead ? [] : lights;
}

/** A main battery: the sheet's turret, turned to its aim, barrels recoiling, laser sights out ahead. */
function battery(c: CanvasRenderingContext2D, t: Tank, m: ModuleInst, art: ShipArt, gun: HTMLCanvasElement, kx: number, ky: number, ppm: number, lights: HullLight[]): void {
  const L = t.stats.length, W = t.stats.width;
  const rear = m.cy > t.rows / 2;
  const [px, py] = batteryLocal(L, W, rear);
  const k = rear ? 0.72 : 1;
  const ra = m.aim - t.rot;
  const B = GUN_PX.band, gw = art.gun.width;
  const gs = gun.width / gw;
  const sxk = kx * k, syk = ky * k;
  const back = Math.min(0.35, m.recoil ?? 0) * 26;
  // Its shadow on the deck (it stands a storey proud of it).
  c.save();
  c.translate(px + 1.6, py + 1.3);
  c.rotate(ra);
  c.globalAlpha = 0.35;
  c.drawImage(art.gunShadow, 0, 0, gw, B, -GUN_PX.px * sxk, -GUN_PX.py * syk, gw * sxk, B * syk);
  c.drawImage(art.gunShadow, 0, B, gw, B, -GUN_PX.px * sxk, -GUN_PX.py * syk, gw * sxk, B * syk);
  c.globalAlpha = 1;
  c.restore();
  c.save();
  c.translate(px, py);
  c.rotate(ra);
  // Barrels first (they slide back into the mantlet as they recoil), then the housing over their roots.
  c.drawImage(gun, 0, B * gs, gw * gs, B * gs, (-GUN_PX.px - back) * sxk, -GUN_PX.py * syk, gw * sxk, B * syk);
  c.drawImage(gun, 0, 0, gw * gs, B * gs, -GUN_PX.px * sxk, -GUN_PX.py * syk, gw * sxk, B * syk);
  const reach = (GUN_PX.muzzle - GUN_PX.px - back) * sxk;
  // Red laser sights off both muzzles.
  if (!t.dead && m.weapon) {
    c.strokeStyle = 'rgba(255,48,40,0.55)';
    c.lineWidth = Math.max(0.12, 1 / ppm);
    c.beginPath();
    for (const o of GUN_PX.twin) {
      c.moveTo(reach, o * syk);
      c.lineTo(reach + 70, o * syk);
    }
    c.stroke();
    c.fillStyle = '#ff5a4a';
    for (const o of GUN_PX.twin) c.fillRect(reach - 0.3, o * syk - 0.3, 0.6, 0.6);
  }
  c.restore();
  if ((m.recoil ?? 0) > 0.25) {
    const ma = ra;
    lights.push({ x: px + Math.cos(ma) * reach, y: py + Math.sin(ma) * reach, r: 12, color: '#fff3a0', k: 0.9 });
  }
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
