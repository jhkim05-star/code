import * as Phaser from 'phaser';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create(): void {
    this.add.text(480, 205, '가족 로그라이크', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(480, 285, 'Level 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '32px',
      color: '#91b8ff',
    }).setOrigin(0.5);

    this.add.text(480, 340, 'Ready', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      color: '#cbd5e1',
    }).setOrigin(0.5);
  }
}
