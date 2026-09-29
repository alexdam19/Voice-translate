import type { Arch } from '../../game/enemyDefs';
import { ctx2d, makeCanvas, shade } from './pixels';
import { creatureHD, type Look } from './creaturesHD';

/**
 * Creatures from above, as pixel art. Every body plan is drawn on a 16-unit grid facing right (+x), at the exact
 * pixel size it will be shown at (so a 150 m war machine and a 1 m rat are both crisp), then ringed with a dark
 * outline so it reads against any ground. Two walk frames.
 */

type Paint = (r: (x: number, y: number, w: number, h: number, c: string) => void, o: (x: number, y: number, rx: number, ry: number, c: string) => void, col: Pal, f: number) => void;

interface Pal {
  body: string;
  dark: string;
  light: string;
  eye: string;
  metal: string;
}

const PLANS: Record<Arch, Paint> = {
  swarm: (r, o, c, f) => {
    r(0, 8, 4, 1, c.dark);
    o(8, 8, 4.5, 3, c.body);
    o(12.5, 8, 2.2, 2, c.body);
    r(14, 7, 1, 1, c.eye);
    r(14, 9, 1, 1, c.eye);
    r(5 + f, 5, 1, 1, c.dark);
    r(9 - f, 11, 1, 1, c.dark);
    o(7, 7, 2, 1, c.light);
  },
  canine: (r, o, c, f) => {
    r(0, 7 + f, 4, 2, c.dark);
    r(4 + f * 2, 3, 2, 3, c.dark);
    r(4 - f * 2 + 2, 10, 2, 3, c.dark);
    r(10 - f * 2, 3, 2, 3, c.dark);
    r(10 + f * 2, 10, 2, 3, c.dark);
    o(8, 8, 5, 3, c.body);
    o(13, 8, 2.6, 2.4, c.body);
    r(15, 7, 1, 2, c.dark);
    r(13, 6, 1, 1, c.eye);
    r(13, 9, 1, 1, c.eye);
    o(7, 7, 3, 1.2, c.light);
  },
  beast: (r, o, c, f) => {
    r(2 + f, 2, 3, 3, c.dark);
    r(2 - f + 1, 11, 3, 3, c.dark);
    r(10 - f, 1, 3, 3, c.dark);
    r(10 + f, 12, 3, 3, c.dark);
    o(7.5, 8, 6.5, 5, c.body);
    o(13.5, 8, 2.6, 3, c.body);
    r(15, 5, 1, 2, c.light);
    r(15, 9, 1, 2, c.light);
    r(14, 7, 1, 1, c.eye);
    r(14, 8, 1, 1, c.eye);
    o(6, 6.5, 4, 1.8, c.light);
  },
  humanoid: (r, o, c, f) => {
    o(7, 8, 3, 5.5, c.body);
    r(6 + f, 2, 3, 2, c.dark);
    r(6 - f, 12, 3, 2, c.dark);
    o(8, 8, 2.6, 2.6, c.light);
    r(9, 9, 6, 1.5, c.metal);
    r(8, 7, 1, 1, c.dark);
  },
  vehicle: (r, o, c, f) => {
    r(1, 2, 5, 2, '#1c1c1e');
    r(1, 12, 5, 2, '#1c1c1e');
    r(10, 2, 5, 2, '#1c1c1e');
    r(10, 12, 5, 2, '#1c1c1e');
    r(2 + f, 2, 1, 2, '#3a3a3e');
    r(11 + f, 12, 1, 2, '#3a3a3e');
    r(0, 4, 16, 8, c.body);
    r(0, 4, 16, 1, c.light);
    r(0, 11, 16, 1, c.dark);
    r(10, 5, 5, 6, c.metal);
    r(14, 6, 1, 4, c.eye);
    o(6, 8, 2.2, 2.2, c.dark);
    r(6, 7.5, 7, 1, '#222');
  },
  worm: (r, o, c, f) => {
    for (let k = 0; k < 5; k++) {
      const x = 2 + k * 2.8, w = 2.2 + k * 0.35, y = 8 + Math.sin(k * 1.4 + f * 1.5) * 1.3;
      o(x, y, w, w, k % 2 ? c.body : shade(c.body, -0.12));
    }
    r(15, 6, 1, 1, c.light);
    r(15, 9, 1, 1, c.light);
    o(13.6, 8, 1.4, 1.4, '#2a0e0e');
  },
  flyer: (r, o, c, f) => {
    const w = f ? 1 : 0;
    for (let k = 0; k < 7; k++) {
      r(4 + k, 1 + k - w, 2, 1, c.light);
      r(4 + k, 14 - k + w, 2, 1, c.light);
    }
    o(8, 8, 3.5, 2.5, c.body);
    r(11, 7, 3, 2, c.metal);
    r(13, 7, 1, 1, c.eye);
    o(4, 2 - w, 1.5, 1.5, c.dark);
    o(4, 14 + w, 1.5, 1.5, c.dark);
  },
  dragon: (r, o, c, f) => {
    const w = f ? 1 : 0;
    for (let k = 0; k < 6; k++) {
      r(5 + k, 0 + k + w, 3 - k * 0.3, 1, shade(c.body, -0.2));
      r(5 + k, 15 - k - w, 3 - k * 0.3, 1, shade(c.body, -0.2));
      r(6, 1 + k + w, 1, 1, c.dark);
      r(6, 14 - k - w, 1, 1, c.dark);
    }
    r(0, 7.5, 4, 1, c.dark);
    o(7.5, 8, 4.5, 2.2, c.body);
    r(11, 7, 3, 2, c.body);
    o(14.5, 8, 1.6, 1.4, c.body);
    r(15, 7, 1, 1, c.eye);
    r(15, 9, 1, 1, c.eye);
    o(7, 7.4, 3, 0.8, c.light);
  },
  golem: (r, o, c, f) => {
    r(2 + f, 1, 4, 3, c.dark);
    r(2 - f + 1, 12, 4, 3, c.dark);
    o(8, 8, 5.5, 5.5, c.body);
    o(8, 2.5, 3, 2.2, shade(c.body, 0.1));
    o(8, 13.5, 3, 2.2, shade(c.body, -0.1));
    o(12, 8, 2, 2, c.light);
    r(13, 7, 1, 2, c.eye);
    r(6, 5, 1, 4, c.eye);
    r(8, 9, 3, 1, c.eye);
  },
  bot: (r, o, c, f) => {
    r(1, 2, 14, 2, '#26282c');
    r(1, 12, 14, 2, '#26282c');
    for (let k = 0; k < 7; k++) {
      r(1 + k * 2 + f, 2, 1, 2, '#44474d');
      r(1 + k * 2 + f, 12, 1, 2, '#44474d');
    }
    r(3, 4, 10, 8, c.body);
    r(3, 4, 10, 1, c.light);
    r(3, 11, 10, 1, c.dark);
    r(5, 6, 5, 4, c.metal);
    r(13, 6, 2, 4, c.metal);
    r(14, 7, 1, 2, c.eye);
  },
  fish: (r, o, c, f) => {
    r(0, 3 + f, 2, 3, c.dark);
    r(0, 10 - f, 2, 3, c.dark);
    r(1, 6, 2, 4, c.dark);
    o(8.5, 8, 6, 3, c.body);
    r(7, 4, 3, 1, c.dark);
    r(7, 11, 3, 1, c.dark);
    o(8, 7, 4, 1.2, c.light);
    r(13, 7, 1, 1, c.eye);
  },
  entity: (r, o, c, f) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + f * 0.4;
      r(8 + Math.cos(a) * 6.5, 8 + Math.sin(a) * 6.5, 1.4, 1.4, c.light);
    }
    o(8, 8, 5, 5, c.body);
    o(8, 8, 3, 3, c.light);
    o(8, 8, 1.5, 1.5, '#ffffff');
  },
  insect: (r, o, c, f) => {
    for (let k = 0; k < 3; k++) {
      const x = 5 + k * 3 + (k % 2 ? f : -f);
      r(x, 2, 1, 4, c.dark);
      r(x, 10, 1, 4, c.dark);
    }
    r(0, 7, 3, 2, c.body);
    r(1, 5 + f, 2, 2, c.light);
    o(8, 8, 4, 2.6, c.body);
    o(12.5, 8, 2, 2, c.body);
    r(14, 3, 2, 3, c.metal);
    r(14, 10, 2, 3, c.metal);
    r(13, 7, 1, 1, c.eye);
    r(13, 8, 1, 1, c.eye);
  },
};

