import { ZONE } from '../shared/map';
import { MEGA_ENEMIES, ZONE_INFO } from '../shared/crater';
import type { ProjKind } from '../shared/weapons';
import type { EnemyKind } from './entities';
import type { Faction } from '../shared/mapgen';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  r: number;
  speed: number;
  dmg: number;
  range: number;
  rate: number;
  flying?: boolean;
  proj?: ProjKind;
  projSpeed?: number;
  splash?: number;
  loot: string;
  xp: number;
  minThreat: number;
  /** Spawn weight per zone. */
  zones: Partial<Record<number, number>>;
  color: string;
  /** Who it fights for (region spawns and hordes pick by faction). */
  faction?: Faction;
  /** A boss: a 3D giant with a health bar across the screen and its own attack patterns. */
  boss?: boolean;
  /** Guns can't touch it: only cards, abilities and squads hurt it. */
  immune?: boolean;
  /** Blows up on contact (acid or fire). */
  explode?: boolean;
  /** Telegraphed ground slam instead of a bite. */
  slam?: boolean;
  /** Raises or calls in `n` of `kind` every `every` seconds while fighting. */
  summon?: { kind: string; n: number; every: number };
  /** Long-range: aims first (a warning line or circle), then fires. */
  aimed?: 'line' | 'circle';
  /** Doesn't move (turrets, mortar pits). */
  still?: boolean;
  /** Body plan, for the sprite generator and behaviour. */
  arch?: Arch;
  /** Real size (m): how big it is drawn and hits. */
  size?: number;
  /** Home zone (zone rosters). */
  zone?: number;
  /** Burrows and lunges (stalkers). */
  burrow?: boolean;
  /** Fights like a titan (big multi-limbed walker, charging beast or burrowing worm). */
  titanStyle?: 'walker' | 'beast' | 'worm';
  /** Classic side-view sprite to use in the 3D (first-person) view. */
  sprite3d?: string;
}

export type Arch = 'swarm' | 'canine' | 'beast' | 'humanoid' | 'vehicle' | 'worm' | 'flyer' | 'dragon' | 'golem' | 'bot' | 'fish' | 'entity' | 'insect';

/** The classic wasteland kinds no longer spawn on their own (the zone rosters do); summons, cards and hordes use them. */
const ALL = (w: number): Partial<Record<number, number>> => {
  void w;
  return {};
};

