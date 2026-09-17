// Level 1 적 정의. 지금은 매 턴 같은 공격만 반복하는 적 하나뿐이다.

export type EnemyIntent = { type: 'attack'; amount: number };

export interface EnemyDefinition {
  id: string;
  name: string;
  maxHp: number;
  getIntent: (turnNumber: number) => EnemyIntent;
}

export const ENEMY_LIBRARY: Record<string, EnemyDefinition> = {
  dummy: {
    id: 'dummy',
    name: '훈련 상대',
    maxHp: 40,
    getIntent: () => ({ type: 'attack', amount: 6 }),
  },
};

export interface EnemyState {
  defId: string;
  name: string;
  hp: number;
  maxHp: number;
  intent: EnemyIntent;
}

export function createEnemy(defId: keyof typeof ENEMY_LIBRARY = 'dummy'): EnemyState {
  const def = ENEMY_LIBRARY[defId];
  return {
    defId: def.id,
    name: def.name,
    hp: def.maxHp,
    maxHp: def.maxHp,
    intent: def.getIntent(1),
  };
}

export function advanceEnemyIntent(enemy: EnemyState, turnNumber: number): EnemyState {
  const def = ENEMY_LIBRARY[enemy.defId];
  return { ...enemy, intent: def.getIntent(turnNumber) };
}
