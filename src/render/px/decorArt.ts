import type { NodeType, RuneKind } from '../../shared/mapgen';
import { cap, ell, eye, line, mixc, paintSprite, plate, spike, tint, type Painter } from './creaturesHD';
import { hash2, rgb, type RGB } from './pixels';

/**
 * The world's devices and decor in the creatures' high-resolution pixel style, from above: resource nodes (ore
 * boulders with veins, crystal clusters, scrap heaps, sulfur vents, fungus beds), the wrecks you scavenge, rune
 * altars and the Dead Zone gate. Each is painted once per size (and state) and cached.
 */

const cache = new Map<string, HTMLCanvasElement>();

function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 500) cache.clear();
  c = make();
  cache.set(key, c);
  return c;
}

const ROCK: RGB = [96, 88, 82];
const RUST: RGB = [132, 84, 54];

/** Boulders in a loose cluster (the base of every ore node). */
function boulders(p: Painter, seed: number, col: RGB, n: number, spread: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hash2(k, seed, 1) * 1.2, d = k === 0 ? 0 : spread * (0.55 + 0.45 * hash2(seed, k, 2));
    const r = (k === 0 ? 5.5 : 3.2) + hash2(k, seed, 3) * 2.4;
    out.push([16 + Math.cos(a) * d, 16 + Math.sin(a) * d * 0.85, r]);
  }
  // Biggest last, so it sits on top.
  out.sort((a, b) => a[2] - b[2]);
  for (const [x, y, r] of out) ell(p, x, y, r, r * 0.86, tint(col, (hash2(x | 0, y | 0) - 0.5) * 0.2), 'rock', 0.9);
  return out;
}

/** A resource node `px` across, fuller the more it holds (`fill` 0-1). */
export function nodeSprite(type: NodeType, color: string, px: number, fill: number, seed: number): HTMLCanvasElement {
  const S = Math.max(8, Math.round(px));
  const f = Math.round(Math.max(0.2, Math.min(1, fill)) * 4) / 4;
  const s = seed % 4;
  return cached(`n|${type}|${S}|${f}|${s}`, () => paintSprite(S, s * 17 + 3, (p) => {
    const col = rgb(color);
    const n = 2 + Math.round(f * 4);
    switch (type) {
      case 'scrap': {
        // A heap of plate, pipe and a tyre.
        for (let k = 0; k < 4 + n; k++) {
          const x = 7 + hash2(k, s, 1) * 18, y = 8 + hash2(s, k, 2) * 16, w = 4 + hash2(k, s, 3) * 6;
          plate(p, x - w / 2, y - 1.5, w, 3 + hash2(k, s, 4) * 2, k % 3 ? tint(RUST, (hash2(k, 5) - 0.5) * 0.4) : [110, 118, 128], 'metal');
        }
        cap(p, 9, 21, 19, 11, 1.1, 1.1, [80, 86, 94], 'metal');
        ell(p, 22, 21, 3.4, 3.4, [30, 30, 32], 'rock');
        ell(p, 22, 21, 1.4, 1.4, [70, 60, 50], 'none', 0.5, 0, false);
        break;
      }
      case 'cryo':
      case 'xenite':
      case 'uranium': {
        // Crystals breaking out of the rock, glowing.
        boulders(p, s, type === 'uranium' ? [70, 76, 66] : ROCK, 2 + Math.round(f * 2), 6);
        const m = 3 + Math.round(f * 4);
        for (let k = 0; k < m; k++) {
          const a = (k / m) * Math.PI * 2 + hash2(k, s) * 0.8;
          const len = 5 + hash2(s, k, 7) * 7 * f + 3;
          const bx = 16 + Math.cos(a) * 2, by = 16 + Math.sin(a) * 2;
          spike(p, bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len * 0.85, 3 + hash2(k, s, 8) * 1.5, tint(col, -0.1));
        }
        spike(p, 15, 17, 16.5, 8 - f * 3, 4, tint(col, 0.1));
        eye(p, 16, 15, col, 1.3 + f);
        break;
      }
      case 'sulfur': {
        // A crusted cone around a steaming vent.
        ell(p, 16, 16, 12, 10, [150, 130, 60], 'rock', 0.6);
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          ell(p, 16 + Math.cos(a) * 8, 16 + Math.sin(a) * 6.8, 2.6, 2.2, tint(col, -0.1 + hash2(k, s) * 0.2), 'rock');
        }
        ell(p, 16, 16, 4.2 * (0.6 + f * 0.4), 3.6 * (0.6 + f * 0.4), [40, 30, 10], 'rock', 0.3);
        eye(p, 16, 16, [255, 170, 40], 1.4);
        break;
      }
      case 'biomass': {
        // A bed of fungus caps, gills glowing.
        for (let k = 0; k < 3 + n; k++) {
          const x = 8 + hash2(k, s, 1) * 16, y = 8 + hash2(s, k, 2) * 16, r = 2.5 + hash2(k, s, 3) * 3.5 * (0.6 + f * 0.4);
          ell(p, x + 0.6, y + 0.6, r, r, [40, 70, 60], 'skin', 0.6);
          ell(p, x, y, r, r, tint(col, (hash2(k, 4) - 0.5) * 0.3), 'skin', 1.1);
          for (let d = 0; d < 3; d++) eye(p, x + (hash2(k, d) - 0.5) * r, y + (hash2(d, k) - 0.5) * r, [120, 255, 210], 0.25);
        }
        break;
      }
      default: {
        // Ore: boulders shot through with coloured veins and nuggets.
        const rocks = boulders(p, s, type === 'titanium' ? [110, 116, 128] : ROCK, n, 9);
        for (const [x, y, r] of rocks) {
          for (let k = 0; k < 3; k++) {
            const a = hash2(k, x | 0, y | 0) * Math.PI * 2;
            line(p, x - Math.cos(a) * r * 0.6, y - Math.sin(a) * r * 0.5, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.4, tint(col, 0.1));
          }
          // Nuggets of the ore breaking the surface.
          ell(p, x + r * 0.25, y - r * 0.2, r * 0.34, r * 0.3, col, 'chitin', 1.2);
          ell(p, x - r * 0.3, y + r * 0.25, r * 0.22, r * 0.2, tint(col, -0.1), 'chitin', 1.2);
        }
      }
    }
  }));
}

