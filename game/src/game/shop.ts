// "편의점" 상점. 카드 구매 + 카드 제거 서비스만 제공한다(장비/포션류는
// 이번 챕터 범위 밖 — IDEAS.md 참고).

import { getObtainableCardPool, type CardRarity } from './cards';
import { shuffle } from './rng';

const PRICE_BY_RARITY: Record<CardRarity, number> = {
  basic: 0,
  common: 40,
  uncommon: 65,
  rare: 95,
};

export interface ShopCardOffer {
  id: string;
  defId: string;
  price: number;
}

export interface ShopInventory {
  cards: ShopCardOffer[];
  removalPrice: number;
}

export function generateShopInventory(): ShopInventory {
  const pool = shuffle(getObtainableCardPool());
  const cards = pool.slice(0, 5).map((def, i) => ({
    id: `offer_${i}`,
    defId: def.id,
    price: PRICE_BY_RARITY[def.rarity],
  }));
  return { cards, removalPrice: 50 };
}
