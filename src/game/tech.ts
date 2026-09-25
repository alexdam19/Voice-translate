import type { Cost } from '../shared/inventory';
import { BASE_WEAPON_MODS, WEAPONS, type WeaponFamily, type WeaponMods } from '../shared/weapons';
import { MODULES } from './defs';

/**
 * The tech tree chart. Nodes unlock new weapons/modules, or upgrade a whole
 * weapon family or the hull. Rows are branches, columns are tiers.
 */

export type Branch = 'ballistics' | 'artillery' | 'missiles' | 'energy' | 'defense' | 'hull' | 'industry';

export interface HullMods {
  hp: number;
  armor: number;
  shield: number;
  shieldRegen: number;
  speed: number;
  crush: number;
  loot: number;
  cargo: number;
  harvest: number;
}

export interface TechNode {
  id: string;
  name: string;
  branch: Branch;
  tier: number;
  requires: string[];
  cost: Cost;
  desc: string;
  free?: boolean;
  /** Weapon or module keys this node lets you build. */
  unlocks?: string[];
  weapon?: Partial<Record<WeaponFamily, Partial<WeaponMods>>>;
  hull?: Partial<HullMods>;
}

export const BRANCHES: { key: Branch; name: string; color: string }[] = [
  { key: 'ballistics', name: 'BALLISTICS', color: '#ffab40' },
  { key: 'artillery', name: 'ARTILLERY', color: '#ff6e40' },
  { key: 'missiles', name: 'MISSILES', color: '#ff3d00' },
  { key: 'energy', name: 'ENERGY', color: '#ea80fc' },
  { key: 'defense', name: 'DEFENSE', color: '#80d8ff' },
  { key: 'hull', name: 'HULL & DRIVE', color: '#b0bec5' },
  { key: 'industry', name: 'INDUSTRY', color: '#a5d6a7' },
];

const N = (n: TechNode): TechNode => n;

