import { describe, expect, it } from 'vitest';
import { buyFrame, isDocked, useFrame } from '../src/game/campaign';
import { FRAMES } from '../src/game/frames';
import { deserialize, serialize } from '../src/game/save';
import { hullBlocked, gateXY } from '../src/game/systems/compound';
import { stepWorld } from '../src/game/systems/step';
import { game, levelTo, rich } from './helpers';

describe('the hull lineup', () => {
  it('starts in the Shark; the Titan Crawler is bought at the yard and is bigger and tougher', () => {
    const g = game();
    const p = g.player;
    expect(p.frame).toBe('shark');
    expect(g.frames).toEqual(['shark']);
    expect(isDocked(g)).toBe(true);
    const L0 = p.stats.length, W0 = p.stats.width, hp0 = p.stats.maxHp, H0 = p.deckY(0), turn0 = p.handling;
    // Locked behind commander level and the price.
    expect(buyFrame(g, 'titan').ok).toBe(false);
    levelTo(g, FRAMES.titan.level);
    expect(buyFrame(g, 'titan').ok).toBe(false);
    rich(g);
    p.cargo.add('scrap', 4000);
    const r = buyFrame(g, 'titan');
    expect(r.ok, r.msg).toBe(true);
    expect(g.frames).toContain('titan');
    expect(p.frame).toBe('titan');
    expect(p.stats.length).toBeCloseTo((L0 * FRAMES.titan.cell) / FRAMES.shark.cell, 0);
    expect(p.stats.width).toBeGreaterThan(W0);
    expect(p.deckY(0)).toBeGreaterThan(H0);
    expect(p.stats.maxHp).toBeGreaterThan(hp0 * 1.4);
    expect(p.handling).toBeLessThan(turn0);
    // Not shut in the hangar's walls.
    expect(hullBlocked(g, p)).toBe(false);
    // Swapping back to the Shark is free; owning a hull means you never pay twice.
    const scrap = p.cargo.count('scrap');
    expect(useFrame(g, 'shark').ok).toBe(true);
    expect(p.stats.length).toBeCloseTo(L0, 0);
    expect(buyFrame(g, 'titan').ok).toBe(true);
    expect(p.cargo.count('scrap')).toBe(scrap);
  });

  it('a bought hull is saved, and the big one still drives out of the gate', () => {
    const g = game();
    levelTo(g, FRAMES.dread.level);
    rich(g);
    g.player.cargo.add('scrap', 9000);
    g.player.cargo.add('titanium_alloy', 400);
    expect(buyFrame(g, 'dread').ok).toBe(true);
    const back = deserialize(serialize(g));
    expect(back.player.frame).toBe('dread');
    expect(back.frames).toContain('dread');
    expect(back.player.stats.length).toBeCloseTo(g.player.stats.length, 3);
    // Drive at the gate: it opens and she rolls out.
    const p = g.player;
    const gp = gateXY(g)!;
    g.compound.siegeT = g.compound.trafficT = g.wave.t = 1e9;
    p.x = gp.x;
    p.y = gp.y - p.stats.length / 2 - 60;
    p.rot = Math.PI / 2;
    expect(hullBlocked(g, p)).toBe(false);
    g.helm.lever = 0.35;
    let out = false;
    for (let i = 0; i < 30 * 90 && !out; i++) {
      stepWorld(g, 1 / 30);
      out = p.y - p.stats.length / 2 > gp.y + 60;
    }
    expect(out).toBe(true);
  }, 30000);
});