export const ENEMIES: Record<string, EnemyDef> = {
  // A colossus's weak point or core: sized, named and moved by the colossus (see systems/colossus.ts).
  colossus_part: { kind: 'colossus_part', name: 'Weak point', hp: 1, r: 12, speed: 0, dmg: 0, range: 0, rate: 0, still: true, loot: 'titan', xp: 60, minThreat: 99, zones: {}, color: '#ff6d00' },
  rat: { kind: 'rat', name: 'Scrap Rat', hp: 26, r: 0.38, speed: 5.2, dmg: 5, range: 0.5, rate: 1.2, loot: 'creature', xp: 4, minThreat: 1, zones: {}, color: '#8d6e63' },
  drone: { kind: 'drone', name: 'Rust Drone', hp: 22, r: 0.42, speed: 4.2, flying: true, dmg: 4, range: 9, rate: 0.8, proj: 'bullet', projSpeed: 20, loot: 'creature', xp: 5, minThreat: 1, zones: ALL(3), color: '#90a4ae' },
  raider: { kind: 'raider', name: 'Scav Raider', hp: 40, r: 0.42, speed: 3.4, dmg: 6, range: 10, rate: 0.9, proj: 'bullet', projSpeed: 22, loot: 'trooper', xp: 6, minThreat: 1.2, zones: {}, color: '#ff7043' },
  bomber: { kind: 'bomber', name: 'Bomb Rat', hp: 30, r: 0.45, speed: 4.8, dmg: 38, range: 0.6, rate: 1, splash: 2.4, loot: 'creature', xp: 7, minThreat: 1.8, zones: ALL(2), color: '#ff5252' },
  buggy: { kind: 'buggy', name: 'Raider Buggy', hp: 110, r: 0.85, speed: 7, dmg: 9, range: 11, rate: 1.5, proj: 'bullet', projSpeed: 24, loot: 'trooper', xp: 14, minThreat: 2.1, zones: {}, color: '#ffb74d' },
  stalker: { kind: 'stalker', name: 'Dune Stalker', hp: 150, r: 0.65, speed: 5.5, dmg: 22, range: 0.8, rate: 0.8, loot: 'creature', xp: 18, minThreat: 2.4, zones: {}, color: '#d7a860' },
  spitter: { kind: 'spitter', name: 'Acid Spitter', hp: 90, r: 0.55, speed: 2.6, dmg: 16, range: 13, rate: 0.5, proj: 'spit', projSpeed: 11, splash: 1.6, loot: 'creature', xp: 16, minThreat: 2.8, zones: {}, color: '#76ff03' },
  wraith: { kind: 'wraith', name: 'Cryo Wraith', hp: 180, r: 0.6, speed: 5, flying: true, dmg: 18, range: 8, rate: 0.9, proj: 'plasma', projSpeed: 16, loot: 'creature', xp: 30, minThreat: 3.8, zones: {}, color: '#80d8ff' },
  brute: { kind: 'brute', name: 'Scrap Brute', hp: 420, r: 1, speed: 2.4, dmg: 38, range: 1.1, rate: 0.6, loot: 'trooper', xp: 40, minThreat: 3.5, zones: {}, color: '#a1887f' },
  rocketeer: { kind: 'rocketeer', name: 'Rocketeer', hp: 100, r: 0.45, speed: 3, dmg: 26, range: 15, rate: 0.4, proj: 'missile', projSpeed: 13, splash: 1.5, loot: 'trooper', xp: 20, minThreat: 3.4, zones: ALL(3), color: '#ef5350' },
  mech: { kind: 'mech', name: 'Walker Mech', hp: 900, r: 1.35, speed: 2.2, dmg: 16, range: 16, rate: 2.2, proj: 'bullet', projSpeed: 26, loot: 'elite', xp: 80, minThreat: 5, zones: ALL(1.5), color: '#78909c' },
  swarmer: { kind: 'swarmer', name: 'Swarmer', hp: 16, r: 0.32, speed: 6.2, dmg: 4, range: 0.4, rate: 1.4, loot: 'swarm', xp: 1.2, minThreat: 99, zones: {}, color: '#a5a58d' },
  leaper: { kind: 'leaper', name: 'Leaper', hp: 30, r: 0.36, speed: 5.2, dmg: 6, range: 0.4, rate: 1.2, loot: 'swarm', xp: 2.5, minThreat: 99, zones: {}, color: '#7cb342' },
  /* ---------------- Zombies ---------------- */
  z_walker: { kind: 'z_walker', name: 'Walker', hp: 40, r: 0.36, speed: 2.4, dmg: 7, range: 0.45, rate: 1, loot: 'swarm', xp: 2, minThreat: 1, zones: {}, color: '#8a9a5b', faction: 'zombie' },
  z_runner: { kind: 'z_runner', name: 'Runner', hp: 22, r: 0.33, speed: 6.6, dmg: 5, range: 0.4, rate: 1.4, loot: 'swarm', xp: 1.5, minThreat: 1, zones: {}, color: '#9ccc65', faction: 'zombie' },
  z_bloater: { kind: 'z_bloater', name: 'Bloater', hp: 90, r: 0.55, speed: 2.2, dmg: 45, range: 0.7, rate: 1, splash: 2.8, explode: true, loot: 'creature', xp: 6, minThreat: 1.5, zones: {}, color: '#c0ca33', faction: 'zombie' },
  z_brute: { kind: 'z_brute', name: 'Tank Zombie', hp: 600, r: 1.05, speed: 2.8, dmg: 45, range: 1.2, rate: 0.55, slam: true, loot: 'elite', xp: 40, minThreat: 2.5, zones: {}, color: '#6d4c41', faction: 'zombie' },
  /* ---------------- Necro ---------------- */
  skeleton: { kind: 'skeleton', name: 'Skeleton', hp: 26, r: 0.34, speed: 5.4, dmg: 6, range: 0.45, rate: 1.2, loot: 'swarm', xp: 1.6, minThreat: 1, zones: {}, color: '#e0e0d0', faction: 'necro' },
  skel_archer: { kind: 'skel_archer', name: 'Bone Archer', hp: 34, r: 0.36, speed: 3.2, dmg: 9, range: 13, rate: 0.7, proj: 'bullet', projSpeed: 22, loot: 'creature', xp: 4, minThreat: 1.5, zones: {}, color: '#d7ccc8', faction: 'necro' },
  necromancer: { kind: 'necromancer', name: 'Necromancer', hp: 160, r: 0.5, speed: 2.6, dmg: 14, range: 12, rate: 0.5, proj: 'plasma', projSpeed: 14, summon: { kind: 'skeleton', n: 3, every: 7 }, loot: 'elite', xp: 25, minThreat: 2.2, zones: {}, color: '#7e57c2', faction: 'necro' },
  bone_golem: { kind: 'bone_golem', name: 'Bone Colossus', hp: 800, r: 1.2, speed: 2.4, dmg: 55, range: 1.4, rate: 0.5, slam: true, loot: 'elite', xp: 55, minThreat: 3, zones: {}, color: '#bcaaa4', faction: 'necro' },
  phantom: { kind: 'phantom', name: 'Phantom', hp: 300, r: 0.6, speed: 4.2, flying: true, dmg: 16, range: 7, rate: 0.8, proj: 'plasma', projSpeed: 13, immune: true, loot: 'elite', xp: 45, minThreat: 2.5, zones: {}, color: '#b388ff', faction: 'necro' },
  /* ---------------- Cyborgs ---------------- */
  cy_hound: { kind: 'cy_hound', name: 'Chrome Hound', hp: 36, r: 0.4, speed: 7, dmg: 7, range: 0.45, rate: 1.4, loot: 'swarm', xp: 2, minThreat: 1, zones: {}, color: '#80deea', faction: 'cyborg' },
  cy_trooper: { kind: 'cy_trooper', name: 'Cyborg Trooper', hp: 70, r: 0.42, speed: 3.2, dmg: 10, range: 12, rate: 0.8, proj: 'plasma', projSpeed: 20, loot: 'trooper', xp: 6, minThreat: 1.5, zones: {}, color: '#4dd0e1', faction: 'cyborg' },
  cy_enforcer: { kind: 'cy_enforcer', name: 'Enforcer', hp: 520, r: 0.95, speed: 2.3, dmg: 24, range: 11, rate: 0.9, proj: 'plasma', projSpeed: 16, splash: 1.2, loot: 'elite', xp: 45, minThreat: 3, zones: {}, color: '#26c6da', faction: 'cyborg' },
  cy_sniper: { kind: 'cy_sniper', name: 'Longshot', hp: 90, r: 0.42, speed: 2.4, dmg: 34, range: 34, rate: 0.22, aimed: 'line', loot: 'trooper', xp: 18, minThreat: 2, zones: {}, color: '#00e5ff', faction: 'cyborg' },
  /* ---------------- Military machines ---------------- */
  mil_bot: { kind: 'mil_bot', name: 'Sentry Bot', hp: 45, r: 0.4, speed: 5.6, dmg: 6, range: 0.45, rate: 1.3, loot: 'swarm', xp: 2, minThreat: 1, zones: {}, color: '#aed581', faction: 'military' },
  mil_artillery: { kind: 'mil_artillery', name: 'Mortar Pit', hp: 260, r: 0.8, speed: 0, dmg: 40, range: 40, rate: 0.18, splash: 3, aimed: 'circle', still: true, loot: 'elite', xp: 30, minThreat: 2, zones: {}, color: '#8d9a6a', faction: 'military' },
  gunship: { kind: 'gunship', name: 'Gunship', hp: 380, r: 0.9, speed: 5, flying: true, dmg: 7, range: 14, rate: 3, proj: 'bullet', projSpeed: 26, loot: 'elite', xp: 32, minThreat: 2.5, zones: {}, color: '#78909c', faction: 'military' },
  /* ---------------- Monsters (more) ---------------- */
  bat: { kind: 'bat', name: 'Carrion Bat', hp: 20, r: 0.36, speed: 7.2, flying: true, dmg: 5, range: 0.5, rate: 1.5, loot: 'swarm', xp: 1.5, minThreat: 1.5, zones: {}, color: '#5d4037', faction: 'monster' },
  /* ---------------- Bosses ---------------- */
  boss_warlord: { kind: 'boss_warlord', name: 'Warlord Krag', hp: 5000, r: 2, speed: 3, dmg: 60, range: 14, rate: 0.5, boss: true, loot: 'titan', xp: 600, minThreat: 99, zones: {}, color: '#ff7043', faction: 'raider' },
  boss_goliath: { kind: 'boss_goliath', name: 'Project Goliath', hp: 7000, r: 2.6, speed: 2.2, dmg: 70, range: 18, rate: 0.5, boss: true, loot: 'titan', xp: 700, minThreat: 99, zones: {}, color: '#7c8a5a', faction: 'military' },
  boss_abomination: { kind: 'boss_abomination', name: 'The Abomination', hp: 6500, r: 2.4, speed: 3.2, dmg: 80, range: 4, rate: 0.5, boss: true, summon: { kind: 'z_runner', n: 8, every: 9 }, loot: 'titan', xp: 700, minThreat: 99, zones: {}, color: '#8d8a4a', faction: 'zombie' },
  boss_overmind: { kind: 'boss_overmind', name: 'Overmind Prime', hp: 7500, r: 2.2, speed: 2.6, flying: true, dmg: 50, range: 16, rate: 0.5, boss: true, summon: { kind: 'cy_hound', n: 6, every: 10 }, loot: 'titan', xp: 750, minThreat: 99, zones: {}, color: '#b0bec5', faction: 'cyborg' },
  boss_lich: { kind: 'boss_lich', name: 'The Lich King', hp: 7000, r: 1.8, speed: 2.4, flying: true, dmg: 55, range: 15, rate: 0.5, boss: true, summon: { kind: 'skeleton', n: 10, every: 8 }, loot: 'titan', xp: 750, minThreat: 99, zones: {}, color: '#9575cd', faction: 'necro' },
  boss_queen: { kind: 'boss_queen', name: 'The Brood Queen', hp: 11000, r: 3, speed: 2.6, dmg: 90, range: 12, rate: 0.5, boss: true, summon: { kind: 'swarmer', n: 14, every: 7 }, loot: 'titan', xp: 1000, minThreat: 99, zones: {}, color: '#8e24aa', faction: 'monster' },
  boss_devourer: { kind: 'boss_devourer', name: 'The Devourer', hp: 40000, r: 4.5, speed: 2.4, dmg: 140, range: 8, rate: 0.5, boss: true, summon: { kind: 'leaper', n: 16, every: 8 }, loot: 'titan', xp: 3000, minThreat: 99, zones: {}, color: '#4a148c', faction: 'monster' },
  guardian: { kind: 'guardian', name: 'Rune Guardian', hp: 700, r: 1.25, speed: 3, dmg: 30, range: 1.4, rate: 0.7, loot: 'elite', xp: 60, minThreat: 99, zones: {}, color: '#b388ff' },
  titan_walker: { kind: 'titan_walker', name: 'Colossal Walker', hp: 6000, r: 3, speed: 2, dmg: 90, range: 6, rate: 0.3, loot: 'titan', xp: 400, minThreat: 99, zones: {}, color: '#8d8d8d' },
  titan_beast: { kind: 'titan_beast', name: 'Dread Behemoth', hp: 5000, r: 2.6, speed: 3.6, dmg: 70, range: 3.5, rate: 0.5, loot: 'titan', xp: 400, minThreat: 99, zones: {}, color: '#6d4c41' },
  titan_worm: { kind: 'titan_worm', name: 'Burrow Titan', hp: 7000, r: 2.1, speed: 6, dmg: 130, range: 4.5, rate: 0.25, loot: 'titan', xp: 450, minThreat: 99, zones: {}, color: '#c0a060' },
};

