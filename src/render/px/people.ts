import type { Act } from '../../game/aboard';
import { makeCanvas, ctx2d, rgb, hex, type RGB } from './pixels';

/**
 * The crew in 16-bit style: 8 x 14 pixel people with a dark outline, three-tone uniforms in their department's
 * colour, skin with a shadow side, a hat for the job (steel helmets on the guns, olive ones in the nests, hard hats
 * in the works and the engine room, a cap on the bridge, whites in the galley and medbay), and a pose for what
 * they're doing: walking (two frames), working at something, carrying a crate, hosing a fire, asleep in a bunk,
 * sitting at a table, aiming a rifle. Everything is drawn once per palette and cached.
 *
 * Legend: o outline, h hat/hair (H its shade), s skin (S shade), e eye, c uniform (C shade, L light), k belt,
 * p trousers (P shade), b boots, g gun/tool metal, x crate (X its shade), w water.
 */

const STAND = [
  '..oooo..',
  '.ohhhHo.',
  '.ohhHHo.',
  '.osseso.',
  '..osSo..',
  '.oLccCo.',
  'oLLccCCo',
  'osLccCso',
  '.okkkko.',
  '.oppPPo.',
  '.opoPPo.',
  '.opooPo.',
  '.opo.oPo',
  '.obo.obo',
];
const WALK1 = [...STAND.slice(0, 11), '.oppoPo.', 'opo..oPo', 'obo..obo'];
const WALK2 = [...STAND.slice(0, 7), '.osccCso', '.okkkko.', '.oppPPo.', '..opPo..', '..opPo..', '..oPpo..', '..obbo..'];
const WORK = [
  '..oooo..',
  '.ohhhHo.',
  '.ohhHHo.',
  '.osseso.',
  '..osSo..',
  '.oLccCoo',
  'oLLccCsS',
  'oLLccCoo',
  '.okkkko.',
  '.oppPPo.',
  '.opoPPo.',
  '.opooPo.',
  '.opo.oPo',
  '.obo.obo',
];
const CARRY = [
  'oxxxxxxo',
  'oxXXXXxo',
  'oxxxxxxo',
  'soooooos',
  'Sohhhhos',
  '.osseso.',
  '.oLosCo.',
  'oLLccCCo',
  '.okkkko.',
  '.oppPPo.',
  '.opoPPo.',
  '.opooPo.',
  '.opo.oPo',
  '.obo.obo',
];
const AIM = [
  '..oooo..',
  '.ohhhHo.',
  '.ohhHHo.',
  '.osseso.',
  '..osSoo.',
  '.oLccgggg',
  'oLLcsSgo',
  'oLLccCo.',
  '.okkkko.',
  '.oppPPo.',
  '.opoPPo.',
  '.opooPo.',
  '.opo.oPo',
  '.obo.obo',
];
const HOSE = [
  '..oooo....',
  '.ohhhHo...',
  '.ohhHHo...',
  '.osseso...',
  '..osSo....',
  '.oLccCooww',
  'oLLccsggww',
  'oLLccCoo.w',
  '.okkkko...',
  '.oppPPo...',
  '.opoPPo...',
  '.opooPo...',
  '.opo.oPo..',
  '.obo.obo..',
];
const SIT = [
  '..oooo..',
  '.ohhhHo.',
  '.ohhHHo.',
  '.osseso.',
  '..osSo..',
  '.oLccCoo',
  'oLLccCss',
  'oLLccCoo',
  '.okkkkoo',
  '.oppPPPPo',
  '.oppooPbo',
];
const SLEEP = [
  '.ooo..........',
  'ohhso.oooooooo',
  'ohsesoLLccccCo',
  'ohsSsoLccccCCo',
  '.oooooooooooo.',
];

const POSES: Record<string, string[]> = { stand: STAND, walk1: WALK1, walk2: WALK2, work: WORK, carry: CARRY, aim: AIM, hose: HOSE, sit: SIT, sleep: SLEEP };

const SKINS: [string, string][] = [['#f2c9a0', '#cf9a72'], ['#dca878', '#b07a50'], ['#b27a50', '#8a5634'], ['#7a4a2c', '#57321c']];
const HAIRS = ['#2a1c14', '#5a3a1c', '#c8a050', '#1a1a1a', '#8a3a1a', '#6a6a6a'];

