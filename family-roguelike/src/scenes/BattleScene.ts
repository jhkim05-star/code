import * as Phaser from 'phaser';
import { CARDS } from '../game/cards.ts';
import { endTurn, playCard, startBattle, type BattleState, PLAYER_MAX_HP, ENERGY_PER_TURN } from '../game/combat.ts';
import { TRAINING_ENEMY } from '../game/enemies.ts';

const FONT = 'system-ui, sans-serif';

export class BattleScene extends Phaser.Scene {
  private battle: BattleState = startBattle();

  constructor() {
    super('BattleScene');
  }

  create(): void {
    this.renderBattle();
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

  private renderBattle(): void {
    this.children.removeAll(true);
    const s = this.battle;

    this.add.rectangle(480, 270, 960, 540, 0x101a30);
    this.label(38, 22, '가족 로그라이크', 27);
    this.label(480, 38, 'Level 1 · 연습 전투', 22, '#91b8ff', true);
    this.label(920, 38, `${s.turn}턴`, 21, '#cbd5e1').setOrigin(1, 0.5);

    this.add.rectangle(250, 183, 390, 218, 0x1c3556).setStrokeStyle(2, 0x5786bd);
    this.label(250, 105, '나', 32, '#ffffff', true);
    this.label(250, 158, `체력  ${s.playerHp} / ${PLAYER_MAX_HP}`, 27, '#ffffff', true);
    this.label(250, 208, `방어도  ${s.playerBlock}`, 23, '#a5d7ff', true);
    this.label(250, 252, `에너지  ${s.energy} / ${ENERGY_PER_TURN}`, 23, '#ffdf82', true);

    this.add.rectangle(710, 183, 390, 218, 0x402b3e).setStrokeStyle(2, 0xb46b79);
    this.label(710, 105, TRAINING_ENEMY.name, 32, '#ffffff', true);
    this.label(710, 158, `체력  ${s.enemyHp} / ${TRAINING_ENEMY.maxHp}`, 27, '#ffffff', true);
    this.label(710, 218, `다음 행동  공격 ${TRAINING_ENEMY.attack}`, 23, '#ffc3b4', true);

    this.label(400, 324, s.message, 20, '#d7e4f8', true);

    if (s.phase !== 'player') {
      this.add.rectangle(480, 270, 960, 540, 0x080d19, 0.84);
      this.label(480, 202, s.phase === 'won' ? '승리!' : '패배', 58, s.phase === 'won' ? '#a8f0bf' : '#ffd0c9', true);
      this.label(480, 284, s.phase === 'won' ? '연습 상대를 쓰러뜨렸습니다.' : '다시 도전해 보세요.', 26, '#ffffff', true);
      this.button(480, 377, 270, 76, '다시 시작', () => {
        this.battle = startBattle();
        this.renderBattle();
      });
      return;
    }

    this.button(828, 324, 174, 68, '턴 종료', () => {
      this.battle = endTurn(this.battle);
      this.renderBattle();
    });

    const cardWidth = 146;
    const gap = 12;
    const startX = (960 - (5 * cardWidth + 4 * gap)) / 2 + cardWidth / 2;
    s.hand.forEach((cardId, index) => {
      const card = CARDS[cardId];
      const x = startX + index * (cardWidth + gap);
      const fill = card.kind === 'attack' ? 0x8c4655 : 0x376d91;
      const background = this.add.rectangle(x, 439, cardWidth, 142, fill).setStrokeStyle(2, 0xe2ecff);
      if (card.cost > s.energy) background.setAlpha(0.48);
      background.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.battle = playCard(this.battle, index);
        this.renderBattle();
      });
      this.label(x - 55, 379, `${card.cost}`, 23, '#ffdf82');
      this.label(x, 418, card.name, 29, '#ffffff', true);
      this.label(x, 466, card.description, 18, '#edf4ff', true);
    });
    this.label(480, 522, `뽑을 카드 ${s.drawPile.length}  ·  버린 카드 ${s.discardPile.length}`, 17, '#9db0cb', true);
  }
}
