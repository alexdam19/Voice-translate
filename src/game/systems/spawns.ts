import { inCompound } from '../../shared/compound';
import { ZONE } from '../../shared/map';
import { REGION_INFO, threatAt } from '../../shared/mapgen';
import { ENEMIES, enemyScale, ZONE_ROSTER } from '../enemyDefs';
import type { Game } from '../game';
import { buildRaider, buildRival, RIVAL_NAMES } from '../templates';
import { featureLevel } from '../progress';
import type { Tank } from '../tank';
import { pickKind } from './world';

/** Nothing spawns this close to the Mega Hangar: the doors are guarded. */
const SAFE_RADIUS = 1200;

/** Is a spot inside the Mega Hangar's guarded perimeter (round the Hangar, and anywhere near the compound's wall)? */
export function nearHome(g: Game, x: number, y: number): boolean {
  const h = g.gen.hangar;
  return !!h && g.mode === 'world' && (Math.hypot(x - h.x, y - h.y) < SAFE_RADIUS || inCompound(x - h.x, y - h.y, 300));
}

/** Round the compound's wall (where hordes gather to get in)? */
function atWall(g: Game, x: number, y: number): boolean {
  const h = g.gen.hangar;
  return !!h && g.mode === 'world' && inCompound(x - h.x, y - h.y, 500);
}

function spawnPoint(g: Game, minD: number, maxD: number): { x: number; y: number } | null {
  const p = g.player;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * (maxD - minD);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (nearHome(g, x, y)) continue;
    const z = g.map.zoneAt(x, y);
    if (z === ZONE.EDGE || g.map.blocked(Math.floor(x), Math.floor(y), 'ground')) continue;
    if (g.isVisible(x, y) && d < 22 + p.stats.length / 2) continue;
    return { x, y };
  }
  return null;
}

/** Spawn distances past the hull: a Titan sees (and is seen) from much further off. */
const far = (p: Tank, small: number, titan: number): number => (p.fortress ? titan : small);

