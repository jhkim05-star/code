// Level 1 전투 규칙. Phaser를 전혀 참조하지 않는다.
// 카드 사용 → 에너지 감소 → 적 HP 감소 같은 계산만 여기서 담당하고,
// 화면 표시·입력·연출은 BattleScene이 맡는다.

import { createStarterDeck, getCardDefinition, type CardInstance } from './cards';
import { advanceEnemyIntent, createEnemy, type EnemyState } from './enemies';

export const PLAYER_MAX_HP = 70;
export const MAX_ENERGY = 3;
export const HAND_SIZE = 5;

export type CombatStatus = 'ongoing' | 'won' | 'lost';

export interface CombatState {
  playerHp: number;
  playerMaxHp: number;
  block: number;
  energy: number;
  maxEnergy: number;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  enemy: EnemyState;
  turnNumber: number;
  status: CombatStatus;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 드로우 더미가 부족하면 버린 더미를 섞어 드로우 더미로 되돌린 뒤 계속 뽑는다.
function drawCards(state: CombatState, count: number): CombatState {
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  const hand = [...state.hand];

  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break;
      drawPile = shuffle(discardPile);
      discardPile = [];
    }
    hand.push(drawPile.shift()!);
  }

  return { ...state, drawPile, discardPile, hand };
}

function checkCombatEnd(state: CombatState): CombatState {
  if (state.enemy.hp <= 0) return { ...state, status: 'won' };
  if (state.playerHp <= 0) return { ...state, status: 'lost' };
  return state;
}

export function createCombatState(): CombatState {
  const base: CombatState = {
    playerHp: PLAYER_MAX_HP,
    playerMaxHp: PLAYER_MAX_HP,
    block: 0,
    energy: MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    drawPile: shuffle(createStarterDeck()),
    hand: [],
    discardPile: [],
    enemy: createEnemy(),
    turnNumber: 1,
    status: 'ongoing',
  };
  return drawCards(base, HAND_SIZE);
}

// 손패의 카드 한 장(uid로 지정)을 사용한다. 에너지가 부족하거나 전투가
// 이미 끝났으면 아무 효과 없이 그대로 상태를 반환한다.
export function playCard(state: CombatState, uid: number): CombatState {
  if (state.status !== 'ongoing') return state;

  const index = state.hand.findIndex((card) => card.uid === uid);
  if (index === -1) return state;

  const card = state.hand[index];
  const def = getCardDefinition(card);
  if (state.energy < def.cost) return state;

  const next: CombatState = {
    ...state,
    energy: state.energy - def.cost,
    hand: state.hand.filter((_, i) => i !== index),
    discardPile: [...state.discardPile, card],
  };

  if (def.effect.type === 'damage') {
    next.enemy = { ...next.enemy, hp: Math.max(0, next.enemy.hp - def.effect.amount) };
  } else {
    next.block += def.effect.amount;
  }

  return checkCombatEnd(next);
}

// 턴 종료: 남은 손패를 버리고 → 적이 공격하고 → 승패를 확인하고 →
// (전투가 계속되면) 방어도 초기화, 에너지 충전, 다음 턴 드로우까지 진행한다.
export function endTurn(state: CombatState): CombatState {
  if (state.status !== 'ongoing') return state;

  let next: CombatState = {
    ...state,
    discardPile: [...state.discardPile, ...state.hand],
    hand: [],
  };

  const damage = next.enemy.intent.amount;
  const blocked = Math.min(next.block, damage);
  next = {
    ...next,
    block: next.block - blocked,
    playerHp: Math.max(0, next.playerHp - (damage - blocked)),
  };

  next = checkCombatEnd(next);
  if (next.status !== 'ongoing') return next;

  next = {
    ...next,
    turnNumber: next.turnNumber + 1,
    block: 0,
    energy: next.maxEnergy,
  };
  next.enemy = advanceEnemyIntent(next.enemy, next.turnNumber);
  return drawCards(next, HAND_SIZE);
}
