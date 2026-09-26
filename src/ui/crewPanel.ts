import { MAX_BASE_CREW, OFFICER_LABELS, OFFICER_SLOTS } from '../shared/constants';
import { RARITIES } from '../shared/rarity';
import { choosePerk, dismiss, hire, moveCrew, REFRESH_COST, refreshRecruits, setOfficer, upgradeOutrider } from '../game/actions';
import { abilityCooldown, abilityOf, abilityPower, displayTitle, exclusiveDef, hireCost, MAX_LEVEL, PERK_BY_ID, perkText, ROLES, XP_LEVELS, type CrewMember } from '../game/crew';
import { OUTRIDER_COST, OUTRIDER_UPGRADE } from '../game/systems/outrider';
import { abilityIcon, portrait } from '../render/icons';
import { button, costHTML, esc, h, tooltip } from './dom';
import type { PanelCtx } from './panels';

const pick = { seat: -1 };

function xpBar(c: CrewMember): string {
  if (c.level >= MAX_LEVEL) return '<div class="xp"><div style="width:100%"></div></div><small>MAX LEVEL</small>';
  const lo = XP_LEVELS[c.level - 1], hi = XP_LEVELS[c.level];
  const f = Math.max(0, Math.min(1, (c.xp - lo) / (hi - lo)));
  return `<div class="xp"><div style="width:${f * 100}%"></div></div><small>L${c.level} · ${Math.floor(c.xp - lo)}/${hi - lo} xp</small>`;
}

function abilityText(c: CrewMember, cdr: number, bonus = 0): string {
  const a = abilityOf(c);
  const P = abilityPower(c, bonus);
  const d = a.desc.replace(/\{([^}]+)\}/g, (_m, v: string) => {
    const n = parseFloat(v);
    if (Number.isNaN(n)) return v;
    const u = v.replace(/[\d.]/g, '');
    const x = n * P;
    return `<b>${u === '%' || x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}${u}</b>`;
  });
  return `<div class="abil"><img src="${abilityIcon(c)}"><div><b style="color:${a.color}">${esc(a.name)}</b> <small>${Math.round(abilityCooldown(c, cdr))}s cooldown${a.target === 'point' ? ' · aimed' : ''}</small><div>${d}</div></div></div>`;
}

function perksHTML(c: CrewMember): string {
  if (!c.perks.length) return '<small class="d">No perks yet: level up to pick some.</small>';
  return c.perks.map((p) => `<span class="perk r${p.rarity}" title="${esc(perkText(p.id, p.rarity))}">${esc(PERK_BY_ID.get(p.id)?.name ?? p.id)}</span>`).join('');
}

function draftHTML(ctx: PanelCtx, c: CrewMember): HTMLElement {
  const g = ctx.app.game;
  const box = h('div', 'draft');
  box.appendChild(h('div', 'dt', `★ LEVEL UP! ${esc(c.name)} can pick one perk:`));
  const row = h('div', 'draft-row');
  c.draft!.forEach((p, i) => {
    const d = PERK_BY_ID.get(p.id)!;
    const card = h('div', `perk-card r${p.rarity}`);
    card.style.setProperty('--rc', RARITIES[p.rarity].color);
    card.innerHTML = `<div class="rk" style="color:${RARITIES[p.rarity].color}">${RARITIES[p.rarity].name}</div><b>${esc(d.name)}</b><div>${esc(perkText(p.id, p.rarity))}</div>`;
    card.addEventListener('click', () => {
      choosePerk(g, c.id, i);
      ctx.app.sound('levelup');
      ctx.msg(`${c.name} learned ${d.name}.`);
      ctx.rerender();
    });
    row.appendChild(card);
  });
  box.appendChild(row);
  return box;
}

