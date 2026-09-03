/**
 * 규칙 기반 주간 계획 생성기.
 *
 * 운동계획 탭에서 요일마다 원하는 부위를 고르면, 그 조합을 바탕으로 종목을 뽑아
 * 하루 계획을 만듭니다.
 *
 *   · 하루 안에서 같은 부위 종목은 동작 패턴(밀기/당기기/힌지…)이 서로 다르게 뽑고,
 *   · 다른 날에는 되도록 다른 종목이 나오도록 한 주 전체에서 겹침을 피하고,
 *   · 하루 운동 시간(분)을 정해 두면 그 시간에 맞는 종목 수로 맞추고,
 *   · 무게는 ① 지난 기록(점진적 과부하) → ② 기준 무게 환산 순으로 미리 채웁니다.
 *
 * 가진 기구(운동계획 > 기구)와 비추천으로 표시한 종목은 후보에서 제외됩니다.
 */

import { byGroup, GROUPS, GROUP_NAME, findExercise, patternOf } from './exercises.js';
import { settings, rotation, customExercises, avoidExerciseIds } from './store.js';
import { estimateWeight, resolveBenchmarks, warmupSets } from './weights.js';
import { weekStartOf, ymd, addDays, parseYmd, uid, rotate, clamp } from './util.js';

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

// ── 하루 분량 ────────────────────────────────────────────────
/** 종목 하나에 대충 몇 분 걸리는지 (세트 시간 + 휴식 + 자리 잡는 시간) */
const MIN_PER_EXERCISE = 7.5;
const SETUP_MIN = 5;          // 옷 갈아입고 준비하는 시간

/** 하루 운동 시간(분)으로 종목 수를 추천합니다 */
export function recommendExerciseCount(minutes) {
  const usable = Math.max(10, (Number(minutes) || 60) - SETUP_MIN);
  return clamp(Math.round(usable / MIN_PER_EXERCISE), 2, 10);
}

/** 종목 하나에 걸리는 시간(초) — 세트마다 휴식이 따로면 그 값을 씁니다(웜업) */
export function estimateBlockSeconds(b) {
  const tempo = b.tempo ?? 3;
  return (b.sets || []).reduce((a, s) => a + (s.reps || 0) * tempo + (s.rest ?? b.rest ?? 90), 0) + 60;
}

export const estimateBlocksSeconds = (blocks) =>
  (blocks || []).reduce((a, b) => a + estimateBlockSeconds(b), 0);

/** 하루 계획에 걸리는 시간(분) */
export const estimateDayMinutes = (day) =>
  Math.round((estimateBlocksSeconds(day?.blocks) + SETUP_MIN * 60) / 60);

/**
 * 부위별 종목 수.
 * @param {number|null} total  전체 종목 수를 정해 두면 부위별로 나눠 담습니다.
 */
