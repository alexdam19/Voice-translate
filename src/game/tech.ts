import { BASE_WEAPON_MODS, WEAPONS, type WeaponFamily, type WeaponMods } from '../shared/weapons';

/**
 * Upgrades earned only by fighting. Every node below is granted automatically as your Commander
 * levels up (see progress.ts): weapon unlocks, whole-family weapon upgrades, hull upgrades and crew
 * upgrades. Deeper tiers arrive at higher levels and are much stronger.
 */

export type TreeKind = 'military' | 'personnel';

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

/** Crew and card effects (summed over earned nodes). */
export interface CrewFx {
  cardPower: number;
  energy: number;
  dmg: number;
  rate: number;
  crit: number;
  range: number;
  recovery: number;
  regen: number;
  hp: number;
  armor: number;
  shield: number;
  power: number;
  xp: number;
  cmdXp: number;
  cargo: number;
  runeTime: number;
  recruitLuck: number;
  draft: number;
  riderSurvive: number;
  injuryResist: number;
  forgeSpeed: number;
  blitz: number;
}

export interface TechNode {
  id: string;
  name: string;
  tree: TreeKind;
  branch: string;
  tier: number;
  requires: string[];
  /** Legacy research cost (only shown as flavour). */
  cost: Record<string, number>;
  desc: string;
  free?: boolean;
  /** Weapon keys this node lets you build. */
  unlocks?: string[];
  weapon?: Partial<Record<WeaponFamily, Partial<WeaponMods>>>;
  hull?: Partial<HullMods>;
  crew?: Partial<CrewFx>;
}

export interface BranchDef {
  key: string;
  tree: TreeKind;
  name: string;
  color: string;
}

export const BRANCHES: BranchDef[] = [
  { key: 'ballistics', tree: 'military', name: 'BALLISTICS', color: '#ffab40' },
  { key: 'artillery', tree: 'military', name: 'ARTILLERY', color: '#ff6e40' },
  { key: 'missiles', tree: 'military', name: 'MISSILES', color: '#ff3d00' },
  { key: 'energy', tree: 'military', name: 'ENERGY', color: '#ea80fc' },
  { key: 'rays', tree: 'military', name: 'RAYS & PLASMA', color: '#69f0ae' },
  { key: 'chemical', tree: 'military', name: 'CHEMICAL', color: '#76ff03' },
  { key: 'arcane', tree: 'military', name: 'ARCANE', color: '#b388ff' },
  { key: 'mythic', tree: 'military', name: 'MYTHIC', color: '#ff4f7b' },
  { key: 'aviation', tree: 'military', name: 'AVIATION', color: '#90caf9' },
  { key: 'defense', tree: 'military', name: 'DEFENSE', color: '#80d8ff' },
  { key: 'hull', tree: 'military', name: 'HULL & DRIVE', color: '#b0bec5' },
  { key: 'industry', tree: 'military', name: 'INDUSTRY', color: '#a5d6a7' },
  { key: 'command', tree: 'personnel', name: 'COMMAND', color: '#ffd740' },
  { key: 'tactics', tree: 'personnel', name: 'TACTICS', color: '#ff7043' },
  { key: 'medical', tree: 'personnel', name: 'MEDICAL', color: '#76ff03' },
  { key: 'engineering', tree: 'personnel', name: 'ENGINEERING', color: '#4dd0e1' },
  { key: 'arcana', tree: 'personnel', name: 'ARCANE STUDIES', color: '#b388ff' },
  { key: 'logistics', tree: 'personnel', name: 'LOGISTICS', color: '#bcaaa4' },
];

const N = (n: Omit<TechNode, 'tree'> & { tree?: TreeKind }): TechNode => ({ tree: 'military', ...n });
const P = (n: Omit<TechNode, 'tree'>): TechNode => ({ ...n, tree: 'personnel' });

