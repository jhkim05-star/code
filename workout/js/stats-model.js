/** Statistics deliberately separate warmups, timed exercises and recorded-load volume. */
import { weekStartOf, ymd, parseYmd, addDays, dayDistance, todayYmd } from './util.js';
import { isAssistanceExercise } from './exercises.js';
export function workSetCount(s) { return (s.entries || []).filter(e => e.measure !== 'duration' && e.exerciseId !== 'plank').reduce((n, e) => n + (e.sets || []).filter(st => st.done && !st.warmup).length, 0); }
export function recordedVolume(s) { return (s.entries || []).filter(e => e.measure !== 'duration' && e.exerciseId !== 'plank' && !isAssistanceExercise(e)).reduce((n, e) => n + (e.sets || []).filter(st => st.done && !st.warmup).reduce((a, st) => a + (Number.isFinite(st.weight) && Number.isFinite(st.reps) ? st.weight * st.reps : 0), 0), 0); }
export function totalTimedSeconds(all) { return all.reduce((n, s) => n + (s.entries || []).filter(e => e.measure === 'duration' || e.exerciseId === 'plank').reduce((a, e) => a + e.sets.filter(st => st.done && !st.warmup).reduce((b, st) => b + (st.reps || 0), 0), 0), 0); }
export function recentGroupWorkSets(all, today = todayYmd(), days = 7) {
    const since = ymd(addDays(parseYmd(today), -(days - 1))), totals = new Map();
    let warmups = 0;
    for (const session of all) {
        if (session.date < since || session.date > today)
            continue;
        for (const entry of session.entries || []) {
            if (entry.measure === 'duration' || entry.exerciseId === 'plank')
                continue;
            const row = totals.get(entry.group) || { sets: 0, volume: 0 };
            for (const set of entry.sets || []) {
                if (!set.done)
                    continue;
                if (set.warmup) {
                    warmups++;
                    continue;
                }
                row.sets++;
                if (!isAssistanceExercise(entry))
                    row.volume += (set.weight || 0) * (set.reps || 0);
            }
            totals.set(entry.group, row);
        }
    }
    return { since, today, totals, warmups };
}
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
                if (!st.done || st.warmup || isAssistanceExercise(e) || !Number.isFinite(st.reps) || st.reps <= 0)
                    continue;
                const old = best.get(e.exerciseId);
                if (e.measure === 'duration' || e.exerciseId === 'plank') {
                    if (!old || old.kind !== 'duration' || st.reps > old.seconds)
                        best.set(e.exerciseId, { kind: 'duration', name: e.name, seconds: st.reps, weight: null, reps: st.reps, date: s.date, confirmed: st.confirmed === true });
                    continue;
                }
                if (!Number.isFinite(st.weight) || st.weight <= 0)
                    continue;
                if (!old || old.kind === 'duration' || st.weight > old.weight || st.weight === old.weight && st.reps > old.reps)
                    best.set(e.exerciseId, { kind: 'load', name: e.name, weight: st.weight, reps: st.reps, date: s.date, confirmed: st.confirmed === true });
            }
    return [...best.values()].sort((a, b) => a.kind === b.kind ? (b.weight ?? b.seconds) - (a.weight ?? a.seconds) : a.kind === 'load' ? -1 : 1);
}
export function personalRecordSections(all, { loadLimit = 20 } = {}) {
    const rows = personalRecords(all);
    return {
        loads: rows.filter(row => row.kind === 'load').slice(0, loadLimit),
        durations: rows.filter(row => row.kind === 'duration'),
    };
}