function countsFor(groupIds, total = null) {
  const n = groupIds.length;
  if (n === 0) return [];

  if (total == null) {
    if (n === 1) return [{ group: groupIds[0], count: 6 }];
    if (n === 2) return [{ group: groupIds[0], count: 4 }, { group: groupIds[1], count: 3 }];
    if (n === 3) return groupIds.map((g, i) => ({ group: g, count: i === 0 ? 3 : 2 }));
    return groupIds.map((g, i) => ({ group: g, count: i < 4 ? 2 : 1 }));
  }

  // 앞쪽(그날의 주 부위)에 한 종목씩 더 얹습니다
  const want = Math.max(total, n);
  const base = Math.floor(want / n);
  const extra = want % n;
  return groupIds.map((g, i) => ({ group: g, count: Math.max(1, base + (i < extra ? 1 : 0)) }));
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

function shapeFor(count) {
  if (SHAPES[count]) return SHAPES[count];
  if (count < 1) return [];
  const out = [1, 1];
  while (out.length < count) out.push(out.length < Math.ceil(count / 2) + 1 ? 2 : 3);
  return out.slice(0, count);
}

/**
 * 한 부위에서 종목을 고릅니다.
 *
 * variantIdx  이 조합이 이번 주에 몇 번째로 나오는지 (0, 1, 2 … = A, B, C …).
 * rot         주차 카운터. 주가 바뀔 때마다 풀이 밀려 다른 종목이 나옵니다.
 * weekUsed    이번 주 다른 날에 이미 쓴 종목 id — 되도록 피합니다.
 *
 * 같은 부위에서 여러 종목을 고를 때는 동작 패턴(밀기·당기기·힌지…)이 겹치지 않는
 * 쪽을 먼저 고릅니다. 가슴이면 프레스 다음엔 플라이, 등이면 수직 당기기 다음엔
 * 수평 로우가 나오는 식입니다.
 */
function pickForGroup({ group, count, variantIdx, variantCount, rot, custom, used, weekUsed, equipment, avoid }) {
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

  const shape = shapeFor(count);
  const seen = new Map();          // 같은 tier 가 여러 번 나오면 서로 다른 종목이 나오도록
  const patternsUsed = new Set();  // 이 부위에서 오늘 이미 쓴 동작 패턴
  const equipUsed = new Set();
  const out = [];

  for (const t of shape) {
    const bucket = bucketFor(t);
    const occ = seen.get(t) || 0;
    seen.set(t, occ + 1);

    const base = rot * variantCount + variantIdx + occ * variantCount;
    const ordered = rotate(bucket, base);

    let best = null;
    let bestScore = -Infinity;
    ordered.forEach((x, i) => {
      if (used.has(x.id)) return;                              // 하루 안 중복은 금지
      let score = -i * 0.01;                                   // 로테이션 순서는 약한 기준
      if (weekUsed?.has(x.id)) score -= 10;                    // 다른 날에 이미 나온 종목
      if (patternsUsed.has(patternOf(x))) score -= 5;          // 같은 결의 동작 반복
      if (equipUsed.has(x.equip)) score -= 1;                  // 같은 기구만 계속 쓰지 않게
      if (score > bestScore) { bestScore = score; best = x; }
    });

    const pickedEx = best || ordered.find(x => !used.has(x.id)) || ordered[0];
    used.add(pickedEx.id);
    weekUsed?.add(pickedEx.id);
    patternsUsed.add(patternOf(pickedEx));
    equipUsed.add(pickedEx.equip);
    out.push(pickedEx);
  }
  return out;
}

const OVERLOAD_STEP = 2.5;   // 흔한 원판 조합 기준 최소 증량 단위(kg)

/**
 * 지난 기록을 보고 이번엔 몇 kg 으로 할지 제안합니다 (점진적 과부하).
 *   · 가장 최근에 이 종목을 한 날, 가장 무거웠던 세트 기준으로
 *     — 목표 횟수를 전부(또는 그 이상) 채웠으면 → 살짝 올려서 제안
 *     — 목표에 못 미쳤으면 → 같은 무게로 다시 (무리하게 올리지 않음)
 *   · 웜업 세트는 셈에서 뺍니다.
 *   · 기록이 아예 없으면 null (그때는 기준 무게에서 환산합니다)
 */
export function suggestWeight(exerciseId, sessions) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const entry = (sessions[i].entries || []).find(e => e.exerciseId === exerciseId);
    if (!entry) continue;
    const done = (entry.sets || []).filter(s => s.done && s.weight != null && !s.warmup);
    if (!done.length) continue;

    const top = done.reduce((a, b) => (b.weight > a.weight ? b : a));
    const metTarget = (top.reps ?? 0) >= (top.targetReps ?? top.reps ?? 0);

    return metTarget
      ? { weight: Math.round((top.weight + OVERLOAD_STEP) * 2) / 2, note: `지난번(${top.weight}kg) 목표를 채워서 +${OVERLOAD_STEP}kg 제안` }
      : { weight: top.weight, note: `지난번 목표에 못 미쳐 같은 무게(${top.weight}kg)로 다시` };
  }
  return null;
}

