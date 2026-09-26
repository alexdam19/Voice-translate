import { describe, expect, it } from 'vitest';
import { RARITIES } from '../src/shared/rarity';
import { canTakeNode, makeWeapon, maxHitDamage, treeNode, weaponScore, weaponStats, weaponTree, WEAPON_LIST, WEAPONS } from '../src/shared/weapons';
import {
  buildModule, cancelResearch, findWeapon, research, researchNow, respecTree, setActiveSlot, startForge, takeTreeNode, upgradeModule,
} from '../src/game/actions';
import { ACTIVES, ULTIMATES } from '../src/game/arsenal';
import { PERKS } from '../src/game/crew';
import { MODULES } from '../src/game/defs';
import { Game } from '../src/game/game';
import { deserialize, serialize } from '../src/game/save';
import { castActive, castUltimate, updateArsenal } from '../src/game/systems/arsenal';
import { installHandlers, stepWorld } from '../src/game/systems/step';
import { TECH, TECH_BY_ID, TIER_TIME } from '../src/game/tech';

function game(seed = 91): Game {
  const g = new Game(seed);
  installHandlers(g);
  g.revealAll = true;
  return g;
}

function rich(g: Game): void {
  for (const id of ['scrap', 'iron_plate', 'circuit', 'titanium_alloy', 'explosive', 'tech_parts', 'uranium_rod', 'cryo_core', 'xeno_alloy', 'copper_wire', 'sulfur', 'mythic_essence', 'xenite', 'rations', 'biomass']) {
    g.player.cargo.add(id, 400);
  }
}

/** Unlocks a node and every prerequisite. */
function unlock(g: Game, id: string): void {
  const n = TECH_BY_ID.get(id)!;
  for (const r of n.requires) unlock(g, r);
  g.tech.add(id);
  g.applyCrew();
}

function build(g: Game, key: string): number {
  unlock(g, MODULES[key].tech ?? 'autocannon');
  const spot = g.player.findSpot(key);
  if (!spot) {
    // Make room: grow the hull.
    g.player.setChassis('colossus');
  }
  const s = g.player.findSpot(key)!;
  const r = buildModule(g, key, s[0], s[1]);
  expect(r.ok, r.ok ? '' : r.msg).toBe(true);
  return g.player.modules.find((m) => m.key === key && m.cx === s[0] && m.cy === s[1])!.id;
}

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

  it('the forge adds stars over time and later stars need research', () => {
    const g = game();
    rich(g);
    build(g, 'forge');
    const w = makeWeapon(600, 'raygun', 0);
    g.armory.push(w);
    expect(startForge(g, w.uid).ok).toBe(true);
    expect(startForge(g, w.uid).ok).toBe(false); // busy
    for (let i = 0; i < 25 * 10; i++) updateArsenal(g, 0.1);
    expect(findWeapon(g, w.uid)!.rarity).toBe(1);
    for (let i = 0; i < 60 * 10; i++) updateArsenal(g, 0.1);
    expect(startForge(g, w.uid).ok).toBe(true);
    for (let i = 0; i < 60 * 10; i++) updateArsenal(g, 0.1);
    expect(w.rarity).toBe(2);
    // 4★ needs Forge Mastery.
    expect(startForge(g, w.uid).ok).toBe(false);
    unlock(g, 'forge_mastery');
    expect(startForge(g, w.uid).ok).toBe(true);
  });
});

describe('research', () => {
  it('has 12 military branches with tiers up to VI and deeper tiers take longer', () => {
    const mil = TECH.filter((t) => t.tree === 'military');
    expect(new Set(mil.map((t) => t.branch)).size).toBe(12);
    expect(Math.max(...mil.map((t) => t.tier))).toBe(6);
    expect(TECH.filter((t) => t.tree === 'personnel').length).toBeGreaterThanOrEqual(30);
    for (let i = 2; i < TIER_TIME.length; i++) expect(TIER_TIME[i]).toBeGreaterThan(TIER_TIME[i - 1]);
    for (const t of TECH) for (const u of t.unlocks ?? []) expect(!!MODULES[u] || !!WEAPONS[u], u).toBe(true);
    for (const m of Object.values(MODULES)) if (m.tech) expect(TECH_BY_ID.has(m.tech), m.key).toBe(true);
    for (const a of Object.values(ACTIVES)) expect(MODULES[a.module]?.active).toBe(a.key);
    for (const u of Object.values(ULTIMATES)) expect(MODULES[u.module]?.ult).toBe(u.key);
  });

  it('personnel research needs a science lab and unlocks officer seats', () => {
    const g = game();
    rich(g);
    expect(g.officerSeats()).toBe(4);
    expect(research(g, 'officer_school').ok).toBe(false);
    build(g, 'science_lab');
    expect(research(g, 'officer_school').ok).toBe(true);
    // Military and personnel run side by side.
    expect(research(g, 'reinforced').ok).toBe(true);
    for (let i = 0; i < 40 * 10; i++) updateArsenal(g, 0.1);
    expect(g.tech.has('officer_school')).toBe(true);
    expect(g.officerSeats()).toBe(5);
    expect(research(g, 'field_commission').ok).toBe(true);
    const tp = g.player.cargo.count('tech_parts');
    expect(cancelResearch(g, 'personnel').ok).toBe(true);
    expect(g.player.cargo.count('tech_parts')).toBeGreaterThan(tp);
  });

  it('science labs speed research up and levels make them faster', () => {
    const g = game();
    rich(g);
    const id = build(g, 'science_lab');
    const lab1 = g.player.stats.lab;
    expect(upgradeModule(g, id).ok).toBe(true);
    expect(g.player.stats.lab).toBeGreaterThan(lab1);
    expect(upgradeModule(g, id).ok).toBe(true);
    expect(upgradeModule(g, id).ok).toBe(false);
  });
});

