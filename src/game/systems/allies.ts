import { turnToward, wrapAngle } from '../../shared/types';
import { eid, type Ally, type AllyKind, type Projectile } from '../entities';
import type { Game, Target } from '../game';
import { damageEnemy, damageTank, explode, type HitOpts } from './damage';
import { moveSmall } from './movement';

/**
 * Friendly units summoned by abilities and turrets: marines, laser drones, mini fighter jets,
 * battle mechs, dragons and mines.
 */

function makeAlly(kind: AllyKind, x: number, y: number, o: Partial<Ally>): Ally {
  return {
    id: eid(), kind, x, y, z: 0, rot: 0, hp: 100, maxHp: 100, life: 20, dmg: 10, range: 9, cd: Math.random() * 0.5, cd2: 1, heavy: false, face: 1, anim: 0,
    targetId: 0, tx: x, ty: y, owner: 0, ...o,
  };
}

/** Is this ally something enemies can shoot? (Jets and dragons fly too high; mines are hidden.) */
export const allyTargetable = (a: Ally): boolean => a.kind !== 'jet' && a.kind !== 'dragon' && a.kind !== 'mine';

export function spawnMarines(g: Game, n: number, heavy: boolean, life: number, power: number): void {
  const p = g.player;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = p.stats.width / 2 + 1;
    const hp = (heavy ? 220 : 90) * power;
    g.allies.push(makeAlly(heavy ? 'heavy' : 'marine', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, { hp, maxHp: hp, life, dmg: (heavy ? 16 : 9) * power, range: heavy ? 11 : 9, heavy }));
  }
}

export function spawnJet(g: Game, x: number, y: number, rot: number, tx: number, ty: number, dmg: number, life: number, owner = 0): Ally {
  const a = makeAlly('jet', x, y, { z: 1.2, rot, life, dmg, range: 12, tx, ty, owner, hp: 1, maxHp: 1 });
  g.allies.push(a);
  g.hooks.sound('rocket', x, y, 0.4);
  return a;
}

export function spawnDrones(g: Game, n: number, dmg: number, life: number, hp: number): void {
  const p = g.player;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.allies.push(makeAlly('drone', p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2, { z: 1.8, life, dmg, range: 10, hp, maxHp: hp, rot: a }));
  }
}

export function spawnMech(g: Game, x: number, y: number, P: number): void {
  const hp = 3000 * P;
  g.allies.push(makeAlly('mech', x, y, { life: 30, dmg: 150 * P, range: 16, hp, maxHp: hp, cd: 1, cd2: 3 }));
  explode(g, x, y, 4, 200 * P, 'player', { srcTank: g.player.id }, '#ffab40');
  g.fx.push({ t: 'shake', amt: 1 });
}

export function spawnDragon(g: Game, x: number, y: number, P: number): void {
  const p = g.player;
  g.allies.push(makeAlly('dragon', p.x - 20, p.y - 20, { z: 5, life: 25, dmg: 18 * P, range: 10, hp: 1, maxHp: 1, tx: x, ty: y, cd2: 2, rot: Math.PI / 4 }));
  g.hooks.sound('roar');
  g.fx.push({ t: 'shake', amt: 0.8 });
}

export function layMines(g: Game, n: number, dmg: number): void {
  const p = g.player;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const r = p.stats.length / 2 + 2 + Math.random() * 5;
    g.allies.push(makeAlly('mine', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, { life: 60, dmg, hp: 1, maxHp: 1, cd: 0.8 + i * 0.05 }));
  }
}

/* ---------------------------------------------------------------------- */

function nearestHostile(g: Game, x: number, y: number, range: number): Target | null {
  let best: Target | null = null;
  let bd = range;
  for (const e of g.enemies) {
    if (e.hp <= 0 || e.burrowed) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) {
      bd = d;
      best = { id: e.id, x: e.x, y: e.y, r: e.r, flying: e.flying };
    }
  }
  for (const t of g.tanks) {
    if (t.dead) continue;
    const d = Math.max(0, Math.hypot(t.x - x, t.y - y) - t.stats.radius);
    if (d < bd) {
      bd = d;
      best = { id: t.id, x: t.x, y: t.y, r: t.stats.radius, flying: false };
    }
  }
  return best;
}

