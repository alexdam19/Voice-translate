import { getItem } from '../shared/items';
import { RARITIES, type Rarity } from '../shared/rarity';
import { WEAPONS } from '../shared/weapons';
import { championDef, ROLES, type CrewMember } from '../game/crew';
import { portraitHD } from './px/portraits';
import { MODULES } from '../game/defs';
import { MODULE_COLOR, getAtlas } from './textures';
import { Pix, shade, seeded } from './pixel';

/** Pixel-art icons for the DOM UI, rendered once and cached as data URLs. */

const urls = new Map<string, string>();

function make(key: string, w: number, h: number, draw: (p: Pix, ctx: CanvasRenderingContext2D) => void): string {
  const hit = urls.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(new Pix(ctx, 0, 0, w, h, key.length * 97), ctx);
  const u = c.toDataURL();
  urls.set(key, u);
  return u;
}

/* ---------------- items ---------------- */

export function itemIcon(id: string): string {
  return make(`item:${id}`, 16, 16, (p) => {
    const d = getItem(id);
    const a = d.c1, b = d.c2, dk = shade(d.c1, 0.55);
    switch (d.icon) {
      case 'ore':
        p.circle(8, 9, 6, b);
        p.circle(6, 7, 2, a);
        p.circle(10, 11, 1.6, a);
        p.circle(10, 6, 1.2, a);
        p.set(5, 6, '#ffffff');
        break;
      case 'scrap':
        p.rect(2, 7, 7, 6, a);
        p.rect(7, 3, 7, 6, b);
        p.rect(4, 11, 9, 3, dk);
        p.set(8, 4, '#dddddd');
        break;
      case 'plate':
        p.rect(2, 4, 12, 8, b);
        p.rect(3, 5, 10, 6, a);
        p.set(4, 6, '#ffffff');
        break;
      case 'wire':
        p.ring(8, 8, 5, a);
        p.ring(8, 8, 3, b);
        break;
      case 'alloy':
        p.rect(3, 6, 10, 5, a);
        p.rect(2, 10, 12, 2, b);
        p.rect(4, 6, 8, 1, '#ffffff');
        break;
      case 'rod':
        p.rect(6, 1, 4, 14, b);
        p.rect(7, 2, 2, 12, a);
        break;
      case 'crystal':
        p.rect(7, 2, 3, 12, a);
        p.rect(4, 6, 3, 8, b);
        p.rect(10, 5, 3, 9, b);
        p.set(8, 3, '#ffffff');
        break;
      case 'core':
        p.circle(8, 8, 6, b);
        p.circle(8, 8, 3.5, a);
        p.set(7, 6, '#ffffff');
        break;
      case 'chip':
      case 'tech':
        p.rect(3, 3, 10, 10, b);
        p.rect(5, 5, 6, 6, a);
        for (let i = 3; i < 13; i += 3) {
          p.set(i, 1, '#bdbdbd');
          p.set(i, 14, '#bdbdbd');
          p.set(1, i, '#bdbdbd');
          p.set(14, i, '#bdbdbd');
        }
        break;
      case 'powder':
        p.circle(8, 10, 5, b);
        p.circle(8, 9, 4, a);
        break;
      case 'biomass':
        p.rect(7, 8, 2, 6, '#e0d6c2');
        p.circle(8, 7, 5, a);
        p.set(6, 5, b);
        p.set(10, 7, b);
        break;
      case 'explosive':
        p.rect(3, 4, 10, 9, a);
        p.rect(3, 7, 10, 2, b);
        p.rect(7, 1, 1, 3, '#bdbdbd');
        break;
      case 'kit':
        p.rect(2, 4, 12, 9, a);
        p.rect(7, 5, 2, 7, '#e53935');
        p.rect(5, 7, 6, 2, '#e53935');
        p.rect(6, 2, 4, 2, b);
        break;
      case 'ration':
        p.rect(3, 4, 10, 9, a);
        p.rect(3, 4, 10, 3, b);
        break;
      case 'wheel':
      case 'track':
      case 'chain':
      case 'magtrack':
      case 'hover':
        p.rect(1, 5, 14, 7, a);
        for (let x = 2; x < 14; x += 3) p.rect(x, 5, 2, 7, b);
        if (d.icon === 'hover') p.rect(1, 12, 14, 2, '#18ffff');
        break;
    }
  });
}

