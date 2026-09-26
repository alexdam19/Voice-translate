import { CC_COMMANDER_LEVEL } from '../game/defs';
import { PACK_INFO } from '../game/cards';
import { levelBonus, levelRoad, xpToNext, MAX_COMMANDER_LEVEL } from '../game/progress';
import { moduleIcon } from '../render/icons';
import { esc, h } from './dom';
import type { PanelCtx } from './panels';

/** The Level Road: every commander level and what it gives. XP comes from fighting. */
export function renderProgress(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const c = g.commander;
  const lb = levelBonus(c.level);
  ctx.body.appendChild(h('div', 'hint', `Commander level <b>${c.level}</b>${c.level < MAX_COMMANDER_LEVEL ? ` · ${Math.floor(c.xp)} / ${xpToNext(c.level)} XP to the next level` : ' · MAX'}. XP comes from <b>killing enemies</b> (tougher ones give more), clearing <b>loot areas</b>, <b>outposts</b>, <b>raider tanks</b>, <b>runes</b> and <b>titans</b>. Level bonuses so far: <b>+${Math.round(lb.hp * 100)}% hull</b>, <b>+${Math.round(lb.dmg * 100)}% weapon damage</b>. Every level also fully repairs your fortress.`));
  const road = h('div', 'level-road');
  for (const r of levelRoad()) {
    const done = r.level <= c.level;
    const next = r.level === c.level + 1;
    const el = h('div', `lr-step ${done ? 'done' : ''} ${next ? 'next' : ''} ${r.level === c.level ? 'cur' : ''}`);
    const items: string[] = [];
    if (r.level > 1) items.push(`<span class="lr-pack" style="color:${PACK_INFO[r.pack].color}">▣ ${esc(PACK_INFO[r.pack].name)}</span>`);
    for (const f of r.features) items.push(`<span class="lr-feat" title="${esc(f.desc)}">★ ${esc(f.name)}</span>`);
    for (const m of r.modules) items.push(`<span class="lr-mod" title="${esc(m.desc)}"><img src="${moduleIcon(m.key)}">${esc(m.name)}</span>`);
    const cc = CC_COMMANDER_LEVEL.indexOf(r.level);
    if (cc > 0) items.push(`<span class="lr-feat">⬆ Command Center level ${cc + 1}</span>`);
    if (r.relicSlot) items.push('<span class="lr-feat">◈ Relic slot</span>');
    if (r.builder) items.push('<span class="lr-feat">🔨 Extra builder</span>');
    for (const t of r.techs) items.push(`<span class="lr-tech" title="${esc(t.desc)}">${esc(t.name)}</span>`);
    if (r.level > 1) items.push('<span class="lr-stat">+3% hull · +2% damage</span>');
    el.innerHTML = `<div class="lr-num">${r.level}</div><div class="lr-items">${items.join('') || '<span class="d">Where it all starts.</span>'}</div>`;
    road.appendChild(el);
  }
  ctx.body.appendChild(road);
  // Scroll the next level into view.
  requestAnimationFrame(() => road.querySelector('.cur')?.scrollIntoView({ block: 'center' }));
}
