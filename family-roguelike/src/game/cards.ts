export type CardId = 'strike' | 'guard' | 'jab' | 'heavyStrike' | 'fortify';

export interface CardDefinition {
  id: CardId;
  name: string;
  cost: number;
  kind: 'attack' | 'block';
  value: number;
  description: string;
}

export const CARDS: Record<CardId, CardDefinition> = {
  strike: { id: 'strike', name: '공격', cost: 1, kind: 'attack', value: 6, description: '적에게 피해 6' },
  guard: { id: 'guard', name: '방어', cost: 1, kind: 'block', value: 5, description: '방어도 5 획득' },
  jab: { id: 'jab', name: '잽', cost: 0, kind: 'attack', value: 3, description: '적에게 피해 3' },
  heavyStrike: { id: 'heavyStrike', name: '강공격', cost: 2, kind: 'attack', value: 12, description: '적에게 피해 12' },
  fortify: { id: 'fortify', name: '튼튼 방어', cost: 2, kind: 'block', value: 11, description: '방어도 11 획득' },
};

export const REWARD_CARDS: readonly CardId[] = ['jab', 'heavyStrike', 'fortify'];

// A small fixed starter deck. The order is shuffled at the start of each battle.
export const STARTER_DECK: readonly CardId[] = [
  'strike', 'guard', 'strike', 'guard', 'strike',
  'guard', 'strike', 'guard', 'strike', 'strike',
];
