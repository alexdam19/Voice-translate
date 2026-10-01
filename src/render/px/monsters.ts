import { cap, claws, ell, eye, line, plate, spike, tint, type Pal, type Painter } from './creaturesHD';
import type { RGB } from './pixels';

/**
 * The monsters: body plans of their own for the Crater's worst, drawn from above facing right on the creatures'
 * 32-unit grid with the same painter (lit volumes on hue-shifted ramps, dithered, outlined).
 *
 * - Brutes knuckle-walk on fists the size of cars, bone plates down a hunched back, a small horned head slung low
 *   between the shoulders, tusks forward.
 * - Colossi are giants in armour: spiked pauldrons, a fist and a weapon (a hammer, a cleaver, an axe), a horned helm
 *   with a burning visor, in their element: lava seams for fire, ice spikes for frost, moss and rock for stone, rust
 *   and rivets for machines, weed and drips for the drowned, ribs and a skull for bone.
 * - Wraiths are hooded cloaks dragging a torn trail, two skeletal arms reaching out with long claws.
 * - The bosses each have their own: Warlord Krag's spiked armour, horned crest and great axe; the Abomination's three
 *   stitched heads and hooked arms; the Overmind's naked brain with its tentacles and three eyes; the Lich King's
 *   tattered robe, crowned skull, staff and orbiting skulls; the Brood Queen's egg sac, mandibles and folded wings;
 *   the Devourer, a walking maw ringed with teeth; the Spire, an eye in a crown of crystal shards.
 */

export type Species = 'brute' | 'colossus' | 'warlord' | 'wraith' | 'abomination' | 'overmind' | 'lich' | 'queen' | 'devourer' | 'spire';
export type Element = 'fire' | 'frost' | 'stone' | 'metal' | 'water' | 'bone' | 'storm' | 'sand' | 'none';

/** The monster an enemy is drawn as (and its element), or none for the archetype's own plan. */
export function speciesFor(kind: string, name = '', arch?: string): { species: Species; element: Element } | null {
  // Only what used to be drawn as a lump of rock or a ball of light (golems, entities) gets a monster of its own.
  if (arch && arch !== 'golem' && arch !== 'entity') return null;
  if (kind.includes('part')) return null;
  const n = `${kind} ${name}`.toLowerCase();
  const has = (...w: string[]): boolean => w.some((k) => n.includes(k));
  const element: Element = has('fire', 'lava', 'magma', 'obsidian', 'radiation') ? 'fire'
    : has('frost', 'snow', 'ice', 'cryo') ? 'frost'
      : has('storm') ? 'storm'
        : has('water', 'drowned', 'lake', 'sewer') ? 'water'
          : has('bone', 'skel', 'fallen') ? 'bone'
            : has('rust', 'factory', 'scrap', 'debris', 'goliath', 'forge', 'walker') ? 'metal'
              : has('sand', 'dune', 'canyon') ? 'sand'
                : has('stone', 'rock', 'ancient', 'rune', 'guardian', 'gatekeeper', 'ash') ? 'stone' : 'none';
  if (has('warlord')) return { species: 'warlord', element: 'metal' };
  if (has('abomination')) return { species: 'abomination', element: 'none' };
  if (has('overmind')) return { species: 'overmind', element: 'none' };
  if (has('lich')) return { species: 'lich', element: 'bone' };
  if (has('queen', 'brood')) return { species: 'queen', element: 'none' };
  if (has('devourer')) return { species: 'devourer', element: 'none' };
  if (has('the_spire', 'the spire')) return { species: 'spire', element: 'none' };
  if (has('wraith', 'phantom', 'void', 'the_drowned', 'the drowned')) return { species: has('wyrm') ? 'colossus' : 'wraith', element };
  if (has('troll', 'brute', 'giant', 'golem') && !has('colossus')) return { species: 'brute', element };
  if (has('colossus', 'titan', 'behemoth', 'guardian', 'gatekeeper', 'goliath', 'colossal walker')) return { species: 'colossus', element };
  return null;
}

type MPlan = (p: Painter, c: Pal, f: number, el: Element) => void;

const BONE: RGB = [226, 214, 190];
const GOLD: RGB = [230, 180, 60];
const BLOOD: RGB = [150, 20, 24];
const THROAT: RGB = [60, 6, 12];