/** A wreck to scavenge: a burnt-out hauler half in the sand, a lit crate when there's loot in it. */
export function siteSprite(name: string, px: number, ready: boolean, seed: number): HTMLCanvasElement {
  const S = Math.max(10, Math.round(px));
  const kind = /train/i.test(name) ? 'train' : /tank|tanker/i.test(name) ? 'tanker' : /truck|hauler|salt/i.test(name) ? 'truck' : 'ruin';
  return cached(`s|${kind}|${S}|${ready}|${seed % 3}`, () => paintSprite(S, seed % 3 + 5, (p) => {
    // Drifted sand around it.
    ell(p, 16, 16, 14, 11, [176, 146, 100], 'rock', 0.4, 0.2);
    if (kind === 'ruin') {
      // Broken walls and a doorway.
      plate(p, 5, 6, 22, 3, [120, 112, 100], 'rock');
      plate(p, 5, 6, 3, 18, [120, 112, 100], 'rock');
      plate(p, 20, 6, 3, 12, [110, 104, 94], 'rock');
      for (let k = 0; k < 5; k++) ell(p, 10 + hash2(k, 9) * 14, 12 + hash2(9, k) * 12, 1.6, 1.4, [100, 94, 86], 'rock');
    } else if (kind === 'train') {
      for (let k = 0; k < 3; k++) {
        plate(p, 3 + k * 9, 11 + k * 1.2, 8, 9, k ? [96, 70, 52] : [70, 76, 84], 'metal');
        plate(p, 4 + k * 9, 12 + k * 1.2, 6, 2, [40, 40, 44], 'none');
      }
    } else {
      // Cab and a trailer (or a tank), skewed where it slewed to a stop.
      const trailerCol: RGB = kind === 'tanker' ? [150, 150, 150] : [120, 80, 50];
      if (kind === 'tanker') {
        cap(p, 5, 15, 20, 17, 4.6, 4.6, trailerCol, 'metal');
        for (let k = 0; k < 4; k++) line(p, 7 + k * 4, 11, 7 + k * 4, 21.5, tint(trailerCol, -0.4));
      } else plate(p, 4, 11, 17, 10, trailerCol, 'metal');
      plate(p, 21, 12, 7, 8, [90, 54, 40], 'metal');
      plate(p, 24.5, 13, 2.5, 6, [40, 60, 70], 'none');
      for (const [wx, wy] of [[7, 10.5], [7, 21.5], [16, 10.5], [16, 21.5], [25, 11.5], [25, 20.5]]) ell(p, wx, wy, 1.8, 1.1, [26, 24, 24], 'rock', 0.6);
      // Scorch and rust.
      for (let k = 0; k < 4; k++) ell(p, 8 + hash2(k, 3) * 14, 13 + hash2(3, k) * 6, 1.4, 1.2, [50, 36, 28], 'rock', 0.4, 0, false);
    }
    if (ready) {
      plate(p, 13, 23, 6, 4, [200, 150, 40], 'metal');
      plate(p, 14, 24.3, 4, 1, [110, 70, 20], 'none');
      eye(p, 16, 25, [255, 220, 90], 1.1);
    }
  }));
}

