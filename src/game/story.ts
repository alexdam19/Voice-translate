import { PARTS, type Part } from './campaign';
import type { Game } from './game';

/**
 * The story. Forty years ago the Visitor came down and broke into six shards, and everything in the Crater it fell
 * into has been growing bigger and hungrier ever since; the dead don't stay down. The Mega Hangar is the last safe
 * place in the south, and its reactor is dying. Its yard engineer has found what the Hangar was built on top of: the
 * Ark Engine, a pre-impact machine that could throw a shield over the whole Crater, if six hearts of the Visitor were
 * in it. Warlords, beasts and a machine mind hold the shards, each grown monstrous on them, and a cult called the
 * Choir wants them more than anyone. They know what sleeps under the Divot, and what the shards have been keeping
 * asleep.
 *
 * The story plays out in chapters as the campaign moves: briefings with faces (the game pauses for them), radio calls
 * while you drive, chapter title cards, and a journal of everything said (STORY, J).
 */

export type Speaker =
  | 'adeyemi' | 'halvorsen' | 'kovacs' | 'ruiz' | 'voss' | 'kestrel'
  | 'vash' | 'mother' | 'forge' | 'drowned' | 'spire' | 'cantor' | 'guardian';

export interface CastMember {
  name: string;
  title: string;
  color: string;
  /** How the face is painted (see render/px/pixelFace). */
  face: { seed: number; role: string; look?: Record<string, unknown> };
  bio: string;
  foe?: boolean;
}

