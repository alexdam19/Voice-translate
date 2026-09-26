import { getItem, DRIVE_ITEM } from '../shared/items';
import { RARITIES } from '../shared/rarity';
import type { DriveKey } from '../shared/types';
import { AFFIXES, WEAPONS, weaponScore, weaponStats, type WeaponItem } from '../shared/weapons';
import { ZONES } from '../shared/zones';
import { ZONE } from '../shared/map';
import { buildModule, craftWeapon, installDrive, mountWeapon, moveModule, removeModule, scrapValue, scrapWeapon, setUltimate, unmountWeapon, upgradeChassis, upgradeModule } from '../game/actions';
import { ACTIVES, ULTIMATES } from '../game/arsenal';
import { CATEGORIES, chassisDef, DRIVE_INFO, levelCost, levelMult, maxModuleLevel, MODULE_LIST, MODULES, UPGRADE_CHASSIS, type ModuleDef } from '../game/defs';
import { BRANCHES, moduleUnlocked, TECH_BY_ID, TIER_NAMES, weaponCraftable } from '../game/tech';
import { selectArsenalHardpoint, selectArsenalWeapon } from './arsenalPanel';
import { itemIcon, moduleIcon, weaponIcon } from '../render/icons';
import { MODULE_COLOR } from '../render/textures';
import { button, costHTML, esc, h, tooltip } from './dom';
import type { PanelCtx } from './panels';

const state = { build: '' as string, selected: -1, moving: -1, armorySel: -1, weaponSel: -1 };

function moduleStats(d: ModuleDef, lvl = 1): string {
  const f = levelMult(lvl);
  const n = (v: number): string => String(Math.round(v * f * 10) / 10);
  const s: string[] = [];
  if (d.power) s.push(`+${n(d.power)} power`);
  if (d.use) s.push(`-${d.use} power`);
  if (d.thrust) s.push(`+${n(d.thrust)} thrust`);
  if (d.crew) s.push(`+${d.crew + lvl - 1} crew bunks`);
  if (d.cargo) s.push(`+${Math.round(d.cargo * f)} cargo`);
  if (d.hp) s.push(`+${n(d.hp)} hull`);
  if (d.armor) s.push(`+${Math.round(d.armor * f * 1000) / 10}% armor`);
  if (d.shield) s.push(`+${n(d.shield)} shield`);
  if (d.repair) s.push(`+${n(d.repair)} repair/s`);
  if (d.vision) s.push(`+${n(d.vision)} vision`);
  if (d.drill) s.push(`drill tier ${d.drill}`);
  if (d.protects) s.push(`protects: ${d.protects.join(', ')}`);
  if (d.hardpoint) s.push(`mounts 1 ${d.hardpoint} weapon`);
  if (d.lab) s.push(`+${n(d.lab)} research speed`);
  if (d.forge) s.push(`forge speed ×${f}`);
  if (d.training) s.push(`+${n(d.training)} crew XP/s`);
  if (d.sanctum) s.push(`arcane weapons +${10 * lvl}% damage`);
  if (d.depot) s.push(`+${Math.round(d.depot * f * 100)}% fire rate (ballistic/artillery/missile)`);
  if (d.uplink) s.push(`ultimate charges +${Math.round(d.uplink * f * 100)}% faster`);
  if (d.active) s.push(`ACTIVE: ${ACTIVES[d.active].name}${lvl > 1 ? ` (+${Math.round((f - 1) * 100)}% power)` : ''}`);
  if (d.ult) s.push(`ULTIMATE: ${ULTIMATES[d.ult].name}${lvl > 1 ? ` (+${Math.round((f - 1) * 100)}% power)` : ''}`);
  return s.join(' · ');
}

function lockText(d: ModuleDef): string {
  const n = d.tech ? TECH_BY_ID.get(d.tech) : undefined;
  if (!n) return '';
  return `🔒 ${esc(n.name)} <small>(${esc(BRANCHES.find((b) => b.key === n.branch)?.name ?? '')} ${TIER_NAMES[n.tier]})</small>`;
}

