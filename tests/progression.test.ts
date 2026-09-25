import { describe, expect, it } from 'vitest';
import { TILE } from '../src/shared/constants';
import { generateWorld, SPAWN_X } from '../src/shared/worldgen';
import { assignPosts, computeBonus, giveXp, makeCrew, perkPoints, ROLES } from '../src/game/crew';
import { MODULES } from '../src/game/rigDefs';
import { buildStarterRig } from '../src/game/rigTemplates';
import { canResearch, freeTech, moduleUnlocked, researchCost, TECH, TECH_BY_ID, weaponMods } from '../src/game/tech';
import { makeEnemy, makeTitan, threatAt, TITANS } from '../src/game/systems/enemies';
import { ZONES } from '../src/shared/zones';

describe('tech tree', () => {
  it('is a valid DAG whose prerequisites all exist', () => {
    const ids = new Set(TECH.map((t) => t.id));
    expect(ids.size).toBe(TECH.length);
    for (const t of TECH) for (const r of t.requires) expect(ids.has(r)).toBe(true);
    // every node can eventually be researched starting from the free ones
    const have = freeTech();
    let progress = true;
    while (progress) {
      progress = false;
      for (const t of TECH) if (canResearch(have, t)) {
        have.add(t.id);
        progress = true;
      }
    }
    expect(have.size).toBe(TECH.length);
  });

  it('gates every tech-locked module behind a node that unlocks it', () => {
    for (const m of Object.values(MODULES)) {
      if (!m.tech) continue;
      expect(TECH_BY_ID.get(m.tech)?.unlocks).toContain(m.key);
    }
    const start = freeTech();
    expect(moduleUnlocked(start, 'autocannon')).toBe(true);
    expect(moduleUnlocked(start, 'main_battery')).toBe(true);
    expect(moduleUnlocked(start, 'rail_cannon')).toBe(false);
  });

  it('stacks family upgrades and applies research discounts', () => {
    const tech = new Set(['autocannon', 'hardened_rounds', 'gatling', 'belt_feed', 'du_rounds']);
    const m = weaponMods(tech, 'ballistic');
    expect(m.dmg).toBeCloseTo(1.25 * 1.4);
    expect(m.rate).toBeCloseTo(1.35);
    expect(m.pierce).toBe(1);
    const node = TECH_BY_ID.get('bore_120')!;
    expect(researchCost(node, 0.5).tech_parts).toBe(6);
  });
});

describe('crew', () => {
  it('levels up and earns perk points', () => {
    const c = makeCrew('gunner', () => 0.5, 1, 'steady');
    expect(perkPoints(c)).toBe(0);
    expect(giveXp(c, 120)).toBe(true);
    expect(c.level).toBe(2);
    expect(perkPoints(c)).toBe(1);
  });

  it('posts roles at their stations and turns that into bonuses', () => {
    const r = buildStarterRig();
    const gunner = makeCrew('gunner', Math.random, 3, 'steady');
    gunner.perks = ['deadeye'];
    const engineer = makeCrew('engineer', Math.random, 2, 'steady');
    const driver = makeCrew('driver', Math.random, 1, 'steady');
    driver.perks = ['rough_rider'];
    r.crew = [gunner, engineer, driver];
    assignPosts(r.crew, r.modules);
    const post = (id: number) => r.modules.find((m) => m.id === id)!.def.key;
    expect(post(gunner.post)).toBe('main_battery');
    expect(post(engineer.post)).toBe('reactor');
    expect(post(driver.post)).toBe('cockpit');
    const b = computeBonus(r.crew, r.modules, freeTech());
    const gm = b.mod.get(gunner.post)!;
    expect(gm.dmg).toBeCloseTo(1 + 0.24 + 0.2);
    expect(b.mod.get(engineer.post)!.power).toBeCloseTo(1.2);
    expect(b.climbBonus).toBe(1);
    const before = r.powerProd;
    r.bonus = b;
    r.recalc();
    expect(r.powerProd).toBeGreaterThan(before);
  });

  it('every role has three perks and a preferred station that exists', () => {
    for (const role of Object.values(ROLES)) {
      expect(role.perks).toHaveLength(3);
      for (const key of role.posts) expect(MODULES[key]).toBeDefined();
    }
  });
});

describe('threat', () => {
  const g = generateWorld(77);
  it('is lowest at camp and grows with distance and depth', () => {
    const w = g.world;
    const at = (tx: number, depth = 0) => threatAt(w, tx, w.surface[tx] + depth);
    expect(at(SPAWN_X)).toBeCloseTo(1, 1);
    expect(at(SPAWN_X + 800)).toBeGreaterThan(at(SPAWN_X + 200));
    expect(at(SPAWN_X - 1500)).toBeGreaterThan(3.2);
    expect(at(SPAWN_X, 120)).toBeGreaterThan(at(SPAWN_X));
  });

  it('scales enemy stats and builds a titan for every zone', () => {
    const weak = makeEnemy('crawler', 2, 0, 0, 1);
    const strong = makeEnemy('crawler', 2, 0, 0, 6);
    const elite = makeEnemy('crawler', 2, 0, 0, 6, true);
    expect(strong.maxHp).toBeGreaterThan(weak.maxHp * 2);
    expect(elite.maxHp).toBeGreaterThan(strong.maxHp * 2);
    expect(elite.w).toBeGreaterThan(strong.w);
    for (const z of ZONES) {
      expect(TITANS[z.key]).toBeDefined();
      const t = makeTitan(z.key, 1000, 150 * TILE, 4);
      expect(t.maxHp).toBeGreaterThan(1000);
      expect(t.w).toBeGreaterThan(40);
    }
  });
});
