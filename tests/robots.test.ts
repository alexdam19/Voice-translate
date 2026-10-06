import { describe, expect, it } from 'vitest';
import { buildRobot, ROBOT_TIME, robotCap, updateRobots } from '../src/game/systems/robots';
import { deserialize, serialize } from '../src/game/save';
import { game, rich } from './helpers';

describe('Builder robots', () => {
  it('are cheap to make, each one an extra builder, and they keep', () => {
    const g = game();
    rich(g);
    const b0 = g.builders();
    const scrap = g.player.cargo.count('scrap');
    expect(buildRobot(g)).toBeNull();
    // Scrap only, and tapping again queues the next one.
    expect(g.player.cargo.count('scrap')).toBe(scrap - 20);
    expect(buildRobot(g)).toBeNull();
    expect(g.robotBuild?.queue).toBe(1);
    updateRobots(g, ROBOT_TIME - 1);
    expect(g.robots).toBe(0);
    updateRobots(g, 2);
    expect(g.robots).toBe(1);
    expect(g.builders()).toBe(b0 + 1);
    updateRobots(g, ROBOT_TIME + 1);
    expect(g.robots).toBe(2);
    expect(g.robotBuild).toBeNull();
    // Up to the cap.
    while (g.robots < robotCap(g)) {
      expect(buildRobot(g)).toBeNull();
      updateRobots(g, ROBOT_TIME + 1);
    }
    expect(buildRobot(g)).toMatch(/No room/);
    const g2 = deserialize(serialize(g));
    expect(g2.robots).toBe(g.robots);
  });

  it('cost scrap', () => {
    const g = game();
    g.player.cargo.remove('scrap', g.player.cargo.count('scrap'));
    expect(buildRobot(g)).toMatch(/scrap/);
  });
});
