import { getItem } from '../shared/items';
import { RUNE_INFO, TIER_NAMES, threatAt, threatTier } from '../shared/mapgen';
import { RARITIES } from '../shared/rarity';
import { treePoints, WEAPONS } from '../shared/weapons';
import { ZONES } from '../shared/zones';
import { CARDS, HAND_SIZE, PACK_INFO } from '../game/cards';
import { PERK_BY_ID, perkText, ROLES } from '../game/crew';
import { buildBlock, upgradeBlock, upgradeCostOf } from '../game/actions';
import { chassisForCC, DRIVE_INFO, MODULE_LIST, MODULES } from '../game/defs';
import type { Game } from '../game/game';
import { FEATURES, levelRoad, MAX_COMMANDER_LEVEL, type FeatureKey, type LevelReward } from '../game/progress';
import { SQUADS, squadSize, type SquadType } from '../game/squads';
import { forgeSpeed } from '../game/systems/arsenal';
import { cardBlock } from '../game/systems/cards';
import { OUTRIDER_COST } from '../game/systems/outrider';
import { activeSquads, setSquadOrder, squadBuilding, squadStatus, squadUnits } from '../game/systems/squads';
import type { TrackInfo } from '../game/systems/tracking';
import { itemIcon, moduleIcon, portrait } from '../render/icons';
import { cardEl } from './cardView';
import { button, esc, h, hideTip, tooltip } from './dom';
import { OBJECTIVES } from './objectives';
import { fmtTime } from './village';

/** Is there a building to put up or upgrade right now (free builder, unlocked, affordable)? */
function builderWork(g: Game): boolean {
  if (g.freeBuilders() <= 0) return false;
  for (const m of g.player.modules) if (!upgradeBlock(g, m.id) && g.canPay(upgradeCostOf(g, m.id))) return true;
  for (const d of MODULE_LIST) if (!d.required && !buildBlock(g, d.key) && g.canPay(d.cost) && g.player.findSpot(d.key)) return true;
  return false;
}

export interface HudActions {
  openPanel(name: string, tab?: string): void;
  pickPerk(crewId: number, idx: number): void;
  useKit(): void;
  outrider(cmd: 'follow' | 'hold' | 'send' | 'launch'): void;
  minimapClick(x: number, y: number, right: boolean): void;
  /** Card drag: aim follows the pointer; drop plays it if released over the battlefield. */
  cardAim(slot: number, x: number, y: number, overUI: boolean): void;
  cardDrop(slot: number, x: number, y: number, overUI: boolean): void;
  cardTap(slot: number): void;
  squadAim(type: SquadType, x: number, y: number, overUI: boolean): void;
  squadDrop(type: SquadType, x: number, y: number, overUI: boolean): void;
  openPack(): void;
  village(on: boolean): void;
  trackClick(): void;
  untrack(): void;
}