/** Decoration for a body part in its element: glowing seams, ice, moss, rivets, weed, bone. */
function elemental(p: Painter, el: Element, x: number, y: number, r: number, c: Pal, seed: number): void {
  switch (el) {
    case 'fire':
      for (let k = 0; k < 6; k++) {
        const a = seed + k * 1.9;
        line(p, x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, x + Math.cos(a + 0.4) * r * 0.8, y + Math.sin(a + 0.4) * r * 0.8, [255, 140, 30]);
      }
      eye(p, x, y, [255, 170, 60], r * 0.18);
      break;
    case 'frost':
      for (let k = 0; k < 3; k++) {
        const a = seed + k * 2.1;
        spike(p, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, x + Math.cos(a) * (r + 2.2), y + Math.sin(a) * (r + 2.2), 1.2, [190, 230, 255]);
      }
      break;
    case 'stone':
    case 'sand':
      for (let k = 0; k < 4; k++) ell(p, x + Math.cos(seed + k * 1.6) * r * 0.5, y + Math.sin(seed + k * 1.6) * r * 0.5, r * 0.3, r * 0.24, el === 'sand' ? [190, 160, 110] : [70, 100, 60], 'rock', 0.6, 0, false);
      break;
    case 'metal':
      for (let k = 0; k < 6; k++) eye(p, x + Math.cos(seed + k) * r * 0.65, y + Math.sin(seed + k) * r * 0.65, [200, 205, 215], 0.22);
      line(p, x - r * 0.6, y, x + r * 0.6, y, tint(c.dark, -0.3));
      ell(p, x + r * 0.2, y - r * 0.3, r * 0.25, r * 0.2, [140, 70, 40], 'rock', 0.5, 0, false);
      break;
    case 'water':
      for (let k = 0; k < 4; k++) cap(p, x + Math.cos(seed + k * 1.5) * r * 0.4, y + Math.sin(seed + k * 1.5) * r * 0.4, x + Math.cos(seed + k * 1.5) * r * 0.4 - 2.4, y + Math.sin(seed + k * 1.5) * r * 0.4 + 0.6, 0.35, 0.25, [50, 90, 60], 'skin');
      break;
    case 'bone':
      for (let k = 0; k < 3; k++) line(p, x - r * 0.5, y - r * 0.5 + k * r * 0.5, x + r * 0.3, y - r * 0.5 + k * r * 0.5, BONE);
      break;
    case 'storm':
      for (let k = 0; k < 3; k++) {
        const a = seed + k * 2;
        line(p, x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, [180, 220, 255]);
      }
      eye(p, x, y, [200, 230, 255], r * 0.15);
      break;
    default:
  }
}

