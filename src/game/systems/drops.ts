import { GRAVITY, MAX_FALL, TILE } from '../../shared/constants';
import { moveBody } from '../../shared/physics';
import type { Game } from '../game';

export function updateDrops(g: Game, dt: number): void {
  const s = g.sim;
  const p = g.player;
  for (const d of s.drops) {
    d.age += dt;
    const dx = p.cx - (d.x + d.w / 2), dy = p.cy - (d.y + d.h / 2);
    const dist = Math.hypot(dx, dy);
    const canTake = !p.dead && d.age > 0.4 && p.inv.canFit(d.stack.id, 1);
    if (canTake && dist < 3.5 * TILE) {
      const sp = 520;
      d.vx += ((dx / dist) * sp - d.vx) * Math.min(1, dt * 10);
      d.vy += ((dy / dist) * sp - d.vy) * Math.min(1, dt * 10);
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (dist < 14) {
        const left = p.inv.add(d.stack.id, d.stack.n);
        const got = d.stack.n - left;
        if (got > 0) {
          g.ui.pickupNote(d.stack.id, got);
          g.audio.play('pickup');
        }
        d.stack.n = left;
      }
      continue;
    }
    d.vy = Math.min(d.vy + GRAVITY * dt, MAX_FALL);
    if (d.grounded) d.vx *= Math.exp(-dt * 8);
    moveBody(d, dt, g.gridsNear(d), false);
  }
  s.drops = s.drops.filter((d) => d.stack.n > 0 && d.age < 300 && d.y < s.world.h * TILE);
}
