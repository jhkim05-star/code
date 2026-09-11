/** Deterministic planning by weekly work-set budget; no silent duplicate fallback. */
import { byGroup, GROUPS, GROUP_NAME, findExercise, enrichExercise, patternOf, exerciseAllowed, equipmentReadiness } from './exercises.js';
import { settings, rotation, customExercises, avoidExerciseIds, metadata } from './store.js';
import { estimateWeight, resolveBenchmarks, warmupSets, suggestFromHistory } from './weights.js';
import { weekStartOf, ymd, addDays, parseYmd, uid, rotate, clamp, dayDistance } from './util.js';
import { estimateDaySeconds, estimateMinutes } from './timing.js';
import { validatePlan } from './ai-contract.js';
export const PRESETS = [
    { id: 'push_pull_legs1', label: '2분할 + 하체 주 1회', week: { 1: ['chest', 'delt_f', 'triceps'], 2: ['back', 'delt_sr', 'biceps'], 3: [], 4: ['chest', 'delt_f', 'triceps'], 5: ['back', 'delt_sr', 'biceps'], 6: [], 0: ['thighs', 'glutes', 'calves'] } },
    { id: 'full_body3', label: '무분할 주 3회', week: { 1: ['chest', 'back', 'thighs', 'delt_f'], 2: [], 3: ['back', 'chest', 'glutes', 'biceps'], 4: [], 5: ['thighs', 'delt_sr', 'triceps', 'core'], 6: [], 0: [] } },
    { id: 'ppl6', label: '3분할 주 6회', week: { 1: ['chest', 'delt_f', 'triceps'], 2: ['back', 'delt_sr', 'biceps'], 3: ['thighs', 'glutes', 'calves'], 4: ['chest', 'delt_f', 'triceps'], 5: ['back', 'delt_sr', 'biceps'], 6: ['thighs', 'glutes', 'calves'], 0: [] } },
];
export const recommendExerciseCount = minutes => clamp(Math.round((minutes - 5) / 8), 2, 10);
export const AUTO_TARGET_SETS_PER_EXERCISE = 4;
export const AUTO_TARGET_MAX_PER_GROUP = 20;
function allocateExerciseSlots(groups, count, plan, { custom = [], avoid = [] } = {}) {
    const slots = [], assigned = new Map(groups.map(group => [group, 0]));
    const capacity = new Map(groups.map(group => [group, byGroup(group, custom, plan, avoid).length]));
    let changed = true;
    while (slots.length < count && changed) {
        changed = false;
        for (const group of groups) {
            if (slots.length >= count)
                break;
            if (assigned.get(group) >= capacity.get(group))
                continue;
            slots.push(group);
            assigned.set(group, assigned.get(group) + 1);
            changed = true;
        }
    }
    return slots;
}
function recommendationBlock(group, index, setCount, p, s) {
    const reps = p.goal === 'strength' ? 8 : p.goal === 'hypertrophy' ? 12 : 10;
    const sets = Array.from({ length: setCount }, (_, i) => ({ id: `recommended-${index}-${i}`, reps, warmup: false }));
    if (p.warmup)
        sets.unshift({ id: `recommended-${index}-warmup`, reps: 6, warmup: true });
    return { id: `recommended-${index}`, group, measure: 'reps', tempo: s.tempo, rest: s.restDefault, sets };
}
/** Time-aware starting targets. They are planning policy, not a training prescription. */
export function recommendWeeklyTargets(plan = settings().plan, s = settings(), context = {}) {
    const p = { ...plan }, targets = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
    const exerciseSlots = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
    const initialExerciseSlots = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
    const frequencies = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
    const trainingDays = Object.values(p.week || {}).filter(groups => groups?.length).length;
    const dailyExerciseCount = p.dailyExerciseCount ?? recommendExerciseCount(p.sessionMinutes);
    const baseSetsPerExercise = AUTO_TARGET_SETS_PER_EXERCISE;
    const days = [];
    for (const groups of Object.values(p.week || {}))
        for (const group of groups || [])
            frequencies[group]++;
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
        const groups = p.week?.[dow] || [];
        if (!groups.length)
            continue;
        const requestedExercises = dailyExerciseCount;
        const slots = allocateExerciseSlots(groups, requestedExercises, p, context);
        const setCounts = slots.map(() => baseSetsPerExercise);
        slots.forEach(group => initialExerciseSlots[group]++);
        days.push({ dow, requestedExercises, slots, setCounts });
    }
    // Product guardrail: reduce the four-set starting values across every
    // occurrence of a body part. This is not presented as a medical limit.
    for (const { id } of GROUPS) {
        const refs = days.flatMap(day => day.slots.map((group, index) => ({ day, index, group }))).filter(ref => ref.group === id);
        const guarded = Math.min(refs.length * baseSetsPerExercise, AUTO_TARGET_MAX_PER_GROUP);
        const even = refs.length ? Math.floor(guarded / refs.length) : 0, extra = refs.length ? guarded % refs.length : 0;
        refs.forEach((ref, index) => { ref.day.setCounts[ref.index] = even + (index < extra ? 1 : 0); });
    }
    const dayEstimates = [];
    for (const day of days) {
        const makeDay = () => ({ blocks: day.slots.flatMap((group, index) => day.setCounts[index] > 0 ? [recommendationBlock(group, index, day.setCounts[index], p, s)] : []) });
        let estimate = estimateDaySeconds(makeDay(), s);
        while (estimate.total > p.sessionMinutes * 60) {
            let reduceAt = -1;
            for (let i = day.setCounts.length - 1; i >= 0; i--)
                if (day.setCounts[i] > 1 && (reduceAt < 0 || day.setCounts[i] > day.setCounts[reduceAt]))
                    reduceAt = i;
            if (reduceAt < 0) {
                let removeAt = -1;
                for (let i = day.setCounts.length - 1; i >= 0; i--)
                    if (day.setCounts[i] > 0) {
                        removeAt = i;
                        break;
                    }
                if (removeAt < 0)
                    break;
                day.setCounts[removeAt] = 0;
                estimate = estimateDaySeconds(makeDay(), s);
                continue;
            }
            day.setCounts[reduceAt]--;
            estimate = estimateDaySeconds(makeDay(), s);
        }
        day.slots.forEach((group, index) => {
            if (day.setCounts[index] < 1)
                return;
            exerciseSlots[group]++;
            targets[group] += day.setCounts[index];
        });
        dayEstimates.push({ dow: day.dow, requestedExercises: day.requestedExercises, exercises: day.setCounts.filter(count => count > 0).length, workSets: day.setCounts.reduce((sum, count) => sum + count, 0), minutes: Math.ceil(estimate.total / 60), withinBudget: estimate.total <= p.sessionMinutes * 60 });
    }
    const reasons = Object.fromEntries(GROUPS.map(({ id }) => {
        const average = exerciseSlots[id] ? Math.round(targets[id] / exerciseSlots[id] * 10) / 10 : 0;
        if (!frequencies[id])
            return [id, '선택한 운동일 없음'];
        const initial = initialExerciseSlots[id] * baseSetsPerExercise;
        const notes = [`주 ${frequencies[id]}회 · 총 ${exerciseSlots[id]}종목 · 종목당 평균 ${average}본세트`];
        if (initial > AUTO_TARGET_MAX_PER_GROUP)
            notes.push(`기본 ${initial}세트에서 앱 자동 추천 상한 ${AUTO_TARGET_MAX_PER_GROUP}세트 적용`);
        else
            notes.push(`종목당 기본 ${baseSetsPerExercise}세트에서 시작`);
        const guarded = Math.min(initial, AUTO_TARGET_MAX_PER_GROUP);
        if (targets[id] < guarded)
            notes.push(`${p.sessionMinutes}분 시간 예산에 맞춰 ${guarded}→${targets[id]}세트`);
        if (!initialExerciseSlots[id])
            notes.push('선택한 기구·머신에서 가능한 종목 없음');
        return [id, notes.join(' · ')];
    }));
    return { targets, reasons, frequencies, exerciseSlots, initialExerciseSlots, trainingDays, dailyExerciseCount, baseSetsPerExercise, autoTargetMaxPerGroup: AUTO_TARGET_MAX_PER_GROUP, dayEstimates,
        summary: `${p.sessionMinutes}분 × 주 ${trainingDays}일 · 하루 ${dailyExerciseCount}종목 기준` };
}
export function resolveWeeklyTargets(plan = settings().plan, s = settings(), context = {}) {
    const recommendation = recommendWeeklyTargets(plan, s, context), targets = {};
    for (const { id } of GROUPS)
        targets[id] = plan.weeklyTargetModes?.[id] === 'manual' ? plan.weeklyTargets[id] : recommendation.targets[id];
    return { targets, recommendation };
}
export function syncAutomaticWeeklyTargets(settingsValue, context = {}) {
    const next = structuredClone(settingsValue), recommendation = recommendWeeklyTargets(next.plan, next, context);
    for (const { id } of GROUPS)
        if (next.plan.weeklyTargetModes?.[id] !== 'manual')
            next.plan.weeklyTargets[id] = recommendation.targets[id];
    return next;
}
export function applyWeeklyTargetChoice(settingsValue, group, mode, value, context = {}) {
    if (!GROUPS.some(item => item.id === group) || !['auto', 'manual'].includes(mode))
        throw new Error('주간 목표 방식을 확인해 주세요.');
    const next = structuredClone(settingsValue);
    next.plan.weeklyTargetModes[group] = mode;
    if (mode === 'manual')
        next.plan.weeklyTargets[group] = clamp(Number(value), 0, 30);
    return syncAutomaticWeeklyTargets(next, context);
}
export const estimateDayMinutes = (day, s = settings()) => estimateMinutes(day, s);
export const estimateBlockSeconds = (b, s = settings()) => estimateDaySeconds({ blocks: [b] }, s).total;
export const estimateBlocksSeconds = (blocks, s = settings()) => estimateDaySeconds({ blocks }, s).total;
export function suggestWeight(id, history, opt = {}) { const ex = findExercise(id, opt.custom || customExercises()); return ex ? suggestFromHistory(ex, history, { plan: settings().plan, ...opt }) : null; }
export function recommendWeight(exercise, opt = {}) {
    const custom = opt.custom || customExercises();
    const ex = typeof exercise === 'string' ? findExercise(exercise, custom) : enrichExercise(exercise);
    if (!ex || metadata().unitReviewRequired)
        return null;
    const p = opt.plan || settings().plan, history = opt.sessions || [];
    const observed = suggestFromHistory(ex, history, { plan: p, targetReps: opt.targetReps ?? ex.reps, today: opt.today });
    if (observed)
        return observed;
    const marks = opt.marks || resolveBenchmarks(opt.benchmarks ?? p.benchmarks, history, { staleDays: p.staleDays, today: opt.today });
    return estimateWeight(ex, marks, custom, p);
}
export function makeBlock(exercise, opt = {}) {
    const custom = opt.custom || customExercises();
    const found = typeof exercise === 'string' ? findExercise(exercise, custom) : exercise;
    if (!found)
        return null;
    const ex = enrichExercise(found), s = opt.settings || settings(), p = opt.plan || s.plan;
    const sets = opt.sets ?? ex.sets, reps = opt.reps ?? ex.reps;
    if (!Number.isInteger(sets) || sets < 1 || sets > 20 || !Number.isInteger(reps) || reps < 1 || reps > 600)
        throw new Error('종목 세트 수 또는 목표가 올바르지 않습니다.');
    const recommendation = recommendWeight(ex, { ...opt, plan: p, targetReps: reps }), weight = recommendation?.weight ?? null;
    const warm = (opt.warmup ?? p.warmup) && ex.warmupEligible ? warmupSets(weight, reps, ex.equip, { plan: p, patternPrepared: opt.preparedPatterns?.has(patternOf(ex)), warmupRest: s.warmupRest }) : [];
    return { id: uid('block'), exerciseId: ex.id, name: ex.name, group: ex.group, equip: ex.equip,
        rest: opt.rest ?? ex.rest, tempo: ex.measure === 'duration' ? 1 : (opt.tempo ?? ex.tempo ?? s.tempo),
        measure: ex.measure, loadBasis: ex.loadBasis, pattern: ex.pattern, compound: ex.compound, secondary: ex.secondary,
        note: opt.note || '', recommendation, overloadNote: recommendation?.note || '',
        sets: [...warm, ...Array.from({ length: sets }, () => ({ id: uid('set'), reps, weight, warmup: false, recommendation }))] };
}
function chooseExercises(group, count, { custom, plan, avoid, used, weekUsed, seed, mainSeed, variant, alwaysSame }) {
    const pool = byGroup(group, custom, plan, avoid), out = [], patterns = new Set();
    for (let i = 0; i < count; i++) {
        const available = pool.filter(ex => !used.has(ex.id));
        if (!available.length)
            break;
        const primary = i === 0;
        const order = rotate(available, (primary ? mainSeed : seed) + variant * 3 + i);
        let best = null, score = -Infinity;
        for (let j = 0; j < order.length; j++) {
            const ex = order[j];
            let value = -j * 0.01;
            if (primary && ex.compound)
                value += 12;
            if (primary)
                value += (4 - ex.tier) * 2;
            if (!primary && patterns.has(ex.pattern))
                value -= 6;
            if (!primary && !ex.compound)
                value += 2;
            if (!alwaysSame && weekUsed.has(ex.id))
                value -= 7;
            if (value > score) {
                best = ex;
                score = value;
            }
        }
        used.add(best.id);
        out.push(best);
        patterns.add(best.pattern);
    }
    return out;
}
function directExerciseAllocation(groups, requested, quotas, { custom, plan, avoid }) {
    const capacity = new Map(groups.map(group => [group, Math.min(quotas[group] || 0, byGroup(group, custom, plan, avoid).length)]));
    const counts = new Map(groups.map(group => [group, 0]));
    let allocated = 0, changed = true;
    // Round-robin gives every selected part one exercise before assigning a
    // second one. Capacity never exceeds its existing set quota, so requesting
    // more exercises cannot create extra weekly work sets.
    while (allocated < requested && changed) {
        changed = false;
        for (const group of groups) {
            if (allocated >= requested)
                break;
            if (counts.get(group) >= capacity.get(group))
                continue;
            counts.set(group, counts.get(group) + 1);
            allocated++;
            changed = true;
        }
    }
    const eligible = groups.filter(group => capacity.get(group) > 0);
    const reasons = [];
    if (requested < eligible.length)
        reasons.push(`선택 부위 ${eligible.length}개를 모두 포함하려면 최소 ${eligible.length}종목이 필요하지만 ${requested}종목을 요청했어요.`);
    if (allocated < requested) {
        const noSets = groups.filter(group => !(quotas[group] > 0)).map(group => GROUP_NAME[group]);
        const noCandidates = groups.filter(group => quotas[group] > 0 && capacity.get(group) === 0).map(group => GROUP_NAME[group]);
        const details = [noSets.length ? `배분할 목표 세트가 없는 부위: ${noSets.join(', ')}` : '', noCandidates.length ? `선택 기구로 가능한 종목이 없는 부위: ${noCandidates.join(', ')}` : ''].filter(Boolean);
        reasons.push(`기존 목표 세트를 늘리지 않고 배분할 수 있는 종목은 ${allocated}개예요.${details.length ? ' ' + details.join(' · ') : ''}`);
    }
    return { counts, allocated, reasons };
}
function repsFor(ex, p) {
    if (ex.measure === 'duration')
        return ex.reps;
    if (p.goal === 'strength' && ex.compound)
        return p.experience === 'beginner' || p.experience === 'unknown' ? 6 : 5;
    if (p.goal === 'hypertrophy')
        return ex.compound ? 10 : 12;
    return ex.reps;
}
function fitTime(day, s) {
    const budget = s.plan.sessionMinutes * 60;
    while (estimateDaySeconds(day, s).total > budget) {
        const candidates = day.blocks.map((b, i) => ({ b, i, work: b.sets.filter(st => !st.warmup) }));
        // Reduce accessory sets first. At least one work set per retained exercise.
        const reducible = candidates.filter(x => x.work.length > 1).sort((a, b) => Number(a.b.compound) - Number(b.b.compound) || b.work.length - a.work.length)[0];
        if (reducible) {
            const id = reducible.work.at(-1).id;
            reducible.b.sets = reducible.b.sets.filter(st => st.id !== id);
            continue;
        }
        const counts = new Map();
        day.blocks.forEach(b => counts.set(b.group, (counts.get(b.group) || 0) + 1));
        const removable = candidates.reverse().find(x => counts.get(x.b.group) > 1);
        if (!removable)
            break;
        day.blocks.splice(removable.i, 1);
    }
    return day;
}
export function analyzePlan(plan, s = settings()) {
    const direct = Object.fromEntries(GROUPS.map(g => [g.id, 0])), overlap = Object.fromEntries(GROUPS.map(g => [g.id, 0]));
    const warnings = [], custom = customExercises(), avoid = avoidExerciseIds();
    const targetResolution = resolveWeeklyTargets(s.plan, s, { custom, avoid }), effectiveTargets = targetResolution.targets;
    const days = plan.days.map(day => {
        const seen = new Set();
        for (const b of day.blocks) {
            const work = b.sets.filter(st => !st.warmup).length;
            direct[b.group] = (direct[b.group] || 0) + work;
            const ex = findExercise(b.exerciseId, custom) || b;
            for (const g of ex.secondary || [])
                overlap[g] = (overlap[g] || 0) + work;
            if (seen.has(b.exerciseId))
                warnings.push(`${day.date}: 같은 종목이 중복됩니다.`);
            seen.add(b.exerciseId);
            // A saved day may contain a bodyweight exercise that the user added
            // manually. Keep enforcing real equipment and machine selections,
            // but do not mislabel that supported manual choice as invalid.
            if (avoid.includes(b.exerciseId) || !exerciseAllowed(ex, s.plan, { manual: true }))
                warnings.push(`${day.date}: ${b.name}이 기구/제외 설정과 맞지 않습니다.`);
        }
        const time = estimateDaySeconds(day, s);
        if (time.total > s.plan.sessionMinutes * 60)
            warnings.push(`${day.date}: 최소 구성을 유지하면 시간 예산을 ${Math.ceil((time.total - s.plan.sessionMinutes * 60) / 60)}분 초과해요. 부위를 줄이거나 시간을 늘려 주세요.`);
        if (day.blocks.length && s.plan.dailyExerciseCount != null && day.blocks.length !== s.plan.dailyExerciseCount) {
            const source = plan.source === 'ai' ? 'AI가 반환한 수량' : plan.source === 'rule' ? '규칙 계획의 배분 또는 시간 조정 결과' : '저장된 계획의 수량';
            warnings.push(`${day.date}: 요청 ${s.plan.dailyExerciseCount}종목 / 생성 ${day.blocks.length}종목 · ${source}이 달라요. 함께 표시된 구체적인 경고를 확인해 주세요.`);
        }
        return { date: day.date, minutes: Math.ceil(time.total / 60), ...time };
    });
    const selected = new Set(Object.values(s.plan.week).flat());
    for (const g of selected)
        if (direct[g] < effectiveTargets[g])
            warnings.push(`${GROUP_NAME[g]}: 본세트 ${direct[g]} / 목표 ${effectiveTargets[g]}세트. 후보 또는 시간 제한을 확인해 주세요.`);
    for (let i = 1; i < plan.days.length; i++) {
        const previous = new Set(plan.days[i - 1].blocks.map(b => b.group));
        const repeated = [...new Set(plan.days[i].blocks.map(b => b.group))].filter(g => previous.has(g));
        if (repeated.length)
            warnings.push(`${plan.days[i].date}: 전날과 ${repeated.map(g => GROUP_NAME[g]).join(', ')} 부위가 겹쳐요. 회복 상태를 확인해 주세요.`);
    }
    return { direct, overlap, days, targets: effectiveTargets, targetRecommendation: targetResolution.recommendation, warnings: [...new Set([...(plan.warnings || []), ...warnings])], note: '보조 자극 세트는 직접 본세트에 합산하지 않습니다. 자동 목표는 시간 안에서 구성한 출발값이며 개인에게 적절한 운동량을 보장하는 처방이 아니에요.' };
}
export function generateWeek(anyDay = new Date(), opt = {}) {
    if (metadata().unitReviewRequired)
        throw new Error('설정에서 기존 기록의 kg/lb를 먼저 확인해 주세요.');
    const base = settings(), p = { ...base.plan, ...opt.plan }, s = { ...base, plan: p }, custom = customExercises(), avoid = avoidExerciseIds();
    const effectiveTargets = resolveWeeklyTargets(p, s, { custom, avoid }).targets;
    const readiness = equipmentReadiness(p);
    if (!readiness.ready || readiness.needsMachineReview)
        throw new Error(readiness.message);
    const start = weekStartOf(typeof anyDay === 'string' ? parseYmd(anyDay) : anyDay), weekStart = ymd(start);
    const weekIndex = Math.floor(dayDistance(p.blockAnchor, weekStart) / 7), global = rotation().global || 0;
    const seed = weekIndex + global + (opt.reroll || 0), mainSeed = p.rotationMode === 'stable' ? Math.floor(weekIndex / p.stableWeeks) + global : seed;
    const frequencies = {};
    Object.values(p.week).flat().forEach(g => frequencies[g] = (frequencies[g] || 0) + 1);
    const groupAppearances = {}, signatures = new Map(), weekUsed = new Set(), warnings = [], days = [];
    for (let i = 0; i < 7; i++) {
        const date = ymd(addDays(start, i)), dow = addDays(start, i).getDay(), groups = p.week[dow] || [];
        const signature = [...groups].sort().join('+'), occurrence = signatures.get(signature) || 0;
        signatures.set(signature, occurrence + 1);
        const variant = occurrence % p.variantsPerGroup;
        const used = new Set(), blocks = [], requestedCount = p.dailyExerciseCount ?? recommendExerciseCount(p.sessionMinutes), quotas = {};
        for (const group of groups) {
            const appearance = groupAppearances[group] || 0;
            groupAppearances[group] = appearance + 1;
            const target = effectiveTargets[group] ?? 6, freq = frequencies[group];
            quotas[group] = Math.floor(target / freq) + (appearance < target % freq ? 1 : 0);
        }
        const exerciseAllocation = directExerciseAllocation(groups, requestedCount, quotas, { custom, plan: p, avoid });
        exerciseAllocation.reasons.forEach(reason => warnings.push(`${date}: ${reason}`));
        for (const group of groups) {
            const quota = quotas[group];
            if (!quota)
                continue;
            const wanted = exerciseAllocation.counts.get(group);
            const picked = chooseExercises(group, wanted, { custom, plan: p, avoid, used, weekUsed, seed, mainSeed, variant, alwaysSame: p.variantsPerGroup === 1 });
            if (picked.length < wanted)
                warnings.push(`${date} ${GROUP_NAME[group]}: 가능한 ${picked.length}종목만 사용했어요. 중복으로 채우지 않았습니다.`);
            picked.forEach((ex, j) => {
                const setCount = Math.min(8, Math.floor(quota / picked.length) + (j < quota % picked.length ? 1 : 0));
                blocks.push(makeBlock(ex, { sessions: opt.sessions || [], settings: s, plan: p, sets: setCount, reps: repsFor(ex, p), warmup: false }));
            });
        }
        blocks.sort((a, b) => Number(b.compound) - Number(a.compound) || groups.indexOf(a.group) - groups.indexOf(b.group));
        const prepared = new Set();
        if (p.warmup)
            for (const b of blocks) {
                const ex = findExercise(b.exerciseId, custom);
                if (ex?.warmupEligible)
                    b.sets.unshift(...warmupSets(b.sets[0].weight, b.sets[0].reps, b.equip, { plan: p, patternPrepared: prepared.has(b.pattern), warmupRest: s.warmupRest }));
                prepared.add(b.pattern);
            }
        const suffix = p.variantsPerGroup > 1 ? ` (${String.fromCharCode(65 + variant)})` : '';
        const day = { id: uid('day'), date, dow, groupIds: groups, title: blocks.length ? groups.map(g => GROUP_NAME[g]).join(' · ') + suffix : '휴식', blocks };
        const beforeTimeFit = day.blocks.length;
        fitTime(day, s);
        if (groups.length && day.blocks.length !== requestedCount) {
            const reason = beforeTimeFit === requestedCount && day.blocks.length < requestedCount ? '시간 예산을 맞추는 과정에서 줄어든 수량' : '적용 목표 세트와 실제 후보 안에서 배분 가능한 수량';
            warnings.push(`${date}: 요청 ${requestedCount}종목 / 생성 ${day.blocks.length}종목 · ${reason}입니다.`);
        }
        day.blocks.forEach(b => weekUsed.add(b.exerciseId));
        days.push(day);
    }
    const result = { weekStart, createdAt: Date.now(), source: 'rule', note: '종목당 기본 본세트 → 앱 자동 추천 상한 → 시간 예산 순서로 만든 검토용 계획이에요. 남는 시간을 채우려고 세트를 늘리지 않습니다.', warnings, days, profileSnapshot: structuredClone({ ...p, weeklyTargets: effectiveTargets }) };
    result.analysis = analyzePlan(result, s);
    return result;
}
export function normalizeAiPlan(raw, weekStart, history = []) {
    const s = settings(), custom = customExercises();
    const readiness = equipmentReadiness(s.plan);
    if (!readiness.ready || readiness.needsMachineReview)
        throw new Error(readiness.message);
    const allowed = GROUPS.flatMap(g => byGroup(g.id, custom, s.plan, avoidExerciseIds()));
    const verified = validatePlan(raw, allowed, weekStart), prepared = new Set();
    if (s.plan.dailyExerciseCount != null && verified.days.some(day => day.blocks.length > s.plan.dailyExerciseCount))
        throw new Error(`AI 계획이 하루 요청 종목 수 ${s.plan.dailyExerciseCount}개를 초과했습니다.`);
    const days = verified.days.map(d => {
        prepared.clear();
        const blocks = d.blocks.map(b => {
            const ex = findExercise(b.exerciseId, custom);
            const block = makeBlock(ex, { sessions: history, sets: b.sets, reps: b.reps, rest: b.rest, note: b.note, preparedPatterns: prepared });
            prepared.add(ex.pattern);
            return block;
        });
        return { id: uid('day'), date: d.date, dow: parseYmd(d.date).getDay(), title: d.title, groupIds: [...new Set(blocks.map(b => b.group))], blocks };
    });
    const result = { weekStart, createdAt: Date.now(), source: 'ai', note: verified.note, days, warnings: [] };
    for (const d of days) {
        const planned = s.plan.week[d.dow] || [];
        if (d.groupIds.some(g => !planned.includes(g)) || planned.some(g => !d.groupIds.includes(g)))
            result.warnings.push(`${d.date}: 설정한 요일별 부위와 다른 구성이에요. 요청한 변경인지 확인해 주세요.`);
        const requested = s.plan.dailyExerciseCount;
        if (requested != null && planned.length && d.blocks.length !== requested)
            result.warnings.push(`${d.date}: 요청 ${requested}종목 / 생성 ${d.blocks.length}종목 · AI 결과도 적용 전에 이 기기에서 다시 확인했어요.`);
    }
    result.analysis = analyzePlan(result, s);
    return result;
}
export function buildFreeDay(date) { return { id: uid('day'), date, dow: parseYmd(date).getDay(), groupIds: [], free: true, title: '자유운동', blocks: [] }; }
