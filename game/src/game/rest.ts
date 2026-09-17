// "내 방" 휴식처. 체력 회복 또는 카드 강화 중 하나를 고른다.

import type { CardInstance } from './cards';
import { shuffle } from './rng';

export function restHealAmount(maxHp: number): number {
  return Math.round(maxHp * 0.3);
}

export function getUpgradeCandidates(deck: CardInstance[], count = 3): CardInstance[] {
  return shuffle(deck.filter((card) => !card.upgraded)).slice(0, count);
}
