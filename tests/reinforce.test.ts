import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/game/save';
import { damageEnemy } from '../src/game/systems/damage';
import { callEscort, ESCORTS, escortCap, escortUnits } from '../src/game/systems/reinforce';
import { stepWorld } from '../src/game/systems/step';
import { game, outside } from './helpers';

const DT = 1 / 30;

describe('war XP and reinforcements', () => {
  it('kills earn war XP, which buys escorts up to the cap', () => {
    const g = outside(game());
    g.compound.siegeT = g.compound.trafficT = g.wave.t = 1e9;
    expect(g.warXp).toBe(0);
    const e = g.spawnEnemy('raider', g.player.x + 60, g.player.y, 1);
    damageEnemy(g, e, 1e9, { srcTank: g.player.id });
    expect(g.warXp).toBeGreaterThan(0);
    // Not enough yet for a walker.
    expect(callEscort(g, 'mantis').ok).toBe(false);
    g.warXp = 5000;
    expect(callEscort(g, 'mantis').ok).toBe(true);
    expect(g.warXp).toBe(5000 - ESCORTS.mantis.cost);
    expect(callEscort(g, 'warden').ok).toBe(true);
    // A fireteam is four bodies but one unit.
    expect(g.allies.filter((a) => a.escort === 'warden').length).toBe(4);
    expect(escortUnits(g).length).toBe(2);
    while (escortUnits(g).length < escortCap(g)) expect(callEscort(g, 'wasp').ok).toBe(true);
    const r = callEscort(g, 'wasp');
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/full/);
  });

  it('escorts keep pace with her at speed, and come back with a save', () => {
    const g = outside(game());
    g.compound.siegeT = g.compound.trafficT = g.wave.t = 1e9;
    g.warXp = 2000;
    expect(callEscort(g, 'raptor').ok).toBe(true);
    expect(callEscort(g, 'mantis').ok).toBe(true);
    const p = g.player;
    g.helm.lever = 1;
    for (let i = 0; i < 30 * 25; i++) stepWorld(g, DT);
    expect(Math.abs(p.speed)).toBeGreaterThan(10);
    for (const a of g.allies.filter((k) => k.escort)) expect(Math.hypot(a.x - p.x, a.y - p.y)).toBeLessThan(p.stats.length + 60);
    const back = deserialize(serialize(g));
    expect(Math.floor(back.warXp)).toBe(Math.floor(g.warXp));
    expect(escortUnits(back).map((u) => u.kind).sort()).toEqual(['mantis', 'raptor']);
  }, 30000);
});
