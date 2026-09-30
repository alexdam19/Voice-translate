import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TER, ZONE } from '../src/shared/map';
import { boulderName, crownName, DETAILS } from '../src/render/px/terrain2d';

/**
 * The atlases painted in LibreSprite (art/scripts, tools/art/build.mjs) are generated files: check they're indexed
 * AAP-64 sheets that match their rectangles, and that everything the ground asks for was painted.
 */

const PX = join(__dirname, '../src/assets/px');
const meta = (name: string) => JSON.parse(readFileSync(join(PX, `${name}.json`), 'utf8')) as { scales: Record<string, { w: number; h: number; sprites: Record<string, number[]> }> };

function png(file: string): { w: number; h: number; colorType: number; palette: number[][] } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  let o = 8, palette: number[][] = [];
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), colorType = b[25];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.subarray(o + 4, o + 8).toString();
    if (type === 'PLTE') for (let i = 0; i < len; i += 3) palette.push([b[o + 8 + i], b[o + 9 + i], b[o + 10 + i]]);
    o += 12 + len;
  }
  return { w, h, colorType, palette };
}

const AAP = readFileSync(join(__dirname, '../art/palettes/aap-64.gpl'), 'utf8')
  .split('\n')
  .map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(l))
  .filter((m): m is RegExpExecArray => !!m)
  .map((m) => `${m[1]},${m[2]},${m[3]}`);

describe('LibreSprite atlases', () => {
  for (const name of ['props', 'nature', 'ground']) {
    it(`${name}: indexed AAP-64 sheets that match their sprite rectangles`, () => {
      const m = meta(name);
      const scales = Object.keys(m.scales);
      expect(scales.length).toBe(2);
      const names = Object.keys(m.scales[scales[0]].sprites);
      for (const k of scales) {
        const sheet = m.scales[k];
        const img = png(join(PX, `${name}@${k}.png`));
        expect([img.w, img.h]).toEqual([sheet.w, sheet.h]);
        expect(img.colorType).toBe(3);
        // Index 0 is transparent; every other colour is one of AAP-64's.
        for (const c of img.palette.slice(1)) expect(AAP).toContain(c.join(','));
        expect(Object.keys(sheet.sprites).sort()).toEqual([...names].sort());
        for (const [n, [x, y, w, h, ax, ay]] of Object.entries(sheet.sprites)) {
          expect(x >= 0 && y >= 0 && x + w <= sheet.w && y + h <= sheet.h, n).toBe(true);
          expect(ax >= 0 && ax < w && ay >= 0 && ay < h, n).toBe(true);
        }
      }
    });
  }

  it('every prop kind the world scatters has its sprites', () => {
    const sprites = meta('props').scales['8'].sprites;
    for (const kind of ['bones', 'deadtree', 'cactus', 'crystal', 'barrel', 'wreckcar', 'sign', 'mushroom', 'pipe', 'spike', 'skull', 'tent', 'antenna', 'crate']) {
      for (let v = 0; v < 4; v++) expect(sprites[`${kind}${v}`], `${kind}${v}`).toBeDefined();
    }
  });

  it('every tree crown, boulder and ground detail the ground draws was painted', () => {
    const nature = meta('nature').scales['6'].sprites;
    for (const t of Object.values(TER)) {
      for (let h = 0; h < 1; h += 0.02) {
        expect(nature[crownName(t, 5, h)], crownName(t, 5, h)).toBeDefined();
        expect(nature[crownName(t, 12, h)], crownName(t, 12, h)).toBeDefined();
        for (const z of Object.values(ZONE)) expect(nature[boulderName(t, z, h)], boulderName(t, z, h)).toBeDefined();
      }
    }
    const ground = Object.keys(meta('ground').scales['6'].sprites);
    for (const list of Object.values(DETAILS)) {
      for (const [fam, share] of list!) {
        expect(ground.some((n) => new RegExp(`^${fam}\\d+$`).test(n)), fam).toBe(true);
        expect(share).toBeGreaterThan(0);
      }
    }
  });
});
