import { describe, expect, it } from 'vitest';
import { autoDispatch, dispatchTeam, teamOn, updateTeams } from '../src/game/systems/crewops';
import { game } from './helpers';

describe('repair teams', () => {
  it('can be sent from a fresh start, with no reserve, by pulling hands off their posts', () => {
    const g = game();
    const p = g.player;
    expect(g.reserves).toBe(0);
    g.titan.fire[4] = 0.6;
    expect(dispatchTeam(g, 'fire', '4')).toBeNull();
    const t = teamOn(g, 'fire', '4')!;
    expect(t.n).toBe(6);
    expect(p.detached).toBeGreaterThanOrEqual(6);
    // They walk there, put it out and walk home; everyone is back on their post afterwards.
    for (let s = 0; s < 60 && g.teams.length; s += 0.1) updateTeams(g, 0.1);
    expect(g.titan.fire[4]).toBe(0);
    expect(g.teams.length).toBe(0);
    expect(p.detached).toBe(0);
  });

  it('AUTO damage control sends teams to the worst jobs by itself', () => {
    const g = game();
    g.player.cargo.add('scrap', 200);
    g.titan.fire[2] = 0.8;
    g.titan.crawlers[1] = 0.3;
    g.titan.systems.power = 0.4;
    expect(g.autoRepair).toBe(true);
    for (let s = 0; s < 8; s += 0.1) autoDispatch(g, 0.1);
    expect(teamOn(g, 'fire', '2')).toBeTruthy();
    expect(g.teams.length).toBeGreaterThanOrEqual(3);
    // With AUTO off nothing moves on its own.
    const h = game();
    h.autoRepair = false;
    h.titan.fire[2] = 0.8;
    for (let s = 0; s < 8; s += 0.1) autoDispatch(h, 0.1);
    expect(h.teams.length).toBe(0);
  });
});
