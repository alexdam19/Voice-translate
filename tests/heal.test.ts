import { describe, expect, it } from 'vitest';
import { HEAL_CAP, healPlayer, refillHeal } from '../src/game/systems/damage';
import { updateBuffs } from '../src/game/systems/crewsys';
import { game } from './helpers';

describe('hull repair', () => {
  it('is capped: no stack of cards, kits and perks puts a wrecked hull back in seconds', () => {
    const g = game();
    const p = g.player;
    const max = p.stats.maxHp;
    p.hp = max * 0.2;
    // Every heal at once, as big as they come.
    p.addBuff('regen', 20, max * 0.05);
    const DT = 1 / 30;
    for (let t = 0; t < 5; t += DT) {
      refillHeal(g, DT);
      healPlayer(g, max, false);
      updateBuffs(g, DT);
    }
    expect(p.hp - max * 0.2).toBeLessThanOrEqual(max * HEAL_CAP * 7 + 1);
    expect(p.hp).toBeLessThan(max * 0.3);
  });
});
