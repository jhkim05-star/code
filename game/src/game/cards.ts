// "우리 집" 세계관의 카드 정의. Phaser를 참조하지 않는 순수 데이터/로직만 둔다.
// 메커니즘은 공격/방어/스킬/파워 + 희귀도 + 강화라는 익숙한 덱빌딩 로그라이크
// 문법을 그대로 따르고, 이름·세계관·소재로만 차별화한다.

import { describeEffects, scaleEffects, type CardEffectStep } from './effects';
import { pickRandom } from './rng';

export type CardType = 'attack' | 'skill' | 'power';
export type CardRarity = 'basic' | 'common' | 'uncommon' | 'rare';

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  rarity: CardRarity;
  exhaust: boolean; // true면 사용 후 이번 전투에서 버린 더미로 가지 않고 제외된다 (주로 파워 카드)
  effects: CardEffectStep[];
}

// 시작 덱 구성표. 각 항목은 [카드 id, 장수].
const STARTER_DECK: [string, number][] = [
  ['pillow_smash', 3],
  ['cushion_guard', 3],
  ['double_kick', 2],
  ['stern_glare', 2],
];

export const CARD_LIBRARY: Record<string, CardDefinition> = {
  // ── 기본 (시작 덱, 상점/보상에는 나오지 않음) ──────────────────────────
  pillow_smash: {
    id: 'pillow_smash',
    name: '베개 스매시',
    cost: 1,
    type: 'attack',
    rarity: 'basic',
    exhaust: false,
    effects: [{ type: 'damage', amount: 6 }],
  },
  cushion_guard: {
    id: 'cushion_guard',
    name: '쿠션 방어',
    cost: 1,
    type: 'skill',
    rarity: 'basic',
    exhaust: false,
    effects: [{ type: 'block', amount: 5 }],
  },
  double_kick: {
    id: 'double_kick',
    name: '이단 옆차기',
    cost: 1,
    type: 'attack',
    rarity: 'basic',
    exhaust: false,
    effects: [{ type: 'damage', amount: 3, hits: 2 }],
  },
  stern_glare: {
    id: 'stern_glare',
    name: '정색',
    cost: 1,
    type: 'skill',
    rarity: 'basic',
    exhaust: false,
    effects: [{ type: 'applyStatus', target: 'self', status: 'thorns', amount: 2 }],
  },

  // ── 일반 (common) ──────────────────────────────────────────────────
  tickle_rush: {
    id: 'tickle_rush',
    name: '간지럼 러시',
    cost: 2,
    type: 'attack',
    rarity: 'common',
    exhaust: false,
    effects: [{ type: 'damage', amount: 4, hits: 3 }],
  },
  broom_swing: {
    id: 'broom_swing',
    name: '빗자루 휘두르기',
    cost: 1,
    type: 'attack',
    rarity: 'common',
    exhaust: false,
    effects: [
      { type: 'damage', amount: 7 },
      { type: 'applyStatus', target: 'enemy', status: 'vulnerable', amount: 1 },
    ],
  },
  slipper_combo: {
    id: 'slipper_combo',
    name: '실내화 콤보',
    cost: 1,
    type: 'attack',
    rarity: 'common',
    exhaust: false,
    effects: [{ type: 'damage', amount: 4, hits: 2 }],
  },
  backslap_smash: {
    id: 'backslap_smash',
    name: '등짝 스매시',
    cost: 2,
    type: 'attack',
    rarity: 'common',
    exhaust: false,
    effects: [{ type: 'damage', amount: 12 }],
  },
  toy_sword_jab: {
    id: 'toy_sword_jab',
    name: '장난감칼 찌르기',
    cost: 1,
    type: 'attack',
    rarity: 'common',
    exhaust: false,
    effects: [
      { type: 'damage', amount: 5 },
      { type: 'applyStatus', target: 'enemy', status: 'weak', amount: 1 },
    ],
  },
  cross_arms: {
    id: 'cross_arms',
    name: '팔짱 끼기',
    cost: 1,
    type: 'skill',
    rarity: 'common',
    exhaust: false,
    effects: [
      { type: 'block', amount: 8 },
      { type: 'applyStatus', target: 'self', status: 'thorns', amount: 1 },
    ],
  },
  warm_up: {
    id: 'warm_up',
    name: '몸풀기',
    cost: 1,
    type: 'skill',
    rarity: 'common',
    exhaust: false,
    effects: [{ type: 'applyStatus', target: 'self', status: 'dexterity', amount: 2 }],
  },
  battle_cry: {
    id: 'battle_cry',
    name: '기합 넣기',
    cost: 1,
    type: 'skill',
    rarity: 'common',
    exhaust: false,
    effects: [{ type: 'applyStatus', target: 'self', status: 'strength', amount: 2 }],
  },
  cast_nagging: {
    id: 'cast_nagging',
    name: '잔소리 시전',
    cost: 1,
    type: 'skill',
    rarity: 'common',
    exhaust: false,
    effects: [{ type: 'applyStatus', target: 'enemy', status: 'poison', amount: 4 }],
  },
  glare: {
    id: 'glare',
    name: '째려보기',
    cost: 1,
    type: 'skill',
    rarity: 'common',
    exhaust: false,
    effects: [{ type: 'applyStatus', target: 'enemy', status: 'weak', amount: 2 }],
  },

  // ── 고급 (uncommon) ────────────────────────────────────────────────
  exploit_opening: {
    id: 'exploit_opening',
    name: '빈틈 노리기',
    cost: 1,
    type: 'skill',
    rarity: 'uncommon',
    exhaust: false,
    effects: [{ type: 'applyStatus', target: 'enemy', status: 'vulnerable', amount: 2 }],
  },
  toy_arrow_barrage: {
    id: 'toy_arrow_barrage',
    name: '장난감 화살 세례',
    cost: 2,
    type: 'attack',
    rarity: 'uncommon',
    exhaust: false,
    effects: [{ type: 'damage', amount: 3, hits: 4 }],
  },
  tumble_combo: {
    id: 'tumble_combo',
    name: '우당탕탕 콤보',
    cost: 2,
    type: 'attack',
    rarity: 'uncommon',
    exhaust: false,
    effects: [{ type: 'damage', amount: 5, bonusPerAttackPlayed: 3 }],
  },
  nagging_combo: {
    id: 'nagging_combo',
    name: '잔소리 연타',
    cost: 2,
    type: 'attack',
    rarity: 'uncommon',
    exhaust: false,
    effects: [
      { type: 'damage', amount: 6 },
      { type: 'applyStatus', target: 'enemy', status: 'poison', amount: 2 },
    ],
  },
  textbook_defense: {
    id: 'textbook_defense',
    name: '방어의 정석',
    cost: 2,
    type: 'skill',
    rarity: 'uncommon',
    exhaust: false,
    effects: [{ type: 'block', amount: 14 }],
  },
  reflexes: {
    id: 'reflexes',
    name: '반사 신경',
    cost: 1,
    type: 'skill',
    rarity: 'uncommon',
    exhaust: false,
    effects: [
      { type: 'block', amount: 6 },
      { type: 'draw', amount: 1 },
    ],
  },
  keep_nagging: {
    id: 'keep_nagging',
    name: '계속 잔소리',
    cost: 2,
    type: 'skill',
    rarity: 'uncommon',
    exhaust: false,
    effects: [
      { type: 'applyStatus', target: 'enemy', status: 'poison', amount: 7 },
      { type: 'draw', amount: 1 },
    ],
  },
  deep_breath: {
    id: 'deep_breath',
    name: '심호흡',
    cost: 1,
    type: 'skill',
    rarity: 'uncommon',
    exhaust: false,
    effects: [
      { type: 'gainEnergy', amount: 1 },
      { type: 'draw', amount: 1 },
    ],
  },
  blanket_shield: {
    id: 'blanket_shield',
    name: '이불 방패',
    cost: 2,
    type: 'skill',
    rarity: 'uncommon',
    exhaust: false,
    effects: [
      { type: 'block', amount: 12 },
      { type: 'applyStatus', target: 'self', status: 'dexterity', amount: 1 },
    ],
  },
  guardian_spirit: {
    id: 'guardian_spirit',
    name: '방패막이 정신',
    cost: 1,
    type: 'power',
    rarity: 'uncommon',
    exhaust: true,
    effects: [{ type: 'applyStatus', target: 'self', status: 'blockRegen', amount: 3 }],
  },

  // ── 희귀 (rare) ────────────────────────────────────────────────────
  nagging_haymaker: {
    id: 'nagging_haymaker',
    name: '잔소리 강펀치',
    cost: 3,
    type: 'attack',
    rarity: 'rare',
    exhaust: false,
    effects: [
      { type: 'damage', amount: 18 },
      { type: 'applyStatus', target: 'enemy', status: 'poison', amount: 3 },
    ],
  },
  fart_bomb: {
    id: 'fart_bomb',
    name: '방귀 폭탄',
    cost: 2,
    type: 'attack',
    rarity: 'rare',
    exhaust: false,
    effects: [
      { type: 'damage', amount: 2 },
      { type: 'applyStatus', target: 'enemy', status: 'poison', amount: 5 },
    ],
  },
  home_workout_routine: {
    id: 'home_workout_routine',
    name: '홈트 루틴',
    cost: 2,
    type: 'power',
    rarity: 'rare',
    exhaust: true,
    effects: [{ type: 'applyStatus', target: 'self', status: 'dexterityRegen', amount: 1 }],
  },
  grit: {
    id: 'grit',
    name: '근성',
    cost: 1,
    type: 'power',
    rarity: 'rare',
    exhaust: true,
    effects: [{ type: 'applyStatus', target: 'self', status: 'strengthRegen', amount: 1 }],
  },
  nagging_nature: {
    id: 'nagging_nature',
    name: '잔소리 체질',
    cost: 2,
    type: 'power',
    rarity: 'rare',
    exhaust: true,
    effects: [{ type: 'applyStatus', target: 'self', status: 'poisonAmplify', amount: 2 }],
  },
  firm_attitude: {
    id: 'firm_attitude',
    name: '완강한 태도',
    cost: 2,
    type: 'skill',
    rarity: 'rare',
    exhaust: false,
    effects: [
      { type: 'block', amount: 6 },
      { type: 'applyStatus', target: 'self', status: 'thorns', amount: 4 },
    ],
  },
};

