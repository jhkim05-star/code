import * as Phaser from 'phaser';
import { CARDS, type CardDefinition } from '../game/cards.ts';
import {
  applyChapterDeckAction, buyShopCard, buyShopHeal, buyShopRemoval, canTravel,
  cancelChapterDeckAction, CHAPTER_FLOORS, CHAPTER_NAME, chooseChapterDeckAction,
  chooseChapterReward, chooseEvent, endChapterTurn, enterNode, EVENTS, leaveShop,
  playChapterCard, restHeal, restUpgrade, shopPrice, skipChapterReward, startChapter,
  type ChapterState, type MapNode, type NodeKind,
} from '../game/chapter.ts';
import { enemyAction } from '../game/enemies.ts';

const FONT = 'system-ui, sans-serif';
const BEST_KEY = 'family-roguelike.best-floor.v1';
const SAVE_KEY = 'family-roguelike.chapter1.run.v1';
const NODE_LABEL: Record<NodeKind, string> = { battle: '전투', elite: '강적', event: '사건', rest: '휴식', shop: '상점', boss: '보스' };
const NODE_COLOR: Record<NodeKind, number> = { battle: 0x4979aa, elite: 0xb84e6f, event: 0x765eaa, rest: 0x438d78, shop: 0xc18a4e, boss: 0xd45457 };

function readBest(): number {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isInteger(value) && value >= 0 && value <= CHAPTER_FLOORS ? value : 0;
  } catch { return 0; }
}

function saveBest(value: number): void {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* Storage may be disabled. */ }
}

function readRun(): ChapterState | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const state = value as ChapterState;
    const phases = ['map', 'battle', 'reward', 'event', 'rest', 'shop', 'manage', 'won', 'lost'];
    if (!phases.includes(state.phase) || !Array.isArray(state.map) || state.map.length !== CHAPTER_FLOORS ||
      !Array.isArray(state.path) || state.path.length > CHAPTER_FLOORS || !Array.isArray(state.deck) ||
      !state.deck.every(id => id in CARDS) || !Number.isFinite(state.playerHp) || !Number.isFinite(state.gold) ||
      (state.phase === 'battle' && (!state.battle || !Array.isArray(state.battle.hand) || !state.battle.enemy)) ||
      (state.phase === 'event' && (!state.eventId || !(state.eventId in EVENTS)))) return null;
    return state;
  } catch { return null; }
}

function saveRun(state: ChapterState): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* Storage may be disabled. */ }
}

function nodeX(index: number, count: number): number {
  if (count === 1) return 480;
  if (count === 2) return index === 0 ? 330 : 630;
  return 230 + index * 250;
}

export class ChapterScene extends Phaser.Scene {
  private chapter!: ChapterState;
  private muted = false;
  private audioContext?: AudioContext;
  private managePage = 0;
  private restartPending = false;

  constructor() { super('ChapterScene'); }

  preload(): void {
    this.load.image('room-night', './assets/chapter1/living-room-night.png');
    this.load.image('blanket-hero', './assets/chapter1/blanket-adventurer.png');
    this.load.image('sleepy-king', './assets/chapter1/sleepy-king.png');
  }

  create(): void {
    this.chapter = readRun() ?? startChapter(readBest());
    this.chapter.bestFloor = Math.max(this.chapter.bestFloor, readBest());
    this.render();
  }