export const CAST: Record<Speaker, CastMember> = {
  adeyemi: { name: 'Ines Adeyemi', title: 'Chief of Hangar Ops', color: '#40c4ff', face: { seed: 4121, role: 'officer', look: { skin: '#734428', hair: '#1a1412', style: 'bun', jaw: 'narrow', beard: 'none', gear: 'officer', brow: -0.2, scar: false, patch: false, cyber: false, age: 0.75 } }, bio: 'Runs the Mega Hangar and everyone in it. Lost two Titans and their crews to the Divot ten years ago and has not sent one there since. Until you.' },
  halvorsen: { name: 'Sigrun Halvorsen', title: 'Yard Engineer', color: '#ffab40', face: { seed: 5577, role: 'engineer', look: { skin: '#f2c9a4', hair: '#dcb468', style: 'pony', jaw: 'round', beard: 'none', gear: 'goggles', brow: 0.6, freckles: true, scar: false, patch: false, cyber: false } }, bio: 'Built half the Titans in the yard and found the Ark Engine under the Hangar floor. Talks fast, sleeps never, trusts machines more than people.' },
  kovacs: { name: 'Pell Kovacs', title: 'Intel Desk', color: '#ffd740', face: { seed: 7713, role: 'scientist', look: { skin: '#e8b38a', hair: '#33231a', style: 'part', jaw: 'narrow', beard: 'stubble', gear: 'glasses', brow: -0.5, scar: false, patch: false, cyber: false } }, bio: 'Listens to every radio in the Crater and believes about a third of it. Keeps the map of who holds what.' },
  ruiz: { name: 'Sgt. Dario Ruiz', title: 'Gate Control', color: '#76ff03', face: { seed: 2290, role: 'marine', look: { skin: '#b97a4e', hair: '#1a1412', style: 'buzz', jaw: 'square', beard: 'moustache', gear: 'helmet', brow: -0.3, scar: true, patch: false, cyber: false } }, bio: 'Has held the main gate through eleven sieges. Opens it for nobody without clearance, including the Chief.' },
  voss: { name: 'Dusty Voss', title: 'Crater Radio', color: '#ff80ab', face: { seed: 9054, role: 'driver', look: { skin: '#d49a6c', hair: '#8e2c18', style: 'curls', jaw: 'round', beard: 'full', gear: 'headset', brow: 0.8, scar: false, patch: false, cyber: false } }, bio: 'The voice of Crater Radio, broadcasting from a bunker nobody has found. Knows everything, a day late and half wrong.' },
  kestrel: { name: 'Mara "Kestrel" Okafor', title: 'Gunship Leader', color: '#18ffff', face: { seed: 3307, role: 'driver', look: { skin: '#583220', hair: '#1a1412', style: 'crew', jaw: 'narrow', beard: 'none', gear: 'headset', brow: 0.2, scar: false, patch: false, cyber: true } }, bio: 'Flies the lead gunship out of the Hangar pads. Lost an eye to a Spire storm and replaced it with something better.' },
  vash: { name: 'Vash', title: 'Warlord of Dead Man\'s Pass', color: '#ff5252', foe: true, face: { seed: 666, role: 'scavenger', look: { skin: '#b97a4e', hair: '#e02020', style: 'mohawk', jaw: 'square', beard: 'goatee', gear: 'none', paint: '#e8e0d0', cyber: true, scar: true, brow: -1, patch: false } }, bio: 'Drives the Road Hog, a raider war rig built around the first shard. Taxes every caravan on the canyon road in water and blood.' },
  mother: { name: 'Mother Ash', title: 'Chieftain of the Blood Eagles', color: '#ff7043', foe: true, face: { seed: 1212, role: 'scavenger', look: { skin: '#a8a49c', hair: '#e4e0d8', style: 'long', jaw: 'narrow', beard: 'none', gear: 'none', paint: '#c01818', brow: -0.8, age: 0.9, scar: false, patch: false, cyber: false } }, bio: 'Rides the Ash Titan, a beast as big as a town, through the grey dead lands. Her clan paints its walls with the names of those it eats.' },
  forge: { name: 'The Forge', title: 'Machine mind of Rustbolt', color: '#ffb300', foe: true, face: { seed: 4040, role: 'none', look: { kind: 'machine', eye: '#ff3a20' } }, bio: 'A factory that woke up. It builds war rigs day and night around its shard and speaks through every loudspeaker in Rustbolt.' },
  drowned: { name: 'The Drowned', title: 'What lives in the Black Lake', color: '#1de9b6', foe: true, face: { seed: 8181, role: 'none', look: { kind: 'ghoul', hair: '#2a3a2a', style: 'long', eye: '#1de9b6', beard: 'none', gear: 'none', brow: 0, scar: false, patch: false, cyber: false } }, bio: 'The crew of a sunken refinery barge, or what the lake made of them. Their voices still come over the old marine band.' },
  spire: { name: 'The Spire', title: 'Anomaly of the Broken Spires', color: '#e040fb', foe: true, face: { seed: 2718, role: 'none', look: { kind: 'hooded', eye: '#e040fb' } }, bio: 'Something that lives in the shard at the top of the tallest spire. It talks in other people\'s voices.' },
  cantor: { name: 'The Cantor', title: 'Prophet of the Choir', color: '#ea80fc', foe: true, face: { seed: 1313, role: 'none', look: { kind: 'hooded', eye: '#ffd760' } }, bio: 'Leads the Choir of the Hollow, who sing to whatever sleeps under the Divot. Wants the six shards more than anyone, and wants you to bring them.' },
  guardian: { name: 'The Crater Guardian', title: 'At the bottom of the Divot', color: '#ffd740', foe: true, face: { seed: 9999, role: 'none', look: { kind: 'machine', eye: '#ffd740' } }, bio: 'Old, enormous, wrapped round the sixth shard. It has never let anything leave the Divot alive.' },
};

