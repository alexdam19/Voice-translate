import { CH, OBS, TER, type Building, type GameMap } from '../../shared/map';
import { hash2, mix, shade } from './pixels';

/**
 * The world's buildings drawn as buildings, over the terrain blocks: every region building the map registered
 * (see Building in shared/map.ts) gets a proper roof for what it is and where it stands, and its south wall shows
 * as a facade with windows and a door.
 *
 *  - Houses by country: clay-tiled gables in the green lands, flat adobe roofs with parapets, water barrels and
 *    rugs in the dunes, steep slate under snow in the frost, corrugated tin in the passes and the ash.
 *  - Shops and offices: flat concrete roofs with parapets, air-conditioning units, water tanks, skylights, hatches.
 *  - Factory halls with sawtooth north-light roofs; storage tanks by the lake; barns and silos on the farms;
 *    raider shacks patched from scrap sheet and tarp with spikes round the eaves; tin camp shacks; watchtowers,
 *    chimneys and stacks.
 *  - Temple ruins open to the sky (mosaic floors, broken walls, fallen columns, the altar) and the Divot's gutted
 *    tower blocks (bare slabs, column grids, rubble and puddles).
 *
 * Wherever something has smashed through a building (the tiles of it that are no longer solid), there's rubble.
 * Painted per terrain block at 1, 2 or 4 pixels a metre, in world tiles.
 */

type Ctx = CanvasRenderingContext2D;

interface P {
  x: Ctx;
  f: number;
  x0: number;
  y0: number;
}

const R = (p: P, a: number, b: number, w: number, h: number, c: string): void => {
  const X = Math.round((a - p.x0) * p.f), Y = Math.round((b - p.y0) * p.f);
  const X2 = Math.round((a + w - p.x0) * p.f), Y2 = Math.round((b + h - p.y0) * p.f);
  if (X2 <= X || Y2 <= Y) {
    if (w <= 0 || h <= 0) return;
    p.x.fillStyle = c;
    p.x.fillRect(X, Y, Math.max(1, X2 - X), Math.max(1, Y2 - Y));
    return;
  }
  p.x.fillStyle = c;
  p.x.fillRect(X, Y, X2 - X, Y2 - Y);
};

const disc = (p: P, cx: number, cy: number, r: number, c: string): void => {
  p.x.fillStyle = c;
  p.x.beginPath();
  p.x.arc((cx - p.x0) * p.f, (cy - p.y0) * p.f, Math.max(0.6, r * p.f), 0, Math.PI * 2);
  p.x.fill();
};

const H = (a: number, b: number, s: number): number => hash2(Math.floor(a), Math.floor(b), s);

/** Paints the buildings that show on the block of `size` tiles at (x0, y0), at `f` pixels a tile. */
export function paintBuildings(x: Ctx, map: GameMap, x0: number, y0: number, size: number, f: number): void {
  const seen = new Set<string>();
  const list: Building[] = [];
  // Facades hang south of their footprint, so look a little north too.
  const cx0 = Math.floor((x0 - 2) / CH), cx1 = Math.floor((x0 + size + 2) / CH);
  const cy0 = Math.floor((y0 - 16) / CH), cy1 = Math.floor((y0 + size + 2) / CH);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (!map.inside(cx * CH, cy * CH)) continue;
      const c = map.chunk(cx, cy);
      for (const b of c.buildings ?? []) {
        if (seen.has(b.key)) continue;
        seen.add(b.key);
        if (b.x1 < x0 - 1 || b.x0 > x0 + size + 1 || b.y1 + 16 < y0 || b.y0 > y0 + size + 1) continue;
        list.push(b);
      }
    }
  }
  if (!list.length) return;
  list.sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  const p: P = { x, f, x0, y0 };
  x.save();
  x.beginPath();
  x.rect(0, 0, size * f, size * f);
  x.clip();
  for (const b of list) paintOne(p, map, b);
  x.restore();
}

/** The building's height (m), read from its tiles. */
function heightOf(map: GameMap, b: Building): number {
  let h = 0;
  for (const [tx, ty] of [[(b.x0 + b.x1) >> 1, (b.y0 + b.y1) >> 1], [b.x0, b.y0], [b.x1 - 1, b.y1 - 1], [b.x0, b.y1 - 1]]) h = Math.max(h, map.getOh(tx, ty));
  return h;
}

