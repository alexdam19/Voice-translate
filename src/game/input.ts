/** Keyboard + mouse state with per-frame edge detection. */
export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  mouse = { x: 0, y: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0, overUI: false };

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
      if (['Space', 'Tab', 'F1', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.mouse.left = this.mouse.right = false;
    });
    canvas.addEventListener('mousemove', (e) => this.setMouse(e));
    window.addEventListener('mousemove', (e) => {
      this.setMouse(e);
      this.mouse.overUI = e.target !== canvas;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.setMouse(e);
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftPressed = true;
      } else if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      else if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.mouse.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }

  private setMouse(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
  }

  down(code: string): boolean {
    return this.held.has(code);
  }

  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Consumes a key press so other handlers don't see it this frame. */
  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  /** Clears one-shot input (presses, clicks, wheel) so it is seen by exactly one simulation step. */
  endFrame(): void {
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.wheel = 0;
  }
}