export function getCardDescription(def: CardDefinition): string {
  return describeEffects(def.effects);
}

export function getUpgradedEffects(def: CardDefinition): CardEffectStep[] {
  return scaleEffects(def.effects);
}

// 손패·드로우 더미·버린 더미·제외 더미를 오가는 카드 한 장.
// uid는 인스턴스 식별용이고, upgraded는 강화 여부다(강화 시 수치만 커지고
// defId는 그대로 유지 — 별도의 "+" 카드 정의를 만들지 않고 배율로 계산한다).
export interface CardInstance {
  uid: number;
  defId: string;
  upgraded: boolean;
}

let uidCounter = 0;

export function createCardInstance(defId: string, upgraded = false): CardInstance {
  uidCounter += 1;
  return { uid: uidCounter, defId, upgraded };
}

export function getBaseDefinition(card: CardInstance): CardDefinition {
  return CARD_LIBRARY[card.defId];
}

// 카드 인스턴스의 "실제로 적용되는" 정의(강화 시 효과 수치가 커진 버전)를 만든다.
export function getEffectiveDefinition(card: CardInstance): CardDefinition {
  const base = getBaseDefinition(card);
  if (!card.upgraded) return base;
  return {
    ...base,
    name: `${base.name}+`,
    effects: getUpgradedEffects(base),
  };
}

