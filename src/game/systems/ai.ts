import { losClear } from '../../shared/motion';
import { turnToward } from '../../shared/types';
import { eid, type Enemy, type Projectile } from '../entities';
import { ENEMIES } from '../enemyDefs';
import type { Game, Target } from '../game';
import type { Tank } from '../tank';
import { damageEnemy, damageFriendly, damageTank, explode } from './damage';
import { driveTank, moveSmall, planPath } from './movement';
import { troopCasualty } from './troops';
import { siegeTarget } from '../campaign';

function nearestFriendly(g: Game, e: Enemy, range: number, friends: Target[]): Target | null {
  let best: Target | null = null;
  let bd = range;
  for (const f of friends) {
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

/* ---------------------------------------------------------------------- */
/* Hordes                                                                  */
/* ---------------------------------------------------------------------- */

/** World height of a fortress deck (matches the model). */
const deckY = (t: Tank): number => t.deckY(0);

/** How many creatures fit on a hull at once. */
export const latchCap = (t: Tank): number => Math.max(6, Math.floor((t.stats.length * t.stats.width) / 14));

/** Pile height (world units) along each 2.5-unit stretch of a hull's perimeter, rebuilt every step. */
const piles = new Map<number, Float32Array>();
const PILE_SEG = 5;
/** Metres of pile each body adds to its stretch of hull. */
const PILE_BODY = 0.8;
/**
 * How high the pile must get before they climb the rest of the way: the first 12 m (the crawler housings and the
 * lower hull) need bodies to stand on; above that there are ladders, pipes and armour seams to claw up.
 */
const CLIMB_H = 12;

function perimeterPos(t: Tank, x: number, y: number): number {
  const l = t.toLocal(x, y);
  const hl = t.stats.length / 2, hw = t.stats.width / 2;
  const px = Math.max(-hl, Math.min(hl, l.lx)), pz = Math.max(-hw, Math.min(hw, l.lz));
  // Which edge is nearest: walk the perimeter front-right-back-left.
  const dF = hl - px, dB = px + hl, dR = hw - pz, dL = pz + hw;
  const m = Math.min(dF, dB, dR, dL);
  if (m === dF) return pz + hw;
  if (m === dR) return 2 * hw + (hl - px);
  if (m === dB) return 2 * hw + 2 * hl + (hw - pz);
  return 4 * hw + 2 * hl + (px + hl);
}

/** Counts the crowd pressed against each hull and turns it into pile heights. */
function buildPiles(g: Game, list: Enemy[]): void {
  piles.clear();
  const hulls = [g.player, ...g.tanks.filter((t) => t.kind === 'rival')];
  for (const t of hulls) {
    if (t.dead) continue;
    const n = Math.ceil((2 * (t.stats.length + t.stats.width)) / PILE_SEG) + 1;
    const a = new Float32Array(n);
    piles.set(t.id, a);
    const R = t.stats.length / 2 + 2;
    for (const e of g.grid.near(t.x, t.y, R, [])) {
      if (e.hp <= 0 || e.latch || e.flying || e.titan || e.r > 0.6) continue;
      if (t.edgeDist(e.x, e.y) > 0.9) continue;
      a[Math.floor(perimeterPos(t, e.x, e.y) / PILE_SEG)] += PILE_BODY;
    }
  }
  void list;
}

function pileAt(t: Tank, x: number, y: number): number {
  const a = piles.get(t.id);
  if (!a) return 0;
  const k = Math.floor(perimeterPos(t, x, y) / PILE_SEG);
  // Neighbouring stretches prop each other up.
  return a[k] + 0.5 * ((a[k - 1] ?? 0) + (a[k + 1] ?? 0));
}

/** The point on a tank's hull nearest to (x, y). */
function hullPoint(t: Tank, x: number, y: number): { x: number; y: number } {
  const l = t.toLocal(x, y);
  const hl = t.stats.length / 2, hw = t.stats.width / 2;
  return t.toWorld(Math.max(-hl, Math.min(hl, l.lx)), Math.max(-hw, Math.min(hw, l.lz)));
}

function latchOn(e: Enemy, t: Tank, lx: number, lz: number): void {
  const hl = t.stats.length / 2 - 1, hw = t.stats.width / 2 - 1;
  e.latch = { tank: t.id, lx: Math.max(-hl, Math.min(hl, lx)), lz: Math.max(-hw, Math.min(hw, lz)) };
  e.vx = 0;
  e.vy = 0;
  e.state = 'latched';
}

/** Clinging to a hull: chewing on it, crawling toward the middle, until shot or shaken off. */
function updateLatched(g: Game, e: Enemy, dt: number): void {
  const l = e.latch!;
  const t = g.tankById(l.tank);
  if (!t || t.dead) {
    e.latch = null;
    e.z = 0;
    return;
  }
  // Crawl inward (they climb over the rim and head for the middle of the deck).
  if (Math.abs(l.lz) > 1.5) l.lz -= Math.sign(l.lz) * dt * 0.35;
  if (Math.abs(l.lx) > 2) l.lx -= Math.sign(l.lx) * dt * 0.2;
  const w = t.toWorld(l.lx, l.lz);
  e.x = w.x;
  e.y = w.y;
  e.z = deckY(t);
  e.face = l.lz >= 0 ? -1 : 1;
  damageTank(g, t, e.dmg * 0.55 * dt * (e.elite ? 1.5 : 1), { silent: true });
  // Boarders on the roof go for the soldiers standing there.
  if (t === g.player && Math.random() < dt * 0.012 * (e.elite ? 3 : 1)) troopCasualty(g, 'soldier', 'Boarders killed a soldier on the roof.');
  if (Math.random() < dt * 0.6) {
    g.fx.push({ t: 'spark', x: e.x, y: e.y, color: '#ffab40', n: 2 });
    g.hooks.sound('bite', e.x, e.y, 0.15);
  }
  // Driving hard shakes them off.
  const fast = Math.abs(t.speed) > t.stats.topSpeed * 0.55 || t.hasBuff('nitro');
  if (fast && Math.random() < dt * (t.hasBuff('nitro') ? 2 : 0.5)) {
    e.latch = null;
    e.state = 'idle';
    e.z = 0;
    const dx = e.x - t.x, dy = e.y - t.y, d = Math.hypot(dx, dy) || 1;
    const edge = hullPoint(t, e.x + (dx / d) * 50, e.y + (dy / d) * 50);
    e.x = edge.x + (dx / d) * 0.6;
    e.y = edge.y + (dy / d) * 0.6;
    e.vx = (dx / d) * 8;
    e.vy = (dy / d) * 8;
    e.stun = 0.8;
    damageEnemy(g, e, e.maxHp * 0.3, { silent: true });
  }
}

/** Calls in `n` of a kind around an enemy (necromancers raise skeletons, bosses call their brood). */
function summon(g: Game, e: Enemy, kind: string, n: number): void {
  // Don't bury the world: at most ~60 summoned things around one summoner.
  let around = 0;
  for (const o of g.enemiesNear(e.x, e.y, 20)) if (o.kind === kind) around++;
  if (around > 60) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = e.r + 1 + Math.random() * 3;
    const m = g.spawnEnemy(kind, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, e.threat);
    m.aggro = true;
    m.horde = e.horde || e.boss === true;
    g.fx.push({ t: 'spark', x: m.x, y: m.y, color: ENEMIES[e.kind].color, n: 3 });
  }
  g.fx.push({ t: 'ring', x: e.x, y: e.y, r: e.r + 3, color: ENEMIES[e.kind].color });
}

/** Long-range fire with a warning: a laser line (snipers) or a circle on the ground (artillery). */
function aimedShot(g: Game, e: Enemy, tgt: Target, kind: 'line' | 'circle'): void {
  const d = ENEMIES[e.kind];
  if (kind === 'circle') {
    // Shells land where you were a moment ago, a little scattered.
    const x = tgt.x + (Math.random() - 0.5) * 3, y = tgt.y + (Math.random() - 0.5) * 3;
    telegraph(g, x, y, d.splash ?? 3, 2.2, e.dmg, '#ff6d00');
    g.hooks.sound('mortar', e.x, e.y, 0.5);
    return;
  }
  const a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
  const len = Math.hypot(tgt.x - e.x, tgt.y - e.y) + 6;
  const x0 = e.x, y0 = e.y, dmg = e.dmg;
  telegraph(g, x0, y0, 0.35, 1.3, dmg, '#00e5ff', 'line', a, len, () => {
    if (e.hp <= 0) return;
    g.fx.push({ t: 'beam', x0, y0, x1: x0 + Math.cos(a) * len, y1: y0 + Math.sin(a) * len, color: '#00e5ff', w: 0.25, life: 0.25 });
    g.hooks.sound('rail', x0, y0, 0.6);
    // Anything of yours on the line takes the hit.
    for (const f of g.friendlies()) {
      const t = ((f.x - x0) * Math.cos(a) + (f.y - y0) * Math.sin(a));
      if (t < 0 || t > len) continue;
      const px = x0 + Math.cos(a) * t, py = y0 + Math.sin(a) * t;
      if (g.friendlyEdgeDist(f.id, px, py) < 0.6) damageFriendly(g, f.id, dmg);
    }
  });
}

/**
 * Bosses: giants with a rotation of attacks. Slams (telegraphed rings), volleys, summons and charges; ranged
 * bosses keep their distance, brawlers close in.
 */
function bossAI(g: Game, e: Enemy, dt: number, tgt: Target | null): void {
  const player = g.player;
  if (!tgt) tgt = { id: player.id, x: player.x, y: player.y, r: player.stats.width / 2, flying: false };
  const d = ENEMIES[e.kind];
  const dx = tgt.x - e.x, dy = tgt.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const edge = g.friendlyEdgeDist(tgt.id, e.x, e.y);
  e.face = dx >= 0 ? 1 : -1;
  e.targetId = tgt.id;
  e.stateT -= dt;
  e.atkCd -= dt;
  // Movement: brawlers close in, shooters hold at range.
  const want = d.range > 8 ? d.range * 0.7 : 1;
  let mx = 0, my = 0;
  if (e.state === 'charge') {
    mx = e.vx;
    my = e.vy;
    if (e.stateT <= 0) {
      e.state = 'idle';
      e.vx = e.vy = 0;
    }
  } else if (edge > want) {
    mx = (dx / dist) * e.speed * slowMul(e);
    my = (dy / dist) * e.speed * slowMul(e);
  } else if (edge < want * 0.6) {
    mx = (-dx / dist) * e.speed * 0.6;
    my = (-dy / dist) * e.speed * 0.6;
  }
  const r = moveSmall(g, e.x, e.y, e.r * 0.6, mx * dt, my * dt, true);
  e.x = r.x;
  e.y = r.y;
  if (d.summon) {
    e.summonT = (e.summonT ?? 3) - dt;
    if (e.summonT <= 0) {
      e.summonT = d.summon.every;
      summon(g, e, d.summon.kind, d.summon.n);
    }
  }
  if (e.atkCd > 0 || edge > Math.max(d.range, 6) + 10) return;
  // Pick the next attack in the rotation.
  const moves: ('slam' | 'volley' | 'charge' | 'beam' | 'rain')[] =
    e.kind === 'boss_warlord' ? ['volley', 'charge', 'slam']
      : e.kind === 'boss_goliath' ? ['rain', 'volley', 'beam']
        : e.kind === 'boss_abomination' ? ['slam', 'charge', 'volley']
          : e.kind === 'boss_overmind' ? ['beam', 'volley', 'rain']
            : e.kind === 'boss_lich' ? ['volley', 'rain', 'beam']
              : ['slam', 'volley', 'charge', 'rain'];
  const mv = moves[(e.moveN = (e.moveN ?? 0) + 1) % moves.length];
  e.atkCd = 2.4 + Math.random();
  const dmg = e.dmg;
  switch (mv) {
    case 'slam':
      if (edge < 7) telegraph(g, e.x + (dx / dist) * Math.min(dist, e.r + 2), e.y + (dy / dist) * Math.min(dist, e.r + 2), 4.5, 1.1, dmg * 1.4, '#ff1744');
      else e.atkCd = 0.4;
      break;
    case 'volley':
      for (let i = 0; i < 7; i++) shootAt(g, e, tgt.x + (Math.random() - 0.5) * 6, tgt.y + (Math.random() - 0.5) * 6, 'spit', 13, dmg * 0.3, 1.6);
      g.hooks.sound('rocket', e.x, e.y, 0.8);
      break;
    case 'charge':
      e.state = 'charge';
      e.stateT = 1.1;
      e.vx = (dx / dist) * e.speed * 4;
      e.vy = (dy / dist) * e.speed * 4;
      telegraph(g, e.x, e.y, e.r, 0.9, 0, '#ff9100', 'line', Math.atan2(dy, dx), e.speed * 4.4, () => {});
      break;
    case 'beam': {
      const a = Math.atan2(dy, dx);
      const x0 = e.x, y0 = e.y, len = dist + 8;
      telegraph(g, x0, y0, 1, 1.2, dmg, '#e040fb', 'line', a, len, () => {
        g.fx.push({ t: 'beam', x0, y0, x1: x0 + Math.cos(a) * len, y1: y0 + Math.sin(a) * len, color: '#e040fb', w: 0.9, life: 0.4 });
        for (const f of g.friendlies()) {
          const t = (f.x - x0) * Math.cos(a) + (f.y - y0) * Math.sin(a);
          if (t < 0 || t > len) continue;
          if (g.friendlyEdgeDist(f.id, x0 + Math.cos(a) * t, y0 + Math.sin(a) * t) < 1.2) damageFriendly(g, f.id, dmg * 1.6);
        }
      });
      break;
    }
    case 'rain':
      for (let i = 0; i < 6; i++) telegraph(g, tgt.x + (Math.random() - 0.5) * 16, tgt.y + (Math.random() - 0.5) * 16, 3, 1.6 + i * 0.2, dmg * 0.8, '#ff6d00');
      break;
  }
  // Charging bosses trample what they hit.
  if (e.state === 'charge' && edge < 1.5) {
    damageFriendly(g, tgt.id, dmg * dt * 2);
    g.fx.push({ t: 'shake', amt: 0.3 });
  }
}

/**
 * Swarmers and leapers: sprint straight at the fortress over anything in the way, pile up against the hull
 * and climb aboard. Leapers jump the last few metres onto the deck.
 */
function updateSwarmer(g: Game, e: Enemy, dt: number, friends: Target[], latched: Map<number, number>, near: Enemy[]): void {
  // A leap in progress.
  if (e.state === 'leap') {
    e.stateT -= dt;
    const t = g.tankById(e.targetId);
    const k = 1 - Math.max(0, e.stateT) / 0.6;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.z = Math.sin(Math.PI * k) * 3 + k * (t ? deckY(t) : 0);
    if (e.stateT <= 0) {
      e.state = 'idle';
      e.vx = e.vy = 0;
      if (t && !t.dead && t.hits(e.x, e.y, 0.5) && (latched.get(t.id) ?? 0) < latchCap(t)) {
        const l = t.toLocal(e.x, e.y);
        latchOn(e, t, l.lx, l.lz);
        latched.set(t.id, (latched.get(t.id) ?? 0) + 1);
        g.fx.push({ t: 'dust', x: e.x, y: e.y, color: '#a1887f' });
      } else e.z = 0;
    }
    return;
  }
  // Squad units in the way get mobbed; otherwise it's the fortress.
  let tgt = nearestFriendly(g, e, 3, friends);
  if (!tgt && !g.player.dead) tgt = { id: g.player.id, x: g.player.x, y: g.player.y, r: g.player.stats.width / 2, flying: false };
  if (!tgt) return;
  e.targetId = tgt.id;
  const tank = g.tankById(tgt.id);
  const aim = tank ? hullPoint(tank, e.x, e.y) : { x: tgt.x, y: tgt.y };
  let dx = aim.x - e.x, dy = aim.y - e.y;
  const edge = Math.hypot(dx, dy) - (tank ? 0 : tgt.r);
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  e.face = dx >= 0 ? 1 : -1;
  e.atkCd -= dt;
  if (tank && !tank.dead) {
    const full = (latched.get(tank.id) ?? 0) >= latchCap(tank);
    if (e.kind === 'leaper' && !full && edge > 1 && edge < 7 && e.atkCd <= 0) {
      // Jump for the deck.
      const l = tank.toLocal(e.x, e.y);
      const land = tank.toWorld(Math.max(-tank.stats.length / 2 + 2, Math.min(tank.stats.length / 2 - 2, l.lx * 0.6)), Math.max(-tank.stats.width / 2 + 1.5, Math.min(tank.stats.width / 2 - 1.5, l.lz * 0.5)));
      e.state = 'leap';
      e.stateT = 0.6;
      e.vx = (land.x - e.x) / 0.6 + Math.cos(tank.rot) * tank.speed;
      e.vy = (land.y - e.y) / 0.6 + Math.sin(tank.rot) * tank.speed;
      e.atkCd = 3;
      g.hooks.sound('bite', e.x, e.y, 0.2);
      return;
    }
    if (edge < 0.9 && !e.flying) {
      // Bodies pile up against the hull; once the pile reaches the roof they climb over it and aboard.
      const pile = pileAt(tank, e.x, e.y);
      const roof = deckY(tank);
      e.z = Math.min(roof, pile * (0.25 + 0.75 * (((e.id * 37) % 100) / 100)));
      if (!full && pile >= Math.min(roof * 0.85, CLIMB_H) && Math.random() < dt * 2) {
        const l = tank.toLocal(e.x, e.y);
        latchOn(e, tank, l.lx, l.lz);
        latched.set(tank.id, (latched.get(tank.id) ?? 0) + 1);
        return;
      }
    }
  }
  if (edge <= e.range + 0.25 && e.atkCd <= 0) {
    e.atkCd = 1 / e.atkRate;
    if (e.kind === 'bomber' || ENEMIES[e.kind].explode) {
      explode(g, e.x, e.y, ENEMIES[e.kind].splash ?? 2, e.dmg, 'enemy', {}, e.kind === 'z_bloater' ? '#c6ff00' : '#ff5252');
      e.hp = 0;
      return;
    }
    // Against a hull they mostly claw for a grip to climb; the damage is done once they're aboard. Flyers dive in.
    damageFriendly(g, tgt.id, tank ? e.dmg * (e.flying ? 0.3 : 0.08) : e.dmg, { silent: true });
    if (Math.random() < 0.3) g.fx.push({ t: 'spark', x: e.x + dx * e.r, y: e.y + dy * e.r, color: '#ffab40', n: 2 });
  }
  // Run at it, shoulder to shoulder, climbing over whatever is in the way.
  let mx = edge > 0.3 ? dx : 0, my = edge > 0.3 ? dy : 0;
  g.grid.near(e.x, e.y, 1.2, near);
  for (const o of near) {
    if (o === e || o.hp <= 0 || o.latch || o.titan) continue;
    const ox = e.x - o.x, oy = e.y - o.y;
    const rr = e.r + o.r;
    if (Math.abs(ox) > rr || Math.abs(oy) > rr) continue;
    const dd = Math.hypot(ox, oy);
    if (dd < rr && dd > 1e-4) {
      mx += (ox / dd) * 0.7;
      my += (oy / dd) * 0.7;
    }
  }
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }
  const sp = e.speed * slowMul(e);
  e.x += (mx * sp + e.vx) * dt;
  e.y += (my * sp + e.vy) * dt;
  const decay = Math.pow(0.05, dt);
  e.vx *= decay;
  e.vy *= decay;
  if (e.flying) {
    // Flyers swoop down to roof height when they're on a hull.
    e.z = tank && edge < 3 ? deckY(tank) + 0.4 : 0;
    return;
  }
  // Clambering over rocks and ruins (and each other, against a hull).
  if (!(tank && edge < 0.9)) {
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    const oh = g.map.inside(tx, ty) && g.map.getObs(tx, ty) ? g.map.getOh(tx, ty) * 0.3 : 0;
    e.z += (oh - e.z) * Math.min(1, dt * 8);
  }
  crushAndPush(g, e, dt);
}

