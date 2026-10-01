import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/game/save';
import { beatById, nextLine, skipBeat, storyPauses, updateStory } from '../src/game/story';
import { game } from './helpers';

/** Plays the beat on screen to its end. */
function finish(g: ReturnType<typeof game>): void {
  for (let i = 0; i < 40 && g.story.playing; i++) nextLine(g);
}

describe('the story', () => {
  it('opens with the prologue briefing, which holds the game until the captain reads it', () => {
    const g = game();
    g.time = 2;
    updateStory(g, 0.1);
    expect(g.story.playing).toBe('pro_open');
    expect(storyPauses(g)).toBe(true);
    // The card first, then line by line.
    expect(g.story.cardT).toBeGreaterThan(0);
    nextLine(g);
    expect(g.story.cardT).toBe(0);
    const n = beatById('pro_open')!.lines.length;
    for (let i = 1; i < n; i++) nextLine(g);
    expect(g.story.playing).toBe('pro_open');
    nextLine(g);
    expect(g.story.playing).toBeNull();
    expect(g.story.log.length).toBe(n);
  });

  it('moves through the chapters as the shards come home', () => {
    const g = game();
    g.time = 2;
    updateStory(g, 0.1);
    finish(g);
    // Out past the wall and up the road: the gate call and Chapter 1.
    const h = g.gen.hangar!;
    g.player.x = h.x + 2500;
    g.player.y = h.y + 1000;
    for (let k = 0; k < 4; k++) {
      updateStory(g, 0.1);
      finish(g);
    }
    expect(g.story.seen).toContain('pro_gate');
    expect(g.story.seen).toContain('ch1_open');
    expect(g.story.chapter).toBe(1);
    // The first shard installed: Halvorsen, then Chapter 2 once she's out again.
    g.campaign.installed.push('pass');
    for (let k = 0; k < 4; k++) {
      updateStory(g, 0.1);
      finish(g);
    }
    expect(g.story.seen).toContain('ch1_home');
    expect(g.story.seen).toContain('ch2_open');
    expect(g.story.chapter).toBe(2);
    // Two shards in: the Cantor comes on every radio.
    g.campaign.installed.push('ash');
    updateStory(g, 0.1);
    expect(g.story.playing).toBe('cantor_one');
    skipBeat(g);
    expect(g.story.playing).toBeNull();
  });

  it('runs radio calls by itself while you drive', () => {
    const g = game();
    g.story.seen.push('pro_open');
    const h = g.gen.hangar!;
    g.player.x = h.x + 1000;
    g.player.y = h.y;
    updateStory(g, 0.1);
    expect(g.story.playing).toBe('pro_gate');
    expect(storyPauses(g)).toBe(false);
    for (let t = 0; t < 40 && g.story.playing === 'pro_gate'; t += 0.5) updateStory(g, 0.5);
    expect(g.story.playing).not.toBe('pro_gate');
  });

  it('keeps what you have seen and heard in the save', () => {
    const g = game();
    g.time = 2;
    updateStory(g, 0.1);
    finish(g);
    const back = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(back.story.seen).toContain('pro_open');
    expect(back.story.log.length).toBe(g.story.log.length);
  });
});
