/** Keyboard + mouse state with per-frame edge detection. */
export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  mouse = {
    x: 0, y: 0, left: false, right: false, middle: false, leftPressed: false, rightPressed: false, leftReleased: false,
    wheel: 0, overUI: false, inside: true,
  };

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
    });
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
    // Basic touch: tap = move, long-press = attack/fire.
    target.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (!t) return;
      this.mouse.x = t.clientX;
      this.mouse.y = t.clientY;
      this.mouse.rightPressed = true;
      this.mouse.overUI = false;
      e.preventDefault();
    }, { passive: false });
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
  }
}
