// "우리 집" 세계관의 적 정의. 각 적은 몇 가지 행동을 정해진 순서로 반복하는
// 패턴을 가진다(패턴은 결정적이라 플레이어가 다음 수를 미리 보고 대응할 수 있다).

import { describeEffects, type CardEffectStep } from './effects';
import type { StatusMap } from './status';

export type MoveCategory = 'attack' | 'defend' | 'buff' | 'debuff';

export const CATEGORY_ICONS: Record<MoveCategory, string> = {
  attack: '⚔️',
  defend: '🛡️',
  buff: '📈',
  debuff: '💢',
};

export interface EnemyMove {
  id: string;
  category: MoveCategory;
  // target 'self' = 이 적 자신, 'enemy' = 상대(플레이어). 카드 효과와 같은 어휘를 재사용한다.
  effects: CardEffectStep[];
}

export interface EnemyDefinition {
  id: string;
  name: string;
  maxHp: number;
  isElite: boolean;
  isBoss: boolean;
  moves: Record<string, EnemyMove>;
  pattern: string[]; // 반복되는 행동 순서
}

function move(id: string, category: MoveCategory, effects: CardEffectStep[]): EnemyMove {
  return { id, category, effects };
}

export const ENEMY_LIBRARY: Record<string, EnemyDefinition> = {
  nagging_ghost: {
    id: 'nagging_ghost',
    name: '잔소리 유령',
    maxHp: 34,
    isElite: false,
    isBoss: false,
    moves: {
      whine_attack: move('whine_attack', 'attack', [{ type: 'damage', amount: 7 }]),
      nag_curse: move('nag_curse', 'debuff', [
        { type: 'applyStatus', target: 'enemy', status: 'poison', amount: 3 },
      ]),
    },
    pattern: ['whine_attack', 'nag_curse'],
  },
  sock_monster: {
    id: 'sock_monster',
    name: '양말 괴물',
    maxHp: 40,
    isElite: false,
    isBoss: false,
    moves: {
      stinky_swipe: move('stinky_swipe', 'attack', [{ type: 'damage', amount: 6 }]),
      power_up: move('power_up', 'buff', [
        { type: 'applyStatus', target: 'self', status: 'strength', amount: 2 },
      ]),
    },
    pattern: ['stinky_swipe', 'stinky_swipe', 'power_up'],
  },
  remote_goblin: {
    id: 'remote_goblin',
    name: '리모컨 요괴',
    maxHp: 38,
    isElite: false,
    isBoss: false,
    moves: {
      channel_zap: move('channel_zap', 'attack', [
        { type: 'damage', amount: 5 },
        { type: 'applyStatus', target: 'enemy', status: 'weak', amount: 1 },
      ]),
      double_click: move('double_click', 'attack', [{ type: 'damage', amount: 4, hits: 2 }]),
      steal_turn: move('steal_turn', 'debuff', [
        { type: 'applyStatus', target: 'enemy', status: 'vulnerable', amount: 2 },
      ]),
    },
    pattern: ['channel_zap', 'double_click', 'channel_zap', 'steal_turn'],
  },
  package_avalanche: {
    id: 'package_avalanche',
    name: '택배 산사태',
    maxHp: 46,
    isElite: false,
    isBoss: false,
    moves: {
      small_tumble: move('small_tumble', 'attack', [{ type: 'damage', amount: 5 }]),
      avalanche_slam: move('avalanche_slam', 'attack', [{ type: 'damage', amount: 16 }]),
    },
    pattern: ['small_tumble', 'small_tumble', 'avalanche_slam'],
  },

  // ── 엘리트 ─────────────────────────────────────────────────────────
  fridge_guardian: {
    id: 'fridge_guardian',
    name: '냉장고 파수꾼',
    maxHp: 70,
    isElite: true,
    isBoss: false,
    moves: {
      frost_guard: move('frost_guard', 'defend', [
        { type: 'block', amount: 12 },
        { type: 'applyStatus', target: 'self', status: 'dexterity', amount: 1 },
      ]),
      cold_shoulder: move('cold_shoulder', 'debuff', [
        { type: 'applyStatus', target: 'enemy', status: 'vulnerable', amount: 2 },
        { type: 'applyStatus', target: 'enemy', status: 'weak', amount: 1 },
      ]),
      ice_slam: move('ice_slam', 'attack', [{ type: 'damage', amount: 20 }]),
    },
    pattern: ['frost_guard', 'cold_shoulder', 'frost_guard', 'ice_slam'],
  },

  // ── 보스 ──────────────────────────────────────────────────────────
  tidiness_guardian: {
    id: 'tidiness_guardian',
    name: '정리정돈의 수호신',
    maxHp: 130,
    isElite: false,
    isBoss: true,
    moves: {
      tidy_slam: move('tidy_slam', 'attack', [{ type: 'damage', amount: 22 }]),
      organize_shield: move('organize_shield', 'defend', [
        { type: 'block', amount: 15 },
        { type: 'applyStatus', target: 'self', status: 'strength', amount: 2 },
      ]),
      nagging_wave: move('nagging_wave', 'debuff', [
        { type: 'applyStatus', target: 'enemy', status: 'poison', amount: 6 },
        { type: 'applyStatus', target: 'enemy', status: 'weak', amount: 2 },
      ]),
    },
    pattern: ['tidy_slam', 'organize_shield', 'nagging_wave', 'tidy_slam'],
  },
};

export interface EnemyState {
  defId: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  statuses: StatusMap;
  isElite: boolean;
  isBoss: boolean;
  turnIndex: number;
  currentMoveId: string;
}

function moveAt(def: EnemyDefinition, turnIndex: number): EnemyMove {
  const id = def.pattern[turnIndex % def.pattern.length];
  return def.moves[id];
}

export function createEnemy(defId: string): EnemyState {
  const def = ENEMY_LIBRARY[defId];
  return {
    defId: def.id,
    name: def.name,
    hp: def.maxHp,
    maxHp: def.maxHp,
    block: 0,
    statuses: {},
    isElite: def.isElite,
    isBoss: def.isBoss,
    turnIndex: 0,
    currentMoveId: moveAt(def, 0).id,
  };
}

export function getCurrentMove(enemy: EnemyState): EnemyMove {
  return ENEMY_LIBRARY[enemy.defId].moves[enemy.currentMoveId];
}

export function advanceMove(enemy: EnemyState): EnemyState {
  const def = ENEMY_LIBRARY[enemy.defId];
  const nextTurnIndex = enemy.turnIndex + 1;
  return { ...enemy, turnIndex: nextTurnIndex, currentMoveId: moveAt(def, nextTurnIndex).id };
}

export function describeIntent(enemy: EnemyState): string {
  const move = getCurrentMove(enemy);
  return `${CATEGORY_ICONS[move.category]} ${describeEffects(move.effects)}`;
}
