import { autoDeck, canUpgradeCard, openAllPacks, openPack, swapDeck, toggleDeck, toggleRelic, trackCard, upgradeAllCards, upgradeCard } from '../game/actions';
import { CARD_LIST, CARDS, MAX_CARD_LEVEL, MAX_DECK, PACK_INFO, SCHOOLS, shardsNeeded, upgradeCost, type School } from '../game/cards';
import { RARITIES } from '../shared/rarity';
import { cardEl } from './cardView';
import { button, clickWord, costHTML, esc, h } from './dom';
import type { PanelCtx } from './panels';

const st = { sel: '', swapIn: '', school: 'all' as School | 'all', opened: [] as { id: string; isNew: boolean }[] };

export function renderCards(ctx: PanelCtx): void {
  if (ctx.tab === 'relics') return renderRelics(ctx);
  if (ctx.tab === 'packs') return renderPacks(ctx);
  renderDeck(ctx);
}

/** Details for the selected card, with its buttons. */
function detail(ctx: PanelCtx, id: string): HTMLElement {
  const g = ctx.app.game;
  const d = CARDS[id];
  const own = g.cards[id];
  const box = h('div', 'card-detail');
  box.appendChild(cardEl(g, id, { cls: 'big' }));
  const info = h('div', 'cd-info');
  if (!own) {
    info.innerHTML = `<div class="d">You haven't found this card yet. It drops from <b style="color:${RARITIES[d.rarity].color}">${RARITIES[d.rarity].name}</b> card packs.</div>`;
    box.appendChild(info);
    return box;
  }
  const need = shardsNeeded(d, own.level);
  info.innerHTML = own.level >= MAX_CARD_LEVEL
    ? '<div class="good">MAX LEVEL</div>'
    : `<div>Level <b>${own.level}</b> → ${own.level + 1}: <b>+10%</b> power</div><div class="shards"><div class="bar"><div style="width:${Math.min(100, (own.shards / need) * 100)}%"></div></div><small>${own.shards} / ${need} copies</small></div><div>${costHTML(upgradeCost(d, own.level), [g.player.cargo])}</div>`;
  const row = h('div', 'row');
  if (d.type === 'relic') {
    const on = g.relics.includes(id);
    row.appendChild(button(on ? 'Unequip' : 'Equip', () => {
      const r = toggleRelic(g, id);
      if (!r.ok) ctx.msg(r.msg, false);
      ctx.rerender();
    }, on ? '' : 'primary'));
  } else {
    const inDeck = g.deck.includes(id);
    row.appendChild(button(inDeck ? 'Remove from deck' : 'Add to deck', () => {
      if (!inDeck && g.deck.length >= g.deckSize()) {
        st.swapIn = id;
        ctx.msg(`Deck full: ${clickWord()} a deck card above to swap it out.`, true);
        ctx.rerender();
        return;
      }
      const r = toggleDeck(g, id);
      if (!r.ok) ctx.msg(r.msg, false);
      ctx.rerender();
    }, inDeck ? '' : 'primary'));
  }
  if (own.level < MAX_CARD_LEVEL) {
    const block = canUpgradeCard(g, id);
    const up = button('Upgrade', () => {
      const r = upgradeCard(g, id);
      ctx.msg(r.msg ?? '', r.ok);
      if (r.ok) ctx.app.sound('levelup');
      ctx.rerender();
    }, block ? 'disabled' : 'primary');
    row.appendChild(up);
    if (block || !g.canPay(upgradeCost(d, own.level))) row.appendChild(button('Track', () => {
      const r = trackCard(g, id);
      ctx.msg(r.msg ?? '', r.ok);
    }, 'small'));
  }
  info.appendChild(row);
  box.appendChild(info);
  return box;
}

