import { TILE, WORLD_W } from '../shared/constants';
import { canAfford, countAcross, payCost, type Inventory, type Stack } from '../shared/inventory';
import { ALL_ITEMS, getItem } from '../shared/items';
import { HAZARD_INFO } from '../shared/types';
import { ZONES } from '../shared/zones';
import { iconURL } from '../render/icons';
import type { Panel } from '../game/game';
import { RECIPES, STATION_NAMES, type Recipe } from '../game/recipes';
import { CATEGORY_NAMES, CHASSIS, DRIVES, MODULE_LIST, RIG_TILES, TERRAIN_NAMES, type ModuleCategory } from '../game/rigDefs';
import { hireCost, MAX_LEVEL, perkPoints, ROLES, TRAITS, XP_LEVELS, type CrewMember } from '../game/crew';
import { BRANCHES, canResearch, moduleUnlocked, researchCost, TECH, TECH_BY_ID, type TechNode } from '../game/tech';
import { WarzoneClient } from '../game/warzone';
import { button, costHTML, esc, h, itemTooltip, slotEl } from './dom';
import type { UI } from './ui';

type CraftTab = 'all' | 'materials' | 'gear' | 'weapons' | 'supplies' | 'rig' | 'blocks';
const CRAFT_TABS: [CraftTab, string][] = [['all', 'ALL'], ['materials', 'MATERIALS'], ['weapons', 'WEAPONS'], ['gear', 'GEAR'], ['supplies', 'SUPPLIES'], ['rig', 'DRIVE TRAINS'], ['blocks', 'BLOCKS']];

function recipeTab(r: Recipe): CraftTab {
  const k = getItem(r.out).kind;
  if (k === 'material' || k === 'resource') return 'materials';
  if (k === 'weapon' || k === 'throwable') return 'weapons';
  if (k === 'suit' || k === 'gadget' || k === 'tool') return 'gear';
  if (k === 'ammo' || k === 'consumable') return 'supplies';
  if (k === 'drive') return 'rig';
  return 'blocks';
}

const REFRESH_COST = { scrap: 10 };
const RECALL_COST = { scrap: 15 };

export class Panels {
  private el: HTMLDivElement | null = null;
  private kind: Panel = null;
  cursor: Stack | null = null;
  private lootId = -1;
  private key = '';
  private frame = 0;
  private craftTab: CraftTab = 'all';
  private craftSearch = '';
  private buildTab: 'structure' | ModuleCategory = 'structure';
  private mapPan: number | null = null;

  constructor(private ui: UI) {}

  private get g() {
    return this.ui.g;
  }

  /* ---------------- Lifecycle ---------------- */

  open(p: Panel): void {
    if (this.kind === 'inventory' && p !== 'inventory') this.returnCursor();
    this.close(false);
    this.kind = p;
    if (!p) return;
    this.el = h('div', 'panel frame');
    this.ui.root.appendChild(this.el);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.mapPan = null;
    this.render();
  }

  close(resetKind = true): void {
    this.el?.remove();
    this.el = null;
    this.key = '';
    this.ui.showTooltip(null);
    if (resetKind) this.kind = null;
  }

  private returnCursor(): void {
    if (!this.cursor) return;
    const left = this.g.player.inv.add(this.cursor.id, this.cursor.n);
    if (left > 0) this.g.dropItem(this.g.player.cx, this.g.player.cy, { id: this.cursor.id, n: left });
    this.cursor = null;
    this.drawCursor();
  }

  update(): void {
    this.frame++;
    if (!this.el || this.frame % 12 !== 0) return;
    const k = this.contentKey();
    if (k !== this.key) this.render();
  }

  private contentKey(): string {
    const g = this.g;
    const p = g.player;
    switch (this.kind) {
      case 'inventory':
        return JSON.stringify([p.inv.slots, p.secure.slots, p.suit, p.gadget, this.cargo()?.slots ?? null, this.cursor]);
      case 'craft':
      case 'build':
      case 'rig': {
        const invs = g.craftInvs();
        const r = g.playerRig;
        return JSON.stringify([ALL_ITEMS.map((i) => countAcross(invs, i.id)), [...g.stations()], r?.version, r?.crew.length, r?.drive, r?.chassis, g.build]);
      }
      case 'loot':
        return JSON.stringify(g.sim.crates.get(this.lootId) ?? null);
      case 'crew': {
        const r = g.playerRig;
        return JSON.stringify([r?.crew.map((c) => [c.id, c.level, Math.ceil(c.hp), c.perks, c.post, c.assign, Math.floor(c.xp)]), r?.bunks, g.recruits.map((c) => c.id), r?.modules.length, countAcross(g.craftInvs(), 'scrap'), countAcross(g.craftInvs(), 'rations')]);
      }
      case 'tech': {
        const invs = g.craftInvs();
        return JSON.stringify([[...g.tech], ALL_ITEMS.map((i) => countAcross(invs, i.id)), g.playerRig?.bonus.researchDiscount]);
      }
      default:
        return this.key;
    }
  }

  private render(): void {
    if (!this.el) return;
    this.key = this.contentKey();
    this.el.className = 'panel frame';
    this.el.innerHTML = '';
    this.ui.showTooltip(null);
    switch (this.kind) {
      case 'inventory': return this.inventory();
      case 'craft': return this.craft();
      case 'build': return this.build();
      case 'rig': return this.rig();
      case 'map': return this.map();
      case 'help': return this.help();
      case 'pause': return this.pause();
      case 'loot': return this.loot();
      case 'dead': return this.worldDeath();
      case 'crew': return this.crew();
      case 'tech': return this.techTree();
      default:
    }
  }

  private header(title: string, sub = ''): void {
    const hd = h('h2', '', `<span>${esc(title)}</span><small>${sub}</small>`);
    this.el!.appendChild(hd);
  }

  private cargo(): Inventory | null {
    const g = this.g;
    const r = g.playerRig;
    if (!r || g.sim.kind !== 'world' || !r.contains(g.player.cx, g.player.cy, 12 * TILE)) return null;
    return r.cargo;
  }

  private hover(el: HTMLElement, html: () => string | null): void {
    el.addEventListener('mouseenter', () => this.ui.showTooltip(html()));
    el.addEventListener('mouseleave', () => this.ui.showTooltip(null));
  }

  /* ---------------- Inventory ---------------- */

  drawCursor(): void {
    const c = this.ui.cursorEl;
    if (!this.cursor) {
      c.classList.add('hidden');
      return;
    }
    c.classList.remove('hidden');
    c.innerHTML = `<img src="${iconURL(this.cursor.id)}">${this.cursor.n > 1 ? `<span class="n">${this.cursor.n}</span>` : ''}`;
  }

