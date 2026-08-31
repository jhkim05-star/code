/**
 * 규칙 기반 주간 계획 생성기.
 *
 * 운동계획 탭에서 요일마다 원하는 부위를 고르면, 그 조합을 바탕으로 종목을 뽑아
 * 하루 계획을 만듭니다. 같은 부위 조합이 한 주에 여러 번 나오면(예: 가슴 날이 월·목)
 * 두 날의 종목 구성이 겹치지 않도록 자동으로 다르게 뽑고, 주가 바뀌면 종목 풀이
 * 한 칸씩 밀려서 매주 조금씩 다른 구성이 나옵니다.
 *
 * 가진 기구(설정 > 운동계획 > 기구)와 비추천으로 표시한 종목은 후보에서 제외됩니다.
 */

import { byGroup, GROUPS, GROUP_NAME, findExercise } from './exercises.js';
import { settings, rotation, customExercises, avoidExerciseIds } from './store.js';
import { weekStartOf, ymd, addDays, parseYmd, uid, rotate } from './util.js';

/** 빠른 시작용 프리셋 — 운동계획 탭에서 "이걸로 시작" 버튼에 씁니다 */
export const PRESETS = [
  {
    id: 'push_pull_legs1',
    label: '2분할 + 하체 주1회',
    week: {
      1: ['chest', 'delt_f', 'triceps'],
      2: ['back', 'delt_sr', 'biceps'],
      3: [],
      4: ['chest', 'delt_f', 'triceps'],
      5: ['back', 'delt_sr', 'biceps'],
      6: [],
      0: ['thighs', 'glutes', 'calves'],
    },
  },
  {
    id: 'full_body3',
    label: '무분할 주3회',
    week: {
      1: ['chest', 'back', 'thighs', 'delt_f'],
      2: [],
      3: ['back', 'chest', 'glutes', 'biceps'],
      4: [],
      5: ['thighs', 'delt_sr', 'triceps', 'core'],
      6: [],
      0: [],
    },
  },
  {
    id: 'ppl6',
    label: '3분할(푸시·풀·다리) 주6회',
    week: {
      1: ['chest', 'delt_f', 'triceps'],
      2: ['back', 'delt_sr', 'biceps'],
      3: ['thighs', 'glutes', 'calves'],
      4: ['chest', 'delt_f', 'triceps'],
      5: ['back', 'delt_sr', 'biceps'],
      6: ['thighs', 'glutes', 'calves'],
      0: [],
    },
  },
];

/** 하루에 몇 부위를 고르느냐에 따라 부위별 종목 수를 정합니다 */
function countsFor(groupIds) {
  const n = groupIds.length;
  if (n === 0) return [];
  if (n === 1) return [{ group: groupIds[0], count: 6 }];
  if (n === 2) return [{ group: groupIds[0], count: 4 }, { group: groupIds[1], count: 3 }];
  if (n === 3) return groupIds.map((g, i) => ({ group: g, count: i === 0 ? 3 : 2 }));
  return groupIds.map((g, i) => ({ group: g, count: i < 4 ? 2 : 1 }));
}

/** 종목 수에 따른 tier 배치 — 항상 복합관절로 시작해서 고립운동으로 끝납니다 */
const SHAPES = {
  1: [1],
  2: [1, 3],
  3: [1, 2, 3],
  4: [1, 2, 3, 3],
  5: [1, 1, 2, 3, 3],
  6: [1, 1, 2, 2, 3, 3],
  7: [1, 1, 2, 2, 3, 3, 3],
};

/**
 * 한 부위에서 종목을 고릅니다.
 *
 * variantIdx  이 조합이 이번 주에 몇 번째로 나오는지 (0, 1, 2 … = A, B, C …).
 *             같은 주 안에서 겹치지 않도록 인덱스를 벌려 둡니다.
 * rot         주차 카운터. 주가 바뀔 때마다 풀이 밀려 다른 종목이 나옵니다.
 */
