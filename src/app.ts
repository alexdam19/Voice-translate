import { ACTIVE_KEYS, CENTER, KIT_KEY, OFFICER_KEYS, ULT_KEY } from './shared/constants';
import { NODE_INFO, RUNE_INFO, SITE_INFO } from './shared/mapgen';
import { Audio } from './game/audio';
import type { ChestKind, Reward } from './game/entities';
import { Game } from './game/game';
import { Input } from './game/input';
import { deserialize, loadSave, saveGame } from './game/save';
import { choosePerk } from './game/actions';
import { castActive, castUltimate } from './game/systems/arsenal';
import { castAbility } from './game/systems/crewsys';
import { orderAttack, orderHarvest, orderInteract, orderMove } from './game/systems/orders';
import { launchOutrider, OUTRIDER_COST, sendOutrider } from './game/systems/outrider';
import { installHandlers, stepWorld } from './game/systems/step';
import { Minimap } from './render/minimap';
import { Overlay } from './render/overlay';
import { View } from './render/view';
import { ChestUI } from './ui/chest';
import { CURSORS, initCursors } from './ui/cursors';
import { hideTip } from './ui/dom';
import { Hud } from './ui/hud';
import { OBJECTIVES } from './ui/objectives';
import { Panels } from './ui/panels';
import { Title } from './ui/title';
import { DeadZoneClient } from './net/deadzone';

const STEP = 1 / 60;

interface Hover {
  kind: 'enemy' | 'tank' | 'node' | 'site' | 'rune' | 'gate' | 'pickup' | 'ground';
  id: number;
  x: number;
  y: number;
  label: string;
}

export class App {
  game!: Game;
  view: View;
  overlay: Overlay;
  minimap = new Minimap();
  input: Input;
  audio = new Audio();
  hud: Hud;
  panels: Panels;
  chest: ChestUI;
  title: Title;
  camLocked = true;
  paused = false;
  private acc = 0;
  private last = 0;
  private hover: Hover | null = null;
  private rmbT = 0;
  sendMode = false;
  private objT = 0;
  private saveT = 30;
  running = false;
  dz: DeadZoneClient | null = null;
  private mapCtx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    initCursors();
    this.view = new View(canvas);
    this.overlay = new Overlay(overlayCanvas, this.view);
    this.input = new Input(canvas);
    this.hud = new Hud(uiRoot, {
      openPanel: (n, t) => this.panels.open(n, t),
      cast: (i) => this.cast(i),
      castActive: (i) => this.castActive(i),
      castUlt: () => this.castUlt(),
      pickPerk: (crewId, idx) => this.pickPerk(crewId, idx),
      toggleWeapon: (id) => this.toggleWeapon(id),
      toggleAutoFire: () => this.toggleAutoFire(),
      useKit: () => this.useKit(),
      outrider: (c) => this.outriderCmd(c),
      hoverWeapon: (r) => (this.view.rangeR = r),
      minimapClick: (x, y, right) => this.minimapClick(x, y, right),
    });
    this.mapCtx = this.hud.minimap.getContext('2d')!;
    this.panels = new Panels(uiRoot, this);
    this.chest = new ChestUI(uiRoot, this);
    this.title = new Title(uiRoot, this);
    window.addEventListener('resize', () => {
      this.view.resize();
      this.overlay.resize();
    });
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    canvas.addEventListener('mousedown', () => this.audio.unlock());
    window.addEventListener('keydown', () => this.audio.unlock());
    requestAnimationFrame((t) => this.frame(t));
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  newGame(seed = Math.floor(Math.random() * 1e9)): void {
    this.start(new Game(seed));
    this.hud.toast('Welcome, Commander. Drive with WASD (or right-click). Your guns fire on their own.', '#ffd740');
    this.panels.open('help');
  }

  continueGame(): boolean {
    const d = loadSave();
    if (!d) return false;
    this.start(deserialize(d));
    this.hud.toast('Welcome back, Commander.', '#ffd740');
    return true;
  }

  start(g: Game): void {
    this.game = g;
    installHandlers(g);
    g.hooks = {
      toast: (t, c) => this.hud.toast(t, c),
      sound: (n, x, y, v) => this.sound(n, x, y, v),
      chest: (k, r, choice) => this.openChest(k, r, choice),
      died: () => this.sound('alarm'),
      enterDeadZone: () => this.enterDeadZone(),
    };
    this.view.setWorld(g);
    this.view.cam.x = g.player.x;
    this.view.cam.y = g.player.y;
    this.running = true;
    this.title.hide();
    this.saveT = 30;
  }

