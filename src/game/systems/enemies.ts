import { GRAVITY, MAX_FALL, TILE } from '../../shared/constants';
import { moveBody, overlaps } from '../../shared/physics';
import { TILES } from '../../shared/tiles';
import type { World } from '../../shared/world';
import { SPAWN_X } from '../../shared/worldgen';
import { ZONES, zoneIndexAt } from '../../shared/zones';
import { Enemy, type EnemyKind, type TitanDef } from '../entities';
import type { Game } from '../game';
import type { Rig } from '../rig';
import { RT } from '../rigDefs';

/* ---------------------------------------------------------------------- */
/* Threat                                                                  */
/* ---------------------------------------------------------------------- */

/**
 * How dangerous a spot is. 1.0 at the starting camp, rising the farther you
 * travel from it and the deeper you dig. Enemy stats, tiers, elites and
 * titans all key off this.
 */
export function threatAt(world: World, tx: number, ty: number): number {
  const surface = world.surface[Math.max(0, Math.min(world.w - 1, tx))] ?? 0;
  const dist = Math.abs(tx - SPAWN_X) / 300;
  const depth = Math.max(0, ty - surface) / 70;
  return Math.min(10, 1 + dist + depth);
}

/** Threat at which titans start roaming (the outer edges of the Rustbelt). */
export const TITAN_THREAT = 2.2;

export const TIERS = [
  { min: 0, name: 'I', label: 'Scavenger country' },
  { min: 1.6, name: 'II', label: 'Raider territory' },
  { min: TITAN_THREAT, name: 'III', label: 'Titan grounds' },
  { min: 4, name: 'IV', label: 'Deep wasteland' },
  { min: 6, name: 'V', label: 'No-return zone' },
];

export function threatTier(t: number): (typeof TIERS)[number] {
  let tier = TIERS[0];
  for (const x of TIERS) if (t >= x.min) tier = x;
  return tier;
}

/* ---------------------------------------------------------------------- */
/* Regular enemies                                                         */
/* ---------------------------------------------------------------------- */

interface Stats {
  w: number;
  h: number;
  hp: number;
  dmg: number;
  speed: number;
  flying: boolean;
  loot: string;
}

const STATS: Record<Exclude<EnemyKind, 'titan'>, Stats> = {
  crawler: { w: 20, h: 12, hp: 26, dmg: 9, speed: 125, flying: false, loot: 'creature' },
  gunner: { w: 14, h: 28, hp: 36, dmg: 8, speed: 95, flying: false, loot: 'trooper' },
  drone: { w: 18, h: 12, hp: 22, dmg: 7, speed: 150, flying: true, loot: 'creature' },
  brute: { w: 26, h: 34, hp: 150, dmg: 20, speed: 62, flying: false, loot: 'creature' },
  trooper: { w: 14, h: 28, hp: 46, dmg: 10, speed: 105, flying: false, loot: 'trooper' },
};

export function makeEnemy(kind: Exclude<EnemyKind, 'titan'>, zoneIndex: number, x: number, y: number, threat = 1 + ZONES[zoneIndex].difficulty * 0.8, elite = false): Enemy {
  const z = ZONES[zoneIndex];
  const st = STATS[kind];
  const e = new Enemy(kind);
  const size = elite ? 1.35 : 1 + Math.min(0.25, (threat - 1) * 0.04);
  e.threat = threat;
  e.elite = elite;
  e.w = Math.round(st.w * (kind === 'gunner' || kind === 'trooper' ? 1 : size));
  e.h = Math.round(st.h * (kind === 'gunner' || kind === 'trooper' ? 1 : size));
  e.x = x - e.w / 2;
  e.y = y - e.h;
  e.hp = e.maxHp = Math.round(st.hp * (0.6 + 0.4 * threat) * (elite ? 2.5 : 1));
  e.dmg = st.dmg * (0.8 + 0.2 * threat) * (elite ? 1.5 : 1);
  e.speed = st.speed * (0.9 + Math.random() * 0.2) * (elite ? 1.1 : 1);
  e.flying = st.flying;
  e.loot = st.loot;
  e.tint = z.enemyTint;
  const base = kind === 'trooper' ? 'Raider Trooper' : z.enemyNames[kind];
  e.name = elite ? `Alpha ${base}` : base;
  return e;
}

