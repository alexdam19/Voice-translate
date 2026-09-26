import { losClear } from '../../shared/motion';
import { turnToward, wrapAngle } from '../../shared/types';
import { WEAPONS, type WeaponDef, type WeaponStats } from '../../shared/weapons';
import { eid, type Projectile, type ShotFx } from '../entities';
import type { Game, Target } from '../game';
import type { ModuleInst, Tank } from '../tank';
import { spawnJet } from './allies';
import { damageEnemy, damageFriendly, damageTank, explode, type HitOpts } from './damage';

const HEIGHT = 1.2;

/** Candidate targets for a side, within range of a point. */
export function targetsFor(g: Game, team: 'player' | 'enemy'): Target[] {
  if (team === 'enemy') return g.friendlies();
  const out: Target[] = [];
  for (const e of g.enemies) if (e.hp > 0 && !e.burrowed && (g.mode === 'raid' || g.isVisible(e.x, e.y) || e.aggro)) out.push({ id: e.id, x: e.x, y: e.y, r: e.r, flying: e.flying });
  for (const t of g.tanks) if (!t.dead) out.push({ id: t.id, x: t.x, y: t.y, r: Math.min(t.stats.width, t.stats.length) / 2, flying: false });
  return out;
}

function lookup(g: Game, team: 'player' | 'enemy', id: number): Target | null {
  return team === 'player' ? g.hostileTarget(id) : g.friendlyTarget(id);
}

/** Soul Harvest (card) and Vampire Fang (relic) lifesteal. */
const soul = (t: Tank): number => (t.buff('soul')?.v ?? 0) + (t.kind === 'main' ? t.crew.lifesteal : 0);

