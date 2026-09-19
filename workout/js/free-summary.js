import { sessionSetCount } from './runner.js';

export function freeDaySummary(date, all) {
    const records = all.filter(session => session.date === date && sessionSetCount(session) > 0);
    const groups = [...new Set(records.flatMap(session => session.entries.filter(entry => entry.sets.some(set => set.done && !set.warmup)).map(entry => entry.group)))];
    const sets = records.reduce((sum, session) => sum + sessionSetCount(session), 0);
    const seconds = records.reduce((sum, session) => sum + (session.endedAt ? Math.max(0, session.endedAt - session.startedAt) / 1000 : 0), 0);
    return { records, groups, sets, seconds };
}
