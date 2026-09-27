import { eid, type Projectile, type ZoneKind } from '../entities';
import type { Game } from '../game';
import { damageEnemy, damageFriendly, damageTank, explode } from './damage';

const GRAV = 9.8;

const POOL_COLOR: Record<string, string> = { acid: '#76ff03', fire: '#ff6d00', chrono: '#18ffff', rad: '#c6ff00', frost: '#80deea' };

function detonate(g: Game, p: Projectile): void {
  const fx = p.fx;
  const o = { srcTank: p.srcTank, burn: p.burn || undefined, crit: p.crit, lifesteal: p.lifesteal, wkey: p.wkey, wr: p.wr, fx, acid: p.kind === 'acid' };
  if (p.splash > 0) {
    explode(g, p.x, p.y, p.splash, p.dmg, p.team, o, p.kind === 'spit' ? '#76ff03' : p.color, p.kind === 'fireball' || p.kind === 'grenade');
    if (p.kind === 'spit') g.zones.push({ id: p.id, x: p.x, y: p.y, r: p.splash, t: 4, kind: 'acid', dps: p.dmg * 0.25, team: 'enemy' });
    if (p.burn > 20 && p.kind === 'mortar' && !fx?.pool) g.zones.push({ id: p.id, x: p.x, y: p.y, r: p.splash * 0.8, t: 4, kind: 'fire', dps: p.burn, team: p.team });
  } else {
    g.fx.push({ t: 'spark', x: p.x, y: p.y, color: p.color, n: 3 });
  }
  if (!fx) return;
  const base = fx.base;
  if (fx.pool) {
    const kind: ZoneKind = fx.pool;
    const r = Math.max(1.4, p.splash) * (kind === 'chrono' ? 1.3 : 1);
    const dps = kind === 'fire' ? Math.max(p.burn, base * 0.25) : kind === 'acid' ? base * 0.45 : kind === 'chrono' ? base * 0.08 : base * 0.3;
    g.zones.push({ id: eid(), x: p.x, y: p.y, r, t: kind === 'chrono' ? 4 : 4.5, kind, dps, team: p.team });
    g.fx.push({ t: 'ring', x: p.x, y: p.y, r, color: POOL_COLOR[kind] ?? p.color });
  }
  if (fx.pull) g.zones.push({ id: eid(), x: p.x, y: p.y, r: Math.max(2.5, p.splash), t: 2.5, kind: 'well', dps: base * 0.12, team: p.team });
  if (fx.specials.includes('napalm') && p.splash > 0) g.zones.push({ id: eid(), x: p.x, y: p.y, r: p.splash * 0.8, t: 3.5, kind: 'fire', dps: Math.max(8, base * 0.3), team: p.team });
  if (fx.specials.includes('cluster')) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * Math.max(1.5, p.splash);
      const bx = p.x + Math.cos(a) * d, by = p.y + Math.sin(a) * d;
      g.telegraphs.push({ id: eid(), x: bx, y: by, shape: 'circle', r: 1.2, a: 0, len: 0, t: 0, total: 0.25 + i * 0.08, color: '#ffab40', team: p.team, dmg: 0,
        onDone: () => explode(g, bx, by, 1.4, base * 0.35, p.team, { srcTank: p.srcTank, wkey: p.wkey, wr: p.wr }, '#ffab40', true) });
    }
  }
  if (fx.split > 0) {
    // Fragments burst outward (the phoenix's fireballs, the howitzer's bomblets).
    for (let i = 0; i < fx.split; i++) {
      const a = (i / fx.split) * Math.PI * 2 + Math.random() * 0.3;
      g.projectiles.push({
        id: eid(), x: p.x, y: p.y, z: 1, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, vz: 0, team: p.team, kind: 'fireball', dmg: base * 0.3, splash: 1.3,
        pierce: 0, life: 0, maxLife: 0.45 + Math.random() * 0.2, color: p.kind === 'phoenix' ? '#ff9100' : '#ffcc80', homing: 0, targetId: 0, arc: false, tx: 0, ty: 0,
        burn: p.burn * 0.5, crit: false, lifesteal: p.lifesteal, srcTank: p.srcTank, hit: [], flyer: 0, interceptable: false, hp: 1, size: 0.28, wkey: p.wkey, wr: p.wr,
      });
    }
  }
  if (p.kind === 'ink') g.fx.push({ t: 'ring', x: p.x, y: p.y, r: p.splash, color: '#7c4dff' });
}

/** Projectiles that burst when they run out of range. */
const EXPIRE_BURST = new Set(['shell', 'missile', 'spit', 'plasma', 'gravity', 'chrono', 'fireball', 'phoenix', 'cryo']);