/** Effective fire-rate multiplier from buffs and power. */
function rateMult(g: Game, t: Tank): number {
  let m = 0.35 + 0.65 * t.stats.powerRatio;
  const b = t.buff('barrage');
  if (b) m *= 1 + b.v;
  const mm = t.buff('meltdown');
  if (mm) m *= 1 + mm.v;
  if (t.team === 'player' && g.timeStop > 0) m *= 1.5;
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
    m.cd2 -= dt * rm;
    m.recoil = Math.max(0, m.recoil - dt * 4);
    if (m.cd < -0.8) m.ramp = 0;
    const pos = t.moduleWorld(m);
    // Every gun picks its own target.
    const target: Target | null = pickTarget(g, t, m, d, s, pos.x, pos.y, cands, dt);
    if (!target) {
      // Rest facing forward.
      m.aim = turnToward(m.aim, t.rot, s.turn * dt * 0.5);
      continue;
    }
    // Lead moving targets a little.
    let aimX = target.x, aimY = target.y;
    if (s.speed > 0) {
      const e = g.enemyById(target.id);
      if (e) {
        const tt = Math.hypot(e.x - pos.x, e.y - pos.y) / s.speed;
        aimX += e.vx * tt * 0.7;
        aimY += e.vy * tt * 0.7;
      }
    }
    const want = Math.atan2(aimY - pos.y, aimX - pos.x);
    m.aim = turnToward(m.aim, want, s.turn * dt);
    const dist = Math.hypot(aimX - pos.x, aimY - pos.y);
    const aligned = Math.abs(wrapAngle(want - m.aim)) < (d.arc || d.homing > 0 || s.speed === 0 ? 0.3 : 0.14);
    // Twin barrel: a death-ray that fires on its own cycle.
    if (s.twinRate > 0 && aligned && m.cd2 <= 0 && dist <= s.twinRange + target.r) {
      m.cd2 = 1 / s.twinRate;
      twinRay(g, t, m, pos.x, pos.y, target);
    }
    if (m.cd > 0 || !aligned) continue;
    if (dist > s.range + target.r || dist < s.minRange) continue;
    m.cd = 1 / s.rate;
    m.recoil = 1;
    m.shots++;
    let mult = 1;
    if (s.ramp > 0) {
      const key = target?.id ?? -1;
      if (key === m.rampTarget) m.ramp = Math.min(1, m.ramp + 1 / (s.rate * 2.5));
      else {
        m.ramp = 0;
        m.rampTarget = key;
      }
      mult *= 1 + m.ramp * s.ramp;
    }
    if (s.specials.includes('overcharge') && m.shots % 4 === 0) mult *= 3;
    fire(g, t, m, d, s, pos.x, pos.y, Math.min(dist, s.range), target, mult);
    if (s.specials.includes('double_tap') && Math.random() < 0.3) fire(g, t, m, d, s, pos.x, pos.y, Math.min(dist, s.range), target, mult, true);
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
  // Keep the current target while valid (ray guns hold on to build their ramp).
  m.burst -= dt;
  if (m.targetId && (m.burst > 0 || s.ramp > 0)) {
    const cur = lookup(g, t.team, m.targetId);
    if (cur && Math.hypot(cur.x - x, cur.y - y) <= s.range + cur.r) return cur;
  }
  m.burst = 0.4;
  let best: Target | null = null;
  let bestScore = Infinity;
  const lobbed = d.arc || s.sky > 0;
  for (const c of cands) {
    const dd = Math.hypot(c.x - x, c.y - y);
    if (dd > s.range + c.r || dd < s.minRange) continue;
    if (!lobbed && dd > 3 && !losClear(g.map, x, y, c.x, c.y)) continue;
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

function critRoll(t: Tank, s: WeaponStats): boolean {
  if (t.hasBuff('deadeye')) return true;
  return Math.random() < s.crit;
}

function shotFx(s: WeaponStats, d: WeaponDef, base: number): ShotFx {
  return {
    slow: s.slow, stun: s.stun, stunTime: s.stunTime, knock: s.knock, pool: d.pool, split: s.split, pull: !!d.pull, execute: !!d.execute,
    volatile: s.volatile, specials: s.specials, base,
  };
}

const PROJ_SIZE: Partial<Record<string, number>> = {
  flame: 0.3, soul: 0.3, orb: 0.62, plasma: 0.42, gravity: 0.6, phoenix: 0.75, chrono: 0.36, cryo: 0.2, acid: 0.3, ink: 0.36, grenade: 0.2, fireball: 0.3,
};

const LOBBED = new Set(['shell', 'missile', 'mortar', 'grenade', 'acid', 'ink']);

export function fire(g: Game, t: Tank, m: ModuleInst, d: WeaponDef, s: WeaponStats, x: number, y: number, dist: number, target: Target | null, mult = 1, quiet = false): void {
  const a = m.aim;
  const mx = x + Math.cos(a) * 0.7, my = y + Math.sin(a) * 0.7;
  const extraPierce = t.hasBuff('deadeye') ? 1 : 0;
  const crimson = t === g.player && g.runeBuff?.rune === 'crimson';
  const burn = s.burn + (crimson ? s.dmg * 0.15 : 0);
  const dmg = s.dmg * mult;
  if (!quiet) g.hooks.sound(d.sound, x, y, d.size === 'heavy' ? 1 : d.size === 'medium' ? 0.7 : 0.45);
  if (t === g.player) g.onFire?.(d.kind, mx, my, a, d.color, s.speed, Math.min(dist, s.range), s.pellets);
  const wkey = m.weapon!.key, wr = m.weapon!.rarity;
  if (d.kind !== 'sky' && d.kind !== 'meteor' && d.kind !== 'jet') g.fx.push({ t: 'muzzle', x: mx, y: my, a, color: d.color, size: d.size === 'heavy' ? 1.6 : d.size === 'medium' ? 1.1 : 0.7 });
  if (d.size === 'heavy' && t.team === 'player' && t === g.player) g.fx.push({ t: 'shake', amt: 0.15 });
  const fx = shotFx(s, d, dmg);
  const o: HitOpts = { srcTank: t.id, lifesteal: s.lifesteal + soul(t), burn: burn || undefined, wkey, wr, fx };
  // Mini fighter jets from a Hornet Launcher.
  if (d.jets) {
    if (t.team === 'player' && t.kind !== 'remote') {
      const alive = g.allies.filter((k) => k.owner === m.id).length;
      if (alive < d.jets) spawnJet(g, mx, my, a, target?.x ?? g.aim.x, target?.y ?? g.aim.y, dmg, 14, m.id);
      else m.cd = 0.5;
      return;
    }
    for (let i = 0; i < 2; i++) launch(g, t, 'missile', mx, my, a + (i - 0.5) * 0.8, 18, dmg, 1.2, 0, 3, target, s.range, burn, fx, wkey, wr, d.color, 0.2);
    return;
  }
  if (s.speed === 0) {
    hitscan(g, t, d, s, mx, my, a, dist, extraPierce, target, dmg, o);
    return;
  }
  for (let i = 0; i < s.pellets; i++) {
    const spread = (Math.random() - 0.5) * 2 * s.spread;
    const ang = a + spread;
    const crit = critRoll(t, s);
    const p = launch(g, t, d.kind, mx, my, ang, s.speed, dmg * (crit ? 2 : 1), s.splash, s.pierce + extraPierce, s.homing, target, s.range, burn, fx, wkey, wr, d.color, PROJ_SIZE[d.kind] ?? (d.size === 'heavy' ? 0.35 : d.size === 'medium' ? 0.25 : 0.16));
    p.crit = crit;
    p.lifesteal = s.lifesteal + soul(t);
    if (d.arc) {
      const land = Math.min(dist, s.range);
      const jitter = s.spread * land + (s.pellets > 1 ? 1.2 : 0);
      p.tx = mx + Math.cos(a) * land + (Math.random() - 0.5) * jitter;
      p.ty = my + Math.sin(a) * land + (Math.random() - 0.5) * jitter;
      const flight = Math.max(0.5, land / s.speed);
      p.arc = true;
      p.maxLife = flight;
      p.vx = (p.tx - mx) / flight;
      p.vy = (p.ty - my) / flight;
      p.vz = (9.8 * flight) / 2;
      p.z = 1.2;
    }
    if (s.homing > 0 && s.pellets > 1) {
      // Volleys fan out and curve in.
      const fan = (i / Math.max(1, s.pellets - 1) - 0.5) * 1.6;
      p.vx = Math.cos(a + fan) * s.speed * 0.6;
      p.vy = Math.sin(a + fan) * s.speed * 0.6;
    }
  }
}

/** Spawns one projectile. */
export function launch(
  g: Game, t: Tank | null, kind: Projectile['kind'], x: number, y: number, ang: number, speed: number, dmg: number, splash: number, pierce: number,
  homing: number, target: Target | null, range: number, burn: number, fx: ShotFx | undefined, wkey: string | undefined, wr: number | undefined, color: string, size: number,
  team: 'player' | 'enemy' = t?.team ?? 'player',
): Projectile {
  const p: Projectile = {
    id: eid(), x, y, z: HEIGHT, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, vz: 0,
    team, kind, dmg, splash, pierce, life: 0, maxLife: (range * 1.15) / speed,
    color, homing, targetId: target?.id ?? 0, arc: false, tx: 0, ty: 0, burn, crit: false, lifesteal: 0,
    srcTank: t?.id ?? g.player.id, hit: [], flyer: 0, interceptable: LOBBED.has(kind), hp: 1, size, wkey, wr, fx,
  };
  g.projectiles.push(p);
  return p;
}

interface RayHit {
  id: number;
  t: number;
  kind: 'enemy' | 'tank' | 'friendly';
}

function rayHits(g: Game, team: 'player' | 'enemy', x: number, y: number, dx: number, dy: number, len: number, width = 0.15): RayHit[] {
  const out: RayHit[] = [];
  const test = (id: number, cx: number, cy: number, r: number, kind: RayHit['kind']): void => {
    const px = cx - x, py = cy - y;
    const tproj = px * dx + py * dy;
    if (tproj < -r || tproj > len + r) return;
    const perp = Math.abs(px * dy - py * dx);
    if (perp <= r) out.push({ id, t: tproj, kind });
  };
  if (team === 'player') {
    for (const e of g.enemies) if (e.hp > 0 && !e.burrowed) test(e.id, e.x, e.y, e.r + width, 'enemy');
    for (const t of g.tanks) if (!t.dead) test(t.id, t.x, t.y, Math.min(t.stats.width, t.stats.length) / 2 + width - 0.15, 'tank');
  } else {
    for (const f of g.friendlies()) test(f.id, f.x, f.y, f.r + width - 0.15, 'friendly');
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

function hitKind(g: Game, team: 'player' | 'enemy', id: number): RayHit['kind'] {
  return team === 'enemy' ? 'friendly' : g.enemyById(id) ? 'enemy' : 'tank';
}

/** A lightning bolt (or meteor) from the sky onto a point. */
export function skyStrike(g: Game, team: 'player' | 'enemy', x: number, y: number, dmg: number, o: HitOpts, color: string, r = 1.6): void {
  g.fx.push({ t: 'strike', x, y, color });
  g.hooks.sound('tesla', x, y, 0.5);
  explode(g, x, y, r, dmg, team, o, color, true);
}

function hitscan(g: Game, t: Tank, d: WeaponDef, s: WeaponStats, x: number, y: number, a: number, dist: number, extraPierce: number, target: Target | null, dmg: number, o: HitOpts): void {
  const dx = Math.cos(a), dy = Math.sin(a);
  const team = t.team;
  if (d.kind === 'tesla') {
    chainLightning(g, team, x, y, dx, dy, s.range, s.chain, target, dmg, s, o, d.color, t);
    return;
  }
  if (d.kind === 'sky' || d.kind === 'meteor') {
    // Strikes fall around the aim point, one after another.
    const px = target ? target.x : x + dx * dist, py = target ? target.y : y + dy * dist;
    const cands = targetsFor(g, team).filter((c) => Math.hypot(c.x - px, c.y - py) < 6);
    for (let i = 0; i < s.sky; i++) {
      const c = i === 0 && target ? target : cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
      const sx = c ? c.x : px + (Math.random() - 0.5) * 5, sy = c ? c.y : py + (Math.random() - 0.5) * 5;
      const crit = critRoll(t, s);
      const hit = { ...o, crit };
      g.telegraphs.push({
        id: eid(), x: sx, y: sy, shape: 'circle', r: d.kind === 'meteor' ? s.splash : 1.4, a: 0, len: 0, t: 0, total: (d.kind === 'meteor' ? 0.6 : 0.08) + i * 0.14,
        color: d.color, team, dmg: 0,
        onDone: () => {
          if (d.kind === 'meteor') {
            g.fx.push({ t: 'strike', x: sx, y: sy, color: '#ff9100' });
            explode(g, sx, sy, s.splash, dmg * (crit ? 2 : 1), team, hit, '#ff9100');
            if (d.pool === 'fire') g.zones.push({ id: eid(), x: sx, y: sy, r: s.splash * 0.7, t: 3, kind: 'fire', dps: s.burn || dmg * 0.15, team });
          } else {
            skyStrike(g, team, sx, sy, dmg * (crit ? 2 : 1), hit, d.color);
            if (s.chain > 0) chainLightning(g, team, sx, sy, 0, 0, 6, s.chain - 1, null, dmg * 0.6, s, o, d.color, t, sx, sy);
          }
        },
      });
    }
    return;
  }
  if (d.kind === 'sonic') {
    // A cone of sound: hits everything in front.
    const half = 0.5;
    const hits = targetsFor(g, team);
    for (const c of hits) {
      const cx = c.x - x, cy = c.y - y;
      const dd = Math.hypot(cx, cy);
      if (dd > s.range + c.r) continue;
      if (Math.abs(wrapAngle(Math.atan2(cy, cx) - a)) > half + c.r / Math.max(1, dd)) continue;
      const crit = critRoll(t, s);
      applyHit(g, team, { id: c.id, kind: hitKind(g, team, c.id) }, dmg * (crit ? 2 : 1), { ...o, crit, knock: s.knock, kx: cx / (dd || 1), ky: cy / (dd || 1) });
    }
    g.fx.push({ t: 'wave', x, y, a, r: s.range, spread: half, color: d.color });
    return;
  }
  const pierceAll = d.kind === 'rail' || d.kind === 'beam' || d.kind === 'void';
  const len = pierceAll ? s.range : wallDist(g, x, y, dx, dy, s.range);
  const hits = rayHits(g, team, x, y, dx, dy, len, d.kind === 'void' ? 0.5 : 0.15);
  const maxHits = 1 + s.pierce + extraPierce;
  let endT = len;
  let n = 0;
  for (const h of hits) {
    if (n >= maxHits) break;
    const crit = critRoll(t, s);
    applyHit(g, team, h, dmg * (crit ? 2 : 1), { ...o, crit, knock: d.kind === 'rail' ? 4 : s.knock, kx: dx, ky: dy });
    n++;
    if (n >= maxHits) endT = Math.max(0.5, h.t);
  }
  if (d.kind === 'ray' && !hits.length && target) endT = Math.min(len, Math.hypot(target.x - x, target.y - y));
  const w = d.kind === 'rail' ? 0.35 : d.kind === 'void' ? 0.6 : d.kind === 'beam' ? 0.28 : d.kind === 'ray' ? 0.1 : 0.12;
  const life = d.kind === 'rail' ? 0.35 : d.kind === 'void' ? 0.5 : d.kind === 'beam' ? 0.09 : d.kind === 'ray' ? 0.14 : 0.12;
  g.fx.push({ t: 'beam', x0: x, y0: y, x1: x + dx * endT, y1: y + dy * endT, color: d.color, w, life });
  if (d.kind === 'void') g.fx.push({ t: 'beam', x0: x, y0: y, x1: x + dx * endT, y1: y + dy * endT, color: '#ffffff', w: 0.18, life: 0.3 });
}

function chainLightning(
  g: Game, team: 'player' | 'enemy', x: number, y: number, dx: number, dy: number, range: number, chain: number, target: Target | null, dmg: number,
  s: WeaponStats, o: HitOpts, color: string, t: Tank, fromX = x, fromY = y,
): void {
  const pts = [{ x: fromX, y: fromY }];
  const hitIds = new Set<number>();
  let cur: Target | null = target;
  const cands = targetsFor(g, team);
  if (!cur) {
    if (dx || dy) {
      const hits = rayHits(g, team, x, y, dx, dy, range);
      if (hits.length) cur = lookup(g, team, hits[0].id);
    } else {
      let bd = range;
      for (const c of cands) {
        const dd = Math.hypot(c.x - x, c.y - y);
        if (dd < bd && dd > 0.8) {
          bd = dd;
          cur = c;
        }
      }
    }
  }
  let jumps = 0;
  while (cur && jumps <= chain) {
    hitIds.add(cur.id);
    pts.push({ x: cur.x, y: cur.y });
    const crit = critRoll(t, s);
    applyHit(g, team, { id: cur.id, kind: hitKind(g, team, cur.id) }, dmg * (crit ? 2 : 1) * (1 - jumps * 0.08), { ...o, crit });
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
  if (pts.length === 1) {
    if (!dx && !dy) return;
    pts.push({ x: x + dx * range * 0.6, y: y + dy * range * 0.6 });
  }
  g.fx.push({ t: 'bolt', pts, color });
}

/** The Ray-Rail's second barrel: a thin continuous death-ray. */
function twinRay(g: Game, t: Tank, m: ModuleInst, x: number, y: number, target: Target | null): void {
  const s = m.stats!;
  const d = WEAPONS[m.weapon!.key];
  const a = m.aim + 0.04;
  const dx = Math.cos(a), dy = Math.sin(a);
  const len = wallDist(g, x, y, dx, dy, s.twinRange);
  const hits = rayHits(g, t.team, x, y, dx, dy, len);
  let endT = target ? Math.min(len, Math.hypot(target.x - x, target.y - y)) : len;
  if (hits.length) {
    const crit = critRoll(t, s);
    applyHit(g, t.team, hits[0], s.twinDmg * (crit ? 2 : 1), { crit, srcTank: t.id, lifesteal: s.lifesteal + soul(t), wkey: m.weapon!.key, wr: m.weapon!.rarity, silent: !crit });
    endT = hits[0].t;
  }
  g.fx.push({ t: 'beam', x0: x, y0: y, x1: x + dx * endT, y1: y + dy * endT, color: d.twin?.color ?? '#69f0ae', w: 0.09, life: 0.12 });
}
