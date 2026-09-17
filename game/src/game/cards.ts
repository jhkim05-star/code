// Level 1 카드 정의. 화면(Phaser)과 무관한 순수 데이터/로직만 둔다.

export type CardEffect =
  | { type: 'damage'; amount: number }
  | { type: 'block'; amount: number };

export interface CardDefinition {
  id: 'attack' | 'defend';
  name: string;
  cost: number;
  description: string;
  effect: CardEffect;
}

export const CARD_LIBRARY: Record<CardDefinition['id'], CardDefinition> = {
  attack: {
    id: 'attack',
    name: '공격',
    cost: 1,
    description: '적에게 피해 6',
    effect: { type: 'damage', amount: 6 },
  },
  defend: {
    id: 'defend',
    name: '방어',
    cost: 1,
    description: '방어도 5 획득',
    effect: { type: 'block', amount: 5 },
  },
};

// 손패·드로우 더미·버린 더미를 오가는 카드 한 장. 같은 정의라도
// 인스턴스별로 uid가 달라야 손패에서 정확히 한 장만 구분해 낼 수 있다.
export interface CardInstance {
  uid: number;
  defId: CardDefinition['id'];
}

let uidCounter = 0;

export function createCardInstance(defId: CardDefinition['id']): CardInstance {
  uidCounter += 1;
  return { uid: uidCounter, defId };
}

export function getCardDefinition(card: CardInstance): CardDefinition {
  return CARD_LIBRARY[card.defId];
}

// Level 1 시작 덱: 공격 5장 + 방어 5장.
export function createStarterDeck(): CardInstance[] {
  const attacks = Array.from({ length: 5 }, () => createCardInstance('attack'));
  const defends = Array.from({ length: 5 }, () => createCardInstance('defend'));
  return [...attacks, ...defends];
}