/** The hat (or hair) for a job. */
export function hatFor(act: Act, dept: string, id: number): string {
  switch (act) {
    case 'gun': return '#5a646e';
    case 'soldier': return '#56663a';
    case 'engine': case 'build': case 'weld': case 'drill': case 'mechanic': return '#f0b020';
    case 'console': return '#1c3048';
    case 'medic': case 'cook': return '#f4f4f0';
    case 'hose': case 'pump': case 'fix': return '#e04020';
    default: return dept === '#b8a878' ? '#8a7a50' : HAIRS[id % HAIRS.length];
  }
}

const cache = new Map<string, HTMLCanvasElement>();

function paint(rows: string[], pal: Record<string, RGB>): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  const img = x.createImageData(w, h);
  rows.forEach((r, y) => {
    for (let i = 0; i < r.length; i++) {
      const col = pal[r[i]];
      if (!col) continue;
      const q = (y * w + i) * 4;
      img.data[q] = col[0];
      img.data[q + 1] = col[1];
      img.data[q + 2] = col[2];
      img.data[q + 3] = 255;
    }
  });
  x.putImageData(img, 0, 0);
  return c;
}

const k = (c: RGB, f: number): RGB => (f >= 0 ? [c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f] : [c[0] * (1 + f), c[1] * (1 + f), c[2] * (1 + f)]);

/** A crew sprite: pose, uniform colour, hat colour, skin index; facing right (flip it for left). */
export function personSprite(pose: string, uniform: string, hat: string, skin: number, carry = '#a07840'): HTMLCanvasElement {
  const key = `${pose}|${uniform}|${hat}|${skin}|${carry}`;
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 800) cache.clear();
  const u = rgb(uniform), hc = rgb(hat), [s0, s1] = SKINS[skin % SKINS.length];
  const cr = rgb(carry);
  const pal: Record<string, RGB> = {
    o: [14, 12, 16], h: hc, H: k(hc, -0.3), s: rgb(s0), S: rgb(s1), e: [20, 16, 24],
    c: u, C: k(u, -0.32), L: k(u, 0.28), k: [40, 32, 26], p: [48, 52, 64], P: [32, 34, 44], b: [22, 18, 16],
    g: [120, 128, 140], x: cr, X: k(cr, -0.3), w: [120, 200, 255],
  };
  c = paint(POSES[pose] ?? STAND, pal);
  cache.set(key, c);
  return c;
}

/** Which pose an activity shows (walking alternates two frames). */
export function poseFor(act: Act, walking: boolean, t: number): string {
  if (walking) return act === 'carry' ? 'carry' : Math.floor(t * 6) % 2 ? 'walk1' : 'walk2';
  switch (act) {
    case 'sleep': return 'sleep';
    case 'eat': return 'sit';
    case 'carry': return 'carry';
    case 'soldier': return 'aim';
    case 'hose': case 'pump': return 'hose';
    case 'idle': return 'stand';
    case 'gun': case 'engine': case 'console': case 'medic': case 'cook': case 'weld': case 'haul': case 'mechanic': case 'build': case 'drill': case 'fix': case 'work':
      return Math.floor(t * 2) % 3 === 0 ? 'stand' : 'work';
    default: return 'stand';
  }
}

/** A person from above for the deck plans: a 3 x 3 (or 5 x 5 when there's room) blob with a hat and shoulders. */
export function topPerson(uniform: string, hat: string, big: boolean): HTMLCanvasElement {
  const key = `top|${uniform}|${hat}|${big}`;
  let c = cache.get(key);
  if (c) return c;
  const u = rgb(uniform), hc = rgb(hat);
  const rows = big ? ['.ooo.', 'ocHco', 'ohhho', 'oCHco', '.ooo.'] : ['chc', 'hHh', 'chc'];
  c = paint(rows, { o: [14, 12, 16], c: u, C: k(u, -0.3), h: hc, H: k(hc, 0.25) });
  cache.set(key, c);
  return c;
}

export const shadeHex = (c: string, f: number): string => hex(k(rgb(c), f));

/* ---------------------------------------------------------------------- */
/* High-resolution crew (the interior cutaway)                             */
/* ---------------------------------------------------------------------- */

export type PoseHD = 'stand' | 'walk' | 'work' | 'carry' | 'sit' | 'sleep' | 'aim' | 'hose' | 'weld' | 'type';
export type HatKind = 'none' | 'helmet' | 'hardhat' | 'cap' | 'chef' | 'medic' | 'beret' | 'firehelm';

