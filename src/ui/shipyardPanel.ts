import {
  addStory, awaken, classMark, expandHull, hireOfficer, hireTroops, hullCost, installPart, isDocked, MARK_COST, maxStories, partsForCC, PARTS, REFIT_COST, refitClass,
  STORY_COST, trade, TRADES, TROOP_COST,
} from '../game/campaign';
import { CLASS_LIST, CLASSES } from '../game/classes';
import { CC_COMMANDER_LEVEL, chassisForCC, DECK_OPEN_CC, TITAN_DECK_INFO } from '../game/defs';
import { getItem } from '../shared/items';
import { itemIcon } from '../render/icons';
import { button, costHTML, esc, h } from './dom';
import type { PanelCtx } from './panels';

type Res = { ok: true; msg?: string } | { ok: false; msg: string };

/**
 * The Mothership's shipyard: install the parts you took from the strongholds, rebuild your fortress (bigger hulls,
 * Titan refits, class marks and class changes), trade, and hire people. Only while docked.
 */
export function renderShipyard(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const run = (fn: () => Res, sound = 'build'): void => {
    const r = fn();
    ctx.msg(r.msg ?? 'Done.', r.ok);
    if (r.ok) ctx.app.sound(sound);
    ctx.rerender();
  };
  if (!isDocked(g)) {
    ctx.body.appendChild(h('div', 'big-lock', 'Dock at the <b>Mothership</b> (the cyan ship at the edge of the world, on the MAP) to use the shipyard.'));
    return;
  }
  const c = g.campaign;
  if (ctx.tab === 'trade') {
    ctx.body.appendChild(h('div', 'hint', 'The Mothership always has stock. Straight swaps, no haggling.'));
    const grid = h('div', 'trade-grid');
    TRADES.forEach((t, i) => {
      const row = h('div', 'trade-row', `<span class="give">${costHTML(t.give, [p.cargo])}</span><span class="arrow">→</span><span class="get">${Object.entries(t.get).map(([k, n]) => `<img src="${itemIcon(k)}">${n} ${esc(getItem(k).name)}`).join(' ')}</span>`);
      row.appendChild(button('TRADE', () => run(() => trade(g, i), 'craft'), g.canPay(t.give) ? 'small primary' : 'small disabled'));
      grid.appendChild(row);
    });
    ctx.body.appendChild(grid);
    return;
  }
  if (ctx.tab === 'hire') {
    const room = p.stats.bunks - p.troops;
    ctx.body.appendChild(h('div', 'hint', `Crew aboard <b>${p.troops}/${p.stats.bunks}</b> bunks. Every gun, nest and station needs people, and a third of them should be resting at any time.`));
    const row = h('div', 'row');
    for (const n of [1, 5, 10]) row.appendChild(button(`HIRE ${n} CREW <small>${n * TROOP_COST} scrap</small>`, () => run(() => hireTroops(g, n)), room > 0 ? 'primary' : 'disabled'));
    row.appendChild(button('FILL EVERY BUNK', () => run(() => hireTroops(g, room)), room > 0 ? '' : 'disabled'));
    ctx.body.appendChild(row);
    ctx.body.appendChild(h('div', 'hint', `Veteran <b>officers</b> hire on here too: better than the wasteland's recruits. Officers: <b>${g.mainCrew().length}/${g.crewCap()}</b>.`));
    ctx.body.appendChild(button('HIRE A VETERAN OFFICER <small>150 scrap · 10 rations</small>', () => run(() => hireOfficer(g), 'levelup'), g.crewRoom() ? 'primary' : 'disabled'));
    return;
  }
  if (ctx.tab === 'refit') {
    const b = p.modules.find((m) => m.key === 'bridge')!;
    const box = h('div', 'yard-grid');
    // Hull expansion.
    const next = b.lvl < 6 ? chassisForCC(b.lvl + 1) : null;
    const hull = p.titan
      ? h('div', 'yard-card', `<div class="yc-t">TITAN REFIT</div><div class="yc-d">Now: <b>${esc(chassisForCC(b.lvl).name)}</b>. ${next ? `Next: <b>${esc(next.name)}</b>: ${esc(next.desc)}` : 'Fully refitted: every deck, every mount.'}</div>`)
      : h('div', 'yard-card', `<div class="yc-t">HULL EXPANSION</div><div class="yc-d">Now: <b>${esc(chassisForCC(b.lvl).name)}</b> (${p.cols}×${p.rows}). ${next ? `Next: <b>${esc(next.name)}</b> (${next.cols}×${next.rows}), built on the spot.` : 'As big as they come.'}</div>`);
    if (next) {
      const parts = partsForCC(b.lvl + 1), lvl = CC_COMMANDER_LEVEL[b.lvl];
      hull.appendChild(h('div', 'yc-req', `Needs commander level ${lvl} ${g.commander.level >= lvl ? '✔' : '✖'} · ${parts} part${parts === 1 ? '' : 's'} installed ${c.installed.length >= parts ? '✔' : '✖'}<br>${costHTML(hullCost(b.lvl), [p.cargo])}`));
      hull.appendChild(button(p.titan ? `REFIT TO ${esc(next.name.replace('Titan Crawler ', '').toUpperCase())}` : 'EXPAND THE HULL', () => run(() => expandHull(g), 'levelup'), 'primary'));
    }
    box.appendChild(hull);
    // Stories (a Titan has all seven decks; refits open them).
    const story = p.titan
      ? h('div', 'yard-card', `<div class="yc-t">DECKS</div><div class="yc-d">${TITAN_DECK_INFO.slice(1).map((d, i) => `<span class="${p.deckOpen(i + 1) ? 'good' : 'bad'}">${esc(d.level)} ${esc(d.name)}${p.deckOpen(i + 1) ? '' : ` (Mk ${['I', 'II', 'III', 'IV', 'V', 'VI'][DECK_OPEN_CC[i + 1] - 1]})`}</span>`).join(' · ')}</div>`)
      : h('div', 'yard-card', `<div class="yc-t">ANOTHER STORY</div><div class="yc-d">Your fortress is <b>${p.stories}</b> stories tall (plus the roof). Every story is another whole deck to build on, and more hull.</div>`);
    if (p.titan) {
      // Nothing to add: the refit opens decks.
    } else if (p.stories < 4) {
      const cap = maxStories(c.installed.length);
      story.appendChild(h('div', 'yc-req', `Needs ${p.stories === 2 ? 2 : 5} parts installed ${cap > p.stories ? '✔' : '✖'}<br>${costHTML(STORY_COST[p.stories], [p.cargo])}`));
      story.appendChild(button(`RAISE STORY ${p.stories + 1}`, () => run(() => addStory(g), 'levelup'), 'primary'));
    } else story.appendChild(h('div', 'yc-req good', 'Four stories: as tall as it gets.'));
    box.appendChild(story);
    // Class mark.
    const cls = CLASSES[p.klass];
    const mark = h('div', 'yard-card', `<div class="yc-t">${esc(cls.name.toUpperCase())} MARK ${['I', 'II', 'III'][p.classMk - 1]}</div><div class="yc-d">${esc(cls.perk)} Each mark makes the class's strengths 50% stronger.</div>`);
    if (p.classMk < 3) {
      const need = p.classMk === 1 ? 1 : 3;
      mark.appendChild(h('div', 'yc-req', `Needs ${need} part${need > 1 ? 's' : ''} installed ${c.installed.length >= need ? '✔' : '✖'}<br>${costHTML(MARK_COST[p.classMk + 1], [p.cargo])}`));
      mark.appendChild(button(`FIT MARK ${p.classMk === 1 ? 'II' : 'III'}`, () => run(() => classMark(g), 'levelup'), 'primary'));
    }
    box.appendChild(mark);
    // Refit.
    const refit = h('div', 'yard-card wide', `<div class="yc-t">CLASS REFIT</div><div class="yc-d">Rebuild the fortress as another class (same size, different job). ${costHTML(REFIT_COST, [p.cargo])}</div>`);
    const row = h('div', 'row');
    for (const k of CLASS_LIST) {
      const btn = button(k.name, () => run(() => refitClass(g, k.key)), k.key === p.klass ? 'small on' : 'small');
      btn.style.color = k.color;
      row.appendChild(btn);
    }
    refit.appendChild(row);
    box.appendChild(refit);
    ctx.body.appendChild(box);
    return;
  }
  // Parts.
  ctx.body.appendChild(h('div', 'hint', `Each faction's stronghold boss guards a part. Installed: <b>${c.installed.length}/6</b>. Parts unlock the Titan's refits (Mk III to Mk VI) and class marks here; all six wake the ship.`));
  const grid = h('div', 'yard-grid');
  for (const part of PARTS) {
    const has = p.cargo.count(part.item) > 0;
    const done = c.installed.includes(part.key);
    const card = h('div', `yard-card ${done ? 'done' : ''}`, `<div class="yc-t"><img src="${itemIcon(part.item)}"> ${esc(getItem(part.item).name)}</div><div class="yc-d">${esc(getItem(part.item).desc)}</div><div class="yc-req">${done ? '<span class="good">INSTALLED</span>' : has ? '<span class="good">In your hold</span>' : '<span class="bad">Not found yet</span>'} · ${esc(part.reward)}</div>`);
    if (!done && has) card.appendChild(button('INSTALL', () => run(() => installPart(g, part.key), 'legendary'), 'primary'));
    grid.appendChild(card);
  }
  ctx.body.appendChild(grid);
  if (c.finale === 'none' && c.installed.length >= PARTS.length) {
    ctx.body.appendChild(button('AWAKEN THE MOTHERSHIP', () => {
      const r = awaken(g);
      ctx.msg(r.msg ?? '', r.ok);
      if (r.ok) ctx.app.panels.close();
    }, 'primary big awaken'));
  } else if (c.finale === 'won') ctx.body.appendChild(h('div', 'good big', 'THE MOTHERSHIP IS AWAKE.'));
}