export const TITAN_STYLE: Record<number, EnemyKind> = {
  [ZONE.VERDANT]: 'titan_beast', [ZONE.ASH]: 'titan_walker', [ZONE.SCORCHED]: 'titan_beast', [ZONE.FROST]: 'titan_walker', [ZONE.WRAITH]: 'titan_walker',
  [ZONE.DUNES]: 'titan_worm', [ZONE.LAKE]: 'titan_worm', [ZONE.SPIRES]: 'titan_walker', [ZONE.PASS]: 'titan_beast', [ZONE.RUSTBOLT]: 'titan_walker', [ZONE.DIVOT]: 'titan_walker',
};

export const TITAN_NAMES: Record<string, string[]> = {
  titan_walker: ['Rustmother', 'The Iron Pilgrim', 'Glasswalker', 'Old Stompy'],
  titan_beast: ['Cinderjaw', 'The Slag Hound', 'Emberback'],
  titan_worm: ['Sandmaw', 'The Deep Throat', 'Acid Leviathan'],
};

/** What each faction fields: its rank and file, its horde runners, its heavies, flyers and boss. */
export const FACTION_UNITS: Record<Faction, { common: [string, number][]; horde: string[]; heavy: string[]; flyer: string | null; boss: string; name: string }> = {
  monster: { name: 'the Brood', common: [['swarmer', 4], ['leaper', 2], ['spitter', 2], ['stalker', 1], ['bat', 2]], horde: ['swarmer', 'swarmer', 'leaper'], heavy: ['brute', 'stalker'], flyer: 'bat', boss: 'boss_queen' },
  zombie: { name: 'the Dead', common: [['z_walker', 5], ['z_runner', 3], ['z_bloater', 1], ['z_brute', 0.4]], horde: ['z_runner', 'z_runner', 'z_walker'], heavy: ['z_brute', 'z_bloater'], flyer: null, boss: 'boss_abomination' },
  necro: { name: 'the Necropolis', common: [['skeleton', 5], ['skel_archer', 3], ['necromancer', 0.7], ['phantom', 0.4], ['bone_golem', 0.3]], horde: ['skeleton', 'skeleton', 'skeleton'], heavy: ['bone_golem', 'necromancer'], flyer: 'phantom', boss: 'boss_lich' },
  cyborg: { name: 'the Assembly', common: [['cy_hound', 3], ['cy_trooper', 4], ['cy_sniper', 1], ['cy_enforcer', 0.4], ['drone', 1]], horde: ['cy_hound', 'cy_hound', 'cy_hound'], heavy: ['cy_enforcer', 'cy_sniper'], flyer: 'drone', boss: 'boss_overmind' },
  military: { name: 'the war machines', common: [['mil_bot', 4], ['drone', 2], ['mech', 0.5], ['gunship', 0.4], ['mil_artillery', 0.4], ['rocketeer', 1]], horde: ['mil_bot', 'mil_bot', 'mil_bot'], heavy: ['mech', 'gunship'], flyer: 'gunship', boss: 'boss_goliath' },
  raider: { name: 'the gangs', common: [['raider', 4], ['rat', 3], ['rocketeer', 1], ['buggy', 1], ['bomber', 1], ['z_walker', 1]], horde: ['swarmer', 'z_runner', 'rat'], heavy: ['brute', 'buggy'], flyer: 'drone', boss: 'boss_warlord' },
};