/* ---------------------------------------------------------------------- */
/* Titans                                                                  */
/* ---------------------------------------------------------------------- */

export const TITANS: Record<string, TitanDef> = {
  rustbelt: { key: 'scrap_titan', name: 'Scrap Titan', style: 'walker', w: 60, h: 112, hp: 1500, dmg: 40, speed: 42, body: '#7a6250', dark: '#3e342c', glow: '#ffab40' },
  dunes: { key: 'dune_wyrm', name: 'Dune Wyrm', style: 'worm', w: 44, h: 44, hp: 1900, dmg: 55, speed: 250, body: '#c8a060', dark: '#7a5a30', glow: '#ff6e40', segments: 14 },
  cryo: { key: 'rime_crab', name: 'Rime Crab', style: 'beast', w: 120, h: 60, hp: 2200, dmg: 50, speed: 70, body: '#9fc6e0', dark: '#4a6a88', glow: '#6af0ff' },
  glass: { key: 'rad_behemoth', name: 'Rad Behemoth', style: 'beast', w: 132, h: 72, hp: 2800, dmg: 60, speed: 60, body: '#6a8a4a', dark: '#34482a', glow: '#c6ff00' },
  magma: { key: 'magma_colossus', name: 'Magma Colossus', style: 'walker', w: 80, h: 150, hp: 3600, dmg: 70, speed: 36, body: '#3e3230', dark: '#1e1818', glow: '#ff6e40' },
  acid: { key: 'bog_wyrm', name: 'Bog Wyrm', style: 'worm', w: 52, h: 52, hp: 4200, dmg: 70, speed: 240, body: '#4a6a3a', dark: '#243a1a', glow: '#76ff03', segments: 18 },
};

export function makeTitan(zoneKey: string, x: number, groundY: number, threat: number): Enemy {
  const def = TITANS[zoneKey] ?? TITANS.rustbelt;
  const e = new Enemy('titan');
  e.threat = threat;
  e.w = def.w;
  e.h = def.h;
  e.x = x - def.w / 2;
  e.y = def.style === 'worm' ? groundY + 20 * TILE : groundY - def.h;
  e.hp = e.maxHp = Math.round(def.hp * (0.6 + 0.25 * threat));
  e.dmg = def.dmg * (0.8 + 0.15 * threat);
  e.speed = def.speed;
  e.name = def.name;
  e.loot = 'titan';
  e.tint = [255, 255, 255];
  e.titan = { def, mode: def.style === 'worm' ? 'burrow' : 'stalk', t: 0, attackCd: 3, stompCd: 2, dir: 1, burrowed: def.style === 'worm', trail: [], step: 0 };
  return e;
}

/* ---------------------------------------------------------------------- */
/* Update                                                                  */
/* ---------------------------------------------------------------------- */

export function updateEnemies(g: Game, dt: number): void {
  const s = g.sim;
  if (s.kind === 'world') {
    spawnTick(g, dt);
    titanTick(g, dt);
  }
  const p = g.player;
  for (const e of s.enemies) {
    if (e.dead) continue;
    e.t += dt;
    e.fireCd -= dt;
    e.jumpCd -= dt;
    e.hurtFlash -= dt;
    const dist = Math.hypot(p.cx - e.cx, p.cy - e.cy);
    const limit = e.kind === 'titan' ? 260 * TILE : e.kind === 'trooper' ? 220 * TILE : 120 * TILE;
    if (dist > limit) {
      e.dead = true;
      continue;
    }
    if (e.titan) {
      titanAI(g, e, dt);
      continue;
    }
    const target = !p.dead && dist < 60 * TILE ? p : null;
    if (e.flying) flyAI(g, e, target, dt);
    else groundAI(g, e, target, dt);

    const t = s.world.get(Math.floor(e.cx / TILE), Math.floor((e.y + e.h - 3) / TILE));
    const d = TILES[t];
    if (d.contact) g.damageEnemy(e, d.contact.dps * dt, 0, 0);
  }
  s.enemies = s.enemies.filter((e) => !e.dead);
}

