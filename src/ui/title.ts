import type { App } from '../app';
import { loadSave } from '../game/save';
import { CLASS_LIST } from '../game/classes';
import { button, esc, h } from './dom';

export class Title {
  root: HTMLDivElement;
  isOpen = true;

  constructor(parent: HTMLElement, private app: App) {
    this.root = h('div', 'title-screen');
    parent.appendChild(this.root);
    this.render();
  }

  render(): void {
    const save = loadSave();
    this.root.innerHTML = `<div class="title-card">
      <div class="logo">IRONCRAWL</div>
      <div class="tag">A rolling fortress in an enormous, horde-infested wasteland</div>
      <ul class="pitch">
        <li>Your base is a <b>land cruiser the size of a warship</b>, several stories tall: guns and soldier nests on the roof, bunks, galleys, labs and engine rooms below. Every gun needs a gunner; every station needs crew who eat, sleep and work in shifts.</li>
        <li>The world is <b>enormous</b>: half an hour to cross. Ruined cities you can plough through, military bases, cyborg foundries, zombie towns, necropolises and monster broods, each with a <b>boss</b>.</li>
        <li><b>Hordes</b> pour in for minutes at a time, pile up against your hull and climb it. They get stronger the longer you survive. Storms drive your soldiers inside.</li>
        <li>The goal: bring every boss's part to the <b>Mothership</b> at the edge of the world, rebuild your fortress there, then wake it and hold it against the Last Horde.</li>
        <li><b>Battle cards</b>, <b>squads</b>, <b>mini tanks</b>, <b>rival dreadnoughts</b>, and a camp you can set up and pack away.</li>
      </ul>
      <div class="title-btns"></div>
      <div class="foot">Mouse + keyboard or touch (turn your phone sideways). Progress saves in your browser.</div>
    </div>`;
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

  /** New run: choose your hull class. They're all the same size; they're built for different jobs. */
  pickClass(): void {
    this.isOpen = true;
    this.root.style.display = 'flex';
    this.root.innerHTML = '';
    const card = h('div', 'title-card class-pick');
    card.appendChild(h('div', 'logo small', 'CHOOSE YOUR FORTRESS'));
    card.appendChild(h('div', 'tag', 'Every class is a land cruiser of the same size and stature, built for a different job. You can refit at the Mothership later.'));
    const row = h('div', 'class-row');
    for (const c of CLASS_LIST) {
      const el = h('div', 'class-card', `<div class="cc-name" style="color:${c.color}">${esc(c.name)}</div><div class="cc-role">${esc(c.role)}</div>
        <div class="cc-desc">${esc(c.desc)}</div><div class="cc-perk">${esc(c.perk)}</div>
        <div class="cc-pros">${c.good.map((t) => `<span class="good">+ ${esc(t.replace(/^\+/, ''))}</span>`).join('')}${c.bad.map((t) => `<span class="bad">− ${esc(t.replace(/^-/, ''))}</span>`).join('')}</div>`);
      el.style.setProperty('--cc', c.color);
      el.appendChild(button(`Command the ${c.name}`, () => this.app.newGame(c.key), 'primary'));
      row.appendChild(el);
    }
    card.appendChild(row);
    card.appendChild(button('Back', () => this.render(), 'small'));
    this.root.appendChild(card);
  }

  hide(): void {
    this.isOpen = false;
    this.root.style.display = 'none';
  }

  show(): void {
    this.isOpen = true;
    this.render();
    this.root.style.display = 'flex';
  }
}