/** Picks a unit of a faction for a spawn (weighted, respecting how dangerous the spot is). */
export function pickFactionKind(f: Faction, threat: number): string {
  const pool = FACTION_UNITS[f].common.filter(([k]) => ENEMIES[k].minThreat <= threat + 0.5);
  const total = pool.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of pool) {
    r -= w;
    if (r <= 0) return k;
  }
  return pool[0]?.[0] ?? 'rat';
}

/* ---------------------------------------------------------------------- */
/* The Crater's zone rosters (crater_world_1.json)                          */
/* ---------------------------------------------------------------------- */

const ZONE_PREFIX: Record<number, string> = {
  [ZONE.VERDANT]: 'v', [ZONE.ASH]: 'a', [ZONE.SCORCHED]: 's', [ZONE.FROST]: 'f', [ZONE.WRAITH]: 'w', [ZONE.DUNES]: 'd',
  [ZONE.LAKE]: 'l', [ZONE.SPIRES]: 'x', [ZONE.PASS]: 'p', [ZONE.RUSTBOLT]: 'r', [ZONE.DIVOT]: 'm', [ZONE.EDGE]: 'e',
};

/** Each zone's palette: body colour for its creatures and machines. */
const ZONE_TINT: Record<number, string[]> = {
  [ZONE.VERDANT]: ['#a1887f', '#8d6e63', '#6d4c41', '#7cb342', '#558b2f', '#33691e', '#795548'],
  [ZONE.ASH]: ['#9e9e9e', '#8d8d8d', '#757575', '#616161', '#bdbdbd', '#78909c', '#546e7a'],
  [ZONE.SCORCHED]: ['#d84315', '#bf360c', '#ff7043', '#ff5722', '#c6ff00', '#6d4c41', '#ff3d00'],
  [ZONE.FROST]: ['#b3e5fc', '#e1f5fe', '#90caf9', '#80deea', '#4fc3f7', '#e3f2fd', '#81d4fa'],
  [ZONE.WRAITH]: ['#bcaaa4', '#8d6e63', '#6d4c41', '#7e57c2', '#90a4ae', '#5e35b1', '#b0bec5'],
  [ZONE.DUNES]: ['#d7a860', '#c49a50', '#ffb74d', '#c0a060', '#a1887f', '#d4a056', '#ffd54f'],
  [ZONE.LAKE]: ['#26a69a', '#00897b', '#4db6ac', '#00695c', '#1de9b6', '#004d40', '#80cbc4'],
  [ZONE.SPIRES]: ['#e040fb', '#ff6d00', '#b388ff', '#7c4dff', '#212121', '#ff1744', '#aa00ff'],
  [ZONE.PASS]: ['#ff7043', '#8d6e63', '#a1887f', '#c0a060', '#6d4c41', '#bf360c', '#ffb74d'],
  [ZONE.RUSTBOLT]: ['#a1887f', '#ffb300', '#ffd740', '#8d6e63', '#6d4c41', '#bf360c', '#ff6d00'],
};

