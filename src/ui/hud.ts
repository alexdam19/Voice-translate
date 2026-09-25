import { OFFICER_LABELS, OFFICER_SLOTS } from '../shared/constants';
import { getItem } from '../shared/items';
import { RUNE_INFO, TIER_NAMES, threatAt, threatTier } from '../shared/mapgen';
import { RARITIES } from '../shared/rarity';
import { WEAPONS, weaponScore } from '../shared/weapons';
import { ZONES } from '../shared/zones';
import { abilityCooldown, abilityOf, abilityPower, ROLES } from '../game/crew';
import { chassisDef, DRIVE_INFO } from '../game/defs';
import type { Game } from '../game/game';
import { OUTRIDER_COST } from '../game/systems/outrider';
import { abilityIcon, itemIcon, portrait, weaponIcon } from '../render/icons';
import { button, esc, h, tooltip } from './dom';
import { OBJECTIVES } from './objectives';

export interface HudActions {
  openPanel(name: string, tab?: string): void;
  cast(slot: number): void;
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
    tl.append(this.zone, this.obj);
    const tr = h('div', 'hud-tr');
    tr.append(this.menu, this.res);
    const tc = h('div', 'hud-tc');
    tc.append(this.boss, this.buffs, this.hazard, this.toasts);
    this.root.append(tl, tr, tc, this.rider, this.hint, this.death);
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
    mk('base', 'BASE', 'B · upgrade tank', 'big base');
    mk('crew', 'CREW', 'C · upgrade people', 'big crew');
    mk('tech', 'TECH', 'T');
    mk('cargo', 'CARGO', 'I');
    mk('map', 'MAP', 'M');
    mk('help', '?', 'H');
    // Command bar
    const left = h('div', 'cb-left');
    const hp = h('div', 'hp-bar');
    hp.append(this.hpFill, this.shFill, this.hpText);
    left.append(this.tankInfo, hp);
    const abil = h('div', 'abilities');
    for (let i = 0; i < OFFICER_SLOTS; i++) {
      const s = h('div', 'ab-slot');
      s.innerHTML = `<div class="ab-img"></div><div class="ab-portrait"></div><div class="ab-cd"></div><div class="ab-time"></div><div class="ab-key">${OFFICER_LABELS[i]}</div>`;
      s.addEventListener('click', (e) => {
        e.stopPropagation();
        act.cast(i);
      });
      tooltip(s, () => this.abilityTip(i));
      this.slots.push(s);
      abil.appendChild(s);
    }
    const right = h('div', 'cb-right');
    this.kitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.useKit();
    });
    tooltip(this.kitBtn, () => `<h4>Repair Kit</h4><div>Press 1: restore 25% hull over 3s.</div><div class="d">Craft more in CARGO > Workshop.</div>`);
    this.autoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.toggleAutoFire();
    });
    tooltip(this.autoBtn, () => `<h4>Auto-fire (Z)</h4><div>ON: every weapon set to AUTO picks targets and fires by itself.</div><div>OFF: all weapons aim at your cursor and fire while you hold left mouse.</div><div class="d">Click a weapon icon to switch just that one.</div>`);
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

  private abilityTip(i: number): string {
    const g = this.game;
    if (!g) return '';
    const c = g.officers()[i];
    if (!c) return `<h4>Empty officer seat (${OFFICER_LABELS[i]})</h4><div>Assign a main-crew officer in CREW (C) > Officers.</div>`;
    const a = abilityOf(c);
    const P = abilityPower(c);
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
    const res = ['scrap', 'iron_plate', 'circuit', 'titanium_alloy', 'tech_parts'].map((id) => `<span title="${getItem(id).name}"><img src="${itemIcon(id)}">${p.cargo.count(id)}</span>`);
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
    const techParts = p.cargo.count('tech_parts');
    this.badges.get('tech')!.style.display = techParts >= 2 ? 'block' : 'none';
    this.badges.get('tech')!.textContent = techParts >= 2 ? '+' : '';
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
      const names: Record<string, string> = { barrage: 'Barrage', nitro: 'Nitro', invuln: 'Invulnerable', deadeye: 'Deadeye', meltdown: 'Meltdown', armorUp: 'Nanites', barrier: 'Barrier', harvestUp: 'Fast Harvest', stun: 'STUNNED', chill: 'Frozen', regen: 'Repairing' };
      if (names[k]) b.push(`<span>${names[k]} ${Math.ceil(v.t)}s</span>`);
    }
    if (g.chestBonus > 0) b.push('<span style="color:#ffd23f">Next chest +1 rarity</span>');
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
    for (let i = 0; i < OFFICER_SLOTS; i++) {
      const s = this.slots[i];
      const c = off[i];
      const img = s.children[0] as HTMLDivElement, por = s.children[1] as HTMLDivElement, cd = s.children[2] as HTMLDivElement, tm = s.children[3] as HTMLDivElement;
      if (!c) {
        s.classList.add('empty');
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
        const el = h('div', `wpn ${auto ? 'auto' : 'manual'}`, `<img src="${weaponIcon(w.key, w.rarity)}"><span>${auto ? 'AUTO' : 'MAN'}</span>`);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.act.toggleWeapon(m.id);
        });
        el.addEventListener('mouseenter', () => this.act.hoverWeapon(m.stats?.range ?? 0));
        el.addEventListener('mouseleave', () => this.act.hoverWeapon(0));
        tooltip(el, () => `<h4 style="color:${RARITIES[w.rarity].color}">${RARITIES[w.rarity].name} ${esc(d.name)}</h4><div>${m.stats ? `${Math.round(m.stats.dmg)} dmg${m.stats.pellets > 1 ? ` ×${m.stats.pellets}` : ''} · ${m.stats.rate.toFixed(2)}/s · range ${Math.round(m.stats.range)}` : ''}</div><div>DPS score ${weaponScore(w)}</div><div class="d">Click to switch ${auto ? 'to MANUAL (aims at cursor, hold left mouse to fire)' : 'to AUTO (aims and fires by itself)'}.</div>`);
        this.weaponsRow.appendChild(el);
      }
      if (!ws.length) this.weaponsRow.innerHTML = '<div class="nowpn">No weapons mounted — BASE > Armory</div>';
    }
    // Weapon cooldown flashes
    const wels = this.weaponsRow.children;
    for (let i = 0; i < ws.length && i < wels.length; i++) (wels[i] as HTMLElement).classList.toggle('firing', ws[i].recoil > 0.6);
    setHTML(this.kitBtn, `<img src="${itemIcon('repair_kit')}"><span class="k">1</span><span class="n">${p.cargo.count('repair_kit')}</span>`);
    setHTML(this.autoBtn, `<b>${g.autoFire ? 'AUTO' : 'MANUAL'}</b><small>FIRE · Z</small>`);
    this.autoBtn.classList.toggle('off', !g.autoFire);
    // Outrider card
    this.updateRider(g);
    // Death
    if (p.dead && g.mode === 'world') {
      this.death.style.display = 'flex';
      setHTML(this.death, `<div><h2>FORTRESS DISABLED</h2><p>Your crew is towing it back to camp... ${Math.ceil(g.respawnIn)}</p><p class="d">You lost a quarter of your scrap. Some crew were wounded.</p></div>`);
    } else this.death.style.display = 'none';
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
    row.append(button('Follow', () => this.act.outrider('follow')), button('Hold', () => this.act.outrider('hold')), button('Send (G)', () => this.act.outrider('send')));
    this.rider.appendChild(row);
  }
}