/** Returns true if the projectile is used up. */
function hitSomething(g: Game, p: Projectile): boolean {
  if (p.visual) return false;
  const opts = { crit: p.crit, burn: p.burn || undefined, srcTank: p.srcTank, lifesteal: p.lifesteal, knock: p.kind === 'shell' ? 3 : p.fx?.knock || 0.5, kx: 0, ky: 0, wkey: p.wkey, wr: p.wr, fx: p.fx };
  const sp = Math.hypot(p.vx, p.vy) || 1;
  opts.kx = p.vx / sp;
  opts.ky = p.vy / sp;
  if (p.team === 'player') {
    for (const e of g.enemiesNear(p.x, p.y, p.size + 2)) {
      if (e.hp <= 0 || e.burrowed || p.hit.includes(e.id)) continue;
      const rr = e.r + p.size;
      if (Math.abs(e.x - p.x) > rr + 3 || Math.abs(e.y - p.y) > rr + 3) continue;
      let hit = (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= rr * rr;
      if (!hit) for (const part of e.parts) if ((part.x - p.x) ** 2 + (part.y - p.y) ** 2 <= (part.r + p.size) ** 2) hit = true;
      if (!hit) continue;
      if (p.splash > 0) return true;
      const dmg = p.dmg * (p.kind === 'flak' && e.flying ? 2 : 1);
      damageEnemy(g, e, dmg, opts);
      p.hit.push(e.id);
      g.fx.push({ t: 'spark', x: p.x, y: p.y, color: p.color, n: 2 });
      if (p.hit.length > p.pierce) return true;
    }
    for (const t of g.tanks) {
      if (t.dead || p.hit.includes(t.id) || !t.hits(p.x, p.y, p.size)) continue;
      if (p.splash > 0) return true;
      damageTank(g, t, p.dmg, opts);
      p.hit.push(t.id);
      g.fx.push({ t: 'spark', x: p.x, y: p.y, color: '#ffe082', n: 3 });
      if (p.hit.length > p.pierce) return true;
    }
  } else {
    const tanks = [g.player, g.outrider].filter((t) => t && !t.dead);
    for (const t of tanks) {
      if (!t || !t.hits(p.x, p.y, p.size)) continue;
      if (p.splash > 0) return true;
      damageTank(g, t, p.dmg, opts);
      g.fx.push({ t: 'spark', x: p.x, y: p.y, color: '#ffab40', n: 3 });
      return true;
    }
    for (const a of g.allies) {
      if (a.kind === 'jet' || a.kind === 'dragon' || a.kind === 'mine') continue;
      const ar = a.kind === 'mech' ? 1.2 : 0.4;
      if ((a.x - p.x) ** 2 + (a.y - p.y) ** 2 > ar * ar) continue;
      if (p.splash > 0) return true;
      damageFriendly(g, a.id, p.dmg);
      return true;
    }
  }
  return false;
}

export function updateProjectiles(g: Game, dt: number): void {
  const list = g.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    // Time Stop: enemy shots hang frozen in the air.
    if (g.timeStop > 0 && p.team === 'enemy') continue;
    p.life += dt;
    let dead = false;
    if (p.arc) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= GRAV * dt;
      p.z += p.vz * dt;
      if (p.life >= p.maxLife || p.hp <= 0) {
        p.x = p.tx;
        p.y = p.ty;
        if (p.visual) g.fx.push({ t: 'boom', x: p.x, y: p.y, r: Math.max(1, p.splash), color: p.color });
        else if (p.hp > 0) detonate(g, p);
        dead = true;
      }
    } else {
      if (p.vz) p.z = Math.max(0.35, p.z + p.vz * dt);
      if (p.homing > 0) {
        const tgt = p.team === 'player' ? g.hostileTarget(p.targetId) : g.friendlyTarget(p.targetId);
        if (tgt) {
          const sp = Math.hypot(p.vx, p.vy);
          const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          let cur = Math.atan2(p.vy, p.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          cur += Math.max(-p.homing * dt, Math.min(p.homing * dt, diff));
          const nsp = Math.min(sp * (1 + dt * 1.5), 30);
          p.vx = Math.cos(cur) * nsp;
          p.vy = Math.sin(cur) * nsp;
        }
        if (Math.random() < 0.6) g.fx.push({ t: 'dust', x: p.x, y: p.y, color: '#bdbdbd' });
      }
      const sp = Math.hypot(p.vx, p.vy);
      const steps = Math.max(1, Math.ceil((sp * dt) / 0.3));
      for (let s = 0; s < steps && !dead; s++) {
        p.x += (p.vx * dt) / steps;
        p.y += (p.vy * dt) / steps;
        if (g.map.solid(Math.floor(p.x), Math.floor(p.y))) {
          if (p.visual) g.fx.push({ t: 'spark', x: p.x, y: p.y, color: p.color, n: 2 });
          else detonate(g, p);
          dead = true;
          break;
        }
        if (hitSomething(g, p)) {
          detonate(g, p);
          dead = true;
        }
      }
      if (!dead && (p.life >= p.maxLife || p.hp <= 0)) {
        if (p.hp > 0 && !p.visual && (EXPIRE_BURST.has(p.kind) || (p.fx?.split ?? 0) > 0)) detonate(g, p);
        dead = true;
      }
    }
    if (dead) list.splice(i, 1);
  }
  // Point defense kills: projectiles targeted by PD rounds.
  for (const p of list) {
    if (p.kind !== 'pd' || p.hp <= 0) continue;
    for (const q of list) {
      if (q.team === p.team || !q.interceptable || q.hp <= 0) continue;
      if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 0.6 * 0.6) {
        q.hp = 0;
        p.hp = 0;
        g.fx.push({ t: 'spark', x: q.x, y: q.y, color: '#80d8ff', n: 6 });
        break;
      }
    }
  }
}
