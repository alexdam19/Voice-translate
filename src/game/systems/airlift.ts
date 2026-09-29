import { rollDropRarity, rollWeaponKey } from '../../shared/loot';
import { CREW_SCALE } from '../defs';
import type { Game } from '../game';
import { newWeapon } from '../templates';
import { reserveCap } from './crewops';
import { FUEL_MAX, WATER_MAX } from './titan';

/**
 * The Mega Hangar's airlift. Raise the Hangar on the radio (once), then order what you need: fresh crew, fuel,
 * water, rations, plate and circuits, weapon crates, card packs, and refits for the Titan. Each order goes out
 * on a heavy cargo airship that flies from the Hangar to wherever the Titan is, hovers over the deck to lower
 * the crates, and flies home. Paid in scrap.
 *
 * Refits never run out: every track (plating, guns, engines, shields, reactor, cargo, quarters, treads) can be
 * raised again and again, each level dearer than the last. The wasteland keeps up: enemies grow stronger with
 * every minute and every horde, so there's always a reason for the next one.
 */

export type RefitKey = 'plating' | 'guns' | 'engines' | 'shields' | 'reactor' | 'cargo' | 'quarters' | 'treads';

export const REFITS: { key: RefitKey; name: string; icon: string; per: string; base: number }[] = [
  { key: 'plating', name: 'Armour Plating', icon: '🛡', per: '+8% hull', base: 120 },
  { key: 'guns', name: 'Gun Foundry', icon: '🎯', per: '+6% damage', base: 150 },
  { key: 'engines', name: 'Drive Overhaul', icon: '⚙', per: '+5% top speed', base: 140 },
  { key: 'shields', name: 'Shield Capacitors', icon: '🔷', per: '+10% shield and recharge', base: 130 },
  { key: 'reactor', name: 'Reactor Output', icon: '⚡', per: '+8% power', base: 110 },
  { key: 'cargo', name: 'Cargo Racks', icon: '📦', per: '+10% cargo space', base: 90 },
  { key: 'quarters', name: 'Crew Quarters', icon: '🛏', per: '+16 bunks', base: 100 },
  { key: 'treads', name: 'Heavy Treads', icon: '⛓', per: '+4% turning, -6% crawler wear', base: 100 },
];

/** What a refit level costs: scrap, plus plate and circuits as it climbs (15% dearer every level). */
export function refitCost(key: RefitKey, lvl: number): Record<string, number> {
  const r = REFITS.find((k) => k.key === key)!;
  const k = Math.pow(1.15, lvl);
  const out: Record<string, number> = { scrap: Math.round(r.base * k) };
  if (lvl >= 2) out.iron_plate = Math.round(4 * Math.pow(1.12, lvl));
  if (lvl >= 5) out.circuit = Math.round(1 + lvl * 0.4);
  return out;
}

export type SupplyKey = 'crew' | 'fuel' | 'water' | 'rations' | 'plate' | 'circuits' | 'wire' | 'kits' | 'weapon' | 'pack';

export const SUPPLIES: { key: SupplyKey; name: string; icon: string; desc: string; cost: number }[] = [
  { key: 'crew', name: 'Reinforcements', icon: '👷', desc: `${8 * CREW_SCALE} crew for the bunks (the rest to the Barracks reserve)`, cost: 60 },
  { key: 'fuel', name: 'Fuel Tanker', icon: '⛽', desc: '+600 fuel', cost: 70 },
  { key: 'water', name: 'Water Bowser', icon: '🚰', desc: '+400 water', cost: 45 },
  { key: 'rations', name: 'Rations', icon: '🥫', desc: '40 rations', cost: 55 },
  { key: 'plate', name: 'Iron Plate', icon: '🔩', desc: '20 iron plate', cost: 90 },
  { key: 'circuits', name: 'Circuit Boards', icon: '💾', desc: '6 circuit boards', cost: 90 },
  { key: 'wire', name: 'Copper Wire', icon: '🧵', desc: '12 copper wire', cost: 60 },
  { key: 'kits', name: 'Repair Kits', icon: '🧰', desc: '3 repair kits', cost: 70 },
  { key: 'weapon', name: 'Weapon Crate', icon: '🔫', desc: 'A new weapon for the armory', cost: 160 },
  { key: 'pack', name: 'Card Pack', icon: '🃏', desc: 'A rare card pack', cost: 200 },
];

