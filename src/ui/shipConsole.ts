import type { Game } from '../game/game';
import { crewSummary } from '../game/systems/crewops';
import { crawlersUp, FUEL_MAX, SYSTEMS, sysMult, toroidOut, WATER_MAX, damageState } from '../game/systems/titan';
import { titanTop, topPalette } from '../render/px/titanTop';
import { engineDef } from '../game/systems/engine';
import { h } from './dom';
import { pxMini, pxText as text } from './pixfont';

/**
 * The ship console along the bottom of the screen: a dark violet instrument strip with neon trim, laid out like a
 * corridor shooter's status bar but about the ship. Left to right: HULL (a big number, a segmented bar, repair rate
 * and the shield), the SHIP itself where the face used to be (a live silhouette with its armour zones tinted by
 * damage, the four toroids, both crawler banks, fires, and a red flash on the side that's hit), the hand of cards with
 * the ENERGY cells, DRIVE (speed, throttle and brake, revs and heat, overdrive), and SUPPLY (fuel, water, power,
 * crew and repair teams). Everything is drawn as pixel art on small canvases scaled up by whole numbers.
 */

const PAL = {
  bg: '#141024', panel: '#1e1834', line: '#403353', trim: '#6c4bd8', dim: '#6a5f8a', text: '#c9bff0',
  good: '#59c135', warn: '#f9a31b', bad: '#df3e23', crit: '#b4202a', cyan: '#20d6c7', amber: '#ffd541', white: '#fef3c0',
};

const stateCol = (v: number): string => (v > 0.8 ? PAL.good : v > 0.6 ? '#9cdb43' : v > 0.35 ? PAL.warn : v > 0.1 ? PAL.bad : PAL.crit);

interface Section {
  el: HTMLDivElement;
  cv: HTMLCanvasElement;
  x: CanvasRenderingContext2D;
  key: string;
}

/** A segmented bar (like the ammo counters of old): `n` cells, lit to `f`, in `col`. */
function cells(x: CanvasRenderingContext2D, px: number, py: number, w: number, hh: number, n: number, f: number, col: string): void {
  const cw = w / n;
  for (let i = 0; i < n; i++) {
    const on = f * n - i;
    x.fillStyle = '#0a0814';
    x.fillRect(Math.round(px + i * cw), py, Math.max(1, Math.round(cw) - 1), hh);
    if (on <= 0) continue;
    x.fillStyle = on >= 1 ? col : `${col}88`;
    x.fillRect(Math.round(px + i * cw), py, Math.max(1, Math.round(cw) - 1), hh);
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.fillRect(Math.round(px + i * cw), py, Math.max(1, Math.round(cw) - 1), 1);
  }
}

/** A small labelled bar row (label, bar, value). */
function row(x: CanvasRenderingContext2D, y: number, label: string, f: number, col: string, value: string, w: number): void {
  pxMini(x, label, 3, y, PAL.dim, 'left', null);
  x.fillStyle = '#0a0814';
  x.fillRect(22, y, w - 50, 5);
  x.fillStyle = col;
  x.fillRect(22, y, Math.round((w - 50) * Math.max(0, Math.min(1, f))), 5);
  x.fillStyle = 'rgba(255,255,255,0.22)';
  x.fillRect(22, y, Math.round((w - 50) * Math.max(0, Math.min(1, f))), 1);
  pxMini(x, value, w - 3, y, PAL.white, 'right', null);
}

export class ShipConsole {
  readonly root = h('div', 'ship-console');
  /** Where the HUD puts the hand of cards. */
  readonly cards = h('div', 'sc-cards');
  private hull: Section;
  private ship: Section;
  private energy: Section;
  private drive: Section;
  private supply: Section;
  private hpWas = -1;
  private flash = 0;
  private flashSide = 0;
  private t = 0;
  private shipImg: HTMLCanvasElement | null = null;

