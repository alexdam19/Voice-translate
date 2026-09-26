import type { Cost } from '../shared/inventory';
import { RARITIES, rollRarity, type Rarity } from '../shared/rarity';

/* ---------------------------------------------------------------------- */
/* Roles and abilities                                                     */
/* ---------------------------------------------------------------------- */

export type CrewRole = 'gunner' | 'engineer' | 'mechanic' | 'medic' | 'driver' | 'scavenger' | 'quartermaster' | 'scientist' | 'marine';

export interface AbilityDef {
  key: string;
  name: string;
  desc: string;
  /** Base cooldown in seconds. */
  cd: number;
  /** 'point' abilities are cast at the mouse cursor. */
  target: 'self' | 'point';
  range?: number;
  color: string;
}

export const ABILITIES: Record<string, AbilityDef> = {
  barrage: { key: 'barrage', name: 'Barrage', desc: 'All weapons fire {50%} faster for 5s.', cd: 22, target: 'self', color: '#ff9100' },
  shield_surge: { key: 'shield_surge', name: 'Shield Surge', desc: 'Gain a barrier worth {18%} of max hull for 6s.', cd: 28, target: 'self', color: '#40c4ff' },
  weld: { key: 'weld', name: 'Weld Crew', desc: 'Repair {22%} of max hull over 3s.', cd: 30, target: 'self', color: '#ffd740' },
  triage: { key: 'triage', name: 'Triage', desc: 'Revive injured crew, cleanse burns and stuns, and regenerate {6%} hull over 5s.', cd: 40, target: 'self', color: '#76ff03' },
  nitro: { key: 'nitro', name: 'Nitro', desc: '+{70%} speed for 4s. Ram enemies for damage.', cd: 18, target: 'self', color: '#00e5ff' },
  magnet: { key: 'magnet', name: 'Magnet Sweep', desc: 'Pull in all loot within 30 units and harvest {60%} faster for 8s.', cd: 20, target: 'self', color: '#bcaaa4' },
  artillery: { key: 'artillery', name: 'Artillery Call', desc: 'Six shells hit the target area after 1s ({60} damage each).', cd: 26, target: 'point', range: 32, color: '#ff6e40' },
  emp: { key: 'emp', name: 'EMP Pulse', desc: 'Stun enemies within 12 units for {2s} and deal 40 damage.', cd: 30, target: 'self', color: '#ea80fc' },
  squad: { key: 'squad', name: 'Drop Squad', desc: 'Deploy {3} marines for 20s.', cd: 40, target: 'self', color: '#ff5252' },
  // Champion signatures
  deadeye: { key: 'deadeye', name: 'Deadeye Salvo', desc: 'For {6s} every shot is a critical hit and pierces one extra target.', cd: 35, target: 'self', color: '#ffab00' },
  meltdown: { key: 'meltdown', name: 'Meltdown Core', desc: 'Refill shields; weapons fire {80%} faster for 7s.', cd: 45, target: 'self', color: '#ffea00' },
  nanite: { key: 'nanite', name: 'Nanite Cloud', desc: 'Repair {45%} hull over 5s and gain +30% armor.', cd: 45, target: 'self', color: '#c6ff00' },
  miracle: { key: 'miracle', name: 'Miracle Protocol', desc: 'Invulnerable for {3s}, repair 25% hull, revive and cleanse everyone.', cd: 60, target: 'self', color: '#b9f6ca' },
  charge: { key: 'charge', name: 'Juggernaut Charge', desc: 'Dash toward the cursor, crushing everything in the way for {150} damage.', cd: 16, target: 'point', range: 20, color: '#18ffff' },
  treasure: { key: 'treasure', name: 'Treasure Sense', desc: 'Pull in loot within 60 units, reveal every loot area and rune, and upgrade the next chest by one rarity.', cd: 90, target: 'self', color: '#ffd23f' },
  orbital: { key: 'orbital', name: 'Orbital Lance', desc: 'A beam from orbit hits the target after 1.2s for {600} damage and sets the ground alight.', cd: 50, target: 'point', range: 40, color: '#ff3d00' },
  singularity: { key: 'singularity', name: 'Singularity', desc: 'A gravity well drags enemies in for 3s, then detonates for {250}.', cd: 40, target: 'point', range: 26, color: '#d500f9' },
  legion: { key: 'legion', name: 'Iron Legion', desc: 'Deploy {5} heavy marines for 25s.', cd: 50, target: 'self', color: '#ff1744' },
};

