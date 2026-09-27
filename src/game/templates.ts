import { RNG } from '../shared/rng';
import { rollDropRarity, rollWeaponKey } from '../shared/loot';
import { makeWeapon, WEAPONS, type WeaponItem, type WeaponSize } from '../shared/weapons';
import { CLASS_LIST, classDef, type HullClass } from './classes';
import { makeCrew, type CrewMember } from './crew';
import { chassisForCC } from './defs';
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
 * The Landkreuzer every run starts with: two stories and a roof. The hull brings its own weapons (a pad on each
 * corner and the main battery up front, placed by `ensureFixed`). On the roof: the Command Tower and a rifle nest.
 * Upper deck: bunks and a cargo hold. Lower hold: the reactor and two engines. Row 0 is the front.
 * Entries are [building, x, y, deck].
 */
export const STARTER_LAYOUT: [string, number, number, number][] = [
  ['bridge', 4, 8, 0],
  ['nest_rifle', 1, 12, 0],
  ['quarters', 2, 6, 1],
  ['quarters', 8, 6, 1],
  ['cargo', 5, 9, 1],
  ['reactor', 2, 13, 2],
  ['engine', 4, 16, 2],
  ['engine', 6, 16, 2],
];

/** What the built-in weapons start with: the main battery, and an autocannon on every corner pad. */
export function armFixed(t: Tank, weapon: (key: string) => WeaponItem = (k) => newWeapon(k)): void {
  for (const m of t.modules) {
    if (m.weapon) continue;
    if (m.key === 'main_gun') m.weapon = weapon('main_battery');
    else if (m.key === 'pad') m.weapon = weapon('autocannon');
  }
  t.version++;
  t.recalc();
}

export function buildStarterTank(x: number, y: number, klass: HullClass = 'juggernaut'): Tank {
  const t = new Tank('player', 'main', 'crawler', 'Fortress');
  t.klass = klass;
  t.x = x;
  t.y = y;
  t.rot = -Math.PI / 2;
  for (const [key, cx, cy, deck] of STARTER_LAYOUT) t.addModule(key, cx, cy, null, deck);
  t.ensureFixed();
  armFixed(t);
  // What the class brings along.
  for (const [key, deck] of classDef(klass).starter) {
    const s = t.findSpot(key, deck);
    if (!s) continue;
    const w = key === 'hp_light' ? newWeapon('autocannon') : null;
    t.addModule(key, s[0], s[1], w, s[2]);
  }
  for (const m of t.modules) m.aim = t.rot;
  t.recalc();
  // Every bunk filled.
  t.troops = t.stats.bunks;
  t.recalc();
  t.hp = t.stats.maxHp;
  t.cargo.add('scrap', 120);
  t.cargo.add('iron_plate', 20);
  t.cargo.add('copper_wire', 6);
  t.cargo.add('repair_kit', 2);
  t.cargo.add('rations', 8);
  if (klass === 'ark') t.cargo.add('explosive', 6);
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

export const RIVAL_NAMES = [
  'The Iron Tyrant', "Warlord Krag's Behemoth", 'The Rust Baron', 'Crimson Colossus', 'Mother of Treads', 'The Scrapyard King',
  'Black Ratte', 'Duchess of Cinders', 'The Last Parade', 'Hellcart', 'The Grinning Citadel', 'Old Ironsides',
];

/**
 * A rival dreadnought: an enemy fortress built like yours (same hull class, weapon pads, main battery)
 * and scaled to your commander level, so the fight is between equals.
 */
export function buildRival(level: number, cc: number, seed: number, name: string, kit: { tech?: Set<string>; stars?: number; klass?: HullClass } = {}): Tank {
  const rng = new RNG(seed);
  const r = (): number => rng.next();
  const t = new Tank('enemy', 'rival', chassisForCC(cc).key, name);
  // Rivals come in every class too.
  t.klass = kit.klass ?? CLASS_LIST[Math.floor(r() * CLASS_LIST.length)].key;
  t.threat = 1 + level / 5;
  // Enemy guns fire at base stats times this; yours get the Level Road, crew and forge on top.
  t.dmgScale = 0.34 + 0.016 * level;
  t.drive = 'tracks';
  t.addModule('bridge', Math.floor(t.cols / 2) - 2, Math.floor(t.rows / 2) - 2);
  t.modules[0].lvl = cc;
  t.ensureFixed();
  // Weapons about as good as yours: the same kinds you've unlocked, at about your stars.
  const stars = kit.stars ?? Math.floor(level / 6);
  const rar = (): WeaponItem['rarity'] => Math.max(0, Math.min(5, Math.round(stars) + (r() < 0.25 ? 1 : 0))) as WeaponItem['rarity'];
  const pick = (size: WeaponSize, fallback: string): string => {
    const ok = (d: { key: string; size: WeaponSize; exclusive?: boolean; tech?: string }): boolean => d.size === size && !d.exclusive && (!kit.tech || !d.tech || kit.tech.has(d.tech));
    return Object.values(WEAPONS).some(ok) ? rollWeaponKey(r, ok) : fallback;
  };
  for (const m of t.modules) {
    if (m.key === 'main_gun') m.weapon = newWeapon(pick('heavy', 'main_battery'), rar(), r);
    else if (m.key === 'pad') m.weapon = newWeapon(pick(r() < 0.3 + level * 0.02 ? 'medium' : 'light', 'autocannon'), rar(), r);
  }
  for (let i = 0; i < 1 + cc; i++) t.autoAdd('engine');
  for (let i = 0; i < 2 + cc; i++) t.autoAdd('reactor');
  for (let i = 0; i < 6 + cc * 3; i++) t.autoAdd('armor');
  if (cc >= 2) t.autoAdd('repair_bay');
  if (cc >= 3) t.autoAdd('shield');
  t.autoAdd('barracks');
  // Soldiers on its roof, like yours.
  for (let i = 0; i < 1 + Math.floor(cc / 2); i++) t.autoAdd(i % 2 ? 'nest_grenade' : 'nest_rifle');
  t.recalc();
  t.stats.maxHp = Math.round(t.stats.maxHp * (0.62 + 0.012 * level));
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