export function updateEnemies(g: Game, dt: number): void {
  const list = g.enemies;
  g.indexEnemies();
  buildPiles(g, list);
  const friends = g.friendlies();
  const near: Enemy[] = [];
  // How many are already clinging to each hull.
  const latched = new Map<number, number>();
  for (const e of list) if (e.latch && e.hp > 0) latched.set(e.latch.tank, (latched.get(e.latch.tank) ?? 0) + 1);
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
    if (e.latch) {
      if (e.stun > 0) e.stun -= dt;
      else updateLatched(g, e, dt);
      continue;
    }
    if (e.stun > 0) {
      e.stun -= dt;
      if (e.horde) {
        // Still sliding from being flung.
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= Math.pow(0.05, dt);
        e.vy *= Math.pow(0.05, dt);
      }
      continue;
    }
    e.slow = Math.max(0, e.slow - dt);
    if (e.slow <= 0) e.slowAmt = 0;
    if (e.siege) {
      // Besieging the Mothership: run at its hull, unless you're close enough to be the better meal.
      const at = siegeTarget(g, e);
      if (at) {
        const dx = at.x - e.x, dy = at.y - e.y, d = Math.hypot(dx, dy) || 1;
        if (d > 95) {
          e.x += (dx / d) * e.speed * dt;
          e.y += (dy / d) * e.speed * dt;
        }
        e.face = dx >= 0 ? 1 : -1;
        e.anim += dt * 4;
        continue;
      }
      e.siege = false;
      e.horde = true;
      e.aggro = true;
    }
    if (e.horde || e.kind === 'swarmer' || e.kind === 'leaper') {
      e.anim += dt * 4;
      updateSwarmer(g, e, dt, friends, latched, near);
      continue;
    }
    // Knockback decay.
    const kb = Math.hypot(e.vx, e.vy);
    const def = ENEMIES[e.kind];
    // Long-range units spot you from further out than you can shoot back.
    const aggroR = e.camp ? 12 : Math.max(17 + e.threat * 1.5, def.range + 8);
    let tgt = nearestFriendly(g, e, e.aggro ? aggroR * 2.2 : aggroR, friends);
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
    if (e.boss) {
      bossAI(g, e, dt, tgt);
      continue;
    }
    if (e.titan) {
      titanAI(g, e, dt, tgt);
      continue;
    }
    // Summoners raise or call in more of their kind while they fight.
    if (def.summon && tgt) {
      e.summonT = (e.summonT ?? def.summon.every * 0.5) - dt;
      if (e.summonT <= 0) {
        e.summonT = def.summon.every;
        summon(g, e, def.summon.kind, def.summon.n);
      }
    }
    let mx = 0, my = 0;
    const d = ENEMIES[e.kind];
    if (tgt) {
      const edge = g.friendlyEdgeDist(tgt.id, e.x, e.y);
      const dx = tgt.x - e.x, dy = tgt.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.face = dx >= 0 ? 1 : -1;
      const ranged = !!d.proj || !!d.aimed;
      if (d.still) {
        // Turrets and mortar pits don't move.
      } else if (e.kind === 'stalker') {
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
        if (d.aimed) {
          aimedShot(g, e, tgt, d.aimed);
        } else if (ranged) {
          if (e.flying || losClear(g.map, e.x, e.y, tgt.x, tgt.y)) shoot(g, e, tgt.x, tgt.y);
          else e.atkCd = 0.3;
        } else if (e.kind === 'bomber' || d.explode) {
          explode(g, e.x, e.y, d.splash ?? 2, e.dmg, 'enemy', {}, e.kind === 'z_bloater' ? '#c6ff00' : '#ff5252');
          e.hp = 0;
          continue;
        } else if (e.kind === 'guardian' || e.kind === 'brute' || d.slam) {
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
    for (const o of g.grid.near(e.x, e.y, e.r + 1.5, near)) {
      if (o === e || o.hp <= 0 || o.titan || o.latch) continue;
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
  // Drop the dead in one pass (a horde can lose dozens a second).
  let k = 0;
  for (let i = 0; i < list.length; i++) if (list[i].hp > 0) list[k++] = list[i];
  list.length = k;
}

function crushAndPush(g: Game, e: Enemy, dt: number): void {
  for (let i = -2; i < g.tanks.length; i++) {
    const t = i === -2 ? g.player : i === -1 ? g.outrider : g.tanks[i];
    if (!t || t.dead) continue;
    if (Math.abs(e.x - t.x) > t.stats.length || Math.abs(e.y - t.y) > t.stats.length) continue;
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
      damageEnemy(g, e, Math.abs(t.speed) * 7 * t.stats.crush * t.ram * nitro * dt * 4, { silent: true, srcTank: t.id, weapon: true });
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
  // Rivals hunt you across the map; raiders only fight what they run into.
  const aggro = d < 42 || t.lastHitAt > g.time - 8 || (t.kind === 'rival' && d < 260);
  const ai = (t as Tank & { ai?: { repath: number; orbit: number } }).ai ??= { repath: 0, orbit: Math.random() < 0.5 ? 1 : -1 };
  ai.repath -= dt;
  if (aggro && !p.dead) {
    // Rivals close in until most of their guns reach; raiders hang back at their longest range.
    const ranges = t.weapons().map((m) => m.stats?.range ?? 0).sort((a, b) => a - b);
    const range = t.kind === 'rival' ? Math.max(8, ranges[Math.floor(ranges.length / 2)] ?? 12) * 0.75 : Math.max(8, ...ranges) * 0.7;
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
