import { TER, ZONE } from '../../shared/map';
import { HANGAR } from '../../shared/mapgen';
import { TITAN_DECK_INFO } from '../defs';
import type { Game } from '../game';
import type { Tank } from '../tank';
import { campBonus } from './camp';

/**
 * A Titan Crawler is a building that learned how to move, and it breaks like one. Five armour zones take hits
 * separately and a weakened zone lets more through. The eight crawlers can be damaged and lost (each one gone costs
 * speed; losing more on one side pulls the hull that way). Six subsystems go through five damage states. Heavy hits
 * start fires in the compartments behind the armour (seven decks, bow / midships / stern); a breached hull in mud
 * or acid floods the lowest decks. Fuel, water, oxygen and temperature have to be kept up, and everything wears out:
 * the Works crew keeps it running, faster while camped, for a little scrap.
 */

export type ArmorZone = 'bow' | 'stern' | 'port' | 'starboard' | 'roof';
export const ZONES: { key: ArmorZone; name: string }[] = [
  { key: 'bow', name: 'Bow' }, { key: 'port', name: 'Port side' }, { key: 'starboard', name: 'Starboard side' }, { key: 'stern', name: 'Stern' }, { key: 'roof', name: 'Roof' },
];

export type SysKey = 'power' | 'propulsion' | 'steering' | 'weapons' | 'sensors' | 'life';
export const SYSTEMS: { key: SysKey; name: string; desc: string; deck: number; section: number }[] = [
  { key: 'power', name: 'Power', desc: 'Reactors and the main bus. Everything aboard runs on it.', deck: 7, section: 1 },
  { key: 'propulsion', name: 'Propulsion', desc: 'Diesel-electric drive to all eight crawlers: top speed.', deck: 7, section: 2 },
  { key: 'steering', name: 'Steering & Hydraulics', desc: 'Differential steering and the crawler suspension.', deck: 7, section: 0 },
  { key: 'weapons', name: 'Fire Control', desc: 'Target tracking and the magazines: how fast the guns fire.', deck: 6, section: 2 },
  { key: 'sensors', name: 'Sensors & Comms', desc: 'Radar, optics and the bridge: how far you see.', deck: 1, section: 0 },
  { key: 'life', name: 'Life Support', desc: 'Air, water recycling, heating and cooling, fire suppression.', deck: 6, section: 1 },
];

/** The five damage states every subsystem (and crawler) goes through. */
export const DAMAGE_STATES = [
  { name: 'Operational', min: 0.8, mult: 1, color: '#76ff03' },
  { name: 'Damaged', min: 0.6, mult: 0.9, color: '#c6ff00' },
  { name: 'Degraded', min: 0.35, mult: 0.72, color: '#ffd740' },
  { name: 'Critical', min: 0.1, mult: 0.45, color: '#ff9100' },
  { name: 'Disabled', min: -1, mult: 0.2, color: '#ff1744' },
] as const;

export function damageState(h: number): (typeof DAMAGE_STATES)[number] {
  return DAMAGE_STATES.find((s) => h > s.min) ?? DAMAGE_STATES[4];
}

export const SECTIONS = ['bow', 'midships', 'stern'] as const;
/** Compartments: decks 1..7 (index = (deck - 1) * 3 + section). */
export const COMPARTMENTS = 21;
export const compIndex = (deck: number, section: number): number => (deck - 1) * 3 + section;
export const compName = (i: number): string => `${TITAN_DECK_INFO[Math.floor(i / 3) + 1].level} ${TITAN_DECK_INFO[Math.floor(i / 3) + 1].name}, ${SECTIONS[i % 3]}`;

export const FUEL_MAX = 2000;
export const WATER_MAX = 1000;

export interface TitanState {
  zones: Record<ArmorZone, number>;
  /** 0-3 left bank front to back, 4-7 right. */
  crawlers: number[];
  systems: Record<SysKey, number>;
  fire: number[];
  flood: number[];
  fuel: number;
  water: number;
  /** Oxygen in the air aboard (fraction, 0.21 normal). */
  oxygen: number;
  /** Inside temperature (°C). */
  temp: number;
  /** Seconds until the next warning toast of each kind. */
  warn: Record<string, number>;
  /** Fractional scrap owed for repairs. */
  owed: number;
}