  constructor() {
    const sec = (cls: string, w: number, hh: number, title: string): Section => {
      const el = h('div', `sc-sec ${cls}`);
      el.dataset.title = title;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = hh;
      el.appendChild(cv);
      return { el, cv, x: cv.getContext('2d')!, key: '' };
    };
    this.hull = sec('sc-hull', 96, 40, 'HULL');
    this.ship = sec('sc-ship', 112, 40, 'SHIP');
    this.energy = sec('sc-energy', 40, 40, 'ENERGY');
    this.drive = sec('sc-drive', 96, 40, 'DRIVE');
    this.supply = sec('sc-supply', 104, 40, 'SUPPLY');
    const mid = h('div', 'sc-mid');
    mid.append(this.energy.el, this.cards);
    this.root.append(this.hull.el, this.ship.el, mid, this.drive.el, this.supply.el);
  }

  /** Where a hit came from, relative to the ship (-1 port, 1 starboard): that side of the silhouette flashes. */
  hitFrom(side: number): void {
    this.flashSide = side;
    this.flash = 0.5;
  }

  update(g: Game, dt: number): void {
    const p = g.player;
    this.t += dt;
    if (this.hpWas >= 0 && p.hp < this.hpWas - p.stats.maxHp * 0.01) this.flash = Math.max(this.flash, 0.35);
    this.hpWas = p.hp;
    this.flash = Math.max(0, this.flash - dt);
    this.drawHull(g);
    this.drawShip(g);
    this.drawEnergy(g);
    this.drawDrive(g);
    this.drawSupply(g);
  }

  private drawHull(g: Game): void {
    const p = g.player;
    const f = Math.max(0, p.hp / Math.max(1, p.stats.maxHp));
    const shield = p.stats.shield > 0 ? p.shield / p.stats.shield : 0;
    const key = `${Math.ceil(f * 200)}:${Math.round(shield * 20)}:${this.flash > 0 ? 1 : 0}:${p.dead}`;
    if (key === this.hull.key) return;
    this.hull.key = key;
    const x = this.hull.x;
    x.clearRect(0, 0, 96, 40);
    const col = f > 0.6 ? 'lit' : f > 0.3 ? 'amber' : 'red';
    text(x, p.dead ? 'DOWN' : `${Math.ceil(f * 100)}%`, 48, 2, 2, col as 'lit', 'center');
    cells(x, 4, 19, 88, 5, 20, f, f > 0.6 ? PAL.good : f > 0.3 ? PAL.warn : PAL.bad);
    // Shield as a thin cyan line over the hull bar.
    if (p.stats.shield > 0) cells(x, 4, 26, 88, 2, 20, shield, PAL.cyan);
    pxMini(x, `${Math.round(p.hp)}/${Math.round(p.stats.maxHp)}`, 4, 31, PAL.text, 'left', null);
    pxMini(x, `+${p.stats.repair.toFixed(1)}/S`, 92, 31, PAL.good, 'right', null);
    if (this.flash > 0) {
      x.fillStyle = `rgba(223,62,35,${this.flash})`;
      x.fillRect(0, 0, 96, 40);
    }
  }