export interface Flight {
  id: number;
  label: string;
  /** What it carries. */
  cargo: { supply?: SupplyKey; refit?: RefitKey }[];
  x: number;
  y: number;
  /** Heading (for drawing). */
  a: number;
  phase: 'out' | 'drop' | 'back';
  t: number;
}

export const AIRSHIP_SPEED = 140;
export const MAX_FLIGHTS = 3;
let nextFlight = 1;

export function hangarPos(g: Game): { x: number; y: number } {
  return g.gen.hangar ?? g.gen.spawn;
}

/** Raising the Hangar on the radio takes a few seconds, once. */
export function contactHangar(g: Game): string | null {
  if (g.airlift.contact) return null;
  if (g.airlift.calling > 0) return 'Already calling...';
  g.airlift.calling = 4;
  g.hooks.sound('ui');
  return null;
}

export function refitLevel(g: Game, key: RefitKey): number {
  return g.player.refit[key] ?? 0;
}

/** Orders a supply drop or a refit. Returns why not, or null. */
export function orderAirlift(g: Game, item: { supply?: SupplyKey; refit?: RefitKey }): string | null {
  if (!g.airlift.contact) return 'Raise the Mega Hangar on the radio first.';
  if (g.mode !== 'world') return 'The airlift only flies in the Crater.';
  const flying = g.flights.filter((f) => f.phase !== 'back').length;
  if (flying >= MAX_FLIGHTS) return `All ${MAX_FLIGHTS} airships are out. Wait for one to land.`;
  let cost: Record<string, number>;
  let label: string;
  if (item.refit) {
    const pending = g.flights.filter((f) => f.cargo.some((c) => c.refit === item.refit)).length;
    const lvl = refitLevel(g, item.refit) + pending;
    cost = refitCost(item.refit, lvl);
    label = `${REFITS.find((r) => r.key === item.refit)!.name} Mk ${lvl + 1}`;
  } else {
    const s = SUPPLIES.find((k) => k.key === item.supply)!;
    cost = { scrap: s.cost };
    label = s.name;
  }
  if (!g.pay(cost)) return `Needs ${Object.entries(cost).map(([k, n]) => `${n} ${k.replace('_', ' ')}`).join(', ')}.`;
  const h = hangarPos(g);
  g.flights.push({ id: nextFlight++, label, cargo: [item], x: h.x, y: h.y, a: Math.atan2(g.player.y - h.y, g.player.x - h.x), phase: 'out', t: 0 });
  g.hooks.toast(`Airlift ordered: ${label}. ETA ${etaText(Math.hypot(g.player.x - h.x, g.player.y - h.y) / AIRSHIP_SPEED)}.`, '#40c4ff');
  g.hooks.sound('build');
  return null;
}

export function etaText(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
}

/** Seconds until a flight reaches the Titan. */
export function flightEta(g: Game, f: Flight): number {
  if (f.phase !== 'out') return 0;
  return Math.max(0, Math.hypot(g.player.x - f.x, g.player.y - f.y) - 40) / AIRSHIP_SPEED;
}

