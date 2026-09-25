import { clamp } from '../shared/types';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  targetZoom = 1;
  userZoom = 1;
  shake = 0;
  viewW = 800;
  viewH = 600;
  dpr = 1;
  private sx = 0;
  private sy = 0;

  resize(w: number, h: number, dpr: number): void {
    this.viewW = w;
    this.viewH = h;
    this.dpr = dpr;
  }

  /** Base zoom scales with window size so tiles stay a sensible screen size. */
  baseZoom(): number {
    return clamp(Math.min(this.viewW / 1150, this.viewH / 680), 0.6, 2.4);
  }

  follow(tx: number, ty: number, dt: number, worldW: number, worldH: number): void {
    const k = 1 - Math.exp(-dt * 8);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-dt * 4));
    const hw = this.viewW / 2 / this.zoom, hh = this.viewH / 2 / this.zoom;
    this.x = clamp(this.x, hw, Math.max(hw, worldW - hw));
    this.y = clamp(this.y, hh - 400, Math.max(hh, worldH - hh));
    this.shake = Math.max(0, this.shake - dt * 30);
    this.sx = (Math.random() - 0.5) * this.shake;
    this.sy = (Math.random() - 0.5) * this.shake;
  }

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.zoom = this.targetZoom;
  }

  get left(): number {
    return this.x - this.viewW / 2 / this.zoom + this.sx;
  }
  get top(): number {
    return this.y - this.viewH / 2 / this.zoom + this.sy;
  }
  get right(): number {
    return this.left + this.viewW / this.zoom;
  }
  get bottom(): number {
    return this.top + this.viewH / this.zoom;
  }

  /** Sets a transform so drawing in world pixels lands on screen. */
  apply(ctx: CanvasRenderingContext2D): void {
    const s = this.zoom * this.dpr;
    ctx.setTransform(s, 0, 0, s, -Math.round(this.left * s), -Math.round(this.top * s));
  }

  screenToWorld(px: number, py: number): { x: number; y: number } {
    return { x: this.left + px / this.zoom, y: this.top + py / this.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.left) * this.zoom, y: (wy - this.top) * this.zoom };
  }

  addShake(amount: number): void {
    this.shake = Math.min(24, this.shake + amount);
  }
}
