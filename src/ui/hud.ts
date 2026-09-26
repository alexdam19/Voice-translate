import { ACTIVE_SLOTS, OFFICER_LABELS, OFFICER_SLOTS } from '../shared/constants';
import { getItem } from '../shared/items';
import { RUNE_INFO, TIER_NAMES, threatAt, threatTier } from '../shared/mapgen';
import { RARITIES } from '../shared/rarity';
import { treePoints, WEAPONS, weaponScore } from '../shared/weapons';
import { ZONES } from '../shared/zones';
import { ACTIVES } from '../game/arsenal';
import { abilityCooldown, abilityOf, abilityPower, PERK_BY_ID, perkText, ROLES } from '../game/crew';
import { chassisDef, DRIVE_INFO, levelMult, MODULES } from '../game/defs';
import type { Game } from '../game/game';
import { activeCooldown, armedUlt, forgeSpeed } from '../game/systems/arsenal';
import { OUTRIDER_COST } from '../game/systems/outrider';
import { canResearch, TECH } from '../game/tech';
import { abilityIcon, itemIcon, moduleIcon, portrait, weaponIcon } from '../render/icons';
import { scaleDesc } from './abilitiesPanel';
import { selectArsenalWeapon, starsHTML, weaponSummary } from './arsenalPanel';
import { button, esc, h, tooltip } from './dom';
import { OBJECTIVES } from './objectives';
import { researchStatus } from './techPanel';

export interface HudActions {
  openPanel(name: string, tab?: string): void;
  cast(slot: number): void;
  castActive(slot: number): void;
  castUlt(): void;
  pickPerk(crewId: number, idx: number): void;
  toggleWeapon(modId: number): void;
  toggleAutoFire(): void;
  useKit(): void;
  outrider(cmd: 'follow' | 'hold' | 'send' | 'launch'): void;
  hoverWeapon(range: number): void;
  minimapClick(x: number, y: number, right: boolean): void;
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

function fmtScaled(n: number, P: number, unit: string): string {
  const v = n * P;
  return `${unit === '%' || v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`;
}

export class Hud {
  root: HTMLDivElement;
  private zone = h('div', 'zone-banner');
  private obj = h('div', 'objective');
  private res = h('div', 'resources');
  private menu = h('div', 'menu-buttons');
  private boss = h('div', 'bossbar');
  private buffs = h('div', 'buffbar');
  private toasts = h('div', 'toasts');
  private hazard = h('div', 'hazard-warn');
  private bar = h('div', 'command-bar');
  private hpFill = h('div', 'fill');
  private shFill = h('div', 'shield');
  private hpText = h('div', 'txt');
  private tankInfo = h('div', 'tank-info');
  private slots: HTMLDivElement[] = [];
  private actSlots: HTMLDivElement[] = [];
  private ultBtn = h('div', 'ult-btn');
  private perkBox = h('div', 'perk-box');
  private perkKey = '';
  private resBox = h('div', 'res-widget');
  private tint = h('div', 'timestop-tint');
  private weaponsRow = h('div', 'weapons-row');
  private weaponsKey = '';
  private kitBtn = h('div', 'kit-btn');
  private autoBtn = h('div', 'auto-btn');
  private rider = h('div', 'rider-card');
  private hint = h('div', 'hover-hint');
  private death = h('div', 'death');
  minimap: HTMLCanvasElement;
  private badges = new Map<string, HTMLSpanElement>();
  private lastObjective = -1;