export function createStarterDeck(): CardInstance[] {
  const deck: CardInstance[] = [];
  for (const [defId, count] of STARTER_DECK) {
    for (let i = 0; i < count; i++) deck.push(createCardInstance(defId));
  }
  return deck;
}

// 상점·보상 화면에서 뽑을 후보 목록(기본 카드 제외).
export function getObtainableCardPool(): CardDefinition[] {
  return Object.values(CARD_LIBRARY).filter((def) => def.rarity !== 'basic');
}

const REWARD_RARITY_WEIGHTS: [CardRarity, number][] = [
  ['common', 60],
  ['uncommon', 30],
  ['rare', 10],
];

function rollRewardRarity(): CardRarity {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const [rarity, weight] of REWARD_RARITY_WEIGHTS) {
    cumulative += weight;
    if (roll <= cumulative) return rarity;
  }
  return 'common';
}

// 전투 승리 보상으로 서로 다른 카드 N장을 희귀도 가중치로 뽑는다.
export function rollRewardCards(count = 3): CardDefinition[] {
  const pool = getObtainableCardPool();
  const picked: CardDefinition[] = [];
  const usedIds = new Set<string>();
  let guard = 0;

  while (picked.length < count && guard < 200) {
    guard += 1;
    const rarity = rollRewardRarity();
    const candidates = pool.filter((def) => def.rarity === rarity && !usedIds.has(def.id));
    if (candidates.length === 0) continue;
    const chosen = pickRandom(candidates);
    usedIds.add(chosen.id);
    picked.push(chosen);
  }

  return picked;
}

export const RARITY_LABELS: Record<CardRarity, string> = {
  basic: '기본',
  common: '일반',
  uncommon: '고급',
  rare: '희귀',
};

export const TYPE_ICONS: Record<CardType, string> = {
  attack: '⚔️',
  skill: '🛡️',
  power: '✨',
};
