// 전투 규칙 엔진. Phaser를 전혀 참조하지 않는다.
// 카드 효과와 적 행동은 같은 CardEffectStep 어휘를 쓰기 때문에, 플레이어
// 쪽이든 적 쪽이든 같은 resolveEffects()로 처리한다.

import { type CardEffectStep } from './effects';
import { type CardInstance, getEffectiveDefinition } from './cards';
import { advanceMove, createEnemy, getCurrentMove, type EnemyState } from './enemies';
import { shuffle } from './rng';
import {
  addStatus,
  applyIncomingModifiers,
  applyOutgoingModifiers,
  applyRegenPowers,
  getStatus,
  tickStartOfTurn,
  type StatusMap,
} from './status';

export const MAX_ENERGY = 3;
export const HAND_SIZE = 5;

export type CombatStatus = 'ongoing' | 'won' | 'lost';

export interface CombatState {
  playerHp: number;
  playerMaxHp: number;
  block: number;
  statuses: StatusMap;
  energy: number;
  maxEnergy: number;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  enemy: EnemyState;
  turnNumber: number;
  attacksPlayedThisTurn: number;
  status: CombatStatus;
}

interface Combatant {
  hp: number;
  maxHp: number;
  block: number;
  statuses: StatusMap;
}

interface ResolveResult {
  self: Combatant;
  opponent: Combatant;
  cardsDrawn: number;
  energyGained: number;
}

// self가 행한 효과를 self/opponent 양쪽에 적용한다. 카드를 낸 쪽이 self,
// 상대가 opponent다(플레이어가 카드를 내면 self=플레이어, 적 턴이면 self=적).
function resolveEffects(
  steps: CardEffectStep[],
  selfIn: Combatant,
  opponentIn: Combatant,
  attacksPlayedThisTurn: number,
): ResolveResult {
  let self = selfIn;
  let opponent = opponentIn;
  let cardsDrawn = 0;
  let energyGained = 0;

  for (const step of steps) {
    if (step.type === 'damage') {
      const bonus = step.bonusPerAttackPlayed ? step.bonusPerAttackPlayed * attacksPlayedThisTurn : 0;
      const hits = step.hits ?? 1;
      for (let hit = 0; hit < hits; hit++) {
        let amount = applyOutgoingModifiers(step.amount + bonus, self.statuses);
        amount = applyIncomingModifiers(amount, opponent.statuses);
        const blocked = Math.min(opponent.block, amount);
        const toHp = amount - blocked;
        opponent = { ...opponent, block: opponent.block - blocked, hp: Math.max(0, opponent.hp - toHp) };

        const thorns = getStatus(opponent.statuses, 'thorns');
        if (thorns > 0) {
          self = { ...self, hp: Math.max(0, self.hp - thorns) };
        }
      }
    } else if (step.type === 'block') {
      const amount = step.amount + getStatus(self.statuses, 'dexterity');
      self = { ...self, block: self.block + amount };
    } else if (step.type === 'applyStatus') {
      if (step.target === 'self') {
        self = { ...self, statuses: addStatus(self.statuses, step.status, step.amount) };
      } else {
        const amplify = step.status === 'poison' ? getStatus(self.statuses, 'poisonAmplify') : 0;
        opponent = { ...opponent, statuses: addStatus(opponent.statuses, step.status, step.amount + amplify) };
      }
    } else if (step.type === 'draw') {
      cardsDrawn += step.amount;
    } else if (step.type === 'gainEnergy') {
      energyGained += step.amount;
    } else if (step.type === 'heal') {
      self = { ...self, hp: Math.min(self.maxHp, self.hp + step.amount) };
    }
  }

  return { self, opponent, cardsDrawn, energyGained };
}

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

function toPlayerCombatant(state: CombatState): Combatant {
  return { hp: state.playerHp, maxHp: state.playerMaxHp, block: state.block, statuses: state.statuses };
}

function toEnemyCombatant(enemy: EnemyState): Combatant {
  return { hp: enemy.hp, maxHp: enemy.maxHp, block: enemy.block, statuses: enemy.statuses };
}