function groundAI(g: Game, e: Enemy, target: { cx: number; cy: number; x: number; y: number; w: number; h: number } | null, dt: number): void {
  let dir = 0;
  if (target) {
    const dx = target.cx - e.cx;
    const adx = Math.abs(dx) / TILE;
    e.facing = dx > 0 ? 1 : -1;
    if (e.kind === 'gunner' || e.kind === 'trooper') {
      if (adx > 15) dir = e.facing;
      else if (adx < 7) dir = -e.facing;
      if (adx < 30 && e.fireCd <= 0) {
        e.fireCd = (1.2 + Math.random() * 0.7) / (e.elite ? 1.5 : 1);
        const a = Math.atan2(target.cy - (e.y + 9), dx) + (Math.random() - 0.5) * 0.12;
        e.aim = a;
        g.spawnProjectile({ x: e.cx, y: e.y + 9, angle: a, speed: 720, dmg: e.dmg, team: 'hostile', kind: 'bullet', life: 1.2, color: '#ff5252', knock: 60 });
        g.audio.play('pistol', 0.35);
      }
    } else {
      dir = Math.abs(dx) > 6 ? e.facing : 0;
    }
  } else {
    if (Math.sin(e.t * 0.5 + e.x) > 0.6) dir = Math.sin(e.t * 0.13 + e.y) > 0 ? 1 : -1;
    if (dir) e.facing = dir;
  }
  const want = dir * e.speed;
  e.vx += (want - e.vx) * Math.min(1, dt * 8);
  e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
  const x0 = e.x;
  moveBody(e, dt, g.gridsNear(e));
  const blocked = dir !== 0 && Math.abs(e.x - x0) < 0.2;
  e.stuck = blocked ? e.stuck + dt : 0;
  const wantsUp = target && target.cy < e.cy - 2.5 * TILE && Math.abs(target.cx - e.cx) < 8 * TILE;
  if (e.grounded && e.jumpCd <= 0 && (e.stuck > 0.15 || wantsUp)) {
    e.vy = e.kind === 'brute' ? -380 : -500;
    e.jumpCd = 0.7;
  }
  if (e.stuck > 1) batterRig(g, e, dt);

  if (target && (e.kind === 'crawler' || e.kind === 'brute') && e.fireCd <= 0 && overlaps(e, target)) {
    e.fireCd = 0.8;
    g.hurtPlayer(e.dmg, e.name, e.facing * 220);
  }
  if ((e.kind === 'crawler' || e.kind === 'brute') && e.fireCd <= 0 && e.stuck > 0.3) batterRig(g, e, 1);
}

function batterRig(g: Game, e: Enemy, dt: number): void {
  for (const r of g.sim.rigs) {
    if (r.team === e.team || r.wrecked) continue;
    const px = e.cx + e.facing * (e.w / 2 + 4);
    const py = e.y + e.h - 6;
    const { tx, ty } = r.toTile(px, py);
    const t = r.tileAt(tx, ty);
    if (t === RT.EMPTY) continue;
    const dmg = (e.kind === 'brute' ? 30 : 14) * (e.elite ? 1.5 : 1) * dt;
    r.damageTile(tx, ty, dmg);
    if (Math.random() < 0.2) g.sim.particles.add({ x: px, y: py, vx: (Math.random() - 0.5) * 100, vy: -80, life: 0.3, size: 2, color: '#ffab40', glow: true });
    if (t === RT.DOOR && Math.random() < dt) g.audio.play('clank', 0.4);
    e.fireCd = Math.max(e.fireCd, 0.2);
    return;
  }
}

