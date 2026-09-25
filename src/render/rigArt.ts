import { TILE } from '../shared/constants';
import type { Game } from '../game/game';
import type { ModuleInst, Rig } from '../game/rig';
import { ROLES } from '../game/crew';
import { BG, DRIVES, RIG_CLEARANCE, RT, WHEEL_R } from '../game/rigDefs';
import type { PointLight } from './lighting';

interface Cache {
  canvas: HTMLCanvasElement;
  version: number;
}

const PAL = {
  player: { panel: '#192026', seam: '#222b32', hull: '#6e5d50', hullHi: '#8f7a68', hullLo: '#4a3e36', rivet: '#b39d88', trim: '#ffb74d', suit: '#4f7d8a' },
  hostile: { panel: '#20171a', seam: '#2c1f22', hull: '#5a4a46', hullHi: '#766560', hullLo: '#3a2e2c', rivet: '#9a8078', trim: '#ff5252', suit: '#7a3a3a' },
};

type Pal = (typeof PAL)['player'];

function R(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

function stripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = '#e0b020', b = '#1c1c1c'): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  R(ctx, x, y, w, h, b);
  ctx.fillStyle = a;
  for (let i = -h; i < w + h; i += 8) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + 4, y + h);
    ctx.lineTo(x + i + 4 + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------------- */
/* Static module art                                                       */
/* ---------------------------------------------------------------------- */

function moduleStatic(ctx: CanvasRenderingContext2D, m: ModuleInst, pal: Pal, rig: Rig): void {
  const d = m.def;
  const x = m.x * TILE, y = m.y * TILE, w = d.w * TILE, h = d.h * TILE;
  const turret = !!d.turret || d.key === 'radar';
  if (!turret) {
    R(ctx, x, y, w, h, '#11151a');
    R(ctx, x, y, w, 1, '#2e363d');
    R(ctx, x, y, 1, h, '#2a3238');
    R(ctx, x + w - 1, y, 1, h, '#0b0e11');
    ctx.globalAlpha = 0.85;
    R(ctx, x + 2, y + 1, w - 4, 2, d.accent);
    ctx.globalAlpha = 1;
    R(ctx, x, y + h - 2, w, 2, '#2a2f35');
  }
  const cx = x + w / 2;
  switch (d.key) {
    case 'cockpit': {
      const front = m.x + d.w / 2 > rig.cols / 2 ? 1 : -1;
      const wx = front > 0 ? x + w - 30 : x + 4;
      const g = ctx.createLinearGradient(0, y + 6, 0, y + 26);
      g.addColorStop(0, '#355a78');
      g.addColorStop(1, '#16283a');
      ctx.fillStyle = g;
      ctx.fillRect(wx, y + 6, 26, 20);
      R(ctx, wx, y + 6, 26, 2, '#4a5560');
      R(ctx, wx + 12, y + 6, 2, 20, '#4a5560');
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(wx + 3, y + 9, 2, 12);
      R(ctx, x + 4, y + h - 16, w - 8, 14, '#2b3238');
      for (let i = 0; i < 4; i++) R(ctx, x + 7 + i * 13, y + h - 13, 9, 5, i % 2 ? '#00bcd4' : '#26a69a');
      R(ctx, cx - 5, y + h - 26, 10, 12, '#3e2723');
      R(ctx, cx - 6, y + h - 16, 12, 3, '#4e342e');
      break;
    }
    case 'reactor':
    case 'fission': {
      const cw = d.key === 'fission' ? 30 : 26;
      R(ctx, cx - cw / 2, y + 5, cw, h - 10, '#39424a');
      R(ctx, cx - cw / 2, y + 5, cw, 3, '#56616b');
      R(ctx, cx - 5, y + 9, 10, h - 18, '#0b1a0b');
      R(ctx, x + 2, y + h / 2 - 3, cx - cw / 2 - x - 2, 5, '#4a545c');
      R(ctx, cx + cw / 2, y + h / 2 - 3, x + w - cx - cw / 2 - 2, 5, '#4a545c');
      stripes(ctx, x + 2, y + h - 7, w - 4, 4);
      if (d.key === 'fission') for (let i = 0; i < 3; i++) R(ctx, cx - cw / 2 + 2, y + 14 + i * 14, 3, 8, '#b2ff59');
      break;
    }
    case 'engine':
    case 'ion_engine': {
      const blue = d.key === 'ion_engine';
      R(ctx, x + 4, y + 14, w - 8, h - 18, blue ? '#263845' : '#4a4f55');
      R(ctx, x + 4, y + 14, w - 8, 2, blue ? '#40c4ff' : '#6b7178');
      for (let i = 0; i < 4; i++) R(ctx, x + 8 + i * 12, y + 18, 8, 14, blue ? '#0d2533' : '#2c3035');
      R(ctx, x + w - 12, y + 2, 6, 14, '#3a3f45');
      ctx.fillStyle = blue ? '#40c4ff' : '#5d4037';
      ctx.beginPath();
      ctx.arc(x + 14, y + h - 10, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'barracks':
      for (let i = 0; i < 3; i++) {
        const bx = x + 6 + i * 28;
        if (bx + 22 > x + w - 12) break;
        for (let k = 0; k < 2; k++) {
          const by = y + 12 + k * 16;
          R(ctx, bx, by, 22, 4, '#3e5063');
          R(ctx, bx, by + 4, 22, 2, '#5d6d7e');
          R(ctx, bx + 1, by - 2, 5, 3, '#b0bec5');
        }
        R(ctx, bx, y + 8, 2, h - 10, '#5d6d7e');
        R(ctx, bx + 20, y + 8, 2, h - 10, '#5d6d7e');
      }
      R(ctx, x + w - 10, y + 6, 8, h - 8, '#37474f');
      R(ctx, x + w - 8, y + 10, 4, 1, '#263238');
      R(ctx, x + w - 8, y + 13, 4, 1, '#263238');
      break;
    case 'quarters': {
      R(ctx, x + 4, y + h - 14, 30, 8, '#8d6e63');
      R(ctx, x + 4, y + h - 16, 30, 3, '#ffcc80');
      R(ctx, x + 4, y + h - 20, 7, 5, '#eceff1');
      R(ctx, x + 40, y + h - 16, 18, 3, '#6d4c41');
      R(ctx, x + 42, y + h - 13, 2, 11, '#5d4037');
      R(ctx, x + 55, y + h - 13, 2, 11, '#5d4037');
      R(ctx, x + 48, y + h - 22, 4, 6, '#ffd54f');
      const sx = x + 38, sy = y + 6;
      R(ctx, sx, sy, 34, 14, '#0d1b2a');
      for (let i = 0; i < 7; i++) R(ctx, sx + 2 + i * 5, sy + 14 - 4 - ((i * 7) % 9), 3, 4 + ((i * 7) % 9), i % 2 ? '#ff4081' : '#18ffff');
      R(ctx, x + w - 10, y + h - 12, 6, 10, '#6d4c41');
      R(ctx, x + w - 12, y + h - 20, 10, 8, '#43a047');
      break;
    }
    case 'medbay':
      R(ctx, x + 4, y + h - 14, 28, 6, '#eceff1');
      R(ctx, x + 6, y + h - 8, 2, 6, '#90a4ae');
      R(ctx, x + 28, y + h - 8, 2, 6, '#90a4ae');
      R(ctx, x + 34, y + 8, 10, 10, '#1b5e20');
      R(ctx, x + 38, y + 9, 2, 8, '#76ff03');
      R(ctx, x + 35, y + 12, 8, 2, '#76ff03');
      R(ctx, x + 6, y + 8, 22, 12, '#0d1b0d');
      break;
    case 'hydroponics':
      for (let k = 0; k < 2; k++) {
        const sy = y + 16 + k * 16;
        R(ctx, x + 4, sy, w - 16, 3, '#5d4037');
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? '#64dd17' : '#33691e';
          ctx.beginPath();
          ctx.arc(x + 9 + i * 8, sy - 3, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      R(ctx, x + w - 10, y + 10, 7, h - 14, '#1e88e5');
      break;
    case 'cargo': {
      const crates: [number, number, number, number, string][] = [
        [4, h - 18, 18, 16, '#6d5a3a'], [24, h - 18, 16, 16, '#4e5b3a'], [42, h - 14, 18, 12, '#5d4037'],
        [8, h - 32, 14, 14, '#795548'], [26, h - 30, 14, 12, '#6d5a3a'],
      ];
      for (const [ox, oy, cw, ch, c] of crates) {
        if (ox + cw > w - 2) continue;
        R(ctx, x + ox, y + oy, cw, ch, c);
        R(ctx, x + ox, y + oy, cw, 2, 'rgba(255,255,255,0.12)');
        R(ctx, x + ox + 2, y + oy + ch / 2, cw - 4, 1, 'rgba(0,0,0,0.4)');
      }
      break;
    }
    case 'fabricator':
      R(ctx, x + 4, y + h - 16, w - 8, 5, '#546e7a');
      R(ctx, x + 6, y + h - 11, 3, 9, '#37474f');
      R(ctx, x + w - 9, y + h - 11, 3, 9, '#37474f');
      R(ctx, x + 6, y + 6, 14, 10, '#062a30');
      R(ctx, x + 8, y + 8, 10, 2, '#00e5ff');
      R(ctx, x + 8, y + 12, 6, 1, '#00e5ff');
      break;
    case 'refinery':
      R(ctx, x + 10, y + 6, w - 20, 10, '#4e4e4e');
      R(ctx, x + 14, y + 16, w - 28, 6, '#3a3a3a');
      ctx.fillStyle = '#2b2b2b';
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 28);
      ctx.lineTo(x + w - 8, y + 28);
      ctx.lineTo(x + w - 16, y + h - 8);
      ctx.lineTo(x + 16, y + h - 8);
      ctx.fill();
      R(ctx, x + 2, y + 20, 6, h - 22, '#5d4037');
      stripes(ctx, x + 4, y + h - 6, w - 8, 4);
      break;
    case 'armory':
      for (let i = 0; i < 3; i++) {
        const gy = y + 10 + i * 9;
        R(ctx, x + 6, gy, 30, 3, '#78909c');
        R(ctx, x + 10, gy + 3, 4, 4, '#455a64');
      }
      R(ctx, x + 42, y + h - 14, 16, 12, '#4e5b3a');
      R(ctx, x + 44, y + h - 12, 12, 2, '#ffd54f');
      R(ctx, x + 4, y + 6, 36, 1, '#ff1744');
      break;
    case 'garage':
      stripes(ctx, x + 2, y + h - 6, w - 4, 4);
      ctx.strokeStyle = '#212121';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x + 20, y + 26, 12, 0, Math.PI * 2);
      ctx.stroke();
      R(ctx, x + 19, y + 4, 2, 10, '#9e9e9e');
      for (let i = 0; i < 5; i++) R(ctx, x + 44 + i * 8, y + 10, 3, 14 - (i % 3) * 3, '#b0bec5');
      R(ctx, x + 40, y + h - 20, 40, 10, '#ffd600');
      R(ctx, x + 44, y + h - 18, 32, 6, '#212121');
      break;
    case 'repair_bay':
      R(ctx, x + 4, y + h - 10, w - 8, 4, '#5d4037');
      for (let i = 0; i < 3; i++) R(ctx, x + 6 + i * 12, y + h - 18, 8, 6, '#607d8b');
      break;
    case 'drill': {
      const left = m.x === 0;
      R(ctx, left ? x + 20 : x, y + 10, 28, h - 20, '#455a64');
      R(ctx, left ? x + 20 : x, y + 10, 28, 3, '#90a4ae');
      break;
    }
    case 'shield':
      R(ctx, cx - 6, y + 18, 12, h - 20, '#311b92');
      R(ctx, cx - 10, y + h - 8, 20, 6, '#4527a0');
      for (let i = 0; i < 3; i++) R(ctx, cx - 8, y + 22 + i * 7, 16, 2, '#b388ff');
      break;
    case 'rad_baffles':
      for (let i = 0; i < 5; i++) R(ctx, x + 4 + i * 9, y + 6, 6, h - 10, '#546e7a');
      ctx.fillStyle = '#c6ff00';
      ctx.beginPath();
      ctx.arc(cx, y + h / 2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, y + h / 2);
        ctx.arc(cx, y + h / 2, 6, (i * Math.PI * 2) / 3, (i * Math.PI * 2) / 3 + 0.9);
        ctx.fill();
      }
      break;
    case 'thermal':
      for (let i = 0; i < 6; i++) R(ctx, x + 4 + i * 7, y + 8, 4, h - 16, i % 2 ? '#ff6e40' : '#40c4ff');
      R(ctx, x + 4, y + h - 10, w - 8, 4, '#37474f');
      break;
    case 'sealant':
      for (let i = 0; i < 2; i++) {
        R(ctx, x + 6 + i * 18, y + 6, 14, h - 10, '#263238');
        R(ctx, x + 8 + i * 18, y + 12, 10, h - 18, '#00c853');
      }
      break;
    case 'radar':
      R(ctx, cx - 2, y + 14, 4, h - 14, '#607d8b');
      for (let yy = y + 18; yy < y + h - 4; yy += 8) {
        R(ctx, cx - 6, yy, 12, 1, '#78909c');
      }
      R(ctx, cx - 8, y + h - 5, 16, 5, '#455a64');
      break;
    case 'main_battery': {
      // Heavy tank turret: turret ring, sloped dome, hatch and periscope.
      const steel = pal === PAL.player ? '#5a5f66' : '#5a4a48';
      const dark = pal === PAL.player ? '#3a3e44' : '#3a2e2c';
      R(ctx, x + 4, y + h - 8, w - 8, 8, dark);
      stripes(ctx, x + 6, y + h - 5, w - 12, 3);
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + h - 8);
      ctx.lineTo(x + 16, y + 10);
      ctx.lineTo(x + w - 22, y + 8);
      ctx.lineTo(x + w - 6, y + h - 14);
      ctx.lineTo(x + w - 6, y + h - 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 10);
      ctx.lineTo(x + w - 22, y + 8);
      ctx.stroke();
      R(ctx, x + 24, y + 4, 12, 5, dark);
      R(ctx, x + 26, y + 2, 8, 3, steel);
      R(ctx, x + w - 34, y + 4, 4, 5, '#263238');
      R(ctx, x + w - 33, y + 5, 2, 2, '#00e5ff');
      for (let i = 0; i < 5; i++) R(ctx, x + 14 + i * 15, y + h - 11, 2, 2, pal.rivet);
      R(ctx, x + 10, y + h - 20, 26, 3, d.accent);
      break;
    }
    case 'rail_cannon':
      R(ctx, x + 4, y + h - 10, w - 8, 10, '#2b2b36');
      R(ctx, x + 8, y + h - 16, w - 16, 7, '#3d3d4d');
      stripes(ctx, x + 6, y + h - 4, w - 12, 3, '#ea80fc', '#1c1c24');
      break;
    case 'mortar':
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? '#8d7b5a' : '#7a6a4c';
        ctx.beginPath();
        ctx.ellipse(x + 6 + i * 9, y + h - 5, 6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      R(ctx, x + w / 2 - 7, y + h - 14, 14, 6, '#4a4f55');
      break;
    case 'tesla':
      R(ctx, x + w / 2 - 4, y + 12, 8, h - 14, '#37374a');
      for (let yy = y + 16; yy < y + h - 4; yy += 5) R(ctx, x + w / 2 - 8, yy, 16, 2, '#b87333');
      R(ctx, x + 4, y + h - 5, w - 8, 5, '#2b2b36');
      break;
    case 'point_defense':
      R(ctx, x + 6, y + h - 10, w - 12, 10, '#4a4f55');
      ctx.fillStyle = '#607d8b';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h - 10, 8, Math.PI, 0);
      ctx.fill();
      break;
    default:
      if (d.turret) {
        ctx.fillStyle = pal === PAL.player ? '#4a4f55' : '#4a3a3a';
        ctx.beginPath();
        ctx.moveTo(x + 2, y + h);
        ctx.lineTo(x + 6, y + h - 12);
        ctx.lineTo(x + w - 6, y + h - 12);
        ctx.lineTo(x + w - 2, y + h);
        ctx.fill();
        R(ctx, x + 4, y + h - 13, w - 8, 2, d.accent);
      }
  }
}

/* ---------------------------------------------------------------------- */
/* Static tiles                                                            */
/* ---------------------------------------------------------------------- */

function drawTile(ctx: CanvasRenderingContext2D, rig: Rig, tx: number, ty: number, pal: Pal, anchored: boolean): void {
  const t = rig.tileAt(tx, ty);
  const x = tx * TILE, y = ty * TILE;
  const same = (dx: number, dy: number): boolean => {
    const n = rig.tileAt(tx + dx, ty + dy);
    return n === RT.HULL || n === RT.ARMOR || n === RT.CHASSIS || n === RT.DOOR || n === RT.WINDOW || n === RT.GLACIS_L || n === RT.GLACIS_R;
  };
  switch (t) {
    case RT.GLACIS_L:
    case RT.GLACIS_R: {
      // Sloped armor: solid triangle under the diagonal.
      const left = t === RT.GLACIS_L;
      ctx.fillStyle = pal === PAL.player ? '#5e6168' : '#56494a';
      ctx.beginPath();
      if (left) {
        ctx.moveTo(x + TILE, y);
        ctx.lineTo(x + TILE, y + TILE);
        ctx.lineTo(x, y + TILE);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + TILE);
        ctx.lineTo(x + TILE, y + TILE);
      }
      ctx.fill();
      ctx.strokeStyle = pal === PAL.player ? '#9aa1ab' : '#8a7470';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (left) {
        ctx.moveTo(x, y + TILE);
        ctx.lineTo(x + TILE, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + TILE, y + TILE);
      }
      ctx.stroke();
      R(ctx, left ? x + 11 : x + 3, y + 11, 2, 2, pal.rivet);
      break;
    }
    case RT.HULL:
    case RT.ARMOR: {
      const armor = t === RT.ARMOR;
      R(ctx, x, y, TILE, TILE, armor ? '#4d5863' : pal.hull);
      if (armor) {
        ctx.globalAlpha = 0.25;
        for (let i = -16; i < 16; i += 6) {
          ctx.fillStyle = '#9fb3c8';
          ctx.beginPath();
          ctx.moveTo(x + i, y + 16);
          ctx.lineTo(x + i + 2, y + 16);
          ctx.lineTo(x + i + 18, y);
          ctx.lineTo(x + i + 16, y);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (!same(0, -1)) R(ctx, x, y, TILE, 2, armor ? '#8397aa' : pal.hullHi);
      if (!same(0, 1)) R(ctx, x, y + TILE - 2, TILE, 2, armor ? '#2b333b' : pal.hullLo);
      if (!same(-1, 0)) R(ctx, x, y, 1, TILE, armor ? '#8397aa' : pal.hullHi);
      if (!same(1, 0)) R(ctx, x + TILE - 1, y, 1, TILE, armor ? '#2b333b' : pal.hullLo);
      R(ctx, x + 3, y + 3, 1, 1, pal.rivet);
      R(ctx, x + 12, y + 3, 1, 1, pal.rivet);
      R(ctx, x + 3, y + 12, 1, 1, pal.rivet);
      R(ctx, x + 12, y + 12, 1, 1, pal.rivet);
      if ((tx * 7 + ty * 3) % 11 === 0 && !armor) R(ctx, x + 6, y + 8, 4, 3, 'rgba(150,70,40,0.5)');
      break;
    }
    case RT.CHASSIS:
      if (anchored) {
        R(ctx, x, y, TILE, TILE, '#5e5e62');
        R(ctx, x, y, TILE, 2, '#7a7a80');
        R(ctx, x + ((tx * 5) % 12), y + 6, 3, 2, '#48484c');
      } else {
        R(ctx, x, y, TILE, TILE, '#2b2c31');
        stripes(ctx, x, y, TILE, 3);
        R(ctx, x, y + TILE - 3, TILE, 3, '#1a1b1f');
        R(ctx, x + 7, y + 7, 2, 2, '#6d6f78');
      }
      break;
    case RT.PLATFORM:
      R(ctx, x, y, TILE, 4, '#6d747c');
      for (let i = 1; i < TILE; i += 3) R(ctx, x + i, y + 1, 1, 2, '#2b3036');
      R(ctx, x, y, TILE, 1, '#98a0a8');
      break;
    case RT.WINDOW: {
      R(ctx, x, y, TILE, TILE, '#3a4450');
      R(ctx, x + 2, y + 2, TILE - 4, TILE - 4, 'rgba(79,195,247,0.45)');
      R(ctx, x + 4, y + 3, 2, 8, 'rgba(255,255,255,0.35)');
      break;
    }
    case RT.DOOR:
      R(ctx, x, y, TILE, TILE, '#3a3f45');
      R(ctx, x + 2, y, TILE - 4, TILE, '#555c63');
      if (ty % 3 === 1) stripes(ctx, x + 2, y + 5, TILE - 4, 6);
      R(ctx, x + 7, y, 2, TILE, '#2b2f34');
      R(ctx, x + TILE - 4, y + 7, 2, 2, pal.trim);
      break;
    case RT.LADDER:
      R(ctx, x + 3, y, 2, TILE, '#8d8d8d');
      R(ctx, x + 11, y, 2, TILE, '#8d8d8d');
      for (let i = 2; i < TILE; i += 5) R(ctx, x + 3, y + i, 10, 2, '#b0b0b0');
      break;
    case RT.LAMP:
      R(ctx, x + 5, y, 6, 2, '#555');
      R(ctx, x + 4, y + 2, 8, 3, '#777');
      R(ctx, x + 5, y + 5, 6, 2, '#ffe0a0');
      break;
  }
  if (t !== RT.EMPTY && t !== RT.CHASSIS) {
    const hpr = rig.hp[ty * rig.cols + tx] / rig.tileMax(t);
    if (hpr < 0.66) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 2);
      ctx.lineTo(x + 7, y + 8);
      ctx.lineTo(x + 5, y + 13);
      if (hpr < 0.33) {
        ctx.moveTo(x + 7, y + 8);
        ctx.lineTo(x + 13, y + 10);
      }
      ctx.stroke();
      if (hpr < 0.33) R(ctx, x + 6, y + 7, 3, 3, 'rgba(0,0,0,0.7)');
    }
  }
}

