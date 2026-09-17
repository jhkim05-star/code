import { CARDS, CHAPTER_REWARD_POOL, STARTER_DECK, type CardId } from './cards.ts';
import { createBattle, endTurn, playCard, PLAYER_MAX_HP, type BattleState } from './combat.ts';
import { CHAPTER_ENEMIES, type ChapterEnemyId } from './enemies.ts';
import { rollRewards, type DeckAction } from './run.ts';

type Random = () => number;
export type NodeKind = 'battle' | 'elite' | 'event' | 'rest' | 'shop' | 'boss';
export type ChapterPhase = 'map' | 'battle' | 'reward' | 'event' | 'rest' | 'shop' | 'manage' | 'won' | 'lost';
export type EventId = 'remote' | 'fridge' | 'bag' | 'note';

export interface MapNode { kind: NodeKind; id: ChapterEnemyId | EventId | null }
export interface EventChoice { label: string; hp?: number; gold?: number; card?: CardId }
export interface EventDefinition { title: string; story: string; choices: readonly [EventChoice, EventChoice] }

export const CHAPTER_NAME = 'Chapter 1 · 밤의 거실';
export const CHAPTER_FLOORS = 12;
export const EVENTS: Record<EventId, EventDefinition> = {
  remote: { title: '사라진 리모컨', story: '소파 밑에서 반짝이는 신호가 들립니다. 누구의 손에 먼저 닿을까요?', choices: [
    { label: '조심히 뒤져 금화 20', gold: 20 }, { label: '과감히 잡기 · 체력 -3 · 리모컨 카드', hp: -3, card: 'remoteBounce' },
  ] },
  fridge: { title: '냉장고의 불빛', story: '모두 잠든 밤, 냉장고가 조용히 길을 비춥니다.', choices: [
    { label: '간식 먹기 · 체력 +9', hp: 9 }, { label: '간식 챙기기 · 방어 카드', card: 'snackGuard' },
  ] },
  bag: { title: '여행 가방의 틈', story: '지난 여행의 담요가 아직도 작은 모험을 기억합니다.', choices: [
    { label: '주머니 뒤지기 · 금화 16', gold: 16 }, { label: '담요 두르기 · 체력 -4 · 연타 카드', hp: -4, card: 'blanketFlurry' },
  ] },
  note: { title: '가족의 쪽지', story: '“걱정 말고 다녀와.” 삐뚤빼뚤한 글씨가 힘을 줍니다.', choices: [
    { label: '쪽지 간직하기 · 체력 +7', hp: 7 }, { label: '비밀 문장 읽기 · 체력 -5 · 독 카드', hp: -5, card: 'midnightToxin' },
  ] },
};

const ROW_KINDS: readonly (readonly NodeKind[])[] = [
  ['battle'], ['battle', 'event'], ['battle', 'shop', 'battle'], ['rest', 'battle'],
  ['elite', 'event', 'battle'], ['battle', 'shop'], ['event', 'battle', 'rest'],
  ['battle', 'elite'], ['shop', 'battle', 'event'], ['rest', 'battle'],
  ['elite', 'battle', 'event'], ['boss'],
];
const NORMAL_ENEMIES: readonly ChapterEnemyId[] = ['sock', 'dust', 'snack', 'remote'];
const ELITE_ENEMIES: readonly ChapterEnemyId[] = ['toyKnight', 'vacuum'];
const EVENT_IDS: readonly EventId[] = ['remote', 'fridge', 'bag', 'note'];

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function generateMap(random: Random = Math.random): MapNode[][] {
  return ROW_KINDS.map((kinds, row) => {
    const shuffled = [...kinds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(random() * (i + 1)));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.map(kind => ({
      kind,
      id: kind === 'battle' ? pick(NORMAL_ENEMIES, random)
        : kind === 'elite' ? pick(ELITE_ENEMIES, random)
          : kind === 'event' ? pick(EVENT_IDS, random)
            : kind === 'boss' ? 'king' : null,
    }));
  });
}

export function canTravel(map: readonly (readonly MapNode[])[], path: readonly number[], nextIndex: number): boolean {
  const row = path.length;
  if (row >= map.length || !Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= map[row].length) return false;
  if (row === 0 || map[row].length === 1 || map[row - 1].length === 1) return true;
  return Math.abs(path[row - 1] - nextIndex) <= 1;
}