/* ---------------- weapons ---------------- */

export function weaponIcon(key: string, rarity: Rarity): string {
  return make(`w:${key}:${rarity}`, 24, 24, (p) => {
    const col = RARITIES[rarity].color;
    p.fill('#15161b');
    p.frame(0, 0, 24, 24, col);
    p.frame(1, 1, 22, 22, shade(col, 0.4));
    const d = WEAPONS[key];
    const m = '#90a4ae', dk = '#37474f';
    p.rect(5, 12, 9, 7, dk);
    p.rect(6, 12, 7, 1, m);
    switch (key) {
      case 'autocannon': p.rect(12, 14, 9, 2, m); break;
      case 'gatling': p.rect(12, 13, 9, 1, m); p.rect(12, 15, 9, 1, m); p.rect(12, 17, 9, 1, m); break;
      case 'flak': p.rect(12, 13, 8, 2, m); p.rect(12, 17, 8, 2, m); break;
      case 'laser': p.rect(12, 15, 9, 1, m); p.rect(20, 14, 2, 3, '#ff1744'); break;
      case 'point_defense': p.rect(12, 14, 6, 1, m); p.rect(12, 16, 6, 1, m); p.circle(9, 10, 2, '#40c4ff'); break;
      case 'missile_pod': case 'hydra': p.rect(8, 6, 12, 12, m); for (let i = 0; i < (key === 'hydra' ? 4 : 2); i++) p.rect(10 + i * 3 - (key === 'hydra' ? 1 : 0), 9, 2, 2, '#ff1744'); p.rect(10, 13, 8, 1, dk); break;
      case 'mortar': case 'oblivion': p.rect(10, 4, 5, 10, dk); p.rect(10, 4, 5, 1, key === 'oblivion' ? '#e040fb' : m); break;
      case 'tesla': case 'thunderhead': p.rect(10, 4, 3, 9, m); p.circle(11.5, 4, 3, key === 'tesla' ? '#b388ff' : '#40c4ff'); break;
      case 'main_battery': p.rect(12, 13, 10, 3, m); p.rect(20, 12, 2, 5, dk); break;
      case 'rail_cannon': p.rect(12, 12, 10, 1, m); p.rect(12, 16, 10, 1, m); p.rect(12, 14, 10, 1, '#ff7af0'); break;
      case 'sunspear': p.rect(12, 13, 10, 3, '#ffee58'); p.rect(12, 14, 10, 1, '#ffffff'); break;
      case 'maw': for (let i = 0; i < 3; i++) p.rect(12, 12 + i * 2, 6, 1, m); break;
      case 'grenade_launcher': p.rect(12, 13, 6, 4, m); p.circle(19, 9, 2, '#c5e1a5'); break;
      case 'scattergun': p.rect(12, 13, 7, 2, m); p.rect(12, 16, 7, 2, m); p.rect(19, 12, 2, 7, dk); break;
      case 'raygun': p.rect(12, 14, 7, 2, m); for (let i = 0; i < 3; i++) p.rect(13 + i * 2, 12, 1, 6, '#b0bec5'); p.circle(20, 15, 1.5, '#69f0ae'); break;
      case 'cryo_blaster': p.rect(12, 14, 8, 2, m); p.rect(8, 9, 6, 2, '#80deea'); p.set(20, 15, '#e0f7fa'); break;
      case 'flamethrower': case 'dragons_breath': p.rect(12, 14, 7, 2, m); p.circle(8, 9, 3, key === 'dragons_breath' ? '#ff3d00' : '#795548'); p.rect(19, 12, 3, 5, '#ff9100'); p.set(21, 14, '#ffea00'); break;
      case 'acid_launcher': p.rect(12, 13, 6, 3, m); p.circle(9, 9, 3, '#76ff03'); p.circle(19, 17, 1.5, '#76ff03'); break;
      case 'soul_reaper': p.circle(15, 12, 4, '#b388ff'); p.rect(13, 11, 1, 1, '#1a1030'); p.rect(16, 11, 1, 1, '#1a1030'); p.rect(14, 14, 3, 1, '#1a1030'); break;
      case 'arcane_orb': p.circle(15, 11, 5, '#ea80fc'); p.circle(14, 10, 2, '#ffffff'); break;
      case 'swarm_hive': p.rect(8, 6, 12, 12, m); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) p.set(10 + i * 3, 8 + j * 3, '#ff9100'); break;
      case 'hornet_nest': p.rect(6, 15, 14, 2, dk); p.rect(9, 12, 8, 2, '#eceff1'); p.rect(12, 9, 2, 8, '#90caf9'); p.set(17, 12, '#18ffff'); break;
      case 'plasma_launcher': p.rect(12, 13, 8, 3, m); p.circle(20, 14.5, 2.5, '#e040fb'); break;
      case 'chrono_cannon': p.rect(12, 13, 8, 3, m); p.circle(10, 9, 3.5, '#18ffff'); p.rect(10, 7, 1, 3, '#0e2a30'); break;
      case 'kraken': p.rect(12, 13, 6, 3, m); for (let i = 0; i < 3; i++) p.rect(16 + i * 2, 16, 1, 5, '#7c4dff'); break;
      case 'sonic_cannon': p.rect(12, 14, 4, 2, m); p.rect(16, 10, 2, 10, dk); p.rect(19, 12, 1, 6, '#b2ebf2'); p.rect(21, 11, 1, 8, '#b2ebf2'); break;
      case 'howitzer': p.rect(11, 12, 11, 4, m); p.rect(20, 11, 2, 6, dk); p.circle(8, 8, 2, '#ffcc80'); break;
      case 'ray_rail': p.rect(12, 12, 10, 1, '#ff7af0'); p.rect(12, 13, 10, 1, m); p.rect(12, 16, 7, 1, '#69f0ae'); break;
      case 'storm_spire': case 'stormcaller': p.rect(10, 3, 3, 12, m); p.circle(11.5, 3, 3, '#40c4ff'); p.rect(15, 6, 1, 3, '#82b1ff'); p.rect(16, 9, 1, 3, '#82b1ff'); p.rect(15, 12, 1, 3, '#82b1ff'); break;
      case 'gravity_cannon': p.rect(12, 13, 8, 3, m); p.circle(15, 8, 3, '#1a0a24'); p.ring(15, 8, 3, '#d500f9'); break;
      case 'phoenix_launcher': p.rect(12, 14, 8, 3, m); p.rect(8, 7, 10, 2, '#ff6d00'); p.rect(11, 5, 4, 6, '#ff9100'); p.set(13, 6, '#ffea00'); break;
      case 'void_lance': p.rect(11, 13, 11, 3, '#311b92'); p.rect(11, 14, 11, 1, '#b388ff'); p.circle(8, 8, 2, '#651fff'); break;
      case 'starfall': p.circle(15, 8, 3, '#ffd740'); p.rect(9, 11, 3, 3, '#ff9100'); p.rect(6, 14, 3, 3, '#ff6d00'); break;
      default: p.rect(12, 14, 8, 2, m);
    }
    if (d?.exclusive) {
      p.set(3, 3, '#ffea00');
      p.set(4, 3, '#ffea00');
      p.set(3, 4, '#ffea00');
    }
    if (rarity >= 5) {
      p.set(20, 3, '#ffffff');
      p.set(19, 3, '#ff4f7b');
      p.set(21, 3, '#ff4f7b');
      p.set(20, 2, '#ff4f7b');
      p.set(20, 4, '#ff4f7b');
    }
  });
}

