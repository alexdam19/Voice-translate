import { RARITIES, type Rarity } from './rarity';

/**
 * Base weapons mounted on tank hardpoints. A mounted weapon is a WeaponItem: a
 * base key plus a rarity and random affixes that make it stronger.
 */

export type WeaponFamily = 'ballistic' | 'artillery' | 'missile' | 'energy' | 'defense';
export type WeaponSize = 'light' | 'medium' | 'heavy';
export type ProjKind =
  | 'bullet' | 'shell' | 'mortar' | 'missile' | 'laser' | 'beam' | 'rail' | 'tesla' | 'flak' | 'pd'
  | 'spit' | 'boulder' | 'plasma' | 'pellet';

export interface WeaponDef {
  key: string;
  name: string;
  family: WeaponFamily;
  size: WeaponSize;
  /** Tech node that unlocks crafting it (looted copies can always be mounted). */
  tech?: string;
  /** Exclusive weapons only drop from rune chests, always Legendary. */
  exclusive?: boolean;
  dmg: number;
  /** Shots (or volleys) per second. */
  rate: number;
  range: number;
  minRange?: number;
  /** Projectile speed in units/s. 0 = instant hit (hitscan). */
  speed: number;
  spread: number;
  pellets: number;
  splash: number;
  pierce: number;
  chain: number;
  /** Homing turn rate (rad/s). */
  homing: number;
  /** Lobbed: flies over walls and hits the ground at the target. */
  arc: boolean;
  /** Shoots down incoming projectiles. */
  pd: boolean;
  /** Burn damage per second for 3 seconds. */
  burn: number;
  /** Power drawn while mounted. */
  power: number;
  /** Turret traverse speed (rad/s). */
  turn: number;
  kind: ProjKind;
  color: string;
  sound: 'cannon' | 'smg' | 'shotgun' | 'laser' | 'rail' | 'rocket' | 'mortar' | 'tesla' | 'flak';
  desc: string;
  /** Workshop cost for a Common copy. */
  cost: Record<string, number>;
}

const TURN: Record<WeaponSize, number> = { light: 5, medium: 3, heavy: 1.7 };

function W(o: Partial<WeaponDef> & Pick<WeaponDef, 'key' | 'name' | 'family' | 'size'>): WeaponDef {
  return {
    dmg: 10, rate: 1, range: 14, speed: 40, spread: 0.03, pellets: 1, splash: 0, pierce: 0, chain: 0, homing: 0,
    arc: false, pd: false, burn: 0, power: 1, turn: TURN[o.size], kind: 'bullet', color: '#ffd180', sound: 'cannon',
    desc: '', cost: {},
    ...o,
  };
}

export const WEAPONS: Record<string, WeaponDef> = {};
function add(d: WeaponDef): void {
  WEAPONS[d.key] = d;
}

/* Light (1x1 hardpoint) */
add(W({ key: 'autocannon', name: 'Autocannon', family: 'ballistic', size: 'light', tech: 'autocannon', dmg: 13, rate: 3, range: 15, speed: 42, spread: 0.05, sound: 'smg', desc: 'Reliable rapid-fire cannon.', cost: { iron_plate: 6, scrap: 20 } }));
add(W({ key: 'gatling', name: 'Gatling Sponson', family: 'ballistic', size: 'light', tech: 'gatling', dmg: 6, rate: 11, range: 11.5, speed: 46, spread: 0.11, sound: 'smg', color: '#ffe082', desc: 'Short range, absurd rate of fire.', cost: { iron_plate: 10, circuit: 3, scrap: 30 } }));
add(W({ key: 'flak', name: 'Flak Battery', family: 'defense', size: 'light', tech: 'flak', dmg: 9, pellets: 4, rate: 1.5, range: 13, speed: 34, spread: 0.2, splash: 1.4, kind: 'flak', sound: 'flak', color: '#ffcc80', desc: 'Bursting shells. Double damage to flyers.', cost: { iron_plate: 10, explosive: 2, scrap: 20 } }));
add(W({ key: 'laser', name: 'Laser Turret', family: 'energy', size: 'light', tech: 'laser', dmg: 22, rate: 2, range: 19, speed: 0, spread: 0.01, kind: 'laser', sound: 'laser', color: '#ff5252', power: 3, desc: 'Instant long-range beam. No ammo, draws power.', cost: { circuit: 6, cryo_core: 1, iron_plate: 6 } }));
add(W({ key: 'point_defense', name: 'Point Defense', family: 'defense', size: 'light', tech: 'point_defense', dmg: 7, rate: 6, range: 9, speed: 60, spread: 0.02, pd: true, kind: 'pd', sound: 'smg', color: '#80d8ff', power: 2, desc: 'Shoots down incoming shells and missiles, then shoots whatever fired them.', cost: { circuit: 6, titanium_alloy: 3 } }));

