import { describe, expect, it } from 'vitest';
import { MAX_BASE_CREW } from '../src/shared/constants';
import { RARITIES, rollRarity } from '../src/shared/rarity';
import { makeWeapon, weaponScore, weaponStats, WEAPONS } from '../src/shared/weapons';
import { hire, mountWeapon } from '../src/game/actions';
import { rollChest } from '../src/game/chests';
import { computeCrewBonus, giveXp, makeCrew, pickPerk, CHAMPIONS } from '../src/game/crew';
import { Game } from '../src/game/game';
import { deserialize, serialize } from '../src/game/save';
import { installHandlers, stepWorld } from '../src/game/systems/step';
import { manualDrive } from '../src/game/systems/movement';
import { orderHarvest, orderMove } from '../src/game/systems/orders';
import { ccTo, levelTo } from './helpers';
import { launchOutrider, outriderDestroyed } from '../src/game/systems/outrider';
import { TECH, TECH_BY_ID } from '../src/game/tech';

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
  it('mounts weapons only on matching hardpoints (pads take light or medium)', () => {
    const g = game();
    const heavy = g.player.modules.find((m) => m.key === 'main_gun')!;
    const pads = g.player.modules.filter((m) => m.key === 'pad');
    const w = makeWeapon(999, 'gatling', 2);
    g.armory.push(w);
    expect(mountWeapon(g, heavy.id, w.uid).ok).toBe(false);
    expect(mountWeapon(g, pads[0].id, w.uid).ok).toBe(true);
    expect(pads[0].weapon?.key).toBe('gatling');
    expect(g.armory.some((k) => k.key === 'autocannon')).toBe(true);
    const med = Object.values(WEAPONS).find((d) => d.size === 'medium')!;
    const mw = makeWeapon(1000, med.key, 1);
    g.armory.push(mw);
    expect(mountWeapon(g, pads[1].id, mw.uid).ok).toBe(true);
  });

  it('the old tech tree is still a DAG (the Level Road hands it out in order)', () => {
    for (const n of TECH) for (const r of n.requires) expect(TECH_BY_ID.has(r)).toBe(true);
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
    levelTo(g, 20);
    ccTo(g, 6);
    for (let i = 0; i < 6 && g.crewCap() < MAX_BASE_CREW; i++) g.player.autoAdd('barracks');
    g.applyCrew();
    expect(g.crewCap()).toBe(MAX_BASE_CREW);
    for (let i = 0; i < 20; i++) {
      g.rollRecruits();
      hire(g, 0);
    }
    expect(g.mainCrew().length).toBe(MAX_BASE_CREW);
    expect(g.outriderUnlocked()).toBe(true);
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

describe('chest packs', () => {
  it('card pack chests roll cards', () => {
    const g = game();
    const r = rollChest(g, 'rare_pack', 2);
    expect(r.length).toBe(4);
    expect(r.every((k) => k.type === 'card')).toBe(true);
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

  it('save round-trips progress, cards, builds and squads', () => {
    const g = game(99);
    g.give('tech_parts', 3, true);
    levelTo(g, 7);
    g.commander.xp = 55;
    g.fog.explore(g.player.x + 40, g.player.y, 3);
    g.armory.push(makeWeapon(4321, 'laser', 3));
    g.ownCard('fireball');
    g.ownCard('fireball');
    g.packs.push('rare_pack');
    g.relics = ['iron_hide'];
    g.cards.iron_hide = { level: 2, shards: 0 };
    const s = g.player.findSpot('armor')!;
    const m = g.player.addModule('armor', s[0], s[1])!;
    m.built = false;
    g.builds.push({ modId: m.id, kind: 'build', to: 1, t: 3, total: 8, cost: { iron_plate: 4 } });
    g.tracked = { kind: 'upgrade', modId: m.id };
    g.squads.marines = { type: 'marines', order: 'guard', gx: 10, gy: 20, target: null, phase: 'going', work: 0, carry: [], respawn: 1 };
    const d = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(d.player.cargo.count('tech_parts')).toBe(3);
    expect(d.commander).toEqual({ level: 7, xp: 55 });
    expect(d.fog.isExplored(g.player.x + 40, g.player.y)).toBe(true);
    expect(d.armory[0].key).toBe('laser');
    expect(d.crew.length).toBe(g.crew.length);
    expect(d.cards.fireball.shards).toBe(1);
    expect(d.packs).toEqual(['rare_pack']);
    expect(d.relics).toEqual(['iron_hide']);
    expect(d.builds.length).toBe(1);
    const bm = d.player.moduleById(d.builds[0].modId)!;
    expect(bm.key).toBe('armor');
    expect(bm.built).toBe(false);
    expect(d.tracked).toEqual({ kind: 'upgrade', modId: bm.id });
    expect(d.squads.marines?.order).toBe('guard');
    expect(d.hand.length).toBe(4);
  });

  it('old saves move into the bigger fortress', () => {
    const g = game(12);
    const d = serialize(g);
    d.v = 4;
    d.tank = { ...d.tank, chassis: 'assault', modules: [
      { key: 'bridge', cx: 2, cy: 3, weapon: null },
      { key: 'hp_light', cx: 0, cy: 0, weapon: makeWeapon(77, 'laser', 2) },
      { key: 'reactor', cx: 0, cy: 5, weapon: null },
      { key: 'engine', cx: 4, cy: 5, weapon: null },
      { key: 'quarters', cx: 4, cy: 0, weapon: null },
    ] };
    delete d.commander;
    const h = deserialize(JSON.parse(JSON.stringify(d)));
    expect(h.player.stats.cc).toBe(2);
    expect(h.player.chassis).toBe('assault');
    expect(h.player.modules.some((m) => m.weapon?.key === 'laser')).toBe(true);
    expect(h.commander.level).toBeGreaterThanOrEqual(3);
    expect(h.packs.length).toBeGreaterThan(0);
  });
});

describe('driving', () => {
  it('scales throttle with how far the touch stick is pushed', () => {
    const g = game();
    const p = g.player;
    p.rot = -Math.PI / 2;
    // Keys: always full throttle, diagonals included.
    expect(manualDrive(p, 0, -1, false).throttle).toBeCloseTo(1);
    expect(manualDrive(p, 1, -1, false).wantRot).toBeCloseTo(-Math.PI / 4);
    // Stick: half way is half throttle, in the pushed direction.
    const half = manualDrive(p, 0, -0.5, false);
    expect(half.throttle).toBeCloseTo(0.5);
    expect(half.wantRot).toBeCloseTo(-Math.PI / 2);
    expect(manualDrive(p, 0, -0.5, true).throttle).toBeCloseTo(0.5);
    expect(manualDrive(p, 0, 0.5, true).throttle).toBeCloseTo(-0.25);
  });

  it('drives off a node it was drilling when told to go somewhere else', () => {
    const g = game(4242);
    const p = g.player;
    const n = g.gen.nodes.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    p.x = n.x;
    p.y = n.y;
    for (let i = 0; i < 30; i++) stepWorld(g, 1 / 60);
    expect(g.harvestId).toBe(n.id);
    const x0 = p.x, y0 = p.y;
    expect(orderMove(g, p.x + 30, p.y)).toBe(true);
    for (let i = 0; i < 60 * 3; i++) stepWorld(g, 1 / 60);
    expect(Math.hypot(p.x - x0, p.y - y0)).toBeGreaterThan(5);
  });
});