function archOf(name: string): Arch {
  const n = name.toLowerCase();
  if (/fish/.test(n)) return 'fish';
  if (/swarm|\brat\b|crawler/.test(n)) return n.includes('rock') ? 'insect' : 'swarm';
  if (/scorpion/.test(n)) return 'insect';
  if (/dog|wolf|hound/.test(n)) return 'canine';
  if (/dragon|wyrm/.test(n)) return 'dragon';
  if (/entity/.test(n)) return 'entity';
  if (/drone|reaver/.test(n)) return 'flyer';
  if (/worm|leviathan/.test(n)) return 'worm';
  if (/rig|bike|truck|hog|tank|barge/.test(n)) return 'vehicle';
  if (/bot|unit|forge/.test(n)) return 'bot';
  if (/golem|colossus|titan|giant|behemoth|guardian|troll|spire\b|gatekeeper|drowned/.test(n)) return 'golem';
  if (/scout|scavenger|scav|burner|swimmer/.test(n)) return 'humanoid';
  return 'beast';
}

const SPRITE3D: Record<Arch, string> = {
  swarm: 'rat', canine: 'cy_hound', beast: 'stalker', humanoid: 'raider', vehicle: 'buggy', worm: 'stalker', flyer: 'drone', dragon: 'bat',
  golem: 'bone_golem', bot: 'mil_bot', fish: 'spitter', entity: 'phantom', insect: 'spitter',
};

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Turns a roster entry into an enemy: stats scale with its real size (a 1 m rat to a 150 m war machine), and its
 * body plan decides how it fights (swarms rush, hounds run, raiders and vehicles shoot, worms burrow, flyers dive,
 * golems slam; anything 20 m or more fights like a titan).
 */
