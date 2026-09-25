import { losClear } from '../../shared/motion';
import { turnToward, wrapAngle } from '../../shared/types';
import { WEAPONS, type WeaponDef, type WeaponStats } from '../../shared/weapons';
import { eid, type Projectile } from '../entities';
import type { Game, Target } from '../game';
import type { ModuleInst, Tank } from '../tank';
import { damageEnemy, damageFriendly, damageTank, type HitOpts } from './damage';

const HEIGHT = 1.2;

/** Candidate targets for a side, within range of a point. */
function targetsFor(g: Game, team: 'player' | 'enemy'): Target[] {
  if (team === 'enemy') return g.friendlies();
  const out: Target[] = [];
  for (const e of g.enemies) if (e.hp > 0 && !e.burrowed && (g.mode === 'raid' || g.isVisible(e.x, e.y) || e.aggro)) out.push({ id: e.id, x: e.x, y: e.y, r: e.r, flying: e.flying });
  for (const t of g.tanks) if (!t.dead) out.push({ id: t.id, x: t.x, y: t.y, r: Math.min(t.stats.width, t.stats.length) / 2, flying: false });
  return out;
}

function lookup(g: Game, team: 'player' | 'enemy', id: number): Target | null {
  return team === 'player' ? g.hostileTarget(id) : g.friendlyTarget(id);
}

/** Effective fire-rate multiplier from buffs and power. */
function rateMult(g: Game, t: Tank): number {
  let m = 0.35 + 0.65 * t.stats.powerRatio;
  const b = t.buff('barrage');
  if (b) m *= 1 + b.v;
  const mm = t.buff('meltdown');
  if (mm) m *= 1 + mm.v;
  if (t.hasBuff('stun')) m = 0;
  return m;
}

export function updateTankWeapons(g: Game, t: Tank, dt: number): void {
  if (t.dead) return;
  const team = t.team;
  const cands = targetsFor(g, team);
  const rm = rateMult(g, t);
  for (const m of t.modules) {
    if (!m.weapon || !m.stats) continue;
    const d = WEAPONS[m.weapon.key];
    const s = m.stats;
    m.cd -= dt * rm;
    m.recoil = Math.max(0, m.recoil - dt * 4);
    const pos = t.moduleWorld(m);
    const manual = team === 'player' && t === g.player && (!g.autoFire || m.mode === 'manual');
    let aimX: number, aimY: number;
    let target: Target | null = null;
    if (manual) {
      aimX = g.aim.x;
      aimY = g.aim.y;
    } else {
      target = pickTarget(g, t, m, d, s, pos.x, pos.y, cands, dt);
      if (!target) {
        // Rest facing forward.
        m.aim = turnToward(m.aim, t.rot, s.turn * dt * 0.5);
        continue;
      }
      // Lead moving targets a little.
      aimX = target.x;
      aimY = target.y;
      if (s.speed > 0) {
        const e = g.enemyById(target.id);
        if (e) {
          const tt = Math.hypot(e.x - pos.x, e.y - pos.y) / s.speed;
          aimX += e.vx * tt * 0.7;
          aimY += e.vy * tt * 0.7;
        }
      }
    }
    const want = Math.atan2(aimY - pos.y, aimX - pos.x);
    m.aim = turnToward(m.aim, want, s.turn * dt);
    const dist = Math.hypot(aimX - pos.x, aimY - pos.y);
    const aligned = Math.abs(wrapAngle(want - m.aim)) < (d.arc || d.homing > 0 || s.speed === 0 ? 0.3 : 0.14);
    if (m.cd > 0 || !aligned) continue;
    if (manual && !g.fireHeld) continue;
    if (!manual && (dist > s.range + (target?.r ?? 0) || dist < s.minRange)) continue;
    if (manual && dist < s.minRange) continue;
    m.cd = 1 / s.rate;
    m.recoil = 1;
    fire(g, t, m, d, s, pos.x, pos.y, Math.min(dist, s.range), target);
  }
}

