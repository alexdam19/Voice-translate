import { describe, expect, it } from 'vitest';
import { focusFire } from '../src/game/systems/orders';
import { stepWorld } from '../src/game/systems/step';
import { game, outside } from './helpers';

const DT = 1 / 30;

describe('focused fire', () => {
  it('turns every gun in reach on the foe you click, without driving anywhere', () => {
    const g = outside(game());
    g.wave.t = 1e9;
    const p = g.player;
    // A big one ahead, a pack of small fry closer to the guns.
    const boss = g.spawnEnemy('d_sand_rat', p.x + Math.cos(p.rot) * 85, p.y + Math.sin(p.rot) * 85, 1);
    boss.hp = boss.maxHp = 1e7;
    for (let i = 0; i < 6; i++) {
      const e = g.spawnEnemy('d_sand_rat', p.x + Math.cos(p.rot + 1.6) * (40 + i * 3), p.y + Math.sin(p.rot + 1.6) * (40 + i * 3), 1);
      e.hp = e.maxHp = 1e7;
    }
    p.path = [];
    p.goal = null;
    expect(focusFire(g, boss.x, boss.y, boss.id)).toBe('set');
    for (let t = 0; t < 4; t += DT) stepWorld(g, DT);
    // Every gun that reaches it is on it, and it's taking the punishment.
    const reach = p.modules.filter((m) => m.weapon && m.stats && Math.hypot(boss.x - p.moduleWorld(m).x, boss.y - p.moduleWorld(m).y) <= m.stats.range);
    expect(reach.length).toBeGreaterThan(0);
    for (const m of reach) {
      const w = p.moduleWorld(m);
      const want = Math.atan2(boss.y - w.y, boss.x - w.x);
      expect(Math.abs(Math.atan2(Math.sin(m.aim - want), Math.cos(m.aim - want)))).toBeLessThan(0.35);
    }
    expect(boss.hp).toBeLessThan(1e7);
    // She didn't go chasing it.
    expect(p.path.length).toBe(0);
    // The mark rides on the foe, and clicking it again lifts it.
    expect(p.aimPoint?.id).toBe(boss.id);
    expect(focusFire(g, boss.x, boss.y, boss.id)).toBe('cleared');
    expect(p.aimPoint).toBeNull();
  });

  it('rakes a marked spot of ground, the heavy guns shelling it with nothing there', () => {
    const g = outside(game());
    g.wave.t = 1e9;
    const p = g.player;
    const x = p.x + Math.cos(p.rot) * 70, y = p.y + Math.sin(p.rot) * 70;
    focusFire(g, x, y);
    const n0 = g.projectiles.length;
    let toward = 0;
    for (let t = 0; t < 3; t += DT) {
      stepWorld(g, DT);
      for (const pr of g.projectiles) if (pr.team === 'player' && Math.hypot(pr.x - x, pr.y - y) < 40) toward++;
    }
    expect(g.projectiles.length + toward).toBeGreaterThan(n0);
    expect(toward).toBeGreaterThan(0);
    // It runs out on its own.
    for (let t = 0; t < 12; t += DT) stepWorld(g, DT);
    expect(p.aimPoint).toBeNull();
  });
});