export const CHAPTERS: { title: string; sub: string; summary: string }[] = [
  { title: 'PROLOGUE', sub: 'Iron Dawn', summary: 'The Hangar\'s reactor is dying. Halvorsen has found the Ark Engine under the yard: light it with six shards of the Visitor and it throws a shield over the Crater. Chief Adeyemi sends Titan 07 out of the gate.' },
  { title: 'CHAPTER 1', sub: 'Dead Man\'s Pass', summary: 'The warlord Vash holds the canyon road east of the Hangar, and the first shard is the reactor in his war rig, the Road Hog.' },
  { title: 'CHAPTER 2', sub: 'The Four Shards', summary: 'Mother Ash in the Ash Fields, the Forge in Rustbolt, the Drowned in the Black Lake and the Spire in the Broken Spires each hold a shard. The Choir is buying them. You are taking them.' },
  { title: 'CHAPTER 3', sub: 'The Divot', summary: 'The last shard lies at the bottom of the impact, wrapped in the Crater Guardian. Nothing has come back out of the Divot in ten years.' },
  { title: 'CHAPTER 4', sub: 'The Last Stand', summary: 'All six shards are in the Ark Engine. It needs six minutes to come up to power, and everything in the Crater heard it wake, including the World Eater.' },
  { title: 'EPILOGUE', sub: 'Clear Skies', summary: 'The shield holds. For the first time in forty years there is a sky over the Crater.' },
];

export interface Line {
  who: Speaker;
  text: string;
  mood?: 'grin' | 'hurt' | 'talk';
}

export interface Beat {
  id: string;
  chapter: number;
  /** A chapter card first. */
  card?: boolean;
  /** Pauses the game and fills the screen; otherwise it comes over the radio while you drive. */
  cinematic: boolean;
  when: (g: Game) => boolean;
  lines: Line[];
}

const region = (g: Game, key: string): { x: number; y: number; r: number; id: number } | undefined => g.gen.regions.find((r) => r.key === key);
const near = (g: Game, key: string, pad: number): boolean => {
  const r = region(g, key);
  return !!r && Math.hypot(r.x - g.player.x, r.y - g.player.y) < r.r + pad;
};
const down = (g: Game, part: Part): boolean => {
  const loc = PARTS.find((k) => k.key === part)!.loc;
  const r = region(g, loc);
  return !!r && g.campaign.bossesDown.includes(r.id);
};
const inst = (g: Game, part: Part): boolean => g.campaign.installed.includes(part);
const fromHome = (g: Game): number => {
  const h = g.gen.hangar;
  return h ? Math.hypot(h.x - g.player.x, h.y - g.player.y) : 0;
};
const shards = (g: Game): number => g.campaign.installed.length;