export function weaponLine(w: WeaponItem): string {
  const d = WEAPONS[w.key];
  const s = weaponStats(w);
  const col = RARITIES[w.rarity].color;
  return `<b style="color:${col}">${RARITIES[w.rarity].name} ${esc(d.name)}</b> <small>${d.size}</small><br><span class="d">${Math.round(s.dmg)} dmg${s.pellets > 1 ? ` ×${s.pellets}` : ''} · ${s.rate.toFixed(2)}/s · range ${Math.round(s.range)}${s.splash ? ` · blast ${s.splash.toFixed(1)}` : ''}${s.chain ? ` · chains ${s.chain}` : ''}${s.pierce ? ` · pierce ${s.pierce}` : ''} · score ${weaponScore(w)}</span>${w.affixes.length ? `<br><span class="affix">${w.affixes.map((a) => AFFIXES[a].name).join(' · ')}</span>` : ''}`;
}

export function renderBase(ctx: PanelCtx): void {
  if (ctx.tab === 'armory') return renderArmory(ctx);
  if (ctx.tab === 'chassis') return renderChassis(ctx);
  renderDeck(ctx);
}

/** Weapon mounting now lives in the Arsenal panel. */
function openArsenal(ctx: PanelCtx, hpId: number, uid?: number): void {
  if (uid) selectArsenalWeapon(uid);
  else selectArsenalHardpoint(hpId);
  ctx.app.panels.open('arsenal', 'weapons');
}

/* ---------------------------------------------------------------------- */
/* Deck builder                                                            */
/* ---------------------------------------------------------------------- */