const SHELL = new Set(['temple_s', 'temple_b', 'temple_i', 'temple_g', 'gutted', 'ruin']);

function paintOne(p: P, map: GameMap, b: Building): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const tall = heightOf(map, b);
  const shell = SHELL.has(b.style);
  const standing = (tx: number, ty: number): boolean => map.getObs(tx, ty) !== OBS.NONE;
  // The south wall, as far as it still stands.
  const fl = Math.min(14, Math.round(tall * 0.15));
  if (!shell && fl > 0) facade(p, b, fl, standing);
  switch (b.style) {
    case 'house_v': {
      const roofs = ['#9a3a2a', '#8a4a30', '#4e5a6a', '#6a5a3a', '#a04a2a'];
      gable(p, b, roofs[b.v % roofs.length], 'tile');
      chimney(p, b);
      break;
    }
    case 'house_f':
      gable(p, b, ['#3a4250', '#4a3a36', '#34404a'][b.v % 3], 'slate');
      snowOn(p, b);
      chimney(p, b);
      break;
    case 'house_p':
      gable(p, b, ['#7a7e84', '#6a7076', '#84786a'][b.v % 3], 'tin');
      break;
    case 'house_d':
      flat(p, b, ['#c8a070', '#b89060', '#d0aa7a'][b.v % 3], 'adobe');
      break;
    case 'shop':
      flat(p, b, ['#8a8a88', '#7e8084', '#948e84'][b.v % 3], 'concrete');
      break;
    case 'barn':
      gable(p, b, ['#8a2a20', '#7a3424', '#6a4030'][b.v % 3], 'tin');
      R(p, b.x0 + w * 0.42, b.y0 + h * 0.46, w * 0.16, h * 0.08, '#e8e0d0');
      break;
    case 'hall':
      sawtooth(p, b);
      break;
    case 'tanks':
      tanks(p, b);
      break;
    case 'raidshack':
      scrapRoof(p, b);
      break;
    case 'shack':
      lean(p, b, ['#8a8070', '#7a6a58', '#6a6a66'][b.v % 3]);
      break;
    case 'tower':
      watchtower(p, b);
      break;
    case 'chimney':
    case 'stack':
      stack(p, b, b.style === 'chimney' ? '#6a5a50' : '#5a5a5e');
      break;
    case 'silo':
      silo(p, b);
      break;
    case 'obelisk':
      obelisk(p, b);
      break;
    case 'gutted':
      gutted(p, map, b);
      return;
    case 'ruin':
      ruin(p, map, b);
      return;
    default:
      if (b.style.startsWith('temple_')) {
        temple(p, map, b);
        return;
      }
  }
  // Rubble where it's been smashed through.
  if (!shell) rubble(p, b, standing);
}

/* ------------------------------------------------------------------ facades */

const WALLS: Record<string, [string, string]> = {
  house_v: ['#d8c8a8', '#6a4a30'], house_f: ['#6a5040', '#e0d0a0'], house_p: ['#8a7a6a', '#3a3a3a'], house_d: ['#b88a5a', '#3a2a1a'],
  shop: ['#9a948a', '#40c4ff'], barn: ['#7a2a20', '#e8e0d0'], hall: ['#6a6a6e', '#8ab0c8'], tanks: ['#9a9a98', '#5a5a5a'],
  raidshack: ['#6a4a2a', '#2a2a2a'], shack: ['#7a6a58', '#2a2a2a'], tower: ['#5a3a20', '#2a2a2a'], chimney: ['#6a5a50', '#2a2a2a'],
  stack: ['#5a5a5e', '#2a2a2a'], silo: ['#a8acb0', '#6a6a6a'], obelisk: ['#a89878', '#6a5a48'],
};

function facade(p: P, b: Building, fl: number, standing: (tx: number, ty: number) => boolean): void {
  const [wall, trim] = WALLS[b.style] ?? ['#8a8680', '#3a3a3a'];
  for (let tx = b.x0; tx < b.x1; tx++) {
    if (!standing(tx, b.y1 - 1)) continue;
    for (let k = 0; k < fl; k++) {
      // Lit from above: brightest just under the eaves.
      const col = shade(wall, -0.18 - (k / Math.max(1, fl)) * 0.22);
      R(p, tx, b.y1 + k, 1, 1, col);
    }
    // Windows (a lit one here and there) and the odd door at ground level.
    if (p.f >= 2 && fl >= 1) {
      const win = (tx - b.x0) % 3 === 1;
      if (win) for (let k = 0; k + 0.6 < fl; k += 1.4) {
        const lit = H(tx, b.y1 + k, 17) > 0.8;
        R(p, tx + 0.2, b.y1 + k + 0.25, 0.6, 0.45, lit ? '#ffd890' : shade(trim, -0.2));
      }
      if ((tx - b.x0) === Math.floor((b.x1 - b.x0) / 2)) R(p, tx + 0.15, b.y1 + fl - 0.8, 0.7, 0.8, '#2a1e16');
    }
  }
  // Eave shadow line.
  R(p, b.x0, b.y1, b.x1 - b.x0, 0.2, 'rgba(0,0,0,0.35)');
}

