import type { Game } from '../game';
import type { Tank } from '../tank';

/**
 * The engine room. A Titan carries one great power plant, as long as a blue whale and as heavy as a ship, picked
 * from a catalog of very different machines (diesels, gas turbines, a steam colossus, a ramjet, a fusion core...).
 * Each has its own character and perks. The bigger and stronger the engine, the longer it takes to charge up from
 * cold, like a locomotive building pressure. Round it the engineers fit fifteen components in two groups:
 *
 *  ENGINE COMPONENTS
 *  - Engine Block: displacement. More top speed for more fuel, more reactor draw and a slower wind-up.
 *  - Turbochargers: spool the engine up faster, so she gets moving sooner.
 *  - Gearbox: the high gears. Pull at speed and a little more top end.
 *  - Nitro Injectors: overdrive speed and kick, for more fuel.
 *  - Radiators: how long overdrive runs before the engine overheats, and how fast it cools.
 *  - Flywheel: holds the engine's charge when you ease off the lever, and adds pull at speed.
 *  - Fuel Injectors: burn less fuel.
 *  - Exhaust Stacks: a little top speed, better cooling, bigger flames.
 *  - Intercooler: less overdrive heat and a quicker spool.
 *  - Governor: protects the engine: less drive wear, and it relights overdrive sooner after a trip.
 *
 *  RUNNING GEAR (the eight crawler banks and what turns them)
 *  - Final Drives: more pull off the line and a little top speed.
 *  - Bogie Suspension: keeps her fast over rough ground.
 *  - Track Links: crawlers wear slower and shrug off hits.
 *  - Differentials: she turns tighter.
 *  - Track Tensioners: grip in sand, snow and mud.
 *
 * However it's built, a Titan is slow off the mark and then pulls harder the faster she goes.
 */

export type EnginePart =
  | 'block' | 'turbo' | 'gearbox' | 'nitro' | 'radiator' | 'flywheel' | 'injectors' | 'exhaust' | 'intercooler' | 'governor'
  | 'finaldrive' | 'suspension' | 'tracklinks' | 'differential' | 'tensioners';

export type EngineParts = Record<EnginePart, number>;

export const ENGINE_MAX = 8;

export const newEngine = (): EngineParts => ({
  block: 0, turbo: 0, gearbox: 0, nitro: 0, radiator: 0, flywheel: 0, injectors: 0, exhaust: 0, intercooler: 0, governor: 0,
  finaldrive: 0, suspension: 0, tracklinks: 0, differential: 0, tensioners: 0,
});

export interface PartDef {
  key: EnginePart;
  group: 'engine' | 'gear';
  name: string;
  icon: string;
  stat: string;
  what: string;
  per: string;
}