  /** The Titan in miniature: zones tinted by their armour, toroids and crawlers by their state, fires flickering. */
  private drawShip(g: Game): void {
    const p = g.player;
    const s = g.titan;
    const x = this.ship.x;
    const W = 112, H = 40;
    // Redrawn a few times a second (fires flicker, flashes fade).
    const key = `${Math.floor(this.t * 6)}`;
    if (key === this.ship.key) return;
    this.ship.key = key;
    x.clearRect(0, 0, W, H);
    // The silhouette, bow right, from the ship's own art.
    const art = titanTop(p.stats.length, p.stats.width, topPalette('main', p.klass, p.dead), `main|${p.klass}|${p.dead}`, engineDef(p.engineKey).flame.jets, false, 1);
    const sx = 16, sy = 4, sw = 80, sh = 32;
    if (art) {
      if (!this.shipImg) {
        const c = document.createElement('canvas');
        c.width = sw;
        c.height = sh;
        const cx = c.getContext('2d')!;
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(art.top, 0, 0, sw, sh);
        this.shipImg = c;
      }
      x.drawImage(this.shipImg, sx, sy);
      // Zone tints over the plating (source-atop keeps them on the ship).
      x.save();
      x.globalCompositeOperation = 'source-atop';
      const tintZone = (zx: number, zy: number, zw: number, zh: number, v: number): void => {
        x.fillStyle = stateCol(v);
        x.globalAlpha = v > 0.8 ? 0.12 : 0.45;
        x.fillRect(sx + zx * sw, sy + zy * sh, zw * sw, zh * sh);
      };
      tintZone(0.75, 0, 0.25, 1, s.zones.bow);
      tintZone(0, 0, 0.25, 1, s.zones.stern);
      tintZone(0.25, 0, 0.5, 0.3, s.zones.port);
      tintZone(0.25, 0.7, 0.5, 0.3, s.zones.starboard);
      tintZone(0.3, 0.32, 0.4, 0.36, s.zones.roof);
      if (this.flash > 0) {
        x.globalAlpha = this.flash;
        x.fillStyle = PAL.bad;
        if (this.flashSide < 0) x.fillRect(sx, sy, sw, sh / 2);
        else if (this.flashSide > 0) x.fillRect(sx, sy + sh / 2, sw, sh / 2);
        else x.fillRect(sx, sy, sw, sh);
      }
      x.restore();
    }
    // Fires show as flickering flame pixels over their compartments' section.
    for (let i = 0; i < s.fire.length; i++) {
      if (s.fire[i] <= 0.02) continue;
      const sec = i % 3;
      const fx = sx + sw * (0.8 - sec * 0.3) + ((i * 7) % 9) - 4, fy = sy + 8 + ((i * 5) % 16);
      x.fillStyle = Math.floor(this.t * 12 + i) % 2 ? '#ffd541' : '#fa6a0a';
      x.fillRect(Math.round(fx), Math.round(fy), 2, 3);
    }
    // Toroids at the corners (dot colour = state; dark when switched off).
    const tor: [number, number][] = [[sx + sw * 0.8, sy - 2], [sx + sw * 0.8, sy + sh + 1], [sx + sw * 0.1, sy - 2], [sx + sw * 0.1, sy + sh + 1]];
    tor.forEach(([tx, ty], i) => {
      const out = toroidOut(s, g.helm.toroids, i);
      x.fillStyle = '#0a0814';
      x.fillRect(Math.round(tx) - 2, Math.round(ty) - 1, 5, 3);
      x.fillStyle = !g.helm.toroids[i] ? '#2a2440' : out <= 0 ? (Math.floor(this.t * 3) % 2 ? PAL.crit : '#400') : stateCol(s.toroids[i]);
      x.fillRect(Math.round(tx) - 1, Math.round(ty), 3, 1);
    });
    // Crawler banks: four ticks a side at the left edge.
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? 0 : 1;
      x.fillStyle = s.crawlers[i] > 0.1 ? stateCol(s.crawlers[i]) : PAL.crit;
      x.fillRect(3 + (i % 4) * 3, side ? 26 : 9, 2, 5);
    }
    pxMini(x, 'L', 3, 3, PAL.dim, 'left', null);
    pxMini(x, 'R', 3, 33, PAL.dim, 'left', null);
    // Armour rating and the worst system, bottom right.
    const worst = SYSTEMS.reduce((a, k) => (s.systems[k.key] < s.systems[a.key] ? k : a), SYSTEMS[0]);
    const wv = s.systems[worst.key];
    pxMini(x, `ARM ${Math.round(p.stats.armor * 100)}%`, W - 2, 3, PAL.text, 'right', null);
    if (wv < 0.8) pxMini(x, `${worst.name.split(' ')[0].toUpperCase().slice(0, 7)} ${damageState(wv).name.slice(0, 4).toUpperCase()}`, W - 2, 33, stateCol(wv), 'right', null);
    else {
      const [l, r] = crawlersUp(s);
      pxMini(x, `CRAWL ${l + r}/8`, W - 2, 33, PAL.text, 'right', null);
    }
    void sysMult;
  }

  private drawEnergy(g: Game): void {
    const max = g.maxEnergy();
    const e = g.energy;
    const key = `${Math.floor(e * 4)}:${max}`;
    if (key === this.energy.key) return;
    this.energy.key = key;
    const x = this.energy.x;
    x.clearRect(0, 0, 40, 40);
    text(x, String(Math.floor(e)), 20, 3, 2, 'cyan', 'center');
    // A column of cells, one per point.
    const n = Math.min(12, max);
    const cw = Math.floor(34 / n);
    for (let i = 0; i < n; i++) {
      const f = Math.max(0, Math.min(1, e - i));
      x.fillStyle = '#0a0814';
      x.fillRect(3 + i * cw, 21, cw - 1, 6);
      x.fillStyle = f >= 1 ? PAL.cyan : '#14504a';
      x.fillRect(3 + i * cw, 21 + Math.round(6 * (1 - f)), cw - 1, Math.round(6 * f));
    }
    pxMini(x, `/${max}`, 20, 31, PAL.dim, 'center', null);
  }

  private drawDrive(g: Game): void {
    const p = g.player;
    const hm = g.helm;
    const kmh = Math.round(Math.abs(p.speed) * 3.6);
    const key = `${kmh}:${Math.round(hm.lever * 20)}:${Math.round(hm.brake * 10)}:${Math.round(p.spool * 10)}:${Math.round(hm.heat * 10)}:${hm.overdrive}:${hm.overheat}`;
    if (key === this.drive.key) return;
    this.drive.key = key;
    const x = this.drive.x;
    x.clearRect(0, 0, 96, 40);
    // Throttle quadrant on the left: the lever from REV to FULL, the brake under it.
    x.fillStyle = '#0a0814';
    x.fillRect(4, 3, 5, 28);
    const ly = Math.round(3 + (1 - (hm.lever + 0.5) / 1.5) * 26);
    x.fillStyle = hm.lever < 0 ? PAL.bad : PAL.amber;
    x.fillRect(3, ly, 7, 3);
    x.fillStyle = PAL.dim;
    x.fillRect(10, Math.round(3 + (1 - 0.5 / 1.5) * 26), 2, 1);
    if (hm.brake > 0) {
      x.fillStyle = PAL.bad;
      x.fillRect(3, 33, Math.round(7 * hm.brake), 3);
    }
    // Speed, big.
    text(x, String(kmh), 58, 3, 2, hm.overdrive ? 'amber' : 'white', 'center');
    pxMini(x, 'KM/H', 58, 18, PAL.dim, 'center', null);
    // Revs and heat.
    row(x, 25, 'RPM', p.spool, PAL.cyan, `${Math.round(p.spool * 100)}`, 96);
    row(x, 32, 'HEAT', hm.heat, hm.overheat ? PAL.bad : hm.heat > 0.7 ? PAL.warn : PAL.good, hm.overdrive ? 'OD' : hm.overheat ? 'HOT' : '', 96);
  }

  private drawSupply(g: Game): void {
    const p = g.player;
    const s = g.titan;
    const cs = crewSummary(g);
    const out = g.teams.filter((t) => t.phase !== 'back').length;
    const key = `${Math.round(s.fuel)}:${Math.round(s.water)}:${Math.round(p.stats.powerRatio * 50)}:${cs.aboard}:${cs.bunks}:${out}`;
    if (key === this.supply.key) return;
    this.supply.key = key;
    const x = this.supply.x;
    x.clearRect(0, 0, 104, 40);
    const fuel = s.fuel / FUEL_MAX, water = s.water / WATER_MAX;
    row(x, 3, 'FUEL', fuel, fuel > 0.25 ? PAL.amber : PAL.bad, `${Math.round(fuel * 100)}%`, 104);
    row(x, 11, 'H2O', water, water > 0.25 ? '#249fde' : PAL.bad, `${Math.round(water * 100)}%`, 104);
    row(x, 19, 'PWR', Math.min(1, p.stats.powerRatio), p.stats.powerRatio >= 1 ? PAL.good : PAL.warn, `${Math.round(p.stats.powerRatio * 100)}%`, 104);
    row(x, 27, 'CREW', cs.aboard / Math.max(1, cs.bunks), PAL.text, `${cs.aboard}`, 104);
    pxMini(x, out ? `${out} REPAIR TEAM${out > 1 ? 'S' : ''} OUT` : g.autoRepair ? 'DAMAGE CTRL AUTO' : 'DAMAGE CTRL MANUAL', 52, 34, out ? PAL.warn : PAL.dim, 'center', null);
  }
}