/* ------------------------------------------------------------------ roofs */

/** A gabled roof: the ridge along the long side, the sunward (north or west) slope lit. */
function gable(p: P, b: Building, base: string, kind: 'tile' | 'slate' | 'tin'): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const along = w >= h;
  const lit = shade(base, 0.14), dark = shade(base, -0.22);
  R(p, b.x0 - 0.15, b.y0 - 0.15, w + 0.3, h + 0.3, shade(base, -0.55));
  if (along) {
    R(p, b.x0, b.y0, w, h / 2, lit);
    R(p, b.x0, b.y0 + h / 2, w, h / 2, dark);
  } else {
    R(p, b.x0, b.y0, w / 2, h, lit);
    R(p, b.x0 + w / 2, b.y0, w / 2, h, dark);
  }
  // Courses of tile, slate or corrugation.
  if (p.f >= 2) {
    const step = kind === 'tin' ? 0.5 : 0.7;
    if (kind === 'tin') {
      // Corrugations run down the slope.
      for (let q = step; q < (along ? w : h); q += step) {
        if (along) R(p, b.x0 + q, b.y0, 0.14, h, 'rgba(0,0,0,0.18)');
        else R(p, b.x0, b.y0 + q, w, 0.14, 'rgba(0,0,0,0.18)');
      }
    } else {
      for (let q = step; q < (along ? h / 2 : w / 2); q += step) {
        for (const s of [-1, 1]) {
          if (along) R(p, b.x0, b.y0 + h / 2 + s * q - 0.07, w, 0.14, 'rgba(0,0,0,0.2)');
          else R(p, b.x0 + w / 2 + s * q - 0.07, b.y0, 0.14, h, 'rgba(0,0,0,0.2)');
        }
      }
      if (p.f >= 4) for (let q = 0; q < (along ? w : h); q += 0.8) {
        for (let r = 0; r < (along ? h : w); r += step) {
          const off = Math.floor(r / step) % 2 ? 0.4 : 0;
          if (along) R(p, b.x0 + q + off, b.y0 + r, 0.08, step * 0.8, 'rgba(0,0,0,0.12)');
          else R(p, b.x0 + r, b.y0 + q + off, step * 0.8, 0.08, 'rgba(0,0,0,0.12)');
        }
      }
    }
    // Weathering.
    for (let k = 0; k < (w * h) / 20; k++) {
      const a = b.x0 + H(b.x0 + k, b.y0, 3) * w, c = b.y0 + H(b.y0, b.x0 + k, 4) * h;
      R(p, a, c, 0.6 + H(k, 1, 5), 0.5, kind === 'tin' ? 'rgba(120,60,30,0.35)' : 'rgba(0,0,0,0.12)');
    }
  }
  // Ridge cap.
  if (along) R(p, b.x0, b.y0 + h / 2 - 0.2, w, 0.4, shade(base, 0.3));
  else R(p, b.x0 + w / 2 - 0.2, b.y0, 0.4, h, shade(base, 0.3));
}

function chimney(p: P, b: Building): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const a = b.x0 + 1 + H(b.v, 1, 7) * Math.max(1, w - 3), c = b.y0 + 1 + H(b.v, 2, 7) * Math.max(1, h / 2 - 2);
  R(p, a, c, 1.2, 1.2, '#6a5040');
  R(p, a + 0.25, c + 0.25, 0.7, 0.7, '#1a1410');
  R(p, a, c, 1.2, 0.25, '#8a6a50');
}

