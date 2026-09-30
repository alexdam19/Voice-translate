import type { Game } from '../../game/game';
import { CAR_SIZE, home, type Car } from '../../game/systems/compound';
import { COMPOUND, GATE, PADS, PAD_L, PAD_W, STRUCTS, TOWERS } from '../../shared/compound';
import { HANGAR } from '../../shared/mapgen';
import { pxMini } from '../../ui/pixfont';
import { ART_PX, faceTiles, hasStructSprite, structSprite, towerSprite, wallSprites, type Sprite } from './compoundArt';
import { personSprite } from './people';

/**
 * The Mega Hangar compound drawn over its ground: the wall, its towers and every building in pixel art (see
 * compoundArt), the Hangar's bays, the market square's paving, the main gate's doors sliding in their slots
 * (hazard-striped, lamps red, amber or green), a gun on every tower turning to its target and flashing as it fires,
 * the traffic, and the people going about their day (guards on the gate and the wall, traders, mechanics, workers;
 * running for the Hangar when the sirens go). Overhead: the Hangar's gantry cranes, smoke from the mess, the radar,
 * searchlights sweeping the ground outside the gate during a siege.
 */

export interface CompoundView {
  c: CanvasRenderingContext2D;
  ppm: number;
  ct: number;
  st: number;
  th: number;
  time: number;
  bx(x: number, y: number): number;
  by(x: number, y: number): number;
  near(x: number, y: number, pad: number): boolean;
}

/** Metres from the Hangar's centre to the middle of the compound (the view tests are made against this). */
const MID_Y = (COMPOUND.y0 + COMPOUND.y1) / 2;
const REACH = Math.hypot(COMPOUND.x1 - COMPOUND.x0, COMPOUND.y1 - COMPOUND.y0) / 2 + 40;

const BAYS = [-HANGAR.w * 0.3, 0, HANGAR.w * 0.3];

function toHangar(v: CompoundView, hx: number, hy: number): void {
  const ppm = v.ppm;
  v.c.setTransform(v.ct * ppm, v.st * ppm, -v.st * ppm, v.ct * ppm, v.bx(hx, hy), v.by(hx, hy));
}

function blit(v: CompoundView, h: { x: number; y: number }, sp: Sprite): void {
  const w = sp.c.width / ART_PX, d = sp.c.height / ART_PX;
  if (!v.near(h.x + sp.x + w / 2, h.y + sp.y + d / 2, Math.max(w, d) / 2 + 4)) return;
  v.c.drawImage(sp.c, sp.x, sp.y, w, d);
}

/** Floor paint and clutter in the Hangar: bay lines and numbers, chevrons to the door, crates along the back wall. */
function hangarFloor(c: CanvasRenderingContext2D): void {
  const D = HANGAR.d / 2;
  BAYS.forEach((bx, i) => {
    const x0 = bx - 92, x1 = bx + 92, y0 = -D + 36, y1 = D - 26;
    c.fillStyle = 'rgba(255,196,40,0.42)';
    for (let x = x0; x < x1; x += 12) {
      c.fillRect(x, y0, 7, 1.4);
      c.fillRect(x, y1, 7, 1.4);
    }
    for (let y = y0; y < y1; y += 12) {
      c.fillRect(x0, y, 1.4, 7);
      c.fillRect(x1, y, 1.4, 7);
    }
    c.fillStyle = 'rgba(255,196,40,0.7)';
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      c.fillRect(Math.min(cx, cx + sx * 16), cy - (sy < 0 ? 1.5 : 0), 16, 3);
      c.fillRect(cx - (sx < 0 ? 1.5 : 0), Math.min(cy, cy + sy * 16), 3, 16);
    }
    pxMini(c, `BAY ${i + 1}`, bx, y0 + 8, 'rgba(255,196,40,0.3)', 'center', null, 4);
    // Chevrons toward the door.
    c.fillStyle = 'rgba(255,196,40,0.28)';
    for (let k = 0; k < 3; k++) {
      const y = D - 70 + k * 14;
      for (let j = 0; j < 12; j++) {
        c.fillRect(bx - 12 + j, y + j * 0.6, 1.2, 2);
        c.fillRect(bx + 12 - j, y + j * 0.6, 1.2, 2);
      }
    }
  });
  // Stores along the back wall and by the service bays.
  for (let x = -HANGAR.w / 2 + 12; x < HANGAR.w / 2 - 12; x += 9) {
    if (BAYS.some((bx) => Math.abs(x - bx) < 70)) continue;
    const k = Math.abs(Math.floor(x * 13.7)) % 5;
    c.fillStyle = k === 0 ? '#b03a2a' : k === 1 ? '#2a6ab0' : '#7a5a34';
    c.fillRect(x, -D + 8, 7, 7);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(x, -D + 8, 7, 1);
    if (k > 2) {
      c.fillStyle = '#8a6a40';
      c.fillRect(x + 1, -D + 17, 6, 6);
    }
  }
  for (const s of [-1, 1]) {
    for (let y = -D + 40; y < D - 40; y += 24) {
      c.fillStyle = '#3a3d42';
      c.fillRect(s * (HANGAR.w / 2 - 14) - 4, y, 8, 14);
      c.fillStyle = '#f0b020';
      c.fillRect(s * (HANGAR.w / 2 - 14) - 4, y, 8, 1.2);
    }
  }
}

