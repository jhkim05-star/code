// 씬들이 Phaser Registry를 통해 RunState를 주고받기 위한 아주 얇은 래퍼.
// combat.ts/run.ts 쪽 로직은 Phaser를 모르므로, "지금 진행 중인 런"이라는
// 개념은 여기(화면 계층)에서만 다룬다.

import * as Phaser from 'phaser';
import type { RunState } from '../game/run';

const RUN_KEY = 'run';

export function getRun(scene: Phaser.Scene): RunState {
  return scene.game.registry.get(RUN_KEY) as RunState;
}

export function setRun(scene: Phaser.Scene, run: RunState): void {
  scene.game.registry.set(RUN_KEY, run);
}