export interface RoleDef {
  key: CrewRole;
  name: string;
  color: string;
  ability: string;
  /** What side crew of this role do passively. */
  passive: string;
}

export const ROLES: Record<CrewRole, RoleDef> = {
  gunner: { key: 'gunner', name: 'Gunner', color: '#ff9100', ability: 'barrage', passive: '+2.5% weapon damage per level' },
  engineer: { key: 'engineer', name: 'Engineer', color: '#ffd740', ability: 'shield_surge', passive: '+4% power and +3% shields per level' },
  mechanic: { key: 'mechanic', name: 'Mechanic', color: '#ffab40', ability: 'weld', passive: '+0.35 hull repair per second per level' },
  medic: { key: 'medic', name: 'Medic', color: '#76ff03', ability: 'triage', passive: 'Injured crew recover 25% faster per level' },
  driver: { key: 'driver', name: 'Driver', color: '#00e5ff', ability: 'nitro', passive: '+2% speed per level' },
  scavenger: { key: 'scavenger', name: 'Scavenger', color: '#bcaaa4', ability: 'magnet', passive: '+4% loot and +5% harvest speed per level' },
  quartermaster: { key: 'quartermaster', name: 'Quartermaster', color: '#b0bec5', ability: 'artillery', passive: '+2 cargo slots per level' },
  scientist: { key: 'scientist', name: 'Scientist', color: '#ea80fc', ability: 'emp', passive: '-3% research cost per level' },
  marine: { key: 'marine', name: 'Marine', color: '#ff5252', ability: 'squad', passive: '+1% armor and +2% hull per level' },
};

export const ROLE_LIST = Object.values(ROLES);

/* ---------------------------------------------------------------------- */
/* Champions and exclusive characters                                      */
/* ---------------------------------------------------------------------- */

export interface ChampionDef {
  id: string;
  name: string;
  title: string;
  role: CrewRole;
  ability: string;
  hair: string;
  accent: string;
}

/** Legendary crew with signature abilities. Only from rune chests. */
export const CHAMPIONS: ChampionDef[] = [
  { id: 'vex', name: 'Vex Morrow', title: 'the Railhand', role: 'gunner', ability: 'deadeye', hair: '#e0e0e0', accent: '#ffab00' },
  { id: 'brass', name: 'Old Brass', title: 'Reactor Whisperer', role: 'engineer', ability: 'meltdown', hair: '#8d6e63', accent: '#ffea00' },
  { id: 'rivet', name: 'Doc Rivet', title: 'Nanite Surgeon', role: 'mechanic', ability: 'nanite', hair: '#212121', accent: '#c6ff00' },
  { id: 'kess', name: 'Mother Kess', title: 'Saint of Rust', role: 'medic', ability: 'miracle', hair: '#f5f5f5', accent: '#b9f6ca' },
  { id: 'grit', name: 'Grit Taggart', title: 'the Juggernaut', role: 'driver', ability: 'charge', hair: '#ff7043', accent: '#18ffff' },
  { id: 'magpie', name: 'Magpie', title: 'Queen of Junk', role: 'scavenger', ability: 'treasure', hair: '#311b92', accent: '#ffd23f' },
  { id: 'hale', name: 'Marshal Hale', title: 'Orbital Liaison', role: 'quartermaster', ability: 'orbital', hair: '#546e7a', accent: '#ff3d00' },
  { id: 'nova', name: 'Nova Six', title: 'Gravity Witch', role: 'scientist', ability: 'singularity', hair: '#e040fb', accent: '#d500f9' },
  { id: 'sol', name: 'Warden Sol', title: 'Iron Legion', role: 'marine', ability: 'legion', hair: '#ffd54f', accent: '#ff1744' },
];

