import type { Game } from '../game/game';
import { bodyOutline } from '../render/px/titanTop';
import { paintEngineRoom } from './engineArt';
import { pxMini } from './pixfont';

/**
 * The Titan's security cameras, on a monitor that flips up over the windscreen like a night guard's tablet: a feed
 * from each camera round the ship (the bow and stern, the flanks, the deck from the command tower, the mast, the
 * crawlers, the engine room), and a map of the hull with every camera on it to click between them. The map shows
 * anything near the ship as a red blip, and anything that's climbed aboard as a blinking one, so you know which
 * camera to look through. Switching cameras shows static for a moment.
 */

export interface CamDef {
  id: string;
  name: string;
  kind: '3d' | 'engine';
  /** Ship-local place as fractions of the hull (forward, starboard), height over the roof (m), turn, tilt, lens. */
  fx: number;
  fz: number;
  dh: number;
  yaw: number;
  pitch: number;
  fov: number;
}

export const CAMS: CamDef[] = [
  { id: '01', name: 'BOW', kind: '3d', fx: 0.51, fz: 0, dh: -24, yaw: 0, pitch: 0.2, fov: 72 },
  { id: '02', name: 'STERN', kind: '3d', fx: -0.52, fz: 0, dh: -14, yaw: Math.PI, pitch: 0.14, fov: 72 },
  { id: '03', name: 'PORT FLANK', kind: '3d', fx: 0.2, fz: -0.54, dh: 3, yaw: Math.PI + 0.3, pitch: 0.36, fov: 76 },
  { id: '04', name: 'STBD FLANK', kind: '3d', fx: 0.2, fz: 0.54, dh: 3, yaw: Math.PI - 0.3, pitch: 0.36, fov: 76 },
  { id: '05', name: 'DECK FWD', kind: '3d', fx: 0.02, fz: 0, dh: 16, yaw: 0, pitch: 0.28, fov: 78 },
  { id: '06', name: 'DECK AFT', kind: '3d', fx: 0.36, fz: 0, dh: 16, yaw: Math.PI, pitch: 0.24, fov: 78 },
  { id: '07', name: 'MAST', kind: '3d', fx: -0.05, fz: 0.02, dh: 110, yaw: 0.6, pitch: 1.05, fov: 80 },
  { id: '08', name: 'CRAWLER FL', kind: '3d', fx: 0.44, fz: -0.56, dh: -33, yaw: Math.PI - 0.12, pitch: 0.04, fov: 82 },
  { id: '09', name: 'CRAWLER RR', kind: '3d', fx: -0.44, fz: 0.56, dh: -33, yaw: 0.12, pitch: 0.04, fov: 82 },
  { id: '10', name: 'ENGINE ROOM', kind: 'engine', fx: -0.38, fz: 0, dh: -30, yaw: 0, pitch: 0, fov: 70 },
];

/** Where a camera sits (ship-local metres), for the 3D view. */
export function camSpot(g: Game, c: CamDef): { lx: number; lz: number; h: number; yaw: number; pitch: number; fov: number } {
  const p = g.player;
  return { lx: c.fx * p.stats.length, lz: c.fz * p.stats.width, h: p.deckY(0) + c.dh, yaw: c.yaw, pitch: c.pitch, fov: c.fov };
}

const engineRoom = { cv: null as HTMLCanvasElement | null, key: '' };

