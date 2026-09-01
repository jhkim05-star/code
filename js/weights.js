/**
 * 무게 추천.
 *
 * "모든 무게가 0이라 매번 손으로 넣어야 하는" 문제를 없애기 위한 계산기입니다.
 * 기준이 되는 네 종목(벤치프레스 · 랫풀다운 · 스쿼트 · 오버헤드프레스)의 무게만
 * 알면, 나머지 종목은 그 비율로 환산해서 시작 무게를 채울 수 있습니다.
 *
 * 기준 무게는 두 곳에서 옵니다:
 *   1) 운동계획 탭에서 직접 입력한 값
 *   2) 없으면 지난 기록에서 역산한 값 (예: 스미스머신 벤치 60kg → 벤치프레스 60kg 수준)
 *
 * 비율은 "그 종목의 기본 목표 횟수로 할 만한 무게" 기준의 어림값입니다.
 * 어디까지나 출발점이고, 실제로 한 기록이 쌓이면 그 기록이 우선합니다(planner.js).
 */

import { findExercise } from './exercises.js';

/** 사용자가 직접 넣는 기준 종목 */
export const BENCHMARKS = [
  { id: 'bench',    name: '벤치프레스',     anchor: 'bb_bench',     hint: '8회쯤 할 수 있는 무게' },
  { id: 'pulldown', name: '랫풀다운',       anchor: 'lat_pulldown', hint: '12회쯤' },
  { id: 'squat',    name: '스쿼트',         anchor: 'back_squat',   hint: '6~8회쯤' },
  { id: 'ohp',      name: '오버헤드프레스', anchor: 'ohp',          hint: '8회쯤' },
];

export const BENCHMARK_IDS = BENCHMARKS.map(b => b.id);
const BENCHMARK_NAME = Object.fromEntries(BENCHMARKS.map(b => [b.id, b.name]));

/**
 * 종목별 환산 비율 — [기준 종목, 비율].
 * 덤벨 종목은 "한쪽 덤벨" 기준입니다(양손 합이 아님).
 */
const RATIO = {
  // ── 가슴 ──
  bb_bench: ['bench', 1], smith_bench: ['bench', 1], bb_incline: ['bench', 0.85],
  smith_incline: ['bench', 0.85], machine_press: ['bench', 0.9],
  db_bench: ['bench', 0.4], db_incline: ['bench', 0.35],
  db_fly: ['bench', 0.18], incline_fly: ['bench', 0.16],
  cable_cross: ['bench', 0.15], pec_deck: ['bench', 0.5],

  // ── 등 ── (수직 당기기는 랫풀다운, 데드리프트 계열은 스쿼트 기준)
  lat_pulldown: ['pulldown', 1], lat_close: ['pulldown', 0.95],
  bb_row: ['pulldown', 0.9], smith_row: ['pulldown', 0.9], pendlay: ['pulldown', 0.85],
  tbar_row: ['pulldown', 0.8], seated_row: ['pulldown', 0.95], chest_sup_row: ['pulldown', 0.8],
  db_row: ['pulldown', 0.4], cable_row_1arm: ['pulldown', 0.4],
  straight_pull: ['pulldown', 0.45], db_pullover: ['pulldown', 0.3],
  deadlift: ['squat', 1.2], smith_deadlift: ['squat', 1.2],

  // ── 어깨 전면 ──
  ohp: ['ohp', 1], smith_ohp: ['ohp', 1], machine_sp: ['ohp', 0.9],
  db_shoulder: ['ohp', 0.4], arnold: ['ohp', 0.35],
  front_raise: ['ohp', 0.15], cable_front: ['ohp', 0.15], plate_front: ['ohp', 0.3],

  // ── 어깨 측후면 ──
  side_raise: ['ohp', 0.12], cable_side: ['ohp', 0.12], bent_lateral: ['ohp', 0.12],
  machine_side: ['ohp', 0.5], rear_pec_deck: ['ohp', 0.5],
  face_pull: ['ohp', 0.35], upright_row: ['ohp', 0.5], smith_upright: ['ohp', 0.5],

  // ── 이두 ──
  bb_curl: ['pulldown', 0.45], ez_curl: ['pulldown', 0.45], smith_drag_curl: ['pulldown', 0.4],
  preacher: ['pulldown', 0.3], cable_curl: ['pulldown', 0.35],
  db_curl: ['pulldown', 0.18], hammer_curl: ['pulldown', 0.2],
  incline_curl: ['pulldown', 0.15], conc_curl: ['pulldown', 0.15],

  // ── 삼두 ──
  cg_bench: ['bench', 0.8], smith_cg_bench: ['bench', 0.8], machine_dip: ['bench', 0.7],
  skullcrusher: ['bench', 0.35], smith_skull: ['bench', 0.35],
  pushdown: ['bench', 0.4], rope_pushdown: ['bench', 0.35], cable_oh_ext: ['bench', 0.3],
  oh_ext: ['bench', 0.25], kickback: ['bench', 0.1],

  // ── 허벅지 ──
  back_squat: ['squat', 1], smith_squat: ['squat', 1],
  front_squat: ['squat', 0.8], smith_front_squat: ['squat', 0.8],
  leg_press: ['squat', 1.8], hack_squat: ['squat', 1.2],
  rdl: ['squat', 0.8], smith_rdl: ['squat', 0.8], stiff_dl: ['squat', 0.7],
  goblet_squat: ['squat', 0.3], smith_lunge: ['squat', 0.4], smith_split: ['squat', 0.4],
  bulgarian: ['squat', 0.25], lunge: ['squat', 0.25],
  leg_ext: ['squat', 0.5], leg_curl: ['squat', 0.35],

  // ── 엉덩이 ──
  hip_thrust: ['squat', 1], smith_thrust: ['squat', 1],
  sumo_dl: ['squat', 1.15], smith_sumo: ['squat', 1.15],
  hip_abduction: ['squat', 0.5], cable_kickback: ['squat', 0.15], step_up: ['squat', 0.2],

  // ── 종아리 ──
  calf_raise: ['squat', 0.8], smith_calf: ['squat', 0.8], seated_calf: ['squat', 0.4],
  leg_press_calf: ['squat', 1.2], db_calf_raise: ['squat', 0.25],

  // ── 코어 ──
  cable_crunch: ['pulldown', 0.5],
};

