import { GRAVITY, MAX_FALL, TILE } from '../../shared/constants';
import { moveBody, overlaps } from '../../shared/physics';
import { TILES } from '../../shared/tiles';
import { ZONES, zoneIndexAt } from '../../shared/zones';
import { Enemy, type EnemyKind } from '../entities';
import type { Game } from '../game';
import type { Rig } from '../rig';
import { RT } from '../rigDefs';

interface Stats {
  w: number;
  h: number;
  hp: number;
  dmg: number;
  speed: number;
  flying: boolean;
  loot: string;
}

const STATS: Record<EnemyKind, Stats> = {
  crawler: { w: 20, h: 12, hp: 28, dmg: 10, speed: 125, flying: false, loot: 'creature' },
  gunner: { w: 14, h: 28, hp: 36, dmg: 8, speed: 95, flying: false, loot: 'trooper' },
  drone: { w: 18, h: 12, hp: 22, dmg: 7, speed: 150, flying: true, loot: 'creature' },
  brute: { w: 26, h: 34, hp: 150, dmg: 22, speed: 62, flying: false, loot: 'creature' },
  trooper: { w: 14, h: 28, hp: 46, dmg: 10, speed: 105, flying: false, loot: 'trooper' },
};

export function makeEnemy(kind: EnemyKind, zoneIndex: number, x: number, y: number): Enemy {
  const z = ZONES[zoneIndex];
  const st = STATS[kind];
  const e = new Enemy(kind);
  const scaleHp = 1 + (z.difficulty - 1) * 0.5;
  const scaleDmg = 1 + (z.difficulty - 1) * 0.3;
  e.w = st.w;
  e.h = st.h;
  e.x = x - st.w / 2;
  e.y = y - st.h;
  e.hp = e.maxHp = Math.round(st.hp * scaleHp);
  e.dmg = st.dmg * scaleDmg;
  e.speed = st.speed * (0.9 + Math.random() * 0.2);
  e.flying = st.flying;
  e.loot = st.loot;
  e.tint = z.enemyTint;
  e.name = kind === 'trooper' ? 'Raider Trooper' : z.enemyNames[kind];
  return e;
}

export function updateEnemies(g: Game, dt: number): void {
  const s = g.sim;
  if (s.kind === 'world') spawnTick(g, dt);
  const p = g.player;
  for (const e of s.enemies) {
    if (e.dead) continue;
    e.t += dt;
    e.fireCd -= dt;
    e.jumpCd -= dt;
    e.hurtFlash -= dt;
    const dist = Math.hypot(p.cx - e.cx, p.cy - e.cy);
    const limit = e.kind === 'trooper' ? 220 * TILE : 120 * TILE;
    if (dist > limit) {
      e.dead = true;
      continue;
    }
    const target = !p.dead && dist < 60 * TILE ? p : null;
    if (e.flying) flyAI(g, e, target, dt);
    else groundAI(g, e, target, dt);

    // Liquids hurt everyone
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
        e.fireCd = 1.2 + Math.random() * 0.7;
        const a = Math.atan2(target.cy - (e.y + 9), dx) + (Math.random() - 0.5) * 0.12;
        e.aim = a;
        g.spawnProjectile({ x: e.cx, y: e.y + 9, angle: a, speed: 720, dmg: e.dmg, team: 'hostile', kind: 'bullet', life: 1.2, color: '#ff5252', knock: 60 });
        g.audio.play('pistol', 0.35);
      }
    } else {
      dir = Math.abs(dx) > 6 ? e.facing : 0;
    }
  } else {
    // wander
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
  // Boarders batter doors that keep them out.
  if (e.stuck > 1) batterRig(g, e, dt);

  if (target && (e.kind === 'crawler' || e.kind === 'brute') && e.fireCd <= 0 && overlaps(e, target)) {
    e.fireCd = 0.8;
    g.hurtPlayer(e.dmg, e.name, e.facing * 220);
  }
  // Crawlers chew on the player's rig plating.
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
    const dmg = (e.kind === 'brute' ? 30 : 14) * dt;
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

/* ------------------------------------------------------------------ */
/* Spawning                                                             */
/* ------------------------------------------------------------------ */

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
  const z = ZONES[zi];
  const night = g.dayTime > 0.72 || g.dayTime < 0.2;
  const nearSpawn = Math.abs(ptx - g.gen.spawnX) < 90;
  const cap = Math.floor((3 + z.difficulty * 2) * (night ? 1.5 : 1) * (nearSpawn ? 0.4 : 1));
  const wild = s.enemies.filter((e) => e.kind !== 'trooper').length;
  if (wild >= cap) return;

  const side = Math.random() < 0.5 ? -1 : 1;
  const tx = ptx + side * (38 + Math.floor(Math.random() * 30));
  if (tx < 5 || tx >= world.w - 5) return;
  const surface = world.surface[ptx];
  const underground = p.cy / TILE > surface + 14;

  const weights: [EnemyKind, number][] = [
    ['crawler', 4],
    ['gunner', underground ? 1 : 2],
    ['drone', underground ? 0.5 : night ? 3 : 2],
    ['brute', 0.35 * z.difficulty],
  ];
  const total = weights.reduce((a, w) => a + w[1], 0);
  let r = Math.random() * total;
  let kind: EnemyKind = 'crawler';
  for (const [k, w] of weights) {
    r -= w;
    if (r <= 0) {
      kind = k;
      break;
    }
  }

  let spawnY: number;
  if (underground) {
    const pty = Math.floor(p.cy / TILE);
    let found = -1;
    for (let k = 0; k < 40; k++) {
      const ty = pty - 20 + k;
      if (world.get(tx, ty) === 0 && world.get(tx, ty - 1) === 0 && TILES[world.get(tx, ty + 1)].solid) {
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
  s.enemies.push(makeEnemy(kind, zi, x, spawnY));
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
  const e = makeEnemy('trooper', r.zoneIndex, x, y);
  e.homeRig = r;
  e.vx = out * 120;
  g.sim.enemies.push(e);
  g.sim.particles.burst(x, y - 14, 8, { color: '#ff5252', speed: 80, life: 0.3, glow: true, size: 2 });
}
