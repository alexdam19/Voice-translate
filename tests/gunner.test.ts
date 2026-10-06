import { describe, expect, it } from 'vitest';
import { gunAim, gunInfo, gunReload, gunsOf, gunSwitch, gunTrigger, leaveGun, magOf, magSize, takeGun } from '../src/game/systems/gunner';
import { stepWorld } from '../src/game/systems/step';
import { game, outside } from './helpers';

const DT = 1 / 30;

function quiet(): ReturnType<typeof game> {
  const g = outside(game());
  g.compound.siegeT = g.compound.trafficT = g.wave.t = 1e9;
  // Well out of reach of the base's own guns.
  g.player.x += 2500;
  g.player.troops = Math.max(g.player.troops, g.player.stats.bunks);
  return g;
}

describe('gunner', () => {
  it('takes a gun, turns it to the crosshair and fires its real rounds from a magazine', () => {
    const g = quiet();
    const p = g.player;
    expect(takeGun(g)).toBeNull();
    const gn = g.gunner!;
    const m = p.modules.find((k) => k.id === gn.id)!;
    expect(m.key).toBe('main_gun');
    // A target ahead; the crosshair on it.
    const ax = p.x + Math.cos(p.rot) * 70, ay = p.y + Math.sin(p.rot) * 70;
    const e = g.spawnEnemy('raider', ax, ay, 1);
    e.hp = e.maxHp = 1e6;
    e.vx = e.vy = 0;
    gunAim(g, e.x, e.y);
    const mag = magOf(g, m);
    expect(mag.mag).toBe(magSize(m));
    // Heavy guns fire one round a click: hold and nothing more comes after the first.
    gunTrigger(g, true);
    for (let i = 0; i < 30 * 3; i++) stepWorld(g, DT);
    expect(mag.mag).toBe(magSize(m) - 1);
    // Click, click, click: every press is a round until the magazine runs dry, and then it reloads itself.
    for (let n = 0; n < 12 && mag.mag > 0; n++) {
      gunTrigger(g, false);
      gunTrigger(g, true);
      for (let i = 0; i < 30 * 1.5; i++) {
        stepWorld(g, DT);
        e.x = ax;
        e.y = ay;
      }
    }
    expect(mag.mag).toBe(0);
    expect(gn.shots).toBe(magSize(m));
    expect(gunInfo(g)!.reload).toBeGreaterThan(0);
    expect(e.hp).toBeLessThan(1e6);
    expect(gn.hits).toBeGreaterThan(0);
    for (let i = 0; i < 30 * 5; i++) stepWorld(g, DT);
    expect(magOf(g, m).mag).toBe(magSize(m));
    gunTrigger(g, false);
  });

  it('light guns keep firing while the trigger is held, and R reloads a part-spent magazine', () => {
    const g = quiet();
    expect(takeGun(g)).toBeNull();
    const guns = gunsOf(g);
    const light = guns.findIndex((k) => k.key !== 'main_gun');
    expect(light).toBeGreaterThan(0);
    gunSwitch(g, 100 + light);
    const gn = g.gunner!;
    const m = g.player.modules.find((k) => k.id === gn.id)!;
    expect(m.key).not.toBe('main_gun');
    const pos = g.player.moduleWorld(m);
    gunAim(g, pos.x + 40, pos.y);
    gunTrigger(g, true);
    for (let i = 0; i < 30 * 2; i++) stepWorld(g, DT);
    gunTrigger(g, false);
    const left = magOf(g, m).mag;
    expect(left).toBeLessThan(magSize(m) - 2);
    if (left > 0) {
      gunReload(g);
      expect(magOf(g, m).reload).toBeGreaterThan(0);
    }
    for (let i = 0; i < 30 * 4; i++) stepWorld(g, DT);
    expect(magOf(g, m).mag).toBe(magSize(m));
  });

  it('confirms kills on the feed, and you step off the gun when you leave', () => {
    const g = quiet();
    const p = g.player;
    expect(takeGun(g)).toBeNull();
    // Only your gun shooting, so the kill is yours.
    for (const m of p.modules) if (m.id !== g.gunner!.id) m.weapon = null;
    const ax = p.x + Math.cos(p.rot) * 60, ay = p.y + Math.sin(p.rot) * 60;
    const e = g.spawnEnemy('raider', ax, ay, 1);
    e.hp = e.maxHp = 5;
    e.stun = 99;
    gunAim(g, e.x, e.y);
    // Click away until it drops (a heavy gun fires a round a click).
    for (let i = 0; i < 30 * 8 && e.hp > 0; i++) {
      if (i % 30 === 0) {
        gunTrigger(g, false);
        gunTrigger(g, true);
      }
      stepWorld(g, DT);
    }
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(g.gunner!.kills).toBe(1);
    expect(g.gunner!.killT).toBeGreaterThan(0);
    leaveGun(g);
    expect(g.gunner).toBeNull();
  });
});