function crewCard(ctx: PanelCtx, c: CrewMember, compact = false): HTMLElement {
  const g = ctx.app.game;
  const card = h('div', `crew-card r${c.rarity} ${c.injured > 0 ? 'injured' : ''}`);
  card.style.setProperty('--rc', RARITIES[c.rarity].color);
  const ex = exclusiveDef(c);
  const status = c.loc === 'away' ? `<span class="bad">walking back (${Math.ceil(c.returnIn)}s)</span>` : c.injured > 0 ? `<span class="bad">injured ${Math.ceil(c.injured)}s</span>` : c.loc === 'outrider' ? '<span class="cy">aboard Outrider</span>' : '<span class="good">on duty</span>';
  card.innerHTML = `<div class="cc-top"><img class="pt" src="${portrait(c)}"><div class="cc-id"><b>${esc(c.name)}</b><div class="role" style="color:${ROLES[c.role].color}">${esc(displayTitle(c))}</div><div class="rar" style="color:${RARITIES[c.rarity].color}">${RARITIES[c.rarity].name} · ${status}</div>${xpBar(c)}</div></div>`;
  if (!compact) {
    card.innerHTML += abilityText(c, g.player.crew.cdr, g.player.crew.abilityPower);
    card.innerHTML += `<div class="passive"><small>Side-crew passive:</small> ${esc(ROLES[c.role].passive)}${ex ? `<br><small>Exclusive:</small> <b style="color:#e040fb">${esc(ex.desc)}</b>` : ''}</div>`;
    card.innerHTML += `<div class="perks">${perksHTML(c)}</div>`;
  }
  return card;
}

export function renderCrew(ctx: PanelCtx): void {
  if (ctx.tab === 'roster') return renderRoster(ctx);
  if (ctx.tab === 'recruit') return renderRecruit(ctx);
  if (ctx.tab === 'outrider') return renderOutrider(ctx);
  renderOfficers(ctx);
}

function renderOfficers(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const off = g.officers();
  ctx.body.appendChild(h('div', 'hint', `<b>Main crew</b> are your officers: each gives an ability on <kbd>Q</kbd><kbd>E</kbd><kbd>F</kbd><kbd>G</kbd> (and <kbd>Z</kbd><kbd>X</kbd> once researched) that goes on cooldown. Everyone else is <b>side crew</b> with a passive bonus. Put your best (Champions!) in these seats.`));
  // Pending drafts first
  for (const c of g.crew) if (c.draft) ctx.body.appendChild(draftHTML(ctx, c));
  const grid = h('div', 'officer-grid');
  for (let i = 0; i < OFFICER_SLOTS; i++) {
    const c = off[i];
    const seat = h('div', 'seat');
    seat.appendChild(h('div', 'seat-key', OFFICER_LABELS[i]));
    if (i >= g.officerSeats()) {
      seat.classList.add('locked');
      seat.appendChild(h('div', 'empty-seat', `🔒 Locked seat<br><small>Research ${i === 4 ? 'Officer School (COMMAND I)' : 'Chain of Command (COMMAND III)'} in RESEARCH > Personnel.</small>`));
      seat.appendChild(button('Open research', () => ctx.app.panels.open('tech', 'personnel')));
      grid.appendChild(seat);
      continue;
    }
    if (c) {
      seat.appendChild(crewCard(ctx, c));
      const row = h('div', 'row');
      row.appendChild(button('Change', () => {
        pick.seat = pick.seat === i ? -1 : i;
        ctx.rerender();
      }));
      row.appendChild(button('Unseat', () => {
        setOfficer(g, c.id, -1);
        ctx.rerender();
      }));
      seat.appendChild(row);
    } else {
      seat.appendChild(h('div', 'empty-seat', 'Empty seat'));
      seat.appendChild(button('Assign officer', () => {
        pick.seat = i;
        ctx.rerender();
      }, 'primary'));
    }
    if (pick.seat === i) {
      const choices = h('div', 'choices');
      const cands = g.crew.filter((k) => k.loc === 'main' && k.officer !== i);
      if (!cands.length) choices.appendChild(h('div', 'd', 'No other crew aboard. Recruit more!'));
      for (const k of cands) {
        const b = h('div', 'choice');
        b.innerHTML = `<img src="${portrait(k)}"><span><b>${esc(k.name)}</b><br><small style="color:${RARITIES[k.rarity].color}">${esc(displayTitle(k))} L${k.level}</small><br><small>${esc(abilityOf(k).name)}${k.officer >= 0 ? ` (in ${OFFICER_LABELS[k.officer]})` : ''}</small></span>`;
        b.addEventListener('click', () => {
          setOfficer(g, k.id, i);
          pick.seat = -1;
          ctx.rerender();
        });
        choices.appendChild(b);
      }
      seat.appendChild(choices);
    }
    grid.appendChild(seat);
  }
  ctx.body.appendChild(grid);
}

