export type Hazard = 'rad' | 'heat' | 'cold' | 'toxic';

export const HAZARDS: Hazard[] = ['rad', 'heat', 'cold', 'toxic'];

export const HAZARD_INFO: Record<Hazard, { name: string; short: string; color: string }> = {
  rad: { name: 'Radiation', short: 'RAD', color: '#c6ff00' },
  heat: { name: 'Extreme Heat', short: 'HEAT', color: '#ff6e40' },
  cold: { name: 'Extreme Cold', short: 'COLD', color: '#40c4ff' },
  toxic: { name: 'Toxic Atmosphere', short: 'TOX', color: '#00e676' },
};

export type DriveKey = 'wheels' | 'tracks' | 'chains' | 'magma' | 'hover';

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

/** Wraps an angle to [-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Turns `from` toward `to` by at most `step` radians. */
export function turnToward(from: number, to: number, step: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= step) return to;
  return wrapAngle(from + Math.sign(d) * step);
}