/** 표에 없는 종목(직접 추가한 종목 등)은 부위 · tier 로 대충 맞춥니다 */
const GROUP_FALLBACK = {
  chest:   ['bench',    { 1: 0.85, 2: 0.6,  3: 0.2  }],
  back:    ['pulldown', { 1: 0.9,  2: 0.8,  3: 0.4  }],
  delt_f:  ['ohp',      { 1: 0.9,  2: 0.6,  3: 0.15 }],
  delt_sr: ['ohp',      { 1: 0.4,  2: 0.15, 3: 0.15 }],
  biceps:  ['pulldown', { 1: 0.45, 2: 0.35, 3: 0.2  }],
  triceps: ['bench',    { 1: 0.75, 2: 0.35, 3: 0.15 }],
  thighs:  ['squat',    { 1: 0.9,  2: 0.5,  3: 0.4  }],
  glutes:  ['squat',    { 1: 1,    2: 0.4,  3: 0.2  }],
  calves:  ['squat',    { 1: 0.7,  2: 0.4,  3: 0.6  }],
  core:    ['pulldown', { 1: 0.4,  2: 0.4,  3: 0.3  }],
};

/** 무게를 안 쓰는(맨몸) 종목 — 추천 대상이 아닙니다 */
const BODYWEIGHT_EQUIP = new Set(['맨몸', '철봉']);
const BODYWEIGHT_IDS = new Set(['ab_rollout']);

const isBodyweight = (ex) => BODYWEIGHT_EQUIP.has(ex.equip) || BODYWEIGHT_IDS.has(ex.id);

/** 바벨류는 2.5kg, 나머지는 1kg 단위로 반올림 (기구 조합이 가능한 단위) */
function roundForEquip(kg, equip) {
  const step = (equip === '바벨' || equip === '스미스머신') ? 2.5 : 1;
  const v = Math.round(kg / step) * step;
  return Math.max(step, Math.round(v * 10) / 10);
}

function ratioFor(ex) {
  const direct = RATIO[ex.id];
  if (direct) return direct;
  const fb = GROUP_FALLBACK[ex.group];
  if (!fb) return null;
  return [fb[0], fb[1][ex.tier] ?? fb[1][2]];
}