/**
 * 이 종목을 몇 kg 으로 시작할지 정합니다.
 *   1) 이 종목을 한 기록이 있으면 → 점진적 과부하 제안
 *   2) 없으면 → 기준 무게(입력값 또는 기록에서 역산)로 환산
 *   3) 그것도 없으면 → null (사용자가 직접 넣습니다)
 * @param {object} opts { sessions, marks, benchmarks, custom }
 */
export function recommendWeight(exercise, opts = {}) {
  const custom = opts.custom || customExercises();
  const ex = typeof exercise === 'string' ? findExercise(exercise, custom) : exercise;
  if (!ex) return null;

  const sessions = opts.sessions || [];
  const fromHistory = suggestWeight(ex.id, sessions);
  if (fromHistory) return fromHistory;

  const marks = opts.marks || resolveBenchmarks(opts.benchmarks ?? settings().plan.benchmarks, sessions);
  const est = estimateWeight(ex, marks, custom);
  return est ? { weight: est.weight, note: est.note } : null;
}

/** 종목 하나로 계획의 "블록"을 만듭니다. 세트마다 목표 무게·횟수를 따로 갖습니다. */
function blockFrom(ex, suggestion = null, opts = {}) {
  const weight = suggestion?.weight ?? null;
  const work = Array.from({ length: ex.sets }, () => ({ reps: ex.reps, weight }));
  // 웜업은 그날의 메인(복합관절) 종목에만 붙입니다 — 고립운동까지 붙이면 시간이 두 배가 됩니다
  const warm = (opts.warmup && ex.tier === 1) ? warmupSets(weight, ex.reps, ex.equip) : [];

  return {
    exerciseId: ex.id,
    name: ex.name,
    group: ex.group,
    equip: ex.equip,
    rest: ex.rest,
    tempo: ex.tempo ?? 3,
    overloadNote: suggestion?.note || '',
    sets: [...warm, ...work],
  };
}

/**
 * 종목 하나를 계획 블록으로 만듭니다.
 * 운동 중에 종목을 추가하거나 바꿀 때도 같은 규칙(기록 → 기준 무게, 웜업)이
 * 적용되도록 여기 한 곳에 모아 둡니다.
 */
export function makeBlock(exercise, opts = {}) {
  const custom = opts.custom || customExercises();
  const ex = typeof exercise === 'string' ? findExercise(exercise, custom) : exercise;
  if (!ex) return null;
  const warmup = opts.warmup ?? !!settings().plan.warmup;
  return blockFrom(ex, recommendWeight(ex, { ...opts, custom }), { warmup });
}

/** 시간 예산을 넘으면 종목을 뒤에서부터 덜어 냅니다 (부위마다 최소 1개는 남김) */
function trimToBudget(blocks, groupIds, budgetSec) {
  if (!budgetSec) return blocks;
  const minPerGroup = 1;

  while (estimateBlocksSeconds(blocks) > budgetSec * 1.08) {
    const byGroupCount = new Map();
    for (const b of blocks) byGroupCount.set(b.group, (byGroupCount.get(b.group) || 0) + 1);

    // 가장 종목이 많은 부위의 마지막(가장 고립에 가까운) 종목부터
    let target = null;
    let most = minPerGroup;
    for (const [g, n] of byGroupCount) if (n > most) { most = n; target = g; }
    if (!target) break;

    const idx = blocks.map(b => b.group).lastIndexOf(target);
    if (idx < 0) break;
    blocks.splice(idx, 1);
    if (blocks.length <= groupIds.length) break;
  }
  return blocks;
}

/**
 * 하루 계획을 만듭니다.
 * @param {string[]} groupIds  그날 할 부위 목록. 빈 배열 = 휴식
 * @param {number} variantIdx  이 부위 조합이 이번 주에 몇 번째로 나오는지 (0부터)
 */
