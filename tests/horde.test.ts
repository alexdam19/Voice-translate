import { describe, expect, it } from 'vitest';
import { CENTER } from '../src/shared/constants';
import { OBS, TER } from '../src/shared/map';
import { findPath } from '../src/shared/motion';
import { assess, coverage, rating } from '../src/game/analysis';
import { MODULES } from '../src/game/defs';
import { deserialize, serialize } from '../src/game/save';
import { latchCap } from '../src/game/systems/ai';
import { driveScore, ownsDrive, setDrive, updateAutoDrive } from '../src/game/systems/drives';
import { tankNav } from '../src/game/systems/movement';
import { spawnRival } from '../src/game/systems/spawns';
import { stepWorld } from '../src/game/systems/step';
import { updateTesla } from '../src/game/systems/tesla';
import { onTankDestroyed } from '../src/game/systems/world';
import { hordeAlive, hordeSize, updateWaves } from '../src/game/systems/waves';
import { Tank } from '../src/game/tank';
import { TRACTION } from '../src/shared/map';
import { build, game, levelTo } from './helpers';

const run = (g: ReturnType<typeof game>, secs: number): void => {
  for (let i = 0; i < Math.round(secs * 60); i++) stepWorld(g, 1 / 60);
};

describe('horde waves', () => {
  it('warn, then surge from one side, then end with a reward', () => {
    const g = game(5);
    const p = g.player;
    g.wave.t = 0.01;
    updateWaves(g, 0.02);
    expect(g.wave.phase).toBe('warning');
    expect(g.wave.n).toBe(1);
    expect(g.wave.total).toBe(hordeSize(1, 1, true));
    const dir = g.wave.dir;
    run(g, 10);
    expect(g.wave.phase).toBe('surge');
    const horde = g.enemies.filter((e) => e.horde);
    expect(horde.length).toBeGreaterThan(0);
    // They come from the warned direction, as a wall.
    for (const e of horde.slice(0, 10)) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      expect(Math.abs(Math.atan2(Math.sin(a - dir), Math.cos(a - dir)))).toBeLessThan(1.2);
    }
    const xp = g.commander.xp + g.commander.level * 1e6;
    for (let i = 0; i < 60 * 150 && g.wave.phase !== 'calm'; i++) stepWorld(g, 1 / 60);
    expect(g.wave.phase).toBe('calm');
    expect(g.stats.hordes).toBe(1);
    expect(g.commander.xp + g.commander.level * 1e6).toBeGreaterThan(xp);
    expect(hordeAlive(g)).toBe(0);
  });

  it('grows every wave and with the threat', () => {
    expect(hordeSize(5, 1, false)).toBeGreaterThan(hordeSize(1, 1, false));
    expect(hordeSize(5, 4, false)).toBeGreaterThan(hordeSize(5, 1, false));
    expect(hordeSize(10, 3, false)).toBeGreaterThan(250);
  });

  it('a few swarmers can only claw at the hull: they need a pile to climb it', () => {
    const g = game(6);
    const p = g.player;
    for (const m of p.modules) m.weapon = null;
    p.troops = 0;
    p.recalc();
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      // Spread all round the hull, a few metres out.
      const hl = p.stats.length / 2 + 4, hw = p.stats.width / 2 + 4;
      const w = p.toWorld(Math.cos(a) * hl, Math.sin(a) * hw);
      const e = g.spawnEnemy('swarmer', w.x, w.y, 1);
      e.horde = true;
    }
    run(g, 8);
    expect(g.enemies.filter((e) => e.latch).length).toBe(0);
  });

  it('a wall of swarmers piles up against one side, climbs aboard, chews the hull, and gets shaken off at speed', () => {
    const g = game(6);
    const p = g.player;
    for (const m of p.modules) m.weapon = null;
    p.troops = 0;
    p.recalc();
    for (let i = 0; i < 160; i++) {
      // A wall of them along one 60 m stretch of the side.
      const w = p.toWorld((Math.random() - 0.5) * 60, p.stats.width / 2 + 4 + Math.random() * 10);
      const e = g.spawnEnemy('swarmer', w.x, w.y, 1);
      e.horde = true;
    }
    const hp = p.hp;
    run(g, 10);
    const on = g.enemies.filter((e) => e.latch);
    expect(on.length).toBeGreaterThan(5);
    // The ones still on the ground are stacked up the side.
    expect(Math.max(...g.enemies.filter((e) => !e.latch && p.edgeDist(e.x, e.y) < 1).map((e) => e.z))).toBeGreaterThan(4);
    expect(on.length).toBeLessThanOrEqual(latchCap(p));
    // Riding on the deck, not on the ground.
    for (const e of on) expect(p.hits(e.x, e.y, 0.1) && e.z > 1).toBe(true);
    expect(p.hp).toBeLessThan(hp);
    // Floor it: they fall off.
    p.addBuff('nitro', 10, 0.8);
    g.driveInput.active = true;
    g.driveInput.x = 0;
    g.driveInput.y = -1;
    run(g, 3);
    expect(g.enemies.filter((e) => e.latch).length).toBeLessThan(on.length / 2);
  });

  it('Tesla Coils zap climbers', () => {
    const g = game(7);
    levelTo(g, 3);
    const id = build(g, 'tesla');
    const p = g.player;
    for (const m of p.modules) if (m.id !== id) m.weapon = null;
    p.recalc();
    const e = g.spawnEnemy('swarmer', p.x, p.y, 1);
    e.horde = true;
    e.latch = { tank: p.id, lx: 1, lz: 1 };
    const hp0 = e.hp;
    g.indexEnemies();
    updateTesla(g, p, 1.5);
    expect(e.hp).toBeLessThan(hp0);
  });
});

