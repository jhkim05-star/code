// 전투 화면. 규칙 계산은 하지 않는다 — combat.ts가 담당하고, 여기서는
// 화면 표시·입력·씬 전환만 한다.

import * as Phaser from 'phaser';
import { createCombatState, endTurn, playCard, type CombatState } from '../game/combat';
import { getEffectiveDefinition, type CardInstance } from '../game/cards';
import { describeEffects, describeStatuses } from '../game/effects';
import { describeIntent } from '../game/enemies';
import { completeCurrentFloor, grantCombatGold, saveBestFloor, type RunState } from '../game/run';
import { getSelectedNode } from '../game/run';
import { getRun, setRun } from './shared';
import { COLORS, LOGICAL_WIDTH, TEXT } from './theme';
import { makeButton, makeText } from './ui';

export class BattleScene extends Phaser.Scene {
  private state!: CombatState;
  private run!: RunState;
  private nodeType!: 'combat' | 'elite' | 'boss';
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    this.run = getRun(this);
    const node = getSelectedNode(this.run);
    this.nodeType = (node?.type as 'combat' | 'elite' | 'boss') ?? 'combat';
    this.state = createCombatState({
      deck: this.run.deck,
      playerHp: this.run.playerHp,
      playerMaxHp: this.run.playerMaxHp,
      enemyDefId: node?.enemyDefId ?? 'nagging_ghost',
    });
    this.root = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.root.removeAll(true);
    const s = this.state;
    const ongoing = s.status === 'ongoing';

    makeText(this, this.root, 24, 16, '플레이어', 18, TEXT.primary, true);
    makeText(this, this.root, 24, 40, `HP ${s.playerHp} / ${s.playerMaxHp}`, 18, TEXT.primary);
    makeText(this, this.root, 24, 62, `방어도 ${s.block}`, 15, s.block > 0 ? '#8fc7ff' : TEXT.muted);
    const playerStatusText = describeStatuses(s.statuses);
    if (playerStatusText) makeText(this, this.root, 24, 84, playerStatusText, 14, TEXT.gold);

    const enemyName = `${s.enemy.isBoss ? '👑 ' : s.enemy.isElite ? '☠️ ' : ''}${s.enemy.name}`;
    makeText(this, this.root, 936, 16, enemyName, 18, TEXT.primary, true, 1);
    makeText(this, this.root, 936, 40, `HP ${s.enemy.hp} / ${s.enemy.maxHp}`, 18, TEXT.primary, false, 1);
    makeText(this, this.root, 936, 62, `방어도 ${s.enemy.block}`, 15, s.enemy.block > 0 ? '#8fc7ff' : TEXT.muted, false, 1);
    const enemyStatusText = describeStatuses(s.enemy.statuses);
    if (enemyStatusText) makeText(this, this.root, 936, 84, enemyStatusText, 14, TEXT.gold, false, 1);
    makeText(this, this.root, 936, 106, `다음 행동: ${describeIntent(s.enemy)}`, 15, TEXT.danger, false, 1);

    makeText(this, this.root, LOGICAL_WIDTH / 2, 16, `턴 ${s.turnNumber}`, 15, TEXT.muted, false, 0.5);
    makeText(this, this.root, 24, 468, `에너지 ${s.energy} / ${s.maxEnergy}`, 22, TEXT.gold, true);
    makeText(
      this,
      this.root,
      24,
      346,
      `뽑을 카드 ${s.drawPile.length} · 버린 카드 ${s.discardPile.length} · 제외 ${s.exhaustPile.length}`,
      13,
      TEXT.muted,
    );

    this.renderHand();
    this.renderEndTurnButton();

    if (!ongoing) this.renderResultOverlay();
  }

  private renderHand(): void {
    const s = this.state;
    const cardWidth = 140;
    const cardHeight = 180;
    const gap = 16;
    const totalWidth = s.hand.length * cardWidth + Math.max(0, s.hand.length - 1) * gap;
    const startX = LOGICAL_WIDTH / 2 - totalWidth / 2;
    const cardY = 372;

    s.hand.forEach((card: CardInstance, i) => {
      const def = getEffectiveDefinition(card);
      const x = startX + i * (cardWidth + gap) + cardWidth / 2;
      const affordable = s.status === 'ongoing' && s.energy >= def.cost;

      const bg = this.add
        .rectangle(x, cardY, cardWidth, cardHeight, affordable ? COLORS.cardBg[def.type] : COLORS.cardBgDisabled)
        .setStrokeStyle(2, COLORS.rarityBorder[def.rarity]);
      this.root.add(bg);

      const typeIcon = def.type === 'attack' ? '⚔️' : def.type === 'skill' ? '🛡️' : '✨';
      makeText(this, this.root, x, cardY - cardHeight / 2 + 20, `${typeIcon} ${def.name}`, 17, '#ffffff', true, 0.5, 0.5);
      makeText(this, this.root, x - cardWidth / 2 + 16, cardY - cardHeight / 2 + 16, `${def.cost}`, 18, TEXT.gold, true, 0, 0.5);
      this.root.add(
        this.add
          .text(x, cardY + 4, describeEffects(def.effects), {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            color: TEXT.secondary,
            align: 'center',
            wordWrap: { width: cardWidth - 20 },
          })
          .setOrigin(0.5, 0),
      );

      if (affordable) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => bg.setFillStyle(0x2a3a63));
        bg.on('pointerout', () => bg.setFillStyle(COLORS.cardBg[def.type]));
        bg.on('pointerdown', () => {
          this.state = playCard(this.state, card.uid);
          this.render();
        });
      }
    });
  }

  private renderEndTurnButton(): void {
    const ongoing = this.state.status === 'ongoing';
    makeButton(
      this,
      this.root,
      880,
      468,
      140,
      56,
      '턴 종료',
      () => {
        this.state = endTurn(this.state);
        this.render();
      },
      { enabled: ongoing },
    );
  }

  private renderResultOverlay(): void {
    const won = this.state.status === 'won';
    this.root.add(this.add.rectangle(480, 270, 960, 540, 0x000000, 0.65));
    makeText(this, this.root, 480, 210, won ? '승리!' : '패배...', 44, '#ffffff', true, 0.5, 0.5);
    if (!won) {
      makeText(this, this.root, 480, 260, '여기까지가 이번 런이었다.', 16, TEXT.secondary, false, 0.5, 0.5);
    }

    makeButton(this, this.root, 480, 320, 220, 56, '계속하기', () => this.handleCombatEnd());
  }

  private handleCombatEnd(): void {
    let run: RunState = { ...this.run, playerHp: this.state.playerHp };

    if (this.state.status === 'won') {
      const grant = grantCombatGold(run, this.nodeType);
      run = completeCurrentFloor(grant.run);
      setRun(this, run);
      if (this.nodeType === 'boss') {
        this.scene.start('ChapterClearScene');
      } else {
        this.scene.start('RewardScene', { goldEarned: grant.amount });
      }
    } else {
      saveBestFloor(run.highestFloorReached);
      setRun(this, run);
      this.scene.start('RunEndScene');
    }
  }
}
