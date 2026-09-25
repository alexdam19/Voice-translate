import type { Cost } from '../shared/inventory';
import type { ModuleInst } from './rig';
import { hullMods, weaponMods, type HullMods, type WeaponMods } from './tech';
import type { WeaponFamily } from './rigDefs';

/* ---------------------------------------------------------------------- */
/* Roles, perks, traits                                                    */
/* ---------------------------------------------------------------------- */

export type CrewRole = 'gunner' | 'engineer' | 'mechanic' | 'medic' | 'driver' | 'scavenger' | 'quartermaster' | 'scientist' | 'marine';

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
}

export interface RoleDef {
  key: CrewRole;
  name: string;
  color: string;
  /** Module keys this role prefers to be posted at, best first. */
  posts: string[];
  ability: string;
  perks: PerkDef[];
}

const P = (id: string, name: string, desc: string): PerkDef => ({ id, name, desc });

export const ROLES: Record<CrewRole, RoleDef> = {
  gunner: {
    key: 'gunner', name: 'Gunner', color: '#ff9100', posts: ['rail_cannon', 'main_battery', 'missile_pod', 'mortar', 'laser_turret', 'autocannon', 'gatling', 'tesla', 'flak', 'point_defense'],
    ability: 'Mans a turret: +8% damage and fire rate per level on that gun.',
    perks: [P('deadeye', 'Deadeye', 'Manned turret deals +20% damage.'), P('rapid_reload', 'Rapid Reload', 'Manned turret fires +20% faster.'), P('spotter', 'Spotter', 'Every turret on the rig gets +15% range.')],
  },
  engineer: {
    key: 'engineer', name: 'Engineer', color: '#ffd740', posts: ['fission', 'reactor', 'ion_engine', 'engine'],
    ability: 'Runs a reactor (+10% power per level) or an engine (+10% thrust per level).',
    perks: [P('overclock', 'Overclock', 'Their reactor or engine gets another +15%.'), P('efficiency', 'Efficiency', 'Rig-wide power draw -10%.'), P('hot_swap', 'Hot Swap', 'Facilities slowly self-repair (2 hp/s).')],
  },
  mechanic: {
    key: 'mechanic', name: 'Mechanic', color: '#ffab40', posts: ['repair_bay', 'garage', 'engine'],
    ability: 'Patches plating anywhere on the rig: 3 hp/s per level (double at Repair Drones). Uses cargo scrap.',
    perks: [P('field_welder', 'Field Welder', 'Repairs 50% faster.'), P('armorsmith', 'Armorsmith', 'All plating +15% max health.'), P('salvager', 'Salvager', 'Salvaging wrecks yields 50% more.')],
  },
  medic: {
    key: 'medic', name: 'Medic', color: '#76ff03', posts: ['medbay', 'quarters'],
    ability: 'Heals you and the crew aboard: 1.5 hp/s per level (double from a Medbay).',
    perks: [P('triage', 'Triage', 'Crew are never killed by hazards.'), P('combat_stims', 'Combat Stims', 'You take 15% less damage near the rig.'), P('field_surgeon', 'Field Surgeon', 'Heals you anywhere within 40 tiles of the rig.')],
  },
  driver: {
    key: 'driver', name: 'Driver', color: '#00e5ff', posts: ['cockpit'],
    ability: 'At the Command Bridge: +5% speed per level.',
    perks: [P('rough_rider', 'Rough Rider', '+1 climb and half the bog-down penalty on bad terrain.'), P('lead_foot', 'Lead Foot', '+15% speed.'), P('evasive', 'Evasive Driving', 'Rig takes 15% less damage while moving.')],
  },
  scavenger: {
    key: 'scavenger', name: 'Scavenger', color: '#a1887f', posts: ['cargo', 'garage'],
    ability: '+20% chance per level of an extra loot roll from caches, wrecks and titans.',
    perks: [P('keen_eye', 'Keen Eye', 'Always one extra loot roll.'), P('pack_rat', 'Pack Rat', '+16 cargo slots.'), P('tech_hunter', 'Tech Hunter', '+1 Salvaged Tech from every wreck and titan.')],
  },
  quartermaster: {
    key: 'quartermaster', name: 'Quartermaster', color: '#b0bec5', posts: ['refinery', 'cargo'],
    ability: 'At a Refinery or Cargo Bay: +8 cargo slots and +10% chance per level to double refinery output.',
    perks: [P('bulk_smelting', 'Bulk Smelting', '+20% more chance to double refinery output.'), P('logistics', 'Logistics', '+24 cargo slots.'), P('rationing', 'Rationing', 'Hydroponics grow twice as fast.')],
  },
  scientist: {
    key: 'scientist', name: 'Scientist', color: '#ea80fc', posts: ['fabricator', 'armory', 'radar'],
    ability: 'Research costs -8% per level (max -50% across the crew).',
    perks: [P('reverse_engineering', 'Reverse Engineering', '+1 Salvaged Tech from every wreck and titan.'), P('theorist', 'Theorist', 'Another -15% research cost.'), P('lab_safety', 'Weapons Lab', 'Energy weapons deal +10% damage.')],
  },
  marine: {
    key: 'marine', name: 'Marine', color: '#ff5252', posts: ['barracks', 'armory'],
    ability: 'Repels boarders: +25% damage per level when defending the rig.',
    perks: [P('veteran', 'Veteran', '+50 max health.'), P('suppressive_fire', 'Suppressive Fire', 'Fires 50% faster at intruders.'), P('boarding_party', 'Overwatch', 'Also shoots enemies within 14 tiles outside the hull.')],
  },
};