/** A gatling spins up while it has somewhere to point. */
function targetsActive(m: ModuleInst): boolean {
  return m.cooldown > -0.5;
}

/* ---------------------------------------------------------------------- */
/* Renderer                                                                */
/* ---------------------------------------------------------------------- */

export class RigRenderer {
  private caches = new WeakMap<Rig, Cache>();

  private buildStatic(rig: Rig): HTMLCanvasElement {
    let c = this.caches.get(rig);
    if (c && c.version === rig.version && c.canvas.width === rig.widthPx && c.canvas.height === rig.heightPx) return c.canvas;
    if (!c) {
      c = { canvas: document.createElement('canvas'), version: -1 };
      this.caches.set(rig, c);
    }
    const cv = c.canvas;
    cv.width = rig.widthPx;
    cv.height = rig.heightPx;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const pal = rig.team === 'player' ? PAL.player : PAL.hostile;
    for (let ty = 0; ty < rig.rows; ty++) {
      for (let tx = 0; tx < rig.cols; tx++) {
        if (rig.bgAt(tx, ty) !== BG.PANEL) continue;
        const x = tx * TILE, y = ty * TILE;
        R(ctx, x, y, TILE, TILE, pal.panel);
        if (tx % 4 === 0) R(ctx, x, y, 1, TILE, pal.seam);
        if (ty % 5 === 0) R(ctx, x, y, TILE, 1, pal.seam);
        if (tx % 8 === 2 && ty % 5 === 2) R(ctx, x + 2, y + 2, 1, 1, '#3a454e');
      }
    }
    for (const m of rig.modules) moduleStatic(ctx, m, pal, rig);
    for (let ty = 0; ty < rig.rows; ty++) for (let tx = 0; tx < rig.cols; tx++) drawTile(ctx, rig, tx, ty, pal, rig.anchored);
    if (rig.wrecked) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(20,14,12,0.55)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    c.version = rig.version;
    return cv;
  }

