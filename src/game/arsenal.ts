import type { Cost } from '../shared/inventory';
import type { Rarity } from '../shared/rarity';
import { WEAPONS, type WeaponItem } from '../shared/weapons';
import { forgeCap } from './tech';

/**
 * Arsenal abilities that come from deck modules rather than crew:
 *  - ACTIVES (keys 1-4) from modules like the Jet Hangar or Salvo Rack, each with its own cooldown.
 *  - ULTIMATES (key R) from one ultimate module (Nuclear Silo, Dragon Roost...), charged by time and damage.
 * Numbers in {braces} scale with the module's level.
 */

export interface ActiveDef {
  key: string;
  name: string;
  desc: string;
  cd: number;
  target: 'self' | 'point';
  range?: number;
  color: string;
  module: string;
}

export const ACTIVES: Record<string, ActiveDef> = {
  salvo: { key: 'salvo', name: 'Rocket Salvo', desc: '12 rockets slam the area under the cursor for {45} damage each.', cd: 16, target: 'point', range: 32, color: '#ff9100', module: 'salvo_rack' },
  smoke: { key: 'smoke', name: 'Smoke Screen', desc: 'Incoming damage is halved for {5s} and enemies lose track of you.', cd: 24, target: 'self', color: '#b0bec5', module: 'smoke_launcher' },
  drones: { key: 'drones', name: 'Drone Swarm', desc: 'Launch {4} laser drones that hunt enemies for 18s.', cd: 30, target: 'self', color: '#80d8ff', module: 'drone_bay' },
  mines: { key: 'mines', name: 'Minefield', desc: 'Scatter {8} proximity mines around the fortress ({120} damage each).', cd: 24, target: 'self', color: '#ffd740', module: 'mine_layer' },
  jets: { key: 'jets', name: 'Scramble Fighters', desc: '{2} fighter jets strafe and bomb around the cursor for 14s.', cd: 32, target: 'point', range: 45, color: '#90caf9', module: 'jet_hangar' },
  blink: { key: 'blink', name: 'Blink', desc: 'Teleport the fortress to the cursor (up to {24} units) and stun enemies where you land.', cd: 22, target: 'point', range: 24, color: '#18ffff', module: 'teleporter' },
  dome: { key: 'dome', name: 'Aegis Dome', desc: 'An energy dome blocks 90% of incoming damage for {4s}.', cd: 38, target: 'self', color: '#69f0ae', module: 'dome_projector' },
  airstrike: { key: 'airstrike', name: 'Carpet Bomb', desc: 'A bomber drops {14} bombs along a line toward the cursor ({90} each).', cd: 36, target: 'point', range: 36, color: '#ff6e40', module: 'airstrike' },
};

export interface UltDef {
  key: string;
  name: string;
  desc: string;
  /** Seconds to charge from time alone (damage dealt charges it faster). */
  charge: number;
  target: 'self' | 'point';
  range?: number;
  color: string;
  module: string;
}

export const ULTIMATES: Record<string, UltDef> = {
  nuke: { key: 'nuke', name: 'Nuclear Launch', desc: 'Sirens wail for 3s, then a warhead hits the cursor: {2500} damage in a huge radius and a radiation zone that lingers.', charge: 150, target: 'point', range: 60, color: '#ffea00', module: 'nuke_silo' },
  mech: { key: 'mech', name: 'Mech Drop', desc: 'A battle mech with {3000} hull drops at the cursor and fights for 30s with a cannon and missile racks.', charge: 120, target: 'point', range: 25, color: '#ffab40', module: 'mech_bay' },
  orbital_laser: { key: 'orbital_laser', name: 'Orbital Laser', desc: 'A laser from orbit follows your cursor for 7s, burning {350} damage per second.', charge: 130, target: 'point', range: 70, color: '#ff1744', module: 'orbital' },
  meteors: { key: 'meteors', name: 'Meteor Storm', desc: '{20} meteors fall around the cursor over 4s ({240} damage each) and leave the ground burning.', charge: 140, target: 'point', range: 45, color: '#ff9100', module: 'obelisk' },
  timestop: { key: 'timestop', name: 'Time Stop', desc: 'Every enemy within 45 units freezes in time for {6s}. Enemy shells hang in the air. Your guns fire 50% faster.', charge: 150, target: 'self', color: '#18ffff', module: 'chrono_engine' },
  dragon: { key: 'dragon', name: 'Summon Dragon', desc: 'A dragon answers the call for 25s, breathing fire for about {400} damage per second.', charge: 170, target: 'point', range: 30, color: '#ff3d00', module: 'dragon_roost' },
  cataclysm: { key: 'cataclysm', name: 'Cataclysm', desc: 'For 10s, lightning strikes enemies around you: {200} damage per bolt, 6 bolts per second, with stuns.', charge: 170, target: 'self', color: '#82b1ff', module: 'storm_engine' },
};

export const activeForModule = (key: string): ActiveDef | undefined => Object.values(ACTIVES).find((a) => a.module === key);
export const ultForModule = (key: string): UltDef | undefined => Object.values(ULTIMATES).find((a) => a.module === key);

/* ---------------------------------------------------------------------- */
/* Forge: raising weapons to more stars                                    */
/* ---------------------------------------------------------------------- */

/** Forge time (seconds) to reach a star level, indexed by the new rarity (1 = 2★ ... 5 = 6★). */
export const STAR_TIME = [0, 20, 45, 90, 180, 360];

const STAR_COST: Cost[] = [
  {},
  { scrap: 40, iron_plate: 8 },
  { titanium_alloy: 6, circuit: 6, tech_parts: 2 },
  { titanium_alloy: 12, uranium_rod: 3, tech_parts: 5 },
  { xeno_alloy: 4, cryo_core: 4, tech_parts: 10 },
  { xeno_alloy: 10, mythic_essence: 3, tech_parts: 20 },
];

/** Cost to forge a weapon up to rarity `to`. Heavy weapons cost more. */
export function starCost(w: WeaponItem, to: number): Cost {
  const base = STAR_COST[to] ?? {};
  const size = WEAPONS[w.key]?.size;
  const f = size === 'heavy' ? 1.5 : size === 'medium' ? 1.2 : 1;
  const out: Cost = {};
  for (const [k, n] of Object.entries(base)) out[k] = k === 'mythic_essence' ? n : Math.ceil(n * f);
  return out;
}

/** Why a weapon can't be forged to the next star, or null if it can. */
export function starBlock(w: WeaponItem, tech: Set<string>, hasForge: boolean): string | null {
  if (w.rarity >= 5) return 'Already 6★ Mythic: as strong as it gets.';
  if (!hasForge) return 'Build a Weapon Forge on your deck (research Weapon Forge in INDUSTRY).';
  const next = w.rarity + 2;
  const cap = forgeCap(tech);
  if (next > cap) {
    const need = next === 4 ? 'Forge Mastery (INDUSTRY III)' : next === 5 ? 'Legendary Forging (INDUSTRY V)' : 'Mythic Forging (MYTHIC VI)';
    return `Research ${need} to forge ${next}★.`;
  }
  return null;
}

export const nextRarity = (w: WeaponItem): Rarity => Math.min(5, w.rarity + 1) as Rarity;

/** Scrap value of a weapon: better weapons give back more, including essence for 5★+. */
export function scrapValue(rarity: number): Record<string, number> {
  const out: Record<string, number> = { scrap: 12 * (rarity + 1) * (rarity + 1) };
  if (rarity >= 2) out.tech_parts = rarity - 1;
  if (rarity >= 4) out.mythic_essence = rarity - 3;
  return out;
}
