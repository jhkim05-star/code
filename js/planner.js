/**
 * 규칙 기반 주간 계획 생성기.
 *
 * 기본 규칙 (설정 > 루틴에서 바꿀 수 있습니다):
 *   · 가슴/등 2분할.  가슴 날에는 어깨 전면 + 삼두, 등 날에는 어깨 측후면 + 이두를 붙입니다.
 *     (미는 동작끼리, 당기는 동작끼리 묶여 어깨·팔이 중복으로 지치지 않습니다)
 *   · 부위마다 A/B 두 벌의 종목 구성을 만들어 한 주에 두 번, 서로 다른 종목으로 돌립니다.
 *   · 하체는 주 1회, 일요일.
 *   · 주가 바뀌면 종목 풀이 한 칸씩 밀려서 매주 조금씩 다른 구성이 나옵니다.
 */

import { byGroup, GROUP_NAME, findExercise } from './exercises.js';
import { settings, rotation, customExercises } from './store.js';
import { weekStartOf, ymd, addDays, parseYmd, uid, rotate } from './util.js';

/** 하루 구성: 어느 부위를 몇 종목 할지 */
export const DAY_TEMPLATES = {
  push: {
    label: '가슴',
    groups: [
      { group: 'chest',   count: 3 },
      { group: 'delt_f',  count: 2 },
      { group: 'triceps', count: 2 },
    ],
  },
  pull: {
    label: '등',
    groups: [
      { group: 'back',    count: 3 },
      { group: 'delt_sr', count: 2 },
      { group: 'biceps',  count: 2 },
    ],
  },
  legs: {
    label: '하체',
    groups: [
      { group: 'legs', count: 5 },
    ],
  },
};

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
 * variantIdx  0 = A, 1 = B.  같은 주 안에서 A와 B가 겹치지 않도록 인덱스를 벌려 둡니다.
 * rot         주차 카운터. 주가 바뀔 때마다 풀이 밀려 다른 종목이 나옵니다.
 */
function pickForGroup(group, count, variantIdx, variantCount, rot, custom, used) {
  const pool = byGroup(group, custom);
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

    // 이번 주 시작점 + A/B 간격 + 같은 tier 반복 오프셋
    const base = rot * variantCount + variantIdx + occ * variantCount;
    const ordered = rotate(bucket, base);
    const pickedEx = ordered.find(x => !used.has(x.id)) || ordered[0];
    used.add(pickedEx.id);
    out.push(pickedEx);
  }
  return out;
}

function blockFrom(ex) {
  return {
    exerciseId: ex.id,
    name: ex.name,
    group: ex.group,
    sets: ex.sets,
    reps: ex.reps,
    rest: ex.rest,
    tempo: ex.tempo ?? 3,
    weight: null,        // 지난 기록에서 채워 넣습니다
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

export function buildDay({ date, dow, type, variant, custom, rot, includeCore, sessions }) {
  const tpl = DAY_TEMPLATES[type];
  if (!tpl) return { date, dow, type: 'rest', title: '휴식', blocks: [] };

  const s = settings();
  const variantCount = s.routine.variantsPerGroup || 2;
  const variantIdx = Math.max(0, (variant || 'A').charCodeAt(0) - 65);
  const used = new Set();

  const groups = [...tpl.groups];
  if (includeCore && type === 'legs') groups.push({ group: 'core', count: 2 });
  if (includeCore && type === 'pull') groups.push({ group: 'core', count: 1 });

  const blocks = [];
  for (const g of groups) {
    for (const ex of pickForGroup(g.group, g.count, variantIdx, variantCount, rot, custom, used)) {
      const b = blockFrom(ex);
      b.weight = lastWeightFor(ex.id, sessions);
      blocks.push(b);
    }
  }

  const groupNames = [...new Set(blocks.map(b => b.group))].map(g => GROUP_NAME[g]);
  return {
    id: uid('day'),
    date,
    dow,
    type,
    variant: variant || 'A',
    title: `${groupNames.join(' · ')} (${variant || 'A'})`,
    shortTitle: `${tpl.label} ${variant || 'A'}`,
    blocks,
  };
}

/**
 * 한 주 전체 계획을 만듭니다.
 * @param {Date|string} anyDayOfWeek  그 주에 속한 아무 날짜
 */
export function generateWeek(anyDayOfWeek = new Date(), opts = {}) {
  const s = settings();
  const routine = { ...s.routine, ...(opts.routine || {}) };
  const custom = customExercises();
  const sessions = opts.sessions || [];

  const start = weekStartOf(typeof anyDayOfWeek === 'string' ? parseYmd(anyDayOfWeek) : anyDayOfWeek);
  const weekStart = ymd(start);

  // 주차 카운터 — 이 앱을 처음 쓴 주로부터 몇 주가 지났는지로 계산해서
  // 같은 주를 다시 생성하면 같은 결과가 나오도록(재현 가능) 합니다.
  const epoch = new Date(2024, 0, 1);
  const weekIndex = Math.floor((start - epoch) / (7 * 864e5));
  const rotBase = rotation().global || 0;
  const rot = weekIndex + rotBase + (opts.reroll || 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    const slot = routine.week[dow];
    if (!slot) {
      days.push({ id: uid('day'), date: ymd(d), dow, type: 'rest', title: '휴식', shortTitle: '휴식', blocks: [] });
      continue;
    }
    days.push(buildDay({
      date: ymd(d),
      dow,
      type: slot.type,
      variant: slot.variant,
      custom,
      rot,
      includeCore: routine.includeCore,
      sessions,
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
  for (const x of [...byGroup('chest', custom), ...byGroup('back', custom), ...byGroup('delt_f', custom),
                   ...byGroup('delt_sr', custom), ...byGroup('biceps', custom), ...byGroup('triceps', custom),
                   ...byGroup('legs', custom), ...byGroup('core', custom)]) {
    byName.set(x.name.replace(/\s/g, ''), x);
  }

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const dow = d.getDay();
    const date = ymd(d);
    const rawDay = (raw.days || []).find(x => x.date === date || x.dow === dow) || null;

    if (!rawDay || rawDay.type === 'rest' || !(rawDay.blocks || rawDay.exercises || []).length) {
      days.push({ id: uid('day'), date, dow, type: 'rest', title: '휴식', shortTitle: '휴식', blocks: [] });
      continue;
    }

    const blocks = [];
    for (const b of (rawDay.blocks || rawDay.exercises)) {
      const key = String(b.name || b.exercise || '').replace(/\s/g, '');
      const known = (b.exerciseId && findExercise(b.exerciseId, custom)) || byName.get(key);
      const ex = known || {
        id: `ai_${key || uid('ex')}`,
        name: b.name || b.exercise || '이름 없는 운동',
        group: b.group || 'core',
        tier: 2, sets: 3, reps: 10, rest: 90, tempo: 3,
      };
      const block = blockFrom(ex);
      if (Number.isFinite(+b.sets)) block.sets = Math.round(+b.sets);
      if (Number.isFinite(+b.reps)) block.reps = Math.round(+b.reps);
      if (Number.isFinite(+b.rest)) block.rest = Math.round(+b.rest);
      if (Number.isFinite(+b.tempo)) block.tempo = +b.tempo;
      if (b.note) block.note = String(b.note).slice(0, 120);
      block.weight = lastWeightFor(block.exerciseId, sessions);
      blocks.push(block);
    }

    const groupNames = [...new Set(blocks.map(b => b.group))].map(g => GROUP_NAME[g] || g);
    days.push({
      id: uid('day'),
      date, dow,
      type: rawDay.type || 'custom',
      variant: rawDay.variant || 'A',
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
