export type CardId = 'strike' | 'guard';

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
};

// Fixed starter deck for the first playable battle; no deck editing yet.
export const STARTER_DECK: readonly CardId[] = [
  'strike', 'guard', 'strike', 'guard', 'strike',
  'guard', 'strike', 'guard', 'strike', 'strike',
];
