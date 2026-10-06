import type { Game } from '../game/game';
import { gunInfo, gunsOf, magOf, magSize } from '../game/systems/gunner';
import { WEAPONS } from '../shared/weapons';

export interface GunCamActions {
  aim(sx: number, sy: number): void;
  trigger(down: boolean): void;
  weapon(i: number): void;
  reload(): void;
  leave(): void;
}

/**
 * The gun camera: you on one of the Titan's guns, seen down its sight on a worn tape feed (the picture cold and hard,
 * scan lines, grain, the tracking band). The reticle sits on your crosshair and flashes the hit marker on every hit,
 * KILL CONFIRMED stamps across the feed, the magazine counts down in rounds along the bottom and the reload bar fills,
 * every shot kicks the picture, and the other guns and their magazines wait along the side (1-9 to jump to one).
 */
export class GunCam {
  readonly root = document.createElement('div');
  private noise = document.createElement('canvas');
  private nctx: CanvasRenderingContext2D;
  private band = document.createElement('div');
  private topL = document.createElement('div');
  private topC = document.createElement('div');
  private topR = document.createElement('div');
  private botL = document.createElement('div');
  private mag = document.createElement('div');
  private guns = document.createElement('div');
  private cross = document.createElement('div');
  private flash = document.createElement('div');
  private exit = document.createElement('button');
  private on = false;
  private t = 0;
  private bandY = -0.2;
  private key = '';
  private gunsKey = '';