function renderRoster(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const main = g.mainCrew();
  ctx.body.appendChild(h('div', 'hint', `Aboard the fortress: <b>${main.length} / ${g.crewCap()}</b> (bunks from Quarters and Barracks, hard cap ${MAX_BASE_CREW}). ${g.outrider ? `Outrider: <b>${g.outriderCrew().length} / ${g.outriderCap()}</b>.` : ''}`));
  const list = h('div', 'roster');
  const sorted = [...g.crew].sort((a, b) => (a.officer < 0 ? 9 : a.officer) - (b.officer < 0 ? 9 : b.officer) || b.rarity - a.rarity || b.level - a.level);
  for (const c of sorted) {
    const row = h('div', 'roster-row');
    const card = crewCard(ctx, c, true);
    row.appendChild(card);
    const mid = h('div', 'roster-mid');
    mid.innerHTML = `${abilityText(c, g.player.crew.cdr, g.player.crew.abilityPower)}<div class="perks">${perksHTML(c)}</div><div class="passive"><small>Passive:</small> ${esc(ROLES[c.role].passive)}</div>`;
    row.appendChild(mid);
    const act = h('div', 'roster-act');
    if (c.officer >= 0) act.appendChild(h('div', 'badge-off', `OFFICER ${OFFICER_LABELS[c.officer]}`));
    else act.appendChild(h('div', 'badge-side', c.loc === 'outrider' ? 'OUTRIDER CREW' : 'SIDE CREW'));
    if (c.draft) act.appendChild(button('★ Pick perk', () => ctx.setTab('officers'), 'primary small'));
    if (c.loc === 'main' && c.officer < 0) act.appendChild(button('Make officer', () => {
      const off = g.officers();
      const free = off.findIndex((x) => !x);
      pick.seat = free >= 0 ? free : 0;
      if (free >= 0) {
        setOfficer(g, c.id, free);
        pick.seat = -1;
        ctx.msg(`${c.name} now uses ${OFFICER_LABELS[free]}.`);
        ctx.rerender();
      } else ctx.setTab('officers');
    }, 'small'));
    if (g.outrider && c.loc === 'main' && c.officer < 0 && !c.champion && !c.exclusive) act.appendChild(button('→ Outrider', () => {
      const r = moveCrew(g, c.id, 'outrider');
      ctx.msg(r.ok ? `${c.name} joined the Outrider.` : r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'small'));
    if (c.loc === 'outrider') act.appendChild(button('→ Fortress', () => {
      const r = moveCrew(g, c.id, 'main');
      ctx.msg(r.ok ? `${c.name} is back aboard.` : r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'small'));
    act.appendChild(button('Dismiss', () => ctx.app.panels.confirm(`Dismiss ${c.name}?`, 'They leave the crew for good.', 'Dismiss', () => {
      dismiss(g, c.id);
      ctx.rerender();
    }), 'danger small'));
    row.appendChild(act);
    list.appendChild(row);
  }
  ctx.body.appendChild(list);
}

function renderRecruit(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const room = g.crewRoom();
  ctx.body.appendChild(h('div', 'hint', `Bunks: <b>${g.mainCrew().length} / ${g.crewCap()}</b>${room ? '' : ' — <span class="bad">full! Build Quarters or Barracks (BASE), or launch the Outrider at 15 crew.</span>'} · Recruits get better the further you are from camp. Freed prisoners join for free.`));
  const row = h('div', 'recruit-row');
  g.recruits.forEach((c, i) => {
    const card = crewCard(ctx, c);
    const cost = hireCost(c);
    card.appendChild(h('div', 'cost-line', costHTML(cost, [g.player.cargo])));
    card.appendChild(button('Hire', () => {
      const r = hire(g, i);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'primary'));
    row.appendChild(card);
  });
  if (!g.recruits.length) row.appendChild(h('div', 'hint', 'Nobody is looking for work right now.'));
  ctx.body.appendChild(row);
  const b = button(`New faces (${REFRESH_COST.scrap} scrap)`, () => {
    const r = refreshRecruits(g);
    if (!r.ok) ctx.msg(r.msg, false);
    ctx.rerender();
  });
  tooltip(b, () => 'Roll three new recruits.');
  ctx.body.appendChild(b);
}

function renderOutrider(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const t = g.outrider;
  ctx.body.appendChild(h('div', 'hint', `The <b>Outrider</b> is a mini tank crewed by <b>side crew</b> (not officers). It follows you and fights, or you can <b>send it on expeditions</b> to harvest resource nodes and scavenge loot areas on its own (right-click with <kbd>G</kbd>). <span class="bad">If it's destroyed, each crew member aboard may die.</span> Medics aboard improve the odds.`));
  if (!g.outriderUnlocked()) {
    ctx.body.appendChild(h('div', 'big-lock', `🔒 Unlocks when your fortress holds <b>15 crew</b> (${g.mainCrew().length}/15).<br><small>Build Quarters and Barracks for bunks, then recruit.</small>`));
    return;
  }
  if (!t) {
    const box = h('div', 'big-lock', g.player.stats.garage ? `Ready to ${g.outriderLevel ? 'rebuild' : 'launch'}${g.outriderRebuild > 0 ? ` in ${Math.ceil(g.outriderRebuild)}s` : ''}.<br>${costHTML(OUTRIDER_COST, [g.player.cargo])}` : 'Build a <b>Garage</b> on your deck (BASE > Deck) to launch the Outrider.');
    if (g.player.stats.garage && g.outriderRebuild <= 0) box.appendChild(button(g.outriderLevel ? 'Rebuild Outrider' : 'Launch Outrider', () => {
      ctx.app.outriderCmd('launch');
      ctx.rerender();
    }, 'primary'));
    ctx.body.appendChild(box);
    return;
  }
  const info = h('div', 'rider-info');
  info.innerHTML = `<b>Outrider Mk${g.outriderLevel}</b> · hull ${Math.ceil(t.hp)}/${t.stats.maxHp} · speed ${t.stats.topSpeed.toFixed(1)} · crew ${g.outriderCrew().length}/${g.outriderCap()} · drill tier ${1 + Math.floor(g.outriderLevel / 2)}`;
  const up = OUTRIDER_UPGRADE[g.outriderLevel - 1];
  if (up) {
    info.innerHTML += `<div>Upgrade to Mk${g.outriderLevel + 1}: +hull, ${g.outriderLevel === 1 ? 'second gun, ' : ''}more crew room, better drill. ${costHTML(up, [g.player.cargo])}</div>`;
    info.appendChild(button('Upgrade', () => {
      const r = upgradeOutrider(g);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'primary'));
  }
  ctx.body.appendChild(info);
  const cols = h('div', 'rider-cols');
  const aboard = h('div', 'rider-col');
  aboard.appendChild(h('div', 'cat', 'ABOARD THE OUTRIDER'));
  for (const c of g.outriderCrew()) {
    const r = h('div', 'mini-row');
    r.innerHTML = `<img src="${portrait(c)}"><span><b>${esc(c.name)}</b> <small style="color:${ROLES[c.role].color}">${ROLES[c.role].name} L${c.level}</small></span>`;
    r.appendChild(button('Remove', () => {
      const res = moveCrew(g, c.id, 'main');
      ctx.msg(res.ok ? 'Moved back to the fortress.' : res.msg ?? '', res.ok);
      ctx.rerender();
    }, 'small'));
    aboard.appendChild(r);
  }
  if (!g.outriderCrew().length) aboard.appendChild(h('div', 'd', 'Empty. It needs at least one crew member to go on expeditions.'));
  const avail = h('div', 'rider-col');
  avail.appendChild(h('div', 'cat', 'SIDE CREW ON THE FORTRESS'));
  for (const c of g.crew.filter((k) => k.loc === 'main' && k.officer < 0 && !k.champion && !k.exclusive)) {
    const r = h('div', 'mini-row');
    r.innerHTML = `<img src="${portrait(c)}"><span><b>${esc(c.name)}</b> <small style="color:${ROLES[c.role].color}">${ROLES[c.role].name} L${c.level}</small></span>`;
    r.appendChild(button('Add', () => {
      const res = moveCrew(g, c.id, 'outrider');
      ctx.msg(res.ok ? `${c.name} joined the Outrider.` : res.msg ?? '', res.ok);
      ctx.rerender();
    }, 'small'));
    avail.appendChild(r);
  }
  cols.append(aboard, avail);
  ctx.body.appendChild(cols);
}
