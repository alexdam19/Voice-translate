import { getItem } from '../shared/items';
import { RARITIES, starText } from '../shared/rarity';
import {
  AFFIXES, canTakeNode, FAMILY_INFO, SPECIAL_INFO, TREE_BRANCHES, treePoints, weaponScore, weaponStats, weaponTree, WEAPON_LIST, WEAPONS,
  type WeaponFamily, type WeaponItem,
} from '../shared/weapons';
import { nextRarity, scrapValue, STAR_TIME, starBlock, starCost } from '../game/arsenal';
import {
  cancelForge, craftWeapon, findWeapon, mountWeapon, respecCost, respecTree, scrapWeapon, startForge, takeTreeNode, unmountWeapon,
} from '../game/actions';
import { canMount, MODULES } from '../game/defs';
import type { Game } from '../game/game';
import { forgeSpeed } from '../game/systems/arsenal';
import type { ModuleInst } from '../game/tank';
import { techLevel } from '../game/progress';
import { TECH_BY_ID, weaponCraftable } from '../game/tech';
import { weaponIcon } from '../render/icons';
import { button, clickWord, costHTML, esc, h, tooltip } from './dom';
import type { PanelCtx } from './panels';

/** Selection survives re-renders: a weapon uid, or an empty hardpoint id. */
const st = { uid: 0, hp: 0, fam: 'all' as WeaponFamily | 'all' };

/** Opens the Arsenal on a weapon (used by the HUD weapon icons). */
export function selectArsenalWeapon(uid: number): void {
  st.uid = uid;
  st.hp = 0;
}

export function selectArsenalHardpoint(id: number): void {
  st.hp = id;
  st.uid = 0;
}

export function starsHTML(w: WeaponItem): string {
  const col = RARITIES[w.rarity].color;
  const txt = starText(w.rarity);
  const n = w.rarity + 1;
  return `<span class="stars" style="color:${col}">${txt.slice(0, n)}</span><span class="stars off">${txt.slice(n)}</span>`;
}

function secs(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  return `${Math.floor(s / 60)}m ${String(Math.ceil(s % 60)).padStart(2, '0')}s`;
}

export function weaponTitle(w: WeaponItem): string {
  return `<b style="color:${RARITIES[w.rarity].color}">${esc(WEAPONS[w.key].name)}</b>`;
}

/** Compact stat summary used in lists and tooltips. */
export function weaponSummary(w: WeaponItem, stats = weaponStats(w)): string {
  const s = stats;
  const d = WEAPONS[w.key];
  const bits = [`${Math.round(s.dmg)} dmg${s.pellets > 1 ? ` ×${s.pellets}` : ''}${s.sky > 1 ? ` ×${s.sky} strikes` : ''}`, `${s.rate.toFixed(2)}/s`, `range ${Math.round(s.range)}`];
  if (s.splash) bits.push(`blast ${s.splash.toFixed(1)}`);
  if (s.chain) bits.push(`chains ${s.chain}`);
  if (s.pierce) bits.push(s.pierce >= 50 ? 'pierces all' : `pierce ${s.pierce}`);
  if (d.jets) bits.push(`${d.jets} jets`);
  return bits.join(' · ');
}

function mechanics(w: WeaponItem): string[] {
  const d = WEAPONS[w.key];
  const s = weaponStats(w);
  const out: string[] = [];
  if (d.arc) out.push('Lobbed over walls');
  if (s.homing) out.push('Homing');
  if (d.pd) out.push('Shoots down shells and missiles');
  if (s.burn) out.push(`Burns ${Math.round(s.burn)}/s`);
  if (s.slow) out.push(`Slows ${Math.round(s.slow * 100)}%`);
  if (s.stun) out.push(`${s.stun >= 1 ? 'Roots' : `${Math.round(s.stun * 100)}% stun`} ${s.stunTime.toFixed(1)}s`);
  if (d.pool) out.push(`Leaves ${d.pool === 'chrono' ? 'a time field' : d.pool === 'acid' ? 'acid pools' : d.pool === 'fire' ? 'burning ground' : d.pool}`);
  if (s.split) out.push(`Bursts into ${s.split} fragments`);
  if (d.pull) out.push('Gravity well');
  if (s.ramp) out.push(`Ramps up to +${Math.round(s.ramp * 100)}%`);
  if (d.twin) out.push(`Twin death-ray: ${Math.round(s.twinDmg)} dmg × ${s.twinRate.toFixed(1)}/s`);
  if (s.sky) out.push(`Strikes from the sky ×${s.sky}`);
  if (s.knock) out.push('Knockback');
  if (d.execute) out.push('Executes under 20% health');
  if (s.lifesteal) out.push(`Heals ${Math.round(s.lifesteal * 100)}% of damage`);
  if (d.jets) out.push(`Launches up to ${d.jets} mini fighter jets`);
  for (const sp of s.specials) out.push(`<b>${SPECIAL_INFO[sp].name}</b>`);
  return out;
}

