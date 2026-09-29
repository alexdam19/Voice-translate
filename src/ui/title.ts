import { pxText } from './pixfont';
import type { App } from '../app';
import { loadSave } from '../game/save';
import { button, h } from './dom';
import { HangarScreen } from './hangar';
import { SHIP_ART } from '../render/px/shipArt';

export class Title {
  root: HTMLDivElement;
  isOpen = true;
  private hangar: HangarScreen;

  constructor(parent: HTMLElement, private app: App) {
    this.root = h('div', 'title-screen');
    parent.appendChild(this.root);
    this.hangar = new HangarScreen(parent, app);
    this.render();
  }

  render(): void {
    const save = loadSave();
    this.root.innerHTML = `<div class="title-card">
      <canvas class="logo-px" width="136" height="20"></canvas>
      <div class="tag">Captain a 200 m Titan Crawler across The Crater</div>
      <img class="title-hero" src="${SHIP_ART.hero}" alt="The Titan Crawler">
      <ul class="pitch">
        <li>Your ship is a <b>Titan Crawler two hundred metres long</b>: seven decks, eight crawlers, guns and soldier nests on the roof. Your officers run its stations; they tire, eat and sleep in shifts.</li>
        <li><b>The Crater</b> is 140 km across: dune wastes, frozen ridges, a toxic lake, volcanic spires, raider canyons and a lost city at the bottom of the Divot. Every zone has its own creatures, from 1 m rats to <b>colossi</b> bigger than your ship: a 320 m raider super-fortress, a 420 m worm under the sand, a brood mother, a tripod walker.</li>
        <li><b>Hordes</b> pour in, pile up against your hull and climb it. Storms drive your soldiers inside.</li>
        <li>The goal: take the six strongholds' cores home to the <b>Mega Hangar</b>, rebuild your Titan, light the Ark Engine and survive what comes for it.</li>
        <li><b>Battle cards</b>, <b>squads</b>, <b>mini tanks</b>, <b>rival Titans</b>, cruise warp for the long hauls.</li>
      </ul>
      <div class="title-btns"></div>
      <div class="foot">Mouse + keyboard or touch (turn your phone sideways). Progress saves in your browser.</div>
    </div>`;
    drawLogo(this.root.querySelector('.logo-px') as HTMLCanvasElement);
    this.root.style.backgroundImage = `url(${starfield()})`;
    const btns = this.root.querySelector('.title-btns')!;
    if (save) {
      const mins = Math.floor(save.stats.time / 60);
      btns.appendChild(button(`Continue <small>${mins} min · ${save.crew.length} officers</small>`, () => this.app.continueGame(), 'primary'));
    }
    btns.appendChild(
      button(save ? 'New Run' : 'Start', () => {
        if (save) this.app.panels.confirm('Start a new run?', 'Your current fortress, crew and progress will be replaced.', 'New Run', () => this.pickClass());
        else this.pickClass();
      }, save ? '' : 'primary'),
    );
  }

  /** New run: the Mega Hangar, where you choose your Titan and your officers. */
  pickClass(): void {
    this.isOpen = true;
    this.root.style.display = 'none';
    this.hangar.open(() => {
      this.root.style.display = 'flex';
      this.render();
    });
  }

  hide(): void {
    this.isOpen = false;
    this.root.style.display = 'none';
    this.hangar.close();
  }

  show(): void {
    this.isOpen = true;
    this.render();
    this.root.style.display = 'flex';
  }
}

/** IRONCRAWL in the bitmap font: amber letters with a dark drop shadow. */
function drawLogo(cv: HTMLCanvasElement): void {
  const x = cv.getContext('2d')!;
  x.clearRect(0, 0, cv.width, cv.height);
  const cx = cv.width / 2;
  // A straight-down shadow (a sideways one closes up the C).
  x.save();
  x.translate(0, 2);
  pxText(x, 'IRONCRAWL', cx, 2, 2, 'ink', 'center', false);
  x.restore();
  pxText(x, 'IRONCRAWL', cx, 2, 2, 'amber', 'center', false);
}

let stars = '';

/** A violet night sky with stars and a nebula, as a data URL (made once). */
function starfield(): string {
  if (stars) return stars;
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 600;
  const x = c.getContext('2d')!;
  const gr = x.createLinearGradient(0, 0, 0, 600);
  gr.addColorStop(0, '#07051a');
  gr.addColorStop(0.6, '#1a0d3a');
  gr.addColorStop(1, '#2a0f4a');
  x.fillStyle = gr;
  x.fillRect(0, 0, 960, 600);
  for (const [px, py, r, col] of [[0.3, 0.35, 0.4, 'rgba(120,60,220,0.2)'], [0.72, 0.25, 0.3, 'rgba(40,160,255,0.14)'], [0.55, 0.85, 0.45, 'rgba(255,60,180,0.12)']] as [number, number, number, string][]) {
    const rg = x.createRadialGradient(px * 960, py * 600, 0, px * 960, py * 600, r * 960);
    rg.addColorStop(0, col);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, 960, 600);
  }
  let s = 99;
  const rnd = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 260; i++) {
    const big = rnd() < 0.08;
    x.fillStyle = rnd() < 0.2 ? '#5ad8ff' : rnd() < 0.3 ? '#b388ff' : '#ffffff';
    x.globalAlpha = 0.4 + rnd() * 0.6;
    x.fillRect(Math.floor(rnd() * 960), Math.floor(rnd() * 600), big ? 2 : 1, big ? 2 : 1);
  }
  x.globalAlpha = 1;
  stars = c.toDataURL();
  return stars;
}
