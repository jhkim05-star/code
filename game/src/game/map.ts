// 1장 "우리 집"의 맵 생성. 복잡한 절차 생성 대신, 층마다 2~3개의 선택지를
// 무작위로 뽑아 배치하는 단순한 분기 구조를 쓴다.

import { pickRandom, shuffle } from './rng';

export type MapNodeType = 'combat' | 'elite' | 'event' | 'rest' | 'shop' | 'boss';

export interface MapNode {
  id: string;
  type: MapNodeType;
  enemyDefId?: string;
  eventId?: string;
}

export interface FloorPlan {
  index: number;
  options: MapNode[];
}

export const CHAPTER1_FLOOR_COUNT = 14;

export const REGULAR_ENEMY_IDS = ['nagging_ghost', 'sock_monster', 'remote_goblin', 'package_avalanche'];
export const ELITE_ENEMY_ID = 'fridge_guardian';
export const BOSS_ENEMY_ID = 'tidiness_guardian';

// events.ts의 EVENT_LIBRARY 키와 반드시 일치해야 한다.
export const EVENT_IDS = ['fridge_raid', 'group_chat', 'homework', 'closet_cleanup', 'sibling_help'];

export const NODE_TYPE_LABELS: Record<MapNodeType, string> = {
  combat: '전투',
  elite: '엘리트',
  event: '사건',
  rest: '내 방',
  shop: '편의점',
  boss: '보스',
};

export const NODE_TYPE_ICONS: Record<MapNodeType, string> = {
  combat: '⚔️',
  elite: '☠️',
  event: '❓',
  rest: '🛏️',
  shop: '🏪',
  boss: '👑',
};

export function generateChapter1Map(): FloorPlan[] {
  const floors: FloorPlan[] = [];
  let eventQueue = shuffle(EVENT_IDS);
  const nextEventId = (): string => {
    if (eventQueue.length === 0) eventQueue = shuffle(EVENT_IDS);
    return eventQueue.pop()!;
  };

  const lastIndex = CHAPTER1_FLOOR_COUNT - 1;

  for (let i = 0; i <= lastIndex; i++) {
    if (i === 0) {
      floors.push({
        index: i,
        options: [{ id: `f${i}_0`, type: 'combat', enemyDefId: pickRandom(REGULAR_ENEMY_IDS) }],
      });
      continue;
    }
    if (i === lastIndex) {
      floors.push({ index: i, options: [{ id: `f${i}_0`, type: 'boss', enemyDefId: BOSS_ENEMY_ID }] });
      continue;
    }
    if (i === lastIndex - 1) {
      floors.push({ index: i, options: [{ id: `f${i}_0`, type: 'rest' }] });
      continue;
    }

    const options: MapNode[] = [];
    if (i === 6 || i === 9) {
      options.push({ id: `f${i}_elite`, type: 'elite', enemyDefId: ELITE_ENEMY_ID });
    }
    while (options.length < 2) {
      const id = `f${i}_${options.length}`;
      const roll = Math.random();
      if (roll < 0.45) {
        options.push({ id, type: 'combat', enemyDefId: pickRandom(REGULAR_ENEMY_IDS) });
      } else if (roll < 0.7) {
        options.push({ id, type: 'event', eventId: nextEventId() });
      } else if (roll < 0.85) {
        options.push({ id, type: 'rest' });
      } else {
        options.push({ id, type: 'shop' });
      }
    }
    floors.push({ index: i, options });
  }

  return floors;
}