/* Medium (2x2 hardpoint) */
add(W({ key: 'missile_pod', name: 'Missile Pod', family: 'missile', size: 'medium', tech: 'missiles', dmg: 26, pellets: 4, rate: 0.7, range: 24, speed: 17, spread: 0.5, homing: 3.2, splash: 1.6, kind: 'missile', sound: 'rocket', color: '#ff9e40', desc: 'Volleys of homing missiles.', cost: { circuit: 8, explosive: 6, iron_plate: 10 } }));
add(W({ key: 'mortar', name: 'Mortar Pit', family: 'artillery', size: 'medium', tech: 'mortar', dmg: 55, rate: 0.5, range: 28, minRange: 6, speed: 16, spread: 0.06, splash: 3, arc: true, kind: 'mortar', sound: 'mortar', color: '#ffab40', desc: 'Lobs shells over obstacles. Big splash, minimum range.', cost: { iron_plate: 14, explosive: 8 } }));
add(W({ key: 'tesla', name: 'Tesla Coil', family: 'energy', size: 'medium', tech: 'tesla', dmg: 32, rate: 1.1, range: 11, speed: 0, chain: 3, kind: 'tesla', sound: 'tesla', color: '#b388ff', power: 5, desc: 'Lightning that jumps between up to 4 targets.', cost: { copper_wire: 30, cryo_core: 2, circuit: 6 } }));

/* Heavy (3x3 hardpoint) */
add(W({ key: 'main_battery', name: '88mm Main Battery', family: 'artillery', size: 'heavy', tech: 'main_battery', dmg: 85, rate: 0.45, range: 23, speed: 36, spread: 0.02, splash: 2.2, kind: 'shell', sound: 'cannon', color: '#ffd180', desc: 'The big gun. Heavy explosive shells.', cost: { iron_plate: 24, explosive: 6, scrap: 40 } }));
add(W({ key: 'rail_cannon', name: 'Rail Cannon', family: 'artillery', size: 'heavy', tech: 'rail_cannon', dmg: 240, rate: 0.3, range: 34, speed: 0, pierce: 8, kind: 'rail', sound: 'rail', color: '#ff7af0', power: 8, desc: 'Hypervelocity slug. Pierces everything in a line.', cost: { xeno_alloy: 6, uranium_rod: 4, titanium_alloy: 12 } }));

/* Exclusive (rune chests only, always Legendary) */
add(W({ key: 'sunspear', name: 'Sunspear Lance', family: 'energy', size: 'heavy', exclusive: true, dmg: 16, rate: 12, range: 26, speed: 0, pierce: 99, burn: 18, kind: 'beam', sound: 'laser', color: '#ffee58', power: 7, desc: 'EXCLUSIVE. A continuous solar beam that burns everything along its length.' }));
add(W({ key: 'hydra', name: 'Hydra Rack', family: 'missile', size: 'medium', exclusive: true, dmg: 24, pellets: 8, rate: 0.6, range: 28, speed: 19, spread: 0.9, homing: 5, splash: 1.8, kind: 'missile', sound: 'rocket', color: '#ff6e40', desc: 'EXCLUSIVE. Eight-headed swarm of seeker missiles.' }));
add(W({ key: 'thunderhead', name: 'Thunderhead Coil', family: 'energy', size: 'medium', exclusive: true, dmg: 40, rate: 1.3, range: 14, speed: 0, chain: 7, kind: 'tesla', sound: 'tesla', color: '#40c4ff', power: 5, desc: 'EXCLUSIVE. A storm in a box: lightning jumps across 8 targets.' }));
add(W({ key: 'maw', name: 'Grinder Maw', family: 'ballistic', size: 'light', exclusive: true, dmg: 9, pellets: 8, rate: 3, range: 9, speed: 40, spread: 0.36, kind: 'pellet', sound: 'shotgun', color: '#ff8a65', desc: 'EXCLUSIVE. Shredder cannon. Heals your hull for a slice of the damage.' }));
add(W({ key: 'oblivion', name: 'Oblivion Mortar', family: 'artillery', size: 'heavy', exclusive: true, dmg: 150, rate: 0.3, range: 32, minRange: 6, speed: 15, splash: 5, burn: 28, arc: true, kind: 'mortar', sound: 'mortar', color: '#e040fb', desc: 'EXCLUSIVE. Huge lobbed warheads that leave the ground burning.' }));

export const WEAPON_LIST: readonly WeaponDef[] = Object.values(WEAPONS);
export const STANDARD_WEAPONS = WEAPON_LIST.filter((w) => !w.exclusive);
export const EXCLUSIVE_WEAPONS = WEAPON_LIST.filter((w) => w.exclusive);

/* ---------------------------------------------------------------------- */
/* Weapon items: rarity + affixes                                           */
/* ---------------------------------------------------------------------- */

export interface WeaponItem {
  uid: number;
  key: string;
  rarity: Rarity;
  affixes: string[];
}

export interface AffixDef {
  key: string;
  name: string;
  desc: string;
  /** Which weapons can roll it. */
  ok: (d: WeaponDef) => boolean;
}

