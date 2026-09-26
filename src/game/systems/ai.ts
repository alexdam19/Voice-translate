import { losClear } from '../../shared/motion';
import { turnToward } from '../../shared/types';
import { eid, type Enemy, type Projectile } from '../entities';
import { ENEMIES } from '../enemyDefs';
import type { Game, Target } from '../game';
import type { Tank } from '../tank';
import { damageEnemy, damageFriendly, damageTank, explode } from './damage';
import { driveTank, moveSmall, planPath } from './movement';

function nearestFriendly(g: Game, e: Enemy, range: number): Target | null {
  let best: Target | null = null;
  let bd = range;
  for (const f of g.friendlies()) {
    const d = g.friendlyEdgeDist(f.id, e.x, e.y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

function shoot(g: Game, e: Enemy, tx: number, ty: number): void {
  const d = ENEMIES[e.kind];
  const sp = d.projSpeed ?? 20;
  const a = Math.atan2(ty - e.y, tx - e.x) + (Math.random() - 0.5) * 0.12;
  const dist = Math.hypot(tx - e.x, ty - e.y);
  const p: Projectile = {
    id: eid(), x: e.x, y: e.y, z: e.flying ? 1.6 : 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0, team: 'enemy',
    kind: d.proj ?? 'bullet', dmg: e.dmg, splash: d.splash ?? 0, pierce: 0, life: 0, maxLife: (e.range * 1.3) / sp, color: e.elite ? '#ff4081' : d.proj === 'plasma' ? '#80d8ff' : d.proj === 'spit' ? '#76ff03' : '#ff8a65',
    homing: d.proj === 'missile' ? 1.6 : 0, targetId: e.targetId, arc: d.proj === 'spit', tx, ty, burn: 0, crit: false, lifesteal: 0,
    srcTank: 0, hit: [], flyer: 0, interceptable: d.proj === 'missile' || d.proj === 'spit', hp: 1, size: 0.18,
  };
  if (p.arc) {
    const flight = Math.max(0.6, dist / sp);
    p.maxLife = flight;
    p.vx = (tx - e.x) / flight;
    p.vy = (ty - e.y) / flight;
    p.vz = (9.8 * flight) / 2;
  }
  g.projectiles.push(p);
  g.hooks.sound(d.proj === 'missile' ? 'rocket' : d.proj === 'plasma' ? 'laser' : 'enemyshot', e.x, e.y, 0.35);
}

function telegraph(g: Game, x: number, y: number, r: number, total: number, dmg: number, color = '#ff1744', shape: 'circle' | 'line' = 'circle', a = 0, len = 0, onDone?: () => void): void {
  g.telegraphs.push({ id: eid(), x, y, shape, r, a, len, t: 0, total, color, team: 'enemy', dmg, onDone });
}

export function updateTelegraphs(g: Game, dt: number): void {
  for (let i = g.telegraphs.length - 1; i >= 0; i--) {
    const t = g.telegraphs[i];
    if (g.timeStop > 0 && t.team === 'enemy') continue;
    t.t += dt;
    if (t.t < t.total) continue;
    g.telegraphs.splice(i, 1);
    if (t.onDone) t.onDone();
    else if (t.shape === 'circle') explode(g, t.x, t.y, t.r, t.dmg, t.team === 'enemy' ? 'enemy' : 'player', {}, t.color);
  }
}

/* ---------------------------------------------------------------------- */
/* Titans                                                                  */
/* ---------------------------------------------------------------------- */

const chargeHits = new Map<number, Set<number>>();

function titanAI(g: Game, e: Enemy, dt: number, tgt: Target | null): void {
  e.stateT -= dt;
  const player = g.player;
  if (!tgt) tgt = { id: player.id, x: player.x, y: player.y, r: player.stats.width / 2, flying: false };
  const dx = tgt.x - e.x, dy = tgt.y - e.y;
  const dist = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  e.face = dx >= 0 ? 1 : -1;
  if (e.kind === 'titan_worm') {
    if (e.state === 'idle') {
      e.state = 'burrow';
      e.stateT = 3;
    }
    if (e.state === 'burrow') {
      e.burrowed = true;
      const sp = e.speed * dt;
      if (dist > 1) {
        e.x += (dx / dist) * sp;
        e.y += (dy / dist) * sp;
      }
      if (e.stateT <= 0 && dist < 10) {
        e.state = 'rising';
        e.stateT = 1.5;
        const tx = tgt.x, ty = tgt.y;
        telegraph(g, tx, ty, 4.5, 1.4, e.dmg, '#ff9100', 'circle', 0, 0, () => {
          e.x = tx;
          e.y = ty;
          e.burrowed = false;
          e.state = 'surface';
          e.stateT = 6;
          explode(g, tx, ty, 4.5, e.dmg, 'enemy', {}, '#d7a860');
          g.fx.push({ t: 'shake', amt: 1 });
        });
      }
    } else if (e.state === 'rising') {
      // waiting for the telegraph
    } else if (e.state === 'surface') {
      e.burrowed = false;
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = 1.2;
        shootAt(g, e, tgt.x, tgt.y, 'spit', 12, e.dmg * 0.3, 2);
      }
      if (e.stateT <= 0) {
        e.state = 'burrow';
        e.stateT = 3 + Math.random() * 2;
        g.fx.push({ t: 'dust', x: e.x, y: e.y, color: '#c0a060' });
      }
    }
    // Segments trail behind the head.
    e.parts = [];
    if (!e.burrowed) {
      for (let k = 1; k <= 5; k++) e.parts.push({ x: e.x - Math.cos(e.anim * 0.2 + k * 0.2) * k * 1.6 * e.face, y: e.y + Math.sin(k * 0.9 + e.anim) * 0.8 + k * 1.2, r: e.r * (1 - k * 0.1) });
    }
    return;
  }
  if (e.kind === 'titan_beast') {
    if (e.state === 'charge') {
      const sp = 20 * dt;
      const cx = Math.cos(e.leash), cy = Math.sin(e.leash);
      const r = moveSmall(g, e.x, e.y, e.r * 0.6, cx * sp, cy * sp, false);
      e.x = r.x;
      e.y = r.y;
      for (const f of g.friendlies()) {
        if (g.friendlyEdgeDist(f.id, e.x, e.y) < e.r && !chargeHits.get(e.id)?.has(f.id)) {
          damageFriendly(g, f.id, e.dmg * 1.6);
          if (!chargeHits.has(e.id)) chargeHits.set(e.id, new Set());
          chargeHits.get(e.id)!.add(f.id);
          g.fx.push({ t: 'shake', amt: 0.9 });
          const t = g.tankById(f.id);
          if (t) {
            t.pushX += cx * 12;
            t.pushY += cy * 12;
          }
        }
      }
      if (e.stateT <= 0 || r.hit) {
        e.state = 'idle';
        e.stateT = 2.5;
        chargeHits.delete(e.id);
      }
      return;
    }
    if (e.state === 'windup') {
      if (e.stateT <= 0) {
        e.state = 'charge';
        e.stateT = 1.2;
      }
      return;
    }
    if (e.stateT <= 0 && dist < 26 && dist > 6) {
      e.state = 'windup';
      e.stateT = 1;
      e.leash = ang;
      telegraph(g, e.x, e.y, 2.8, 1, 0, '#ff3d00', 'line', ang, 24, () => {});
      return;
    }
  }
  if (e.kind === 'titan_walker' && e.stateT <= 0) {
    if (dist < 7) {
      e.stateT = 3;
      telegraph(g, e.x, e.y, 6, 1.3, e.dmg, '#ff1744');
    } else if (dist < 32) {
      e.stateT = 2.4;
      const tx = tgt.x + (Math.random() - 0.5) * 3, ty = tgt.y + (Math.random() - 0.5) * 3;
      telegraph(g, tx, ty, 3.2, 1.8, e.dmg * 0.8, '#ff6d00');
      g.fx.push({ t: 'muzzle', x: e.x, y: e.y, a: ang, color: '#8d6e63', size: 2 });
    }
  }
  // Default: stride toward the target, stepping over terrain.
  const want = e.kind === 'titan_beast' ? 5 : 4;
  if (dist > want) {
    const sp = e.speed * dt * slowMul(e);
    e.x += (dx / dist) * sp;
    e.y += (dy / dist) * sp;
  }
  e.atkCd -= dt;
  if (dist < e.r + tgt.r + 1 && e.atkCd <= 0) {
    e.atkCd = 1.6;
    damageFriendly(g, tgt.id, e.dmg * 0.6);
    g.fx.push({ t: 'shake', amt: 0.5 });
  }
}

/** Movement multiplier from slows (cryo, chrono fields). */
export function slowMul(e: Enemy): number {
  return e.slow > 0 ? 1 - Math.min(0.85, e.slowAmt || 0.4) : 1;
}

function shootAt(g: Game, e: Enemy, tx: number, ty: number, kind: 'spit' | 'bullet', sp: number, dmg: number, splash: number): void {
  const dist = Math.hypot(tx - e.x, ty - e.y);
  const flight = Math.max(0.6, dist / sp);
  g.projectiles.push({
    id: eid(), x: e.x, y: e.y, z: 2, vx: (tx - e.x) / flight, vy: (ty - e.y) / flight, vz: (9.8 * flight) / 2, team: 'enemy', kind,
    dmg, splash, pierce: 0, life: 0, maxLife: flight, color: '#c6ff00', homing: 0, targetId: 0, arc: true, tx, ty, burn: 0, crit: false,
    lifesteal: 0, srcTank: 0, hit: [], flyer: 0, interceptable: true, hp: 1, size: 0.4,
  });
}

/* ---------------------------------------------------------------------- */
/* Creatures                                                               */
/* ---------------------------------------------------------------------- */

export function updateEnemies(g: Game, dt: number): void {
  const list = g.enemies;
  for (const e of list) {
    if (e.hp <= 0) continue;
    e.anim += dt * (2 + e.speed);
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.burn > 0) {
      e.burn -= dt;
      damageEnemy(g, e, e.burnDps * dt, { silent: true });
      if (Math.random() < dt * 6) g.fx.push({ t: 'spark', x: e.x, y: e.y, color: '#ff6d00', n: 1 });
      if (e.hp <= 0) continue;
    }
    if (e.stun > 0) {
      e.stun -= dt;
      continue;
    }
    e.slow = Math.max(0, e.slow - dt);
    if (e.slow <= 0) e.slowAmt = 0;
    // Knockback decay.
    const kb = Math.hypot(e.vx, e.vy);
    const aggroR = e.camp ? 12 : 17 + e.threat * 1.5;
    let tgt = nearestFriendly(g, e, e.aggro ? aggroR * 2.2 : aggroR);
    if (e.camp) {
      const home = Math.hypot(e.x - e.homeX, e.y - e.homeY);
      if (home > 22) {
        tgt = null;
        e.aggro = false;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
      }
    }
    if (tgt) e.aggro = true;
    e.targetId = tgt?.id ?? 0;
    if (e.titan) {
      titanAI(g, e, dt, tgt);
      continue;
    }
    let mx = 0, my = 0;
    const d = ENEMIES[e.kind];
    if (tgt) {
      const edge = g.friendlyEdgeDist(tgt.id, e.x, e.y);
      const dx = tgt.x - e.x, dy = tgt.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.face = dx >= 0 ? 1 : -1;
      const ranged = !!d.proj;
      if (e.kind === 'stalker') {
        // Burrow, close in, then lunge.
        e.stateT -= dt;
        if (e.state !== 'lunge' && edge > 6) {
          e.burrowed = true;
          mx = dx / len;
          my = dy / len;
        } else if (e.state !== 'lunge' && e.stateT <= 0) {
          e.burrowed = false;
          e.state = 'lunge';
          e.stateT = 0.6;
          e.vx = (dx / len) * 16;
          e.vy = (dy / len) * 16;
        } else if (e.state === 'lunge' && e.stateT <= 0) {
          e.state = 'idle';
          e.stateT = 1.8;
        } else if (e.state !== 'lunge') {
          e.burrowed = false;
          mx = dx / len;
          my = dy / len;
        }
      } else if (ranged && edge < e.range * 0.75) {
        // Kite: strafe around at range.
        const side = (e.id % 2 ? 1 : -1) * 0.8;
        mx = (-dy / len) * side - (dx / len) * 0.3;
        my = (dx / len) * side - (dy / len) * 0.3;
      } else {
        mx = dx / len;
        my = dy / len;
      }
      e.atkCd -= dt;
      if (e.atkCd <= 0 && edge <= e.range + 0.2 && !e.burrowed) {
        e.atkCd = 1 / e.atkRate;
        if (ranged) {
          if (e.flying || losClear(g.map, e.x, e.y, tgt.x, tgt.y)) shoot(g, e, tgt.x, tgt.y);
          else e.atkCd = 0.3;
        } else if (e.kind === 'bomber') {
          explode(g, e.x, e.y, d.splash ?? 2, e.dmg, 'enemy', {}, '#ff5252');
          e.hp = 0;
          continue;
        } else if (e.kind === 'guardian' || e.kind === 'brute') {
          telegraph(g, e.x + (dx / len) * 1.2, e.y + (dy / len) * 1.2, e.kind === 'guardian' ? 3 : 2.2, 0.7, e.dmg, '#ff1744');
        } else {
          damageFriendly(g, tgt.id, e.dmg);
          g.fx.push({ t: 'spark', x: e.x + dx / len * e.r, y: e.y + dy / len * e.r, color: '#ffab40', n: 3 });
          g.hooks.sound('bite', e.x, e.y, 0.3);
        }
      }
    } else {
      // Wander near home.
      e.stateT -= dt;
      if (e.stateT <= 0) {
        e.stateT = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        e.vx += Math.cos(a) * 0.1;
        e.vy += Math.sin(a) * 0.1;
        e.state = Math.random() < 0.5 ? 'idle' : 'wander';
        e.face = Math.cos(a) >= 0 ? 1 : -1;
        e.leash = a;
      }
      if (e.state === 'wander') {
        const hx = e.homeX - e.x, hy = e.homeY - e.y;
        const hd = Math.hypot(hx, hy);
        if (hd > 8) {
          mx = hx / hd * 0.5;
          my = hy / hd * 0.5;
        } else {
          mx = Math.cos(e.leash) * 0.35;
          my = Math.sin(e.leash) * 0.35;
        }
      }
    }
    // Separation.
    for (const o of list) {
      if (o === e || o.hp <= 0 || o.titan) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      const rr = e.r + o.r;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const dd = Math.hypot(dx, dy);
      if (dd < rr && dd > 1e-4) {
        mx += (dx / dd) * 0.6;
        my += (dy / dd) * 0.6;
      }
    }
    const sp = e.speed * slowMul(e) * (e.burrowed ? 1.3 : 1);
    const mlen = Math.hypot(mx, my);
    if (mlen > 1) {
      mx /= mlen;
      my /= mlen;
    }
    const r = moveSmall(g, e.x, e.y, e.r, (mx * sp + e.vx) * dt, (my * sp + e.vy) * dt, e.flying);
    e.x = r.x;
    e.y = r.y;
    const decay = Math.pow(0.05, dt);
    e.vx *= decay;
    e.vy *= decay;
    if (kb < 0.01) {
      e.vx = 0;
      e.vy = 0;
    }
    // Pushed out of (and crushed by) tanks.
    if (!e.flying && !e.burrowed) crushAndPush(g, e, dt);
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].hp <= 0) list.splice(i, 1);
}