export const ENGINE_PARTS: PartDef[] = [
  { key: 'block', group: 'engine', name: 'Engine Block', icon: '⚙', stat: 'TOP SPEED', what: 'Bigger displacement: more top speed, but more fuel, more reactor power and a slower wind-up.', per: '+12% top speed · +15% fuel · +1 reactor draw' },
  { key: 'turbo', group: 'engine', name: 'Turbochargers', icon: '🌀', stat: 'CHARGE-UP', what: 'Spool the engine up faster: she gets moving off the line sooner.', per: '+30% charge rate · +10% pull off the line' },
  { key: 'gearbox', group: 'engine', name: 'Gearbox', icon: '⛭', stat: 'PULL AT SPEED', what: 'Taller high gears: she pulls harder once she is rolling, and a little more top end.', per: '+15% pull at speed · +3% top speed' },
  { key: 'nitro', group: 'engine', name: 'Nitro Injectors', icon: '🔥', stat: 'OVERDRIVE', what: 'More overdrive speed and a harder kick when you light it, for more fuel. Mk 4 opens one more overdrive stage.', per: '+7% overdrive speed · +20% kick' },
  { key: 'radiator', group: 'engine', name: 'Radiators', icon: '❄', stat: 'OVERDRIVE TIME', what: 'Overdrive runs longer before the engine overheats, it cools faster, and the drive wears less.', per: '+30% overdrive time · +25% cooling' },
  { key: 'flywheel', group: 'engine', name: 'Flywheel', icon: '◎', stat: 'HOLDS CHARGE', what: 'A 90-tonne flywheel stores the engine\'s momentum: the charge bleeds away slower when you ease off, and she pulls harder at speed.', per: '-18% charge loss · +4% pull at speed' },
  { key: 'injectors', group: 'engine', name: 'Fuel Injectors', icon: '💧', stat: 'FUEL ECONOMY', what: 'Finer injectors burn the fuel cleaner: every litre goes further.', per: '-6% fuel burn' },
  { key: 'exhaust', group: 'engine', name: 'Exhaust Stacks', icon: '♨', stat: 'COOLING', what: 'Taller, wider stacks let the engine breathe: a little more top speed, better cooling and bigger flames out of the back.', per: '+2% top speed · +12% cooling' },
  { key: 'intercooler', group: 'engine', name: 'Intercooler', icon: '❆', stat: 'OVERDRIVE HEAT', what: 'Cools the charge air: overdrive heats the engine slower and it charges up a little faster.', per: '-9% overdrive heat · +5% charge rate' },
  { key: 'governor', group: 'engine', name: 'Governor', icon: '⏲', stat: 'ENGINE LIFE', what: 'Redline protection: the drive and the toroids wear slower, and after an overheat trip overdrive relights sooner.', per: '-10% drive wear · relight +4% sooner' },
  { key: 'finaldrive', group: 'gear', name: 'Final Drives', icon: '⚙', stat: 'PULL OFF THE LINE', what: 'Heavier reduction gears in each crawler bank: more pull from a standstill and a little top speed.', per: '+8% pull off the line · +2% top speed' },
  { key: 'suspension', group: 'gear', name: 'Bogie Suspension', icon: '⌇', stat: 'ROUGH GROUND', what: 'Longer-travel bogies keep all eight crawler banks on the ground: faster over rubble, rock and ruins.', per: '+4% grip on rough ground' },
  { key: 'tracklinks', group: 'gear', name: 'Track Links', icon: '⛓', stat: 'CRAWLER LIFE', what: 'Hardened manganese links: the crawlers wear slower and take less damage from hits on the flanks.', per: '-12% crawler wear · -8% crawler damage' },
  { key: 'differential', group: 'gear', name: 'Differentials', icon: '⤾', stat: 'TURNING', what: 'Controlled differentials between the banks: she turns tighter at every speed.', per: '+7% turning' },
  { key: 'tensioners', group: 'gear', name: 'Track Tensioners', icon: '⇔', stat: 'SOFT GROUND', what: 'Hydraulic tensioners and wider grousers: grip in sand, dunes, snow and mud.', per: '+4% grip on soft ground' },
];

/* ------------------------------------------------------------------ */
/* The power plants                                                    */
/* ------------------------------------------------------------------ */

export type EngineKey =
  | 'leviathan' | 'tortoise' | 'orca' | 'mastodon' | 'humpback' | 'megalodon' | 'kraken' | 'cachalot' | 'salamander' | 'hellfire' | 'bluewhale';

export interface EngineDef {
  key: EngineKey;
  name: string;
  kind: string;
  /** Length and height (m): they're drawn to scale beside a 25 m blue whale. */
  len: number;
  tall: number;
  /** Tonnes and megawatts (for the plate on the side). */
  mass: number;
  mw: number;
  /** Top speed multiplier. */
  top: number;
  /** Seconds to charge up from cold to full revs (before turbochargers): the bigger, the longer. */
  charge: number;
  /** Pull off the line and at speed. */
  low: number;
  high: number;
  /** Fuel multiplier. */
  fuel: number;
  /** How many overdrive stages it can run (nitro Mk 4 adds one, up to three). */
  od: number;
  /** Overdrive heat and cooling multipliers. */
  heat: number;
  cool: number;
  /** Reactor power drawn. */
  power: number;
  /** What comes out of the stacks: length at full (m), colours, number of jets. */
  flame: { len: number; outer: string; core: string; jets: number };
  /** Perks, in words (each is real: see the fields below). */
  perks: string[];
  wear?: number;
  decay?: number;
  traction?: number;
  crush?: number;
  regen?: boolean;
  roar?: boolean;
  cruiseEco?: boolean;
  lavaFuel?: boolean;
  afterburn?: boolean;
  unlock: number;
  cc: number;
  cost: Record<string, number>;
  desc: string;
}

