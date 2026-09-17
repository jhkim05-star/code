import { CARDS, REWARD_POOL, STARTER_DECK, type CardId, type CardRarity } from './cards.ts';
import { createBattle, endTurn, playCard, PLAYER_MAX_HP, type BattleState } from './combat.ts';
import { FLOOR_ENEMIES } from './enemies.ts';

type Random = () => number;
export type DeckAction = 'upgrade' | 'remove';

export const FINAL_FLOOR = FLOOR_ENEMIES.length;
export type RunPhase = 'battle' | 'reward' | 'manage' | 'won' | 'lost';

export interface RunState {
  phase: RunPhase;
  floor: number;
  bestFloor: number;
  playerHp: number;
  deck: CardId[];
  battle: BattleState;
  rewardOptions: CardId[];
  deckAction: DeckAction | null;
}

const RARITY_WEIGHT: Record<CardRarity, number> = { starter: 0, common: 4, uncommon: 2, rare: 1 };

export function rollRewards(random: Random = Math.random): CardId[] {
  const available = [...REWARD_POOL];
  const options: CardId[] = [];
  for (let choice = 0; choice < 3; choice++) {
    const total = available.reduce((sum, id) => sum + RARITY_WEIGHT[CARDS[id].rarity], 0);
    let pick = Math.min(Math.max(random(), 0), 0.999999999) * total;
    let index = available.length - 1;
    for (let i = 0; i < available.length; i++) {
      pick -= RARITY_WEIGHT[CARDS[available[i]].rarity];
      if (pick < 0) { index = i; break; }
    }
    options.push(available.splice(index, 1)[0]);
  }
  return options;
}

export function startRun(bestFloor = 0, random: Random = Math.random): RunState {
  const deck = [...STARTER_DECK];
  return {
    phase: 'battle',
    floor: 1,
    bestFloor: Math.max(1, bestFloor),
    playerHp: PLAYER_MAX_HP,
    deck,
    battle: createBattle({ enemy: FLOOR_ENEMIES[0], playerHp: PLAYER_MAX_HP, deck }, random),
    rewardOptions: [],
    deckAction: null,
  };
}

function finishBattle(current: RunState, battle: BattleState, random: Random): RunState {
  if (battle === current.battle) return current;
  if (battle.phase === 'lost') return { ...current, phase: 'lost', playerHp: 0, battle };
  if (battle.phase === 'won') {
    return {
      ...current,
      phase: current.floor === FINAL_FLOOR ? 'won' : 'reward',
      playerHp: battle.playerHp,
      battle,
      rewardOptions: current.floor === FINAL_FLOOR ? [] : rollRewards(random),
    };
  }
  return { ...current, playerHp: battle.playerHp, battle };
}

export function playRunCard(current: RunState, handIndex: number, random: Random = Math.random): RunState {
  if (current.phase !== 'battle') return current;
  return finishBattle(current, playCard(current.battle, handIndex), random);
}

export function endRunTurn(current: RunState, random: Random = Math.random): RunState {
  if (current.phase !== 'battle') return current;
  return finishBattle(current, endTurn(current.battle, random), random);
}

function nextFloor(current: RunState, deck: CardId[], random: Random): RunState {
  const floor = current.floor + 1;
  return {
    phase: 'battle',
    floor,
    bestFloor: Math.max(current.bestFloor, floor),
    playerHp: current.playerHp,
    deck,
    battle: createBattle({ enemy: FLOOR_ENEMIES[floor - 1], playerHp: current.playerHp, deck }, random),
    rewardOptions: [],
    deckAction: null,
  };
}

export function chooseReward(current: RunState, rewardIndex: number, random: Random = Math.random): RunState {
  if (current.phase !== 'reward' || !Number.isInteger(rewardIndex) || rewardIndex < 0 || rewardIndex >= current.rewardOptions.length) return current;
  return nextFloor(current, [...current.deck, current.rewardOptions[rewardIndex]], random);
}

export function chooseDeckAction(current: RunState, action: DeckAction): RunState {
  if (current.phase !== 'reward' || (action !== 'upgrade' && action !== 'remove')) return current;
  return { ...current, phase: 'manage', deckAction: action };
}

export function cancelDeckAction(current: RunState): RunState {
  return current.phase === 'manage' ? { ...current, phase: 'reward', deckAction: null } : current;
}

export function applyDeckAction(current: RunState, cardIndex: number, random: Random = Math.random): RunState {
  if (current.phase !== 'manage' || !Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= current.deck.length) return current;
  const deck = [...current.deck];
  if (current.deckAction === 'upgrade') {
    const upgraded = CARDS[deck[cardIndex]].upgradeTo;
    if (!upgraded) return current;
    deck[cardIndex] = upgraded;
  } else if (current.deckAction === 'remove' && deck.length > 5) {
    deck.splice(cardIndex, 1);
  } else return current;
  return nextFloor(current, deck, random);
}

export function skipReward(current: RunState, random: Random = Math.random): RunState {
  return current.phase === 'reward' ? nextFloor(current, [...current.deck], random) : current;
}