function pickForGroup(group, count, variantIdx, variantCount, rot, custom, used, equipment, avoid) {
  const pool = byGroup(group, custom, equipment, avoid);
  if (!pool.length) return [];

  const tiers = { 1: [], 2: [], 3: [] };
  for (const x of pool) (tiers[x.tier] || tiers[2]).push(x);

  // A/B 두 벌이 겹치지 않으려면 한 tier 안에 최소 variantCount 개가 있어야 합니다.
  // 모자라면 가까운 tier 를 끌어와 후보를 넓힙니다. (예: 삼두 마무리 종목은 하나뿐)
  const bucketFor = (t) => {
    const merged = [];
    for (const cand of [t, t + 1, t - 1, t + 2, t - 2]) {
      for (const x of tiers[cand] || []) if (!merged.includes(x)) merged.push(x);
      if (merged.length >= variantCount) break;
    }
    return merged.length ? merged : pool;
  };

  const shape = SHAPES[count] || SHAPES[3];
  const seen = new Map();       // 같은 tier 가 여러 번 나오면 서로 다른 종목이 나오도록
  const out = [];

  for (const t of shape) {
    const bucket = bucketFor(t);
    const occ = seen.get(t) || 0;
    seen.set(t, occ + 1);

    const base = rot * variantCount + variantIdx + occ * variantCount;
    const ordered = rotate(bucket, base);
    const pickedEx = ordered.find(x => !used.has(x.id)) || ordered[0];
    used.add(pickedEx.id);
    out.push(pickedEx);
  }
  return out;
}

/** 종목 하나로 계획의 "블록"을 만듭니다. 세트마다 목표 무게·횟수를 따로 갖습니다. */
function blockFrom(ex, lastWeight = null) {
  return {
    exerciseId: ex.id,
    name: ex.name,
    group: ex.group,
    equip: ex.equip,
    rest: ex.rest,
    tempo: ex.tempo ?? 3,
    sets: Array.from({ length: ex.sets }, () => ({ reps: ex.reps, weight: lastWeight })),
  };
}

/** 지난 기록에서 이 종목의 마지막 무게를 찾아 미리 채워 줍니다 */
function lastWeightFor(exerciseId, sessions) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    for (const entry of sessions[i].entries || []) {
      if (entry.exerciseId !== exerciseId) continue;
      const done = (entry.sets || []).filter(s => s.done && s.weight != null);
      if (done.length) return done.at(-1).weight;
    }
  }
  return null;
}

/**
 * 하루 계획을 만듭니다.
 * @param {string[]} groupIds  그날 할 부위 목록. 빈 배열 = 휴식
 * @param {number} variantIdx  이 부위 조합이 이번 주에 몇 번째로 나오는지 (0부터)
 */
export function buildDay({ date, dow, groupIds, variantIdx, variantCount, custom, rot, equipment, avoid, sessions }) {
  if (!groupIds || !groupIds.length) {
    return { id: uid('day'), date, dow, groupIds: [], title: '휴식', shortTitle: '휴식', blocks: [] };
  }

  const used = new Set();
  const blocks = [];
  for (const g of countsFor(groupIds)) {
    for (const ex of pickForGroup(g.group, g.count, variantIdx, variantCount, rot, custom, used, equipment, avoid)) {
      blocks.push(blockFrom(ex, lastWeightFor(ex.id, sessions)));
    }
  }

  const groupNames = groupIds.map(g => GROUP_NAME[g] || g);
  const letter = String.fromCharCode(65 + variantIdx);
  const suffix = variantCount > 1 ? ` (${letter})` : '';
  return {
    id: uid('day'),
    date, dow,
    groupIds,
    title: `${groupNames.join(' · ')}${suffix}`,
    shortTitle: `${groupNames[0]}${suffix}`,
    blocks,
  };
}

/**
 * 한 주 전체 계획을 만듭니다.
 * @param {Date|string} anyDayOfWeek  그 주에 속한 아무 날짜
 */