/* ---------------- modules ---------------- */

export function moduleIcon(key: string): string {
  return make(`m:${key}`, 32, 32, (_p, ctx) => {
    const atlas = getAtlas();
    let r;
    try {
      r = atlas.get(`mod_${key}`);
    } catch {
      return;
    }
    const size = atlas.canvas.width;
    const sx = r.u0 * size, sy = r.v1 * size;
    ctx.drawImage(atlas.canvas, Math.round(sx), Math.round(sy), 16, 16, 0, 0, 32, 32);
    ctx.strokeStyle = MODULE_COLOR[key] ?? '#90a4ae';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 30, 30);
    void MODULES;
  });
}

/* ---------------- portraits ---------------- */

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0785a'];
const HAIR = ['#212121', '#4e342e', '#795548', '#ffb74d', '#e0e0e0', '#b71c1c', '#6a1b9a', '#1565c0'];

/** An officer's portrait: a painted pixel bust (see px/portraits.ts). */
export function portrait(c: CrewMember): string {
  const ch = championDef(c);
  return portraitHD({ seed: c.face, role: c.role, roleColor: ROLES[c.role].color, rarityColor: RARITIES[c.rarity].color, hair: ch?.hair, accent: ch?.accent ?? (c.exclusive ? '#e040fb' : undefined) });
}

