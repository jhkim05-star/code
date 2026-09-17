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