describe('actives and ultimates', () => {
  it('actives bind to 1-4, fire and go on cooldown', () => {
    const g = game();
    rich(g);
    const id = build(g, 'salvo_rack');
    expect(g.activeSlots[0]).toBe(id);
    const n = g.projectiles.length;
    expect(castActive(g, 0, g.player.x + 10, g.player.y)).toBe(true);
    expect(g.projectiles.length).toBe(n + 12);
    expect(castActive(g, 0, g.player.x + 10, g.player.y)).toBe(false);
    const jets = build(g, 'jet_hangar');
    expect(setActiveSlot(g, 2, jets).ok).toBe(true);
    expect(castActive(g, 2, g.player.x + 10, g.player.y)).toBe(true);
    expect(g.allies.filter((a) => a.kind === 'jet').length).toBe(2);
    for (let i = 0; i < 60; i++) stepWorld(g, 1 / 60);
    const jet = g.allies.find((a) => a.kind === 'jet')!;
    expect(jet.z).toBeGreaterThan(2);
  });

  it('the nuke charges, launches after a warning and flattens the area', () => {
    const g = game();
    rich(g);
    build(g, 'nuke_silo');
    expect(g.ultModule).toBeGreaterThan(0);
    expect(castUltimate(g, g.player.x + 30, g.player.y)).toBe(false);
    g.ultCharge = 1;
    const tx = g.player.x + 30, ty = g.player.y;
    const e = g.spawnEnemy('brute', tx, ty, 3);
    expect(castUltimate(g, tx, ty)).toBe(true);
    expect(g.ultCharge).toBe(0);
    expect(e.hp).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 3.5; i++) stepWorld(g, 1 / 60);
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(g.zones.some((z) => z.kind === 'rad')).toBe(true);
  });

  it('damage dealt charges the ultimate faster than time alone', () => {
    const a = game(), b = game();
    for (const g of [a, b]) {
      rich(g);
      build(g, 'mech_bay');
    }
    for (let i = 0; i < 100; i++) {
      a.ultGain(200);
      updateArsenal(a, 0.1);
      updateArsenal(b, 0.1);
    }
    expect(a.ultCharge).toBeGreaterThan(b.ultCharge * 2);
  });

  it('the Hornet Launcher turret launches mini fighter jets', () => {
    const g = game();
    rich(g);
    unlock(g, 'hornets');
    const hp = g.player.modules.find((m) => MODULES[m.key].hardpoint === 'medium') ?? null;
    g.player.setChassis('colossus');
    const s = g.player.findSpot('hp_medium')!;
    buildModule(g, 'hp_medium', s[0], s[1]);
    const m = g.player.modules.find((k) => k.key === 'hp_medium')!;
    m.weapon = makeWeapon(900, 'hornet_nest', 2);
    g.player.recalc();
    g.spawnEnemy('raider', g.player.x + 12, g.player.y, 1);
    for (let i = 0; i < 60 * 4; i++) stepWorld(g, 1 / 60);
    expect(g.allies.some((a) => a.kind === 'jet' && a.owner === m.id)).toBe(true);
    void hp;
  });
});

describe('saves', () => {
  it('round-trip research, forge, trees, module levels and the loadout', () => {
    const g = game();
    rich(g);
    const lab = build(g, 'science_lab');
    upgradeModule(g, lab);
    const salvo = build(g, 'salvo_rack');
    setActiveSlot(g, 3, salvo);
    build(g, 'forge');
    const w = makeWeapon(700, 'plasma_launcher', 1);
    g.armory.push(w);
    takeTreeNode(g, w.uid, 'P1');
    research(g, 'officer_school');
    const fr = startForge(g, w.uid);
    expect(fr.ok, fr.ok ? '' : fr.msg).toBe(true);
    g.tankControls = true;
    const h = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(h.research.personnel?.id).toBe('officer_school');
    expect(h.forgeJob?.uid).toBe(w.uid);
    expect(h.armory.find((k) => k.uid === w.uid)?.tree).toEqual(['P1']);
    expect(h.player.modules.find((m) => m.key === 'science_lab')?.lvl).toBe(2);
    const slot = h.activeSlots[3];
    expect(h.player.moduleById(slot)?.key).toBe('salvo_rack');
    expect(h.tankControls).toBe(true);
  });

  it('old v3 saves keep all six officer seats', () => {
    const g = game();
    const d = serialize(g);
    d.v = 3;
    const h = deserialize(JSON.parse(JSON.stringify(d)));
    expect(h.officerSeats()).toBe(6);
    expect(researchNow(h, 'reinforced').ok).toBe(true);
  });
});
