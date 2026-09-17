// 여러 씬이 공유하는 아주 작은 UI 헬퍼(텍스트/버튼). 화면 로직만 다루고
// 게임 규칙은 절대 참조하지 않는다.

import * as Phaser from 'phaser';
import { COLORS } from './theme';

export function makeText(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container | null,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string,
  bold = false,
  originX = 0,
  originY = 0,
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, value, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? 'bold' : 'normal',
      align: 'center',
    })
    .setOrigin(originX, originY);
  if (container) container.add(t);
  return t;
}

export function makeWrappedText(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container | null,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string,
  wrapWidth: number,
  originX = 0.5,
  originY = 0,
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, value, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${size}px`,
      color,
      align: 'center',
      wordWrap: { width: wrapWidth },
    })
    .setOrigin(originX, originY);
  if (container) container.add(t);
  return t;
}

export interface ButtonOptions {
  enabled?: boolean;
  color?: number;
  hoverColor?: number;
  disabledColor?: number;
  fontSize?: number;
}

export function makeButton(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container | null,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: ButtonOptions = {},
): { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } {
  const enabled = opts.enabled ?? true;
  const baseColor = enabled ? opts.color ?? COLORS.button : opts.disabledColor ?? COLORS.buttonDisabled;
  const bg = scene.add.rectangle(x, y, w, h, baseColor).setStrokeStyle(2, 0xffffff, 0.2);
  const labelText = makeText(scene, null, x, y, label, opts.fontSize ?? 20, '#ffffff', true, 0.5, 0.5);
  if (container) container.add([bg, labelText]);

  if (enabled) {
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(opts.hoverColor ?? COLORS.buttonHover));
    bg.on('pointerout', () => bg.setFillStyle(opts.color ?? COLORS.button));
    bg.on('pointerdown', onClick);
  }

  return { bg, label: labelText };
}