export const ROLE_LIST = Object.values(ROLES);

export interface TraitDef {
  key: string;
  name: string;
  desc: string;
}

export const TRAITS: TraitDef[] = [
  { key: 'tough', name: 'Tough', desc: '+50 max health.' },
  { key: 'quick', name: 'Quick Learner', desc: '+50% experience.' },
  { key: 'ex_military', name: 'Ex-Military', desc: '+10% damage on any turret they man.' },
  { key: 'iron_lungs', name: 'Iron Lungs', desc: 'Takes half damage from hazards.' },
  { key: 'frugal', name: 'Frugal', desc: 'Recruits for half price.' },
  { key: 'steady', name: 'Steady', desc: 'No special talent. Reliable.' },
];

export const XP_LEVELS = [0, 100, 260, 520];
export const MAX_LEVEL = XP_LEVELS.length;

export interface CrewMember {
  id: number;
  name: string;
  role: CrewRole;
  trait: string;
  level: number;
  xp: number;
  perks: string[];
  hp: number;
  maxHp: number;
  /** Module id they currently work at (-1 = none). */
  post: number;
  /** Manually assigned module id, or null for automatic posting. */
  assign: number | null;
  bob: number;
}

const FIRST = ['Vex', 'Rook', 'Juno', 'Kade', 'Mara', 'Ozzy', 'Tamsin', 'Brick', 'Nyx', 'Solder', 'Wren', 'Grit', 'Pike', 'Echo', 'Dusk', 'Riva', 'Hex', 'Moth', 'Cinder', 'Talon', 'Ash', 'Bolt', 'Kestrel', 'Nova', 'Sable', 'Tank'];
const LAST = ['Kowalski', 'Ashgrove', 'Nine', 'Rustfang', 'Okafor', 'Vance', 'Ironside', 'Marrow', 'Quill', 'Duarte', 'Sato', 'Holloway', 'Reyes', 'Blackwell', 'Voss', 'Mbeki', 'Castellan'];

let nextCrewId = 1;
export function bumpCrewId(min: number): void {
  nextCrewId = Math.max(nextCrewId, min + 1);
}