export const ENGINES: EngineDef[] = [
  {
    key: 'leviathan', name: 'Leviathan V16', kind: 'Diesel', len: 28, tall: 9, mass: 1900, mw: 24, top: 1, charge: 6, low: 1, high: 1, fuel: 1, od: 2, heat: 1, cool: 1, power: 0,
    flame: { len: 14, outer: '#ff7a1a', core: '#ffd060', jets: 2 }, perks: ['Reliable: -15% drive wear', 'Two overdrive stages'], wear: 0.85,
    unlock: 1, cc: 1, cost: {}, desc: 'The yard\'s workhorse: sixteen cylinders the size of grain silos. Charges up in about six seconds and never lets you down.',
  },
  {
    key: 'tortoise', name: 'Tortoise Crawler Plant', kind: 'Low-gear diesel', len: 24, tall: 10, mass: 3600, mw: 26, top: 0.85, charge: 7, low: 1.4, high: 0.8, fuel: 0.8, od: 1, heat: 0.9, cool: 1.1, power: 0,
    flame: { len: 10, outer: '#c86a2a', core: '#ffb050', jets: 2 }, perks: ['Low gear: +20% grip on bad ground', '+50% crush force', 'One overdrive stage only'], traction: 0.2, crush: 1.5,
    unlock: 2, cc: 1, cost: { scrap: 260, iron_plate: 40, copper_wire: 12 }, desc: 'Geared for the worst ground in the Crater. Slow on the flat, unstoppable in the dunes, and it shoves anything in the way aside.',
  },
  {
    key: 'orca', name: 'Orca Twin-Turbine', kind: 'Gas turbine', len: 22, tall: 7, mass: 900, mw: 32, top: 1.1, charge: 4, low: 0.9, high: 1.15, fuel: 1.35, od: 2, heat: 1.1, cool: 1.1, power: 0,
    flame: { len: 18, outer: '#ff9a3a', core: '#fff2b0', jets: 2 }, perks: ['Fastest charge-up in the catalog (4 s)', '+10% top speed', 'Thirsty: +35% fuel'],
    unlock: 3, cc: 1, cost: { iron_plate: 60, circuit: 14, copper_wire: 30, scrap: 120 }, desc: 'Two aircraft turbines on one shaft. Lights in seconds and screams all the way up; drinks like a fish.',
  },
  {
    key: 'mastodon', name: 'Mastodon Steam Colossus', kind: 'Triple-expansion steam', len: 36, tall: 14, mass: 4200, mw: 38, top: 1.05, charge: 16, low: 1.6, high: 0.95, fuel: 0.7, od: 1, heat: 0.8, cool: 1.3, power: 0,
    flame: { len: 12, outer: '#c8c0b0', core: '#ffd8a0', jets: 3 }, perks: ['Boiler pressure: 16 s to charge, then pulls like a freight locomotive', 'Holds its charge: loses it 3x slower when you ease off', '-30% fuel'], decay: 0.33,
    unlock: 4, cc: 2, cost: { scrap: 500, iron_plate: 120, copper_wire: 24, circuit: 6 }, desc: 'A locomotive boiler the size of a cathedral. It takes an age to raise steam, then it hauls the Titan like a coal train.',
  },
  {
    key: 'humpback', name: 'Humpback Opposed-Piston', kind: 'Opposed-piston diesel', len: 30, tall: 11, mass: 2400, mw: 30, top: 1.08, charge: 8, low: 1.05, high: 1.1, fuel: 0.65, od: 2, heat: 0.9, cool: 1, power: 0,
    flame: { len: 12, outer: '#ff8030', core: '#ffe080', jets: 2 }, perks: ['Cruiser: -35% fuel', 'Cruise economy: -20% more above 80% of top speed'], cruiseEco: true,
    unlock: 5, cc: 2, cost: { iron_plate: 90, circuit: 18, copper_wire: 40, titanium_alloy: 6 }, desc: 'Two crankshafts, pistons meeting in the middle. The long-haul engine: it will cross the Crater on a tank and a half.',
  },
  {
    key: 'megalodon', name: 'Megalodon Diesel-Electric', kind: 'Diesel-electric', len: 32, tall: 10, mass: 2800, mw: 36, top: 0.95, charge: 2.5, low: 1.8, high: 0.85, fuel: 0.85, od: 2, heat: 1, cool: 1.1, power: 3,
    flame: { len: 9, outer: '#40c4ff', core: '#e0f8ff', jets: 2 }, perks: ['Instant torque: full pull from a standstill', 'Regenerative braking: hard braking at speed charges card energy', 'Draws 3 reactor power'], regen: true,
    unlock: 6, cc: 2, cost: { copper_wire: 80, circuit: 30, iron_plate: 60, uranium_rod: 2 }, desc: 'Generators feed traction motors in every crawler bank, like a locomotive. Electric motors pull hardest at zero: she leaps off the line.',
  },
  {
    key: 'kraken', name: 'Kraken W48 Rotary', kind: 'W48 radial', len: 34, tall: 13, mass: 3100, mw: 52, top: 1.3, charge: 11, low: 1, high: 1.3, fuel: 1.6, od: 3, heat: 1.2, cool: 1, power: 1,
    flame: { len: 26, outer: '#ff5a1a', core: '#fff0a0', jets: 4 }, perks: ['All three overdrive stages', '+30% top speed', 'Its roar in overdrive stuns creatures near the hull', '+60% fuel'], roar: true,
    unlock: 7, cc: 3, cost: { titanium_alloy: 30, circuit: 30, iron_plate: 80, tech_parts: 8, explosive: 10 }, desc: 'Forty-eight cylinders in four banks round one crankshaft. Takes eleven seconds to wind up and shakes the whole hull when it does.',
  },
  {
    key: 'cachalot', name: 'Cachalot V32 Twin-Crank', kind: 'Heavy diesel', len: 32, tall: 12, mass: 3000, mw: 42, top: 1.2, charge: 10, low: 1.2, high: 1.2, fuel: 1.25, od: 2, heat: 1, cool: 1.1, power: 1,
    flame: { len: 18, outer: '#ff7020', core: '#ffe070', jets: 3 }, perks: ['Heavy all-rounder: +20% top speed and pull everywhere'],
    unlock: 8, cc: 3, cost: { titanium_alloy: 20, iron_plate: 110, circuit: 24, tech_parts: 5 }, desc: 'Two V16s geared to one output. Heavier and hungrier than the Leviathan, better at everything.',
  },
  {
    key: 'salamander', name: 'Salamander Magma Engine', kind: 'Geothermal', len: 30, tall: 12, mass: 3300, mw: 44, top: 1.15, charge: 12, low: 1.1, high: 1.15, fuel: 1, od: 2, heat: 0.6, cool: 1.4, power: 1,
    flame: { len: 16, outer: '#ff3a00', core: '#ffc040', jets: 3 }, perks: ['Heat sink: -40% overdrive heat', 'Drinks the ground\'s heat: refuels on lava and ash instead of burning'], lavaFuel: true,
    unlock: 10, cc: 3, cost: { titanium_alloy: 26, cryo_core: 6, sulfur: 40, iron_plate: 90 }, desc: 'Heat exchangers run down through the crawler frames into whatever the Titan is standing on. In the Magma Rift it runs on the planet.',
  },
  {
    key: 'hellfire', name: 'Hellfire Ramjet', kind: 'Afterburning ramjet', len: 26, tall: 8, mass: 700, mw: 60, top: 1.5, charge: 9, low: 0.55, high: 1.7, fuel: 2, od: 3, heat: 1.4, cool: 1.2, power: 1,
    flame: { len: 42, outer: '#40a0ff', core: '#f0f8ff', jets: 2 }, perks: ['+50% top speed, savage at the top end', 'Barely pulls below a third of top speed', 'Afterburner scorches whatever is behind the stern in overdrive', 'All three overdrive stages · double fuel'], afterburn: true,
    unlock: 12, cc: 4, cost: { titanium_alloy: 50, circuit: 40, tech_parts: 16, uranium_rod: 6, explosive: 20 }, desc: 'A pair of ramjets bolted to the stern. Useless at a crawl, terrifying at speed: the flames reach forty metres.',
  },
  {
    key: 'bluewhale', name: 'Blue Whale Fusion Core', kind: 'Tokamak fusion', len: 40, tall: 16, mass: 5000, mw: 90, top: 1.45, charge: 20, low: 1.2, high: 1.4, fuel: 0.35, od: 3, heat: 0.7, cool: 1.2, power: 6,
    flame: { len: 30, outer: '#b388ff', core: '#ffffff', jets: 4 }, perks: ['Fusion: burns a third of the fuel', '+45% top speed, all three overdrive stages', 'Takes 20 s to reach full charge', 'Draws 6 reactor power'],
    unlock: 16, cc: 5, cost: { uranium_rod: 20, titanium_alloy: 60, cryo_core: 10, xeno_alloy: 6, tech_parts: 20 }, desc: 'A star in a bottle, forty metres of magnets and plasma. It takes twenty seconds to bring to full charge and then it will run for ever.',
  },
];

