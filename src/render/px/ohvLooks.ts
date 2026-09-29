import type { Arch, EnemyDef } from '../../game/enemyDefs';

/**
 * Which OpenHV sprite plays each enemy: soldiers of every faction (rifles, rockets, flamers, snipers, the dead as
 * shamblers), beasts, big birds, worms, drones, choppers and gunships, and raider vehicles from bikes to battle
 * tanks. Faction sets the team colour; a creature's own colour tints the beasts. Giants and bosses keep their
 * painted sprites (Hard Vacuum has nothing that size).
 */

export interface OhvLook {
  sheet: string;
  /** Sequence while moving and while standing. */
  move: string;
  idle: string;
  team: string;
  tint: string | null;
  tintK: number;
  /** Real size (metres) the sprite's frame stands for, to pick its scale. */
  metres: number;
}

const TEAM: Record<string, string> = {
  zombie: '#7c9a3c', necro: '#8e7cc3', cyborg: '#26c6da', military: '#6d7f55', raider: '#e0662a', monster: '#b0453a',
};

const has = (s: string, ...w: string[]): boolean => w.some((k) => s.includes(k));

export function ohvLookFor(kind: string, def: EnemyDef | undefined, arch: Arch): OhvLook | null {
  if (!def) return null;
  const n = `${kind} ${def.name}`.toLowerCase();
  const team = TEAM[def.faction ?? ''] ?? def.color ?? '#b0453a';
  const L = (sheet: string, move = 'move', idle = 'idle', tint: string | null = null, tintK = 0, metres = 2): OhvLook => ({ sheet, move, idle, team, tint, tintK, metres });
  switch (arch) {
    case 'humanoid': {
      if (def.faction === 'zombie' || kind.startsWith('z_')) return L(has(n, 'brute', 'tank') ? 'flamer' : 'technician', 'idle', 'idle', def.color ?? null, 0.35);
      if (has(n, 'skel', 'bone', 'lich')) return L(has(n, 'archer') ? 'sniper' : 'blaster', 'idle', 'idle', '#d8d0bc', 0.45);
      if (has(n, 'necro', 'mage', 'witch', 'shaman', 'priest')) return L('shocker', 'idle', 'idle', def.color ?? null, 0.2);
      if (def.proj === 'missile' || has(n, 'rocket', 'launcher', 'bazooka')) return L('rocketeer', 'idle', 'idle');
      if (has(n, 'flame', 'burn', 'pyro')) return L('flamer', 'idle', 'idle');
      if (has(n, 'mortar', 'grenad')) return L('mortar', 'idle', 'idle');
      if (has(n, 'sniper', 'marksman') || (def.range ?? 0) > 13) return L('sniper', 'idle', 'idle');
      if (has(n, 'jet', 'fly')) return L('jetpacker', 'idle', 'idle');
      return L('rifleman', 'idle', 'idle');
    }
    case 'swarm':
    case 'canine':
    case 'insect':
    case 'beast':
      if ((def.r ?? 1) > 3) return null;
      return L('beast', 'move', 'idle', def.color ?? null, 0.5, 3);
    case 'worm':
      if ((def.r ?? 1) > 4) return null;
      return L('worm', 'move', 'idle', def.color ?? null, 0.4, 4);
    case 'flyer':
      if (has(n, 'drone')) return L(has(n, 'heavy', 'war') ? 'drone2' : 'drone', 'idle', 'idle', null, 0, 3);
      if (has(n, 'gunship', 'chopper', 'heli', 'copter')) return L(has(n, 'gun') ? 'gunship' : 'chopper', has(n, 'gun') ? 'idle' : 'fly', 'idle', null, 0, 8);
      if (has(n, 'jet', 'plane', 'bomber')) return L(has(n, 'bomb') ? 'bomber' : 'jet', 'idle', 'idle', null, 0, 8);
      return L(has(n, 'crow', 'bat') && (def.r ?? 1) < 0.8 ? 'crow' : 'bigbird', 'idle', 'idle', def.color ?? null, 0.45, 4);
    case 'vehicle':
      if (has(n, 'bike', 'scout', 'motor')) return L('bike', 'idle', 'idle', null, 0, 3);
      if (has(n, 'buggy', 'jeep', 'car')) return L('buggy', 'idle', 'idle', null, 0, 4);
      if (has(n, 'artillery', 'mortar')) return L('artillery', 'idle', 'idle', null, 0, 6);
      if (has(n, 'missile', 'rocket')) return L('missiletank', 'idle', 'idle', null, 0, 6);
      if (has(n, 'truck', 'hauler', 'tanker', 'rig')) return L('tanker', 'idle', 'idle', null, 0, 7);
      if ((def.r ?? 1) > 1.4) return L('dualmerctank', 'idle', 'idle', null, 0, 8);
      return L('merctank', 'idle', 'idle', null, 0, 6);
    case 'bot':
      if (has(n, 'hound', 'dog')) return L('beast', 'move', 'idle', '#607d8b', 0.6, 3);
      if (has(n, 'artillery')) return L('artillery', 'idle', 'idle', null, 0, 6);
      if (has(n, 'drone')) return L('drone', 'idle', 'idle', null, 0, 3);
      if ((def.r ?? 1) > 1.2) return L(def.faction === 'cyborg' ? 'lightningtank' : 'mbt2', 'idle', 'idle', null, 0, 7);
      return L(def.faction === 'cyborg' ? 'shocker' : 'rifleman', 'idle', 'idle', null, 0, 2);
    default:
      return null;
  }
}