export function buildDay({
  date, dow, groupIds, variantIdx, variantCount, custom, rot,
  equipment, avoid, sessions, weekUsed, marks, warmup, minutes,
}) {
  if (!groupIds || !groupIds.length) {
    return { id: uid('day'), date, dow, groupIds: [], title: '휴식', shortTitle: '휴식', blocks: [] };
  }

  const total = minutes ? recommendExerciseCount(minutes) : null;
  const used = new Set();
  const blocks = [];

  for (const g of countsFor(groupIds, total)) {
    const picked = pickForGroup({
      group: g.group, count: g.count, variantIdx, variantCount, rot,
      custom, used, weekUsed, equipment, avoid,
    });
    for (const ex of picked) {
      blocks.push(blockFrom(ex, recommendWeight(ex, { sessions, marks, custom }), { warmup }));
    }
  }

  trimToBudget(blocks, groupIds, minutes ? minutes * 60 : 0);

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
  const marks = resolveBenchmarks(plan.benchmarks, sessions);

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
  // 한 주 안에서는 되도록 다른 종목이 나오도록 — 날마다 종목 자체를 바꿉니다
  const weekUsed = new Set();

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
      weekUsed, marks, warmup: !!plan.warmup, minutes: plan.sessionMinutes || 0,
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
  const s = settings();
  const marks = resolveBenchmarks(s.plan.benchmarks, sessions);
  const warmup = !!s.plan.warmup;
  const start = parseYmd(weekStart);
  const byName = new Map();
  for (const g of GROUPS) {
    for (const x of byGroup(g.id, custom)) byName.set(x.name.replace(/\s/g, ''), x);
  }

  // AI 에게는 가진 기구로 거른 목록만 보여 주지만, 그래도 목록 밖 종목을 내놓을 수
  // 있습니다. 그때는 같은 부위에서 실제로 할 수 있는 종목으로 바꿔 둡니다 —
  // 기구가 없어서 못 하는 운동이 계획에 남으면 그날 통째로 못 쓰게 되니까요.
  const equipment = s.plan.equipment || [];
  const avoid = avoidExerciseIds();
  const usable = (ex) => !equipment.length || equipment.includes(ex.equip);
  const toUsable = (ex, usedToday) => {
    if (usable(ex)) return ex;
    const pool = byGroup(ex.group, custom, equipment, avoid);
    if (!pool.length) return ex;
    // 성격이 가장 비슷한(tier 가 가까운) 것으로, 그날 이미 쓴 종목은 피해서
    const ranked = [...pool].sort((a, b) => Math.abs(a.tier - ex.tier) - Math.abs(b.tier - ex.tier));
    return ranked.find(x => !usedToday.has(x.id)) || ranked[0];
  };

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
    const usedToday = new Set();
    for (const b of (rawDay.blocks || rawDay.exercises)) {
      const key = String(b.name || b.exercise || '').replace(/\s/g, '');
      const known = (b.exerciseId && findExercise(b.exerciseId, custom)) || byName.get(key);
      const ex = toUsable(known || {
        id: `ai_${key || uid('ex')}`,
        name: b.name || b.exercise || '이름 없는 운동',
        group: b.group || 'core', equip: '기타',
        tier: 2, sets: 3, reps: 10, rest: 90, tempo: 3,
      }, usedToday);
      usedToday.add(ex.id);
      const sets = Number.isFinite(+b.sets) ? Math.round(+b.sets) : ex.sets;
      const reps = Number.isFinite(+b.reps) ? Math.round(+b.reps) : ex.reps;
      const rest = Number.isFinite(+b.rest) ? Math.round(+b.rest) : ex.rest;
      const suggestion = recommendWeight(ex, { sessions, marks, custom });
      const weight = suggestion?.weight ?? null;
      const warm = (warmup && ex.tier === 1) ? warmupSets(weight, reps, ex.equip) : [];
      blocks.push({
        exerciseId: ex.id, name: ex.name, group: ex.group, equip: ex.equip,
        rest, tempo: Number.isFinite(+b.tempo) ? +b.tempo : (ex.tempo ?? 3),
        note: b.note ? String(b.note).slice(0, 120) : '',
        overloadNote: suggestion?.note || '',
        sets: [...warm, ...Array.from({ length: sets }, () => ({ reps, weight }))],
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