export const newTitanState = (): TitanState => ({
  zones: { bow: 1, stern: 1, port: 1, starboard: 1, roof: 1 },
  crawlers: [1, 1, 1, 1, 1, 1, 1, 1],
  systems: { power: 1, propulsion: 1, steering: 1, weapons: 1, sensors: 1, life: 1 },
  fire: new Array(COMPARTMENTS).fill(0),
  flood: new Array(COMPARTMENTS).fill(0),
  fuel: FUEL_MAX,
  water: WATER_MAX,
  oxygen: 0.209,
  temp: 21,
  warn: {},
  owed: 0,
});

/** Brings a saved state up to date (older saves had none). */
export function loadTitanState(s: Partial<TitanState> | undefined): TitanState {
  const n = newTitanState();
  if (!s) return n;
  return {
    ...n, ...s,
    zones: { ...n.zones, ...(s.zones ?? {}) },
    systems: { ...n.systems, ...(s.systems ?? {}) },
    crawlers: s.crawlers?.length === 8 ? [...s.crawlers] : n.crawlers,
    fire: s.fire?.length === COMPARTMENTS ? [...s.fire] : n.fire,
    flood: s.flood?.length === COMPARTMENTS ? [...s.flood] : n.flood,
    warn: {},
  };
}

/** Outside air temperature by biome (°C). */
const OUTSIDE: Record<number, number> = {
  [ZONE.VERDANT]: 19, [ZONE.ASH]: 24, [ZONE.SCORCHED]: 46, [ZONE.FROST]: -24, [ZONE.WRAITH]: -12, [ZONE.DUNES]: 41,
  [ZONE.LAKE]: 16, [ZONE.SPIRES]: 52, [ZONE.PASS]: 30, [ZONE.RUSTBOLT]: 26, [ZONE.DIVOT]: 33, [ZONE.EDGE]: 12,
};
export const outsideTemp = (g: Game): number => OUTSIDE[g.map.zoneAt(g.player.x, g.player.y)] ?? 20;

/** Which armour zone a hit from (x, y) lands on. */
export function zoneFrom(t: Tank, x: number, y: number): ArmorZone {
  const l = t.toLocal(x, y);
  const fx = l.lx / (t.stats.length / 2), fz = l.lz / (t.stats.width / 2);
  if (Math.abs(fx) >= Math.abs(fz)) return fx >= 0 ? 'bow' : 'stern';
  return fz >= 0 ? 'starboard' : 'port';
}

function randomZone(): ArmorZone {
  const r = Math.random();
  return r < 0.3 ? 'port' : r < 0.6 ? 'starboard' : r < 0.75 ? 'bow' : r < 0.9 ? 'stern' : 'roof';
}

/** How much more a hit on a worn-down zone does (armour plate gone: up to +40%). */
export const zoneMult = (s: TitanState, z: ArmorZone): number => 1 + 0.4 * (1 - s.zones[z]);

/**
 * A hit on your Titan: picks the armour zone (from where it came, or at random), wears it down, and passes some of
 * the hit on to the crawlers, the subsystems behind that armour and, for big hits, a fire. Returns the damage
 * multiplier from that zone's state.
 */
