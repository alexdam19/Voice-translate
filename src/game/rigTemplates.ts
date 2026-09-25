import { RNG } from '../shared/rng';
import { ZONES } from '../shared/zones';
import { makeCrew, randomRole, type CrewRole } from './crew';
import { Rig } from './rig';
import { BG, CHASSIS, MODULES, RT } from './rigDefs';

export { crewName } from './crew';

function put(r: Rig, key: string, x: number, y: number): void {
  const def = MODULES[key];
  const err = r.checkModule(def, x, y);
  if (err) throw new Error(`template: cannot place ${key} at ${x},${y}: ${err}`);
  r.addModule(def, x, y);
}

/**
 * Lays down a tank hull: a flat roof at `roof`, sloped glacis plates stepping
 * down to vertical walls at both ends, and interior backdrop everywhere inside.
 */
function tankHull(r: Rig, roof: number, slope: number, wallT: number = RT.HULL, roofT: number = RT.HULL): void {
  const W = r.cols, H = r.rows;
  r.fillTiles(slope, roof, W - slope * 2, 1, roofT);
  for (let i = 0; i < slope; i++) {
    r.setTile(slope - 1 - i, roof + i, RT.GLACIS_L);
    r.setTile(W - slope + i, roof + i, RT.GLACIS_R);
  }
  const wallTop = roof + slope;
  r.fillTiles(0, wallTop, 1, H - 1 - wallTop, wallT);
  r.fillTiles(W - 1, wallTop, 1, H - 1 - wallTop, wallT);
  for (let y = roof + 1; y < H - 1; y++) {
    const inset = Math.max(0, slope - (y - roof));
    r.fillBg(1 + Math.max(0, inset - 1), y, W - 2 - Math.max(0, inset - 1) * 2, 1, BG.PANEL);
  }
}

/**
 * The starting tank: a 48x16 two-deck hull with a heavy main battery on the
 * roof, flanking autocannons, and a lot of empty deck to grow into.
 */
export function buildStarterRig(): Rig {
  const c = CHASSIS[0];
  const r = new Rig(c.w, c.h, 'player', 'The Rustbucket');
  const W = c.w;

  tankHull(r, 5, 4);
  r.fillTiles(1, 10, W - 2, 1, RT.HULL); // deck floor
  r.fillTiles(16, 10, 4, 1, RT.PLATFORM);
  r.fillTiles(18, 6, 1, 9, RT.LADDER);
  r.fillTiles(6, 5, 1, 5, RT.LADDER); // roof hatch
  r.fillTiles(0, 12, 1, 3, RT.DOOR);
  r.fillTiles(W - 1, 12, 1, 3, RT.DOOR);
  r.setTile(W - 1, 9, RT.WINDOW);
  for (const [x, y] of [[10, 6], [27, 6], [38, 6], [3, 11], [21, 11], [30, 11], [40, 11]]) r.setTile(x, y, RT.LAMP);

  // Upper deck
  put(r, 'cockpit', W - 6, 7);
  put(r, 'quarters', 36, 7);
  put(r, 'barracks', 29, 7);
  put(r, 'fabricator', 25, 7);
  put(r, 'armory', 20, 7);
  put(r, 'cargo', 12, 7);
  // Lower deck
  put(r, 'engine', 1, 12);
  put(r, 'engine', 5, 12);
  put(r, 'reactor', 9, 12);
  put(r, 'refinery', 12, 11);
  put(r, 'cargo', 20, 12);
  put(r, 'reactor', 24, 12);
  // Roof: the main gun and two flanking autocannons
  put(r, 'main_battery', 21, 2);
  put(r, 'autocannon', 9, 3);
  put(r, 'autocannon', 36, 3);

  r.crew = (['driver', 'gunner', 'gunner', 'engineer'] as CrewRole[]).map((role) => makeCrew(role, Math.random, 1));
  r.recalc();
  r.shield = r.shieldMax;
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
  if (diff >= 2) pool.push('flak', 'gatling');
  if (diff >= 3) pool.push('laser_turret');
  if (diff >= 4) pool.push('missile_pod', 'laser_turret', 'mortar');
  return pool;
}

function hostileCrew(n: number): ReturnType<typeof makeCrew>[] {
  return Array.from({ length: n }, () => makeCrew(randomRole()));
}

/** A roaming raider war-tank. `mirror` puts the bridge on the left (facing west). */
export function buildRaiderRig(zoneIndex: number, seed: number, mirror: boolean): Rig {
  const rng = new RNG(seed);
  const z = ZONES[zoneIndex];
  const diff = z.difficulty;
  const W = 30 + diff * 6 + rng.int(0, 6);
  const H = 12;
  const r = new Rig(W, H, 'hostile', rng.pick(RAIDER_NAMES));
  r.zoneIndex = zoneIndex;
  r.drive = NATIVE_DRIVE[z.key] ?? 'wheels';
  const X = (x: number, w = 1): number => (mirror ? W - x - w : x);
  const wallT = diff >= 3 ? RT.ARMOR : RT.HULL;

  tankHull(r, 4, 3, wallT, diff >= 4 ? RT.ARMOR : RT.HULL);
  r.fillTiles(X(0), 8, 1, 3, RT.DOOR);
  r.setTile(X(W - 1), 7, RT.WINDOW);

  const place = (key: string, x: number, y: number): void => {
    const d = MODULES[key];
    const px = X(x, d.w);
    if (!r.checkModule(d, px, y)) r.addModule(d, px, y);
  };
  place('cockpit', W - 6, 8);
  place('engine', 1, 8);
  place('reactor', 5, 8);
  place('barracks', 9, 8);
  if (diff >= 2) place('engine', 15, 8);
  if (diff >= 4) place('shield', 19, 8);
  if (diff >= 3) place('reactor', W - 10, 8);

  // Heavier raiders carry a main battery amidships.
  const gunSlots: number[] = [];
  if (diff >= 3) {
    const mx = Math.floor(W / 2) - 3;
    place('main_battery', mx, 1);
    gunSlots.push(mx - 1, mx + 6);
  }
  const pool = turretPool(diff);
  const nT = 1 + Math.floor(diff * 0.8);
  const step = Math.max(4, Math.floor((W - 8) / nT));
  for (let i = 0; i < nT; i++) {
    const sx = 4 + i * step;
    const key = rng.pick(pool);
    const d = MODULES[key];
    if (sx + d.w < W - 3) place(key, sx, 4 - d.h);
  }
  r.recalc();
  toughen(r, diff);
  r.shield = r.shieldMax;
  r.crew = hostileCrew(2 + diff);
  void gunSlots;
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

  if (diff >= 2) place('main_battery', 19, 0);
  const pool = turretPool(diff + 1);
  for (const sx of [2, 10, 28, 34, 40]) {
    if (rng.chance(0.3 + diff * 0.12)) {
      const key = rng.pick(pool);
      const d = MODULES[key];
      if (sx + d.w < W) place(key, sx, 3 - d.h);
    }
  }
  r.recalc();
  toughen(r, diff + 1);
  r.shield = r.shieldMax;
  r.crew = hostileCrew(3 + diff);
  return r;
}
