import { describe, expect, it } from 'vitest';
import { COLOSSI, colossusHealth, spawnColossus } from '../src/game/systems/colossus';
import { damageEnemy } from '../src/game/systems/damage';
import { stepWorld } from '../src/game/systems/step';
import { game } from './helpers';

const out = (g: ReturnType<typeof game>) => {
  const p = g.player;
  p.x += 300;
  p.y += 2600;
  g.gen.focus(p.x, p.y);
};

describe('colossi', () => {
  it('are bigger than a Titan', () => {
    const g = game();
    for (const d of Object.values(COLOSSI)) expect(Math.max(d.L, d.W)).toBeGreaterThan(g.player.stats.length);
  });

  it('a stock Titan cannot put one down quickly, and it hits hard', () => {
    const g = game();
    out(g);
    const p = g.player;
    const c = spawnColossus(g, 'behemoth', { x: p.x + 260, y: p.y });
    const h0 = colossusHealth(g, c).hp;
    let low = 1;
    for (let t = 0; t < 60; t += 1 / 30) {
      stepWorld(g, 1 / 30);
      low = Math.min(low, p.hp / p.stats.maxHp);
    }
    const h1 = colossusHealth(g, c).hp;
    console.log('COLOSSUS after 60s: health', (h1 / h0).toFixed(2), 'player lowest', low.toFixed(2), 'alive', g.colossi.length);
    expect(g.colossi.length).toBe(1);
    expect(h1).toBeLessThan(h0);
    expect(h1 / h0).toBeGreaterThan(0.5);
    expect(low).toBeLessThan(0.9);
  }, 60000);

  it('the core is armoured until two thirds of the weak points break; then it falls and pays out', () => {
    const g = game();
    out(g);
    const p = g.player;
    const c = spawnColossus(g, 'hivemother', { x: p.x + 800, y: p.y });
    const parts = c.parts.map((id) => g.enemies.find((e) => e.id === id)!);
    const core = parts[parts.length - 1];
    damageEnemy(g, core, 1e9, { srcTank: p.id });
    expect(core.hp).toBeGreaterThan(0);
    for (const e of parts.slice(0, 3)) damageEnemy(g, e, 1e9, { srcTank: p.id });
    stepWorld(g, 1 / 30);
    expect(c.open).toBe(true);
    const drops = g.pickups.length;
    damageEnemy(g, core, 1e9, { srcTank: p.id });
    stepWorld(g, 1 / 30);
    expect(c.dying).toBeGreaterThan(0);
    expect(g.pickups.length).toBeGreaterThan(drops);
    for (let t = 0; t < 6; t += 1 / 30) stepWorld(g, 1 / 30);
    expect(g.colossi.length).toBe(0);
  }, 30000);
});
