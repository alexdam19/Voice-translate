import { describe, expect, it } from 'vitest';
import type { S2C } from '../src/shared/protocol';
import { WarzoneServer, type Conn } from '../server/warzone';

function client(zone: WarzoneServer, name: string, inv = [{ id: 'scrap', n: 50 }, { id: 'rail_lance', n: 1 }]) {
  const inbox: S2C[] = [];
  const conn: Conn = { send: (m) => inbox.push(m), close: () => {} };
  const s = zone.connect(conn);
  s.message({ t: 'join', name, inv, suit: 'scav_jacket', hp: 100, maxHp: 100, armor: 0 });
  const welcome = inbox.find((m) => m.t === 'welcome') as Extract<S2C, { t: 'welcome' }>;
  return { s, inbox, id: welcome.id, welcome };
}

/** Advances past spawn protection. */
function warmUp(zone: WarzoneServer): void {
  for (let i = 0; i < 120; i++) zone.tick(1 / 20);
}

describe('Dead Zone server', () => {
  it('welcomes players with the map seed and bots', () => {
    const zone = new WarzoneServer(5, 3);
    const a = client(zone, 'Alpha');
    expect(a.welcome.seed).toBe(5);
    expect(a.welcome.players.filter((p) => p.bot)).toHaveLength(3);
  });

  it('drops the victim pack as a crate that others can loot', () => {
    const zone = new WarzoneServer(5, 0);
    const a = client(zone, 'Alpha');
    const b = client(zone, 'Bravo', []);
    warmUp(zone);
    zone.debugMove(b.id, 1000, 1000);
    zone.debugMove(a.id, 1040, 1000);
    for (let i = 0; i < 3; i++) b.s.message({ t: 'hit', target: a.id, dmg: 95, w: 'rail_lance' });
    const died = a.inbox.find((m) => m.t === 'you_died') as Extract<S2C, { t: 'you_died' }>;
    expect(died.by).toBe('Bravo');
    expect(died.lost.map((s) => s.id).sort()).toEqual(['rail_lance', 'scrap']);
    const crate = zone.debugCrates()[0];
    expect(crate.items).toHaveLength(2);
    b.s.message({ t: 'take', crate: crate.id, index: 0 });
    const took = b.inbox.find((m) => m.t === 'took') as Extract<S2C, { t: 'took' }>;
    expect(took.stack.n).toBeGreaterThan(0);
    expect(zone.debugCrates()[0].items).toHaveLength(1);
  });

  it('caps reported damage per weapon and rejects far-away hits', () => {
    const zone = new WarzoneServer(5, 0);
    const a = client(zone, 'Alpha');
    const b = client(zone, 'Bravo');
    warmUp(zone);
    zone.debugMove(a.id, 1000, 1000);
    zone.debugMove(b.id, 1020, 1000);
    b.s.message({ t: 'hit', target: a.id, dmg: 9999, w: 'rivet_pistol' });
    expect(zone.debugPlayer(a.id)!.hp).toBeLessThan(100);
    expect(zone.debugPlayer(a.id)!.hp).toBeGreaterThan(80);
    zone.debugMove(b.id, 9000, 1000);
    b.s.message({ t: 'hit', target: a.id, dmg: 14, w: 'rivet_pistol' });
    expect(zone.debugPlayer(a.id)!.hp).toBeGreaterThan(80);
  });

  it('protects freshly inserted players', () => {
    const zone = new WarzoneServer(5, 0);
    const a = client(zone, 'Alpha');
    const b = client(zone, 'Bravo');
    zone.debugMove(a.id, 1000, 1000);
    zone.debugMove(b.id, 1020, 1000);
    b.s.message({ t: 'hit', target: a.id, dmg: 14, w: 'rivet_pistol' });
    expect(zone.debugPlayer(a.id)!.hp).toBe(100);
  });

  it('only extracts players standing in an extraction zone', () => {
    const zone = new WarzoneServer(5, 0);
    const a = client(zone, 'Alpha');
    zone.debugMove(a.id, 5000, 1000);
    a.s.message({ t: 'extract' });
    expect(a.inbox.some((m) => m.t === 'extracted')).toBe(false);
    const e = zone.map.extracts[0];
    zone.debugMove(a.id, e.x + 20, e.y + 20);
    a.s.message({ t: 'extract' });
    expect(a.inbox.some((m) => m.t === 'extracted')).toBe(true);
  });

  it('drops the pack of a player who disconnects mid-raid', () => {
    const zone = new WarzoneServer(5, 0);
    const a = client(zone, 'Alpha');
    a.s.close();
    expect(zone.debugCrates()).toHaveLength(1);
  });

  it('runs bots without crashing', () => {
    const zone = new WarzoneServer(9, 5);
    for (let i = 0; i < 600; i++) zone.tick(1 / 20);
    expect(zone.snapshot().filter((p) => p.bot).length).toBeGreaterThan(0);
  });
});
