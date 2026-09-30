import { describe, expect, it } from 'vitest';
import { clawGate, gateXY, hardAt, home, hullBlocked, requestClearance, siegeGoal, updateCompound } from '../src/game/systems/compound';
import { stepWorld } from '../src/game/systems/step';
import { COMPOUND, GATE, PADS, STRUCTS } from '../src/shared/compound';
import { OBS } from '../src/shared/map';
import { game } from './helpers';

const DT = 1 / 30;

function run(g: ReturnType<typeof game>, secs: number, until: () => boolean = () => false): number {
  for (let t = 0; t < secs; t += DT) {
    stepWorld(g, DT);
    if (until()) return t;
  }
  return Infinity;
}

/** A quiet game: no waves or sieges turning up mid-test. */
function quiet(): ReturnType<typeof game> {
  const g = game();
  g.compound.siegeT = 1e9;
  g.compound.trafficT = 1e9;
  g.wave.t = 1e9;
  return g;
}

describe('the Mega Hangar compound', () => {
  it('walls the Hangar in: towers, buildings, one shut gate, a clear lane from the door to it', () => {
    const g = quiet();
    const h = home(g)!;
    // The wall all the way round (the gate shut too).
    for (let x = COMPOUND.x0 + 2; x < COMPOUND.x1 - 2; x += 7) {
      expect(hardAt(g, h.x + x, h.y + COMPOUND.y0 + 3)).toBe(true);
      expect(hardAt(g, h.x + x, h.y + COMPOUND.y1 - 3)).toBe(true);
    }
    for (let y = COMPOUND.y0 + 2; y < COMPOUND.y1 - 2; y += 7) {
      expect(hardAt(g, h.x + COMPOUND.x0 + 3, h.y + y)).toBe(true);
      expect(hardAt(g, h.x + COMPOUND.x1 - 3, h.y + y)).toBe(true);
    }
    expect(g.map.getObs(Math.floor(h.x + GATE.x), Math.floor(h.y + GATE.y))).toBe(OBS.BASTION);
    // Buildings are solid; the lane and the pads are clear.
    for (const s of STRUCTS.slice(0, 20)) expect(hardAt(g, h.x + (s.x0 + s.x1) / 2, h.y + (s.y0 + s.y1) / 2)).toBe(true);
    for (let y = 230; y < COMPOUND.y1 - COMPOUND.wall - 1; y += 5) for (let x = -55; x <= 55; x += 5) expect(hardAt(g, h.x + x, h.y + y)).toBe(false);
    for (const p of PADS) expect(hardAt(g, h.x + p.x, h.y + p.y)).toBe(false);
    // Outside, nothing of it.
    expect(hardAt(g, h.x, h.y + COMPOUND.y1 + 30)).toBe(false);
  });

  it('holds the Titan at the shut gate until Gate Control clears her, then closes behind her', { timeout: 30000 }, () => {
    const g = quiet();
    const p = g.player;
    const gp = gateXY(g)!;
    p.x = gp.x;
    p.y = gp.y - p.stats.length / 2 - 60;
    p.rot = Math.PI / 2;
    g.helm.lever = 0.35;
    run(g, 25);
    // Stopped against the doors, never through them.
    expect(p.y + p.stats.length / 2).toBeLessThan(gp.y + 8);
    expect(hullBlocked(g, p)).toBe(false);
    expect(g.compound.prompt).toBe('exit');
    expect(requestClearance(g, 'player')).toBe('asked');
    // The answer, then the doors grind open.
    expect(run(g, 20, () => g.compound.gate.open >= 1)).toBeLessThan(15);
    expect(g.map.getObs(Math.floor(gp.x), Math.floor(gp.y))).toBe(OBS.NONE);
    // She rolls out, and the gate shuts behind her.
    expect(run(g, 60, () => p.y - p.stats.length / 2 > gp.y + 60)).toBeLessThan(60);
    g.helm.lever = 0;
    expect(run(g, 40, () => g.compound.gate.open === 0)).toBeLessThan(40);
    expect(g.map.getObs(Math.floor(gp.x), Math.floor(gp.y))).toBe(OBS.BASTION);
  });

  it('refuses clearance while hostiles crowd the gate', () => {
    const g = quiet();
    const gp = gateXY(g)!;
    for (let i = 0; i < 8; i++) {
      const e = g.spawnEnemy('d_sand_rat', gp.x - 100 + i * 25, gp.y + 90, 1);
      e.hp = e.maxHp = 1e7;
    }
    requestClearance(g, 'player');
    run(g, 4);
    expect(g.compound.gate.target).toBe(0);
    expect(g.compound.gate.deny).toBeGreaterThan(0);
    expect(g.compound.gate.open).toBe(0);
  });

  it('has gun crews on the towers that shoot what comes near the wall', () => {
    const g = quiet();
    const gp = gateXY(g)!;
    const e = g.spawnEnemy('d_sand_rat', gp.x + 300, gp.y + 150, 1);
    e.hp = e.maxHp = 1e6;
    run(g, 2);
    expect(e.hp).toBeLessThan(1e6);
  });

  it('sends hordes against the gate while you shelter inside', () => {
    const g = quiet();
    g.compound.siegeT = 0.01;
    const n0 = g.enemies.length;
    run(g, 0.2);
    const siege = g.enemies.filter((e) => e.siege);
    expect(siege.length).toBeGreaterThan(20);
    expect(g.enemies.length - n0).toBeGreaterThanOrEqual(siege.length);
    // They make for the gate, not for you.
    const gp = gateXY(g)!;
    const e = siege[0];
    const goal = siegeGoal(g, e.x, e.y, e.id)!;
    expect(goal).not.toBeNull();
    expect(Math.abs(goal.y - gp.y)).toBeLessThan(30);
    expect(Math.abs(goal.x - gp.x)).toBeLessThan(COMPOUND.gateHalf);
  });

  it('keeps other crews docked, and they come and go through the gate', { timeout: 60000 }, () => {
    const g = quiet();
    updateCompound(g, DT);
    expect(g.compound.bases.length).toBe(2);
    expect(g.compound.bases.every((b) => b.state === 'docked' && b.tank.team === 'player')).toBe(true);
    expect(g.compound.people.length).toBeGreaterThan(60);
    // One asks to leave: the gate opens for it.
    g.compound.trafficT = 0;
    run(g, 1);
    expect(g.compound.bases.some((b) => b.state === 'waitOut')).toBe(true);
    expect(run(g, 30, () => g.compound.gate.target === 1)).toBeLessThan(30);
  });
});

