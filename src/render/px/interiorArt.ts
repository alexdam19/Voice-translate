import { MODULES } from '../../game/defs';
import type { ModuleInst } from '../../game/tank';
import { glowSprite } from './fx2d';
import { hash2 } from './pixels';

/**
 * Pixel art for the inside of the Titan, drawn at high resolution into the cutaway: every kind of room furnished
 * for what it is, with its own light, and animated (pistons pumping, the reactor core pulsing, the forge
 * glowing, the crane swinging, screens flickering). Everything is in art pixels; the view scales it up by whole
 * numbers.
 */

export const IA = { CELL: 20, DH: 46, ROOF_H: 50, SKY: 40, KEEL: 66 } as const;

export interface RoomArt {
  c: CanvasRenderingContext2D;
  m: ModuleInst;
  x0: number;
  y0: number;
  w: number;
  h: number;
  t: number;
  /** The Titan's speed (engines work harder). */
  speed: number;
  /** A job on it: progress 0-1 and whether a work crew is doing it. */
  job: { f: number; order: boolean } | null;
  accent: string;
  /** The fuel plant (drill string depth 0-1, crude tank 0-1, refinery running). */
  fuel?: { drill: number; crude: number; refining: boolean };
}

/** Where sleepers lie and diners sit in a room (filled in as the room draws its bunks and benches). */
export interface Slots {
  beds: { x: number; y: number }[];
  seats: { x: number; y: number }[];
  /** Standing spots at the machines. */
  posts: { x: number; y: number }[];
}

const WALL = '#262d38', WALL_LO = '#1b2029', PIPE = '#4a5566', PIPE_HI = '#6a7890', FLOOR = '#1a1f27', FLOOR_HI = '#3a4452';

