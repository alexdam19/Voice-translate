import { describe, expect, it } from 'vitest';
import { canAfford, Inventory, payCost } from '../src/shared/inventory';

describe('Inventory', () => {
  it('stacks up to the item max and spills into new slots', () => {
    const inv = new Inventory(3);
    expect(inv.add('scrap', 1500)).toBe(0);
    expect(inv.slots[0]).toEqual({ id: 'scrap', n: 999 });
    expect(inv.slots[1]).toEqual({ id: 'scrap', n: 501 });
    expect(inv.count('scrap')).toBe(1500);
  });

  it('returns leftovers when full and refuses partial removes', () => {
    const inv = new Inventory(1);
    inv.add('cutter1', 1);
    expect(inv.add('cutter2', 1)).toBe(1);
    expect(inv.remove('cutter1', 2)).toBe(false);
    expect(inv.count('cutter1')).toBe(1);
    expect(inv.remove('cutter1', 1)).toBe(true);
    expect(inv.isEmpty()).toBe(true);
  });

  it('pays costs across several inventories', () => {
    const pack = new Inventory(4), cargo = new Inventory(4);
    pack.add('iron_plate', 3);
    cargo.add('iron_plate', 5);
    cargo.add('circuit', 2);
    const cost = { iron_plate: 6, circuit: 2 };
    expect(canAfford([pack, cargo], cost)).toBe(true);
    payCost([pack, cargo], cost);
    expect(pack.count('iron_plate')).toBe(0);
    expect(cargo.count('iron_plate')).toBe(2);
    expect(cargo.count('circuit')).toBe(0);
    expect(canAfford([pack, cargo], cost)).toBe(false);
  });

  it('keeps items when shrinking if they fit, and reports overflow otherwise', () => {
    const inv = new Inventory(4);
    inv.slots[3] = { id: 'medkit', n: 2 };
    expect(inv.resize(2)).toEqual([]);
    expect(inv.count('medkit')).toBe(2);
    inv.add('cutter1', 1);
    expect(inv.resize(1)).toEqual([{ id: 'cutter1', n: 1 }]);
  });
});
