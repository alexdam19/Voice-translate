import { TILE } from '../shared/constants';
import type { Stack } from '../shared/inventory';
import { getItem } from '../shared/items';
import { EXTRACT_SECONDS } from '../shared/protocol';
import { HAZARD_INFO } from '../shared/types';
import type { ZoneDef } from '../shared/zones';
import { DEAD_ZONE } from '../shared/zones';
import { iconURL } from '../render/icons';
import type { Game, Panel } from '../game/game';
import { DRIVES, TERRAIN_NAMES } from '../game/rigDefs';
import { respawnPlayer } from '../game/systems/player';
import { threatAt, threatTier } from '../game/systems/enemies';
import { WarzoneClient } from '../game/warzone';
import { button, esc, h, itemTooltip, slotEl } from './dom';
import { Panels } from './panels';

interface Pickup {
  id: string;
  n: number;
  t: number;
  el: HTMLDivElement;
}

export class UI {
  readonly root: HTMLElement;
  private hud: HTMLDivElement;
  private tl: HTMLDivElement;
  private tc: HTMLDivElement;
  private tr: HTMLDivElement;
  private mini: HTMLCanvasElement;
  private coords: HTMLDivElement;
  private bc: HTMLDivElement;
  private hotbar: HTMLDivElement;
  private heldName: HTMLDivElement;
  private bl: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toasts: HTMLDivElement;
  private pickups: HTMLDivElement;
  private extract: HTMLDivElement;
  private boss: HTMLDivElement;
  private title: HTMLDivElement;
  readonly tooltip: HTMLDivElement;
  readonly cursorEl: HTMLDivElement;
  readonly panels: Panels;
  private pickupList: Pickup[] = [];
  private hotbarKey = '';
  private lastHud = '';
  private lastRig = '';
  private frame = 0;

