// 런 종료(패배) 화면.

import * as Phaser from 'phaser';
import { createNewRun, loadBestFloor } from '../game/run';
import { getRun, setRun } from './shared';
import { LOGICAL_WIDTH, TEXT } from './theme';
import { makeButton, makeText } from './ui';

export class RunEndScene extends Phaser.Scene {
  constructor() {
    super('RunEndScene');
  }

  create(): void {
    const run = getRun(this);
    const root = this.add.container(0, 0);

    makeText(this, root, LOGICAL_WIDTH / 2, 160, '쓰러졌다...', 40, TEXT.primary, true, 0.5, 0.5);
    makeText(
      this,
      root,
      LOGICAL_WIDTH / 2,
      220,
      `이번 런은 ${run.highestFloorReached}층까지 도달했다.`,
      18,
      TEXT.secondary,
      false,
      0.5,
      0.5,
    );
    makeText(this, root, LOGICAL_WIDTH / 2, 254, `최고 기록: ${loadBestFloor()}층`, 16, TEXT.gold, false, 0.5, 0.5);

    makeButton(this, root, LOGICAL_WIDTH / 2, 340, 220, 56, '새 런 시작', () => {
      setRun(this, createNewRun());
      this.scene.start('MapScene');
    });
  }
}