export function sh(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

export function glowAt(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, k: number): void {
  const g = glowSprite(col, r * 2);
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.max(0, Math.min(1, k));
  c.drawImage(g, Math.round(x - g.width / 2), Math.round(y - g.height / 2));
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

export function discAt(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    const t = (yy + 0.5 - cy) / r;
    if (Math.abs(t) > 1) continue;
    const hw = r * Math.sqrt(1 - t * t);
    const a = Math.round(cx - hw), b = Math.round(cx + hw);
    if (b > a) c.fillRect(a, yy, b - a, 1);
  }
}

/** The back wall of a room: panels with rivets and a light rim, a pipe run, darker toward the floor. */
export function backWall(a: Pick<RoomArt, 'c' | 'x0' | 'y0' | 'w' | 'h'>, tint: string): void {
  const { c, x0, y0, w, h } = a;
  const wall = mix(WALL, tint, 0.14);
  c.fillStyle = wall;
  c.fillRect(x0, y0, w, h);
  // Panels.
  for (let px = x0 + 2; px < x0 + w - 3; px += 12) {
    const pw = Math.min(10, x0 + w - 3 - px);
    c.fillStyle = sh(wall, 0.06);
    c.fillRect(px, y0 + 6, pw, h - 14);
    c.fillStyle = sh(wall, 0.16);
    c.fillRect(px, y0 + 6, pw, 1);
    c.fillStyle = sh(wall, -0.25);
    c.fillRect(px, y0 + h - 9, pw, 1);
    c.fillStyle = sh(wall, 0.25);
    c.fillRect(px + 1, y0 + 7, 1, 1);
    c.fillRect(px + pw - 2, y0 + 7, 1, 1);
  }
  // Shadow toward the floor.
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(x0, y0 + h - 12, w, 9);
  // Ceiling: a pipe run and the light strip in the room's colour.
  c.fillStyle = WALL_LO;
  c.fillRect(x0, y0, w, 3);
  c.fillStyle = PIPE;
  c.fillRect(x0, y0 + 3, w, 2);
  c.fillStyle = PIPE_HI;
  c.fillRect(x0, y0 + 3, w, 1);
  for (let px = x0 + 5; px < x0 + w; px += 16) {
    c.fillStyle = '#20262e';
    c.fillRect(px, y0 + 2, 2, 4);
  }
  c.fillStyle = sh(tint, 0.2);
  c.fillRect(x0 + 3, y0 + 5, w - 6, 1);
  glowAt(c, x0 + w / 2, y0 + 8, Math.min(40, w * 0.6), tint, 0.18);
  // Floor: grating with a lit lip.
  c.fillStyle = FLOOR;
  c.fillRect(x0, y0 + h - 3, w, 3);
  c.fillStyle = FLOOR_HI;
  c.fillRect(x0, y0 + h - 3, w, 1);
  for (let px = x0 + 1; px < x0 + w; px += 3) {
    c.fillStyle = '#12161c';
    c.fillRect(px, y0 + h - 2, 1, 2);
  }
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function R(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** A box with a lit top and a shaded right side (lockers, crates, machines). */
export function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
  R(c, x - 1, y - 1, w + 2, h + 1, '#0b0d11');
  R(c, x, y, w, h, col);
  R(c, x, y, w, 1, sh(col, 0.3));
  R(c, x, y, 1, h, sh(col, 0.15));
  R(c, x + w - 1, y, 1, h, sh(col, -0.3));
}

/** A little screen: dark glass, a glowing line that moves. */
export function screen(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string, t: number, seed: number): void {
  R(c, x - 1, y - 1, w + 2, h + 2, '#0b0d11');
  R(c, x, y, w, h, '#06131a');
  c.fillStyle = col;
  for (let i = 0; i < w - 2; i++) {
    const v = Math.sin(i * 0.9 + t * 4 + seed) * 0.5 + 0.5;
    c.fillRect(x + 1 + i, Math.round(y + 1 + (1 - v) * (h - 3)), 1, 1);
  }
  if (Math.floor(t * 3 + seed) % 5 === 0) R(c, x + 1, y + 1, w - 2, 1, sh(col, 0.5));
  glowAt(c, x + w / 2, y + h / 2, w, col, 0.25);
}

/** Draws a room and says where its people sleep, sit and stand. */
export function drawRoom(a: RoomArt): Slots {
  const { c, m, x0, y0, w, h, t } = a;
  const slots: Slots = { beds: [], seats: [], posts: [] };
  const fl = y0 + h - 3;
  const d = MODULES[m.key];
  backWall(a, a.accent);
  if (!m.built) {
    // Going up: scaffolding, hazard stripes, a welder's glare.
    for (let px = x0 + 3; px < x0 + w - 2; px += 9) R(c, px, y0 + 6, 1, h - 9, '#8a7448');
    for (const yy of [y0 + 14, y0 + 28]) R(c, x0 + 2, yy, w - 4, 1, '#8a7448');
    for (let px = x0; px < x0 + w; px += 6) R(c, px, fl - 3, 3, 2, '#e0b020');
    if (Math.sin(t * 9 + m.id) > 0.2) glowAt(c, x0 + w * (0.3 + 0.4 * ((Math.sin(t * 1.3) + 1) / 2)), y0 + h * 0.45, 10, '#fff2b0', 0.9);
    for (let i = 0; i < 4; i++) slots.posts.push({ x: x0 + ((i + 0.5) / 4) * w, y: fl });
    return slots;
  }
  const lv = m.lvl;
  switch (m.key) {
    case 'quarters':
    case 'barracks': {
      const tiers = m.key === 'barracks' ? 3 : 2;
      const bw = 18;
      const n = Math.max(1, Math.floor((w - 12) / (bw + 3)));
      const pad = (w - 10 - n * (bw + 3)) / 2;
      for (let k = 0; k < n; k++) {
        const bx = x0 + 3 + pad + k * (bw + 3);
        // Posts and the bunks, each with a mattress, pillow and blanket.
        R(c, bx, y0 + 8, 1, fl - y0 - 8, '#5a5448');
        R(c, bx + bw, y0 + 8, 1, fl - y0 - 8, '#5a5448');
        for (let tier = 0; tier < tiers; tier++) {
          const by = fl - 5 - tier * ((fl - y0 - 12) / tiers);
          R(c, bx + 1, by, bw - 1, 2, '#3a4250');
          R(c, bx + 1, by - 3, bw - 1, 3, m.key === 'barracks' ? '#5a6a3a' : '#4a6a9a');
          R(c, bx + 1, by - 3, bw - 1, 1, m.key === 'barracks' ? '#7a8a50' : '#6a8aba');
          R(c, bx + 1, by - 4, 5, 2, '#e8e4d8');
          slots.beds.push({ x: bx + bw / 2, y: by - 2 });
        }
      }
      // Lockers, a poster, a rifle rack in the barracks.
      box(c, x0 + w - 8, y0 + 12, 6, fl - y0 - 12, '#4a5566');
      R(c, x0 + w - 7, y0 + 16, 4, 1, '#20262e');
      if (m.key === 'barracks') {
        for (let k = 0; k < 3; k++) R(c, x0 + w - 12 + k, y0 + 10, 1, 12, '#2a2e34');
        R(c, x0 + 4, y0 + 8, 8, 5, '#3a6a3a');
        R(c, x0 + 6, y0 + 9, 4, 3, '#e0d060');
      } else {
        R(c, x0 + 4, y0 + 9, 7, 9, '#8a3a3a');
        R(c, x0 + 5, y0 + 10, 5, 4, '#f0c080');
      }
      break;
    }
    case 'mess_hall': {
      // Galley on the left: range, pots with steam, the serving hatch.
      box(c, x0 + 3, fl - 14, 16, 14, '#5a6068');
      R(c, x0 + 5, fl - 16, 4, 2, '#8a8a8a');
      R(c, x0 + 11, fl - 17, 5, 3, '#7a7a80');
      R(c, x0 + 4, fl - 9, 14, 2, Math.sin(t * 5) > 0 ? '#ff8a30' : '#ff6a10');
      glowAt(c, x0 + 11, fl - 8, 12, '#ff9a40', 0.5);
      for (let k = 0; k < 3; k++) {
        const sy = fl - 18 - ((t * 8 + k * 5) % 12);
        R(c, x0 + 12 + Math.sin(t * 2 + k) * 2, sy, 1, 1, 'rgba(230,230,240,0.5)');
      }
      // Tables with benches.
      for (let tx = x0 + 24; tx + 20 < x0 + w; tx += 26) {
        R(c, tx, fl - 10, 20, 2, '#7a5634');
        R(c, tx, fl - 10, 20, 1, '#9a7650');
        R(c, tx + 2, fl - 8, 1, 8, '#4a3420');
        R(c, tx + 17, fl - 8, 1, 8, '#4a3420');
        R(c, tx - 3, fl - 5, 3, 1, '#5a4028');
        R(c, tx + 20, fl - 5, 3, 1, '#5a4028');
        R(c, tx + 5, fl - 11, 3, 1, '#c0c8d0');
        R(c, tx + 12, fl - 11, 3, 1, '#c0c8d0');
        slots.seats.push({ x: tx + 3, y: fl }, { x: tx + 15, y: fl });
      }
      break;
    }
    case 'hydroponics': {
      for (let rx = x0 + 3; rx + 12 < x0 + w; rx += 15) {
        for (let tier = 0; tier < 3; tier++) {
          const ry = y0 + 12 + tier * 10;
          R(c, rx, ry + 6, 12, 1, '#5a6068');
          for (let p = 0; p < 4; p++) {
            const g = hash2(rx + p, ry, 3);
            R(c, rx + 1 + p * 3, ry + 2 + (g > 0.5 ? 0 : 1), 2, 4 - (g > 0.5 ? 0 : 1), g > 0.66 ? '#5ab040' : g > 0.33 ? '#7ad050' : '#4a9a38');
          }
          R(c, rx, ry, 12, 1, '#c070ff');
        }
        R(c, rx - 1, y0 + 10, 1, fl - y0 - 10, '#4a5060');
      }
      glowAt(c, x0 + w / 2, y0 + h * 0.45, w * 0.7, '#b060ff', 0.28);
      box(c, x0 + w - 9, fl - 12, 7, 12, '#2a5a7a');
      break;
    }
    case 'engine':
    case 'ion_engine': {
      // The engine block, bigger with every level: a bank of cylinders, pistons pumping with the speed, a
      // flywheel, gauges, the exhaust manifold and a warning stripe on the floor.
      const ion = m.key === 'ion_engine';
      const ew = Math.min(w - 8, 22 + lv * 8), eh = Math.min(h - 10, 18 + lv * 3);
      const ex = x0 + Math.round((w - ew) / 2), ey = fl - eh;
      box(c, ex, ey, ew, eh, ion ? '#26385a' : '#3a3632');
      const cyl = Math.max(2, Math.floor(ew / 7));
      const sp = 4 + Math.abs(a.speed) * 1.2;
      for (let k = 0; k < cyl; k++) {
        const cx = ex + 3 + k * ((ew - 6) / cyl);
        const up = Math.round((Math.sin(t * sp + k * 1.7) + 1) * 2);
        box(c, cx, ey - 5 + up, 4, 6, '#8a929c');
        R(c, cx + 1, ey + 2, 2, eh - 6, '#1e1e22');
      }
      R(c, ex + 1, ey + eh - 5, ew - 2, 2, ion ? '#50b0ff' : '#ff8a30');
      glowAt(c, ex + ew / 2, ey + eh - 4, ew * 0.8, ion ? '#40a0ff' : '#ff8a30', ion ? 0.5 : 0.25 + Math.min(0.4, Math.abs(a.speed) * 0.03));
      // Flywheel.
      const fx = ex - 5, fy = fl - 10;
      discAt(c, fx, fy, 6, '#0b0d11');
      discAt(c, fx, fy, 5, '#5a6068');
      for (let s = 0; s < 3; s++) {
        const an = t * sp * 0.8 + (s * Math.PI * 2) / 3;
        R(c, fx + Math.cos(an) * 3, fy + Math.sin(an) * 3, 1, 1, '#b0b8c4');
      }
      discAt(c, fx, fy, 1.5, '#20242a');
      // Gauges and the stripe.
      for (let k = 0; k < 2; k++) {
        discAt(c, x0 + w - 7 - k * 7, y0 + 13, 3, '#d8d0b8');
        const an = -2.4 + Math.min(1, Math.abs(a.speed) / 15) * 3.2 + Math.sin(t * 7 + k) * 0.1;
        R(c, x0 + w - 7 - k * 7 + Math.cos(an) * 2, y0 + 13 + Math.sin(an) * 2, 1, 1, '#c01010');
      }
      for (let px = x0; px < x0 + w; px += 6) R(c, px, fl - 1, 3, 1, '#e0b020');
      slots.posts.push({ x: ex - 9, y: fl }, { x: ex + ew + 4, y: fl });
      break;
    }
    case 'reactor':
    case 'fission': {
      const fis = m.key === 'fission';
      const col = fis ? '#40ff90' : '#40e0ff';
      const rw = Math.min(w - 16, 18 + lv * 3), cx = x0 + w / 2;
      const top = y0 + 8;
      box(c, cx - rw / 2, top, rw, fl - top, '#2a323c');
      for (let yy = top + 3; yy < fl - 2; yy += 5) R(c, cx - rw / 2, yy, rw, 1, '#4a5566');
      const k = 0.6 + 0.4 * Math.sin(t * 3 + m.id);
      R(c, cx - rw / 4, top + 6, rw / 2, fl - top - 12, '#0a1a18');
      R(c, cx - rw / 4 + 1, top + 7, rw / 2 - 2, fl - top - 14, col);
      R(c, cx - 1, top + 8, 2, fl - top - 16, '#e8ffff');
      glowAt(c, cx, (top + fl) / 2, rw * 2, col, 0.45 * k);
      // Cables to the panel, and the trefoil.
      R(c, x0 + 4, fl - 16, 8, 12, '#3a4250');
      screen(c, x0 + 5, fl - 15, 6, 4, col, t, m.id);
      discAt(c, x0 + w - 8, y0 + 14, 4, '#e0c020');
      discAt(c, x0 + w - 8, y0 + 14, 1.2, '#1a1a1a');
      slots.posts.push({ x: x0 + 8, y: fl }, { x: cx + rw / 2 + 4, y: fl });
      break;
    }
    case 'bridge':
    case 'radar':
    case 'science_lab':
    case 'arcane_sanctum': {
      const col = m.key === 'arcane_sanctum' ? '#d080ff' : m.key === 'science_lab' ? '#70ffb0' : '#60d0ff';
      if (m.key === 'bridge') {
        // The forward windows onto the waste, the captain's chair.
        R(c, x0 + 4, y0 + 8, w - 8, 12, '#0b0d11');
        for (let px = x0 + 5; px < x0 + w - 5; px += 10) {
          R(c, px, y0 + 9, 9, 10, '#3a5a78');
          R(c, px, y0 + 15, 9, 4, '#8a6a4a');
          R(c, px, y0 + 9, 9, 1, '#6a8aa8');
        }
        box(c, x0 + w / 2 - 3, fl - 11, 7, 8, '#6a3a30');
      }
      if (m.key === 'arcane_sanctum') {
        const cx = x0 + w / 2;
        for (let i = 0; i < 20; i++) {
          const an = (i / 20) * Math.PI * 2 + t * 0.6;
          R(c, cx + Math.cos(an) * 10, fl - 14 + Math.sin(an) * 4, 1, 1, col);
        }
        glowAt(c, cx, fl - 14, 26, col, 0.5);
      }
      // Console banks with screens.
      for (let px = x0 + 4; px + 12 < x0 + w; px += 16) {
        box(c, px, fl - 9, 12, 9, '#2a323e');
        screen(c, px + 2, fl - 16, 8, 6, col, t, px);
        R(c, px + 1, fl - 9, 10, 1, '#4a5566');
        slots.posts.push({ x: px + 6, y: fl });
      }
      if (m.key === 'science_lab') for (let k = 0; k < 3; k++) {
        R(c, x0 + 8 + k * 6, y0 + 14, 3, 5, ['#ff5070', '#50c0ff', '#ffd040'][k]);
        R(c, x0 + 8 + k * 6, y0 + 13, 3, 1, '#d0d8e0');
      }
      break;
    }
    case 'medbay': {
      for (let bx = x0 + 4; bx + 16 < x0 + w; bx += 22) {
        R(c, bx, fl - 8, 16, 2, '#d8dce0');
        R(c, bx, fl - 9, 16, 1, '#f4f6f8');
        R(c, bx + 1, fl - 6, 1, 6, '#8a929c');
        R(c, bx + 14, fl - 6, 1, 6, '#8a929c');
        R(c, bx + 18, fl - 22, 1, 22, '#8a929c');
        R(c, bx + 17, fl - 22, 3, 4, '#c0e0f0');
        slots.beds.push({ x: bx + 8, y: fl - 9 });
      }
      // Monitor with a heartbeat, the cross.
      R(c, x0 + w - 16, y0 + 10, 12, 8, '#0b0d11');
      R(c, x0 + w - 15, y0 + 11, 10, 6, '#06140a');
      const ph = (t * 10) % 10;
      for (let i = 0; i < 10; i++) R(c, x0 + w - 15 + i, y0 + 14 - (Math.abs(i - ph) < 1 ? 2 : 0), 1, 1, '#40ff70');
      R(c, x0 + 6, y0 + 9, 3, 9, '#e03030');
      R(c, x0 + 3, y0 + 12, 9, 3, '#e03030');
      break;
    }
    case 'workshop':
    case 'forge':
    case 'refinery':
    case 'repair_bay':
    case 'ammo_depot': {
      const furnace = m.key === 'forge' || m.key === 'refinery';
      if (furnace) {
        box(c, x0 + 3, fl - 22, 16, 22, '#3a2a24');
        R(c, x0 + 6, fl - 12, 10, 7, Math.sin(t * 6) > 0 ? '#ffa030' : '#ff7010');
        R(c, x0 + 8, fl - 11, 6, 3, '#ffe0a0');
        glowAt(c, x0 + 11, fl - 9, 24, '#ff9030', 0.6);
        R(c, x0 + 8, y0 + 3, 6, fl - 22 - y0 - 3, '#4a4f58');
        for (let k = 0; k < 3; k++) {
          const sx = x0 + 11 + Math.sin(t * 13 + k * 2) * 6, sy = fl - 13 - ((t * 20 + k * 7) % 10);
          R(c, sx, sy, 1, 1, '#ffe080');
        }
      }
      if (m.key === 'refinery') {
        // Hopper and a conveyor carrying ore.
        R(c, x0 + 22, fl - 7, w - 30, 2, '#4a4f58');
        for (let k = 0; k < 5; k++) {
          const ox = x0 + 22 + (((t * 8 + k * 9) % (w - 32)) + (w - 32)) % (w - 32);
          R(c, ox, fl - 10, 3, 3, '#8a6a4a');
        }
      }
      if (m.key === 'ammo_depot') for (let px = x0 + 4; px < x0 + w - 4; px += 4) {
        R(c, px, fl - 14, 3, 12, '#b08a3a');
        R(c, px, fl - 16, 3, 2, '#d0a850');
      } else {
        // Workbench with tools, the crane hook swinging.
        box(c, x0 + w - 24, fl - 9, 20, 3, '#6a5040');
        R(c, x0 + w - 22, fl - 6, 1, 6, '#4a3830');
        R(c, x0 + w - 7, fl - 6, 1, 6, '#4a3830');
        R(c, x0 + w - 20, fl - 11, 4, 2, '#a0a8b4');
        R(c, x0 + w - 14, fl - 12, 2, 3, '#c04030');
        const hx = x0 + w * 0.55 + Math.sin(t * 0.6 + m.id) * w * 0.15;
        R(c, x0 + 20, y0 + 6, w - 26, 1, '#6a707a');
        R(c, hx, y0 + 6, 1, 14, '#8a929c');
        R(c, hx - 2, y0 + 20, 5, 2, '#e0b020');
        slots.posts.push({ x: x0 + w - 14, y: fl });
      }
      if (furnace) slots.posts.push({ x: x0 + 22, y: fl });
      break;
    }
    case 'cargo':
    case 'vault': {
      const cols = ['#5d6b3a', '#7a4a2e', '#46607a', '#6b5d3a', '#5a3a5a'];
      for (let px = x0 + 3, k = 0; px + 11 < x0 + w - (m.key === 'vault' ? 18 : 0); px += 12, k++) {
        const stack = 1 + Math.floor(hash2(k, m.id) * 3);
        for (let s = 0; s < stack; s++) {
          const col = cols[(k + s + m.id) % cols.length];
          box(c, px, fl - 10 * (s + 1), 11, 9, col);
          R(c, px + 2, fl - 10 * (s + 1) + 3, 7, 1, sh(col, -0.3));
          R(c, px + 3, fl - 10 * (s + 1) + 5, 3, 2, '#e8e0c8');
        }
      }
      if (m.key === 'vault') {
        discAt(c, x0 + w - 11, fl - 16, 10, '#0b0d11');
        discAt(c, x0 + w - 11, fl - 16, 9, '#6a707a');
        discAt(c, x0 + w - 11, fl - 16, 6, '#8a929c');
        for (let s = 0; s < 3; s++) {
          const an = (s * Math.PI * 2) / 3;
          R(c, x0 + w - 11 + Math.cos(an) * 4, fl - 16 + Math.sin(an) * 4, 1, 1, '#ffd740');
        }
      } else {
        // A forklift.
        box(c, x0 + w - 16, fl - 9, 10, 7, '#e0a020');
        R(c, x0 + w - 5, fl - 16, 1, 14, '#4a4f58');
        discAt(c, x0 + w - 14, fl - 2, 2, '#1a1a1a');
        discAt(c, x0 + w - 8, fl - 2, 2, '#1a1a1a');
      }
      slots.posts.push({ x: x0 + w / 2, y: fl });
      break;
    }
    case 'garage':
    case 'drone_bay':
    case 'jet_hangar':
    case 'mech_bay':
    case 'tank_bay': {
      const cx = x0 + w / 2;
      if (m.key === 'drone_bay') {
        for (let px = x0 + 5; px + 8 < x0 + w; px += 12) {
          R(c, px, y0 + 16, 8, 2, '#4a5566');
          R(c, px - 1, y0 + 15, 3, 1, '#8a929c');
          R(c, px + 6, y0 + 15, 3, 1, '#8a929c');
          if (Math.floor(t * 2 + px) % 2) R(c, px + 3, y0 + 18, 2, 1, '#ff3030');
        }
      } else if (m.key === 'jet_hangar') {
        R(c, cx - 18, fl - 10, 36, 5, '#5a6470');
        R(c, cx - 6, fl - 14, 12, 4, '#6a7480');
        R(c, cx + 14, fl - 12, 6, 3, '#3a4450');
        R(c, cx - 20, fl - 8, 8, 2, '#3a4450');
        R(c, cx + 4, fl - 13, 4, 2, '#60c0ff');
      } else {
        // A mini tank up on the lift.
        R(c, cx - 16, fl - 4, 32, 2, '#e0b020');
        box(c, cx - 14, fl - 12, 28, 7, '#3a4a3a');
        box(c, cx - 7, fl - 17, 12, 5, '#4a5a4a');
        R(c, cx + 5, fl - 16, 14, 2, '#1e2226');
        for (let k = 0; k < 5; k++) discAt(c, cx - 11 + k * 5.5, fl - 6, 2, '#1a1c20');
      }
      // Tool wall.
      for (let k = 0; k < 5; k++) R(c, x0 + 4 + k * 3, y0 + 10, 1, 6 + (k % 3) * 2, '#8a929c');
      slots.posts.push({ x: cx - 20, y: fl }, { x: cx + 20, y: fl });
      break;
    }
    case 'fuel_drill': {
      // The derrick: a lattice A-frame to the deckhead, the rotary table on the floor, the drill string going down
      // through the keel (turning and sliding down while it bores), the mud pump thumping, crude in the pipe.
      const fu = a.fuel ?? { drill: 0, crude: 0, refining: false };
      const cx = x0 + Math.round(w * 0.42);
      const top = y0 + 4;
      for (let yy = top; yy < fl - 4; yy++) {
        const k = (yy - top) / (fl - 4 - top);
        const half = 3 + k * 9;
        R(c, cx - half, yy, 1, 1, '#b8862a');
        R(c, cx + half, yy, 1, 1, '#b8862a');
        if ((yy - top) % 6 === 0) R(c, cx - half, yy, half * 2, 1, '#8a6420');
        if ((yy - top) % 6 === 3) {
          R(c, cx - half * 0.5, yy, 1, 1, '#6a4a18');
          R(c, cx + half * 0.5, yy, 1, 1, '#6a4a18');
        }
      }
      box(c, cx - 4, top - 2, 9, 3, '#6a707a');
      // The string: segments sliding down while it bores.
      const turning = fu.drill > 0 && fu.drill < 1 ? 1 : fu.drill >= 1 ? 0.3 : 0;
      R(c, cx - 1, top + 1, 3, fl - top, '#8a929c');
      for (let yy = top + 2; yy < fl; yy += 5) R(c, cx - 1, yy + Math.round((t * 8 * turning) % 5), 3, 1, '#4a4f58');
      // Rotary table and the bore through the deck.
      box(c, cx - 8, fl - 4, 17, 4, '#3a3632');
      R(c, cx - 6 + Math.round(Math.sin(t * 10 * (turning + 0.05)) * 2 + 2), fl - 3, 3, 1, '#e0b020');
      R(c, cx - 2, fl, 5, 3, '#050608');
      // Mud pump with two pistons.
      const px = x0 + w - 16;
      box(c, px, fl - 12, 13, 12, '#4a3a5a');
      for (let k = 0; k < 2; k++) {
        const up = fu.drill >= 1 ? Math.round((Math.sin(t * 7 + k * Math.PI) + 1) * 1.5) : 0;
        box(c, px + 2 + k * 6, fl - 17 + up, 3, 5, '#a0a8b4');
      }
      // Crude in the pipe to the tank, and the tank's sight glass.
      R(c, cx + 10, fl - 20, px - cx - 10, 2, '#2a2420');
      if (fu.drill >= 1) for (let k = 0; k < 4; k++) R(c, cx + 10 + ((t * 10 + k * 7) % Math.max(4, px - cx - 12)), fl - 20, 2, 2, '#7a5a30');
      R(c, x0 + 3, y0 + 8, 4, fl - y0 - 10, '#0b0d11');
      R(c, x0 + 4, fl - 2 - Math.round((fl - y0 - 12) * fu.crude), 2, Math.round((fl - y0 - 12) * fu.crude), '#3a2a14');
      pxWarn(c, x0 + 3, y0 + 3, fu.drill >= 1 ? '#40ff60' : fu.drill > 0 ? '#ffb020' : '#ff3020', t);
      slots.posts.push({ x: cx + 12, y: fl }, { x: px - 3, y: fl });
      break;
    }
    case 'fuel_refinery': {
      // Two distillation columns with their ladders, the furnace, pipework, the flare burning off the top.
      const fu = a.fuel ?? { drill: 0, crude: 0, refining: false };
      const run = fu.refining;
      const cols = [x0 + Math.round(w * 0.22), x0 + Math.round(w * 0.5)];
      cols.forEach((cx, k) => {
        const top = y0 + 5 + k * 4;
        box(c, cx - 5, top, 11, fl - top, k ? '#8a8e94' : '#9aa0a6');
        for (let yy = top + 4; yy < fl - 2; yy += 7) R(c, cx - 5, yy, 11, 1, '#5a5e64');
        for (let yy = top + 2; yy < fl - 1; yy += 2) R(c, cx + 6, yy, 2, 1, '#4a4f58');
        R(c, cx - 1, top - 3, 3, 3, '#6a707a');
        if (run && k === 0) {
          const fh = 3 + Math.round((Math.sin(t * 13) + 1) * 1.5);
          R(c, cx - 1, top - 3 - fh, 3, fh, Math.sin(t * 17) > 0 ? '#ffb040' : '#ff7020');
          glowAt(c, cx, top - 5, 14, '#ff9030', 0.7);
        }
      });
      // The furnace.
      const fx = x0 + Math.round(w * 0.72);
      box(c, fx, fl - 16, 14, 16, '#3a2a24');
      R(c, fx + 3, fl - 9, 8, 5, run ? (Math.sin(t * 6) > 0 ? '#ffa030' : '#ff7010') : '#2a1a10');
      if (run) glowAt(c, fx + 7, fl - 6, 20, '#ff9030', 0.5);
      // Pipes from the columns to the furnace; product flowing when it runs.
      R(c, cols[0] + 6, fl - 22, fx - cols[0] - 6, 2, '#4a5566');
      R(c, cols[1] + 6, fl - 12, fx - cols[1] - 6, 2, '#4a5566');
      if (run) for (let k = 0; k < 3; k++) R(c, cols[0] + 6 + ((t * 12 + k * 9) % Math.max(4, fx - cols[0] - 8)), fl - 22, 2, 2, '#ffd040');
      // Crude level on the gauge.
      discAt(c, x0 + w - 7, y0 + 12, 4, '#d8d0b8');
      const an = -2.4 + fu.crude * 4.8;
      R(c, x0 + w - 7 + Math.cos(an) * 3, y0 + 12 + Math.sin(an) * 3, 1, 1, '#c02010');
      slots.posts.push({ x: fx - 4, y: fl }, { x: cols[1] + 10, y: fl });
      break;
    }
    case 'training_grounds': {
      for (let px = x0 + 6; px + 6 < x0 + w; px += 14) {
        discAt(c, px, fl - 16, 5, '#e04040');
        discAt(c, px, fl - 16, 3, '#f0f0f0');
        discAt(c, px, fl - 16, 1.5, '#e04040');
        R(c, px, fl - 11, 1, 11, '#6a5a4a');
      }
      const sw = Math.sin(t * 2) * 3;
      R(c, x0 + w - 10 + sw, y0 + 8, 1, 10, '#6a6a6a');
      box(c, x0 + w - 13 + sw, y0 + 18, 7, 12, '#8a3a2a');
      break;
    }
    default: {
      for (let px = x0 + 4; px + 10 < x0 + w; px += 14) {
        box(c, px, fl - 14, 10, 14, sh(a.accent, -0.55));
        for (let k = 0; k < 3; k++) R(c, px + 2 + k * 3, fl - 11, 1, 1, Math.floor(t * 2 + k + px) % 3 ? '#40ff60' : '#ff4030');
        slots.posts.push({ x: px + 5, y: fl });
      }
    }
  }
  // A job on it: the progress bar and a plate.
  if (a.job) {
    R(c, x0 + 2, y0 + 1, w - 4, 3, '#0b0d11');
    R(c, x0 + 3, y0 + 2, Math.round((w - 6) * Math.min(1, a.job.f)), 1, a.job.order ? '#ff4fd8' : '#76ff03');
  }
  void d;
  void lv;
  return slots;
}

/** A stretch of the Spine between rooms: the corridor wall, a door, a lamp. */
export function drawCorridor(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, tint: string, t: number, open: boolean): void {
  const wall = open ? mix('#1c222b', tint, 0.08) : '#0d0f13';
  c.fillStyle = wall;
  c.fillRect(x0, y0, w, h);
  if (!open) {
    for (let px = x0; px < x0 + w; px += 8) R(c, px, y0 + ((px / 8) % 2 ? 6 : h - 12), 4, 1, '#26292f');
    return;
  }
  c.fillStyle = 'rgba(255,255,255,0.03)';
  for (let px = x0 + 6; px < x0 + w; px += 20) c.fillRect(px, y0 + 6, 1, h - 12);
  R(c, x0, y0 + 3, w, 2, PIPE);
  R(c, x0, y0 + 3, w, 1, PIPE_HI);
  for (let px = x0 + 10; px < x0 + w - 4; px += 40) {
    R(c, px, y0 + 6, 4, 1, '#e8f0f8');
    glowAt(c, px + 2, y0 + 10, 14, '#c8e0ff', 0.16);
  }
  R(c, x0, y0 + h - 3, w, 3, FLOOR);
  R(c, x0, y0 + h - 3, w, 1, FLOOR_HI);
  void t;
}

/** A little status lamp (blinking when amber). */
function pxWarn(c: CanvasRenderingContext2D, x: number, y: number, col: string, t: number): void {
  R(c, x - 1, y - 1, 5, 5, '#0b0d11');
  R(c, x, y, 3, 3, col === '#ffb020' && Math.floor(t * 4) % 2 ? '#5a3a08' : col);
}
