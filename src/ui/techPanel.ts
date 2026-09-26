import { WEAPONS } from '../shared/weapons';
import { cancelResearch, research } from '../game/actions';
import { ACTIVES, ULTIMATES } from '../game/arsenal';
import { MODULES } from '../game/defs';
import type { Game } from '../game/game';
import { researchSpeed } from '../game/systems/arsenal';
import { BRANCHES, canResearch, researchCost, researchTime, TECH, TECH_BY_ID, TIER_NAMES, type TechNode, type TreeKind } from '../game/tech';
import { itemIcon, moduleIcon, weaponIcon } from '../render/icons';
import { button, costHTML, esc, h, tooltip } from './dom';
import type { PanelCtx } from './panels';

const st = { sel: '' };

function secs(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60), r = Math.ceil(s % 60);
  return r ? `${m}m ${String(r).padStart(2, '0')}s` : `${m}m`;
}

function kindTag(n: TechNode): string {
  if (n.tree === 'personnel') return 'CREW';
  const u = n.unlocks?.[0];
  if (u && MODULES[u]?.ult) return 'ULTIMATE';
  if (u && MODULES[u]?.active) return 'ACTIVE';
  if (u && WEAPONS[u]) return 'WEAPON';
  if (u) return 'FACILITY';
  return 'UPGRADE';
}

function nodeIcon(n: TechNode): string {
  const u = n.unlocks?.[0];
  if (!u) return n.tree === 'personnel' ? itemIcon('rations') : itemIcon('tech_parts');
  return WEAPONS[u] ? weaponIcon(u, 0) : MODULES[u] ? moduleIcon(u) : '';
}

function unlockName(k: string): string {
  const m = MODULES[k];
  if (m?.active) return `${m.name} → ${ACTIVES[m.active].name} (active)`;
  if (m?.ult) return `${m.name} → ${ULTIMATES[m.ult].name} (ultimate)`;
  return m?.name ?? WEAPONS[k]?.name ?? k;
}

/** Research progress lines (also used by the HUD widget). */
export function researchStatus(g: Game): { kind: TreeKind; name: string; pct: number; left: number }[] {
  const sp = researchSpeed(g);
  const out: { kind: TreeKind; name: string; pct: number; left: number }[] = [];
  for (const kind of ['military', 'personnel'] as TreeKind[]) {
    const j = g.research[kind];
    if (!j) continue;
    out.push({ kind, name: TECH_BY_ID.get(j.id)?.name ?? j.id, pct: Math.min(1, j.t / j.total), left: (j.total - j.t) / Math.max(0.01, sp) });
  }
  return out;
}

