import { describe, expect, it } from 'vitest';
import { WarzoneServer, type Conn } from '../src/shared/dzServer';
import { EXTRACT_SECONDS, type Blueprint, type S2C } from '../src/shared/protocol';
import { makeWeapon } from '../src/shared/weapons';

function client(server: WarzoneServer): { inbox: S2C[]; session: ReturnType<WarzoneServer['connect']> } {
  const inbox: S2C[] = [];
  const conn: Conn = { send: (m) => inbox.push(m), close: () => {} };
  return { inbox, session: server.connect(conn) };
}

const bp = (w = makeWeapon(1, 'main_battery', 2)): Blueprint => ({
  chassis: 'crawler', drive: 'wheels', modules: [{ key: 'bridge', cx: 3, cy: 4, weapon: null }, { key: 'hp_heavy', cx: 2, cy: 1, weapon: w }],
});

function join(server: WarzoneServer, name: string, extra: Partial<{ vault: number; hp: number }> = {}) {
  const c = client(server);
  c.session.message({
    t: 'hello', name, bp: bp(), maxHp: extra.hp ?? 700, armor: 0, shield: 0, vault: extra.vault ?? 0,
    cargo: [{ id: 'scrap', n: 40 }, { id: 'circuit', n: 5 }, null], spare: [makeWeapon(7, 'laser', 1)],
  });
  const w = c.inbox.find((m) => m.t === 'welcome') as Extract<S2C, { t: 'welcome' }>;
  return { ...c, id: w.id, spawn: w.spawn };
}

describe('dead zone server', () => {
  it('welcomes players and sends snapshots', () => {
    const s = new WarzoneServer(42, 2);
    const a = join(s, 'A');
    expect(a.id).toBeGreaterThan(0);
    s.tick(0.1);
    s.broadcastSnapshot();
    const snap = a.inbox.find((m) => m.t === 'snap') as Extract<S2C, { t: 'snap' }>;
    expect(snap.tanks.length).toBe(3);
    expect(snap.crates.length).toBeGreaterThan(10);
  });

  it('validates hits, drops loot on death except the vault, and lets others loot it', () => {
    const s = new WarzoneServer(43, 0);
    const a = join(s, 'A');
    const b = join(s, 'B', { vault: 1, hp: 3000 });
    // Put them next to each other in the plaza and wait out spawn protection (and the drive there).
    const C = s.arena.gen.map.size / 2;
    const X = C, Y = C, BX = C + 8;
    a.session.message({ t: 'state', x: X, y: Y, rot: 0, aims: [0] });
    for (let i = 0; i < 150; i++) s.tick(0.1);
    a.session.message({ t: 'state', x: X, y: Y, rot: 0, aims: [0] });
    b.session.message({ t: 'state', x: BX, y: Y, rot: 0, aims: [0] });
    for (let i = 0; i < 150; i++) s.tick(0.1);
    b.session.message({ t: 'state', x: BX, y: Y, rot: 0, aims: [0] });
    // Absurd damage gets clamped; wrong weapon key is capped hard.
    a.session.message({ t: 'hit', target: b.id, dmg: 99999, key: 'main_battery', rarity: 2 });
    const after1 = s.debugPlayer(b.id)!;
    expect(after1.hp).toBeGreaterThan(0);
    expect(after1.hp).toBeLessThan(3000);
    for (let i = 0; i < 12; i++) {
      s.tick(1.1);
      a.session.message({ t: 'state', x: X, y: Y, rot: 0, aims: [0] });
      b.session.message({ t: 'state', x: BX, y: Y, rot: 0, aims: [0] });
      a.session.message({ t: 'hit', target: b.id, dmg: 400, key: 'main_battery', rarity: 2 });
    }
    const died = b.inbox.find((m) => m.t === 'died') as Extract<S2C, { t: 'died' }>;
    expect(died).toBeTruthy();
    // Vault slot 0 (scrap) survives; circuits, the spare laser and a mounted gun drop.
    expect(died.dropped.stacks.some((k) => k.id === 'scrap')).toBe(false);
    expect(died.dropped.stacks.some((k) => k.id === 'circuit')).toBe(true);
    expect(died.dropped.weapons.some((w) => w.key === 'laser')).toBe(true);
    expect(died.dropped.weapons.some((w) => w.key === 'main_battery')).toBe(true);
    const wreck = s.debugCrates().find((c) => c.kind === 'wreck')!;
    expect(wreck).toBeTruthy();
    s.tick(0.5);
    a.session.message({ t: 'state', x: C + 6, y: Y, rot: 0, aims: [0] });
    a.session.message({ t: 'loot', crate: wreck.id });
    const loot = a.inbox.find((m) => m.t === 'loot') as Extract<S2C, { t: 'loot' }>;
    expect(loot.weapons.some((w) => w.key === 'laser')).toBe(true);
  });

  it('extracts a player who holds position in a zone', () => {
    const s = new WarzoneServer(44, 0);
    const a = join(s, 'A');
    const e = s.arena.extracts[0];
    // Walk there legally.
    let x = a.spawn.x, y = a.spawn.y;
    for (let i = 0; i < 400 && Math.hypot(e.x - x, e.y - y) > 0.5; i++) {
      const d = Math.hypot(e.x - x, e.y - y);
      const step = Math.min(d, 2);
      x += ((e.x - x) / d) * step;
      y += ((e.y - y) / d) * step;
      s.tick(0.1);
      a.session.message({ t: 'state', x, y, rot: 0, aims: [0] });
    }
    a.session.message({ t: 'extract', on: true });
    for (let i = 0; i < (EXTRACT_SECONDS + 1) * 10; i++) {
      s.tick(0.1);
      a.session.message({ t: 'state', x, y, rot: 0, aims: [0] });
    }
    expect(a.inbox.some((m) => m.t === 'extracted')).toBe(true);
  });

  it('rejects teleporting', () => {
    const s = new WarzoneServer(45, 0);
    const a = join(s, 'A');
    s.tick(0.1);
    a.session.message({ t: 'state', x: a.spawn.x + 60, y: a.spawn.y, rot: 0, aims: [] });
    expect(s.debugPlayer(a.id)!.x).toBeCloseTo(a.spawn.x);
  });

  it('bots fight and respawn', () => {
    const s = new WarzoneServer(46, 4);
    for (let i = 0; i < 600; i++) s.tick(0.1);
    expect(s.debugPlayers().filter((p) => p.bot).length).toBe(4);
  });
});