describe('going anywhere', () => {
  it('nothing blocks a fortress: cliffs and lava are just slow (or hot)', () => {
    const g = game(8);
    const p = g.player;
    const mode = tankNav(p);
    const m = g.map;
    const tx = Math.floor(p.x) + 20, ty = Math.floor(p.y);
    m.set(tx, ty, { obs: OBS.CLIFF });
    m.set(tx + 1, ty, { ter: TER.LAVA });
    expect(m.blocked(tx, ty, mode)).toBe(false);
    expect(m.blocked(tx + 1, ty, mode)).toBe(false);
    expect(m.blocked(tx, ty, 'ground')).toBe(true);
    // A wall of cliff all the way across still has a path through it.
    for (let y = ty - 60; y <= ty + 60; y++) m.set(tx, y, { obs: OBS.CLIFF });
    m.invalidateNav();
    const path = findPath(m, p.x, p.y, tx + 15, ty, { radius: p.stats.radius * 0.85, mode, traction: TRACTION[p.drive], climb: true });
    expect(path).not.toBeNull();
  });

  it('wading through lava hurts without Magma Treads', () => {
    const g = game(9);
    const p = g.player;
    const m = g.map;
    for (let y = -15; y <= 15; y++) for (let x = -15; x <= 15; x++) m.set(Math.floor(p.x) + x, Math.floor(p.y) + y, { ter: TER.LAVA });
    const hp = p.hp;
    run(g, 2);
    expect(p.hp).toBeLessThan(hp);
    expect(g.hazardWarn).toMatch(/Lava/);
  });

  it('drive trains unlock on the Level Road and AUTO picks the best one', () => {
    const g = game(10);
    const p = g.player;
    expect(ownsDrive(g, 'tracks')).toBe(false);
    levelTo(g, 3);
    expect(ownsDrive(g, 'tracks')).toBe(true);
    expect(ownsDrive(g, 'hover')).toBe(false);
    const m = g.map;
    for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) m.set(Math.floor(p.x) + x, Math.floor(p.y) + y, { ter: TER.DUNE });
    expect(driveScore(g, 'tracks')).toBeGreaterThan(driveScore(g, 'wheels'));
    g.driveSwapT = 0;
    g.timers.drive = 0;
    updateAutoDrive(g, 0.1);
    expect(p.drive).toBe('tracks');
    // Manual swaps are free and instant for owned drives.
    expect(setDrive(g, 'wheels')).toBe(true);
    expect(setDrive(g, 'hover')).toBe(false);
  });
});