export const AFFIXES: Record<string, AffixDef> = {
  heavy: { key: 'heavy', name: 'Heavy', desc: '+20% damage', ok: () => true },
  rapid: { key: 'rapid', name: 'Rapid', desc: '+18% fire rate', ok: (d) => d.kind !== 'beam' },
  long: { key: 'long', name: 'Long-barrel', desc: '+18% range', ok: () => true },
  incendiary: { key: 'incendiary', name: 'Incendiary', desc: 'Burns targets (20% of damage per second, 3s)', ok: (d) => d.family !== 'energy' },
  piercing: { key: 'piercing', name: 'Piercing', desc: 'Hits one extra target', ok: (d) => d.kind === 'bullet' || d.kind === 'pellet' || d.kind === 'laser' || d.kind === 'shell' },
  blast: { key: 'blast', name: 'High-yield', desc: '+35% blast radius', ok: (d) => d.splash > 0 },
  arcing: { key: 'arcing', name: 'Arcing', desc: 'Lightning jumps to one extra target', ok: (d) => d.kind === 'tesla' },
  keen: { key: 'keen', name: 'Keen', desc: '+12% critical hit chance', ok: () => true },
  leech: { key: 'leech', name: 'Leeching', desc: 'Heals your hull for 4% of damage dealt', ok: () => true },
};

/** Number of affixes a weapon of this rarity rolls. */
export const AFFIX_COUNT: Record<Rarity, [number, number]> = { 0: [0, 0], 1: [0, 1], 2: [1, 1], 3: [2, 2], 4: [2, 3] };

export function rollAffixes(rng: () => number, key: string, rarity: Rarity): string[] {
  const d = WEAPONS[key];
  const [lo, hi] = AFFIX_COUNT[rarity];
  const n = lo + Math.floor(rng() * (hi - lo + 1));
  const pool = Object.values(AFFIXES).filter((a) => a.ok(d)).map((a) => a.key);
  const out: string[] = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export function makeWeapon(uid: number, key: string, rarity: Rarity, rng: () => number = Math.random): WeaponItem {
  const d = WEAPONS[key];
  const r = d.exclusive ? 4 : rarity;
  return { uid, key, rarity: r as Rarity, affixes: rollAffixes(rng, key, r as Rarity) };
}

/** Multiplicative per-family modifiers from research and crew. */
export interface WeaponMods {
  dmg: number;
  rate: number;
  range: number;
  radius: number;
  speed: number;
  turn: number;
  power: number;
  pellets: number;
  pierce: number;
  crit: number;
}

export const BASE_WEAPON_MODS: Readonly<WeaponMods> = { dmg: 1, rate: 1, range: 1, radius: 1, speed: 1, turn: 1, power: 1, pellets: 0, pierce: 0, crit: 0 };

export interface WeaponStats {
  dmg: number;
  rate: number;
  range: number;
  minRange: number;
  speed: number;
  spread: number;
  pellets: number;
  splash: number;
  pierce: number;
  chain: number;
  homing: number;
  burn: number;
  crit: number;
  lifesteal: number;
  power: number;
  turn: number;
}

/** Final numbers for a mounted weapon: base x rarity x affixes x research/crew mods. */
export function weaponStats(w: WeaponItem, mods: WeaponMods = BASE_WEAPON_MODS): WeaponStats {
  const d = WEAPONS[w.key];
  const rm = RARITIES[w.rarity].mult;
  const has = (a: string): boolean => w.affixes.includes(a);
  const s: WeaponStats = {
    dmg: d.dmg * rm * (has('heavy') ? 1.2 : 1) * mods.dmg,
    rate: d.rate * (1 + (rm - 1) * 0.35) * (has('rapid') ? 1.18 : 1) * mods.rate,
    range: d.range * (has('long') ? 1.18 : 1) * mods.range,
    minRange: d.minRange ?? 0,
    speed: d.speed * mods.speed,
    spread: d.spread,
    pellets: d.pellets + mods.pellets,
    splash: d.splash * (has('blast') ? 1.35 : 1) * mods.radius,
    pierce: d.pierce + (has('piercing') ? 1 : 0) + mods.pierce,
    chain: d.chain + (has('arcing') ? 1 : 0),
    homing: d.homing * mods.turn,
    burn: d.burn * rm + (has('incendiary') ? d.dmg * rm * 0.2 : 0),
    crit: 0.05 + (has('keen') ? 0.12 : 0) + mods.crit,
    lifesteal: (has('leech') ? 0.04 : 0) + (w.key === 'maw' ? 0.06 : 0),
    power: d.power * mods.power,
    turn: d.turn * (1 + (mods.turn - 1) * 0.3),
  };
  return s;
}

/** Rough damage-per-second score used for sorting and UI. */
export function weaponScore(w: WeaponItem, mods: WeaponMods = BASE_WEAPON_MODS): number {
  const s = weaponStats(w, mods);
  const aoe = 1 + s.splash * 0.35 + s.chain * 0.4 + Math.min(4, s.pierce) * 0.15;
  return Math.round(s.dmg * s.pellets * s.rate * aoe * (1 + s.crit) + s.burn);
}

/** Server-side cap for a single reported hit from this weapon (generous; buffs and crits included). */
export function maxHitDamage(key: string, rarity: Rarity): number {
  const d = WEAPONS[key];
  if (!d) return 0;
  return d.dmg * RARITIES[rarity].mult * 1.2 * 3.2 * 2.5 + d.burn * 3;
}