export const TECH: TechNode[] = [
  /* ---------------- BALLISTICS ---------------- */
  N({ id: 'autocannon', name: 'Autocannon', branch: 'ballistics', tier: 0, requires: [], cost: {}, free: true, unlocks: ['autocannon'], desc: 'Standard-issue rapid-fire cannon.' }),
  N({ id: 'hardened_rounds', name: 'Hardened Rounds', branch: 'ballistics', tier: 1, requires: ['autocannon'], cost: { iron_plate: 20, tech_parts: 1 }, weapon: { ballistic: { dmg: 1.25 } }, desc: 'Ballistic weapons deal +25% damage.' }),
  N({ id: 'grenades', name: 'Grenade Launcher', branch: 'ballistics', tier: 1, requires: ['autocannon'], cost: { iron_plate: 16, explosive: 4, tech_parts: 1 }, unlocks: ['grenade_launcher'], desc: 'Build Grenade Launchers: lobbed frag grenades.' }),
  N({ id: 'gatling', name: 'Gatling Sponson', branch: 'ballistics', tier: 2, requires: ['hardened_rounds'], cost: { iron_plate: 30, circuit: 6, tech_parts: 3 }, unlocks: ['gatling'], desc: 'Build the Gatling Sponson: short range, absurd rate of fire.' }),
  N({ id: 'scatter', name: 'Scattergun', branch: 'ballistics', tier: 2, requires: ['hardened_rounds'], cost: { iron_plate: 24, scrap: 60, tech_parts: 3 }, unlocks: ['scattergun'], desc: 'Build Scatterguns: buckshot walls with knockback.' }),
  N({ id: 'belt_feed', name: 'Belt Feeders', branch: 'ballistics', tier: 3, requires: ['gatling'], cost: { titanium_alloy: 10, circuit: 8, tech_parts: 5 }, weapon: { ballistic: { rate: 1.3 } }, desc: 'Ballistic weapons fire 30% faster.' }),
  N({ id: 'du_rounds', name: 'Depleted Uranium', branch: 'ballistics', tier: 4, requires: ['belt_feed'], cost: { uranium_rod: 4, titanium_alloy: 10, tech_parts: 8 }, weapon: { ballistic: { dmg: 1.35, pierce: 1 } }, desc: 'Ballistic rounds deal +35% damage and pierce one extra target.' }),
  N({ id: 'smart_munitions', name: 'Smart Munitions', branch: 'ballistics', tier: 5, requires: ['du_rounds'], cost: { circuit: 20, cryo_core: 3, tech_parts: 12 }, weapon: { ballistic: { crit: 0.12, range: 1.2 } }, desc: 'Ballistic weapons +12% critical chance and +20% range.' }),
  N({ id: 'hyper_ballistics', name: 'Hypervelocity Ballistics', branch: 'ballistics', tier: 6, requires: ['smart_munitions'], cost: { xeno_alloy: 6, uranium_rod: 6, tech_parts: 18 }, weapon: { ballistic: { dmg: 1.5, rate: 1.2, speed: 1.4 } }, desc: 'Ballistic weapons deal +50% damage and fire 20% faster.' }),

  /* ---------------- ARTILLERY ---------------- */
  N({ id: 'main_battery', name: '88mm Main Battery', branch: 'artillery', tier: 0, requires: [], cost: {}, free: true, unlocks: ['main_battery'], desc: 'The heavy gun every crawler starts with.' }),
  N({ id: 'heat_shells', name: 'HEAT Shells', branch: 'artillery', tier: 1, requires: ['main_battery'], cost: { explosive: 8, iron_plate: 16, tech_parts: 1 }, weapon: { artillery: { dmg: 1.3, radius: 1.25 } }, desc: 'Artillery deals +30% damage with 25% bigger blasts.' }),
  N({ id: 'mortar', name: 'Mortar Pit', branch: 'artillery', tier: 2, requires: ['heat_shells'], cost: { iron_plate: 30, explosive: 10, tech_parts: 3 }, unlocks: ['mortar'], desc: 'Build Mortar Pits: lobbed shells over obstacles.' }),
  N({ id: 'autoloader', name: 'Autoloader', branch: 'artillery', tier: 3, requires: ['mortar'], cost: { titanium_alloy: 12, circuit: 10, tech_parts: 6 }, weapon: { artillery: { rate: 1.35 } }, desc: 'Artillery reloads 35% faster.' }),
  N({ id: 'bore_120', name: '120mm Bore', branch: 'artillery', tier: 4, requires: ['autoloader'], cost: { titanium_alloy: 20, tech_parts: 9 }, weapon: { artillery: { dmg: 1.45, range: 1.15 } }, desc: 'Artillery deals +45% damage at 15% longer range.' }),
  N({ id: 'howitzer', name: 'Siege Howitzer', branch: 'artillery', tier: 5, requires: ['bore_120'], cost: { titanium_alloy: 24, explosive: 20, tech_parts: 12 }, unlocks: ['howitzer'], desc: 'Build the Siege Howitzer: 40-range cluster shells.' }),
  N({ id: 'rail_cannon', name: 'Rail Cannon', branch: 'artillery', tier: 5, requires: ['bore_120', 'capacitors'], cost: { xeno_alloy: 8, uranium_rod: 6, tech_parts: 14 }, unlocks: ['rail_cannon'], desc: 'Build the Rail Cannon. Also needs Capacitor Banks (Energy).' }),
  N({ id: 'siege_doctrine', name: 'Siege Doctrine', branch: 'artillery', tier: 6, requires: ['howitzer'], cost: { xeno_alloy: 8, explosive: 30, tech_parts: 18 }, weapon: { artillery: { dmg: 1.5, radius: 1.25, range: 1.1 } }, desc: 'Artillery deals +50% damage with 25% bigger blasts and 10% more range.' }),

  /* ---------------- MISSILES ---------------- */
  N({ id: 'missiles', name: 'Missile Pods', branch: 'missiles', tier: 1, requires: [], cost: { circuit: 6, explosive: 6, tech_parts: 2 }, unlocks: ['missile_pod'], desc: 'Build homing Missile Pods.' }),
  N({ id: 'guidance', name: 'Guidance Package', branch: 'missiles', tier: 2, requires: ['missiles'], cost: { circuit: 10, cryo_core: 1, tech_parts: 4 }, weapon: { missile: { turn: 1.8, speed: 1.3, range: 1.15 } }, desc: 'Missiles turn harder, fly 30% faster and reach 15% further.' }),
  N({ id: 'swarm', name: 'Swarm Racks', branch: 'missiles', tier: 3, requires: ['guidance'], cost: { titanium_alloy: 12, explosive: 12, tech_parts: 6 }, weapon: { missile: { pellets: 2 } }, desc: 'Missile weapons fire 2 extra missiles per volley.' }),
  N({ id: 'micro_swarm', name: 'Swarm Hive', branch: 'missiles', tier: 3, requires: ['guidance'], cost: { circuit: 14, explosive: 14, tech_parts: 6 }, unlocks: ['swarm_hive'], desc: 'Build the Swarm Hive: ten micro-missiles per volley.' }),
  N({ id: 'thermobaric', name: 'Thermobaric Warheads', branch: 'missiles', tier: 4, requires: ['swarm'], cost: { sulfur: 20, explosive: 16, tech_parts: 9 }, weapon: { missile: { dmg: 1.4, radius: 1.4 } }, desc: 'Missiles deal +40% damage with 40% bigger blasts.' }),
  N({ id: 'hellfire_protocol', name: 'Hellfire Protocol', branch: 'missiles', tier: 5, requires: ['thermobaric'], cost: { uranium_rod: 6, explosive: 24, tech_parts: 13 }, weapon: { missile: { dmg: 1.35, rate: 1.25 } }, desc: 'Missiles deal +35% damage and reload 25% faster.' }),

  /* ---------------- ENERGY ---------------- */
  N({ id: 'laser', name: 'Laser Turret', branch: 'energy', tier: 1, requires: [], cost: { circuit: 8, cryo_core: 1, tech_parts: 2 }, unlocks: ['laser'], desc: 'Build Laser Turrets: long range, instant hit.' }),
  N({ id: 'lenses', name: 'Focusing Lenses', branch: 'energy', tier: 2, requires: ['laser'], cost: { circuit: 12, cryo_core: 2, tech_parts: 4 }, weapon: { energy: { dmg: 1.25, range: 1.15 } }, desc: 'Energy weapons deal +25% damage at 15% longer range.' }),
  N({ id: 'tesla', name: 'Tesla Coil', branch: 'energy', tier: 3, requires: ['lenses'], cost: { copper_wire: 40, cryo_core: 3, tech_parts: 6 }, unlocks: ['tesla'], desc: 'Build Tesla Coils: chain lightning.' }),
  N({ id: 'capacitors', name: 'Capacitor Banks', branch: 'energy', tier: 4, requires: ['tesla'], cost: { uranium_rod: 2, circuit: 16, tech_parts: 8 }, weapon: { energy: { power: 0.6, rate: 1.25 } }, desc: 'Energy weapons use 40% less power and fire 25% faster.' }),
  N({ id: 'weather_control', name: 'Weather Control', branch: 'energy', tier: 5, requires: ['capacitors'], cost: { copper_wire: 60, cryo_core: 6, tech_parts: 13 }, unlocks: ['storm_spire'], desc: 'Build the Storm Spire: lightning straight from the sky.' }),
  N({ id: 'fusion_optics', name: 'Fusion Optics', branch: 'energy', tier: 6, requires: ['weather_control'], cost: { xeno_alloy: 6, cryo_core: 8, tech_parts: 18 }, weapon: { energy: { dmg: 1.5, range: 1.2 } }, desc: 'Energy weapons deal +50% damage at 20% longer range.' }),

  /* ---------------- RAYS & PLASMA ---------------- */
  N({ id: 'rayguns', name: 'Ray Guns', branch: 'rays', tier: 1, requires: [], cost: { circuit: 8, copper_wire: 12, tech_parts: 2 }, unlocks: ['raygun'], desc: 'Build Ray Guns: death-rays that ramp up on a target.' }),
  N({ id: 'cryo_weapons', name: 'Cryo Weapons', branch: 'rays', tier: 2, requires: ['rayguns'], cost: { cryo_core: 4, circuit: 8, tech_parts: 4 }, unlocks: ['cryo_blaster'], desc: 'Build Cryo Blasters: slow and freeze targets.' }),
  N({ id: 'plasma', name: 'Plasma Launcher', branch: 'rays', tier: 3, requires: ['cryo_weapons'], cost: { uranium_rod: 3, cryo_core: 3, tech_parts: 6 }, unlocks: ['plasma_launcher'], desc: 'Build Plasma Launchers: splashing balls of plasma.' }),
  N({ id: 'plasma_containment', name: 'Plasma Containment', branch: 'rays', tier: 4, requires: ['plasma'], cost: { uranium_rod: 5, titanium_alloy: 12, tech_parts: 9 }, weapon: { energy: { dmg: 1.3, radius: 1.3 } }, desc: 'Energy weapons deal +30% damage with 30% bigger blasts.' }),
  N({ id: 'ray_rail', name: 'Ray-Rail Twin Cannon', branch: 'rays', tier: 5, requires: ['plasma_containment', 'capacitors'], cost: { xeno_alloy: 8, uranium_rod: 6, tech_parts: 14 }, unlocks: ['ray_rail'], desc: 'Build the Ray-Rail: a rail cannon and a death-ray on one turret.' }),
  N({ id: 'antimatter', name: 'Antimatter Cells', branch: 'rays', tier: 6, requires: ['ray_rail'], cost: { xeno_alloy: 10, mythic_essence: 2, tech_parts: 18 }, weapon: { energy: { rate: 1.35, power: 0.7 } }, desc: 'Energy weapons fire 35% faster and draw 30% less power.' }),

  /* ---------------- CHEMICAL ---------------- */
  N({ id: 'flamers', name: 'Flamethrowers', branch: 'chemical', tier: 1, requires: [], cost: { sulfur: 10, iron_plate: 12, tech_parts: 2 }, unlocks: ['flamethrower'], desc: 'Build Flamethrowers: pierce crowds, set them alight.' }),
  N({ id: 'acid_launcher', name: 'Acid Launcher', branch: 'chemical', tier: 2, requires: ['flamers'], cost: { sulfur: 16, biomass: 10, tech_parts: 4 }, unlocks: ['acid_launcher'], desc: 'Build Acid Launchers: caustic pools that eat armor.' }),
  N({ id: 'volatile_mixes', name: 'Volatile Mixes', branch: 'chemical', tier: 3, requires: ['acid_launcher'], cost: { sulfur: 24, explosive: 10, tech_parts: 6 }, weapon: { chemical: { dmg: 1.3, radius: 1.25 } }, desc: 'Chemical weapons deal +30% damage with 25% bigger splashes.' }),
  N({ id: 'kraken', name: 'Kraken Launcher', branch: 'chemical', tier: 4, requires: ['volatile_mixes'], cost: { biomass: 30, xenite: 4, tech_parts: 9 }, unlocks: ['kraken'], desc: 'Build the Kraken Launcher: ink bombs that root enemies with tentacles.' }),
  N({ id: 'dragonfire', name: "Dragon's Breath", branch: 'chemical', tier: 5, requires: ['kraken', 'arcane_studies'], cost: { sulfur: 40, mythic_essence: 1, tech_parts: 13 }, unlocks: ['dragons_breath'], desc: "Build Dragon's Breath: an elemental flamethrower. Needs Arcane Studies." }),
  N({ id: 'plague_engine', name: 'Plague Engine', branch: 'chemical', tier: 6, requires: ['dragonfire'], cost: { xenite: 12, sulfur: 40, tech_parts: 18 }, weapon: { chemical: { dmg: 1.5, rate: 1.2 } }, desc: 'Chemical weapons deal +50% damage and fire 20% faster.' }),

  /* ---------------- ARCANE ---------------- */
  N({ id: 'soulcraft', name: 'Soulcraft', branch: 'arcane', tier: 4, requires: ['arcane_studies'], cost: { xenite: 8, mythic_essence: 1, tech_parts: 8 }, unlocks: ['soul_reaper'], desc: 'Build the Soul Reaper: homing skulls that drain life.' }),
  N({ id: 'arcane_focus', name: 'Arcane Focus', branch: 'arcane', tier: 4, requires: ['arcane_studies'], cost: { xenite: 8, cryo_core: 4, tech_parts: 8 }, unlocks: ['arcane_orb'], weapon: { arcane: { dmg: 1.2 } }, desc: 'Build the Arcane Orb Projector. Arcane weapons +20% damage.' }),
  N({ id: 'chronomancy', name: 'Chronomancy', branch: 'arcane', tier: 5, requires: ['arcane_focus'], cost: { cryo_core: 8, mythic_essence: 2, tech_parts: 12 }, unlocks: ['chrono_cannon'], desc: 'Build the Chrono Cannon: fields of slowed time.' }),
  N({ id: 'gravitics', name: 'Gravitics', branch: 'arcane', tier: 5, requires: ['arcane_focus'], cost: { xeno_alloy: 6, mythic_essence: 2, tech_parts: 12 }, unlocks: ['gravity_cannon'], desc: 'Build the Graviton Cannon: collapsing stars and gravity wells.' }),
  N({ id: 'phoenix', name: 'Phoenix Rite', branch: 'arcane', tier: 6, requires: ['chronomancy'], cost: { xeno_alloy: 8, mythic_essence: 4, tech_parts: 18 }, unlocks: ['phoenix_launcher'], weapon: { arcane: { dmg: 1.25, rate: 1.15 } }, desc: 'Build the Phoenix Launcher. Arcane weapons +25% damage, +15% fire rate.' }),

  /* ---------------- MYTHIC ---------------- */
  N({ id: 'rune_binding', name: 'Rune Binding', branch: 'mythic', tier: 4, requires: ['arcane_studies'], cost: { mythic_essence: 2, xenite: 8, tech_parts: 9 }, weapon: { arcane: { dmg: 1.25, range: 1.1 } }, desc: 'Arcane weapons deal +25% damage at 10% longer range.' }),
  N({ id: 'void_rift', name: 'Void Rift', branch: 'mythic', tier: 6, requires: ['meteor_storm'], cost: { mythic_essence: 6, xeno_alloy: 10, tech_parts: 20 }, unlocks: ['void_lance'], desc: 'Build the Void Lance: erases anything under 20% health.' }),
  N({ id: 'mythic_forging', name: 'Mythic Forging', branch: 'mythic', tier: 6, requires: ['legendary_forging', 'rune_binding'], cost: { mythic_essence: 5, xeno_alloy: 8, tech_parts: 20 }, desc: 'The Forge can raise weapons to 6★ Mythic.' }),

  /* ---------------- AVIATION ---------------- */
  N({ id: 'hornets', name: 'Hornet Launcher', branch: 'aviation', tier: 2, requires: ['salvo'], cost: { titanium_alloy: 8, circuit: 10, tech_parts: 4 }, unlocks: ['hornet_nest'], desc: 'Build the Hornet Launcher turret: it launches mini fighter jets.' }),

  /* ---------------- DEFENSE ---------------- */
  N({ id: 'flak', name: 'Flak Battery', branch: 'defense', tier: 1, requires: [], cost: { iron_plate: 20, circuit: 4, tech_parts: 1 }, unlocks: ['flak'], desc: 'Build Flak Batteries: bursting shells, great against swarms and flyers.' }),
  N({ id: 'prox_fuze', name: 'Proximity Fuzes', branch: 'defense', tier: 2, requires: ['flak'], cost: { circuit: 8, explosive: 6, tech_parts: 3 }, weapon: { defense: { radius: 1.4, dmg: 1.2 } }, desc: 'Defense weapons deal +20% damage with 40% bigger bursts.' }),
  N({ id: 'point_defense', name: 'Point Defense', branch: 'defense', tier: 3, requires: ['prox_fuze'], cost: { circuit: 12, titanium_alloy: 6, tech_parts: 5 }, unlocks: ['point_defense'], weapon: { defense: { rate: 1.2 } }, desc: 'Build Point Defense turrets that shoot down incoming shells.' }),
  N({ id: 'sonics', name: 'Sonic Weapons', branch: 'defense', tier: 3, requires: ['prox_fuze'], cost: { copper_wire: 30, circuit: 10, tech_parts: 5 }, unlocks: ['sonic_cannon'], desc: 'Build the Sonic Cannon: a stunning cone of noise.' }),
  N({ id: 'harmonics', name: 'Shield Harmonics', branch: 'defense', tier: 5, requires: ['shield_gen'], cost: { cryo_core: 4, uranium_rod: 4, tech_parts: 11 }, hull: { shield: 1.6, shieldRegen: 1.5 }, desc: 'Shields hold 60% more and recharge 50% faster.' }),
  N({ id: 'fortress_protocol', name: 'Fortress Protocol', branch: 'defense', tier: 6, requires: ['harmonics'], cost: { xeno_alloy: 8, titanium_alloy: 30, tech_parts: 18 }, hull: { hp: 1.3, armor: 0.05, shield: 1.5 }, desc: 'Hull +30%, armor +5%, shields +50%.' }),

  /* ---------------- HULL & DRIVE ---------------- */
  N({ id: 'reinforced', name: 'Reinforced Hull', branch: 'hull', tier: 1, requires: [], cost: { iron_plate: 30, tech_parts: 1 }, hull: { hp: 1.2 }, desc: 'Fortress hull +20%.' }),
  N({ id: 'reactive_armor', name: 'Reactive Armor', branch: 'hull', tier: 2, requires: ['reinforced'], cost: { titanium_alloy: 16, explosive: 8, tech_parts: 4 }, hull: { armor: 0.05 }, desc: '+5% armor.' }),
  N({ id: 'overdrive', name: 'Overdrive Transmission', branch: 'hull', tier: 4, requires: ['ion_drive'], cost: { titanium_alloy: 12, circuit: 10, tech_parts: 7 }, hull: { speed: 1.15 }, desc: 'The fortress drives 15% faster.' }),
  N({ id: 'dozer_ram', name: 'Dozer Ram', branch: 'hull', tier: 5, requires: ['overdrive'], cost: { titanium_alloy: 20, iron_plate: 30, tech_parts: 10 }, hull: { crush: 3 }, desc: 'A dozer blade on the bow: creatures you run into are thrown clear with 3x the force, and far fewer get a grip to climb aboard.' }),
  N({ id: 'adamantine', name: 'Adamantine Plating', branch: 'hull', tier: 6, requires: ['dozer_ram'], cost: { xeno_alloy: 12, titanium_alloy: 30, tech_parts: 18 }, hull: { hp: 1.4, armor: 0.06, speed: 1.1 }, desc: 'Hull +40%, armor +6%, speed +10%.' }),

  /* ---------------- INDUSTRY ---------------- */
  N({ id: 'forge_mastery', name: 'Forge Mastery', branch: 'industry', tier: 3, requires: ['forging'], cost: { titanium_alloy: 12, circuit: 10, tech_parts: 6 }, desc: 'Your Forge can raise weapons to 4★ Epic.' }),
  N({ id: 'salvage_ops', name: 'Salvage Ops', branch: 'industry', tier: 4, requires: ['drill_mk3'], cost: { titanium_alloy: 10, circuit: 12, tech_parts: 8 }, hull: { loot: 1.25, harvest: 1.2 }, desc: '+25% loot and +20% harvest yield.' }),
  N({ id: 'legendary_forging', name: 'Legendary Forging', branch: 'industry', tier: 5, requires: ['forge_mastery'], cost: { xeno_alloy: 4, uranium_rod: 6, tech_parts: 13 }, desc: 'The Forge can raise weapons to 5★ Legendary.' }),
  N({ id: 'deep_holds', name: 'Deep Holds', branch: 'industry', tier: 5, requires: ['salvage_ops'], cost: { xeno_alloy: 4, titanium_alloy: 16, tech_parts: 11 }, hull: { cargo: 24 }, desc: '+24 cargo slots.' }),
  N({ id: 'auto_foundries', name: 'Automated Foundries', branch: 'industry', tier: 6, requires: ['deep_holds'], cost: { xeno_alloy: 8, circuit: 30, tech_parts: 18 }, hull: { loot: 1.4, harvest: 1.3 }, desc: '+40% loot and +30% harvest yield.' }),

  /* ================= PERSONNEL ================= */
  P({ id: 'field_commission', name: 'Field Commissions', branch: 'command', tier: 2, requires: ['officer_school'], cost: { rations: 16, circuit: 6, tech_parts: 2 }, crew: { cardPower: 0.1 }, desc: 'Cards are 10% stronger.' }),
  P({ id: 'war_council', name: 'War Council', branch: 'command', tier: 4, requires: ['chain_of_command'], cost: { circuit: 16, tech_parts: 7 }, crew: { energy: 0.1 }, desc: 'Card energy recharges 10% faster.' }),
  P({ id: 'high_command', name: 'High Command', branch: 'command', tier: 5, requires: ['war_council'], cost: { circuit: 20, cryo_core: 4, tech_parts: 11 }, crew: { cardPower: 0.2 }, desc: 'Cards are 20% stronger.' }),
  P({ id: 'legendary_leadership', name: 'Legendary Leadership', branch: 'command', tier: 6, requires: ['high_command'], cost: { mythic_essence: 2, circuit: 24, tech_parts: 16 }, crew: { draft: 1, cardPower: 0.15 }, desc: 'Crew level-ups offer 4 perks instead of 3. Cards +15%.' }),

  P({ id: 'drill_sergeants', name: 'Drill Sergeants', branch: 'tactics', tier: 1, requires: [], cost: { rations: 10, scrap: 50 }, crew: { dmg: 0.06 }, desc: '+6% weapon damage.' }),
  P({ id: 'fire_control', name: 'Fire Control', branch: 'tactics', tier: 2, requires: ['drill_sergeants'], cost: { circuit: 8, tech_parts: 2 }, crew: { rate: 0.06 }, desc: '+6% fire rate.' }),
  P({ id: 'marksmanship', name: 'Marksmanship', branch: 'tactics', tier: 3, requires: ['fire_control'], cost: { circuit: 10, tech_parts: 4 }, crew: { crit: 0.06 }, desc: '+6% critical hit chance.' }),
  P({ id: 'overwatch', name: 'Overwatch', branch: 'tactics', tier: 4, requires: ['marksmanship'], cost: { circuit: 14, cryo_core: 2, tech_parts: 7 }, crew: { range: 0.1 }, desc: '+10% weapon range.' }),
  P({ id: 'combined_arms', name: 'Combined Arms', branch: 'tactics', tier: 5, requires: ['overwatch'], cost: { titanium_alloy: 16, tech_parts: 11 }, crew: { dmg: 0.12, rate: 0.08 }, desc: '+12% weapon damage and +8% fire rate.' }),
  P({ id: 'blitz_doctrine', name: 'Blitz Doctrine', branch: 'tactics', tier: 6, requires: ['combined_arms'], cost: { mythic_essence: 2, titanium_alloy: 20, tech_parts: 16 }, crew: { blitz: 1 }, desc: 'After playing any card: +30% damage and fire rate for 5s.' }),

  P({ id: 'field_medicine', name: 'Field Medicine', branch: 'medical', tier: 1, requires: [], cost: { rations: 10, biomass: 10 }, crew: { recovery: 0.5 }, desc: 'Injured crew recover 50% faster.' }),
  P({ id: 'combat_stims', name: 'Combat Stims', branch: 'medical', tier: 2, requires: ['field_medicine'], cost: { biomass: 16, circuit: 4, tech_parts: 2 }, crew: { regen: 1.5 }, desc: '+1.5 hull repair per second.' }),
  P({ id: 'trauma_ward', name: 'Trauma Ward', branch: 'medical', tier: 3, requires: ['combat_stims'], cost: { biomass: 20, circuit: 8, tech_parts: 4 }, crew: { injuryResist: 0.5 }, desc: 'Crew are injured half as often.' }),
  P({ id: 'nanite_medicine', name: 'Nanite Medicine', branch: 'medical', tier: 4, requires: ['trauma_ward'], cost: { circuit: 16, uranium_rod: 2, tech_parts: 7 }, crew: { regen: 3 }, desc: '+3 hull repair per second.' }),
  P({ id: 'triage_protocols', name: 'Triage Protocols', branch: 'medical', tier: 5, requires: ['nanite_medicine'], cost: { circuit: 20, cryo_core: 4, tech_parts: 11 }, crew: { hp: 0.1, recovery: 1 }, desc: '+10% hull; injured crew recover twice as fast.' }),
  P({ id: 'resurrection', name: 'Resurrection Pods', branch: 'medical', tier: 6, requires: ['triage_protocols'], cost: { mythic_essence: 2, xeno_alloy: 6, tech_parts: 16 }, crew: { riderSurvive: 1, regen: 3 }, desc: 'Outrider crew always survive its destruction. +3 hull repair per second.' }),

  P({ id: 'overclocking', name: 'Overclocking', branch: 'engineering', tier: 1, requires: [], cost: { circuit: 4, copper_wire: 10 }, crew: { power: 0.1 }, desc: '+10% power.' }),
  P({ id: 'damage_control', name: 'Damage Control', branch: 'engineering', tier: 2, requires: ['overclocking'], cost: { iron_plate: 20, tech_parts: 2 }, crew: { regen: 1.5 }, desc: '+1.5 hull repair per second.' }),
  P({ id: 'hardened_crew', name: 'Hardened Crew', branch: 'engineering', tier: 3, requires: ['damage_control'], cost: { titanium_alloy: 10, tech_parts: 4 }, crew: { hp: 0.08, armor: 0.02 }, desc: '+8% hull and +2% armor.' }),
  P({ id: 'shield_techs', name: 'Shield Technicians', branch: 'engineering', tier: 4, requires: ['hardened_crew'], cost: { cryo_core: 4, circuit: 12, tech_parts: 7 }, crew: { shield: 0.2 }, desc: '+20% shields.' }),
  P({ id: 'quick_forge', name: 'Master Smiths', branch: 'engineering', tier: 5, requires: ['shield_techs'], cost: { titanium_alloy: 20, tech_parts: 11 }, crew: { forgeSpeed: 0.5 }, desc: 'Your Forge works 50% faster.' }),
  P({ id: 'master_engineers', name: 'Master Engineers', branch: 'engineering', tier: 6, requires: ['quick_forge'], cost: { xeno_alloy: 6, uranium_rod: 6, tech_parts: 16 }, crew: { power: 0.2, hp: 0.12, shield: 0.2 }, desc: '+20% power, +12% hull, +20% shields.' }),

  P({ id: 'rune_lore', name: 'Rune Lore', branch: 'arcana', tier: 2, requires: [], cost: { xenite: 4, tech_parts: 2 }, crew: { runeTime: 0.5 }, desc: 'Rune buffs last 50% longer.' }),
  P({ id: 'spellwrights', name: 'Spellwrights', branch: 'arcana', tier: 4, requires: ['essence_tap'], cost: { xenite: 10, mythic_essence: 1, tech_parts: 7 }, weapon: { arcane: { dmg: 1.2 }, chemical: { dmg: 1.1 } }, desc: 'Arcane weapons +20% damage, chemical weapons +10%.' }),
  P({ id: 'ley_lines', name: 'Ley Lines', branch: 'arcana', tier: 5, requires: ['spellwrights'], cost: { mythic_essence: 2, cryo_core: 4, tech_parts: 11 }, crew: { energy: 0.1 }, desc: 'Card energy recharges 10% faster.' }),
  P({ id: 'archmage', name: 'Archmage', branch: 'arcana', tier: 6, requires: ['ley_lines'], cost: { mythic_essence: 4, xeno_alloy: 6, tech_parts: 16 }, crew: { cardPower: 0.2, energy: 0.1 }, weapon: { arcane: { rate: 1.2 } }, desc: 'Cards +20%, energy regen +10%, arcane fire rate +20%.' }),

  P({ id: 'quartermasters', name: 'Quartermasters', branch: 'logistics', tier: 1, requires: [], cost: { scrap: 60, iron_plate: 10 }, crew: { cargo: 12 }, desc: '+12 cargo slots.' }),
  P({ id: 'recruiters', name: 'Recruiters', branch: 'logistics', tier: 2, requires: ['quartermasters'], cost: { rations: 20, scrap: 80, tech_parts: 2 }, crew: { recruitLuck: 0.6 }, desc: 'Recruits on the hiring board roll better rarities.' }),
  P({ id: 'fast_learners', name: 'Academy', branch: 'logistics', tier: 3, requires: ['recruiters'], cost: { circuit: 10, rations: 20, tech_parts: 4 }, crew: { xp: 0.25 }, desc: 'All crew earn 25% more experience.' }),
  P({ id: 'flight_crews', name: 'Flight Crews', branch: 'logistics', tier: 4, requires: ['fast_learners'], cost: { circuit: 14, titanium_alloy: 8, tech_parts: 7 }, crew: { energy: 0.1 }, desc: 'Card energy recharges 10% faster.' }),
  P({ id: 'ultimate_doctrine', name: 'Ultimate Doctrine', branch: 'logistics', tier: 5, requires: ['flight_crews'], cost: { uranium_rod: 4, circuit: 20, tech_parts: 11 }, crew: { energy: 0.15, cardPower: 0.1 }, desc: 'Card energy +15% regen, cards +10% stronger.' }),
  P({ id: 'grand_strategy', name: 'Grand Strategy', branch: 'logistics', tier: 6, requires: ['ultimate_doctrine'], cost: { mythic_essence: 2, circuit: 30, tech_parts: 16 }, crew: { cmdXp: 0.25, xp: 0.25 }, desc: 'You and your crew earn 25% more experience.' }),
];