/** Old creature kinds (horde runners, rune guardians, the classic bosses) and the body plan they get. */
const LEGACY: Record<string, Arch> = {
  rat: 'swarm', swarmer: 'swarm', leaper: 'canine', bomber: 'insect', spitter: 'insect', stalker: 'beast', brute: 'golem', guardian: 'golem',
  raider: 'humanoid', buggy: 'vehicle', drone: 'flyer', bat: 'flyer', phantom: 'entity', skeleton: 'humanoid', cy_hound: 'canine', mil_bot: 'bot',
  titan_walker: 'golem', titan_beast: 'beast', titan_worm: 'worm',
  necromancer: 'humanoid', rocketeer: 'humanoid', skel_archer: 'humanoid', mech: 'bot', wraith: 'entity', gunship: 'flyer', bone_golem: 'golem',
};

export function archFor(kind: string, arch?: Arch): Arch {
  if (arch) return arch;
  if (LEGACY[kind]) return LEGACY[kind];
  if (kind.startsWith('z_')) return 'humanoid';
  if (kind.startsWith('cy_') || kind.startsWith('mil_')) return 'bot';
  if (kind.startsWith('n_')) return 'humanoid';
  if (kind.startsWith('boss_')) return 'golem';
  return 'beast';
}

/** A humanoid's look: zombies shamble with their arms out, the dead are bare bone, everyone else carries a rifle. */
export function lookFor(kind: string, faction?: string): Look {
  if (faction === 'zombie' || kind.startsWith('z_')) return 'zombie';
  if (kind.startsWith('skel') || kind.includes('skeleton') || kind.includes('bone')) return 'skeleton';
  return '';
}

