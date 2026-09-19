/** Pure helpers for a one-day plan. UI and storage are kept outside this module. */
import { buildFreeDay, analyzePlan } from './planner.js';
import { GROUP_NAME } from './exercises.js';
import { weekStartOf, parseYmd, ymd, addDays } from './util.js';

export const workSetsOf = block => (block.sets || []).filter(set => !set.warmup);
export const warmupSetsOf = block => (block.sets || []).filter(set => set.warmup);
const REQUIRED_WEIGHT_BASES = new Set(['total', 'per_hand', 'stack', 'assistance']);

export function initialTodayBlocks(storedDay, { fresh = false } = {}) {
    return fresh ? [] : structuredClone(storedDay?.blocks || []);
}
export function hasValidWorkingWeight(exercise, value) {
    if (!REQUIRED_WEIGHT_BASES.has(exercise?.loadBasis))
        return true;
    if (value == null || String(value).trim() === '')
        return false;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0;
}
export function canBuildTodayExercise(exercise, value, { warmup = false } = {}) {
    const hasValue = value != null && String(value).trim() !== '';
    return hasValidWorkingWeight(exercise, value) && (!warmup || hasValue);
}
export function canStartTodayWorkout(blocks) {
    return Array.isArray(blocks) && blocks.length > 0 && blocks.every(block => {
        const work = workSetsOf(block);
        return work.length > 0 && work.every(set => hasValidWorkingWeight(block, set.weight)) && (!warmupSetsOf(block).length || work.every(set => set.weight != null));
    });
}

export function buildTodayWeekPlan(existing, date, blocks) {
    const start = ymd(weekStartOf(parseYmd(date)));
    const plan = existing ? structuredClone(existing) : {
        weekStart: start,
        createdAt: Date.now(),
        source: 'today',
        note: '오늘 직접 고른 종목과 본세트 무게로 만든 운동입니다.',
        warnings: [],
        days: Array.from({ length: 7 }, (_, index) => buildFreeDay(ymd(addDays(parseYmd(start), index)))),
    };
    if (plan.weekStart !== start)
        throw new Error('오늘과 저장할 주의 범위가 다릅니다.');
    let day = plan.days.find(item => item.date === date);
    if (!day) {
        if (plan.days.length >= 7)
            throw new Error('오늘 날짜를 이 주 계획에 넣을 수 없습니다.');
        day = buildFreeDay(date);
        plan.days.push(day);
        plan.days.sort((a, b) => a.date.localeCompare(b.date));
    }
    day.blocks = structuredClone(blocks);
    day.groupIds = [...new Set(blocks.map(block => block.group))];
    day.title = day.groupIds.length ? day.groupIds.map(group => GROUP_NAME[group] || group).join(' · ') : '자유운동';
    day.free = true;
    plan.updatedAt = Date.now();
    plan.analysis = analyzePlan(plan);
    return plan;
}