export const TECH: TechNode[] = [
  N({ id: 'autocannon', name: 'Autocannon', branch: 'ballistics', tier: 0, requires: [], cost: {}, free: true, unlocks: ['autocannon'], desc: 'Standard-issue rapid-fire cannon.' }),
  N({ id: 'hardened_rounds', name: 'Hardened Rounds', branch: 'ballistics', tier: 1, requires: ['autocannon'], cost: { iron_plate: 20, tech_parts: 2 }, weapon: { ballistic: { dmg: 1.25 } }, desc: 'Ballistic weapons deal +25% damage.' }),
  N({ id: 'gatling', name: 'Gatling Sponson', branch: 'ballistics', tier: 2, requires: ['hardened_rounds'], cost: { iron_plate: 30, circuit: 6, tech_parts: 4 }, unlocks: ['gatling'], desc: 'Build the Gatling Sponson: short range, absurd rate of fire.' }),
  N({ id: 'belt_feed', name: 'Belt Feeders', branch: 'ballistics', tier: 3, requires: ['gatling'], cost: { titanium_alloy: 10, circuit: 8, tech_parts: 6 }, weapon: { ballistic: { rate: 1.3 } }, desc: 'Ballistic weapons fire 30% faster.' }),
  N({ id: 'du_rounds', name: 'Depleted Uranium', branch: 'ballistics', tier: 4, requires: ['belt_feed'], cost: { uranium_rod: 4, titanium_alloy: 10, tech_parts: 10 }, weapon: { ballistic: { dmg: 1.35, pierce: 1 } }, desc: 'Ballistic rounds deal +35% damage and pierce one extra target.' }),

  N({ id: 'main_battery', name: '88mm Main Battery', branch: 'artillery', tier: 0, requires: [], cost: {}, free: true, unlocks: ['main_battery'], desc: 'The heavy gun every crawler starts with.' }),
  N({ id: 'heat_shells', name: 'HEAT Shells', branch: 'artillery', tier: 1, requires: ['main_battery'], cost: { explosive: 10, iron_plate: 20, tech_parts: 3 }, weapon: { artillery: { dmg: 1.3, radius: 1.25 } }, desc: 'Artillery deals +30% damage with 25% bigger blasts.' }),
  N({ id: 'mortar', name: 'Mortar Pit', branch: 'artillery', tier: 2, requires: ['heat_shells'], cost: { iron_plate: 30, explosive: 10, tech_parts: 5 }, unlocks: ['mortar'], desc: 'Build Mortar Pits: lobbed shells over obstacles.' }),
  N({ id: 'autoloader', name: 'Autoloader', branch: 'artillery', tier: 3, requires: ['mortar'], cost: { titanium_alloy: 12, circuit: 10, tech_parts: 8 }, weapon: { artillery: { rate: 1.35 } }, desc: 'Artillery reloads 35% faster.' }),
  N({ id: 'bore_120', name: '120mm Bore', branch: 'artillery', tier: 4, requires: ['autoloader'], cost: { titanium_alloy: 20, tech_parts: 12 }, weapon: { artillery: { dmg: 1.45, range: 1.15 } }, desc: 'Artillery deals +45% damage at 15% longer range.' }),
  N({ id: 'rail_cannon', name: 'Rail Cannon', branch: 'artillery', tier: 5, requires: ['bore_120', 'capacitors'], cost: { xeno_alloy: 8, uranium_rod: 6, tech_parts: 20 }, unlocks: ['rail_cannon'], desc: 'Build the Rail Cannon. Also needs Capacitor Banks (Energy).' }),

  N({ id: 'missiles', name: 'Missile Pods', branch: 'missiles', tier: 1, requires: [], cost: { circuit: 8, explosive: 6, tech_parts: 3 }, unlocks: ['missile_pod'], desc: 'Build homing Missile Pods.' }),
  N({ id: 'guidance', name: 'Guidance Package', branch: 'missiles', tier: 2, requires: ['missiles'], cost: { circuit: 10, cryo_core: 1, tech_parts: 5 }, weapon: { missile: { turn: 1.8, speed: 1.3, range: 1.15 } }, desc: 'Missiles turn harder, fly 30% faster and reach 15% further.' }),
  N({ id: 'swarm', name: 'Swarm Racks', branch: 'missiles', tier: 3, requires: ['guidance'], cost: { titanium_alloy: 12, explosive: 12, tech_parts: 8 }, weapon: { missile: { pellets: 2 } }, desc: 'Missile weapons fire 2 extra missiles per volley.' }),
  N({ id: 'thermobaric', name: 'Thermobaric Warheads', branch: 'missiles', tier: 4, requires: ['swarm'], cost: { sulfur: 20, explosive: 16, tech_parts: 12 }, weapon: { missile: { dmg: 1.4, radius: 1.4 } }, desc: 'Missiles deal +40% damage with 40% bigger blasts.' }),

  N({ id: 'laser', name: 'Laser Turret', branch: 'energy', tier: 1, requires: [], cost: { circuit: 10, cryo_core: 1, tech_parts: 4 }, unlocks: ['laser'], desc: 'Build Laser Turrets: long range, instant hit.' }),
  N({ id: 'lenses', name: 'Focusing Lenses', branch: 'energy', tier: 2, requires: ['laser'], cost: { circuit: 12, cryo_core: 2, tech_parts: 5 }, weapon: { energy: { dmg: 1.25, range: 1.15 } }, desc: 'Energy weapons deal +25% damage at 15% longer range.' }),
  N({ id: 'tesla', name: 'Tesla Coil', branch: 'energy', tier: 3, requires: ['lenses'], cost: { copper_wire: 40, cryo_core: 3, tech_parts: 8 }, unlocks: ['tesla'], desc: 'Build Tesla Coils: chain lightning.' }),
  N({ id: 'capacitors', name: 'Capacitor Banks', branch: 'energy', tier: 4, requires: ['tesla'], cost: { uranium_rod: 2, circuit: 16, tech_parts: 10 }, weapon: { energy: { power: 0.6, rate: 1.25 } }, desc: 'Energy weapons use 40% less power and fire 25% faster.' }),

  N({ id: 'flak', name: 'Flak Battery', branch: 'defense', tier: 1, requires: [], cost: { iron_plate: 20, circuit: 4, tech_parts: 2 }, unlocks: ['flak'], desc: 'Build Flak Batteries: bursting shells, great against swarms and flyers.' }),
  N({ id: 'prox_fuze', name: 'Proximity Fuzes', branch: 'defense', tier: 2, requires: ['flak'], cost: { circuit: 8, explosive: 6, tech_parts: 4 }, weapon: { defense: { radius: 1.4, dmg: 1.2 } }, desc: 'Defense weapons deal +20% damage with 40% bigger bursts.' }),
  N({ id: 'point_defense', name: 'Point Defense', branch: 'defense', tier: 3, requires: ['prox_fuze'], cost: { circuit: 12, titanium_alloy: 6, tech_parts: 6 }, unlocks: ['point_defense'], weapon: { defense: { rate: 1.2 } }, desc: 'Build Point Defense turrets that shoot down incoming shells.' }),
  N({ id: 'shield_gen', name: 'Shield Generator', branch: 'defense', tier: 4, requires: ['point_defense'], cost: { titanium_alloy: 10, uranium_rod: 2, tech_parts: 8 }, unlocks: ['shield'], desc: 'Build Shield Generators.' }),
  N({ id: 'harmonics', name: 'Shield Harmonics', branch: 'defense', tier: 5, requires: ['shield_gen'], cost: { cryo_core: 4, uranium_rod: 4, tech_parts: 12 }, hull: { shield: 1.6, shieldRegen: 1.5 }, desc: 'Shields hold 60% more and recharge 50% faster.' }),

  N({ id: 'reinforced', name: 'Reinforced Hull', branch: 'hull', tier: 1, requires: [], cost: { iron_plate: 30, tech_parts: 2 }, hull: { hp: 1.2 }, desc: 'Fortress hull +20%.' }),
  N({ id: 'reactive_armor', name: 'Reactive Armor', branch: 'hull', tier: 2, requires: ['reinforced'], cost: { titanium_alloy: 16, explosive: 8, tech_parts: 6 }, unlocks: ['heavy_armor'], hull: { armor: 0.05 }, desc: 'Build Reactive Armor plates; +5% armor.' }),
  N({ id: 'ion_drive', name: 'Ion Drive', branch: 'hull', tier: 3, requires: ['reactive_armor'], cost: { titanium_alloy: 10, cryo_core: 2, tech_parts: 6 }, unlocks: ['ion_engine'], desc: 'Build the Ion Drive engine (+11 thrust).' }),
  N({ id: 'overdrive', name: 'Overdrive Transmission', branch: 'hull', tier: 4, requires: ['ion_drive'], cost: { titanium_alloy: 12, circuit: 10, tech_parts: 8 }, hull: { speed: 1.15 }, desc: 'The fortress drives 15% faster.' }),
  N({ id: 'dozer_ram', name: 'Dozer Ram', branch: 'hull', tier: 5, requires: ['overdrive'], cost: { titanium_alloy: 20, iron_plate: 30, tech_parts: 10 }, hull: { crush: 3 }, desc: 'Running over enemies deals 3x damage.' }),

  N({ id: 'drill_mk2', name: 'Drill Rig Mk2', branch: 'industry', tier: 1, requires: [], cost: { iron_plate: 20, circuit: 4, tech_parts: 2 }, unlocks: ['drill_mk2'], desc: 'Build the Mk2 drill: harvest titanium, uranium, cryo crystal and sulfur.' }),
  N({ id: 'fission', name: 'Fission Core', branch: 'industry', tier: 2, requires: ['drill_mk2'], cost: { uranium_rod: 2, titanium_alloy: 6, tech_parts: 5 }, unlocks: ['fission'], desc: 'Build Fission Cores (+15 power).' }),
  N({ id: 'drill_mk3', name: 'Drill Rig Mk3', branch: 'industry', tier: 3, requires: ['fission'], cost: { titanium_alloy: 12, cryo_core: 2, tech_parts: 8 }, unlocks: ['drill_mk3'], desc: 'Build the Mk3 drill: harvest Xenite.' }),
  N({ id: 'salvage_ops', name: 'Salvage Ops', branch: 'industry', tier: 4, requires: ['drill_mk3'], cost: { titanium_alloy: 10, circuit: 12, tech_parts: 10 }, hull: { loot: 1.25, harvest: 1.2 }, desc: '+25% loot and +20% harvest yield.' }),
  N({ id: 'deep_holds', name: 'Deep Holds', branch: 'industry', tier: 5, requires: ['salvage_ops'], cost: { xeno_alloy: 4, titanium_alloy: 16, tech_parts: 12 }, hull: { cargo: 24 }, desc: '+24 cargo slots.' }),
];

