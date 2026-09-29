import { cap, ell, eye, line, paintSprite, plate, spike, tint } from './creaturesHD';
import { rgb, type RGB } from './pixels';

/**
 * The guns on the Titan's deck as pixel art: one painted turret per weapon family, lit from the top left like the
 * hull sheet, turned to their aim each frame. Families: twin machine guns and autocannons, heavy cannons and rails,
 * missile boxes, mortars, energy emitters (lasers, plasma, orbs and the stranger stuff) glowing in the weapon's
 * colour, flamers and sprayers with their tanks, and tesla coils.
 *
 * Painted on a 32-unit square with the pivot at (12, 16) and the barrels toward +x; the housing's radius is 7 units.
 */

export type TurretFamily = 'mg' | 'cannon' | 'rail' | 'missile' | 'mortar' | 'energy' | 'flame' | 'tesla';

export function turretFamily(kind: string): TurretFamily {
  switch (kind) {
    case 'bullet': case 'pellet': case 'pd': case 'flak': return 'mg';
    case 'shell': return 'cannon';
    case 'rail': return 'rail';
    case 'missile': case 'jet': case 'grenade': return 'missile';
    case 'mortar': case 'sky': case 'meteor': return 'mortar';
    case 'flame': case 'acid': case 'ink': case 'cryo': return 'flame';
    case 'tesla': case 'sonic': return 'tesla';
    default: return 'energy';
  }
}

const GUN = rgb('#4e5666'), DARK = rgb('#22262e'), HI = rgb('#8a96aa');
const cache = new Map<string, HTMLCanvasElement>();
export const TURRET_S = 64;
export const TURRET_PIVOT: [number, number] = [12, 16];
export const TURRET_R = 7;

export function turretSprite(fam: TurretFamily, glow: string, accent: string): HTMLCanvasElement {
  const key = `${fam}|${glow}|${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const G: RGB = rgb(glow), A: RGB = rgb(accent);
  const img = paintSprite(TURRET_S, fam.length * 7 + 3, (p) => {
    const cx = 12, cy = 16;
    // Barrels first (the housing sits over their roots).
    switch (fam) {
      case 'mg':
        for (const o of [-2.2, 2.2]) {
          plate(p, cx + 3, cy + o - 0.9, 16, 1.8, GUN);
          plate(p, cx + 17, cy + o - 1.2, 3, 2.4, DARK);
          for (let x = cx + 6; x < cx + 16; x += 2.5) line(p, x, cy + o - 0.9, x, cy + o + 0.9, tint(GUN, -0.4));
        }
        break;
      case 'cannon':
        plate(p, cx + 3, cy - 1.8, 18, 3.6, GUN);
        plate(p, cx + 12, cy - 2.2, 2, 4.4, DARK);
        plate(p, cx + 18.5, cy - 2.6, 3.5, 5.2, DARK);
        line(p, cx + 19.2, cy - 2.6, cx + 19.2, cy + 2.6, HI);
        break;
      case 'rail':
        for (const o of [-2.6, 2.6]) plate(p, cx + 2, cy + o - 1, 18.5, 2, GUN);
        for (let x = cx + 4; x < cx + 19; x += 3) {
          plate(p, x, cy - 2, 1.2, 4, DARK);
          eye(p, x + 0.6, cy, G, 0.35);
        }
        break;
      case 'missile':
        break;
      case 'mortar':
        ell(p, cx + 2, cy, 5.4, 5.4, GUN, 'metal', 1.2);
        ell(p, cx + 2, cy, 3.8, 3.8, rgb('#0c0c10'), 'none', 0.2, 0, false);
        break;
      case 'energy':
        cap(p, cx + 3, cy, cx + 15, cy, 2.6, 2, GUN, 'metal');
        for (let x = cx + 5; x < cx + 14; x += 2.2) ell(p, x, cy, 0.9, 2.9, rgb('#b07a30'), 'metal', 0.8);
        ell(p, cx + 17, cy, 2.4, 2.8, DARK, 'metal', 0.8);
        ell(p, cx + 17.6, cy, 1.4, 1.8, G, 'glow', 0.6, 0, false);
        break;
      case 'flame':
        cap(p, cx + 3, cy, cx + 17, cy + 0.2, 1.4, 1.2, GUN, 'metal');
        spike(p, cx + 16, cy, cx + 20, cy, 3, DARK);
        eye(p, cx + 19.6, cy, G, 0.5);
        break;
      case 'tesla':
        break;
    }
    // The housing.
    switch (fam) {
      case 'missile':
        plate(p, cx - 6.5, cy - 6.5, 14, 13, GUN);
        for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
          ell(p, cx - 3.2 + k * 4, cy - 4 + r * 4, 1.5, 1.5, DARK, 'metal', 0.4);
          ell(p, cx - 3.2 + k * 4, cy - 4 + r * 4, 0.8, 0.8, rgb('#3a0a04'), 'none', 0.2, 0, false);
        }
        break;
      case 'tesla':
        for (let r = 6.4; r > 1.4; r -= 1.6) ell(p, cx, cy, r, r, r % 3.2 < 1.6 ? rgb('#b07a30') : GUN, 'metal', 0.8);
        eye(p, cx, cy, G, 1.3);
        break;
      case 'mortar':
        ell(p, cx - 1.5, cy, 6.2, 6.6, GUN, 'metal', 0.6);
        ell(p, cx + 2, cy, 5.4, 5.4, GUN, 'metal', 1.2);
        ell(p, cx + 2, cy, 3.8, 3.8, rgb('#0c0c10'), 'none', 0.2, 0, false);
        eye(p, cx - 4.4, cy - 3, A, 0.4);
        break;
      default: {
        // An angled armoured box, a sloped glacis, a hatch and a sight.
        // Plates: the body, sloped cheeks forward, then a raised top.
        plate(p, cx - 6.8, cy - 6.2, 10.2, 12.4, GUN);
        spike(p, cx + 3.2, cy - 6, cx + 6.6, cy - 3.4, 2.4, GUN);
        spike(p, cx + 3.2, cy + 6, cx + 6.6, cy + 3.4, 2.4, tint(GUN, -0.2));
        plate(p, cx - 4.8, cy - 4.2, 7.4, 8.4, tint(GUN, 0.12));
        ell(p, cx - 2.2, cy + 1.6, 1.6, 1.6, DARK, 'metal', 0.5);
        plate(p, cx + 0.6, cy - 3.4, 2.4, 1.4, DARK);
        eye(p, cx + 2.6, cy - 2.7, rgb('#ff4a3a'), 0.3);
        // Class colour down the back.
        plate(p, cx - 6.6, cy - 5, 0.9, 10, A, 'none');
        break;
      }
    }
  });
  cache.set(key, img);
  return img;
}

/** The fixed base ring under a turret (the deck mount). */
export function turretRing(): HTMLCanvasElement {
  const hit = cache.get('ring');
  if (hit) return hit;
  const img = paintSprite(TURRET_S, 5, (p) => {
    ell(p, 16, 16, 9.6, 9.6, rgb('#15181e'), 'metal', 0.3);
    ell(p, 16, 16, 8.6, 8.6, rgb('#343a46'), 'metal', 0.4);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      eye(p, 16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, rgb('#8a96aa'), 0.18);
    }
  });
  cache.set('ring', img);
  return img;
}