  constructor(readonly g: Game) {
    this.root = document.getElementById('ui')!;
    this.hud = h('div', 'hud');
    this.root.appendChild(this.hud);

    this.tl = h('div', 'hud-tl frame');
    this.tc = h('div', 'hud-tc');
    this.tr = h('div', 'hud-tr frame');
    this.mini = h('canvas');
    this.mini.width = 220;
    this.mini.height = 130;
    this.coords = h('div', 'coords');
    this.tr.append(this.mini, this.coords);
    this.bc = h('div', 'hud-bc');
    this.heldName = h('div', 'held-name');
    this.hotbar = h('div', 'hotbar frame');
    this.bc.append(this.heldName, this.hotbar);
    this.bl = h('div', 'hud-bl frame hidden');
    this.prompt = h('div', 'prompt frame hidden');
    this.toasts = h('div', 'toasts');
    this.pickups = h('div', 'pickups');
    this.extract = h('div', 'extract frame hidden');
    this.boss = h('div', 'bossbar hidden');
    this.hud.append(this.boss, this.tl, this.tc, this.tr, this.bc, this.bl, this.prompt, this.toasts, this.pickups, this.extract);

    this.tooltip = h('div', 'tooltip hidden');
    this.cursorEl = h('div', 'cursor-stack hidden');
    this.root.append(this.tooltip, this.cursorEl);
    window.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX + 6}px`;
      this.cursorEl.style.top = `${e.clientY + 6}px`;
      if (!this.tooltip.classList.contains('hidden')) {
        this.tooltip.style.left = `${Math.min(window.innerWidth - 290, e.clientX + 16)}px`;
        this.tooltip.style.top = `${Math.min(window.innerHeight - 120, e.clientY + 16)}px`;
      }
    });

    this.title = h('div', 'title');
    this.root.appendChild(this.title);
    this.panels = new Panels(this);
    this.buildTitle();
    this.hud.classList.add('hidden');
  }

  /* ---------------- Title ---------------- */

  showTitle(on: boolean): void {
    this.title.classList.toggle('hidden', !on);
    this.hud.classList.toggle('hidden', on);
    if (on) {
      this.panels.close();
      this.buildTitle();
    }
  }

  private buildTitle(): void {
    const g = this.g;
    this.title.innerHTML = '';
    this.title.append(h('div', 'logo', 'IRONCRAWL'), h('div', 'tagline', 'FORTIFY YOUR RIG · CROSS THE DEAD WORLD · RAID THE DEAD ZONE'));
    const menu = h('div', 'menu frame');
    if (g.hasSave()) menu.appendChild(button('▶ CONTINUE RUN', () => g.loadGame(), 'primary'));
    menu.appendChild(button('✚ NEW RUN', () => {
      const start = (): void => {
        const seedStr = (menu.querySelector('#seed') as HTMLInputElement | null)?.value.trim();
        const seed = seedStr ? Number.parseInt(seedStr, 10) || hashString(seedStr) : undefined;
        g.newGame(seed);
      };
      if (g.hasSave()) this.ask('START A NEW RUN?', 'Your current save will be overwritten.', 'OVERWRITE & START', start, true);
      else start();
    }, g.hasSave() ? '' : 'primary'));
    const nameLbl = h('label', 'field', 'CALLSIGN');
    const name = h('input', 'text') as HTMLInputElement;
    name.value = g.settings.name;
    name.maxLength = 16;
    name.addEventListener('change', () => {
      g.settings.name = name.value.trim() || 'Drifter';
      g.saveSettings();
    });
    const seedLbl = h('label', 'field', 'WORLD SEED (optional)');
    const seed = h('input', 'text') as HTMLInputElement;
    seed.id = 'seed';
    seed.placeholder = 'random';
    menu.append(nameLbl, name, seedLbl, seed);
    menu.appendChild(button('⌨ CONTROLS', () => this.panels.showHelpOverlay()));
    this.title.appendChild(menu);
    this.title.appendChild(h('div', 'touch-note', 'IRONCRAWL is played with a keyboard and mouse. Open it in a desktop browser.'));
    this.title.appendChild(h('div', 'foot', 'Single-player runs in the browser. The Dead Zone (multiplayer) needs the server: <kbd>npm run dev</kbd>'));
  }

  /** In-page yes/no prompt (browser confirm() dialogs are not always available). */
  ask(title: string, body: string, okLabel: string, onOk: () => void, danger = false): void {
    const shade = h('div', 'ask-shade');
    const box = h('div', 'ask frame');
    box.appendChild(h('h2', '', esc(title)));
    box.appendChild(h('div', 'note', esc(body)));
    const row = h('div', 'row');
    row.style.gap = '8px';
    row.style.marginTop = '12px';
    const close = (): void => shade.remove();
    row.appendChild(button(okLabel, () => {
      close();
      onOk();
    }, danger ? 'danger' : 'primary'));
    row.appendChild(button('CANCEL', close));
    box.appendChild(row);
    shade.appendChild(box);
    this.root.appendChild(shade);
  }

  /* ---------------- Panels ---------------- */

  onPanel(p: Panel): void {
    this.panels.open(p);
  }

  confirmWarzone(): void {
    this.panels.confirmWarzone();
  }

  openLoot(id: number): void {
    this.panels.openLoot(id);
  }

  refreshLoot(): void {
    this.panels.refreshLoot();
  }

  warzoneDeath(by: string, lost: Stack[]): void {
    this.panels.deathScreen(`KILLED BY ${by.toUpperCase()}`, lost, () => this.g.warzone?.finish('You wake up back at your rig. Your pack is gone.', '#ff5252'));
  }

  /* ---------------- Notifications ---------------- */

  toast(msg: string, color = '#e0e0e0'): void {
    const t = h('div', 'toast');
    t.style.color = color;
    t.innerHTML = `<span>${esc(msg)}</span>`;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 6) this.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), 6000);
  }

  pickupNote(id: string, n: number): void {
    if (n <= 0) return;
    const existing = this.pickupList.find((p) => p.id === id);
    if (existing) {
      existing.n += n;
      existing.t = 2.5;
      existing.el.innerHTML = `<img src="${iconURL(id)}"> +${existing.n} ${esc(getItem(id).name)}`;
      return;
    }
    const el = h('div', '', `<img src="${iconURL(id)}"> +${n} ${esc(getItem(id).name)}`);
    this.pickups.appendChild(el);
    this.pickupList.push({ id, n, t: 2.5, el });
    if (this.pickupList.length > 7) {
      const old = this.pickupList.shift()!;
      old.el.remove();
    }
  }

  zoneBanner(z: ZoneDef | null): void {
    const zone = z ?? DEAD_ZONE;
    const b = h('div', 'banner');
    b.style.color = zone.accent;
    const hz = zone.hazard ? `<div class="req" style="color:${HAZARD_INFO[zone.hazard].color}">HAZARD: ${HAZARD_INFO[zone.hazard].name.toUpperCase()}</div> ` : '';
    b.innerHTML = `<h1>${esc(zone.name)}</h1><p>${esc(zone.tagline)}</p>${hz}<div class="req">${esc(zone.requirement)}</div>`;
    this.hud.appendChild(b);
    setTimeout(() => b.remove(), 4600);
    if (z) this.g.audio.play('alarm', 0.4);
  }

  showTooltip(html: string | null): void {
    if (!html) {
      this.tooltip.classList.add('hidden');
      return;
    }
    this.tooltip.innerHTML = html;
    this.tooltip.classList.remove('hidden');
  }

  /* ---------------- Per-frame HUD ---------------- */

  update(): void {
    const g = this.g;
    this.frame++;
    if (g.state !== 'playing') return;
    const p = g.player;
    const s = g.sim;
    this.panels.update();

    // Top-left vitals
    const gad = p.gadget ? getItem(p.gadget).gadget : undefined;
    const hudKey = [Math.ceil(p.hp), Math.round(p.energy), gad ? Math.round((p.fuel / gad.fuel) * 20) : -1, p.suit, p.exposure, g.zone.key, p.armor].join('|');
    if (hudKey !== this.lastHud) {
      this.lastHud = hudKey;
      const pct = (v: number, m: number): string => `${Math.max(0, Math.min(100, (v / m) * 100))}%`;
      let html = `<div class="bar hp"><i style="width:${pct(p.hp, p.maxHp)}"></i><span>HEALTH ${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}</span></div>`;
      html += `<div class="bar en"><i style="width:${pct(p.energy, p.maxEnergy)}"></i><span>ENERGY ${Math.round(p.energy)}</span></div>`;
      if (gad) html += `<div class="bar fuel"><i style="width:${pct(p.fuel, gad.fuel)}"></i><span>JET FUEL</span></div>`;
      html += '<div class="chips">';
      html += `<span class="chip" style="color:#90a4ae">ARMOR ${p.armor}</span>`;
      if (p.suit) html += `<span class="chip" style="color:#80deea">${esc(getItem(p.suit).name.toUpperCase())}</span>`;
      const hz = s.kind === 'world' ? g.zone.hazard : null;
      if (hz) {
        const exposed = p.exposure === hz;
        html += `<span class="chip ${exposed ? 'blink' : ''}" style="color:${HAZARD_INFO[hz].color}">${HAZARD_INFO[hz].short} ${exposed ? 'EXPOSED' : 'SHIELDED'}</span>`;
      }
      html += '</div>';
      this.tl.innerHTML = html;
    }

    // Top-center: zone / time
    if (this.frame % 15 === 0) {
      if (s.kind === 'warzone') {
        const wz = g.warzone;
        this.tc.innerHTML = `<b style="color:#ff1744">THE DEAD ZONE</b>${wz ? `${wz.players} raider${wz.players === 1 ? '' : 's'} online · your pack is at risk` : ''}`;
      } else {
        const hours = Math.floor(g.dayTime * 24), mins = Math.floor((g.dayTime * 24 * 60) % 60);
        const night = g.dayTime > 0.78 || g.dayTime < 0.22;
        const wx = g.weather.kind && g.weather.strength > 0.3 ? ` · <span style="color:${g.zone.accent}">${g.weather.kind.toUpperCase()}</span>` : '';
        const threat = threatAt(s.world, Math.floor(p.cx / TILE), Math.floor(p.cy / TILE));
        const tier = threatTier(threat);
        const tcol = threat < 1.6 ? '#69f0ae' : threat < 2.2 ? '#ffd740' : threat < 4 ? '#ff9100' : '#ff1744';
        this.tc.innerHTML = `<b style="color:${g.zone.accent}">${g.zone.name}</b>${night ? 'NIGHT' : 'DAY'} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}${wx}<br><span class="threat" style="color:${tcol}">THREAT ${tier.name} · ${threat.toFixed(1)} · ${tier.label.toUpperCase()}</span>`;
      }
    }

    // Minimap
    if (this.frame % 3 === 0) this.drawMinimap();

    // Titan boss bar
    if (this.frame % 5 === 0) {
      let boss: (typeof s.enemies)[number] | null = null;
      let bd = 100 * TILE;
      for (const e of s.enemies) {
        if (e.kind !== 'titan' || e.dead) continue;
        const d = Math.abs(e.cx - p.cx);
        if (d < bd) {
          bd = d;
          boss = e;
        }
      }
      if (boss) {
        this.boss.classList.remove('hidden');
        this.boss.style.color = boss.titan!.def.glow;
        this.boss.innerHTML = `${esc(boss.name.toUpperCase())}${boss.titan!.burrowed ? ' · BURROWED' : ''}<div class="bar"><i style="width:${Math.max(0, (boss.hp / boss.maxHp) * 100)}%"></i></div>`;
      } else {
        this.boss.classList.add('hidden');
      }
    }

    // Hotbar
    const hk = JSON.stringify(p.inv.slots.slice(0, 10)) + p.selected;
    if (hk !== this.hotbarKey) {
      this.hotbarKey = hk;
      this.hotbar.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const st = p.inv.slots[i];
        const el = slotEl(st, i === p.selected ? 'sel' : '');
        el.appendChild(h('span', 'k', String((i + 1) % 10)));
        el.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (g.panel === 'inventory') this.panels.slotClick(p.inv, i, e);
          else p.selected = i;
        });
        el.addEventListener('mouseenter', () => st && this.showTooltip(itemTooltip(st.id)));
        el.addEventListener('mouseleave', () => this.showTooltip(null));
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        this.hotbar.appendChild(el);
      }
      const held = p.held();
      let label = held ? getItem(held.id).name : '';
      const w = held ? getItem(held.id).weapon : undefined;
      if (w?.ammo && w.ammo !== 'grenade') label += ` · ${p.inv.count(w.ammo)} ${getItem(w.ammo).name}`;
      this.heldName.textContent = label;
    }

    // Rig status
    this.updateRigHud();

    // Interaction prompt
    if (g.interact && !p.dead && !g.panel) {
      const txt = `<kbd>F</kbd>${esc(g.interact.label)}`;
      if (this.prompt.innerHTML !== txt) this.prompt.innerHTML = txt;
      this.prompt.classList.remove('hidden');
    } else {
      this.prompt.classList.add('hidden');
    }

    // Extraction
    const wz = g.warzone;
    if (s.kind === 'warzone' && wz && wz.extractT > 0) {
      this.extract.classList.remove('hidden');
      this.extract.textContent = `EXTRACTING ${Math.min(100, Math.floor((wz.extractT / EXTRACT_SECONDS) * 100))}% — HOLD POSITION`;
    } else {
      this.extract.classList.add('hidden');
    }

    // Pickups fade
    for (const pk of this.pickupList) pk.t -= 1 / 60;
    for (const pk of this.pickupList.filter((q) => q.t <= 0)) pk.el.remove();
    this.pickupList = this.pickupList.filter((q) => q.t > 0);
  }

  private updateRigHud(): void {
    const g = this.g;
    const r = g.playerRig;
    const p = g.player;
    const show = !!r && g.sim.kind === 'world' && (p.driving === r || r.contains(p.cx, p.cy, 20 * TILE));
    this.bl.classList.toggle('hidden', !show || g.panel === 'build');
    this.tl.classList.toggle('hidden', g.panel === 'build');
    if (!show || !r || this.frame % 6 !== 0) return;
    const drive = DRIVES[r.drive];
    const speed = Math.abs(r.vx) / TILE;
    const integ = Math.round(r.integrity() * 100);
    const warnings: string[] = [];
    if (!r.hasCockpit) warnings.push('NO COMMAND BRIDGE');
    if (r.powerUse > r.powerProd) warnings.push(`POWER DEFICIT ${r.powerProd}/${r.powerUse}`);
    if (r.bogged) warnings.push(`BOGGED IN ${TERRAIN_NAMES[r.terrain].toUpperCase()}`);
    if (r.straining) warnings.push('STRAINING UPHILL');
    if (r.drilling) warnings.push('DRILLING');
    const hz = g.zone.hazard;
    if (hz && !r.isProtected(hz)) warnings.push(`HULL EXPOSED: ${HAZARD_INFO[hz].short}`);
    if (r.terrain === 'liquid' && !drive.hover) warnings.push('WADING IN LIQUID');
    const unmanned = r.modules.filter((m) => m.def.turret && !m.crewed).length;
    if (unmanned) warnings.push(`${unmanned} TURRET${unmanned > 1 ? 'S' : ''} UNCREWED`);
    const key = [integ, Math.round(speed * 10), r.powerProd, r.powerUse, r.crew.length, r.bunks, Math.round(r.shield), r.terrain, r.drive, warnings.join()].join('|');
    if (key === this.lastRig) return;
    this.lastRig = key;
    let html = `<h3>${esc(r.name.toUpperCase())}</h3>`;
    html += `<div class="bar hull"><i style="width:${integ}%"></i><span>HULL ${integ}%</span></div>`;
    if (r.shieldMax > 0) html += `<div class="bar shield"><i style="width:${(r.shield / r.shieldMax) * 100}%"></i><span>SHIELD ${Math.round(r.shield)}</span></div>`;
    html += `<div class="kv"><span>SPEED</span><b>${speed.toFixed(1)} t/s</b></div>`;
    html += `<div class="kv"><span>POWER</span><b class="${r.powerUse > r.powerProd ? 'warn' : ''}">${r.powerProd} / ${r.powerUse}</b></div>`;
    html += `<div class="kv"><span>DRIVE</span><b>${drive.name} on ${TERRAIN_NAMES[r.terrain]} (${Math.round(r.traction.speed * 100)}%)</b></div>`;
    html += `<div class="kv"><span>CREW</span><b>${r.crew.length} / ${r.bunks} bunks</b></div>`;
    for (const w of warnings) html += `<div class="warn">▲ ${w}</div>`;
    this.bl.innerHTML = html;
  }

  private drawMinimap(): void {
    const g = this.g;
    const mm = g.minimap;
    const ctx = this.mini.getContext('2d')!;
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, 220, 130);
    if (!mm) return;
    const p = g.player;
    const scale = 0.5;
    const vw = 220 / scale, vh = 130 / scale;
    const cx = p.cx / TILE, cy = p.cy / TILE;
    const sx = cx - vw / 2, sy = cy - vh / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mm.canvas, sx, sy, vw, vh, 0, 0, 220, 130);
    const toMini = (wx: number, wy: number): [number, number] => [(wx / TILE - sx) * scale, (wy / TILE - sy) * scale];
    const s = g.sim;
    for (const r of s.rigs) {
      const [x, y] = toMini(r.x, r.y);
      ctx.strokeStyle = r === g.playerRig ? '#ffb74d' : r.wrecked ? '#777' : '#ff5252';
      ctx.strokeRect(x, y, (r.cols) * scale, r.rows * scale);
    }
    const radar = g.playerRig && s.kind === 'world' ? g.playerRig.radar : 0;
    if (radar > 0) {
      ctx.fillStyle = '#ff5252';
      for (const e of s.enemies) {
        const [x, y] = toMini(e.cx, e.cy);
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    for (const r of s.remotes.values()) {
      const [x, y] = toMini(r.x, r.y);
      ctx.fillStyle = r.bot ? '#ff5252' : '#ffd740';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const c of s.crates.values()) {
      const [x, y] = toMini(c.x, c.y);
      ctx.fillStyle = c.kind === 'supply' ? '#ff1744' : '#ffd740';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const e of s.extracts) {
      const [x, y] = toMini(e.x, e.y);
      ctx.strokeStyle = '#69f0ae';
      ctx.strokeRect(x, y, (e.w / TILE) * scale, (e.h / TILE) * scale);
    }
    if (s.kind === 'world') {
      const ck = g.gen.checkpoint;
      const [x, y] = toMini(ck.x * TILE, ck.ground * TILE);
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(x - 2, y - 6, 4, 6);
    }
    ctx.fillStyle = '#6af0ff';
    ctx.fillRect(110 - 2, 65 - 2, 4, 4);
    const txt = `X ${Math.floor(cx)} · DEPTH ${Math.max(0, Math.floor(cy - (s.world.surface[Math.floor(cx)] ?? 0)))}`;
    if (this.coords.textContent !== txt + 'M') this.coords.innerHTML = `<span>${txt}</span><span>M: map</span>`;
  }

  respawn(): void {
    const g = this.g;
    if (g.sim.kind === 'warzone') {
      g.warzone?.finish('You wake up back at your rig.', '#ff5252');
      return;
    }
    respawnPlayer(g, true);
    g.panel = null;
    this.panels.close();
  }

  defaultServer(): string {
    return this.g.settings.server || WarzoneClient.defaultUrl();
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