  constructor(parent: HTMLElement, private canvas: HTMLCanvasElement, act: GunCamActions) {
    this.root.className = 'vhs gun';
    this.noise.width = 320;
    this.noise.height = 180;
    this.noise.className = 'vhs-noise';
    this.nctx = this.noise.getContext('2d')!;
    this.band.className = 'vhs-band';
    this.topL.className = 'vhs-t vhs-tl';
    this.topC.className = 'vhs-t vhs-tc';
    this.topR.className = 'vhs-t vhs-tr';
    this.botL.className = 'vhs-t vhs-bl';
    this.mag.className = 'gun-mag';
    this.guns.className = 'gun-list';
    this.cross.className = 'vhs-cross gun';
    this.cross.innerHTML = '<i class="hm"></i>';
    this.flash.className = 'vhs-flash';
    this.exit.className = 'vhs-exit';
    this.exit.textContent = 'OFF THE GUN [Esc]';
    const scan = document.createElement('div');
    scan.className = 'vhs-scan';
    const vig = document.createElement('div');
    vig.className = 'vhs-vig';
    this.root.append(this.noise, scan, this.band, vig, this.cross, this.flash, this.topL, this.topC, this.topR, this.botL, this.mag, this.guns, this.exit);
    parent.appendChild(this.root);
    const pos = (e: PointerEvent): void => act.aim(e.clientX, e.clientY);
    this.root.addEventListener('pointermove', pos);
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.vhs-exit, .gun-list, .gun-mag')) return;
      e.preventDefault();
      pos(e);
      act.trigger(true);
    });
    const up = (): void => act.trigger(false);
    this.root.addEventListener('pointerup', up);
    this.root.addEventListener('pointercancel', up);
    this.root.addEventListener('pointerleave', up);
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      act.reload();
    });
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
    this.mag.addEventListener('click', () => act.reload());
  }

  get isOn(): boolean {
    return this.on;
  }

  private show(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.root.classList.toggle('on', on);
    this.canvas.style.filter = on ? 'grayscale(0.9) sepia(0.35) hue-rotate(150deg) saturate(1.5) contrast(1.4) brightness(1.1)' : '';
    if (!on) this.canvas.style.transform = '';
    document.body.classList.toggle('on-feed', on);
    this.key = this.gunsKey = '';
  }

  update(g: Game, dt: number, screen: (x: number, y: number) => { x: number; y: number }): void {
    const gn = g.gunner;
    const info = gunInfo(g);
    if (!gn || !info) {
      this.show(false);
      return;
    }
    this.show(true);
    this.t += dt;
    // Grain and the odd dropout.
    const c = this.nctx;
    c.clearRect(0, 0, 320, 180);
    for (let i = 0; i < 700; i++) {
      const v = Math.random() < 0.5 ? 255 : 0;
      c.fillStyle = `rgba(${v},${v},${v},${0.06 + Math.random() * 0.12})`;
      c.fillRect((Math.random() * 320) | 0, (Math.random() * 180) | 0, 1, 1);
    }
    if (Math.random() < 0.05 + gn.kick * 0.2) {
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(0, (Math.random() * 180) | 0, 320, 1);
    }
    this.bandY += dt * 0.18;
    if (this.bandY > 1.3) this.bandY = -0.3 - Math.random() * 0.8;
    this.band.style.top = `${this.bandY * 100}%`;
    // The kick: the picture jumps with the shot and settles.
    const k = gn.kick;
    this.canvas.style.transform = k > 0.01 ? `translate(${((Math.random() - 0.5) * 6 * k).toFixed(1)}px, ${(5 * k).toFixed(1)}px) scale(${(1 + k * 0.012).toFixed(4)})` : '';
    // The text.
    const pad = (n: number): string => String(n).padStart(2, '0');
    const now = new Date();
    const blink = Math.floor(this.t * 2) % 2 === 0;
    const p = g.player;
    const pos = p.moduleWorld(info.m);
    const dist = Math.hypot(gn.aim.x - pos.x, gn.aim.y - pos.y);
    const brg = ((Math.atan2(gn.aim.x - pos.x, -(gn.aim.y - pos.y)) * 180) / Math.PI + 360) % 360;
    this.topL.innerHTML = `<span class="rec">${blink ? '●' : '&nbsp;'} REC</span><br>GUN CAM ${pad((gunsOf(g).findIndex((m) => m.id === gn.id) + 1) || 1)}`;
    this.topC.innerHTML = `${info.name.toUpperCase()}<br><b>${gn.kills} KILL${gn.kills === 1 ? '' : 'S'}</b>`;
    this.topR.innerHTML = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}<br>${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    this.botL.innerHTML = `RANGE ${Math.round(dist)} M<br>BRG ${String(Math.round(brg)).padStart(3, '0')}°<br>${Math.round(Math.abs(p.speed) * 3.6)} KM/H`;
    // The magazine: the count, a tick per round (or a bar for the long belts), the reload filling.
    const d = WEAPONS[info.m.weapon!.key];
    const key = `${info.mag}|${info.size}|${Math.ceil(info.reload * 10)}`;
    if (key !== this.key) {
      this.key = key;
      const ticks = info.size <= 40
        ? `<div class="ticks">${Array.from({ length: info.size }, (_, i) => `<i class="${i < info.mag ? 'full' : ''} ${d.size === 'heavy' || info.m.key === 'main_gun' ? 'big' : ''}"></i>`).join('')}</div>`
        : `<div class="belt"><i style="width:${(info.mag / info.size) * 100}%"></i></div>`;
      const reload = info.reload > 0 ? `<div class="rl"><span>RELOADING</span><i style="width:${(1 - info.reload / info.reloadOf) * 100}%"></i></div>` : info.mag === 0 ? '<div class="rl dry"><span>EMPTY · R</span></div>' : info.mag <= Math.max(1, info.size * 0.2) ? '<div class="rl low"><span>LOW · R TO RELOAD</span></div>' : '';
      this.mag.innerHTML = `<div class="n"><b>${info.mag}</b>/${info.size}</div>${ticks}${reload}`;
    }
    // The other guns, a key each.
    const guns = gunsOf(g).slice(0, 9);
    const gkey = guns.map((m) => `${m.id}:${magOf(g, m).mag}:${magOf(g, m).reload > 0 ? 1 : 0}`).join(',') + `|${gn.id}`;
    if (gkey !== this.gunsKey) {
      this.gunsKey = gkey;
      this.guns.innerHTML = guns.map((m, i) => {
        const mg = magOf(g, m);
        const wd = WEAPONS[m.weapon!.key];
        return `<div class="g ${m.id === gn.id ? 'sel' : ''} ${mg.reload > 0 ? 'rel' : ''}" data-w="${i}"><span>${i + 1} ${m.key === 'main_gun' ? 'MAIN' : wd.name.toUpperCase().slice(0, 12)}</span><b>${mg.reload > 0 ? '··' : `${mg.mag}/${magSize(m)}`}</b></div>`;
      }).join('');
    }
    // The reticle on the crosshair, the hit marker on it.
    const at = screen(gn.aim.x, gn.aim.y);
    this.cross.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    this.cross.className = `vhs-cross gun ${d.size === 'heavy' || info.m.key === 'main_gun' ? 'heavy' : ''} ${gn.hitT > 0 ? 'hit' : ''} ${info.reload > 0 ? 'reloading' : ''}`;
    this.flash.textContent = 'KILL CONFIRMED';
    this.flash.style.opacity = gn.killT > 0 ? '1' : '0';
  }
}
