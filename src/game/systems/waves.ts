import { CENTER, MAP_SIZE } from '../../shared/constants';
import { ZONE } from '../../shared/map';
import { REGION_INFO, threatAt, type Faction } from '../../shared/mapgen';
import { ENEMIES, FACTION_UNITS } from '../enemyDefs';
import type { Game } from '../game';

/**
 * Horde waves, World War Z style. A calm spell, a warning that says where it's coming from, then a surge: for a
 * minute or more, a flood pours in from that side (from the nearest enemy region, and it's that faction), sprinting,
 * piling against the hull and climbing aboard. Every wave lasts longer, comes thicker and brings heavier things;
 * every third one brings a boss. The longer you survive, the stronger they get.
 */

/** Horde units alive at once (phones get fewer). */
export const MAX_HORDE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 420 : 900;
const FIRST_CALM = 100;
const WARNING = 10;

export const COMPASS = ['EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST', 'NORTH', 'NORTH-EAST'];

/** Screen-style compass name for a world direction (north is up the screen). */
export function compassName(a: number): string {
  const i = Math.round(((a % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8;
  return COMPASS[i];
}

/** How long wave `n` surges for (seconds). */
export function surgeTime(n: number): number {
  return Math.min(180, 50 + 9 * n);
}

/** How many per second pour in during wave `n`. */
export function surgeRate(n: number, threat: number, inCamp: boolean, esc = 1): number {
  return (2 + 1.5 * n) * (0.7 + 0.22 * threat) * (inCamp ? 0.7 : 1) * Math.min(2.5, esc);
}

/** About how many come in wave `n` in total. */
export function hordeSize(n: number, threat: number, inCamp: boolean, esc = 1): number {
  return Math.round(surgeRate(n, threat, inCamp, esc) * surgeTime(n));
}

export function hordeAlive(g: Game): number {
  let k = 0;
  for (const e of g.enemies) if (e.horde && e.hp > 0) k++;
  return k;
}

/** Where the next horde comes from: the nearest enemy region, or whatever the land around you breeds. */
function hordeSource(g: Game): { dir: number; faction: Faction; from: string } {
  const p = g.player;
  let best: { d: number; a: number; f: Faction; name: string } | null = null;
  for (const r of g.gen.regions) {
    if (r.kind === 'mothership') continue;
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d < 1500 && (!best || d < best.d)) best = { d, a: Math.atan2(r.y - p.y, r.x - p.x), f: REGION_INFO[r.kind].faction, name: r.name };
  }
  // Minor regions nearby count too.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const reg = g.gen.regionAt(p.x + Math.cos(a) * 250, p.y + Math.sin(a) * 250);
    if (reg && reg.kind !== 'mothership' && !reg.major) {
      const d = Math.hypot(reg.x - p.x, reg.y - p.y);
      if (!best || d < best.d) best = { d, a: Math.atan2(reg.y - p.y, reg.x - p.x), f: REGION_INFO[reg.kind].faction, name: reg.name };
    }
  }
  if (best) return { dir: best.a + (Math.random() - 0.5) * 0.6, faction: best.f, from: best.name };
  const dir = Math.random() * Math.PI * 2;
  const z = g.map.zoneAt(p.x + Math.cos(dir) * 60, p.y + Math.sin(dir) * 60);
  const lean: Partial<Record<number, Faction>> = { [ZONE.CRYO]: 'zombie', [ZONE.MAGMA]: 'necro', [ZONE.GLASS]: 'cyborg', [ZONE.DUNES]: 'military', [ZONE.ACID]: 'monster' };
  return { dir, faction: lean[z] ?? 'monster', from: '' };
}

function spawnPoint(g: Game, dir: number, spread: number): { x: number; y: number } {
  const p = g.player;
  const ext = p.stats.length / 2;
  const a = dir + (Math.random() - 0.5) * spread;
  // Out past the edge of sight, so the wall of them comes over the horizon.
  const d = ext + (p.fortress ? 110 + Math.random() * 30 : 44 + Math.random() * 16);
  return {
    x: Math.max(4, Math.min(MAP_SIZE - 4, p.x + Math.cos(a) * d)),
    y: Math.max(4, Math.min(MAP_SIZE - 4, p.y + Math.sin(a) * d)),
  };
}

function spawnOne(g: Game, kind: string, elite = false): void {
  const w = g.wave;
  const { x, y } = spawnPoint(g, w.dir, 1.2);
  const t = threatAt(x, y);
  const e = g.spawnEnemy(kind, x, y, t, elite || Math.random() < 0.008 * Math.min(10, w.n));
  e.horde = true;
  e.aggro = true;
  // Later waves are tougher and faster.
  e.maxHp = e.hp = e.hp * (1 + 0.06 * (w.n - 1));
  if (ENEMIES[kind].r < 0.45 && !ENEMIES[kind].flying) e.speed *= 1 + Math.min(0.25, 0.02 * w.n) + (Math.random() - 0.5) * 0.15;
  w.spawned++;
}

/** One horde runner of the wave's faction (sometimes a flyer, a leaper or a burster). */
function hordeKind(g: Game): string {
  const w = g.wave;
  const u = FACTION_UNITS[w.faction];
  const r = Math.random();
  if (u.flyer && w.n >= 3 && r < 0.04) return u.flyer;
  if (w.faction === 'monster' && w.n >= 2 && r < 0.2) return 'leaper';
  if (w.n >= 4 && r > 0.93) return w.faction === 'zombie' ? 'z_bloater' : 'bomber';
  return u.horde[Math.floor(Math.random() * u.horde.length)];
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
    const src = hordeSource(g);
    w.dir = src.dir;
    w.faction = src.faction;
    const inCamp = Math.hypot(p.x - CENTER, p.y - CENTER) < 30;
    w.rate = surgeRate(w.n, threatAt(p.x, p.y), inCamp, g.escalation());
    w.dur = surgeTime(w.n);
    w.total = Math.round(w.rate * w.dur);
    w.spawned = 0;
    w.batchT = 0;
    w.elapsed = 0;
    w.bossDone = false;
    const boss = w.n % 3 === 0;
    g.hooks.toast(`HORDE ${w.n}: ${FACTION_UNITS[w.faction].name} ${src.from ? `from ${src.from} ` : ''}in the ${compassName(w.dir)}. About ${w.total} of them over ${Math.round(w.dur)}s${boss ? ', and a BOSS' : ''}. Get ready!`, '#ff5252');
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
  // Surge: pour them in for the whole surge time, as fast as the cap allows.
  w.elapsed += dt;
  if (w.elapsed < w.dur) {
    w.batchT -= dt;
    if (w.batchT <= 0) {
      w.batchT = 0.25;
      const room = MAX_HORDE - hordeAlive(g);
      // Thicker as the surge peaks.
      const peak = 0.6 + 0.8 * Math.sin(Math.PI * Math.min(1, w.elapsed / w.dur));
      const n = Math.min(Math.max(0, room), Math.max(1, Math.round(w.rate * 0.25 * peak + Math.random())));
      for (let i = 0; i < n; i++) spawnOne(g, hordeKind(g));
      // Heavies every 12 seconds from wave 2.
      if (w.n >= 2 && Math.floor((w.elapsed - dt) / 12) !== Math.floor(w.elapsed / 12)) {
        const u = FACTION_UNITS[w.faction];
        for (let i = 0; i < Math.min(4, 1 + Math.floor(w.n / 4)); i++) spawnOne(g, u.heavy[Math.floor(Math.random() * u.heavy.length)], w.n >= 5);
      }
      // Every third wave: the boss arrives a third of the way in.
      if (w.n % 3 === 0 && !w.bossDone && w.elapsed > w.dur * 0.33) {
        w.bossDone = true;
        const kind = FACTION_UNITS[w.faction].boss;
        const { x, y } = spawnPoint(g, w.dir, 0.3);
        const e = g.spawnEnemy(kind, x, y, threatAt(x, y));
        e.horde = true;
        e.aggro = true;
        // A horde boss is a lieutenant: half the health of the one in its stronghold.
        e.maxHp = e.hp = e.hp * 0.5 * (1 + 0.05 * w.n);
        e.dmg *= 0.6;
        e.name = `${ENEMIES[kind].name} (horde)`;
        g.hooks.toast(`BOSS: ${ENEMIES[kind].name} leads the horde!`, '#ff1744');
        g.hooks.sound('roar');
        g.fx.push({ t: 'shake', amt: 1 });
      }
    }
    return;
  }
  const left = hordeAlive(g);
  const over = w.elapsed > w.dur + 45;
  if (left <= Math.max(3, Math.floor(w.spawned * 0.05)) || over) {
    // Stragglers break and run.
    for (const e of g.enemies) {
      if (!e.horde || e.boss) continue;
      e.horde = false;
      e.aggro = false;
      e.latch = null;
    }
    const xp = 30 + 12 * w.n;
    const scrap = 20 + 8 * w.n;
    g.give('scrap', scrap, true);
    g.gainXp(xp);
    if (w.n % 2 === 0) g.packs.push(w.n >= 10 ? 'epic_pack' : w.n >= 6 ? 'rare_pack' : 'pack');
    g.stats.hordes = (g.stats.hordes ?? 0) + 1;
    g.objectiveCounters.hordes = (g.objectiveCounters.hordes ?? 0) + 1;
    g.hooks.toast(`HORDE ${w.n} SURVIVED! +${xp} XP, +${scrap} scrap${w.n % 2 === 0 ? ', a card pack' : ''}. They'll be stronger next time.`, '#76ff03');
    g.hooks.sound('levelup');
    w.phase = 'calm';
    w.t = Math.max(35, 80 - w.n * 3);
  }
}

/** For the HUD: what the wave is doing right now. */
export function waveStatus(g: Game): { label: string; frac: number; urgent: boolean } | null {
  const w = g.wave;
  if (g.mode !== 'world' || g.player.dead) return null;
  if (w.phase === 'warning') return { label: `HORDE ${w.n} · ${compassName(w.dir)} · ${Math.ceil(w.t)}s`, frac: 1 - w.t / WARNING, urgent: true };
  if (w.phase === 'surge') {
    const alive = hordeAlive(g);
    const t = Math.max(0, w.dur - w.elapsed);
    return { label: t > 0 ? `HORDE ${w.n} · ${alive} on you · ${Math.ceil(t)}s left` : `HORDE ${w.n} · ${alive} left`, frac: Math.min(1, w.elapsed / w.dur), urgent: true };
  }
  if (w.t < 20) return { label: `Next horde in ${Math.ceil(w.t)}s`, frac: 1 - w.t / 20, urgent: false };
  return null;
}

export { FIRST_CALM };