function renderDeck(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const top = h('div', 'deck-row');
  const size = g.deckSize();
  top.appendChild(h('div', 'cat', `YOUR DECK <small>${g.deck.length}/${size} slots (more open every 4 levels and every 4 hordes survived, up to ${MAX_DECK}) · you hold 4 at a time and draw the next one when you play a card${st.swapIn ? ` · <b class="y">${clickWord()} a card to swap in ${esc(CARDS[st.swapIn].name)}</b>` : ''}</small>`));
  const tools = h('div', 'row deck-tools');
  const ready = Object.keys(g.cards).filter((id) => !canUpgradeCard(g, id)).length;
  tools.appendChild(button('AUTO-BUILD DECK', () => {
    autoDeck(g);
    ctx.msg('Deck filled with your strongest cards.', true);
    ctx.rerender();
  }, 'small'));
  tools.appendChild(button(`UPGRADE ALL${ready ? ` (${ready} ready)` : ''}`, () => {
    const n = upgradeAllCards(g);
    ctx.msg(n ? `${n} card level${n > 1 ? 's' : ''} gained.` : 'Nothing ready to upgrade (needs copies and materials).', n > 0);
    if (n) ctx.app.sound('levelup');
    ctx.rerender();
  }, ready ? 'small primary' : 'small'));
  top.appendChild(tools);
  const slots = h('div', 'deck-slots');
  for (let i = 0; i < size; i++) {
    const id = g.deck[i];
    if (!id) {
      slots.appendChild(h('div', 'mcard mini empty', '<div class="mc-name">empty</div>'));
      continue;
    }
    const el = cardEl(g, id, { mini: true, cls: `${st.sel === id ? 'sel' : ''} ${st.swapIn ? 'swappable' : ''}` });
    el.addEventListener('click', () => {
      if (st.swapIn) {
        const r = swapDeck(g, id, st.swapIn);
        if (!r.ok) ctx.msg(r.msg, false);
        st.sel = st.swapIn;
        st.swapIn = '';
      } else st.sel = id;
      ctx.rerender();
    });
    slots.appendChild(el);
  }
  top.appendChild(slots);
  const avg = g.deck.reduce((s, id) => s + (CARDS[id]?.cost ?? 0), 0) / Math.max(1, g.deck.length);
  top.appendChild(h('div', 'd', `Average cost ${avg.toFixed(1)} energy · energy refills ${(g.energyRate() * 10).toFixed(1)} per 10s · max ${g.maxEnergy()}`));
  ctx.body.appendChild(top);
  const wrap = h('div', 'cards-wrap');
  const left = h('div', 'coll');
  const filt = h('div', 'school-filter');
  for (const k of ['all', ...Object.keys(SCHOOLS)] as (School | 'all')[]) {
    const b = button(k === 'all' ? 'All' : SCHOOLS[k].name, () => {
      st.school = k;
      ctx.rerender();
    }, `small ${st.school === k ? 'on' : ''}`);
    if (k !== 'all') b.style.color = SCHOOLS[k].color;
    filt.appendChild(b);
  }
  left.appendChild(filt);
  const owned = CARD_LIST.filter((c) => c.type !== 'relic' && g.cards[c.id]).length;
  const total = CARD_LIST.filter((c) => c.type !== 'relic').length;
  left.appendChild(h('div', 'cat', `COLLECTION <small>${owned}/${total} found · duplicates from packs level cards up</small>`));
  const grid = h('div', 'coll-grid');
  const list = CARD_LIST.filter((c) => c.type !== 'relic' && (st.school === 'all' || c.school === st.school)).sort((a, b) => (g.cards[b.id] ? 1 : 0) - (g.cards[a.id] ? 1 : 0) || a.cost - b.cost);
  for (const c of list) {
    const own = g.cards[c.id];
    const el = cardEl(g, c.id, { mini: true, cls: `${own ? '' : 'unowned'} ${st.sel === c.id ? 'sel' : ''} ${g.deck.includes(c.id) ? 'indeck' : ''}` });
    if (own) {
      const need = shardsNeeded(c, own.level);
      const ready = own.level < MAX_CARD_LEVEL && own.shards >= need;
      el.appendChild(h('div', `mc-lv ${ready ? 'ready' : ''}`, own.level >= MAX_CARD_LEVEL ? 'MAX' : `Lv${own.level} · ${own.shards}/${need}`));
    }
    el.addEventListener('click', () => {
      if (st.swapIn && g.deck.includes(c.id)) {
        swapDeck(g, c.id, st.swapIn);
        st.swapIn = '';
      }
      st.sel = c.id;
      ctx.rerender();
    });
    grid.appendChild(el);
  }
  left.appendChild(grid);
  wrap.appendChild(left);
  const right = h('div', 'coll-side');
  if (!st.sel || !CARDS[st.sel] || CARDS[st.sel].type === 'relic') st.sel = g.deck[0] ?? '';
  if (st.sel) right.appendChild(detail(ctx, st.sel));
  wrap.appendChild(right);
  ctx.body.appendChild(wrap);
}