const cache = new Map<string, HTMLCanvasElement>();

/** A creature sprite `px` pixels across (plus a 1 px outline), facing right. */
export function creatureSprite(arch: Arch, color: string, px: number, frame: number, kind: 'normal' | 'elite' | 'boss' = 'normal', look: Look = ''): HTMLCanvasElement {
  const S = Math.max(3, Math.min(640, Math.round(px)));
  // Big enough for detail: the high-resolution painter.
  if (S >= 10) return creatureHD(arch, color, S, frame, kind, look);
  const key = `${arch}|${color}|${S}|${frame}|${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 1500) cache.clear();
  const pal: Pal = {
    body: color,
    dark: shade(color, -0.45),
    light: shade(color, 0.3),
    eye: arch === 'bot' || arch === 'vehicle' ? '#ff3d00' : arch === 'entity' ? '#ffffff' : '#ffeb3b',
    metal: '#5d6168',
  };
  const inner = makeCanvas(S, S);
  const x = ctx2d(inner);
  const u = S / 16;
  if (S <= 5) {
    // Too small for a body plan: a blob with a bright eye toward the front.
    x.fillStyle = pal.body;
    x.fillRect(0, Math.floor(S * 0.2), S, Math.ceil(S * 0.6));
    x.fillRect(Math.floor(S * 0.2), 0, Math.ceil(S * 0.6), S);
    x.fillStyle = pal.light;
    x.fillRect(Math.floor(S * 0.3), Math.floor(S * 0.3), 1, 1);
    x.fillStyle = pal.eye;
    x.fillRect(S - 1, Math.floor(S / 2), 1, 1);
  } else {
    const r = (px0: number, py0: number, w: number, h: number, c: string): void => {
      x.fillStyle = c;
      const a = Math.round(px0 * u), b = Math.round(py0 * u);
      x.fillRect(a, b, Math.max(1, Math.round((px0 + w) * u) - a), Math.max(1, Math.round((py0 + h) * u) - b));
    };
    const o = (cx: number, cy: number, rx: number, ry: number, c: string): void => {
      x.fillStyle = c;
      const X = cx * u, Y = cy * u, RX = Math.max(0.5, rx * u), RY = Math.max(0.5, ry * u);
      for (let yy = Math.floor(Y - RY); yy <= Math.ceil(Y + RY); yy++) {
        const t = (yy + 0.5 - Y) / RY;
        if (Math.abs(t) > 1) continue;
        const hw = RX * Math.sqrt(1 - t * t);
        const a = Math.round(X - hw), b = Math.round(X + hw);
        if (b > a) x.fillRect(a, yy, b - a, 1);
      }
    };
    PLANS[arch](r, o, pal, frame & 1);
    shadePixels(inner, S, color, arch);
  }
  // Outline: the silhouette in a dark colour under the sprite, one pixel out each way.
  const out = makeCanvas(S + 2, S + 2);
  const y = ctx2d(out);
  const sil = makeCanvas(S, S);
  const s = ctx2d(sil);
  s.drawImage(inner, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = kind === 'boss' ? '#b71c1c' : kind === 'elite' ? '#d500f9' : '#0b0b0e';
  s.fillRect(0, 0, S, S);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) y.drawImage(sil, dx, dy);
  y.drawImage(inner, 1, 1);
  cache.set(key, out);
  return out;
}

/* ---------------------------------------------------------------------- */
/* Friendly units                                                          */
/* ---------------------------------------------------------------------- */

const allyCache = new Map<string, HTMLCanvasElement>();

/** Your squads from above: marines, buggies, mini tanks, drones, jets, mechs, the dragon and mines. */
export function allySprite(kind: string, px: number, frame: number): HTMLCanvasElement {
  const S = Math.max(3, Math.min(120, Math.round(px)));
  const key = `${kind}|${S}|${frame & 1}`;
  const hit = allyCache.get(key);
  if (hit) return hit;
  const arch: Arch = kind === 'buggy' || kind === 'minitank' ? 'vehicle' : kind === 'drone' ? 'flyer' : kind === 'jet' ? 'flyer' : kind === 'mech' ? 'bot' : kind === 'dragon' ? 'dragon' : 'humanoid';
  const col = kind === 'dragon' ? '#ff7043' : kind === 'jet' ? '#90caf9' : kind === 'mech' ? '#78909c' : kind === 'mine' ? '#ffd740' : '#4fc3f7';
  const c = kind === 'mine' ? mineSprite(S) : creatureSprite(arch, col, S, frame);
  allyCache.set(key, c);
  return c;
}

function mineSprite(S: number): HTMLCanvasElement {
  const c = makeCanvas(S, S);
  const x = ctx2d(c);
  x.fillStyle = '#212121';
  x.fillRect(0, 0, S, S);
  x.fillStyle = '#ffd740';
  x.fillRect(Math.floor(S / 2) - 1, Math.floor(S / 2) - 1, 2, 2);
  return c;
}

/**
 * Pixel shading on a drawn body: edges facing the sun (north-west) catch the light, the underside falls into
 * shadow, and the rest gets a fine grain (fur, scales, rust) so big creatures don't read as flat blocks.
 */
function shadePixels(c: HTMLCanvasElement, S: number, color: string, arch: Arch): void {
  const x = c.getContext('2d')!;
  const img = x.getImageData(0, 0, S, S);
  const d = img.data;
  const a = (px: number, py: number): number => (px < 0 || py < 0 || px >= S || py >= S ? 0 : d[(py * S + px) * 4 + 3]);
  const deep = S >= 18;
  let seed = 0;
  for (let i = 0; i < color.length; i++) seed = (seed * 31 + color.charCodeAt(i)) | 0;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const p = (py * S + px) * 4;
      if (!d[p + 3]) continue;
      let k = 1;
      if (!a(px - 1, py) || !a(px, py - 1)) k = 1.3;
      else if (!a(px + 1, py) || !a(px, py + 1)) k = 0.66;
      else if (deep && (!a(px - 2, py - 1) || !a(px - 1, py - 2))) k = 1.12;
      else if (deep && (!a(px + 2, py + 1) || !a(px + 1, py + 2))) k = 0.82;
      else {
        let h = (px * 374761393 + py * 668265263 + seed) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        const n = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        k = 0.93 + n * 0.14;
        // Big bodies get a surface: cracked rock, panel lines, fur, segments, scales.
        if (S >= 22) {
          const u = S / 16;
          switch (arch) {
            case 'golem':
              if ((px + Math.floor(py / (u * 2))) % Math.max(3, Math.round(u * 3)) === 0) k *= 0.72;
              if (n > 0.97) k *= 1.35;
              break;
            case 'bot':
            case 'vehicle':
              if (px % Math.max(3, Math.round(u * 3)) === 0 || py % Math.max(3, Math.round(u * 4)) === 0) k *= 0.8;
              if (n > 0.985) k *= 1.4;
              break;
            case 'beast':
            case 'canine':
              if ((px + py * 2) % Math.max(3, Math.round(u * 2)) === 0) k *= 0.84;
              break;
            case 'worm':
              if (px % Math.max(3, Math.round(u * 2.2)) === 0) k *= 0.7;
              break;
            case 'dragon':
            case 'flyer':
              if ((px - py) % Math.max(3, Math.round(u * 2.5)) === 0) k *= 0.82;
              break;
            case 'fish':
            case 'insect':
              if ((px + (py % 2)) % 2 === 0 && n > 0.5) k *= 0.9;
              break;
            case 'entity':
              k *= 1 + Math.sin(px * 0.6 + py * 0.4) * 0.12;
              break;
          }
        }
      }
      d[p] = Math.min(255, d[p] * k);
      d[p + 1] = Math.min(255, d[p + 1] * k);
      d[p + 2] = Math.min(255, d[p + 2] * k);
    }
  }
  x.putImageData(img, 0, 0);
}
