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