/** The market square: paving, lamp posts and benches round the statue. */
function marketSquare(c: CanvasRenderingContext2D): void {
  const x0 = 400, x1 = 730, y0 = 190, y1 = 362;
  c.fillStyle = 'rgba(200,180,140,0.16)';
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.fillStyle = 'rgba(60,50,40,0.18)';
  for (let x = x0; x < x1; x += 8) c.fillRect(x, y0, 0.5, y1 - y0);
  for (let y = y0; y < y1; y += 8) c.fillRect(x0, y, x1 - x0, 0.5);
  c.strokeStyle = 'rgba(220,200,160,0.35)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(565, 275, 24, 0, Math.PI * 2);
  c.stroke();
  for (let x = x0 + 20; x < x1; x += 52) {
    for (const y of [y0 + 10, y1 - 10]) {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(x + 0.6, y + 0.6, 1.6, 1.6);
      c.fillStyle = '#2a2c30';
      c.fillRect(x, y, 1.6, 1.6);
      c.fillStyle = '#ffe08a';
      c.fillRect(x + 0.3, y - 1.2, 1, 1);
    }
  }
  for (const [bx, by] of [[540, 250], [590, 250], [540, 300], [590, 300]]) {
    c.fillStyle = '#6a4a2a';
    c.fillRect(bx - 4, by, 8, 1.8);
    c.fillStyle = '#8a6a44';
    c.fillRect(bx - 4, by, 8, 0.6);
  }
}

