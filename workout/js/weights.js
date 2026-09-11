/** Conservative suggestions with explicit provenance. Conversion ratios remain heuristics. */
import { findExercise, enrichExercise, isAssistanceExercise } from './exercises.js';
import { DEFAULT_SETTINGS } from './config.js';
import { dayDistance, todayYmd, uid } from './util.js';
export const BENCHMARKS = [
    { id: 'bench', name: '벤치프레스', anchor: 'bb_bench', hint: '최근 편안하게 8회쯤 수행한 중량' },
    { id: 'pulldown', name: '랫풀다운', anchor: 'lat_pulldown', hint: '최근 12회쯤 수행한 중량' },
    { id: 'squat', name: '스쿼트', anchor: 'back_squat', hint: '최근 6~8회쯤 수행한 중량' },
    { id: 'ohp', name: '오버헤드프레스', anchor: 'ohp', hint: '최근 8회쯤 수행한 중량' },
];
export const BENCHMARK_IDS = BENCHMARKS.map(b => b.id);
const BASE_NAMES = Object.fromEntries(BENCHMARKS.map(b => [b.id, b.name]));
// Original per-exercise ratios. No group-level fallback for unknown custom exercises.
const RATIOS = {
    bench: 'bb_bench:1 smith_bench:1 bb_incline:.85 smith_incline:.85 machine_press:.9 db_bench:.4 db_incline:.35 db_fly:.18 incline_fly:.16 cable_cross:.15 pec_deck:.5 cg_bench:.8 smith_cg_bench:.8 machine_dip:.7 skullcrusher:.35 smith_skull:.35 pushdown:.4 rope_pushdown:.35 cable_oh_ext:.3 oh_ext:.25 kickback:.1',
    pulldown: 'lat_pulldown:1 lat_close:.95 bb_row:.9 smith_row:.9 pendlay:.85 tbar_row:.8 seated_row:.95 chest_sup_row:.8 db_row:.4 cable_row_1arm:.4 straight_pull:.45 db_pullover:.3 bb_curl:.45 ez_curl:.45 smith_drag_curl:.4 preacher:.3 cable_curl:.35 db_curl:.18 hammer_curl:.2 incline_curl:.15 conc_curl:.15 cable_crunch:.5',
    ohp: 'ohp:1 smith_ohp:1 machine_sp:.9 db_shoulder:.4 arnold:.35 front_raise:.15 cable_front:.15 plate_front:.3 side_raise:.12 cable_side:.12 bent_lateral:.12 machine_side:.5 rear_pec_deck:.5 face_pull:.35 upright_row:.5 smith_upright:.5',
    squat: 'deadlift:1.2 smith_deadlift:1.2 back_squat:1 smith_squat:1 front_squat:.8 smith_front_squat:.8 leg_press:1.8 hack_squat:1.2 rdl:.8 smith_rdl:.8 stiff_dl:.7 goblet_squat:.3 smith_lunge:.4 smith_split:.4 bulgarian:.25 lunge:.25 leg_ext:.5 leg_curl:.35 hip_thrust:1 smith_thrust:1 sumo_dl:1.15 smith_sumo:1.15 hip_abduction:.5 cable_kickback:.15 step_up:.2 calf_raise:.8 smith_calf:.8 seated_calf:.4 leg_press_calf:1.2 db_calf_raise:.25',
};
const ratioMap = new Map(Object.entries(RATIOS).flatMap(([base, rows]) => rows.split(' ').map(v => { const [id, r] = v.split(':'); return [id, [base, +r]]; })));
export const WARMUP_PCTS = [0.4, 0.6, 0.8];
export const isWarmup = st => !!st?.warmup;
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
export function loadStep(equip, plan = DEFAULT_SETTINGS.plan) { return plan.weightSteps?.[equip] || DEFAULT_SETTINGS.plan.weightSteps[equip] || 1; }
function roundDown(kg, equip, plan) { const step = loadStep(equip, plan), min = plan.minimumLoads?.[equip] || 0; const n = Math.floor((kg + 1e-9) / step) * step; return n >= min && n > 0 ? Number(n.toFixed(4)) : null; }
function actualSets(e) { return (e.sets || []).filter(s => s.done && !s.warmup && s.confirmed === true && positive(s.weight) && Number.isFinite(s.reps)); }
export function benchmarksFromHistory(sessions = [], { today = todayYmd(), staleDays = 42 } = {}) {
    const out = Object.fromEntries(BENCHMARK_IDS.map(k => [k, null]));
    // Only direct benchmark observations, not chains of inferred estimates.
    for (const b of BENCHMARKS) {
        for (const session of [...sessions].sort((a, b) => b.startedAt - a.startedAt)) {
            const age = dayDistance(session.date, today);
            if (age < 0 || age > staleDays)
                continue;
            const entry = (session.entries || []).find(e => e.exerciseId === b.anchor);
            if (!entry)
                continue;
            const done = actualSets(entry);
            if (!done.length)
                continue;
            out[b.id] = Math.min(...done.map(s => s.weight));
            break;
        }
    }
    return out;
}
export function resolveBenchmarks(entered = {}, sessions = [], opt = {}) {
    const history = benchmarksFromHistory(sessions, opt);
    return Object.fromEntries(BENCHMARK_IDS.map(id => [id, positive(Number(entered?.[id])) ? Number(entered[id]) : history[id]]));
}
export function estimateWeight(exercise, marks, custom = [], plan = DEFAULT_SETTINGS.plan) {
    const ex = typeof exercise === 'string' ? findExercise(exercise, custom) : enrichExercise(exercise);
    if (!ex || ex.bodyweight || isAssistanceExercise(ex))
        return null;
    const pair = ratioMap.get(ex.id);
    if (!pair)
        return null;
    const [base, ratio] = pair, n = marks?.[base];
    if (!positive(n))
        return null;
    const direct = BENCHMARKS.some(b => b.id === base && b.anchor === ex.id);
    const scale = direct ? 1 : (plan.estimateScale ?? 0.8), weight = roundDown(n * ratio * scale, ex.equip, plan);
    if (weight == null)
        return null;
    return { weight, base, source: direct ? 'benchmark' : 'estimate', confidence: direct ? 'user-entered' : 'low', requiresConfirmation: true,
        note: direct ? `입력한 ${BASE_NAMES[base]} 기준. 오늘 컨디션과 기구를 확인해 주세요.` : `${BASE_NAMES[base]} 기준의 비율 추정 × ${scale}. 기구 차이는 반영하지 못하므로 확인이 필요해요.` };
}
export function suggestFromHistory(exercise, sessions = [], { plan = DEFAULT_SETTINGS.plan, today = todayYmd(), targetReps = null } = {}) {
    const ex = typeof exercise === 'string' ? findExercise(exercise) : enrichExercise(exercise);
    if (!ex || ex.bodyweight || isAssistanceExercise(ex))
        return null;
    for (const session of [...sessions].sort((a, b) => b.startedAt - a.startedAt)) {
        const entries = (session.entries || []).filter(e => e.exerciseId === ex.id);
        const allWork = entries.flatMap(e => (e.sets || []).filter(s => !s.warmup));
        const confirmed = allWork.filter(s => s.done && s.confirmed === true && positive(s.weight) && Number.isFinite(s.reps));
        if (!confirmed.length)
            continue;
        const age = dayDistance(session.date, today), base = Math.min(...confirmed.map(s => s.weight));
        const result = { weight: base, source: 'history', confidence: 'observed', requiresConfirmation: true, date: session.date };
        if (age < 0 || age > plan.staleDays)
            return { ...result, note: '기록이 오래됐거나 미래 날짜입니다. 이전 중량은 참고만 하고 다시 확인해 주세요.', stale: true };
        const uniform = confirmed.every(s => Math.abs(s.weight - base) < 1e-6);
        const allDone = allWork.length > 0 && allWork.every(s => s.done && s.confirmed === true && positive(s.weight) && Number.isFinite(s.targetReps) && s.targetReps > 0 && s.targetKnown !== false && s.reps >= s.targetReps && !s.skipped);
        const comparable = targetReps == null || confirmed.every(s => s.targetReps === targetReps);
        const rirKnown = confirmed.every(s => Number.isFinite(s.rir));
        const enoughReserve = rirKnown && confirmed.every(s => s.rir >= plan.targetRir);
        if (session.status === 'partial' || session.stopReason || !allDone || !uniform || !comparable)
            return { ...result, note: '본세트 전체 목표가 확인되지 않았거나 조건이 달라 이전 중량을 유지 제안해요.' };
        if (!enoughReserve)
            return { ...result, note: rirKnown ? '목표는 채웠지만 수행 여유가 적어 유지 제안해요.' : '모든 목표를 채웠어요. 여유 횟수(RIR) 미입력으로 자동 증량은 보류해요.' };
        const step = loadStep(ex.equip, plan), next = Number(((Math.floor((base + 1e-8) / step) + 1) * step).toFixed(4));
        const percent = (next - base) / base * 100;
        if (percent > plan.maxIncreasePercent)
            return { ...result, note: `다음 기구 단계는 +${percent.toFixed(1)}%라 설정한 증량률을 넘어요. 유지 또는 더 작은 중량 단위를 확인해 주세요.` };
        return { ...result, weight: next, source: 'progression', note: `본세트 ${allWork.length}개 목표와 RIR 확인. 다음 기구 단계 +${(next - base).toFixed(2)}kg (${percent.toFixed(1)}%) 제안` };
    }
    return null;
}
/** Warmup reps are deliberately low; the user reviews these engineering defaults. */
export function warmupSets(workingWeight, workingReps = 10, equip = '바벨', opt = {}) {
    const plan = opt.plan || DEFAULT_SETTINGS.plan;
    const warmAlready = !!opt.patternPrepared;
    const stages = warmAlready ? [[0.65, 4], [0.85, 2]] : [[0.4, 6], [0.6, 4], [0.8, 2]];
    const out = [];
    for (const [pct, reps] of stages) {
        const weight = positive(workingWeight) ? roundDown(workingWeight * pct, equip, plan) : null;
        if (positive(workingWeight) && (weight == null || weight >= workingWeight))
            continue;
        if (weight != null && out.some(s => s.weight === weight))
            continue;
        out.push({ id: uid('set'), reps: Math.min(reps, Math.max(2, workingReps)), weight, warmup: true, rest: opt.warmupRest ?? 45,
            recommendation: { source: 'warmup-estimate', requiresConfirmation: true, note: `본세트의 ${Math.round(pct * 100)}% · ${warmAlready ? '이미 준비한 동작' : '첫 준비 동작'}` } });
    }
    return out;
}