export function updateAirlift(g: Game, dt: number): void {
  const al = g.airlift;
  if (al.calling > 0) {
    al.calling -= dt;
    if (al.calling <= 0) {
      al.contact = true;
      g.hooks.toast('MEGA HANGAR: "Titan, we read you. The airlift is yours: supplies, crew, refits. Tell us what you need."', '#40c4ff');
      g.hooks.sound('levelup');
    }
  }
  if (!g.flights.length) return;
  const p = g.player;
  const h = hangarPos(g);
  for (const f of g.flights) {
    if (f.phase === 'out') {
      const dx = p.x - f.x, dy = p.y - f.y;
      const d = Math.hypot(dx, dy);
      f.a = Math.atan2(dy, dx);
      if (d < 30) {
        f.phase = 'drop';
        f.t = 4;
        g.hooks.toast(`Airship over the deck: lowering ${f.label}.`, '#40c4ff');
      } else {
        const step = Math.min(d, AIRSHIP_SPEED * dt);
        f.x += (dx / d) * step;
        f.y += (dy / d) * step;
      }
    } else if (f.phase === 'drop') {
      // Hold station over the Titan while the crates go down.
      f.x += (p.x - f.x) * Math.min(1, dt * 3);
      f.y += (p.y - f.y) * Math.min(1, dt * 3);
      f.t -= dt;
      if (f.t <= 0) {
        for (const c of f.cargo) deliver(g, c);
        f.phase = 'back';
      }
    } else {
      const dx = h.x - f.x, dy = h.y - f.y;
      const d = Math.hypot(dx, dy);
      f.a = Math.atan2(dy, dx);
      const step = Math.min(d, AIRSHIP_SPEED * 1.3 * dt);
      if (d > 1) {
        f.x += (dx / d) * step;
        f.y += (dy / d) * step;
      }
    }
  }
  g.flights = g.flights.filter((f) => !(f.phase === 'back' && Math.hypot(h.x - f.x, h.y - f.y) < 5));
}

function deliver(g: Game, c: { supply?: SupplyKey; refit?: RefitKey }): void {
  const p = g.player;
  const s = g.titan;
  if (c.refit) {
    p.refit[c.refit] = (p.refit[c.refit] ?? 0) + 1;
    p.version++;
    p.recalc();
    g.applyCrew();
    const r = REFITS.find((k) => k.key === c.refit)!;
    g.hooks.toast(`REFIT INSTALLED: ${r.name} Mk ${p.refit[c.refit]} (${r.per}).`, '#76ff03');
    g.hooks.sound('finish');
    return;
  }
  switch (c.supply) {
    case 'crew': {
      const n = 8 * CREW_SCALE;
      const room = Math.max(0, p.stats.bunks - p.troops);
      const toBunks = Math.min(n, room);
      p.troops += toBunks;
      g.reserves = Math.min(reserveCap(g), g.reserves + (n - toBunks));
      p.recalc();
      g.hooks.toast(`${n} crew came down the ropes: ${toBunks} to the bunks${n - toBunks ? `, the rest to the reserve` : ''}.`, '#76ff03');
      break;
    }
    case 'fuel':
      s.fuel = Math.min(FUEL_MAX, s.fuel + 600);
      g.hooks.toast('Fuel tanks topped up (+600).', '#ffb300');
      break;
    case 'water':
      s.water = Math.min(WATER_MAX, s.water + 400);
      g.hooks.toast('Water tanks topped up (+400).', '#40c4ff');
      break;
    case 'rations':
      g.give('rations', 40);
      break;
    case 'plate':
      g.give('iron_plate', 20);
      break;
    case 'circuits':
      g.give('circuit', 6);
      break;
    case 'wire':
      g.give('copper_wire', 12);
      break;
    case 'kits':
      g.give('repair_kit', 3);
      break;
    case 'weapon': {
      const r = () => g.rng.next();
      const w = newWeapon(rollWeaponKey(r), rollDropRarity(r, Math.max(1, g.threatHere()) + 1), r);
      g.addWeapon(w);
      g.hooks.toast('A weapon crate landed: it\'s in the ARSENAL.', '#ffd740');
      break;
    }
    case 'pack':
      g.packs.push('rare_pack');
      g.hooks.toast('A rare card pack landed. Open it in CARDS.', '#ea80fc');
      break;
  }
  g.hooks.sound('pickup');
}