export const TECH_BY_ID = new Map(TECH.map((t) => [t.id, t]));
// Nodes whose parents became buildings or cards keep their place by tier on the Level Road.
for (const t of TECH) t.requires = t.requires.filter((r) => TECH_BY_ID.has(r));

export function freeTech(): Set<string> {
  return new Set(TECH.filter((t) => t.free).map((t) => t.id));
}

/** The node that unlocks a weapon key, if any. */
export function unlockNode(key: string): TechNode | undefined {
  return TECH.find((t) => t.unlocks?.includes(key));
}

export function weaponCraftable(tech: Set<string>, key: string): boolean {
  const d = WEAPONS[key];
  if (!d || d.exclusive) return false;
  return !d.tech || tech.has(d.tech);
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

export function emptyCrewFx(): CrewFx {
  return {
    cardPower: 0, energy: 0, dmg: 0, rate: 0, crit: 0, range: 0, recovery: 0, regen: 0, hp: 0, armor: 0, shield: 0, power: 0,
    xp: 0, cmdXp: 0, cargo: 0, runeTime: 0, recruitLuck: 0, draft: 0, riderSurvive: 0, injuryResist: 0, forgeSpeed: 0, blitz: 0,
  };
}

export function crewFx(tech: Set<string>): CrewFx {
  const m = emptyCrewFx();
  for (const id of tech) {
    const c = TECH_BY_ID.get(id)?.crew;
    if (!c) continue;
    for (const k of Object.keys(c) as (keyof CrewFx)[]) if (k in m) m[k] += c[k]!;
  }
  return m;
}

/** Highest star level the Forge may reach (the Forge building's level also caps it). */
export function forgeCap(tech: Set<string>): number {
  if (tech.has('mythic_forging')) return 6;
  if (tech.has('legendary_forging')) return 5;
  if (tech.has('forge_mastery')) return 4;
  return 3;
}
