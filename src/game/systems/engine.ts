import type { Game } from '../game';
import type { Tank } from '../tank';

/**
 * The engine workshop: a Titan's drive is five parts you can rebuild, each doing one job.
 *
 *  - Engine Block: displacement. A bigger block raises top speed, but it burns more fuel, draws more reactor power
 *    and takes longer to wind up.
 *  - Turbochargers: how fast the engine spools up, so how quickly she gets moving off the line.
 *  - Gearbox: the high gears. How hard she pulls once she's already rolling, and a little more top end.
 *  - Nitro Injectors: overdrive. More overdrive speed and a harder kick, for more fuel.
 *  - Radiators: how long overdrive can run before the engine overheats and trips it, and how fast it cools.
 *
 * However it's built, a Titan is slow off the mark (the engine has to spool up and 30,000 tonnes have to start
 * rolling) and then pulls harder the faster she goes, so once she has way on she is very fast.
 */

export type EnginePart = 'block' | 'turbo' | 'gearbox' | 'nitro' | 'radiator';

export type EngineParts = Record<EnginePart, number>;

export const ENGINE_MAX = 8;

export const newEngine = (): EngineParts => ({ block: 0, turbo: 0, gearbox: 0, nitro: 0, radiator: 0 });

export const ENGINE_PARTS: { key: EnginePart; name: string; icon: string; stat: string; what: string; per: string; cost: string }[] = [
  { key: 'block', name: 'Engine Block', icon: '⚙', stat: 'TOP SPEED', what: 'Bigger displacement: more top speed, but more fuel, more reactor power and a slower wind-up.', per: '+12% top speed · +15% fuel · +1 reactor draw', cost: 'Iron Plate, Scrap, Circuits, Titanium' },
  { key: 'turbo', name: 'Turbochargers', icon: '🌀', stat: 'ACCELERATION', what: 'Spool the engine up faster: she gets moving off the line sooner.', per: '+30% spool-up · +10% pull off the line', cost: 'Copper Wire, Iron Plate, Circuits' },
  { key: 'gearbox', name: 'Gearbox', icon: '⛭', stat: 'ACCELERATION AT SPEED', what: 'Taller high gears: she pulls harder once she is rolling, and a little more top end.', per: '+15% pull at speed · +3% top speed', cost: 'Iron Plate, Scrap, Salvaged Tech' },
  { key: 'nitro', name: 'Nitro Injectors', icon: '🔥', stat: 'OVERDRIVE', what: 'More overdrive speed and a harder kick when you light it, for more fuel.', per: '+7% overdrive speed · +20% overdrive kick', cost: 'Sulfur, Circuits, Copper Wire' },
  { key: 'radiator', name: 'Radiators', icon: '❄', stat: 'OVERDRIVE TIME', what: 'Overdrive runs longer before the engine overheats, it cools faster, and the drive wears less.', per: '+30% overdrive time · +25% cooling', cost: 'Copper Wire, Scrap, Cryo Cores' },
];

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
  }
}

/** The highest level a part can be built to at a Command Center level. */
export const engineCap = (cc: number): number => Math.min(ENGINE_MAX, cc + 2);

export interface EngineSpec {
  /** Top speed multiplier. */
  top: number;
  /** Spool-up per second (0-1 of full revs). */
  spool: number;
  /** Pull off the line and at speed (multipliers on the base acceleration). */
  low: number;
  high: number;
  /** Overdrive speed multiplier, its extra kick, and its fuel multiplier. */
  odSpeed: number;
  odKick: number;
  odFuel: number;
  /** Overdrive heat per second (1 = trips), cooling per second. */
  heat: number;
  cool: number;
  /** Fuel multiplier, reactor power drawn, drive wear multiplier. */
  fuel: number;
  power: number;
  wear: number;
}

export function engineSpec(e: EngineParts): EngineSpec {
  return {
    top: (1 + 0.12 * e.block) * (1 + 0.03 * e.gearbox),
    spool: (0.16 * (1 + 0.3 * e.turbo)) / (1 + 0.05 * e.block),
    low: 1 + 0.1 * e.turbo,
    high: 1 + 0.15 * e.gearbox,
    odSpeed: 1.45 + 0.07 * e.nitro,
    odKick: 1 + 0.2 * e.nitro,
    odFuel: 3 + 0.25 * e.nitro,
    heat: 1 / (14 * (1 + 0.3 * e.radiator)),
    cool: (1 / 22) * (1 + 0.25 * e.radiator),
    fuel: 1 + 0.15 * e.block,
    power: e.block,
    wear: Math.max(0.4, 1 - 0.06 * e.radiator),
  };
}

/**
 * How hard a Titan can pull right now, as a fraction of its base acceleration: barely at all until the engine has
 * spooled up, then more and more the faster she is already going (the high gears), easing off right at the top.
 */
export function pullCurve(spec: EngineSpec, spool: number, u: number): number {
  const revs = 0.2 + 0.8 * Math.pow(Math.max(0, Math.min(1, spool)), 1.5);
  const gear = (0.5 * spec.low + 1.3 * spec.high * Math.min(1, u / 0.8)) * (u < 0.88 ? 1 : Math.max(0.3, (1 - u) / 0.12));
  return revs * gear;
}

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

/** A numbers readout for the workshop: speeds (km/h), times (s), burn (per minute). */
export function engineReadout(t: Tank, e: EngineParts): { top: number; od: number; zeroTo: number; odTime: number; burn: number; power: number } {
  const spec = engineSpec(e);
  const base = t.stats.topSpeed / Math.max(0.01, engineSpec(t.engine).top);
  const top = base * spec.top;
  // Simulate a standing start to 90% of top speed.
  let v = 0, spool = 0, time = 0;
  const A = 2.2;
  while (v < top * 0.9 && time < 120) {
    spool = Math.min(1, spool + spec.spool * 0.1);
    v += A * pullCurve(spec, spool, v / top) * 0.1;
    time += 0.1;
  }
  return {
    top: top * 3.6,
    od: top * spec.odSpeed * 3.6,
    zeroTo: time,
    odTime: 1 / spec.heat,
    burn: (0.08 + 0.75) * spec.fuel * 60,
    power: spec.power,
  };
}