function snowOn(p: P, b: Building): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const along = w >= h;
  for (let k = 0; k < (w * h) / 5; k++) {
    const u = H(b.x0 + k, b.y0, 9), v = H(b.y0 + k, b.x0, 10);
    const a = b.x0 + u * w, c = along ? b.y0 + v * h * 0.5 : b.y0 + v * h;
    if (!along && a > b.x0 + w / 2) continue;
    R(p, a, c, 1 + u, 0.6 + v * 0.6, 'rgba(236,244,250,0.85)');
  }
}

/** A flat roof behind a parapet, with its kit. */
function flat(p: P, b: Building, base: string, kind: 'adobe' | 'concrete'): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  R(p, b.x0 - 0.1, b.y0 - 0.1, w + 0.2, h + 0.2, shade(base, -0.5));
  R(p, b.x0, b.y0, w, h, shade(base, 0.08));
  R(p, b.x0 + 0.5, b.y0 + 0.5, w - 1, h - 1, base);
  // Parapet: the sunward edges lit, the far ones in shadow, and the parapet's shadow on the roof.
  R(p, b.x0, b.y0, w, 0.5, shade(base, 0.25));
  R(p, b.x0, b.y0, 0.5, h, shade(base, 0.18));
  R(p, b.x0 + 0.5, b.y0 + 0.5, w - 1, 0.35, shade(base, -0.2));
  if (p.f >= 2) {
    // Gravel or render grain.
    for (let k = 0; k < w * h * 0.6; k++) {
      const a = b.x0 + 0.5 + H(b.x0 + k, b.y0 + 7, 11) * (w - 1), c = b.y0 + 0.5 + H(b.y0 + k, b.x0 + 3, 12) * (h - 1);
      R(p, a, c, 0.25, 0.25, H(k, b.v, 13) > 0.5 ? shade(base, 0.1) : shade(base, -0.12));
    }
  }
  // The kit on top, spread over the roof by the building's own hash.
  const n = Math.max(1, Math.floor((w * h) / 45));
  for (let k = 0; k < n; k++) {
    const a = b.x0 + 1.5 + H(b.v, k, 21) * Math.max(0.5, w - 4.5), c = b.y0 + 1.5 + H(k, b.v, 22) * Math.max(0.5, h - 4);
    const what = Math.floor(H(b.v + k, 3, 23) * 4);
    if (kind === 'adobe') {
      if (what === 0) {
        disc(p, a + 0.6, c + 0.6, 0.6, '#2a3a5a');
        disc(p, a + 0.6, c + 0.6, 0.35, '#3a5a8a');
      } else if (what === 1) {
        R(p, a, c, 2.4, 1.6, ['#a83a2a', '#2a6a8a', '#c89a2a'][b.v % 3]);
        R(p, a, c + 0.4, 2.4, 0.2, '#e8d8b0');
      } else if (what === 2) {
        R(p, a, c, 2, 1.2, '#1a2a4a');
        R(p, a + 0.1, c + 0.1, 1.8, 0.2, '#4a6a9a');
      } else {
        R(p, a, c, 1.4, 1.4, shade(base, -0.35));
        R(p, a + 0.3, c + 0.3, 0.8, 0.8, '#1a1410');
      }
      continue;
    }
    if (what === 0) {
      // Air-conditioning unit with its fan.
      R(p, a, c, 2, 1.4, '#b8bcc0');
      R(p, a, c + 1.2, 2, 0.2, '#6a6e72');
      disc(p, a + 0.7, c + 0.7, 0.5, '#3a3e42');
      if (p.f >= 4) disc(p, a + 0.7, c + 0.7, 0.15, '#9a9ea2');
    } else if (what === 1) {
      // Water tank on legs, and its shadow.
      disc(p, a + 1.4, c + 1.4, 1.2, 'rgba(0,0,0,0.3)');
      disc(p, a + 1, c + 1, 1.2, '#7a6a5a');
      disc(p, a + 0.8, c + 0.8, 0.5, '#9a8a78');
    } else if (what === 2) {
      // Skylight.
      R(p, a, c, 2.4, 1.2, '#3a4a58');
      R(p, a + 0.1, c + 0.1, 2.2, 1, '#7ab0d0');
      R(p, a + 0.1, c + 0.1, 2.2, 0.25, '#b8e0f0');
    } else {
      // Roof hatch and a vent stack.
      R(p, a, c, 1.2, 1.2, '#5a5e62');
      R(p, a + 0.1, c + 0.1, 1, 0.2, '#8a8e92');
      disc(p, a + 2, c + 0.6, 0.35, '#2a2a2a');
    }
  }
  if (kind === 'concrete' && p.f >= 2) {
    // An aerial.
    const a = b.x0 + w - 1.5, c = b.y0 + 1;
    R(p, a, c, 0.15, 2.5, '#2a2a2a');
    R(p, a - 0.5, c + 0.5, 1.2, 0.12, '#2a2a2a');
  }
}

