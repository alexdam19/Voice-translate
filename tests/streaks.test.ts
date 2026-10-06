import { describe, expect, it } from 'vitest';
import { killEnemy } from '../src/game/systems/damage';
import { stepWorld } from '../src/game/systems/step';
import { startStreak, STREAKS, streakAim, streakSwitch, streakTrigger, updateStreaks } from '../src/game/systems/streaks';
import { deserialize, serialize } from '../src/game/save';
import { game, outside } from './helpers';

const DT = 1 / 30;

function earn(g: ReturnType<typeof game>, pts: number): void {
  const p = g.player;
  for (let i = 0; i < pts; i++) killEnemy(g, g.spawnEnemy('d_sand_rat', p.x + 300, p.y + 300, 1));
}

describe('killstreaks', () => {
  it('bank rewards as the kills mount, and bleed away when the killing stops', () => {
    const g = outside(game());
    g.wave.t = 1e9;
    earn(g, 29);
    expect(g.streak.ready).toEqual([]);
    earn(g, 1);
    expect(g.streak.ready).toEqual(['hellfire']);
    earn(g, 60);
    expect(g.streak.ready).toEqual(['hellfire', 'gunship']);
    // They keep across a save; the points bleed after a quiet spell.
    expect(deserialize(serialize(g)).streak.ready).toEqual(['hellfire', 'gunship']);
    const pts = g.streak.pts;
    for (let t = 0; t < 25; t += DT) updateStreaks(g, DT);
    expect(g.streak.pts).toBeLessThan(pts - 20);
  });

  it('the gunship: three guns, each with its own ammunition, shells landing a moment after the trigger', () => {
    const g = outside(game());
    g.wave.t = 1e9;
    const p = g.player;
    earn(g, STREAKS.gunship.pts);
    const x = p.x + Math.cos(p.rot) * 120, y = p.y + Math.sin(p.rot) * 120;
    const big = g.spawnEnemy('d_sand_rat', x, y, 1);
    big.hp = big.maxHp = 1e6;
    expect(startStreak(g, 'gunship')).toBeNull();
    expect(startStreak(g, 'gunship')).toMatch(/already|earned/);
    const a = g.streak.active!;
    streakAim(g, x, y);
    // The 105: six shells.
    streakSwitch(g, 2);
    for (let t = 0; t < 0.4; t += DT) stepWorld(g, DT);
    streakTrigger(g, true);
    expect(a.ammo[2]).toBe(STREAKS.gunship.weapons[2].ammo - 1);
    expect(big.hp).toBe(1e6);
    for (let t = 0; t < 2; t += DT) stepWorld(g, DT);
    expect(big.hp).toBeLessThan(1e6 - 1000);
    streakTrigger(g, false);
    // The 25 mm chain gun holds down.
    streakSwitch(g, 0);
    for (let t = 0; t < 0.3; t += DT) stepWorld(g, DT);
    streakTrigger(g, true);
    for (let t = 0; t < 2; t += DT) stepWorld(g, DT);
    streakTrigger(g, false);
    expect(a.ammo[0]).toBeLessThan(STREAKS.gunship.weapons[0].ammo - 10);
    // The feed runs out on its own.
    for (let t = 0; t < 40; t += DT) stepWorld(g, DT);
    expect(g.streak.active).toBeNull();
  });

  it('the Hellfire rides down to the crosshair and leaves a crater', () => {
    const g = outside(game());
    g.wave.t = 1e9;
    const p = g.player;
    earn(g, STREAKS.hellfire.pts);
    const x = p.x + Math.cos(p.rot) * 150, y = p.y + Math.sin(p.rot) * 150;
    const pack = [0, 1, 2, 3].map((i) => {
      const e = g.spawnEnemy('d_sand_rat', x + i * 4, y, 1);
      e.hp = e.maxHp = 500;
      return e;
    });
    startStreak(g, 'hellfire');
    for (let t = 0; t < 1; t += DT) {
      streakAim(g, x, y);
      stepWorld(g, DT);
    }
    streakTrigger(g, true);
    for (let t = 0; t < 8 && g.streak.active; t += DT) {
      streakAim(g, x, y);
      stepWorld(g, DT);
    }
    expect(g.streak.active).toBeNull();
    expect(pack.every((e) => e.hp <= 0)).toBe(true);
  });

  it('losing the Titan loses the streak but not what is banked', () => {
    const g = outside(game());
    earn(g, 40);
    expect(g.streak.pts).toBeGreaterThan(30);
    g.player.hp = 0;
    g.player.dead = true;
    for (let t = 0; t < 20 && g.player.dead; t += DT) stepWorld(g, DT);
    expect(g.streak.pts).toBe(0);
    expect(g.streak.ready).toContain('hellfire');
  });
});
