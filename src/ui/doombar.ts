import type { Game } from '../game/game';
import { FUEL_MAX, WATER_MAX } from '../game/systems/titan';
import { h } from './dom';
import { pxText as text } from './pixfont';

/**
 * The status bar along the bottom of the screen, in the spirit of an old corridor shooter: a slab of worn grey
 * metal, big red numbers for what matters in a fight (CELLS to play cards, HULL, ARMOUR), the captain's face in the
 * middle reacting to how the ship is doing and where the hits come from, and a table of the ship's supplies.
 * Everything is drawn as pixel art on small canvases.
 */

/* ---------------------------------------------------------------------- */
/* Worn metal                                                              */
/* ---------------------------------------------------------------------- */

let metalUrl = '';

/** A tile of grainy grey metal with scratches and rust spots, as a data URL for CSS. */
export function metalTexture(): string {
  if (metalUrl) return metalUrl;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d')!;
  const img = x.createImageData(128, 64);
  let s = 1234567;
  const rnd = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 128 * 64; i++) {
    const n = rnd();
    const base = 92 + Math.floor(n * 34) + (rnd() < 0.04 ? -30 : 0);
    const rust = rnd() < 0.015;
    img.data[i * 4] = rust ? base + 26 : base;
    img.data[i * 4 + 1] = rust ? base - 8 : base;
    img.data[i * 4 + 2] = rust ? base - 26 : base + 2;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 0; k < 14; k++) x.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 64), 1 + Math.floor(rnd() * 12), 1);
  metalUrl = c.toDataURL();
  return metalUrl;
}

/* ---------------------------------------------------------------------- */
/* The captain's face                                                      */
/* ---------------------------------------------------------------------- */

const FW = 24, FH = 29;

/**
 * The captain, looking back at you: bloodier the more battered the ship is, glancing toward where the hits land,
 * wincing at big ones, grinning after a string of kills, gold-eyed while invulnerable, and grey when the ship is down.
 */
function drawFace(x: CanvasRenderingContext2D, u: number, hurt: number, look: number, mood: 'calm' | 'ouch' | 'grin' | 'dead' | 'god', blink: boolean): void {
  const P = (px: number, py: number, w: number, hh: number, c: string): void => {
    x.fillStyle = c;
    x.fillRect(px * u, py * u, w * u, hh * u);
  };
  x.clearRect(0, 0, FW * u, FH * u);
  const skin = mood === 'dead' ? '#8a8a80' : '#c8905c', skinD = mood === 'dead' ? '#5e5e56' : '#9a643a', skinL = mood === 'dead' ? '#a8a8a0' : '#e4b080';
  // Background of the face slot.
  P(0, 0, FW, FH, '#1a1410');
  // Head and jaw.
  P(5, 4, 14, 20, skin);
  P(6, 24, 12, 2, skin);
  P(4, 8, 1, 12, skinD);
  P(19, 8, 1, 12, skinD);
  P(5, 4, 14, 1, skinL);
  P(6, 5, 1, 16, skinL);
  P(17, 5, 2, 18, skinD);
  // Hair (captain's crop) and cap band.
  P(4, 1, 16, 4, '#3a2a1c');
  P(5, 0, 14, 2, '#4a3624');
  P(4, 3, 16, 1, '#22303c');
  P(4, 2, 16, 1, '#35495a');
  P(11, 2, 2, 1, '#ffd740');
  // Ears.
  P(3, 11, 2, 4, skinD);
  P(19, 11, 2, 4, skinD);
  // Brows, eyes.
  const lx = 7 + look, rx = 13 + look;
  const brow = mood === 'ouch' ? '#2a1a10' : '#3a2a1c';
  P(6, 9, 5, 1, brow);
  P(13, 9, 5, 1, brow);
  if (mood === 'ouch') {
    P(6, 8, 2, 1, brow);
    P(16, 8, 2, 1, brow);
  }
  if (mood === 'dead') {
    P(7, 11, 3, 1, '#2a2a2a');
    P(14, 11, 3, 1, '#2a2a2a');
  } else if (blink) {
    P(7, 11, 3, 1, skinD);
    P(13, 11, 3, 1, skinD);
  } else {
    P(6, 10, 5, 3, '#f0ece0');
    P(13, 10, 5, 3, '#f0ece0');
    const iris = mood === 'god' ? '#ffd700' : '#3a6aa0';
    P(lx, 10, 2, 3, iris);
    P(rx, 10, 2, 3, iris);
    P(lx, 11, 1, 1, '#0a0a0a');
    P(rx, 11, 1, 1, '#0a0a0a');
  }
  // Nose and cheeks.
  P(11, 12, 2, 5, skinD);
  P(12, 16, 2, 1, skinD);
  P(7, 15, 3, 1, skinD);
  P(15, 15, 3, 1, skinD);
  // Stubble.
  for (let k = 0; k < 18; k++) P(6 + ((k * 7) % 12), 19 + ((k * 5) % 5), 1, 1, '#7a5030');
  // Mouth by mood.
  if (mood === 'grin') {
    P(8, 19, 8, 2, '#3a0c08');
    P(9, 19, 6, 1, '#f0ece0');
  } else if (mood === 'ouch') {
    P(9, 18, 6, 4, '#3a0c08');
    P(10, 19, 4, 1, '#f0ece0');
  } else if (mood === 'dead') P(9, 20, 6, 1, '#2a1a10');
  else P(9, 20, 6, 1, '#6a2a1a');
  // Blood and bruises the more hurt the ship is.
  const blood = '#9a0a06', bloodL = '#d01a10';
  if (hurt >= 1) {
    P(15, 5, 2, 3, blood);
    P(16, 8, 1, 2, blood);
  }
  if (hurt >= 2) {
    P(6, 13, 2, 2, '#6a3a5a');
    P(9, 21, 1, 3, blood);
  }
  if (hurt >= 3) {
    P(5, 6, 3, 2, bloodL);
    P(6, 8, 1, 4, blood);
    P(14, 17, 3, 2, '#6a3a5a');
  }
  if (hurt >= 4) {
    P(12, 4, 3, 2, bloodL);
    P(17, 13, 2, 6, blood);
    P(8, 23, 5, 2, blood);
  }
  // Collar.
  P(5, 26, 14, 3, '#22303c');
  P(10, 26, 4, 3, '#35495a');
  P(11, 27, 2, 1, '#ffd740');
}