export const engineDef = (key: EngineKey): EngineDef => ENGINES.find((e) => e.key === key) ?? ENGINES[0];

/** What the next level of a part costs (each level about 30% dearer, rarer materials higher up). */
export function engineCost(part: EnginePart, lvl: number): Record<string, number> {
  const k = Math.pow(1.3, lvl);
  const r = (n: number): number => Math.max(1, Math.round(n * k));
  switch (part) {
    case 'block':
      return { scrap: r(70), iron_plate: r(8), ...(lvl >= 2 ? { circuit: r(1.5) } : {}), ...(lvl >= 4 ? { titanium_alloy: r(1) } : {}) };
    case 'turbo':
      return { copper_wire: r(6), iron_plate: r(5), ...(lvl >= 1 ? { circuit: r(1.2) } : {}) };
    case 'gearbox':
      return { scrap: r(60), iron_plate: r(10), ...(lvl >= 3 ? { tech_parts: r(0.6) } : {}) };
    case 'nitro':
      return { copper_wire: r(5), circuit: r(1.5), ...(lvl >= 1 ? { sulfur: r(3) } : {}) };
    case 'radiator':
      return { scrap: r(50), copper_wire: r(8), ...(lvl >= 3 ? { cryo_core: r(0.5) } : {}) };
    case 'flywheel':
      return { iron_plate: r(14), scrap: r(40), ...(lvl >= 3 ? { titanium_alloy: r(0.8) } : {}) };
    case 'injectors':
      return { copper_wire: r(5), circuit: r(1.2), ...(lvl >= 2 ? { tech_parts: r(0.4) } : {}) };
    case 'exhaust':
      return { iron_plate: r(10), scrap: r(45), ...(lvl >= 3 ? { titanium_alloy: r(0.6) } : {}) };
    case 'intercooler':
      return { copper_wire: r(8), iron_plate: r(6), ...(lvl >= 3 ? { cryo_core: r(0.4) } : {}) };
    case 'governor':
      return { circuit: r(2), copper_wire: r(4), ...(lvl >= 3 ? { tech_parts: r(0.5) } : {}) };
    case 'finaldrive':
      return { iron_plate: r(12), scrap: r(50), ...(lvl >= 3 ? { titanium_alloy: r(0.7) } : {}) };
    case 'suspension':
      return { iron_plate: r(10), copper_wire: r(3), scrap: r(30) };
    case 'tracklinks':
      return { iron_plate: r(14), scrap: r(40), ...(lvl >= 2 ? { titanium_alloy: r(0.7) } : {}) };
    case 'differential':
      return { iron_plate: r(8), circuit: r(1), scrap: r(30) };
    case 'tensioners':
      return { iron_plate: r(8), copper_wire: r(4), scrap: r(30) };
  }
}