/** A single-slope tin roof. */
function lean(p: P, b: Building, base: string): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  R(p, b.x0 - 0.1, b.y0 - 0.1, w + 0.2, h + 0.2, shade(base, -0.5));
  for (let r = 0; r < h; r += 0.5) R(p, b.x0, b.y0 + r, w, 0.5, shade(base, 0.15 - (r / h) * 0.35));
  if (p.f >= 2) for (let q = 0.4; q < w; q += 0.45) R(p, b.x0 + q, b.y0, 0.12, h, 'rgba(0,0,0,0.2)');
  for (let k = 0; k < 3; k++) R(p, b.x0 + H(b.v, k, 31) * (w - 1.5), b.y0 + H(k, b.v, 32) * (h - 1), 1.5, 1, 'rgba(130,60,20,0.45)');
}

/** A raider shack: scrap sheets and tarps patched together, spikes round the eaves, tyres holding it down. */
function scrapRoof(p: P, b: Building): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  R(p, b.x0 - 0.15, b.y0 - 0.15, w + 0.3, h + 0.3, '#1a1410');
  const sheets = ['#7a4a2a', '#5a5a5a', '#8a6a3a', '#6a3a24', '#4a4a44'];
  for (let a = b.x0; a < b.x1; a += 2.5) {
    for (let c = b.y0; c < b.y1; c += 2) {
      const k = H(a, c, 41);
      const col = k > 0.88 ? (k > 0.94 ? '#2a5a8a' : '#4a6a2a') : sheets[Math.floor(k * sheets.length)];
      const ww = Math.min(2.5, b.x1 - a), hh = Math.min(2, b.y1 - c);
      R(p, a, c, ww, hh, col);
      R(p, a, c, ww, 0.2, shade(col, 0.25));
      if (p.f >= 2 && k < 0.88) for (let q = 0.4; q < ww; q += 0.45) R(p, a + q, c, 0.1, hh, 'rgba(0,0,0,0.2)');
    }
  }
  // Tyres weighing the roof down.
  for (let k = 0; k < 2; k++) {
    const a = b.x0 + 1 + H(b.v, k, 43) * (w - 2), c = b.y0 + 1 + H(k, b.v, 44) * (h - 2);
    disc(p, a, c, 0.55, '#111');
    disc(p, a, c, 0.25, shade(sheets[0], -0.2));
  }
  // Spikes along the eaves.
  if (p.f >= 2) {
    for (let a = b.x0; a < b.x1; a += 1.2) {
      R(p, a, b.y0 - 0.5, 0.2, 0.5, '#b0b0a8');
      R(p, a + 0.6, b.y1, 0.2, 0.4, '#b0b0a8');
    }
  }
}

/** A factory hall's sawtooth north-light roof: glazed strips facing north, slopes between. */
function sawtooth(p: P, b: Building): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  R(p, b.x0 - 0.15, b.y0 - 0.15, w + 0.3, h + 0.3, '#2a2a2e');
  const step = 3;
  for (let c = b.y0; c < b.y1; c += step) {
    const hh = Math.min(step, b.y1 - c);
    R(p, b.x0, c, w, hh, '#6e6e72');
    for (let r = 0; r < hh; r += 0.5) R(p, b.x0, c + r, w, 0.5, shade('#6e6e72', 0.12 - (r / step) * 0.3));
    R(p, b.x0, c, w, Math.min(0.8, hh), '#5a7a92');
    if (p.f >= 2) {
      R(p, b.x0, c, w, 0.18, '#a8c8dc');
      for (let q = 1; q < w; q += 1.5) R(p, b.x0 + q, c, 0.1, Math.min(0.8, hh), '#3a4a58');
    }
  }
  // Rust streaks and roof vents.
  for (let k = 0; k < w / 4; k++) R(p, b.x0 + H(b.v, k, 51) * w, b.y0 + H(k, b.v, 52) * (h - 2), 0.4, 2, 'rgba(130,64,24,0.35)');
  for (let k = 0; k < 3; k++) disc(p, b.x0 + (w * (k + 1)) / 4, b.y0 + h / 2 + 0.3, 0.6, '#3a3a3e');
}