/** The engine room camera: the hall painted, the machine working, sparks and steam. */
export function drawEngineFeed(c: CanvasRenderingContext2D, g: Game, x0: number, y0: number, w: number, h: number, time: number): void {
  const key = g.player.engineKey;
  if (!engineRoom.cv || engineRoom.key !== key) {
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 180;
    paintEngineRoom(cv, key);
    engineRoom.cv = cv;
    engineRoom.key = key;
  }
  c.save();
  c.imageSmoothingEnabled = false;
  const sh = Math.sin(time * 40) * (g.player.spool > 0.2 ? 0.8 : 0);
  c.drawImage(engineRoom.cv!, x0, y0 + sh, w, h);
  // Firebox glow breathing with the revs.
  const glow = 0.12 + g.player.spool * 0.2 + Math.sin(time * 9) * 0.04;
  c.fillStyle = `rgba(255,140,40,${glow})`;
  c.fillRect(x0, y0 + h * 0.4, w, h * 0.6);
  // The tube: scanlines, a green cast, dark corners.
  c.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = y0; y < y0 + h; y += 2) c.fillRect(x0, y, w, 1);
  c.fillStyle = 'rgba(40,90,60,0.12)';
  c.fillRect(x0, y0, w, h);
  const vg = c.createRadialGradient(x0 + w / 2, y0 + h / 2, Math.min(w, h) * 0.3, x0 + w / 2, y0 + h / 2, Math.max(w, h) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = vg;
  c.fillRect(x0, y0, w, h);
  c.restore();
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The monitor's parts when it fills X, Y, W, H (`t` 0..1 as it flips up): its top edge, the feed, the hull map. */
export function monitorRects(X: number, Y: number, W: number, H: number, t: number): { y0: number; feed: Rect; map: Rect } {
  const y0 = Y + Math.round((1 - t) * H);
  const mapW = Math.max(90, Math.min(150, Math.round(W * 0.26)));
  return { y0, feed: { x: X + 10, y: y0 + 16, w: W - mapW - 26, h: H - 30 }, map: { x: X + W - mapW - 12, y: y0 + 16, w: mapW, h: H - 30 } };
}

/** Snow on a screen with no picture yet: a small field of grey noise, fresh every frame, blown up. */
const snow = { cv: null as HTMLCanvasElement | null, img: null as ImageData | null };
function drawSnow(c: CanvasRenderingContext2D, r: Rect): void {
  if (!snow.cv) {
    snow.cv = document.createElement('canvas');
    snow.cv.width = 96;
    snow.cv.height = 54;
    snow.img = snow.cv.getContext('2d')!.createImageData(96, 54);
  }
  const d = snow.img!.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 180) | 0;
    d[i] = v;
    d[i + 1] = v + 8;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  snow.cv.getContext('2d')!.putImageData(snow.img!, 0, 0);
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(snow.cv, r.x, r.y, r.w, r.h);
  c.restore();
}

/**
 * The monitor over the glass (`t` 0..1 as it flips up): the bezel, the feed's caption, REC and the clock, and the
 * hull map with the cameras. The feed is left clear for the picture when `live`, snow while it comes up. `hit`
 * registers click targets (cam0..camN, camsClose).
 */