describe('the main gate under siege', () => {
  it('gives way to a horde left clawing at it, stays wrecked a while, then the crews get it shut', { timeout: 30000 }, () => {
    const g = quiet();
    updateCompound(g, DT);
    for (let i = 0; i < 400 && g.compound.gate.breach <= 0; i++) clawGate(g, 20);
    expect(g.compound.gate.breach).toBeGreaterThan(0);
    run(g, 1);
    const gp = gateXY(g)!;
    expect(g.compound.gate.open).toBe(1);
    expect(g.map.getObs(Math.floor(gp.x), Math.floor(gp.y))).toBe(OBS.NONE);
    // Nothing to open or shut meanwhile.
    expect(requestClearance(g, 'player')).toBeNull();
    run(g, 60, () => g.compound.gate.open === 0);
    expect(g.compound.gate.breach).toBeLessThanOrEqual(0);
    expect(g.compound.gate.open).toBe(0);
    expect(g.compound.gate.hp).toBeGreaterThan(0.3);
  });
});

describe('a hull wedged in the compound', () => {
  it('is towed back into its bay', () => {
    const g = quiet();
    const h = home(g)!;
    const p = g.player;
    const s = STRUCTS.find((k) => k.kind === 'warehouse')!;
    p.x = h.x + (s.x0 + s.x1) / 2;
    p.y = h.y + (s.y0 + s.y1) / 2;
    expect(hullBlocked(g, p)).toBe(true);
    run(g, 3);
    expect(hullBlocked(g, p)).toBe(false);
    expect(Math.hypot(p.x - g.gen.spawn.x, p.y - g.gen.spawn.y)).toBeLessThan(5);
  });
});

describe('the garrison', () => {
  it('guns at the front shoot what comes at the gate; the gunships go up when a ship is cleared out and come home after', { timeout: 40000 }, () => {
    const g = quiet();
    const h = home(g)!;
    run(g, 0.5);
    // Signallers at the gate, a squad on the parade ground, sentries at the bunkers.
    const kinds = new Set(g.compound.people.map((r) => r.kind));
    for (const k of ['signal', 'soldier', 'officer', 'sentry', 'pilot']) expect(kinds.has(k as never)).toBe(true);
    expect(g.compound.air.every((a) => a.state === 'parked')).toBe(true);
    // A creature out in front of the bunkers gets shot.
    const e = g.spawnEnemy('d_sand_rat', h.x + 175, h.y + COMPOUND.y1 + 260, 1);
    e.hp = e.maxHp = 1e6;
    run(g, 3);
    expect(e.hp).toBeLessThan(1e6);
    expect(g.compound.front.some((f) => Math.abs(f.aim - Math.PI / 2) > 0.01 || f.flash > 0)).toBe(true);
    e.hp = 0;
    // Clearance for a departure: the gunships lift off...
    requestClearance(g, 'player');
    run(g, 12);
    expect(g.compound.air.filter((a) => a.state !== 'parked').length).toBeGreaterThan(2);
    expect(Math.max(...g.compound.air.map((a) => a.z))).toBeGreaterThan(20);
    // ...and once it's quiet, come home and land.
    g.compound.sortie = 0;
    run(g, 60, () => g.compound.air.every((a) => a.state === 'parked'));
    expect(g.compound.air.every((a) => a.state === 'parked')).toBe(true);
  });
});
