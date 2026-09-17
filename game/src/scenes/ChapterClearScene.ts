// 1장 클리어 화면: 보스를 쓰러뜨리면 여기로 온다.

import * as Phaser from 'phaser';
import { createNewRun, loadBestFloor, saveBestFloor } from '../game/run';
import { getRun, setRun } from './shared';
import { LOGICAL_WIDTH, TEXT } from './theme';
import { makeButton, makeText } from './ui';

export class ChapterClearScene extends Phaser.Scene {
  constructor() {
    super('ChapterClearScene');
  }

  create(): void {
    const run = getRun(this);
    saveBestFloor(run.highestFloorReached);
    const root = this.add.container(0, 0);

    makeText(this, root, LOGICAL_WIDTH / 2, 160, '🎉 1장 클리어!', 40, TEXT.primary, true, 0.5, 0.5);
    makeText(
      this,
      root,
      LOGICAL_WIDTH / 2,
      220,
      '정리정돈의 수호신을 쓰러뜨리고 "우리 집"을 정복했다.',
      17,
      TEXT.secondary,
      false,
      0.5,
      0.5,
    );
    makeText(this, root, LOGICAL_WIDTH / 2, 260, `최고 기록: ${loadBestFloor()}층`, 16, TEXT.gold, false, 0.5, 0.5);
    makeText(this, root, LOGICAL_WIDTH / 2, 300, '2장은 다음 업데이트에서 만납니다.', 14, TEXT.muted, false, 0.5, 0.5);

    makeButton(this, root, LOGICAL_WIDTH / 2, 380, 220, 56, '새 런 시작', () => {
      setRun(this, createNewRun());
      this.scene.start('MapScene');
    });
  }
}
