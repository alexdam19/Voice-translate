import { describe, expect, it } from 'vitest';
import { MAX_BASE_CREW } from '../src/shared/constants';
import { RARITIES, rollRarity } from '../src/shared/rarity';
import { makeWeapon, weaponScore, weaponStats, WEAPONS } from '../src/shared/weapons';
import { buildModule, hire, mountWeapon, research, upgradeChassis } from '../src/game/actions';
import { rollChest } from '../src/game/chests';
import { computeCrewBonus, giveXp, makeCrew, pickPerk, CHAMPIONS } from '../src/game/crew';
import { Game } from '../src/game/game';
import { deserialize, serialize } from '../src/game/save';
import { castAbility } from '../src/game/systems/crewsys';
import { installHandlers, stepWorld } from '../src/game/systems/step';
import { orderHarvest } from '../src/game/systems/orders';
import { launchOutrider, outriderDestroyed } from '../src/game/systems/outrider';
import { TECH, TECH_BY_ID, canResearch } from '../src/game/tech';

function game(seed = 77): Game {
  const g = new Game(seed);
  installHandlers(g);
  return g;
}

describe('rarity and weapons', () => {
  it('rarer weapons are stronger', () => {
    const scores = [0, 1, 2, 3, 4].map((r) => weaponScore({ uid: 1, key: 'autocannon', rarity: r as 0, affixes: [] }));
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    expect(weaponStats({ uid: 1, key: 'autocannon', rarity: 4, affixes: [] }).dmg).toBeCloseTo(WEAPONS.autocannon.dmg * RARITIES[4].mult);
  });

  it('exclusive weapons are always legendary and affix counts follow rarity', () => {
    expect(makeWeapon(1, 'sunspear', 0).rarity).toBe(4);
    for (let i = 0; i < 30; i++) {
      expect(makeWeapon(2, 'autocannon', 0).affixes.length).toBe(0);
      expect(makeWeapon(3, 'autocannon', 3).affixes.length).toBe(2);
    }
  });

  it('luck shifts rarity rolls upward', () => {
    let seed = 1;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const avg = (luck: number): number => {
      let s = 0;
      for (let i = 0; i < 4000; i++) s += rollRarity(rnd, luck);
      return s / 4000;
    };
    expect(avg(2)).toBeGreaterThan(avg(0) + 0.5);
  });
});

describe('fortress', () => {
  it('starter tank has weapons, power and crew bunks', () => {
    const g = game();
    const p = g.player;
    expect(p.weapons().length).toBe(3);
    expect(p.stats.powerRatio).toBe(1);
    expect(g.crewCap()).toBe(5);
    expect(g.mainCrew().length).toBe(4);
    expect(g.officers().filter(Boolean).length).toBe(4);
  });

  it('builds modules, respects the grid and pays costs', () => {
    const g = game();
    const scrap = g.player.cargo.count('scrap');
    const spot = g.player.findSpot('armor')!;
    expect(buildModule(g, 'armor', spot[0], spot[1]).ok).toBe(true);
    expect(g.player.cargo.count('iron_plate')).toBe(6);
    expect(buildModule(g, 'armor', spot[0], spot[1]).ok).toBe(false);
    expect(buildModule(g, 'shield', 0, 0).ok).toBe(false); // needs research
    expect(g.player.cargo.count('scrap')).toBe(scrap);
  });

  it('chassis upgrades keep the layout and add room', () => {
    const g = game();
    g.give('iron_plate', 50, true);
    g.give('scrap', 200, true);
    g.give('circuit', 10, true);
    const before = g.player.modules.length;
    expect(upgradeChassis(g).ok).toBe(true);
    expect(g.player.chassis).toBe('assault');
    expect(g.player.modules.length).toBe(before);
    expect(g.player.findSpot('barracks')).not.toBeNull();
  });

  it('mounts weapons only on matching hardpoints', () => {
    const g = game();
    const heavy = g.player.modules.find((m) => m.key === 'hp_heavy')!;
    const light = g.player.modules.find((m) => m.key === 'hp_light')!;
    const w = makeWeapon(999, 'gatling', 2);
    g.armory.push(w);
    expect(mountWeapon(g, heavy.id, w.uid).ok).toBe(false);
    expect(mountWeapon(g, light.id, w.uid).ok).toBe(true);
    expect(light.weapon?.key).toBe('gatling');
    expect(g.armory.some((k) => k.key === 'autocannon')).toBe(true);
  });

  it('tech tree is a DAG reachable from the roots', () => {
    const have = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const n of TECH) if (canResearch(have, n)) {
        have.add(n.id);
        progress = true;
      }
    }
    expect(have.size).toBe(TECH.length);
    for (const n of TECH) for (const r of n.requires) expect(TECH_BY_ID.has(r)).toBe(true);
  });

  it('research spends salvaged tech and unlocks equipment', () => {
    const g = game();
    g.give('tech_parts', 10, true);
    g.give('iron_plate', 30, true);
    g.give('circuit', 10, true);
    g.give('explosive', 4, true);
    expect(research(g, 'drill_mk2').ok).toBe(true);
    expect(g.tech.has('drill_mk2')).toBe(true);
    const spot = g.player.findSpot('drill_mk2')!;
    expect(buildModule(g, 'drill_mk2', spot[0], spot[1]).ok).toBe(true);
    expect(g.player.stats.drill).toBe(2);
  });
});