export interface ChapterState {
  phase: ChapterPhase;
  map: MapNode[][];
  path: number[];
  bestFloor: number;
  playerHp: number;
  maxHp: number;
  gold: number;
  deck: CardId[];
  battle: BattleState | null;
  rewardOptions: CardId[];
  deckAction: DeckAction | null;
  afterManage: 'map' | 'shop';
  manageSource: 'reward' | 'rest' | 'shop';
  eventId: EventId | null;
  shopStock: (CardId | null)[];
  shopHealed: boolean;
  shopRemoved: boolean;
  lastResult: string;
}

export function startChapter(bestFloor = 0, random: Random = Math.random): ChapterState {
  return {
    phase: 'map', map: generateMap(random), path: [], bestFloor: Math.max(0, Math.min(CHAPTER_FLOORS, bestFloor)),
    playerHp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, gold: 20, deck: [...STARTER_DECK], battle: null,
    rewardOptions: [], deckAction: null, afterManage: 'map', manageSource: 'reward', eventId: null,
    shopStock: [], shopHealed: false, shopRemoved: false, lastResult: '담요 망토를 두르고 출발합니다.',
  };
}

export function enterNode(current: ChapterState, index: number, random: Random = Math.random): ChapterState {
  if (current.phase !== 'map' || !canTravel(current.map, current.path, index)) return current;
  const row = current.path.length;
  const node = current.map[row][index];
  const next = { ...current, path: [...current.path, index], bestFloor: Math.max(current.bestFloor, row + 1) };
  if (node.kind === 'battle' || node.kind === 'elite' || node.kind === 'boss') {
    const enemy = CHAPTER_ENEMIES[node.id as ChapterEnemyId];
    return { ...next, phase: 'battle', battle: createBattle({ enemy, playerHp: current.playerHp, deck: current.deck }, random), lastResult: `${enemy.name} 등장!` };
  }
  if (node.kind === 'event') return { ...next, phase: 'event', eventId: node.id as EventId };
  if (node.kind === 'rest') return { ...next, phase: 'rest' };
  return { ...next, phase: 'shop', shopStock: rollRewards(random, CHAPTER_REWARD_POOL), shopHealed: false, shopRemoved: false };
}

function finishBattle(current: ChapterState, battle: BattleState, random: Random): ChapterState {
  if (battle === current.battle) return current;
  if (battle.phase === 'lost') return { ...current, phase: 'lost', playerHp: 0, battle };
  if (battle.phase === 'won') {
    const node = current.map[current.path.length - 1][current.path.at(-1)!];
    if (node.kind === 'boss') return { ...current, phase: 'won', playerHp: battle.playerHp, battle, lastResult: '잠꾸러기 왕을 깨우고 거실에 아침이 왔습니다!' };
    const gold = node.kind === 'elite' ? 28 : 14;
    return { ...current, phase: 'reward', playerHp: battle.playerHp, gold: current.gold + gold, battle,
      rewardOptions: rollRewards(random, CHAPTER_REWARD_POOL), lastResult: `${node.kind === 'elite' ? '강적' : '전투'} 승리 · 금화 ${gold} 획득` };
  }
  return { ...current, playerHp: battle.playerHp, battle };
}

export function playChapterCard(current: ChapterState, handIndex: number, random: Random = Math.random): ChapterState {
  if (current.phase !== 'battle' || !current.battle) return current;
  return finishBattle(current, playCard(current.battle, handIndex), random);
}

export function endChapterTurn(current: ChapterState, random: Random = Math.random): ChapterState {
  if (current.phase !== 'battle' || !current.battle) return current;
  return finishBattle(current, endTurn(current.battle, random), random);
}

export function chooseChapterReward(current: ChapterState, index: number): ChapterState {
  if (current.phase !== 'reward' || !Number.isInteger(index) || index < 0 || index >= current.rewardOptions.length) return current;
  return { ...current, phase: 'map', deck: [...current.deck, current.rewardOptions[index]], rewardOptions: [], lastResult: `${CARDS[current.rewardOptions[index]].name} 카드를 얻었습니다.` };
}

export function skipChapterReward(current: ChapterState): ChapterState {
  return current.phase === 'reward' ? { ...current, phase: 'map', rewardOptions: [], lastResult: '보상을 건너뛰었습니다.' } : current;
}

