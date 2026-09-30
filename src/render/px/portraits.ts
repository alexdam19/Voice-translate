import { faceCanvas, type FaceMood } from './faces';

/**
 * Officer portraits: painted head-and-shoulders busts (see faces.ts) on a panel lit in the role's colour, framed in
 * the rarity's. 128 px, scaled down by the panels that show them small.
 */

export interface PortraitSpec {
  seed: number;
  role: string;
  roleColor: string;
  rarityColor: string;
  /** Champions set their own hair colour and an accent (a badge). */
  hair?: string;
  accent?: string;
}

const cache = new Map<string, string>();

export function portraitHD(spec: PortraitSpec, mood: FaceMood = {}): string {
  const key = `${spec.seed}|${spec.role}|${spec.roleColor}|${spec.rarityColor}|${spec.hair ?? ''}|${spec.accent ?? ''}|${JSON.stringify(mood)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.drawImage(faceCanvas(spec, S, mood), 0, 0);
  x.strokeStyle = spec.rarityColor;
  x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, S - 3, S - 3);
  x.strokeStyle = 'rgba(0,0,0,0.6)';
  x.lineWidth = 1;
  x.strokeRect(3.5, 3.5, S - 7, S - 7);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