function renderRelics(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const slots = g.relicSlots();
  ctx.body.appendChild(h('div', 'hint', `<b>Relics</b> are permanent cards: slot them for always-on bonuses. Slots: <b>${g.relics.length}/${slots}</b> (unlock at commander levels 6, 14 and 22).`));
  const wrap = h('div', 'cards-wrap');
  const grid = h('div', 'coll-grid');
  const list = CARD_LIST.filter((c) => c.type === 'relic');
  for (const c of list) {
    const own = g.cards[c.id];
    const el = cardEl(g, c.id, { mini: true, cls: `${own ? '' : 'unowned'} ${st.sel === c.id ? 'sel' : ''} ${g.relics.includes(c.id) ? 'indeck' : ''}` });
    if (own) el.appendChild(h('div', 'mc-lv', g.relics.includes(c.id) ? 'EQUIPPED' : `Lv${own.level}`));
    el.addEventListener('click', () => {
      st.sel = c.id;
      ctx.rerender();
    });
    grid.appendChild(el);
  }
  wrap.appendChild(grid);
  const right = h('div', 'coll-side');
  if (st.sel && CARDS[st.sel]?.type === 'relic') right.appendChild(detail(ctx, st.sel));
  else right.appendChild(h('div', 'd', `${clickWord(true)} a relic to see it.`));
  wrap.appendChild(right);
  ctx.body.appendChild(wrap);
}

function renderPacks(ctx: PanelCtx): void {
  const g = ctx.app.game;
  ctx.body.appendChild(h('div', 'hint', 'Card packs drop from <b>elite</b> enemies, <b>bosses</b>, <b>raider tanks</b>, <b>outposts</b>, <b>rune altars</b>, <b>titans</b> and loot areas, every other horde you survive, and one every commander level.'));
  if (g.packs.length > 1) {
    ctx.body.appendChild(button(`OPEN ALL ${g.packs.length} PACKS`, () => {
      st.opened = openAllPacks(g);
      ctx.app.sound('legendary');
      ctx.rerender();
    }, 'primary big open-all'));
  }
  if (st.opened.length) {
    const fresh = st.opened.filter((o) => o.isNew).length;
    ctx.body.appendChild(h('div', 'cat', `OPENED <small>${st.opened.length} cards · ${fresh} new · the rest level your cards up</small>`));
    const res = h('div', 'coll-grid opened');
    const counts = new Map<string, { n: number; isNew: boolean }>();
    for (const o of st.opened) {
      const c = counts.get(o.id);
      if (c) c.n++;
      else counts.set(o.id, { n: 1, isNew: o.isNew });
    }
    for (const [id, c] of counts) {
      const el = cardEl(g, id, { mini: true });
      el.appendChild(h('div', `mc-lv ${c.isNew ? 'ready' : ''}`, `${c.isNew ? 'NEW' : 'copy'}${c.n > 1 ? ` ×${c.n}` : ''}`));
      res.appendChild(el);
    }
    ctx.body.appendChild(res);
    ctx.body.appendChild(button('OK', () => {
      st.opened = [];
      ctx.rerender();
    }, 'small'));
  }
  const row = h('div', 'pack-row');
  g.packs.forEach((k, i) => {
    const info = PACK_INFO[k];
    const el = h('div', `pack ${k}`, `<div class="pk-box" style="--pc:${info.color}"><span>${esc(info.name.toUpperCase())}</span></div><div class="d">${esc(info.desc)}</div>`);
    el.appendChild(button('OPEN', () => {
      const res = openPack(g, i);
      if (res) ctx.app.openChest(res.kind, res.rewards, false);
      ctx.rerender();
    }, 'primary'));
    row.appendChild(el);
  });
  if (!g.packs.length) row.appendChild(h('div', 'd', 'No packs right now. Go hunt some elites!'));
  ctx.body.appendChild(row);
}
