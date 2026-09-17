import { REWARD_CARDS, STARTER_DECK, type CardId } from './cards.ts';
import { createBattle, endTurn, playCard, PLAYER_MAX_HP, type BattleState } from './combat.ts';
import { FLOOR_ENEMIES } from './enemies.ts';

type Random = () => number;

export const FINAL_FLOOR = FLOOR_ENEMIES.length;
export type RunPhase = 'battle' | 'reward' | 'won' | 'lost';

export interface RunState {
  phase: RunPhase;
  floor: number;
  bestFloor: number;
  playerHp: number;
  deck: CardId[];
  battle: BattleState;
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
  };
}

function finishBattle(current: RunState, battle: BattleState): RunState {
  if (battle === current.battle) return current;
  if (battle.phase === 'lost') return { ...current, phase: 'lost', playerHp: 0, battle };
  if (battle.phase === 'won') {
    return {
      ...current,
      phase: current.floor === FINAL_FLOOR ? 'won' : 'reward',
      playerHp: battle.playerHp,
      battle,
    };
  }
  return { ...current, playerHp: battle.playerHp, battle };
}

export function playRunCard(current: RunState, handIndex: number): RunState {
  if (current.phase !== 'battle') return current;
  return finishBattle(current, playCard(current.battle, handIndex));
}

export function endRunTurn(current: RunState, random: Random = Math.random): RunState {
  if (current.phase !== 'battle') return current;
  return finishBattle(current, endTurn(current.battle, random));
}

export function chooseReward(current: RunState, rewardIndex: number, random: Random = Math.random): RunState {
  if (current.phase !== 'reward' || !Number.isInteger(rewardIndex) || rewardIndex < 0 || rewardIndex >= REWARD_CARDS.length) return current;
  const floor = current.floor + 1;
  const deck = [...current.deck, REWARD_CARDS[rewardIndex]];
  return {
    phase: 'battle',
    floor,
    bestFloor: Math.max(current.bestFloor, floor),
    playerHp: current.playerHp,
    deck,
    battle: createBattle({ enemy: FLOOR_ENEMIES[floor - 1], playerHp: current.playerHp, deck }, random),
  };
}
