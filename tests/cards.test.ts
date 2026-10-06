import { describe, expect, it } from 'vitest';
import { openPack, toggleDeck, toggleRelic, upgradeCard } from '../src/game/actions';
import { CARD_LIST, CARDS, cardText, DECK_SIZE, HAND_SIZE, PACK_INFO, rollPack, SCHOOLS, shardsNeeded, STARTER_DECK } from '../src/game/cards';
import { grantReward } from '../src/game/chests';
import { playCard } from '../src/game/systems/cards';
import { stepWorld } from '../src/game/systems/step';
import { game, levelTo, rich } from './helpers';

describe('battle cards', () => {
  it('has 40+ battle cards and 10+ relics across 5 schools', () => {
    const battle = CARD_LIST.filter((c) => c.type !== 'relic');
    const relics = CARD_LIST.filter((c) => c.type === 'relic');
    expect(battle.length).toBeGreaterThanOrEqual(40);
    expect(relics.length).toBeGreaterThanOrEqual(10);
    for (const c of CARD_LIST) {
      expect(SCHOOLS[c.school]).toBeTruthy();
      expect(c.rarity).toBeGreaterThanOrEqual(0);
      expect(c.rarity).toBeLessThanOrEqual(5);
      expect(cardText(c, 1.3)).not.toMatch(/[{}]/);
      if (c.type !== 'relic') expect(c.cost).toBeGreaterThan(0);
      if (c.target === 'area') expect(c.radius).toBeGreaterThan(0);
    }
    for (let r = 0; r <= 5; r++) expect(battle.some((c) => c.rarity === r)).toBe(true);
    expect(STARTER_DECK.length).toBe(DECK_SIZE);
  });

  it('holds 4 cards, spends energy and cycles the played card to the back', () => {
    const g = game();
    expect(g.hand.length).toBe(HAND_SIZE);
    expect(g.queue.length).toBe(DECK_SIZE - HAND_SIZE);
    g.energy = 10;
    const first = g.hand[0];
    const next = g.queue[0];
    const cost = g.cardCost(first);
    expect(playCard(g, 0, g.player.x + 10, g.player.y).ok).toBe(true);
    expect(g.energy).toBeCloseTo(10 - cost);
    expect(g.hand[0]).toBe(next);
    expect(g.queue[g.queue.length - 1]).toBe(first);
    g.energy = 0;
    expect(playCard(g, 1, g.player.x, g.player.y).ok).toBe(false);
  });

  it('every battle card can be played', () => {
    const g = game();
    g.spawnEnemy('raider', g.player.x + 12, g.player.y, 2);
    g.spawnEnemy('brute', g.player.x - 12, g.player.y + 4, 2);
    for (const c of CARD_LIST.filter((k) => k.type !== 'relic')) {
      g.ownCard(c.id);
      g.hand[0] = c.id;
      g.energy = 20;
      const r = playCard(g, 0, g.player.x + 14, g.player.y + 2);
      expect(r.ok, `${c.id}: ${r.ok ? '' : r.msg}`).toBe(true);
      for (let i = 0; i < 20; i++) stepWorld(g, 1 / 60);
    }
    for (let i = 0; i < 60 * 3; i++) stepWorld(g, 1 / 60);
    expect(g.stats.kills).toBeGreaterThan(0);
  });

  it('area cards land where you drop them', () => {
    const g = game();
    g.hand[0] = 'squad';
    g.energy = 10;
    const x = g.player.x + 20, y = g.player.y - 5;
    expect(playCard(g, 0, x, y).ok).toBe(true);
    const marines = g.allies.filter((a) => a.kind === 'marine');
    expect(marines.length).toBeGreaterThanOrEqual(3);
    for (const m of marines) expect(Math.hypot(m.x - x, m.y - y)).toBeLessThan(3);
  });

  it('card packs hold the right number of cards, duplicates level cards up', () => {
    let s = 5;
    const rng = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const k of Object.keys(PACK_INFO) as (keyof typeof PACK_INFO)[]) {
      for (let i = 0; i < 30; i++) {
        const ids = rollPack(rng, k, 0);
        expect(ids.length).toBe(PACK_INFO[k].count);
        expect(CARDS[ids[0]].rarity).toBeGreaterThanOrEqual(PACK_INFO[k].min);
      }
    }
    const g = game();
    rich(g);
    g.packs.push('epic_pack');
    // A pack is a this-or-that pick off the card road: two different cards, and you take one.
    const res = openPack(g, 0)!;
    expect(res.rewards.length).toBe(2);
    expect(res.rewards[0]).not.toEqual(res.rewards[1]);
    grantReward(g, res.rewards[0]);
    expect(g.packs.length).toBe(0);
    const id = 'artillery';
    g.cards[id].shards = shardsNeeded(CARDS[id], 1);
    const P = g.cardPower(id);
    expect(upgradeCard(g, id).ok).toBe(true);
    expect(g.cards[id].level).toBe(2);
    expect(g.cardPower(id)).toBeGreaterThan(P);
    expect(upgradeCard(g, id).ok).toBe(false);
  });

  it('decks hold up to 8 and relics need slots from commander levels', () => {
    const g = game();
    g.ownCard('fireball');
    expect(toggleDeck(g, 'fireball').ok).toBe(false); // full
    expect(toggleDeck(g, 'salvo').ok).toBe(true);
    expect(toggleDeck(g, 'fireball').ok).toBe(true);
    expect(g.deck.includes('fireball')).toBe(true);
    g.cards.overcharged_core = { level: 1, shards: 0 };
    expect(toggleRelic(g, 'overcharged_core').ok).toBe(false);
    levelTo(g, 6);
    const e = g.maxEnergy();
    expect(toggleRelic(g, 'overcharged_core').ok).toBe(true);
    expect(g.maxEnergy()).toBe(e + 2);
  });
});

describe('the card road', () => {
  it('offers two different cards, new ones first, rarer the further along you are', async () => {
    const { cardOffer, CARDS, roadTier } = await import('../src/game/cards');
    const { takeRoadCard } = await import('../src/game/actions');
    const g = game();
    let seed = 3;
    const rng = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const [a, b] = cardOffer(g.cards, 0, 'pack', rng);
    expect(a).not.toBe(b);
    expect(g.cards[a]).toBeUndefined();
    expect(CARDS[a].rarity).toBeLessThanOrEqual(roadTier(0));
    // Twelve picks on: the road offers Epic cards, and a Legendary pack reaches the end.
    expect(roadTier(12)).toBe(4);
    expect(roadTier(4, 'legendary_pack')).toBe(4);
    const late = cardOffer(g.cards, 12, 'pack', rng);
    expect(CARDS[late[0]].rarity).toBe(4);
    // Taking one you already own levels it up; every pick moves you along.
    const own = Object.keys(g.cards)[0];
    const lv = g.cards[own].level;
    const picks = g.cardPicks;
    expect(takeRoadCard(g, own)).toBe('level');
    expect(g.cards[own].level).toBe(lv + 1);
    expect(g.cardPicks).toBe(picks + 1);
  });
});