function flyAI(g: Game, e: Enemy, target: { cx: number; cy: number } | null, dt: number): void {
  let tx = e.cx + Math.sin(e.t * 0.7) * 60, ty = e.cy + Math.cos(e.t) * 20;
  if (target) {
    tx = target.cx + Math.sin(e.t * 0.9) * 140;
    ty = target.cy - 120 + Math.cos(e.t * 1.3) * 30;
    e.facing = target.cx > e.cx ? 1 : -1;
    const d = Math.hypot(target.cx - e.cx, target.cy - e.cy);
    if (d < 26 * TILE && e.fireCd <= 0) {
      e.fireCd = 1.5 + Math.random() * 0.8;
      const a = Math.atan2(target.cy - e.cy, target.cx - e.cx) + (Math.random() - 0.5) * 0.1;
      e.aim = a;
      g.spawnProjectile({ x: e.cx, y: e.cy + 4, angle: a, speed: 460, dmg: e.dmg, team: 'hostile', kind: 'plasma', life: 1.6, color: '#ff4081', knock: 40 });
      g.audio.play('laser', 0.3);
    }
  }
  const dx = tx - e.cx, dy = ty - e.cy;
  const len = Math.hypot(dx, dy) || 1;
  const sp = Math.min(e.speed, len * 3);
  e.vx += ((dx / len) * sp - e.vx) * Math.min(1, dt * 3);
  e.vy += ((dy / len) * sp - e.vy) * Math.min(1, dt * 3);
  moveBody(e, dt, g.gridsNear(e), false);
}

/* ---------------------------------------------------------------------- */
/* Titan AI                                                                */
/* ---------------------------------------------------------------------- */

/** Titans are hunting targets: the player's rig if it is near, otherwise the player. */
function titanTarget(g: Game, e: Enemy): { x: number; y: number; w: number; h: number; rig: Rig | null } | null {
  const p = g.player;
  const pr = g.playerRig && g.sim.rigs.includes(g.playerRig) ? g.playerRig : null;
  if (pr && Math.abs(pr.cx - e.cx) < 110 * TILE) return { x: pr.x, y: pr.y, w: pr.widthPx, h: pr.heightPx + 26, rig: pr };
  if (!p.dead) return { x: p.x, y: p.y, w: p.w, h: p.h, rig: null };
  return null;
}

function groundTopUnder(world: World, x0: number, x1: number): number {
  let top = Infinity;
  for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
    if (tx < 0 || tx >= world.w) continue;
    top = Math.min(top, world.skyTop[tx] * TILE);
  }
  return Number.isFinite(top) ? top : world.h * TILE;
}

/** Damage a titan deals by slamming into something at (x, y). */
function titanImpact(g: Game, e: Enemy, x: number, y: number, radius: number, dmg: number): void {
  const t = titanTarget(g, e);
  if (t?.rig) t.rig.explode(x, y, radius, dmg);
  const p = g.player;
  if (!p.dead && Math.hypot(p.cx - x, p.cy - y) < radius + 20) g.hurtPlayer(dmg * 0.6, e.name, Math.sign(p.cx - x) * 400);
  g.sim.particles.burst(x, y, 24, { color: 'rgba(150,130,110,0.7)', speed: 260, life: 0.8, size: 5, drag: 2, shrink: false });
  g.camera.addShake(12);
  g.audio.play('explode', 0.6);
}

