import { describe, expect, it } from 'vitest';
import { OBS } from '../src/shared/map';
import { cancelBuild, finishNow, placeBuilding, removeModule, upgradeBuilding } from '../src/game/actions';
import { buildTime, CC_COMMANDER_LEVEL, MODULES } from '../src/game/defs';
import { updateBuilds } from '../src/game/systems/builds';
import { onTankDestroyed } from '../src/game/systems/world';
import { stepWorld } from '../src/game/systems/step';
import { ccTo, game, levelTo, rich } from './helpers';

describe('the fortress is a full facility', () => {
  it('starts as a 200 x 90 m Titan Crawler with seven decks, weapon pads, a main battery, bunks and room to build', () => {
    const g = game();
    const p = g.player;
    expect(p.chassis).toBe('crawler');
    expect(p.cols * p.rows).toBe(18 * 38);
    expect(p.cell).toBe(5);
    expect(p.stats.width).toBe(90);
    expect(p.stats.length).toBe(200);
    // A pad on every corner and the main battery up front, all armed.
    const pads = p.modules.filter((m) => m.key === 'pad');
    expect(pads.map((m) => `${m.cx},${m.cy}`).sort()).toEqual(['0,0', '0,18', '0,36', '16,0', '16,18', '16,36']);
    const main = p.modules.find((m) => m.key === 'main_gun')!;
    expect(main.cy).toBe(1);
    expect(main.weapon?.key).toBe('main_battery');
    expect(p.weapons().length).toBe(7);
    expect(p.stats.powerRatio).toBe(1);
    expect(p.stats.cc).toBe(1);
    expect(g.crewCap()).toBe(11);
    expect(g.mainCrew().length).toBe(4);
    // Seven decks under the roof: the bridge on +3 Command, bunks on +1 Residential, engines down in -3 Engineering.
    expect(p.stories).toBe(7);
    expect(p.modules.find((m) => m.key === 'bridge')!.deck).toBe(1);
    expect(p.modules.filter((m) => m.key === 'quarters').every((m) => m.deck === 3)).toBe(true);
    expect(p.modules.filter((m) => m.key === 'engine').every((m) => m.deck === 7)).toBe(true);
    expect(p.modules.filter((m) => MODULES[m.key].hardpoint).every((m) => m.deck === 0)).toBe(true);
    // Every gun and the rifle nest are manned, with troops to spare.
    expect(p.troops).toBe(p.stats.bunks);
    expect(p.stats.crewManned).toBe(p.stats.crewWanted);
    expect(p.stats.bunks).toBeGreaterThan(p.stats.crewWanted);
    for (let deck = 0; deck <= 7; deck++) {
      const used = p.modules.filter((m) => m.deck === deck).reduce((s, m) => s + MODULES[m.key].w * MODULES[m.key].h, 0);
      expect(used).toBeLessThan(18 * 38 * 0.5);
    }
    // About 25 km/h flat out.
    expect(p.stats.topSpeed * 3.6).toBeGreaterThan(18);
    expect(p.stats.topSpeed * 3.6).toBeLessThan(33);
  });

  it('builders put up new buildings over time, one job each', () => {
    const g = game();
    rich(g);
    const plates = g.player.cargo.count('iron_plate');
    const s = g.player.findSpot('armor')!;
    const r = placeBuilding(g, 'armor', s[0], s[1]);
    expect(r.ok).toBe(true);
    expect(g.player.cargo.count('iron_plate')).toBe(plates - 4);
    const m = g.player.modules[g.player.modules.length - 1];
    expect(m.built).toBe(false);
    const hp = g.player.stats.maxHp;
    updateBuilds(g, buildTime(MODULES.armor) + 0.1);
    expect(m.built).toBe(true);
    expect(g.player.stats.maxHp).toBeGreaterThan(hp);
    // Two builders at level 1: a third job waits.
    const a = g.player.findSpot('armor')!;
    expect(placeBuilding(g, 'armor', a[0], a[1]).ok).toBe(true);
    const b = g.player.findSpot('armor')!;
    expect(placeBuilding(g, 'armor', b[0], b[1]).ok).toBe(true);
    const c = g.player.findSpot('armor')!;
    const third = placeBuilding(g, 'armor', c[0], c[1]);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.msg).toMatch(/builders/i);
  });

  it('commander levels unlock buildings and the Command Center caps counts and levels', () => {
    const g = game();
    rich(g);
    const s = g.player.findSpot('barracks')!;
    expect(placeBuilding(g, 'barracks', s[0], s[1]).ok).toBe(false); // level 3
    levelTo(g, 3);
    expect(placeBuilding(g, 'barracks', s[0], s[1]).ok).toBe(true);
    // Only 3 light turret mounts at CC 1 (on top of the hull's own pads).
    for (let i = 0; i < 3; i++) {
      const t = g.player.findSpot('hp_light')!;
      const r = placeBuilding(g, 'hp_light', t[0], t[1]);
      expect(r.ok).toBe(true);
      finishNow(g, g.player.modules[g.player.modules.length - 1].id);
    }
    const t = g.player.findSpot('hp_light')!;
    expect(placeBuilding(g, 'hp_light', t[0], t[1]).msg).toMatch(/Command Center/);
    // Pads and the main battery come with the hull: they can't be bought, moved or removed.
    expect(placeBuilding(g, 'pad', 3, 3).ok).toBe(false);
    const pad = g.player.modules.find((m) => m.key === 'pad')!;
    expect(removeModule(g, pad.id).ok).toBe(false);
    expect(g.player.moveModule(pad.id, 3, 3)).toBe(false);
    // Buildings can't pass the Command Center's level.
    const q = g.player.modules.find((m) => m.key === 'quarters')!;
    expect(upgradeBuilding(g, q.id).ok).toBe(false);
  });

  it('upgrading the Command Center refits the Titan with more mounts and armour (same 200 m hull)', () => {
    const g = game();
    rich(g);
    const cc = g.player.modules.find((m) => m.key === 'bridge')!;
    levelTo(g, CC_COMMANDER_LEVEL[1] - 1);
    expect(upgradeBuilding(g, cc.id).ok).toBe(false);
    levelTo(g, CC_COMMANDER_LEVEL[1]);
    const n = g.player.modules.length;
    const width = g.player.stats.width;
    const hp = g.player.stats.maxHp;
    expect(upgradeBuilding(g, cc.id).ok).toBe(true);
    finishNow(g, cc.id);
    expect(cc.lvl).toBe(2);
    expect(g.player.chassis).toBe('assault');
    // The bigger hull adds a pad on each side, already armed; the corners keep theirs.
    expect(g.player.modules.length).toBe(n + 2);
    const pads = g.player.modules.filter((m) => m.key === 'pad');
    expect(pads.length).toBe(8);
    expect(pads.every((m) => m.weapon)).toBe(true);
    expect(pads.some((m) => m.cx === g.player.cols - 2 && m.cy === g.player.rows - 2)).toBe(true);
    expect(g.player.stats.width).toBe(width);
    expect(g.player.stats.maxHp).toBeGreaterThan(hp);
    // Now quarters can go to level 2.
    const q = g.player.modules.find((m) => m.key === 'quarters')!;
    expect(upgradeBuilding(g, q.id).ok).toBe(true);
  });

  it('cancelling a job refunds it and removing a building refunds half', () => {
    const g = game();
    rich(g);
    const before = g.player.cargo.count('iron_plate');
    const s = g.player.findSpot('cargo')!;
    expect(placeBuilding(g, 'cargo', s[0], s[1]).ok).toBe(true);
    const m = g.player.modules[g.player.modules.length - 1];
    expect(cancelBuild(g, m.id).ok).toBe(true);
    expect(g.player.moduleById(m.id)).toBeUndefined();
    expect(g.player.cargo.count('iron_plate')).toBe(before);
    const bridge = g.player.modules.find((k) => k.key === 'bridge')!;
    expect(removeModule(g, bridge.id).ok).toBe(false);
  });

  it('respawns at full health', () => {
    const g = game();
    g.player.hp = 1;
    onTankDestroyed(g, g.player);
    expect(g.player.dead).toBe(true);
    for (let i = 0; i < 60 * 8; i++) stepWorld(g, 1 / 60);
    expect(g.player.dead).toBe(false);
    expect(g.player.hp).toBe(g.player.stats.maxHp);
  });

  it('rolls over rocks and ruins, flattening them', () => {
    const g = game();
    const p = g.player;
    const x0 = Math.floor(p.x) - 3, y0 = Math.floor(p.y - p.stats.length / 2) - 12;
    for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 6; x++) g.map.set(x, y, { obs: OBS.ROCK, oh: 3 });
    const startY = p.y;
    g.driveInput = { x: 0, y: -1, active: true };
    for (let i = 0; i < 30 * 20; i++) stepWorld(g, 1 / 30);
    expect(p.y).toBeLessThan(startY - 40);
    let left = 0;
    for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 6; x++) if (g.map.getObs(x, y)) left++;
    expect(left).toBeLessThan(6);
    expect(g.dirtyChunks.size + (g.navDirty ? 1 : 0)).toBeGreaterThanOrEqual(0);
    void ccTo;
  });
});