export interface CreateCombatParams {
  deck: CardInstance[]; // 런에서 넘어오는 마스터 덱(같은 인스턴스를 재사용 — uid·강화 여부 유지)
  playerHp: number;
  playerMaxHp: number;
  enemyDefId: string;
}

export function createCombatState(params: CreateCombatParams): CombatState {
  const base: CombatState = {
    playerHp: params.playerHp,
    playerMaxHp: params.playerMaxHp,
    block: 0,
    statuses: {},
    energy: MAX_ENERGY,
    maxEnergy: MAX_ENERGY,
    drawPile: shuffle(params.deck),
    hand: [],
    discardPile: [],
    exhaustPile: [],
    enemy: createEnemy(params.enemyDefId),
    turnNumber: 1,
    attacksPlayedThisTurn: 0,
    status: 'ongoing',
  };
  return drawCards(base, HAND_SIZE);
}

export function playCard(state: CombatState, uid: number): CombatState {
  if (state.status !== 'ongoing') return state;

  const index = state.hand.findIndex((card) => card.uid === uid);
  if (index === -1) return state;

  const card = state.hand[index];
  const def = getEffectiveDefinition(card);
  if (state.energy < def.cost) return state;

  const result = resolveEffects(def.effects, toPlayerCombatant(state), toEnemyCombatant(state.enemy), state.attacksPlayedThisTurn);

  let next: CombatState = {
    ...state,
    playerHp: result.self.hp,
    block: result.self.block,
    statuses: result.self.statuses,
    energy: state.energy - def.cost + result.energyGained,
    enemy: { ...state.enemy, hp: result.opponent.hp, block: result.opponent.block, statuses: result.opponent.statuses },
    hand: state.hand.filter((_, i) => i !== index),
    attacksPlayedThisTurn: state.attacksPlayedThisTurn + (def.type === 'attack' ? 1 : 0),
  };

  if (def.exhaust) {
    next.exhaustPile = [...next.exhaustPile, card];
  } else {
    next.discardPile = [...next.discardPile, card];
  }

  if (result.cardsDrawn > 0) next = drawCards(next, result.cardsDrawn);

  return checkCombatEnd(next);
}

function runEnemyTurn(state: CombatState): CombatState {
  let enemy = { ...state.enemy, block: 0 };
  const tick = tickStartOfTurn(enemy.statuses);
  enemy = { ...enemy, statuses: tick.statuses, hp: Math.max(0, enemy.hp - tick.poisonDamage) };

  let next: CombatState = { ...state, enemy };
  next = checkCombatEnd(next);
  if (next.status !== 'ongoing') return next;

  const move = getCurrentMove(enemy);
  const result = resolveEffects(move.effects, toEnemyCombatant(enemy), toPlayerCombatant(next), 0);

  enemy = { ...enemy, hp: result.self.hp, block: result.self.block, statuses: result.self.statuses };
  next = {
    ...next,
    playerHp: result.opponent.hp,
    block: result.opponent.block,
    statuses: result.opponent.statuses,
    enemy: advanceMove(enemy),
  };

  return checkCombatEnd(next);
}

function beginPlayerTurn(state: CombatState): CombatState {
  const reset: CombatState = { ...state, block: 0 };
  const tick = tickStartOfTurn(reset.statuses);
  let hp = Math.max(0, reset.playerHp - tick.poisonDamage);
  let statuses = tick.statuses;

  const regen = applyRegenPowers(statuses);
  statuses = regen.statuses;

  let next: CombatState = {
    ...reset,
    playerHp: hp,
    statuses,
    block: reset.block + regen.bonusBlock,
    energy: reset.maxEnergy,
    attacksPlayedThisTurn: 0,
    turnNumber: reset.turnNumber + 1,
  };

  next = checkCombatEnd(next);
  if (next.status !== 'ongoing') return next;

  return drawCards(next, HAND_SIZE);
}

export function endTurn(state: CombatState): CombatState {
  if (state.status !== 'ongoing') return state;

  let next: CombatState = {
    ...state,
    discardPile: [...state.discardPile, ...state.hand],
    hand: [],
  };

  next = runEnemyTurn(next);
  if (next.status !== 'ongoing') return next;

  return beginPlayerTurn(next);
}
