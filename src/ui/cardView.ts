import { RARITIES } from '../shared/rarity';
import { CARD_TYPE_NAME, CARDS, cardText, levelPower, SCHOOLS } from '../game/cards';
import type { Game } from '../game/game';
import { cardArt } from '../render/icons';
import { esc, h } from './dom';

export interface CardOpts {
  /** Show this level (defaults to the owned level, or 1). */
  level?: number;
  /** Small hand/deck version: cost, art and name only. */
  mini?: boolean;
  /** Extra class names. */
  cls?: string;
}

/** A battle card drawn like a trading card: name and cost, art, type line, rules text, flavor text. */
export function cardEl(g: Game | null, id: string, o: CardOpts = {}): HTMLDivElement {
  const d = CARDS[id];
  const el = h('div', `mcard s-${d?.school ?? 'iron'} ${o.mini ? 'mini' : ''} ${o.cls ?? ''}`);
  if (!d) return el;
  const sc = SCHOOLS[d.school];
  const rar = RARITIES[d.rarity];
  el.style.setProperty('--sc', sc.color);
  el.style.setProperty('--sd', sc.dark);
  el.style.setProperty('--rc', rar.color);
  el.dataset.card = id;
  const lvl = o.level ?? (g?.cardLevel(id) || 1);
  const P = g ? g.cardPower(id) * (levelPower(lvl) / levelPower(g.cardLevel(id) || 1)) : levelPower(lvl);
  const cost = d.type === 'relic' ? '' : `<span class="mc-cost">${g ? g.cardCost(id) : d.cost}</span>`;
  if (o.mini) {
    el.innerHTML = `${cost}<div class="mc-art"><img src="${cardArt(id, d.school)}"></div><div class="mc-name">${esc(d.name)}</div><i class="mc-gem"></i>`;
    return el;
  }
  el.innerHTML = `<div class="mc-top"><span class="mc-name">${esc(d.name)}</span>${cost}</div>
    <div class="mc-art"><img src="${cardArt(id, d.school)}"></div>
    <div class="mc-type">${CARD_TYPE_NAME[d.type]} — ${sc.name}<i class="mc-gem" title="${rar.name}"></i></div>
    <div class="mc-text">${cardText(d, P)}${d.target === 'area' && d.type !== 'relic' ? '<div class="mc-drag">Drag onto the battlefield</div>' : ''}</div>
    <div class="mc-flavor">${esc(d.flavor)}</div>
    <div class="mc-foot"><span style="color:${rar.color}">${rar.name}</span><span>Lv ${lvl}</span></div>`;
  return el;
}