/** Every beat, in story order (the first unseen one whose moment has come plays next). */
export const BEATS: Beat[] = [
  /* ---- Prologue ---- */
  { id: 'pro_open', chapter: 0, card: true, cinematic: true, when: (g) => g.time > 1.5, lines: [
    { who: 'adeyemi', text: 'Captain. Titan 07 is fuelled, crewed and pointed at the door. Before it opens, you should know why I\'m sending you out.' },
    { who: 'adeyemi', text: 'The reactor under this Hangar is dying. Two years, Halvorsen says. Maybe less. When it goes, the walls go dark, and forty thousand people find out what the Crater does at night.' },
    { who: 'halvorsen', text: 'But! The Hangar was built on top of something. I dug it out last winter. Pre-impact. A machine the size of the yard: the Ark Engine.', mood: 'grin' },
    { who: 'halvorsen', text: 'Light it and it throws a shield over the whole Crater. Nothing big gets in, nothing big grows. It just needs six hearts. Six shards of the Visitor.' },
    { who: 'kovacs', text: 'Which is the problem. Every shard has something sitting on it, and everything that sits on a shard for forty years grows. Warlords. Beasts. One factory that started talking.' },
    { who: 'adeyemi', text: 'You go out, you take the shards, you bring them home. Gate Control will clear you through. Don\'t make me send the tow crews.' },
  ] },
  { id: 'pro_gate', chapter: 0, cinematic: false, when: (g) => fromHome(g) > 900, lines: [
    { who: 'ruiz', text: 'Gate Control to 07: you\'re clear of the wall. The front line has your back until the road. After that it\'s you and your guns.' },
    { who: 'kestrel', text: 'Kestrel here. My gunships fly cover off the pads when you ask for clearance. Bring me something worth shooting.', mood: 'grin' },
  ] },
  /* ---- Chapter 1: Dead Man's Pass ---- */
  { id: 'ch1_open', chapter: 1, card: true, cinematic: true, when: (g) => fromHome(g) > 2200, lines: [
    { who: 'kovacs', text: 'First shard\'s close. East along the canyon road, Dead Man\'s Pass. A warlord called Vash holds it. He\'s built a war rig around the shard and calls it the Road Hog.' },
    { who: 'kovacs', text: 'He taxes the caravans in water. When they can\'t pay, he takes drivers instead. Nobody knows what for.' },
    { who: 'vash', text: 'I can hear you, Hangar. Your big tin box is the loudest thing on my road. Come on up the pass. I\'ve been saving a parking space.', mood: 'grin' },
  ] },
  { id: 'ch1_near', chapter: 1, cinematic: true, when: (g) => near(g, 'dead_mans_camp', 700) && !down(g, 'pass'), lines: [
    { who: 'vash', text: 'That\'s far enough. You know what\'s in my engine? A piece of the sky. It talks to me at night. It says you\'re small.' },
    { who: 'adeyemi', text: 'He\'s stalling while his crews flank you. Break the camp, put the Road Hog in the dirt, and pull the shard out of its reactor.' },
  ] },
  { id: 'ch1_down', chapter: 1, cinematic: true, when: (g) => down(g, 'pass'), lines: [
    { who: 'vash', text: 'Heh. You think you\'re the only ones buying? The Choir paid me in clean water for every driver I sent them. They\'ll pay more for you.', mood: 'hurt' },
    { who: 'kovacs', text: 'The Choir. I\'ve heard that name on the dead channels for a year. Singing, mostly. I thought it was a joke.' },
    { who: 'adeyemi', text: 'Get the shard aboard and come home, Captain. Halvorsen\'s been pacing the yard since you left.' },
  ] },
  { id: 'ch1_home', chapter: 1, cinematic: true, when: (g) => inst(g, 'pass'), lines: [
    { who: 'halvorsen', text: 'Oh, look at it. Look at it! The shipyard\'s lit up like midsummer. I can refit 07 now: bigger decks, heavier guns, the works.', mood: 'grin' },
    { who: 'halvorsen', text: 'And the Ark took it. One heart beating. Five to go.' },
    { who: 'adeyemi', text: 'Kovacs, show the Captain the board.' },
  ] },
  /* ---- Chapter 2: The Four Shards ---- */
  { id: 'ch2_open', chapter: 2, card: true, cinematic: true, when: (g) => inst(g, 'pass') && fromHome(g) > 1500, lines: [
    { who: 'kovacs', text: 'Four shards left above ground. North, the Ash Fields: the Blood Eagles and their Mother, riding a beast called the Ash Titan.' },
    { who: 'kovacs', text: 'East rim, Rustbolt: the Forge. A factory that woke up. North-east, the Black Lake, and whatever sank there. South-east, the Broken Spires. Compasses spin out there.' },
    { who: 'kovacs', text: 'Order\'s your call. The BOUNTY board has who, where and how hard. Captain: the Choir is buying shards too. Don\'t let them get there first.' },
  ] },
  { id: 'ash_near', chapter: 2, cinematic: true, when: (g) => near(g, 'blood_eagle', 700) && !down(g, 'ash'), lines: [
    { who: 'mother', text: 'The Hangar sends us a gift. So much iron. So much meat inside it. My Titan has not eaten a Titan before.' },
    { who: 'kovacs', text: 'The Ash Titan is the shard\'s keeper. It\'s the size of a town and it bites like one. Keep moving and keep firing.' },
  ] },
  { id: 'ash_down', chapter: 2, cinematic: false, when: (g) => down(g, 'ash'), lines: [
    { who: 'mother', text: 'The Choir promised it would make us gods. It only made us big.', mood: 'hurt' },
    { who: 'voss', text: 'Crater Radio here with breaking news: the Blood Eagles are having a very bad day. Somebody tell their Mother. Oh. Too late.', mood: 'grin' },
  ] },
  { id: 'rust_near', chapter: 2, cinematic: true, when: (g) => near(g, 'rustbolt_camp', 700) && !down(g, 'rust'), lines: [
    { who: 'forge', text: 'TITAN-CLASS HULL DETECTED. ESTIMATED SCRAP VALUE: EXCELLENT. PRODUCTION SCHEDULE AMENDED. WELCOME TO RUSTBOLT.' },
    { who: 'halvorsen', text: 'It\'s running war rigs off its own line. Every minute you leave it alone, it builds another. Hit the factory, not just the trucks.' },
  ] },
  { id: 'rust_down', chapter: 2, cinematic: false, when: (g) => down(g, 'rust'), lines: [
    { who: 'forge', text: 'PRODUCTION HALTED. ORDER FOR THE CHOIR UNFILLED. THE SINGING WILL BE... DISAPPOINTED.', mood: 'hurt' },
    { who: 'halvorsen', text: 'Pull its shard and bring me its logs. A factory doesn\'t make deals unless somebody\'s buying.' },
  ] },
  { id: 'lake_near', chapter: 2, cinematic: true, when: (g) => near(g, 'black_lake_poi', 700) && !down(g, 'lake'), lines: [
    { who: 'drowned', text: 'Mayday, mayday... this is the barge Calloway... we are taking on... we are... come down. Come down. The water is warm.' },
    { who: 'kovacs', text: 'That barge sank thirty years ago. Whatever\'s on that channel isn\'t its crew any more. Seal the lower decks before you go near the water.' },
  ] },
  { id: 'lake_down', chapter: 2, cinematic: false, when: (g) => down(g, 'lake'), lines: [
    { who: 'drowned', text: '...the singers rowed out every night... they sang to the bottom... something down there sang back...', mood: 'hurt' },
    { who: 'kovacs', text: 'Something under the Divot, then, not the lake. Every trail ends at the Divot.' },
  ] },
  { id: 'spire_near', chapter: 2, cinematic: true, when: (g) => near(g, 'broken_spires_poi', 700) && !down(g, 'spires'), lines: [
    { who: 'spire', text: 'Captain. It\'s me, Adeyemi. Turn around. Come home. Leave the shard where it is.' },
    { who: 'adeyemi', text: 'That is not me, Captain. I\'m on the open channel, not the spire band. It\'s wearing my voice. Kill it.' },
  ] },
  { id: 'spire_down', chapter: 2, cinematic: false, when: (g) => down(g, 'spires'), lines: [
    { who: 'spire', text: 'You\'re carrying them all home for it. Every one. Thank you.', mood: 'hurt' },
    { who: 'kestrel', text: 'Spire\'s down. The compasses are pointing north again. Never thought I\'d be happy to see a compass.' },
  ] },
  { id: 'cantor_one', chapter: 2, cinematic: true, when: (g) => shards(g) >= 2, lines: [
    { who: 'cantor', text: 'Little Titan. We hear you every time you open the Ark. Every heart you put in it makes the song louder.' },
    { who: 'cantor', text: 'Under the Divot, something has slept for forty years with six hearts in its chest. You are giving them back. We only wanted to watch.' },
    { who: 'adeyemi', text: 'Kovacs, trace that.' },
    { who: 'kovacs', text: 'I can\'t. It\'s coming from everywhere. Every dead radio in the Crater at once.' },
  ] },
  /* ---- Chapter 3: The Divot ---- */
  { id: 'ch3_open', chapter: 3, card: true, cinematic: true, when: (g) => PARTS.slice(0, 5).every((k) => inst(g, k.key)), lines: [
    { who: 'adeyemi', text: 'Five hearts in the Ark. The sixth is at the bottom of the Divot, and I lost two Titans down there ten years ago. I don\'t intend to lose a third.' },
    { who: 'kovacs', text: 'The Crater Guardian is wrapped round the last shard. The seismographs say it\'s moving more since we started. Something under it is too.' },
    { who: 'halvorsen', text: 'The Choir thinks the shards are keeping something asleep. I think the Choir sings to rocks. Bring me the heart and we light the shield before anything wakes up.' },
  ] },
  { id: 'divot_near', chapter: 3, cinematic: true, when: (g) => near(g, 'the_divot', 900) && !down(g, 'divot'), lines: [
    { who: 'guardian', text: '...' },
    { who: 'kestrel', text: 'Captain, the ground is moving. Not under you. Under everything. My gunships can\'t get lower than the rim. You\'re on your own down there.' },
  ] },
  { id: 'divot_down', chapter: 3, cinematic: true, when: (g) => down(g, 'divot'), lines: [
    { who: 'kovacs', text: 'The Guardian\'s down. And the seismographs just went off the chart. Captain, whatever it was sleeping on top of is awake.' },
    { who: 'cantor', text: 'Thank you, little Titan. Now carry the last heart home, and light your Ark, and let the whole Crater hear it. It is coming to listen.' },
    { who: 'adeyemi', text: 'Get home, Captain. Fast.' },
  ] },
  { id: 'ch3_home', chapter: 3, cinematic: true, when: (g) => inst(g, 'divot'), lines: [
    { who: 'halvorsen', text: 'All six. All six! The Ark is ready. Six minutes from IGNITE to full power. Press it in the SHIPYARD when you\'re ready.' },
    { who: 'adeyemi', text: 'When we light it, everything in the Crater will hear it. Ruiz, put every gun on the wall. Kestrel, every gunship in the air.' },
    { who: 'ruiz', text: 'Wall\'s manned, Chief. Front line\'s loaded. Let them come.' },
  ] },
  /* ---- Chapter 4: The Last Stand ---- */
  { id: 'ch4_open', chapter: 4, card: true, cinematic: true, when: (g) => g.campaign.finale === 'active', lines: [
    { who: 'halvorsen', text: 'Ignition! The Ark is drawing. Six minutes. Hold everything off the Hangar for six minutes.' },
    { who: 'kovacs', text: 'Contacts on every bearing. Every horde in the Crater just turned towards us.' },
    { who: 'cantor', text: 'Sing with us, little Titan. The World Eater is awake, and it is hungry.' },
  ] },
  { id: 'ch4_eater', chapter: 4, cinematic: false, when: (g) => g.campaign.finale === 'active' && g.campaign.devourer, lines: [
    { who: 'kestrel', text: 'Eyes on the World Eater. It\'s... I can\'t see the end of it. All gunships, on me!' },
    { who: 'adeyemi', text: 'Captain, it\'s yours. Put it down before it reaches the wall.' },
  ] },
  /* ---- Epilogue ---- */
  { id: 'epilogue', chapter: 5, card: true, cinematic: true, when: (g) => g.campaign.finale === 'won', lines: [
    { who: 'halvorsen', text: 'Full power. The shield\'s up. It\'s up! Look at the sky. Look at it!', mood: 'grin' },
    { who: 'adeyemi', text: 'Forty years, and there\'s blue over the Crater. Captain. Titan 07. Thank you.' },
    { who: 'voss', text: 'Crater Radio here. For once I have nothing funny to say. Go outside, everybody. Look up.' },
    { who: 'kovacs', text: 'The hordes are still out there, and the things that grew won\'t shrink. But nothing new is growing. We have time now.' },
    { who: 'adeyemi', text: 'Take her out whenever you like, Captain. The Crater is still yours to roam.' },
  ] },
  /* ---- Moments ---- */
  { id: 'first_dead_wave', chapter: -1, cinematic: false, when: (g) => g.wave.dead && (g.wave.phase === 'warning' || g.wave.phase === 'surge'), lines: [
    { who: 'kovacs', text: 'That isn\'t a horde, Captain. That\'s a tide. A kilometre wide. Don\'t fight it. Run, and follow the navigator.' },
  ] },
  { id: 'first_down', chapter: -1, cinematic: false, when: (g) => g.player.dead, lines: [
    { who: 'adeyemi', text: '07 is down. Tow crews are rolling. Captain, we\'ll have you patched and back out of the gate. Learn something from it.' },
  ] },
];

