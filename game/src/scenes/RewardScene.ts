// 전투 승리 보상 화면: 얻은 용돈을 보여주고, 카드 3장 중 최대 1장을 고르게 한다.

import * as Phaser from 'phaser';
import { getCardDescription, rollRewardCards, type CardDefinition } from '../game/cards';
import { addCardToDeck } from '../game/run';
import { getRun, setRun } from './shared';
import { COLORS, LOGICAL_WIDTH, TEXT } from './theme';
import { makeButton, makeText, makeWrappedText } from './ui';

interface RewardSceneData {
  goldEarned: number;
}

export class RewardScene extends Phaser.Scene {
  private choices!: CardDefinition[];
  private goldEarned = 0;
  private picked = false;
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super('RewardScene');
  }

  create(data: RewardSceneData): void {
    this.goldEarned = data.goldEarned;
    this.choices = rollRewardCards(3);
    this.picked = false;
    this.root = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.root.removeAll(true);
    makeText(this, this.root, LOGICAL_WIDTH / 2, 32, '전투 승리!', 30, TEXT.primary, true, 0.5, 0);
    makeText(this, this.root, LOGICAL_WIDTH / 2, 70, `💰 용돈 +${this.goldEarned}`, 20, TEXT.gold, false, 0.5, 0);
    makeText(this, this.root, LOGICAL_WIDTH / 2, 102, '카드 한 장을 골라 덱에 추가하세요.', 15, TEXT.muted, false, 0.5, 0);

    const cardWidth = 220;
    const cardHeight = 260;
    const gap = 32;
    const totalWidth = this.choices.length * cardWidth + (this.choices.length - 1) * gap;
    const startX = LOGICAL_WIDTH / 2 - totalWidth / 2;
    const y = 300;

    this.choices.forEach((def, i) => {
      const x = startX + i * (cardWidth + gap) + cardWidth / 2;
      const bg = this.add
        .rectangle(x, y, cardWidth, cardHeight, COLORS.cardBg[def.type])
        .setStrokeStyle(3, COLORS.rarityBorder[def.rarity]);
      this.root.add(bg);

      const typeIcon = def.type === 'attack' ? '⚔️' : def.type === 'skill' ? '🛡️' : '✨';
      makeText(this, this.root, x, y - cardHeight / 2 + 26, `${typeIcon} ${def.name}`, 18, '#ffffff', true, 0.5, 0.5);
      makeText(this, this.root, x, y - cardHeight / 2 + 54, `비용 ${def.cost}`, 14, TEXT.gold, false, 0.5, 0.5);
      makeWrappedText(this, this.root, x, y - 20, getCardDescription(def), 14, TEXT.secondary, cardWidth - 24, 0.5, 0);

      makeButton(this, this.root, x, y + cardHeight / 2 - 28, cardWidth - 40, 44, '선택', () => this.pick(def));
    });

    makeButton(this, this.root, LOGICAL_WIDTH / 2, y + cardHeight / 2 + 46, 160, 40, '건너뛰기', () => this.continue(), {
      color: 0x384766,
      hoverColor: 0x445686,
    });
  }

  private pick(def: CardDefinition): void {
    if (this.picked) return;
    this.picked = true;
    setRun(this, addCardToDeck(getRun(this), def.id));
    this.continue();
  }

  private continue(): void {
    this.scene.start('MapScene');
  }
}