function mountedOn(g: Game, uid: number): ModuleInst | undefined {
  return g.player.modules.find((m) => m.weapon?.uid === uid);
}

export function renderArsenal(ctx: PanelCtx): void {
  if (ctx.tab === 'codex') return renderCodex(ctx);
  const g = ctx.app.game;
  const p = g.player;
  const wrap = h('div', 'arsenal-wrap');
  const list = h('div', 'ars-list');
  // Mounted weapons and empty hardpoints.
  list.appendChild(h('div', 'cat', `MOUNTED <small>${clickWord()} to open</small>`));
  const hps = p.hardpoints();
  if (!st.uid && !st.hp) {
    const first = hps.find((m) => m.weapon);
    if (first?.weapon) st.uid = first.weapon.uid;
  }
  if (st.uid && !findWeapon(g, st.uid)) st.uid = 0;
  for (const m of hps) {
    const size = MODULES[m.key].fixed ? MODULES[m.key].name.toLowerCase() : MODULES[m.key].hardpoint!;
    const w = m.weapon;
    const on = w ? st.uid === w.uid : st.hp === m.id;
    const el = h('div', `ars-item ${on ? 'on' : ''} ${w ? '' : 'empty'}`);
    if (w) {
      el.style.borderLeftColor = RARITIES[w.rarity].color;
      el.innerHTML = `<img src="${weaponIcon(w.key, w.rarity)}"><div><div>${weaponTitle(w)} ${g.forgeJob?.uid === w.uid ? '<span class="chip forge">FORGING</span>' : ''}</div>${starsHTML(w)} <small class="d">${size} · DPS ${weaponScore(w)}</small></div>`;
    } else el.innerHTML = `<div class="noimg">+</div><div><i>Empty ${size} hardpoint</i><br><small class="d">${clickWord()} to mount a weapon</small></div>`;
    el.addEventListener('click', () => {
      if (w) selectArsenalWeapon(w.uid);
      else selectArsenalHardpoint(m.id);
      ctx.rerender();
    });
    list.appendChild(el);
  }
  if (!hps.length) list.appendChild(h('div', 'hint', 'No turret mounts yet: build Light / Medium / Heavy Turret Mounts in BASE (B) > Shop.'));
  list.appendChild(h('div', 'cat', `SPARE (${g.armory.length})`));
  const spare = [...g.armory].sort((a, b) => b.rarity - a.rarity || weaponScore(b) - weaponScore(a));
  for (const w of spare) {
    const el = h('div', `ars-item ${st.uid === w.uid ? 'on' : ''}`);
    el.style.borderLeftColor = RARITIES[w.rarity].color;
    el.innerHTML = `<img src="${weaponIcon(w.key, w.rarity)}"><div><div>${weaponTitle(w)} ${g.forgeJob?.uid === w.uid ? '<span class="chip forge">FORGING</span>' : ''}</div>${starsHTML(w)} <small class="d">${WEAPONS[w.key].size} · DPS ${weaponScore(w)}</small></div>`;
    el.addEventListener('click', () => {
      selectArsenalWeapon(w.uid);
      ctx.rerender();
    });
    list.appendChild(el);
  }
  if (!spare.length) list.appendChild(h('div', 'hint', 'No spare weapons. Loot them, or build them in the Codex tab.'));
  const detail = h('div', 'ars-detail');
  const w = st.uid ? findWeapon(g, st.uid) : null;
  if (w) renderWeapon(ctx, detail, w);
  else if (st.hp) renderEmptyHardpoint(ctx, detail, st.hp);
  else detail.appendChild(h('div', 'hint', 'Pick a weapon on the left.'));
  wrap.append(list, detail);
  ctx.body.appendChild(wrap);
}

