// 편의점(상점) 화면: 카드 구매 + 카드 정리(제거) 서비스.

import * as Phaser from 'phaser';
import { CARD_LIBRARY, getCardDescription, type CardInstance } from '../game/cards';
import { generateShopInventory, type ShopCardOffer, type ShopInventory } from '../game/shop';
import { addCardToDeck, completeCurrentFloor, removeCardFromDeck, spendGold, type RunState } from '../game/run';
import { getRun, setRun } from './shared';
import { COLORS, LOGICAL_WIDTH, TEXT } from './theme';
import { makeButton, makeText, makeWrappedText } from './ui';

type Mode = 'main' | 'removePick';

export class ShopScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private inventory!: ShopInventory;
  private boughtOfferIds = new Set<string>();
  private mode: Mode = 'main';

  constructor() {
    super('ShopScene');
  }

  create(): void {
    this.inventory = generateShopInventory();
    this.boughtOfferIds = new Set();
    this.mode = 'main';
    this.root = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.root.removeAll(true);
    const run = getRun(this);

    makeText(this, this.root, LOGICAL_WIDTH / 2, 24, '🏪 편의점', 26, TEXT.primary, true, 0.5, 0);
    makeText(this, this.root, LOGICAL_WIDTH / 2, 56, `💰 용돈 ${run.gold}`, 18, TEXT.gold, false, 0.5, 0);

    if (this.mode === 'removePick') {
      this.renderRemovePick(run);
      return;
    }

    this.renderOffers(run);

    makeButton(
      this,
      this.root,
      LOGICAL_WIDTH / 2 - 130,
      470,
      240,
      44,
      `카드 정리 (${this.inventory.removalPrice})`,
      () => {
        this.mode = 'removePick';
        this.render();
      },
      { enabled: run.gold >= this.inventory.removalPrice && run.deck.length > 0 },
    );
    makeButton(this, this.root, LOGICAL_WIDTH / 2 + 130, 470, 200, 44, '나가기', () => this.leave());
  }

  private renderOffers(run: RunState): void {
    const offers = this.inventory.cards.filter((offer) => !this.boughtOfferIds.has(offer.id));
    const cardWidth = 170;
    const cardHeight = 220;
    const gap = 16;
    const totalWidth = offers.length * cardWidth + Math.max(0, offers.length - 1) * gap;
    const startX = LOGICAL_WIDTH / 2 - totalWidth / 2;
    const y = 250;

    if (offers.length === 0) {
      makeText(this, this.root, LOGICAL_WIDTH / 2, y, '더 살 수 있는 카드가 없습니다.', 16, TEXT.muted, false, 0.5, 0.5);
      return;
    }

    offers.forEach((offer, i) => {
      const def = CARD_LIBRARY[offer.defId];
      const x = startX + i * (cardWidth + gap) + cardWidth / 2;
      const affordable = run.gold >= offer.price;
      const bg = this.add
        .rectangle(x, y, cardWidth, cardHeight, affordable ? COLORS.cardBg[def.type] : COLORS.cardBgDisabled)
        .setStrokeStyle(3, COLORS.rarityBorder[def.rarity]);
      this.root.add(bg);

      makeText(this, this.root, x, y - cardHeight / 2 + 22, def.name, 15, '#ffffff', true, 0.5, 0.5);
      makeWrappedText(this, this.root, x, y - 30, getCardDescription(def), 13, TEXT.secondary, cardWidth - 20, 0.5, 0);
      makeButton(
        this,
        this.root,
        x,
        y + cardHeight / 2 - 26,
        cardWidth - 30,
        38,
        `💰 ${offer.price}`,
        () => this.buy(offer),
        { enabled: affordable },
      );
    });
  }

  private renderRemovePick(run: RunState): void {
    makeText(this, this.root, LOGICAL_WIDTH / 2, 100, '정리할 카드를 고르세요.', 17, TEXT.secondary, false, 0.5, 0);

    const cardWidth = 130;
    const cardHeight = 150;
    const gap = 12;
    const perRow = 6;
    const startX = LOGICAL_WIDTH / 2 - (Math.min(run.deck.length, perRow) * (cardWidth + gap) - gap) / 2;

    run.deck.forEach((card, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = startX + col * (cardWidth + gap) + cardWidth / 2;
      const y = 150 + row * (cardHeight + gap);
      const def = CARD_LIBRARY[card.defId];
      const bg = this.add
        .rectangle(x, y, cardWidth, cardHeight, COLORS.cardBg[def.type])
        .setStrokeStyle(2, COLORS.rarityBorder[def.rarity])
        .setInteractive({ useHandCursor: true });
      this.root.add(bg);
      makeText(this, this.root, x, y - cardHeight / 2 + 18, `${def.name}${card.upgraded ? '+' : ''}`, 13, '#ffffff', true, 0.5, 0.5);
      bg.on('pointerover', () => bg.setFillStyle(0x2a3a63));
      bg.on('pointerout', () => bg.setFillStyle(COLORS.cardBg[def.type]));
      bg.on('pointerdown', () => this.remove(card));
    });

    makeButton(this, this.root, LOGICAL_WIDTH / 2, 470, 160, 40, '뒤로', () => {
      this.mode = 'main';
      this.render();
    });
  }

  private buy(offer: ShopCardOffer): void {
    const run = getRun(this);
    if (run.gold < offer.price) return;
    const afterSpend = spendGold(run, offer.price);
    if (!afterSpend) return;
    this.boughtOfferIds.add(offer.id);
    setRun(this, addCardToDeck(afterSpend, offer.defId));
    this.render();
  }

  private remove(card: CardInstance): void {
    const run = getRun(this);
    if (run.gold < this.inventory.removalPrice) return;
    const afterSpend = spendGold(run, this.inventory.removalPrice);
    if (!afterSpend) return;
    setRun(this, removeCardFromDeck(afterSpend, card.uid));
    this.mode = 'main';
    this.render();
  }

  private leave(): void {
    setRun(this, completeCurrentFloor(getRun(this)));
    this.scene.start('MapScene');
  }
}
