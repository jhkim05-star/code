// 휴식처("내 방") 화면: 체력 회복 또는 카드 강화 중 하나를 고른다.

import * as Phaser from 'phaser';
import { getCardDescription, getBaseDefinition, type CardInstance } from '../game/cards';
import { getUpgradeCandidates, restHealAmount } from '../game/rest';
import { applyPlayerHpDelta, completeCurrentFloor, upgradeCardInDeck } from '../game/run';
import { getRun, setRun } from './shared';
import { COLORS, LOGICAL_WIDTH, TEXT } from './theme';
import { makeButton, makeText, makeWrappedText } from './ui';

type Mode = 'choose' | 'upgradePick' | 'done';

export class RestScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private mode: Mode = 'choose';
  private resultText = '';

  constructor() {
    super('RestScene');
  }

  create(): void {
    this.mode = 'choose';
    this.resultText = '';
    this.root = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.root.removeAll(true);
    const run = getRun(this);

    makeText(this, this.root, LOGICAL_WIDTH / 2, 50, '🛏️ 내 방', 30, TEXT.primary, true, 0.5, 0);

    if (this.mode === 'done') {
      makeWrappedText(this, this.root, LOGICAL_WIDTH / 2, 200, this.resultText, 18, TEXT.gold, 600, 0.5, 0);
      makeButton(this, this.root, LOGICAL_WIDTH / 2, 320, 200, 52, '계속하기', () => this.leave());
      return;
    }

    if (this.mode === 'upgradePick') {
      makeText(this, this.root, LOGICAL_WIDTH / 2, 100, '강화할 카드를 고르세요.', 17, TEXT.secondary, false, 0.5, 0);
      const candidates = getUpgradeCandidates(run.deck, 3);
      const cardWidth = 220;
      const cardHeight = 220;
      const gap = 32;
      const totalWidth = candidates.length * cardWidth + Math.max(0, candidates.length - 1) * gap;
      const startX = LOGICAL_WIDTH / 2 - totalWidth / 2;
      const y = 300;

      candidates.forEach((card, i) => {
        const x = startX + i * (cardWidth + gap) + cardWidth / 2;
        const def = getBaseDefinition(card);
        const bg = this.add
          .rectangle(x, y, cardWidth, cardHeight, COLORS.cardBg[def.type])
          .setStrokeStyle(3, COLORS.rarityBorder[def.rarity]);
        this.root.add(bg);
        makeText(this, this.root, x, y - cardHeight / 2 + 26, def.name, 18, '#ffffff', true, 0.5, 0.5);
        makeWrappedText(this, this.root, x, y - 10, getCardDescription(def), 14, TEXT.secondary, cardWidth - 24, 0.5, 0);
        makeButton(this, this.root, x, y + cardHeight / 2 - 26, cardWidth - 40, 40, '강화', () => this.upgrade(card));
      });

      makeButton(this, this.root, LOGICAL_WIDTH / 2, y + cardHeight / 2 + 44, 160, 40, '뒤로', () => {
        this.mode = 'choose';
        this.render();
      });
      return;
    }

    const healAmount = restHealAmount(run.playerMaxHp);
    const upgradeCandidates = getUpgradeCandidates(run.deck, 3);

    makeButton(this, this.root, LOGICAL_WIDTH / 2, 200, 420, 70, `😴 체력 회복 (+${healAmount})`, () => this.heal());
    makeButton(
      this,
      this.root,
      LOGICAL_WIDTH / 2,
      290,
      420,
      70,
      '🔧 카드 강화',
      () => {
        this.mode = 'upgradePick';
        this.render();
      },
      { enabled: upgradeCandidates.length > 0 },
    );
  }

  private heal(): void {
    const run = getRun(this);
    const amount = restHealAmount(run.playerMaxHp);
    setRun(this, applyPlayerHpDelta(run, amount));
    this.resultText = `체력을 ${amount} 회복했다.`;
    this.mode = 'done';
    this.render();
  }

  private upgrade(card: CardInstance): void {
    const run = getRun(this);
    const def = getBaseDefinition(card);
    setRun(this, upgradeCardInDeck(run, card.uid));
    this.resultText = `"${def.name}" 카드를 강화했다.`;
    this.mode = 'done';
    this.render();
  }

  private leave(): void {
    setRun(this, completeCurrentFloor(getRun(this)));
    this.scene.start('MapScene');
  }
}
