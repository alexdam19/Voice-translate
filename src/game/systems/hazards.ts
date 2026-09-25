import { TILE } from '../../shared/constants';
import type { Game } from '../game';

/** Environmental damage to the player, plus healing from rig facilities. */
export function updateHazards(g: Game, dt: number): void {
  const p = g.player;
  p.exposure = null;
  if (p.dead || g.sim.kind !== 'world') return;
  const hz = g.zone.hazard;
  const rig = g.aboardRig();
  if (hz) {
    const sheltered = !!rig && rig.isInterior(p.cx, p.cy) && rig.isProtected(hz);
    if (!sheltered && !p.protects(hz)) {
      p.exposure = hz;
      const surface = g.sim.world.surface[Math.floor(p.cx / TILE)] ?? 0;
      const deep = p.cy / TILE > surface + 25;
      const lvl = (1 + g.weather.strength * 0.8) * (deep ? 0.5 : 1);
      g.hurtPlayer(4 * lvl * dt, 'dot');
    }
  }
  if (rig) {
    for (const m of rig.modules) {
      if (m.def.medbay) {
        const c = rig.moduleCenter(m);
        if (Math.hypot(c.x - p.cx, c.y - p.cy) < 5 * TILE) p.hp = Math.min(p.maxHp, p.hp + 14 * dt * rig.powerRatio);
      } else if (m.def.quarters && rig.isInterior(p.cx, p.cy)) {
        p.hp = Math.min(p.maxHp, p.hp + 2.5 * dt);
      }
    }
  }
}