export function titanHit(g: Game, t: Tank, dmg: number, at?: { x: number; y: number }, zone?: ArmorZone): number {
  if (t !== g.player || !t.titan) return 1;
  const s = g.titan;
  // Something landing on top of the hull hits the roof.
  const z = zone ?? (at ? (t.edgeDist(at.x, at.y) <= 0 ? 'roof' : zoneFrom(t, at.x, at.y)) : randomZone());
  const k = dmg / Math.max(1, t.stats.maxHp);
  const mult = zoneMult(s, z);
  s.zones[z] = Math.max(0, s.zones[z] - k * 0.9);
  const l = at ? t.toLocal(at.x, at.y) : { lx: (Math.random() - 0.5) * t.stats.length, lz: 0 };
  const section = l.lx > t.stats.length / 6 ? 0 : l.lx < -t.stats.length / 6 ? 2 : 1;
  // Low hits on the flanks reach the crawlers.
  if (z === 'port' || z === 'starboard') {
    const i = Math.max(0, Math.min(3, Math.floor((t.stats.length / 2 - l.lx) / (t.stats.length / 4))));
    const c = (z === 'port' ? 0 : 4) + i;
    const before = s.crawlers[c];
    s.crawlers[c] = Math.max(0, s.crawlers[c] - k * 2.2 * (0.5 + Math.random()));
    if (before > 0.1 && s.crawlers[c] <= 0.1) {
      g.hooks.toast(`CRAWLER ${z === 'port' ? 'L' : 'R'}${i + 1} DISABLED: the Titan slows and pulls to ${z}. The Works crew will get it moving again.`, '#ff1744');
      g.hooks.sound('alarm');
      g.fx.push({ t: 'shake', amt: 0.6 });
    }
  }
  // The systems behind that armour.
  const behind: SysKey[] = z === 'bow' ? ['sensors', 'steering'] : z === 'stern' ? ['propulsion', 'power'] : z === 'roof' ? ['weapons', 'sensors'] : ['life', 'power', 'weapons'];
  const hit = behind[Math.floor(Math.random() * behind.length)];
  hurtSystem(g, hit, k * 1.1 * (1.4 - s.zones[z]));
  // Big hits start fires.
  if (k > 0.012 && Math.random() < Math.min(0.55, k * 9)) {
    const deck = z === 'roof' ? 1 : 1 + Math.floor(Math.random() * 7);
    startFire(g, compIndex(deck, z === 'bow' ? 0 : z === 'stern' ? 2 : section), 0.25 + Math.random() * 0.2);
  }
  return mult;
}

function hurtSystem(g: Game, key: SysKey, amount: number): void {
  const s = g.titan;
  const before = damageState(s.systems[key]);
  s.systems[key] = Math.max(0, s.systems[key] - amount);
  const after = damageState(s.systems[key]);
  if (after !== before && after.min < before.min) {
    const name = SYSTEMS.find((k) => k.key === key)!.name;
    g.hooks.toast(`${name.toUpperCase()}: ${after.name.toUpperCase()}`, after.color);
    if (after.name === 'Critical' || after.name === 'Disabled') g.hooks.sound('alarm');
    // A ruptured coolant loop floods Engineering.
    if (key === 'power' && after.name === 'Critical') g.titan.flood[compIndex(7, 1)] = Math.max(g.titan.flood[compIndex(7, 1)], 0.3);
  }
}

export function startFire(g: Game, i: number, amount: number): void {
  const s = g.titan;
  const was = s.fire[i];
  s.fire[i] = Math.min(1, s.fire[i] + amount);
  if (was <= 0.02 && (s.warn.fire ?? 0) <= 0) {
    s.warn.fire = 8;
    g.hooks.toast(`FIRE: ${compName(i)}. Damage control crews responding.`, '#ff6d00');
    g.hooks.sound('alarm');
  }
}

export const sysMult = (s: TitanState, k: SysKey): number => damageState(s.systems[k]).mult;

/** Crawlers that still drive, per side. */
export function crawlersUp(s: TitanState): [number, number] {
  let l = 0, r = 0;
  s.crawlers.forEach((h, i) => {
    if (h > 0.1) (i < 4 ? l++ : r++);
  });
  return [l, r];
}

/** Everything the Titan's state does to how it drives, fights and sees (read by the tank each recalc). */
export function titanMods(s: TitanState): { power: number; speed: number; steering: number; weapons: number; sensors: number; pull: number } {
  const [l, r] = crawlersUp(s);
  const drive = Math.pow((l + r) / 8, 0.8);
  const flooded = s.flood.reduce((a, b) => a + b, 0) / COMPARTMENTS;
  const fuel = s.fuel > 0 ? 1 : 0.3;
  return {
    power: sysMult(s, 'power'),
    speed: sysMult(s, 'propulsion') * drive * (1 - 1.5 * flooded) * fuel,
    steering: sysMult(s, 'steering'),
    weapons: sysMult(s, 'weapons'),
    sensors: sysMult(s, 'sensors'),
    // Fewer crawlers pulling on one side drags the hull round that way (rad/s at speed).
    pull: ((r - l) / 4) * 0.02,
  };
}

/** How comfortable the air, water and temperature aboard are (1 = fine), for crew efficiency. */
export function comfort(g: Game): number {
  const s = g.titan;
  if (!g.player.titan) return 1;
  let k = 1;
  if (s.oxygen < 0.18) k *= Math.max(0.5, 1 - (0.18 - s.oxygen) * 12);
  if (s.temp < 8 || s.temp > 32) k *= Math.max(0.6, 1 - Math.min(Math.abs(s.temp - 20) - 12, 30) * 0.015);
  if (s.water <= 0) k *= 0.7;
  return k;
}

