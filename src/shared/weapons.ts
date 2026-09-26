import { RARITIES, type Rarity } from './rarity';

/**
 * Weapons mounted on tank hardpoints. A mounted weapon is a WeaponItem: a base key plus a
 * star level (its rarity, 1★ Common to 6★ Mythic), random affixes and an upgrade tree.
 */

export type WeaponFamily = 'ballistic' | 'artillery' | 'missile' | 'energy' | 'defense' | 'chemical' | 'arcane';
export type WeaponSize = 'light' | 'medium' | 'heavy';
export type ProjKind =
  | 'bullet' | 'shell' | 'mortar' | 'missile' | 'laser' | 'beam' | 'rail' | 'tesla' | 'flak' | 'pd'
  | 'spit' | 'boulder' | 'plasma' | 'pellet'
  | 'grenade' | 'flame' | 'ray' | 'acid' | 'cryo' | 'soul' | 'sonic' | 'orb' | 'chrono' | 'ink' | 'gravity'
  | 'void' | 'phoenix' | 'fireball' | 'meteor' | 'sky' | 'bomb' | 'nuke' | 'jet';

export type PoolKind = 'fire' | 'acid' | 'chrono' | 'rad' | 'frost';

export const FAMILY_INFO: Record<WeaponFamily, { name: string; color: string }> = {
  ballistic: { name: 'Ballistic', color: '#ffab40' },
  artillery: { name: 'Artillery', color: '#ff6e40' },
  missile: { name: 'Missile & Aviation', color: '#ff3d00' },
  energy: { name: 'Energy', color: '#ea80fc' },
  defense: { name: 'Defense', color: '#80d8ff' },
  chemical: { name: 'Chemical', color: '#76ff03' },
  arcane: { name: 'Arcane', color: '#b388ff' },
};

