import type { Game } from '../game/game';
import { mission } from '../game/campaign';
import { crewSummary, jobName, maxTeams, openJobs } from '../game/systems/crewops';
import { shift } from '../game/systems/crewlife';
import { comfort, crawlersUp, damageState, FUEL_MAX, fuelBurn, SYSTEMS, titanMods, TOROIDS, toroidOut, WATER_MAX, outsideTemp } from '../game/systems/titan';
import { killRate } from '../game/telemetry';
import { threatTier, TIER_NAMES } from '../shared/mapgen';
import { ZONE_INFO } from '../shared/crater';
import { TERRAIN } from '../shared/map';
import { crt, crtGlass, dial, disc, hbar, shadeHex, spark } from './cabinKit';
import { driveSpec, ENGINE_PARTS } from '../game/systems/engine';
import { CRUDE_MAX, drillRate, fuelDrill, fuelRefinery, oilHere, refineRate } from '../game/systems/fuel';
import { oilAt, oilWord } from '../shared/oil';
import { pxMini, pxText } from './pixfont';

/**
 * The cabin's screens and its newer gauges: a bank of CRT screens above the console (each click turns it to the next
 * page) and the dial cluster, supply bank and reactor panel below.
 *
 *  SHIP      a damage schematic: the hull by armour zone, the eight crawlers, the four toroids, fires and floods by
 *            deck and section;
 *  TRENDS    the last three minutes of speed, hull, fuel and contacts from the flight recorder;
 *  SYSTEMS   every subsystem's health and state, crawlers, toroids, fires, floods and damage control;
 *  TACTICAL  threat, contacts by kind and bearing, the horde, the nearest colossus, the kill rate;
 *  NAV       where you are, where the mission is and how long to get there, the way home and the fuel range;
 *  CREW      people aboard, on duty and resting, fatigue, hunger, comfort, and the repair teams at work;
 *  ENGINE    the power plant: charge (and how long to full), heat, the overdrive stage and its time left, the burn,
 *            the drive mode and switches, and every component's mark;
 *  FUEL      the fuel and crude tanks, the drill and the refinery, and an oil survey of the ground around.
 */

export type Page = 'ship' | 'trends' | 'systems' | 'tactical' | 'nav' | 'crew' | 'engine' | 'fuel';
export const PAGES: Page[] = ['ship', 'engine', 'trends', 'tactical', 'systems', 'fuel', 'nav', 'crew'];
const TITLE: Record<Page, string> = { ship: 'SHIP STATUS', trends: 'TRENDS 3 MIN', systems: 'SYSTEMS', tactical: 'TACTICAL', nav: 'NAVIGATION', crew: 'CREW & DAMAGE CTRL', engine: 'ENGINE ROOM', fuel: 'FUEL PLANT' };

const AMBER = '#ffb030', GREEN = '#6aff7a', DIM = '#3a7a48', CYAN = '#40c4ff', RED = '#ff4030', WHITE = '#d8ffe0';