function titanAI(g: Game, e: Enemy, dt: number): void {
  const T = e.titan!;
  T.t += dt;
  T.attackCd -= dt;
  T.stompCd -= dt;
  const target = titanTarget(g, e);
  const world = g.sim.world;
  if (T.def.style === 'worm') return wormAI(g, e, target, dt);

  const tcx = target ? target.x + target.w / 2 : e.cx;
  const dx = tcx - e.cx;
  const gap = target ? Math.max(0, Math.abs(dx) - target.w / 2 - e.w / 2) : Infinity;
  e.facing = dx >= 0 ? 1 : -1;
  let speed = 0;
  if (T.def.style === 'walker') {
    if (gap > 4 * TILE) speed = e.speed * e.facing;
    if (target && gap < 6 * TILE && T.stompCd <= 0) {
      T.stompCd = 2.6;
      titanImpact(g, e, e.cx + e.facing * (e.w / 2 + 10), e.y + e.h - 20, 56, e.dmg * 1.6);
    }
  } else {
    // Beast: stalk, charge, recover.
    if (T.mode === 'stalk') {
      speed = gap > 18 * TILE ? e.speed * e.facing : gap < 10 * TILE ? -e.speed * 0.5 * e.facing : 0;
      if (target && gap < 26 * TILE && T.stompCd <= 0) {
        T.mode = 'charge';
        T.t = 0;
        T.dir = e.facing;
        g.toast(`${e.name} is charging!`, T.def.glow);
      }
    } else if (T.mode === 'charge') {
      speed = e.speed * 4 * T.dir;
      if (target && gap < TILE * 1.5) {
        titanImpact(g, e, e.cx + T.dir * e.w / 2, e.y + e.h * 0.6, 64, e.dmg * 2);
        T.mode = 'recover';
        T.t = 0;
        T.stompCd = 7;
      } else if (T.t > 3) {
        T.mode = 'recover';
        T.t = 0;
        T.stompCd = 5;
      }
    } else {
      speed = -e.speed * 0.8 * T.dir;
      if (T.t > 1.6) T.mode = 'stalk';
    }
  }
  e.x = Math.max(0, Math.min(world.w * TILE - e.w, e.x + speed * dt));
  T.step += Math.abs(speed) * dt;
  const ground = groundTopUnder(world, e.x + e.w * 0.2, e.x + e.w * 0.8);
  const wantY = ground - e.h;
  e.y += (wantY - e.y) * Math.min(1, dt * 6);

  // Ranged barrage
  if (target && T.attackCd <= 0 && gap < 45 * TILE) {
    T.attackCd = T.def.style === 'walker' ? 4 : 3.5;
    const n = T.def.style === 'walker' ? 3 : 4;
    const fx = e.cx + e.facing * e.w * 0.3, fy = e.y + e.h * (T.def.style === 'walker' ? 0.2 : 0.45);
    const tx = target.x + target.w / 2, ty = target.y + target.h / 2;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(tx - fx);
      const v = 520;
      const a = Math.atan2(ty - fy - dist * 0.35, tx - fx) + (Math.random() - 0.5) * 0.25;
      g.spawnProjectile({ x: fx, y: fy, angle: a, speed: v, dmg: e.dmg * 0.7, team: 'hostile', kind: T.def.style === 'walker' ? 'boulder' : 'spit', life: 4, gravity: 360, explosive: 30, tileDmg: 0.5, color: T.def.glow, knock: 200 });
    }
    g.audio.play('rocket', 0.7);
  }
}

