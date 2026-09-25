import type { Hazard, RGB } from './types';

/** How a rig's drive train interacts with the ground it rolls over. */
export type Terrain = 'normal' | 'sand' | 'ice' | 'ash' | 'mud' | 'liquid';

export type TileStyle =
  | 'air' | 'soil' | 'rock' | 'sand' | 'sandstone' | 'ice' | 'snow' | 'ash' | 'basalt'
  | 'lava' | 'acid' | 'mud' | 'glass' | 'scrap' | 'ore' | 'concrete' | 'girder' | 'bedrock'
  | 'platform' | 'plate' | 'lamp' | 'fungus' | 'neon';

export interface TileDef {
  id: number;
  key: string;
  name: string;
  solid: boolean;
  liquid: boolean;
  platform: boolean;
  /** Seconds to mine with a power-1 tool. */
  hardness: number;
  /** Minimum tool tier needed to mine. */
  tier: number;
  indestructible: boolean;
  drop: string | null;
  dropN: number;
  terrain: Terrain;
  light: number;
  lightColor: RGB;
  style: TileStyle;
  base: RGB;
  accent: RGB;
  map: RGB;
  contact: { hazard: Hazard; dps: number } | null;
}

export const T = {
  AIR: 0, DIRT: 1, ROCK: 2, SAND: 3, SANDSTONE: 4, ICE: 5, SNOW: 6, ASH: 7, BASALT: 8,
  LAVA: 9, ACID: 10, MUD: 11, GLASS: 12, SCRAP: 13, IRON: 14, COPPER: 15, TITANIUM: 16,
  URANIUM: 17, CRYSTAL: 18, SULFUR: 19, XENITE: 20, CONCRETE: 21, GIRDER: 22, BEDROCK: 23,
  PLATFORM: 24, PLATE: 25, LAMP: 26, FUNGUS: 27, NEON: 28,
} as const;

const list: TileDef[] = [];

function def(id: number, key: string, name: string, style: TileStyle, base: RGB, o: Partial<TileDef> = {}): void {
  list[id] = {
    id, key, name, style, base,
    solid: true, liquid: false, platform: false,
    hardness: 1, tier: 0, indestructible: false,
    drop: key, dropN: 1, terrain: 'normal',
    light: 0, lightColor: [255, 255, 255],
    accent: base, map: base, contact: null,
    ...o,
  };
}