export interface StoryState {
  /** Beats played. */
  seen: string[];
  /** Everything said, for the journal (newest last). */
  log: { who: Speaker; text: string; beat: string }[];
  /** The beat on screen now, and the one line of it showing. */
  playing: string | null;
  line: number;
  /** Seconds on the current radio line. */
  lineT: number;
  /** The furthest chapter reached. */
  chapter: number;
  /** A chapter card on screen (seconds left). */
  cardT: number;
}

export const newStory = (): StoryState => ({ seen: [], log: [], playing: null, line: 0, lineT: 0, chapter: 0, cardT: 0 });

export const beatById = (id: string | null): Beat | undefined => (id ? BEATS.find((b) => b.id === id) : undefined);

/** How long a radio line stays up. */
export const radioTime = (l: Line): number => Math.max(4.5, Math.min(11, l.text.length / 13));

/** Checks for the next beat (once a second is plenty) and runs the radio ones. */
export function updateStory(g: Game, dt: number): void {
  const s = g.story;
  if (g.mode !== 'world') return;
  const b = beatById(s.playing);
  if (b) {
    // Radio lines move on by themselves; a briefing waits for the captain.
    if (!b.cinematic && s.cardT <= 0) {
      s.lineT += dt;
      if (s.lineT >= radioTime(b.lines[s.line])) nextLine(g);
    }
    return;
  }
  for (const beat of BEATS) {
    if (s.seen.includes(beat.id)) continue;
    // Chapter beats wait their turn: nothing from a later chapter plays before an earlier one has.
    if (beat.chapter >= 0 && BEATS.some((o) => o.chapter >= 0 && o.chapter < beat.chapter && o.card && !s.seen.includes(o.id))) continue;
    if (!beat.when(g)) continue;
    start(g, beat);
    return;
  }
}