  constructor(parent: HTMLElement, private act: HudActions) {
    this.root = h('div', 'hud');
    parent.appendChild(this.root);
    const tl = h('div', 'hud-tl');
    tl.append(this.zone, this.obj, this.resBox);
    this.resBox.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = (e.target as HTMLElement).closest('[data-open]') as HTMLElement | null;
      act.openPanel(t?.dataset.open ?? 'tech', t?.dataset.tab);
    });
    const tr = h('div', 'hud-tr');
    tr.append(this.menu, this.res);
    const tc = h('div', 'hud-tc');
    tc.append(this.boss, this.buffs, this.hazard, this.toasts);
    this.root.append(this.tint, tl, tr, tc, this.perkBox, this.rider, this.hint, this.death);
    // Menu buttons: the two big ones are BASE vs CREW.
    const mk = (key: string, label: string, sub: string, cls = ''): void => {
      const b = h('div', `menu-btn ${cls}`, `<b>${label}</b><small>${sub}</small>`);
      const badge = h('span', 'badge');
      b.appendChild(badge);
      this.badges.set(key, badge);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        act.openPanel(key);
      });
      this.menu.appendChild(b);
    };
    mk('base', 'BASE', 'B · tank', 'big base');
    mk('arsenal', 'ARSENAL', 'V · weapons', 'big arsenal');
    mk('crew', 'CREW', 'C · people', 'big crew');
    mk('tech', 'RESEARCH', 'T', 'big tech');
    mk('abilities', 'ABILITIES', 'K');
    mk('cargo', 'CARGO', 'I');
    mk('map', 'MAP', 'M');
    mk('help', '?', 'H');
    // Command bar
    const left = h('div', 'cb-left');
    const hp = h('div', 'hp-bar');
    hp.append(this.hpFill, this.shFill, this.hpText);
    left.append(this.tankInfo, hp);
    const abil = h('div', 'abilities');
    const offGroup = h('div', 'ab-group');
    for (let i = 0; i < OFFICER_SLOTS; i++) {
      const s = h('div', 'ab-slot');
      s.innerHTML = `<div class="ab-img"></div><div class="ab-portrait"></div><div class="ab-cd"></div><div class="ab-time"></div><div class="ab-key">${OFFICER_LABELS[i]}</div>`;
      s.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.game && i >= this.game.officerSeats()) act.openPanel('tech', 'personnel');
        else if (this.game && !this.game.officers()[i]) act.openPanel('crew', 'officers');
        else act.cast(i);
      });
      tooltip(s, () => this.abilityTip(i));
      this.slots.push(s);
      offGroup.appendChild(s);
    }
    // The ultimate: one big button with a charge ring.
    this.ultBtn.innerHTML = '<div class="ult-ring"></div><div class="ult-img"></div><div class="ult-pct"></div><div class="ab-key">R</div>';
    this.ultBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.game && !armedUlt(this.game)) act.openPanel('abilities');
      else act.castUlt();
    });
    tooltip(this.ultBtn, () => this.ultTip());
    const actGroup = h('div', 'ab-group act');
    for (let i = 0; i < ACTIVE_SLOTS; i++) {
      const s = h('div', 'ab-slot act');
      s.innerHTML = `<div class="ab-img"></div><div class="ab-cd"></div><div class="ab-time"></div><div class="ab-key">${i + 1}</div>`;
      s.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.game && !this.game.activeSlots[i]) act.openPanel('abilities');
        else act.castActive(i);
      });
      tooltip(s, () => this.activeTip(i));
      this.actSlots.push(s);
      actGroup.appendChild(s);
    }
    abil.append(offGroup, this.ultBtn, actGroup);
    const right = h('div', 'cb-right');
    this.kitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.useKit();
    });
    tooltip(this.kitBtn, () => `<h4>Repair Kit <small>[5]</small></h4><div>Restore 25% hull over 3s.</div><div class="d">Craft more in CARGO > Workshop.</div>`);
    this.autoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.toggleAutoFire();
    });
    tooltip(this.autoBtn, () => `<h4>Auto-fire [Y]</h4><div>ON: every weapon set to AUTO picks targets and fires by itself.</div><div>OFF: all weapons aim at your cursor and fire while you hold left mouse.</div><div class="d">Right-click a weapon icon to switch just that one.</div>`);
    right.append(this.kitBtn, this.autoBtn);
    const mid = h('div', 'cb-mid');
    mid.append(abil, this.weaponsRow);
    this.bar.append(left, mid, right);
    this.root.appendChild(this.bar);
    // Minimap
    const mm = h('div', 'minimap');
    this.minimap = h('canvas');
    this.minimap.width = 220;
    this.minimap.height = 220;
    mm.appendChild(this.minimap);
    mm.appendChild(h('div', 'mm-hint', 'click: look · right-click: drive'));
    this.minimap.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const r = this.minimap.getBoundingClientRect();
      act.minimapClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.button === 2);
    });
    this.minimap.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.appendChild(mm);
  }

  private ultTip(): string {
    const g = this.game;
    if (!g) return '';
    const u = armedUlt(g);
    if (!u) return '<h4>ULTIMATE <small>[R]</small></h4><div>No ultimate yet. Research one deep in the tree (Nuclear Program, Mech Drop, Meteor Storm, Summon Dragon...) and build its module.</div><div class="d">Click to see them all.</div>';
    return `<h4 style="color:${u.def.color}">${esc(u.def.name)} <small>[R]</small></h4><div>${scaleDesc(u.def.desc, levelMult(u.m.lvl))}</div><div class="d">${Math.floor(g.ultCharge * 100)}% charged · charges over ~${u.def.charge}s, faster while you deal damage${u.def.target === 'point' ? ' · aims at cursor' : ''}</div>`;
  }

  private activeTip(i: number): string {
    const g = this.game;
    if (!g) return '';
    const m = g.activeSlots[i] ? g.player.moduleById(g.activeSlots[i]) : undefined;
    if (!m) return `<h4>Arsenal slot ${i + 1}</h4><div>Empty. Build an active module (Salvo Rack, Jet Hangar, Drone Bay, Mine Layer, Blink Drive...) after researching it.</div><div class="d">Click to open ABILITIES.</div>`;
    const a = ACTIVES[MODULES[m.key].active!];
    return `<h4 style="color:${a.color}">${esc(a.name)} <small>[${i + 1}]</small></h4><div>${scaleDesc(a.desc, levelMult(m.lvl))}</div><div class="d">${esc(MODULES[m.key].name)} L${m.lvl} · cooldown ${Math.round(activeCooldown(g, a.key))}s${a.target === 'point' ? ' · aims at cursor' : ''}</div>`;
  }

  private abilityTip(i: number): string {
    const g = this.game;
    if (!g) return '';
    if (i >= g.officerSeats()) return `<h4>Locked seat (${OFFICER_LABELS[i]})</h4><div>Research ${i === 4 ? 'Officer School' : 'Chain of Command'} in RESEARCH > Personnel > COMMAND.</div>`;
    const c = g.officers()[i];
    if (!c) return `<h4>Empty officer seat (${OFFICER_LABELS[i]})</h4><div>Assign a main-crew officer in CREW (C) > Officers.</div>`;
    const a = abilityOf(c);
    const P = abilityPower(c, g.player.crew.abilityPower);
    const desc = a.desc.replace(/\{([^}]+)\}/g, (_m, v: string) => {
      const n = parseFloat(v);
      if (Number.isNaN(n)) return v;
      return `<b>${fmtScaled(n, P, v.replace(/[\d.]/g, ''))}</b>`;
    });
    return `<h4 style="color:${a.color}">${a.name} <small>[${OFFICER_LABELS[i]}]</small></h4><div>${desc}</div><div class="d">${esc(c.name)} · ${ROLES[c.role].name} L${c.level} · <span style="color:${RARITIES[c.rarity].color}">${RARITIES[c.rarity].name}</span> · cooldown ${Math.round(abilityCooldown(c, g.player.crew.cdr))}s${a.target === 'point' ? ' · aims at cursor' : ''}</div>`;
  }

  private game: Game | null = null;

  toast(text: string, color = '#fff'): void {
    const t = h('div', 'toast', esc(text));
    t.style.borderLeftColor = color;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 5) this.toasts.firstChild?.remove();
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4800);
  }

  setHint(s: string): void {
    setHTML(this.hint, s);
    this.hint.style.display = s ? 'block' : 'none';
  }

  update(g: Game): void {
    this.game = g;
    const p = g.player;
    // Zone banner
    const z = ZONES[g.map.zoneAt(p.x, p.y)];
    const threat = g.mode === 'raid' ? 4 : threatAt(p.x, p.y);
    const tier = threatTier(threat);
    const zoneName = g.mode === 'raid' ? 'THE DEAD ZONE' : z?.name ?? '';
    let warn = '';
    if (g.mode === 'world' && z) {
      if (z.drive && p.drive !== z.drive && p.drive !== 'hover') warn += `<div class="need">Terrain: ${DRIVE_INFO[z.drive].name} recommended</div>`;
      if (z.hazard && !p.stats.protects.has(z.hazard)) warn += `<div class="need bad">${esc(z.need)}</div>`;
    }
    setHTML(this.zone, `<div class="zn">${esc(zoneName)}</div><div class="tier t${tier}">THREAT ${TIER_NAMES[tier]}</div>${warn}`);
    // Objective
    if (g.mode === 'world' && g.objective < OBJECTIVES.length) {
      const o = OBJECTIVES[g.objective];
      if (this.lastObjective !== g.objective) {
        this.lastObjective = g.objective;
        const rw = Object.entries(o.reward).map(([id, n]) => `<img src="${itemIcon(id)}">${n}`).join(' ');
        setHTML(this.obj, `<div class="ot">OBJECTIVE ${g.objective + 1}/${OBJECTIVES.length}</div><div class="on">${esc(o.title)}</div><div class="oh">${esc(o.hint)}</div><div class="or">Reward: ${rw}</div>`);
      }
      this.obj.style.display = 'block';
    } else this.obj.style.display = 'none';
    // Resources
    const res = ['scrap', 'iron_plate', 'circuit', 'titanium_alloy', 'tech_parts', 'mythic_essence'].map((id) => `<span title="${getItem(id).name}"><img src="${itemIcon(id)}">${p.cargo.count(id)}</span>`);
    const crewN = g.mainCrew().length;
    res.push(`<span title="Crew aboard / bunks">👥 ${crewN}/${g.crewCap()}</span>`);
    setHTML(this.res, res.join(''));
    // Badges
    const perkPending = g.crew.some((c) => c.draft);
    this.badges.get('crew')!.style.display = perkPending ? 'block' : 'none';
    this.badges.get('crew')!.textContent = perkPending ? '★' : '';
    const spare = g.armory.length > 0 && p.hardpoints().some((m) => !m.weapon);
    this.badges.get('base')!.style.display = spare ? 'block' : 'none';
    this.badges.get('base')!.textContent = spare ? '!' : '';
    const idle = g.mode === 'world' && (!g.research.military || (!g.research.personnel && p.stats.lab > 0));
    const canStart = idle && this.canStartResearch(g);
    this.badges.get('tech')!.style.display = canStart ? 'block' : 'none';
    this.badges.get('tech')!.textContent = canStart ? '+' : '';
    const pts = [...g.armory, ...p.weapons().map((m) => m.weapon!)].some((w) => (w.tree ?? []).length < treePoints(w));
    this.badges.get('arsenal')!.style.display = pts ? 'block' : 'none';
    this.badges.get('arsenal')!.textContent = pts ? '★' : '';
    const unbound = p.modules.some((m) => MODULES[m.key].active && !g.activeSlots.includes(m.id)) && g.activeSlots.includes(0);
    this.badges.get('abilities')!.style.display = unbound ? 'block' : 'none';
    this.badges.get('abilities')!.textContent = unbound ? '!' : '';
    // Boss bar
    const titan = g.enemies.find((e) => e.titan && Math.hypot(e.x - p.x, e.y - p.y) < 60);
    if (titan) {
      this.boss.style.display = 'block';
      setHTML(this.boss, `<div class="bn">${esc(titan.name)} <small>${esc(titan.kind.replace('titan_', '').toUpperCase())} TITAN</small></div><div class="bb"><div style="width:${(titan.hp / titan.maxHp) * 100}%"></div></div>`);
    } else this.boss.style.display = 'none';
    // Buffs
    const b: string[] = [];
    if (g.runeBuff) b.push(`<span style="color:${RUNE_INFO[g.runeBuff.rune].color}">◆ ${RUNE_INFO[g.runeBuff.rune].name} ${Math.ceil(g.runeBuff.t)}s</span>`);
    for (const [k, v] of p.buffs) {
      const names: Record<string, string> = { barrage: 'Barrage', nitro: 'Nitro', invuln: 'Invulnerable', deadeye: 'Deadeye', meltdown: 'Meltdown', armorUp: 'Nanites', barrier: 'Barrier', harvestUp: 'Fast Harvest', stun: 'STUNNED', chill: 'Slowed', regen: 'Repairing', dome: 'Aegis Dome', smoke: 'Smoke Screen', blitz: 'Blitz' };
      if (names[k]) b.push(`<span>${names[k]} ${Math.ceil(v.t)}s</span>`);
    }
    if (g.chestBonus > 0) b.push('<span style="color:#ffd23f">Next chest +1 rarity</span>');
    if (g.timeStop > 0) b.push(`<span style="color:#18ffff">TIME STOP ${Math.ceil(g.timeStop)}s</span>`);
    if (g.orbital) b.push(`<span style="color:#ff1744">ORBITAL LASER ${Math.ceil(g.orbital.t)}s · steer with the mouse</span>`);
    if (g.storm) b.push(`<span style="color:#82b1ff">CATACLYSM ${Math.ceil(g.storm.t)}s</span>`);
    this.tint.style.display = g.timeStop > 0 ? 'block' : 'none';
    setHTML(this.buffs, b.join(''));
    // Hazard
    if (g.hazardWarn) {
      this.hazard.style.display = 'block';
      setText(this.hazard, `⚠ ${g.hazardWarn}`);
    } else this.hazard.style.display = 'none';
    // Command bar
    const ch = chassisDef(p.chassis);
    setHTML(this.tankInfo, `<b>${esc(ch.name)}</b> <span>${DRIVE_INFO[p.drive].name} · ${p.stats.topSpeed.toFixed(1)} spd · ${Math.round(p.stats.armor * 100)}% armor${p.stats.powerRatio < 1 ? ' · <i class="bad">LOW POWER</i>' : ''}</span>`);
    this.hpFill.style.width = `${(p.hp / p.stats.maxHp) * 100}%`;
    const barrier = p.buff('barrier')?.v ?? 0;
    this.shFill.style.width = `${Math.min(100, ((p.shield + barrier) / p.stats.maxHp) * 100)}%`;
    setText(this.hpText, `${Math.ceil(p.hp)} / ${p.stats.maxHp}${p.stats.shield ? `  ⛨ ${Math.ceil(p.shield)}` : ''}${barrier > 0 ? `  +${Math.ceil(barrier)}` : ''}`);
    const off = g.officers();
    const seats = g.officerSeats();
    for (let i = 0; i < OFFICER_SLOTS; i++) {
      const s = this.slots[i];
      const c = off[i];
      const img = s.children[0] as HTMLDivElement, por = s.children[1] as HTMLDivElement, cd = s.children[2] as HTMLDivElement, tm = s.children[3] as HTMLDivElement;
      s.classList.toggle('locked', i >= seats);
      if (!c) {
        s.classList.add('empty');
        if (i >= seats) {
          setHTML(img, '<span class="lock">🔒</span>');
          setHTML(por, '');
          cd.style.background = 'none';
          setText(tm, '');
          continue;
        }
        setHTML(img, '');
        setHTML(por, '');
        cd.style.background = 'none';
        setText(tm, '');
        continue;
      }
      s.classList.remove('empty');
      setHTML(img, `<img src="${abilityIcon(c)}">`);
      setHTML(por, `<img src="${portrait(c)}">`);
      s.style.borderColor = RARITIES[c.rarity].color;
      const max = abilityCooldown(c, p.crew.cdr);
      if (c.injured > 0) {
        cd.style.background = 'rgba(120,0,0,0.65)';
        setText(tm, '✚');
      } else if (c.cd > 0) {
        const pct = (c.cd / max) * 100;
        cd.style.background = `conic-gradient(rgba(5,5,10,0.72) ${pct}%, transparent ${pct}%)`;
        setText(tm, c.cd >= 10 ? String(Math.ceil(c.cd)) : c.cd.toFixed(1));
      } else {
        cd.style.background = 'none';
        setText(tm, '');
      }
      s.classList.toggle('ready', c.cd <= 0 && c.injured <= 0);
    }
    this.updateArsenalBar(g);
    this.updatePerks(g);
    this.updateResearch(g);
    // Weapons row (rebuilt when layout changes)
    const ws = p.weapons();
    const key = ws.map((m) => `${m.id}:${m.weapon!.uid}:${m.mode}`).join(',') + `|${g.autoFire}`;
    if (key !== this.weaponsKey) {
      this.weaponsKey = key;
      this.weaponsRow.innerHTML = '';
      for (const m of ws) {
        const w = m.weapon!;
        const d = WEAPONS[w.key];
        const auto = g.autoFire && m.mode === 'auto';
        const el = h('div', `wpn ${auto ? 'auto' : 'manual'}`, `<img src="${weaponIcon(w.key, w.rarity)}"><span>${auto ? 'AUTO' : 'MAN'}</span><i class="wst" style="color:${RARITIES[w.rarity].color}">${w.rarity + 1}★</i>`);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          selectArsenalWeapon(w.uid);
          this.act.openPanel('arsenal', 'weapons');
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.act.toggleWeapon(m.id);
        });
        el.addEventListener('mouseenter', () => this.act.hoverWeapon(m.stats?.range ?? 0));
        el.addEventListener('mouseleave', () => this.act.hoverWeapon(0));
        tooltip(el, () => `<h4 style="color:${RARITIES[w.rarity].color}">${esc(d.name)}</h4><div>${starsHTML(w)}</div><div>${weaponSummary(w, m.stats ?? undefined)}</div><div>DPS score ${weaponScore(w)} · ${(w.tree ?? []).length}/${treePoints(w)} tree points</div><div class="d">Click: open in ARSENAL (forge, upgrade tree) · Right-click: switch ${auto ? 'to MANUAL' : 'to AUTO'}.</div>`);
        this.weaponsRow.appendChild(el);
      }
      if (!ws.length) this.weaponsRow.innerHTML = '<div class="nowpn">No weapons mounted — BASE > Armory</div>';
    }
    // Weapon cooldown flashes
    const wels = this.weaponsRow.children;
    for (let i = 0; i < ws.length && i < wels.length; i++) (wels[i] as HTMLElement).classList.toggle('firing', ws[i].recoil > 0.6);
    setHTML(this.kitBtn, `<img src="${itemIcon('repair_kit')}"><span class="k">5</span><span class="n">${p.cargo.count('repair_kit')}</span>`);
    setHTML(this.autoBtn, `<b>${g.autoFire ? 'AUTO' : 'MANUAL'}</b><small>FIRE · Y</small>`);
    this.autoBtn.classList.toggle('off', !g.autoFire);
    // Outrider card
    this.updateRider(g);
    // Death
    if (p.dead && g.mode === 'world') {
      this.death.style.display = 'flex';
      setHTML(this.death, `<div><h2>FORTRESS DISABLED</h2><p>Your crew is towing it back to camp... ${Math.ceil(g.respawnIn)}</p><p class="d">You lost a quarter of your scrap. Some crew were wounded.</p></div>`);
    } else this.death.style.display = 'none';
  }

  private canStartResearch(g: Game): boolean {
    for (const n of TECH) {
      if (!canResearch(g.tech, n)) continue;
      if (g.research[n.tree]) continue;
      if (n.tree === 'personnel' && g.player.stats.lab <= 0) continue;
      if (g.canPay(n.cost)) return true;
    }
    return false;
  }

  /** Ultimate button and actives 1-4. */
  private updateArsenalBar(g: Game): void {
    const p = g.player;
    const u = armedUlt(g);
    const ring = this.ultBtn.children[0] as HTMLDivElement, img = this.ultBtn.children[1] as HTMLDivElement, pct = this.ultBtn.children[2] as HTMLDivElement;
    if (u) {
      const k = Math.floor(g.ultCharge * 100);
      ring.style.background = `conic-gradient(${u.def.color} ${k}%, rgba(20,20,28,0.9) ${k}%)`;
      setHTML(img, `<img src="${moduleIcon(u.m.key)}">`);
      setText(pct, k >= 100 ? 'READY' : `${k}%`);
      this.ultBtn.classList.toggle('ready', k >= 100);
      this.ultBtn.classList.remove('empty');
    } else {
      ring.style.background = 'rgba(20,20,28,0.9)';
      setHTML(img, '<span class="lock">?</span>');
      setText(pct, 'ULT');
      this.ultBtn.classList.remove('ready');
      this.ultBtn.classList.add('empty');
    }
    for (let i = 0; i < ACTIVE_SLOTS; i++) {
      const s = this.actSlots[i];
      const m = g.activeSlots[i] ? p.moduleById(g.activeSlots[i]) : undefined;
      const img2 = s.children[0] as HTMLDivElement, cd = s.children[1] as HTMLDivElement, tm = s.children[2] as HTMLDivElement;
      if (!m) {
        s.classList.add('empty');
        s.classList.remove('ready');
        setHTML(img2, '');
        cd.style.background = 'none';
        setText(tm, '');
        continue;
      }
      s.classList.remove('empty');
      const a = ACTIVES[MODULES[m.key].active!];
      setHTML(img2, `<img src="${moduleIcon(m.key)}">`);
      s.style.borderColor = a.color;
      const max = activeCooldown(g, a.key);
      if (m.cd > 0) {
        const pc = (m.cd / max) * 100;
        cd.style.background = `conic-gradient(rgba(5,5,10,0.72) ${pc}%, transparent ${pc}%)`;
        setText(tm, m.cd >= 10 ? String(Math.ceil(m.cd)) : m.cd.toFixed(1));
      } else {
        cd.style.background = 'none';
        setText(tm, '');
      }
      s.classList.toggle('ready', m.cd <= 0);
    }
  }

  /** Clickable level-up perk cards on the left side of the screen. */
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
    this.perkBox.appendChild(h('div', 'pk-head', `<img src="${portrait(c)}"><div><b>LEVEL UP!</b><br>${esc(c.name)} <small>L${c.level} ${esc(ROLES[c.role].name)}</small><br><small>Click a perk to learn it${pending > 1 ? ` · ${pending - 1} more waiting` : ''}</small></div>`));
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

  /** Research and forge progress under the objective. */
  private updateResearch(g: Game): void {
    if (g.mode !== 'world') {
      this.resBox.style.display = 'none';
      return;
    }
    const lines: string[] = [];
    for (const r of researchStatus(g)) {
      lines.push(`<div class="rw" data-open="tech" data-tab="${r.kind}"><small>${r.kind === 'military' ? 'RESEARCH' : 'PERSONNEL'}</small> ${esc(r.name)}<div class="bar"><div style="width:${r.pct * 100}%"></div></div><small>${Math.ceil(r.left)}s</small></div>`);
    }
    const job = g.forgeJob;
    if (job) {
      const w = [...g.armory, ...g.player.weapons().map((m) => m.weapon!)].find((k) => k.uid === job.uid);
      const sp = forgeSpeed(g);
      lines.push(`<div class="rw forge" data-open="arsenal" data-tab="weapons"><small>FORGE</small> ${esc(w ? WEAPONS[w.key].name : '?')} → ${job.to + 1}★<div class="bar"><div style="width:${(job.t / job.total) * 100}%"></div></div><small>${sp > 0 ? `${Math.ceil((job.total - job.t) / sp)}s` : 'no forge'}</small></div>`);
    }
    if (!g.research.military) lines.push(`<div class="rw idle" data-open="tech" data-tab="military"><small>RESEARCH</small> idle: click to pick a project</div>`);
    const html = lines.join('');
    setHTML(this.resBox, html);
    this.resBox.style.display = html ? 'block' : 'none';
  }

  private riderKey = '';

  private updateRider(g: Game): void {
    const t = g.outrider;
    let key = '';
    if (g.mode !== 'world') key = 'none';
    else if (!g.outriderUnlocked()) key = `locked:${g.mainCrew().length}`;
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
    if (key.startsWith('locked')) {
      this.rider.innerHTML = `<div class="rt">OUTRIDER <small>locked</small></div><div class="rd">Mini tank unlocks at <b>15 crew</b> aboard (${g.mainCrew().length}/15).</div>`;
      return;
    }
    if (key.startsWith('build')) {
      this.rider.innerHTML = `<div class="rt">OUTRIDER</div><div class="rd">${g.player.stats.garage ? g.outriderRebuild > 0 ? `Rebuilding... ${Math.ceil(g.outriderRebuild)}s` : 'Ready to launch from the Garage.' : 'Build a <b>Garage</b> on your base first.'}</div>`;
      if (g.player.stats.garage && g.outriderRebuild <= 0) {
        const b = button(g.outriderLevel ? 'Rebuild' : 'Launch', () => this.act.outrider('launch'));
        tooltip(b, () => `Cost: ${Object.entries(OUTRIDER_COST).map(([k, n]) => `${n} ${getItem(k).name}`).join(', ')}`);
        this.rider.appendChild(b);
      }
      return;
    }
    const o = g.outriderOrder;
    const status = o.mode === 'expedition' ? `Expedition: ${o.phase}` : o.mode === 'hold' ? 'Holding position' : 'Following';
    this.rider.innerHTML = `<div class="rt">OUTRIDER <small>${esc(status)}</small></div><div class="hp-mini"><div style="width:${(t!.hp / t!.stats.maxHp) * 100}%"></div></div><div class="rd">${g.outriderCrew().length}/${g.outriderCap()} side crew · hold ${t!.cargo.stacks().reduce((s, k) => s + k.n, 0)}</div>`;
    const row = h('div', 'rbtns');
    row.append(button('Follow', () => this.act.outrider('follow')), button('Hold', () => this.act.outrider('hold')), button('Send (J)', () => this.act.outrider('send')));
    this.rider.appendChild(row);
  }
}
