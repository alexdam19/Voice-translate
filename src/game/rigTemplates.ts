import { RNG } from '../shared/rng';
import { ZONES } from '../shared/zones';
import { Rig } from './rig';
import { BG, CHASSIS, MODULES, RT } from './rigDefs';

const FIRST = ['Vex', 'Rook', 'Juno', 'Kade', 'Mara', 'Ozzy', 'Tamsin', 'Brick', 'Nyx', 'Solder', 'Wren', 'Grit', 'Pike', 'Echo', 'Dusk', 'Riva', 'Hex', 'Moth', 'Cinder', 'Talon'];
const LAST = ['Kowalski', 'Ashgrove', 'Nine', 'Rustfang', 'Okafor', 'Vance', 'Ironside', 'Marrow', 'Quill', 'Duarte', 'Sato', 'Holloway', 'Reyes', 'Blackwell'];

export function crewName(rng: () => number = Math.random): string {
  return `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
}

function put(r: Rig, key: string, x: number, y: number): void {
  const def = MODULES[key];
  const err = r.checkModule(def, x, y);
  if (err) throw new Error(`template: cannot place ${key} at ${x},${y}: ${err}`);
  r.addModule(def, x, y);
}

/**
 * The starting crawler: two decks, a roof with two gun mounts, and empty
 * space left on the lower deck for the player's first expansions.
 */
export function buildStarterRig(): Rig {
  const c = CHASSIS[0];
  const r = new Rig(c.w, c.h, 'player', 'The Rustbucket');
  const W = c.w;

  r.fillBg(1, 4, W - 2, 9, BG.PANEL);
  r.fillTiles(0, 3, W, 1, RT.HULL); // roof
  r.fillTiles(0, 3, 1, 10, RT.HULL); // rear wall
  r.fillTiles(W - 1, 3, 1, 10, RT.HULL); // front wall
  r.fillTiles(1, 8, W - 2, 1, RT.HULL); // deck floor
  r.fillTiles(18, 8, 4, 1, RT.PLATFORM);
  r.fillTiles(20, 4, 1, 9, RT.LADDER);
  r.fillTiles(2, 3, 1, 5, RT.LADDER); // roof hatch
  r.fillTiles(0, 10, 1, 3, RT.DOOR);
  r.fillTiles(W - 1, 10, 1, 3, RT.DOOR);
  r.fillTiles(W - 1, 5, 1, 2, RT.WINDOW);
  r.fillTiles(0, 5, 1, 2, RT.WINDOW);
  for (const [x, y] of [[12, 4], [27, 4], [8, 9], [30, 9], [35, 9]]) r.setTile(x, y, RT.LAMP);

  // Upper deck
  put(r, 'cockpit', W - 5, 5);
  put(r, 'quarters', 29, 5);
  put(r, 'barracks', 22, 5);
  put(r, 'fabricator', 14, 5);
  put(r, 'armory', 9, 5);
  put(r, 'cargo', 4, 5);
  // Lower deck
  put(r, 'engine', 2, 10);
  put(r, 'reactor', 7, 10);
  put(r, 'refinery', 11, 9);
  put(r, 'cargo', 23, 10);
  // Roof guns
  put(r, 'autocannon', 8, 1);
  put(r, 'autocannon', 30, 1);

  r.recalc();
  r.shield = r.shieldMax;
  r.crew = [0, 1].map(() => ({ name: crewName(), hp: 100, post: -1, bob: Math.random() * 6 }));
  r.cargo.add('iron_ore', 24);
  r.cargo.add('copper_ore', 16);
  r.cargo.add('rock', 30);
  r.cargo.add('scrap', 40);
  return r;
}

/** Hostile rigs in harder zones are built tougher. */
function toughen(r: Rig, diff: number): void {
  const f = 0.8 + diff * 0.3;
  for (const m of r.modules) {
    m.maxHp = Math.round(m.maxHp * f);
    m.hp = m.maxHp;
  }
}

const RAIDER_NAMES = ['Gutripper', 'Skullhauler', 'Red Wake', 'The Maw', 'Ditchwitch', 'Bonecart', 'Scorchjaw', 'Widowmaker', 'Carrion Queen', 'Lockjaw', 'Grave Engine', 'Hellmouth'];
const NATIVE_DRIVE: Record<string, string> = { magma: 'magma', cryo: 'chains', rustbelt: 'wheels', dunes: 'tracks', glass: 'tracks', acid: 'hover' };

function turretPool(diff: number): string[] {
  const pool = ['autocannon', 'autocannon'];
  if (diff >= 2) pool.push('flak');
  if (diff >= 3) pool.push('laser_turret');
  if (diff >= 4) pool.push('missile_pod', 'laser_turret');
  return pool;
}

/** A roaming raider war-rig. `mirror` puts the bridge on the left (facing west). */
export function buildRaiderRig(zoneIndex: number, seed: number, mirror: boolean): Rig {
  const rng = new RNG(seed);
  const z = ZONES[zoneIndex];
  const diff = z.difficulty;
  const W = 26 + diff * 5 + rng.int(0, 6);
  const H = 10;
  const r = new Rig(W, H, 'hostile', rng.pick(RAIDER_NAMES));
  r.zoneIndex = zoneIndex;
  r.drive = NATIVE_DRIVE[z.key] ?? 'wheels';
  const X = (x: number, w = 1): number => (mirror ? W - x - w : x);
  const wallT = diff >= 3 ? RT.ARMOR : RT.HULL;

  r.fillBg(1, 4, W - 2, 5, BG.PANEL);
  r.fillTiles(0, 3, W, 1, diff >= 4 ? RT.ARMOR : RT.HULL);
  r.fillTiles(0, 3, 1, 6, wallT);
  r.fillTiles(W - 1, 3, 1, 6, wallT);
  r.fillTiles(X(0), 6, 1, 3, RT.DOOR);
  r.setTile(X(W - 1), 5, RT.WINDOW);

  const place = (key: string, x: number, y: number): void => {
    const d = MODULES[key];
    const px = X(x, d.w);
    if (!r.checkModule(d, px, y)) r.addModule(d, px, y);
  };
  place('cockpit', W - 5, 6);
  place('engine', 1, 6);
  place('reactor', 5, 6);
  place('barracks', 9, 6);
  if (diff >= 2) place('engine', 15, 6);
  if (diff >= 4) place('shield', 19, 6);
  if (diff >= 3) place('reactor', W - 9, 6);

  const pool = turretPool(diff);
  const nT = 1 + Math.floor(diff * 0.8);
  const slots: number[] = [];
  const step = Math.max(4, Math.floor((W - 4) / nT));
  for (let i = 0; i < nT; i++) slots.push(2 + i * step);
  for (const sx of slots) {
    const key = rng.pick(pool);
    const d = MODULES[key];
    if (sx + d.w < W) place(key, sx, 3 - d.h);
  }
  r.recalc();
  toughen(r, diff);
  r.shield = r.shieldMax;
  r.crew = Array.from({ length: 2 + diff }, () => ({ name: crewName(), hp: 100, post: -1, bob: Math.random() * 6 }));
  return r;
}

/** A fortified, stationary raider outpost. */
export function buildOutpost(zoneIndex: number, seed: number): Rig {
  const rng = new RNG(seed);
  const z = ZONES[zoneIndex];
  const diff = z.difficulty;
  const W = 44, H = 16;
  const r = new Rig(W, H, 'hostile', `${z.name.split(' ')[0]} Outpost`);
  r.zoneIndex = zoneIndex;
  r.anchored = true;
  const wallT = diff >= 3 ? RT.ARMOR : RT.HULL;

  r.fillBg(1, 4, W - 2, 11, BG.PANEL);
  r.fillTiles(0, 3, W, 1, wallT);
  r.fillTiles(0, 3, 1, 12, wallT);
  r.fillTiles(W - 1, 3, 1, 12, wallT);
  r.fillTiles(1, 9, W - 2, 1, RT.HULL);
  r.fillTiles(20, 9, 4, 1, RT.PLATFORM);
  r.fillTiles(0, 12, 1, 3, RT.DOOR);
  r.fillTiles(W - 1, 12, 1, 3, RT.DOOR);
  for (const x of [6, 18, 30, 40]) r.setTile(x, 4, RT.LAMP);

  const place = (key: string, x: number, y: number): void => {
    const d = MODULES[key];
    if (!r.checkModule(d, x, y)) r.addModule(d, x, y);
  };
  place('cockpit', 20, 6);
  place('barracks', 3, 6);
  place('armory', 11, 6);
  place('cargo', 27, 6);
  place('reactor', 34, 6);
  place('barracks', 3, 12);
  place('reactor', 11, 12);
  place('cargo', 16, 12);
  if (diff >= 3) place('shield', 30, 12);
  place('refinery', 36, 11);

  const pool = turretPool(diff + 1);
  for (const sx of [2, 10, 18, 26, 34, 40]) {
    if (rng.chance(0.25 + diff * 0.12)) {
      const key = rng.pick(pool);
      const d = MODULES[key];
      if (sx + d.w < W) place(key, sx, 3 - d.h);
    }
  }
  r.recalc();
  toughen(r, diff + 1);
  r.shield = r.shieldMax;
  r.crew = Array.from({ length: 3 + diff }, () => ({ name: crewName(), hp: 100, post: -1, bob: Math.random() * 6 }));
  return r;
}