/** The highest level a part can be built to at a Command Center level. */
export const engineCap = (cc: number): number => Math.min(ENGINE_MAX, cc + 2);

export interface EngineSpec {
  /** Top speed multiplier. */
  top: number;
  /** Charge-up per second (0-1 of full revs). */
  spool: number;
  /** Charge lost per second when you ease off. */
  decay: number;
  /** Pull off the line and at speed (multipliers on the base acceleration). */
  low: number;
  high: number;
  /** Overdrive speed multiplier, its extra kick, and its fuel multiplier (stage I; see odStage). */
  odSpeed: number;
  odKick: number;
  odFuel: number;
  /** Overdrive stages available (1-3). */
  odStages: number;
  /** Overdrive heat per second (1 = trips), cooling per second, and where the trip resets. */
  heat: number;
  cool: number;
  relight: number;
  /** Fuel multiplier, reactor power drawn, drive wear multiplier. */
  fuel: number;
  power: number;
  wear: number;
  /** Grip added on bad ground (0-1 of the way to firm), and the soft-ground part of it. */
  rough: number;
  soft: number;
  /** Turning, crawler wear and crawler damage multipliers, crush force. */
  turn: number;
  crawlerWear: number;
  crawlerDmg: number;
  crush: number;
  /** Flames at full (m) and how they look. */
  flame: EngineDef['flame'];
  def: EngineDef;
}