/** Storage tanks on a concrete pad, with a catwalk between them. */
function tanks(p: P, b: Building): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  R(p, b.x0, b.y0, w, h, '#6a6c70');
  if (p.f >= 2) for (let a = b.x0; a < b.x1; a += 4) R(p, a, b.y0, 0.1, h, '#5a5c60');
  const two = b.v % 3 !== 0;
  const spots: [number, number, number][] = two
    ? [[b.x0 + w * 0.3, b.y0 + h * 0.32, Math.min(w, h) * 0.27], [b.x0 + w * 0.7, b.y0 + h * 0.66, Math.min(w, h) * 0.27]]
    : [[b.x0 + w / 2, b.y0 + h / 2, Math.min(w, h) * 0.44]];
  const col = ['#c8c8c0', '#9aaab0', '#b8a888'][b.v % 3];
  if (two) {
    R(p, spots[0][0], spots[0][1] - 0.4, spots[1][0] - spots[0][0], 0.8, '#3a3a3a');
    R(p, spots[1][0] - 0.4, spots[0][1], 0.8, spots[1][1] - spots[0][1], '#3a3a3a');
  }
  for (const [cx, cy, r] of spots) {
    disc(p, cx + r * 0.25, cy + r * 0.25, r, 'rgba(0,0,0,0.35)');
    disc(p, cx, cy, r, shade(col, -0.35));
    disc(p, cx, cy, r * 0.94, col);
    // The lit crescent to the north-west and the shaded one opposite.
    disc(p, cx + r * 0.12, cy + r * 0.12, r * 0.84, shade(col, -0.12));
    disc(p, cx - r * 0.05, cy - r * 0.05, r * 0.72, shade(col, 0.05));
    if (p.f >= 2) {
      p.x.strokeStyle = shade(col, -0.25);
      p.x.lineWidth = Math.max(1, p.f * 0.12);
      for (const k of [0.45, 0.7]) {
        p.x.beginPath();
        p.x.arc((cx - p.x0) * p.f, (cy - p.y0) * p.f, r * k * p.f, 0, Math.PI * 2);
        p.x.stroke();
      }
    }
    disc(p, cx, cy, Math.max(0.5, r * 0.12), '#4a4a4a');
    // Rust weeping from the rim.
    for (let k = 0; k < 4; k++) {
      const an = H(cx, k, 61) * Math.PI * 2;
      R(p, cx + Math.cos(an) * r * 0.8, cy + Math.sin(an) * r * 0.8, 0.5, 1, 'rgba(130,70,30,0.4)');
    }
  }
}

function watchtower(p: P, b: Building): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  R(p, b.x0 - 0.3, b.y0 - 0.3, w + 0.6, h + 0.6, '#2a1a10');
  for (let r = 0; r < h + 0.4; r += 0.4) R(p, b.x0 - 0.2, b.y0 - 0.2 + r, w + 0.4, 0.34, r % 0.8 < 0.4 ? '#7a5a34' : '#6a4a2a');
  for (const [a, c] of [[b.x0 - 0.4, b.y0 - 0.4], [b.x1, b.y0 - 0.4], [b.x0 - 0.4, b.y1], [b.x1, b.y1]]) R(p, a, c, 0.4, 0.4, '#c0c0b8');
}

function stack(p: P, b: Building, col: string): void {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = (b.x1 - b.x0) * 0.55;
  disc(p, cx, cy, r * 1.6, 'rgba(20,16,14,0.35)');
  disc(p, cx, cy, r, shade(col, -0.4));
  disc(p, cx - r * 0.1, cy - r * 0.1, r * 0.85, col);
  disc(p, cx, cy, r * 0.55, '#0e0c0a');
}

function silo(p: P, b: Building): void {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = (b.x1 - b.x0) * 0.7;
  disc(p, cx + r * 0.3, cy + r * 0.3, r, 'rgba(0,0,0,0.3)');
  disc(p, cx, cy, r, '#7a7e82');
  disc(p, cx - r * 0.15, cy - r * 0.15, r * 0.7, '#b0b4b8');
  disc(p, cx - r * 0.3, cy - r * 0.3, r * 0.3, '#d8dce0');
  disc(p, cx, cy, r * 0.15, '#5a5e62');
}

