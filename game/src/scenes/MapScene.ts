// 맵 화면: 현재 층에서 고를 수 있는 선택지를 보여주고, 고른 노드에 맞는
// 씬(전투/사건/휴식/상점/보스)으로 넘어간다.

import * as Phaser from 'phaser';
import { CHAPTER1_FLOOR_COUNT } from '../game/map';
import { getCurrentFloorOptions, loadBestFloor, selectNode, type RunState } from '../game/run';
import { ENEMY_LIBRARY } from '../game/enemies';
import { NODE_TYPE_ICONS, NODE_TYPE_LABELS, type MapNode } from '../game/map';
import { getRun, setRun } from './shared';
import { COLORS, LOGICAL_WIDTH, TEXT } from './theme';
import { makeButton, makeText } from './ui';

export class MapScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super('MapScene');
  }

  create(): void {
    this.root = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.root.removeAll(true);
    const run = getRun(this);
    const floorNumber = run.currentFloorIndex + 2; // 다음에 도전할 층(1-based)
    const options = getCurrentFloorOptions(run);

    makeText(this, this.root, LOGICAL_WIDTH / 2, 20, '1장. 우리 집', 24, TEXT.primary, true, 0.5, 0);
    makeText(
      this,
      this.root,
      LOGICAL_WIDTH / 2,
      50,
      `${floorNumber} / ${CHAPTER1_FLOOR_COUNT}층 · 최고 기록 ${loadBestFloor()}층`,
      15,
      TEXT.muted,
      false,
      0.5,
      0,
    );

    makeText(this, this.root, 24, 20, `❤️ HP ${run.playerHp} / ${run.playerMaxHp}`, 18, TEXT.primary, true);
    makeText(this, this.root, 24, 44, `💰 용돈 ${run.gold}`, 16, TEXT.gold);
    makeText(this, this.root, 24, 66, `🗂️ 덱 ${run.deck.length}장`, 16, TEXT.muted);

    this.renderOptions(options, run);
  }

  private renderOptions(options: MapNode[], run: RunState): void {
    const cardWidth = 220;
    const cardHeight = 260;
    const gap = 32;
    const totalWidth = options.length * cardWidth + (options.length - 1) * gap;
    const startX = LOGICAL_WIDTH / 2 - totalWidth / 2;
    const y = 320;

    options.forEach((node, i) => {
      const x = startX + i * (cardWidth + gap) + cardWidth / 2;
      const bg = this.add
        .rectangle(x, y, cardWidth, cardHeight, COLORS.nodeType[node.type])
        .setStrokeStyle(2, COLORS.panelBorder);
      this.root.add(bg);

      makeText(this, this.root, x, y - cardHeight / 2 + 30, NODE_TYPE_ICONS[node.type], 40, TEXT.primary, false, 0.5, 0.5);
      makeText(
        this,
        this.root,
        x,
        y - cardHeight / 2 + 80,
        NODE_TYPE_LABELS[node.type],
        22,
        TEXT.primary,
        true,
        0.5,
        0.5,
      );

      if (node.enemyDefId) {
        const enemyDef = ENEMY_LIBRARY[node.enemyDefId];
        makeText(this, this.root, x, y - cardHeight / 2 + 112, enemyDef.name, 16, TEXT.secondary, false, 0.5, 0.5);
        makeText(this, this.root, x, y - cardHeight / 2 + 134, `HP ${enemyDef.maxHp}`, 14, TEXT.muted, false, 0.5, 0.5);
      } else if (node.type === 'event') {
        makeText(this, this.root, x, y - cardHeight / 2 + 112, '무슨 일이 생길까?', 14, TEXT.muted, false, 0.5, 0.5);
      } else if (node.type === 'rest') {
        makeText(this, this.root, x, y - cardHeight / 2 + 112, '체력 회복 또는 카드 강화', 14, TEXT.muted, false, 0.5, 0.5);
      } else if (node.type === 'shop') {
        makeText(this, this.root, x, y - cardHeight / 2 + 112, '카드 구매 · 카드 정리', 14, TEXT.muted, false, 0.5, 0.5);
      }

      makeButton(this, this.root, x, y + cardHeight / 2 - 30, cardWidth - 40, 44, '선택', () => {
        this.selectNode(node);
      });
    });
  }

  // 클릭 시점의 최신 run을 다시 읽어서 반영한다(렌더 시점에 캡처해 둔 run을
  // 그대로 쓰면, 그 사이 registry가 바뀌었을 때 오래된 값으로 덮어써 버린다).
  private selectNode(node: MapNode): void {
    setRun(this, selectNode(getRun(this), node.id));
    switch (node.type) {
      case 'combat':
      case 'elite':
      case 'boss':
        this.scene.start('BattleScene');
        break;
      case 'event':
        this.scene.start('EventScene');
        break;
      case 'rest':
        this.scene.start('RestScene');
        break;
      case 'shop':
        this.scene.start('ShopScene');
        break;
    }
  }
}