export const TECH_BY_ID = new Map(TECH.map((t) => [t.id, t]));

export function freeTech(): Set<string> {
  return new Set(TECH.filter((t) => t.free).map((t) => t.id));
}

export function canResearch(tech: Set<string>, node: TechNode): boolean {
  return !tech.has(node.id) && node.requires.every((r) => tech.has(r));
}

export function moduleUnlocked(tech: Set<string>, key: string): boolean {
  const req = MODULES[key]?.tech;
  return !req || tech.has(req);
}

export function weaponCraftable(tech: Set<string>, key: string): boolean {
  const d = WEAPONS[key];
  if (!d || d.exclusive) return false;
  return !d.tech || tech.has(d.tech);
}

/** Cost after research discounts. Always at least 1 of each part. */
export function researchCost(node: TechNode, discount: number): Cost {
  const out: Cost = {};
  const f = 1 - Math.min(0.5, Math.max(0, discount));
  for (const id in node.cost) out[id] = Math.max(1, Math.ceil(node.cost[id] * f));
  return out;
}

export function weaponMods(tech: Set<string>, fam: WeaponFamily): WeaponMods {
  const m = { ...BASE_WEAPON_MODS };
  for (const id of tech) {
    const w = TECH_BY_ID.get(id)?.weapon?.[fam];
    if (!w) continue;
    for (const k of Object.keys(w) as (keyof WeaponMods)[]) {
      if (k === 'pellets' || k === 'pierce' || k === 'crit') m[k] += w[k]!;
      else m[k] *= w[k]!;
    }
  }
  return m;
}

const BASE_HULL: HullMods = { hp: 1, armor: 0, shield: 1, shieldRegen: 1, speed: 1, crush: 1, loot: 1, cargo: 0, harvest: 1 };

export function hullMods(tech: Set<string>): HullMods {
  const m = { ...BASE_HULL };
  for (const id of tech) {
    const h = TECH_BY_ID.get(id)?.hull;
    if (!h) continue;
    for (const k of Object.keys(h) as (keyof HullMods)[]) {
      if (k === 'armor' || k === 'cargo') m[k] += h[k]!;
      else m[k] *= h[k]!;
    }
  }
  return m;
}