/**
 * 기준 무게로부터 이 종목의 시작 무게를 계산합니다.
 * @param {object|string} exercise  종목 객체 또는 id
 * @param {object} marks            { bench, pulldown, squat, ohp } (kg, 없으면 null)
 * @returns {{weight:number, base:string, note:string}|null}
 */
export function estimateWeight(exercise, marks, custom = []) {
  const ex = typeof exercise === 'string' ? findExercise(exercise, custom) : exercise;
  if (!ex || isBodyweight(ex)) return null;

  const r = ratioFor(ex);
  if (!r) return null;
  const [baseId, ratio] = r;
  const baseKg = Number(marks?.[baseId]);
  if (!Number.isFinite(baseKg) || baseKg <= 0) return null;

  return {
    weight: roundForEquip(baseKg * ratio, ex.equip),
    base: baseId,
    note: `기준 무게(${BENCHMARK_NAME[baseId]} ${baseKg}${'kg'})로 잡은 시작 무게`,
  };
}

/**
 * 지난 기록에서 기준 무게를 역산합니다.
 * 기준 종목을 직접 한 기록이 있으면 그 무게를, 없으면 다른 종목의 기록을
 * 비율로 되돌려서 추정합니다. (예: 스미스머신 벤치 60kg → 벤치프레스 60kg)
 * @returns {{bench:number|null, pulldown:number|null, squat:number|null, ohp:number|null}}
 */
export function benchmarksFromHistory(sessions = []) {
  const out = { bench: null, pulldown: null, squat: null, ohp: null };
  const direct = { bench: false, pulldown: false, squat: false, ohp: false };
  const anchorOf = Object.fromEntries(BENCHMARKS.map(b => [b.anchor, b.id]));

  // 최신 기록이 뒤에 있으므로 뒤에서부터 봅니다
  for (let i = sessions.length - 1; i >= 0; i--) {
    for (const entry of sessions[i].entries || []) {
      const done = (entry.sets || []).filter(s => s.done && s.weight > 0 && !s.warmup);
      if (!done.length) continue;
      const top = done.reduce((a, b) => (b.weight > a.weight ? b : a));

      const asAnchor = anchorOf[entry.exerciseId];
      if (asAnchor && !direct[asAnchor]) {
        out[asAnchor] = top.weight;
        direct[asAnchor] = true;
        continue;
      }
      const r = RATIO[entry.exerciseId];
      if (!r) continue;
      const [baseId, ratio] = r;
      if (direct[baseId] || out[baseId] != null || !ratio) continue;
      out[baseId] = Math.round((top.weight / ratio) * 2) / 2;
    }
  }
  return out;
}

/** 입력한 기준 무게 + (빈 칸은) 기록에서 역산한 값 */
export function resolveBenchmarks(entered = {}, sessions = []) {
  const fromHistory = benchmarksFromHistory(sessions);
  const out = {};
  for (const id of BENCHMARK_IDS) {
    const v = Number(entered?.[id]);
    out[id] = Number.isFinite(v) && v > 0 ? v : fromHistory[id];
  }
  return out;
}

// ── 웜업 ─────────────────────────────────────────────────────
/** 본 운동 무게의 몇 %로 웜업할지 (40 → 60 → 80%) */
export const WARMUP_PCTS = [0.4, 0.6, 0.8];
const WARMUP_REST = 45;

/**
 * 본 세트 앞에 붙일 웜업 세트를 만듭니다.
 * 가벼울수록 많이, 무거워질수록 적게 — 40%: 목표의 1.3배, 60%: 목표만큼, 80%: 절반.
 * @param {number} workingWeight  본 운동 무게 (없으면 웜업도 만들지 않습니다)
 * @param {number} workingReps    본 운동 목표 횟수
 * @param {string} equip
 */
export function warmupSets(workingWeight, workingReps = 10, equip = '바벨') {
  if (!(workingWeight > 0)) return [];
  const repMul = [1.3, 1, 0.6];
  return WARMUP_PCTS.map((pct, i) => ({
    reps: Math.max(3, Math.round(workingReps * repMul[i])),
    weight: roundForEquip(workingWeight * pct, equip),
    rest: WARMUP_REST,
    warmup: true,
  }));
}

export const isWarmup = (set) => !!set?.warmup;
