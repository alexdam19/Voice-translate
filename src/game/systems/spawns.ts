import { CENTER } from '../../shared/constants';
import { ZONE } from '../../shared/map';
import { threatAt } from '../../shared/mapgen';
import { eid } from '../entities';
import { TITAN_NAMES, TITAN_STYLE } from '../enemyDefs';
import type { Game } from '../game';
import { buildRaider } from '../templates';
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
    if (g.isVisible(x, y) && d < 22) continue;
    return { x, y };
  }
  return null;
}

export function updateSpawns(g: Game, dt: number): void {
  const p = g.player;
  if (p.dead) return;
  // Despawn stragglers far away.
  for (let i = g.enemies.length - 1; i >= 0; i--) {
    const e = g.enemies[i];
    if (e.camp || e.titan) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > 80) g.enemies.splice(i, 1);
  }
  for (let i = g.tanks.length - 1; i >= 0; i--) {
    const t = g.tanks[i];
    if (t.kind === 'raider' && (t.dead ? g.time - t.lastHitAt > 20 : Math.hypot(t.x - p.x, t.y - p.y) > 120)) g.tanks.splice(i, 1);
  }
  const threat = threatAt(p.x, p.y);
  const inCamp = Math.hypot(p.x - CENTER, p.y - CENTER) < SAFE_RADIUS;
  g.timers.spawn -= dt;
  if (g.timers.spawn <= 0) {
    g.timers.spawn = 2.2;
    const ambient = g.enemies.filter((e) => !e.camp && !e.titan).length;
    const target = inCamp ? 0 : Math.round(5 + threat * 2.4);
    if (ambient < target) {
      const pt = spawnPoint(g, 26, 38);
      if (pt) {
        const zone = g.map.zoneAt(pt.x, pt.y);
        const t = threatAt(pt.x, pt.y);
        const pack = 1 + Math.floor(Math.random() * (2 + t * 0.6));
        const kind = pickKind(t, zone);
        for (let k = 0; k < pack; k++) {
          const e = g.spawnEnemy(kind === 'mech' || kind === 'brute' ? kind : pickKind(t, zone), pt.x + (Math.random() - 0.5) * 4, pt.y + (Math.random() - 0.5) * 4, t, t >= 2.5 && Math.random() < 0.07);
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
      const pt = spawnPoint(g, 45, 60);
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
      const pt = spawnPoint(g, 45, 55);
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