function renderEmptyHardpoint(ctx: PanelCtx, box: HTMLElement, hpId: number): void {
  const g = ctx.app.game;
  const m = g.player.moduleById(hpId);
  if (!m) return;
  const md = MODULES[m.key];
  const size = (md.mounts ?? [md.hardpoint!]).join(' or ');
  box.appendChild(h('div', 'ars-head', `<div><div class="t">Empty ${esc(md.fixed ? md.name : `${size} hardpoint`).toUpperCase()}</div><div class="d">Pick a ${size} weapon to mount.</div></div>`));
  const fits = g.armory.filter((w) => canMount(md, WEAPONS[w.key].size)).sort((a, b) => weaponScore(b) - weaponScore(a));
  for (const w of fits) {
    const el = h('div', 'ars-item');
    el.innerHTML = `<img src="${weaponIcon(w.key, w.rarity)}"><div><div>${weaponTitle(w)}</div>${starsHTML(w)} <small class="d">${weaponSummary(w)}</small></div>`;
    el.appendChild(button('Mount', () => {
      const r = mountWeapon(g, m.id, w.uid);
      ctx.msg(r.msg ?? '', r.ok);
      if (r.ok) selectArsenalWeapon(w.uid);
      ctx.rerender();
    }, 'primary small'));
    box.appendChild(el);
  }
  if (!fits.length) box.appendChild(h('div', 'hint', `No spare ${size} weapons. Build one in the Codex tab, or loot one.`));
  box.appendChild(button('Open Codex & Workshop', () => ctx.setTab('codex')));
}