function rosterDef(zone: number, idx: number, [name, min, max]: [string, number, number | null], boss = false): EnemyDef {
  const size = max === null ? min * 1.25 : (min + max) / 2;
  const arch = archOf(name);
  const kind = `${ZONE_PREFIX[zone]}_${slug(name)}`;
  const n = name.toLowerCase();
  const danger = ZONE_INFO[zone]?.danger ?? 1;
  const hp = Math.round(18 * Math.pow(size, 1.6) * (arch === 'swarm' || arch === 'fish' ? 0.8 : 1));
  const dmg = Math.round(3 + 2.2 * Math.pow(size, 0.9));
  const baseSpeed: Record<Arch, number> = { swarm: 6.5, canine: 9, beast: 6.5, humanoid: 3.8, vehicle: 17, worm: 7, flyer: 12, dragon: 14, golem: 3.5, bot: 4, fish: 6, entity: 8, insect: 6 };
  const speed = Math.min(16, baseSpeed[arch] + (arch === 'golem' || arch === 'worm' ? size * 0.08 : 0));
  const ranged = arch === 'humanoid' || arch === 'vehicle' || arch === 'flyer' || arch === 'dragon' || arch === 'entity' || n.includes('spitter') || n.includes('mining drone') || n.includes('pharaoh');
  const flying = arch === 'flyer' || arch === 'dragon' || arch === 'entity';
  const r = Math.max(0.35, size / 2);
  const range = ranged ? Math.round(18 + size * 1.2) : r + 1;
  const def: EnemyDef = {
    kind, name, hp, r, speed, dmg, range, rate: ranged ? 0.7 + (arch === 'vehicle' ? 0.8 : 0) : size > 20 ? 0.45 : 1,
    flying, loot: size >= 25 ? 'titan' : size >= 10 ? 'elite' : arch === 'humanoid' || arch === 'vehicle' || arch === 'bot' ? 'trooper' : idx < 2 ? 'swarm' : 'creature',
    xp: Math.round(2 + Math.pow(size, 1.1) * 1.6), minThreat: 1 + (danger - 1) * 1.5 + Math.max(0, idx - 2) * 0.35, zones: {},
    color: ZONE_TINT[zone]?.[idx % 7] ?? '#9e9e9e', arch, size, zone, sprite3d: SPRITE3D[arch],
  };
  if (ranged) {
    def.proj = n.includes('spitter') ? 'spit' : arch === 'dragon' || arch === 'entity' ? 'plasma' : n.includes('burner') ? 'flame' : arch === 'vehicle' && size > 10 ? 'missile' : 'bullet';
    def.projSpeed = def.proj === 'missile' ? 30 : def.proj === 'spit' ? 22 : 45;
    if (def.proj !== 'bullet') def.splash = Math.max(1.5, size * 0.15);
  }
  if (arch === 'golem' || n.includes('behemoth') || n.includes('troll')) def.slam = true;
  if (n.includes('stalker') || (arch === 'worm' && size < 20)) def.burrow = true;
  if (n.includes('lava imp')) {
    def.explode = true;
    def.splash = 6;
  }
  // Anomaly wolves phase out of reach of guns: only cards, abilities and squads touch them.
  if (n.includes('anomaly')) def.immune = true;
  if (size >= 20 && !boss) def.titanStyle = arch === 'worm' ? 'worm' : arch === 'beast' || arch === 'canine' || arch === 'vehicle' ? 'beast' : 'walker';
  if (boss) {
    def.boss = true;
    def.hp = Math.round(def.hp * 1.5);
    def.minThreat = 99;
  }
  return def;
}

