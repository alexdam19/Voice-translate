import { describe, expect, it } from 'vitest';
import { RARITIES } from '../src/shared/rarity';
import { canTakeNode, makeWeapon, maxHitDamage, treeNode, weaponScore, weaponStats, weaponTree, WEAPON_LIST, WEAPONS } from '../src/shared/weapons';
import { findWeapon, respecTree, startForge, takeTreeNode } from '../src/game/actions';
import { PERKS } from '../src/game/crew';
import { techLevel } from '../src/game/progress';
import { updateArsenal } from '../src/game/systems/arsenal';
import { stepWorld } from '../src/game/systems/step';
import { TECH_BY_ID } from '../src/game/tech';
import { build, game, levelTo, rich } from './helpers';

describe('weapons', () => {
  it('has 30+ weapons, every one with sane stats at every star level', () => {
    expect(WEAPON_LIST.length).toBeGreaterThanOrEqual(30);
    for (const d of WEAPON_LIST) {
      let last = 0;
      for (let r = 0; r <= 5; r++) {
        const w = makeWeapon(1, d.key, r as 0);
        w.affixes = [];
        const s = weaponStats(w);
        for (const v of [s.dmg, s.rate, s.range, s.splash]) expect(Number.isFinite(v)).toBe(true);
        const score = weaponScore(w);
        expect(score).toBeGreaterThanOrEqual(last * 0.99);
        last = score;
      }
      if (d.tech) expect(TECH_BY_ID.has(d.tech), `${d.key} tech ${d.tech}`).toBe(true);
    }
    expect(RARITIES.length).toBe(6);
    expect(maxHitDamage('void_lance', 5)).toBeGreaterThan(WEAPONS.void_lance.dmg * RARITIES[5].mult);
  });

  it('every perk has a mythic value and the tree has 9 nodes per family', () => {
    for (const p of PERKS) expect(p.values.length).toBe(6);
    for (const d of WEAPON_LIST) {
      const t = weaponTree(d.family);
      expect(t.length).toBe(3);
      for (const b of t) expect(b.length).toBe(3);
      expect(treeNode(d.family, 'P3')?.fx.special).toBeTruthy();
    }
  });

  it('tree points come from stars and branches unlock in order', () => {
    const g = game();
    rich(g);
    const w = makeWeapon(500, 'autocannon', 1);
    g.armory.push(w);
    expect(canTakeNode(w, 'F2')).toBe(false);
    expect(takeTreeNode(g, w.uid, 'F1').ok).toBe(true);
    expect(takeTreeNode(g, w.uid, 'F2').ok).toBe(true);
    // 2★ = 2 points.
    expect(takeTreeNode(g, w.uid, 'H1').ok).toBe(false);
    const before = weaponStats(makeWeapon(501, 'autocannon', 1)).dmg;
    expect(weaponStats(w).dmg).toBeGreaterThan(before * 1.25);
    expect(respecTree(g, w.uid).ok).toBe(true);
    expect(w.tree).toEqual([]);
  });

  it('the forge adds stars over time and later stars need commander levels', () => {
    const g = game();
    build(g, 'forge');
    levelTo(g, techLevel('forge_mastery') - 1);
    const w = makeWeapon(600, 'raygun', 0);
    g.armory.push(w);
    expect(startForge(g, w.uid).ok).toBe(true);
    expect(startForge(g, w.uid).ok).toBe(false); // busy
    for (let i = 0; i < 25 * 10; i++) updateArsenal(g, 0.1);
    expect(findWeapon(g, w.uid)!.rarity).toBe(1);
    expect(startForge(g, w.uid).ok).toBe(true);
    for (let i = 0; i < 60 * 10; i++) updateArsenal(g, 0.1);
    expect(w.rarity).toBe(2);
    // 4★ needs Forge Mastery from the Level Road.
    const r = startForge(g, w.uid);
    expect(r.ok).toBe(false);
    levelTo(g, techLevel('forge_mastery'));
    expect(startForge(g, w.uid).ok).toBe(true);
  });

  it('the Hornet Launcher turret launches mini fighter jets', () => {
    const g = game();
    const id = build(g, 'hp_medium');
    const m = g.player.moduleById(id)!;
    m.weapon = makeWeapon(900, 'hornet_nest', 2);
    g.player.recalc();
    g.spawnEnemy('raider', g.player.x + 16, g.player.y, 1);
    for (let i = 0; i < 60 * 4; i++) stepWorld(g, 1 / 60);
    expect(g.allies.some((a) => a.kind === 'jet' && a.owner === m.id)).toBe(true);
  });
});