const PLANS: Record<Species, MPlan> = {
  /* ---- A knuckle-walking brute ---- */
  brute: (p, c, f, el) => {
    const st = f ? 1 : -1;
    // Short hind legs and splayed feet.
    for (const sd of [-1, 1]) {
      const fx = 6.5 - sd * st * 1.2, fy = 16 + sd * 6.8;
      cap(p, 9.5, 16 + sd * 3.5, fx, fy, 2, 1.7, c.dark, 'fur');
      ell(p, fx - 0.6, fy, 2.1, 1.8, c.dark, 'skin');
      claws(p, fx - 1.6, fy, Math.PI, 3, 1.1, c.claw);
    }
    // The hunched torso and a hump of muscle over the shoulders.
    ell(p, 12.5, 16, 7.6, 6.6, c.body, 'fur');
    ell(p, 18, 16, 6.2, 8.6, tint(c.body, 0.06), 'fur');
    // Bone plates down the spine.
    for (let k = 0; k < 4; k++) spike(p, 9 + k * 3.2, 16, 6.6 + k * 3.2, 16 + (k % 2 ? -1.2 : 1.2), 2.4, c.bone);
    elemental(p, el, 13, 16, 5.4, c, 1.3);
    // Arms like pillars onto fists the size of the head, knuckle spikes forward.
    for (const sd of [-1, 1]) {
      const fx = 26 + sd * st * 1.4, fy = 16 + sd * 9.2;
      cap(p, 19, 16 + sd * 6, fx - 1, fy - sd * 0.4, 2.8, 2.4, c.body, 'fur');
      ell(p, fx, fy, 3, 2.6, tint(c.dark, 0.1), 'skin');
      for (let k = 0; k < 3; k++) spike(p, fx + 2, fy - 1.4 + k * 1.4, fx + 3.6, fy - 1.6 + k * 1.6, 0.8, c.bone);
    }
    // The head, slung low between the shoulders: tusks forward, horns swept back.
    ell(p, 24, 16, 3.1, 3.3, tint(c.body, -0.05), 'skin');
    spike(p, 25.5, 14.3, 28.6, 12.6, 1.2, c.bone);
    spike(p, 25.5, 17.7, 28.6, 19.4, 1.2, c.bone);
    spike(p, 22.6, 13.6, 19.6, 11.2, 1.5, c.bone);
    spike(p, 22.6, 18.4, 19.6, 20.8, 1.5, c.bone);
    eye(p, 25.6, 15, c.eye, 0.55);
    eye(p, 25.6, 17, c.eye, 0.55);
  },
  /* ---- An armoured giant with a weapon ---- */
  colossus: (p, c, f, el) => {
    const st = f ? 1 : -1;
    const armour = el === 'bone' ? tint(BONE, -0.15) : el === 'frost' ? tint(c.body, 0.15) : el === 'metal' ? tint(c.metal, 0.1) : tint(c.body, -0.15);
    // Feet striding beneath.
    ell(p, 11 + st * 1.6, 11.2, 2.8, 1.9, c.dark, 'rock');
    ell(p, 11 - st * 1.6, 20.8, 2.8, 1.9, c.dark, 'rock');
    // A cloak or tail of rubble trailing.
    cap(p, 9, 16, 4, 16 + st, 3, 1.4, tint(c.dark, -0.1), el === 'bone' ? 'cloth' : 'rock');
    // The body, then the great pauldrons with their spikes.
    ell(p, 14.5, 16, 6.4, 8.4, c.body, el === 'metal' ? 'metal' : 'rock');
    elemental(p, el, 14, 16, 5.2, c, 0.7);
    for (const sd of [-1, 1]) {
      ell(p, 16, 16 + sd * 8.6, 4.2, 3.6, armour, el === 'metal' ? 'metal' : 'rock');
      for (let k = 0; k < 3; k++) spike(p, 14 + k * 2, 16 + sd * 10.5, 13 + k * 2.4, 16 + sd * 14, 1.3, el === 'frost' ? [200, 235, 255] : c.bone);
      elemental(p, el, 16, 16 + sd * 8.6, 3, c, 2 + sd);
    }
    // The weapon arm: a hammer out ahead. The other: a fist.
    cap(p, 18, 23.5, 24, 22, 2.2, 1.8, c.body, 'rock');
    ell(p, 25, 21.6, 2, 1.8, c.dark, 'skin');
    plate(p, 24.4, 20.8, 7.4, 1.4, [70, 56, 44], 'metal');
    plate(p, 28.4, 17.2, 3.4, 8.4, el === 'fire' ? [90, 40, 30] : [80, 84, 96], 'metal');
    if (el === 'fire') eye(p, 30, 21.4, [255, 150, 40], 1.2);
    cap(p, 18, 8.5, 24.5, 9 + st * 0.8, 2.2, 1.9, c.body, 'rock');
    ell(p, 25.6, 9 + st * 0.8, 2.4, 2.2, c.dark, 'skin');
    for (let k = 0; k < 3; k++) spike(p, 27.4, 8 + st * 0.8 + k, 29, 7.6 + st * 0.8 + k * 1.2, 0.6, c.claw);
    // The helm: horns swept forward, a visor slit burning.
    ell(p, 20, 16, 3.4, 3.4, armour, el === 'metal' ? 'metal' : 'rock');
    if (el === 'bone') {
      ell(p, 21, 16, 2.6, 2.4, BONE, 'rock');
      eye(p, 22, 15, [255, 60, 40], 0.6);
      eye(p, 22, 17, [255, 60, 40], 0.6);
    } else {
      plate(p, 21.6, 14.6, 1.1, 2.8, [20, 14, 16], 'none');
      eye(p, 22.2, 15.2, c.eye, 0.5);
      eye(p, 22.2, 16.8, c.eye, 0.5);
    }
    spike(p, 21, 13.2, 24.2, 10.4, 1.4, c.bone);
    spike(p, 21, 18.8, 24.2, 21.6, 1.4, c.bone);
  },
  /* ---- Warlord Krag: spiked armour, a crest, a great axe, chains ---- */
  warlord: (p, c, f) => {
    const st = f ? 1 : -1;
    ell(p, 11 + st * 1.6, 11, 2.8, 2, [40, 34, 30], 'cloth');
    ell(p, 11 - st * 1.6, 21, 2.8, 2, [40, 34, 30], 'cloth');
    ell(p, 14, 16, 6.4, 8.2, [96, 62, 44], 'skin');
    // Chain across the chest, skull trophies.
    for (let k = 0; k < 7; k++) eye(p, 11 + k * 1.1, 10 + k * 1.9, [170, 170, 176], 0.35);
    for (const sd of [-1, 1]) {
      ell(p, 15.5, 16 + sd * 8.4, 4.3, 3.6, c.metal, 'metal');
      for (let k = 0; k < 4; k++) spike(p, 13 + k * 1.6, 16 + sd * 10.6, 11.5 + k * 2, 16 + sd * 14.5, 1.1, BONE);
      ell(p, 17, 16 + sd * 8.6, 1.3, 1.2, BONE, 'rock');
      eye(p, 17.6, 16 + sd * 8.4, BLOOD, 0.3);
    }
    // The great axe in both hands, out ahead and to the side.
    cap(p, 18, 9, 23.5, 12, 1.9, 1.6, [96, 62, 44], 'skin');
    cap(p, 18, 23, 23.5, 20, 1.9, 1.6, [96, 62, 44], 'skin');
    plate(p, 22, 15.2, 9, 1.6, [70, 50, 34], 'metal');
    for (const sd of [-1, 1]) {
      spike(p, 29, 16, 31.6, 16 + sd * 5.4, 4.4, [150, 156, 168]);
      spike(p, 29.6, 16 + sd * 1.6, 31.8, 16 + sd * 2.4, 1.3, [220, 226, 236]);
    }
    // Head: a horned helm and a red crest down the back.
    ell(p, 20, 16, 3.3, 3.3, c.metal, 'metal');
    for (let k = 0; k < 5; k++) spike(p, 18.8 - k * 0.9, 16, 16.8 - k * 1.2, 16, 1.2, [200, 30, 30]);
    spike(p, 21, 13, 24.6, 9.6, 1.5, BONE);
    spike(p, 21, 19, 24.6, 22.4, 1.5, BONE);
    eye(p, 22.4, 15.2, c.eye, 0.5);
    eye(p, 22.4, 16.8, c.eye, 0.5);
  },
  /* ---- A hooded wraith reaching out ---- */
  wraith: (p, c, f) => {
    const wv = f ? 1 : -1;
    // The torn trail behind, fading.
    for (let k = 0; k < 6; k++) {
      const t = k / 5;
      ell(p, 9 - t * 7, 16 + Math.sin(t * 4 + wv) * 2.4, 4.6 - t * 2.6, 3.8 - t * 2.2, tint(c.body, -0.25 - t * 0.2), 'glow', 0.5, 0, false);
    }
    // The cloak, ragged at the hem.
    ell(p, 13.5, 16, 6.8, 6.2, tint(c.dark, 0.05), 'cloth');
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * 0.55 + (k / 6) * Math.PI * 0.9;
      spike(p, 13.5 + Math.cos(a) * 5.6, 16 + Math.sin(a) * 5.2, 13.5 + Math.cos(a) * 9 - 1, 16 + Math.sin(a) * 8.4 + wv * 0.6, 2, tint(c.dark, -0.05));
    }
    // Skeletal arms reaching forward, long claws.
    for (const sd of [-1, 1]) {
      const hx = 26 + wv * sd * 0.8, hy = 16 + sd * 6.8;
      cap(p, 17, 16 + sd * 4.4, hx, hy, 0.75, 0.55, BONE, 'rock');
      for (let k = 0; k < 3; k++) spike(p, hx, hy, hx + 3.6, hy + sd * (-1 + k), 0.45, [240, 240, 236]);
    }
    // The hood, shadow under it, two burning eyes.
    ell(p, 19, 16, 4, 3.8, tint(c.dark, -0.15), 'cloth');
    ell(p, 20.6, 16, 2.3, 2.3, [10, 8, 14], 'none', 0.2, 0, false);
    eye(p, 21.3, 15, c.eye, 0.7);
    eye(p, 21.3, 17, c.eye, 0.7);
  },
  /* ---- The Abomination: three stitched heads, hooked arms ---- */
  abomination: (p, c, f) => {
    const st = f ? 1 : -1;
    const flesh: RGB = [176, 120, 120];
    // Stubby legs, many.
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) {
      const lx = 8 + k * 4;
      cap(p, lx, 16 + sd * 5, lx - 1 + st * sd * (k % 2 ? 1 : -1), 16 + sd * 9.5, 1.6, 1.3, tint(flesh, -0.25), 'skin');
    }
    // The heaving mass, stitched together.
    ell(p, 14, 16, 9, 8.2, flesh, 'skin');
    ell(p, 11, 12.5, 4, 3, tint(flesh, -0.15), 'skin', 0.8, 0, false);
    for (const [x0, y0, x1, y1] of [[7, 12, 18, 9], [8, 20, 19, 23], [13, 10, 13, 22]]) {
      line(p, x0, y0, x1, y1, [60, 30, 34]);
      for (let k = 0; k <= 6; k++) {
        const x = x0 + ((x1 - x0) * k) / 6, y = y0 + ((y1 - y0) * k) / 6;
        line(p, x - 0.5, y - 0.6, x + 0.5, y + 0.6, [30, 14, 16]);
      }
    }
    // Bone spikes through the back.
    for (let k = 0; k < 4; k++) spike(p, 9 + k * 2.6, 13 + (k % 2) * 6, 5.5 + k * 2.6, 9 + (k % 2) * 14, 1.4, BONE);
    // Hooked arms forward.
    for (const sd of [-1, 1]) {
      const hx = 27 + st * sd, hy = 16 + sd * 10.4;
      cap(p, 18, 16 + sd * 6, hx, hy, 1.9, 1.2, tint(flesh, -0.1), 'skin');
      spike(p, hx, hy, hx + 2.8, hy - sd * 2.6, 1.2, [200, 200, 205]);
      spike(p, hx + 2.6, hy - sd * 2.4, hx + 1.4, hy - sd * 4.2, 0.8, [200, 200, 205]);
    }
    // Three heads, each a maw.
    for (const [hx, hy, r] of [[24, 16, 3.4], [20.5, 8.6, 2.6], [20.5, 23.4, 2.6]]) {
      ell(p, hx, hy, r, r, tint(flesh, -0.05), 'skin');
      ell(p, hx + r * 0.45, hy, r * 0.55, r * 0.4, THROAT, 'none', 0.3, 0, false);
      for (let k = 0; k < 4; k++) spike(p, hx + r * 0.2, hy - r * 0.3 + k * r * 0.2, hx + r * 0.75, hy - r * 0.3 + k * r * 0.2, 0.4, BONE);
      eye(p, hx - r * 0.2, hy - r * 0.55, c.eye, 0.4);
      eye(p, hx - r * 0.2, hy + r * 0.55, c.eye, 0.4);
    }
  },
  /* ---- The Overmind: a brain on tentacles ---- */
  overmind: (p, c, f) => {
    const wv = f ? 1 : -1;
    // Tentacles all round, curling.
    for (let k = 0; k < 8; k++) {
      const a = Math.PI * 0.35 + (k / 7) * Math.PI * 1.3;
      for (let s = 0; s < 8; s++) {
        const t = s / 7;
        const ra = a + Math.sin(t * 3 + wv + k) * 0.25 * t;
        ell(p, 15 + Math.cos(ra) * (6 + t * 9), 16 + Math.sin(ra) * (6 + t * 9), 1.6 - t * 1.1, 1.6 - t * 1.1, tint(c.dark, 0.1 - t * 0.2), 'skin', 1, 0, s === 7);
      }
    }
    // A psychic halo, the brain, its folds and the great fissure.
    ell(p, 16, 16, 11, 10, tint(c.body, 0.2), 'glow', 0.25, 0, false);
    const brain: RGB = [222, 150, 170];
    ell(p, 16, 16, 9, 8, brain, 'skin', 1.2);
    for (let k = 0; k < 7; k++) {
      const y = 10 + k * 2;
      for (let x = 8.5; x < 23.5; x += 0.5) {
        const yy = y + Math.sin(x * 1.3 + k * 2) * 0.7;
        if (Math.hypot((x - 16) / 9, (yy - 16) / 8) < 0.92) line(p, x, yy, x + 0.5, yy + Math.sin((x + 0.5) * 1.3 + k * 2) * 0.7 - Math.sin(x * 1.3 + k * 2) * 0.7, [150, 80, 100]);
      }
    }
    line(p, 8, 16, 24, 16, [110, 50, 70]);
    // Three eyes on the front lobe.
    for (const [x, y] of [[24.4, 16], [22.6, 12.4], [22.6, 19.6]]) {
      ell(p, x, y, 1.6, 1.6, [240, 236, 220], 'skin');
      eye(p, x + 0.4, y, c.eye, 0.75);
    }
  },
  /* ---- The Lich King: robe, crowned skull, staff, orbiting skulls ---- */
  lich: (p, c, f) => {
    const spin = f * 0.5;
    // Skulls in orbit.
    for (let k = 0; k < 6; k++) {
      const a = spin + (k / 6) * Math.PI * 2;
      const x = 15 + Math.cos(a) * 13, y = 16 + Math.sin(a) * 13;
      ell(p, x, y, 1.4, 1.3, BONE, 'rock');
      eye(p, x + 0.5, y - 0.4, [120, 255, 160], 0.3);
      eye(p, x + 0.5, y + 0.4, [120, 255, 160], 0.3);
    }
    // The tattered robe.
    ell(p, 14, 16, 8.4, 8, tint(c.body, -0.35), 'cloth');
    for (let k = 0; k < 10; k++) {
      const a = Math.PI * 0.45 + (k / 9) * Math.PI * 1.1;
      spike(p, 14 + Math.cos(a) * 7.2, 16 + Math.sin(a) * 7, 14 + Math.cos(a) * 10.4, 16 + Math.sin(a) * 10, 1.8, tint(c.body, -0.45));
    }
    ell(p, 15, 16, 5, 6, tint(c.body, -0.15), 'cloth', 0.8, 0, false);
    line(p, 11, 16, 20, 16, GOLD);
    // The staff, its orb burning green.
    plate(p, 13, 22.6, 17, 1.2, [70, 50, 34], 'metal');
    cap(p, 17, 21, 21, 23, 0.8, 0.6, BONE, 'rock');
    ell(p, 30, 23.2, 1.9, 1.9, [120, 255, 160], 'glow');
    eye(p, 30, 23.2, [220, 255, 230], 1.2);
    // A bony hand reaching forward.
    cap(p, 17, 11, 24, 9.5, 0.6, 0.5, BONE, 'rock');
    for (let k = 0; k < 4; k++) spike(p, 24, 9.5, 27.2, 8 + k, 0.35, BONE);
    // The crowned skull.
    ell(p, 19.5, 16, 3.2, 3, BONE, 'rock');
    for (let k = 0; k < 5; k++) {
      const a = Math.PI * 0.6 + (k / 4) * Math.PI * 0.8;
      spike(p, 19.5 + Math.cos(a) * 2.6, 16 + Math.sin(a) * 2.6, 19.5 + Math.cos(a) * 4.6, 16 + Math.sin(a) * 4.6, 1, GOLD);
    }
    ell(p, 20.8, 15, 0.8, 0.8, [16, 10, 14], 'none', 0.2, 0, false);
    ell(p, 20.8, 17, 0.8, 0.8, [16, 10, 14], 'none', 0.2, 0, false);
    eye(p, 20.9, 15, [120, 255, 160], 0.5);
    eye(p, 20.9, 17, [120, 255, 160], 0.5);
  },
  /* ---- The Brood Queen: egg sac, armoured thorax, mandibles ---- */
  queen: (p, c, f) => {
    const st = f ? 1.4 : -1.4;
    // Six long legs.
    for (const [lx, sd, ph] of [[15, -1, 1], [15, 1, -1], [19, -1, -1], [19, 1, 1], [22, -1, 1], [22, 1, -1]]) {
      const kx = lx + st * ph, ky = 16 + sd * 9;
      const fx = kx + 3 * (lx > 18 ? 1 : -1), fy = ky + sd * 4.6;
      cap(p, lx, 16 + sd * 3, kx, ky, 0.9, 0.8, c.dark, 'chitin');
      cap(p, kx, ky, fx, fy, 0.8, 0.45, c.dark, 'chitin');
    }
    // The egg sac, veined, eggs showing through.
    ell(p, 8.5, 16, 8.4, 7, [214, 196, 160], 'skin');
    for (let k = 0; k < 9; k++) ell(p, 4.5 + (k % 3) * 3.2, 12 + Math.floor(k / 3) * 3.6, 1.1, 0.9, [240, 230, 190], 'skin', 0.8, 0, false);
    for (let k = 0; k < 4; k++) line(p, 2.5, 13 + k * 2, 14, 12 + k * 3, [150, 90, 90]);
    // Wings folded over the sac.
    ell(p, 11, 13, 6, 2.2, [180, 200, 210], 'membrane', 0.4, -0.2);
    ell(p, 11, 19, 6, 2.2, [180, 200, 210], 'membrane', 0.4, 0.2);
    // The armoured thorax and head, a crown of spikes, mandibles.
    ell(p, 18.5, 16, 4.6, 4.8, c.body, 'chitin');
    for (let k = 0; k < 3; k++) spike(p, 17 + k * 1.6, 12, 16 + k * 1.8, 8.8, 1.1, c.dark);
    for (let k = 0; k < 3; k++) spike(p, 17 + k * 1.6, 20, 16 + k * 1.8, 23.2, 1.1, c.dark);
    ell(p, 24.4, 16, 3.4, 3.6, tint(c.body, 0.1), 'chitin');
    for (const sd of [-1, 1]) {
      spike(p, 26.4, 16 + sd * 1.6, 31, 16 + sd * 3.6, 1.6, c.claw);
      spike(p, 30.6, 16 + sd * 3.5, 29.6, 16 + sd * 1.2, 0.8, c.claw);
    }
    for (const [x, y] of [[25.6, 14.4], [25.6, 17.6], [24.2, 13.4], [24.2, 18.6]]) eye(p, x, y, c.eye, 0.45);
  },
  /* ---- The Devourer: a walking maw ---- */
  devourer: (p, c, f) => {
    const wv = f ? 1 : -1;
    // Hooked tentacle-legs all round.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + wv * 0.12;
      const x1 = 16 + Math.cos(a) * 15, y1 = 16 + Math.sin(a) * 15;
      cap(p, 16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, x1, y1, 2, 1, c.dark, 'skin');
      spike(p, x1, y1, x1 + Math.cos(a + 1.2) * 2, y1 + Math.sin(a + 1.2) * 2, 0.8, BONE);
    }
    // The body is the mouth: a ring of flesh, rows of teeth, the throat.
    ell(p, 16, 16, 11.4, 11.4, c.body, 'skin');
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      eye(p, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10, c.eye, 0.42);
    }
    ell(p, 16, 16, 8, 8, THROAT, 'skin', 0.4);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      spike(p, 16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8, 16 + Math.cos(a + 0.15) * 5.4, 16 + Math.sin(a + 0.15) * 5.4, 1.1, BONE);
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      spike(p, 16 + Math.cos(a) * 5, 16 + Math.sin(a) * 5, 16 + Math.cos(a + 0.2) * 2.8, 16 + Math.sin(a + 0.2) * 2.8, 0.8, tint(BONE, -0.1));
    }
    ell(p, 16, 16, 2.4, 2.4, [20, 2, 6], 'none', 0.2, 0, false);
    eye(p, 16, 16, [255, 60, 30], 0.9);
  },
  /* ---- The Spire: an eye in a crown of crystal ---- */
  spire: (p, c, f) => {
    const spin = f * 0.35;
    for (let k = 0; k < 9; k++) {
      const a = spin + (k / 9) * Math.PI * 2;
      const r0 = 6, r1 = 13 + (k % 3) * 1.4;
      spike(p, 16 + Math.cos(a) * r0, 16 + Math.sin(a) * r0, 16 + Math.cos(a) * r1, 16 + Math.sin(a) * r1, 3.2, tint(c.body, (k % 2) * 0.25));
    }
    ell(p, 16, 16, 7.6, 7.6, tint(c.body, -0.3), 'chitin');
    ell(p, 16, 16, 5.4, 4.2, [240, 230, 250], 'skin');
    ell(p, 16.8, 16, 2.8, 3.4, c.eye, 'glow');
    ell(p, 17.2, 16, 1, 2.6, [12, 6, 20], 'none', 0.2, 0, false);
    eye(p, 15.4, 14.6, [255, 255, 255], 0.5);
  },
};

/** Paints a monster into a painter (in place of its archetype's plan). */
export function paintMonster(p: Painter, c: Pal, f: number, sp: Species, el: Element): void {
  PLANS[sp](p, c, f, el);
}
