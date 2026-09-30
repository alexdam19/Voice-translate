import type { Game } from '../game/game';
import { DRIVE_MODES, driveSpec, odStage } from '../game/systems/engine';
import { CRUDE_MAX, drillRate, fuelDrill, fuelRefinery, oilHere, refineRate } from '../game/systems/fuel';
import { HALON_CD, HALON_WATER, HORN_CD, HORN_RANGE, SAND_CD, SAND_T, SMOKE_CD, SMOKE_T } from '../game/systems/helm';
import { TOROIDS } from '../game/systems/titan';
import { oilWord } from '../shared/oil';
import { CAMS } from './cabinCams';

/**
 * What every control in the cab does, exactly, and what it's doing right now: shown on a plate at the top of the
 * glass while you hover it (or, with the INFO switch on, when you tap it, instead of working it).
 */

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const on = (b: boolean): string => (b ? 'ON' : 'OFF');

export function tipFor(id: string, g: Game): { title: string; body: string } | null {
  const hm = g.helm;
  const p = g.player;
  const ds = driveSpec(g, p);
  if (id.startsWith('mode_')) {
    const m = DRIVE_MODES.find((k) => `mode_${k.key}` === id);
    if (!m) return null;
    return { title: `DRIVE MODE: ${m.name}${hm.mode === m.key ? ' (SELECTED)' : ''}`, body: m.what };
  }
  if (id.startsWith('od')) {
    const n = Number(id.slice(2));
    const spec = odStage(ds, n);
    const avail = n <= ds.odStages;
    return {
      title: `OVERDRIVE ${['I', 'II', 'III'][n - 1]}${hm.overdrive && hm.odStage === n ? ' (LIT)' : ''}`,
      body: avail
        ? `+${Math.round((spec.speed - 1) * 100)}% speed and a harder kick, ${spec.fuel.toFixed(1)}x fuel burn, heats the engine ${spec.heat}x as fast as stage I (about ${Math.round((1 - hm.heat) / (ds.heat * spec.heat))} s from now before it trips).${n >= 2 ? ' Needs the engine charged to 80%.' : ''}${n === 3 ? ' Run hot, stage III wears the drive.' : ''} Press the lit one to shut it off.`
        : `Not available: ${ds.odStages <= 0 ? `no overdrive in ${hm.mode.toUpperCase()} mode.` : `the ${ds.def.name} runs ${ds.odStages} stage${ds.odStages > 1 ? 's' : ''}. Nitro Injectors Mk 4 or a bigger engine open more.`}`,
    };
  }
  if (id.startsWith('tor')) {
    const i = Number(id.slice(3));
    return { title: `${TOROIDS[i].name.toUpperCase()}: ${hm.toroids[i] ? 'LIT' : 'SHUT DOWN'}`, body: `One of four ring thrusters: together they add a third of her speed and half her steering. Shut one down to save its slice of the fuel; a lopsided set pulls the hull round. Health ${pct(g.titan.toroids[i])}.` };
  }
  if (/^cam\d+$/.test(id)) {
    const c = CAMS[Number(id.slice(3))];
    return c ? { title: `CAMERA ${c.id}: ${c.name}`, body: c.kind === 'engine' ? 'The engine room: the machine working, the firebox, the crew on the catwalks.' : 'Switch the monitor to this camera. Drag the picture to pan it on its mount. Anything moving is boxed (red: it is on the hull).' } : null;
  }
  if (id.startsWith('scr')) return { title: 'ANALYTICS SCREEN', body: 'Click to turn it to the next page: ship status, trends, systems, tactical, navigation, crew, engine room and the fuel plant.' };
  switch (id) {
    case 'glass':
      return null;
    case 'throttle':
      return { title: `THROTTLE LEVER: ${Math.round(hm.lever * 100)}%`, body: 'Drag up for ahead, down past STOP for astern. It stays where you leave it (cruise). The engine has to charge up before she really pulls, then she pulls harder the faster she goes. W/S work it too.' };
    case 'steer':
      return { title: 'STEERING LEVER', body: 'Drag left or right to turn (it springs back to centre). A/D work it too. The faster she goes, the wider she turns.' };
    case 'brake':
      return { title: `BRAKE HANDLE: ${pct(hm.brake)}`, body: 'Drag right to work the brakes. Even full on, 30,000 tonnes take a long time to stop. Braking cuts the throttle.' };
    case 'stop':
      return { title: 'ALL STOP', body: 'Throttle to zero and the brakes full on (Space).' };
    case 'exit':
      return { title: 'LEAVE THE CAB', body: 'Back to the tactical view (F).' };
    case 'vitals':
      return { title: 'SHIP VITALS', body: 'Every armour zone, crawler, subsystem, fire and flood, and the repair teams (Y).' };
    case 'lookL':
    case 'lookR':
    case 'lookF':
      return { title: 'LOOK ROUND', body: 'Turn your head a quarter at a time, or drag the glass. FWD looks ahead again.' };
    case 'radar':
      return { title: 'RADAR', body: 'Heading up. Green: creatures, amber: titans, red: bosses and hulls, blue: the Mega Hangar. A flashing red arc on the rim: a horde coming from that way. Click to change the range (600 m, 1.2 km, 2.4 km).' };
    case 'lights':
      return { title: `FLOODLIGHTS: ${on(hm.lights)}`, body: '+12% sight range and the ground lit ahead of you, for a trickle of fuel (0.02 a second).' };
    case 'pumps':
      return { title: `BILGE PUMP BOOST: ${on(hm.pumps)}`, body: 'Triple pumping in every flooded compartment, for 0.12 fuel a second.' };
    case 'arm':
      return { title: `MASTER ARM: ${hm.safe ? 'SAFE' : 'ARMED'}`, body: 'SAFE holds every gun on the ship (to slip past something you don\'t want to wake). ARMED lets them pick their own targets.' };
    case 'divert':
      return { title: `SHIELD POWER TO DRIVE: ${on(hm.divert)}`, body: 'Takes the shield generator\'s power for the drive: +8% speed, but the shield drains away instead of recharging.' };
    case 'horn':
      return { title: 'AIR HORN', body: `Everything small within ${HORN_RANGE} m of the hull flinches: stunned for a moment and thrown back. Elites shrug most of it off; titans ignore it. Recharges in ${HORN_CD} s.${hm.hornCd > 0 ? ` (${Math.ceil(hm.hornCd)} s left)` : ''}` };
    case 'halon':
      return { title: 'HALON DUMP', body: `Floods every burning compartment with suppressant: knocks every fire far back. Costs ${HALON_WATER} water and some of the air aboard. Refills in ${HALON_CD} s.${hm.halonCd > 0 ? ` (${Math.ceil(hm.halonCd)} s left)` : ''}` };
    case 'camp':
      return { title: g.deploy.state === 'mobile' ? 'DEPLOY CAMP' : 'PACK UP CAMP', body: 'Anchor here and set up camp: faster repairs and a well for water, but she can\'t move until it\'s packed up.' };
    case 'warp':
      return { title: `CRUISE WARP x${g.warp}`, body: 'Time runs 4x or 8x faster while nothing hostile is near. Drops out the moment something turns up.' };
    case 'preheat':
      return { title: `ENGINE PREHEATER: ${on(hm.preheat)}`, body: 'Keeps the engine block warm while she idles: it never drops below 35% charge, so she moves off far sooner. Burns 0.06 fuel a second while the lever is on STOP.' };
    case 'sand':
      return { title: `SANDERS${hm.sandT > 0 ? ` (${Math.ceil(hm.sandT)} s left)` : ''}`, body: `Blows sand under all eight crawler banks, like a locomotive on a wet rail: +25% grip on bad ground for ${SAND_T} s. The hoppers refill in ${SAND_CD} s.${hm.sandCd > 0 && hm.sandT <= 0 ? ` (${Math.ceil(hm.sandCd)} s)` : ''}` };
    case 'diff':
      return { title: `DIFF LOCK: ${on(hm.diffLock)}`, body: 'Locks the differentials between the crawler banks: +15% grip on bad ground, but she turns 40% wider.' };
    case 'plow':
      return { title: `DOZER PLOUGH: ${hm.plow ? 'DOWN' : 'UP'}`, body: 'Lowers the bow plough: +60% force against everything she hits (fewer creatures get a grip to climb aboard), for 10% top speed.' };
    case 'smoke':
      return { title: `SMOKE DISCHARGERS${hm.smokeT > 0 ? ` (${Math.ceil(hm.smokeT)} s)` : ''}`, body: `A cloud round the hull for ${SMOKE_T} s: hits land a third softer inside it, and anything not already on the hull or part of a horde loses track of her. Reload ${SMOKE_CD} s.${hm.smokeCd > 0 && hm.smokeT <= 0 ? ` (${Math.ceil(hm.smokeCd)} s)` : ''}` };
    case 'cams':
      return { title: 'SECURITY CAMERAS', body: 'Flips the monitor up over the glass: ten cameras round the ship (bow, stern, both flanks, the deck both ways, the mast, two crawlers and the engine room) and a map of the hull to click between them. Anything near shows on the map as a red blip, anything on the hull blinks. Blinks red here when something has climbed aboard.' };
    case 'commX':
      return { title: 'CLOSE THE INTERCOM', body: 'Done reading: the next message (if any) comes on.' };
    case 'camsClose':
      return { title: 'CLOSE THE MONITOR', body: 'Back to the windscreen.' };
    case 'sw_wipe':
      return { title: 'WIPERS', body: 'Sweep the rain off the middle pane. They run on their own while the washers spray.' };
    case 'sw_wash':
      return { title: 'WASHERS', body: 'A spray of fluid and a few sweeps of the wipers: takes the dust and grime off the glass (it builds up with the miles, fastest in sand and ash).' };
    case 'sw_defr':
      return { title: 'DEFROSTER', body: 'Hot air on the glass: clears the mist and frost that creep over it in the cold and the wet.' };
    case 'sw_shut':
      return { title: `ARMOUR SHUTTERS: ${hm.shutters ? 'DOWN' : 'UP'}`, body: 'Steel slats down over the windscreen, a vision slot left open. Hits on the bow reach the bridge\'s sensors half as hard. Drive on the slot and the cameras.' };
    case 'sw_srch':
      return { title: `SEARCHLIGHT: ${on(hm.search)}`, body: 'The big lamp on the bridge roof. It points wherever you look (drag the glass), a long way out.' };
    case 'sw_deck':
      return { title: `DECK FLOODS: ${on(hm.deckLights)}`, body: 'Lights the roof: the lamp posts along the rail and the floods over the deck.' };
    case 'sw_bcn':
      return { title: `BEACONS: ${on(hm.beacons)}`, body: 'Amber beacons turning on the bridge roof and the stern rail: everyone round the base sees her coming and clears the road sooner.' };
    case 'sw_cab':
      return { title: 'CAB LIGHTS', body: 'Warm lamps in the cab. Cosier, but the glass catches their reflection.' };
    case 'info':
      return { title: 'INFO SWITCH', body: 'ON: tapping any control explains it instead of working it (handy on a touch screen). Hovering explains them either way.' };
    case 'aim':
      return { title: `GUNSIGHT: ${on(!!p.aimPoint)}`, body: 'Arms the gunsight on the glass. Click the ground (or anything on it) to mark it: every gun in reach turns on whatever is nearest the mark, heavy and lobbed guns shell the spot itself, and the main batteries fire at once if loaded. Drag still looks round. The mark lasts 12 s.' };
    case 'cam':
      return { title: 'DRONE CAMERA', body: 'Swaps the glass for the live feed from the spotter drone above the Titan: everything round you from overhead. Scroll (or the +/- buttons) to zoom it.' };
    case 'camin':
    case 'camout':
      return { title: 'DRONE ALTITUDE', body: 'Take the spotter drone lower (+) or higher (-).' };
    case 'clear':
      return { title: 'CLEAR MARK', body: 'Drops the gunsight mark: the guns pick their own targets again.' };
    case 'drill': {
      const m = fuelDrill(g);
      if (!m) return { title: 'FUEL DRILL', body: 'No Fuel Drill aboard. Build one (BASE > Shop > Resources) to pump crude out of the ground.' };
      const rate = drillRate(g);
      return { title: `FUEL DRILL: ${g.titan.drillWant ? (g.titan.drill >= 1 ? 'PUMPING' : 'LOWERING') : g.titan.drill > 0 ? 'RAISING' : 'UP'}`, body: `Stop the Titan and pull the lever down to bore to the seam (8 s), then it pumps crude into the tank: ${(3 * (1 + 0.4 * (m.lvl - 1))).toFixed(1)} a second on good ground at level ${m.lvl}, times the ground here (${oilWord(oilHere(g))}, ${pct(oilHere(g))}). She can't move while it's down: opening the throttle raises it first. The pumps' noise draws creatures in.${rate > 0 ? ` Pumping ${rate.toFixed(1)}/s.` : ''}` };
    }
    case 'refine': {
      const m = fuelRefinery(g);
      if (!m) return { title: 'AUTOMATIC REFINERY', body: 'No Automatic Refinery aboard. Build one (BASE > Shop > Resources) to turn crude into fuel.' };
      return { title: `REFINERY AUTO: ${on(hm.refine)}`, body: `Cracks crude from the tank into fuel on its own: ${refineRate(g) > 0 ? refineRate(g).toFixed(1) : (2.4 * (1 + 0.4 * (m.lvl - 1))).toFixed(1)} crude a second at 85% yield while there's room in the fuel tank. Draws 2 reactor power. Crude ${Math.round(g.titan.crude)}/${CRUDE_MAX}.` };
    }
  }
  return null;
}
