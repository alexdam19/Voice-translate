import { describe, expect, it } from 'vitest';
import { mission } from '../src/game/campaign';
import { updateNav } from '../src/game/systems/nav';
import { game } from './helpers';

describe('Satnav', () => {
  it('routes to the mission along the roads, follows her along it and says which way', () => {
    const g = game();
    const p = g.player;
    const m = mission(g);
    expect(m.x).toBeDefined();
    const t0 = performance.now();
    updateNav(g, 0.016);
    const ms = performance.now() - t0;
    const n = g.nav!;
    expect(n).toBeTruthy();
    expect(n.kind).toBe('mission');
    expect(n.pts.length).toBeGreaterThan(2);
    expect(n.road).toBe(true);
    // Starts at her and ends at the objective; no longer than half again the straight line.
    expect(n.pts[0]).toEqual({ x: p.x, y: p.y });
    expect(n.pts[n.pts.length - 1]).toEqual({ x: m.x, y: m.y });
    const straight = Math.hypot(m.x! - p.x, m.y! - p.y);
    expect(n.cum[n.cum.length - 1]).toBeLessThan(straight * 1.5);
    expect(ms).toBeLessThan(1500);
    expect(n.cue.text.length).toBeGreaterThan(3);
    // Driven a way down the route, she's further along it and the distance left drops.
    const q = n.pts[Math.min(n.pts.length - 2, 40)];
    p.x = q.x;
    p.y = q.y;
    const before = n.cue.left;
    for (let i = 0; i < 3; i++) updateNav(g, 0.016);
    expect(g.nav!.at).toBeGreaterThan(100);
    expect(g.nav!.cue.left).toBeLessThan(before);
    // Pointed the wrong way, it says turn round.
    const ahead = g.nav!.pts[g.nav!.seg + 1];
    p.rot = Math.atan2(ahead.y - p.y, ahead.x - p.x) + Math.PI;
    updateNav(g, 0.016);
    expect(['around', 'left', 'right']).toContain(g.nav!.cue.turn);
    // A plotted course takes over.
    p.goal = { x: p.x + 300, y: p.y + 40 };
    updateNav(g, 0.016);
    expect(g.nav!.kind).toBe('course');
    expect(g.nav!.pts.length).toBe(2);
  });
});