/* ---------------------------------------------------------------------- */
/* The bar                                                                 */
/* ---------------------------------------------------------------------- */

interface Section {
  el: HTMLDivElement;
  cv: HTMLCanvasElement;
  key: string;
}

export class DoomBar {
  readonly root = h('div', 'doom-bar');
  /** Where the HUD puts the hand of cards. */
  readonly cards = h('div', 'db-cards');
  private cells: Section;
  private hull: Section;
  private armor: Section;
  private stats: Section;
  private face: Section;
  private hpWas = -1;
  private ouchT = 0;
  private grinT = 0;
  private killsWas = -1;
  private killRush = 0;
  private lookT = 0;
  private look = 0;
  private hitSide = 0;
  private blinkT = 2;

  constructor() {
    this.root.style.backgroundImage = `url(${metalTexture()})`;
    // The rest of the interface wears the same worn metal.
    document.documentElement.style.setProperty('--metal', `url(${metalTexture()})`);
    const sec = (cls: string, w: number, hh: number): Section => {
      const el = h('div', `db-sec ${cls}`);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = hh;
      el.appendChild(cv);
      return { el, cv, key: '' };
    };
    this.cells = sec('db-cells', 64, 36);
    this.hull = sec('db-hull', 86, 36);
    this.face = sec('db-face', FW, FH);
    this.armor = sec('db-armor', 86, 36);
    this.stats = sec('db-stats', 96, 36);
    this.root.append(this.cells.el, this.hull.el, this.cards, this.face.el, this.armor.el, this.stats.el);
  }

  /** Where a hit came from, relative to the way the ship faces (-1 port, 1 starboard): the captain glances there. */
  hitFrom(side: number): void {
    this.hitSide = side;
    this.lookT = 1.2;
  }