/** The research charts: branches are rows, tiers 0-VI are columns. Deeper tiers take longer and hit harder. */
export function renderTech(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const tree: TreeKind = ctx.tab === 'personnel' ? 'personnel' : 'military';
  const p = g.player;
  const sp = researchSpeed(g);
  const discount = p.crew.research;
  // Header: what's running and how fast.
  const head = h('div', 'res-head');
  for (const kind of ['military', 'personnel'] as TreeKind[]) {
    const j = g.research[kind];
    const slot = h('div', `res-slot ${j ? 'busy' : ''}`);
    if (j) {
      const n = TECH_BY_ID.get(j.id)!;
      const pct = Math.min(100, (j.t / j.total) * 100);
      slot.innerHTML = `<small>${kind.toUpperCase()}</small><b>${esc(n.name)}</b><div class="bar"><div style="width:${pct}%"></div></div><small>${secs((j.total - j.t) / sp)} left</small>`;
      slot.appendChild(button('Cancel', () => {
        const r = cancelResearch(g, kind);
        ctx.msg(r.msg ?? '', r.ok);
        ctx.rerender();
      }, 'small'));
    } else slot.innerHTML = `<small>${kind.toUpperCase()}</small><b class="d">Idle</b><small>${kind === 'personnel' && p.stats.lab <= 0 ? 'needs a Science Lab' : 'pick a node below'}</small>`;
    head.appendChild(slot);
  }
  head.appendChild(h('div', 'res-speed', `<b>Research speed ×${sp.toFixed(2)}</b><small>Bridge crew 0.5${p.stats.lab ? ` + Science Labs ${p.stats.lab.toFixed(2)}` : ' · <span class="bad">build Science Labs to go faster</span>'}${discount ? ` · scientists −${Math.round(discount * 100)}% cost` : ''}</small><small><img class="inl" src="${itemIcon('tech_parts')}"> ${p.cargo.count('tech_parts')} Salvaged Tech · <img class="inl" src="${itemIcon('mythic_essence')}"> ${p.cargo.count('mythic_essence')} Essence</small>`));
  ctx.body.appendChild(head);
  if (tree === 'personnel' && p.stats.lab <= 0) {
    ctx.body.appendChild(h('div', 'warn', 'Personnel research needs a Science Lab on your deck. Research "Science Lab" (MILITARY > INDUSTRY I, 30s), then build it in BASE.'));
  }
  // Selected node detail.
  const nodes = TECH.filter((n) => n.tree === tree);
  const sel = TECH_BY_ID.get(st.sel);
  const detail = h('div', 'res-detail');
  if (sel && sel.tree === tree) {
    const have = g.tech.has(sel.id);
    const avail = canResearch(g.tech, sel);
    const cost = researchCost(sel, discount);
    const branch = BRANCHES.find((b) => b.key === sel.branch)!;
    const reqs = sel.requires.map((id) => `<span class="${g.tech.has(id) ? 'good' : 'bad'}">${esc(TECH_BY_ID.get(id)?.name ?? id)}</span>`).join(', ');
    const running = g.research[tree]?.id === sel.id;
    detail.innerHTML = `<img src="${nodeIcon(sel)}"><div class="rd-main"><div><small style="color:${branch.color}">${branch.name} · TIER ${TIER_NAMES[sel.tier]} · ${kindTag(sel)}</small></div><b class="t">${esc(sel.name)}</b><div>${esc(sel.desc)}</div>${sel.unlocks?.length ? `<div class="good">Unlocks: ${sel.unlocks.map(unlockName).map(esc).join(', ')}</div>` : ''}${reqs ? `<div class="d">Requires: ${reqs}</div>` : ''}</div>`;
    const act = h('div', 'rd-act');
    if (have) act.innerHTML = '<b class="good">✔ Researched</b>';
    else {
      act.innerHTML = `<div>${costHTML(cost, [p.cargo])}</div><div class="d">⏱ ${secs(researchTime(sel) / sp)} at ×${sp.toFixed(2)}</div>`;
      if (running) act.appendChild(h('div', 'y', 'Researching...'));
      else if (avail) act.appendChild(button('Start research', () => {
        const r = research(g, sel.id);
        ctx.msg(r.msg ?? '', r.ok);
        ctx.rerender();
      }, 'primary'));
      else act.appendChild(h('div', 'bad', 'Research the requirements first.'));
    }
    detail.appendChild(act);
  } else detail.innerHTML = `<div class="hint">Click any node to see what it does. <b>UNLOCK</b> nodes add new weapons, facilities, actives (1-4) and ultimates (R). <b>UPGRADE</b> nodes boost a whole weapon family or your hull. Tier I takes 30s; tier VI takes 8 minutes and is far stronger.</div>`;
  ctx.body.appendChild(detail);
  // Chart
  const branches = BRANCHES.filter((b) => b.tree === tree);
  const COL = 168, PADX = 118, NW = 150, NH = 50, GAP = 6, PADY = 20;
  const maxTier = 6;
  // Stack nodes that share a branch + tier.
  const pos = new Map<string, { x: number; y: number }>();
  let y = PADY;
  const rowTops: number[] = [];
  for (const b of branches) {
    rowTops.push(y);
    let rows = 1;
    for (let t = 0; t <= maxTier; t++) {
      const cell = nodes.filter((n) => n.branch === b.key && n.tier === t);
      cell.forEach((n, i) => pos.set(n.id, { x: PADX + t * COL, y: y + i * (NH + GAP) }));
      rows = Math.max(rows, cell.length);
    }
    y += rows * (NH + GAP) + 14;
  }
  const W = PADX + (maxTier + 1) * COL, H = y + 4;
  const wrap = h('div', 'tech-wrap');
  wrap.style.width = `${W}px`;
  wrap.style.height = `${H}px`;
  for (let t = 0; t <= maxTier; t++) {
    const lab = h('div', 'tech-tier', `TIER ${TIER_NAMES[t]}${t ? ` · ${secs(researchTime({ tier: t } as TechNode))}` : ''}`);
    lab.style.left = `${PADX + t * COL}px`;
    wrap.appendChild(lab);
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.classList.add('tech-lines');
  for (const n of nodes) {
    for (const req of n.requires) {
      const a = pos.get(req), b = pos.get(n.id);
      if (!a || !b) continue; // cross-tree requirement
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
  branches.forEach((b, i) => {
    const lab = h('div', 'tech-branch', b.name);
    lab.style.top = `${rowTops[i] + NH / 2 - 8}px`;
    lab.style.color = b.color;
    wrap.appendChild(lab);
  });
  for (const n of nodes) {
    const pp = pos.get(n.id)!;
    const branch = BRANCHES.find((b) => b.key === n.branch)!;
    const have = g.tech.has(n.id);
    const avail = canResearch(g.tech, n);
    const job = g.research[tree];
    const running = job?.id === n.id;
    const cost = researchCost(n, discount);
    const afford = g.canPay(cost);
    const el = h('div', `tech-node ${have ? 'have' : running ? 'running' : avail ? (afford ? 'avail' : 'avail poor') : 'locked'} ${st.sel === n.id ? 'sel' : ''}`);
    el.style.left = `${pp.x}px`;
    el.style.top = `${pp.y}px`;
    el.style.setProperty('--c', branch.color);
    const icon = nodeIcon(n);
    const status = have ? '✔ DONE' : running ? `${Math.floor((job!.t / job!.total) * 100)}%` : avail ? `⏱ ${secs(researchTime(n) / sp)}` : 'LOCKED';
    el.innerHTML = `${icon ? `<img src="${icon}">` : ''}<div><small>${kindTag(n)}</small><b>${esc(n.name)}</b><small>${status}</small></div>${running ? `<div class="nbar"><div style="width:${(job!.t / job!.total) * 100}%"></div></div>` : ''}`;
    tooltip(el, () => `<h4 style="color:${branch.color}">${esc(n.name)}</h4><div>${esc(n.desc)}</div>${have ? '<div class="good">Researched</div>' : `<div>${costHTML(cost, [p.cargo])} · ⏱ ${secs(researchTime(n) / sp)}</div>`}<div class="d">Click for details</div>`);
    el.addEventListener('click', () => {
      st.sel = n.id;
      ctx.rerender();
    });
    el.addEventListener('dblclick', () => {
      if (!avail || have) return;
      const r = research(g, n.id);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    });
    wrap.appendChild(el);
  }
  const scroll = h('div', 'tech-scroll');
  scroll.appendChild(wrap);
  ctx.body.appendChild(scroll);
}
