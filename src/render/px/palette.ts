import type { RGB } from './pixels';

/**
 * AAP-64, Adigun A. Polack's 64-colour pixel-art palette (https://lospec.com/palette-list/aap-64), as shipped with
 * the LibreSprite editor's palettes. New art snaps to it so the maps, colossi and UI share one set of colours.
 */
export const AAP64 = [
  '060608', '141013', '3b1725', '73172d', 'b4202a', 'df3e23', 'fa6a0a', 'f9a31b', 'ffd541', 'fffc40', 'd6f264', '9cdb43', '59c135', '14a02e', '1a7a3e', '24523b',
  '122020', '143464', '285cc4', '249fde', '20d6c7', 'a6fcdb', 'ffffff', 'fef3c0', 'fad6b8', 'f5a097', 'e86a73', 'bc4a9b', '793a80', '403353', '242234', '221c1a',
  '322b28', '71413b', 'bb7547', 'dba463', 'f4d29c', 'dae0ea', 'b3b9d1', '8b93af', '6d758d', '4a5462', '333941', '422433', '5b3138', '8e5252', 'ba756a', 'e9b5a3',
  'e3e6ff', 'b9bffb', '849be4', '588dbe', '477d85', '23674e', '328464', '5daf8d', '92dcba', 'cdf7e2', 'e4d2aa', 'c7b08b', 'a08662', '796755', '5a4e44', '423934',
].map((h): RGB => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);

let lut: Uint8Array | null = null;

/** The palette entry nearest a colour (looked up on a 5-bit-per-channel table, built once). */
export function nearestAAP(r: number, g: number, b: number): RGB {
  if (!lut) {
    lut = new Uint8Array(32768);
    for (let i = 0; i < 32768; i++) {
      const R = ((i >> 10) & 31) * 8 + 4, G = ((i >> 5) & 31) * 8 + 4, B = (i & 31) * 8 + 4;
      let best = 0, bd = Infinity;
      AAP64.forEach((c, k) => {
        // Weighted for the eye (green counts most).
        const d = (c[0] - R) ** 2 * 0.3 + (c[1] - G) ** 2 * 0.59 + (c[2] - B) ** 2 * 0.11;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      lut[i] = best;
    }
  }
  const i = ((Math.max(0, Math.min(255, r)) >> 3) << 10) | ((Math.max(0, Math.min(255, g)) >> 3) << 5) | (Math.max(0, Math.min(255, b)) >> 3);
  return AAP64[lut[i]];
}
