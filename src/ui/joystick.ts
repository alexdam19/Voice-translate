import { h } from './dom';

/**
 * On-screen stick for driving with a thumb. Press anywhere in its corner of the screen: the stick
 * centres under the thumb, and pushing it steers (screen-relative, like WASD) with analog throttle.
 */
export class Joystick {
  root = h('div', 'joy');
  private base = h('div', 'joy-base');
  private knob = h('div', 'joy-knob');
  /** Stick deflection, -1..1 on each axis (0 inside the dead zone). */
  x = 0;
  y = 0;
  private id = -1;
  private cx = 0;
  private cy = 0;
  /** How far the knob travels, in CSS px. */
  private readonly R = 46;

  constructor(parent: HTMLElement) {
    this.base.appendChild(this.knob);
    this.root.appendChild(this.base);
    parent.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.id !== -1) return;
      this.id = e.pointerId;
      try {
        this.root.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events can't be captured */
      }
      const r = this.root.getBoundingClientRect();
      // Keep the whole ring on screen.
      this.cx = Math.max(r.left + this.R + 8, Math.min(r.right - this.R - 8, e.clientX));
      this.cy = Math.max(r.top + this.R + 8, Math.min(r.bottom - this.R - 8, e.clientY));
      this.base.style.left = `${this.cx - r.left}px`;
      this.base.style.top = `${this.cy - r.top}px`;
      this.base.style.bottom = 'auto';
      this.root.classList.add('on');
      this.move(e.clientX, e.clientY);
    });
    this.root.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.id) this.move(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId === this.id) this.release();
    };
    this.root.addEventListener('pointerup', end);
    this.root.addEventListener('pointercancel', end);
    this.root.addEventListener('lostpointercapture', end);
  }

  get active(): boolean {
    return this.id !== -1 && (this.x !== 0 || this.y !== 0);
  }

  private move(px: number, py: number): void {
    let dx = px - this.cx, dy = py - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > this.R) {
      dx *= this.R / d;
      dy *= this.R / d;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, d / this.R);
    // A small dead zone, then full throttle well before the rim.
    const t = Math.max(0, Math.min(1, (mag - 0.18) / 0.55));
    this.x = d > 0 ? (dx / Math.max(1, Math.hypot(dx, dy))) * t : 0;
    this.y = d > 0 ? (dy / Math.max(1, Math.hypot(dx, dy))) * t : 0;
  }

  release(): void {
    this.id = -1;
    this.x = 0;
    this.y = 0;
    this.knob.style.transform = '';
    this.base.style.left = '';
    this.base.style.top = '';
    this.base.style.bottom = '';
    this.root.classList.remove('on');
  }

  set visible(v: boolean) {
    const d = v ? '' : 'none';
    if (this.root.style.display !== d) {
      this.root.style.display = d;
      if (!v) this.release();
    }
  }
}