function hit(g: Game, id: number, dmg: number, o: HitOpts = {}): void {
  const e = g.enemyById(id);
  if (e) {
    damageEnemy(g, e, dmg, { srcTank: g.player.id, ...o });
    return;
  }
  const t = g.tankById(id);
  if (t && t.team === 'enemy') damageTank(g, t, dmg, { srcTank: g.player.id, ...o });
}

function shot(g: Game, a: Ally, ang: number, speed: number, dmg: number, o: Partial<Projectile>): void {
  g.projectiles.push({
    id: eid(), x: a.x, y: a.y, z: Math.max(0.6, a.z), vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, vz: 0, team: 'player', kind: 'bullet', dmg,
    splash: 0, pierce: 0, life: 0, maxLife: a.range / speed + 0.15, color: '#ff8a80', homing: 0, targetId: 0, arc: false,
    tx: 0, ty: 0, burn: 0, crit: false, lifesteal: 0, srcTank: g.player.id, hit: [], flyer: 0, interceptable: false, hp: 1, size: 0.12, ...o,
  });
}

export function updateAllies(g: Game, dt: number): void {
  for (let i = g.allies.length - 1; i >= 0; i--) {
    const a = g.allies[i];
    a.life -= dt;
    a.anim += dt * 6;
    if (a.life <= 0 || a.hp <= 0) {
      if (a.kind === 'mech' || a.kind === 'drone') g.fx.push({ t: 'boom', x: a.x, y: a.y, r: a.kind === 'mech' ? 2 : 0.8, color: '#ffab40' });
      g.allies.splice(i, 1);
      continue;
    }
    switch (a.kind) {
      case 'jet':
        updateJet(g, a, dt);
        break;
      case 'drone':
        updateDrone(g, a, dt);
        break;
      case 'mech':
        updateMech(g, a, dt);
        break;
      case 'dragon':
        updateDragon(g, a, dt);
        break;
      case 'mine':
        if (updateMine(g, a, dt)) g.allies.splice(i, 1);
        break;
      default:
        updateMarine(g, a, dt);
    }
  }
}

function updateMarine(g: Game, a: Ally, dt: number): void {
  const best = nearestHostile(g, a.x, a.y, a.range + 6);
  let mx = 0, my = 0;
  if (best) {
    const bd = Math.hypot(best.x - a.x, best.y - a.y);
    a.face = best.x >= a.x ? 1 : -1;
    if (bd > a.range * 0.8) {
      mx = (best.x - a.x) / bd;
      my = (best.y - a.y) / bd;
    }
    a.cd -= dt;
    if (a.cd <= 0 && bd <= a.range + best.r) {
      a.cd = a.heavy ? 0.5 : 0.7;
      shot(g, a, Math.atan2(best.y - a.y, best.x - a.x), 28, a.dmg, { splash: a.heavy ? 0.8 : 0, targetId: best.id });
      g.hooks.sound('smg', a.x, a.y, 0.2);
    }
  } else {
    const p = g.player;
    const dx = p.x - a.x, dy = p.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > p.stats.length / 2 + 3) {
      mx = dx / d;
      my = dy / d;
    }
  }
  const r = moveSmall(g, a.x, a.y, 0.3, mx * 4.5 * dt, my * 4.5 * dt, false);
  a.x = r.x;
  a.y = r.y;
}