export interface WeaponDef {
  key: string;
  name: string;
  family: WeaponFamily;
  size: WeaponSize;
  /** Research node that unlocks crafting it (looted copies can always be mounted). */
  tech?: string;
  /** Exclusive weapons only drop from rune chests, always Legendary or better. */
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
  sound: string;
  desc: string;
  /** Workshop cost for a 1★ copy. */
  cost: Record<string, number>;
  /* ---- special mechanics ---- */
  /** Slows targets by this fraction for 2s. */
  slow?: number;
  /** Chance to stun (freeze / root) a target. */
  stun?: number;
  stunTime?: number;
  /** Leaves a pool on impact. */
  pool?: PoolKind;
  /** Splits into this many fragments on impact. */
  split?: number;
  /** Damage ramps up to +ramp while it keeps firing at the same target. */
  ramp?: number;
  /** Second barrel on the same turret: a continuous ray. */
  twin?: { dmg: number; rate: number; range: number; color: string };
  /** Calls this many strikes from the sky at the target. */
  sky?: number;
  knock?: number;
  /** Impact opens a gravity well. */
  pull?: boolean;
  lifesteal?: number;
  /** Instantly finishes targets under 20% health. */
  execute?: boolean;
  /** Launches mini fighter jets instead of shells (max alive per turret). */
  jets?: number;
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

/* ---------------- Light (1x1 hardpoint) ---------------- */
add(W({ key: 'autocannon', name: 'Autocannon', family: 'ballistic', size: 'light', tech: 'autocannon', dmg: 13, rate: 3, range: 15, speed: 42, spread: 0.05, sound: 'smg', desc: 'Reliable rapid-fire cannon.', cost: { iron_plate: 6, scrap: 20 } }));
add(W({ key: 'gatling', name: 'Gatling Sponson', family: 'ballistic', size: 'light', tech: 'gatling', dmg: 6, rate: 11, range: 11.5, speed: 46, spread: 0.11, sound: 'smg', color: '#ffe082', desc: 'Short range, absurd rate of fire.', cost: { iron_plate: 10, circuit: 3, scrap: 30 } }));
add(W({ key: 'grenade_launcher', name: 'Grenade Launcher', family: 'ballistic', size: 'light', tech: 'grenades', dmg: 28, rate: 1.3, range: 16, minRange: 3, speed: 16, spread: 0.08, splash: 1.8, arc: true, kind: 'grenade', sound: 'mortar', color: '#c5e1a5', desc: 'Lobs frag grenades over cover.', cost: { iron_plate: 10, explosive: 6 } }));
add(W({ key: 'scattergun', name: 'Scattergun', family: 'ballistic', size: 'light', tech: 'scatter', dmg: 7, pellets: 7, rate: 1.6, range: 9, speed: 38, spread: 0.32, knock: 3, kind: 'pellet', sound: 'shotgun', color: '#ffcc80', desc: 'A wall of buckshot that shoves enemies back.', cost: { iron_plate: 12, scrap: 30 } }));
add(W({ key: 'flak', name: 'Flak Battery', family: 'defense', size: 'light', tech: 'flak', dmg: 9, pellets: 4, rate: 1.5, range: 13, speed: 34, spread: 0.2, splash: 1.4, kind: 'flak', sound: 'flak', color: '#ffcc80', desc: 'Bursting shells. Double damage to flyers.', cost: { iron_plate: 10, explosive: 2, scrap: 20 } }));
add(W({ key: 'point_defense', name: 'Point Defense', family: 'defense', size: 'light', tech: 'point_defense', dmg: 7, rate: 6, range: 9, speed: 60, spread: 0.02, pd: true, kind: 'pd', sound: 'smg', color: '#80d8ff', power: 2, desc: 'Shoots down incoming shells and missiles, then shoots whatever fired them.', cost: { circuit: 6, titanium_alloy: 3 } }));
add(W({ key: 'laser', name: 'Laser Turret', family: 'energy', size: 'light', tech: 'laser', dmg: 22, rate: 2, range: 19, speed: 0, spread: 0.01, kind: 'laser', sound: 'laser', color: '#ff5252', power: 3, desc: 'Instant long-range beam. No ammo, draws power.', cost: { circuit: 6, cryo_core: 1, iron_plate: 6 } }));
add(W({ key: 'raygun', name: 'Ray Gun', family: 'energy', size: 'light', tech: 'rayguns', dmg: 6, rate: 8, range: 15, speed: 0, spread: 0, ramp: 1.5, kind: 'ray', sound: 'ray', color: '#69f0ae', power: 2, desc: 'Retro death-ray. Damage ramps up to +150% while it holds on one target.', cost: { circuit: 8, copper_wire: 10, cryo_core: 1 } }));
add(W({ key: 'cryo_blaster', name: 'Cryo Blaster', family: 'energy', size: 'light', tech: 'cryo_weapons', dmg: 15, rate: 2.2, range: 14, speed: 30, spread: 0.03, slow: 0.45, stun: 0.08, stunTime: 1.2, kind: 'cryo', sound: 'laser', color: '#80deea', power: 2, desc: 'Freezing bolts. Slow targets by 45% and sometimes freeze them solid.', cost: { cryo_core: 3, circuit: 4, titanium_alloy: 2 } }));
add(W({ key: 'flamethrower', name: 'Flamethrower', family: 'chemical', size: 'light', tech: 'flamers', dmg: 4, pellets: 2, rate: 12, range: 7.5, speed: 13, spread: 0.22, pierce: 4, burn: 12, kind: 'flame', sound: 'flame', color: '#ff9100', desc: 'A hose of burning fuel. Pierces crowds and sets them alight.', cost: { iron_plate: 8, sulfur: 10 } }));
add(W({ key: 'acid_launcher', name: 'Acid Launcher', family: 'chemical', size: 'light', tech: 'acid_launcher', dmg: 20, rate: 1, range: 15, minRange: 2, speed: 15, spread: 0.06, splash: 1.6, arc: true, pool: 'acid', kind: 'acid', sound: 'splat', color: '#76ff03', desc: 'Lobs caustic globs that leave pools of acid. Acid eats through armor.', cost: { sulfur: 12, titanium_alloy: 2, biomass: 6 } }));
add(W({ key: 'soul_reaper', name: 'Soul Reaper', family: 'arcane', size: 'light', tech: 'soulcraft', dmg: 18, rate: 2, range: 18, speed: 12, spread: 0.3, homing: 6, lifesteal: 0.06, kind: 'soul', sound: 'arcane', color: '#b388ff', power: 2, desc: 'Spectral skulls that hunt their target and drain its life into your hull.', cost: { xenite: 4, mythic_essence: 1, circuit: 4 } }));

/* ---------------- Medium (2x2 hardpoint) ---------------- */
add(W({ key: 'missile_pod', name: 'Missile Pod', family: 'missile', size: 'medium', tech: 'missiles', dmg: 26, pellets: 4, rate: 0.7, range: 24, speed: 17, spread: 0.5, homing: 3.2, splash: 1.6, kind: 'missile', sound: 'rocket', color: '#ff9e40', desc: 'Volleys of homing missiles.', cost: { circuit: 8, explosive: 6, iron_plate: 10 } }));
add(W({ key: 'swarm_hive', name: 'Swarm Hive', family: 'missile', size: 'medium', tech: 'micro_swarm', dmg: 10, pellets: 10, rate: 0.6, range: 24, speed: 14, spread: 1.2, homing: 7, splash: 0.9, kind: 'missile', sound: 'rocket', color: '#ffab40', desc: 'Ten micro-missiles per volley, each with a mind of its own.', cost: { circuit: 12, explosive: 12, titanium_alloy: 4 } }));
add(W({ key: 'hornet_nest', name: 'Hornet Launcher', family: 'missile', size: 'medium', tech: 'hornets', dmg: 14, rate: 0.35, range: 30, speed: 0, jets: 3, kind: 'jet', sound: 'rocket', color: '#90caf9', power: 3, desc: 'A catapult that launches mini fighter jets. Up to 3 fly at once, strafing and bombing targets.', cost: { titanium_alloy: 10, circuit: 10, explosive: 6 } }));
add(W({ key: 'mortar', name: 'Mortar Pit', family: 'artillery', size: 'medium', tech: 'mortar', dmg: 55, rate: 0.5, range: 28, minRange: 6, speed: 16, spread: 0.06, splash: 3, arc: true, kind: 'mortar', sound: 'mortar', color: '#ffab40', desc: 'Lobs shells over obstacles. Big splash, minimum range.', cost: { iron_plate: 14, explosive: 8 } }));
add(W({ key: 'tesla', name: 'Tesla Coil', family: 'energy', size: 'medium', tech: 'tesla', dmg: 32, rate: 1.1, range: 11, speed: 0, chain: 3, kind: 'tesla', sound: 'tesla', color: '#b388ff', power: 5, desc: 'Lightning that jumps between up to 4 targets.', cost: { copper_wire: 30, cryo_core: 2, circuit: 6 } }));
add(W({ key: 'plasma_launcher', name: 'Plasma Launcher', family: 'energy', size: 'medium', tech: 'plasma', dmg: 75, rate: 0.75, range: 20, speed: 15, spread: 0.03, splash: 2.4, burn: 10, kind: 'plasma', sound: 'plasma', color: '#e040fb', power: 5, desc: 'Balls of star-hot plasma that splash and scorch.', cost: { uranium_rod: 3, cryo_core: 2, circuit: 8 } }));
add(W({ key: 'sonic_cannon', name: 'Sonic Cannon', family: 'defense', size: 'medium', tech: 'sonics', dmg: 30, rate: 1, range: 10, speed: 0, knock: 10, stun: 0.2, stunTime: 0.8, kind: 'sonic', sound: 'sonic', color: '#b2ebf2', power: 3, desc: 'A cone of pure noise. Hits everything in front, hurls it back and can stun.', cost: { circuit: 10, copper_wire: 20, titanium_alloy: 4 } }));
add(W({ key: 'dragons_breath', name: "Dragon's Breath", family: 'chemical', size: 'medium', tech: 'dragonfire', dmg: 8, pellets: 4, rate: 10, range: 10.5, speed: 15, spread: 0.3, pierce: 6, burn: 28, kind: 'flame', sound: 'flame', color: '#ff3d00', desc: 'A flamethrower fed by a caged fire elemental. The flames never go out.', cost: { sulfur: 20, uranium_rod: 2, mythic_essence: 1 } }));
add(W({ key: 'kraken', name: 'Kraken Launcher', family: 'chemical', size: 'medium', tech: 'kraken', dmg: 40, rate: 0.7, range: 18, minRange: 3, speed: 14, spread: 0.05, splash: 2.6, arc: true, stun: 1, stunTime: 1.4, kind: 'ink', sound: 'mortar', color: '#7c4dff', desc: 'Lobs ink bombs that burst into tentacles and root everything caught.', cost: { biomass: 20, xenite: 3, titanium_alloy: 6 } }));
add(W({ key: 'chrono_cannon', name: 'Chrono Cannon', family: 'arcane', size: 'medium', tech: 'chronomancy', dmg: 55, rate: 0.8, range: 22, speed: 18, spread: 0.03, splash: 2.6, pool: 'chrono', kind: 'chrono', sound: 'arcane', color: '#18ffff', power: 4, desc: 'Shells that crack time. Leave a field that slows enemies by 70%.', cost: { cryo_core: 4, xenite: 4, mythic_essence: 2 } }));
add(W({ key: 'arcane_orb', name: 'Arcane Orb Projector', family: 'arcane', size: 'medium', tech: 'arcane_focus', dmg: 36, rate: 0.6, range: 22, speed: 6, spread: 0.02, pierce: 99, kind: 'orb', sound: 'arcane', color: '#ea80fc', power: 4, desc: 'Slow orbs of raw magic that drift through enemies, hitting everything they touch.', cost: { xenite: 4, cryo_core: 2, mythic_essence: 1 } }));

/* ---------------- Heavy (3x3 hardpoint) ---------------- */
add(W({ key: 'main_battery', name: '88mm Main Battery', family: 'artillery', size: 'heavy', tech: 'main_battery', dmg: 85, rate: 0.45, range: 23, speed: 36, spread: 0.02, splash: 2.2, kind: 'shell', sound: 'cannon', color: '#ffd180', desc: 'The big gun. Heavy explosive shells.', cost: { iron_plate: 24, explosive: 6, scrap: 40 } }));
add(W({ key: 'howitzer', name: 'Siege Howitzer', family: 'artillery', size: 'heavy', tech: 'howitzer', dmg: 170, rate: 0.25, range: 40, minRange: 9, speed: 20, spread: 0.04, splash: 4, arc: true, split: 4, kind: 'mortar', sound: 'mortar', color: '#ffcc80', desc: 'Enormous lobbed shells that burst into 4 bomblets. Outranges everything.', cost: { titanium_alloy: 20, explosive: 16, tech_parts: 4 } }));
add(W({ key: 'rail_cannon', name: 'Rail Cannon', family: 'artillery', size: 'heavy', tech: 'rail_cannon', dmg: 240, rate: 0.3, range: 34, speed: 0, pierce: 8, kind: 'rail', sound: 'rail', color: '#ff7af0', power: 8, desc: 'Hypervelocity slug. Pierces everything in a line.', cost: { xeno_alloy: 6, uranium_rod: 4, titanium_alloy: 12 } }));
add(W({ key: 'ray_rail', name: 'Ray-Rail Twin Cannon', family: 'energy', size: 'heavy', tech: 'ray_rail', dmg: 210, rate: 0.32, range: 34, speed: 0, pierce: 8, twin: { dmg: 10, rate: 8, range: 22, color: '#69f0ae' }, kind: 'rail', sound: 'rail', color: '#ff7af0', power: 10, desc: 'Two barrels, one turret: a rail slug that pierces everything, plus a death-ray that never stops firing.', cost: { xeno_alloy: 8, uranium_rod: 6, cryo_core: 4, tech_parts: 6 } }));
add(W({ key: 'storm_spire', name: 'Storm Spire', family: 'energy', size: 'heavy', tech: 'weather_control', dmg: 85, rate: 0.55, range: 30, speed: 0, sky: 3, stun: 0.25, stunTime: 1, kind: 'sky', sound: 'tesla', color: '#40c4ff', power: 9, desc: 'A lightning rod that calls down 3 bolts from the sky on its target.', cost: { copper_wire: 60, uranium_rod: 4, cryo_core: 4, tech_parts: 6 } }));
add(W({ key: 'gravity_cannon', name: 'Graviton Cannon', family: 'arcane', size: 'heavy', tech: 'gravitics', dmg: 130, rate: 0.35, range: 28, speed: 12, spread: 0.02, splash: 4, pull: true, kind: 'gravity', sound: 'arcane', color: '#d500f9', power: 8, desc: 'Fires a collapsing star. The blast drags enemies into a gravity well.', cost: { xeno_alloy: 8, mythic_essence: 3, tech_parts: 8 } }));
add(W({ key: 'phoenix_launcher', name: 'Phoenix Launcher', family: 'arcane', size: 'heavy', tech: 'phoenix', dmg: 120, rate: 0.3, range: 30, speed: 11, spread: 0, homing: 2.5, pierce: 99, burn: 35, split: 6, kind: 'phoenix', sound: 'arcane', color: '#ff6d00', power: 7, desc: 'Releases a blazing phoenix that tears through enemies, then bursts into 6 fireballs.', cost: { xeno_alloy: 10, sulfur: 30, mythic_essence: 4 } }));
add(W({ key: 'void_lance', name: 'Void Lance', family: 'arcane', size: 'heavy', tech: 'void_rift', dmg: 340, rate: 0.24, range: 38, speed: 0, pierce: 99, execute: true, kind: 'void', sound: 'rail', color: '#651fff', power: 12, desc: 'Tears a line through reality. Anything left under 20% health is erased.', cost: { xeno_alloy: 12, mythic_essence: 6, tech_parts: 12 } }));

/* ---------------- Exclusive (rune chests only, 5★ or better) ---------------- */
add(W({ key: 'sunspear', name: 'Sunspear Lance', family: 'energy', size: 'heavy', exclusive: true, dmg: 16, rate: 12, range: 26, speed: 0, pierce: 99, burn: 18, kind: 'beam', sound: 'laser', color: '#ffee58', power: 7, desc: 'EXCLUSIVE. A continuous solar beam that burns everything along its length.' }));
add(W({ key: 'hydra', name: 'Hydra Rack', family: 'missile', size: 'medium', exclusive: true, dmg: 24, pellets: 8, rate: 0.6, range: 28, speed: 19, spread: 0.9, homing: 5, splash: 1.8, kind: 'missile', sound: 'rocket', color: '#ff6e40', desc: 'EXCLUSIVE. Eight-headed swarm of seeker missiles.' }));
add(W({ key: 'thunderhead', name: 'Thunderhead Coil', family: 'energy', size: 'medium', exclusive: true, dmg: 40, rate: 1.3, range: 14, speed: 0, chain: 7, kind: 'tesla', sound: 'tesla', color: '#40c4ff', power: 5, desc: 'EXCLUSIVE. A storm in a box: lightning jumps across 8 targets.' }));
add(W({ key: 'maw', name: 'Grinder Maw', family: 'ballistic', size: 'light', exclusive: true, dmg: 9, pellets: 8, rate: 3, range: 9, speed: 40, spread: 0.36, lifesteal: 0.06, kind: 'pellet', sound: 'shotgun', color: '#ff8a65', desc: 'EXCLUSIVE. Shredder cannon. Heals your hull for a slice of the damage.' }));
add(W({ key: 'oblivion', name: 'Oblivion Mortar', family: 'artillery', size: 'heavy', exclusive: true, dmg: 150, rate: 0.3, range: 32, minRange: 6, speed: 15, splash: 5, burn: 28, arc: true, pool: 'fire', kind: 'mortar', sound: 'mortar', color: '#e040fb', desc: 'EXCLUSIVE. Huge lobbed warheads that leave the ground burning.' }));
add(W({ key: 'stormcaller', name: 'Stormcaller', family: 'energy', size: 'medium', exclusive: true, dmg: 55, rate: 0.8, range: 26, speed: 0, sky: 5, chain: 2, stun: 0.3, stunTime: 1.2, kind: 'sky', sound: 'tesla', color: '#82b1ff', power: 6, desc: "EXCLUSIVE. A thunder god's hammer bolted to a turret: five bolts from the sky that leap between targets." }));
add(W({ key: 'starfall', name: 'Starfall Array', family: 'arcane', size: 'heavy', exclusive: true, dmg: 160, rate: 0.3, range: 36, speed: 0, sky: 5, splash: 3, burn: 20, pool: 'fire', kind: 'meteor', sound: 'mortar', color: '#ffd740', power: 8, desc: 'EXCLUSIVE. Pulls falling stars out of orbit and drops them on your target.' }));

export const WEAPON_LIST: readonly WeaponDef[] = Object.values(WEAPONS);
export const STANDARD_WEAPONS = WEAPON_LIST.filter((w) => !w.exclusive);
export const EXCLUSIVE_WEAPONS = WEAPON_LIST.filter((w) => w.exclusive);

/* ---------------------------------------------------------------------- */
/* Weapon items: stars (rarity) + affixes + upgrade tree                   */
/* ---------------------------------------------------------------------- */

export interface WeaponItem {
  uid: number;
  key: string;
  rarity: Rarity;
  affixes: string[];
  /** Upgrade-tree nodes taken, e.g. ['F1', 'F2', 'H1']. */
  tree?: string[];
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
  piercing: { key: 'piercing', name: 'Piercing', desc: 'Hits one extra target', ok: (d) => d.kind === 'bullet' || d.kind === 'pellet' || d.kind === 'laser' || d.kind === 'shell' || d.kind === 'ray' },
  blast: { key: 'blast', name: 'High-yield', desc: '+35% blast radius', ok: (d) => d.splash > 0 },
  arcing: { key: 'arcing', name: 'Arcing', desc: 'Lightning jumps to one extra target', ok: (d) => d.kind === 'tesla' || d.kind === 'sky' },
  keen: { key: 'keen', name: 'Keen', desc: '+12% critical hit chance', ok: () => true },
  leech: { key: 'leech', name: 'Leeching', desc: 'Heals your hull for 4% of damage dealt', ok: () => true },
  frost: { key: 'frost', name: 'Frostbitten', desc: 'Hits slow targets by 20%', ok: (d) => d.family === 'energy' || d.family === 'arcane' || d.family === 'defense' },
  volatile: { key: 'volatile', name: 'Volatile', desc: 'Kills explode for 25% of the damage', ok: (d) => d.family !== 'defense' },
};

/** Number of affixes a weapon of this star level rolls. */
export const AFFIX_COUNT: Record<Rarity, [number, number]> = { 0: [0, 0], 1: [0, 1], 2: [1, 1], 3: [2, 2], 4: [2, 3], 5: [3, 3] };

export function rollAffixes(rng: () => number, key: string, rarity: Rarity, keep: string[] = []): string[] {
  const d = WEAPONS[key];
  const [lo, hi] = AFFIX_COUNT[rarity];
  const n = Math.max(keep.length, lo + Math.floor(rng() * (hi - lo + 1)));
  const pool = Object.values(AFFIXES).filter((a) => a.ok(d) && !keep.includes(a.key)).map((a) => a.key);
  const out = keep.slice();
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export function makeWeapon(uid: number, key: string, rarity: Rarity, rng: () => number = Math.random): WeaponItem {
  const d = WEAPONS[key];
  const r = (d.exclusive ? Math.max(4, rarity) : rarity) as Rarity;
  return { uid, key, rarity: r, affixes: rollAffixes(rng, key, r), tree: [] };
}

/* ---------------------------------------------------------------------- */
/* Upgrade trees: 3 branches x 3 tiers, one point per star                 */
/* ---------------------------------------------------------------------- */

export type Special =
  | 'execute' | 'double_tap' | 'cluster' | 'overcharge' | 'chain_react' | 'storm' | 'singularity' | 'vampire' | 'napalm' | 'seeker';

export interface TreeFx {
  dmg?: number;
  rate?: number;
  range?: number;
  crit?: number;
  splash?: number;
  pellets?: number;
  pierce?: number;
  chain?: number;
  burn?: number;
  slow?: number;
  lifesteal?: number;
  turn?: number;
  special?: Special;
}

export interface TreeNode {
  id: string;
  name: string;
  desc: string;
  fx: TreeFx;
}

export const TREE_BRANCHES: { key: 'F' | 'H' | 'P'; name: string; color: string }[] = [
  { key: 'F', name: 'Firepower', color: '#ff7043' },
  { key: 'H', name: 'Handling', color: '#4dd0e1' },
  { key: 'P', name: 'Payload', color: '#c6ff00' },
];

export const SPECIAL_INFO: Record<Special, { name: string; desc: string }> = {
  execute: { name: 'Executioner', desc: 'Deals double damage to targets under 30% health.' },
  double_tap: { name: 'Double Tap', desc: '30% chance each shot fires twice.' },
  cluster: { name: 'Cluster Payload', desc: 'Every blast scatters 4 bomblets.' },
  overcharge: { name: 'Overcharge', desc: 'Every 4th shot deals triple damage.' },
  chain_react: { name: 'Chain Reaction', desc: 'Enemies it kills explode for 40% of the hit.' },
  storm: { name: 'Storm Caller', desc: '20% chance a hit calls lightning from the sky.' },
  singularity: { name: 'Singularity', desc: 'Hits open a small gravity well that drags enemies together.' },
  vampire: { name: 'Vampiric', desc: 'Heals your hull for 6% of the damage dealt.' },
  napalm: { name: 'Hellfire', desc: 'Hits leave burning ground behind.' },
  seeker: { name: 'Smart Rounds', desc: 'Shots curve toward their target.' },
};

interface FamilyTree {
  f1: string;
  h1: string;
  f3: Special;
  h3: Special;
  p1: [string, string, TreeFx];
  p2: [string, string, TreeFx];
  p3: Special;
}

const FAMILY_TREES: Record<WeaponFamily, FamilyTree> = {
  ballistic: { f1: 'Hollow Points', h1: 'Oiled Action', f3: 'execute', h3: 'double_tap', p1: ['AP Core', 'Pierce 1 more target', { pierce: 1 }], p2: ['Tracer Fire', 'Burns for 25% of damage per second', { burn: 0.25 }], p3: 'seeker' },
  artillery: { f1: 'Heavy Charge', h1: 'Autoloader', f3: 'overcharge', h3: 'double_tap', p1: ['High Yield', '+30% blast radius', { splash: 0.3 }], p2: ['Napalm Fill', 'Burns for 30% of damage per second', { burn: 0.3 }], p3: 'cluster' },
  missile: { f1: 'Shaped Charge', h1: 'Rapid Racks', f3: 'chain_react', h3: 'double_tap', p1: ['Extra Tube', '+1 projectile per volley', { pellets: 1 }], p2: ['Thermite', 'Burns for 25% of damage per second', { burn: 0.25 }], p3: 'cluster' },
  energy: { f1: 'Focus Crystal', h1: 'Capacitor', f3: 'overcharge', h3: 'storm', p1: ['Prism', '+1 pierce and +1 chain', { pierce: 1, chain: 1 }], p2: ['Cryo Emitter', 'Hits slow targets by 30%', { slow: 0.3 }], p3: 'vampire' },
  defense: { f1: 'Proximity Fuze', h1: 'Servo Mount', f3: 'execute', h3: 'double_tap', p1: ['Burst Charge', '+30% blast radius', { splash: 0.3 }], p2: ['Frag Burst', '+1 projectile per shot', { pellets: 1 }], p3: 'cluster' },
  chemical: { f1: 'Concentrate', h1: 'Pressure Pump', f3: 'chain_react', h3: 'double_tap', p1: ['Wide Spray', '+30% area and +1 pierce', { splash: 0.3, pierce: 1 }], p2: ['Lingering Toxins', 'Burns for 35% of damage per second', { burn: 0.35 }], p3: 'napalm' },
  arcane: { f1: 'Runes of Might', h1: 'Quickening', f3: 'singularity', h3: 'storm', p1: ['Split Soul', '+1 pierce and +1 chain', { pierce: 1, chain: 1 }], p2: ['Frostbrand', 'Hits slow targets by 35%', { slow: 0.35 }], p3: 'vampire' },
};

const treeCache = new Map<WeaponFamily, TreeNode[][]>();

/** The tree for a weapon family: [Firepower, Handling, Payload], each 3 tiers. */
export function weaponTree(fam: WeaponFamily): TreeNode[][] {
  let t = treeCache.get(fam);
  if (t) return t;
  const f = FAMILY_TREES[fam];
  const sp = (id: string, s: Special): TreeNode => ({ id, name: SPECIAL_INFO[s].name, desc: SPECIAL_INFO[s].desc, fx: { special: s } });
  t = [
    [
      { id: 'F1', name: f.f1, desc: '+20% damage', fx: { dmg: 0.2 } },
      { id: 'F2', name: 'Weak Spot', desc: '+10% critical hit chance, +10% damage', fx: { crit: 0.1, dmg: 0.1 } },
      sp('F3', f.f3),
    ],
    [
      { id: 'H1', name: f.h1, desc: '+16% fire rate', fx: { rate: 0.16 } },
      { id: 'H2', name: 'Long Reach', desc: '+18% range, +40% turret speed', fx: { range: 0.18, turn: 0.4 } },
      sp('H3', f.h3),
    ],
    [
      { id: 'P1', name: f.p1[0], desc: f.p1[1], fx: f.p1[2] },
      { id: 'P2', name: f.p2[0], desc: f.p2[1], fx: f.p2[2] },
      sp('P3', f.p3),
    ],
  ];
  treeCache.set(fam, t);
  return t;
}

export function treeNode(fam: WeaponFamily, id: string): TreeNode | undefined {
  const b = TREE_BRANCHES.findIndex((x) => x.key === id[0]);
  const tier = Number(id[1]) - 1;
  return b < 0 || tier < 0 || tier > 2 ? undefined : weaponTree(fam)[b][tier];
}

/** Tree points a weapon has: one per star. */
export const treePoints = (w: WeaponItem): number => w.rarity + 1;
export const treeSpent = (w: WeaponItem): number => (w.tree ?? []).length;

export function canTakeNode(w: WeaponItem, id: string): boolean {
  const tree = w.tree ?? [];
  if (tree.includes(id) || treeSpent(w) >= treePoints(w)) return false;
  if (!treeNode(WEAPONS[w.key].family, id)) return false;
  const tier = Number(id[1]);
  return tier === 1 || tree.includes(`${id[0]}${tier - 1}`);
}

export function sanitizeTree(w: WeaponItem): void {
  const d = WEAPONS[w.key];
  const want = (w.tree ?? []).filter((id) => d && treeNode(d.family, id));
  w.tree = [];
  for (const id of want.sort((a, b) => Number(a[1]) - Number(b[1]))) if (canTakeNode(w, id)) w.tree.push(id);
}

/* ---------------------------------------------------------------------- */
/* Final stats                                                             */
/* ---------------------------------------------------------------------- */

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
  slow: number;
  stun: number;
  stunTime: number;
  knock: number;
  ramp: number;
  split: number;
  sky: number;
  specials: Special[];
  volatile: boolean;
  twinDmg: number;
  twinRate: number;
  twinRange: number;
}

/** Final numbers for a mounted weapon: base x stars x affixes x tree x research/crew mods. */
export function weaponStats(w: WeaponItem, mods: WeaponMods = BASE_WEAPON_MODS): WeaponStats {
  const d = WEAPONS[w.key];
  const rm = RARITIES[w.rarity].mult;
  const has = (a: string): boolean => w.affixes.includes(a);
  const t: Required<Omit<TreeFx, 'special'>> = { dmg: 0, rate: 0, range: 0, crit: 0, splash: 0, pellets: 0, pierce: 0, chain: 0, burn: 0, slow: 0, lifesteal: 0, turn: 0 };
  const specials: Special[] = [];
  for (const id of w.tree ?? []) {
    const n = treeNode(d.family, id);
    if (!n) continue;
    for (const k of Object.keys(n.fx) as (keyof TreeFx)[]) {
      if (k === 'special') specials.push(n.fx.special!);
      else t[k] += n.fx[k]!;
    }
  }
  const dmg = d.dmg * rm * (has('heavy') ? 1.2 : 1) * (1 + t.dmg) * mods.dmg;
  const rateF = (1 + (rm - 1) * 0.35) * (has('rapid') ? 1.18 : 1) * (1 + t.rate) * mods.rate;
  return {
    dmg,
    rate: d.rate * rateF,
    range: d.range * (has('long') ? 1.18 : 1) * (1 + t.range) * mods.range,
    minRange: d.minRange ?? 0,
    speed: d.speed * mods.speed,
    spread: d.spread,
    pellets: d.pellets + mods.pellets + t.pellets,
    splash: d.splash * (has('blast') ? 1.35 : 1) * (1 + t.splash) * mods.radius,
    pierce: d.pierce + (has('piercing') ? 1 : 0) + mods.pierce + t.pierce,
    chain: d.chain + (has('arcing') ? 1 : 0) + t.chain,
    homing: (d.homing || (specials.includes('seeker') ? 2.5 : 0)) * mods.turn,
    burn: d.burn * rm + (has('incendiary') ? d.dmg * rm * 0.2 : 0) + dmg * t.burn,
    crit: 0.05 + (has('keen') ? 0.12 : 0) + mods.crit + t.crit,
    lifesteal: (has('leech') ? 0.04 : 0) + (d.lifesteal ?? 0) + t.lifesteal + (specials.includes('vampire') ? 0.06 : 0),
    power: d.power * mods.power,
    turn: d.turn * (1 + (mods.turn - 1) * 0.3) * (1 + t.turn),
    slow: Math.min(0.8, (d.slow ?? 0) + (has('frost') ? 0.2 : 0) + t.slow),
    stun: d.stun ?? 0,
    stunTime: d.stunTime ?? 1,
    knock: d.knock ?? 0,
    ramp: d.ramp ?? 0,
    split: d.split ?? 0,
    sky: d.sky ?? 0,
    specials,
    volatile: has('volatile'),
    twinDmg: (d.twin?.dmg ?? 0) * rm * (1 + t.dmg) * mods.dmg,
    twinRate: (d.twin?.rate ?? 0) * rateF,
    twinRange: (d.twin?.range ?? 0) * (1 + t.range) * mods.range,
  };
}

/** Rough damage-per-second score used for sorting and UI. */
export function weaponScore(w: WeaponItem, mods: WeaponMods = BASE_WEAPON_MODS): number {
  const d = WEAPONS[w.key];
  const s = weaponStats(w, mods);
  const aoe = 1 + s.splash * 0.35 + s.chain * 0.4 + Math.min(4, s.pierce) * 0.15 + s.split * 0.3 + (s.sky > 1 ? s.sky * 0.5 : 0);
  const spec = 1 + s.specials.length * 0.12 + s.ramp * 0.4 + s.slow * 0.3;
  const shots = d.jets ? d.jets * 2.2 : s.pellets * Math.max(1, s.sky);
  return Math.round(s.dmg * shots * s.rate * aoe * spec * (1 + s.crit) + s.burn + s.twinDmg * s.twinRate);
}

/** Server-side cap for a single reported hit from this weapon (generous: stars, tree, buffs and crits included). */
export function maxHitDamage(key: string, rarity: Rarity): number {
  const d = WEAPONS[key];
  if (!d) return 0;
  const base = Math.max(d.dmg, d.twin?.dmg ?? 0) * RARITIES[Math.min(5, Math.max(0, rarity)) as Rarity].mult;
  return base * 1.2 * 1.3 * 2 * 3 * 2.5 * (1 + (d.ramp ?? 0)) + d.burn * 4;
}