/** Every zone's roster, smallest first (kind ids). */
export const ZONE_ROSTER: Record<number, string[]> = {};
for (const [z, info] of Object.entries(ZONE_INFO)) {
  const zone = Number(z);
  ZONE_ROSTER[zone] = [];
  info.roster.forEach((entry, i) => {
    const d = rosterDef(zone, i, entry);
    ENEMIES[d.kind] = d;
    ZONE_ROSTER[zone].push(d.kind);
  });
}

/** Mega enemies: world events and the endgame (kind ids by name). */
export const MEGA: Record<string, string> = {};
for (const m of MEGA_ENEMIES) {
  const d = rosterDef(ZONE.DIVOT, 6, [m.name, m.size, m.size], true);
  d.kind = `m_${slug(m.name)}`;
  d.color = m.name.includes('Worm') ? '#c0a060' : m.name.includes('Guardian') ? '#90a4ae' : m.name.includes('Colossus') ? '#bcaaa4' : '#4a148c';
  d.summon = { kind: 'swarmer', n: 12, every: 8 };
  ENEMIES[d.kind] = d;
  MEGA[m.name] = d.kind;
}

/** Stronghold bosses: the apex of the zone each stronghold sits in (the roster entry made a boss). */
export function strongholdBoss(zone: number, name: string): string {
  const entry = ZONE_INFO[zone]?.roster.find((e) => e[0] === name);
  const kind = `boss_${slug(name)}`;
  if (!ENEMIES[kind] && entry) {
    const d = rosterDef(zone, 6, entry, true);
    d.kind = kind;
    d.summon = { kind: ZONE_ROSTER[zone][0], n: 8, every: 9 };
    ENEMIES[kind] = d;
  }
  return ENEMIES[kind] ? kind : 'boss_warlord';
}

