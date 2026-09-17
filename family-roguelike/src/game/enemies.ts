export interface EnemyDefinition {
  name: string;
  maxHp: number;
  attack: number;
  pattern?: readonly EnemyAction[];
}

export type EnemyAction = { type: 'attack' | 'block' | 'power'; value: number };

export function enemyAction(enemy: Readonly<EnemyDefinition>, turn: number): EnemyAction {
  return enemy.pattern?.[(turn - 1) % enemy.pattern.length] ?? { type: 'attack', value: enemy.attack };
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

export type ChapterEnemyId = 'sock' | 'dust' | 'snack' | 'remote' | 'toyKnight' | 'vacuum' | 'king';

export const CHAPTER_ENEMIES: Record<ChapterEnemyId, Readonly<EnemyDefinition>> = {
  sock: { name: '양말 도둑', maxHp: 18, attack: 4, pattern: [{ type: 'attack', value: 4 }, { type: 'block', value: 5 }, { type: 'attack', value: 6 }] },
  dust: { name: '먼지 구름', maxHp: 22, attack: 5, pattern: [{ type: 'attack', value: 5 }, { type: 'power', value: 1 }, { type: 'attack', value: 6 }] },
  snack: { name: '간식 파수꾼', maxHp: 26, attack: 6, pattern: [{ type: 'block', value: 7 }, { type: 'attack', value: 7 }, { type: 'attack', value: 5 }] },
  remote: { name: '리모컨 그림자', maxHp: 29, attack: 6, pattern: [{ type: 'attack', value: 6 }, { type: 'attack', value: 8 }, { type: 'block', value: 8 }] },
  toyKnight: { name: '장난감 기사', maxHp: 43, attack: 8, pattern: [{ type: 'block', value: 9 }, { type: 'attack', value: 9 }, { type: 'power', value: 2 }, { type: 'attack', value: 10 }] },
  vacuum: { name: '진공 괴수', maxHp: 48, attack: 8, pattern: [{ type: 'attack', value: 8 }, { type: 'power', value: 2 }, { type: 'attack', value: 10 }, { type: 'block', value: 8 }] },
  king: { name: '잠꾸러기 왕', maxHp: 90, attack: 9, pattern: [{ type: 'attack', value: 9 }, { type: 'block', value: 11 }, { type: 'attack', value: 13 }, { type: 'power', value: 2 }, { type: 'attack', value: 10 }] },
};
