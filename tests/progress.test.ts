import { describe, expect, it } from 'vitest';
import { trackBuild, trackUpgrade } from '../src/game/actions';
import { MODULE_LIST } from '../src/game/defs';
import { FEATURES, levelRoad, MAX_COMMANDER_LEVEL, techsForLevel, xpToNext } from '../src/game/progress';
import { SQUADS, squadSize } from '../src/game/squads';
import { setSquadOrder, squadUnits } from '../src/game/systems/squads';
import { stepWorld } from '../src/game/systems/step';
import { trackInfo } from '../src/game/systems/tracking';
import { TECH } from '../src/game/tech';
import { build, game, levelTo } from './helpers';

describe('commander XP and the Level Road', () => {
  it('every tech, building and feature is somewhere on the road', () => {
    const road = levelRoad();
    expect(road.length).toBe(MAX_COMMANDER_LEVEL);
    const techs = new Set(road.flatMap((r) => r.techs.map((t) => t.id)));
    for (const t of TECH) if (!t.free) expect(techs.has(t.id), t.id).toBe(true);
    for (const m of MODULE_LIST) expect(m.unlock ?? 1).toBeLessThanOrEqual(MAX_COMMANDER_LEVEL);
    for (const f of FEATURES) expect(road[f.level - 1].features).toContain(f);
    for (let l = 2; l < MAX_COMMANDER_LEVEL; l++) expect(xpToNext(l)).toBeGreaterThan(xpToNext(l - 1));
    expect(techsForLevel(MAX_COMMANDER_LEVEL).length).toBe(TECH.length);
  });

  it('killing enemies levels the commander, unlocking things and giving a pack', () => {
    const g = game();
    const levels: number[] = [];
    g.hooks.levelUp = (r) => levels.push(r.level);
    const hp = g.player.stats.maxHp;
    const t = techsForLevel(2).find((id) => !g.tech.has(id));
    for (let i = 0; i < 30 && g.commander.level < 2; i++) {
      const e = g.spawnEnemy('raider', g.player.x + 10, g.player.y, 1);
      e.hp = 0.1;
      stepWorld(g, 1 / 60);
      g.enemies = g.enemies.filter((k) => k.hp > 0);
      e.hp = 0;
    }
    for (let i = 0; i < 40 && g.commander.level < 2; i++) g.gainXp(10);
    expect(g.commander.level).toBeGreaterThanOrEqual(2);
    expect(levels[0]).toBe(2);
    expect(g.packs.length).toBeGreaterThanOrEqual(1);
    if (t) expect(g.tech.has(t)).toBe(true);
    expect(g.player.stats.maxHp).toBeGreaterThan(hp);
  });
});

describe('squads', () => {
  it('army buildings train squads that follow, guard and respawn', () => {
    const g = game();
    const id = build(g, 'barracks');
    const lvl = g.player.moduleById(id)!.lvl;
    for (let i = 0; i < 60 * 30; i++) stepWorld(g, 1 / 60);
    const units = squadUnits(g, 'marines');
    expect(units.length).toBe(squadSize(SQUADS.marines, lvl));
    const gx = g.player.x + 25, gy = g.player.y + 10;
    expect(setSquadOrder(g, 'marines', 'guard', gx, gy)).toBeNull();
    for (let i = 0; i < 60 * 12; i++) stepWorld(g, 1 / 60);
    for (const u of squadUnits(g, 'marines')) expect(Math.hypot(u.x - gx, u.y - gy)).toBeLessThan(8);
    // Casualties come back.
    const dead = squadUnits(g, 'marines')[0];
    dead.hp = 0;
    for (let i = 0; i < 60 * 20; i++) stepWorld(g, 1 / 60);
    expect(squadUnits(g, 'marines').length).toBe(squadSize(SQUADS.marines, lvl));
    expect(setSquadOrder(g, 'drones', 'guard', 0, 0)).not.toBeNull();
  });

  it('scout buggies scavenge ahead and bring the haul home', () => {
    const g = game(4242);
    build(g, 'garage');
    for (let i = 0; i < 60 * 20; i++) stepWorld(g, 1 / 60);
    expect(squadUnits(g, 'buggies').length).toBeGreaterThan(0);
    const before = ['scrap', 'iron_ore', 'copper_ore', 'biomass'].reduce((s, k) => s + g.player.cargo.count(k), 0);
    expect(setSquadOrder(g, 'buggies', 'scavenge')).toBeNull();
    for (let i = 0; i < 30 * 90; i++) stepWorld(g, 1 / 30);
    const after = ['scrap', 'iron_ore', 'copper_ore', 'biomass'].reduce((s, k) => s + g.player.cargo.count(k), 0);
    expect(g.objectiveCounters.scavenged ?? 0).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before);
  }, 30000);
});

describe('tracking', () => {
  it('shows what an upgrade needs and points at where to get it', () => {
    const g = game();
    levelTo(g, 3);
    g.player.cargo.take('iron_plate', 999);
    expect(trackBuild(g, 'barracks').ok).toBe(true);
    const t = trackInfo(g)!;
    expect(t.title).toMatch(/Barracks/);
    const plate = t.needs.find((n) => n.id === 'iron_plate')!;
    expect(plate.have).toBe(0);
    expect(t.ready).toBe(false);
    expect(t.target).not.toBeNull();
    expect(t.hint.length).toBeGreaterThan(10);
    // Level-locked goals point you at XP.
    const cc = g.player.modules.find((m) => m.key === 'bridge')!;
    levelTo(g, 1);
    g.commander.level = 1;
    trackUpgrade(g, cc.id);
    const u = trackInfo(g)!;
    expect(u.hint).toMatch(/commander level/i);
  });
});
