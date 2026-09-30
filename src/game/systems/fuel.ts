import type { Game } from '../game';
import type { ModuleInst } from '../tank';
import { MODULES } from '../defs';
import { inCompound } from '../../shared/compound';
import { oilAt, oilWord } from '../../shared/oil';
import { FUEL_MAX } from './titan';

/**
 * Fuel from the ground. A Titan burns through a tank in well under an hour, so it carries its own oilfield:
 *
 *  - The FUEL DRILL (build one in BASE > Shop > Resources) bores through the keel. Stop the Titan and lower it: it
 *    takes a few seconds to reach the seam, then pumps crude into the crude tank, faster the richer the ground (the
 *    OIL survey on the cabin's fuel screen and the HUD) and faster at every level. She can't move while it's down:
 *    open the throttle and the crew raise it first. The pumps are loud: creatures nearby hear them.
 *  - The AUTOMATIC REFINERY cracks crude from the tank into fuel on its own while its AUTO switch is on, at 85%
 *    yield, drawing reactor power. Without one the crude just sits in the tank.
 */

export const CRUDE_MAX = 1500;
/** Seconds to lower the drill to the seam (raising takes half as long). */
export const DRILL_T = 8;
/** Fuel made from each unit of crude. */
export const REFINE_YIELD = 0.85;

export const fuelDrill = (g: Game): ModuleInst | undefined => g.player.modules.find((m) => m.built && m.key === 'fuel_drill');
export const fuelRefinery = (g: Game): ModuleInst | undefined => g.player.modules.find((m) => m.built && m.key === 'fuel_refinery');

/** How rich the ground under the Titan is (none inside the Mega Hangar compound). */
export function oilHere(g: Game): number {
  const p = g.player;
  const h = g.gen.hangar;
  if (g.mode !== 'world') return 0;
  if (h && inCompound(p.x - h.x, p.y - h.y, 40)) return 0;
  return oilAt(p.x, p.y, g.map.zoneAt(p.x, p.y));
}

/** Crude pumped per second right now (0 unless the drill is all the way down). */
export function drillRate(g: Game): number {
  const m = fuelDrill(g);
  if (!m || g.titan.drill < 1) return 0;
  return (MODULES.fuel_drill.oilDrill ?? 3) * (1 + 0.4 * (m.lvl - 1)) * oilHere(g);
}

/** Crude the refinery can crack per second (0 without one, or with AUTO off). */
export function refineRate(g: Game): number {
  const m = fuelRefinery(g);
  if (!m || !g.helm.refine) return 0;
  return (MODULES.fuel_refinery.crudeRefine ?? 2.4) * (1 + 0.4 * (m.lvl - 1));
}

/** Lowers or raises the drill. Returns what happened (for a toast) and whether it did. */
export function setDrill(g: Game, down: boolean): { ok: boolean; msg: string } {
  const s = g.titan;
  const p = g.player;
  if (!down) {
    if (!s.drillWant && s.drill <= 0) return { ok: false, msg: 'The drill is already up.' };
    s.drillWant = false;
    return { ok: true, msg: 'DRILL: raising the string. She can move once it is up.' };
  }
  if (!fuelDrill(g)) return { ok: false, msg: 'No Fuel Drill aboard: build one in BASE > Shop > Resources.' };
  if (!p.titan || g.mode !== 'world') return { ok: false, msg: 'The drill needs open ground under a Titan.' };
  if (Math.abs(p.speed) > 0.6) return { ok: false, msg: 'Stop the Titan first: the drill string would snap.' };
  const oil = oilHere(g);
  if (oil <= 0.02) return { ok: false, msg: 'Nothing under the compound but concrete. Drill out in the wastes.' };
  s.drillWant = true;
  g.helm.lever = 0;
  p.path = [];
  p.goal = null;
  return { ok: true, msg: `DRILL: lowering the string. Ground here is ${oilWord(oil)} (${Math.round(oil * 100)}%).` };
}

export function updateFuel(g: Game, dt: number): void {
  const s = g.titan;
  const p = g.player;
  if (!p.titan) return;
  // Lost the drill (sold, destroyed) with the string down: it's gone up with it.
  if (!fuelDrill(g)) {
    s.drillWant = false;
    s.drill = 0;
  }
  // The string goes down slowly and comes up a bit quicker.
  if (s.drillWant) s.drill = Math.min(1, s.drill + dt / DRILL_T);
  else s.drill = Math.max(0, s.drill - dt / (DRILL_T / 2));
  // Pumping.
  const rate = drillRate(g);
  if (rate > 0) {
    s.crude = Math.min(CRUDE_MAX, s.crude + rate * dt);
    if (s.crude >= CRUDE_MAX && (s.warn.crude ?? 0) <= 0) {
      s.warn.crude = 60;
      g.hooks.toast('CRUDE TANK FULL: the drill is pumping into a full tank.' + (fuelRefinery(g) ? '' : ' Build an Automatic Refinery to turn it into fuel.'), '#ffab40');
    }
    // Oil spatters round the bore, and the pumps' thump carries: things nearby come to look.
    if (Math.random() < dt * 3) g.fx.push({ t: 'dust', x: p.x + (Math.random() - 0.5) * 20, y: p.y + (Math.random() - 0.5) * 20, color: '#2a2018' });
    s.drillNoise = (s.drillNoise ?? 0) - dt;
    if (s.drillNoise <= 0) {
      s.drillNoise = 20;
      for (const e of g.enemiesNear(p.x, p.y, 600)) if (e.hp > 0 && !e.burrowed) e.aggro = true;
    }
  }
  // The refinery cracks what's in the tank while there's room for the fuel.
  const rr = refineRate(g);
  if (rr > 0 && s.crude > 0 && s.fuel < FUEL_MAX) {
    const n = Math.min(s.crude, rr * dt, (FUEL_MAX - s.fuel) / REFINE_YIELD);
    s.crude -= n;
    s.fuel = Math.min(FUEL_MAX, s.fuel + n * REFINE_YIELD);
  }
  for (const k of Object.keys(s.warn)) if (k === 'crude') s.warn[k] -= dt;
}
