import type { Game } from '../game';
import { mission } from '../campaign';
import { ZONE_INFO, LOCATIONS } from '../../shared/crater';
import { REGION_INFO, threatAt, threatTier, TIER_NAMES } from '../../shared/mapgen';

/**
 * The intercom to the Mega Hangar. Its people come on the line with their faces on the screen: Hangar Ops with the
 * mission and its objectives, the Intel desk briefing you on every zone and place you drive into (what lives there,
 * what it'll do to you, what to fit), Gate Control, and the news from round the Crater. One message at a time, each
 * on the screen for a few seconds; the latest few stay in the log.
 */

export type Agent = 'ops' | 'intel' | 'gate' | 'news' | 'engineer';

export const AGENTS: Record<Agent, { name: string; post: string; seed: number; color: string }> = {
  ops: { name: 'CHIEF ADEYEMI', post: 'HANGAR OPS', seed: 4121, color: '#40c4ff' },
  intel: { name: 'LT. KOVACS', post: 'INTEL DESK', seed: 7713, color: '#ffd740' },
  gate: { name: 'SGT. RUIZ', post: 'GATE CONTROL', seed: 2290, color: '#76ff03' },
  news: { name: 'DUSTY VOSS', post: 'CRATER RADIO', seed: 9054, color: '#ff80ab' },
  engineer: { name: 'ENG. HALVORSEN', post: 'YARD ENGINEER', seed: 5577, color: '#ffab40' },
};

export interface CommMsg {
  agent: Agent;
  kind: 'objective' | 'brief' | 'news' | 'alert';
  text: string;
  /** Seconds left on the screen. */
  t: number;
}

export interface Comms {
  queue: CommMsg[];
  current: CommMsg | null;
  log: CommMsg[];
  lastZone: number;
  lastRegion: number;
  lastMission: string;
  newsT: number;
  checkT: number;
}

export const newComms = (): Comms => ({ queue: [], current: null, log: [], lastZone: -1, lastRegion: -1, lastMission: '', newsT: 90, checkT: 0 });

const NEWS = [
  'Iron Hollow reports the lake glowing again. Keep your crews out of the water.',
  'Northridge is paying double for cryo cores this week. Frostbite not included.',
  'A caravan out of Verdant Fields went quiet near the ash line. If you see wreckage, it was probably them.',
  'The Blood Eagles have been painting new marks on the canyon walls. Nobody knows what they mean. Nobody wants to.',
  'Seismographs at the Hangar picked up something big moving under the Divot. Again.',
  'Rustbolt\'s foundries were running all night. Expect their war rigs on the roads.',
  'Word from the Spires: the anomalies are shifting. Compasses spin out there.',
  'Market prices at the Hangar: scrap steady, titanium up, rations down. Sulfur still stinks.',
  'Weather desk says a storm front is building over the dunes. Visibility will drop to nothing.',
  'Somebody at the Hangar bar swears they saw a Titan crawl out of the Black Lake. They were buying rounds.',
];

/** Puts a message on the line (queued behind whatever is showing). */
export function comm(g: Game, agent: Agent, text: string, kind: CommMsg['kind'] = 'news'): void {
  const c = g.comms;
  // No repeats of the same line in a row.
  if (c.current?.text === text || c.queue.some((m) => m.text === text)) return;
  c.queue.push({ agent, kind, text, t: Math.max(6, Math.min(14, text.length / 12)) });
  if (c.queue.length > 6) c.queue.shift();
}

export function updateComms(g: Game, dt: number): void {
  const c = g.comms;
  if (g.mode !== 'world') return;
  // The message on screen.
  if (c.current) {
    c.current.t -= dt;
    if (c.current.t <= 0) c.current = null;
  }
  if (!c.current && c.queue.length) {
    c.current = c.queue.shift()!;
    c.log.push(c.current);
    if (c.log.length > 12) c.log.shift();
    g.hooks.sound('ui');
  }
  c.checkT -= dt;
  if (c.checkT > 0) return;
  c.checkT = 1;
  const p = g.player;
  // A new zone: Intel's briefing on it.
  const z = g.map.zoneAt(p.x, p.y);
  if (z !== c.lastZone) {
    const first = c.lastZone < 0;
    c.lastZone = z;
    const zi = ZONE_INFO[z];
    if (zi && !first) {
      const tier = TIER_NAMES[threatTier(threatAt(p.x, p.y))] ?? '';
      const worst = zi.roster.slice(-3).map((r) => r[0]).join(', ');
      const hz = zi.hazards.length ? ` Hazards: ${zi.hazards.join(', ')}.` : '';
      comm(g, 'intel', `Entering ${zi.name}: ${zi.label.toLowerCase()}. Threat ${tier}.${hz}${worst ? ` Watch for ${worst}.` : ''}`, 'brief');
    }
  }
  // A named place (or any region) nearby: what it is.
  let near = -1, nd = Infinity;
  for (const r of g.gen.regions) {
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d < r.r + 400 && d < nd) {
      nd = d;
      near = r.id;
    }
  }
  if (near !== c.lastRegion) {
    c.lastRegion = near;
    const r = g.gen.regions.find((k) => k.id === near);
    if (r && r.kind !== 'hangar') {
      const loc = r.key ? LOCATIONS.find((l) => l.id === r.key) : undefined;
      const info = REGION_INFO[r.kind];
      comm(g, info?.hostile ? 'intel' : 'ops', `${r.name}${info ? ` (${info.title})` : ''} ahead. ${loc?.desc ?? info?.desc ?? ''}`.trim(), 'brief');
    }
  }
  // The mission moved on: Ops with the next objective.
  const m = mission(g);
  const key = `${m.title}|${m.step}`;
  if (key !== c.lastMission) {
    c.lastMission = key;
    comm(g, 'ops', `${m.title}: ${m.text}`, 'objective');
  }
  // The news, every few minutes while it's quiet.
  c.newsT -= 1;
  if (c.newsT <= 0 && g.wave.phase === 'calm') {
    c.newsT = 150 + Math.random() * 120;
    comm(g, 'news', NEWS[Math.floor(Math.random() * NEWS.length)], 'news');
  }
}
