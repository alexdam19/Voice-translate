import { CENTER, MAP_SIZE } from '../../shared/constants';
import { ZONE } from '../../shared/map';
import { threatAt } from '../../shared/mapgen';
import type { Game } from '../game';
import { pickKind } from './world';

/**
 * Horde waves, World War Z style. A calm spell, a warning that says where it's coming from, then a surge:
 * a wall of swarmers pours in from that side, sprinting, piling against the hull and climbing aboard.
 * Every wave is bigger than the last. Beat it and the next calm is a little shorter.
 */

/** Horde units alive at once (phones get fewer). */
export const MAX_HORDE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 220 : 340;
const FIRST_CALM = 100;
const WARNING = 8;

export const COMPASS = ['EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST', 'NORTH', 'NORTH-EAST'];

/** Screen-style compass name for a world direction (north is up the screen). */
export function compassName(a: number): string {
  const i = Math.round(((a % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8;
  return COMPASS[i];
}

/** How many come in wave `n` at a given threat. */
export function hordeSize(n: number, threat: number, inCamp: boolean): number {
  return Math.round((50 + 18 * n) * (0.7 + 0.22 * threat) * (inCamp ? 0.75 : 1));
}

export function hordeAlive(g: Game): number {
  let k = 0;
  for (const e of g.enemies) if (e.horde && e.hp > 0) k++;
  return k;
}

function spawnBatch(g: Game, count: number): void {
  const w = g.wave;
  const p = g.player;
  const ext = p.stats.length / 2;
  for (let i = 0; i < count; i++) {
    // A wide front, not a point: the horde comes as a wall.
    const a = w.dir + (Math.random() - 0.5) * 1.1;
    const d = ext + 42 + Math.random() * 14;
    const x = Math.max(4, Math.min(MAP_SIZE - 4, p.x + Math.cos(a) * d));
    const y = Math.max(4, Math.min(MAP_SIZE - 4, p.y + Math.sin(a) * d));
    const t = threatAt(x, y);
    const r = Math.random();
    let kind = 'swarmer';
    if (w.n >= 2 && r < 0.14) kind = 'leaper';
    else if (w.n >= 4 && r < 0.17) kind = 'bomber';
    else if (r > 0.95) {
      const z = g.map.zoneAt(x, y);
      kind = pickKind(t, z === ZONE.EDGE ? ZONE.RUSTBELT : z);
    }
    const e = g.spawnEnemy(kind, x, y, t, Math.random() < 0.01 * Math.min(8, w.n));
    e.horde = true;
    e.aggro = true;
    // Later waves are tougher and faster.
    e.maxHp = e.hp = e.hp * (1 + 0.06 * (w.n - 1));
    if (kind === 'swarmer') e.speed *= 1 + Math.min(0.25, 0.02 * w.n) + (Math.random() - 0.5) * 0.15;
    w.spawned++;
  }
}

export function updateWaves(g: Game, dt: number): void {
  const w = g.wave;
  const p = g.player;
  if (g.mode !== 'world') return;
  if (p.dead) {
    // The horde loses interest once the fortress is towed away.
    if (w.phase !== 'calm') {
      w.phase = 'calm';
      w.t = 45;
      for (const e of g.enemies) if (e.horde) e.hp = 0;
    }
    return;
  }
  w.t -= dt;
  if (w.phase === 'calm') {
    if (w.t > 0) return;
    w.n++;
    w.phase = 'warning';
    w.t = WARNING;
    // Mostly from open ground ahead or to the side; never twice from exactly the same place.
    w.dir = Math.random() * Math.PI * 2;
    const inCamp = Math.hypot(p.x - CENTER, p.y - CENTER) < 30;
    w.total = hordeSize(w.n, threatAt(p.x, p.y), inCamp);
    w.spawned = 0;
    w.batchT = 0;
    g.hooks.toast(`HORDE ${w.n} INCOMING from the ${compassName(w.dir)}: about ${w.total} of them. Get ready!`, '#ff5252');
    g.hooks.sound('alarm');
    return;
  }
  if (w.phase === 'warning') {
    if (w.t > 0) return;
    w.phase = 'surge';
    w.t = 0;
    g.hooks.sound('roar');
    g.fx.push({ t: 'shake', amt: 0.6 });
  }
  // Surge: pour them in over ~15 seconds, as fast as the cap allows.
  if (w.spawned < w.total) {
    w.batchT -= dt;
    if (w.batchT <= 0) {
      w.batchT = 0.2;
      const room = MAX_HORDE - hordeAlive(g);
      const n = Math.min(w.total - w.spawned, Math.max(0, room), Math.ceil(w.total / 70) + 2);
      if (n > 0) spawnBatch(g, n);
    }
    return;
  }
  const left = hordeAlive(g);
  if (left <= Math.max(3, Math.floor(w.total * 0.06))) {
    // Stragglers break and run.
    for (const e of g.enemies) if (e.horde) {
      e.horde = false;
      e.aggro = false;
      e.latch = null;
    }
    const xp = 20 + 8 * w.n;
    const scrap = 15 + 6 * w.n;
    g.give('scrap', scrap, true);
    g.gainXp(xp);
    if (w.n % 3 === 0) g.packs.push(w.n >= 9 ? 'rare_pack' : 'pack');
    g.stats.hordes = (g.stats.hordes ?? 0) + 1;
    g.objectiveCounters.hordes = (g.objectiveCounters.hordes ?? 0) + 1;
    g.hooks.toast(`HORDE ${w.n} REPELLED! +${xp} XP, +${scrap} scrap${w.n % 3 === 0 ? ', a card pack' : ''}.`, '#76ff03');
    g.hooks.sound('levelup');
    w.phase = 'calm';
    w.t = Math.max(38, 75 - w.n * 2.5);
  }
}

/** For the HUD: what the wave is doing right now. */
export function waveStatus(g: Game): { label: string; frac: number; urgent: boolean } | null {
  const w = g.wave;
  if (g.mode !== 'world' || g.player.dead) return null;
  if (w.phase === 'warning') return { label: `HORDE ${w.n} · ${compassName(w.dir)} · ${Math.ceil(w.t)}s`, frac: 1 - w.t / WARNING, urgent: true };
  if (w.phase === 'surge') {
    const left = hordeAlive(g) + (w.total - w.spawned);
    return { label: `HORDE ${w.n} · ${left} left`, frac: 1 - left / Math.max(1, w.total), urgent: true };
  }
  if (w.t < 20) return { label: `Next horde in ${Math.ceil(w.t)}s`, frac: 1 - w.t / 20, urgent: false };
  return null;
}

export { FIRST_CALM };
