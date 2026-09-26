import { ACTIVE_SLOTS, OFFICER_LABELS, OFFICER_SLOTS } from '../shared/constants';
import { RARITIES } from '../shared/rarity';
import { setActiveSlot, setUltimate } from '../game/actions';
import { ACTIVES, ULTIMATES, type ActiveDef, type UltDef } from '../game/arsenal';
import { abilityCooldown, abilityOf, abilityPower } from '../game/crew';
import { levelMult, MODULES } from '../game/defs';
import type { Game } from '../game/game';
import { activeCooldown, armedUlt } from '../game/systems/arsenal';
import { BRANCHES, TIER_NAMES, unlockNode } from '../game/tech';
import { abilityIcon, moduleIcon, portrait } from '../render/icons';
import { button, costHTML, esc, h, tooltip } from './dom';
import type { PanelCtx } from './panels';

const st = { slot: 0 };

/** Replaces {n} placeholders with numbers scaled by power. */
export function scaleDesc(desc: string, P: number): string {
  return desc.replace(/\{([^}]+)\}/g, (_m, v: string) => {
    const n = parseFloat(v);
    if (Number.isNaN(n)) return v;
    const unit = v.replace(/[\d.]/g, '');
    const x = n * P;
    return `<b>${unit === 's' ? x.toFixed(1).replace(/\.0$/, '') : Math.round(x)}${unit}</b>`;
  });
}

function howToUnlock(g: Game, moduleKey: string): string {
  const node = unlockNode(moduleKey);
  const d = MODULES[moduleKey];
  const built = g.player.modules.some((m) => m.key === moduleKey);
  if (built) return '<span class="good">✔ Built</span>';
  if (!node) return '';
  const br = BRANCHES.find((b) => b.key === node.branch);
  const researched = g.tech.has(node.id);
  return `${researched ? '<span class="good">✔</span>' : '🔒'} Research <b>${esc(node.name)}</b> <small>(${esc(br?.name ?? '')} ${TIER_NAMES[node.tier]})</small> → build <b>${esc(d.name)}</b> ${costHTML(d.cost, [g.player.cargo])}`;
}