const pct = (v: number): string => `${Math.round(Math.max(0, v) * 100)}%`;
const km = (m: number): string => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}K` : `${Math.round(m)}M`);
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const bearing = (dx: number, dy: number): number => ((((Math.atan2(dy, dx) + Math.PI / 2) * 180) / Math.PI) % 360 + 360) % 360;
const fit = (s: string, px: number): string => (s.length * 4 - 1 > px ? s.slice(0, Math.max(1, Math.floor((px + 1) / 4))) : s);

/** Draws one screen (bezel, page, glass) in the rectangle; returns nothing, the cabin adds the click target. */
export function drawScreen(c: CanvasRenderingContext2D, g: Game, page: Page, x: number, y: number, w: number, h: number, time: number, idx: number): void {
  const r = crt(c, x, y, w, h, page === 'tactical' ? '#140a08' : '#061209');
  // Title bar: the page's name, its number and the arrow that turns it.
  c.fillStyle = '#0c2414';
  c.fillRect(r.x, r.y, r.w, 7);
  pxMini(c, TITLE[page], r.x + 2, r.y + 1, AMBER, 'left', null);
  pxMini(c, `${PAGES.indexOf(page) + 1}/${PAGES.length} >`, r.x + r.w - 2, r.y + 1, DIM, 'right', null);
  const b = { x: r.x + 2, y: r.y + 9, w: r.w - 4, h: r.h - 11 };
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  switch (page) {
    case 'ship': shipPage(c, g, b, time); break;
    case 'trends': trendsPage(c, g, b); break;
    case 'systems': systemsPage(c, g, b, time); break;
    case 'tactical': tacticalPage(c, g, b, time); break;
    case 'nav': navPage(c, g, b); break;
    case 'crew': crewPage(c, g, b); break;
    case 'engine': enginePage(c, g, b, time); break;
    case 'fuel': fuelPage(c, g, b, time); break;
  }
  c.restore();
  crtGlass(c, r);
  void idx;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ---------------------------------------------------------------- */
/* SHIP                                                              */
/* ---------------------------------------------------------------- */

function shipPage(c: CanvasRenderingContext2D, g: Game, b: Box, time: number): void {
  const s = g.titan, p = g.player;
  const blink = Math.floor(time * 3) % 2 === 0;
  // The hull, bow to the right, split into its armour zones and coloured by their health.
  const cutW = Math.min(34, Math.floor(b.w * 0.3));
  const aw = b.w - cutW - 4, ah = b.h - 8;
  const hw = Math.max(20, Math.min(aw - 10, Math.floor((ah - 10) * 2.2))), hh = Math.max(10, Math.round(hw / 2.2));
  const x0 = b.x + Math.floor((aw - hw) / 2), y0 = b.y + Math.floor((ah - hh) / 2) + 1;
  const zoneCol = (v: number): string => shadeHex(damageState(v).color, 0.45 + 0.3 * (1 - v));
  const st = Math.round(hw * 0.2), bw = Math.round(hw * 0.22), side = Math.max(2, Math.round(hh * 0.26));
  c.fillStyle = zoneCol(s.zones.roof);
  c.fillRect(x0 + st, y0 + side, hw - st - bw, hh - side * 2);
  c.fillStyle = zoneCol(s.zones.port);
  c.fillRect(x0 + st, y0, hw - st - bw, side);
  c.fillStyle = zoneCol(s.zones.starboard);
  c.fillRect(x0 + st, y0 + hh - side, hw - st - bw, side);
  c.fillStyle = zoneCol(s.zones.stern);
  c.fillRect(x0, y0 + 1, st, hh - 2);
  // The bow: a wedge.
  c.fillStyle = zoneCol(s.zones.bow);
  for (let i = 0; i < bw; i++) {
    const inset = Math.round((i / bw) * (hh * 0.32));
    c.fillRect(x0 + hw - bw + i, y0 + inset, 1, hh - inset * 2);
  }
  // Outline and zone seams.
  c.fillStyle = GREEN;
  c.fillRect(x0, y0, hw - bw, 1);
  c.fillRect(x0, y0 + hh - 1, hw - bw, 1);
  c.fillRect(x0, y0, 1, hh);
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.fillRect(x0 + st, y0, 1, hh);
  c.fillRect(x0 + hw - bw, y0, 1, hh);
  c.fillRect(x0 + st, y0 + side, hw - st - bw, 1);
  c.fillRect(x0 + st, y0 + hh - side - 1, hw - st - bw, 1);
  // Deck detail: the spine, the main battery, the engine grilles aft.
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(x0 + st, y0 + Math.floor(hh / 2), hw - st - bw, 1);
  for (let k = 0; k < 3; k++) c.fillRect(x0 + 2 + k * 3, y0 + 3, 1, hh - 6);
  const tx0 = x0 + Math.round(hw * 0.52), ty0 = y0 + Math.floor(hh / 2);
  disc(c, tx0, ty0, Math.max(2, hh * 0.18), 'rgba(0,0,0,0.45)');
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(tx0, ty0 - 1, Math.round(hw * 0.3), 1);
  c.fillRect(tx0, ty0 + 1, Math.round(hw * 0.3), 1);
  // Fires and floods by section (bow, midships, stern), flickering in their column.
  const secX = [x0 + hw - bw - Math.round((hw - st - bw) / 6), x0 + Math.round(hw / 2), x0 + st + Math.round((hw - st - bw) / 6)];
  for (let sec = 0; sec < 3; sec++) {
    let fire = 0, flood = 0;
    for (let d = 0; d < 7; d++) {
      fire = Math.max(fire, s.fire[d * 3 + sec] ?? 0);
      flood = Math.max(flood, s.flood[d * 3 + sec] ?? 0);
    }
    if (fire > 0.02) {
      for (let k = 0; k < 3 + Math.round(fire * 4); k++) {
        c.fillStyle = (k + Math.floor(time * 8)) % 3 ? '#ff6020' : '#ffd040';
        c.fillRect(secX[sec] - 2 + ((k * 3) % 5), y0 + Math.round(hh / 2) - 2 + ((k * 7) % 4), 1, 2);
      }
    }
    if (flood > 0.05) {
      c.fillStyle = blink ? '#40a0ff' : '#2060c0';
      c.fillRect(secX[sec] - 3, y0 + hh - side - 3, 7, 1);
    }
  }
  // Crawlers: four each side (0-3 port, front to back), a bar in their state's colour.
  const cw = Math.max(3, Math.floor((hw - st - bw) / 4) - 2);
  for (let i = 0; i < 8; i++) {
    const k = i % 4, port = i < 4;
    const cx = x0 + hw - bw - (k + 1) * (cw + 2);
    const cy = port ? y0 - 3 : y0 + hh + 1;
    const v = s.crawlers[i];
    c.fillStyle = v <= 0.1 && blink ? RED : damageState(v).color;
    c.fillRect(cx, cy, cw, 2);
  }
  // Toroids at the corners, spinning with their output.
  for (let i = 0; i < 4; i++) {
    const tor = TOROIDS[i];
    const tx = tor.fore ? x0 + hw - bw + 2 : x0 + 3, ty = tor.port ? y0 - 6 : y0 + hh + 5;
    const on = g.helm.toroids[i];
    const col = !on ? '#304030' : s.toroids[i] <= 0.1 && blink ? RED : damageState(s.toroids[i]).color;
    for (let a = 0; a < 8; a++) {
      c.fillStyle = col;
      c.fillRect(Math.round(tx + Math.cos((a / 8) * Math.PI * 2) * 3), Math.round(ty + Math.sin((a / 8) * Math.PI * 2) * 2), 1, 1);
    }
    if (on) {
      const sp = time * (2 + 10 * toroidOut(s, g.helm.toroids, i));
      c.fillStyle = WHITE;
      c.fillRect(Math.round(tx + Math.cos(sp) * 3), Math.round(ty + Math.sin(sp) * 2), 1, 1);
    }
  }
  // The deck cutaway: seven decks by three sections, fire red, flood blue.
  const gx = b.x + b.w - cutW, cellW = Math.floor((cutW - 8) / 3), cellH = Math.max(2, Math.floor((ah - 2) / 7) - 1);
  for (let d = 0; d < 7; d++) {
    pxMini(c, String(3 - d).replace('-', ''), gx + 2, b.y + d * (cellH + 1) + Math.floor((cellH - 5) / 2), d < 3 ? DIM : d === 3 ? AMBER : DIM, 'center', null);
    for (let sec = 0; sec < 3; sec++) {
      const i = d * 3 + (2 - sec);
      const f = s.fire[i] ?? 0, fl = s.flood[i] ?? 0;
      c.fillStyle = f > 0.02 ? (blink ? '#ff4020' : '#a02010') : fl > 0.05 ? '#2070d0' : '#0e3a1c';
      c.fillRect(gx + 6 + sec * (cellW + 1), b.y + d * (cellH + 1), cellW, cellH);
    }
  }
  // Worst zone and the hull's total.
  let worst = 'bow', wv = 2;
  for (const [k, v] of Object.entries(s.zones)) if (v < wv) {
    wv = v;
    worst = k;
  }
  const hp = p.hp / Math.max(1, p.stats.maxHp);
  pxMini(c, `HULL ${pct(hp)}`, b.x, b.y + b.h - 6, hp < 0.3 ? RED : GREEN, 'left', null);
  pxMini(c, `${worst.toUpperCase().slice(0, 5)} ${pct(wv)}`, b.x + aw, b.y + b.h - 6, damageState(wv).color, 'right', null);
}

/* ---------------------------------------------------------------- */
/* TRENDS                                                            */
/* ---------------------------------------------------------------- */

function trendsPage(c: CanvasRenderingContext2D, g: Game, b: Box): void {
  const hist = g.telemetry.hist.slice(-180);
  if (hist.length < 3) {
    pxMini(c, 'RECORDING...', b.x + b.w / 2, b.y + b.h / 2 - 3, DIM, 'center', null);
    return;
  }
  const last = hist[hist.length - 1];
  const charts: [string, number[], string, string, number?, number?][] = [
    ['SPD', hist.map((k) => Math.abs(k.spd)), `${Math.round(Math.abs(last.spd))}KMH`, AMBER, 0],
    ['HULL', hist.map((k) => k.hull * 100), pct(last.hull), GREEN, 0, 100],
    ['FUEL', hist.map((k) => k.fuel), `${Math.round(last.fuel)}L`, '#ffd740', 0],
    ['CONT', hist.map((k) => k.near), String(last.near), RED, 0],
  ];
  const cw = Math.floor((b.w - 3) / 2), ch = Math.floor((b.h - 3) / 2);
  charts.forEach(([lab, vals, now, col, lo, hi], i) => {
    const x = b.x + (i % 2) * (cw + 3), y = b.y + Math.floor(i / 2) * (ch + 3);
    c.fillStyle = '#081a0e';
    c.fillRect(x, y, cw, ch);
    c.fillStyle = '#0e2a18';
    for (let gx = x + cw; gx > x; gx -= Math.max(6, Math.floor(cw / 6))) c.fillRect(gx, y + 7, 1, ch - 7);
    spark(c, x + 1, y + 7, cw - 2, ch - 8, vals, col, lo, hi);
    pxMini(c, lab, x + 1, y + 1, DIM, 'left', null);
    pxMini(c, now, x + cw - 1, y + 1, col, 'right', null);
  });
}

/* ---------------------------------------------------------------- */
/* SYSTEMS                                                           */
/* ---------------------------------------------------------------- */

const SYS_SHORT: Record<string, string> = { power: 'PWR', propulsion: 'DRV', steering: 'STR', weapons: 'GUN', sensors: 'SEN', life: 'LIF' };
const STATE_SHORT: Record<string, string> = { Operational: 'OK', Damaged: 'DMG', Degraded: 'DEG', Critical: 'CRIT', Disabled: 'OFF' };

function systemsPage(c: CanvasRenderingContext2D, g: Game, b: Box, time: number): void {
  const s = g.titan;
  const footer = b.h >= 50;
  const rowH = Math.max(6, Math.floor((b.h - (footer ? 8 : 0)) / 6));
  SYSTEMS.forEach((sys, i) => {
    const v = s.systems[sys.key];
    const st = damageState(v);
    const y = b.y + i * rowH;
    pxMini(c, SYS_SHORT[sys.key], b.x, y, WHITE, 'left', null);
    const bx = b.x + 14, bw = b.w - 14 - 30;
    hbar(c, bx, y + 1, bw, 3, v, st.color);
    for (let t = bx + Math.floor(bw / 4); t < bx + bw; t += Math.floor(bw / 4)) {
      c.fillStyle = '#000';
      c.fillRect(t, y + 1, 1, 3);
    }
    const crit = v <= 0.1 && Math.floor(time * 3) % 2 === 0;
    pxMini(c, `${pct(v)} ${STATE_SHORT[st.name]}`, b.x + b.w, y, crit ? RED : st.color, 'right', null);
  });
  if (!footer) return;
  const [l, r] = crawlersUp(s);
  const lit = g.helm.toroids.filter((on, i) => on && s.toroids[i] > 0.1).length;
  const fires = s.fire.filter((f) => f > 0.02).length, floods = s.flood.filter((f) => f > 0.05).length;
  pxMini(c, `TRK ${l + r}/8 TOR ${lit}/4`, b.x, b.y + b.h - 6, l + r < 8 ? AMBER : GREEN, 'left', null);
  pxMini(c, `FIRE ${fires} FLD ${floods}`, b.x + b.w, b.y + b.h - 6, fires ? RED : floods ? CYAN : GREEN, 'right', null);
}

/* ---------------------------------------------------------------- */
/* TACTICAL                                                          */
/* ---------------------------------------------------------------- */

function tacticalPage(c: CanvasRenderingContext2D, g: Game, b: Box, time: number): void {
  const p = g.player;
  const R = 800;
  let swarm = 0, big = 0, air = 0, titan = 0;
  const sectors = new Array(8).fill(0);
  for (const e of g.enemies) {
    if (e.hp <= 0 || e.colossus) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
    if (e.titan || e.boss) titan++;
    else if (e.flying) air++;
    else if (e.r > 1.2 || e.elite) big++;
    else swarm++;
    const a = Math.atan2(dy, dx) - p.rot;
    sectors[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]++;
  }
  const lines: [string, string, string][] = [];
  const tier = threatTier(g.threatHere());
  lines.push(['THREAT', TIER_NAMES[tier] ?? String(tier), tier >= 4 ? RED : tier >= 3 ? AMBER : GREEN]);
  lines.push(['SWARM/BIG', `${swarm}/${big}`, swarm + big > 60 ? RED : swarm + big > 0 ? AMBER : GREEN]);
  lines.push(['AIR/TITAN', `${air}/${titan}`, titan ? RED : air ? AMBER : GREEN]);
  const w = g.wave;
  lines.push(['HORDE', w.phase === 'calm' ? `CALM ${mmss(Math.max(0, w.t))}` : w.phase === 'warning' ? `WARN ${mmss(Math.max(0, w.t))}` : `SURGE ${w.spawned}/${w.total}`, w.phase === 'calm' ? GREEN : RED]);
  const col = g.colossi[0];
  if (col) {
    const d = Math.hypot(col.x - p.x, col.y - p.y);
    lines.push(['COLOSSUS', `${km(d)} ${String(Math.round(bearing(col.x - p.x, col.y - p.y))).padStart(3, '0')}`, RED]);
  } else lines.push(['COLOSSUS', 'NONE', DIM]);
  lines.push(['KILLS', `${g.stats.kills} ${Math.round(killRate(g))}/M`, WHITE]);
  const lw = b.w - 30;
  lines.forEach(([k, v, col2], i) => {
    const y = b.y + i * 8;
    pxMini(c, k, b.x, y, DIM, 'left', null);
    pxMini(c, fit(v, lw - 38), b.x + lw, y, col2, 'right', null);
  });
  // The rose: contacts by bearing off the bow (up), pulsing.
  const cx = b.x + b.w - 13, cy = b.y + Math.min(20, b.h / 2);
  c.fillStyle = '#301410';
  for (let a = 0; a < 16; a++) c.fillRect(Math.round(cx + Math.cos((a / 16) * Math.PI * 2) * 11), Math.round(cy + Math.sin((a / 16) * Math.PI * 2) * 11), 1, 1);
  const maxS = Math.max(1, ...sectors);
  sectors.forEach((n, i) => {
    if (!n) return;
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const len = 2 + Math.round((Math.log(1 + n) / Math.log(1 + maxS)) * 8);
    c.fillStyle = Math.floor(time * 4 + i) % 2 ? RED : '#ff8060';
    for (let d = 2; d < len + 2; d++) c.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
  });
  c.fillStyle = WHITE;
  c.fillRect(cx, cy - 1, 1, 3);
}

/* ---------------------------------------------------------------- */
/* NAV                                                               */
/* ---------------------------------------------------------------- */

function navPage(c: CanvasRenderingContext2D, g: Game, b: Box): void {
  const p = g.player;
  const zone = ZONE_INFO[g.map.zoneAt(p.x, p.y)];
  const ter = TERRAIN[g.map.terAt(p.x, p.y)];
  const m = mission(g);
  const v = Math.abs(p.speed);
  const lines: [string, string, string][] = [];
  lines.push(['ZONE', (zone?.name ?? '?').toUpperCase().replace('THE ', ''), AMBER]);
  lines.push(['OUTSIDE', `${Math.round(outsideTemp(g))}°C ${(ter?.name ?? '').toUpperCase().slice(0, 8)}`, WHITE]);
  if (m.x !== undefined && m.y !== undefined) {
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    lines.push(['MISSION', `${km(d)} ${String(Math.round(bearing(m.x - p.x, m.y - p.y))).padStart(3, '0')}`, GREEN]);
    lines.push(['ETA', v > 1 ? mmss(d / v) : '--:--', GREEN]);
  } else lines.push(['MISSION', m.title.toUpperCase().slice(0, 12), GREEN]);
  const hg = g.gen.hangar ?? g.gen.spawn;
  lines.push(['HANGAR', `${km(Math.hypot(hg.x - p.x, hg.y - p.y))} ${String(Math.round(bearing(hg.x - p.x, hg.y - p.y))).padStart(3, '0')}`, CYAN]);
  const burn = fuelBurn(g);
  lines.push(['RANGE', v > 1 && burn > 0 ? km((g.titan.fuel / burn) * v) : 'IDLE', g.titan.fuel < FUEL_MAX * 0.15 ? RED : AMBER]);
  lines.forEach(([k, val, col], i) => {
    const y = b.y + i * 8;
    pxMini(c, k, b.x, y, DIM, 'left', null);
    pxMini(c, fit(val, b.w - 34), b.x + b.w, y, col, 'right', null);
  });
  pxMini(c, fit(m.title.toUpperCase(), b.w), b.x, b.y + b.h - 6, AMBER, 'left', null);
}

/* ---------------------------------------------------------------- */
/* CREW                                                              */
/* ---------------------------------------------------------------- */

function crewPage(c: CanvasRenderingContext2D, g: Game, b: Box): void {
  const cs = crewSummary(g);
  const sh = shift(g);
  const half = Math.floor(b.w / 2) - 2;
  const lines: [string, string, string][] = [
    ['ABOARD', `${cs.aboard}/${cs.bunks}`, WHITE],
    ['DUTY', `${cs.onDuty}/${cs.posts}`, cs.onDuty < cs.posts ? AMBER : GREEN],
    ['REST', `${sh.resting}/${sh.needRest}`, sh.resting < sh.needRest ? AMBER : GREEN],
    ['AWAY', `${cs.away} RES ${cs.reserves}`, WHITE],
  ];
  lines.forEach(([k, v, col], i) => {
    pxMini(c, k, b.x, b.y + i * 8, DIM, 'left', null);
    pxMini(c, v, b.x + half, b.y + i * 8, col, 'right', null);
  });
  // Condition bars.
  const bars: [string, number, string][] = [
    ['FATG', 1 - g.life.fatigue, g.life.fatigue > 0.5 ? RED : GREEN],
    ['FOOD', 1 - g.life.hunger, g.life.hunger > 0.5 ? RED : GREEN],
    ['CMFT', comfort(g), CYAN],
  ];
  bars.forEach(([k, v, col], i) => {
    const y = b.y + i * 8;
    pxMini(c, k, b.x + half + 4, y, DIM, 'left', null);
    hbar(c, b.x + half + 22, y + 1, b.w - half - 22, 3, v, col);
  });
  // Damage control: teams out and the jobs waiting.
  const out = g.teams.filter((t) => t.phase !== 'back');
  const jobs = openJobs(g).length;
  pxMini(c, `TEAMS ${out.length}/${maxTeams(g)} JOBS ${jobs}`, b.x + half + 4, b.y + 25, out.length ? AMBER : GREEN, 'left', null);
  out.slice(0, 2).forEach((t, i) => {
    const y = b.y + 34 + i * 8;
    if (y > b.y + b.h - 6) return;
    pxMini(c, fit(jobName(t.kind, t.key).toUpperCase(), b.w - 26), b.x, y, WHITE, 'left', null);
    hbar(c, b.x + b.w - 22, y + 1, 22, 3, t.done, GREEN);
  });
}

/* ---------------------------------------------------------------- */
/* Console gauges                                                    */
/* ---------------------------------------------------------------- */

/** The dial cluster: speedometer, tachometer, drive heat, and a readout block. */
export function dialsModule(c: CanvasRenderingContext2D, g: Game, x0: number, y0: number, w: number, h: number, time: number): void {
  const p = g.player;
  const kmh = Math.abs(p.speed) * 3.6;
  const max = Math.max(40, Math.ceil((p.stats.topSpeed * 3.6 * 1.6) / 20) * 20);
  dial(c, x0 + 25, y0 + 27, 21, kmh / max, 'KMH', { red: 0.2, ticks: 10 });
  pxText(c, String(Math.round(kmh)).padStart(3, ' '), x0 + 25, y0 + 52, 1, 'amber', 'center');
  // Revs: she barely pulls until the drive has spooled up.
  const jit = p.spool > 0.05 ? Math.sin(time * 37) * 0.006 : 0;
  dial(c, x0 + 68, y0 + 22, 15, p.spool + jit, 'RPM', { red: 0.12, ticks: 6, lamp: p.spool > 0.92 ? '#20c030' : null });
  const heat = g.helm.heat;
  dial(c, x0 + 68, y0 + 56, 11, heat, 'HOT', { red: 0.25, ticks: 4, face: g.helm.overheat && Math.floor(time * 4) % 2 ? '#ffb0a0' : '#e8e0c8' });
  // Readouts.
  const brg = ((((p.rot + Math.PI / 2) * 180) / Math.PI) % 360 + 360) % 360;
  const lines: [string, string, string][] = [
    ['HDG', String(Math.round(brg) % 360).padStart(3, '0'), AMBER],
    ['THR', `${g.helm.lever >= 0 ? '+' : ''}${Math.round(g.helm.lever * 100)}`, g.helm.lever < 0 ? RED : AMBER],
    ['TRC', pct(p.trac), p.trac < 0.6 ? RED : GREEN],
    ['TOP', `${Math.round(p.stats.topSpeed * 3.6)}`, CYAN],
    ['BRK', g.helm.brake > 0 ? pct(g.helm.brake) : 'REL', g.helm.brake > 0 ? RED : GREEN],
    ['ODR', g.helm.overdrive ? 'ON' : 'OFF', g.helm.overdrive ? RED : DIM],
  ];
  const rx = x0 + 84, rw = w - 88;
  c.fillStyle = '#0a0c0a';
  c.fillRect(rx, y0 + 4, rw, lines.length * 8 + 3);
  lines.forEach(([k, v, col], i) => {
    pxMini(c, k, rx + 2, y0 + 6 + i * 8, '#6a8a70', 'left', null);
    pxMini(c, v, rx + rw - 2, y0 + 6 + i * 8, col, 'right', null);
  });
  pxMini(c, 'DRIVE', rx + rw / 2, y0 + h - 12, '#8a8272', 'center');
}

/** The supply bank: six columns, low ones blinking. */
export function supplyModule(c: CanvasRenderingContext2D, g: Game, x0: number, y0: number, w: number, h: number, time: number): void {
  const p = g.player, s = g.titan;
  const bars: [string, number, string][] = [
    ['FUL', s.fuel / FUEL_MAX, '#ffb030'],
    ['H2O', s.water / WATER_MAX, '#40c4ff'],
    ['O2', Math.max(0, (s.oxygen - 0.15) / 0.06), '#b0f0ff'],
    ['TMP', Math.max(0, Math.min(1, (s.temp + 20) / 70)), s.temp > 32 || s.temp < 8 ? '#ff6040' : '#ffd740'],
    ['HUL', p.hp / Math.max(1, p.stats.maxHp), '#76ff03'],
    ['SHD', p.stats.shield > 0 ? p.shield / p.stats.shield : 0, '#18ffff'],
  ];
  const bw = Math.floor((w - 6) / 6), bh = h - 36;
  bars.forEach(([lab, v, col], i) => {
    const bx = x0 + 4 + i * bw, by = y0 + 5;
    c.fillStyle = '#0a0a0a';
    c.fillRect(bx, by, bw - 2, bh);
    const low = lab !== 'TMP' && lab !== 'SHD' && v < 0.15;
    const fh = Math.round(Math.max(0, Math.min(1, v)) * (bh - 2));
    c.fillStyle = low && Math.floor(time * 3) % 2 ? '#ff2010' : col;
    c.fillRect(bx + 1, by + bh - 1 - fh, bw - 4, fh);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let t = by + 5; t < by + bh; t += 5) c.fillRect(bx + 1, t, bw - 4, 1);
    pxMini(c, lab, bx + (bw - 2) / 2, by + bh + 3, '#c0b8a8', 'center');
  });
  pxMini(c, `${fuelBurn(g).toFixed(2)}L/S`, x0 + w / 2, y0 + h - 20, '#ffb030', 'center');
  pxMini(c, 'SUPPLY', x0 + w / 2, y0 + h - 12, '#8a8272', 'center');
}

/** The reactor panel: bus power, a load meter, the energy cells for your cards. */
export function reactorModule(c: CanvasRenderingContext2D, g: Game, x0: number, y0: number, w: number, h: number, time: number): void {
  const mods = titanMods(g.titan, g.helm.toroids);
  const cx = Math.round(x0 + w / 2);
  dial(c, cx, y0 + 21, 16, Math.min(1, mods.power), 'PWR', { red: 0, ticks: 8, face: '#d8e8d0', needle: '#1060c0' });
  // The bus load: a column of LEDs that flickers with the drive's pull.
  const load = Math.min(1, 0.25 + Math.abs(g.player.speed) / Math.max(1, g.player.stats.topSpeed) * 0.6 + (g.helm.overdrive ? 0.25 : 0));
  for (let i = 0; i < 10; i++) {
    const on = i / 10 < load + Math.sin(time * 9 + i) * 0.03;
    c.fillStyle = on ? (i >= 8 ? '#ff3020' : i >= 6 ? '#ffb030' : '#40e060') : '#1a1a1a';
    c.fillRect(x0 + 4, y0 + h - 18 - i * 5, 5, 4);
  }
  pxMini(c, 'BUS', x0 + 6, y0 + h - 12, '#8a8272', 'center', null);
  // Energy cells.
  const max = g.maxEnergy();
  const cellsX = x0 + 14, cellsW = w - 18;
  const per = Math.max(1, Math.floor(cellsW / Math.max(1, max)) - 1);
  for (let i = 0; i < max; i++) {
    const f = Math.max(0, Math.min(1, g.energy - i));
    c.fillStyle = '#0a0a0a';
    c.fillRect(cellsX + i * (per + 1), y0 + 44, per, 10);
    c.fillStyle = f >= 1 ? '#b388ff' : '#5a3a90';
    const fh = Math.round(f * 8);
    c.fillRect(cellsX + i * (per + 1) + 1, y0 + 53 - fh, Math.max(1, per - 2), fh);
  }
  pxMini(c, `ENERGY ${Math.floor(g.energy)}/${max}`, cellsX + cellsW / 2, y0 + 57, '#c8b0ff', 'center');
  const sp = Math.round(mods.speed * 100), gn = Math.round(mods.weapons * 100);
  pxMini(c, `D${sp} G${gn}`, cellsX + cellsW / 2, y0 + 66, sp < 90 || gn < 90 ? '#ffb030' : '#6aff7a', 'center');
  pxMini(c, 'REACTOR', x0 + w / 2, y0 + h - 12, '#8a8272', 'center');
}

/* ---------------------------------------------------------------- */
/* ENGINE                                                            */
/* ---------------------------------------------------------------- */

function enginePage(c: CanvasRenderingContext2D, g: Game, b: Box, time: number): void {
  const p = g.player, hm = g.helm;
  const ds = driveSpec(g, p);
  const d = ds.def;
  pxMini(c, fit(d.name.toUpperCase(), b.w), b.x, b.y, AMBER, 'left', null);
  // Charge: the bar fills like a boiler gauge; seconds to full at this rate.
  const ch = p.spool;
  const want = Math.max(hm.preheat ? 0.35 : 0, Math.abs(hm.lever));
  const secs = ch < want ? (want - ch) / Math.max(0.001, ds.spool) : 0;
  const bw = b.w - 30;
  pxMini(c, 'CHG', b.x, b.y + 7, DIM, 'left', null);
  hbar(c, b.x + 14, b.y + 8, bw - 14, 4, ch, ch > 0.8 ? GREEN : AMBER);
  pxMini(c, secs > 0.05 ? `${secs.toFixed(1)}S` : pct(ch), b.x + b.w, b.y + 7, WHITE, 'right', null);
  pxMini(c, 'HEAT', b.x, b.y + 14, DIM, 'left', null);
  const od = ds.od;
  const heatCol = hm.overheat ? RED : hm.heat > 0.7 ? AMBER : GREEN;
  hbar(c, b.x + 30, b.y + 15, bw - 30, 3, hm.heat, heatCol);
  pxMini(c, hm.overheat && Math.floor(time * 3) % 2 ? 'TRIP' : pct(hm.heat), b.x + b.w, b.y + 14, heatCol, 'right', null);
  const rows: [string, string, string][] = [
    ['OVERDRV', od ? `${['I', 'II', 'III'][od.stage - 1]} ${Math.max(0, Math.round((1 - hm.heat) / (ds.heat * od.heat)))}S` : `MAX ${['-', 'I', 'II', 'III'][ds.odStages]}`, od ? RED : DIM],
    ['MODE', `${hm.mode.toUpperCase()}${hm.preheat ? ' PH' : ''}${hm.diffLock ? ' DL' : ''}${hm.plow ? ' PL' : ''}${hm.sandT > 0 ? ' SD' : ''}`, WHITE],
    ['BURN', `${(fuelBurn(g) * 60).toFixed(1)}/MIN`, fuelBurn(g) < 0 ? GREEN : AMBER],
    ['POWER', `${d.mw}MW ${d.len}M`, CYAN],
  ];
  rows.forEach(([k, v, col], i) => {
    if (b.y + 21 + i * 7 > b.y + b.h - 12) return;
    pxMini(c, k, b.x, b.y + 21 + i * 7, DIM, 'left', null);
    pxMini(c, fit(v, b.w - 30), b.x + b.w, b.y + 21 + i * 7, col, 'right', null);
  });
  // Every component's mark as a strip of cells: engine parts, then the running gear.
  const parts = ENGINE_PARTS;
  const cw = Math.max(2, Math.floor((b.w - 2) / parts.length) - 1);
  const y = b.y + b.h - 6;
  parts.forEach((pt, i) => {
    const lv = p.engine[pt.key];
    const x = b.x + i * (cw + 1);
    c.fillStyle = '#0a1a0e';
    c.fillRect(x, y - 3, cw, 8);
    c.fillStyle = pt.group === 'engine' ? AMBER : CYAN;
    const hgt = Math.round((lv / 8) * 8);
    if (hgt) c.fillRect(x, y + 5 - hgt, cw, hgt);
  });
}

/* ---------------------------------------------------------------- */
/* FUEL                                                              */
/* ---------------------------------------------------------------- */

function fuelPage(c: CanvasRenderingContext2D, g: Game, b: Box, time: number): void {
  const s = g.titan;
  const p = g.player;
  const half = Math.floor(b.w * 0.55);
  // Tanks.
  pxMini(c, 'FUEL', b.x, b.y, DIM, 'left', null);
  hbar(c, b.x + 18, b.y + 1, half - 20, 3, s.fuel / FUEL_MAX, s.fuel < FUEL_MAX * 0.15 ? RED : AMBER);
  pxMini(c, 'CRUDE', b.x, b.y + 7, DIM, 'left', null);
  hbar(c, b.x + 22, b.y + 8, half - 24, 3, s.crude / CRUDE_MAX, '#a07840');
  const dr = drillRate(g), rr = refineRate(g);
  const drillState = !fuelDrill(g) ? 'NONE' : s.drillWant ? (s.drill >= 1 ? 'PUMP' : `DOWN ${pct(s.drill)}`) : s.drill > 0 ? 'RAISE' : 'UP';
  const lines: [string, string, string][] = [
    ['DRILL', drillState, !fuelDrill(g) ? DIM : s.drill >= 1 ? GREEN : s.drill > 0 ? AMBER : WHITE],
    ['PUMP', dr > 0 ? `+${dr.toFixed(1)}/S` : '-', dr > 0 ? GREEN : DIM],
    ['REFINE', !fuelRefinery(g) ? 'NONE' : g.helm.refine ? (rr > 0 && s.crude > 0 ? `${(rr * 0.85).toFixed(1)}/S` : 'IDLE') : 'OFF', !fuelRefinery(g) ? DIM : g.helm.refine ? GREEN : AMBER],
  ];
  lines.forEach(([k, v, col], i) => {
    const y = b.y + 14 + i * 7;
    if (y > b.y + b.h - 6) return;
    pxMini(c, k, b.x, y, DIM, 'left', null);
    pxMini(c, v, b.x + half - 2, y, col, 'right', null);
  });
  // Oil survey: the ground within 1.5 km, heading up, richer brighter; you in the middle.
  const sx = b.x + half + 2, sw = b.w - half - 2, sh = b.h - 2;
  const n = Math.max(4, Math.min(12, Math.floor(Math.min(sw, sh) / 4)));
  const cell = Math.floor(Math.min(sw, sh) / n);
  const ox = sx + Math.floor((sw - cell * n) / 2), oy = b.y + Math.floor((sh - cell * n) / 2);
  const span = 1500;
  const fx = Math.cos(p.rot), fy = Math.sin(p.rot);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n - 0.5) * 2 * span, v = (0.5 - (j + 0.5) / n) * 2 * span;
      const wx = p.x + fx * v - fy * u, wy = p.y + fy * v + fx * u;
      const o = oilAt(wx, wy, g.map.zoneAt(wx, wy));
      const k = Math.min(1, o / 1.4);
      c.fillStyle = `rgb(${Math.round(20 + 200 * k)},${Math.round(16 + 120 * k * k)},${Math.round(10 + 20 * k)})`;
      c.fillRect(ox + i * cell, oy + j * cell, cell - 1, cell - 1);
    }
  }
  c.fillStyle = Math.floor(time * 3) % 2 ? '#ffffff' : GREEN;
  c.fillRect(ox + Math.floor((n * cell) / 2) - 1, oy + Math.floor((n * cell) / 2) - 1, 2, 3);
  pxMini(c, `OIL ${oilWord(oilHere(g))}`, b.x, b.y + b.h - 6, '#e0a040', 'left', null);
}