function drawCar(c: CanvasRenderingContext2D, car: Car, ox: number, oy: number): void {
  const s = CAR_SIZE[car.kind];
  const l = s.l, w = s.w;
  const ca = Math.cos(car.rot), sa = Math.sin(car.rot);
  c.save();
  c.transform(ca, sa, -sa, ca, car.x - ox, car.y - oy);
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(-l / 2 + 0.6, -w / 2 + 0.8, l, w);
  // Wheels.
  c.fillStyle = '#141414';
  for (const x of car.kind === 'forklift' ? [-l * 0.3, l * 0.28] : [-l * 0.32, l * 0.3]) {
    c.fillRect(x - 0.6, -w / 2 - 0.2, 1.2, 0.5);
    c.fillRect(x - 0.6, w / 2 - 0.3, 1.2, 0.5);
  }
  const body = car.col;
  if (car.kind === 'forklift') {
    c.fillStyle = '#e0a020';
    c.fillRect(-l / 2, -w / 2, l * 0.7, w);
    c.fillStyle = '#2a2a2a';
    c.fillRect(-l * 0.15, -w / 2 + 0.3, l * 0.3, w - 0.6);
    c.fillStyle = '#6a6a6a';
    c.fillRect(l * 0.2, -w / 2 + 0.2, 0.4, w - 0.4);
    c.fillStyle = '#9a9a9a';
    c.fillRect(l * 0.25, -w / 2 + 0.3, l * 0.3, 0.35);
    c.fillRect(l * 0.25, w / 2 - 0.65, l * 0.3, 0.35);
    if (Math.floor(car.x + car.y) % 3 === 0) {
      c.fillStyle = '#8a6a40';
      c.fillRect(l * 0.25, -w / 2 + 0.2, l * 0.3, w - 0.4);
    }
  } else if (car.kind === 'tanker') {
    c.fillStyle = shade(body);
    c.fillRect(l * 0.22, -w / 2, l * 0.28, w);
    c.fillStyle = '#c8c8c0';
    c.fillRect(-l / 2, -w / 2 + 0.2, l * 0.7, w - 0.4);
    c.fillStyle = '#e8e8e0';
    c.fillRect(-l / 2, -w / 2 + 0.2, l * 0.7, 0.6);
    c.fillStyle = '#a83228';
    c.fillRect(-l * 0.2, -w / 2 + 0.2, 1, w - 0.4);
    c.fillStyle = '#9ad0ec';
    c.fillRect(l * 0.42, -w / 2 + 0.4, 0.6, w - 0.8);
  } else {
    c.fillStyle = body;
    c.fillRect(-l / 2, -w / 2, l, w);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(-l / 2, -w / 2, l, 0.5);
    c.fillStyle = shade(body);
    c.fillRect(car.kind === 'truck' ? l * 0.18 : -l * 0.1, -w / 2 + 0.3, car.kind === 'truck' ? l * 0.26 : l * 0.4, w - 0.6);
    c.fillStyle = '#9ad0ec';
    c.fillRect(car.kind === 'truck' ? l * 0.4 : l * 0.25, -w / 2 + 0.4, 0.6, w - 0.8);
    if (car.kind === 'truck') {
      c.fillStyle = '#6a5a40';
      c.fillRect(-l / 2 + 0.4, -w / 2 + 0.4, l * 0.62, w - 0.8);
      c.fillStyle = '#8a6a40';
      for (let x = -l / 2 + 0.8; x < l * 0.05; x += 2) c.fillRect(x, -w / 2 + 0.7, 1.5, w - 1.4);
    }
  }
  c.fillStyle = '#fff4c0';
  c.fillRect(l / 2 - 0.3, -w / 2 + 0.2, 0.3, 0.5);
  c.fillRect(l / 2 - 0.3, w / 2 - 0.7, 0.3, 0.5);
  c.fillStyle = '#ff3020';
  c.fillRect(-l / 2, -w / 2 + 0.2, 0.3, 0.4);
  c.fillRect(-l / 2, w / 2 - 0.6, 0.3, 0.4);
  c.restore();
}

const shadeCache = new Map<string, string>();
function shade(col: string): string {
  let s = shadeCache.get(col);
  if (!s) {
    const n = parseInt(col.slice(1), 16);
    const k = (v: number): string => Math.round(v * 0.62).toString(16).padStart(2, '0');
    s = `#${k((n >> 16) & 255)}${k((n >> 8) & 255)}${k(n & 255)}`;
    shadeCache.set(col, s);
  }
  return s;
}

