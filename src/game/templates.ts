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

/** The Light Crawler every run starts with. */
export function buildStarterTank(x: number, y: number): Tank {
  const t = new Tank('player', 'main', 'crawler', 'Fortress');
  t.x = x;
  t.y = y;
  t.rot = -Math.PI / 2;
  t.addModule('hp_light', 0, 1, newWeapon('autocannon'));
  t.addModule('hp_light', 6, 1, newWeapon('autocannon'));
  t.addModule('hp_heavy', 2, 1, newWeapon('main_battery'));
  t.addModule('quarters', 0, 4);
  t.addModule('bridge', 3, 4);
  t.addModule('cargo', 5, 4);
  t.addModule('reactor', 0, 7);
  t.addModule('engine', 5, 7);
  for (const m of t.modules) m.aim = t.rot;
  t.recalc();
  t.hp = t.stats.maxHp;
  t.cargo.add('scrap', 60);
  t.cargo.add('iron_plate', 10);
  t.cargo.add('repair_kit', 2);
  t.cargo.add('rations', 8);
  return t;
}

export function starterCrew(): CrewMember[] {
  const roles = ['driver', 'gunner', 'engineer', 'mechanic'] as const;
  return roles.map((r, i) => {
    const c = makeCrew(r, 0, 1);
    c.officer = i;
    return c;
  });
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
  t.addModule('bridge', 5, 5);
  t.addModule('hp_heavy', 0, 0, newWeapon(threat >= 4 ? rollWeaponKey(r, sizeFilter('heavy')) : 'main_battery', rar(), r));
  if (threat >= 3.5) t.addModule('hp_heavy', 9, 9, newWeapon(threat >= 5 ? rollWeaponKey(r, sizeFilter('heavy')) : 'main_battery', rar(), r));
  if (threat >= 2.6) t.addModule('hp_medium', 10, 0, newWeapon(rollWeaponKey(r, sizeFilter('medium')), rar(), r));
  if (threat >= 4.2) t.addModule('hp_medium', 0, 10, newWeapon(rollWeaponKey(r, sizeFilter('medium')), rar(), r));
  const spots = [[5, 0], [0, 6], [11, 5], [6, 11], [6, 0], [0, 5], [11, 6], [5, 11]];
  const lights = Math.min(spots.length, 2 + Math.floor(threat));
  for (let i = 0; i < lights; i++) t.addModule('hp_light', spots[i][0], spots[i][1], newWeapon(rollWeaponKey(r, sizeFilter('light')), rar(), r));
  t.addModule('reactor', 3, 3);
  t.addModule('reactor', 7, 3);
  t.addModule('barracks', 3, 7);
  t.addModule('cargo', 7, 7);
  t.addModule('radar', 5, 3);
  if (threat >= 3.5) t.addModule('shield', 7, 5);
  t.recalc();
  t.stats.maxHp = Math.round(t.stats.maxHp * (0.3 + 0.2 * threat));
  t.hp = t.stats.maxHp;
  t.shield = t.stats.shield;
  return t;
}

/** The mini tank crewed by side crew. */
export function buildOutrider(level: number): Tank {
  const t = new Tank('player', 'outrider', 'outrider', 'Outrider');
  t.addModule('bridge', 1, 2);
  t.addModule('hp_light', 0, 0, newWeapon('autocannon', 1));
  if (level >= 2) t.addModule('hp_light', 3, 0, newWeapon('autocannon', 1));
  t.addModule('engine', 1, 4);
  t.recalc();
  t.hp = t.stats.maxHp;
  return t;
}

export function weaponName(w: WeaponItem): string {
  return WEAPONS[w.key]?.name ?? w.key;
}
