import { RNG } from '../shared/rng';
import { rollDropRarity, rollWeaponKey } from '../shared/loot';
import { makeWeapon, WEAPONS, type WeaponItem, type WeaponSize } from '../shared/weapons';
import { makeCrew, type CrewMember } from './crew';
import { Tank } from './tank';

let nextUid = 1;
export function bumpUid(min: number): void {
  nextUid = Math.max(nextUid, min + 1);
}
export function newUid(): number {
  return nextUid++;
}
export function peekUid(): number {
  return nextUid;
}

export function newWeapon(key: string, rarity: WeaponItem['rarity'] = 0, rng: () => number = Math.random): WeaponItem {
  return makeWeapon(newUid(), key, rarity, rng);
}

/**
 * The Crawler Facility every run starts with: a Command Center in the middle, a few turrets,
 * bunks, a cargo hold, a reactor and two engines, and plenty of open deck to build on.
 * Row 0 is the front of the fortress.
 */
export const STARTER_LAYOUT: [string, number, number, string?][] = [
  ['hp_heavy', 3, 1, 'main_battery'],
  ['hp_light', 0, 0, 'autocannon'],
  ['hp_light', 9, 0, 'autocannon'],
  ['hp_light', 0, 13, 'autocannon'],
  ['bridge', 3, 5],
  ['quarters', 0, 5],
  ['cargo', 8, 5],
  ['reactor', 0, 9],
  ['engine', 3, 11],
  ['engine', 5, 11],
];

export function buildStarterTank(x: number, y: number): Tank {
  const t = new Tank('player', 'main', 'crawler', 'Fortress');
  t.x = x;
  t.y = y;
  t.rot = -Math.PI / 2;
  for (const [key, cx, cy, w] of STARTER_LAYOUT) t.addModule(key, cx, cy, w ? newWeapon(w) : null);
  for (const m of t.modules) m.aim = t.rot;
  t.recalc();
  t.hp = t.stats.maxHp;
  t.cargo.add('scrap', 120);
  t.cargo.add('iron_plate', 20);
  t.cargo.add('copper_wire', 6);
  t.cargo.add('repair_kit', 2);
  t.cargo.add('rations', 8);
  return t;
}

export function starterCrew(): CrewMember[] {
  const roles = ['driver', 'gunner', 'engineer', 'mechanic'] as const;
  return roles.map((r) => makeCrew(r, 0, 1));
}

const sizeFilter = (size: WeaponSize) => (d: { size: WeaponSize }) => d.size === size;

/** A roaming raider tank, scaled to threat. */
export function buildRaider(threat: number, seed: number): Tank {
  const rng = new RNG(seed);
  const r = (): number => rng.next();
  const chassis = threat < 2.2 ? 'scout' : threat < 3.6 ? 'crawler' : threat < 5 ? 'assault' : threat < 6.5 ? 'siege' : 'dread';
  const t = new Tank('enemy', 'raider', chassis, 'Raider');
  t.threat = threat;
  t.dmgScale = 0.4 + 0.12 * threat;
  t.drive = 'hover';
  const lightW = (): WeaponItem => newWeapon(rollWeaponKey(r, sizeFilter('light')), rollDropRarity(r, threat), r);
  t.autoAdd('bridge');
  if (chassis === 'scout') {
    t.autoAdd('hp_light', lightW());
    t.autoAdd('engine');
    t.autoAdd('reactor');
    if (threat > 1.5) t.autoAdd('hp_light', lightW());
  } else {
    if (threat >= 3) t.autoAdd('hp_heavy', newWeapon(rollWeaponKey(r, sizeFilter('heavy')), rollDropRarity(r, threat), r));
    else t.autoAdd('hp_medium', newWeapon(rollWeaponKey(r, sizeFilter('medium')), rollDropRarity(r, threat), r));
    const lights = 2 + Math.floor(threat / 2);
    for (let i = 0; i < lights; i++) t.autoAdd('hp_light', lightW());
    if (threat >= 4.5) t.autoAdd('hp_medium', newWeapon(rollWeaponKey(r, sizeFilter('medium')), rollDropRarity(r, threat), r));
    t.autoAdd('engine');
    t.autoAdd('reactor');
    t.autoAdd('reactor');
    if (threat >= 4) t.autoAdd('shield');
    for (let i = 0; i < Math.floor(threat * 2); i++) t.autoAdd('armor');
  }
  t.recalc();
  const hpScale = 0.45 + 0.2 * threat;
  t.stats.maxHp = Math.round(t.stats.maxHp * hpScale);
  t.hp = t.stats.maxHp;
  t.shield = t.stats.shield;
  return t;
}

/** A fortified enemy base that never moves. Armament grows with threat. */
export function buildOutpost(threat: number, seed: number): Tank {
  const rng = new RNG(seed);
  const r = (): number => rng.next();
  const t = new Tank('enemy', 'outpost', 'outpost', 'Outpost');
  t.anchored = true;
  t.threat = threat;
  t.dmgScale = 0.35 + 0.11 * threat;
  const rar = (): WeaponItem['rarity'] => rollDropRarity(r, threat);
  t.addModule('bridge', 4, 4);
  t.addModule('hp_heavy', 0, 0, newWeapon(threat >= 4 ? rollWeaponKey(r, sizeFilter('heavy')) : 'main_battery', rar(), r));
  if (threat >= 3.5) t.addModule('hp_heavy', 9, 9, newWeapon(threat >= 5 ? rollWeaponKey(r, sizeFilter('heavy')) : 'main_battery', rar(), r));
  if (threat >= 2.6) t.addModule('hp_medium', 10, 0, newWeapon(rollWeaponKey(r, sizeFilter('medium')), rar(), r));
  if (threat >= 4.2) t.addModule('hp_medium', 0, 10, newWeapon(rollWeaponKey(r, sizeFilter('medium')), rar(), r));
  const spots = [[5, 0], [0, 6], [11, 5], [6, 11], [6, 0], [0, 5], [11, 6], [5, 11]];
  const lights = Math.min(spots.length, 2 + Math.floor(threat));
  for (let i = 0; i < lights; i++) t.addModule('hp_light', spots[i][0], spots[i][1], newWeapon(rollWeaponKey(r, sizeFilter('light')), rar(), r));
  t.addModule('reactor', 4, 1);
  t.addModule('reactor', 6, 1);
  t.addModule('barracks', 1, 4);
  t.addModule('cargo', 8, 4);
  t.addModule('radar', 5, 9);
  if (threat >= 3.5) t.addModule('shield', 8, 6);
  t.recalc();
  t.stats.maxHp = Math.round(t.stats.maxHp * (0.3 + 0.2 * threat));
  t.hp = t.stats.maxHp;
  t.shield = t.stats.shield;
  return t;
}

/** The mini tank crewed by side crew. */
export function buildOutrider(level: number): Tank {
  const t = new Tank('player', 'outrider', 'outrider', 'Outrider');
  t.addModule('bridge', 0, 2);
  t.addModule('hp_light', 0, 0, newWeapon('autocannon', 1));
  if (level >= 2) t.addModule('hp_light', 3, 0, newWeapon('autocannon', 1));
  t.addModule('engine', 1, 0);
  t.recalc();
  t.hp = t.stats.maxHp;
  return t;
}

export function weaponName(w: WeaponItem): string {
  return WEAPONS[w.key]?.name ?? w.key;
}
