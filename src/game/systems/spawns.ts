import { CENTER } from '../../shared/constants';
import { ZONE } from '../../shared/map';
import { REGION_INFO, threatAt, type Faction } from '../../shared/mapgen';
import { eid } from '../entities';
import { ENEMIES, pickFactionKind, TITAN_NAMES, TITAN_STYLE } from '../enemyDefs';
import type { Game } from '../game';
import { buildRaider, buildRival, RIVAL_NAMES } from '../templates';
import { featureLevel } from '../progress';
import type { Tank } from '../tank';
import { pickKind, spawnFor } from './world';

const SAFE_RADIUS = 30;

function spawnPoint(g: Game, minD: number, maxD: number): { x: number; y: number } | null {
  const p = g.player;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * (maxD - minD);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (Math.hypot(x - CENTER, y - CENTER) < SAFE_RADIUS) continue;
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
    if (e.camp || e.titan) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > (p.fortress ? 300 : 80) + ext) g.enemies.splice(i, 1);
  }
  for (let i = g.tanks.length - 1; i >= 0; i--) {
    const t = g.tanks[i];
    if (t.kind === 'raider' && (t.dead ? g.time - t.lastHitAt > 20 : Math.hypot(t.x - p.x, t.y - p.y) > (p.fortress ? 450 : 120))) g.tanks.splice(i, 1);
    else if (t.kind === 'rival' && (t.dead ? g.time - t.lastHitAt > 30 : Math.hypot(t.x - p.x, t.y - p.y) > (p.fortress ? 700 : 260))) g.tanks.splice(i, 1);
  }
  // Rival dreadnoughts: fortresses like yours, at your level, hunting you.
  g.timers.rival -= dt;
  if (g.timers.rival <= 0) {
    g.timers.rival = 200 + Math.random() * 90;
    const rivals = g.tanks.filter((t) => t.kind === 'rival' && !t.dead).length;
    if (!rivals && g.commander.level >= featureLevel('rivals') && Math.hypot(p.x - CENTER, p.y - CENTER) > SAFE_RADIUS) spawnRival(g);
  }
  const threat = threatAt(p.x, p.y);
  const inCamp = Math.hypot(p.x - CENTER, p.y - CENTER) < SAFE_RADIUS;
  g.timers.spawn -= dt;
  if (g.timers.spawn <= 0) {
    g.timers.spawn = 2.2;
    const ambient = g.enemies.filter((e) => !e.camp && !e.titan && !e.horde).length;
    // Regions are crawling with their faction; the longer you survive, the more there are.
    const here = g.gen.regionAt(p.x, p.y);
    const esc = Math.min(2.2, g.escalation());
    const target = inCamp ? 0 : Math.round((6 + threat * 2.6) * (here && here.kind !== 'mothership' ? 2 : 1) * esc);
    if (ambient < target) {
      const pt = spawnPoint(g, ext + far(p, 26, 80), ext + far(p, 42, 140));
      if (pt) {
        const zone = g.map.zoneAt(pt.x, pt.y);
        const t = threatAt(pt.x, pt.y);
        const faction = factionAt(g, pt.x, pt.y, zone);
        const pack = 1 + Math.floor(Math.random() * (2 + t * 0.7));
        const first = faction ? pickFactionKind(faction, t) : pickKind(t, zone);
        const heavy = ENEMIES[first].r > 0.9;
        for (let k = 0; k < pack; k++) {
          const kind = heavy && k === 0 ? first : faction ? pickFactionKind(faction, t) : pickKind(t, zone);
          const e = g.spawnEnemy(kind, pt.x + (Math.random() - 0.5) * 4, pt.y + (Math.random() - 0.5) * 4, t, t >= 2.5 && Math.random() < 0.07);
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
      const pt = spawnPoint(g, ext + far(p, 45, 120), ext + far(p, 60, 160));
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
    if (threat >= 3.4 && !g.enemies.some((e) => e.titan)) {
      const pt = spawnPoint(g, ext + far(p, 45, 140), ext + far(p, 55, 180));
      if (pt) {
        const zone = g.map.zoneAt(pt.x, pt.y);
        const kind = TITAN_STYLE[zone] ?? 'titan_walker';
        const t = threatAt(pt.x, pt.y);
        const e = g.spawnEnemy(kind, pt.x, pt.y, t);
        const names = TITAN_NAMES[kind];
        e.name = names[g.nextTitanName++ % names.length];
        e.aggro = true;
        g.hooks.toast(`The ground shakes... ${e.name} is coming.`, '#ff5252');
        g.hooks.sound('roar');
        g.fx.push({ t: 'shake', amt: 0.8 });
      }
    }
  }
  void eid;
  void spawnFor;
}

/**
 * Who holds a spot: the faction of the region it's in, otherwise the biome leans one way (the frozen north is full
 * of the dead, the magma west of the necropolis's servants...), otherwise the old wasteland mix (null).
 */
export function factionAt(g: Game, x: number, y: number, zone: number): Faction | null {
  const reg = g.gen.regionAt(x, y);
  if (reg && reg.kind !== 'mothership') return REGION_INFO[reg.kind].faction;
  const lean: Partial<Record<number, Faction>> = { [ZONE.CRYO]: 'zombie', [ZONE.MAGMA]: 'necro', [ZONE.GLASS]: 'cyborg', [ZONE.DUNES]: 'military', [ZONE.ACID]: 'monster', [ZONE.RUSTBELT]: 'raider' };
  const f = lean[zone];
  return f && Math.random() < 0.45 ? f : null;
}

/** Brings a rival dreadnought in from out of sight. Returns it (or null if there was no room). */
export function spawnRival(g: Game): Tank | null {
  const p = g.player;
  const ext = p.stats.length / 2;
  const pt = spawnPoint(g, ext + far(p, 70, 200), ext + far(p, 90, 260));
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
