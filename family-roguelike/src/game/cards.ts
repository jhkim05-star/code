export type CardId =
  | 'strike' | 'strikePlus' | 'guard' | 'guardPlus'
  | 'jab' | 'jabPlus' | 'heavyStrike' | 'heavyStrikePlus'
  | 'fortify' | 'fortifyPlus' | 'flurry' | 'flurryPlus'
  | 'counter' | 'counterPlus' | 'toxin' | 'toxinPlus'
  | 'catalyst' | 'catalystPlus'
  | 'remoteBounce' | 'remoteBouncePlus' | 'snackGuard' | 'snackGuardPlus'
  | 'blanketFlurry' | 'blanketFlurryPlus' | 'midnightToxin' | 'midnightToxinPlus';

export type CardRarity = 'starter' | 'common' | 'uncommon' | 'rare';
export type CardEffect = 'damage' | 'block' | 'flurry' | 'counter' | 'poison' | 'catalyst';

export interface CardDefinition {
  id: CardId;
  name: string;
  cost: number;
  kind: 'attack' | 'block' | 'skill';
  effect: CardEffect;
  value: number;
  bonus?: number;
  rarity: CardRarity;
  description: string;
  upgradeTo?: CardId;
}

export const CARDS: Record<CardId, CardDefinition> = {
  strike: { id: 'strike', name: '공격', cost: 1, kind: 'attack', effect: 'damage', value: 6, rarity: 'starter', description: '피해 6', upgradeTo: 'strikePlus' },
  strikePlus: { id: 'strikePlus', name: '공격+', cost: 1, kind: 'attack', effect: 'damage', value: 8, rarity: 'starter', description: '피해 8' },
  guard: { id: 'guard', name: '방어', cost: 1, kind: 'block', effect: 'block', value: 5, rarity: 'starter', description: '방어도 5', upgradeTo: 'guardPlus' },
  guardPlus: { id: 'guardPlus', name: '방어+', cost: 1, kind: 'block', effect: 'block', value: 7, rarity: 'starter', description: '방어도 7' },
  jab: { id: 'jab', name: '잽', cost: 0, kind: 'attack', effect: 'damage', value: 3, rarity: 'common', description: '피해 3', upgradeTo: 'jabPlus' },
  jabPlus: { id: 'jabPlus', name: '잽+', cost: 0, kind: 'attack', effect: 'damage', value: 5, rarity: 'common', description: '피해 5' },
  heavyStrike: { id: 'heavyStrike', name: '강공격', cost: 2, kind: 'attack', effect: 'damage', value: 12, rarity: 'common', description: '피해 12', upgradeTo: 'heavyStrikePlus' },
  heavyStrikePlus: { id: 'heavyStrikePlus', name: '강공격+', cost: 2, kind: 'attack', effect: 'damage', value: 16, rarity: 'common', description: '피해 16' },
  fortify: { id: 'fortify', name: '튼튼 방어', cost: 2, kind: 'block', effect: 'block', value: 11, rarity: 'common', description: '방어도 11', upgradeTo: 'fortifyPlus' },
  fortifyPlus: { id: 'fortifyPlus', name: '튼튼 방어+', cost: 2, kind: 'block', effect: 'block', value: 15, rarity: 'common', description: '방어도 15' },
  flurry: { id: 'flurry', name: '연속타', cost: 1, kind: 'attack', effect: 'flurry', value: 4, bonus: 3, rarity: 'uncommon', description: '피해 4 + 앞선 공격당 3', upgradeTo: 'flurryPlus' },
  flurryPlus: { id: 'flurryPlus', name: '연속타+', cost: 1, kind: 'attack', effect: 'flurry', value: 6, bonus: 4, rarity: 'uncommon', description: '피해 6 + 앞선 공격당 4' },
  counter: { id: 'counter', name: '받아치기', cost: 1, kind: 'block', effect: 'counter', value: 4, bonus: 5, rarity: 'uncommon', description: '방어 4 · 적 공격 후 반격 5', upgradeTo: 'counterPlus' },
  counterPlus: { id: 'counterPlus', name: '받아치기+', cost: 1, kind: 'block', effect: 'counter', value: 6, bonus: 8, rarity: 'uncommon', description: '방어 6 · 적 공격 후 반격 8' },
  toxin: { id: 'toxin', name: '독 바르기', cost: 1, kind: 'skill', effect: 'poison', value: 3, rarity: 'uncommon', description: '적 중독 3', upgradeTo: 'toxinPlus' },
  toxinPlus: { id: 'toxinPlus', name: '독 바르기+', cost: 1, kind: 'skill', effect: 'poison', value: 5, rarity: 'uncommon', description: '적 중독 5' },
  catalyst: { id: 'catalyst', name: '독 증폭', cost: 2, kind: 'skill', effect: 'catalyst', value: 2, rarity: 'rare', description: '적 중독 2배', upgradeTo: 'catalystPlus' },
  catalystPlus: { id: 'catalystPlus', name: '독 증폭+', cost: 1, kind: 'skill', effect: 'catalyst', value: 2, rarity: 'rare', description: '적 중독 2배' },
  remoteBounce: { id: 'remoteBounce', name: '리모컨 튕기기', cost: 1, kind: 'attack', effect: 'damage', value: 9, rarity: 'uncommon', description: '피해 9', upgradeTo: 'remoteBouncePlus' },
  remoteBouncePlus: { id: 'remoteBouncePlus', name: '리모컨 튕기기+', cost: 1, kind: 'attack', effect: 'damage', value: 13, rarity: 'uncommon', description: '피해 13' },
  snackGuard: { id: 'snackGuard', name: '간식 작전', cost: 1, kind: 'block', effect: 'block', value: 9, rarity: 'uncommon', description: '방어도 9', upgradeTo: 'snackGuardPlus' },
  snackGuardPlus: { id: 'snackGuardPlus', name: '간식 작전+', cost: 1, kind: 'block', effect: 'block', value: 13, rarity: 'uncommon', description: '방어도 13' },
  blanketFlurry: { id: 'blanketFlurry', name: '담요 연타', cost: 1, kind: 'attack', effect: 'flurry', value: 5, bonus: 4, rarity: 'uncommon', description: '피해 5 + 앞선 공격당 4', upgradeTo: 'blanketFlurryPlus' },
  blanketFlurryPlus: { id: 'blanketFlurryPlus', name: '담요 연타+', cost: 1, kind: 'attack', effect: 'flurry', value: 7, bonus: 5, rarity: 'uncommon', description: '피해 7 + 앞선 공격당 5' },
  midnightToxin: { id: 'midnightToxin', name: '한밤의 독', cost: 1, kind: 'skill', effect: 'poison', value: 4, rarity: 'rare', description: '적 중독 4', upgradeTo: 'midnightToxinPlus' },
  midnightToxinPlus: { id: 'midnightToxinPlus', name: '한밤의 독+', cost: 1, kind: 'skill', effect: 'poison', value: 7, rarity: 'rare', description: '적 중독 7' },
};

export const REWARD_POOL: readonly CardId[] = ['jab', 'heavyStrike', 'fortify', 'flurry', 'counter', 'toxin', 'catalyst'];
export const CHAPTER_REWARD_POOL: readonly CardId[] = [...REWARD_POOL, 'remoteBounce', 'snackGuard', 'blanketFlurry', 'midnightToxin'];

export const STARTER_DECK: readonly CardId[] = [
  'strike', 'guard', 'strike', 'guard', 'strike',
  'guard', 'strike', 'guard', 'strike', 'strike',
];