export interface ExclusiveDef {
  id: string;
  name: string;
  role: CrewRole;
  effect: 'heal_boost' | 'cdr_all' | 'extra_marines' | 'terrain' | 'research' | 'regen' | 'crit_all' | 'chest_luck' | 'cargo';
  desc: string;
}

/** Epic crew with a unique passive. Only from rune chests and choice chests. */
export const EXCLUSIVES: ExclusiveDef[] = [
  { id: 'ashveil', name: 'Sister Ashveil', role: 'medic', effect: 'heal_boost', desc: 'All hull repair is 30% stronger.' },
  { id: 'rho', name: 'Tinker Rho', role: 'engineer', effect: 'cdr_all', desc: 'All officer abilities recharge 10% faster.' },
  { id: 'krank', name: 'Krank', role: 'marine', effect: 'extra_marines', desc: 'Every marine drop brings 2 extra marines.' },
  { id: 'zara', name: 'Dune Queen Zara', role: 'driver', effect: 'terrain', desc: 'Sand, snow, ice and mud never slow the fortress.' },
  { id: 'glitch', name: 'Glitch', role: 'scientist', effect: 'research', desc: 'Research costs 20% less.' },
  { id: 'pete', name: 'Rustlung Pete', role: 'mechanic', effect: 'regen', desc: '+2 hull repair per second, always.' },
  { id: 'bo', name: 'Bullseye Bo', role: 'gunner', effect: 'crit_all', desc: 'All weapons +10% critical hit chance.' },
  { id: 'loretta', name: 'Lucky Loretta', role: 'scavenger', effect: 'chest_luck', desc: 'Chests roll noticeably better rarities.' },
  { id: 'stack', name: 'Sergeant Stack', role: 'quartermaster', effect: 'cargo', desc: '+24 cargo slots.' },
];

/* ---------------------------------------------------------------------- */
/* Perks (with rarity)                                                     */
/* ---------------------------------------------------------------------- */

export type PerkStat =
  | 'dmg' | 'rate' | 'range' | 'hp' | 'shield' | 'speed' | 'armor' | 'regen' | 'cdr' | 'power'
  | 'loot' | 'harvest' | 'cargo' | 'crit' | 'lifesteal' | 'ability' | 'vision' | 'research' | 'xp' | 'ult' | 'actcd';

type Six = [number, number, number, number, number, number];

export interface PerkDef {
  id: string;
  name: string;
  stat: PerkStat;
  /** Extra stats that get the same value (multi-stat perks). */
  also?: PerkStat[];
  /** Value per rarity: common..mythic. Percent stats are fractions. */
  values: Six;
  desc: string;
  minRarity?: Rarity;
  /** Only offered once the crew member reaches this level. Late perks are much stronger. */
  minLevel?: number;
}

const PCT: Six = [0.03, 0.05, 0.08, 0.12, 0.18, 0.26];