/** The old 24 px face (kept for reference and small icons). */
export function portraitSmall(c: CrewMember): string {
  const ch = championDef(c);
  const key = `pt:${c.face}:${c.role}:${c.rarity}:${ch?.id ?? ''}:${c.exclusive ?? ''}`;
  return make(key, 24, 24, (p) => {
    const r = seeded(c.face);
    const rc = RARITIES[c.rarity].color;
    const role = ROLES[c.role].color;
    p.fill(shade(rc, 0.28));
    for (let y = 0; y < 24; y += 2) p.rect(0, y, 24, 1, shade(rc, 0.34));
    const skin = SKIN[Math.floor(r() * SKIN.length)];
    const hair = ch ? ch.hair : HAIR[Math.floor(r() * HAIR.length)];
    // Shoulders in role color
    p.rect(3, 19, 18, 5, role);
    p.rect(3, 19, 18, 1, shade(role, 1.3));
    p.rect(10, 17, 4, 3, skin);
    // Head
    p.rect(7, 6, 10, 11, skin);
    p.rect(7, 16, 10, 1, shade(skin, 0.8));
    // Eyes
    const eyeY = 10 + Math.floor(r() * 2);
    p.rect(9, eyeY, 2, 2, '#1a1a1a');
    p.rect(13, eyeY, 2, 2, '#1a1a1a');
    p.set(9, eyeY, '#ffffff');
    p.set(13, eyeY, '#ffffff');
    p.rect(10, 14, 4, 1, shade(skin, 0.6));
    // Hair / helmet
    const style = Math.floor(r() * 4);
    if (c.role === 'marine' || c.role === 'gunner') {
      p.rect(6, 4, 12, 4, shade(role, 0.6));
      p.rect(6, 7, 12, 1, shade(role, 0.4));
    } else if (style === 0) {
      p.rect(6, 4, 12, 4, hair);
      p.rect(6, 4, 2, 8, hair);
      p.rect(16, 4, 2, 8, hair);
    } else if (style === 1) {
      p.rect(7, 3, 10, 4, hair);
    } else if (style === 2) {
      p.rect(6, 4, 12, 3, hair);
      p.rect(6, 7, 2, 12, hair);
      p.rect(16, 7, 2, 12, hair);
    } else {
      p.rect(9, 2, 6, 5, hair);
    }
    if (c.role === 'scientist' || c.role === 'engineer') {
      p.rect(8, eyeY - 1, 8, 4, '#263238');
      p.rect(9, eyeY, 2, 2, '#4dd0e1');
      p.rect(13, eyeY, 2, 2, '#4dd0e1');
    }
    if (c.role === 'medic') p.rect(4, 20, 3, 3, '#ffffff');
    if (ch) {
      // Crown / sigil for champions
      p.rect(8, 1, 8, 2, ch.accent);
      p.set(8, 0, ch.accent);
      p.set(11, 0, ch.accent);
      p.set(15, 0, ch.accent);
      p.rect(18, 19, 3, 3, ch.accent);
    }
    if (c.exclusive) p.rect(18, 19, 3, 3, '#e040fb');
    p.frame(0, 0, 24, 24, rc);
  });
}

export function roleIcon(role: string): string {
  return make(`role:${role}`, 12, 12, (p) => {
    const c = ROLES[role as keyof typeof ROLES]?.color ?? '#fff';
    p.circle(6, 6, 5, c);
    p.circle(6, 6, 3, shade(c, 0.5));
  });
}

/* ---------------- battle cards ---------------- */