function setText(el: HTMLElement, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

function setHTML(el: HTMLElement, s: string): void {
  if ((el as HTMLElement & { _h?: string })._h !== s) {
    (el as HTMLElement & { _h?: string })._h = s;
    el.innerHTML = s;
  }
}

/** Which menu buttons show up (features switch on as you level). */
const MENU: { key: string; label: string; sub: string; feature?: FeatureKey; cls?: string }[] = [
  { key: 'base', label: 'BASE', sub: 'B', cls: 'big base' },
  { key: 'cards', label: 'CARDS', sub: 'C', cls: 'big cards' },
  { key: 'arsenal', label: 'ARSENAL', sub: 'V', feature: 'arsenal' },
  { key: 'crew', label: 'CREW', sub: 'K', feature: 'crew' },
  { key: 'cargo', label: 'CARGO', sub: 'I' },
  { key: 'map', label: 'MAP', sub: 'M' },
  { key: 'help', label: '?', sub: 'H' },
];

export class Hud {
  root: HTMLDivElement;
  private cmd = h('div', 'cmdr');
  private zone = h('div', 'zone-banner');
  private obj = h('div', 'objective');
  private track = h('div', 'tracker');
  private jobs = h('div', 'jobs');
  private res = h('div', 'resources');
  private menu = h('div', 'menu-buttons');
  private boss = h('div', 'bossbar');
  private buffs = h('div', 'buffbar');
  private toasts = h('div', 'toasts');
  private lvlBanner = h('div', 'lvl-banner');
  private hazard = h('div', 'hazard-warn');
  private hpBox = h('div', 'hp-box');
  private hpFill = h('div', 'fill');
  private shFill = h('div', 'shield');
  private hpText = h('div', 'txt');
  private tankInfo = h('div', 'tank-info');
  private kitBtn = h('div', 'kit-btn');
  private hand = h('div', 'hand');
  private handSlots: HTMLDivElement[] = [];
  private handKeys: string[] = [];
  private nextCard = h('div', 'next-card');
  private energy = h('div', 'energy');
  private energyFill = h('div', 'en-fill');
  private energyNum = h('div', 'en-num');
  private packBtn = h('div', 'pack-btn');
  private squads = h('div', 'squads');
  private squadKey = '';
  private perkBox = h('div', 'perk-box');
  private perkKey = '';
  private tint = h('div', 'timestop-tint');
  private rider = h('div', 'rider-card');
  private hint = h('div', 'hover-hint');
  private death = h('div', 'death');
  private dragGhost = h('div', 'drag-ghost');
  private bottom = h('div', 'hud-bottom');
  minimap: HTMLCanvasElement;
  private mmWrap = h('div', 'minimap');
  private badges = new Map<string, HTMLDivElement>();
  private lastObjective = -1;
  private game: Game | null = null;
  /** Hand slot armed by a tap (waiting for a tap on the battlefield). */
  armed = -1;
  private lvlT = 0;
  trackInfo: TrackInfo | null = null;
  private village = false;
  /** A free builder has something affordable to do (checked once a second). */
  private work = false;
  private workT = 0;

  constructor(parent: HTMLElement, private act: HudActions) {
    this.root = h('div', 'hud');
    parent.appendChild(this.root);
    const tl = h('div', 'hud-tl');
    tl.append(this.cmd, this.zone, this.obj, this.track, this.jobs);
    this.cmd.addEventListener('click', (e) => {
      e.stopPropagation();
      act.openPanel('progress');
    });
    tooltip(this.cmd, () => this.cmdTip());
    this.track.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('.tr-x')) act.untrack();
      else act.trackClick();
    });
    this.jobs.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = (e.target as HTMLElement).closest('[data-open]') as HTMLElement | null;
      if (t?.dataset.open === 'base') act.village(true);
      else if (t) act.openPanel(t.dataset.open!, t.dataset.tab);
    });
    const tr = h('div', 'hud-tr');
    tr.append(this.menu, this.res);
    const tc = h('div', 'hud-tc');
    tc.append(this.lvlBanner, this.boss, this.buffs, this.hazard, this.toasts);
    this.lvlBanner.addEventListener('click', (e) => {
      e.stopPropagation();
      this.lvlT = 0;
      this.lvlBanner.style.display = 'none';
      act.openPanel('progress');
    });
    for (const m of MENU) {
      const b = h('div', `menu-btn ${m.cls ?? ''}`, `<b>${m.label}</b><small>${m.sub}</small>`);
      const badge = h('span', 'badge');
      b.appendChild(badge);
      this.badges.set(m.key, b);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (m.key === 'base') act.village(!this.village);
        else act.openPanel(m.key);
      });
      this.menu.appendChild(b);
    }
    // Bottom-left: the fortress.
    const hp = h('div', 'hp-bar');
    hp.append(this.hpFill, this.shFill, this.hpText);
    this.kitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.useKit();
    });
    tooltip(this.kitBtn, () => `<h4>Repair Kit <small>[5]</small></h4><div>Restore 25% hull over 3s.</div><div class="d">Make more in CARGO > Workshop.</div>`);
    this.hpBox.append(this.tankInfo, hp, this.kitBtn);
    this.tankInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      act.village(true);
    });
    // Bottom-center: the hand of cards and energy.
    const handWrap = h('div', 'hand-wrap');
    const handRow = h('div', 'hand-row');
    handRow.appendChild(this.nextCard);
    for (let i = 0; i < HAND_SIZE; i++) {
      const s = h('div', 'hand-slot');
      s.dataset.slot = String(i);
      this.bindCardDrag(s, i);
      this.handSlots.push(s);
      this.handKeys.push('');
      this.hand.appendChild(s);
    }
    handRow.appendChild(this.hand);
    this.energy.append(this.energyFill, this.energyNum);
    for (let i = 1; i < 10; i++) this.energy.appendChild(h('i', 'en-tick'));
    this.packBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.openPack();
    });
    handWrap.append(this.packBtn, handRow, this.energy);
    this.bottom.append(this.hpBox, handWrap);
    // Bottom-right: squads above the minimap.
    this.minimap = h('canvas');
    this.minimap.width = 220;
    this.minimap.height = 220;
    this.mmWrap.appendChild(this.minimap);
    this.mmWrap.appendChild(h('div', 'mm-hint', 'click: drive there'));
    this.minimap.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const r = this.minimap.getBoundingClientRect();
      act.minimapClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.button === 2);
    });
    this.minimap.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.append(this.tint, tl, tr, tc, this.perkBox, this.squads, this.rider, this.bottom, this.mmWrap, this.hint, this.death, this.dragGhost);
    for (const el of [tl, tr, this.bottom, this.squads, this.perkBox, this.rider, this.mmWrap]) el.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  /* ---------------- drag and drop ---------------- */

  /** Drag a card out of the hand and drop it on the battlefield, Clash Royale style. Tap to arm it instead. */
  private bindCardDrag(el: HTMLDivElement, slot: number): void {
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      const g = this.game;
      if (!g || !g.hand[slot]) return;
      const sx = e.clientX, sy = e.clientY;
      let dragging = false;
      const move = (ev: MouseEvent): void => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          dragging = true;
          this.armed = -1;
          this.dragGhost.innerHTML = '';
          this.dragGhost.appendChild(cardEl(g, g.hand[slot], { mini: true }));
          this.dragGhost.style.display = 'block';
          el.classList.add('dragging');
        }
        if (!dragging) return;
        this.dragGhost.style.left = `${ev.clientX}px`;
        this.dragGhost.style.top = `${ev.clientY}px`;
        const over = this.overUI(ev);
        this.dragGhost.classList.toggle('cancel', over);
        this.act.cardAim(slot, ev.clientX, ev.clientY, over);
      };
      const up = (ev: MouseEvent): void => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        el.classList.remove('dragging');
        this.dragGhost.style.display = 'none';
        if (dragging) this.act.cardDrop(slot, ev.clientX, ev.clientY, this.overUI(ev));
        else this.act.cardTap(slot);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    tooltip(el, () => {
      const g = this.game;
      const id = g?.hand[slot];
      if (!g || !id) return '';
      const d = CARDS[id];
      return `<h4>${esc(d.name)} <small>[${slot + 1}] · ${g.cardCost(id)} energy</small></h4><div class="d">${d.target === 'area' ? 'Drag it onto the battlefield (or tap it, then tap the ground).' : 'Tap it or drag it out to play it on your fortress.'}</div>`;
    });
  }

  private bindSquadDrag(el: HTMLDivElement, type: SquadType): void {
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      const sx = e.clientX, sy = e.clientY;
      let dragging = false;
      const move = (ev: MouseEvent): void => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          dragging = true;
          this.dragGhost.innerHTML = `<div class="sq-ghost" style="border-color:${SQUADS[type].color}">⚑ ${esc(SQUADS[type].name)}<br><small>drop to guard here</small></div>`;
          this.dragGhost.style.display = 'block';
        }
        if (!dragging) return;
        this.dragGhost.style.left = `${ev.clientX}px`;
        this.dragGhost.style.top = `${ev.clientY}px`;
        const over = this.overUI(ev);
        this.dragGhost.classList.toggle('cancel', over);
        this.act.squadAim(type, ev.clientX, ev.clientY, over);
      };
      const up = (ev: MouseEvent): void => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        this.dragGhost.style.display = 'none';
        if (dragging) this.act.squadDrop(type, ev.clientX, ev.clientY, this.overUI(ev));
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  /** Is the pointer over HUD chrome rather than the battlefield? */
  private overUI(ev: MouseEvent): boolean {
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    if (!el) return true;
    if (el.tagName === 'CANVAS' && !el.closest('.minimap')) return false;
    return !!el.closest('.hud-bottom, .hud-tl, .hud-tr, .squads, .minimap, .perk-box, .panel-backdrop, .rider-card, .village .v-card, .village .v-top');
  }

  /* ---------------- messages ---------------- */

  toast(text: string, color = '#fff'): void {
    const t = h('div', 'toast', esc(text));
    t.style.borderLeftColor = color;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4800);
  }

  setHint(s: string): void {
    setHTML(this.hint, s);
    this.hint.style.display = s ? 'block' : 'none';
  }

  /** Big "LEVEL UP" banner with what the level unlocked. */
  levelUp(r: LevelReward): void {
    const items: string[] = [];
    for (const f of r.features) items.push(`<span class="feat">★ ${esc(f.name)}</span>`);
    for (const m of r.modules) items.push(`<span><img src="${moduleIcon(m.key)}">${esc(m.name)}</span>`);
    for (const t of r.techs.slice(0, 3)) items.push(`<span>${esc(t.name)}</span>`);
    if (r.techs.length > 3) items.push(`<span>+${r.techs.length - 3} more</span>`);
    if (r.relicSlot) items.push('<span class="feat">◈ Relic slot</span>');
    if (r.builder) items.push('<span class="feat">🔨 Extra builder</span>');
    items.push(`<span style="color:${PACK_INFO[r.pack].color}">▣ ${esc(PACK_INFO[r.pack].name)}</span>`);
    this.lvlBanner.innerHTML = `<div class="lb-t">COMMANDER LEVEL ${r.level}!</div><div class="lb-s">+3% hull · +2% damage · fully repaired</div><div class="lb-i">${items.join('')}</div>${r.features.map((f) => `<div class="lb-f"><b>${esc(f.name)}:</b> ${esc(f.desc)}</div>`).join('')}<div class="lb-c">click for the Level Road</div>`;
    this.lvlBanner.style.display = 'block';
    this.lvlBanner.classList.remove('pop');
    void this.lvlBanner.offsetWidth;
    this.lvlBanner.classList.add('pop');
    this.lvlT = r.features.length ? 12 : 7;
  }

  private cmdTip(): string {
    const g = this.game;
    if (!g) return '';
    const c = g.commander;
    const next = levelRoad()[c.level];
    const lines = next ? [...next.features.map((f) => `★ ${f.name}`), ...next.modules.map((m) => m.name), ...next.techs.slice(0, 3).map((t) => t.name), PACK_INFO[next.pack].name] : [];
    return `<h4>Commander level ${c.level}</h4><div>Earn XP by killing enemies, clearing loot areas, outposts, raider tanks and runes.</div>${next ? `<div class="d">Level ${next.level} brings: ${lines.map(esc).join(', ')}</div>` : ''}`;
  }

  /* ---------------- per-frame ---------------- */

  update(g: Game, dt: number, village: boolean): void {
    this.game = g;
    this.village = village;
    const p = g.player;
    this.root.classList.toggle('in-village', village);
    this.root.classList.toggle('in-raid', g.mode === 'raid');
    // Commander
    const c = g.commander;
    const next = levelRoad()[c.level];
    const nextTxt = next ? [...next.features.map((f) => f.name), ...next.modules.map((m) => m.name)].slice(0, 2).join(', ') || PACK_INFO[next.pack].name : 'MAX';
    setHTML(this.cmd, `<div class="cm-lvl">${c.level}</div><div class="cm-body"><div class="cm-t">COMMANDER <small>${c.level >= MAX_COMMANDER_LEVEL ? 'MAX LEVEL' : `next: ${esc(nextTxt)}`}</small></div><div class="cm-bar"><div style="width:${g.xpFrac() * 100}%"></div></div></div>`);
    // Zone
    const z = ZONES[g.map.zoneAt(p.x, p.y)];
    const threat = g.mode === 'raid' ? 4 : threatAt(p.x, p.y);
    const tier = threatTier(threat);
    const zoneName = g.mode === 'raid' ? 'THE DEAD ZONE' : z?.name ?? '';
    let warn = '';
    if (g.mode === 'world' && z) {
      if (z.drive && p.drive !== z.drive && p.drive !== 'hover') warn += `<div class="need">Terrain: ${DRIVE_INFO[z.drive].name} recommended</div>`;
      if (z.hazard && !p.stats.protects.has(z.hazard)) warn += `<div class="need bad">${esc(z.need)}</div>`;
    }
    setHTML(this.zone, `<span class="zn">${esc(zoneName)}</span> <span class="tier t${tier}">THREAT ${TIER_NAMES[tier]}</span>${warn}`);
    // Objective
    if (g.mode === 'world' && g.objective < OBJECTIVES.length) {
      const o = OBJECTIVES[g.objective];
      if (this.lastObjective !== g.objective) {
        this.lastObjective = g.objective;
        const rw = Object.entries(o.reward).map(([id, n]) => `<img src="${itemIcon(id)}">${n}`).join(' ');
        setHTML(this.obj, `<div class="ot">GOAL ${g.objective + 1}/${OBJECTIVES.length}</div><div class="on">${esc(o.title)}</div><div class="oh">${esc(o.hint)}</div><div class="or">Reward: ${rw}</div>`);
      }
      this.obj.style.display = 'block';
    } else this.obj.style.display = 'none';
    this.updateTracker(g);
    this.updateJobs(g);
    // Resources
    const res = ['scrap', 'iron_plate', 'copper_wire', 'circuit', 'titanium_alloy', 'tech_parts'].map((id) => `<span title="${getItem(id).name}"><img src="${itemIcon(id)}">${p.cargo.count(id)}</span>`);
    res.push(`<span title="Crew aboard / bunks">👥 ${g.mainCrew().length}/${g.crewCap()}</span>`);
    setHTML(this.res, res.join(''));
    // Menu buttons (features appear as you level)
    for (const m of MENU) {
      const b = this.badges.get(m.key)!;
      const f = m.feature ? FEATURES.find((k) => k.key === m.feature) : undefined;
      b.style.display = !f || c.level >= f.level || (m.key === 'arsenal' && g.armory.length > 0) ? '' : 'none';
      b.classList.toggle('on', m.key === 'base' && village);
    }
    const badge = (k: string, txt: string): void => {
      const s = this.badges.get(k)!.querySelector('.badge') as HTMLElement;
      s.style.display = txt ? 'block' : 'none';
      s.textContent = txt;
    };
    badge('crew', g.crew.some((k) => k.draft) ? '★' : '');
    const upCard = Object.entries(g.cards).some(([id, k]) => CARDS[id] && k.level < 10 && k.shards >= Math.ceil(k.level * [4, 3, 2, 2, 1, 1][CARDS[id].rarity]));
    badge('cards', g.packs.length ? String(g.packs.length) : upCard ? '⬆' : '');
    this.workT -= dt;
    if (this.workT <= 0) {
      this.workT = 1;
      this.work = g.mode === 'world' && builderWork(g);
    }
    badge('base', this.work ? '🔨' : '');
    const pts = [...g.armory, ...p.weapons().map((m) => m.weapon!)].some((w) => (w.tree ?? []).length < treePoints(w));
    const spare = g.armory.length > 0 && p.hardpoints().some((m) => !m.weapon && m.built);
    badge('arsenal', spare ? '!' : pts ? '★' : '');
    // Boss bar
    const titan = g.enemies.find((e) => e.titan && Math.hypot(e.x - p.x, e.y - p.y) < 70);
    if (titan) {
      this.boss.style.display = 'block';
      setHTML(this.boss, `<div class="bn">${esc(titan.name)} <small>${esc(titan.kind.replace('titan_', '').toUpperCase())} TITAN</small></div><div class="bb"><div style="width:${(titan.hp / titan.maxHp) * 100}%"></div></div>`);
    } else this.boss.style.display = 'none';
    // Level banner timer
    if (this.lvlT > 0) {
      this.lvlT -= dt;
      if (this.lvlT <= 0) this.lvlBanner.style.display = 'none';
    }
    // Buffs
    const b: string[] = [];
    if (g.runeBuff) b.push(`<span style="color:${RUNE_INFO[g.runeBuff.rune].color}">◆ ${RUNE_INFO[g.runeBuff.rune].name} ${Math.ceil(g.runeBuff.t)}s</span>`);
    const names: Record<string, string> = {
      barrage: 'Barrage', nitro: 'Nitro', invuln: 'Invulnerable', deadeye: 'Deadeye', meltdown: 'Meltdown', armorUp: 'Nanites', barrier: 'Barrier', harvestUp: 'Fast Harvest',
      stun: 'STUNNED', chill: 'Slowed', regen: 'Repairing', dome: 'Aegis Dome', smoke: 'Smoke Screen', blitz: 'Blitz', frenzy: 'Salvage Frenzy', soul: 'Soul Harvest', scholar: 'Scholar',
    };
    for (const [k, v] of p.buffs) if (names[k]) b.push(`<span>${names[k]} ${Math.ceil(v.t)}s</span>`);
    if (g.chestBonus > 0) b.push('<span style="color:#ffd23f">Next chest +1 rarity</span>');
    if (g.timeStop > 0) b.push(`<span style="color:#18ffff">TIME STOP ${Math.ceil(g.timeStop)}s</span>`);
    if (g.orbital) b.push(`<span style="color:#ff1744">ORBITAL LASER ${Math.ceil(g.orbital.t)}s · steer with the mouse</span>`);
    if (g.storm) b.push(`<span style="color:#82b1ff">CATACLYSM ${Math.ceil(g.storm.t)}s</span>`);
    this.tint.style.display = g.timeStop > 0 ? 'block' : 'none';
    setHTML(this.buffs, b.join(''));
    if (g.hazardWarn) {
      this.hazard.style.display = 'block';
      setText(this.hazard, `⚠ ${g.hazardWarn}`);
    } else this.hazard.style.display = 'none';
    // Fortress
    const ch = chassisForCC(p.stats.cc);
    setHTML(this.tankInfo, `<b>${esc(ch.name)}</b> <span>CC L${p.stats.cc} · ${p.stats.topSpeed.toFixed(1)} spd · ${Math.round(p.stats.armor * 100)}% armor${p.stats.powerRatio < 1 ? ' · <i class="bad">LOW POWER</i>' : ''}</span>`);
    this.hpFill.style.width = `${(p.hp / p.stats.maxHp) * 100}%`;
    const barrier = p.buff('barrier')?.v ?? 0;
    this.shFill.style.width = `${Math.min(100, ((p.shield + barrier) / p.stats.maxHp) * 100)}%`;
    setText(this.hpText, `${Math.ceil(p.hp)} / ${p.stats.maxHp}${p.stats.shield ? `  ⛨ ${Math.ceil(p.shield)}` : ''}${barrier > 0 ? `  +${Math.ceil(barrier)}` : ''}`);
    setHTML(this.kitBtn, `<img src="${itemIcon('repair_kit')}"><span class="k">5</span><span class="n">${p.cargo.count('repair_kit')}</span>`);
    this.updateHand(g);
    this.updateSquads(g);
    this.updatePerks(g);
    this.updateRider(g);
    if (p.dead && g.mode === 'world') {
      this.death.style.display = 'flex';
      setHTML(this.death, `<div><h2>FORTRESS DISABLED</h2><p>Your crew is towing it back to camp... ${Math.ceil(g.respawnIn)}</p><p class="d">It comes back fully repaired. You dropped a quarter of your scrap.</p></div>`);
    } else this.death.style.display = 'none';
  }

  /* ---------------- cards ---------------- */

  private updateHand(g: Game): void {
    const max = g.maxEnergy();
    const e = g.energy;
    this.energyFill.style.width = `${(e / max) * 100}%`;
    setText(this.energyNum, String(Math.floor(e)));
    const ticks = this.energy.querySelectorAll('.en-tick');
    ticks.forEach((t, i) => ((t as HTMLElement).style.left = `${((i + 1) / max) * 100}%`));
    for (let i = 0; i < ticks.length; i++) (ticks[i] as HTMLElement).style.display = i + 1 < max ? '' : 'none';
    for (let i = 0; i < HAND_SIZE; i++) {
      const id = g.hand[i] ?? '';
      const s = this.handSlots[i];
      const key = `${id}:${g.cardLevel(id)}:${g.cardCost(id)}`;
      if (key !== this.handKeys[i]) {
        this.handKeys[i] = key;
        s.innerHTML = '';
        if (id) {
          const el = cardEl(g, id, { mini: true });
          el.appendChild(h('div', 'hk', String(i + 1)));
          el.appendChild(h('div', 'mc-need'));
          s.appendChild(el);
          s.classList.remove('drawn');
          void s.offsetWidth;
          s.classList.add('drawn');
        }
      }
      const block = id ? cardBlock(g, i) : 'empty';
      const cost = g.cardCost(id);
      s.classList.toggle('ready', !block);
      s.classList.toggle('armed', this.armed === i);
      const need = s.querySelector('.mc-need') as HTMLElement | null;
      if (need) need.style.height = block && cost > 0 ? `${Math.max(0, 1 - e / cost) * 100}%` : '0';
    }
    const nx = g.queue[0];
    setHTML(this.nextCard, nx ? `<small>NEXT</small>${cardEl(g, nx, { mini: true }).outerHTML}` : '');
    this.packBtn.style.display = g.packs.length ? 'block' : 'none';
    if (g.packs.length) setHTML(this.packBtn, `▣ ${g.packs.length} CARD PACK${g.packs.length > 1 ? 'S' : ''} <b>OPEN</b>`);
  }

  /* ---------------- squads ---------------- */

  private updateSquads(g: Game): void {
    const types = activeSquads(g);
    const key = types.map((t) => {
      const b = squadBuilding(g, t);
      return `${t}:${g.squads[t]?.order}:${squadUnits(g, t).length}:${b?.lvl}:${squadStatus(g, t)}`;
    }).join('|') + `|${g.mode}`;
    if (key === this.squadKey) return;
    this.squadKey = key;
    this.squads.innerHTML = '';
    if (!types.length || g.mode !== 'world') {
      this.squads.style.display = 'none';
      return;
    }
    this.squads.style.display = 'flex';
    for (const t of types) {
      const d = SQUADS[t];
      const b = squadBuilding(g, t)!;
      const sq = g.squads[t];
      const el = h('div', `sq-chip ${sq?.order ?? ''}`);
      el.style.borderColor = d.color;
      el.innerHTML = `<div class="sq-top"><img src="${moduleIcon(d.building)}"><div><b style="color:${d.color}">${esc(d.name)}</b><small>${squadUnits(g, t).length}/${squadSize(d, b.lvl)} · ${esc(squadStatus(g, t))}</small></div></div>`;
      const row = h('div', 'sq-btns');
      row.appendChild(button('⌂', () => setSquadOrder(g, t, 'follow'), `small ${sq?.order === 'follow' ? 'on' : ''}`));
      if (d.canScavenge) row.appendChild(button('SCAVENGE', () => setSquadOrder(g, t, 'scavenge'), `small ${sq?.order === 'scavenge' ? 'on' : ''}`));
      row.appendChild(h('span', 'sq-drag', '⚑ drag to guard'));
      el.appendChild(row);
      this.bindSquadDrag(el, t);
      tooltip(el, () => `<h4 style="color:${d.color}">${esc(d.name)}</h4><div>${esc(d.desc)}</div><div class="d">⌂ follow the fortress · drag the badge onto the map to guard that spot${d.canScavenge ? ' · SCAVENGE: collect loot drops and harvest nodes ahead, then bring the haul home' : ''}.<br>Upgrade the ${esc(MODULES[d.building].name)} for more and stronger units.</div>`);
      this.squads.appendChild(el);
    }
  }

  /* ---------------- tracker & jobs ---------------- */

  private updateTracker(g: Game): void {
    const t = this.trackInfo;
    if (!t || g.mode !== 'world') {
      this.track.style.display = 'none';
      return;
    }
    this.track.style.display = 'block';
    const rows = t.needs.map((n) => `<div class="tr-n ${n.have >= n.need ? 'ok' : ''}">${n.id === 'shards' ? '<span class="tr-card">▣</span>' : `<img src="${itemIcon(n.id)}">`}<span>${esc(n.name)}</span><b>${n.have}/${n.need}</b></div>`).join('');
    setHTML(this.track, `<div class="tr-h">◎ TRACKING <span class="tr-x" title="Stop tracking">✕</span></div><div class="tr-t">${esc(t.title)}</div>${rows}<div class="tr-hint ${t.ready ? 'good' : ''}">${esc(t.hint)}</div><div class="tr-c">${t.ready ? 'Click to open your base' : t.target && t.target.kind !== 'base' ? 'Follow the yellow marker' : ''}</div>`);
    this.track.classList.toggle('ready', t.ready);
  }

  private updateJobs(g: Game): void {
    if (g.mode !== 'world') {
      this.jobs.style.display = 'none';
      return;
    }
    const lines: string[] = [];
    for (const j of g.builds) {
      const m = g.player.moduleById(j.modId);
      if (!m) continue;
      lines.push(`<div class="rw" data-open="base"><small>${j.kind === 'build' ? '🔨 BUILDING' : `⬆ LEVEL ${j.to}`}</small> ${esc(MODULES[m.key].name)}<div class="bar"><div style="width:${(j.t / j.total) * 100}%"></div></div><small>${fmtTime(j.total - j.t)}</small></div>`);
    }
    const free = g.freeBuilders();
    if (free > 0 && !this.village) lines.push(`<div class="rw idle" data-open="base"><small>🔨 ${free} builder${free > 1 ? 's' : ''} free</small> tap to build or upgrade</div>`);
    const job = g.forgeJob;
    if (job) {
      const w = [...g.armory, ...g.player.weapons().map((m) => m.weapon!)].find((k) => k.uid === job.uid);
      const sp = forgeSpeed(g);
      lines.push(`<div class="rw forge" data-open="arsenal" data-tab="weapons"><small>FORGE</small> ${esc(w ? WEAPONS[w.key].name : '?')} → ${job.to + 1}★<div class="bar"><div style="width:${(job.t / job.total) * 100}%"></div></div><small>${sp > 0 ? fmtTime((job.total - job.t) / sp) : 'no forge'}</small></div>`);
    }
    const html = lines.join('');
    setHTML(this.jobs, html);
    this.jobs.style.display = html ? 'block' : 'none';
  }

  /* ---------------- crew perks ---------------- */

  private updatePerks(g: Game): void {
    const c = g.mode === 'world' ? g.crew.find((k) => k.draft) : undefined;
    const pending = g.crew.filter((k) => k.draft).length;
    const key = c ? `${c.id}:${c.level}:${c.draft!.map((d) => `${d.id}${d.rarity}`).join(',')}:${pending}` : '';
    if (key === this.perkKey) return;
    this.perkKey = key;
    this.perkBox.innerHTML = '';
    if (!c) {
      this.perkBox.style.display = 'none';
      return;
    }
    this.perkBox.style.display = 'block';
    this.perkBox.appendChild(h('div', 'pk-head', `<img src="${portrait(c)}"><div><b>CREW LEVEL UP!</b><br>${esc(c.name)} <small>L${c.level} ${esc(ROLES[c.role].name)}</small><br><small>Click a perk${pending > 1 ? ` · ${pending - 1} more waiting` : ''}</small></div>`));
    c.draft!.forEach((pk, i) => {
      const d = PERK_BY_ID.get(pk.id);
      if (!d) return;
      const card = h('div', `pk-card r${pk.rarity}`);
      card.style.borderColor = RARITIES[pk.rarity].color;
      card.innerHTML = `<div class="rk" style="color:${RARITIES[pk.rarity].color}">${RARITIES[pk.rarity].name}${d.minLevel ? (d.minLevel >= 8 ? ' · MASTER' : ' · VETERAN') : ''}</div><b>${esc(d.name)}</b><div>${esc(perkText(pk.id, pk.rarity))}</div>`;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.act.pickPerk(c.id, i);
        this.perkKey = '';
      });
      this.perkBox.appendChild(card);
    });
  }

  /* ---------------- outrider ---------------- */

  private riderKey = '';

  private updateRider(g: Game): void {
    const t = g.outrider;
    let key = '';
    if (g.mode !== 'world' || g.commander.level < 12) key = 'none';
    else if (!g.outriderUnlocked()) key = 'none';
    else if (g.outriderLevel === 0 || !t) key = `build:${g.outriderLevel}:${Math.ceil(g.outriderRebuild)}:${g.player.stats.garage}`;
    else key = `live:${g.outriderOrder.mode}:${'phase' in g.outriderOrder ? g.outriderOrder.phase : ''}:${Math.round((t.hp / t.stats.maxHp) * 20)}:${g.outriderCrew().length}:${t.cargo.stacks().length}`;
    if (key === this.riderKey) return;
    this.riderKey = key;
    this.rider.innerHTML = '';
    if (key === 'none') {
      this.rider.style.display = 'none';
      return;
    }
    this.rider.style.display = 'block';
    if (key.startsWith('build')) {
      this.rider.innerHTML = `<div class="rt">OUTRIDER</div><div class="rd">${g.player.stats.garage ? g.outriderRebuild > 0 ? `Rebuilding... ${Math.ceil(g.outriderRebuild)}s` : 'Ready to launch from the Garage.' : 'Build a <b>Garage</b> first.'}</div>`;
      if (g.player.stats.garage && g.outriderRebuild <= 0) {
        const b = button(g.outriderLevel ? 'Rebuild' : 'Launch', () => this.act.outrider('launch'));
        tooltip(b, () => `Cost: ${Object.entries(OUTRIDER_COST).map(([k, n]) => `${n} ${getItem(k).name}`).join(', ')}`);
        this.rider.appendChild(b);
      }
      return;
    }
    const o = g.outriderOrder;
    const status = o.mode === 'expedition' ? `Expedition: ${o.phase}` : o.mode === 'hold' ? 'Holding position' : 'Following';
    this.rider.innerHTML = `<div class="rt">OUTRIDER <small>${esc(status)}</small></div><div class="hp-mini"><div style="width:${(t!.hp / t!.stats.maxHp) * 100}%"></div></div>`;
    const row = h('div', 'rbtns');
    row.append(button('Follow', () => this.act.outrider('follow')), button('Hold', () => this.act.outrider('hold')), button('Send (J)', () => this.act.outrider('send')));
    this.rider.appendChild(row);
  }
}