export function generateWeek(anyDayOfWeek = new Date(), opts = {}) {
  const s = settings();
  const plan = { ...s.plan, ...(opts.plan || {}) };
  const custom = customExercises();
  const avoid = avoidExerciseIds();
  const sessions = opts.sessions || [];

  const start = weekStartOf(typeof anyDayOfWeek === 'string' ? parseYmd(anyDayOfWeek) : anyDayOfWeek);
  const weekStart = ymd(start);

  // 주차 카운터 — 이 앱을 처음 쓴 주로부터 몇 주가 지났는지로 계산해서
  // 같은 주를 다시 생성하면 같은 결과가 나오도록(재현 가능) 합니다.
  const epoch = new Date(2024, 0, 1);
  const weekIndex = Math.floor((start - epoch) / (7 * 864e5));
  const rotBase = rotation().global || 0;
  const rot = weekIndex + rotBase + (opts.reroll || 0);

  // 같은 부위 조합이 이번 주에 몇 번째로 나오는지 세어 A/B/C 를 자동으로 매깁니다
  const seenSignature = new Map();
  const variantCount = plan.variantsPerGroup || 2;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    const groupIds = plan.week[dow] || [];
    const sig = [...groupIds].sort().join('+');
    const variantIdx = groupIds.length ? (seenSignature.get(sig) || 0) : 0;
    if (groupIds.length) seenSignature.set(sig, variantIdx + 1);

    days.push(buildDay({
      date: ymd(d), dow, groupIds, variantIdx, variantCount,
      custom, rot, equipment: plan.equipment, avoid, sessions,
    }));
  }

  return {
    weekStart,
    createdAt: Date.now(),
    source: 'rule',
    note: '',
    days,
  };
}

/** AI 가 돌려준 계획을 앱 데이터 구조로 정리 + 검증 */
export function normalizeAiPlan(raw, weekStart, sessions = []) {
  const custom = customExercises();
  const start = parseYmd(weekStart);
  const byName = new Map();
  for (const g of GROUPS) {
    for (const x of byGroup(g.id, custom)) byName.set(x.name.replace(/\s/g, ''), x);
  }

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    const date = ymd(d);
    const rawDay = (raw.days || []).find(x => x.date === date || x.dow === dow) || null;

    if (!rawDay || rawDay.type === 'rest' || !(rawDay.blocks || rawDay.exercises || []).length) {
      days.push({ id: uid('day'), date, dow, groupIds: [], title: '휴식', shortTitle: '휴식', blocks: [] });
      continue;
    }

    const blocks = [];
    for (const b of (rawDay.blocks || rawDay.exercises)) {
      const key = String(b.name || b.exercise || '').replace(/\s/g, '');
      const known = (b.exerciseId && findExercise(b.exerciseId, custom)) || byName.get(key);
      const ex = known || {
        id: `ai_${key || uid('ex')}`,
        name: b.name || b.exercise || '이름 없는 운동',
        group: b.group || 'core', equip: '기타',
        tier: 2, sets: 3, reps: 10, rest: 90, tempo: 3,
      };
      const sets = Number.isFinite(+b.sets) ? Math.round(+b.sets) : ex.sets;
      const reps = Number.isFinite(+b.reps) ? Math.round(+b.reps) : ex.reps;
      const rest = Number.isFinite(+b.rest) ? Math.round(+b.rest) : ex.rest;
      const lastW = lastWeightFor(ex.id, sessions);
      blocks.push({
        exerciseId: ex.id, name: ex.name, group: ex.group, equip: ex.equip,
        rest, tempo: Number.isFinite(+b.tempo) ? +b.tempo : (ex.tempo ?? 3),
        note: b.note ? String(b.note).slice(0, 120) : '',
        sets: Array.from({ length: sets }, () => ({ reps, weight: lastW })),
      });
    }

    const groupIds = [...new Set(blocks.map(b => b.group))];
    const groupNames = groupIds.map(g => GROUP_NAME[g] || g);
    days.push({
      id: uid('day'),
      date, dow, groupIds,
      title: rawDay.title || groupNames.join(' · '),
      shortTitle: rawDay.shortTitle || (rawDay.title || groupNames[0] || '운동').slice(0, 12),
      blocks,
    });
  }

  return {
    weekStart,
    createdAt: Date.now(),
    source: 'ai',
    note: String(raw.note || raw.summary || '').slice(0, 500),
    days,
  };
}

/** 오늘 바로 만드는 자유운동 하루 (계획 없이 그 자리에서 종목을 골라 채웁니다) */
export function buildFreeDay(date) {
  const d = parseYmd(date);
  return {
    id: uid('day'),
    date,
    dow: d.getDay(),
    groupIds: [],
    free: true,
    title: '자유운동',
    shortTitle: '자유운동',
    blocks: [],
  };
}