  slotClick(inv: Inventory, i: number, e: MouseEvent): void {
    e.preventDefault();
    const slot = inv.slots[i];
    const right = e.button === 2;
    if (e.shiftKey && slot && !this.cursor) {
      const p = this.g.player;
      const target = inv === p.inv ? this.cargo() : p.inv;
      if (target) {
        const left = target.add(slot.id, slot.n);
        inv.slots[i] = left > 0 ? { id: slot.id, n: left } : null;
      }
    } else if (!right) {
      if (!this.cursor) {
        if (slot) {
          this.cursor = slot;
          inv.slots[i] = null;
        }
      } else if (!slot) {
        inv.slots[i] = this.cursor;
        this.cursor = null;
      } else if (slot.id === this.cursor.id) {
        const max = getItem(slot.id).maxStack;
        const mv = Math.min(max - slot.n, this.cursor.n);
        slot.n += mv;
        this.cursor.n -= mv;
        if (this.cursor.n <= 0) this.cursor = null;
      } else {
        inv.slots[i] = this.cursor;
        this.cursor = slot;
      }
    } else {
      if (!this.cursor) {
        if (slot) {
          const half = Math.ceil(slot.n / 2);
          this.cursor = { id: slot.id, n: half };
          slot.n -= half;
          if (slot.n <= 0) inv.slots[i] = null;
        }
      } else if (!slot) {
        inv.slots[i] = { id: this.cursor.id, n: 1 };
        this.cursor.n--;
      } else if (slot.id === this.cursor.id && slot.n < getItem(slot.id).maxStack) {
        slot.n++;
        this.cursor.n--;
      }
      if (this.cursor && this.cursor.n <= 0) this.cursor = null;
    }
    this.g.audio.play('ui');
    this.drawCursor();
    if (this.kind === 'inventory') this.render();
  }

  private grid(inv: Inventory, cls: string, from = 0, to = inv.size, extra = ''): HTMLDivElement {
    const grid = h('div', `grid ${cls}`);
    for (let i = from; i < to; i++) {
      const st = inv.slots[i];
      const el = slotEl(st, extra + (inv === this.g.player.inv && i === this.g.player.selected ? ' sel' : ''));
      if (inv === this.g.player.inv && i < 10) el.appendChild(h('span', 'k', String((i + 1) % 10)));
      el.addEventListener('mousedown', (e) => this.slotClick(inv, i, e));
      this.hover(el, () => (st ? itemTooltip(st.id) : null));
      grid.appendChild(el);
    }
    return grid;
  }