describe('crew', () => {
  it('levels up into a perk draft of three with rarities', () => {
    const c = makeCrew('gunner', 1, 1);
    giveXp(c, 100);
    expect(c.level).toBe(2);
    expect(c.draft?.length).toBe(3);
    expect(pickPerk(c, 0)).toBe(true);
    expect(c.perks.length).toBe(1);
    expect(c.draft).toBeNull();
  });

  it('crew passives stack into fortress bonuses', () => {
    const a = computeCrewBonus([makeCrew('gunner', 0, 1)]);
    const b = computeCrewBonus([makeCrew('gunner', 4, 5)]);
    expect(b.dmg).toBeGreaterThan(a.dmg);
  });

  it('caps the fortress at 15 crew', () => {
    const g = game();
    g.give('scrap', 2500, true);
    g.give('rations', 300, true);
    for (let i = 0; i < 16 && g.crewCap() < MAX_BASE_CREW; i++) {
      const s = g.player.findSpot('barracks');
      if (!s) {
        g.give('iron_plate', 200, true);
        g.give('circuit', 20, true);
        g.give('titanium_alloy', 40, true);
        g.give('tech_parts', 20, true);
        upgradeChassis(g);
        continue;
      }
      g.give('iron_plate', 20, true);
      buildModule(g, 'barracks', s[0], s[1]);
    }
    expect(g.crewCap()).toBe(MAX_BASE_CREW);
    for (let i = 0; i < 20; i++) {
      g.rollRecruits();
      hire(g, 0);
    }
    expect(g.mainCrew().length).toBe(MAX_BASE_CREW);
    expect(g.outriderUnlocked()).toBe(true);
  });

  it('officer abilities go on cooldown', () => {
    const g = game();
    const off = g.officers()[1]!;
    expect(castAbility(g, 1, g.player.x, g.player.y)).toBe(true);
    expect(off.cd).toBeGreaterThan(10);
    expect(castAbility(g, 1, g.player.x, g.player.y)).toBe(false);
    expect(g.player.hasBuff('barrage')).toBe(true);
  });

  it('outrider crew can die when it is destroyed', () => {
    const g = game(5);
    g.outriderLevel = 1;
    launchOutrider(g);
    const side = [makeCrew('scavenger', 0, 1), makeCrew('gunner', 0, 1), makeCrew('driver', 0, 1), makeCrew('mechanic', 0, 1), makeCrew('marine', 0, 1)];
    for (const c of side) {
      c.loc = 'outrider';
      g.crew.push(c);
    }
    const before = g.crew.length;
    let lost = 0;
    const orig = Math.random;
    Math.random = () => 0.99; // everyone fails the survival roll
    try {
      outriderDestroyed(g);
      lost = before - g.crew.length;
    } finally {
      Math.random = orig;
    }
    expect(lost).toBe(5);
    expect(g.outrider).toBeNull();
  });
});

describe('chests', () => {
  it('this-or-that chests always offer two different rewards', () => {
    const g = game();
    for (let i = 0; i < 40; i++) {
      const r = rollChest(g, 'choice', 3);
      expect(r.length).toBe(2);
      expect(r[0].type === r[1].type && r[0].type !== 'items').toBe(false);
    }
  });

  it('rune chests sometimes hold champions, exclusive characters or exclusive weapons', () => {
    const g = game();
    const seen = { champ: 0, ex: 0, exw: 0 };
    for (let i = 0; i < 400; i++) {
      for (const r of rollChest(g, 'rune', 3)) {
        if (r.type === 'crew' && r.crew.champion) seen.champ++;
        if (r.type === 'crew' && r.crew.exclusive) seen.ex++;
        if (r.type === 'weapon' && WEAPONS[r.item.key].exclusive) seen.exw++;
      }
    }
    expect(seen.champ).toBeGreaterThan(5);
    expect(seen.ex).toBeGreaterThan(10);
    expect(seen.exw).toBeGreaterThan(10);
    expect(CHAMPIONS.length).toBe(9);
  });
});

describe('simulation', () => {
  it('harvests a node near camp', () => {
    const g = game(4242);
    const n = g.gen.nodes.slice().sort((a, b) => Math.hypot(a.x - g.player.x, a.y - g.player.y) - Math.hypot(b.x - g.player.x, b.y - g.player.y))[0];
    orderHarvest(g, n.id);
    const scrap = g.player.cargo.count('scrap');
    for (let i = 0; i < 60 * 25; i++) stepWorld(g, 1 / 60);
    expect(g.player.cargo.count('scrap') + g.player.cargo.count('iron_ore') + g.player.cargo.count('copper_ore')).toBeGreaterThan(scrap);
  });

  it('save round-trips progress', () => {
    const g = game(99);
    g.give('tech_parts', 3, true);
    g.tech.add('drill_mk2');
    g.explored[1234] = 1;
    g.armory.push(makeWeapon(4321, 'laser', 3));
    const d = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(d.player.cargo.count('tech_parts')).toBe(3);
    expect(d.tech.has('drill_mk2')).toBe(true);
    expect(d.explored[1234]).toBe(1);
    expect(d.armory[0].key).toBe('laser');
    expect(d.crew.length).toBe(g.crew.length);
  });
});
