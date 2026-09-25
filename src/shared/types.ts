export type Hazard = 'rad' | 'heat' | 'cold' | 'toxic';
export type RGB = [number, number, number];

export const HAZARDS: Hazard[] = ['rad', 'heat', 'cold', 'toxic'];

export const HAZARD_INFO: Record<Hazard, { name: string; short: string; color: string }> = {
  rad: { name: 'Radiation', short: 'RAD', color: '#c6ff00' },
  heat: { name: 'Extreme Heat', short: 'HEAT', color: '#ff6e40' },
  cold: { name: 'Extreme Cold', short: 'COLD', color: '#40c4ff' },
  toxic: { name: 'Toxic Atmosphere', short: 'TOX', color: '#00e676' },
};

export function rgb(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