function renderWeapon(ctx: PanelCtx, box: HTMLElement, w: WeaponItem): void {
  const g = ctx.app.game;
  const p = g.player;
  const d = WEAPONS[w.key];
  const mount = mountedOn(g, w.uid);
  const s = mount?.stats ?? weaponStats(w);
  const fam = FAMILY_INFO[d.family];
  box.appendChild(h('div', 'ars-head', `<img class="big" src="${weaponIcon(w.key, w.rarity)}"><div><div class="t" style="color:${RARITIES[w.rarity].color}">${esc(d.name)}</div><div class="stars-big">${starsHTML(w)} <span style="color:${RARITIES[w.rarity].color}">${RARITIES[w.rarity].name}</span></div><div class="d"><span style="color:${fam.color}">${fam.name}</span> · ${d.size} · ${mount ? `mounted on ${esc(MODULES[mount.key].name)}` : 'in the armory'}${d.exclusive ? ' · <b class="y">EXCLUSIVE</b>' : ''}</div></div>`));
  box.appendChild(h('div', 'd', esc(d.desc)));
  const mech = mechanics(w);
  box.appendChild(h('div', 'ars-stats', `
    <span>Damage</span><b>${Math.round(s.dmg)}${s.pellets > 1 ? ` × ${s.pellets}` : ''}</b>
    <span>Fire rate</span><b>${s.rate.toFixed(2)}/s</b>
    <span>Range</span><b>${Math.round(s.range)}${s.minRange ? ` (min ${s.minRange})` : ''}</b>
    <span>Crit</span><b>${Math.round(s.crit * 100)}%</b>
    <span>DPS score</span><b class="y">${weaponScore(w)}</b>
    <span>Power</span><b>${s.power.toFixed(1)}</b>`));
  if (mech.length) box.appendChild(h('div', 'ars-mech', mech.map((m) => `<span>${m}</span>`).join('')));
  if (w.affixes.length) box.appendChild(h('div', 'affix', `Traits: ${w.affixes.map((a) => `<span title="${esc(AFFIXES[a]?.desc ?? '')}">${esc(AFFIXES[a]?.name ?? a)}</span>`).join(' · ')}`));

  /* ---- Forge ---- */
  const forge = h('div', 'ars-box');
  forge.appendChild(h('div', 'bt', `FORGE <small>raise stars: stronger stats, +1 trait slot at 3★/4★/6★, +1 tree point per star</small>`));
  const job = g.forgeJob;
  if (job && job.uid === w.uid) {
    const pct = Math.min(100, (job.t / job.total) * 100);
    const sp = forgeSpeed(g);
    forge.appendChild(h('div', 'prog', `<div class="bar"><div style="width:${pct}%"></div></div><span>Forging to ${job.to + 1}★ · ${sp > 0 ? secs((job.total - job.t) / sp) : 'paused (no Forge)'} left</span>`));
    forge.appendChild(button('Cancel (refund)', () => {
      const r = cancelForge(g);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'small'));
  } else if (w.rarity >= 5) {
    forge.appendChild(h('div', 'good', '6★ MYTHIC: the strongest it can be.'));
  } else {
    const block = starBlock(w, g.tech, p.stats.forge > 0);
    const to = nextRarity(w);
    const cost = starCost(w, to);
    const sp = forgeSpeed(g) || 1;
    forge.appendChild(h('div', 'row', `<span>Next: <b style="color:${RARITIES[to].color}">${to + 1}★ ${RARITIES[to].name}</b> (×${(RARITIES[to].mult / RARITIES[w.rarity].mult).toFixed(2)} damage)</span> ${costHTML(cost, [p.cargo])} <span class="d">⏱ ${secs(STAR_TIME[to] / sp)}</span>`));
    if (block) forge.appendChild(h('div', 'bad small', esc(block)));
    else if (job) forge.appendChild(h('div', 'd', `The Forge is busy with ${esc(WEAPONS[findWeapon(g, job.uid)?.key ?? '']?.name ?? 'another weapon')}.`));
    else forge.appendChild(button(`Forge to ${to + 1}★`, () => {
      const r = startForge(g, w.uid);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'primary'));
  }
  box.appendChild(forge);

  /* ---- Upgrade tree ---- */
  const tree = weaponTree(d.family);
  const pts = treePoints(w);
  const used = (w.tree ?? []).length;
  const tb = h('div', 'ars-box');
  tb.appendChild(h('div', 'bt', `UPGRADE TREE <small>${used}/${pts} points used · 1 point per star · ${clickWord()} a node to install it</small>`));
  const grid = h('div', 'wtree');
  TREE_BRANCHES.forEach((br, bi) => {
    const col = h('div', 'wt-col');
    col.appendChild(h('div', 'wt-head', `<span style="color:${br.color}">${br.name}</span>`));
    tree[bi].forEach((n, ti) => {
      const taken = (w.tree ?? []).includes(n.id);
      const can = canTakeNode(w, n.id);
      const el = h('div', `wt-node ${taken ? 'taken' : can ? 'avail' : 'locked'} ${ti === 2 ? 'cap' : ''}`);
      el.style.borderColor = taken ? br.color : '';
      el.innerHTML = `<b>${esc(n.name)}</b><div class="d">${esc(n.desc)}</div>${ti === 2 ? '<span class="chip">CAPSTONE</span>' : ''}`;
      el.addEventListener('click', () => {
        if (taken) return;
        const r = takeTreeNode(g, w.uid, n.id);
        ctx.msg(r.msg ?? '', r.ok);
        ctx.rerender();
      });
      col.appendChild(el);
    });
    grid.appendChild(col);
  });
  tb.appendChild(grid);
  if (used) {
    const rb = button(`Reset tree`, () => {
      const r = respecTree(g, w.uid);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'small');
    tooltip(rb, () => `Refund all points for ${costHTML(respecCost(w), [p.cargo])}`);
    tb.appendChild(rb);
  }
  box.appendChild(tb);

  /* ---- Mount / scrap ---- */
  const mb = h('div', 'ars-box');
  mb.appendChild(h('div', 'bt', 'MOUNT'));
  if (mount) {
    const row = h('div', 'row');
    row.appendChild(button(`Fire mode: ${mount.mode === 'auto' ? 'AUTO' : 'MANUAL'}`, () => {
      mount.mode = mount.mode === 'auto' ? 'manual' : 'auto';
      ctx.rerender();
    }));
    row.appendChild(button('Unmount to armory', () => {
      const r = unmountWeapon(g, mount.id);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }));
    mb.appendChild(row);
  } else {
    const spots = p.hardpoints().filter((m) => canMount(MODULES[m.key], d.size));
    if (!spots.length) mb.appendChild(h('div', 'd', `Needs a ${d.size} mount: ${d.size === 'heavy' ? 'a main battery or a Heavy Turret Mount' : 'a weapon pad or a turret mount'} (BASE > Shop).`));
    const row = h('div', 'row wrap');
    spots.forEach((m, i) => {
      const cur = m.weapon;
      const b = button(cur ? `Swap with ${esc(WEAPONS[cur.key].name)} (${cur.rarity + 1}★)` : `Mount on empty ${d.size} #${i + 1}`, () => {
        const r = mountWeapon(g, m.id, w.uid);
        ctx.msg(r.msg ?? '', r.ok);
        ctx.rerender();
      }, cur ? '' : 'primary');
      row.appendChild(b);
    });
    mb.appendChild(row);
    const sv = scrapValue(w.rarity);
    const sb = button('Scrap', () => {
      const r = scrapWeapon(g, w.uid);
      ctx.msg(r.msg ?? '', r.ok);
      if (r.ok) st.uid = 0;
      ctx.rerender();
    }, 'danger small');
    tooltip(sb, () => `Break down for ${Object.entries(sv).map(([k, n]) => `${n} ${getItem(k).name}`).join(', ')}`);
    mb.appendChild(sb);
  }
  box.appendChild(mb);
}

/* ---------------------------------------------------------------------- */
/* Codex: every weapon, how to get it, and building 1★ copies             */
/* ---------------------------------------------------------------------- */

function renderCodex(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const filters = h('div', 'row wrap');
  for (const f of ['all', ...Object.keys(FAMILY_INFO)] as (WeaponFamily | 'all')[]) {
    filters.appendChild(button(f === 'all' ? 'All' : FAMILY_INFO[f].name, () => {
      st.fam = f;
      ctx.rerender();
    }, `small ${st.fam === f ? 'on' : ''}`));
  }
  ctx.body.appendChild(filters);
  ctx.body.appendChild(h('div', 'hint', `Build 1★ copies at a Workshop ${p.stats.workshop ? '<span class="good">(you have one)</span>' : '<span class="bad">(build a Workshop in BASE)</span>'}, then forge them to more stars. Commander levels unlock stronger, stranger weapons.`));
  const grid = h('div', 'codex-grid');
  const owned = new Map<string, number>();
  for (const w of [...g.armory, ...p.weapons().map((m) => m.weapon!)]) owned.set(w.key, (owned.get(w.key) ?? 0) + 1);
  const lvlOf = (k: string | undefined): number => (k && TECH_BY_ID.has(k) ? techLevel(k) : 1);
  const list = WEAPON_LIST.filter((d) => st.fam === 'all' || d.family === st.fam).slice().sort((a, b) => (a.exclusive ? 99 : lvlOf(a.tech)) - (b.exclusive ? 99 : lvlOf(b.tech)));
  for (const d of list) {
    const node = d.tech ? TECH_BY_ID.get(d.tech) : undefined;
    const ok = weaponCraftable(g.tech, d.key);
    const n = owned.get(d.key) ?? 0;
    const el = h('div', `codex-item ${ok ? '' : 'locked'} ${d.exclusive ? 'excl' : ''}`);
    const how = d.exclusive
      ? '<span class="y">Rune Chests only (5★+)</span>'
      : ok
        ? costHTML(d.cost, [p.cargo])
        : `🔒 Commander level ${lvlOf(d.tech)} <small>(${esc(node?.name ?? '')})</small>`;
    el.innerHTML = `<img src="${weaponIcon(d.key, d.exclusive ? 4 : 0)}"><div><b>${esc(d.name)}</b> <small>${d.size}${n ? ` · <span class="good">own ${n}</span>` : ''}</small><div class="d">${esc(d.desc)}</div><div>${how}</div></div>`;
    tooltip(el, () => `<h4>${esc(d.name)}</h4><div>${esc(d.desc)}</div><div class="d">${FAMILY_INFO[d.family].name} · ${d.size} · base ${d.dmg} dmg · ${d.rate}/s · range ${d.range}</div>`);
    if (ok) el.appendChild(button('Build 1★', () => {
      const r = craftWeapon(g, d.key);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'small primary'));
    else if (node && !d.exclusive) el.appendChild(button('Level Road', () => ctx.app.panels.open('progress'), 'small'));
    grid.appendChild(el);
  }
  ctx.body.appendChild(grid);
}