  /** Foundations for outposts; tank treads (or hover pads) and armored side skirts for rigs. */
  drawUnder(ctx: CanvasRenderingContext2D, rig: Rig, world: { get(x: number, y: number): number }, t: number): void {
    const bottom = rig.y + rig.heightPx;
    if (rig.anchored) {
      for (let i = 0; i < rig.cols; i += 6) {
        const x = rig.x + i * TILE + 4;
        R(ctx, x, bottom, 14, RIG_CLEARANCE + 30, '#4a4a50');
        R(ctx, x, bottom, 14, 3, '#6a6a70');
        R(ctx, x + 3, bottom + 6, 8, 2, '#303034');
      }
      return;
    }
    void world;
    const drive = DRIVES[rig.drive];
    const player = rig.team === 'player';
    const n = player ? rig.chassisDef.wheels : Math.max(6, Math.floor(rig.cols / 4));
    const c0 = Math.floor(rig.x / TILE);
    const rest = bottom + RIG_CLEARANCE - WHEEL_R;
    const x0 = rig.x + 10 + WHEEL_R, x1 = rig.x + rig.widthPx - 10 - WHEEL_R;
    const wheels: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const wx = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
      const col = Math.floor(wx / TILE) - c0;
      const ground = rig.groundTops[col] ?? bottom + RIG_CLEARANCE;
      const end = i === 0 || i === n - 1;
      const wy = end ? rest - 6 : Math.max(rest - 2, Math.min(ground - WHEEL_R, rest + 22));
      wheels.push({ x: wx, y: wy });
    }
    const skirt = (): void => {
      const top = bottom - 2;
      const col = player ? '#4d443b' : '#4a3834';
      R(ctx, rig.x + 2, top, rig.widthPx - 4, 14, col);
      R(ctx, rig.x + 2, top, rig.widthPx - 4, 2, player ? '#6e6155' : '#6a524c');
      R(ctx, rig.x + 2, top + 12, rig.widthPx - 4, 2, '#1e1a17');
      for (let x = rig.x + 10; x < rig.x + rig.widthPx - 8; x += 22) {
        R(ctx, x, top + 4, 2, 2, player ? '#a08c78' : '#9a7870');
        R(ctx, x, top + 9, 2, 2, player ? '#a08c78' : '#9a7870');
      }
      for (let x = rig.x + 32; x < rig.x + rig.widthPx - 20; x += 64) R(ctx, x, top + 2, 1, 10, '#2a2420');
      stripes(ctx, rig.facing > 0 ? rig.x + rig.widthPx - 26 : rig.x + 4, top + 3, 22, 8, player ? '#e0b020' : '#c62828');
    };
    if (drive.hover) {
      for (const w of wheels) {
        R(ctx, w.x - 16, bottom, 32, 12, '#2c3440');
        R(ctx, w.x - 12, bottom + 12, 24, 4, '#1c232c');
        R(ctx, w.x - 10, bottom + 16, 20, 2, '#6af0ff');
      }
      skirt();
      return;
    }
    const style = {
      wheels: { belt: '#222327', link: '#3b3d43', wheel: '#3a3d44' },
      tracks: { belt: '#3a342c', link: '#8a7a5a', wheel: '#4a443a' },
      chains: { belt: '#24262e', link: '#c4d6ec', wheel: '#3a3e4a' },
      magma: { belt: '#261c1c', link: '#ff6e28', wheel: '#3a2a26' },
    }[rig.drive as 'wheels' | 'tracks' | 'chains' | 'magma'] ?? { belt: '#222327', link: '#3b3d43', wheel: '#3a3d44' };
    const first = wheels[0], last = wheels[wheels.length - 1];
    const topY = bottom + 1;
    const R2 = WHEEL_R + 4;
    // Belt: upper run, end wraps, and a lower run that follows the road wheels.
    ctx.fillStyle = style.belt;
    ctx.strokeStyle = style.belt;
    ctx.fillRect(first.x, topY - 1, last.x - first.x, 7);
    ctx.beginPath();
    ctx.arc(first.x, first.y, R2, 0, Math.PI * 2);
    ctx.arc(last.x, last.y, R2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(first.x, first.y + R2 - 4);
    for (const w of wheels) ctx.lineTo(w.x, w.y + WHEEL_R + 1);
    ctx.lineTo(last.x, last.y + R2 - 4);
    ctx.stroke();
    // Moving tread links.
    const off = (((rig.wheelAngle * WHEEL_R) % 9) + 9) % 9;
    ctx.fillStyle = style.link;
    for (let x = first.x + off; x < last.x; x += 9) R(ctx, x, topY - 2, 4, 2, style.link);
    for (let i = 0; i < wheels.length - 1; i++) {
      const a = wheels[i], b = wheels[i + 1];
      const segs = Math.max(1, Math.floor((b.x - a.x) / 9));
      for (let k = 0; k < segs; k++) {
        const f = (k + (1 - off / 9)) / segs;
        const lx = a.x + (b.x - a.x) * f, ly = a.y + (b.y - a.y) * f + WHEEL_R + 3;
        if (rig.drive === 'chains') {
          R(ctx, lx - 1, ly + 1, 3, 3, style.link);
        } else {
          R(ctx, lx - 2, ly, 4, 2, style.link);
        }
      }
    }
    // Road wheels, drive sprocket and idler.
    wheels.forEach((w, i) => {
      const end = i === 0 || i === wheels.length - 1;
      const rr = end ? WHEEL_R - 1 : WHEEL_R - 3;
      ctx.fillStyle = style.wheel;
      ctx.beginPath();
      ctx.arc(w.x, w.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b7079';
      ctx.beginPath();
      ctx.arc(w.x, w.y, end ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (end) {
        ctx.strokeStyle = '#2a2c30';
        ctx.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          const a = rig.wheelAngle + (k / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(w.x + Math.cos(a) * 6, w.y + Math.sin(a) * 6);
          ctx.lineTo(w.x + Math.cos(a) * rr, w.y + Math.sin(a) * rr);
          ctx.stroke();
        }
      }
    });
    if (rig.drive === 'magma') {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 6);
      ctx.strokeStyle = '#ffab40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y + R2 - 1);
      for (const w of wheels) ctx.lineTo(w.x, w.y + WHEEL_R + 4);
      ctx.lineTo(last.x, last.y + R2 - 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    skirt();
  }

  drawBody(ctx: CanvasRenderingContext2D, rig: Rig): void {
    ctx.drawImage(this.buildStatic(rig), Math.round(rig.x), Math.round(rig.y));
  }

  /** Animated parts: turrets, pistons, screens, crew. */
  drawDynamic(ctx: CanvasRenderingContext2D, rig: Rig, t: number, g: Game): void {
    const ox = Math.round(rig.x), oy = Math.round(rig.y);
    const pal = rig.team === 'player' ? PAL.player : PAL.hostile;
    const live = !rig.wrecked;
    for (const m of rig.modules) {
      const d = m.def;
      const x = ox + m.x * TILE, y = oy + m.y * TILE, w = d.w * TILE, h = d.h * TILE;
      const cx = x + w / 2;
      const a = m.anim;
      if (d.turret) {
        const heavy = d.turret.size === 'heavy';
        const px = cx, py = y + h * (heavy ? 0.35 : 0.45);
        const fired = live && m.cooldown > 0 ? Math.max(0, 1 - (1 / d.turret.rate - m.cooldown) * (heavy ? 3 : 30)) : 0;
        ctx.save();
        ctx.translate(px, py);
        if (d.key === 'tesla') {
          ctx.restore();
          const glowA = live ? 0.6 + 0.4 * Math.sin(m.anim * 12) : 0.2;
          ctx.fillStyle = `rgba(179,136,255,${glowA})`;
          ctx.beginPath();
          ctx.arc(cx, y + 9, 7, 0, Math.PI * 2);
          ctx.fill();
          R(ctx, cx - 1, y + 9, 2, 6, '#e1bee7');
          continue;
        }
        ctx.rotate(m.angle);
        const steel = rig.team === 'player' ? '#6b7178' : '#6b5a58';
        switch (d.key) {
          case 'main_battery': {
            const rc = fired * 10;
            R(ctx, -10, -7, 20, 14, rig.team === 'player' ? '#4d5259' : '#4d4040');
            R(ctx, 8 - rc, -4, 50, 8, steel);
            R(ctx, 8 - rc, -4, 50, 2, 'rgba(255,255,255,0.2)');
            R(ctx, 30 - rc, -5, 6, 10, '#4a4f55');
            R(ctx, 56 - rc, -6, 9, 12, '#3a3e44');
            R(ctx, 58 - rc, -2, 7, 4, '#1a1c1f');
            break;
          }
          case 'rail_cannon': {
            const rc = fired * 6;
            R(ctx, -8, -8, 18, 16, '#3d3d4d');
            R(ctx, 6 - rc, -6, 58, 4, '#9e9eb8');
            R(ctx, 6 - rc, 2, 58, 4, '#9e9eb8');
            for (let i = 0; i < 5; i++) R(ctx, 12 + i * 10 - rc, -2, 4, 4, '#ea80fc');
            break;
          }
          case 'mortar':
            R(ctx, -4, -5, 20, 10, '#4a4f55');
            R(ctx, 12, -6, 5, 12, '#2b2e33');
            break;
          case 'gatling': {
            const spin = m.anim * (live && targetsActive(m) ? 30 : 2);
            for (let i = 0; i < 3; i++) R(ctx, -2 - fired * 2, -4 + ((i * 3 + Math.floor(spin)) % 9), 22, 2, i === 1 ? '#9e9e9e' : '#7a7a7a');
            R(ctx, -6, -5, 8, 10, '#4a4f55');
            break;
          }
          case 'point_defense':
            R(ctx, -2, -4, 14, 2, '#b0bec5');
            R(ctx, -2, 2, 14, 2, '#b0bec5');
            break;
          case 'missile_pod': {
            const len = 14;
            R(ctx, -6, -8, len + 4, 16, '#4a4f55');
            for (let i = 0; i < 3; i++) R(ctx, len - 2, -6 + i * 5, 3, 3, '#ff3d00');
            break;
          }
          case 'flak':
            R(ctx, -4 - fired * 3, -6, 16, 4, steel);
            R(ctx, -4 - fired * 3, 2, 16, 4, steel);
            break;
          default:
            R(ctx, -4 - fired * 3, -3, d.key === 'laser_turret' ? 22 : 20, 6, d.key === 'laser_turret' ? '#37474f' : steel);
            if (d.key === 'laser_turret') R(ctx, 14, -2, 6, 4, '#ff4081');
        }
        ctx.restore();
        if (!heavy) {
          ctx.fillStyle = rig.team === 'player' ? '#5a6068' : '#5a4448';
          ctx.beginPath();
          ctx.arc(px, py, d.key === 'point_defense' ? 5 : 8, 0, Math.PI * 2);
          ctx.fill();
        }
        R(ctx, px - 2, py - 2, 4, 4, m.crewed && live ? d.accent : '#333');
        continue;
      }
      if (!live) continue;
      switch (d.key) {
        case 'engine':
        case 'ion_engine':
          for (let i = 0; i < 4; i++) {
            const py = Math.sin(a * (8 + Math.abs(rig.vx) * 0.05) + i * 1.6) * 4;
            R(ctx, x + 9 + i * 12, y + 24 + py, 6, 5, d.key === 'ion_engine' ? '#40c4ff' : '#9e9e9e');
          }
          if (Math.random() < 0.15 + Math.abs(rig.vx) * 0.002) g.sim.particles.add({ x: x + w - 9, y: y + 2, vx: -rig.vx * 0.2 + (Math.random() - 0.5) * 10, vy: -40, life: 1.6, size: 6, color: d.key === 'ion_engine' ? 'rgba(120,200,255,0.25)' : 'rgba(40,36,36,0.45)', shrink: false, drag: 0.5 });
          break;
        case 'fabricator': {
          const ax = x + 30 + Math.sin(a * 2) * 6, ay = y + h - 22 + Math.cos(a * 3) * 3;
          ctx.strokeStyle = '#ffab40';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 38, y + 6);
          ctx.lineTo(x + 34, y + 16);
          ctx.lineTo(ax, ay);
          ctx.stroke();
          break;
        }
        case 'medbay': {
          ctx.strokeStyle = '#76ff03';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < 20; i++) {
            const ph = (i + a * 12) % 20;
            const yy = ph > 8 && ph < 10 ? -4 : ph > 10 && ph < 11 ? 3 : 0;
            if (i === 0) ctx.moveTo(x + 7 + i, y + 14 + yy);
            else ctx.lineTo(x + 7 + i, y + 14 + yy);
          }
          ctx.stroke();
          break;
        }
        case 'radar': {
          const s = Math.sin(a * 2);
          ctx.fillStyle = '#b0bec5';
          ctx.beginPath();
          ctx.ellipse(cx, y + 10, Math.abs(s) * 13 + 2, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          R(ctx, cx - 1, y + 4, 2, 10, '#78909c');
          break;
        }
        case 'drill': {
          const left = m.x === 0;
          const bx = left ? x + 20 : x + 28;
          const tip = left ? x - 10 : x + w + 10;
          ctx.fillStyle = '#90a4ae';
          ctx.beginPath();
          ctx.moveTo(bx, y + 8);
          ctx.lineTo(tip, y + h / 2);
          ctx.lineTo(bx, y + h - 8);
          ctx.fill();
          ctx.strokeStyle = '#455a64';
          ctx.lineWidth = 2;
          const spin = rig.drilling ? a * 20 : a * 2;
          for (let i = 0; i < 5; i++) {
            const f = ((i / 5 + spin * 0.05) % 1 + 1) % 1;
            const xx = bx + (tip - bx) * f;
            const hh = (h / 2 - 8) * (1 - f);
            ctx.beginPath();
            ctx.moveTo(xx, y + h / 2 - hh);
            ctx.lineTo(xx + (left ? -4 : 4), y + h / 2 + hh);
            ctx.stroke();
          }
          break;
        }
        case 'cockpit': {
          if (g.player.driving === rig) {
            R(ctx, cx - 3, y + h - 34, 7, 8, '#6af0ff');
          }
          for (let i = 0; i < 4; i++) if (Math.sin(a * 3 + i * 2) > 0.3) R(ctx, x + 8 + i * 13, y + h - 12, 3, 2, '#ffffff');
          break;
        }
        case 'refinery':
          ctx.fillStyle = `rgba(255,${120 + Math.sin(a * 5) * 40},30,0.9)`;
          ctx.fillRect(x + 14, y + 30, w - 28, 8);
          break;
        case 'shield':
          ctx.fillStyle = `rgba(179,136,255,${0.6 + Math.sin(a * 4) * 0.3})`;
          ctx.beginPath();
          ctx.arc(cx, y + 12, 6, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'repair_bay': {
          const dx = Math.sin(a * 1.3) * 12;
          ctx.fillStyle = '#ffab40';
          ctx.beginPath();
          ctx.arc(cx + dx, y + 12 + Math.cos(a * 2) * 3, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
      if (m.hp < m.maxHp * 0.5 && Math.random() < 0.05) {
        g.sim.particles.add({ x: x + Math.random() * w, y: y + Math.random() * h, vx: (Math.random() - 0.5) * 80, vy: -60, life: 0.3, size: 2, color: '#ffd180', glow: true, gravity: 300 });
      }
    }
    // Crew
    if (live) {
      rig.crew.forEach((c, i) => {
        const post = rig.modules.find((m) => m.id === c.post);
        let x: number, y: number;
        if (post) {
          x = ox + (post.x + post.def.w / 2) * TILE + ((i * 13) % 17) - 8;
          y = oy + (post.y + post.def.h) * TILE;
          if (post.def.turret) x = ox + (post.x + post.def.w) * TILE + 3;
        } else {
          x = rig.cx + ((i * 23) % 60) - 30;
          y = oy + (rig.rows - 1) * TILE;
        }
        c.bob += 0.05;
        const bob = Math.sin(c.bob * 2 + i) > 0.7 ? 1 : 0;
        R(ctx, x - 3, y - 12 - bob, 6, 7, rig.team === 'player' ? ROLES[c.role]?.color ?? pal.suit : pal.suit);
        R(ctx, x - 2, y - 17 - bob, 5, 5, '#d7a98b');
        R(ctx, x - 2, y - 17 - bob, 5, 2, '#3e2723');
        R(ctx, x - 3, y - 5, 2, 5, '#263238');
        R(ctx, x + 1, y - 5, 2, 5, '#263238');
      });
    }
    // Labels while building
    if (rig === g.playerRig && g.panel === 'build') {
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      for (const m of rig.modules) {
        const x = ox + (m.x + m.def.w / 2) * TILE, y = oy + m.y * TILE + 11;
        const label = m.def.name.toUpperCase();
        const tw = ctx.measureText(label).width + 4;
        R(ctx, x - tw / 2, y - 7, tw, 9, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = m.def.accent;
        ctx.fillText(label, x, y);
      }
      ctx.textAlign = 'left';
    }
  }

  /** Additive glows: lamps, reactors, screens, shield bubble. */
  drawGlow(ctx: CanvasRenderingContext2D, rig: Rig, t: number, glow: (x: number, y: number, r: number, color: string, a: number) => void): void {
    const ox = rig.x, oy = rig.y;
    if (!rig.wrecked) {
      for (const m of rig.modules) {
        const c = rig.moduleCenter(m);
        const d = m.def;
        if (d.key === 'reactor' || d.key === 'fission') glow(c.x, c.y, 40, d.accent, 0.35 + 0.15 * Math.sin(m.anim * 3) * rig.powerRatio);
        else if (d.key === 'shield') glow(c.x, oy + (m.y + 0.8) * TILE, 26, '#b388ff', 0.4);
        else if (d.key === 'refinery') glow(c.x, c.y + 6, 34, '#ff6e40', 0.35);
        else if (d.key === 'hydroponics') glow(c.x, c.y - 8, 30, '#d500f9', 0.2);
        else if (d.key === 'cockpit') glow(c.x, oy + (m.y + m.def.h) * TILE - 10, 24, '#00e5ff', 0.25);
        else if (d.key === 'tesla') glow(c.x, oy + m.y * TILE + 9, 30, '#b388ff', 0.35 + 0.25 * Math.sin(m.anim * 12));
        else if (d.key === 'rail_cannon') glow(c.x, oy + (m.y + 0.8) * TILE, 36, '#ea80fc', 0.25 + 0.15 * Math.sin(m.anim * 4));
        else if (d.turret && m.crewed) glow(c.x, oy + (m.y + m.def.h * 0.45) * TILE, 10, d.accent, 0.25);
        else glow(c.x, oy + (m.y + 0.2) * TILE, 14, d.accent, 0.12);
      }
      for (let ty = 0; ty < rig.rows; ty++) {
        for (let tx = 0; tx < rig.cols; tx++) {
          if (rig.tileAt(tx, ty) === RT.LAMP) glow(ox + (tx + 0.5) * TILE, oy + (ty + 0.4) * TILE, 44, '#ffd180', 0.3);
        }
      }
      if (DRIVES[rig.drive].hover && !rig.anchored) {
        const bottom = oy + rig.heightPx;
        for (let i = 0; i < 6; i++) glow(ox + ((i + 0.5) * rig.widthPx) / 6, bottom + 16, 26, '#6af0ff', 0.25 + 0.1 * Math.sin(t * 8 + i));
      }
    }
    if (rig.shieldMax > 0 && (rig.shield > 0 || rig.shieldFlash > 0)) {
      const a = 0.05 + rig.shieldFlash * 0.8;
      ctx.strokeStyle = `rgba(179,136,255,${Math.min(0.9, a + 0.08)})`;
      ctx.fillStyle = `rgba(124,77,255,${a * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(rig.cx, rig.cy + 10, rig.widthPx / 2 + 20, rig.heightPx / 2 + 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Light sources for the lighting system. */
  lights(rig: Rig, out: PointLight[]): void {
    if (rig.wrecked) return;
    for (const m of rig.modules) {
      const c = rig.moduleCenter(m);
      out.push({ x: c.x, y: c.y, v: m.def.key === 'reactor' || m.def.key === 'fission' ? 0.9 : 0.6 });
    }
    for (let ty = 0; ty < rig.rows; ty++) {
      for (let tx = 0; tx < rig.cols; tx++) {
        if (rig.tileAt(tx, ty) === RT.LAMP) out.push({ x: rig.x + (tx + 0.5) * TILE, y: rig.y + (ty + 0.5) * TILE, v: 0.95 });
      }
    }
  }
}
