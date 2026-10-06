/**
 * The hulls you can drive. Every commander starts in the Shark: a hundred metres of black armour on six crawlers, quick
 * and mean. Bigger hulls are bought at a base's yard with the scrap you haul home: the Titan Crawler (the triple-prowed
 * mobile fortress, its superstructure stepped up to a command tower, ten crawlers) and, bigger again, the
 * Dreadnought. Everything aboard moves across with you: the deck plan, the guns, the crew. A bigger hull is longer,
 * wider and taller (its deck cells are bigger), tougher and better armoured, and slower to turn.
 */

export type FrameKey = 'shark' | 'titan' | 'dread';

export interface FrameDef {
  key: FrameKey;
  name: string;
  title: string;
  /** Deck cell size (m): the hull's length, width and height scale with it. */
  cell: number;
  hp: number;
  armor: number;
  speed: number;
  turn: number;
  cost: Record<string, number>;
  /** Commander level needed to buy it. */
  level: number;
  desc: string;
}

export const FRAMES: Record<FrameKey, FrameDef> = {
  shark: {
    key: 'shark', name: 'Shark', title: 'Strike crawler · 100 m', cell: 2.5, hp: 1, armor: 0, speed: 1, turn: 1, cost: {}, level: 1,
    desc: 'Black, low and fast: a blade of a bow, six crawlers, a twin battery on its spine. Where everyone starts.',
  },
  titan: {
    key: 'titan', name: 'Titan Crawler', title: 'Mobile fortress · 120 m', cell: 3, hp: 1.6, armor: 0.04, speed: 0.93, turn: 0.86, level: 8,
    cost: { scrap: 2400, iron_plate: 160, circuit: 50, titanium_alloy: 30 },
    desc: 'Three prows abreast with white LED fangs, a superstructure stepped up to a battleship command tower, ten crawlers under armour skirts, a vehicle ramp at the stern. Sixty per cent more hull and heavier armour.',
  },
  dread: {
    key: 'dread', name: 'Dreadnought', title: 'Living city · 144 m', cell: 3.6, hp: 2.4, armor: 0.08, speed: 0.85, turn: 0.72, level: 16,
    cost: { scrap: 6000, iron_plate: 400, titanium_alloy: 120, tech_parts: 40 },
    desc: 'The Titan Crawler grown into a city: a second tower, twelve crawlers, armour like a cliff. Two and a half times the hull.',
  },
};

export const FRAME_ORDER: FrameKey[] = ['shark', 'titan', 'dread'];