function obelisk(p: P, b: Building): void {
  const w = b.x1 - b.x0;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = w * 0.5;
  const x = p.x;
  const X = (a: number): number => (a - p.x0) * p.f, Y = (a: number): number => (a - p.y0) * p.f;
  const tri = (pts: [number, number][], c: string): void => {
    x.fillStyle = c;
    x.beginPath();
    pts.forEach(([a, bb], i) => (i ? x.lineTo(X(a), Y(bb)) : x.moveTo(X(a), Y(bb))));
    x.closePath();
    x.fill();
  };
  tri([[cx - r, cy - r], [cx + r, cy - r], [cx, cy]], '#c8b890');
  tri([[cx - r, cy - r], [cx - r, cy + r], [cx, cy]], '#b8a880');
  tri([[cx + r, cy - r], [cx + r, cy + r], [cx, cy]], '#8a7a5a');
  tri([[cx - r, cy + r], [cx + r, cy + r], [cx, cy]], '#7a6a4a');
}

/* ------------------------------------------------------------------ open ruins */

const TEMPLE: Record<string, [string, string, string]> = {
  temple_s: ['#c8a878', '#b89868', '#d8bc8a'],
  temple_b: ['#3a3440', '#4a4450', '#5a5460'],
  temple_i: ['#a8c8d8', '#c8e0e8', '#e0f0f8'],
  temple_g: ['#8a8a84', '#9a9a92', '#b0b0a8'],
};

function temple(p: P, map: GameMap, b: Building): void {
  const [c0, c1, c2] = TEMPLE[b.style] ?? TEMPLE.temple_g;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  // The floor: big flagstones in a checker, cracked, sand and weeds in the joints.
  for (let a = b.x0; a < b.x1; a += 2) {
    for (let c = b.y0; c < b.y1; c += 2) {
      const k = H(a, c, 71);
      R(p, a, c, 2, 2, ((a - b.x0 + c - b.y0) / 2) % 2 ? c0 : c1);
      if (p.f >= 2) {
        R(p, a, c, 2, 0.12, 'rgba(0,0,0,0.25)');
        R(p, a, c, 0.12, 2, 'rgba(0,0,0,0.25)');
        if (k > 0.8) R(p, a + 0.3, c + 0.2 + k, 1.4, 0.1, 'rgba(0,0,0,0.4)');
      }
    }
  }
  // A mosaic ring in the middle, the altar, and columns standing (or fallen) in two rows.
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  disc(p, cx, cy, Math.min(w, h) * 0.22, shade(c2, -0.1));
  disc(p, cx, cy, Math.min(w, h) * 0.17, c0);
  R(p, cx - 1.5, cy - 1, 3, 2, shade(c2, 0.1));
  R(p, cx - 1.5, cy + 0.8, 3, 0.3, shade(c2, -0.4));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const a = b.x0 + 3 + (k * (w - 6)) / 3, c = cy + s * h * 0.3;
      if (H(a, c, 73) > 0.3) {
        disc(p, a + 0.5, c + 0.5, 1, 'rgba(0,0,0,0.3)');
        disc(p, a, c, 1, shade(c2, -0.15));
        disc(p, a - 0.2, c - 0.2, 0.7, c2);
      } else {
        // Fallen: a drum rolled out across the floor.
        R(p, a - 0.8, c - 0.8, 3.2, 1.6, shade(c2, -0.1));
        R(p, a - 0.8, c - 0.8, 3.2, 0.4, c2);
      }
    }
  }
  // Its walls, broken and weathered, wherever they still stand.
  for (let ty = b.y0; ty < b.y1; ty++) {
    for (let tx = b.x0; tx < b.x1; tx++) {
      if (map.getObs(tx, ty) === OBS.NONE) continue;
      const k = H(tx, ty, 75);
      R(p, tx, ty, 1, 1, k > 0.5 ? c2 : shade(c2, -0.12));
      if (p.f >= 2) R(p, tx, ty, 1, 0.2, shade(c2, 0.2));
    }
  }
  // Sand blown in.
  for (let k = 0; k < (w * h) / 30; k++) R(p, b.x0 + H(b.v, k, 77) * w, b.y0 + H(k, b.v, 78) * h, 2.5, 1.2, 'rgba(200,170,120,0.35)');
}