function wormAI(g: Game, e: Enemy, target: { x: number; y: number; w: number; h: number } | null, dt: number): void {
  const T = e.titan!;
  const world = g.sim.world;
  const hx = e.cx, hy = e.cy;
  const surface = (world.skyTop[Math.max(0, Math.min(world.w - 1, Math.floor(hx / TILE)))] ?? 150) * TILE;
  if (T.mode === 'burrow') {
    T.burrowed = true;
    const tx = target ? target.x + target.w / 2 : hx + T.dir * 200;
    const dir = Math.sign(tx - hx) || 1;
    e.vx += (dir * e.speed - e.vx) * Math.min(1, dt * 2);
    const depth = surface + 10 * TILE;
    e.vy += (depth - hy) * dt * 3 - e.vy * dt * 2;
    if (Math.random() < 0.5) g.sim.particles.add({ x: hx, y: surface - 2, vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 80, life: 0.8, size: 4, color: 'rgba(170,140,100,0.7)', gravity: 300, shrink: false });
    if (target && Math.abs(tx - hx) < 9 * TILE && T.t > 2) {
      T.mode = 'emerge';
      T.t = 0;
      e.vy = -720;
      e.vx = dir * 260;
      g.toast(`${e.name} erupts from the ground!`, T.def.glow);
      g.camera.addShake(10);
    }
  } else {
    T.burrowed = false;
    e.vy += 700 * dt;
    // Bite anything the head passes through.
    if (T.stompCd <= 0 && target && hx > target.x - 20 && hx < target.x + target.w + 20 && hy > target.y - 20 && hy < target.y + target.h + 20) {
      T.stompCd = 0.45;
      titanImpact(g, e, hx, hy, 44, e.dmg);
    }
    if (hy > surface + 4 * TILE && e.vy > 0) {
      T.mode = 'burrow';
      T.t = 0;
    }
    if (T.attackCd <= 0 && target && e.vy < 0) {
      T.attackCd = 2.5;
      for (let i = 0; i < 5; i++) {
        const a = Math.atan2(target.y + target.h / 2 - hy, target.x + target.w / 2 - hx) + (i - 2) * 0.18;
        g.spawnProjectile({ x: hx, y: hy, angle: a, speed: 420, dmg: e.dmg * 0.4, team: 'hostile', kind: 'spit', life: 2, gravity: 200, explosive: 18, color: T.def.glow, knock: 80 });
      }
    }
  }
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  e.facing = e.vx >= 0 ? 1 : -1;
  // Body follows the head's path.
  const last = T.trail[0];
  if (!last || Math.hypot(last.x - e.cx, last.y - e.cy) > 6) T.trail.unshift({ x: e.cx, y: e.cy });
  const segs = T.def.segments ?? 12;
  if (T.trail.length > segs * 5) T.trail.length = segs * 5;
  e.parts = [];
  for (let i = 1; i <= segs; i++) {
    const p = T.trail[Math.min(T.trail.length - 1, i * 4)];
    if (!p) break;
    e.parts.push({ x: p.x, y: p.y, r: (e.w / 2) * (1 - i / (segs * 1.6)) });
  }
}

/* ---------------------------------------------------------------------- */
/* Spawning                                                                */
/* ---------------------------------------------------------------------- */

function spawnTick(g: Game, dt: number): void {
  g.timers.enemy -= dt;
  if (g.timers.enemy > 0) return;
  g.timers.enemy = 2.5 + Math.random() * 3;
  const p = g.player;
  if (p.dead) return;
  const s = g.sim;
  const world = s.world;
  const ptx = Math.floor(p.cx / TILE);
  const zi = zoneIndexAt(ptx);
  const threat = threatAt(world, ptx, Math.floor(p.cy / TILE));
  const night = g.dayTime > 0.72 || g.dayTime < 0.2;
  const cap = Math.floor((3 + threat * 1.6) * (night ? 1.4 : 1));
  const wild = s.enemies.filter((e) => e.kind !== 'trooper' && e.kind !== 'titan').length;
  if (wild >= cap) return;

  const side = Math.random() < 0.5 ? -1 : 1;
  const tx = ptx + side * (38 + Math.floor(Math.random() * 30));
  if (tx < 5 || tx >= world.w - 5) return;
  const surface = world.surface[ptx];
  const underground = p.cy / TILE > surface + 14;

  // Low tiers near camp; gunners, brutes and elites the farther out you go.
  const weights: [Exclude<EnemyKind, 'titan' | 'trooper'>, number][] = [
    ['crawler', Math.max(0.8, 4 - threat * 0.35)],
    ['drone', underground ? 0.5 : night ? 3 : 2],
    ['gunner', threat >= 1.4 ? 1 + threat * 0.35 : 0],
    ['brute', threat >= 2.2 ? 0.3 * threat : 0],
  ];
  const total = weights.reduce((a, w) => a + w[1], 0);
  let r = Math.random() * total;
  let kind: Exclude<EnemyKind, 'titan' | 'trooper'> = 'crawler';
  for (const [k, w] of weights) {
    r -= w;
    if (r <= 0) {
      kind = k;
      break;
    }
  }
  const elite = threat > 2.5 && Math.random() < Math.min(0.35, (threat - 2.5) * 0.09);

  let spawnY: number;
  if (underground) {
    const pty = Math.floor(p.cy / TILE);
    let found = -1;
    for (let k = 0; k < 40; k++) {
      const ty = pty - 20 + k;
      if (world.get(tx, ty) === 0 && world.get(tx, ty - 1) === 0 && world.get(tx, ty - 2) === 0 && TILES[world.get(tx, ty + 1)].solid) {
        found = ty + 1;
        break;
      }
    }
    if (found < 0) return;
    spawnY = found * TILE;
  } else {
    const top = world.skyTop[tx];
    if (TILES[world.get(tx, top)].liquid) return;
    spawnY = kind === 'drone' ? (top - 8 - Math.random() * 6) * TILE : top * TILE;
  }
  const x = (tx + 0.5) * TILE;
  if (g.rigAt(x, spawnY - 8)) return;
  s.enemies.push(makeEnemy(kind, zi, x, spawnY, threatAt(world, tx, Math.floor(spawnY / TILE)), elite));
}