export function engineSpec(e: EngineParts, key: EngineKey = 'leviathan'): EngineSpec {
  const d = engineDef(key);
  const stages = Math.min(3, d.od + (e.nitro >= 4 ? 1 : 0));
  return {
    top: d.top * (1 + 0.12 * e.block) * (1 + 0.03 * e.gearbox) * (1 + 0.02 * e.exhaust) * (1 + 0.02 * e.finaldrive),
    spool: ((1 / d.charge) * (1 + 0.3 * e.turbo) * (1 + 0.05 * e.intercooler)) / (1 + 0.05 * e.block),
    decay: 0.35 * (d.decay ?? 1) * Math.pow(0.82, e.flywheel),
    low: d.low * (1 + 0.1 * e.turbo) * (1 + 0.08 * e.finaldrive),
    high: d.high * (1 + 0.15 * e.gearbox) * (1 + 0.04 * e.flywheel),
    odSpeed: 1.45 + 0.07 * e.nitro,
    odKick: 1 + 0.2 * e.nitro,
    odFuel: 3 + 0.25 * e.nitro,
    odStages: stages,
    heat: (d.heat * Math.pow(0.91, e.intercooler)) / (14 * (1 + 0.3 * e.radiator)),
    cool: (1 / 22) * d.cool * (1 + 0.25 * e.radiator) * (1 + 0.12 * e.exhaust),
    relight: 0.35 + 0.04 * e.governor,
    fuel: d.fuel * (1 + 0.15 * e.block) * Math.pow(0.94, e.injectors),
    power: e.block + d.power,
    wear: Math.max(0.3, (1 - 0.06 * e.radiator) * (d.wear ?? 1) * Math.pow(0.9, e.governor)),
    rough: (d.traction ?? 0) + 0.04 * e.suspension,
    soft: (d.traction ?? 0) + 0.04 * e.tensioners,
    turn: 1 + 0.07 * e.differential,
    crawlerWear: Math.pow(0.88, e.tracklinks),
    crawlerDmg: Math.pow(0.92, e.tracklinks),
    crush: d.crush ?? 1,
    flame: { ...d.flame, len: d.flame.len * (1 + 0.08 * e.exhaust) },
    def: d,
  };
}

/** The spec a tank is driving on (the player's includes the helm's drive mode and switches: see driveSpec). */
export const specOf = (t: Tank): EngineSpec => engineSpec(t.engine, t.engineKey);

/* ------------------------------------------------------------------ */
/* The helm: drive modes, switches and overdrive stages                */
/* ------------------------------------------------------------------ */

