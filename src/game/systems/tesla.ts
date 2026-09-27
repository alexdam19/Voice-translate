import { levelMult, MODULES } from '../defs';
import type { Enemy } from '../entities';
import type { Game } from '../game';
import type { Tank } from '../tank';
import { damageEnemy } from './damage';

/**
 * Tesla Coils: about once a second each coil arcs into the creatures closest to it that are clinging to the
 * hull or pressed against it. Crowds are what they're for.
 */
export function updateTesla(g: Game, t: Tank, dt: number): void {
  if (t.dead) return;
  for (const m of t.modules) {
    if (!m.built || !MODULES[m.key].tesla) continue;
    m.cd -= dt * (0.4 + 0.6 * t.stats.powerRatio);
    if (m.cd > 0) continue;
    const pos = t.moduleWorld(m);
    const hits: Enemy[] = [];
    for (const e of g.enemiesNear(pos.x, pos.y, t.stats.length / 2 + 4)) {
      if (e.hp <= 0 || e.burrowed || e.titan) continue;
      if (e.latch ? e.latch.tank !== t.id : t.edgeDist(e.x, e.y) > 3) continue;
      if (t.team === 'enemy' && !e.latch) continue;
      hits.push(e);
    }
    if (!hits.length) {
      m.cd = 0.25;
      continue;
    }
    m.cd = 1.05;
    hits.sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y));
    const n = 2 + m.lvl;
    const dmg = 26 * levelMult(m.lvl) * (1 + t.crew.dmg);
    for (const e of hits.slice(0, n)) {
      const mx = (pos.x + e.x) / 2 + (Math.random() - 0.5) * 1.5, my = (pos.y + e.y) / 2 + (Math.random() - 0.5) * 1.5;
      g.fx.push({ t: 'bolt', pts: [{ x: pos.x, y: pos.y }, { x: mx, y: my }, { x: e.x, y: e.y }], color: '#80d8ff' });
      damageEnemy(g, e, dmg, { silent: true, srcTank: t.id, weapon: true });
      e.stun = Math.max(e.stun, 0.25);
    }
    g.hooks.sound('tesla', pos.x, pos.y, 0.4);
  }
}
