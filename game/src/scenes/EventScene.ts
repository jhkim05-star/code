// 사건(이벤트) 화면: 선택지를 고르면 결과 문구를 보여주고 맵으로 돌아간다.

import * as Phaser from 'phaser';
import { EVENT_LIBRARY, type EventChoice } from '../game/events';
import { completeCurrentFloor, getSelectedNode } from '../game/run';
import { getRun, setRun } from './shared';
import { LOGICAL_WIDTH, TEXT } from './theme';
import { makeButton, makeText, makeWrappedText } from './ui';

export class EventScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;
  private resultText: string | null = null;

  constructor() {
    super('EventScene');
  }

  create(): void {
    this.resultText = null;
    this.root = this.add.container(0, 0);
    this.render();
  }

  private getEvent() {
    const node = getSelectedNode(getRun(this));
    return EVENT_LIBRARY[node?.eventId ?? 'fridge_raid'];
  }

  private render(): void {
    this.root.removeAll(true);
    const event = this.getEvent();

    makeText(this, this.root, LOGICAL_WIDTH / 2, 60, `❓ ${event.title}`, 28, TEXT.primary, true, 0.5, 0.5);
    makeWrappedText(this, this.root, LOGICAL_WIDTH / 2, 110, event.description, 17, TEXT.secondary, 640, 0.5, 0);

    if (this.resultText) {
      makeWrappedText(this, this.root, LOGICAL_WIDTH / 2, 260, this.resultText, 18, TEXT.gold, 640, 0.5, 0);
      makeButton(this, this.root, LOGICAL_WIDTH / 2, 400, 200, 52, '계속하기', () => this.leave());
      return;
    }

    const choices = event.choices;
    const gap = 24;
    const buttonWidth = 420;
    const startY = 220;
    choices.forEach((choice, i) => {
      makeButton(
        this,
        this.root,
        LOGICAL_WIDTH / 2,
        startY + i * (56 + gap),
        buttonWidth,
        56,
        choice.label,
        () => this.choose(choice),
      );
    });
  }

  private choose(choice: EventChoice): void {
    const result = choice.apply(getRun(this));
    setRun(this, result.run);
    this.resultText = result.resultText;
    this.render();
  }

  private leave(): void {
    setRun(this, completeCurrentFloor(getRun(this)));
    this.scene.start('MapScene');
  }
}