  save(): void {
    if (this.running && this.game && this.game.mode === 'world') saveGame(this.game);
  }

  sound(name: string, x?: number, y?: number, vol = 1): void {
    let v = vol;
    if (x !== undefined && y !== undefined) {
      const d = Math.hypot(x - this.view.cam.x, y - this.view.cam.y);
      v *= Math.max(0, Math.min(1, 1 - (d - 18) / 45));
    }
    this.audio.play(name, v);
  }

  openChest(kind: ChestKind, rewards: Reward[], choice: boolean): void {
    this.chest.show(kind, rewards, choice);
  }

  get uiBlocking(): boolean {
    return this.panels.isOpen || this.chest.isOpen || this.title.isOpen;
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  cast(slot: number): void {
    const g = this.game;
    if (!g || g.player.dead) return;
    if (castAbility(g, slot, g.aim.x, g.aim.y)) this.view.moveMarker(g.aim.x, g.aim.y, '#ea80fc');
  }

  castActive(slot: number): void {
    const g = this.game;
    if (!g || g.player.dead) return;
    if (castActive(g, slot, g.aim.x, g.aim.y)) this.view.moveMarker(g.aim.x, g.aim.y, '#ff4081');
  }

  castUlt(): void {
    const g = this.game;
    if (!g || g.player.dead) return;
    if (castUltimate(g, g.aim.x, g.aim.y)) {
      this.view.moveMarker(g.aim.x, g.aim.y, '#ff1744');
      this.sound('ability');
    }
  }

  pickPerk(crewId: number, idx: number): void {
    const r = choosePerk(this.game, crewId, idx);
    if (r.ok) this.sound('levelup');
    else this.hud.toast(r.msg, '#ff8a80');
  }

  toggleWeapon(id: number): void {
    const m = this.game.player.moduleById(id);
    if (!m) return;
    if (!this.game.autoFire) {
      this.game.autoFire = true;
      for (const w of this.game.player.weapons()) w.mode = w.id === id ? 'auto' : 'manual';
    } else m.mode = m.mode === 'auto' ? 'manual' : 'auto';
    this.sound('ui');
  }

  toggleAutoFire(): void {
    this.game.autoFire = !this.game.autoFire;
    if (this.game.autoFire) for (const w of this.game.player.weapons()) w.mode = 'auto';
    this.hud.toast(this.game.autoFire ? 'Auto-fire ON (Y): guns pick their own targets.' : 'Manual fire (Y): guns aim at your cursor. Hold left mouse to shoot.', '#4dd0e1');
    this.sound('ui');
  }

  useKit(): void {
    const p = this.game.player;
    if (p.dead) return;
    if (p.cargo.count('repair_kit') <= 0) {
      this.hud.toast('No repair kits (5). Craft them in CARGO > Workshop.', '#ff8a80');
      return;
    }
    if (p.hp >= p.stats.maxHp) return;
    p.cargo.take('repair_kit', 1);
    p.addBuff('regen', 3, (p.stats.maxHp * 0.25) / 3);
    this.game.fx.push({ t: 'heal', x: p.x, y: p.y });
    this.sound('craft');
  }

  outriderCmd(c: 'follow' | 'hold' | 'send' | 'launch'): void {
    const g = this.game;
    if (c === 'launch') {
      if (!g.outriderUnlocked()) return;
      if (!g.pay(OUTRIDER_COST)) {
        this.hud.toast('Not enough materials to build the Outrider.', '#ff8a80');
        return;
      }
      if (g.outriderLevel === 0) g.outriderLevel = 1;
      launchOutrider(g);
      this.hud.toast('Outrider launched! Assign side crew in CREW > Outrider, then send it for resources.', '#76ff03');
      this.sound('build');
      return;
    }
    if (!g.outrider) return;
    if (c === 'follow') g.outriderOrder = { mode: 'follow' };
    else if (c === 'hold') g.outriderOrder = { mode: 'hold', x: g.outrider.x, y: g.outrider.y };
    else {
      this.sendMode = true;
      this.hud.toast('Right-click a resource node or loot area to send the Outrider there.', '#26c6da');
    }
  }

  minimapClick(fx: number, fy: number, right: boolean): void {
    const g = this.game;
    if (!g) return;
    const x = fx * g.map.size, y = fy * g.map.size;
    if (right) {
      if (orderMove(g, x, y)) this.view.moveMarker(x, y);
    } else {
      this.camLocked = false;
      this.view.cam.x = x;
      this.view.cam.y = y;
    }
  }

  enterDeadZone(): void {
    this.panels.confirm(
      'Enter the Dead Zone?',
      'Multiplayer warzone. If your fortress is destroyed there, you drop your cargo hold (except Vault slots), all spare weapons in your armory and one mounted weapon for other players to loot. Extract to keep everything you find.',
      'Deploy',
      () => {
        this.save();
        this.dz = new DeadZoneClient(this);
        void this.dz.start();
      },
    );
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    if (!this.running || !this.game) {
      this.input.endFrame();
      return;
    }
    const g = this.game;
    this.handleKeys();
    this.readDrive();
    if (!this.uiBlocking) this.handleMouse(dt);
    const paused = this.paused || (this.panels.isOpen && this.panels.pauses) || this.chest.isOpen;
    if (!paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        if (this.dz) this.dz.step(STEP);
        else stepWorld(g, STEP);
        this.acc -= STEP;
        steps++;
        if (steps === 1) this.input.endFrame();
      }
      if (steps === 0) this.input.endFrame();
      if (this.acc > STEP * 5) this.acc = 0;
    } else this.input.endFrame();
    this.updateCamera(dt);
    this.view.render(g, paused ? 0 : dt);
    this.overlay.draw(g, this.hover?.kind === 'enemy' ? this.hover.id : 0);
    this.minimap.draw(this.mapCtx, 220, 220, g, this.view, false);
    this.hud.update(g);
    this.panels.tick();
    this.audio.engine(g.player.speed, !g.player.dead && !paused);
    // Objectives & autosave
    this.objT -= dt;
    if (this.objT <= 0 && g.mode === 'world') {
      this.objT = 0.5;
      const o = OBJECTIVES[g.objective];
      if (o && o.done(g)) {
        for (const [id, n] of Object.entries(o.reward)) g.give(id, n, true);
        this.hud.toast(`Objective complete: ${o.title}!`, '#76ff03');
        this.sound('levelup');
        g.objective++;
      }
    }
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 30;
      this.save();
    }
  }

  private updateCamera(dt: number): void {
    const g = this.game;
    const v = this.view;
    const m = this.input.mouse;
    if (m.wheel && !m.overUI) v.cam.zoom = Math.max(20, Math.min(62, v.cam.zoom + m.wheel * 3));
    const center = this.input.down('Space');
    if (this.camLocked || center) {
      const k = 1 - Math.pow(0.0005, dt);
      v.cam.x += (g.player.x - v.cam.x) * k;
      v.cam.y += (g.player.y - v.cam.y) * k;
    } else {
      const sp = v.cam.zoom * 1.4 * dt;
      const edge = 14;
      if (!this.uiBlocking && m.inside) {
        if (m.x < edge) v.cam.x -= sp;
        if (m.x > v.width - edge) v.cam.x += sp;
        if (m.y < edge) v.cam.y -= sp;
        if (m.y > v.height - edge) v.cam.y += sp;
      }
      v.cam.x = Math.max(0, Math.min(g.map.size, v.cam.x));
      v.cam.y = Math.max(0, Math.min(g.map.size, v.cam.y));
    }
  }

  /** WASD / arrow keys drive the fortress (screen-relative, or tank-style from the menu). */
  private readDrive(): void {
    const g = this.game;
    const i = this.input;
    const di = g.driveInput;
    if (this.uiBlocking || g.player.dead) {
      di.active = false;
      return;
    }
    const x = (i.down('KeyD') || i.down('ArrowRight') ? 1 : 0) - (i.down('KeyA') || i.down('ArrowLeft') ? 1 : 0);
    const y = (i.down('KeyS') || i.down('ArrowDown') ? 1 : 0) - (i.down('KeyW') || i.down('ArrowUp') ? 1 : 0);
    di.x = x;
    di.y = y;
    const was = di.active;
    di.active = x !== 0 || y !== 0;
    if (di.active && !was) {
      g.harvestId = 0;
      this.objCounters('wasd');
    }
  }

  private objCounters(k: string): void {
    this.game.objectiveCounters[k] = (this.game.objectiveCounters[k] ?? 0) + 1;
  }

  private handleKeys(): void {
    const i = this.input;
    if (i.consume('Escape')) {
      if (this.sendMode) this.sendMode = false;
      else if (this.chest.isOpen) this.chest.escape();
      else if (this.panels.isOpen) this.panels.close();
      else this.panels.open('menu');
    }
    if (this.chest.isOpen) return;
    const panelKeys: [string, string][] = [
      ['KeyB', 'base'], ['KeyV', 'arsenal'], ['KeyC', 'crew'], ['KeyT', 'tech'], ['KeyK', 'abilities'], ['KeyI', 'cargo'], ['KeyM', 'map'], ['KeyH', 'help'], ['F1', 'help'],
    ];
    for (const [k, p] of panelKeys) if (i.consume(k)) this.panels.toggle(p);
    if (this.panels.isOpen) return;
    OFFICER_KEYS.forEach((k, slot) => {
      if (i.consume(k)) this.cast(slot);
    });
    ACTIVE_KEYS.forEach((k, slot) => {
      if (i.consume(k)) this.castActive(slot);
    });
    if (i.consume(ULT_KEY)) this.castUlt();
    if (i.consume(KIT_KEY)) this.useKit();
    if (i.consume('KeyY')) this.toggleAutoFire();
    if (i.consume('KeyL')) {
      this.camLocked = !this.camLocked;
      this.hud.toast(this.camLocked ? 'Camera locked to your fortress (L).' : 'Camera unlocked (L): move the mouse to the screen edge to pan. Hold Space to recenter.', '#4dd0e1');
    }
    if (i.consume('KeyP')) this.paused = !this.paused;
    if (i.consume('KeyJ')) {
      if (this.hover && (this.hover.kind === 'node' || this.hover.kind === 'site')) this.trySend(this.hover);
      else this.outriderCmd('send');
    }
    if (i.consume('KeyO')) this.view.outlines = !this.view.outlines;
  }

  private trySend(hv: Hover): void {
    if (!this.game.outrider) {
      this.hud.toast('You need an Outrider (unlocks at 15 crew, built at a Garage).', '#ff8a80');
      return;
    }
    if (sendOutrider(this.game, hv.kind === 'node' ? 'node' : 'site', hv.id)) this.view.moveMarker(hv.x, hv.y, '#26c6da');
    this.sendMode = false;
  }

  private pick(wx: number, wy: number): Hover {
    const g = this.game;
    const v = this.view;
    const m = this.input.mouse;
    const scale = 34 / v.cam.zoom;
    let best: Hover | null = null;
    let bd = Infinity;
    for (const e of g.enemies) {
      if (e.burrowed || (g.mode === 'world' && !g.isVisible(e.x, e.y))) continue;
      const hgt = (e.flying ? 1.6 : 0) + e.r * 1.4;
      const p = v.worldToScreen(e.x, e.y, hgt);
      const r = Math.max(16, e.r * 42 * scale);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < r && d < bd) {
        bd = d;
        best = { kind: 'enemy', id: e.id, x: e.x, y: e.y, label: `${e.elite ? 'Elite ' : ''}${e.name}` };
      }
    }
    if (best) return best;
    for (const t of g.tanks) {
      if (t.dead || (g.mode === 'world' && !g.isVisible(t.x, t.y))) continue;
      if (t.hits(wx, wy, 0.6)) return { kind: 'tank', id: t.id, x: t.x, y: t.y, label: t.kind === 'outpost' ? 'Outpost' : t.name };
    }
    for (const k of g.pickups) if (k.kind !== 'stack' && Math.hypot(k.x - wx, k.y - wy) < 1.4) return { kind: 'pickup', id: k.id, x: k.x, y: k.y, label: k.kind === 'chest' ? 'Chest' : 'Weapon crate' };
    if (g.mode === 'world') {
      for (const n of g.gen.nodes) {
        if (n.respawnAt || Math.abs(n.x - wx) > 1.6 || Math.abs(n.y - wy) > 1.6) continue;
        if (Math.hypot(n.x - wx, n.y - wy) < 1.5) return { kind: 'node', id: n.id, x: n.x, y: n.y, label: NODE_INFO[n.type].name };
      }
      for (const r of g.gen.runes) if (Math.hypot(r.x - wx, r.y - wy) < 2.6) return { kind: 'rune', id: r.id, x: r.x, y: r.y, label: RUNE_INFO[r.rune].name };
      if (Math.hypot(g.gen.gate.x - wx, g.gen.gate.y - wy) < 6) return { kind: 'gate', id: 0, x: g.gen.gate.x, y: g.gen.gate.y, label: 'Dead Zone Gate' };
      for (const s of g.gen.sites) if (Math.hypot(s.x - wx, s.y - wy) < 7.5) return { kind: 'site', id: s.id, x: s.x, y: s.y, label: s.name };
    }
    return { kind: 'ground', id: 0, x: wx, y: wy, label: '' };
  }

  private handleMouse(dt: number): void {
    const g = this.game;
    const m = this.input.mouse;
    const w = this.view.screenToWorld(m.x, m.y);
    g.aim.x = w.x;
    g.aim.y = w.y;
    g.fireHeld = m.left && !m.overUI;
    if (m.overUI) {
      this.hover = null;
      this.canvas.style.cursor = CURSORS.default;
      this.hud.setHint('');
      return;
    }
    const hv = this.pick(w.x, w.y);
    this.hover = hv;
    this.canvas.style.cursor = this.sendMode ? CURSORS.send : hv.kind === 'enemy' || hv.kind === 'tank' ? CURSORS.attack : hv.kind === 'node' ? CURSORS.harvest : hv.kind === 'ground' ? CURSORS.default : CURSORS.interact;
    this.hud.setHint(this.hintFor(hv));
    if (m.rightPressed) {
      this.rmbT = 0.25;
      hideTip();
      if (this.sendMode) {
        if (hv.kind === 'node' || hv.kind === 'site') this.trySend(hv);
        else {
          this.sendMode = false;
          this.hud.toast('Send cancelled.', '#bdbdbd');
        }
        return;
      }
      if (g.player.dead) return;
      switch (hv.kind) {
        case 'enemy':
        case 'tank':
          orderAttack(g, hv.id);
          this.view.moveMarker(hv.x, hv.y, '#ff1744');
          break;
        case 'node':
          orderHarvest(g, hv.id);
          this.view.moveMarker(hv.x, hv.y, '#ffd740');
          break;
        case 'rune':
          orderInteract(g, 'rune', hv.id, hv.x + 3.5, hv.y);
          this.view.moveMarker(hv.x, hv.y, '#ea80fc');
          break;
        case 'gate':
          orderInteract(g, 'gate', 0, hv.x, hv.y);
          this.view.moveMarker(hv.x, hv.y, '#ff1744');
          break;
        case 'site':
          if (orderMove(g, hv.x, hv.y)) this.view.moveMarker(hv.x, hv.y, '#ffd740');
          break;
        default:
          if (orderMove(g, hv.x, hv.y)) this.view.moveMarker(hv.x, hv.y);
      }
    } else if (m.right && hv.kind === 'ground' && !g.player.dead) {
      this.rmbT -= dt;
      if (this.rmbT <= 0) {
        this.rmbT = 0.25;
        if (orderMove(g, hv.x, hv.y, true)) this.view.moveMarker(hv.x, hv.y);
      }
    }
  }

  private hintFor(hv: Hover): string {
    const g = this.game;
    if (this.sendMode) return hv.kind === 'node' || hv.kind === 'site' ? `Right-click: send Outrider to <b>${hv.label}</b>` : 'Pick a resource node or loot area for the Outrider (Esc cancels)';
    switch (hv.kind) {
      case 'enemy':
      case 'tank':
        return `<b class="bad">${hv.label}</b> · right-click: focus fire`;
      case 'node': {
        const n = g.gen.nodes.find((k) => k.id === hv.id)!;
        const info = NODE_INFO[n.type];
        const ok = info.tier <= g.player.stats.drill;
        return `<b>${info.name}</b> (${n.amount} left) · ${ok ? 'right-click: harvest' : `<span class="bad">needs Mk${info.tier} Drill</span>`}${g.outrider ? ' · J: send Outrider' : ''}`;
      }
      case 'site': {
        const s = g.gen.sites.find((k) => k.id === hv.id)!;
        return `<b>${hv.label}</b> (${SITE_INFO[s.kind].title}) · ${s.readyAt <= g.time ? 'drive inside the ring and hold position to scavenge' : 'already scavenged, restocking'}`;
      }
      case 'rune': {
        const r = g.gen.runes.find((k) => k.id === hv.id)!;
        return `<b style="color:${RUNE_INFO[r.rune].color}">${hv.label}</b> · ${RUNE_INFO[r.rune].buff} + a Rune Chest. Defeat its guardians, then park beside it.`;
      }
      case 'gate':
        return '<b class="bad">Dead Zone Gate</b> · right-click to enter the multiplayer warzone';
      case 'pickup':
        return `<b>${hv.label}</b> · drive over it to collect`;
      default:
        return '';
    }
  }

  /** Called by the Dead Zone client when a raid ends. */
  endRaid(): void {
    this.dz = null;
    this.view.setWorld(this.game);
    this.panels.close();
  }

  centerOnPlayer(): void {
    this.view.cam.x = this.game.player.x;
    this.view.cam.y = this.game.player.y;
  }

  get center(): number {
    return CENTER;
  }
}