/** Mini fighter jets: always moving, loop around the target, strafe with guns and drop bombs. */
function updateJet(g: Game, a: Ally, dt: number): void {
  const speed = 15;
  const tgt = nearestHostile(g, a.tx, a.ty, 18) ?? nearestHostile(g, a.x, a.y, 14);
  const gx = tgt ? tgt.x : a.tx + Math.cos(a.anim * 0.25) * 7, gy = tgt ? tgt.y : a.ty + Math.sin(a.anim * 0.25) * 7;
  const want = Math.atan2(gy - a.y, gx - a.x);
  a.rot = turnToward(a.rot, want, 2.4 * dt);
  a.x += Math.cos(a.rot) * speed * dt;
  a.y += Math.sin(a.rot) * speed * dt;
  a.z = Math.min(3.4, a.z + dt * 3);
  if (tgt) {
    const d = Math.hypot(tgt.x - a.x, tgt.y - a.y);
    const facing = Math.abs(wrapAngle(want - a.rot)) < 0.3;
    a.cd -= dt;
    if (facing && d < 13 && d > 2 && a.cd <= 0) {
      a.cd = 0.1;
      shot(g, a, a.rot + (Math.random() - 0.5) * 0.08, 42, a.dmg * 0.3, { color: '#ffe082', maxLife: 0.4 });
      if (Math.random() < 0.3) g.hooks.sound('smg', a.x, a.y, 0.15);
    }
    a.cd2 -= dt;
    if (d < 3 && a.cd2 <= 0) {
      a.cd2 = 1.6;
      const bx = a.x, by = a.y, dmg = a.dmg * 2.5;
      g.telegraphs.push({ id: eid(), x: bx, y: by, shape: 'circle', r: 2.2, a: 0, len: 0, t: 0, total: 0.35, color: '#ff9100', team: 'player', dmg: 0,
        onDone: () => explode(g, bx, by, 2.2, dmg, 'player', { srcTank: g.player.id }, '#ff9100', true) });
    }
  }
}

function updateDrone(g: Game, a: Ally, dt: number): void {
  const p = g.player;
  const tgt = nearestHostile(g, a.x, a.y, 18);
  let gx: number, gy: number;
  if (tgt) {
    const ang = a.rot + a.anim * 0.15;
    gx = tgt.x + Math.cos(ang) * 5;
    gy = tgt.y + Math.sin(ang) * 5;
    a.cd -= dt;
    const d = Math.hypot(tgt.x - a.x, tgt.y - a.y);
    if (a.cd <= 0 && d < a.range + tgt.r) {
      a.cd = 0.6;
      hit(g, tgt.id, a.dmg, { silent: false });
      g.fx.push({ t: 'beam', x0: a.x, y0: a.y, x1: tgt.x, y1: tgt.y, color: '#80d8ff', w: 0.08, life: 0.1 });
      g.hooks.sound('laser', a.x, a.y, 0.12);
    }
  } else {
    const ang = a.rot + a.anim * 0.3;
    gx = p.x + Math.cos(ang) * (p.stats.length / 2 + 2);
    gy = p.y + Math.sin(ang) * (p.stats.length / 2 + 2);
  }
  const dx = gx - a.x, dy = gy - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const sp = Math.min(d, 9 * dt);
  a.x += (dx / d) * sp;
  a.y += (dy / d) * sp;
  a.face = dx >= 0 ? 1 : -1;
}

function updateMech(g: Game, a: Ally, dt: number): void {
  const p = g.player;
  const tgt = nearestHostile(g, a.x, a.y, 30);
  let mx = 0, my = 0;
  if (tgt) {
    const d = Math.hypot(tgt.x - a.x, tgt.y - a.y);
    const ang = Math.atan2(tgt.y - a.y, tgt.x - a.x);
    a.rot = turnToward(a.rot, ang, 3 * dt);
    if (d > a.range * 0.7) {
      mx = Math.cos(ang);
      my = Math.sin(ang);
    }
    a.cd -= dt;
    if (a.cd <= 0 && d < a.range + tgt.r) {
      a.cd = 1.1;
      shot(g, a, ang, 30, a.dmg, { kind: 'shell', splash: 2.4, size: 0.3, color: '#ffd180', maxLife: a.range / 30 + 0.2, z: 2.4 });
      g.hooks.sound('cannon', a.x, a.y, 0.7);
      g.fx.push({ t: 'muzzle', x: a.x + Math.cos(ang) * 1.4, y: a.y + Math.sin(ang) * 1.4, a: ang, color: '#ffd180', size: 1.4 });
    }
    a.cd2 -= dt;
    if (a.cd2 <= 0 && d < 24) {
      a.cd2 = 5;
      for (let k = 0; k < 6; k++) {
        const fan = ang + (k / 5 - 0.5) * 1.8;
        shot(g, a, fan, 12, a.dmg * 0.45, { kind: 'missile', splash: 1.6, homing: 4, targetId: tgt.id, size: 0.2, color: '#ff9e40', maxLife: 2.5, z: 3 });
      }
      g.hooks.sound('rocket', a.x, a.y, 0.7);
    }
  } else {
    const dx = p.x - a.x, dy = p.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > p.stats.length / 2 + 4) {
      mx = dx / d;
      my = dy / d;
      a.rot = turnToward(a.rot, Math.atan2(dy, dx), 3 * dt);
    }
  }
  const r = moveSmall(g, a.x, a.y, 1, mx * 3.6 * dt, my * 3.6 * dt, false);
  if (mx || my) {
    if (Math.floor(a.anim * 0.5) !== Math.floor((a.anim - dt * 6) * 0.5)) g.fx.push({ t: 'dust', x: a.x, y: a.y, color: '#a1887f' });
  }
  a.x = r.x;
  a.y = r.y;
}

