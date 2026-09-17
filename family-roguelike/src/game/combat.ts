import { CARDS, STARTER_DECK, type CardId } from './cards.ts';
import { TRAINING_ENEMY, type EnemyDefinition } from './enemies.ts';

export const PLAYER_MAX_HP = 30;
export const ENERGY_PER_TURN = 3;
export const HAND_SIZE = 5;

export type BattlePhase = 'player' | 'won' | 'lost';

export interface BattleState {
  phase: BattlePhase;
  turn: number;
  playerHp: number;
  playerBlock: number;
  energy: number;
  enemyHp: number;
  enemy: Readonly<EnemyDefinition>;
  drawPile: CardId[];
  hand: CardId[];
  discardPile: CardId[];
  message: string;
}

type Random = () => number;

function shuffle(cards: CardId[], random: Random): CardId[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function drawCards(state: BattleState, count: number, random: Random): void {
  while (state.hand.length < count) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = shuffle(state.discardPile, random);
      state.discardPile = [];
    }
    state.hand.push(state.drawPile.shift()!);
  }
}

export interface BattleSetup {
  enemy: Readonly<EnemyDefinition>;
  playerHp: number;
  deck: readonly CardId[];
}

export function createBattle(setup: BattleSetup, random: Random = Math.random): BattleState {
  const state: BattleState = {
    phase: 'player',
    turn: 1,
    playerHp: setup.playerHp,
    playerBlock: 0,
    energy: ENERGY_PER_TURN,
    enemyHp: setup.enemy.maxHp,
    enemy: setup.enemy,
    drawPile: shuffle([...setup.deck], random),
    hand: [],
    discardPile: [],
    message: '카드를 눌러 사용하세요.',
  };
  drawCards(state, HAND_SIZE, random);
  return state;
}

export function startBattle(random: Random = Math.random): BattleState {
  return createBattle({ enemy: TRAINING_ENEMY, playerHp: PLAYER_MAX_HP, deck: STARTER_DECK }, random);
}

export function playCard(current: BattleState, handIndex: number): BattleState {
  if (current.phase !== 'player' || !Number.isInteger(handIndex) || handIndex < 0 || handIndex >= current.hand.length) return current;
  const cardId = current.hand[handIndex];
  const card = CARDS[cardId];
  if (card.cost > current.energy) return { ...current, message: '에너지가 부족합니다.' };

  const next: BattleState = {
    ...current,
    hand: [...current.hand],
    discardPile: [...current.discardPile, cardId],
    energy: current.energy - card.cost,
  };
  next.hand.splice(handIndex, 1);
  if (card.kind === 'attack') {
    next.enemyHp = Math.max(0, next.enemyHp - card.value);
    next.message = `${card.name}: 적에게 피해 ${card.value}`;
    if (next.enemyHp === 0) {
      next.phase = 'won';
      next.message = '승리! 다시 시작할 수 있습니다.';
    }
  } else {
    next.playerBlock += card.value;
    next.message = `${card.name}: 방어도 ${card.value} 획득`;
  }
  return next;
}

export function endTurn(current: BattleState, random: Random = Math.random): BattleState {
  if (current.phase !== 'player') return current;
  const damage = Math.max(0, current.enemy.attack - current.playerBlock);
  const playerHp = Math.max(0, current.playerHp - damage);
  const next: BattleState = {
    ...current,
    phase: playerHp === 0 ? 'lost' : 'player',
    turn: current.turn + 1,
    playerHp,
    playerBlock: 0,
    energy: ENERGY_PER_TURN,
    hand: [],
    drawPile: [...current.drawPile],
    discardPile: [...current.discardPile, ...current.hand],
    message: playerHp === 0 ? '패배. 다시 시작할 수 있습니다.' : `적의 공격! 피해 ${damage} · 내 턴`,
  };
  if (next.phase === 'player') drawCards(next, HAND_SIZE, random);
  return next;
}
