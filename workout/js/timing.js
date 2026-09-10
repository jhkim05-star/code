/** Shared timing policy for previews, planning budgets and the runner. */
import { DEFAULT_SETTINGS } from './config.js';
export function transitionTiming(current, next, { settings = DEFAULT_SETTINGS, blockRest = 90 } = {}) {
    if (!next)
        return { reason: 'finish', rest: 0, setup: 0, target: null };
    if (current.entryId !== next.entryId)
        return { reason: 'exercise', rest: settings.exerciseRest, setup: settings.exerciseSetup, target: next.setId };
    const reason = current.warmup ? (next.warmup ? 'warmup' : 'warmup-to-work') : 'set';
    const rest = reason === 'warmup' ? settings.warmupRest : reason === 'warmup-to-work' ? settings.warmupToWorkRest : (current.planRest ?? blockRest);
    return { reason, rest, setup: 0, target: next.setId };
}
export function estimateDaySeconds(day, settings = DEFAULT_SETTINGS) {
    const blocks = day?.blocks || [];
    let active = 0, rest = 0, setup = 0, countdown = 0;
    const items = blocks.flatMap((b, i) => (b.sets || []).map((s, j) => ({ b, s, entryId: `b${i}`, setId: `b${i}s${j}`, warmup: !!s.warmup, planRest: s.rest ?? null })));
    items.forEach((cur, i) => {
        const tempo = cur.b.measure === 'duration' ? 1 : cur.b.tempo ?? settings.tempo;
        active += (cur.s.reps || 0) * tempo;
        countdown += settings.countdownSec;
        const transition = transitionTiming(cur, items[i + 1], { settings, blockRest: cur.b.rest ?? settings.restDefault });
        rest += transition.rest;
        setup += transition.setup;
    });
    return { total: active + rest + setup + countdown, active, rest, setup, countdown };
}
export const estimateMinutes = (day, settings = DEFAULT_SETTINGS) => Math.ceil(estimateDaySeconds(day, settings).total / 60);
