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
  counterDamage: number;
  attacksPlayed: number;
  energy: number;
  enemyHp: number;
  enemyPoison: number;
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
    counterDamage: 0,
    attacksPlayed: 0,
    energy: ENERGY_PER_TURN,
    enemyHp: setup.enemy.maxHp,
    enemyPoison: 0,
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
  switch (card.effect) {
    case 'damage':
    case 'flurry': {
      const damage = card.value + (card.effect === 'flurry' ? current.attacksPlayed * (card.bonus ?? 0) : 0);
      next.enemyHp = Math.max(0, next.enemyHp - damage);
      next.attacksPlayed += 1;
      next.message = `${card.name}: 적에게 피해 ${damage}`;
      break;
    }
    case 'block':
      next.playerBlock += card.value;
      next.message = `${card.name}: 방어도 ${card.value} 획득`;
      break;
    case 'counter':
      next.playerBlock += card.value;
      next.counterDamage += card.bonus ?? 0;
      next.message = `${card.name}: 방어도 ${card.value} · 반격 ${card.bonus}`;
      break;
    case 'poison':
      next.enemyPoison += card.value;
      next.message = `${card.name}: 적 중독 ${card.value} 추가`;
      break;
    case 'catalyst':
      next.enemyPoison *= card.value;
      next.message = `${card.name}: 적 중독 ${card.value}배`;
      break;
  }
  if (next.enemyHp === 0) {
    next.phase = 'won';
    next.message = '승리!';
  }
  return next;
}

export function endTurn(current: BattleState, random: Random = Math.random): BattleState {
  if (current.phase !== 'player') return current;
  const poisonDamage = Math.min(current.enemyHp, current.enemyPoison);
  const poisonedEnemyHp = current.enemyHp - poisonDamage;
  if (poisonedEnemyHp === 0) {
    return { ...current, phase: 'won', enemyHp: 0, enemyPoison: Math.max(0, current.enemyPoison - 1), message: `중독 피해 ${poisonDamage} · 승리!` };
  }
  const damage = Math.max(0, current.enemy.attack - current.playerBlock);
  const playerHp = Math.max(0, current.playerHp - damage);
  const counterDamage = playerHp > 0 ? current.counterDamage : 0;
  const enemyHp = Math.max(0, poisonedEnemyHp - counterDamage);
  const next: BattleState = {
    ...current,
    phase: playerHp === 0 ? 'lost' : enemyHp === 0 ? 'won' : 'player',
    turn: current.turn + 1,
    playerHp,
    playerBlock: 0,
    counterDamage: 0,
    attacksPlayed: 0,
    energy: ENERGY_PER_TURN,
    enemyHp,
    enemyPoison: Math.max(0, current.enemyPoison - 1),
    hand: [],
    drawPile: [...current.drawPile],
    discardPile: [...current.discardPile, ...current.hand],
    message: playerHp === 0 ? '패배.' : enemyHp === 0 ? `반격 피해 ${counterDamage} · 승리!` : `중독 ${poisonDamage} · 적 공격 피해 ${damage} · 내 턴`,
  };
  if (next.phase === 'player') drawCards(next, HAND_SIZE, random);
  return next;
}