  update(g: Game, dt: number): void {
    const p = g.player;
    const hpFrac = Math.max(0, p.hp / Math.max(1, p.stats.maxHp));
    // The captain's mood.
    if (this.hpWas >= 0 && p.hp < this.hpWas - p.stats.maxHp * 0.04) this.ouchT = 0.9;
    this.hpWas = p.hp;
    // A string of kills in a couple of seconds puts a grin on the captain's face.
    const kills = g.stats.kills ?? 0;
    this.killRush = this.killRush * Math.exp(-dt / 2) + Math.max(0, kills - (this.killsWas < 0 ? kills : this.killsWas));
    this.killsWas = kills;
    if (this.killRush > 10) {
      this.grinT = 1.6;
      this.killRush = 0;
    }
    this.ouchT -= dt;
    this.grinT -= dt;
    this.lookT -= dt;
    this.blinkT -= dt;
    if (this.lookT <= 0) {
      this.look = Math.random() < 0.6 ? 0 : Math.random() < 0.5 ? -1 : 1;
      this.lookT = 1 + Math.random() * 1.5;
      this.hitSide = 0;
    }
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;
    const mood = p.dead ? 'dead' : p.hasBuff('invuln') ? 'god' : this.ouchT > 0 ? 'ouch' : this.grinT > 0 ? 'grin' : 'calm';
    const hurt = hpFrac > 0.8 ? 0 : hpFrac > 0.6 ? 1 : hpFrac > 0.4 ? 2 : hpFrac > 0.2 ? 3 : 4;
    const look = this.hitSide || this.look;
    const fk = `${mood}:${hurt}:${look}:${this.blinkT < 0}`;
    if (fk !== this.face.key) {
      this.face.key = fk;
      drawFace(this.face.cv.getContext('2d')!, 1, hurt, look, mood, this.blinkT < 0 && mood !== 'dead');
    }
    // CELLS: the energy that plays cards, as a big number and a row of battery cells.
    const max = g.maxEnergy();
    const e = g.energy;
    const ck = `${Math.floor(e * 4)}:${max}`;
    if (ck !== this.cells.key) {
      this.cells.key = ck;
      const x = this.cells.cv.getContext('2d')!;
      x.clearRect(0, 0, 64, 36);
      text(x, String(Math.floor(e)), 32, 1, 3, 'big', 'center');
      const n = Math.min(12, max), cw = Math.floor(58 / n);
      for (let i = 0; i < n; i++) {
        const f = Math.max(0, Math.min(1, e - i));
        x.fillStyle = '#101010';
        x.fillRect(3 + i * cw, 23, cw - 1, 4);
        x.fillStyle = f >= 1 ? '#6aff5a' : '#2a5a24';
        x.fillRect(3 + i * cw, 23, Math.round((cw - 1) * f), 4);
      }
      text(x, 'CELLS', 32, 29, 1, 'label', 'center');
    }
    // HULL %.
    const hk = `${Math.ceil(hpFrac * 100)}`;
    if (hk !== this.hull.key) {
      this.hull.key = hk;
      const x = this.hull.cv.getContext('2d')!;
      x.clearRect(0, 0, 86, 36);
      text(x, `${Math.ceil(hpFrac * 100)}%`, 43, 2, 3, 'big', 'center');
      text(x, 'HULL', 43, 28, 1, 'label', 'center');
    }
    // ARMOUR %: the armour rating plus the shield and barrier on top of it.
    const shield = p.stats.maxHp > 0 ? (p.shield + (p.buff('barrier')?.v ?? 0)) / p.stats.maxHp : 0;
    const armor = Math.round(p.stats.armor * 100 + shield * 100);
    const ak = `${armor}`;
    if (ak !== this.armor.key) {
      this.armor.key = ak;
      const x = this.armor.cv.getContext('2d')!;
      x.clearRect(0, 0, 86, 36);
      text(x, `${Math.min(999, armor)}%`, 43, 2, 3, 'big', 'center');
      text(x, 'ARMOR', 43, 28, 1, 'label', 'center');
    }
    // The supply table.
    const t = g.titan;
    const rows: [string, string, string][] = [
      ['SPD', `${Math.round(Math.abs(p.speed) * 3.6)}`, 'KMH'],
      ['FUEL', `${Math.round((t.fuel / FUEL_MAX) * 100)}`, '%'],
      ['H2O', `${Math.round((t.water / WATER_MAX) * 100)}`, '%'],
      ['CREW', `${p.troops + g.crew.filter((c) => c.loc === 'main').length}`, `/${p.stats.bunks + g.crewCap()}`],
    ];
    const sk = rows.map((r) => r[1]).join(':');
    if (sk !== this.stats.key) {
      this.stats.key = sk;
      const x = this.stats.cv.getContext('2d')!;
      x.clearRect(0, 0, 96, 36);
      rows.forEach((r, i) => {
        const y = Math.round(2 + i * 8.5);
        text(x, r[0], 3, y, 1, 'label');
        text(x, r[1], 64, y, 1, 'small', 'right');
        text(x, r[2], 67, y, 1, 'label');
      });
    }
  }
}