function crushAndPush(g: Game, e: Enemy, dt: number): void {
  const tanks: Tank[] = [g.player, ...(g.outrider ? [g.outrider] : []), ...g.tanks];
  for (const t of tanks) {
    if (t.dead) continue;
    const l = t.toLocal(e.x, e.y);
    const hl = t.stats.length / 2 + e.r, hw = t.stats.width / 2 + e.r;
    if (Math.abs(l.lx) >= hl || Math.abs(l.lz) >= hw) continue;
    // Push out along the shallowest axis.
    const px = hl - Math.abs(l.lx), pz = hw - Math.abs(l.lz);
    let nlx = l.lx, nlz = l.lz;
    if (px < pz) nlx = Math.sign(l.lx || 1) * hl;
    else nlz = Math.sign(l.lz || 1) * hw;
    const p = t.toWorld(nlx, nlz);
    e.x = p.x;
    e.y = p.y;
    if (t.team === 'player' && Math.abs(t.speed) > 1.5 && !e.titan) {
      const nitro = t.hasBuff('nitro') ? 3 : 1;
      damageEnemy(g, e, Math.abs(t.speed) * 7 * t.stats.crush * nitro * dt * 4, { silent: true, srcTank: t.id });
      if (Math.random() < dt * 5) g.fx.push({ t: 'spark', x: e.x, y: e.y, color: '#ffab40', n: 2 });
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Enemy tanks                                                             */
/* ---------------------------------------------------------------------- */

export function updateEnemyTank(g: Game, t: Tank, dt: number): void {
  if (t.dead) return;
  t.hitFlash = Math.max(0, t.hitFlash - dt);
  const burn = t.buff('burn');
  if (burn) damageTank(g, t, burn.v * dt, { silent: true });
  if (t.anchored) return;
  const p = g.player;
  const d = Math.hypot(p.x - t.x, p.y - t.y);
  const aggro = d < 42 || t.lastHitAt > g.time - 8;
  const ai = (t as Tank & { ai?: { repath: number; orbit: number } }).ai ??= { repath: 0, orbit: Math.random() < 0.5 ? 1 : -1 };
  ai.repath -= dt;
  if (aggro && !p.dead) {
    const range = Math.max(8, ...t.weapons().map((m) => m.stats?.range ?? 0)) * 0.7;
    if (ai.repath <= 0) {
      ai.repath = 1.2;
      const a = Math.atan2(t.y - p.y, t.x - p.x) + ai.orbit * 0.5;
      const want = Math.max(range, p.stats.length / 2 + t.stats.length / 2 + 3);
      planPath(g, t, p.x + Math.cos(a) * want, p.y + Math.sin(a) * want);
    }
  } else if (ai.repath <= 0) {
    ai.repath = 6 + Math.random() * 6;
    const a = Math.random() * Math.PI * 2;
    planPath(g, t, t.x + Math.cos(a) * 20, t.y + Math.sin(a) * 20);
  }
  driveTank(g, t, dt, t.hasBuff('stun') ? 0 : 1 - (t.buff('chill')?.v ?? 0));
  // Face roughly toward the player when parked so front guns engage.
  if (!t.path.length && aggro) t.rot = turnToward(t.rot, Math.atan2(p.y - t.y, p.x - t.x), t.stats.turnRate * dt * 0.5);
}
