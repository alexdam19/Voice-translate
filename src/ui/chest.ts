import type { App } from '../app';
import { getItem } from '../shared/items';
import { RARITIES, type Rarity } from '../shared/rarity';
import { AFFIXES, WEAPONS, weaponStats } from '../shared/weapons';
import { abilityOf, championDef, displayTitle, exclusiveDef, ROLES } from '../game/crew';
import { CHEST_INFO, grantReward } from '../game/chests';
import type { ChestKind, Reward } from '../game/entities';
import { itemIcon, portrait, weaponIcon } from '../render/icons';
import { button, esc, h } from './dom';

function rewardRarity(r: Reward): Rarity {
  if (r.type === 'weapon') return r.item.rarity;
  if (r.type === 'crew') return r.crew.rarity;
  if (r.type === 'tech') return 2;
  return 0;
}

export function rewardCard(r: Reward): HTMLDivElement {
  const rar = rewardRarity(r);
  const col = RARITIES[rar].color;
  const card = h('div', `reward-card r${rar}`);
  card.style.setProperty('--rc', col);
  if (r.type === 'weapon') {
    const d = WEAPONS[r.item.key];
    const s = weaponStats(r.item);
    card.innerHTML = `<div class="rk">${d.exclusive ? 'EXCLUSIVE WEAPON' : `${d.size.toUpperCase()} WEAPON`}</div><img class="big" src="${weaponIcon(r.item.key, r.item.rarity)}">
      <div class="rn" style="color:${col}">${RARITIES[rar].name}<br>${esc(d.name)}</div>
      <div class="rs">${Math.round(s.dmg)} dmg${s.pellets > 1 ? ` ×${s.pellets}` : ''} · ${s.rate.toFixed(2)}/s · range ${Math.round(s.range)}</div>
      <div class="rs">${r.item.affixes.map((a) => `<b>${AFFIXES[a].name}</b>: ${AFFIXES[a].desc}`).join('<br>') || '&nbsp;'}</div><div class="rd">${esc(d.desc)}</div>`;
  } else if (r.type === 'crew') {
    const c = r.crew;
    const ch = championDef(c);
    const ex = exclusiveDef(c);
    const ab = abilityOf(c);
    card.innerHTML = `<div class="rk">${ch ? 'CHAMPION' : ex ? 'EXCLUSIVE CHARACTER' : 'NEW CREW'}</div><img class="big portrait" src="${portrait(c)}">
      <div class="rn" style="color:${col}">${esc(c.name)}</div><div class="rs">${esc(displayTitle(c))} · Level ${c.level}</div>
      <div class="rs">Ability: <b style="color:${ab.color}">${esc(ab.name)}</b></div>
      <div class="rd">${ex ? esc(ex.desc) : esc(ROLES[c.role].passive)}</div>`;
  } else if (r.type === 'tech') {
    card.innerHTML = `<div class="rk">RESEARCH</div><img class="big" src="${itemIcon('tech_parts')}"><div class="rn" style="color:${col}">${r.n} Salvaged Tech</div><div class="rd">Spend it on the Tech Tree (T).</div>`;
  } else {
    card.innerHTML = `<div class="rk">MATERIALS</div><div class="stacks">${r.stacks.map((s) => `<span><img src="${itemIcon(s.id)}">${s.n} ${esc(getItem(s.id).name)}</span>`).join('')}</div>`;
  }
  return card;
}

/** Chest opening: a reveal for normal chests, a pick-one screen for This-or-That chests. */
export class ChestUI {
  root: HTMLDivElement;
  isOpen = false;
  private queue: { kind: ChestKind; rewards: Reward[]; choice: boolean }[] = [];
  private current: { kind: ChestKind; rewards: Reward[]; choice: boolean } | null = null;

  constructor(parent: HTMLElement, private app: App) {
    this.root = h('div', 'chest-screen');
    parent.appendChild(this.root);
  }

  show(kind: ChestKind, rewards: Reward[], choice: boolean): void {
    this.queue.push({ kind, rewards, choice });
    if (!this.isOpen) this.next();
  }

  private next(): void {
    const c = this.queue.shift();
    if (!c) {
      this.isOpen = false;
      this.root.style.display = 'none';
      return;
    }
    this.current = c;
    this.isOpen = true;
    this.root.style.display = 'flex';
    const info = CHEST_INFO[c.kind];
    const best = Math.max(...c.rewards.map(rewardRarity));
    this.app.sound(best >= 4 ? 'legendary' : 'chest');
    this.root.innerHTML = '';
    const box = h('div', `chest-box ${c.choice ? 'is-choice' : ''}`);
    box.style.setProperty('--cc', info.color);
    box.innerHTML = `<div class="ct" style="color:${info.color}">${esc(info.name)}</div><div class="cs">${c.choice ? 'THIS or THAT: pick one reward. The other is lost.' : esc(info.desc)}</div>`;
    const row = h('div', 'reward-row');
    c.rewards.forEach((r, i) => {
      const card = rewardCard(r);
      card.style.animationDelay = `${i * 0.18}s`;
      if (c.choice) {
        card.classList.add('pickable');
        card.appendChild(button('TAKE THIS', () => this.take([r])));
        card.addEventListener('click', () => this.take([r]));
      }
      row.appendChild(card);
      if (c.choice && i === 0) row.appendChild(h('div', 'or', 'OR'));
    });
    box.appendChild(row);
    if (!c.choice) box.appendChild(button('Collect all', () => this.take(c.rewards), 'primary'));
    this.root.appendChild(box);
  }

  private take(rs: Reward[]): void {
    const g = this.app.game;
    const lines = rs.map((r) => grantReward(g, r));
    this.app.hud.toast(`Got: ${lines.join(', ')}`, '#ffd740');
    this.app.sound('pickup');
    this.next();
  }

  /** Esc: normal chests are collected; choice chests must be decided. */
  escape(): void {
    if (this.current && !this.current.choice) this.take(this.current.rewards);
  }
}
