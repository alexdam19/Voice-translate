import { describe, expect, it } from 'vitest';
import { updateCompactor } from '../src/game/systems/compactor';
import { OBS } from '../src/shared/map';
import { game, outside } from './helpers';

describe('Compactor', () => {
  it('opens its jaws, eats buildings and creatures ahead of the bow and spits out bales of scrap', () => {
    const g = outside(game());
    const p = g.player;
    const L = p.stats.length / 2;
    // A block of ruins right in front of the nose, and a few creatures.
    const cells: [number, number][] = [];
    for (let a = 2; a < 12; a++) for (let b = -10; b <= 10; b++) {
      const w = p.toWorld(L + a, b);
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      g.map.set(tx, ty, { obs: OBS.RUIN, oh: 6 });
      cells.push([tx, ty]);
    }
    const zeds = [0, 1, 2].map((i) => g.spawnEnemy('z_walker', p.toWorld(L + 6, -6 + i * 6).x, p.toWorld(L + 6, -6 + i * 6).y, 1));
    const scrap0 = p.cargo.count('scrap');
    g.helm.plow = true;
    // The jaws take a moment to open: nothing eaten yet.
    updateCompactor(g, 0.5);
    expect(g.helm.mouth).toBeLessThan(0.85);
    for (let i = 0; i < 40; i++) updateCompactor(g, 0.1);
    expect(g.helm.mouth).toBe(1);
    expect(cells.every(([x, y]) => !g.map.getObs(x, y))).toBe(true);
    expect(zeds.every((e) => e.hp <= 0)).toBe(true);
    expect(g.helm.bales).toBeGreaterThan(0);
    expect(p.cargo.count('scrap')).toBeGreaterThan(scrap0);
    // Shut, it eats nothing.
    g.helm.plow = false;
    for (let i = 0; i < 20; i++) updateCompactor(g, 0.1);
    expect(g.helm.mouth).toBe(0);
    const w = p.toWorld(L + 5, 0);
    g.map.set(Math.floor(w.x), Math.floor(w.y), { obs: OBS.RUIN, oh: 6 });
    for (let i = 0; i < 10; i++) updateCompactor(g, 0.1);
    expect(g.map.getObs(Math.floor(w.x), Math.floor(w.y))).toBe(OBS.RUIN);
  });
});