export const PERKS: PerkDef[] = [
  { id: 'sharpshooter', name: 'Sharpshooter', stat: 'dmg', values: PCT, desc: '+{v} weapon damage' },
  { id: 'trigger', name: 'Trigger Discipline', stat: 'rate', values: PCT, desc: '+{v} fire rate' },
  { id: 'longbarrel', name: 'Long Barrels', stat: 'range', values: [0.03, 0.05, 0.07, 0.1, 0.14, 0.203], desc: '+{v} weapon range' },
  { id: 'plating', name: 'Extra Plating', stat: 'hp', values: [0.03, 0.05, 0.08, 0.12, 0.18, 0.261], desc: '+{v} max hull' },
  { id: 'capacitor', name: 'Shield Tuning', stat: 'shield', values: [0.05, 0.08, 0.12, 0.18, 0.26, 0.377], desc: '+{v} shields' },
  { id: 'leadfoot', name: 'Lead Foot', stat: 'speed', values: [0.02, 0.035, 0.05, 0.075, 0.11, 0.16], desc: '+{v} speed' },
  { id: 'bulwark', name: 'Bulwark', stat: 'armor', values: [0.01, 0.015, 0.025, 0.04, 0.06, 0.087], desc: '+{v} armor' },
  { id: 'patchwork', name: 'Patchwork', stat: 'regen', values: [0.4, 0.7, 1.1, 1.7, 2.6, 3.77], desc: '+{v} hull repair per second' },
  { id: 'quickhands', name: 'Quick Hands', stat: 'cdr', values: [0.02, 0.035, 0.05, 0.07, 0.1, 0.145], desc: 'Officer abilities recharge {v} faster' },
  { id: 'overvolt', name: 'Overvolt', stat: 'power', values: [0.04, 0.06, 0.1, 0.15, 0.22, 0.319], desc: '+{v} power' },
  { id: 'scrounger', name: 'Scrounger', stat: 'loot', values: [0.04, 0.07, 0.11, 0.16, 0.24, 0.348], desc: '+{v} loot' },
  { id: 'prospector', name: 'Prospector', stat: 'harvest', values: [0.05, 0.08, 0.12, 0.18, 0.26, 0.377], desc: '+{v} harvest speed' },
  { id: 'packrat', name: 'Pack Rat', stat: 'cargo', values: [2, 3, 5, 8, 12, 17], desc: '+{v} cargo slots' },
  { id: 'eagle', name: 'Eagle Eye', stat: 'crit', values: [0.02, 0.03, 0.05, 0.08, 0.12, 0.174], desc: '+{v} critical hit chance' },
  { id: 'vampiric', name: 'Vampiric Rounds', stat: 'lifesteal', values: [0.005, 0.01, 0.015, 0.025, 0.04, 0.058], desc: 'Heal {v} of weapon damage dealt', minRarity: 2 },
  { id: 'signature', name: 'Signature Move', stat: 'ability', values: [0.06, 0.09, 0.14, 0.2, 0.3, 0.435], desc: 'Their own ability is {v} stronger' },
  { id: 'lookout', name: 'Lookout', stat: 'vision', values: [1, 1.5, 2.5, 3.5, 5, 7.25], desc: '+{v} vision range' },
  { id: 'egghead', name: 'Egghead', stat: 'research', values: [0.02, 0.03, 0.05, 0.07, 0.1, 0.145], desc: '-{v} research cost' },
  { id: 'nukecodes', name: 'Launch Codes', stat: 'ult', values: [0.04, 0.06, 0.09, 0.13, 0.19, 0.28], desc: 'Ultimate charges {v} faster' },
  { id: 'flightdeck', name: 'Flight Deck Chief', stat: 'actcd', values: [0.03, 0.05, 0.07, 0.1, 0.14, 0.2], desc: 'Arsenal actives (1-4) recharge {v} faster' },
  /* Veteran perks (level 5+) */
  { id: 'veteran', name: 'Veteran Gunnery', stat: 'dmg', also: ['rate'], values: [0.05, 0.07, 0.1, 0.14, 0.2, 0.28], desc: '+{v} weapon damage and fire rate', minLevel: 5 },
  { id: 'ironwill', name: 'Iron Will', stat: 'hp', also: ['shield'], values: [0.06, 0.09, 0.13, 0.19, 0.27, 0.38], desc: '+{v} max hull and shields', minLevel: 5 },
  { id: 'ace', name: 'Ace', stat: 'crit', also: ['range'], values: [0.04, 0.06, 0.08, 0.11, 0.15, 0.21], desc: '+{v} critical chance and weapon range', minLevel: 5 },
  /* Master perks (level 8+) */
  { id: 'warlord', name: 'Warlord', stat: 'dmg', also: ['rate', 'ability'], values: [0.08, 0.11, 0.15, 0.21, 0.3, 0.42], desc: '+{v} weapon damage, fire rate and ability power', minLevel: 8 },
  { id: 'mastermind', name: 'Mastermind', stat: 'cdr', also: ['ult', 'actcd'], values: [0.05, 0.07, 0.09, 0.12, 0.16, 0.22], desc: 'Officer abilities, actives and your ultimate all recharge {v} faster', minLevel: 8 },
  { id: 'student', name: 'Fast Learner', stat: 'xp', values: [0.08, 0.12, 0.18, 0.26, 0.4, 0.58], desc: '+{v} crew experience' },
];