function renderDeck(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const wrap = h('div', 'deck-wrap');
  // Palette
  const pal = h('div', 'palette');
  pal.appendChild(h('div', 'hint', 'Pick a facility, then click a free spot on the deck. The front of the tank is at the top.'));
  for (const cat of CATEGORIES) {
    const mods = MODULE_LIST.filter((d) => d.cat === cat.key && !d.required);
    if (!mods.length) continue;
    pal.appendChild(h('div', 'cat', `<span style="color:${cat.color}">${cat.name}</span>`));
    for (const d of mods) {
      const unlocked = moduleUnlocked(g.tech, d.key);
      const owned = d.unique && p.modules.some((m) => m.key === d.key);
      const afford = g.canPay(d.cost);
      const b = h('div', `pal-item ${state.build === d.key ? 'on' : ''} ${!unlocked || owned ? 'locked' : ''} ${afford ? '' : 'poor'}`);
      b.innerHTML = `<img src="${moduleIcon(d.key)}"><div><b>${esc(d.name)}</b> <small>${d.w}×${d.h}</small><div class="st">${unlocked ? (owned ? 'Built (only one allowed)' : costHTML(d.cost, [p.cargo])) : lockText(d)}</div></div>`;
      tooltip(b, () => `<h4>${esc(d.name)}</h4><div>${esc(d.desc)}</div><div class="d">${moduleStats(d)}</div>`);
      b.addEventListener('click', () => {
        if (!unlocked) {
          ctx.msg(`Research ${TECH_BY_ID.get(d.tech!)?.name} first (RESEARCH, T).`, false);
          return;
        }
        state.build = state.build === d.key ? '' : d.key;
        state.selected = -1;
        state.moving = -1;
        ctx.rerender();
      });
      pal.appendChild(b);
    }
  }
  // Deck grid
  const deckCol = h('div', 'deck-col');
  const cell = Math.max(18, Math.min(34, Math.floor(Math.min(460, window.innerHeight * 0.62) / p.rows)));
  const grid = h('div', 'deck-grid');
  grid.style.width = `${p.cols * cell}px`;
  grid.style.height = `${p.rows * cell}px`;
  grid.style.setProperty('--cell', `${cell}px`);
  const ghost = h('div', 'ghost');
  grid.appendChild(ghost);
  for (const m of p.modules) {
    const d = MODULES[m.key];
    const el = h('div', `mod ${state.selected === m.id ? 'sel' : ''}`);
    el.style.left = `${m.cx * cell}px`;
    el.style.top = `${m.cy * cell}px`;
    el.style.width = `${d.w * cell}px`;
    el.style.height = `${d.h * cell}px`;
    el.style.borderColor = MODULE_COLOR[m.key] ?? '#90a4ae';
    el.style.backgroundImage = `url(${moduleIcon(m.key)})`;
    if (m.weapon) {
      const wi = h('img', 'wimg');
      wi.src = weaponIcon(m.weapon.key, m.weapon.rarity);
      el.appendChild(wi);
    } else if (d.hardpoint) el.appendChild(h('span', 'empty-hp', 'EMPTY'));
    if (d.w * d.h >= 4) el.appendChild(h('span', 'lbl', esc(d.name)));
    if (m.lvl > 1) el.appendChild(h('span', 'lvl', `L${m.lvl}`));
    tooltip(el, () => `<h4>${esc(d.name)}${m.lvl > 1 ? ` L${m.lvl}` : ''}</h4><div class="d">${moduleStats(d, m.lvl)}</div>${m.weapon ? `<div>${weaponLine(m.weapon)}</div>` : ''}<div class="d">Click to select</div>`);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.build) return;
      state.selected = state.selected === m.id ? -1 : m.id;
      state.moving = -1;
      ctx.rerender();
    });
    grid.appendChild(el);
  }
  const cellFrom = (e: MouseEvent): [number, number] => {
    const r = grid.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / cell), Math.floor((e.clientY - r.top) / cell)];
  };
  const placing = (): string => state.build || (state.moving >= 0 ? p.moduleById(state.moving)?.key ?? '' : '');
  grid.addEventListener('mousemove', (e) => {
    const key = placing();
    if (!key) {
      ghost.style.display = 'none';
      return;
    }
    const d = MODULES[key];
    let [cx, cy] = cellFrom(e);
    cx = Math.max(0, Math.min(p.cols - d.w, cx - Math.floor((d.w - 1) / 2)));
    cy = Math.max(0, Math.min(p.rows - d.h, cy - Math.floor((d.h - 1) / 2)));
    const ok = p.canPlace(key, cx, cy, state.moving >= 0 ? state.moving : -1);
    ghost.style.display = 'block';
    ghost.style.left = `${cx * cell}px`;
    ghost.style.top = `${cy * cell}px`;
    ghost.style.width = `${d.w * cell}px`;
    ghost.style.height = `${d.h * cell}px`;
    ghost.className = `ghost ${ok ? 'ok' : 'bad'}`;
    ghost.dataset.cx = String(cx);
    ghost.dataset.cy = String(cy);
  });
  grid.addEventListener('mouseleave', () => (ghost.style.display = 'none'));
  grid.addEventListener('click', () => {
    const key = placing();
    if (!key || ghost.style.display === 'none') return;
    const cx = Number(ghost.dataset.cx), cy = Number(ghost.dataset.cy);
    if (state.moving >= 0) {
      const r = moveModule(g, state.moving, cx, cy);
      if (r.ok) state.moving = -1;
      ctx.msg(r.ok ? 'Moved.' : r.msg, r.ok);
    } else {
      const r = buildModule(g, key, cx, cy);
      ctx.msg(r.msg ?? '', r.ok);
      if (r.ok && MODULES[key].unique) state.build = '';
    }
    ctx.rerender();
  });
  const front = h('div', 'deck-front', '▲ FRONT');
  deckCol.append(front, grid);
  // Info column
  const info = h('div', 'deck-info');
  const s = p.stats;
  info.innerHTML = `<div class="statgrid">
    <span>Hull</span><b>${s.maxHp}</b><span>Armor</span><b>${Math.round(s.armor * 100)}%</b>
    <span>Power</span><b class="${s.powerRatio < 1 ? 'bad' : ''}">${s.power.toFixed(0)} / ${s.use.toFixed(0)} used</b>
    <span>Speed</span><b>${s.topSpeed.toFixed(1)}</b><span>Crew bunks</span><b>${g.mainCrew().length} / ${g.crewCap()}</b>
    <span>Cargo</span><b>${s.cargo} slots</b><span>Drill</span><b>Mk${s.drill}</b><span>Vision</span><b>${Math.round(s.vision)}</b>
    <span>Shield</span><b>${s.shield}</b><span>Repair</span><b>${s.repair.toFixed(1)}/s</b>
    <span>Protected</span><b>${[...s.protects].join(', ') || 'none'}</b>
  </div>`;
  if (s.powerRatio < 1) info.appendChild(h('div', 'warn', 'Not enough power: weapons fire slower and the tank drives slower. Build a Reactor.'));
  const sel = state.selected >= 0 ? p.moduleById(state.selected) : undefined;
  if (sel) {
    const d = MODULES[sel.key];
    const maxL = maxModuleLevel(d);
    const card = h('div', 'selcard', `<div class="sh"><img src="${moduleIcon(sel.key)}"><b>${esc(d.name)}</b>${maxL > 1 ? ` <span class="lvlpill">L${sel.lvl}/${maxL}</span>` : ''}</div><div class="d">${esc(d.desc)}</div><div class="d">${moduleStats(d, sel.lvl)}</div>`);
    if (maxL > 1) {
      const lr = h('div', 'lvlrow');
      if (sel.lvl < maxL) {
        const cost = levelCost(d, sel.lvl);
        lr.innerHTML = `<div class="d">Level ${sel.lvl + 1}: ${moduleStats(d, sel.lvl + 1)}</div><div>${costHTML(cost, [p.cargo])}</div>`;
        lr.appendChild(button(`⬆ Upgrade to L${sel.lvl + 1}`, () => {
          const r = upgradeModule(g, sel.id);
          ctx.msg(r.msg ?? '', r.ok);
          ctx.rerender();
        }, 'primary'));
      } else lr.innerHTML = '<div class="good">Max level</div>';
      card.appendChild(lr);
    }
    if (d.active) {
      const slot = g.activeSlots.indexOf(sel.id);
      card.appendChild(h('div', 'd', slot >= 0 ? `Bound to key <kbd>${slot + 1}</kbd>. Change slots in ABILITIES (K).` : 'Not on a key: all four slots are full. Rebind in ABILITIES (K).'));
    }
    if (d.ult) {
      if (g.ultModule === sel.id) card.appendChild(h('div', 'good', `Armed on <kbd>R</kbd> · ${Math.floor(g.ultCharge * 100)}% charged`));
      else card.appendChild(button('Arm this ultimate (R)', () => {
        const r = setUltimate(g, sel.id);
        ctx.msg(r.msg ?? '', r.ok);
        ctx.rerender();
      }, 'primary'));
    }
    if (d.hardpoint) {
      card.appendChild(h('div', 'wline', sel.weapon ? weaponLine(sel.weapon) : '<i>No weapon mounted.</i>'));
      const row = h('div', 'row');
      row.appendChild(button(sel.weapon ? 'Open in Arsenal' : 'Mount weapon', () => openArsenal(ctx, sel.id, sel.weapon?.uid), 'primary'));
      if (sel.weapon) {
        row.appendChild(button(`Mode: ${sel.mode === 'auto' ? 'AUTO' : 'MANUAL'}`, () => {
          sel.mode = sel.mode === 'auto' ? 'manual' : 'auto';
          ctx.rerender();
        }));
        row.appendChild(button('Unmount', () => {
          const r = unmountWeapon(g, sel.id);
          ctx.msg(r.msg ?? '', r.ok);
          ctx.rerender();
        }));
      }
      card.appendChild(row);
    }
    if (!d.required) {
      const row = h('div', 'row');
      row.appendChild(button('Move', () => {
        state.moving = sel.id;
        ctx.msg('Click a new spot on the deck.');
        ctx.rerender();
      }));
      row.appendChild(button('Remove (50% refund)', () => {
        const r = removeModule(g, sel.id);
        ctx.msg(r.msg ?? '', r.ok);
        if (r.ok) state.selected = -1;
        ctx.rerender();
      }, 'danger'));
      card.appendChild(row);
    }
    info.appendChild(card);
  } else if (state.build) {
    const d = MODULES[state.build];
    info.appendChild(h('div', 'selcard', `<div class="sh"><img src="${moduleIcon(d.key)}"><b>Placing: ${esc(d.name)}</b></div><div class="d">${esc(d.desc)}</div><div class="d">${moduleStats(d)}</div><div>${costHTML(d.cost, [p.cargo])}</div><div class="d">Click the deck to place. Click the palette entry again to cancel.</div>`));
  } else {
    info.appendChild(h('div', 'hint', 'Tip: click a facility on the deck to level it up (L1-L3), move it, remove it or mount a weapon. Fill the deck with barracks, living quarters, science labs, a forge and your actives.'));
  }
  wrap.append(pal, deckCol, info);
  ctx.body.appendChild(wrap);
}

