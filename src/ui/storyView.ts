import type { Game } from '../game/game';
import { beatById, CAST, CHAPTERS, nextLine, skipBeat, tickStory, type Line, type Speaker } from '../game/story';
import { faceCanvas } from '../render/px/faces';
import { esc, h } from './dom';

/**
 * The story on screen. A chapter opens on a title card; briefings take the screen between letterbox bars with the
 * speaker's portrait and their words typing out (click, or ENTER, for the next line; SKIP to jump to the end, it's all
 * in the journal); radio calls come up in a box over the console while you keep driving, the face talking.
 */
export class StoryView {
  private root: HTMLDivElement;
  private card = h('div', 'story-card');
  private cine = h('div', 'story-cine');
  private radio = h('div', 'story-radio');
  private face: HTMLCanvasElement;
  private rface: HTMLCanvasElement;
  private name = h('div', 'sc-name');
  private text = h('div', 'sc-text');
  private rname = h('div', 'sr-name');
  private rtext = h('div', 'sr-text');
  private shown = '';
  private typed = 0;
  private game: Game | null = null;
  private t = 0;

  constructor(parent: HTMLElement) {
    this.root = h('div', 'story');
    this.face = document.createElement('canvas');
    this.face.width = this.face.height = 128;
    this.face.className = 'sc-face';
    this.rface = document.createElement('canvas');
    this.rface.width = this.rface.height = 64;
    this.rface.className = 'sr-face';
    const box = h('div', 'sc-box');
    const words = h('div', 'sc-words');
    const hint = h('div', 'sc-hint', 'click or ENTER ▸');
    const skip = h('button', 'sc-skip', 'SKIP ⏭');
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.game) skipBeat(this.game);
    });
    words.append(this.name, this.text, hint);
    box.append(this.face, words, skip);
    this.cine.append(h('div', 'sc-bar top'), h('div', 'sc-bar bottom'), box);
    this.cine.addEventListener('click', () => this.advance());
    this.card.addEventListener('click', () => this.advance());
    const rw = h('div', 'sr-words');
    rw.append(this.rname, this.rtext);
    this.radio.append(this.rface, rw);
    this.radio.addEventListener('click', () => this.advance());
    this.root.append(this.card, this.cine, this.radio);
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.cine.classList.contains('on') && !this.card.classList.contains('on')) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.advance();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (this.game) skipBeat(this.game);
      }
    }, true);
  }

  /** Whether a briefing or a card has the screen. */
  get blocking(): boolean {
    return this.cine.classList.contains('on') || this.card.classList.contains('on');
  }

  private advance(): void {
    const g = this.game;
    if (!g) return;
    const b = beatById(g.story.playing);
    if (!b) return;
    const l = b.lines[g.story.line];
    // First click finishes the typing; the next moves on.
    if (g.story.cardT <= 0 && l && this.typed < l.text.length) {
      this.typed = l.text.length;
      return;
    }
    nextLine(g);
  }

  update(g: Game, dt: number): void {
    this.game = g;
    this.t += dt;
    tickStory(g, dt);
    const s = g.story;
    const b = beatById(s.playing);
    const ch = b && b.chapter >= 0 ? CHAPTERS[b.chapter] : null;
    // The chapter card.
    const carding = !!b && s.cardT > 0 && !!ch;
    this.card.classList.toggle('on', carding);
    if (carding && ch) {
      const key = `card|${b.id}`;
      if (this.shown !== key) {
        this.shown = key;
        this.card.innerHTML = `<div class="sk-t">${esc(ch.title)}</div><div class="sk-s">${esc(ch.sub)}</div><div class="sk-d">${esc(ch.summary)}</div>`;
      }
      this.card.style.opacity = String(Math.min(1, s.cardT / 0.4, (3.2 - s.cardT) / 0.4 + 0.2));
    }
    const line: Line | undefined = b && !carding ? b.lines[s.line] : undefined;
    this.cine.classList.toggle('on', !!line && !!b?.cinematic);
    this.radio.classList.toggle('on', !!line && !b?.cinematic);
    if (!line || !b) return;
    const key = `${b.id}|${s.line}`;
    if (this.shown !== key) {
      this.shown = key;
      this.typed = 0;
    }
    this.typed = Math.min(line.text.length, this.typed + dt * 60);
    const who = CAST[line.who];
    const talking = this.typed < line.text.length;
    const mood = { mouth: talking && Math.floor(this.t * 10) % 2 === 0 ? 0.7 : 0, grin: line.mood === 'grin' && !talking, hurt: line.mood === 'hurt' ? 0.6 : 0, blink: Math.floor(this.t * 0.7) % 6 === 0 && (this.t % 1.43) < 0.12 };
    const shownText = esc(line.text.slice(0, Math.floor(this.typed)));
    if (b.cinematic) {
      this.drawFace(this.face, line.who, mood, 128);
      setHTML(this.name, `<b style="color:${who.color}">${esc(who.name.toUpperCase())}</b><small>${esc(who.title)}</small>`);
      setHTML(this.text, shownText);
    } else {
      this.drawFace(this.rface, line.who, mood, 64);
      setHTML(this.rname, `<i>◉ RADIO</i> <b style="color:${who.color}">${esc(who.name.toUpperCase())}</b> <small>${esc(who.title)}</small>`);
      setHTML(this.rtext, shownText);
    }
  }

  private drawFace(cv: HTMLCanvasElement, who: Speaker, mood: { mouth: number; grin: boolean; hurt: number; blink: boolean }, size: number): void {
    const c = CAST[who];
    const img = faceCanvas({ seed: c.face.seed, role: c.face.role, roleColor: c.color, rarityColor: c.color, look: c.face.look as never }, size, mood);
    const x = cv.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, cv.width, cv.height);
    x.drawImage(img, 0, 0, cv.width, cv.height);
  }
}

function setHTML(el: HTMLElement, html: string): void {
  if (el.innerHTML !== html) el.innerHTML = html;
}

/** The journal: the chapters reached, the people you've met, and everything they said. */
export function renderJournal(root: HTMLElement, g: Game): void {
  const s = g.story;
  const met = new Set(s.log.map((l) => l.who));
  const chapters = CHAPTERS.slice(0, s.chapter + 1).map((c, i) => `<div class="sj-ch ${i === s.chapter ? 'now' : ''}"><b>${esc(c.title)} · ${esc(c.sub.toUpperCase())}</b><div>${esc(c.summary)}</div></div>`).join('');
  const people = (Object.keys(CAST) as Speaker[]).filter((k) => met.has(k)).map((k) => {
    const c = CAST[k];
    const url = faceCanvas({ seed: c.face.seed, role: c.face.role, roleColor: c.color, rarityColor: c.color, look: c.face.look as never }, 64).toDataURL();
    return `<div class="sj-who ${c.foe ? 'foe' : ''}"><img src="${url}"><div><b style="color:${c.color}">${esc(c.name)}</b><small>${esc(c.title)}</small><p>${esc(c.bio)}</p></div></div>`;
  }).join('');
  const log = s.log.slice(-60).reverse().map((l) => `<div class="sj-line"><b style="color:${CAST[l.who].color}">${esc(CAST[l.who].name)}:</b> ${esc(l.text)}</div>`).join('');
  root.innerHTML = `<div class="sj"><div class="sj-col"><h3>THE STORY SO FAR</h3>${chapters}<h3>PEOPLE</h3>${people || '<div class="d">Nobody yet.</div>'}</div><div class="sj-col"><h3>WHAT WAS SAID</h3>${log || '<div class="d">Nothing yet.</div>'}</div></div>`;
}
