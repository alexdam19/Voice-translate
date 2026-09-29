import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/game/save';
import { orderAirlift, updateAirlift } from '../src/game/systems/airlift';
import { FUEL_MAX } from '../src/game/systems/titan';
import { game } from './helpers';

const run = (g: ReturnType<typeof game>, secs: number): void => {
  for (let i = 0; i < Math.round(secs * 10); i++) updateAirlift(g, 0.1);
};

describe('Mega Hangar airlift', () => {
  it('needs the Hangar raised on the radio first', () => {
    const g = game();
    g.give('scrap', 500, true);
    expect(orderAirlift(g, { supply: 'fuel' })).toMatch(/radio/);
    g.airlift.calling = 4;
    run(g, 5);
    expect(g.airlift.contact).toBe(true);
  });

  it('flies supplies out to the Titan and lowers them onto the deck', () => {
    const g = game();
    g.airlift.contact = true;
    g.give('scrap', 500, true);
    g.titan.fuel = FUEL_MAX / 4;
    const scrap = g.player.cargo.count('scrap');
    expect(orderAirlift(g, { supply: 'fuel' })).toBeNull();
    expect(g.player.cargo.count('scrap')).toBe(scrap - 70);
    expect(g.flights.length).toBe(1);
    // Move the Titan well away from the Hangar: the airship follows it.
    g.player.x += 3000;
    run(g, 60);
    expect(g.titan.fuel).toBeGreaterThan(FUEL_MAX / 4 + 500);
    expect(g.flights.every((f) => f.phase === 'back')).toBe(true);
  });

  it('refits never run out, cost more each level, and make the ship better (and survive a save)', () => {
    const g = game();
    g.airlift.contact = true;
    g.give('scrap', 20000, true);
    g.give('iron_plate', 500, true);
    g.give('circuit', 200, true);
    const hp0 = g.player.stats.maxHp;
    for (let k = 0; k < 3; k++) {
      expect(orderAirlift(g, { refit: 'plating' })).toBeNull();
      run(g, 30);
    }
    expect(g.player.refit.plating).toBe(3);
    expect(g.player.stats.maxHp).toBeGreaterThan(hp0 * 1.2);
    const d = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(d.player.refit.plating).toBe(3);
    expect(d.airlift.contact).toBe(true);
  });
});