describe('the land cruiser', () => {
  it('old saves move onto the bigger deck and get their pads and main battery', () => {
    const t = Tank.deserialize({
      chassis: 'crawler', drive: 'wheels', x: CENTER, y: CENTER, rot: -Math.PI / 2, hp: 500,
      modules: [
        { key: 'bridge', cx: 3, cy: 5, weapon: null },
        { key: 'hp_light', cx: 0, cy: 0, weapon: null },
        { key: 'hp_heavy', cx: 3, cy: 1, weapon: null },
        { key: 'reactor', cx: 0, cy: 9, weapon: null },
      ],
      cargo: [],
    });
    // Onto the Titan Crawler's 18 x 38 deck plan, the bridge moved inside to +3 Command.
    expect(t.cols).toBe(18);
    expect(t.rows).toBe(38);
    expect(t.modules.find((m) => m.key === 'bridge')?.deck).toBe(1);
    const lost = t.ensureFixed();
    expect(lost).toEqual([]);
    expect(t.modules.filter((m) => m.key === 'pad').length).toBe(6);
    expect(t.modules.filter((m) => m.key === 'main_gun').length).toBe(1);
    // Everything else is still aboard, nothing overlaps.
    expect(t.modules.some((m) => m.key === 'hp_heavy') && t.modules.some((m) => m.key === 'reactor')).toBe(true);
    const cells = new Set<string>();
    for (const m of t.modules) for (let y = m.cy; y < m.cy + MODULES[m.key].h; y++) for (let x = m.cx; x < m.cx + MODULES[m.key].w; x++) {
      expect(cells.has(`${m.deck}:${x},${y}`)).toBe(false);
      cells.add(`${m.deck}:${x},${y}`);
    }
  });

  it('a save round-trips the deck, drives and wave number', () => {
    const g = game(11);
    levelTo(g, 5);
    g.wave.n = 4;
    g.drivesOwned.add('tracks');
    g.autoDrive = false;
    const d = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(d.player.modules.length).toBe(g.player.modules.length);
    expect(d.wave.n).toBe(4);
    expect(d.autoDrive).toBe(false);
    expect(d.drivesOwned.has('tracks')).toBe(true);
    expect(d.player.modules.filter((m) => m.key === 'pad').every((m) => m.weapon)).toBe(true);
  });

  it('the blueprint analysis finds real weaknesses', () => {
    const g = game(12);
    const p = g.player;
    expect(coverage(p).every((v) => v > 0)).toBe(true);
    expect(rating(g)).toBeGreaterThan(0);
    const pad = p.modules.find((m) => m.key === 'pad')!;
    g.armory.push(pad.weapon!);
    pad.weapon = null;
    p.recalc();
    expect(assess(g).some((f) => !f.good && /empty/.test(f.text))).toBe(true);
  });
});

describe('rival dreadnoughts', () => {
  it('match your hull and pay out an Epic pack and a gun', () => {
    const g = game(13);
    levelTo(g, 8);
    g.player.x = CENTER + 90;
    const t = spawnRival(g)!;
    expect(t).not.toBeNull();
    expect(t.kind).toBe('rival');
    expect(t.cell).toBe(5);
    expect(t.stats.cc).toBe(g.player.stats.cc);
    expect(t.modules.filter((m) => m.key === 'pad').every((m) => m.weapon)).toBe(true);
    onTankDestroyed(g, t);
    expect(g.pickups.some((k) => k.kind === 'chest' && k.chest === 'epic_pack')).toBe(true);
    expect(g.pickups.some((k) => k.kind === 'weapon')).toBe(true);
  });
});