/** Ground layer: markings, the wall and buildings, the gate, the tower guns. */
export function drawCompoundGround(v: CompoundView, g: Game): void {
  const h = home(g);
  if (!h || !v.near(h.x, h.y + MID_Y, REACH)) return;
  const c = v.c, ppm = v.ppm;
  const cs = g.compound;
  // Everything in metres from the Hangar's centre.
  toHangar(v, h.x, h.y);
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = ppm < ART_PX;
  if (v.near(h.x, h.y, HANGAR.w / 2 + 20)) hangarFloor(c);
  if (v.near(h.x + 565, h.y + 275, 200)) marketSquare(c);
  // The lane: a dashed centre line and edge lines from the Hangar door to the gate.
  c.fillStyle = 'rgba(240,230,200,0.55)';
  for (let y = 230; y < COMPOUND.y1 - 20; y += 16) c.fillRect(-0.5, y, 1, 8);
  c.fillStyle = 'rgba(255,200,40,0.5)';
  c.fillRect(-60, 220, 1.2, COMPOUND.y1 - 230);
  c.fillRect(58.8, 220, 1.2, COMPOUND.y1 - 230);
  // The pads: yellow borders, a hazard edge, a cross in the middle, their numbers.
  PADS.forEach((p, i) => {
    const x0 = p.x - PAD_W / 2, y0 = p.y - PAD_L / 2;
    c.fillStyle = 'rgba(255,200,40,0.75)';
    c.fillRect(x0, y0, PAD_W, 1.5);
    c.fillRect(x0, y0 + PAD_L - 1.5, PAD_W, 1.5);
    c.fillRect(x0, y0, 1.5, PAD_L);
    c.fillRect(x0 + PAD_W - 1.5, y0, 1.5, PAD_L);
    c.fillStyle = 'rgba(20,20,20,0.6)';
    for (let k = 0; k < PAD_W; k += 8) c.fillRect(x0 + k, y0 + 2, 4, 2);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(p.x - 20, p.y - 1, 40, 2);
    c.fillRect(p.x - 1, p.y - 30, 2, 60);
    pxMini(c, `PAD ${i + 1}`, p.x, y0 + PAD_L - 16, 'rgba(255,200,40,0.45)', 'center', null, 2);
  });
  // The wall and everything built inside it.
  for (const sp of wallSprites()) blit(v, h, sp);
  // (Painting a building's sprite is spread over frames; until then the ground renderer's block stands in for it.)
  let paint = 12;
  for (let i = 0; i < STRUCTS.length; i++) {
    const s = STRUCTS[i];
    if (!v.near(h.x + (s.x0 + s.x1) / 2, h.y + (s.y0 + s.y1) / 2, Math.max(s.x1 - s.x0, s.y1 - s.y0) / 2 + 20)) continue;
    if (!hasStructSprite(i) && paint-- <= 0) continue;
    blit(v, h, structSprite(i));
  }
  // The gate: two doors retracting into the wall, a south face under their tops, the stripes on their meeting edges.
  const f = cs.gate.open;
  const gx = GATE.x, y0 = COMPOUND.y1 - COMPOUND.wall, y1 = COMPOUND.y1, face = faceTiles(30);
  for (const s of [-1, 1]) {
    const inner = COMPOUND.gateHalf * f, outer = COMPOUND.gateHalf;
    if (outer - inner < 0.5) continue;
    const xa = s < 0 ? gx - outer : gx + inner, w = outer - inner;
    c.fillStyle = '#34383f';
    c.fillRect(xa, y1, w, face);
    c.fillStyle = '#2a2d33';
    for (let x = xa + 3; x < xa + w; x += 6) c.fillRect(x, y1, 0.8, face);
    c.fillStyle = '#5c616b';
    c.fillRect(xa, y0, w, y1 - y0);
    c.fillStyle = '#737985';
    c.fillRect(xa, y0, w, 1.2);
    c.fillStyle = '#3e424a';
    for (let x = xa + 5; x < xa + w; x += 10) c.fillRect(x, y0 + 1.5, 0.8, y1 - y0 - 2);
    const ex = s < 0 ? xa + w - 5 : xa;
    for (let k = 0; k < 8; k++) {
      c.fillStyle = k % 2 ? '#141414' : '#f0b020';
      c.fillRect(ex, y0 + k, 5, 1);
      c.fillRect(ex, y1 + (k * face) / 8, 5, face / 8);
    }
  }
  // Breached: the wrecked doors hang twisted in their slots.
  if (cs.gate.breach > 0) {
    for (const s of [-1, 1]) {
      const bx = gx + s * (COMPOUND.gateHalf - 10);
      c.save();
      c.translate(bx, y0 + 4);
      c.rotate(s * 0.35);
      c.fillStyle = '#3e424a';
      c.fillRect(-12, -3, 24, 6);
      c.fillStyle = '#5c616b';
      c.fillRect(-12, -3, 24, 1.2);
      c.fillStyle = '#f0b020';
      for (let k = -12; k < 12; k += 4) c.fillRect(k, 1.5, 2, 1.5);
      c.restore();
      if (Math.random() < 0.3) {
        c.fillStyle = '#ffd060';
        c.fillRect(bx + (Math.random() - 0.5) * 20, y0 + Math.random() * 8, 0.8, 0.8);
      }
    }
  }
  // Towers, then their guns: a turret on each roof, turned to its target, flashing as it fires.
  TOWERS.forEach((tw, i) => {
    blit(v, h, towerSprite(tw));
    const st = cs.towers[i];
    if (!st) return;
    const r = tw.gate ? 4.5 : 3.5;
    c.fillStyle = '#1a1c20';
    c.beginPath();
    c.arc(tw.x, tw.y, r + 0.8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = tw.gate ? '#6a5a3a' : '#4e5560';
    c.beginPath();
    c.arc(tw.x, tw.y, r, 0, Math.PI * 2);
    c.fill();
    const ca = Math.cos(st.aim), sa = Math.sin(st.aim);
    c.save();
    c.transform(ca, sa, -sa, ca, tw.x, tw.y);
    c.fillStyle = '#22252b';
    c.fillRect(0, -0.9, r + 5, 1.8);
    if (tw.gate) c.fillRect(0, 0.9, r + 5, 1.2);
    if (st.flash > 0) {
      c.fillStyle = '#fff2a0';
      c.fillRect(r + 5, -1.6, 2.4, 3.2);
    }
    c.restore();
    c.fillStyle = '#8a95a5';
    c.fillRect(tw.x - r * 0.4, tw.y - r * 0.5, r * 0.5, r * 0.4);
  });
  // Gate lamps on the gate towers: red shut, amber moving (blinking), green open.
  const moving = cs.gate.open > 0.02 && cs.gate.open < 0.98;
  const lamp = moving ? (Math.floor(v.time * 4) % 2 ? '#ffb020' : '#5a3a08') : f >= 0.98 ? '#40ff60' : '#ff3020';
  for (const s of [-1, 1]) {
    const lx = gx + s * (COMPOUND.gateHalf + COMPOUND.gateTowerHalf);
    c.fillStyle = '#101010';
    c.fillRect(lx - 2.5, y0 - 2.5, 5, 5);
    c.fillStyle = lamp;
    c.fillRect(lx - 1.8, y0 - 1.8, 3.6, 3.6);
  }
  c.imageSmoothingEnabled = smooth;
  c.setTransform(1, 0, 0, 1, 0, 0);
  // The gate's sign, when close enough to read.
  if (ppm > 1.2) {
    const sx = v.bx(h.x + gx, h.y + y0), sy = v.by(h.x + gx, h.y + y0);
    if (cs.gate.breach > 0) {
      if (Math.floor(v.time * 3) % 2) pxMini(c, 'MAIN GATE BREACHED', sx, sy - 14, '#ff1744', 'center');
    } else {
      const state = moving ? (cs.gate.target ? 'OPENING' : 'CLOSING') : f >= 0.98 ? 'OPEN' : 'SEALED';
      pxMini(c, `MAIN GATE ${state}`, sx, sy - 14, lamp, 'center');
    }
    if (cs.gate.req) pxMini(c, 'CLEARANCE REQUESTED', sx, sy - 22, '#40c4ff', 'center');
    // The doors' integrity, while they're being worked on (by the horde or the crews).
    if (cs.gate.hp < 0.999) {
      const w = 60, hp = cs.gate.hp;
      c.fillStyle = 'rgba(0,0,0,0.7)';
      c.fillRect(Math.round(sx - w / 2 - 1), Math.round(sy - 32), w + 2, 5);
      c.fillStyle = hp > 0.5 ? '#76ff03' : hp > 0.25 ? '#ffab00' : '#ff1744';
      c.fillRect(Math.round(sx - w / 2), Math.round(sy - 31), Math.round(w * hp), 3);
      pxMini(c, `DOORS ${Math.round(hp * 100)}%`, sx, sy - 40, cs.gate.clawT > 0 ? '#ff8a80' : '#b0bec5', 'center');
    }
  }
}

/** The people and the traffic of the compound (people skipped when zoomed far out). */
export function drawCompoundPeople(v: CompoundView, g: Game): void {
  const h = home(g);
  if (!h || !v.near(h.x, h.y + MID_Y, REACH)) return;
  const c = v.c;
  if (v.ppm >= 0.6) {
    toHangar(v, h.x, h.y);
    for (const car of g.compound.cars) if (v.near(car.x, car.y, 8)) drawCar(c, car, h.x, h.y);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (v.ppm < 1.1) return;
  const k = v.ppm >= 8 ? 2 : 1;
  const alarm = g.compound.alarm;
  for (const r of g.compound.people) {
    if (!v.near(r.x, r.y, 4)) continue;
    const pose = r.walking ? (Math.floor(r.anim * 6) % 2 ? 'walk1' : 'walk2') : r.kind === 'guard' && (alarm || r.post?.ax === r.post?.bx) ? 'aim' : (r.kind === 'trader' || r.kind === 'mech') && Math.floor(r.anim * 0.7) % 3 === 0 ? 'work' : 'stand';
    const img = personSprite(pose, r.uniform, r.hat, r.skin, r.kind === 'worker' ? '#8a6a40' : '#6a6a70');
    const sx = Math.round(v.bx(r.x, r.y)), sy = Math.round(v.by(r.x, r.y));
    const w = img.width * k, hh = img.height * k;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(sx - Math.round(w * 0.3), sy - 1, Math.round(w * 0.6), 2);
    if (r.face < 0) {
      c.setTransform(-1, 0, 0, 1, sx, sy);
      c.drawImage(img, -w / 2, -hh, w, hh);
      c.setTransform(1, 0, 0, 1, 0, 0);
    } else c.drawImage(img, Math.round(sx - w / 2), sy - hh, w, hh);
  }
}

/** Overhead: the Hangar's gantry cranes, the mess chimneys' smoke, the radar, the mast's light, searchlights. */
export function drawCompoundOverhead(v: CompoundView, g: Game): void {
  const h = home(g);
  if (!h || !v.near(h.x, h.y + MID_Y, REACH)) return;
  const c = v.c, t = v.time;
  toHangar(v, h.x, h.y);
  // Gantry cranes riding the rails of each bay.
  if (v.near(h.x, h.y, HANGAR.w / 2 + 40)) {
    const D = HANGAR.d / 2;
    BAYS.forEach((bx, i) => {
      const y = -20 + 140 * Math.sin(t * 0.04 + i * 2.1);
      const tx = bx + 62 * Math.sin(t * 0.07 + i * 1.3);
      const yy = Math.max(-D + 40, Math.min(D - 70, y));
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(bx - 104 + 5, yy + 12, 208, 5);
      c.fillStyle = '#d89a1c';
      c.fillRect(bx - 104, yy - 3, 208, 6);
      c.fillStyle = '#f0c040';
      c.fillRect(bx - 104, yy - 3, 208, 1.2);
      c.fillStyle = '#8a5a10';
      c.fillRect(bx - 104, yy + 2, 208, 1);
      c.fillStyle = '#141414';
      for (let k = 0; k < 6; k++) {
        c.fillRect(bx - 104 + k * 3, yy - 3, 1.5, 6);
        c.fillRect(bx + 104 - k * 3 - 1.5, yy - 3, 1.5, 6);
      }
      for (const s of [-1, 1]) {
        c.fillStyle = '#3a3d42';
        c.fillRect(bx + s * 102 - 3, yy - 7, 6, 14);
        c.fillStyle = '#ff5030';
        c.fillRect(bx + s * 102 - 1, yy - 7, 2, 1.2);
      }
      c.fillStyle = '#44484e';
      c.fillRect(tx - 6, yy - 5, 12, 10);
      c.fillStyle = '#6a6f76';
      c.fillRect(tx - 6, yy - 5, 12, 1.4);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(tx - 1.5 + 4, yy + 9, 3, 3);
      c.fillStyle = '#e0a020';
      c.fillRect(tx - 1.5, yy + 5, 3, 3);
    });
  }
  // Smoke from the mess hall's chimneys.
  const mess = STRUCTS.find((s) => s.kind === 'mess');
  if (mess && v.near(h.x + (mess.x0 + mess.x1) / 2, h.y + mess.y0, 120)) {
    const w = mess.x1 - mess.x0, y = mess.y0 + (mess.y1 - mess.y0) * 0.3;
    for (let j = 0; j < 3; j++) {
      const x = mess.x0 + w * (0.25 + j * 0.25);
      for (let k = 0; k < 6; k++) {
        const ph = (t * 0.22 + k / 6 + j * 0.37) % 1;
        c.fillStyle = `rgba(200,200,195,${(0.32 * (1 - ph)).toFixed(3)})`;
        c.beginPath();
        c.arc(x + ph * 10 + Math.sin(ph * 6 + j) * 2, y - ph * 28, 2 + ph * 6, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  // The HQ's radar sweeping round, the mast's warning light.
  const hq = STRUCTS.find((s) => s.kind === 'command');
  if (hq) {
    const rx = hq.x0 + (hq.x1 - hq.x0) * 0.78, ry = hq.y0 + (hq.y1 - hq.y0) * 0.32;
    const a = t * 1.6;
    c.strokeStyle = 'rgba(60,70,80,0.9)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(rx - Math.cos(a) * 4, ry - Math.sin(a) * 4);
    c.lineTo(rx + Math.cos(a) * 4, ry + Math.sin(a) * 4);
    c.stroke();
  }
  const mast = STRUCTS.find((s) => s.kind === 'mast');
  if (mast && t % 1.4 < 0.7) {
    const mx = (mast.x0 + mast.x1) / 2, my = mast.y0 + 0.8;
    c.fillStyle = 'rgba(255,40,30,0.35)';
    c.beginPath();
    c.arc(mx, my, 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ff3020';
    c.fillRect(mx - 0.8, my - 0.8, 1.6, 1.6);
  }
  // Searchlights sweep the ground outside the gate while the sirens are on.
  if (g.compound.alarm) {
    for (const s of [-1, 1]) {
      const lx = GATE.x + s * (COMPOUND.gateHalf + COMPOUND.gateTowerHalf), ly = COMPOUND.y1 - COMPOUND.wall / 2;
      const a = Math.PI / 2 + Math.sin(t * 0.7 + (s > 0 ? 1.7 : 0)) * 0.9;
      const len = 260, spread = 0.12;
      const grd = c.createRadialGradient(lx, ly, 4, lx, ly, len);
      grd.addColorStop(0, 'rgba(255,250,210,0.28)');
      grd.addColorStop(1, 'rgba(255,250,210,0)');
      c.fillStyle = grd;
      c.beginPath();
      c.moveTo(lx, ly);
      c.arc(lx, ly, len, a - spread, a + spread);
      c.closePath();
      c.fill();
    }
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}

/** Name tags over the visiting bases (close in). */
export function drawCompoundTags(v: CompoundView, g: Game): void {
  if (v.ppm < 1.2) return;
  for (const b of g.compound.bases) {
    const t = b.tank;
    if (!v.near(t.x, t.y, t.stats.length)) continue;
    const sx = v.bx(t.x, t.y), sy = v.by(t.x, t.y) - (t.stats.width / 2) * v.ppm - 10;
    const what = b.state === 'docked' ? 'DOCKED' : b.state === 'waitOut' || b.state === 'waitIn' ? 'AWAITING CLEARANCE' : b.state === 'leaving' ? 'DEPARTING' : 'INBOUND';
    pxMini(v.c, `${b.name} · ${what}`, sx, sy, '#b0e0ff', 'center');
  }
}
