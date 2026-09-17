// Level 1 전투 화면. 카드 그림을 보여주고, 터치를 받고, 상태를 그린다.
// 규칙 계산은 전혀 하지 않는다 — 그건 game/combat.ts가 담당한다.

import * as Phaser from 'phaser';
import { createCombatState, endTurn, playCard, type CombatState } from '../game/combat';
import { getCardDefinition } from '../game/cards';

const COLORS = {
  cardBg: 0x1f2b4a,
  cardBgHover: 0x2a3a63,
  cardBgDisabled: 0x141c30,
  cardBorder: 0x3a4d7a,
  button: 0x2f7f4f,
  buttonHover: 0x3c9c62,
  buttonDisabled: 0x1c2c22,
  overlay: 0x000000,
};

export class BattleScene extends Phaser.Scene {
  private state!: CombatState;
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    this.state = createCombatState();
    this.root = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.root.removeAll(true);
    const s = this.state;
    const ongoing = s.status === 'ongoing';

    // 플레이어 패널 (좌상단)
    this.addText(24, 20, '플레이어', 20, '#ffffff', true);
    this.addText(24, 46, `HP ${s.playerHp} / ${s.playerMaxHp}`, 20, '#f2f2f2');
    this.addText(24, 70, `방어도 ${s.block}`, 16, s.block > 0 ? '#8fc7ff' : '#4a5578');
    this.addText(24, 94, `뽑을 카드 ${s.drawPile.length}장 · 버린 카드 ${s.discardPile.length}장`, 14, '#7481a3');

    // 적 패널 (우상단)
    this.addText(936, 20, s.enemy.name, 20, '#ffffff', true, 1);
    this.addText(936, 46, `HP ${s.enemy.hp} / ${s.enemy.maxHp}`, 20, '#f2f2f2', false, 1);
    const intentLabel = `다음 행동: 공격 ${s.enemy.intent.amount}`;
    this.addText(936, 70, intentLabel, 16, '#ffb4a8', false, 1);

    // 턴 표시 (상단 중앙)
    this.addText(480, 20, `턴 ${s.turnNumber}`, 16, '#9fb3d9', false, 0.5);

    // 에너지 (좌하단)
    this.addText(24, 468, `에너지 ${s.energy} / ${s.maxEnergy}`, 22, '#f2c94c', true);

    this.renderHand();
    this.renderEndTurnButton();

    if (!ongoing) {
      this.renderResultOverlay();
    }
  }

  private renderHand(): void {
    const s = this.state;
    const cardWidth = 140;
    const cardHeight = 170;
    const gap = 16;
    const totalWidth = s.hand.length * cardWidth + Math.max(0, s.hand.length - 1) * gap;
    const startX = 480 - totalWidth / 2;
    const cardY = 372;

    s.hand.forEach((card, i) => {
      const def = getCardDefinition(card);
      const x = startX + i * (cardWidth + gap) + cardWidth / 2;
      const affordable = s.status === 'ongoing' && s.energy >= def.cost;

      const bg = this.add
        .rectangle(x, cardY, cardWidth, cardHeight, affordable ? COLORS.cardBg : COLORS.cardBgDisabled)
        .setStrokeStyle(2, COLORS.cardBorder);
      this.root.add(bg);

      this.root.add(this.makeText(x, cardY - cardHeight / 2 + 22, def.name, 20, '#ffffff', true, 0.5, 0.5));
      this.root.add(
        this.makeText(x - cardWidth / 2 + 16, cardY - cardHeight / 2 + 16, `${def.cost}`, 18, '#f2c94c', true, 0, 0.5),
      );
      this.root.add(
        this.add
          .text(x, cardY + 8, def.description, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '15px',
            color: '#c9d6f5',
            align: 'center',
            wordWrap: { width: cardWidth - 24 },
          })
          .setOrigin(0.5, 0),
      );

      if (affordable) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(COLORS.cardBgHover));
        bg.on('pointerout', () => bg.setFillStyle(COLORS.cardBg));
        bg.on('pointerdown', () => {
          this.state = playCard(this.state, card.uid);
          this.render();
        });
      }
    });
  }

  private renderEndTurnButton(): void {
    const ongoing = this.state.status === 'ongoing';
    const btn = this.add
      .rectangle(880, 468, 140, 56, ongoing ? COLORS.button : COLORS.buttonDisabled)
      .setStrokeStyle(2, 0xffffff, 0.2);
    this.root.add(btn);
    this.root.add(this.makeText(880, 468, '턴 종료', 20, '#ffffff', true, 0.5, 0.5));

    if (ongoing) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setFillStyle(COLORS.buttonHover));
      btn.on('pointerout', () => btn.setFillStyle(COLORS.button));
      btn.on('pointerdown', () => {
        this.state = endTurn(this.state);
        this.render();
      });
    }
  }

  private renderResultOverlay(): void {
    const won = this.state.status === 'won';
    this.root.add(this.add.rectangle(480, 270, 960, 540, COLORS.overlay, 0.65));
    this.root.add(this.makeText(480, 220, won ? '승리!' : '패배...', 48, '#ffffff', true, 0.5, 0.5));

    const restartBtn = this.add.rectangle(480, 300, 200, 56, COLORS.button).setStrokeStyle(2, 0xffffff, 0.3);
    this.root.add(restartBtn);
    this.root.add(this.makeText(480, 300, '다시 시작', 22, '#ffffff', true, 0.5, 0.5));

    restartBtn.setInteractive({ useHandCursor: true });
    restartBtn.on('pointerover', () => restartBtn.setFillStyle(COLORS.buttonHover));
    restartBtn.on('pointerout', () => restartBtn.setFillStyle(COLORS.button));
    restartBtn.on('pointerdown', () => {
      this.state = createCombatState();
      this.render();
    });
  }

  private addText(
    x: number,
    y: number,
    value: string,
    size: number,
    color: string,
    bold = false,
    originX = 0,
  ): void {
    this.root.add(this.makeText(x, y, value, size, color, bold, originX, 0));
  }

  private makeText(
    x: number,
    y: number,
    value: string,
    size: number,
    color: string,
    bold: boolean,
    originX: number,
    originY: number,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: `${size}px`,
        color,
        fontStyle: bold ? 'bold' : 'normal',
      })
      .setOrigin(originX, originY);
  }
}
