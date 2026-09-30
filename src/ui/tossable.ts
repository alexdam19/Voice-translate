import { h } from './dom';

/**
 * HUD boxes you can get out of the way. Drag one anywhere and it stays there; fling it at the side of the screen (or
 * press its fold button) and it folds into a tab on that edge, which brings it back when you tap it; its close button
 * hides it until it has something new to say. Double-click the grip to put it back where it started. Where each one
 * sits, and which are folded, is remembered between games.
 */

interface Saved {
  x?: number;
  y?: number;
  fold?: 'L' | 'R';
}

const KEY = 'ironcrawl.toss';

function load(): Record<string, Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Saved>;
  } catch {
    return {};
  }
}

function save(all: Record<string, Saved>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private window: positions just aren't kept */
  }
}

const docks: Partial<Record<'L' | 'R', HTMLDivElement>> = {};
function dock(side: 'L' | 'R'): HTMLDivElement {
  let d = docks[side];
  if (!d) {
    d = h('div', `toss-dock ${side}`);
    document.body.appendChild(d);
    docks[side] = d;
  }
  return d;
}

export class Tossable {
  /** The box that moves: holds the controls and the content. */
  readonly el: HTMLDivElement;
  private tab: HTMLDivElement;
  private state: Saved;
  /** Closed until the content changes from this. */
  private closedOn: string | null = null;
  private content = '';
  private justDragged = false;

  /**
   * `body` is the box's content (the HUD rewrites it freely). With `wrap` false the controls go straight into `body`'s
   * own element (for boxes positioned by their own CSS); the caller must then keep them when it rewrites the box.
   */
  constructor(readonly body: HTMLElement, private key: string, title: string, private opts: { wrap?: boolean; onClose?: () => void; noClose?: boolean } = {}) {
    const wrap = opts.wrap !== false;
    this.el = wrap ? h('div', 'toss') : (body as HTMLDivElement);
    if (wrap) this.el.appendChild(body);
    else this.el.classList.add('toss');
    const bar = h('div', 'toss-bar');
    const grip = h('span', 'toss-grip', '⋮⋮');
    grip.title = 'Drag to move · double-click to put back';
    const fold = h('button', 'toss-btn', '⇤');
    fold.title = 'Fold it away to the side';
    bar.append(grip, fold);
    if (!opts.noClose) {
      const x = h('button', 'toss-btn x', '×');
      x.title = 'Close (it comes back when there is something new)';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
      bar.appendChild(x);
    }
    this.el.appendChild(bar);
    fold.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = this.el.getBoundingClientRect();
      this.fold(r.left + r.width / 2 > window.innerWidth / 2 ? 'R' : 'L');
    });
    grip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.reset();
    });
    this.tab = h('div', 'toss-tab', title);
    this.tab.title = `Bring back ${title}`;
    this.tab.addEventListener('click', (e) => {
      e.stopPropagation();
      this.unfold();
    });
    this.state = load()[key] ?? {};
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    // A drag isn't a click on whatever the box does when clicked.
    this.el.addEventListener('click', (e) => {
      if (this.justDragged) {
        e.stopPropagation();
        e.preventDefault();
        this.justDragged = false;
      }
    }, true);
    requestAnimationFrame(() => this.apply());
  }

  /** Tells it what it's showing now: a box closed on older content opens again when this changes. */
  setContent(key: string): void {
    this.content = key;
    if (this.closedOn !== null && key !== this.closedOn) {
      this.closedOn = null;
      this.el.classList.remove('toss-closed');
    }
  }

  close(): void {
    this.closedOn = this.content;
    this.el.classList.add('toss-closed');
    this.opts.onClose?.();
  }

  private remember(): void {
    const all = load();
    if (this.state.x === undefined && !this.state.fold) delete all[this.key];
    else all[this.key] = this.state;
    save(all);
  }

  private apply(): void {
    const s = this.state;
    if (s.fold) {
      this.el.classList.add('tossed');
      dock(s.fold).appendChild(this.tab);
      this.tab.className = `toss-tab ${s.fold}`;
    } else {
      this.el.classList.remove('tossed');
      this.tab.remove();
    }
    if (s.x !== undefined && s.y !== undefined) {
      this.el.classList.add('floating');
      const w = this.el.offsetWidth || 200, hh = this.el.offsetHeight || 60;
      this.el.style.left = `${Math.max(0, Math.min(window.innerWidth - Math.min(w, 60), s.x))}px`;
      this.el.style.top = `${Math.max(0, Math.min(window.innerHeight - Math.min(hh, 30), s.y))}px`;
    } else {
      this.el.classList.remove('floating');
      this.el.style.left = this.el.style.top = '';
    }
  }

  fold(side: 'L' | 'R'): void {
    this.state.fold = side;
    this.remember();
    this.apply();
  }

  unfold(): void {
    delete this.state.fold;
    this.remember();
    this.apply();
  }

  reset(): void {
    this.state = {};
    this.remember();
    this.apply();
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.toss-btn')) return;
    const r = this.el.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY, ox = x0 - r.left, oy = y0 - r.top;
    let moving = false;
    let lastX = x0, lastT = performance.now(), vx = 0;
    const move = (ev: PointerEvent): void => {
      if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 7) return;
      if (!moving) {
        moving = true;
        this.el.classList.add('floating', 'dragging');
        this.el.style.width = `${r.width}px`;
        try {
          this.el.setPointerCapture(ev.pointerId);
        } catch {
          /* already released */
        }
      }
      const now = performance.now();
      vx = vx * 0.6 + ((ev.clientX - lastX) / Math.max(1, now - lastT)) * 0.4;
      lastX = ev.clientX;
      lastT = now;
      this.el.style.left = `${ev.clientX - ox}px`;
      this.el.style.top = `${ev.clientY - oy}px`;
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moving) return;
      this.justDragged = true;
      setTimeout(() => (this.justDragged = false), 0);
      this.el.classList.remove('dragging');
      this.el.style.width = '';
      // Flung hard at a side, or dropped against it: fold it into a tab there.
      const edge = ev.clientX < 36 ? 'L' : ev.clientX > window.innerWidth - 36 ? 'R' : Math.abs(vx) > 1.6 ? (vx < 0 ? 'L' : 'R') : null;
      if (edge) {
        this.state = { fold: edge };
        this.remember();
        this.apply();
        return;
      }
      this.state = { x: ev.clientX - ox, y: ev.clientY - oy };
      this.remember();
      this.apply();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
}