/** Damage-control crews: the Works department on duty, plus a quarter of the off-shift crew answering the alarm. */
export function damageControl(g: Game): number {
  const p = g.player;
  const d = p.stats.depts.works;
  const off = Math.max(0, p.troops - Math.min(p.troops, p.stats.crewManned));
  return ((d ? d[0] : 0) + off * 0.25) * g.statMods.damage;
}

export function updateTitan(g: Game, dt: number): void {
  const p = g.player;
  if (!p.titan || p.dead || g.mode !== 'world') return;
  const s = g.titan;
  for (const k of Object.keys(s.warn)) s.warn[k] -= dt;
  const camped = g.deploy.state === 'up';
  const life = sysMult(s, 'life');
  const power = sysMult(s, 'power') * p.stats.powerRatio;
  const out = outsideTemp(g);

  // Fires grow, spread to the next compartments, burn the hull and the systems in them; damage-control crews and
  // (while life support works) the sprinklers put them out.
  const crews = damageControl(g);
  let burning = 0;
  for (let i = 0; i < COMPARTMENTS; i++) {
    const f = s.fire[i];
    if (f <= 0) continue;
    burning++;
    // A fire always grows (faster the bigger it is); each damage-control crew and the sprinklers knock it back.
    const fight = 0.008 * crews + 0.022 * life;
    s.fire[i] = Math.max(0, Math.min(1, f + (0.02 + 0.025 * f - fight) * dt));
    if (s.fire[i] <= 0) {
      g.hooks.toast(`Fire out: ${compName(i)}.`, '#b0bec5');
      continue;
    }
    p.hp = Math.max(1, p.hp - p.stats.maxHp * 0.0005 * f * dt);
    for (const sys of SYSTEMS) if (compIndex(sys.deck, sys.section) === i) hurtSystem(g, sys.key, 0.02 * f * dt);
    // The magazines cook off.
    if (i === compIndex(6, 2) && f > 0.9 && Math.random() < dt * 0.1) {
      p.hp = Math.max(1, p.hp - p.stats.maxHp * 0.06);
      s.zones.stern = Math.max(0, s.zones.stern - 0.15);
      g.fx.push({ t: 'boom', x: p.x, y: p.y, r: 20, color: '#ff6d00', big: true });
      g.fx.push({ t: 'shake', amt: 1.2 });
      g.hooks.toast('THE MAGAZINE COOKED OFF! Put the Logistics fire out.', '#ff1744');
      g.hooks.sound('explode');
    }
    if (f > 0.6 && Math.random() < dt * 0.08) {
      const deck = Math.floor(i / 3) + 1, sec = i % 3;
      const next = [[deck - 1, sec], [deck + 1, sec], [deck, sec - 1], [deck, sec + 1]].filter(([d, c]) => d >= 1 && d <= 7 && c >= 0 && c <= 2);
      const [d, c] = next[Math.floor(Math.random() * next.length)];
      startFire(g, compIndex(d, c), 0.2);
    }
  }
  // Wading through lava sets the bottom deck alight.
  const ter = g.map.terAt(p.x, p.y);
  if (ter === TER.LAVA && !p.stats.protects.has('heat' as never) && Math.random() < dt * 0.15) startFire(g, compIndex(7, Math.floor(Math.random() * 3)), 0.2);

  // Flooding: a breached hull in mud or acid lets it in at the bottom; the pumps (engineers, and power) get it out.
  const wet = ter === TER.MUD || ter === TER.ACID;
  const pumps = (0.01 + 0.004 * (p.stats.depts.engine?.[0] ?? 0)) * power;
  for (let sec = 0; sec < 3; sec++) {
    const z: ArmorZone = sec === 0 ? 'bow' : sec === 2 ? 'stern' : Math.min(s.zones.port, s.zones.starboard) === s.zones.port ? 'port' : 'starboard';
    const breach = wet && s.zones[z] < 0.45 ? (0.45 - s.zones[z]) * 0.12 : 0;
    for (const deck of [7, 6]) {
      const i = compIndex(deck, sec);
      const inflow = deck === 7 ? breach : Math.max(0, s.flood[compIndex(7, sec)] - 0.85) * 0.2;
      const was = s.flood[i];
      s.flood[i] = Math.max(0, Math.min(1, was + (inflow - pumps) * dt));
      if (was < 0.05 && s.flood[i] >= 0.05 && (s.warn.flood ?? 0) <= 0) {
        s.warn.flood = 10;
        g.hooks.toast(`FLOODING: ${compName(i)}. Pumps running; get out of the ${ter === TER.ACID ? 'acid' : 'mud'} and patch the ${z} armour.`, '#40c4ff');
        g.hooks.sound('alarm');
      }
      // Water in Engineering shorts out what's there.
      if (s.flood[i] > 0.5) for (const sys of SYSTEMS) if (compIndex(sys.deck, sys.section) === i) hurtSystem(g, sys.key, 0.006 * dt);
    }
  }

  // Fuel: the diesels burn it in proportion to how hard they work (a full tank is about 40 minutes flat out).
  const load = Math.abs(p.speed) / Math.max(1, p.stats.topSpeed);
  const burnRate = (p.anchored ? 0.02 : 0.08 + 0.75 * load) * (g.helm.overdrive ? 3 : 1) * g.statMods.fuel;
  const hadFuel = s.fuel > 0;
  s.fuel = Math.max(0, s.fuel - burnRate * dt);
  if (hadFuel && s.fuel <= 0) g.hooks.toast('OUT OF FUEL: running on the reactors alone at a crawl. Refinery, the Mothership, or burn scrap.', '#ff1744');
  // Refineries turn scrap into fuel; without one, the engineers burn scrap straight when it gets low.
  const refineries = p.modules.filter((m) => m.built && m.key === 'refinery').length;
  if (s.fuel < FUEL_MAX * 0.9) {
    const scrap = p.cargo.count('scrap');
    if (refineries && scrap > 10 && Math.random() < dt * 0.25 * refineries) {
      p.cargo.take('scrap', 1);
      s.fuel = Math.min(FUEL_MAX, s.fuel + 12);
    } else if (!refineries && s.fuel < FUEL_MAX * 0.2 && scrap > 5 && Math.random() < dt * 0.3) {
      p.cargo.take('scrap', 1);
      s.fuel = Math.min(FUEL_MAX, s.fuel + 5);
      if ((s.warn.burnScrap ?? 0) <= 0) {
        s.warn.burnScrap = 90;
        g.hooks.toast('Fuel low: the engineers are burning scrap in the furnaces. A Refinery does it far better.', '#ffab40');
      }
    }
  }

  // Water: everyone drinks; life support recycles most of it. The condensers pull it out of snow, ice and mud as
  // you drive over them; a camp drills a well.
  const drink = p.troops * 0.004 * (1 - 0.7 * life);
  let gain = 0;
  if (ter === TER.SNOW || ter === TER.ICE) gain += 1.5;
  else if (ter === TER.MUD || ter === TER.GRASS) gain += 0.4;
  if (camped) gain += 0.8;
  const hadWater = s.water > 0;
  s.water = Math.max(0, Math.min(WATER_MAX, s.water + (gain * Math.min(1, power) - drink) * dt));
  if (hadWater && s.water <= 0) g.hooks.toast('OUT OF WATER: the crew are thirsty and slowing down. Drive over snow, ice or mud, camp, or dock at the Mothership.', '#ff1744');

  // Air: life support keeps it at 21%; fires eat it, a dead life support lets it go stale.
  const target = 0.209 * (0.75 + 0.25 * life) - burning * 0.004;
  s.oxygen += (target - s.oxygen) * Math.min(1, dt * 0.05);
  // Heating and cooling pull the inside toward 21 °C, harder the better life support and power are.
  const hvac = life * Math.min(1, power);
  const inside = 21 + burning * 3;
  s.temp += ((out - s.temp) * 0.004 * (1 - hvac) + (inside - s.temp) * 0.03 * hvac) * dt * (p.stats.protects.has((out < 0 ? 'cold' : 'heat') as never) ? 1.5 : 1);

  // Docked in the Mega Hangar: topped up for free.
  const hg = g.gen.hangar;
  if (hg && Math.abs(p.x - hg.x) < HANGAR.w / 2 && Math.abs(p.y - hg.y) < HANGAR.d / 2) {
    s.fuel = Math.min(FUEL_MAX, s.fuel + 25 * dt);
    s.water = Math.min(WATER_MAX, s.water + 15 * dt);
  }

  // Wear: crawlers and the drive wear with every metre; everything else slowly.
  const metres = Math.abs(p.speed) * dt;
  for (let i = 0; i < 8; i++) s.crawlers[i] = Math.max(0, s.crawlers[i] - metres * 0.000004 * (1 + Math.random()));
  s.systems.propulsion = Math.max(0, s.systems.propulsion - metres * 0.000003 * (g.helm.overdrive ? 5 : 1));
  s.systems.power = Math.max(0, s.systems.power - dt * 0.00002);
  s.systems.steering = Math.max(0, s.systems.steering - Math.abs(p.yawRate) * dt * 0.0006);

  // Maintenance: the Works crew fix the worst thing first (fires aside), a few percent a minute, for scrap.
  const works = Math.max(0.5, crews) * campBonus(g).build * p.efficiency;
  let budget = 0.0012 * works * dt;
  const jobs: { get: () => number; set: (v: number) => void }[] = [
    ...s.crawlers.map((_, i) => ({ get: () => s.crawlers[i], set: (v: number) => (s.crawlers[i] = v) })),
    ...SYSTEMS.map((k) => ({ get: () => s.systems[k.key], set: (v: number) => (s.systems[k.key] = v) })),
    ...ZONES.map((z) => ({ get: () => s.zones[z.key], set: (v: number) => (s.zones[z.key] = v) })),
  ].sort((a, b) => a.get() - b.get());
  for (const j of jobs) {
    if (budget <= 0) break;
    const h = j.get();
    if (h >= 1) continue;
    if (p.cargo.count('scrap') <= 0) break;
    const fix = Math.min(budget, 1 - h);
    j.set(h + fix);
    budget -= fix;
    s.owed += fix * 20;
  }
  while (s.owed >= 1 && p.cargo.count('scrap') > 0) {
    p.cargo.take('scrap', 1);
    s.owed -= 1;
  }

  // Push the effects onto the hull (with what the officers on the stations add).
  const m = titanMods(s);
  const st = g.statMods;
  m.speed *= st.speed;
  m.steering *= st.turn;
  m.weapons *= st.dmg;
  m.sensors *= st.vision;
  m.power *= st.power;
  const t = p.titanMods;
  if (Math.abs(t.power - m.power) > 0.01 || Math.abs(t.speed - m.speed) > 0.01 || Math.abs(t.sensors - m.sensors) > 0.01 || Math.abs(t.weapons - m.weapons) > 0.01) {
    p.titanMods = m;
    p.recalc();
  } else {
    t.steering = m.steering;
    t.pull = m.pull;
  }
}