export const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

const FLAT_STATS: PerkStat[] = ['regen', 'cargo', 'vision'];

function statsOf(p: PerkDef): PerkStat[] {
  return p.also ? [p.stat, ...p.also] : [p.stat];
}

export function perkValueText(p: PerkDef, r: Rarity): string {
  const v = p.values[r];
  if (FLAT_STATS.includes(p.stat)) return String(Math.round(v * 10) / 10);
  return `${Math.round(v * 1000) / 10}%`;
}

export function perkText(id: string, r: Rarity): string {
  const p = PERK_BY_ID.get(id);
  if (!p) return id;
  return p.desc.replace('{v}', perkValueText(p, r));
}

export interface PerkInst {
  id: string;
  rarity: Rarity;
}

/* ---------------------------------------------------------------------- */
/* Crew members                                                            */
/* ---------------------------------------------------------------------- */

export const XP_LEVELS = [0, 60, 150, 280, 450, 680, 960, 1300, 1700, 2200];
export const MAX_LEVEL = XP_LEVELS.length;

export type CrewLoc = 'main' | 'outrider' | 'away';

export interface CrewMember {
  id: number;
  name: string;
  role: CrewRole;
  rarity: Rarity;
  level: number;
  xp: number;
  perks: PerkInst[];
  /** Pending perk choice after a level up (pick one of three). */
  draft: PerkInst[] | null;
  champion: string | null;
  exclusive: string | null;
  /** Portrait seed. */
  face: number;
  /** Seconds until an injured crew member is back on duty (0 = fit). */
  injured: number;
  loc: CrewLoc;
  /** Officer slot 0-5 (Q E F G Z X), or -1 for side crew. */
  officer: number;
  /** Ability cooldown remaining (s). */
  cd: number;
  /** For crew away from the fortress: seconds until they walk back. */
  returnIn: number;
}

const FIRST = ['Vex', 'Rook', 'Juno', 'Kade', 'Mara', 'Ozzy', 'Tamsin', 'Brick', 'Nyx', 'Solder', 'Wren', 'Grit', 'Pike', 'Echo', 'Dusk', 'Riva', 'Hex', 'Moth', 'Cinder', 'Talon', 'Ash', 'Bolt', 'Kestrel', 'Nova', 'Sable', 'Tank', 'Lug', 'Sprocket', 'Faye', 'Dex'];
const LAST = ['Kowalski', 'Ashgrove', 'Nine', 'Rustfang', 'Okafor', 'Vance', 'Ironside', 'Marrow', 'Quill', 'Duarte', 'Sato', 'Holloway', 'Reyes', 'Blackwell', 'Voss', 'Mbeki', 'Castellan', 'Pryce', 'Lindqvist'];

let nextCrewId = 1;
export function bumpCrewId(min: number): void {
  nextCrewId = Math.max(nextCrewId, min + 1);
}