export function drawMonitor(c: CanvasRenderingContext2D, g: Game, X: number, Y: number, W: number, H: number, cam: number, time: number, t: number, live: boolean | ((r: Rect) => void), hit: (id: string, x: number, y: number, w: number, h: number) => void): { feed: Rect } {
  const { y0, feed, map } = monitorRects(X, Y, W, H, t);
  // The case: dark steel, rounded, screws in the corners.
  c.fillStyle = '#1a1c1e';
  c.fillRect(X, y0, W, H);
  c.fillStyle = '#2c2f33';
  c.fillRect(X + 2, y0 + 2, W - 4, H - 4);
  c.fillStyle = '#0c0d0e';
  c.fillRect(feed.x - 2, feed.y - 2, feed.w + 4, feed.h + 4);
  for (const [sx, sy] of [[X + 5, y0 + 5], [X + W - 7, y0 + 5], [X + 5, y0 + H - 7], [X + W - 7, y0 + H - 7]]) {
    c.fillStyle = '#5a5e64';
    c.fillRect(sx, sy, 3, 3);
    c.fillStyle = '#2a2c2e';
    c.fillRect(sx + 1, sy + 1, 1, 1);
  }
  pxMini(c, 'TITAN CCTV - SECURITY', X + 12, y0 + 5, '#8a9098', 'left', null);
  // The feed area is left clear (the 3D view or the engine room shows through); captions over it.
  if (typeof live === 'function') live(feed);
  else if (live) c.clearRect(feed.x, feed.y, feed.w, feed.h);
  else drawSnow(c, feed);
  const cd = CAMS[cam];
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillRect(feed.x + 4, feed.y + 4, (cd.name.length + 8) * 4 + 6, 9);
  pxMini(c, `CAM ${cd.id}  ${cd.name}`, feed.x + 7, feed.y + 6, '#d8ffd8', 'left', null);
  if (Math.floor(time * 2) % 2 === 0) {
    c.fillStyle = '#ff2a1a';
    c.fillRect(feed.x + feed.w - 38, feed.y + 7, 4, 4);
  }
  pxMini(c, 'REC', feed.x + feed.w - 30, feed.y + 6, '#ffd0d0', 'left', null);
  const t0 = Math.floor(g.stats.time);
  pxMini(c, `${String(Math.floor(t0 / 3600)).padStart(2, '0')}:${String(Math.floor(t0 / 60) % 60).padStart(2, '0')}:${String(t0 % 60).padStart(2, '0')}`, feed.x + feed.w - 6, feed.y + feed.h - 10, '#d8ffd8', 'right', null);
  // Signal bars.
  for (let i = 0; i < 5; i++) {
    c.fillStyle = i < 4 ? '#7aff8a' : '#2a4a2a';
    c.fillRect(feed.x + 6 + i * 4, feed.y + feed.h - 8 - i, 3, 2 + i);
  }
  // The hull map.
  const mx = map.x, my = map.y, mh = map.h, mapW = map.w;
  c.fillStyle = '#050a06';
  c.fillRect(mx, my, mapW, mh);
  c.fillStyle = 'rgba(80,255,120,0.06)';
  for (let yy = my; yy < my + mh; yy += 6) c.fillRect(mx, yy, mapW, 1);
  const p = g.player;
  const L = p.stats.length, Wd = p.stats.width;
  // The ship drawn bow up, filling the map's height.
  const k = Math.min((mh - 30) / (L * 1.25), (mapW - 16) / (Wd * 1.3));
  const cx = mx + mapW / 2, cy = my + mh / 2 + 4;
  const toMap = (lx: number, lz: number): [number, number] => [cx + lz * k, cy - lx * k];
  const out = bodyOutline(L, Wd);
  c.strokeStyle = '#4aff6a';
  c.lineWidth = 1;
  c.beginPath();
  out.forEach(([lx, lz], i) => {
    const [px, py] = toMap(lx, lz);
    if (i) c.lineTo(px + 0.5, py + 0.5);
    else c.moveTo(px + 0.5, py + 0.5);
  });
  c.closePath();
  c.stroke();
  // Threats: red blips near the hull, blinking ones aboard.
  for (const e of g.enemies) {
    if (e.hp <= 0 || e.burrowed) continue;
    const l = p.toLocal(e.x, e.y);
    if (Math.abs(l.lx) > L * 0.75 || Math.abs(l.lz) > L * 0.5) continue;
    const [px, py] = toMap(l.lx, l.lz);
    if (px < mx || py < my || px >= mx + mapW || py >= my + mh) continue;
    const aboard = !!e.latch;
    if (aboard && Math.floor(time * 4) % 2) continue;
    c.fillStyle = aboard ? '#ff3020' : 'rgba(255,60,40,0.75)';
    c.fillRect(Math.round(px), Math.round(py), aboard ? 2 : 1, aboard ? 2 : 1);
  }
  // Cameras (a button where each one sits, nudged apart where they crowd).
  const bw = 18, bh = 9;
  const placed: [number, number][] = [];
  CAMS.forEach((cm, i) => {
    const lx = cm.fx * L, lz = cm.fz * Wd;
    const [px, py] = toMap(lx, lz);
    const sel = i === cam;
    const bx = Math.round(Math.max(mx + 2, Math.min(mx + mapW - bw - 2, px - bw / 2)));
    let by = Math.round(Math.max(my + 12, Math.min(my + mh - bh - 2, py - bh / 2)));
    for (let k2 = 0; k2 < CAMS.length && placed.some(([qx, qy]) => Math.abs(qx - bx) < bw + 1 && Math.abs(qy - by) < bh + 1); k2++) by += bh + 1;
    placed.push([bx, by]);
    // A tick from the button to the camera's true place.
    c.fillStyle = 'rgba(122,255,138,0.5)';
    c.fillRect(Math.round(px), Math.round(py), 1, 1);
    c.fillStyle = sel ? (Math.floor(time * 3) % 2 ? '#7aff8a' : '#4ad85a') : '#1a2a1c';
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = sel ? '#0a1a0a' : '#6aff7a';
    pxMini(c, cm.id, bx + bw / 2, by + 2, sel ? '#061006' : '#7aff8a', 'center', null);
    hit(`cam${i}`, bx - 1, by - 1, bw + 2, bh + 2);
  });
  pxMini(c, 'CAMERAS', mx + mapW / 2, my + 3, '#7aff8a', 'center', null);
  // Close tab.
  const tw = 60;
  c.fillStyle = '#3a3e44';
  c.fillRect(X + W / 2 - tw / 2, y0 + H - 12, tw, 10);
  pxMini(c, 'CLOSE CAMS', X + W / 2, y0 + H - 10, '#e0e4e8', 'center', null);
  hit('camsClose', X + W / 2 - tw / 2, y0 + H - 13, tw, 12);
  return { feed };
}