export function crewName(rng: () => number = Math.random): string {
  return `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
}

export function makeCrew(role: CrewRole, rng: () => number = Math.random, level = 1, trait?: string): CrewMember {
  const t = trait ?? TRAITS[Math.floor(rng() * TRAITS.length)].key;
  const maxHp = 100 + (t === 'tough' ? 50 : 0);
  return {
    id: nextCrewId++, name: crewName(rng), role, trait: t, level, xp: XP_LEVELS[level - 1] ?? 0, perks: [],
    hp: maxHp, maxHp, post: -1, assign: null, bob: rng() * 6,
  };
}

export function randomRole(rng: () => number = Math.random): CrewRole {
  return ROLE_LIST[Math.floor(rng() * ROLE_LIST.length)].key;
}

export function hireCost(c: CrewMember): Cost {
  const f = c.trait === 'frugal' ? 0.5 : 1;
  return { scrap: Math.ceil((30 + 25 * (c.level - 1)) * f), rations: Math.ceil(3 * c.level * f) };
}

/** Perk points not yet spent. */
export function perkPoints(c: CrewMember): number {
  return c.level - 1 - c.perks.length;
}

/** Adds XP; returns true if the crew member levelled up. */
export function giveXp(c: CrewMember, amount: number): boolean {
  if (c.level >= MAX_LEVEL) return false;
  c.xp += amount * (c.trait === 'quick' ? 1.5 : 1);
  let up = false;
  while (c.level < MAX_LEVEL && c.xp >= XP_LEVELS[c.level]) {
    c.level++;
    up = true;
  }
  return up;
}

export function hasPerk(c: CrewMember, id: string): boolean {
  return c.perks.includes(id);
}

export function normalizeCrew(raw: Partial<CrewMember> & { name: string }): CrewMember {
  const role = raw.role && raw.role in ROLES ? raw.role : randomRole();
  const c = makeCrew(role, Math.random, Math.max(1, Math.min(MAX_LEVEL, raw.level ?? 1)), raw.trait ?? 'steady');
  c.name = raw.name;
  if (raw.id) c.id = raw.id;
  bumpCrewId(c.id);
  c.xp = raw.xp ?? c.xp;
  c.perks = (raw.perks ?? []).filter((p) => ROLES[role].perks.some((d) => d.id === p));
  c.maxHp = 100 + (c.trait === 'tough' ? 50 : 0) + (c.perks.includes('veteran') ? 50 : 0);
  c.hp = Math.min(c.maxHp, raw.hp ?? c.maxHp);
  c.assign = raw.assign ?? null;
  return c;
}

/* ---------------------------------------------------------------------- */
/* Bonuses                                                                 */
/* ---------------------------------------------------------------------- */

export interface ModuleBonus {
  dmg: number;
  rate: number;
  power: number;
  thrust: number;
}

/** Everything crew and research do to a rig, recomputed a few times a second. */
export interface RigBonus {
  mod: Map<number, ModuleBonus>;
  weapon: Record<WeaponFamily, WeaponMods>;
  hull: HullMods;
  powerProdMult: number;
  powerUseMult: number;
  speedMult: number;
  climbBonus: number;
  bogMult: number;
  evasive: number;
  rangeMult: number;
  tileHp: number;
  armorHp: number;
  cargoBonus: number;
  repairHps: number;
  moduleRegen: number;
  healHps: number;
  healRange: number;
  playerDmgTaken: number;
  crewSafe: boolean;
  lootRolls: number;
  techBonus: number;
  salvageMult: number;
  researchDiscount: number;
  refineDouble: number;
  rationMult: number;
  defenderDmg: number;
  defenderRate: number;
  overwatch: boolean;
}

const FAMILIES: WeaponFamily[] = ['ballistic', 'artillery', 'missile', 'energy', 'defense'];

export function defaultBonus(tech?: Set<string>): RigBonus {
  const weapon = {} as Record<WeaponFamily, WeaponMods>;
  for (const f of FAMILIES) weapon[f] = weaponMods(tech ?? new Set(), f);
  const hull = hullMods(tech ?? new Set());
  return {
    mod: new Map(), weapon, hull,
    powerProdMult: 1, powerUseMult: 1, speedMult: hull.speed, climbBonus: 0, bogMult: 1, evasive: 0, rangeMult: 1,
    tileHp: hull.tileHp, armorHp: hull.armorHp, cargoBonus: 0, repairHps: 0, moduleRegen: 0, healHps: 0, healRange: 0,
    playerDmgTaken: 1, crewSafe: false, lootRolls: 0, techBonus: 0, salvageMult: 1, researchDiscount: 0, refineDouble: 0,
    rationMult: 1, defenderDmg: 1, defenderRate: 1, overwatch: false,
  };
}

export function computeBonus(crew: CrewMember[], modules: ModuleInst[], tech: Set<string>): RigBonus {
  const b = defaultBonus(tech);
  const byId = new Map(modules.map((m) => [m.id, m]));
  const mb = (m: ModuleInst): ModuleBonus => {
    let v = b.mod.get(m.id);
    if (!v) {
      v = { dmg: 1, rate: 1, power: 1, thrust: 1 };
      b.mod.set(m.id, v);
    }
    return v;
  };
  let marines = 0;
  for (const c of crew) {
    const L = c.level;
    const post = byId.get(c.post);
    const perk = (id: string): boolean => c.perks.includes(id);
    if (post?.def.turret && c.trait === 'ex_military') mb(post).dmg *= 1.1;
    switch (c.role) {
      case 'gunner':
        if (post?.def.turret) {
          mb(post).dmg *= 1 + 0.08 * L + (perk('deadeye') ? 0.2 : 0);
          mb(post).rate *= 1 + 0.08 * L + (perk('rapid_reload') ? 0.2 : 0);
        }
        if (perk('spotter')) b.rangeMult *= 1.15;
        break;
      case 'engineer':
        if (post && (post.def.power > 0)) mb(post).power *= 1 + 0.1 * L + (perk('overclock') ? 0.15 : 0);
        if (post?.def.thrust) mb(post).thrust *= 1 + 0.1 * L + (perk('overclock') ? 0.15 : 0);
        if (perk('efficiency')) b.powerUseMult *= 0.9;
        if (perk('hot_swap')) b.moduleRegen += 2;
        break;
      case 'mechanic':
        b.repairHps += 3 * L * (post?.def.key === 'repair_bay' ? 2 : 1) * (perk('field_welder') ? 1.5 : 1);
        if (perk('armorsmith')) {
          b.tileHp *= 1.15;
          b.armorHp *= 1.15;
        }
        if (perk('salvager')) b.salvageMult *= 1.5;
        break;
      case 'medic':
        b.healHps += 1.5 * L * (post?.def.medbay ? 2 : 1);
        if (perk('triage')) b.crewSafe = true;
        if (perk('combat_stims')) b.playerDmgTaken *= 0.85;
        if (perk('field_surgeon')) b.healRange = Math.max(b.healRange, 40);
        break;
      case 'driver':
        if (post?.def.key === 'cockpit') b.speedMult *= 1 + 0.05 * L;
        if (perk('lead_foot')) b.speedMult *= 1.15;
        if (perk('rough_rider')) {
          b.climbBonus += 1;
          b.bogMult = 2;
        }
        if (perk('evasive')) b.evasive = 0.15;
        break;
      case 'scavenger':
        b.lootRolls += 0.2 * L + (perk('keen_eye') ? 1 : 0);
        if (perk('pack_rat')) b.cargoBonus += 16;
        if (perk('tech_hunter')) b.techBonus += 1;
        break;
      case 'quartermaster':
        if (post && (post.def.key === 'refinery' || post.def.key === 'cargo')) {
          b.cargoBonus += 8 * L;
          b.refineDouble += 0.1 * L;
        }
        if (perk('bulk_smelting')) b.refineDouble += 0.2;
        if (perk('logistics')) b.cargoBonus += 24;
        if (perk('rationing')) b.rationMult = 2;
        break;
      case 'scientist':
        b.researchDiscount += 0.08 * L + (perk('theorist') ? 0.15 : 0);
        if (perk('reverse_engineering')) b.techBonus += 1;
        if (perk('lab_safety')) b.weapon.energy = { ...b.weapon.energy, dmg: b.weapon.energy.dmg * 1.1 };
        break;
      case 'marine':
        marines++;
        b.defenderDmg = Math.max(b.defenderDmg, 1 + 0.25 * L);
        if (perk('suppressive_fire')) b.defenderRate = Math.max(b.defenderRate, 1.5);
        if (perk('boarding_party')) b.overwatch = true;
        break;
    }
  }
  b.researchDiscount = Math.min(0.5, b.researchDiscount);
  b.refineDouble = Math.min(0.9, b.refineDouble);
  void marines;
  return b;
}

/* ---------------------------------------------------------------------- */
/* Posting                                                                 */
/* ---------------------------------------------------------------------- */

const FILL_ORDER: CrewRole[] = ['marine', 'scavenger', 'quartermaster', 'scientist', 'medic', 'mechanic', 'engineer', 'driver'];
const EXCLUSIVE = (m: ModuleInst): boolean => !!m.def.turret || m.def.key === 'cockpit';

/**
 * Puts every crew member somewhere useful: manual assignments first, then
 * each role's preferred stations, then any idle hands onto unmanned guns.
 */
export function assignPosts(crew: CrewMember[], modules: ModuleInst[]): void {
  const taken = new Set<number>();
  const byId = new Map(modules.map((m) => [m.id, m]));
  for (const c of crew) c.post = -1;
  for (const c of crew) {
    if (c.assign === null) continue;
    const m = byId.get(c.assign);
    if (!m || (EXCLUSIVE(m) && taken.has(m.id))) {
      if (!m) c.assign = null;
      continue;
    }
    c.post = m.id;
    if (EXCLUSIVE(m)) taken.add(m.id);
  }
  const atStation = new Set<CrewMember>();
  for (const c of crew) {
    if (c.post !== -1) continue;
    for (const key of ROLES[c.role].posts) {
      const m = modules.find((x) => x.def.key === key && !(EXCLUSIVE(x) && taken.has(x.id)));
      if (m) {
        c.post = m.id;
        atStation.add(c);
        if (EXCLUSIVE(m)) taken.add(m.id);
        break;
      }
    }
  }
  // Spare hands (no station of their own) and marines crew any silent guns.
  const idle = crew.filter((c) => c.assign === null && (!atStation.has(c) || c.role === 'marine') && !(byId.get(c.post) && EXCLUSIVE(byId.get(c.post)!)));
  idle.sort((a, b) => FILL_ORDER.indexOf(a.role) - FILL_ORDER.indexOf(b.role));
  for (const m of modules) {
    if (!m.def.turret || taken.has(m.id)) continue;
    const c = idle.shift();
    if (!c) break;
    c.post = m.id;
    taken.add(m.id);
  }
  // Leftovers with no preferred station hang out in barracks/quarters.
  const lounge = modules.find((m) => m.def.key === 'barracks') ?? modules.find((m) => m.def.key === 'quarters');
  for (const c of crew) if (c.post === -1 && lounge) c.post = lounge.id;
}
