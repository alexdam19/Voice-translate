import { getItem } from '../shared/items';
import type { Enemy, Projectile } from '../game/entities';
import { rgb, mixRGB, type RGB } from '../shared/types';
import { itemIcon } from './icons';

function R(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export interface HumanLook {
  body: string;
  trim: string;
  visor: string;
  pack: string | null;
  spikes?: boolean;
}

/** Draws a humanoid with feet at (fx, fy). */
export function drawHuman(
  ctx: CanvasRenderingContext2D, fx: number, fy: number, facing: number, aim: number, anim: number,
  look: HumanLook, weapon: string | null, flags: { moving: boolean; air: boolean; climbing: boolean; hurt: boolean; jet: boolean },
): void {
  const f = facing;
  const x = Math.round(fx), y = Math.round(fy);
  const step = flags.moving && !flags.air ? Math.sin(anim * 1.2) : 0;
  const hurt = flags.hurt;
  const body = hurt ? '#ffffff' : look.body;
  const trim = hurt ? '#ffcdd2' : look.trim;
  // back pack
  if (look.pack) R(ctx, x - f * 7 - 3, y - 24, 6, 11, look.pack);
  // legs
  const l1 = flags.air ? -2 : step * 3, l2 = flags.air ? 2 : -step * 3;
  R(ctx, x - 4 + l1, y - 10, 4, 10, '#2b2f36');
  R(ctx, x + l2, y - 10, 4, 10, '#343941');
  R(ctx, x - 5 + l1, y - 2, 5, 2, '#1a1c20');
  R(ctx, x - 1 + l2, y - 2, 5, 2, '#1a1c20');
  // torso
  R(ctx, x - 6, y - 21, 12, 12, body);
  R(ctx, x - 6, y - 12, 12, 2, trim);
  R(ctx, x - 1 + f * 2, y - 20, 2, 7, trim);
  if (look.spikes) {
    R(ctx, x - 7, y - 23, 3, 3, '#9e9e9e');
    R(ctx, x + 4, y - 23, 3, 3, '#9e9e9e');
  }
  // head
  R(ctx, x - 5, y - 30, 10, 9, trim);
  R(ctx, x - 4 + (f > 0 ? 2 : -1), y - 27, 6, 3, look.visor);
  R(ctx, x - 5, y - 31, 10, 2, body);
  // arm + weapon
  const ax = x, ay = y - 18;
  ctx.save();
  ctx.translate(ax, ay);
  let a = aim;
  if (flags.climbing) a = -Math.PI / 2;
  ctx.rotate(a);
  const flip = Math.cos(a) < 0;
  if (flip) ctx.scale(1, -1);
  R(ctx, 0, -2, 8, 4, body);
  if (weapon) {
    const icon = itemIcon(weapon);
    ctx.drawImage(icon, 4, -9, 16, 16);
  }
  ctx.restore();
}

const HUMAN_DEFAULT: HumanLook = { body: '#6e5236', trim: '#ffb74d', visor: '#6af0ff', pack: null };

export function lookForSuit(suit: string | null, gadget: string | null, visor = '#6af0ff'): HumanLook {
  const s = suit ? getItem(suit).suit : undefined;
  return {
    body: s?.body ?? '#4a4a52',
    trim: s?.trim ?? '#9e9e9e',
    visor,
    pack: gadget ? getItem(gadget).c1 : null,
  };
}

export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
  const tint: RGB = e.tint;
  const hurt = e.hurtFlash > 0;
  const base = hurt ? '#ffffff' : rgb(mixRGB([70, 70, 76], tint, 0.35));
  const dark = hurt ? '#ffcdd2' : rgb(mixRGB([36, 36, 40], tint, 0.2));
  const x = Math.round(e.x), y = Math.round(e.y);
  switch (e.kind) {
    case 'crawler': {
      const legs = Math.sin(e.t * 18) * 2;
      for (let i = 0; i < 3; i++) {
        const lx = x + 3 + i * 6;
        R(ctx, lx, y + 7, 2, 5 + (i % 2 ? legs : -legs), dark);
      }
      R(ctx, x + 1, y + 1, e.w - 2, 8, base);
      R(ctx, x + 3, y, e.w - 6, 2, dark);
      R(ctx, e.facing > 0 ? x + e.w - 5 : x + 2, y + 3, 3, 2, '#ff1744');
      break;
    }
    case 'drone': {
      const rot = Math.sin(t * 40) * 8;
      R(ctx, x + 9 - rot / 2, y - 2, Math.abs(rot) + 1, 2, 'rgba(200,200,200,0.7)');
      R(ctx, x + 8, y, 2, 3, dark);
      R(ctx, x + 1, y + 3, e.w - 2, 6, base);
      R(ctx, x + 4, y + 9, e.w - 8, 3, dark);
      R(ctx, x + e.w / 2 - 2, y + 5, 4, 3, '#ff1744');
      break;
    }
    case 'brute': {
      const step = Math.sin(e.t * 6) * 2;
      R(ctx, x + 4 + step, y + 22, 7, 12, dark);
      R(ctx, x + 15 - step, y + 22, 7, 12, dark);
      R(ctx, x, y + 6, e.w, 18, base);
      R(ctx, x + 6, y, 14, 8, dark);
      R(ctx, e.facing > 0 ? x + 14 : x + 7, y + 3, 5, 2, '#ff6e40');
      R(ctx, e.facing > 0 ? x + e.w - 2 : x - 4, y + 10, 6, 12, base);
      break;
    }
    default: {
      const look: HumanLook = { body: base, trim: dark, visor: '#ff1744', pack: e.kind === 'trooper' ? '#5d4037' : null, spikes: true };
      drawHuman(ctx, e.x + e.w / 2, e.y + e.h, e.facing, e.aim || (e.facing > 0 ? 0 : Math.PI), e.t * 8, look, e.kind === 'trooper' ? 'scrap_smg' : 'rivet_pistol', {
        moving: Math.abs(e.vx) > 10, air: !e.grounded, climbing: false, hurt, jet: false,
      });
    }
  }
  if (e.hp < e.maxHp) {
    R(ctx, x, y - 6, e.w, 2, 'rgba(0,0,0,0.6)');
    R(ctx, x, y - 6, (e.w * Math.max(0, e.hp)) / e.maxHp, 2, '#ff5252');
  }
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const dx = p.vx / sp, dy = p.vy / sp;
  ctx.strokeStyle = p.color;
  ctx.lineCap = 'round';
  switch (p.kind) {
    case 'laser':
    case 'rail': {
      const len = p.kind === 'rail' ? 90 : 36;
      ctx.lineWidth = p.kind === 'rail' ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(p.x - dx * len, p.y - dy * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    case 'rocket':
    case 'missile':
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#cfd8dc';
      ctx.beginPath();
      ctx.moveTo(p.x - dx * 10, p.y - dy * 10);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = '#ffab40';
      ctx.beginPath();
      ctx.arc(p.x - dx * 12, p.y - dy * 12, 3 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'grenade':
      ctx.fillStyle = '#4a5a3a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (Math.floor(p.life * 8) % 2) {
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(p.x - 1, p.y - 5, 2, 2);
      }
      break;
    case 'plasma':
    case 'spit':
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'flak':
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      break;
    default: {
      const len = Math.min(18, sp * 0.02);
      ctx.lineWidth = p.kind === 'pellet' ? 1.5 : 2;
      ctx.beginPath();
      ctx.moveTo(p.x - dx * len, p.y - dy * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }
}

export function drawCache(ctx: CanvasRenderingContext2D, x: number, y: number, opened: boolean, t: number): void {
  R(ctx, x, y - 14, 24, 14, opened ? '#3a342c' : '#5d4e37');
  R(ctx, x, y - 14, 24, 3, opened ? '#2a2620' : '#7a6749');
  R(ctx, x + 2, y - 8, 20, 3, opened ? '#2a2a2a' : '#e0b020');
  R(ctx, x + 10, y - 12, 4, 6, '#333');
  if (!opened) R(ctx, x + 11, y - 11, 2, 2, Math.sin(t * 4) > 0 ? '#76ff03' : '#33691e');
}

export function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'body' | 'supply', t: number): void {
  if (kind === 'supply') {
    R(ctx, x - 14, y - 20, 28, 20, '#37474f');
    R(ctx, x - 14, y - 20, 28, 3, '#607d8b');
    R(ctx, x - 12, y - 12, 24, 3, '#ff1744');
    R(ctx, x - 1, y - 32, 2, 12, '#9e9e9e');
    R(ctx, x - 3, y - 35, 6, 4, Math.sin(t * 6) > 0 ? '#ff1744' : '#5d0000');
  } else {
    R(ctx, x - 12, y - 8, 24, 8, '#3e2723');
    R(ctx, x - 10, y - 10, 20, 3, '#5d4037');
    R(ctx, x - 2, y - 14, 4, 4, Math.sin(t * 3) > 0 ? '#ffd740' : '#6d5a00');
  }
}

export function drawDrop(ctx: CanvasRenderingContext2D, x: number, y: number, id: string, t: number): void {
  const bob = Math.sin(t * 3 + x) * 1.5;
  ctx.drawImage(itemIcon(id), Math.round(x - 1), Math.round(y - 2 + bob), 12, 12);
}

export function drawCheckpoint(ctx: CanvasRenderingContext2D, gx: number, gy: number, t: number): void {
  const flicker = Math.sin(t * 13) > -0.9 ? 1 : 0.35;
  ctx.save();
  ctx.textAlign = 'center';
  // Title plate across the hazard band, subtitle just beneath it.
  R(ctx, gx - 124, gy - 334, 248, 44, 'rgba(10,4,10,0.9)');
  ctx.font = 'bold 30px "Orbitron", "Share Tech Mono", monospace';
  ctx.fillStyle = `rgba(255,40,90,${flicker})`;
  ctx.fillText('DEAD ZONE', gx, gy - 300);
  R(ctx, gx - 190, gy - 284, 380, 20, 'rgba(10,8,6,0.85)');
  ctx.font = 'bold 12px "Share Tech Mono", monospace';
  ctx.fillStyle = `rgba(255,215,64,${0.95 * flicker})`;
  ctx.fillText('WARZONE CHECKPOINT // PVP // NO INSURANCE', gx, gy - 270);
  ctx.restore();
  // gate barrier
  const up = 0.5 + 0.5 * Math.sin(t * 0.5);
  R(ctx, gx - 250, gy - 64 - up * 30, 500, 5, '#e0b020');
  R(ctx, gx - 250, gy - 64 - up * 30, 500, 2, '#1c1c1c');
}

export { HUMAN_DEFAULT };