export function renderAbilities(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const wrap = h('div', 'abil-wrap');

  /* ---- Officers ---- */
  const off = h('div', 'abil-sec');
  off.appendChild(h('div', 'cat', 'OFFICER ABILITIES <small>crew in officer seats · Q E F G Z X</small>'));
  const offs = g.officers();
  const seats = g.officerSeats();
  const row = h('div', 'abil-row');
  for (let i = 0; i < OFFICER_SLOTS; i++) {
    const c = offs[i];
    const locked = i >= seats;
    const el = h('div', `abil-card ${locked ? 'locked' : c ? '' : 'empty'}`);
    if (locked) el.innerHTML = `<kbd>${OFFICER_LABELS[i]}</kbd><div class="an">LOCKED</div><div class="d">Research ${i === 4 ? 'Officer School (COMMAND I)' : 'Chain of Command (COMMAND III)'} in Personnel.</div>`;
    else if (!c) el.innerHTML = `<kbd>${OFFICER_LABELS[i]}</kbd><div class="an">Empty seat</div><div class="d">Assign an officer in CREW.</div>`;
    else {
      const a = abilityOf(c);
      el.innerHTML = `<kbd>${OFFICER_LABELS[i]}</kbd><img src="${abilityIcon(c)}"><div class="an" style="color:${a.color}">${esc(a.name)}</div><div class="who"><img src="${portrait(c)}">${esc(c.name)} <small style="color:${RARITIES[c.rarity].color}">L${c.level}</small></div><div class="d">${scaleDesc(a.desc, abilityPower(c, p.crew.abilityPower))}</div><div class="d">⏱ ${Math.round(abilityCooldown(c, p.crew.cdr))}s</div>`;
    }
    el.addEventListener('click', () => (locked ? ctx.app.panels.open('tech', 'personnel') : ctx.app.panels.open('crew', 'officers')));
    row.appendChild(el);
  }
  off.appendChild(row);
  wrap.appendChild(off);

  /* ---- Actives ---- */
  const act = h('div', 'abil-sec');
  act.appendChild(h('div', 'cat', 'ARSENAL ACTIVES <small>from deck modules · keys 1 2 3 4 · click a slot, then pick a module</small>'));
  const arow = h('div', 'abil-row');
  for (let i = 0; i < ACTIVE_SLOTS; i++) {
    const m = g.activeSlots[i] ? p.moduleById(g.activeSlots[i]) : undefined;
    const el = h('div', `abil-card ${st.slot === i ? 'on' : ''} ${m ? '' : 'empty'}`);
    if (m) {
      const a = ACTIVES[MODULES[m.key].active!];
      el.innerHTML = `<kbd>${i + 1}</kbd><img src="${moduleIcon(m.key)}"><div class="an" style="color:${a.color}">${esc(a.name)}</div><div class="d">${scaleDesc(a.desc, levelMult(m.lvl))}</div><div class="d">⏱ ${Math.round(activeCooldown(g, a.key))}s · ${esc(MODULES[m.key].name)} L${m.lvl}</div>`;
    } else el.innerHTML = `<kbd>${i + 1}</kbd><div class="an">Empty</div><div class="d">Build an active module, then pick it below.</div>`;
    el.addEventListener('click', () => {
      st.slot = i;
      ctx.rerender();
    });
    arow.appendChild(el);
  }
  act.appendChild(arow);
  const owned = p.modules.filter((m) => MODULES[m.key].active);
  if (owned.length) {
    const pick = h('div', 'row wrap');
    pick.appendChild(h('span', 'd', `Put in slot ${st.slot + 1}:`));
    for (const m of owned) {
      const a = ACTIVES[MODULES[m.key].active!];
      const on = g.activeSlots[st.slot] === m.id;
      pick.appendChild(button(`<img class="inl" src="${moduleIcon(m.key)}"> ${esc(a.name)}${g.activeSlots.includes(m.id) ? ` [${g.activeSlots.indexOf(m.id) + 1}]` : ''}`, () => {
        const r = setActiveSlot(g, st.slot, m.id);
        if (!r.ok) ctx.msg(r.msg, false);
        ctx.rerender();
      }, `small ${on ? 'on' : ''}`));
    }
    pick.appendChild(button('Clear slot', () => {
      setActiveSlot(g, st.slot, 0);
      ctx.rerender();
    }, 'small'));
    act.appendChild(pick);
  }
  act.appendChild(catalog(g, Object.values(ACTIVES), ctx));
  wrap.appendChild(act);

  /* ---- Ultimate ---- */
  const ult = h('div', 'abil-sec');
  const armed = armedUlt(g);
  ult.appendChild(h('div', 'cat', `ULTIMATE <small>key R · charges over time and faster as you deal damage · ${armed ? `${Math.floor(g.ultCharge * 100)}% charged` : 'none armed'}</small>`));
  const ults = p.modules.filter((m) => MODULES[m.key].ult);
  const urow = h('div', 'abil-row');
  for (const m of ults) {
    const u = ULTIMATES[MODULES[m.key].ult!];
    const on = g.ultModule === m.id;
    const el = h('div', `abil-card ult ${on ? 'on' : ''}`);
    el.innerHTML = `<kbd>R</kbd><img src="${moduleIcon(m.key)}"><div class="an" style="color:${u.color}">${esc(u.name)}</div><div class="d">${scaleDesc(u.desc, levelMult(m.lvl))}</div><div class="d">Charge ${u.charge}s (faster in combat) · ${esc(MODULES[m.key].name)} L${m.lvl}</div><div class="${on ? 'good' : 'd'}">${on ? 'ARMED' : 'click to arm'}</div>`;
    el.addEventListener('click', () => {
      const r = setUltimate(g, m.id);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    });
    urow.appendChild(el);
  }
  if (!ults.length) urow.appendChild(h('div', 'hint', 'No ultimate yet. They sit deep in the research tree (tiers V-VI): the longer they take to unlock, the more devastating they are.'));
  ult.appendChild(urow);
  ult.appendChild(catalog(g, Object.values(ULTIMATES), ctx));
  wrap.appendChild(ult);
  ctx.body.appendChild(wrap);
}

function catalog(g: Game, defs: (ActiveDef | UltDef)[], ctx: PanelCtx): HTMLElement {
  const box = h('details', 'abil-cat');
  const node = (d: ActiveDef | UltDef) => unlockNode(d.module);
  const sorted = defs.slice().sort((a, b) => (node(a)?.tier ?? 0) - (node(b)?.tier ?? 0));
  box.innerHTML = `<summary>All ${defs[0] && 'charge' in defs[0] ? 'ultimates' : 'actives'} and how to unlock them (${sorted.filter((d) => g.player.modules.some((m) => m.key === d.module)).length}/${sorted.length} built)</summary>`;
  const grid = h('div', 'abil-grid');
  for (const d of sorted) {
    const n = node(d);
    const el = h('div', 'abil-mini');
    el.innerHTML = `<img src="${moduleIcon(d.module)}"><div><b style="color:${d.color}">${esc(d.name)}</b> <small>${n ? `TIER ${TIER_NAMES[n.tier]}` : ''}</small><div class="d">${scaleDesc(d.desc, 1)}</div><div class="d">${howToUnlock(g, d.module)}</div></div>`;
    tooltip(el, () => `<h4>${esc(d.name)}</h4><div>${scaleDesc(d.desc, 1)}</div><div class="d">Module levels 2 and 3 (BASE) make it 50% / 100% stronger.</div>`);
    if (n && !g.tech.has(n.id)) el.appendChild(button('Research', () => ctx.app.panels.open('tech', n.tree), 'small'));
    else if (!g.player.modules.some((m) => m.key === d.module)) el.appendChild(button('Build', () => ctx.app.panels.open('base', 'deck'), 'small primary'));
    grid.appendChild(el);
  }
  box.appendChild(grid);
  return box;
}
