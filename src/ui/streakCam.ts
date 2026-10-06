import type { Game } from '../game/game';
import { STREAKS } from '../game/systems/streaks';

export interface StreakCamActions {
  /** The pointer at a screen position (the app turns it into ground). */
  aim(sx: number, sy: number): void;
  trigger(down: boolean): void;
  weapon(i: number): void;
  leave(): void;
}

const FILTERS: Record<string, string> = {
  // White-hot drone thermal, the gunship's green TV, the satellite's cold cyan optics.
  hellfire: 'grayscale(1) contrast(1.45) brightness(1.12)',
  gunship: 'grayscale(1) sepia(0.55) hue-rotate(48deg) saturate(2.1) contrast(1.35) brightness(1.08)',
  lance: 'grayscale(0.85) sepia(0.3) hue-rotate(155deg) saturate(1.8) contrast(1.3) brightness(1.05)',
};

/**
 * The killstreak's camera feed, laid over the battlefield view like a worn VHS tape: the picture tinted and hard
 * (thermal white, gunship green, satellite cyan), scan lines, grain that never sits still, a tracking band rolling
 * down the screen, the vignette of an old monitor, REC blinking and the date stamp in the corner, the call sign and
 * altitude, the reticle for the selected gun and every gun's ammunition along the bottom. The pointer aims, the
 * button (or a finger) fires, 1/2/3 or the wheel change guns, Esc leaves.
 */
export class StreakCam {
  readonly root = document.createElement('div');
  private noise = document.createElement('canvas');
  private nctx: CanvasRenderingContext2D;
  private band = document.createElement('div');
  private topL = document.createElement('div');
  private topR = document.createElement('div');
  private topC = document.createElement('div');
  private botL = document.createElement('div');
  private guns = document.createElement('div');
  private kills = document.createElement('div');
  private cross = document.createElement('div');
  private mark = document.createElement('div');
  private flash = document.createElement('div');
  private exit = document.createElement('button');
  private on = false;
  private t = 0;
  private bandY = -0.2;
  private lastKills = 0;
  private flashT = 0;
  private kind = '';
  private gunKey = '';
  /** Where the pointer is (screen). */
  pointer = { x: innerWidth / 2, y: innerHeight / 2 };