/** The dragon circles its prey, breathing fire whenever it faces something. */
function updateDragon(g: Game, a: Ally, dt: number): void {
  const p = g.player;
  const tgt = nearestHostile(g, a.tx, a.ty, 22) ?? nearestHostile(g, p.x, p.y, 26);
  if (tgt) {
    a.tx += (tgt.x - a.tx) * Math.min(1, dt * 0.8);
    a.ty += (tgt.y - a.ty) * Math.min(1, dt * 0.8);
  }
  // Orbit the target point.
  const orbit = a.anim * 0.12;
  const gx = a.tx + Math.cos(orbit) * 6, gy = a.ty + Math.sin(orbit) * 6;
  const want = Math.atan2(gy - a.y, gx - a.x);
  a.rot = turnToward(a.rot, want, 1.8 * dt);
  const speed = Math.hypot(gx - a.x, gy - a.y) > 12 ? 13 : 8;
  a.x += Math.cos(a.rot) * speed * dt;
  a.y += Math.sin(a.rot) * speed * dt;
  a.z = 4.2 + Math.sin(a.anim * 0.4) * 0.4;
  if (!tgt) return;
  const ang = Math.atan2(tgt.y - a.y, tgt.x - a.x);
  const d = Math.hypot(tgt.x - a.x, tgt.y - a.y);
  a.cd -= dt;
  if (d < 11 && Math.abs(wrapAngle(ang - a.rot)) < 1 && a.cd <= 0) {
    a.cd = 0.1;
    for (let k = 0; k < 2; k++) {
      const sp = ang + (Math.random() - 0.5) * 0.5;
      shot(g, a, sp, 14, a.dmg, { kind: 'flame', pierce: 4, burn: a.dmg * 1.6, size: 0.45, color: Math.random() < 0.5 ? '#ff6d00' : '#ffd740', maxLife: 0.8, z: a.z - 0.8 });
    }
    if (Math.random() < 0.15) g.hooks.sound('flame', a.x, a.y, 0.5);
  }
  a.cd2 -= dt;
  if (a.cd2 <= 0 && d < 20) {
    a.cd2 = 3;
    shot(g, a, ang, 16, a.dmg * 8, { kind: 'fireball', splash: 3, burn: a.dmg * 2, size: 0.6, color: '#ff3d00', maxLife: d / 16 + 0.1, z: a.z - 0.5 });
    g.hooks.sound('roar', a.x, a.y, 0.4);
  }
}

/** Returns true when the mine went off. */
function updateMine(g: Game, a: Ally, dt: number): boolean {
  if (a.cd > 0) {
    a.cd -= dt;
    return false;
  }
  for (const e of g.enemies) {
    if (e.hp <= 0 || e.burrowed || e.flying) continue;
    if (Math.hypot(e.x - a.x, e.y - a.y) < 1.6 + e.r) {
      explode(g, a.x, a.y, 3, a.dmg, 'player', { srcTank: g.player.id }, '#ffd740');
      return true;
    }
  }
  for (const t of g.tanks) {
    if (t.dead || t.team !== 'enemy' || t.edgeDist(a.x, a.y) > 1) continue;
    explode(g, a.x, a.y, 3, a.dmg, 'player', { srcTank: g.player.id }, '#ffd740');
    return true;
  }
  return false;
}