export function crewName(rng: () => number = Math.random): string {
  return `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
}

export function makeCrew(role: CrewRole, rarity: Rarity, level = 1, rng: () => number = Math.random): CrewMember {
  return {
    id: nextCrewId++, name: crewName(rng), role, rarity, level: Math.max(1, Math.min(MAX_LEVEL, level)), xp: XP_LEVELS[level - 1] ?? 0,
    perks: [], draft: null, champion: null, exclusive: null, face: Math.floor(rng() * 1e9), injured: 0, loc: 'main', officer: -1, cd: 0, returnIn: 0,
  };
}

export function makeChampion(id: string, rng: () => number = Math.random): CrewMember {
  const def = CHAMPIONS.find((c) => c.id === id) ?? CHAMPIONS[0];
  const c = makeCrew(def.role, 4, 3, rng);
  c.name = def.name;
  c.champion = def.id;
  return c;
}

export function makeExclusive(id: string, rng: () => number = Math.random): CrewMember {
  const def = EXCLUSIVES.find((c) => c.id === id) ?? EXCLUSIVES[0];
  const c = makeCrew(def.role, 3, 2, rng);
  c.name = def.name;
  c.exclusive = def.id;
  return c;
}

export function randomRole(rng: () => number = Math.random): CrewRole {
  return ROLE_LIST[Math.floor(rng() * ROLE_LIST.length)].key;
}

/** A recruit for the hiring board. Rarity rarely goes past Rare. */
export function makeRecruit(rng: () => number, threat: number, luck = 0): CrewMember {
  const r = rollRarity(rng, Math.max(0, threat - 1) * 0.15 + luck, 0, luck > 0 ? 4 : 3);
  const level = 1 + Math.floor(rng() * Math.min(3, threat));
  return makeCrew(randomRole(rng), r, level, rng);
}

export function abilityOf(c: CrewMember): AbilityDef {
  if (c.champion) {
    const def = CHAMPIONS.find((d) => d.id === c.champion);
    if (def) return ABILITIES[def.ability];
  }
  return ABILITIES[ROLES[c.role].ability];
}

export function championDef(c: CrewMember): ChampionDef | undefined {
  return c.champion ? CHAMPIONS.find((d) => d.id === c.champion) : undefined;
}

export function exclusiveDef(c: CrewMember): ExclusiveDef | undefined {
  return c.exclusive ? EXCLUSIVES.find((d) => d.id === c.exclusive) : undefined;
}

export function displayTitle(c: CrewMember): string {
  const ch = championDef(c);
  if (ch) return `${ch.title} · Champion`;
  if (c.exclusive) return `${ROLES[c.role].name} · Exclusive`;
  return ROLES[c.role].name;
}

function perkSum(c: CrewMember, stat: PerkStat): number {
  let s = 0;
  for (const p of c.perks) {
    const d = PERK_BY_ID.get(p.id);
    if (d && statsOf(d).includes(stat)) s += d.values[p.rarity];
  }
  return s;
}

/** Multiplier on this crew member's own ability effect. */
export function abilityPower(c: CrewMember, bonus = 0): number {
  return (1 + 0.15 * c.rarity) * (1 + 0.07 * (c.level - 1)) * (1 + perkSum(c, 'ability') + bonus);
}

export function abilityCooldown(c: CrewMember, globalCdr: number): number {
  const base = abilityOf(c).cd;
  return base * (1 - 0.03 * (c.level - 1)) * (1 - Math.min(0.5, globalCdr));
}

export function hireCost(c: CrewMember): Cost {
  const f = 1 + c.rarity * 0.8;
  return { scrap: Math.ceil((30 + 22 * (c.level - 1)) * f), rations: Math.ceil((2 + 2 * c.level) * (1 + c.rarity * 0.5)) };
}

/** Rolls a pick-one-of-three perk draft. Rarer crew draft rarer perks. */
export function rollDraft(c: CrewMember, rng: () => number, extraLuck = 0, choices = 3): PerkInst[] {
  const out: PerkInst[] = [];
  const pool = PERKS.filter((p) => (p.minLevel ?? 0) <= c.level);
  // Late perks show up often once unlocked: they are the payoff for levelling.
  const late = pool.filter((p) => (p.minLevel ?? 0) > 0);
  if (late.length && rng() < 0.6) {
    const d = late[Math.floor(rng() * late.length)];
    out.push({ id: d.id, rarity: rollRarity(rng, 0.2 * c.rarity + extraLuck, d.minRarity ?? 0, 5) });
    pool.splice(pool.indexOf(d), 1);
  }
  while (out.length < choices && pool.length) {
    const i = Math.floor(rng() * pool.length);
    const d = pool.splice(i, 1)[0];
    const r = rollRarity(rng, 0.2 * c.rarity + extraLuck, d.minRarity ?? 0, 5);
    out.push({ id: d.id, rarity: r });
  }
  return out;
}

/** Adds XP; rolls a perk draft on each level-up. Returns levels gained. */
export function giveXp(c: CrewMember, amount: number, rng: () => number = Math.random, choices = 3): number {
  if (c.level >= MAX_LEVEL) return 0;
  c.xp += amount * (1 + perkSum(c, 'xp'));
  let ups = 0;
  while (c.level < MAX_LEVEL && c.xp >= XP_LEVELS[c.level]) {
    c.level++;
    ups++;
  }
  if (ups && !c.draft) c.draft = rollDraft(c, rng, 0, choices);
  return ups;
}

export function pickPerk(c: CrewMember, index: number, rng: () => number = Math.random, choices = 3): boolean {
  if (!c.draft || !c.draft[index]) return false;
  c.perks.push(c.draft[index]);
  // Unspent levels queue another draft.
  const owed = c.level - 1 - c.perks.length;
  c.draft = owed > 0 ? rollDraft(c, rng, 0, choices) : null;
  return true;
}

export function normalizeCrew(raw: Partial<CrewMember> & { name: string }): CrewMember {
  const role = raw.role && raw.role in ROLES ? raw.role : randomRole();
  const c = makeCrew(role, (raw.rarity ?? 0) as Rarity, raw.level ?? 1);
  c.name = raw.name;
  if (raw.id) c.id = raw.id;
  bumpCrewId(c.id);
  c.xp = raw.xp ?? c.xp;
  c.perks = (raw.perks ?? []).filter((p) => PERK_BY_ID.has(p.id));
  c.draft = raw.draft ?? null;
  c.champion = raw.champion ?? null;
  c.exclusive = raw.exclusive ?? null;
  c.face = raw.face ?? c.face;
  c.injured = raw.injured ?? 0;
  c.loc = raw.loc ?? 'main';
  c.officer = raw.officer ?? -1;
  c.cd = 0;
  c.returnIn = raw.returnIn ?? 0;
  if (c.loc === 'away' && c.returnIn <= 0) c.loc = 'main';
  return c;
}

/* ---------------------------------------------------------------------- */
/* Crew bonus: what everyone aboard adds up to                             */
/* ---------------------------------------------------------------------- */

export interface CrewBonus {
  dmg: number;
  rate: number;
  range: number;
  crit: number;
  lifesteal: number;
  hp: number;
  shield: number;
  armor: number;
  regen: number;
  speed: number;
  power: number;
  cdr: number;
  loot: number;
  harvest: number;
  cargo: number;
  research: number;
  vision: number;
  recovery: number;
  healMult: number;
  extraMarines: number;
  terrainImmune: boolean;
  chestLuck: number;
  /** Ultimate charge speed bonus. */
  ult: number;
  /** Arsenal active cooldown reduction. */
  actcd: number;
  /** Officer ability power bonus (research). */
  abilityPower: number;
  xp: number;
}

export function emptyBonus(): CrewBonus {
  return {
    dmg: 0, rate: 0, range: 0, crit: 0, lifesteal: 0, hp: 0, shield: 0, armor: 0, regen: 0, speed: 0, power: 0, cdr: 0,
    loot: 0, harvest: 0, cargo: 0, research: 0, vision: 0, recovery: 0, healMult: 1, extraMarines: 0, terrainImmune: false, chestLuck: 0,
    ult: 0, actcd: 0, abilityPower: 0, xp: 0,
  };
}

/** Sums passives and perks of every fit crew member aboard the fortress. */
export function computeCrewBonus(crew: CrewMember[]): CrewBonus {
  const b = emptyBonus();
  for (const c of crew) {
    if (c.loc !== 'main' || c.injured > 0) continue;
    const q = (1 + 0.15 * c.rarity) * c.level;
    switch (c.role) {
      case 'gunner': b.dmg += 0.025 * q; break;
      case 'engineer': b.power += 0.04 * q; b.shield += 0.03 * q; break;
      case 'mechanic': b.regen += 0.35 * q; break;
      case 'medic': b.recovery += 0.25 * q; break;
      case 'driver': b.speed += 0.02 * q; break;
      case 'scavenger': b.loot += 0.04 * q; b.harvest += 0.05 * q; break;
      case 'quartermaster': b.cargo += Math.round(2 * q); break;
      case 'scientist': b.research += 0.03 * q; break;
      case 'marine': b.armor += 0.01 * q; b.hp += 0.02 * q; break;
    }
    for (const p of c.perks) {
      const d = PERK_BY_ID.get(p.id);
      if (!d) continue;
      const v = d.values[p.rarity];
      for (const stat of statsOf(d)) switch (stat) {
        case 'dmg': b.dmg += v; break;
        case 'rate': b.rate += v; break;
        case 'range': b.range += v; break;
        case 'hp': b.hp += v; break;
        case 'shield': b.shield += v; break;
        case 'speed': b.speed += v; break;
        case 'armor': b.armor += v; break;
        case 'regen': b.regen += v; break;
        case 'cdr': b.cdr += v; break;
        case 'power': b.power += v; break;
        case 'loot': b.loot += v; break;
        case 'harvest': b.harvest += v; break;
        case 'cargo': b.cargo += v; break;
        case 'crit': b.crit += v; break;
        case 'lifesteal': b.lifesteal += v; break;
        case 'vision': b.vision += v; break;
        case 'research': b.research += v; break;
        case 'ult': b.ult += v; break;
        case 'actcd': b.actcd += v; break;
        default: break;
      }
    }
    const ex = exclusiveDef(c);
    if (ex) {
      switch (ex.effect) {
        case 'heal_boost': b.healMult += 0.3; break;
        case 'cdr_all': b.cdr += 0.1; break;
        case 'extra_marines': b.extraMarines += 2; break;
        case 'terrain': b.terrainImmune = true; break;
        case 'research': b.research += 0.2; break;
        case 'regen': b.regen += 2; break;
        case 'crit_all': b.crit += 0.1; break;
        case 'chest_luck': b.chestLuck += 0.8; break;
        case 'cargo': b.cargo += 24; break;
      }
    }
  }
  b.dmg = Math.min(0.8, b.dmg);
  b.rate = Math.min(0.6, b.rate);
  b.speed = Math.min(0.35, b.speed);
  b.armor = Math.min(0.3, b.armor);
  b.research = Math.min(0.5, b.research);
  b.cdr = Math.min(0.45, b.cdr);
  b.crit = Math.min(0.5, b.crit);
  b.actcd = Math.min(0.45, b.actcd);
  b.ult = Math.min(1, b.ult);
  return b;
}

export const rarityOfCrew = (c: CrewMember): Rarity => c.rarity;
export const rarityMult = (r: Rarity): number => RARITIES[r].mult;
