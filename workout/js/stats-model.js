/** Statistics deliberately separate warmups, timed exercises and recorded-load volume. */
import { weekStartOf, ymd, parseYmd, addDays, dayDistance, todayYmd } from './util.js';
import { isAssistanceExercise } from './exercises.js';
export function workSetCount(s) { return (s.entries || []).reduce((n, e) => n + (e.sets || []).filter(st => st.done && !st.warmup).length, 0); }
export function recordedVolume(s) { return (s.entries || []).filter(e => e.measure !== 'duration' && e.exerciseId !== 'plank' && !isAssistanceExercise(e)).reduce((n, e) => n + (e.sets || []).filter(st => st.done && !st.warmup).reduce((a, st) => a + (Number.isFinite(st.weight) && Number.isFinite(st.reps) ? st.weight * st.reps : 0), 0), 0); }
export function totalTimedSeconds(all) { return all.reduce((n, s) => n + (s.entries || []).filter(e => e.measure === 'duration' || e.exerciseId === 'plank').reduce((a, e) => a + e.sets.filter(st => st.done && !st.warmup).reduce((b, st) => b + (st.reps || 0), 0), 0), 0); }
export function periodKey(date, mode) { return mode === 'month' ? date.slice(0, 7) : ymd(weekStartOf(parseYmd(date))); }
export function periodBuckets(all, mode = 'week', count = 12, today = todayYmd()) {
    const now = parseYmd(today), base = weekStartOf(now), buckets = [];
    for (let i = count - 1; i >= 0; i--) {
        const date = mode === 'month' ? ymd(new Date(now.getFullYear(), now.getMonth() - i, 1)) : ymd(addDays(base, -7 * i));
        buckets.push({ key: periodKey(date, mode), start: date, label: mode === 'month' ? `${parseYmd(date).getMonth() + 1}월` : date.slice(5).replace('-', '/'), volume: 0, sets: 0, count: 0 });
    }
    const index = new Map(buckets.map(b => [b.key, b]));
    for (const s of all) {
        if (s.date > today || !workSetCount(s))
            continue;
        const b = index.get(periodKey(s.date, mode));
        if (!b)
            continue;
        b.count++;
        b.sets += workSetCount(s);
        b.volume += recordedVolume(s);
    }
    return buckets;
}
export function periodStreak(all, mode = 'week', today = todayYmd()) {
    const keys = new Set(all.filter(s => s.date <= today && workSetCount(s) > 0).map(s => periodKey(s.date, mode)));
    if (!keys.size)
        return 0;
    const now = parseYmd(today);
    let cursor = mode === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : weekStartOf(now), n = 0;
    const previous = () => { cursor = mode === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1) : addDays(cursor, -7); };
    if (!keys.has(periodKey(ymd(cursor), mode)))
        previous();
    // Full history, not the 12 displayed buckets.
    while (keys.has(periodKey(ymd(cursor), mode))) {
        n++;
        previous();
        if (n > keys.size)
            break;
    }
    return n;
}
export function personalRecords(all) {
    const best = new Map();
    for (const s of all)
        for (const e of s.entries || [])
            for (const st of e.sets || []) {
                if (!st.done || st.warmup || e.measure === 'duration' || e.exerciseId === 'plank' || isAssistanceExercise(e) || !Number.isFinite(st.weight) || st.weight <= 0 || !Number.isFinite(st.reps) || st.reps <= 0)
                    continue;
                const old = best.get(e.exerciseId);
                if (!old || st.weight > old.weight || st.weight === old.weight && st.reps > old.reps)
                    best.set(e.exerciseId, { name: e.name, weight: st.weight, reps: st.reps, date: s.date, confirmed: st.confirmed === true });
            }
    return [...best.values()].sort((a, b) => b.weight - a.weight);
}