/** Short lines for the HUD: what's on fire, flooding or failing right now. */
export function titanAlerts(g: Game): { text: string; color: string }[] {
  const s = g.titan;
  if (!g.player.titan) return [];
  const out: { text: string; color: string }[] = [];
  const fires = s.fire.map((f, i) => [f, i] as const).filter(([f]) => f > 0);
  if (fires.length) out.push({ text: `🔥 ${fires.length === 1 ? compName(fires[0][1]) : `${fires.length} fires`}`, color: '#ff6d00' });
  const floods = s.flood.filter((f) => f > 0.05).length;
  if (floods) out.push({ text: `💧 Flooding ×${floods}`, color: '#40c4ff' });
  const [l, r] = crawlersUp(s);
  if (l + r < 8) out.push({ text: `⛓ ${l + r}/8 crawlers`, color: '#ff9100' });
  for (const k of SYSTEMS) {
    const st = damageState(s.systems[k.key]);
    if (st.min < 0.35) out.push({ text: `${k.name}: ${st.name}`, color: st.color });
  }
  if (s.fuel < FUEL_MAX * 0.15) out.push({ text: `⛽ Fuel ${Math.round((s.fuel / FUEL_MAX) * 100)}%`, color: s.fuel <= 0 ? '#ff1744' : '#ffab40' });
  if (s.water < WATER_MAX * 0.15) out.push({ text: `🚰 Water ${Math.round((s.water / WATER_MAX) * 100)}%`, color: s.water <= 0 ? '#ff1744' : '#ffab40' });
  return out.slice(0, 4);
}
