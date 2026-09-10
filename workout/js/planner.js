/** Deterministic planning by weekly work-set budget; no silent duplicate fallback. */
import { byGroup, GROUPS, GROUP_NAME, findExercise, enrichExercise, patternOf } from './exercises.js';
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
function chooseExercises(group, count, { custom, equipment, avoid, used, weekUsed, seed, mainSeed, variant, alwaysSame }) {
    const pool = byGroup(group, custom, equipment, avoid), out = [], patterns = new Set();
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
    const warnings = [];
    const custom = customExercises();
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
            if (avoidExerciseIds().includes(b.exerciseId) || (s.plan.equipment.length && !s.plan.equipment.includes(b.equip)))
                warnings.push(`${day.date}: ${b.name}이 기구/제외 설정과 맞지 않습니다.`);
        }
        const time = estimateDaySeconds(day, s);
        if (time.total > s.plan.sessionMinutes * 60)
            warnings.push(`${day.date}: 최소 구성을 유지하면 시간 예산을 ${Math.ceil((time.total - s.plan.sessionMinutes * 60) / 60)}분 초과해요. 부위를 줄이거나 시간을 늘려 주세요.`);
        return { date: day.date, minutes: Math.ceil(time.total / 60), ...time };
    });
    const selected = new Set(Object.values(s.plan.week).flat());
    for (const g of selected)
        if (direct[g] < s.plan.weeklyTargets[g])
            warnings.push(`${GROUP_NAME[g]}: 본세트 ${direct[g]} / 목표 ${s.plan.weeklyTargets[g]}세트. 후보 또는 시간 제한을 확인해 주세요.`);
    for (let i = 1; i < plan.days.length; i++) {
        const previous = new Set(plan.days[i - 1].blocks.map(b => b.group));
        const repeated = [...new Set(plan.days[i].blocks.map(b => b.group))].filter(g => previous.has(g));
        if (repeated.length)
            warnings.push(`${plan.days[i].date}: 전날과 ${repeated.map(g => GROUP_NAME[g]).join(', ')} 부위가 겹쳐요. 회복 상태를 확인해 주세요.`);
    }
    return { direct, overlap, days, warnings: [...new Set([...(plan.warnings || []), ...warnings])], note: '보조 자극 세트는 직접 본세트에 합산하지 않습니다. 개인에게 적절한 운동량을 보장하는 수치는 아니에요.' };
}
export function generateWeek(anyDay = new Date(), opt = {}) {
    if (metadata().unitReviewRequired)
        throw new Error('설정에서 기존 기록의 kg/lb를 먼저 확인해 주세요.');
    const base = settings(), p = { ...base.plan, ...opt.plan }, s = { ...base, plan: p }, custom = customExercises(), avoid = avoidExerciseIds();
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
        const used = new Set(), blocks = [];
        for (const group of groups) {
            const appearance = groupAppearances[group] || 0;
            groupAppearances[group] = appearance + 1;
            const target = p.weeklyTargets[group] ?? 6, freq = frequencies[group];
            const quota = Math.floor(target / freq) + (appearance < target % freq ? 1 : 0);
            if (!quota)
                continue;
            const perExercise = p.experience === 'beginner' ? 2 : 3;
            const wanted = Math.min(3, Math.ceil(quota / perExercise));
            const picked = chooseExercises(group, wanted, { custom, equipment: p.equipment, avoid, used, weekUsed, seed, mainSeed, variant, alwaysSame: p.variantsPerGroup === 1 });
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
        fitTime(day, s);
        day.blocks.forEach(b => weekUsed.add(b.exerciseId));
        days.push(day);
    }
    const result = { weekStart, createdAt: Date.now(), source: 'rule', note: '주간 본세트 목표 → 기구/제외 조건 → 종목 선택 → 시간 예산 순서로 만든 검토용 계획이에요.', warnings, days, profileSnapshot: structuredClone(p) };
    result.analysis = analyzePlan(result, s);
    return result;
}
export function normalizeAiPlan(raw, weekStart, history = []) {
    const s = settings(), custom = customExercises();
    const allowed = GROUPS.flatMap(g => byGroup(g.id, custom, s.plan.equipment, avoidExerciseIds()));
    const verified = validatePlan(raw, allowed, weekStart), prepared = new Set();
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
    }
    result.analysis = analyzePlan(result, s);
    return result;
}
export function buildFreeDay(date) { return { id: uid('day'), date, dow: parseYmd(date).getDay(), groupIds: [], free: true, title: '자유운동', blocks: [] }; }