export function chooseChapterDeckAction(current: ChapterState, action: DeckAction): ChapterState {
  if (current.phase !== 'reward' || (action !== 'upgrade' && action !== 'remove')) return current;
  return { ...current, phase: 'manage', deckAction: action, afterManage: 'map', manageSource: 'reward' };
}

export function cancelChapterDeckAction(current: ChapterState): ChapterState {
  if (current.phase !== 'manage') return current;
  return { ...current, phase: current.manageSource, deckAction: null };
}

export function applyChapterDeckAction(current: ChapterState, index: number): ChapterState {
  if (current.phase !== 'manage' || !Number.isInteger(index) || index < 0 || index >= current.deck.length) return current;
  const deck = [...current.deck];
  let result: string;
  if (current.deckAction === 'upgrade') {
    const upgrade = CARDS[deck[index]].upgradeTo;
    if (!upgrade) return current;
    result = `${CARDS[deck[index]].name} 강화 완료`;
    deck[index] = upgrade;
  } else if (current.deckAction === 'remove' && deck.length > 5) {
    result = `${CARDS[deck[index]].name} 제거 완료`;
    deck.splice(index, 1);
  } else return current;
  const shopRemoval = current.afterManage === 'shop' && current.deckAction === 'remove';
  return { ...current, phase: current.afterManage, deckAction: null, deck, rewardOptions: [],
    gold: current.gold - (shopRemoval ? 35 : 0), shopRemoved: current.shopRemoved || shopRemoval, lastResult: result };
}

export function chooseEvent(current: ChapterState, index: number): ChapterState {
  if (current.phase !== 'event' || !current.eventId || (index !== 0 && index !== 1)) return current;
  const choice = EVENTS[current.eventId].choices[index];
  const hp = Math.min(current.maxHp, current.playerHp + (choice.hp ?? 0));
  const deck = choice.card ? [...current.deck, choice.card] : current.deck;
  return { ...current, phase: hp <= 0 ? 'lost' : 'map', playerHp: Math.max(0, hp), gold: current.gold + (choice.gold ?? 0), deck,
    eventId: null, lastResult: choice.label };
}

export function restHeal(current: ChapterState): ChapterState {
  return current.phase === 'rest' ? { ...current, phase: 'map', playerHp: Math.min(current.maxHp, current.playerHp + 12), lastResult: '휴식으로 체력 12를 회복했습니다.' } : current;
}

export function restUpgrade(current: ChapterState): ChapterState {
  return current.phase === 'rest' ? { ...current, phase: 'manage', deckAction: 'upgrade', afterManage: 'map', manageSource: 'rest' } : current;
}

export function shopPrice(cardId: CardId): number {
  return CARDS[cardId].rarity === 'rare' ? 65 : CARDS[cardId].rarity === 'uncommon' ? 42 : 28;
}

export function buyShopCard(current: ChapterState, index: number): ChapterState {
  if (current.phase !== 'shop' || !Number.isInteger(index) || index < 0 || index >= current.shopStock.length) return current;
  const cardId = current.shopStock[index];
  if (!cardId || current.gold < shopPrice(cardId)) return current;
  const shopStock = [...current.shopStock];
  shopStock[index] = null;
  return { ...current, gold: current.gold - shopPrice(cardId), deck: [...current.deck, cardId], shopStock, lastResult: `${CARDS[cardId].name} 구매` };
}

export function buyShopHeal(current: ChapterState): ChapterState {
  if (current.phase !== 'shop' || current.shopHealed || current.gold < 18 || current.playerHp >= current.maxHp) return current;
  return { ...current, gold: current.gold - 18, playerHp: Math.min(current.maxHp, current.playerHp + 10), shopHealed: true, lastResult: '간식으로 체력 10 회복' };
}

export function buyShopRemoval(current: ChapterState): ChapterState {
  if (current.phase !== 'shop' || current.shopRemoved || current.gold < 35 || current.deck.length <= 5) return current;
  return { ...current, phase: 'manage', deckAction: 'remove', afterManage: 'shop', manageSource: 'shop' };
}

export function leaveShop(current: ChapterState): ChapterState {
  return current.phase === 'shop' ? { ...current, phase: 'map', shopStock: [], lastResult: '다음 길로 향합니다.' } : current;
}
