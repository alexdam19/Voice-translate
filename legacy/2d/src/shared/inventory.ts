import { getItem } from './items';

export interface Stack {
  id: string;
  n: number;
}
export type Slot = Stack | null;
export type Cost = Record<string, number>;

export class Inventory {
  slots: Slot[];

  constructor(size: number, slots?: Slot[]) {
    this.slots = new Array<Slot>(size).fill(null);
    if (slots) for (let i = 0; i < Math.min(size, slots.length); i++) this.slots[i] = slots[i] ? { ...slots[i]! } : null;
  }

  get size(): number {
    return this.slots.length;
  }

  /** Adds items; returns how many did not fit. */
  add(id: string, n: number): number {
    const max = getItem(id).maxStack;
    let left = n;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.n < max) {
        const take = Math.min(max - s.n, left);
        s.n += take;
        left -= take;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, left);
        this.slots[i] = { id, n: take };
        left -= take;
      }
    }
    return left;
  }

  canFit(id: string, n: number): boolean {
    const max = getItem(id).maxStack;
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += max;
      else if (s.id === id) room += max - s.n;
      if (room >= n) return true;
    }
    return room >= n;
  }

  count(id: string): number {
    let c = 0;
    for (const s of this.slots) if (s && s.id === id) c += s.n;
    return c;
  }

  /** Removes n items if available. Returns false (and removes nothing) otherwise. */
  remove(id: string, n: number): boolean {
    if (this.count(id) < n) return false;
    this.take(id, n);
    return true;
  }

  /** Removes up to n items; returns the number removed. */
  take(id: string, n: number): number {
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const t = Math.min(s.n, left);
        s.n -= t;
        left -= t;
        if (s.n <= 0) this.slots[i] = null;
      }
    }
    return n - left;
  }

  isEmpty(): boolean {
    return this.slots.every((s) => !s);
  }

  clear(): void {
    this.slots.fill(null);
  }

  /** Grows or shrinks the inventory. Returns stacks that no longer fit. */
  resize(size: number): Stack[] {
    const overflow: Stack[] = [];
    if (size >= this.slots.length) {
      while (this.slots.length < size) this.slots.push(null);
      return overflow;
    }
    const removed = this.slots.splice(size);
    for (const s of removed) {
      if (!s) continue;
      const left = this.add(s.id, s.n);
      if (left > 0) overflow.push({ id: s.id, n: left });
    }
    return overflow;
  }

  stacks(): Stack[] {
    return this.slots.filter((s): s is Stack => !!s).map((s) => ({ ...s }));
  }

  snapshot(): Slot[] {
    return this.slots.map((s) => (s ? { ...s } : null));
  }
}

/** Counts an item across several inventories (e.g. player pack + rig cargo). */
export function countAcross(invs: Inventory[], id: string): number {
  let c = 0;
  for (const inv of invs) c += inv.count(id);
  return c;
}

export function canAfford(invs: Inventory[], cost: Cost): boolean {
  for (const id in cost) if (countAcross(invs, id) < cost[id]) return false;
  return true;
}

/** Pays a cost from several inventories in order. Caller must check canAfford first. */
export function payCost(invs: Inventory[], cost: Cost): void {
  for (const id in cost) {
    let left = cost[id];
    for (const inv of invs) {
      if (left <= 0) break;
      left -= inv.take(id, left);
    }
  }
}

export function scaleCost(cost: Cost, f: number): Cost {
  const out: Cost = {};
  for (const id in cost) {
    const n = Math.floor(cost[id] * f);
    if (n > 0) out[id] = n;
  }
  return out;
}

export function mergeStacks(stacks: Stack[]): Stack[] {
  const m = new Map<string, number>();
  for (const s of stacks) m.set(s.id, (m.get(s.id) ?? 0) + s.n);
  return [...m].map(([id, n]) => ({ id, n }));
}