export type DriveMode = 'eco' | 'normal' | 'sport' | 'crawl';

export const DRIVE_MODES: { key: DriveMode; name: string; what: string }[] = [
  { key: 'eco', name: 'ECO', what: 'Economy: -30% fuel burn, -20% top speed, -20% charge rate. No overdrive.' },
  { key: 'normal', name: 'NORMAL', what: 'Normal running: everything as built.' },
  { key: 'sport', name: 'SPORT', what: 'Sport: +30% charge rate, +6% top speed, +35% fuel burn, +50% drive wear, +10% overdrive heat.' },
  { key: 'crawl', name: 'CRAWL', what: 'Crawl: the lowest gears. 45% top speed, +30% grip on bad ground, +35% turning, +50% crush force, -10% fuel. No overdrive.' },
];

/** Overdrive stage multipliers on the engine's stage I figures. */
export function odStage(spec: EngineSpec, stage: number): { speed: number; kick: number; fuel: number; heat: number; wear: number; stage: number } {
  const s = Math.max(1, Math.min(spec.odStages, stage));
  const k = s === 1 ? 1 : s === 2 ? 1.55 : 2.1;
  return {
    speed: 1 + (spec.odSpeed - 1) * k,
    kick: spec.odKick * (s === 1 ? 1 : s === 2 ? 1.4 : 1.9),
    fuel: spec.odFuel * (s === 1 ? 1 : s === 2 ? 1.9 : 3.2),
    heat: s === 1 ? 1 : s === 2 ? 1.8 : 3,
    wear: s === 1 ? 5 : s === 2 ? 9 : 16,
    stage: s,
  };
}

export interface DriveSpec extends EngineSpec {
  /** Top speed from the drive mode and switches (applied on top of the hull's top speed). */
  modeTop: number;
  /** Extra grip from the switches (sanders, diff lock) and the mode. */
  grip: number;
  od: ReturnType<typeof odStage> | null;
}

/** The spec a tank drives on right now: for your Titan, the engine as built plus the helm's mode and switches. */
export function driveSpec(g: Game, t: Tank): DriveSpec {
  const s = specOf(t);
  const out: DriveSpec = { ...s, modeTop: 1, grip: 0, od: null };
  if (t !== g.player) return out;
  const hm = g.helm;
  switch (hm.mode) {
    case 'eco':
      out.fuel *= 0.7;
      out.modeTop *= 0.8;
      out.spool *= 0.8;
      out.odStages = 0;
      break;
    case 'sport':
      out.spool *= 1.3;
      out.modeTop *= 1.06;
      out.fuel *= 1.35;
      out.wear *= 1.5;
      out.heat *= 1.1;
      break;
    case 'crawl':
      out.modeTop *= 0.45;
      out.grip += 0.3;
      out.turn *= 1.35;
      out.crush *= 1.5;
      out.fuel *= 0.9;
      out.odStages = 0;
      break;
  }
  if (hm.diffLock) {
    out.grip += 0.15;
    out.turn *= 0.6;
  }
  if (hm.sandT > 0) out.grip += 0.25;
  if (hm.plow) {
    out.crush *= 1.6;
    out.modeTop *= 0.9;
  }
  if (hm.overdrive && out.odStages > 0) out.od = odStage(out, hm.odStage);
  return out;
}

/* ------------------------------------------------------------------ */
/* The pull                                                            */
/* ------------------------------------------------------------------ */

/**
 * How hard a Titan can pull right now, as a fraction of its base acceleration: barely at all until the engine has
 * charged up, then more and more the faster she is already going (the high gears), easing off right at the top.
 */
export function pullCurve(spec: EngineSpec, spool: number, u: number): number {
  const revs = 0.2 + 0.8 * Math.pow(Math.max(0, Math.min(1, spool)), 1.5);
  const gear = (0.5 * spec.low + 1.3 * spec.high * Math.min(1, u / 0.8)) * (u < 0.88 ? 1 : Math.max(0.3, (1 - u) / 0.12));
  return revs * gear;
}