  private tone(kind: 'tap' | 'attack' | 'win' | 'hurt'): void {
    if (this.muted) return;
    try {
      this.audioContext ??= new AudioContext();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      const now = this.audioContext.currentTime;
      oscillator.type = kind === 'hurt' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(kind === 'win' ? 660 : kind === 'attack' ? 330 : kind === 'hurt' ? 190 : 500, now);
      if (kind === 'win') oscillator.frequency.exponentialRampToValueAtTime(990, now + 0.18);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      oscillator.connect(gain).connect(this.audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
    } catch { /* The game remains playable when audio is unavailable. */ }
  }

  private apply(next: ChapterState): void {
    if (next === this.chapter) { this.tone('hurt'); return; }
    const before = this.chapter;
    if (next.bestFloor > before.bestFloor) saveBest(next.bestFloor);
    if (next.phase === 'manage' && before.phase !== 'manage') this.managePage = 0;
    this.restartPending = false;
    this.chapter = next;
    saveRun(next);
    this.tone(next.phase === 'won' || (next.phase === 'reward' && before.phase === 'battle') ? 'win'
      : next.phase === 'lost' ? 'hurt' : before.phase === 'battle' ? 'attack' : 'tap');
    this.render();
    if (before.phase === 'battle' && next.phase === 'battle' && before.battle && next.battle) {
      const enemyDamage = before.battle.enemyHp - next.battle.enemyHp;
      const playerDamage = before.playerHp - next.playerHp;
      if (enemyDamage > 0) this.floatText(706, 174, `-${enemyDamage}`, '#ffd178');
      if (playerDamage > 0) this.floatText(244, 174, `-${playerDamage}`, '#ff918a');
    }
  }

  private floatText(x: number, y: number, value: string, color: string): void {
    const item = this.text(x, y, value, 31, color, true);
    this.tweens.add({ targets: item, y: y - 40, alpha: 0, duration: 650, onComplete: () => item.destroy() });
  }

  private text(x: number, y: number, value: string, size: number, color = '#ffffff', centered = false): Phaser.GameObjects.Text {
    const item = this.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color });
    if (centered) item.setOrigin(0.5);
    return item;
  }

  private wrapped(x: number, y: number, value: string, width: number, size: number, color = '#ffffff'): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center', wordWrap: { width } }).setOrigin(0.5);
  }

  private button(x: number, y: number, width: number, height: number, value: string, action: () => void, enabled = true): void {
    const bg = this.add.rectangle(x, y, width, height, enabled ? 0x3b70a4 : 0x374356, enabled ? 0.98 : 0.55).setStrokeStyle(2, enabled ? 0xb1d9ff : 0x718094);
    if (enabled) bg.setInteractive({ useHandCursor: true }).on('pointerdown', action);
    this.wrapped(x, y, value, width - 16, height <= 48 ? 18 : 20, enabled ? '#ffffff' : '#a9b4c5');
  }

  private panel(x: number, y: number, width: number, height: number, color = 0x0b1730, alpha = 0.86): void {
    this.add.rectangle(x, y, width, height, color, alpha).setStrokeStyle(2, 0x6c8cb3, 0.75);
  }

  private background(): void {
    this.add.image(480, 270, 'room-night').setDisplaySize(960, 540);
    this.add.rectangle(480, 270, 960, 540, 0x061023, 0.57);
  }

  private header(): void {
    this.add.rectangle(480, 31, 960, 62, 0x081326, 0.88);
    this.text(19, 19, CHAPTER_NAME, 22, '#ffe3aa');
    this.text(565, 30, `체력 ${this.chapter.playerHp}/${this.chapter.maxHp}   금화 ${this.chapter.gold}   덱 ${this.chapter.deck.length}장`, 17, '#ffffff', true);
    this.text(892, 30, `${this.chapter.path.length}/${CHAPTER_FLOORS}`, 22, '#b8dbff', true);
    const mute = this.add.rectangle(937, 31, 38, 36, 0x273c5b).setStrokeStyle(1, 0x819fc5);
    mute.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.muted = !this.muted; this.render(); });
    this.text(937, 31, this.muted ? '×' : '♪', 23, '#ffffff', true);
  }

  private render(): void {
    this.tweens.killAll();
    this.children.removeAll(true);
    this.background();
    this.header();
    switch (this.chapter.phase) {
      case 'map': this.renderMap(); break;
      case 'battle': this.renderBattle(); break;
      case 'reward': this.renderReward(); break;
      case 'event': this.renderEvent(); break;
      case 'rest': this.renderRest(); break;
      case 'shop': this.renderShop(); break;
      case 'manage': this.renderManage(); break;
      case 'won':
      case 'lost': this.renderEnding(); break;
    }
  }

  private renderMap(): void {
    this.panel(480, 302, 850, 450, 0x09162c, 0.89);
    this.text(480, 91, '오늘 밤의 길을 고르세요', 28, '#ffe0a2', true);
    this.wrapped(480, 123, this.chapter.lastResult, 760, 18, '#d9e9fa');
    const activeRow = this.chapter.path.length;
    const firstRow = Math.max(0, activeRow - 1);
    const lastRow = Math.min(this.chapter.map.length, firstRow + 5);
    const line = this.add.graphics();
    for (let row = firstRow; row < lastRow - 1; row++) {
      const from = this.chapter.map[row];
      const to = this.chapter.map[row + 1];
      const y1 = 174 + (row - firstRow) * 73;
      const y2 = y1 + 73;
      from.forEach((_, fromIndex) => to.forEach((__, toIndex) => {
        if (from.length !== 1 && to.length !== 1 && Math.abs(fromIndex - toIndex) > 1) return;
        line.lineStyle(3, row < activeRow - 1 ? 0xe5be71 : 0x7188a7, row < activeRow - 1 ? 0.65 : 0.36);
        line.lineBetween(nodeX(fromIndex, from.length), y1 + 26, nodeX(toIndex, to.length), y2 - 26);
      }));
    }
    for (let row = firstRow; row < lastRow; row++) {
      const nodes = this.chapter.map[row];
      const y = 174 + (row - firstRow) * 73;
      this.text(108, y, `${row + 1}층`, 17, row === activeRow ? '#ffe0a2' : '#9db4cd', true);
      nodes.forEach((node, index) => {
        const x = nodeX(index, nodes.length);
        const active = row === activeRow && canTravel(this.chapter.map, this.chapter.path, index);
        const visited = row < activeRow && this.chapter.path[row] === index;
        const dot = this.add.circle(x, y, 31, NODE_COLOR[node.kind], active || visited ? 1 : 0.45)
          .setStrokeStyle(active ? 4 : 2, active ? 0xffdfa0 : visited ? 0xf8c66a : 0x91a5bd);
        if (active) dot.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.apply(enterNode(this.chapter, index)));
        this.text(x, y, NODE_LABEL[node.kind], 17, '#ffffff', true);
      });
    }
    this.text(430, 515, `최고 기록 ${this.chapter.bestFloor}층 · 빛나는 원을 눌러 이동`, 16, '#b8cfe8', true);
    this.button(818, 515, 118, 34, '새 원정', () => { this.restartPending = true; this.render(); });
    if (this.restartPending) {
      this.add.rectangle(480, 270, 960, 540, 0x050b16, 0.76).setInteractive();
      this.panel(480, 270, 570, 232, 0x12223a, 1);
      this.text(480, 209, '원정을 다시 시작할까요?', 29, '#ffe1a5', true);
      this.text(480, 249, '지금까지 모은 카드와 금화가 초기화됩니다.', 19, '#e4eeff', true);
      this.button(355, 319, 190, 52, '계속하기', () => { this.restartPending = false; this.render(); });
      this.button(605, 319, 190, 52, '새로 시작', () => this.apply(startChapter(this.chapter.bestFloor)));
    }
  }

  private drawEnemy(x: number, y: number, name: string): void {
    const color = name.includes('먼지') ? 0x9a9cb5 : name.includes('양말') ? 0x8b78a3 : name.includes('기사') ? 0xc3936c : name.includes('진공') ? 0x966381 : 0x957c8c;
    const g = this.add.graphics();
    g.fillStyle(0x081021, 0.7); g.fillEllipse(x, y + 72, 165, 27);
    g.fillStyle(color); g.fillRoundedRect(x - 64, y - 62, 128, 126, 28);
    g.fillStyle(0xd9cfbd); g.fillCircle(x - 25, y - 17, 13); g.fillCircle(x + 25, y - 17, 13);
    g.fillStyle(0x1b2437); g.fillCircle(x - 21, y - 17, 5); g.fillCircle(x + 29, y - 17, 5);
    g.fillStyle(0xf5d17f); g.fillRoundedRect(x - 35, y + 23, 70, 13, 5);
    this.tweens.add({ targets: g, y: -5, duration: 1050, yoyo: true, repeat: -1 });
  }

  private hpBar(x: number, y: number, hp: number, max: number, block: number, label: string): void {
    this.text(x, y - 30, label, 23, '#ffffff', true);
    this.add.rectangle(x, y, 206, 18, 0x1a2437).setStrokeStyle(2, 0xe7e1d1);
    const fill = Math.max(0, hp / max) * 200;
    if (fill > 0) this.add.rectangle(x - 100 + fill / 2, y, fill, 12, 0xd9656e);
    this.text(x, y + 24, `${hp}/${max}${block ? `  ·  방어 ${block}` : ''}`, 17, '#fff0d8', true);
  }

  private cardFace(x: number, y: number, width: number, height: number, card: CardDefinition, action?: () => void, affordable = true): void {
    const fill = card.kind === 'attack' ? 0x743d5a : card.kind === 'block' ? 0x315f80 : 0x655080;
    const bg = this.add.rectangle(x, y, width, height, fill, affordable ? 0.98 : 0.52).setStrokeStyle(2, card.rarity === 'rare' ? 0xffd782 : 0xd4e7ff);
    if (action) bg.setInteractive({ useHandCursor: true }).on('pointerdown', action);
    this.text(x - width / 2 + 17, y - height / 2 + 16, `${card.cost}`, 22, '#ffe49b', true);
    this.text(x, y - 25, card.name, card.name.length > 6 ? 18 : 22, '#ffffff', true);
    this.wrapped(x, y + 25, card.description, width - 16, 15, '#eaf2ff');
  }

  private renderBattle(): void {
    const battle = this.chapter.battle!;
    const action = enemyAction(battle.enemy, battle.turn);
    this.panel(480, 219, 920, 304, 0x081326, 0.66);
    this.text(480, 86, `${battle.enemy.name} · ${battle.turn}턴`, 28, '#ffe1ae', true);
    const hero = this.add.image(240, 205, 'blanket-hero').setDisplaySize(153, 165);
    this.tweens.add({ targets: hero, y: 199, duration: 1200, yoyo: true, repeat: -1 });
    if (battle.enemy.name === '잠꾸러기 왕') {
      const king = this.add.image(710, 204, 'sleepy-king').setDisplaySize(168, 176);
      this.tweens.add({ targets: king, y: 198, duration: 1400, yoyo: true, repeat: -1 });
    } else this.drawEnemy(710, 205, battle.enemy.name);
    this.hpBar(240, 300, battle.playerHp, this.chapter.maxHp, battle.playerBlock, '담요 원정대');
    this.hpBar(710, 300, battle.enemyHp, battle.enemy.maxHp, battle.enemyBlock, battle.enemy.name);
    this.text(240, 346, `에너지 ${battle.energy}/3 · 반격 ${battle.counterDamage}`, 17, '#ffdf90', true);
    this.text(240, 371, `뽑을 카드 ${battle.drawPile.length} · 버린 카드 ${battle.discardPile.length}`, 15, '#d8e2f0', true);
    const intent = action.type === 'attack' ? `다음 행동: 공격 ${action.value + battle.enemyStrength}` : action.type === 'block' ? `다음 행동: 방어 ${action.value}` : `다음 행동: 공격력 +${action.value}`;
    this.text(710, 346, `${intent} · 중독 ${battle.enemyPoison}`, 17, '#ffd1bd', true);
    this.wrapped(550, 383, battle.message, 390, 17, '#e4f0ff');
    this.button(858, 382, 156, 47, '턴 종료', () => this.apply(endChapterTurn(this.chapter)));
    const cardWidth = 158;
    const gap = 12;
    const startX = (960 - (5 * cardWidth + 4 * gap)) / 2 + cardWidth / 2;
    battle.hand.forEach((cardId, index) => {
      const card = CARDS[cardId];
      this.cardFace(startX + index * (cardWidth + gap), 467, cardWidth, 126, card,
        () => this.apply(playChapterCard(this.chapter, index)), card.cost <= battle.energy);
    });
  }

  private renderReward(): void {
    this.panel(480, 300, 900, 462, 0x091428, 0.95);
    this.text(480, 91, this.chapter.lastResult, 27, '#ffe1a5', true);
    this.text(480, 128, '새 카드를 얻거나 덱을 다듬으세요', 19, '#dceaff', true);
    this.chapter.rewardOptions.forEach((id, index) => {
      const card = CARDS[id];
      this.cardFace(220 + index * 260, 283, 215, 196, card, () => this.apply(chooseChapterReward(this.chapter, index)));
      this.text(220 + index * 260, 211, card.rarity === 'rare' ? '희귀' : card.rarity === 'uncommon' ? '고급' : '일반', 15, '#ffdc91', true);
    });
    this.button(220, 464, 218, 57, '기존 카드 강화', () => this.apply(chooseChapterDeckAction(this.chapter, 'upgrade')));
    this.button(480, 464, 218, 57, '기존 카드 제거', () => this.apply(chooseChapterDeckAction(this.chapter, 'remove')));
    this.button(740, 464, 218, 57, '건너뛰기', () => this.apply(skipChapterReward(this.chapter)));
  }

  private renderEvent(): void {
    const event = EVENTS[this.chapter.eventId!];
    this.panel(480, 296, 840, 430, 0x111529, 0.94);
    this.text(480, 126, event.title, 39, '#ffe1a5', true);
    this.wrapped(480, 220, event.story, 680, 24, '#ffffff');
    this.button(480, 343, 650, 64, event.choices[0].label, () => this.apply(chooseEvent(this.chapter, 0)));
    this.button(480, 427, 650, 64, event.choices[1].label, () => this.apply(chooseEvent(this.chapter, 1)));
  }

  private renderRest(): void {
    this.panel(480, 296, 840, 430, 0x10202a, 0.94);
    this.text(480, 126, '담요 요새에서 쉬어가기', 38, '#ffe1a5', true);
    this.wrapped(480, 218, '한숨 돌릴 시간입니다. 체력을 회복하거나 카드 한 장을 강화할 수 있습니다.', 700, 23);
    this.button(315, 370, 286, 86, `낮잠 · 체력 12 회복`, () => this.apply(restHeal(this.chapter)));
    this.button(645, 370, 286, 86, '작전 정리 · 카드 강화', () => this.apply(restUpgrade(this.chapter)));
  }

  private renderShop(): void {
    this.panel(480, 300, 900, 462, 0x1c1729, 0.95);
    this.text(480, 88, `야식 상점 · 보유 금화 ${this.chapter.gold}`, 30, '#ffe1a5', true);
    this.text(480, 127, this.chapter.lastResult, 17, '#d9e8fa', true);
    this.chapter.shopStock.forEach((id, index) => {
      const x = 220 + index * 260;
      if (!id) { this.panel(x, 278, 215, 184, 0x253046, 0.55); this.text(x, 278, '판매 완료', 21, '#c0c9d7', true); return; }
      const card = CARDS[id];
      const affordable = this.chapter.gold >= shopPrice(id);
      this.cardFace(x, 270, 215, 170, card, affordable ? () => this.apply(buyShopCard(this.chapter, index)) : undefined, affordable);
      this.text(x, 372, `${shopPrice(id)} 금화`, 20, affordable ? '#ffde91' : '#b2a7a1', true);
    });
    this.button(225, 466, 215, 55, '간식 18G · 체력 +10', () => this.apply(buyShopHeal(this.chapter)), this.chapter.gold >= 18 && !this.chapter.shopHealed && this.chapter.playerHp < this.chapter.maxHp);
    this.button(480, 466, 215, 55, '카드 제거 · 35G', () => this.apply(buyShopRemoval(this.chapter)), this.chapter.gold >= 35 && !this.chapter.shopRemoved && this.chapter.deck.length > 5);
    this.button(735, 466, 215, 55, '상점 나가기', () => this.apply(leaveShop(this.chapter)));
  }

  private renderManage(): void {
    this.panel(480, 300, 900, 462, 0x10192c, 0.96);
    const upgrading = this.chapter.deckAction === 'upgrade';
    this.text(480, 88, upgrading ? '강화할 카드 선택' : '제거할 카드 선택', 35, '#ffe1a5', true);
    this.text(480, 124, upgrading ? '강화된 카드는 다시 강화할 수 없습니다.' : '선택한 카드 1장이 덱에서 빠집니다.', 19, '#dceaff', true);
    const totalPages = Math.ceil(this.chapter.deck.length / 15);
    this.managePage = Math.min(this.managePage, totalPages - 1);
    this.chapter.deck.slice(this.managePage * 15, (this.managePage + 1) * 15).forEach((id, position) => {
      const index = this.managePage * 15 + position;
      const card = CARDS[id];
      const x = 150 + (position % 5) * 165;
      const y = 187 + Math.floor(position / 5) * 91;
      const enabled = !upgrading || Boolean(card.upgradeTo);
      this.button(x, y, 148, 72, `${card.name}\n${enabled ? `에너지 ${card.cost}` : '강화 완료'}`, () => this.apply(applyChapterDeckAction(this.chapter, index)), enabled);
    });
    if (totalPages > 1) {
      this.button(316, 468, 125, 41, '이전', () => { this.managePage -= 1; this.render(); }, this.managePage > 0);
      this.text(480, 468, `${this.managePage + 1} / ${totalPages}`, 18, '#e3eeff', true);
      this.button(644, 468, 125, 41, '다음', () => { this.managePage += 1; this.render(); }, this.managePage < totalPages - 1);
    }
    this.button(480, 510, 230, 45, '돌아가기', () => this.apply(cancelChapterDeckAction(this.chapter)));
  }

  private renderEnding(): void {
    const won = this.chapter.phase === 'won';
    this.panel(480, 300, 880, 462, 0x0b1427, 0.9);
    this.text(480, 110, won ? '거실에 아침이 왔습니다!' : '오늘 밤의 원정 종료', 43, won ? '#ffe1a5' : '#ffb4ab', true);
    const art = this.add.image(480, 265, won ? 'sleepy-king' : 'blanket-hero').setDisplaySize(won ? 195 : 170, 205);
    art.setAlpha(won ? 0.85 : 0.7);
    this.text(480, 398, `${this.chapter.path.length}층 도달 · 남은 체력 ${this.chapter.playerHp} · 금화 ${this.chapter.gold}`, 22, '#ffffff', true);
    this.text(480, 428, `최고 기록 ${this.chapter.bestFloor}층`, 18, '#c9d9ed', true);
    this.button(480, 488, 245, 55, '새 원정 시작', () => this.apply(startChapter(this.chapter.bestFloor)));
  }
}
