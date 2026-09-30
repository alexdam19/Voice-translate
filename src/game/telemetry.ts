import type { Game } from './game';

/**
 * The ship's flight recorder: once a second it logs speed, hull, supplies, air, energy, the crowd around and the kill
 * count, keeping the last few minutes for the cabin's trend screens.
 */

export interface TelemetrySample {
  /** km/h (negative astern). */
  spd: number;
  /** Hull, 0..1. */
  hull: number;
  fuel: number;
  water: number;
  /** Oxygen aboard (fraction). */
  o2: number;
  /** Inside temperature, °C. */
  temp: number;
  energy: number;
  /** Hostiles within 500 m. */
  near: number;
  /** Kills so far. */
  kills: number;
  /** Drive heat, 0..1. */
  heat: number;
}

export const TELEMETRY_KEEP = 240;

export interface Telemetry {
  t: number;
  hist: TelemetrySample[];
}

export const newTelemetry = (): Telemetry => ({ t: 0, hist: [] });

export function recordTelemetry(g: Game, dt: number): void {
  const tm = g.telemetry;
  tm.t -= dt;
  if (tm.t > 0) return;
  tm.t = 1;
  const p = g.player;
  let near = 0;
  for (const e of g.enemies) if (e.hp > 0 && Math.abs(e.x - p.x) < 500 && Math.abs(e.y - p.y) < 500) near++;
  tm.hist.push({
    spd: p.speed * 3.6,
    hull: p.hp / Math.max(1, p.stats.maxHp),
    fuel: g.titan.fuel,
    water: g.titan.water,
    o2: g.titan.oxygen,
    temp: g.titan.temp,
    energy: g.energy,
    near,
    kills: g.stats.kills,
    heat: g.helm.heat,
  });
  if (tm.hist.length > TELEMETRY_KEEP) tm.hist.splice(0, tm.hist.length - TELEMETRY_KEEP);
}

/** Kills a minute over the last `secs` seconds. */
export function killRate(g: Game, secs = 60): number {
  const h = g.telemetry.hist;
  if (h.length < 2) return 0;
  const a = h[Math.max(0, h.length - 1 - secs)], b = h[h.length - 1];
  const span = Math.max(1, Math.min(secs, h.length - 1));
  return ((b.kills - a.kills) / span) * 60;
}