/** Titans roam the outer wasteland. One at a time, and never near camp. */
function titanTick(g: Game, dt: number): void {
  g.timers.titan -= dt;
  if (g.timers.titan > 0) return;
  const s = g.sim;
  const p = g.player;
  const anchor = g.playerRig && s.rigs.includes(g.playerRig) ? g.playerRig : null;
  const ax = anchor ? anchor.cx : p.cx;
  const ptx = Math.floor(ax / TILE);
  const threat = threatAt(s.world, ptx, s.world.surface[ptx]);
  if (p.dead || threat < TITAN_THREAT || s.enemies.some((e) => e.kind === 'titan')) {
    g.timers.titan = 30;
    return;
  }
  g.timers.titan = 200 + Math.random() * 160;
  const zone = ZONES[zoneIndexAt(ptx)];
  const side = Math.random() < 0.5 ? -1 : 1;
  const tx = Math.max(10, Math.min(s.world.w - 10, ptx + side * (70 + Math.floor(Math.random() * 20))));
  const e = makeTitan(zone.key, (tx + 0.5) * TILE, s.world.skyTop[tx] * TILE, threatAt(s.world, tx, s.world.surface[tx]));
  s.enemies.push(e);
  g.toast(`The ground shakes... a ${e.name} is coming from the ${side > 0 ? 'east' : 'west'}!`, e.titan!.def.glow);
  g.audio.play('alarm');
  g.camera.addShake(6);
}

/** Drops a raider trooper out of a rig's door. */
export function deployTrooper(g: Game, r: Rig, towardX: number): void {
  let door: { tx: number; ty: number } | null = null;
  for (let ty = r.rows - 2; ty >= 0 && !door; ty--) {
    for (const tx of towardX > r.cx ? [r.cols - 1, 0] : [0, r.cols - 1]) {
      if (r.tileAt(tx, ty) === RT.DOOR) {
        door = { tx, ty };
        break;
      }
    }
  }
  const out = door ? (door.tx === 0 ? -1 : 1) : towardX > r.cx ? 1 : -1;
  const x = out > 0 ? r.x + r.widthPx + 10 : r.x - 10;
  const y = door ? r.y + (door.ty + 1) * TILE : r.y + (r.rows - 1) * TILE;
  const threat = threatAt(g.sim.world, Math.floor(r.cx / TILE), Math.floor(r.cy / TILE));
  const e = makeEnemy('trooper', r.zoneIndex, x, y, threat);
  e.homeRig = r;
  e.vx = out * 120;
  g.sim.enemies.push(e);
  g.sim.particles.burst(x, y - 14, 8, { color: '#ff5252', speed: 80, life: 0.3, glow: true, size: 2 });
}