/** A zone creature for a spawn: the small ones are common, the big ones rare, all within the spot's danger. */
export function pickZoneKind(zone: number, threat: number): string {
  const list = ZONE_ROSTER[zone]?.length ? ZONE_ROSTER[zone] : ZONE_ROSTER[ZONE.DUNES];
  const ok = list.filter((k) => ENEMIES[k].minThreat <= threat + 0.6);
  const pool = ok.length ? ok : [list[0]];
  const w = pool.map((_, i) => [9, 6, 4, 2.2, 1.2, 0.35, 0.08][i] ?? 0.05);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= w[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

/** What a zone's hordes are made of: its two smallest creatures, then heavies and a boss for the big waves. */
export function zoneHorde(zone: number): { horde: string[]; heavy: string[]; boss: string; flyer: string | null; name: string } {
  const list = ZONE_ROSTER[zone]?.length ? ZONE_ROSTER[zone] : ZONE_ROSTER[ZONE.DUNES];
  const flyer = list.find((k) => ENEMIES[k].flying && (ENEMIES[k].size ?? 1) < 30) ?? null;
  return { horde: [list[0], list[0], list[1]], heavy: [list[2], list[3]], boss: list[4], flyer, name: ZONE_INFO[zone]?.name ?? 'the wastes' };
}

/**
 * How an enemy kind stands next to a 100 m fortress: the swarm's fodder (the things that come in hundreds) small and
 * quick, taking little room; everything else bigger than life, so there are fewer of them and each one reads, and
 * tougher and worth more to match; the giants and bosses as they are.
 */
export function enemyScale(d: EnemyDef): { r: number; hp: number; dmg: number; xp: number; speed: number } {
  if (d.loot === 'swarm') return { r: 0.6, hp: 1, dmg: 1, xp: 1, speed: 1.05 };
  if (d.titanStyle || d.boss || d.still || d.kind.startsWith('titan') || d.kind.includes('part') || (d.size ?? 1) >= 20) return { r: 1, hp: 1, dmg: 1, xp: 1, speed: 1 };
  return { r: 2.2, hp: 3.2, dmg: 1.6, xp: 2.5, speed: 1.12 };
}