export interface Look {
  uniform: string;
  hat: HatKind;
  hatCol: string;
  hair: string;
  skin: number;
  /** Hi-vis stripes on the vest (works crews, firefighters). */
  stripe?: string;
}

const HD_W = 18, HD_H = 28;

export function hatKindFor(act: Act): HatKind {
  switch (act) {
    case 'gun': case 'soldier': return 'helmet';
    case 'engine': case 'build': case 'weld': case 'drill': case 'mechanic': case 'haul': return 'hardhat';
    case 'console': return 'cap';
    case 'cook': return 'chef';
    case 'medic': return 'medic';
    case 'hose': case 'pump': case 'fix': return 'firehelm';
    default: return 'none';
  }
}

/**
 * A crew member 18 x 28 pixels (the figure about 10 x 24), facing right: shaded head with an eye and hair or a
 * hat for the job, a uniform with a lit and a shaded side, belt, trousers, boots, arms posed for what they're
 * doing (a four-frame walk), and a one-pixel dark outline.
 */
export function personHD(pose: PoseHD, frame: number, lk: Look, carryCol = '#8a6a40'): HTMLCanvasElement {
  const key = `hd|${pose}|${frame & 3}|${lk.uniform}|${lk.hat}|${lk.hatCol}|${lk.hair}|${lk.skin}|${lk.stripe ?? ''}|${carryCol}`;
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 1500) cache.clear();
  const inner = makeCanvas(HD_W, HD_H);
  const x = ctx2d(inner);
  const R = (a: number, b: number, w: number, h: number, col: RGB | string): void => {
    x.fillStyle = typeof col === 'string' ? col : hex(col);
    x.fillRect(a, b, w, h);
  };
  const u = rgb(lk.uniform), uL = k(u, 0.28), uD = k(u, -0.3), uDD = k(u, -0.5);
  const [s0, s1] = SKINS[lk.skin % SKINS.length];
  const sk = rgb(s0), skD = rgb(s1);
  const pants: RGB = [44, 48, 60], pantsD: RGB = [30, 32, 42], boot: RGB = [24, 20, 18], belt: RGB = [60, 46, 32];
  const hc = rgb(lk.hatCol), hcL = k(hc, 0.3), hcD = k(hc, -0.3);
  const hair = rgb(lk.hair);
  const f = frame & 3;
  // Where things go: feet on the bottom row, the figure centred at x 8.
  const lying = pose === 'sleep';
  const sitting = pose === 'sit' || pose === 'type';
  const dy = sitting ? 5 : 0;
  const top = 3 + dy;
  // Legs.
  if (sitting) {
    R(7, 19, 7, 3, pants);
    R(7, 21, 7, 1, pantsD);
    R(12, 22, 2, 4, pantsD);
    R(12, 26, 3, 2, boot);
  } else {
    const swing = pose === 'walk' ? [2, 0, -2, 0][f] : 0;
    const back = pose === 'walk' ? -swing : 0;
    // Back leg (darker), then front leg.
    R(7 + back, 17, 3, 8, pantsD);
    R(7 + back, 25, 4, 2, boot);
    R(9 + swing, 17, 3, 8, pants);
    R(9 + swing, 17, 1, 8, k(pants, 0.2));
    R(9 + swing, 25, 4, 2, boot);
    R(12 + swing, 26, 1, 1, k(boot, 0.4));
  }
  // Back arm.
  const armY = top + 8;
  if (pose === 'carry') R(6, top + 1, 2, 8, uD);
  else if (pose === 'work' || pose === 'aim' || pose === 'hose' || pose === 'weld' || pose === 'type') R(7, armY, 6, 2, uD);
  else {
    const sw = pose === 'walk' ? [-1, 0, 1, 0][f] : 0;
    R(6 + sw, armY, 2, 7, uD);
    R(6 + sw, armY + 7, 2, 2, skD);
  }
  // Torso: lit left, shaded right, collar, belt, a vest stripe if they wear one.
  R(6, top + 7, 6, 8, u);
  R(6, top + 7, 1, 8, uL);
  R(10, top + 7, 2, 8, uD);
  R(7, top + 7, 3, 1, uL);
  R(6, top + 14, 6, 1, belt);
  R(8, top + 14, 1, 1, [200, 170, 90]);
  if (lk.stripe) {
    R(6, top + 11, 6, 1, lk.stripe);
    R(7, top + 8, 1, 6, lk.stripe);
  }
  // Head: skin with a shaded back, an eye looking forward, hair or a hat.
  R(7, top + 1, 5, 6, sk);
  R(7, top + 1, 1, 6, skD);
  R(10, top + 3, 1, 1, [24, 20, 26]);
  R(11, top + 5, 1, 1, skD);
  R(8, top + 6, 3, 1, skD);
  const hatTop = (): void => {
    switch (lk.hat) {
      case 'helmet':
        R(6, top - 1, 7, 3, hc);
        R(6, top - 1, 7, 1, hcL);
        R(5, top + 1, 9, 1, hcD);
        break;
      case 'hardhat':
        R(7, top - 1, 5, 2, hc);
        R(7, top - 1, 5, 1, hcL);
        R(6, top + 1, 8, 1, hcD);
        break;
      case 'cap':
        R(7, top, 5, 2, hc);
        R(11, top + 1, 3, 1, hcD);
        R(8, top, 1, 1, [220, 190, 80]);
        break;
      case 'chef':
        R(7, top - 3, 5, 4, [244, 244, 240]);
        R(7, top - 3, 5, 1, [255, 255, 255]);
        R(7, top + 1, 5, 1, [210, 210, 206]);
        break;
      case 'medic':
        R(7, top, 5, 2, [240, 240, 236]);
        R(9, top, 1, 2, [220, 40, 40]);
        break;
      case 'beret':
        R(6, top, 6, 2, hc);
        break;
      case 'firehelm':
        R(6, top - 1, 7, 3, hc);
        R(6, top - 1, 7, 1, hcL);
        R(5, top + 1, 2, 3, hcD);
        break;
      default:
        R(7, top, 5, 2, hair);
        R(7, top + 2, 1, 2, hair);
        R(8, top, 3, 1, k(hair, 0.25));
    }
  };
  hatTop();
  // Front arm and what's in the hands.
  if (pose === 'carry') {
    R(11, top + 1, 2, 8, u);
    R(4, top - 6, 11, 6, carryCol);
    R(4, top - 6, 11, 1, k(rgb(carryCol), 0.3));
    R(4, top - 1, 11, 1, k(rgb(carryCol), -0.35));
    R(9, top - 5, 1, 4, k(rgb(carryCol), -0.25));
  } else if (pose === 'work' || pose === 'type' || pose === 'weld') {
    const reach = pose === 'type' ? (f % 2 ? 1 : 0) : f % 2;
    R(10, armY, 5 + reach, 2, u);
    R(15 + reach, armY, 2, 2, sk);
    if (pose === 'weld') R(16, armY - 1, 2, 1, [140, 150, 160]);
  } else if (pose === 'aim') {
    R(10, armY, 5, 2, u);
    R(9, armY - 1, 9, 2, [52, 56, 62]);
    R(17, armY - 1, 1, 1, [20, 20, 22]);
  } else if (pose === 'hose') {
    R(10, armY, 5, 2, u);
    R(14, armY - 1, 4, 2, [180, 40, 30]);
  } else {
    const sw = pose === 'walk' ? [1, 0, -1, 0][f] : 0;
    R(10 + sw, armY, 2, 7, u);
    R(10 + sw, armY + 7, 2, 2, sk);
  }
  void uDD;
  // Outline.
  const out = makeCanvas(HD_W, HD_H);
  const o = ctx2d(out);
  const sil = makeCanvas(HD_W, HD_H);
  const s = ctx2d(sil);
  s.drawImage(inner, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = '#0c0a10';
  s.fillRect(0, 0, HD_W, HD_H);
  for (const [dx, dy2] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) o.drawImage(sil, dx, dy2);
  o.drawImage(inner, 0, 0);
  if (lying) {
    // Asleep: the same figure on its back.
    const l = makeCanvas(HD_H, HD_W);
    const lx = ctx2d(l);
    lx.translate(0, HD_W);
    lx.rotate(-Math.PI / 2);
    lx.drawImage(out, 0, 0);
    c = l;
  } else c = out;
  cache.set(key, c);
  return c;
}

export const PERSON_HD = { w: HD_W, h: HD_H };
export const HAIRS_HD = HAIRS;