const SCHOOL_BG: Record<string, [string, string]> = {
  iron: ['#5a1e10', '#c1502a'],
  volt: ['#0c2c44', '#2a88c0'],
  rust: ['#1e3410', '#5a8a2c'],
  void: ['#1c0e30', '#6a3aa8'],
  aegis: ['#3e3208', '#b08a1c'],
};

/** Card illustration, 48x32 pixels: a sky in the school's colors and a motif for the card. */
export function cardArt(id: string, school: string): string {
  return make(`card:${id}`, 48, 32, (p) => {
    const [dk, lt] = SCHOOL_BG[school] ?? ['#222', '#555'];
    for (let y = 0; y < 32; y++) p.rect(0, y, 48, 1, shade(lt, 0.35 + (y / 32) * 0.55));
    p.speck(shade(lt, 1.4), 10);
    p.rect(0, 26, 48, 6, shade(dk, 0.9));
    p.rect(0, 26, 48, 1, shade(lt, 0.8));
    const W = '#ffffff', Y = '#ffea00', O = '#ff9100', R = '#ff3d00', G = '#9e9e9e', D = '#263238';
    const boom = (x: number, y: number, r: number): void => {
      p.circle(x, y, r, O);
      p.circle(x, y, r * 0.65, Y);
      p.circle(x, y, r * 0.3, W);
    };
    const tank = (x: number, y: number): void => {
      p.rect(x, y, 14, 5, '#546e7a');
      p.rect(x + 3, y - 3, 7, 3, '#78909c');
      p.rect(x + 10, y - 2, 6, 1, D);
      p.rect(x - 1, y + 5, 16, 2, D);
    };
    const soldier = (x: number, y: number, c: string): void => {
      p.rect(x + 1, y, 3, 3, '#e0ac69');
      p.rect(x, y + 3, 5, 5, c);
      p.rect(x, y + 8, 2, 3, D);
      p.rect(x + 3, y + 8, 2, 3, D);
      p.rect(x + 5, y + 4, 3, 1, D);
    };
    const jet = (x: number, y: number): void => {
      p.rect(x, y, 10, 2, '#eceff1');
      p.rect(x + 3, y - 3, 3, 8, '#90a4ae');
      p.rect(x - 2, y, 2, 2, O);
      p.set(x + 9, y, '#18ffff');
    };
    const bolt = (x: number, y: number, c: string): void => {
      let cx = x;
      for (let k = 0; k < 26; k++) {
        p.set(cx, y + k, c);
        p.set(cx + 1, y + k, W);
        if (k % 5 === 4) cx += k % 10 === 4 ? 2 : -2;
      }
    };
    switch (id) {
      case 'artillery':
        for (let i = 0; i < 3; i++) boom(10 + i * 14, 22 - (i % 2) * 3, 4);
        for (let i = 0; i < 3; i++) p.rect(12 + i * 13, 3 + i * 2, 2, 5, G);
        break;
      case 'salvo':
        for (let i = 0; i < 6; i++) {
          p.rect(4 + i * 7, 18 - i * 2, 5, 1, '#cfd8dc');
          p.rect(1 + i * 7, 18 - i * 2, 3, 1, O);
        }
        boom(40, 22, 4);
        break;
      case 'fireball':
        p.circle(26, 14, 8, R);
        p.circle(28, 13, 5, O);
        p.circle(29, 12, 2.5, Y);
        for (let i = 0; i < 5; i++) p.rect(4 + i * 3, 12 + i, 8, 2, shade(O, 0.8 - i * 0.1));
        break;
      case 'carpet_bomb':
        jet(4, 6);
        for (let i = 0; i < 5; i++) boom(8 + i * 8, 23, 3);
        break;
      case 'barrage':
        for (let i = 0; i < 4; i++) {
          p.rect(4, 8 + i * 4, 40, 1, Y);
          p.rect(38, 7 + i * 4, 4, 3, O);
        }
        break;
      case 'meltdown':
        p.circle(24, 15, 9, '#ff6d00');
        p.ring(24, 15, 11, Y);
        p.circle(24, 15, 4, W);
        p.rect(20, 25, 8, 2, R);
        break;
      case 'jets':
        jet(4, 6);
        jet(18, 12);
        jet(30, 5);
        break;
      case 'meteor':
        for (let i = 0; i < 4; i++) {
          const x = 8 + i * 11, y = 6 + (i % 2) * 6;
          p.rect(x - 6, y - 4, 6, 2, shade(O, 0.7));
          p.circle(x, y, 3, '#6d4c41');
          p.circle(x, y, 1.5, O);
        }
        boom(24, 24, 4);
        break;
      case 'nuke':
        p.rect(21, 14, 6, 12, G);
        p.circle(24, 10, 9, '#ffcc80');
        p.circle(24, 9, 6, Y);
        p.circle(24, 8, 3, W);
        p.rect(10, 24, 28, 3, O);
        break;
      case 'emp':
        p.ring(24, 16, 12, '#ea80fc');
        p.ring(24, 16, 8, '#ce93d8');
        p.ring(24, 16, 4, W);
        break;
      case 'lightning':
        bolt(12, 0, '#82b1ff');
        bolt(30, 2, '#82b1ff');
        boom(13, 25, 3);
        break;
      case 'orbital':
        p.rect(20, 0, 8, 26, '#ff5252');
        p.rect(22, 0, 4, 26, '#ffcdd2');
        boom(24, 25, 5);
        break;
      case 'orbital_laser':
        p.rect(4, 2, 10, 5, '#b0bec5');
        p.rect(0, 4, 4, 1, '#40c4ff');
        p.rect(14, 4, 4, 1, '#40c4ff');
        for (let k = 0; k < 20; k++) p.rect(10 + k, 7 + k, 3, 1, '#ff1744');
        boom(32, 26, 3);
        break;
      case 'timestop':
        p.circle(24, 15, 10, '#e0f7fa');
        p.ring(24, 15, 10, '#18ffff');
        p.rect(23, 7, 2, 9, D);
        p.rect(23, 14, 7, 2, D);
        break;
      case 'blink':
        p.ring(12, 16, 7, '#18ffff');
        p.ring(36, 16, 7, '#18ffff');
        tank(29, 16);
        p.speck('#18ffff', 14);
        break;
      case 'drones':
        for (let i = 0; i < 3; i++) {
          const x = 8 + i * 14, y = 8 + (i % 2) * 6;
          p.rect(x, y, 6, 3, '#546e7a');
          p.rect(x - 2, y - 1, 10, 1, '#b0bec5');
          p.rect(x + 2, y + 3, 1, 8, '#80d8ff');
        }
        break;
      case 'cataclysm':
        p.rect(0, 0, 48, 6, '#1a237e');
        bolt(6, 3, '#82b1ff');
        bolt(22, 2, '#b3e5fc');
        bolt(38, 3, '#82b1ff');
        break;
      case 'nitro':
        tank(20, 18);
        for (let i = 0; i < 3; i++) p.rect(2 + i * 4, 18 + i * 2, 12, 1, '#18ffff');
        break;
      case 'weld':
        p.rect(14, 16, 20, 8, '#78909c');
        p.rect(22, 8, 3, 8, '#8d6e63');
        p.circle(23, 16, 2, W);
        p.speck(Y, 10);
        break;
      case 'nanite':
        p.speck('#69f0ae', 40);
        tank(17, 17);
        break;
      case 'acid_rain':
        p.rect(0, 0, 48, 5, '#33691e');
        for (let i = 0; i < 12; i++) p.rect(2 + i * 4, 6 + (i % 3) * 4, 1, 4, '#76ff03');
        p.rect(4, 26, 40, 2, '#76ff03');
        break;
      case 'magnet':
        p.rect(14, 6, 6, 16, '#e53935');
        p.rect(28, 6, 6, 16, '#1e88e5');
        p.rect(14, 18, 20, 6, G);
        p.rect(14, 6, 6, 3, W);
        p.rect(28, 6, 6, 3, W);
        break;
      case 'frenzy':
        for (let i = 0; i < 5; i++) p.rect(6 + i * 8, 18 - (i % 2) * 4, 6, 6, i % 2 ? '#bcaaa4' : '#ffd740');
        p.speck(Y, 8);
        break;
      case 'mines':
        for (let i = 0; i < 4; i++) {
          p.circle(8 + i * 11, 24, 3, '#37474f');
          p.set(8 + i * 11, 22, '#ff1744');
        }
        break;
      case 'kraken':
        for (let i = 0; i < 4; i++) {
          const x = 8 + i * 10;
          for (let k = 0; k < 14; k++) p.rect(x + Math.round(Math.sin(k * 0.6 + i) * 2), 26 - k, 3, 1, '#7c4dff');
        }
        break;
      case 'singularity':
        p.circle(24, 15, 8, '#12001f');
        p.ring(24, 15, 9, '#d500f9');
        p.ring(24, 15, 13, '#7b1fa2');
        break;
      case 'soul_harvest':
        p.circle(24, 13, 7, '#b388ff');
        p.rect(20, 11, 3, 3, '#1a1030');
        p.rect(26, 11, 3, 3, '#1a1030');
        p.rect(22, 17, 5, 1, '#1a1030');
        break;
      case 'dragon':
        p.rect(10, 12, 20, 6, '#b71c1c');
        p.rect(30, 10, 8, 5, '#d32f2f');
        p.rect(16, 4, 8, 8, '#7f0000');
        p.rect(38, 12, 8, 3, O);
        p.set(35, 11, Y);
        break;
      case 'void_rift':
        for (let k = 0; k < 24; k++) p.rect(23 + Math.round(Math.sin(k * 0.5) * 3), 3 + k, 3, 1, '#12001f');
        p.speck('#b388ff', 16);
        break;
      case 'scholar':
        p.rect(14, 10, 20, 14, '#efebe9');
        p.rect(23, 10, 2, 14, '#8d6e63');
        for (let i = 0; i < 4; i++) {
          p.rect(16, 13 + i * 3, 5, 1, G);
          p.rect(27, 13 + i * 3, 5, 1, G);
        }
        break;
      case 'deadeye':
        p.ring(24, 15, 10, '#ff1744');
        p.ring(24, 15, 5, '#ff1744');
        p.rect(23, 2, 2, 26, '#ff1744');
        p.rect(11, 14, 26, 2, '#ff1744');
        break;
      case 'shield_surge':
        p.ring(24, 16, 12, '#40c4ff');
        p.ring(24, 16, 10, '#b3e5fc');
        tank(17, 17);
        break;
      case 'dome':
        for (let r = 12; r > 9; r--) p.ring(24, 26, r, '#69f0ae');
        tank(17, 19);
        break;
      case 'squad':
        for (let i = 0; i < 3; i++) soldier(10 + i * 11, 13, '#1565c0');
        break;
      case 'legion':
        for (let i = 0; i < 5; i++) soldier(3 + i * 9, 13 - (i % 2) * 2, '#ffa000');
        break;
      case 'mech':
        p.rect(18, 4, 12, 8, '#ff8f00');
        p.rect(30, 7, 10, 2, D);
        p.rect(19, 12, 3, 12, '#5d4037');
        p.rect(26, 12, 3, 12, '#5d4037');
        p.rect(21, 6, 6, 2, '#18ffff');
        break;
      case 'miracle':
        p.rect(21, 4, 6, 22, W);
        p.rect(13, 11, 22, 6, W);
        p.rect(22, 5, 4, 20, Y);
        p.rect(14, 12, 20, 4, Y);
        break;
      case 'treasure':
        p.rect(14, 14, 20, 11, '#8d6e63');
        p.rect(14, 12, 20, 4, '#6d4c41');
        p.rect(22, 16, 4, 4, Y);
        p.speck(Y, 12);
        break;
      case 'charge':
        tank(24, 17);
        for (let i = 0; i < 4; i++) p.rect(2 + i * 4, 16 + i * 2, 16, 1, '#18ffff');
        break;
      case 'smoke':
        for (let i = 0; i < 6; i++) p.circle(8 + i * 7, 18 - (i % 2) * 4, 6, shade('#9e9e9e', 0.8 + (i % 3) * 0.15));
        break;
      default: {
        // Relics: a glowing trinket on a stand.
        p.rect(18, 22, 12, 4, '#5d4037');
        p.circle(24, 14, 7, lt);
        p.circle(24, 14, 4, shade(lt, 1.6));
        p.ring(24, 14, 9, Y);
        p.speck(Y, 6);
      }
    }
  });
}
