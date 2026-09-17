import * as Phaser from 'phaser';
import { CARDS, type CardDefinition } from '../game/cards.ts';
import { ENERGY_PER_TURN, PLAYER_MAX_HP } from '../game/combat.ts';
import { applyDeckAction, cancelDeckAction, chooseDeckAction, chooseReward, endRunTurn, FINAL_FLOOR, playRunCard, skipReward, startRun, type RunState } from '../game/run.ts';

const FONT = 'system-ui, sans-serif';
const BEST_FLOOR_KEY = 'family-roguelike.best-floor.v1';

function readBestFloor(): number {
  try {
    const value = Number(localStorage.getItem(BEST_FLOOR_KEY));
    return Number.isInteger(value) && value >= 0 && value <= FINAL_FLOOR ? value : 0;
  } catch {
    return 0;
  }
}

function saveBestFloor(floor: number): void {
  try {
    localStorage.setItem(BEST_FLOOR_KEY, String(floor));
  } catch {
    // A private browser session can disable storage; the run still works.
  }
}

export class BattleScene extends Phaser.Scene {
  private run!: RunState;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    this.run = startRun(readBestFloor());
    saveBestFloor(this.run.bestFloor);
    this.renderRun();
  }

  private label(x: number, y: number, text: string, size: number, color = '#ffffff', centered = false): Phaser.GameObjects.Text {
    const item = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color });
    if (centered) item.setOrigin(0.5);
    return item;
  }

  private button(x: number, y: number, width: number, height: number, text: string, onPress: () => void): void {
    const background = this.add.rectangle(x, y, width, height, 0x3571cf).setStrokeStyle(2, 0x91b8ff);
    background.setInteractive({ useHandCursor: true }).on('pointerdown', onPress);
    this.label(x, y, text, 23, '#ffffff', true);
  }

  private cardDescription(x: number, y: number, card: CardDefinition, width: number, size = 17): void {
    this.add.text(x, y, card.description, {
      fontFamily: FONT, fontSize: `${size}px`, color: '#edf4ff',
      align: 'center', wordWrap: { width },
    }).setOrigin(0.5);
  }

  private apply(next: RunState): void {
    if (next === this.run) return;
    if (next.bestFloor > this.run.bestFloor) saveBestFloor(next.bestFloor);
    this.run = next;
    this.renderRun();
  }

  private renderRun(): void {
    this.children.removeAll(true);
    const run = this.run;
    const battle = run.battle;

    this.add.rectangle(480, 270, 960, 540, 0x101a30);
    this.label(38, 22, '가족 로그라이크', 27);
    this.label(480, 38, 'Level 3 · 덱빌딩', 22, '#91b8ff', true);
    this.label(920, 38, `${run.floor}/${FINAL_FLOOR}층 · 최고 ${run.bestFloor}층`, 19, '#cbd5e1').setOrigin(1, 0.5);

    this.add.rectangle(250, 183, 390, 218, 0x1c3556).setStrokeStyle(2, 0x5786bd);
    this.label(250, 105, '나', 32, '#ffffff', true);
    this.label(250, 158, `체력  ${run.playerHp} / ${PLAYER_MAX_HP}`, 27, '#ffffff', true);
    this.label(250, 208, `방어도  ${battle.playerBlock}`, 23, '#a5d7ff', true);
    this.label(250, 252, `에너지  ${battle.energy} / ${ENERGY_PER_TURN}`, 23, '#ffdf82', true);
    this.label(250, 280, `이번 턴 공격 ${battle.attacksPlayed} · 반격 ${battle.counterDamage}`, 17, '#c5e9ff', true);

    this.add.rectangle(710, 183, 390, 218, 0x402b3e).setStrokeStyle(2, 0xb46b79);
    this.label(710, 105, battle.enemy.name, 29, '#ffffff', true);
    this.label(710, 158, `체력  ${battle.enemyHp} / ${battle.enemy.maxHp}`, 27, '#ffffff', true);
    this.label(710, 218, `다음 행동  공격 ${battle.enemy.attack}`, 23, '#ffc3b4', true);
    this.label(710, 260, `중독 ${battle.enemyPoison}`, 20, '#b9efb5', true);

    this.label(400, 324, battle.message, 20, '#d7e4f8', true);

    if (run.phase === 'reward') {
      this.renderReward();
      return;
    }
    if (run.phase === 'manage') {
      this.renderManage();
      return;
    }
    if (run.phase === 'won' || run.phase === 'lost') {
      this.renderEnding();
      return;
    }

    this.button(828, 324, 174, 68, '턴 종료', () => this.apply(endRunTurn(this.run)));

    const cardWidth = 146;
    const gap = 12;
    const startX = (960 - (5 * cardWidth + 4 * gap)) / 2 + cardWidth / 2;
    battle.hand.forEach((cardId, index) => {
      const card = CARDS[cardId];
      const x = startX + index * (cardWidth + gap);
      const fill = card.kind === 'attack' ? 0x8c4655 : card.kind === 'block' ? 0x376d91 : 0x6b548e;
      const background = this.add.rectangle(x, 439, cardWidth, 142, fill).setStrokeStyle(2, 0xe2ecff);
      if (card.cost > battle.energy) background.setAlpha(0.48);
      background.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.apply(playRunCard(this.run, index)));
      this.label(x - 55, 379, `${card.cost}`, 23, '#ffdf82');
      this.label(x, 416, card.name, card.name.length > 5 ? 23 : 28, '#ffffff', true);
      this.cardDescription(x, 468, card, 132, 16);
    });
    this.label(480, 522, `덱 ${run.deck.length}장 · 뽑을 카드 ${battle.drawPile.length} · 버린 카드 ${battle.discardPile.length}`, 17, '#9db0cb', true);
  }

  private renderReward(): void {
    this.add.rectangle(480, 270, 960, 540, 0x080d19, 0.9);
    this.label(480, 76, `${this.run.floor}층 클리어!`, 43, '#a8f0bf', true);
    this.label(480, 124, `체력 ${this.run.playerHp} 유지 · 보상 하나를 선택하세요`, 22, '#ffffff', true);
    this.run.rewardOptions.forEach((cardId, index) => {
      const card = CARDS[cardId];
      const x = 220 + index * 260;
      const fill = card.kind === 'attack' ? 0x8c4655 : card.kind === 'block' ? 0x376d91 : 0x6b548e;
      const background = this.add.rectangle(x, 282, 226, 216, fill).setStrokeStyle(3, 0xe2ecff);
      background.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.apply(chooseReward(this.run, index)));
      this.label(x, 207, card.rarity === 'rare' ? '희귀' : card.rarity === 'uncommon' ? '고급' : '일반', 18, '#ffdf82', true);
      this.label(x, 252, card.name, 29, '#ffffff', true);
      this.label(x, 299, `에너지 ${card.cost}`, 21, '#ffdf82', true);
      this.cardDescription(x, 349, card, 205, 18);
    });
    this.button(220, 466, 220, 60, '카드 강화', () => this.apply(chooseDeckAction(this.run, 'upgrade')));
    this.button(480, 466, 220, 60, '카드 제거', () => this.apply(chooseDeckAction(this.run, 'remove')));
    this.button(740, 466, 220, 60, '보상 건너뛰기', () => this.apply(skipReward(this.run)));
  }

  private renderManage(): void {
    this.add.rectangle(480, 270, 960, 540, 0x080d19, 0.94);
    const upgrading = this.run.deckAction === 'upgrade';
    this.label(480, 65, upgrading ? '강화할 카드 1장 선택' : '제거할 카드 1장 선택', 38, '#a8d8ff', true);
    this.label(480, 112, upgrading ? '강화된 카드는 다시 강화할 수 없습니다.' : '선택한 카드는 이번 런의 덱에서 빠집니다.', 21, '#ffffff', true);
    this.run.deck.forEach((cardId, index) => {
      const card = CARDS[cardId];
      const x = 150 + (index % 5) * 165;
      const y = 185 + Math.floor(index / 5) * 96;
      const canSelect = !upgrading || Boolean(card.upgradeTo);
      const background = this.add.rectangle(x, y, 148, 76, card.kind === 'attack' ? 0x8c4655 : card.kind === 'block' ? 0x376d91 : 0x6b548e).setStrokeStyle(2, 0xe2ecff);
      if (canSelect) background.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.apply(applyDeckAction(this.run, index)));
      else background.setAlpha(0.42);
      this.label(x, y - 13, card.name, 20, '#ffffff', true);
      this.label(x, y + 18, upgrading && !canSelect ? '강화 완료' : `에너지 ${card.cost}`, 15, '#ffdf82', true);
    });
    this.button(480, 505, 210, 52, '보상으로 돌아가기', () => this.apply(cancelDeckAction(this.run)));
  }

  private renderEnding(): void {
    const won = this.run.phase === 'won';
    this.add.rectangle(480, 270, 960, 540, 0x080d19, 0.88);
    this.label(480, 188, won ? '5층 보스 클리어!' : '게임 오버', 52, won ? '#a8f0bf' : '#ffd0c9', true);
    this.label(480, 272, won ? `남은 체력 ${this.run.playerHp}` : `${this.run.floor}층까지 도달했습니다.`, 26, '#ffffff', true);
    this.label(480, 319, `최고 기록 ${this.run.bestFloor}층`, 23, '#cbd5e1', true);
    this.button(480, 411, 270, 76, '새로 시작', () => this.apply(startRun(this.run.bestFloor)));
  }
}
