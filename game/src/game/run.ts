// 층을 넘나들며 유지되는 "런" 상태: 덱, 체력, 용돈(골드), 맵 진행도.
// combat.ts는 전투 한 판만 알고, run.ts는 전투 여러 판을 잇는 로그라이크
// 진행을 담당한다.

import { createCardInstance, createStarterDeck, type CardInstance } from './cards';
import { generateChapter1Map, type FloorPlan, type MapNode } from './map';
import { randInt, shuffle } from './rng';

export const STARTING_PLAYER_MAX_HP = 70;
export const STARTING_GOLD = 99;

const BEST_FLOOR_KEY = 'family-roguelike:best-floor';

export function loadBestFloor(): number {
  try {
    const raw = localStorage.getItem(BEST_FLOOR_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function saveBestFloor(floor: number): void {
  try {
    if (floor > loadBestFloor()) localStorage.setItem(BEST_FLOOR_KEY, String(floor));
  } catch {
    // 사파리 프라이빗 모드 등 localStorage를 쓸 수 없는 환경은 조용히 무시한다.
  }
}

export interface RunState {
  deck: CardInstance[];
  playerHp: number;
  playerMaxHp: number;
  gold: number;
  map: FloorPlan[];
  currentFloorIndex: number; // -1 = 아직 0층을 고르기 전
  selectedNodeId: string | null;
  highestFloorReached: number;
  chapterCleared: boolean;
  runOver: boolean;
}

export function createNewRun(): RunState {
  return {
    deck: createStarterDeck(),
    playerHp: STARTING_PLAYER_MAX_HP,
    playerMaxHp: STARTING_PLAYER_MAX_HP,
    gold: STARTING_GOLD,
    map: generateChapter1Map(),
    currentFloorIndex: -1,
    selectedNodeId: null,
    highestFloorReached: 0,
    chapterCleared: false,
    runOver: false,
  };
}

export function getCurrentFloorOptions(run: RunState): MapNode[] {
  const floor = run.map[run.currentFloorIndex + 1];
  return floor ? floor.options : [];
}

export function selectNode(run: RunState, nodeId: string): RunState {
  // 클리어하지 못하고 죽더라도 "발을 들인 층"까지는 도달한 것으로 친다.
  const floorNumber = run.currentFloorIndex + 2;
  return {
    ...run,
    selectedNodeId: nodeId,
    highestFloorReached: Math.max(run.highestFloorReached, floorNumber),
  };
}

export function getSelectedNode(run: RunState): MapNode | null {
  return getCurrentFloorOptions(run).find((node) => node.id === run.selectedNodeId) ?? null;
}

// 현재 선택한 노드를 클리어 처리하고 맵을 한 칸 전진시킨다. 방금 클리어한
// 층이 마지막(보스) 층이었다면 챕터 클리어로 표시한다.
export function completeCurrentFloor(run: RunState): RunState {
  const newIndex = run.currentFloorIndex + 1;
  const next: RunState = {
    ...run,
    currentFloorIndex: newIndex,
    selectedNodeId: null,
    highestFloorReached: Math.max(run.highestFloorReached, newIndex + 1),
  };
  return newIndex === run.map.length - 1 ? { ...next, chapterCleared: true } : next;
}

export function grantCombatGold(run: RunState, kind: 'combat' | 'elite' | 'boss'): { run: RunState; amount: number } {
  const amount = kind === 'boss' ? 50 : kind === 'elite' ? randInt(25, 40) : randInt(10, 20);
  return { run: { ...run, gold: run.gold + amount }, amount };
}

export function addCardToDeck(run: RunState, defId: string, upgraded = false): RunState {
  return { ...run, deck: [...run.deck, createCardInstance(defId, upgraded)] };
}

export function removeCardFromDeck(run: RunState, uid: number): RunState {
  return { ...run, deck: run.deck.filter((card) => card.uid !== uid) };
}

export function upgradeCardInDeck(run: RunState, uid: number): RunState {
  return { ...run, deck: run.deck.map((card) => (card.uid === uid ? { ...card, upgraded: true } : card)) };
}

export function spendGold(run: RunState, amount: number): RunState | null {
  if (run.gold < amount) return null;
  return { ...run, gold: run.gold - amount };
}

export function applyPlayerHpDelta(run: RunState, delta: number): RunState {
  const hp = Math.max(0, Math.min(run.playerMaxHp, run.playerHp + delta));
  return { ...run, playerHp: hp, runOver: hp <= 0 };
}

export function pickRandomEligibleCard(
  deck: CardInstance[],
  predicate: (card: CardInstance) => boolean = () => true,
): CardInstance | null {
  const eligible = deck.filter(predicate);
  if (eligible.length === 0) return null;
  return shuffle(eligible)[0];
}
