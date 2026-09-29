import { describe, expect, it } from 'vitest';
import { CARDS, ENERGY_REGEN } from '../src/game/cards';
import { playCard } from '../src/game/systems/cards';
import { updateBuffs } from '../src/game/systems/crewsys';
import { HEAL_CAP, refillHeal } from '../src/game/systems/damage';
import { stepWorld } from '../src/game/systems/step';
import { game } from './helpers';

describe('balance', () => {
  it('healing cards patch the hull a little over a long time', () => {
    const g = game();
    const p = g.player;
    const max = p.stats.maxHp;
    p.hp = max * 0.3;
    g.hand[0] = 'weld';
    g.energy = 10;
    expect(playCard(g, 0, p.x, p.y).ok).toBe(true);
    for (let t = 0; t < 25; t += 1 / 30) {
      refillHeal(g, 1 / 30);
      updateBuffs(g, 1 / 30);
    }
    expect(p.hp / max - 0.3).toBeLessThan(0.07);
    expect(HEAL_CAP).toBeLessThanOrEqual(0.005);
    expect(CARDS.weld.cost).toBeGreaterThanOrEqual(4);
    // A 3-cost card every twelve seconds at best.
    expect(ENERGY_REGEN).toBeLessThanOrEqual(0.25);
  });

  it('a horde left alone at the hull tears it apart', () => {
    const g = game();
    const p = g.player;
    p.x += 300;
    p.y += 2600;
    g.gen.focus(p.x, p.y);
    for (const m of p.modules) m.weapon = null;
    p.recalc();
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      const e = g.spawnEnemy(i % 3 ? 'z_walker' : 'z_runner', p.x + Math.cos(a) * 140, p.y + Math.sin(a) * 140, 2);
      e.aggro = true;
      e.horde = true;
    }
    for (let t = 0; t < 45; t += 1 / 30) stepWorld(g, 1 / 30);
    expect(p.hp / p.stats.maxHp).toBeLessThan(0.6);
  }, 60000);

  it('a level-up does not repair the hull', () => {
    const g = game();
    const p = g.player;
    p.hp = p.stats.maxHp * 0.4;
    g.gainXp(1e5);
    expect(p.hp / p.stats.maxHp).toBeLessThan(0.45);
  });
});