function pickTarget(g: Game, t: Tank, m: ModuleInst, d: WeaponDef, s: WeaponStats, x: number, y: number, cands: Target[], dt: number): Target | null {
  // Point defense prefers incoming missiles and shells.
  if (d.pd) {
    let best: Projectile | null = null;
    let bd = s.range;
    for (const p of g.projectiles) {
      if (p.team === t.team || !p.interceptable) continue;
      const dd = Math.hypot(p.x - x, p.y - y);
      if (dd < bd) {
        bd = dd;
        best = p;
      }
    }
    if (best) return { id: best.id, x: best.x, y: best.y, r: 0.3, flying: true };
  }
  // Focus target first.
  if (t.focusId) {
    const f = lookup(g, t.team, t.focusId);
    if (f && Math.hypot(f.x - x, f.y - y) <= s.range + f.r) return f;
  }
  // Keep the current target while valid.
  m.burst -= dt;
  if (m.targetId && m.burst > 0) {
    const cur = lookup(g, t.team, m.targetId);
    if (cur && Math.hypot(cur.x - x, cur.y - y) <= s.range + cur.r) return cur;
  }
  m.burst = 0.4;
  let best: Target | null = null;
  let bestScore = Infinity;
  for (const c of cands) {
    const dd = Math.hypot(c.x - x, c.y - y);
    if (dd > s.range + c.r || dd < s.minRange) continue;
    if (!d.arc && dd > 3 && !losClear(g.map, x, y, c.x, c.y)) continue;
    // Flak loves flyers; everything prefers the closest.
    const score = dd - (d.kind === 'flak' && c.flying ? 6 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  m.targetId = best?.id ?? 0;
  return best;
}

function critRoll(g: Game, t: Tank, s: WeaponStats): boolean {
  if (t.hasBuff('deadeye')) return true;
  return Math.random() < s.crit;
}

export function fire(g: Game, t: Tank, m: ModuleInst, d: WeaponDef, s: WeaponStats, x: number, y: number, dist: number, target: Target | null): void {
  const a = m.aim;
  const mx = x + Math.cos(a) * 0.7, my = y + Math.sin(a) * 0.7;
  const extraPierce = t.hasBuff('deadeye') ? 1 : 0;
  const crimson = t === g.player && g.runeBuff?.rune === 'crimson';
  const burn = s.burn + (crimson ? s.dmg * 0.15 : 0);
  g.hooks.sound(d.sound, x, y, d.size === 'heavy' ? 1 : d.size === 'medium' ? 0.7 : 0.45);
  if (t === g.player) g.onFire?.(d.kind, mx, my, a, d.color, s.speed, Math.min(dist, s.range), s.pellets);
  const wkey = m.weapon!.key, wr = m.weapon!.rarity;
  g.fx.push({ t: 'muzzle', x: mx, y: my, a, color: d.color, size: d.size === 'heavy' ? 1.6 : d.size === 'medium' ? 1.1 : 0.7 });
  if (d.size === 'heavy' && t.team === 'player' && t === g.player) g.fx.push({ t: 'shake', amt: 0.15 });
  if (s.speed === 0) {
    hitscan(g, t, d, s, mx, my, a, burn, extraPierce, target, wkey, wr);
    return;
  }
  for (let i = 0; i < s.pellets; i++) {
    const spread = (Math.random() - 0.5) * 2 * s.spread;
    const ang = a + spread;
    const crit = critRoll(g, t, s);
    const dmg = s.dmg * (crit ? 2 : 1);
    const p: Projectile = {
      id: eid(), x: mx, y: my, z: HEIGHT, vx: Math.cos(ang) * s.speed, vy: Math.sin(ang) * s.speed, vz: 0,
      team: t.team, kind: d.kind, dmg, splash: s.splash, pierce: s.pierce + extraPierce, life: 0, maxLife: (s.range * 1.15) / s.speed,
      color: d.color, homing: s.homing, targetId: target?.id ?? 0, arc: d.arc, tx: 0, ty: 0, burn, crit, lifesteal: s.lifesteal,
      srcTank: t.id, hit: [], flyer: 0, interceptable: d.kind === 'shell' || d.kind === 'missile' || d.kind === 'mortar', hp: 1,
      size: d.size === 'heavy' ? 0.35 : d.size === 'medium' ? 0.25 : 0.16, wkey, wr,
    };
    if (d.arc) {
      const land = Math.min(dist, s.range);
      const jitter = s.spread * land;
      p.tx = mx + Math.cos(ang) * land + (Math.random() - 0.5) * jitter;
      p.ty = my + Math.sin(ang) * land + (Math.random() - 0.5) * jitter;
      const flight = Math.max(0.5, land / s.speed);
      p.maxLife = flight;
      p.vx = (p.tx - mx) / flight;
      p.vy = (p.ty - my) / flight;
      p.vz = (9.8 * flight) / 2;
      p.z = 1.2;
    }
    if (d.homing > 0 && s.pellets > 1) {
      // Volleys fan out and curve in.
      const fan = (i / Math.max(1, s.pellets - 1) - 0.5) * 1.6;
      p.vx = Math.cos(a + fan) * s.speed * 0.6;
      p.vy = Math.sin(a + fan) * s.speed * 0.6;
    }
    g.projectiles.push(p);
  }
}

interface RayHit {
  id: number;
  t: number;
  kind: 'enemy' | 'tank' | 'friendly';
}

function rayHits(g: Game, team: 'player' | 'enemy', x: number, y: number, dx: number, dy: number, len: number): RayHit[] {
  const out: RayHit[] = [];
  const test = (id: number, cx: number, cy: number, r: number, kind: RayHit['kind']): void => {
    const px = cx - x, py = cy - y;
    const tproj = px * dx + py * dy;
    if (tproj < -r || tproj > len + r) return;
    const perp = Math.abs(px * dy - py * dx);
    if (perp <= r) out.push({ id, t: tproj, kind });
  };
  if (team === 'player') {
    for (const e of g.enemies) if (e.hp > 0 && !e.burrowed) test(e.id, e.x, e.y, e.r + 0.15, 'enemy');
    for (const t of g.tanks) if (!t.dead) test(t.id, t.x, t.y, Math.min(t.stats.width, t.stats.length) / 2, 'tank');
  } else {
    for (const f of g.friendlies()) test(f.id, f.x, f.y, f.r, 'friendly');
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Distance along a ray until it hits an obstacle. */
function wallDist(g: Game, x: number, y: number, dx: number, dy: number, len: number): number {
  for (let s = 0.5; s < len; s += 0.4) {
    if (g.map.solid(Math.floor(x + dx * s), Math.floor(y + dy * s))) return s;
  }
  return len;
}

function applyHit(g: Game, team: 'player' | 'enemy', h: { id: number; kind: RayHit['kind'] }, dmg: number, o: HitOpts): void {
  if (h.kind === 'enemy') {
    const e = g.enemyById(h.id);
    if (e) damageEnemy(g, e, dmg, o);
  } else if (h.kind === 'tank') {
    const t = g.tankById(h.id);
    if (t) damageTank(g, t, dmg, o);
  } else if (team === 'enemy') damageFriendly(g, h.id, dmg, o);
}

function hitscan(g: Game, t: Tank, d: WeaponDef, s: WeaponStats, x: number, y: number, a: number, burn: number, extraPierce: number, target: Target | null, wkey: string, wr: number): void {
  const dx = Math.cos(a), dy = Math.sin(a);
  if (d.kind === 'tesla') {
    const pts = [{ x, y }];
    const hitIds = new Set<number>();
    let cur: Target | null = target;
    if (!cur) {
      const hits = rayHits(g, t.team, x, y, dx, dy, s.range);
      if (hits.length) cur = lookup(g, t.team, hits[0].id);
    }
    const cands = targetsFor(g, t.team);
    let jumps = 0;
    while (cur && jumps <= s.chain) {
      hitIds.add(cur.id);
      pts.push({ x: cur.x, y: cur.y });
      const crit = critRoll(g, t, s);
      const kind: RayHit['kind'] = t.team === 'enemy' ? 'friendly' : g.enemyById(cur.id) ? 'enemy' : 'tank';
      applyHit(g, t.team, { id: cur.id, kind }, s.dmg * (crit ? 2 : 1) * (1 - jumps * 0.08), { crit, srcTank: t.id, lifesteal: s.lifesteal, burn: burn || undefined, wkey, wr });
      let next: Target | null = null;
      let bd = 6;
      for (const c of cands) {
        if (hitIds.has(c.id)) continue;
        const dd = Math.hypot(c.x - cur.x, c.y - cur.y);
        if (dd < bd) {
          bd = dd;
          next = c;
        }
      }
      cur = next;
      jumps++;
    }
    if (pts.length === 1) pts.push({ x: x + dx * s.range * 0.6, y: y + dy * s.range * 0.6 });
    g.fx.push({ t: 'bolt', pts, color: d.color });
    return;
  }
  const len = d.kind === 'rail' || d.kind === 'beam' ? s.range : wallDist(g, x, y, dx, dy, s.range);
  const hits = rayHits(g, t.team, x, y, dx, dy, len);
  const maxHits = 1 + s.pierce + extraPierce;
  let endT = len;
  let n = 0;
  for (const h of hits) {
    if (n >= maxHits) break;
    const crit = critRoll(g, t, s);
    applyHit(g, t.team, h, s.dmg * (crit ? 2 : 1), { crit, srcTank: t.id, lifesteal: s.lifesteal, burn: burn || undefined, knock: d.kind === 'rail' ? 4 : 0, kx: dx, ky: dy, wkey, wr });
    n++;
    if (n >= maxHits) endT = Math.max(0.5, h.t);
  }
  const w = d.kind === 'rail' ? 0.35 : d.kind === 'beam' ? 0.28 : 0.12;
  g.fx.push({ t: 'beam', x0: x, y0: y, x1: x + dx * endT, y1: y + dy * endT, color: d.color, w, life: d.kind === 'rail' ? 0.35 : d.kind === 'beam' ? 0.09 : 0.12 });
}
