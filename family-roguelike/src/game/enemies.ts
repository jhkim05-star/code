export interface EnemyDefinition {
  name: string;
  maxHp: number;
  attack: number;
}

export const TRAINING_ENEMY: Readonly<EnemyDefinition> = {
  name: '연습 상대',
  maxHp: 30,
  attack: 6,
};

export const FLOOR_ENEMIES: readonly Readonly<EnemyDefinition>[] = [
  { name: '복도 장난꾸러기', maxHp: 16, attack: 4 },
  { name: '간식 지킴이', maxHp: 20, attack: 5 },
  { name: '리모컨 수호자', maxHp: 24, attack: 5 },
  { name: '소파 점령자', maxHp: 27, attack: 6 },
  { name: '최종 보스 · 잠꾸러기 왕', maxHp: 42, attack: 7 },
];