/* ---------------------------------------------------------------------- */
/* Armory                                                                  */
/* ---------------------------------------------------------------------- */

function renderArmory(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const wrap = h('div', 'armory-wrap');
  const left = h('div', 'hp-list');
  left.appendChild(h('div', 'cat', 'HARDPOINTS <small>(click one, then pick a weapon)</small>'));
  const hps = p.hardpoints();
  if (state.armorySel < 0 || !p.moduleById(state.armorySel)) state.armorySel = hps[0]?.id ?? -1;
  for (const m of hps) {
    const d = MODULES[m.key];
    const el = h('div', `hp-item ${state.armorySel === m.id ? 'on' : ''}`);
    el.innerHTML = `${m.weapon ? `<img src="${weaponIcon(m.weapon.key, m.weapon.rarity)}">` : '<div class="noimg">—</div>'}<div><small>${esc(d.name)}</small><br>${m.weapon ? weaponLine(m.weapon) : '<i>empty</i>'}</div>`;
    el.addEventListener('click', () => {
      state.armorySel = m.id;
      ctx.rerender();
    });
    left.appendChild(el);
  }
  if (!hps.length) left.appendChild(h('div', 'hint', 'No hardpoints. Build Light / Medium / Heavy Hardpoints on the Deck.'));
  const sel = p.moduleById(state.armorySel);
  const size = sel ? MODULES[sel.key].hardpoint : undefined;
  const right = h('div', 'wlist');
  right.appendChild(h('div', 'cat', `SPARE WEAPONS (${g.armory.length}) <small>sorted by strength · rarity: <span class="r0">Common</span> <span class="r1">Uncommon</span> <span class="r2">Rare</span> <span class="r3">Epic</span> <span class="r4">Legendary</span></small>`));
  const list = [...g.armory].sort((a, b) => weaponScore(b) - weaponScore(a));
  for (const w of list) {
    const d = WEAPONS[w.key];
    const fits = size === d.size;
    const el = h('div', `w-item ${fits ? 'fits' : 'nofit'}`);
    el.style.borderColor = RARITIES[w.rarity].color;
    el.innerHTML = `<img src="${weaponIcon(w.key, w.rarity)}"><div class="wl">${weaponLine(w)}<div class="d">${esc(d.desc)}</div></div>`;
    const btns = h('div', 'wb');
    if (sel && fits) btns.appendChild(button('Mount', () => {
      const r = mountWeapon(g, sel.id, w.uid);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'primary'));
    else if (sel) btns.appendChild(h('small', 'd', `needs ${d.size}`));
    const sv = scrapValue(w.rarity);
    const sb = button('Scrap', () => {
      const r = scrapWeapon(g, w.uid);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'danger small');
    tooltip(sb, () => `Break down for ${Object.entries(sv).map(([k, n]) => `${n} ${getItem(k).name}`).join(', ')}`);
    btns.appendChild(sb);
    el.appendChild(btns);
    right.appendChild(el);
  }
  if (!list.length) right.appendChild(h('div', 'hint', 'No spare weapons. Loot them from raider tanks, outposts, loot areas and chests, or build Common ones below.'));
  // Crafting
  right.appendChild(h('div', 'cat', `BUILD WEAPONS ${p.stats.workshop ? '' : '<small class="bad">(needs a Workshop on your deck)</small>'}`));
  const craft = h('div', 'craft-grid');
  for (const d of Object.values(WEAPONS)) {
    if (d.exclusive) continue;
    const ok = weaponCraftable(g.tech, d.key);
    const el = h('div', `craft-item ${ok ? '' : 'locked'}`);
    el.innerHTML = `<img src="${weaponIcon(d.key, 0)}"><div><b>${esc(d.name)}</b> <small>${d.size}</small><br>${ok ? costHTML(d.cost, [p.cargo]) : `<small>🔒 ${esc(TECH_BY_ID.get(d.tech!)?.name ?? '')}</small>`}</div>`;
    tooltip(el, () => `<h4>${esc(d.name)}</h4><div>${esc(d.desc)}</div><div class="d">Builds a Common copy. Rarer versions only drop as loot.</div>`);
    if (ok) el.appendChild(button('Build', () => {
      const r = craftWeapon(g, d.key);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'small'));
    craft.appendChild(el);
  }
  right.appendChild(craft);
  wrap.append(left, right);
  ctx.body.appendChild(wrap);
}

/* ---------------------------------------------------------------------- */
/* Chassis & drive                                                         */
/* ---------------------------------------------------------------------- */

function renderChassis(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const wrap = h('div', 'chassis-wrap');
  const cur = chassisDef(p.chassis);
  const i = UPGRADE_CHASSIS.findIndex((c) => c.key === p.chassis);
  const col = h('div', 'chassis-col');
  col.appendChild(h('div', 'cat', 'HULL'));
  UPGRADE_CHASSIS.forEach((c, k) => {
    const el = h('div', `ch-item ${k < i ? 'done' : k === i ? 'cur' : k === i + 1 ? 'next' : 'later'}`);
    el.innerHTML = `<b>${esc(c.name)}</b> <small>${c.cols}×${c.rows} deck · ${c.hp} base hull</small><div class="d">${esc(c.desc)}</div>`;
    if (k === i + 1) {
      el.innerHTML += `<div>${costHTML(c.cost, [p.cargo])}</div>`;
      el.appendChild(button(`Upgrade to ${c.name}`, () => {
        const r = upgradeChassis(g);
        ctx.msg(r.msg ?? '', r.ok);
        ctx.rerender();
      }, 'primary'));
    } else if (k === i) el.innerHTML += '<div class="good">Current hull</div>';
    col.appendChild(el);
  });
  void cur;
  const drv = h('div', 'chassis-col');
  drv.appendChild(h('div', 'cat', 'DRIVE TRAIN <small>(craft in CARGO > Workshop)</small>'));
  for (const k of ['wheels', 'tracks', 'chains', 'magma', 'hover'] as DriveKey[]) {
    const item = DRIVE_ITEM[k];
    const have = k === 'wheels' || p.cargo.count(item) > 0;
    const el = h('div', `ch-item ${p.drive === k ? 'cur' : have ? 'next' : 'later'}`);
    el.innerHTML = `<img src="${itemIcon(item)}"> <b>${esc(DRIVE_INFO[k].name)}</b><div class="d">${esc(getItem(item).desc)} Best on: ${esc(DRIVE_INFO[k].best)}.</div>`;
    if (p.drive === k) el.innerHTML += '<div class="good">Installed</div>';
    else if (have) el.appendChild(button('Install', () => {
      const r = installDrive(g, k);
      ctx.msg(r.msg ?? '', r.ok);
      ctx.rerender();
    }, 'primary'));
    else el.innerHTML += '<div class="d">Not built yet.</div>';
    drv.appendChild(el);
  }
  const zones = h('div', 'chassis-col');
  zones.appendChild(h('div', 'cat', 'WHAT EACH ZONE NEEDS'));
  for (const z of [ZONE.DUNES, ZONE.GLASS, ZONE.CRYO, ZONE.MAGMA, ZONE.ACID]) {
    const d = ZONES[z];
    const hazOk = !d.hazard || p.stats.protects.has(d.hazard);
    const drvOk = !d.drive || p.drive === d.drive || p.drive === 'hover';
    zones.appendChild(h('div', 'ch-item', `<b style="color:${d.color}">${esc(d.name)}</b><div class="d">${esc(d.need)}</div><div>${d.drive ? `<span class="${drvOk ? 'good' : 'bad'}">${drvOk ? '✔' : '✖'} ${DRIVE_INFO[d.drive].name}</span> ` : ''}${d.protect ? `<span class="${hazOk ? 'good' : 'bad'}">${hazOk ? '✔' : '✖'} ${esc(MODULES[d.protect].name)}</span>` : ''}</div>`));
  }
  wrap.append(col, drv, zones);
  ctx.body.appendChild(wrap);
}