def(T.AIR, 'air', 'Air', 'air', [0, 0, 0], { solid: false, drop: null, hardness: 0 });
def(T.DIRT, 'dirt', 'Wasteland Soil', 'soil', [104, 80, 60], { hardness: 0.35, accent: [78, 58, 44] });
def(T.ROCK, 'rock', 'Rock', 'rock', [94, 91, 98], { hardness: 0.9 });
def(T.SAND, 'sand', 'Sand', 'sand', [214, 178, 112], { hardness: 0.3, terrain: 'sand' });
def(T.SANDSTONE, 'sandstone', 'Sandstone', 'sandstone', [178, 134, 86], { hardness: 0.7, drop: 'rock' });
def(T.ICE, 'ice', 'Ice', 'ice', [150, 206, 236], { hardness: 0.6, terrain: 'ice' });
def(T.SNOW, 'snow', 'Snow', 'snow', [226, 236, 248], { hardness: 0.25, terrain: 'ice' });
def(T.ASH, 'ash', 'Ash Crust', 'ash', [72, 64, 66], { hardness: 0.35, terrain: 'ash', accent: [255, 110, 40] });
def(T.BASALT, 'basalt', 'Basalt', 'basalt', [52, 48, 58], { hardness: 1.2, tier: 1 });
def(T.LAVA, 'lava', 'Lava', 'lava', [255, 112, 24], {
  solid: false, liquid: true, drop: null, hardness: 0, indestructible: true, terrain: 'liquid',
  light: 1, lightColor: [255, 140, 60], accent: [255, 220, 90], contact: { hazard: 'heat', dps: 45 },
});
def(T.ACID, 'acid', 'Acid', 'acid', [110, 220, 60], {
  solid: false, liquid: true, drop: null, hardness: 0, indestructible: true, terrain: 'liquid',
  light: 0.55, lightColor: [140, 255, 90], accent: [210, 255, 140], contact: { hazard: 'toxic', dps: 30 },
});
def(T.MUD, 'mud', 'Marsh Mud', 'mud', [64, 60, 40], { hardness: 0.3, terrain: 'mud', accent: [90, 96, 52] });
def(T.GLASS, 'glass', 'Rad Glass', 'glass', [118, 188, 108], { hardness: 0.5, light: 0.12, lightColor: [150, 255, 120], accent: [200, 255, 170] });
def(T.SCRAP, 'scrap_heap', 'Scrap Heap', 'scrap', [128, 88, 62], { hardness: 0.45, drop: 'scrap', dropN: 2 });
def(T.IRON, 'iron_vein', 'Iron Vein', 'ore', [94, 91, 98], { hardness: 1.1, tier: 1, drop: 'iron_ore', accent: [200, 104, 72], map: [150, 96, 80] });
def(T.COPPER, 'copper_vein', 'Copper Vein', 'ore', [94, 91, 98], { hardness: 1.0, tier: 1, drop: 'copper_ore', accent: [226, 140, 64], map: [180, 120, 70] });
def(T.TITANIUM, 'titanium_vein', 'Titanium Vein', 'ore', [84, 84, 96], { hardness: 1.6, tier: 2, drop: 'titanium_ore', accent: [196, 214, 236], map: [170, 186, 210] });
def(T.URANIUM, 'uranium_vein', 'Uranium Vein', 'ore', [70, 78, 70], {
  hardness: 1.8, tier: 2, drop: 'uranium_ore', accent: [160, 255, 80], light: 0.4, lightColor: [140, 255, 80], map: [120, 220, 70],
});
def(T.CRYSTAL, 'cryo_vein', 'Cryo Crystal', 'ore', [110, 140, 170], {
  hardness: 1.5, tier: 2, drop: 'cryo_crystal', accent: [120, 250, 255], light: 0.4, lightColor: [100, 240, 255], map: [120, 230, 250],
});
def(T.SULFUR, 'sulfur_vein', 'Sulfur Deposit', 'ore', [62, 56, 60], { hardness: 1.2, tier: 2, drop: 'sulfur', accent: [255, 226, 70], map: [220, 200, 60] });
def(T.XENITE, 'xenite_vein', 'Xenite Cluster', 'ore', [48, 40, 58], {
  hardness: 2.4, tier: 3, drop: 'xenite', accent: [255, 60, 220], light: 0.5, lightColor: [255, 70, 230], map: [230, 60, 210],
});
def(T.CONCRETE, 'concrete', 'Concrete', 'concrete', [128, 128, 132], { hardness: 1.0, tier: 1 });
def(T.GIRDER, 'girder', 'Rusted Girder', 'girder', [140, 82, 52], { hardness: 0.8, drop: 'scrap' });
def(T.BEDROCK, 'bedrock', 'Bedrock', 'bedrock', [30, 26, 36], { hardness: 999, tier: 99, indestructible: true, drop: null });
def(T.PLATFORM, 'platform', 'Platform', 'platform', [150, 120, 80], { solid: false, platform: true, hardness: 0.15 });
def(T.PLATE, 'metal_plate', 'Metal Plating', 'plate', [120, 126, 134], { hardness: 0.9 });
def(T.LAMP, 'lamp', 'Glow Lamp', 'lamp', [255, 214, 140], { solid: false, hardness: 0.1, light: 1, lightColor: [255, 214, 150] });
def(T.FUNGUS, 'fungus', 'Mutant Fungus', 'fungus', [150, 90, 200], {
  solid: false, hardness: 0.1, drop: 'biomass', dropN: 2, light: 0.35, lightColor: [200, 120, 255], accent: [90, 255, 200],
});
def(T.NEON, 'neon', 'Neon Block', 'neon', [255, 40, 200], { hardness: 0.5, light: 0.8, lightColor: [255, 60, 210] });

export const TILES: readonly TileDef[] = list;

export const isSolidTile = (t: number): boolean => list[t].solid;
export const isLiquidTile = (t: number): boolean => list[t].liquid;

/* ------------------------------------------------------------------------ */
/* Background walls: non-colliding scenery layer (ruins, bunkers, signs).   */
/* ------------------------------------------------------------------------ */

export interface WallDef {
  id: number;
  key: string;
  base: RGB;
  light: number;
  lightColor: RGB;
}

export const W = {
  NONE: 0, CONCRETE: 1, METAL: 2, WINDOWS: 3, NEON_PINK: 4, NEON_CYAN: 5, GIRDER: 6, PIPES: 7, HAZARD: 8,
} as const;

export const WALLS: readonly WallDef[] = [
  { id: 0, key: 'none', base: [0, 0, 0], light: 0, lightColor: [0, 0, 0] },
  { id: 1, key: 'concrete', base: [66, 66, 72], light: 0, lightColor: [0, 0, 0] },
  { id: 2, key: 'metal', base: [74, 60, 52], light: 0, lightColor: [0, 0, 0] },
  { id: 3, key: 'windows', base: [34, 40, 52], light: 0.25, lightColor: [255, 200, 120] },
  { id: 4, key: 'neon_pink', base: [60, 20, 50], light: 0.8, lightColor: [255, 60, 200] },
  { id: 5, key: 'neon_cyan', base: [20, 50, 60], light: 0.8, lightColor: [60, 240, 255] },
  { id: 6, key: 'girder', base: [96, 60, 42], light: 0, lightColor: [0, 0, 0] },
  { id: 7, key: 'pipes', base: [60, 68, 60], light: 0, lightColor: [0, 0, 0] },
  { id: 8, key: 'hazard', base: [70, 62, 30], light: 0, lightColor: [0, 0, 0] },
];
