/**
 * Keyboard, mouse and touch state with per-frame edge detection.
 * Touch: a quick tap on the battlefield sets `mouse.tap` (the app decides what it means), a finger
 * held down or dragged sets `mouse.drag` (steer toward it), and two fingers pinch to zoom
 * (reported through `mouse.wheel`).
 */
export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  mouse = {
    x: 0, y: 0, left: false, right: false, middle: false, leftPressed: false, rightPressed: false, leftReleased: false,
    wheel: 0, overUI: false, inside: true,
    /** A touch tap landed on the battlefield this frame. */
    tap: false,
    /** One finger is held (or dragged) on the battlefield: not a tap, not a pinch. */
    drag: false,
  };
  /** True once the player has touched the screen (switches the UI to touch mode). */
  touchMode = false;
  onTouchMode?: () => void;
  private touches = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinchDist = 0;
  private tapOk = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
      if (['Space', 'Tab', 'F1', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.mouse.left = this.mouse.right = this.mouse.middle = false;
      this.touches.clear();
      this.mouse.drag = false;
    });
    // Mouse (touch pointers call preventDefault, so no emulated mouse events arrive from the battlefield).
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.overUI = e.target !== target;
      this.mouse.inside = true;
    });
    document.addEventListener('mouseleave', () => (this.mouse.inside = false));
    target.addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.overUI = false;
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftPressed = true;
      } else if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightPressed = true;
      } else if (e.button === 1) {
        this.mouse.middle = true;
        e.preventDefault();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        if (this.mouse.left) this.mouse.leftReleased = true;
        this.mouse.left = false;
      } else if (e.button === 2) this.mouse.right = false;
      else if (e.button === 1) this.mouse.middle = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener(
      'wheel',
      (e) => {
        this.mouse.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    // Touch and pen. Anything touching the page (HUD included) switches the UI to touch mode.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !this.touchMode) this.setTouchMode();
    }, true);
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.touches.size === 1) {
        this.tapOk = true;
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.overUI = false;
        this.mouse.inside = true;
      } else {
        // A second finger: pinch, not a tap or a drag.
        this.tapOk = false;
        this.mouse.drag = false;
        this.pinchDist = this.spread();
      }
    });
    target.addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      t.x = e.clientX;
      t.y = e.clientY;
      if (this.touches.size >= 2) {
        const d = this.spread();
        if (this.pinchDist > 0 && d > 0) this.mouse.wheel += Math.log(this.pinchDist / d) * 10;
        this.pinchDist = d;
        return;
      }
      if (Math.hypot(t.x - t.sx, t.y - t.sy) > 14) {
        this.tapOk = false;
        this.mouse.drag = true;
      }
      this.mouse.x = t.x;
      this.mouse.y = t.y;
    });
    const end = (e: PointerEvent): void => {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      this.touches.delete(e.pointerId);
      if (this.touches.size === 0) {
        if (this.tapOk && e.type === 'pointerup' && performance.now() - t.t < 450) {
          this.mouse.tap = true;
          this.mouse.x = t.x;
          this.mouse.y = t.y;
        }
        this.tapOk = false;
        this.mouse.drag = false;
      }
      this.pinchDist = this.touches.size >= 2 ? this.spread() : 0;
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) this.setTouchMode();
  }

  /** Called every frame: a finger held still for a moment becomes a drag (steering). */
  update(): void {
    if (this.touches.size !== 1 || !this.tapOk) return;
    const t = this.touches.values().next().value!;
    if (performance.now() - t.t > 450) {
      this.tapOk = false;
      this.mouse.drag = true;
    }
  }

  private setTouchMode(): void {
    this.touchMode = true;
    document.documentElement.classList.add('touch');
    this.onTouchMode?.();
  }

  private spread(): number {
    const pts = [...this.touches.values()];
    return pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  }

  down(code: string): boolean {
    return this.held.has(code);
  }

  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.leftReleased = false;
    this.mouse.wheel = 0;
    this.mouse.tap = false;
  }
}