  constructor(parent: HTMLElement, private canvas: HTMLCanvasElement, act: StreakCamActions) {
    this.root.className = 'vhs';
    this.noise.width = 320;
    this.noise.height = 180;
    this.noise.className = 'vhs-noise';
    this.nctx = this.noise.getContext('2d')!;
    this.band.className = 'vhs-band';
    this.topL.className = 'vhs-t vhs-tl';
    this.topR.className = 'vhs-t vhs-tr';
    this.topC.className = 'vhs-t vhs-tc';
    this.botL.className = 'vhs-t vhs-bl';
    this.guns.className = 'vhs-guns';
    this.kills.className = 'vhs-t vhs-br';
    this.cross.className = 'vhs-cross';
    this.mark.className = 'vhs-mark';
    this.flash.className = 'vhs-flash';
    this.exit.className = 'vhs-exit';
    this.exit.textContent = 'LEAVE FEED [Esc]';
    const scan = document.createElement('div');
    scan.className = 'vhs-scan';
    const vig = document.createElement('div');
    vig.className = 'vhs-vig';
    this.root.append(this.noise, scan, this.band, vig, this.cross, this.mark, this.flash, this.topL, this.topC, this.topR, this.botL, this.guns, this.kills, this.exit);
    parent.appendChild(this.root);
    const pos = (e: PointerEvent): void => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      act.aim(e.clientX, e.clientY);
    };
    this.root.addEventListener('pointermove', pos);
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.vhs-exit, .vhs-guns')) return;
      e.preventDefault();
      pos(e);
      act.trigger(true);
    });
    const up = (): void => act.trigger(false);
    this.root.addEventListener('pointerup', up);
    this.root.addEventListener('pointercancel', up);
    this.root.addEventListener('pointerleave', up);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('wheel', (e) => {
      e.preventDefault();
      act.weapon(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    this.exit.addEventListener('click', (e) => {
      e.stopPropagation();
      act.leave();
    });
    this.guns.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-w]') as HTMLElement | null;
      if (b) act.weapon(Number(b.dataset.w) + 100);
    });
  }

  get isOn(): boolean {
    return this.on;
  }

  private show(on: boolean, kind = ''): void {
    if (on === this.on && kind === this.kind) return;
    this.on = on;
    this.kind = kind;
    this.root.classList.toggle('on', on);
    this.canvas.style.filter = on ? FILTERS[kind] ?? '' : '';
    // The feed is all you see: the HUD and the map markers step aside.
    document.body.classList.toggle('on-feed', on);
    this.lastKills = 0;
    this.gunKey = '';
  }

  /** Each frame: follow the feed, or close it. `screen` turns ground into screen (for the reticle). */
  update(g: Game, dt: number, screen: (x: number, y: number) => { x: number; y: number }): void {
    const a = g.streak.active;
    if (!a) {
      this.show(false);
      return;
    }
    const d = STREAKS[a.kind];
    this.show(true, a.kind);
    this.t += dt;
    // Grain: a fresh scatter of specks every frame, a little heavier as the feed nears its end.
    const c = this.nctx;
    c.clearRect(0, 0, 320, 180);
    const n = 900 + (a.t < 4 ? 1200 : 0);
    for (let i = 0; i < n; i++) {
      const v = Math.random() < 0.5 ? 255 : 0;
      c.fillStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.14})`;
      c.fillRect((Math.random() * 320) | 0, (Math.random() * 180) | 0, 1, 1);
    }
    // A dropout line now and then.
    if (Math.random() < 0.08) {
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(0, (Math.random() * 180) | 0, 320, 1);
    }
    // The tracking band rolls down, and comes round again.
    this.bandY += dt * 0.22;
    if (this.bandY > 1.3) this.bandY = -0.3 - Math.random() * 0.8;
    this.band.style.top = `${this.bandY * 100}%`;
    // The text.
    const blink = Math.floor(this.t * 2) % 2 === 0;
    const now = new Date();
    const clock = new Date(now.getTime());
    const pad = (k: number): string => String(k).padStart(2, '0');
    const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][clock.getMonth()];
    this.topL.innerHTML = `<span class="rec">${blink ? '●' : '&nbsp;'} REC</span><br>PLAY ▶ SP`;
    this.topR.innerHTML = `${mon}. ${pad(clock.getDate())} ${clock.getFullYear()}<br>${pad(clock.getHours())}:${pad(clock.getMinutes())}:${pad(clock.getSeconds())}`;
    const left = Math.max(0, a.t);
    this.topC.innerHTML = `${d.name.toUpperCase()}<br><b>${pad(Math.floor(left / 60))}:${pad(Math.floor(left % 60))}</b>`;
    const alt = a.msl ? `ALT ${Math.max(0, Math.round(a.msl.h * 3.28)).toLocaleString()} FT${a.msl.boost ? ' · BOOST' : ''}` : a.kind === 'gunship' ? 'ALT 9,800 FT · ORBIT' : 'ORBIT 410 KM';
    this.botL.innerHTML = `${d.cam}<br>${alt}<br>${Math.round(a.aim.x)} E / ${Math.round(a.aim.y)} N`;
    this.kills.innerHTML = `KILLS ${a.kills}`;
    // The guns and their ammunition (only rebuilt when something changes).
    const key = `${a.w}|${a.ammo.map((k) => Math.ceil(k)).join(',')}`;
    if (key !== this.gunKey) {
      this.gunKey = key;
      this.guns.innerHTML = d.weapons.map((w, i) => {
        const left2 = Math.ceil(a.ammo[i]);
        const frac = Math.max(0, a.ammo[i] / w.ammo);
        return `<div class="g ${i === a.w ? 'sel' : ''} ${left2 <= 0 ? 'dry' : ''}" data-w="${i}"><span>${i + 1} ${w.name}</span><b>${a.kind === 'lance' ? `${left2}%` : left2}</b><i style="width:${frac * 100}%"></i></div>`;
      }).join('');
    }
    // The reticle: on the crosshair's ground spot (the Hellfire's sits in the middle: it is the missile's eye).
    const at = a.kind === 'hellfire' ? { x: innerWidth / 2, y: innerHeight / 2 } : screen(a.aim.x, a.aim.y);
    this.cross.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    this.cross.className = `vhs-cross ${a.kind} w${a.w}`;
    // The Hellfire's pointer: where it's being steered.
    if (a.kind === 'hellfire') {
      const m = screen(a.aim.x, a.aim.y);
      this.mark.style.display = 'block';
      this.mark.style.transform = `translate(${Math.round(m.x)}px, ${Math.round(m.y)}px)`;
    } else this.mark.style.display = 'none';
    // Kills confirmed on the feed.
    if (a.kills > this.lastKills) {
      this.flash.textContent = a.kills - this.lastKills > 1 ? `${a.kills - this.lastKills} KILLS CONFIRMED` : 'KILL CONFIRMED';
      this.flashT = 1.2;
      this.lastKills = a.kills;
    }
    this.flashT -= dt;
    this.flash.style.opacity = this.flashT > 0 ? '1' : '0';
    this.root.classList.toggle('static', a.over > 0 && !a.shells.length);
  }
}