/* ------------------------------------------------------------------ */
/* The workshop                                                        */
/* ------------------------------------------------------------------ */

/** Why a part can't be upgraded (null = it can). */
export function engineBlocked(g: Game, part: EnginePart): string | null {
  const p = g.player;
  const lvl = p.engine[part];
  if (lvl >= ENGINE_MAX) return 'Fully built.';
  const cap = engineCap(p.stats.cc);
  if (lvl >= cap) return `Command Center L${p.stats.cc} fits parts up to Mk ${cap}. Upgrade it for bigger ones.`;
  if (!g.canPay(engineCost(part, lvl))) return 'Not enough materials.';
  return null;
}

/** Fits the next level of a part (the engineers do it on the spot). Returns why not, or null. */
export function upgradeEngine(g: Game, part: EnginePart): string | null {
  const why = engineBlocked(g, part);
  if (why) return why;
  const p = g.player;
  if (!g.pay(engineCost(part, p.engine[part]))) return 'Not enough materials.';
  p.engine[part]++;
  p.version++;
  p.recalc();
  const d = ENGINE_PARTS.find((k) => k.key === part)!;
  g.hooks.toast(`ENGINE WORKSHOP: ${d.name} Mk ${p.engine[part]} fitted (${d.per}).`, '#ffd740');
  g.hooks.sound('finish');
  return null;
}

/** Why an engine can't be bought or installed right now (null = it can). */
export function engineWhy(g: Game, key: EngineKey): string | null {
  const p = g.player;
  const d = engineDef(key);
  if (p.engineKey === key) return 'Installed.';
  if (!p.enginesOwned.includes(key)) {
    if (g.commander.level < d.unlock) return `Commander level ${d.unlock}.`;
    if (p.stats.cc < d.cc) return `Command Center L${d.cc} to fit it.`;
    if (!g.canPay(d.cost)) return 'Not enough materials.';
  }
  if (Math.abs(p.speed) > 1) return 'Stop the Titan: the crane can\'t swap an engine on the move.';
  return null;
}

/** Buys (if needed) and installs an engine: the crane lowers it into the engine room. Returns why not, or null. */
export function installEngine(g: Game, key: EngineKey): string | null {
  const why = engineWhy(g, key);
  if (why) return why;
  const p = g.player;
  const d = engineDef(key);
  if (!p.enginesOwned.includes(key)) {
    if (!g.pay(d.cost)) return 'Not enough materials.';
    p.enginesOwned.push(key);
  }
  p.engineKey = key;
  p.spool = 0;
  p.version++;
  p.recalc();
  g.hooks.toast(`ENGINE ROOM: the crane lowers the ${d.name} into place (${d.len} m, ${d.mass.toLocaleString()} t, ${d.mw} MW). Charge-up ${d.charge} s.`, '#ffd740');
  g.hooks.sound('finish');
  return null;
}

/** A numbers readout for the workshop: speeds (km/h), times (s), burn (per minute). */
export function engineReadout(t: Tank, e: EngineParts, key: EngineKey = t.engineKey): { top: number; od: number; od3: number; zeroTo: number; charge: number; odTime: number; burn: number; power: number; stages: number } {
  const spec = engineSpec(e, key);
  const cur = engineSpec(t.engine, t.engineKey);
  const base = t.stats.topSpeed / Math.max(0.01, cur.top);
  const top = base * spec.top;
  // Simulate a standing start to 90% of top speed.
  let v = 0, spool = 0, time = 0;
  const A = 2.2;
  while (v < top * 0.9 && time < 180) {
    spool = Math.min(1, spool + spec.spool * 0.1);
    v += A * pullCurve(spec, spool, v / top) * 0.1;
    time += 0.1;
  }
  const hi = odStage(spec, spec.odStages);
  return {
    top: top * 3.6,
    od: top * spec.odSpeed * 3.6,
    od3: top * hi.speed * 3.6,
    zeroTo: time,
    charge: 1 / spec.spool,
    odTime: 1 / spec.heat,
    burn: (0.08 + 0.75) * spec.fuel * 60,
    power: spec.power,
    stages: spec.odStages,
  };
}