export function updateSpawns(g: Game, dt: number): void {
  const p = g.player;
  if (p.dead) return;
  // The fortress is big: measure spawn distances from its hull, not its middle.
  const ext = p.stats.length / 2;
  // Despawn stragglers far away.
  for (let i = g.enemies.length - 1; i >= 0; i--) {
    const e = g.enemies[i];
    if (e.camp || e.titan || e.boss) continue;
    // A siege keeps coming for the compound however far you are from it (until you're long gone); whatever is
    // clawing at the wall stays there while you're about.
    if ((e.siege || atWall(g, e.x, e.y)) && Math.hypot(e.x - p.x, e.y - p.y) < 3500) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > (p.fortress ? 700 : 80) + ext) g.enemies.splice(i, 1);
  }
  for (let i = g.tanks.length - 1; i >= 0; i--) {
    const t = g.tanks[i];
    if (t.kind === 'raider' && (t.dead ? g.time - t.lastHitAt > 20 : Math.hypot(t.x - p.x, t.y - p.y) > (p.fortress ? 900 : 120))) g.tanks.splice(i, 1);
    else if (t.kind === 'rival' && (t.dead ? g.time - t.lastHitAt > 30 : Math.hypot(t.x - p.x, t.y - p.y) > (p.fortress ? 1200 : 260))) g.tanks.splice(i, 1);
  }
  // Rival dreadnoughts: fortresses like yours, at your level, hunting you.
  g.timers.rival -= dt;
  if (g.timers.rival <= 0) {
    g.timers.rival = 200 + Math.random() * 90;
    const rivals = g.tanks.filter((t) => t.kind === 'rival' && !t.dead).length;
    if (!rivals && g.commander.level >= featureLevel('rivals') && !nearHome(g, p.x, p.y)) spawnRival(g);
  }
  const threat = threatAt(p.x, p.y);
  const inCamp = nearHome(g, p.x, p.y);
  g.timers.spawn -= dt;
  if (g.timers.spawn <= 0) {
    g.timers.spawn = 2.2;
    const ambient = g.enemies.filter((e) => !e.camp && !e.titan && !e.horde).length;
    // Hostile places are crawling with the zone's creatures; the longer you survive, the more there are.
    const here = g.gen.regionAt(p.x, p.y);
    const esc = Math.min(2.2, g.escalation());
    // Fewer of them than there used to be, but every one of them bigger and harder (see enemyScale).
    const target = inCamp ? 0 : Math.round((3 + threat * 1.3) * (here && REGION_INFO[here.kind].hostile ? 2 : 1) * esc);
    if (ambient < target) {
      const pt = spawnPoint(g, ext + far(p, 26, 260), ext + far(p, 42, 420));
      if (pt) {
        const zone = g.map.zoneAt(pt.x, pt.y);
        const t = threatAt(pt.x, pt.y);
        const first = pickKind(t, zone);
        // Small things come in packs; anything big comes alone or with a few hangers-on.
        const big = (ENEMIES[first].size ?? 1) >= 8;
        const pack = big ? 1 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * (1.5 + t * 0.6));
        const spread = Math.max(6, ENEMIES[first].r * enemyScale(ENEMIES[first]).r * 3);
        for (let k = 0; k < pack; k++) {
          const kind = k === 0 ? first : big ? ZONE_ROSTER[zone]?.[Math.floor(Math.random() * 2)] ?? first : first;
          const e = g.spawnEnemy(kind, pt.x + (Math.random() - 0.5) * spread, pt.y + (Math.random() - 0.5) * spread, t, t >= 2.5 && Math.random() < 0.07);
          if (Math.random() < 0.3) e.aggro = true;
        }
      }
    }
  }
  // Raider tanks: enemy bases on treads.
  g.timers.raider -= dt;
  if (g.timers.raider <= 0) {
    g.timers.raider = 55 + Math.random() * 40;
    const raiders = g.tanks.filter((t) => t.kind === 'raider' && !t.dead).length;
    if (!inCamp && threat >= 1.5 && raiders < 1 + Math.floor(threat / 2.5)) {
      const pt = spawnPoint(g, ext + far(p, 45, 380), ext + far(p, 60, 520));
      if (pt) {
        const t = buildRaider(threatAt(pt.x, pt.y), Math.floor(Math.random() * 1e9));
        t.x = pt.x;
        t.y = pt.y;
        t.rot = Math.atan2(p.y - pt.y, p.x - pt.x);
        for (const m of t.modules) m.aim = t.rot;
        g.tanks.push(t);
        g.hooks.toast('A raider tank is on your trail!', '#ff8a80');
      }
    }
  }
  // Titans roam the deep wastes.
  g.timers.titan -= dt;
  if (g.timers.titan <= 0) {
    g.timers.titan = 240 + Math.random() * 120;
    if (threat >= 2.4 && !inCamp && !g.enemies.some((e) => e.titan && !e.boss)) {
      const pt = spawnPoint(g, ext + far(p, 45, 450), ext + far(p, 55, 600));
      const zone = pt ? g.map.zoneAt(pt.x, pt.y) : ZONE.EDGE;
      const t = pt ? threatAt(pt.x, pt.y) : 1;
      // The zone's giants (20 m and up) that the spot is dangerous enough for.
      const giants = (ZONE_ROSTER[zone] ?? []).filter((k) => ENEMIES[k].titanStyle && ENEMIES[k].minThreat <= t + 1.5);
      if (pt && giants.length) {
        const kind = giants[Math.floor(Math.random() * Math.min(2, giants.length))];
        const e = g.spawnEnemy(kind, pt.x, pt.y, t);
        e.aggro = true;
        g.hooks.toast(`The ground shakes... ${e.name} is coming.`, '#ff5252');
        g.hooks.sound('roar');
      }
    }
  }
}

/** Brings a rival dreadnought in from out of sight. Returns it (or null if there was no room). */
export function spawnRival(g: Game): Tank | null {
  const p = g.player;
  const ext = p.stats.length / 2;
  const pt = spawnPoint(g, ext + far(p, 70, 500), ext + far(p, 90, 650));
  if (!pt) return null;
  // Your size, your guns: an even fight.
  const cc = p.stats.cc;
  const ws = p.weapons();
  const stars = ws.length ? ws.reduce((s, m) => s + (m.weapon?.rarity ?? 0), 0) / ws.length : 0;
  const name = RIVAL_NAMES[g.nextTitanName++ % RIVAL_NAMES.length];
  const t = buildRival(g.commander.level, cc, Math.floor(Math.random() * 1e9), name, { tech: g.tech, stars });
  t.x = pt.x;
  t.y = pt.y;
  t.rot = Math.atan2(p.y - pt.y, p.x - pt.x);
  for (const m of t.modules) m.aim = t.rot;
  g.tanks.push(t);
  g.hooks.toast(`RIVAL DREADNOUGHT: ${name} is hunting you. Beat it for an Epic pack.`, '#ff1744');
  g.hooks.sound('alarm');
  return t;
}
