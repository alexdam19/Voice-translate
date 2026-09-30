import { AGENTS, type Agent } from '../game/systems/comms';
import { portraitHD } from '../render/px/portraits';

/** The Mega Hangar intercom's people: their painted faces (as an image URL, and as a loaded image for canvases). */

export const agentFace = (a: Agent): string => portraitHD({ seed: AGENTS[a].seed, role: 'driver', roleColor: AGENTS[a].color, rarityColor: '#ffd740' });

const imgs = new Map<Agent, HTMLImageElement>();

export function agentImage(a: Agent): HTMLImageElement {
  let im = imgs.get(a);
  if (!im) {
    im = new Image();
    im.src = agentFace(a);
    imgs.set(a, im);
  }
  return im;
}
