import * as Phaser from 'phaser';
import { MapScene } from './scenes/MapScene';
import { BattleScene } from './scenes/BattleScene';
import { RewardScene } from './scenes/RewardScene';
import { EventScene } from './scenes/EventScene';
import { RestScene } from './scenes/RestScene';
import { ShopScene } from './scenes/ShopScene';
import { ChapterClearScene } from './scenes/ChapterClearScene';
import { RunEndScene } from './scenes/RunEndScene';
import { createNewRun } from './game/run';
import './styles.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#0d1526',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MapScene, BattleScene, RewardScene, EventScene, RestScene, ShopScene, ChapterClearScene, RunEndScene],
};

const game = new Phaser.Game(config);
game.registry.set('run', createNewRun());

// 자동화 테스트/디버깅용. 게임 규칙에는 전혀 관여하지 않는다.
if (typeof window !== 'undefined') {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
