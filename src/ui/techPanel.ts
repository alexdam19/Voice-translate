import { RARITIES } from '../shared/rarity';
import { research } from '../game/actions';
import { BRANCHES, canResearch, researchCost, TECH, TECH_BY_ID, type TechNode } from '../game/tech';
import { WEAPONS } from '../shared/weapons';
import { MODULES } from '../game/defs';
import { itemIcon, moduleIcon, weaponIcon } from '../render/icons';
import { costHTML, esc, h, tooltip } from './dom';
import type { PanelCtx } from './panels';

/** The research chart: branches are rows, tiers are columns, lines show prerequisites. */
export function renderTech(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const inv = [g.player.cargo];
  const discount = g.player.crew.research;
  ctx.body.appendChild(h('div', 'hint', `Salvaged Tech: <b style="color:#80d8ff"><img src="${itemIcon('tech_parts')}" class="inl"> ${g.player.cargo.count('tech_parts')}</b>${discount > 0 ? ` · scientists cut research costs by ${Math.round(discount * 100)}%` : ''} · <span class="leg have">researched</span> <span class="leg avail">available</span> <span class="leg locked">locked</span> · UNLOCK nodes add new equipment, UPGRADE nodes boost a whole weapon family.`));
  const COL = 180, ROW = 78, PADX = 130, PADY = 12, NW = 156, NH = 58;
  const maxTier = Math.max(...TECH.map((t) => t.tier));
  const W = PADX + (maxTier + 1) * COL, H = PADY * 2 + BRANCHES.length * ROW;
  const wrap = h('div', 'tech-wrap');
  wrap.style.width = `${W}px`;
  wrap.style.height = `${H}px`;
  const pos = (n: TechNode): { x: number; y: number } => ({ x: PADX + n.tier * COL, y: PADY + BRANCHES.findIndex((b) => b.key === n.branch) * ROW });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.classList.add('tech-lines');
  for (const n of TECH) {
    for (const req of n.requires) {
      const a = pos(TECH_BY_ID.get(req)!), b = pos(n);
      const path = document.createElementNS(svgNS, 'path');
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
      const mx = (x1 + x2) / 2;
      path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      const done = g.tech.has(req);
      path.setAttribute('stroke', done ? (g.tech.has(n.id) ? '#69f0ae' : '#ffd740') : '#3a3a48');
      path.setAttribute('stroke-width', done ? '3' : '2');
      path.setAttribute('fill', 'none');
      if (!done) path.setAttribute('stroke-dasharray', '5 5');
      svg.appendChild(path);
    }
  }
  wrap.appendChild(svg);
  BRANCHES.forEach((b, i) => {
    const lab = h('div', 'tech-branch', b.name);
    lab.style.top = `${PADY + i * ROW + NH / 2 - 8}px`;
    lab.style.color = b.color;
    wrap.appendChild(lab);
  });
  for (const n of TECH) {
    const p = pos(n);
    const branch = BRANCHES.find((b) => b.key === n.branch)!;
    const have = g.tech.has(n.id);
    const avail = canResearch(g.tech, n);
    const cost = researchCost(n, discount);
    const afford = g.canPay(cost);
    const el = h('div', `tech-node ${have ? 'have' : avail ? (afford ? 'avail' : 'avail poor') : 'locked'}`);
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.setProperty('--c', branch.color);
    const unlockKey = n.unlocks?.[0];
    const icon = unlockKey ? (WEAPONS[unlockKey] ? weaponIcon(unlockKey, 0) : MODULES[unlockKey] ? moduleIcon(unlockKey) : '') : '';
    el.innerHTML = `${icon ? `<img src="${icon}">` : ''}<div><small>${n.unlocks ? 'UNLOCK' : 'UPGRADE'}</small><b>${esc(n.name)}</b><small>${have ? '✔ DONE' : avail ? `${cost.tech_parts ?? 0} tech` : 'LOCKED'}</small></div>`;
    tooltip(el, () => {
      const reqs = n.requires.map((id) => `<span style="color:${g.tech.has(id) ? '#69f0ae' : '#ff8a80'}">${esc(TECH_BY_ID.get(id)!.name)}</span>`).join(', ');
      return `<h4 style="color:${branch.color}">${esc(n.name)}</h4><div>${esc(n.desc)}</div>${reqs ? `<div class="d">Requires: ${reqs}</div>` : ''}${have ? '<div class="good">Researched</div>' : `<div>${costHTML(cost, inv)}</div>`}${avail && !have ? '<div class="d">Click to research</div>' : ''}`;
    });
    if (avail) el.addEventListener('click', () => {
      const r = research(g, n.id);
      ctx.msg(r.msg ?? '', r.ok);
      if (r.ok) ctx.app.sound('levelup');
      ctx.rerender();
    });
    wrap.appendChild(el);
  }
  const scroll = h('div', 'tech-scroll');
  scroll.appendChild(wrap);
  ctx.body.appendChild(scroll);
  void RARITIES;
}