function start(g: Game, beat: Beat): void {
  const s = g.story;
  s.seen.push(beat.id);
  s.playing = beat.id;
  s.line = 0;
  s.lineT = 0;
  if (beat.chapter > s.chapter) s.chapter = beat.chapter;
  s.cardT = beat.card ? 3.2 : 0;
  logLine(g, beat, 0);
  g.hooks.sound(beat.cinematic ? 'levelup' : 'ui');
}

function logLine(g: Game, beat: Beat, i: number): void {
  const l = beat.lines[i];
  if (!l) return;
  g.story.log.push({ who: l.who, text: l.text, beat: beat.id });
  if (g.story.log.length > 200) g.story.log.shift();
}

/** On to the next line (the captain clicked, or a radio line ran its time); the beat ends after its last. */
export function nextLine(g: Game): void {
  const s = g.story;
  const b = beatById(s.playing);
  if (!b) return;
  if (s.cardT > 0) {
    s.cardT = 0;
    return;
  }
  s.line++;
  s.lineT = 0;
  if (s.line >= b.lines.length) {
    s.playing = null;
    s.line = 0;
    return;
  }
  logLine(g, b, s.line);
}

/** Skips the rest of the beat on screen (it's all in the journal). */
export function skipBeat(g: Game): void {
  const s = g.story;
  const b = beatById(s.playing);
  if (!b) return;
  for (let i = s.line + 1; i < b.lines.length; i++) logLine(g, b, i);
  s.playing = null;
  s.line = 0;
  s.cardT = 0;
}

/** Real time on the screen (runs while the game waits on a briefing): the chapter card counts down. */
export function tickStory(g: Game, dt: number): void {
  const s = g.story;
  if (s.cardT > 0) s.cardT = Math.max(0, s.cardT - dt);
}

/** Whether a briefing has the screen (the game waits for it). */
export function storyPauses(g: Game): boolean {
  const b = beatById(g.story.playing);
  return !!b && b.cinematic;
}