  private equipSlot(label: string, kind: 'suit' | 'gadget'): HTMLDivElement {
    const p = this.g.player;
    const cur = kind === 'suit' ? p.suit : p.gadget;
    const el = slotEl(cur ? { id: cur, n: 1 } : null, 'equip safe');
    el.dataset.label = label;
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const c = this.cursor;
      if (c && getItem(c.id).kind !== kind) {
        this.g.toast(`Only ${kind === 'suit' ? 'suits' : 'gadgets'} go there.`, '#ffab40');
        return;
      }
      const old = cur;
      if (kind === 'suit') p.suit = c ? c.id : null;
      else {
        p.gadget = c ? c.id : null;
        p.fuel = 0;
      }
      this.cursor = old ? { id: old, n: 1 } : null;
      this.drawCursor();
      this.render();
    });
    this.hover(el, () => (cur ? itemTooltip(cur) : `<h4>${label}</h4><div class="d">Equipped gear is never lost in the Dead Zone.</div>`));
    return el;
  }

  private inventory(): void {
    const g = this.g;
    const p = g.player;
    const warzone = g.sim.kind === 'warzone';
    this.header('INVENTORY', warzone ? '<span class="warn">PACK AT RISK</span>' : 'shift-click moves between pack and cargo');
    const row = h('div', 'row');
    const left = h('div');
    left.appendChild(h('h3', '', 'PACK (hotbar = top row)'));
    left.appendChild(this.grid(p.inv, ''));
    const eq = h('div', 'row');
    eq.style.marginTop = '20px';
    eq.style.gap = '8px';
    eq.append(this.equipSlot('SUIT', 'suit'), this.equipSlot('GADGET', 'gadget'));
    const sec = h('div');
    sec.innerHTML = '<div style="font-size:9px;color:#7d8a96;margin-top:-14px;height:14px">SECURE POUCH (safe on death)</div>';
    sec.appendChild(this.grid(p.secure, '', 0, p.secure.size, 'safe'));
    (sec.lastChild as HTMLElement).style.gridTemplateColumns = 'repeat(3, 44px)';
    eq.appendChild(sec);
    const drop = slotEl(null);
    drop.innerHTML = '<span style="font-size:9px;color:#ff8a80">DROP</span>';
    drop.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (this.cursor) {
        g.dropItem(p.cx + p.facing * 20, p.cy, this.cursor);
        this.cursor = null;
        this.drawCursor();
      }
    });
    eq.appendChild(drop);
    left.appendChild(eq);
    row.appendChild(left);
    const cargo = this.cargo();
    if (cargo) {
      const right = h('div');
      right.appendChild(h('h3', '', `RIG CARGO (${cargo.slots.filter(Boolean).length}/${cargo.size})`));
      if (cargo.size === 0) right.appendChild(h('div', 'note', 'No cargo bays. Build one in Build mode (B).'));
      else right.appendChild(this.grid(cargo, 'cargo'));
      const btns = h('div', 'row');
      btns.style.marginTop = '8px';
      btns.style.gap = '6px';
      btns.appendChild(button('STASH MATERIALS ➜ CARGO', () => {
        for (let i = 10; i < p.inv.size; i++) {
          const st = p.inv.slots[i];
          if (!st) continue;
          const k = getItem(st.id).kind;
          if (k === 'resource' || k === 'material' || k === 'block') {
            const leftN = cargo.add(st.id, st.n);
            p.inv.slots[i] = leftN > 0 ? { id: st.id, n: leftN } : null;
          }
        }
        this.render();
      }));
      right.appendChild(btns);
      row.appendChild(right);
    }
    this.el!.appendChild(row);
    this.el!.appendChild(h('div', 'note', 'LMB pick up / place · RMB split / place one · Shift+LMB quick move · items in the SECURE POUCH, SUIT and GADGET slots survive a Dead Zone death.'));
    this.el!.classList.add('center');
  }

  /* ---------------- Crafting ---------------- */

  private craftRecipe(r: Recipe, times: number): void {
    const g = this.g;
    const invs = g.craftInvs();
    let made = 0;
    for (let k = 0; k < times; k++) {
      if (!g.stations().has(r.station) || !canAfford(invs, r.cost)) break;
      payCost(invs, r.cost);
      let left = g.player.inv.add(r.out, r.n);
      if (left > 0 && invs[1]) left = invs[1].add(r.out, left);
      if (left > 0) g.dropItem(g.player.cx, g.player.cy, { id: r.out, n: left });
      made += r.n;
    }
    if (made) {
      g.audio.play('craft');
      this.ui.pickupNote(r.out, made);
    } else g.audio.play('error');
    this.render();
  }

  private craft(): void {
    const g = this.g;
    const st = g.stations();
    const invs = g.craftInvs();
    this.header('FABRICATION', [...st].map((s) => STATION_NAMES[s as keyof typeof STATION_NAMES]).join(' · '));
    const tabs = h('div', 'tabs');
    for (const [k, label] of CRAFT_TABS) tabs.appendChild(button(label, () => { this.craftTab = k; this.render(); }, this.craftTab === k ? 'sel' : ''));
    const search = h('input', 'text') as HTMLInputElement;
    search.placeholder = 'search...';
    search.value = this.craftSearch;
    search.style.width = '160px';
    search.addEventListener('input', () => {
      this.craftSearch = search.value;
      this.render();
      const s2 = this.el?.querySelector('input.text') as HTMLInputElement | null;
      s2?.focus();
      s2?.setSelectionRange(s2.value.length, s2.value.length);
    });
    tabs.appendChild(search);
    this.el!.appendChild(tabs);
    const list = h('div', 'recipes');
    const q = this.craftSearch.toLowerCase();
    const recipes = RECIPES.filter((r) => (this.craftTab === 'all' || recipeTab(r) === this.craftTab) && (!q || getItem(r.out).name.toLowerCase().includes(q)));
    recipes.sort((a, b) => Number(st.has(b.station)) - Number(st.has(a.station)));
    for (const r of recipes) {
      const hasStation = st.has(r.station);
      const ok = hasStation && canAfford(invs, r.cost);
      const d = getItem(r.out);
      const el = h('div', `recipe ${ok ? 'ok' : hasStation ? '' : 'no'}`);
      el.innerHTML = `<img src="${iconURL(r.out)}"><div class="info"><b>${esc(d.name)}${r.n > 1 ? ` ×${r.n}` : ''}</b> <span style="color:${hasStation ? '#7d8a96' : '#ff8a80'}">· ${STATION_NAMES[r.station]}</span>${costHTML(r.cost, invs)}</div>`;
      const b = button('CRAFT', (e) => this.craftRecipe(r, e.shiftKey ? 5 : 1), ok ? 'primary' : '');
      b.disabled = !ok;
      b.title = 'Shift-click to craft 5';
      el.appendChild(b);
      this.hover(el, () => itemTooltip(r.out));
      list.appendChild(el);
    }
    if (!recipes.length) list.appendChild(h('div', 'note', 'Nothing here.'));
    this.el!.appendChild(list);
    this.el!.appendChild(h('div', 'note', 'Crafting pulls from your pack and, when you are at your rig, its cargo. Stations are rig facilities: stand in or near your rig to use them.'));
    this.el!.classList.add('center');
  }

  /* ---------------- Build ---------------- */

  private build(): void {
    const g = this.g;
    const r = g.playerRig!;
    const invs = g.craftInvs();
    this.el!.classList.add('build-panel');
    this.header('RIG CONSTRUCTION', `${r.chassisDef.name} ${r.cols}×${r.rows}`);
    const tools = h('div', 'tabs');
    tools.appendChild(button('PLACE', () => { if (g.build.kind === 'erase' || g.build.kind === 'bg') g.build = { kind: 'tile', id: 'hull' }; this.render(); }, g.build.kind === 'tile' || g.build.kind === 'module' ? 'sel' : ''));
    tools.appendChild(button('BACKDROP', () => { g.build = { kind: 'bg', id: 'panel' }; this.render(); }, g.build.kind === 'bg' ? 'sel' : ''));
    tools.appendChild(button('ERASE', () => { g.build = { kind: 'erase', id: '' }; this.render(); }, g.build.kind === 'erase' ? 'sel danger' : 'danger'));
    this.el!.appendChild(tools);
    const tabs = h('div', 'tabs');
    const cats: ('structure' | ModuleCategory)[] = ['structure', 'core', 'crew', 'industry', 'defense', 'environment'];
    for (const c of cats) tabs.appendChild(button(c === 'structure' ? 'STRUCTURE' : CATEGORY_NAMES[c].toUpperCase(), () => { this.buildTab = c; this.render(); }, this.buildTab === c ? 'sel' : ''));
    this.el!.appendChild(tabs);
    const pal = h('div', 'palette');
    if (this.buildTab === 'structure') {
      for (const t of RIG_TILES) {
        if (t.key === 'empty' || t.key === 'chassis') continue;
        const sel = g.build.kind === 'tile' && g.build.id === t.key;
        const el = h('div', `pal ${sel ? 'sel' : ''}`);
        el.innerHTML = `<div class="sw" style="background:${t.key === 'armor' ? '#4d5863' : t.key === 'window' ? '#4fc3f7' : t.key === 'door' ? '#e0b020' : t.key === 'lamp' ? '#ffd180' : '#6e5d50'}"></div><div class="meta"><b>${t.name}</b> <span style="color:#7d8a96">· ${t.hp} hp</span>${costHTML(t.cost, invs)}</div>`;
        el.addEventListener('click', () => { g.build = { kind: 'tile', id: t.key }; this.render(); });
        this.hover(el, () => `<h4>${t.name}</h4><div class="d">${esc(t.desc)}</div>`);
        pal.appendChild(el);
      }
      const bg = h('div', `pal ${g.build.kind === 'bg' ? 'sel' : ''}`);
      bg.innerHTML = '<div class="sw" style="background:#192026;border:1px solid #2e3a44"></div><div class="meta"><b>Interior Backdrop</b><div class="cost"><span>free · marks space as indoors (sealed from hazards)</span></div></div>';
      bg.addEventListener('click', () => { g.build = { kind: 'bg', id: 'panel' }; this.render(); });
      pal.appendChild(bg);
    } else {
      for (const m of MODULE_LIST.filter((x) => x.category === this.buildTab)) {
        const sel = g.build.kind === 'module' && g.build.id === m.key;
        const afford = canAfford(invs, m.cost);
        const el = h('div', `pal ${sel ? 'sel' : ''}`);
        if (!moduleUnlocked(g.tech, m.key)) {
          const node = TECH_BY_ID.get(m.tech!)!;
          el.style.opacity = '0.45';
          el.innerHTML = `<div class="sw" style="background:#333"></div><div class="meta"><b>🔒 ${m.name}</b> <span style="color:#7d8a96">${m.w}×${m.h}</span><div class="cost"><span>Research <b style="color:#80d8ff">${esc(node.name)}</b> in the Tech Tree (T)</span></div></div>`;
          el.addEventListener('click', () => g.toast(`${m.name} needs research: ${node.name} (open the Tech Tree with T).`, '#80d8ff'));
          this.hover(el, () => `<h4>${m.name}</h4><div class="d">${esc(m.desc)}</div><div style="color:#80d8ff">Locked: research ${esc(node.name)}</div>`);
          pal.appendChild(el);
          continue;
        }
        el.style.opacity = afford ? '1' : '0.6';
        const pw = m.power > 0 ? `<span class="good">+${m.power} ⚡</span>` : m.power < 0 ? `${m.power} ⚡` : '';
        el.innerHTML = `<div class="sw" style="background:${m.accent}"></div><div class="meta"><b>${m.name}</b> <span style="color:#7d8a96">${m.w}×${m.h}</span>${costHTML(m.cost, invs)}</div><div class="pw">${pw}</div>`;
        el.addEventListener('click', () => { g.build = { kind: 'module', id: m.key }; this.render(); });
        this.hover(el, () => `<h4>${m.name}</h4><div>${m.w}×${m.h} tiles · ${m.hp} hp · power ${m.power > 0 ? '+' : ''}${m.power}</div><div class="d">${esc(m.desc)}</div>`);
        pal.appendChild(el);
      }
    }
    this.el!.appendChild(pal);
    const stats = h('div', 'stat-grid');
    stats.style.marginTop = '10px';
    const deficit = r.powerUse > r.powerProd;
    stats.innerHTML = `
      <div class="kv"><span>POWER</span><b class="${deficit ? 'warn' : 'good'}">${r.powerProd} / ${r.powerUse}</b></div>
      <div class="kv"><span>THRUST</span><b>${r.thrust}</b></div>
      <div class="kv"><span>MASS</span><b>${Math.round(r.mass)}</b></div>
      <div class="kv"><span>CARGO</span><b>${r.cargo.size} slots</b></div>
      <div class="kv"><span>BUNKS</span><b>${r.crew.length}/${r.bunks}</b></div>
      <div class="kv"><span>SEALED VS</span><b>${[...r.protects].map((x) => HAZARD_INFO[x].short).join(' ') || 'none'}</b></div>`;
    this.el!.appendChild(stats);
    this.el!.appendChild(h('div', 'note', 'LMB place (drag for plating) · RMB deconstruct (plating refunded, modules 75%). Modules need a floor. Materials come from your pack and rig cargo. Close with B.'));
  }

  /* ---------------- Rig management ---------------- */

  private rig(): void {
    const g = this.g;
    const r = g.playerRig;
    this.el!.classList.add('center');
    if (!r) {
      this.header('RIG');
      this.el!.appendChild(h('div', 'note', 'You have no rig.'));
      return;
    }
    const near = g.canBuild();
    const invs = g.craftInvs();
    this.header('RIG MANAGEMENT', `${r.chassisDef.name} · ${r.cols}×${r.rows}`);
    const nameIn = h('input', 'text') as HTMLInputElement;
    nameIn.value = r.name;
    nameIn.maxLength = 24;
    nameIn.addEventListener('change', () => { r.name = nameIn.value.trim() || r.name; });
    this.el!.appendChild(nameIn);

    const row = h('div', 'row');
    row.style.marginTop = '10px';
    const col1 = h('div');
    col1.style.width = '330px';
    const thrustF = Math.min(1.3, (r.thrust * 160) / Math.max(60, r.mass));
    const top = ((30 + 200 * thrustF) * (0.35 + 0.65 * r.powerRatio)) / TILE;
    col1.innerHTML = `<h3>SYSTEMS</h3><div class="stat-grid">
      <div class="kv"><span>INTEGRITY</span><b>${Math.round(r.integrity() * 100)}%</b></div>
      <div class="kv"><span>POWER</span><b class="${r.powerUse > r.powerProd ? 'warn' : ''}">${r.powerProd}/${r.powerUse}</b></div>
      <div class="kv"><span>MASS</span><b>${Math.round(r.mass)}</b></div>
      <div class="kv"><span>THRUST</span><b>${r.thrust}</b></div>
      <div class="kv"><span>TOP SPEED</span><b>${r.hasCockpit ? top.toFixed(1) : 0} t/s</b></div>
      <div class="kv"><span>SHIELD</span><b>${r.shieldMax || '-'}</b></div>
      <div class="kv"><span>RADAR</span><b>${r.radar ? `${r.radar} t` : '-'}</b></div>
      <div class="kv"><span>CARGO</span><b>${r.cargo.size}</b></div>
      <div class="kv"><span>SEALED VS</span><b>${[...r.protects].map((x) => HAZARD_INFO[x].short).join(' ') || 'none'}</b></div>
      <div class="kv"><span>STATIONS</span><b>${r.stations.size}</b></div></div>`;

    col1.appendChild(h('h3', '', 'CREW'));
    const crewList = h('div', 'note');
    crewList.innerHTML = r.crew.length
      ? r.crew.map((c) => `<span style="color:${ROLES[c.role].color}">■</span> ${esc(c.name)} · ${ROLES[c.role].name} L${c.level}`).join('<br>')
      : 'No crew. Turrets need crew to fire.';
    col1.appendChild(crewList);
    col1.appendChild(button('OPEN CREW PANEL (P)', () => g.setPanel('crew'), 'primary'));
    row.appendChild(col1);

    const col2 = h('div');
    col2.style.width = '400px';
    col2.appendChild(h('h3', '', 'DRIVE TRAIN'));
    const cur = DRIVES[r.drive];
    const list = h('div', 'drive-list');
    const driveRow = (key: string, installed: boolean, count: number): HTMLDivElement => {
      const d = DRIVES[key];
      const el = h('div', 'drive');
      const tr = (['normal', 'sand', 'ice', 'ash', 'mud', 'liquid'] as const).map((t) => {
        const v = d.traction[t];
        const c = v.speed >= 0.8 && v.climb >= 2 ? '#69f0ae' : v.speed >= 0.4 ? '#ffd740' : '#ff5252';
        return `<span style="color:${c}" title="${TERRAIN_NAMES[t]}: ${Math.round(v.speed * 100)}% speed, climb ${v.climb}">${TERRAIN_NAMES[t].slice(0, 4).toUpperCase()}</span>`;
      }).join('');
      el.innerHTML = `<img src="${iconURL(d.item)}"><div class="t"><b>${d.name}</b> ${installed ? '<span class="good">INSTALLED</span>' : `<span style="color:#7d8a96">×${count} in stock</span>`}${d.power ? ` <span style="color:#7d8a96">${d.power}⚡</span>` : ''}<div class="traction">${tr}</div></div>`;
      if (!installed) {
        el.appendChild(button('INSTALL', () => {
          if (!canAfford(invs, { [d.item]: 1 })) return;
          payCost(invs, { [d.item]: 1 });
          const old = DRIVES[r.drive];
          r.drive = key;
          r.recalc();
          if (r.cargo.add(old.item, 1) > 0) g.giveItem(old.item, 1);
          g.toast(`${d.name} installed. ${old.name} moved to cargo.`, '#69f0ae');
          g.audio.play('build');
          this.render();
        }, 'primary'));
        (el.lastChild as HTMLButtonElement).disabled = !near;
      }
      return el;
    };
    list.appendChild(driveRow(cur.key, true, 0));
    for (const key in DRIVES) {
      if (key === r.drive) continue;
      const n = countAcross(invs, DRIVES[key].item);
      if (n > 0) list.appendChild(driveRow(key, false, n));
    }
    col2.appendChild(list);
    col2.appendChild(h('div', 'note', 'Craft new drive trains at a Drive Workshop (garage module). Swap them here at any time while at your rig.'));

    col2.appendChild(h('h3', '', 'CHASSIS'));
    const next = CHASSIS[r.chassis + 1];
    if (next) {
      const box = h('div', 'drive');
      box.innerHTML = `<div class="t"><b>Upgrade to ${next.name}</b> <span style="color:#7d8a96">${next.w}×${next.h}, ${next.wheels} wheels</span><div style="color:#7d8a96">${esc(next.desc)}</div>${costHTML(next.cost, invs)}</div>`;
      const b = button('UPGRADE', () => {
        if (!g.stations().has('garage')) return g.toast('Chassis upgrades need a Drive Workshop.', '#ff5252');
        if (!canAfford(invs, next.cost)) return g.toast('Not enough materials.', '#ff5252');
        payCost(invs, next.cost);
        const p = g.player;
        const aboard = r.contains(p.cx, p.cy, 8);
        const oldY = r.y;
        r.resize(next.w, next.h);
        r.chassis = next.tier;
        r.placeOnGround(g.sim.world, Math.floor(r.x / TILE));
        if (aboard) p.y += r.y - oldY + (next.h - CHASSIS[next.tier - 1].h) * TILE;
        g.toast(`Chassis upgraded to ${next.name}! New space opened up on top and to the front.`, '#ffd740');
        g.audio.play('craft');
        this.render();
      }, 'primary');
      b.disabled = !near || !canAfford(invs, next.cost) || !g.stations().has('garage');
      box.appendChild(b);
      col2.appendChild(box);
    } else {
      col2.appendChild(h('div', 'note', 'Maximum chassis reached.'));
    }

    col2.appendChild(h('h3', '', 'EMERGENCY'));
    const recall = button(`WINCH TO LAST SAFE GROUND (${RECALL_COST.scrap} scrap)`, () => {
      if (!canAfford(invs, RECALL_COST)) return g.toast('Not enough scrap.', '#ff5252');
      payCost(invs, RECALL_COST);
      const p = g.player;
      const aboard = r.contains(p.cx, p.cy, 8) || p.driving === r;
      const dx = r.lastSafe.x - r.x, dy = r.lastSafe.y - r.y;
      r.x = r.lastSafe.x;
      r.y = r.lastSafe.y;
      r.prevX = r.x;
      r.prevY = r.y;
      r.vx = 0;
      if (aboard) {
        p.x += dx;
        p.y += dy;
      }
      g.toast('Rig winched back to safe ground.', '#80deea');
      this.render();
    }, 'danger');
    recall.disabled = !near;
    col2.appendChild(recall);
    row.appendChild(col2);
    this.el!.appendChild(row);
    if (!near) this.el!.appendChild(h('div', 'note warn', 'You are too far from your rig to manage it.'));
  }

  /* ---------------- Map ---------------- */

  private map(): void {
    const g = this.g;
    const mm = g.minimap;
    this.el!.classList.add('center', 'map-panel');
    const warzone = g.sim.kind === 'warzone';
    this.header(warzone ? 'DEAD ZONE MAP' : 'WASTELAND MAP', 'click the zone bar to pan');
    const W = Math.min(1100, window.innerWidth - 80);
    const world = g.sim.world;
    const H = Math.min(world.h, window.innerHeight - 260);
    if (!warzone) {
      const bar = h('canvas');
      bar.width = W;
      bar.height = 34;
      bar.style.cursor = 'pointer';
      const bctx = bar.getContext('2d')!;
      const sc = W / WORLD_W;
      for (const z of ZONES) {
        const zx = z.x0 * sc, zw = (z.x1 - z.x0) * sc;
        bctx.save();
        bctx.beginPath();
        bctx.rect(zx, 0, zw - 2, 34);
        bctx.clip();
        bctx.fillStyle = z.accent;
        bctx.globalAlpha = 0.25;
        bctx.fillRect(zx, 0, zw, 34);
        bctx.globalAlpha = 1;
        bctx.font = '10px "Share Tech Mono", monospace';
        bctx.fillText(z.name, zx + 4, 13);
        bctx.fillStyle = '#9aa7b3';
        bctx.font = '9px "Share Tech Mono", monospace';
        bctx.fillText(`${z.hazard ? HAZARD_INFO[z.hazard].short + ' · ' : ''}${z.requirement}`, zx + 4, 26);
        bctx.restore();
      }
      bctx.fillStyle = '#6af0ff';
      bctx.fillRect((g.player.cx / TILE) * sc - 1, 0, 3, 34);
      bctx.fillStyle = '#ff1744';
      bctx.fillRect(g.gen.checkpoint.x * sc - 1, 28, 3, 6);
      bar.addEventListener('click', (e) => {
        const rect = bar.getBoundingClientRect();
        this.mapPan = ((e.clientX - rect.left) / rect.width) * WORLD_W;
        this.render();
      });
      this.el!.appendChild(bar);
    }
    const cv = h('canvas');
    cv.width = W;
    cv.height = H;
    cv.style.marginTop = '6px';
    const ctx = cv.getContext('2d')!;
    const center = this.mapPan ?? g.player.cx / TILE;
    const sx = Math.max(0, Math.min(world.w - W, center - W / 2));
    const sy = Math.max(0, Math.min(world.h - H, g.player.cy / TILE - H / 2));
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, W, H);
    if (mm) ctx.drawImage(mm.canvas, sx, sy, W, H, 0, 0, W, H);
    const mark = (wx: number, wy: number, c: string, label = ''): void => {
      const x = wx / TILE - sx, y = wy / TILE - sy;
      ctx.fillStyle = c;
      ctx.fillRect(x - 2, y - 2, 5, 5);
      if (label) {
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillText(label, x + 5, y + 3);
      }
    };
    for (const r of g.sim.rigs) {
      const explored = mm?.isExplored(Math.floor(r.cx / TILE), Math.floor(r.cy / TILE));
      if (r === g.playerRig) mark(r.cx, r.cy, '#ffb74d', r.name);
      else if (explored) mark(r.cx, r.cy, r.wrecked ? '#777' : '#ff5252', r.wrecked ? 'wreck' : r.name);
    }
    if (!warzone) mark(g.gen.checkpoint.x * TILE, g.gen.checkpoint.ground * TILE - 20, '#ff1744', 'DEAD ZONE');
    for (const e of g.sim.extracts) mark(e.x + e.w / 2, e.y + e.h / 2, '#69f0ae', e.name);
    for (const c of g.sim.crates.values()) mark(c.x, c.y, c.kind === 'supply' ? '#ff1744' : '#ffd740', c.kind === 'supply' ? 'SUPPLY' : '');
    mark(g.player.cx, g.player.cy, '#6af0ff', 'YOU');
    this.el!.appendChild(cv);
    this.el!.appendChild(h('div', 'note', 'The map fills in as you explore. A powered Radar Mast on your rig reveals a much wider area.'));
  }

  /* ---------------- Help / pause / modals ---------------- */

  showHelpOverlay(): void {
    this.open('help');
  }

  private help(): void {
    this.el!.classList.add('center', 'help');
    this.header('FIELD MANUAL', 'H / F1');
    this.el!.insertAdjacentHTML('beforeend', `<div class="cols"><div><table>
      <tr><td><kbd>A</kbd><kbd>D</kbd></td><td>Move</td></tr>
      <tr><td><kbd>Space</kbd> / <kbd>W</kbd></td><td>Jump (hold for jetpack)</td></tr>
      <tr><td><kbd>W</kbd><kbd>S</kbd></td><td>Climb ladders · S drops through platforms</td></tr>
      <tr><td>LMB</td><td>Use held item: mine / shoot / place / eat</td></tr>
      <tr><td>RMB</td><td>Cutter: repair your rig (costs scrap)</td></tr>
      <tr><td><kbd>1</kbd>-<kbd>0</kbd> / wheel</td><td>Select hotbar slot</td></tr>
      <tr><td><kbd>F</kbd></td><td>Interact: drive the rig, open caches, enter the Dead Zone</td></tr>
      <tr><td><kbd>I</kbd> / <kbd>Tab</kbd></td><td>Inventory</td></tr>
      <tr><td><kbd>C</kbd></td><td>Crafting</td></tr>
      <tr><td><kbd>B</kbd></td><td>Build mode (rig construction)</td></tr>
      <tr><td><kbd>R</kbd></td><td>Rig management: drive trains, chassis</td></tr>
      <tr><td><kbd>P</kbd></td><td>Crew roster: posts, perks, recruitment</td></tr>
      <tr><td><kbd>T</kbd></td><td>Military tech tree</td></tr>
      <tr><td><kbd>M</kbd></td><td>Map</td></tr>
      <tr><td><kbd>-</kbd> <kbd>=</kbd></td><td>Zoom · <kbd>N</kbd> sound on/off</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close / pause</td></tr>
      </table></div><div>
      <h3>YOUR TANK</h3><p>Your base is a land-tank. Take the wheel at the Command Bridge (F), then A/D to drive. Mouse aims every gun; hold LMB to fire. Build hull, glacis armor, decks and facilities with B. Guns only fire when crewed and everything draws power. Research new military hardware and upgrades in the Tech Tree (T) with Salvaged Tech.</p>
      <h3>CREW</h3><p>Every crew member has a role (gunner, engineer, driver, mechanic, medic, scavenger, quartermaster, scientist, marine) that boosts the station they work at. They level up and learn perks. Hire more in the Crew panel (P); each Barracks adds 4 bunks.</p>
      <h3>THREAT</h3><p>The farther from camp (and the deeper underground) the tougher it gets: gunners, brutes, elite Alphas, and eventually titans that hunt your tank.</p>
      <h3>ZONES</h3><p>The wasteland runs west to east: Magma Rift · Cryo Spires · <b>Rustbelt</b> (start) · Dune Sea · Glass Crater · Acid Marsh. Terrain needs the right drive train (tracks for sand, chains for ice, magma treads for ash, hover skirts for acid). Hazards need rig modules (Rad Baffles, Thermal Regulator, Sealant Pump) and suits on foot.</p>
      <h3>THE DEAD ZONE</h3><p>Drive to the checkpoint east of spawn and press F at the gate. It is multiplayer PvP: if you die, your pack drops for anyone to loot. Secure pouch, suit and gadget are safe. Reach an extraction point to keep what you carry.</p>
      </div></div>`);
    if (this.g.state === 'title') this.el!.appendChild(button('CLOSE', () => this.close()));
  }

  private pause(): void {
    const g = this.g;
    this.el!.classList.add('center');
    this.header('PAUSED');
    const menu = h('div', 'menu');
    menu.appendChild(button('RESUME', () => g.setPanel(null), 'primary'));
    if (g.sim.kind === 'world') {
      menu.appendChild(button('SAVE', () => { g.save(); g.toast('Saved.', '#69f0ae'); }));
      menu.appendChild(button('SAVE & QUIT TO TITLE', () => g.quitToTitle()));
    } else {
      menu.appendChild(button('ABANDON RAID (lose your pack)', () => this.ui.ask('ABANDON THE RAID?', 'Your pack stays in the Dead Zone for others to loot.', 'ABANDON', () => g.warzone?.abandon(), true), 'danger'));
    }
    menu.appendChild(button(g.settings.muted ? 'SOUND: OFF' : 'SOUND: ON', () => {
      g.settings.muted = !g.settings.muted;
      g.audio.setMuted(g.settings.muted);
      g.saveSettings();
      this.render();
    }));
    menu.appendChild(button('CONTROLS', () => g.setPanel('help')));
    this.el!.appendChild(menu);
  }

  confirmWarzone(): void {
    const g = this.g;
    g.panel = 'confirm';
    this.open('confirm');
    const el = this.el!;
    el.classList.add('center');
    el.style.width = '520px';
    this.header('ENTER THE DEAD ZONE?', 'multiplayer · pvp');
    const inv = g.player.inv.stacks();
    const value = inv.reduce((s, st) => s + getItem(st.id).value * st.n, 0);
    el.insertAdjacentHTML('beforeend', `<div class="note" style="font-size:12px;color:#d8dee4">Everything in your <b style="color:#ff5252">pack and hotbar</b> (${inv.length} stacks, ~${Math.round(value)} value) is at risk. If you die, it drops in a crate that any raider can loot.<br><br>Safe: your <b style="color:#69f0ae">secure pouch</b> (3 slots), equipped suit and gadget. Your rig waits here.<br><br>Reach an extraction point to come home with everything you carry.</div>`);
    const nl = h('label', 'field', 'CALLSIGN');
    const name = h('input', 'text') as HTMLInputElement;
    name.value = g.settings.name;
    name.maxLength = 16;
    const sl = h('label', 'field', 'SERVER');
    const srv = h('input', 'text') as HTMLInputElement;
    srv.value = this.ui.defaultServer();
    el.append(nl, name, sl, srv);
    const row = h('div', 'row');
    row.style.marginTop = '12px';
    row.style.gap = '8px';
    row.appendChild(button('DEPLOY', () => {
      g.settings.name = name.value.trim() || 'Drifter';
      const url = srv.value.trim();
      g.settings.server = url === WarzoneClient.defaultUrl() ? '' : url;
      g.saveSettings();
      g.save(true);
      g.player.driving = null;
      g.setPanel(null);
      g.toast('Connecting to the Dead Zone...', '#ff8a80');
      g.warzone = new WarzoneClient(g, url);
    }, 'danger'));
    row.appendChild(button('CANCEL', () => g.setPanel(null)));
    el.appendChild(row);
  }

  openLoot(id: number): void {
    this.lootId = id;
    this.g.setPanel('loot');
  }

  refreshLoot(): void {
    if (this.kind === 'loot') this.render();
  }

  private loot(): void {
    const g = this.g;
    const c = g.sim.crates.get(this.lootId);
    this.el!.classList.add('center');
    if (!c) {
      this.header('EMPTY');
      this.el!.appendChild(h('div', 'note', 'Someone got here first.'));
      return;
    }
    this.header(c.label.toUpperCase(), `${c.items.length} stacks`);
    const list = h('div', 'loot-list');
    c.items.forEach((st, i) => {
      const el = h('div', 'loot-item', `<img src="${iconURL(st.id)}"><span style="flex:1">${esc(getItem(st.id).name)}</span><b>×${st.n}</b>`);
      el.addEventListener('click', () => g.warzone?.take(c.id, i));
      this.hover(el, () => itemTooltip(st.id));
      list.appendChild(el);
    });
    this.el!.appendChild(list);
    const row = h('div', 'row');
    row.style.marginTop = '10px';
    row.style.gap = '8px';
    row.appendChild(button('TAKE ALL', () => { for (let i = 0; i < c.items.length; i++) g.warzone?.take(c.id, 0); }, 'primary'));
    row.appendChild(button('CLOSE', () => g.setPanel(null)));
    this.el!.appendChild(row);
  }

  private worldDeath(): void {
    this.el!.classList.add('center', 'dead');
    this.el!.insertAdjacentHTML('beforeend', '<h1>YOU DIED</h1><div class="note" style="text-align:center">Half of your loose scrap fell where you died. Your crew hauls you back to the rig.</div>');
    const b = button('RESPAWN AT RIG', () => this.ui.respawn(), 'primary');
    b.style.marginTop = '12px';
    b.style.width = '100%';
    this.el!.appendChild(b);
  }

  /* ---------------- Crew ---------------- */

  private crewCard(c: CrewMember, owned: boolean): HTMLDivElement {
    const g = this.g;
    const r = g.playerRig!;
    const role = ROLES[c.role];
    const trait = TRAITS.find((t) => t.key === c.trait);
    const card = h('div', 'crew-card');
    card.style.borderColor = role.color + '66';
    const next = XP_LEVELS[c.level] ?? XP_LEVELS[XP_LEVELS.length - 1];
    const prev = XP_LEVELS[c.level - 1] ?? 0;
    const pct = c.level >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, ((c.xp - prev) / (next - prev)) * 100));
    card.innerHTML = `<div class="crew-head"><span class="role-badge" style="background:${role.color}">${role.name.toUpperCase()}</span><b>${esc(c.name)}</b><span class="lvl">LV ${c.level}${c.level >= MAX_LEVEL ? ' MAX' : ''}</span></div>
      <div class="bar xp"><i style="width:${pct}%"></i><span>${c.level >= MAX_LEVEL ? 'VETERAN' : `XP ${Math.floor(c.xp)} / ${next}`}</span></div>
      <div class="note" style="margin:3px 0">${esc(role.ability)}</div>
      <div class="kv"><span>TRAIT</span><b title="${esc(trait?.desc ?? '')}">${esc(trait?.name ?? c.trait)}</b></div>
      <div class="kv"><span>HEALTH</span><b class="${c.hp < c.maxHp * 0.4 ? 'warn' : ''}">${Math.ceil(c.hp)} / ${c.maxHp}</b></div>`;
    if (owned) {
      const row = h('div', 'kv');
      row.innerHTML = '<span>POST</span>';
      const sel = h('select', 'text') as HTMLSelectElement;
      sel.style.width = '190px';
      const auto = h('option', '', `Auto (${r.modules.find((m) => m.id === c.post)?.def.name ?? 'idle'})`) as HTMLOptionElement;
      auto.value = '';
      sel.appendChild(auto);
      for (const m of r.modules) {
        const o = h('option', '', `${m.def.name}${m.def.turret ? ' ⌖' : ''}`) as HTMLOptionElement;
        o.value = String(m.id);
        if (c.assign === m.id) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        c.assign = sel.value ? Number(sel.value) : null;
        g.timers.bonus = 0;
        this.render();
      });
      row.appendChild(sel);
      card.appendChild(row);
      const perks = h('div', 'perks');
      const pts = perkPoints(c);
      for (const pk of role.perks) {
        const have = c.perks.includes(pk.id);
        const b = h('button', `perk ${have ? 'have' : pts > 0 ? 'avail' : ''}`, `${have ? '✔ ' : ''}${pk.name}`) as HTMLButtonElement;
        b.disabled = have || pts <= 0;
        b.addEventListener('click', () => {
          c.perks.push(pk.id);
          if (pk.id === 'veteran') {
            c.maxHp += 50;
            c.hp += 50;
          }
          g.timers.bonus = 0;
          g.audio.play('craft');
          g.toast(`${c.name} learned ${pk.name}.`, role.color);
          this.render();
        });
        this.hover(b, () => `<h4>${pk.name}</h4><div class="d">${esc(pk.desc)}</div>${have ? '' : pts > 0 ? '<div class="good">Click to learn</div>' : `<div class="d">Unlocks with levels (${c.perks.length + 1 < MAX_LEVEL ? `next at LV ${c.perks.length + 2}` : 'max'})</div>`}`);
        perks.appendChild(b);
      }
      card.appendChild(perks);
      if (pts > 0) card.appendChild(h('div', 'good', `▲ ${pts} perk point${pts > 1 ? 's' : ''} to spend`));
      const dismiss = button('DISMISS', () => {
        this.ui.ask(`DISMISS ${c.name.toUpperCase()}?`, 'They will leave the rig for good.', 'DISMISS', () => {
          const i = r.crew.indexOf(c);
          if (i >= 0) r.crew.splice(i, 1);
          g.timers.bonus = 0;
          this.render();
        }, true);
      }, 'danger');
      dismiss.style.marginTop = '6px';
      dismiss.style.fontSize = '10px';
      card.appendChild(dismiss);
    }
    return card;
  }

  private crew(): void {
    const g = this.g;
    const r = g.playerRig;
    this.el!.classList.add('center');
    if (!r) {
      this.header('CREW');
      return;
    }
    this.header('CREW ROSTER', `${r.crew.length} / ${r.bunks} bunks · roles boost the station they work at`);
    const row = h('div', 'row');
    const left = h('div', 'crew-grid');
    for (const c of r.crew) left.appendChild(this.crewCard(c, true));
    if (!r.crew.length) left.appendChild(h('div', 'note', 'No crew aboard. Hire from the recruitment board.'));
    row.appendChild(left);
    const right = h('div');
    right.style.width = '290px';
    right.appendChild(h('h3', '', 'RECRUITMENT BOARD'));
    const invs = g.craftInvs();
    g.recruits.forEach((c, i) => {
      const card = this.crewCard(c, false);
      const cost = hireCost(c);
      card.insertAdjacentHTML('beforeend', costHTML(cost, invs));
      const b = button('HIRE', () => {
        if (g.hire(i)) this.render();
      }, 'primary');
      b.disabled = r.crew.length >= r.bunks || !canAfford(invs, cost) || !g.canBuild();
      b.title = r.crew.length >= r.bunks ? 'No free bunks: build another Barracks' : '';
      card.appendChild(b);
      right.appendChild(card);
    });
    const refresh = button(`NEW CANDIDATES (${REFRESH_COST.scrap} scrap)`, () => {
      if (!canAfford(invs, REFRESH_COST)) return g.toast('Not enough scrap.', '#ff5252');
      payCost(invs, REFRESH_COST);
      g.recruits = g.rollRecruits();
      this.render();
    });
    refresh.style.width = '100%';
    right.appendChild(refresh);
    right.appendChild(h('div', 'note', 'Crew level up from duty, kills made by the gun they man, driving and research. Every level grants a perk. Raider wrecks and outposts sometimes free prisoners who join you.'));
    row.appendChild(right);
    this.el!.appendChild(row);
  }

  /* ---------------- Tech tree ---------------- */

  private techTree(): void {
    const g = this.g;
    const r = g.playerRig;
    const invs = g.craftInvs();
    const discount = r?.bonus.researchDiscount ?? 0;
    this.el!.classList.add('center', 'tech-panel');
    this.header('MILITARY TECH TREE', `Salvaged Tech: <b style="color:#80d8ff">${countAcross(invs, 'tech_parts')}</b>${discount > 0 ? ` · scientists: -${Math.round(discount * 100)}% cost` : ''}`);
    const COL = 176, ROW = 74, PADX = 120, PADY = 10, NW = 150, NH = 54;
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
        path.setAttribute('stroke', done ? (g.tech.has(n.id) ? '#69f0ae' : '#80d8ff') : '#2e3a44');
        path.setAttribute('stroke-width', done ? '2' : '1.5');
        path.setAttribute('fill', 'none');
        if (!done) path.setAttribute('stroke-dasharray', '4 4');
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
      const afford = canAfford(invs, cost);
      const el = h('div', `tech-node ${have ? 'have' : avail ? (afford ? 'avail' : 'avail poor') : 'locked'}`);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.setProperty('--c', branch.color);
      const kind = n.unlocks ? 'UNLOCK' : 'UPGRADE';
      el.innerHTML = `<small>${kind}</small><b>${esc(n.name)}</b><small>${have ? '✔ RESEARCHED' : avail ? `${cost.tech_parts ?? 0} ⚙ tech` : 'LOCKED'}</small>`;
      this.hover(el, () => {
        const reqs = n.requires.map((id) => `<span style="color:${g.tech.has(id) ? '#69f0ae' : '#ff8a80'}">${esc(TECH_BY_ID.get(id)!.name)}</span>`).join(', ');
        return `<h4>${esc(n.name)}</h4><div class="d">${esc(n.desc)}</div>${reqs ? `<div>Requires: ${reqs}</div>` : ''}${have ? '<div class="good">Researched</div>' : costHTML(cost, invs)}`;
      });
      if (avail) el.addEventListener('click', () => {
        if (g.research(n.id)) this.render();
      });
      wrap.appendChild(el);
    }
    const scroll = h('div', 'tech-scroll');
    scroll.appendChild(wrap);
    this.el!.appendChild(scroll);
    this.el!.appendChild(h('div', 'note', 'Unlock nodes add new military equipment to Build mode (B). Upgrade nodes improve every weapon of that family on your rig. Salvaged Tech comes from raider wrecks, outposts, titans, elites and supply drops.'));
  }

  deathScreen(title: string, lost: Stack[], onContinue: () => void): void {
    const g = this.g;
    g.panel = 'dead';
    this.close(false);
    this.kind = 'dead';
    this.el = h('div', 'panel frame center dead');
    this.ui.root.appendChild(this.el);
    this.el.insertAdjacentHTML('beforeend', `<h1>${esc(title)}</h1><div class="note" style="text-align:center">You dropped ${lost.length} stack${lost.length === 1 ? '' : 's'}. They are someone else's now.</div>`);
    const grid = h('div', 'lost');
    for (const st of lost) grid.appendChild(slotEl(st));
    this.el.appendChild(grid);
    const b = button('RETURN TO THE WASTELAND', () => onContinue(), 'primary');
    b.style.width = '100%';
    this.el.appendChild(b);
  }
}