function gutted(p: P, map: GameMap, b: Building): void {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  // A bare slab, stained, with the floors above fallen through into it.
  R(p, b.x0, b.y0, w, h, '#5a5a5c');
  if (p.f >= 2) for (let a = b.x0; a < b.x1; a += 8) for (let c = b.y0; c < b.y1; c += 8) {
    R(p, a, c, 8, 0.15, '#4a4a4c');
    R(p, a, c, 0.15, 8, '#4a4a4c');
  }
  for (let k = 0; k < (w * h) / 60; k++) {
    const a = b.x0 + 2 + H(b.v, k, 81) * (w - 8), c = b.y0 + 2 + H(k, b.v, 82) * (h - 6);
    const s = 2 + H(k, 3, 83) * 4;
    R(p, a, c, s, s * 0.7, H(k, 4, 84) > 0.5 ? '#6e6e70' : '#48484a');
    R(p, a, c, s, 0.25, '#8a8a8c');
    if (p.f >= 4) for (let q = 0; q < 3; q++) R(p, a + H(k, q, 85) * s, c + H(q, k, 86) * s * 0.6, 1.2, 0.08, '#6a3a24');
  }
  // Puddles.
  for (let k = 0; k < 2; k++) {
    const a = b.x0 + 4 + H(b.v, k, 87) * (w - 10), c = b.y0 + 4 + H(k, b.v, 88) * (h - 8);
    R(p, a, c, 3, 1.6, '#3a4a58');
    R(p, a + 0.2, c + 0.2, 2.6, 0.3, '#6a8aa0');
  }
  // What still stands: the column grid and the broken outer walls.
  for (let ty = b.y0; ty < b.y1; ty++) {
    for (let tx = b.x0; tx < b.x1; tx++) {
      if (map.getObs(tx, ty) === OBS.NONE) continue;
      R(p, tx, ty, 1, 1, H(tx, ty, 89) > 0.5 ? '#8a8a8c' : '#7a7a7c');
      if (p.f >= 2) R(p, tx, ty, 1, 0.25, '#a8a8aa');
    }
  }
}

/** A building a highway was bulldozed through: its stained floor, broken walls and heaps of rubble; the road left clear. */
function ruin(p: P, map: GameMap, b: Building): void {
  for (let ty = b.y0; ty < b.y1; ty++) {
    for (let tx = b.x0; tx < b.x1; tx++) {
      if (map.getTer(tx, ty) === TER.ROAD) continue;
      const k = H(tx, ty, 95);
      if (map.getObs(tx, ty) !== OBS.NONE) {
        R(p, tx, ty, 1, 1, k > 0.5 ? '#9a968e' : '#8a867e');
        if (p.f >= 2) R(p, tx, ty, 1, 0.25, '#b0aca4');
        continue;
      }
      // Floor tiles, stained and cracked, with rubble heaped against what's left of the walls.
      R(p, tx, ty, 1, 1, k > 0.8 ? '#4a4844' : k > 0.4 ? '#5a5854' : '#62605a');
      if (p.f >= 2 && ((tx - b.x0) % 2 === 0 || (ty - b.y0) % 2 === 0)) R(p, tx, ty, 1, 0.08, 'rgba(0,0,0,0.25)');
      if (k < 0.18) {
        for (let q = 0; q < 3; q++) R(p, tx + H(tx, q, 96) * 0.6, ty + H(q, ty, 97) * 0.6, 0.35 + H(q, tx, 98) * 0.3, 0.3, q === 1 ? '#7a766e' : '#3a3834');
      }
    }
  }
}

/* ------------------------------------------------------------------ damage */

/** Rubble on every tile of a roofed building that's been smashed through. */
function rubble(p: P, b: Building, standing: (tx: number, ty: number) => boolean): void {
  const base = (WALLS[b.style] ?? ['#8a8680'])[0];
  for (let ty = b.y0; ty < b.y1; ty++) {
    for (let tx = b.x0; tx < b.x1; tx++) {
      if (standing(tx, ty)) continue;
      R(p, tx, ty, 1, 1, '#4a4642');
      if (p.f < 2) continue;
      for (let k = 0; k < 3; k++) {
        const u = H(tx * 3 + k, ty, 91), v = H(ty * 3 + k, tx, 92);
        R(p, tx + u * 0.7, ty + v * 0.7, 0.3 + u * 0.3, 0.25 + v * 0.25, k === 0 ? mix(base, '#3a3632', 0.4) : k === 1 ? '#6a6660' : '#2a2622');
      }
      if (H(tx, ty, 93) > 0.85) R(p, tx, ty + 0.4, 1, 0.1, '#6a3a24');
    }
  }
}
