import type { Game } from '../game';

/**
 * Life aboard. Everyone eats; everyone on duty needs a shift off. Keep a third of the people on duty resting at any
 * time and the fortress runs at full efficiency; run it with nobody to relieve them and fatigue builds up. Run out
 * of rations and hunger builds up, and starving crew start walking off. Tired or hungry crew work slower: guns fire
 * slower and every station produces less.
 */

export interface CrewLife {
  /** 0 fresh .. 1 dead on their feet. */
  fatigue: number;
  /** 0 fed .. 1 starving. */
  hunger: number;
  /** Rations owed (eaten a bit at a time). */
  eat: number;
  desertT: number;
  warnT: number;
}

export const newCrewLife = (): CrewLife => ({ fatigue: 0, hunger: 0, eat: 0, desertT: 0, warnT: 0 });

/** Rations one person eats per second. */
export const RATION_RATE = 1 / 400;

export interface Shift {
  people: number;
  onDuty: number;
  resting: number;
  /** Resting people needed so everyone on duty gets a break. */
  needRest: number;
  /** Rations eaten per minute, and grown per minute. */
  eatPerMin: number;
  growPerMin: number;
}

export function shift(g: Game): Shift {
  const p = g.player;
  const onDuty = Math.min(p.troops, p.stats.crewManned);
  const people = p.troops;
  const mess = p.modules.some((m) => m.key === 'mess_hall' && m.crew > 0);
  return {
    people, onDuty, resting: people - onDuty, needRest: Math.ceil(onDuty / 3),
    eatPerMin: people * RATION_RATE * 60 * (mess ? 0.7 : 1),
    growPerMin: (p.stats.food * 60) / 25,
  };
}

export function efficiency(l: CrewLife): number {
  return (1 - 0.45 * l.fatigue) * (1 - 0.5 * l.hunger);
}

export function updateCrewLife(g: Game, dt: number): void {
  const p = g.player;
  if (p.dead || g.mode !== 'world') return;
  const l = g.life;
  // Builders work in crews of two.
  const want = g.builds.length * 2;
  if (p.buildCrew !== want) {
    p.buildCrew = want;
    p.recalc();
  }
  const s = shift(g);
  const camped = g.deploy.state === 'up';
  // Shifts: resting people take over from tired ones.
  const r = s.needRest <= 0 ? 2 : s.resting / s.needRest;
  if (r < 1) l.fatigue = Math.min(1, l.fatigue + ((1 - r) * dt) / 180);
  else l.fatigue = Math.max(0, l.fatigue - dt / (camped ? 25 : 80));
  // Meals.
  l.eat += s.eatPerMin / 60 * dt;
  while (l.eat >= 1) {
    l.eat -= 1;
    if (p.cargo.count('rations') > 0) p.cargo.take('rations', 1);
    else l.hunger = Math.min(1, l.hunger + 0.12);
  }
  if (p.cargo.count('rations') > 0) l.hunger = Math.max(0, l.hunger - dt / 45);
  // Starving crew leave.
  if (l.hunger >= 0.99 && p.troops > 0) {
    l.desertT += dt;
    if (l.desertT > 25) {
      l.desertT = 0;
      p.troops--;
      p.recalc();
      g.hooks.toast('A starving crewman walked off into the wasteland. Get rations: Hydroponics, trades, or biomass.', '#ff8a80');
    }
  } else l.desertT = 0;
  const eff = efficiency(l);
  if (Math.abs(eff - p.efficiency) > 0.02) {
    p.efficiency = eff;
    p.recalc();
  }
  l.warnT -= dt;
  if (l.warnT <= 0) {
    if (l.fatigue > 0.5) {
      l.warnT = 60;
      g.hooks.toast(`Your crew are exhausted (${Math.round(l.fatigue * 100)}%): too few people to rotate shifts. Build Living Quarters and fill them, or set up camp to rest.`, '#ffab40');
    } else if (l.hunger > 0.4) {
      l.warnT = 45;
      g.hooks.toast('The crew are going hungry. Rations: Hydroponics grows them, the Mothership trades them, biomass cooks into them.', '#ffab40');
    }
  }
}