/** A rune altar: a ring of standing stones round a floating crystal in the rune's colour. */
export function altarSprite(rune: RuneKind, color: string, px: number, ready: boolean, t: number): HTMLCanvasElement {
  const S = Math.max(10, Math.round(px));
  const ph = Math.floor(t * 4) % 4;
  return cached(`a|${rune}|${S}|${ready}|${ph}`, () => paintSprite(S, 11, (p) => {
    const col = rgb(color);
    ell(p, 16, 16, 12.5, 12.5, [58, 54, 62], 'rock', 0.35);
    ell(p, 16, 16, 9, 9, [40, 38, 46], 'rock', 0.3, 0, false);
    // Glyphs cut into the floor, lit when it's charged.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (ready) eye(p, 16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, col, 0.35);
      else line(p, 16 + Math.cos(a) * 6.4, 16 + Math.sin(a) * 6.4, 16 + Math.cos(a) * 7.6, 16 + Math.sin(a) * 7.6, [24, 22, 28]);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      ell(p, 16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 2.3, 2.3, [110, 104, 116], 'rock', 1.4);
    }
    const bob = ready ? [0, 0.4, 0.7, 0.4][ph] : 0;
    spike(p, 16, 17 + bob, 16, 9 + bob, 4, ready ? col : mixc(col, [60, 60, 70], 0.7));
    spike(p, 16, 15 + bob, 16, 22 + bob, 4, ready ? tint(col, -0.2) : mixc(col, [40, 40, 50], 0.7));
    if (ready) eye(p, 16, 15.5 + bob, col, 1.6);
  }));
}

/** The Dead Zone gate: a ring of black stone and machinery around a turning purple rift. */
export function gateSprite(px: number, t: number): HTMLCanvasElement {
  const S = Math.max(16, Math.round(px));
  const ph = Math.floor(t * 6) % 6;
  return cached(`g|${S}|${ph}`, () => paintSprite(S, 21, (p) => {
    ell(p, 16, 16, 14.5, 14.5, [40, 36, 48], 'metal', 0.5);
    ell(p, 16, 16, 10.5, 10.5, [26, 10, 40], 'glow', 0.3, 0, false);
    for (let k = 0; k < 3; k++) {
      const a0 = (ph / 6) * Math.PI * 2 + (k * Math.PI * 2) / 3;
      for (let s = 0; s < 10; s++) {
        const a = a0 + s * 0.22, r = 9 - s * 0.7;
        eye(p, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, [224, 64, 251], 0.55 - s * 0.03);
      }
    }
    eye(p, 16, 16, [255, 200, 255], 1.6);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      plate(p, 16 + Math.cos(a) * 13 - 1.5, 16 + Math.sin(a) * 13 - 1.5, 3, 3, [70, 66, 80], 'metal');
      eye(p, 16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, [224, 64, 251], 0.3);
    }
  }));
}
