import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SETTINGS } from '../js/config.js';
import { recommendWeeklyTargets, resolveWeeklyTargets } from '../js/planner.js';
import { Runner } from '../js/runner.js';
import { validateSettings } from '../js/validation.js';

const clone = value => structuredClone(value);
const silentAudio = { stop() {}, speakCount() {}, beep() {}, cue: new Proxy({}, { get: () => () => {} }) };
function fourDayUpperPlan(minutes = 60, dailyExerciseCount = 4) {
    const s = clone(DEFAULT_SETTINGS);
    s.plan.sessionMinutes = minutes;
    s.plan.dailyExerciseCount = dailyExerciseCount;
    s.plan.week = { 0: [], 1: ['chest', 'delt_f', 'triceps'], 2: ['back', 'delt_sr', 'biceps'], 3: [], 4: ['chest', 'delt_f', 'triceps'], 5: ['back', 'delt_sr', 'biceps'], 6: [] };
    return s;
}
function executionDay() {
    const block = (id, name, sets) => ({ id, exerciseId: id, name, group: 'chest', equip: '덤벨', measure: 'reps', loadBasis: 'pair', pattern: 'press_h', compound: true, rest: 90, tempo: 1,
        sets: Array.from({ length: sets }, (_, index) => ({ id: `${id}-set-${index}`, reps: 8, weight: 20, warmup: false })) });
    return { id: 'day-controls', date: '2026-09-11', title: '상체', blocks: [block('first', '첫 운동', 2), block('second', '다음 운동', 1)] };
}
function runnerFixture() {
    let now = 1_000;
    const config = { ...clone(DEFAULT_SETTINGS), countdownSec: 0, autoStartRest: false };
    const runner = new Runner(executionDay(), { settings: config, now: () => now, noTimer: true, audio: silentAudio });
    runner.start();
    return { runner, advance(ms) { now += ms; runner.tick(); } };
}

test('60-minute four-day upper plan recommends sixteen weekly chest sets from four exercise slots', () => {
    const s = fourDayUpperPlan();
    const result = recommendWeeklyTargets(s.plan, s);
    assert.equal(result.trainingDays, 4);
    assert.equal(result.frequencies.chest, 2);
    assert.equal(result.exerciseSlots.chest, 4);
    assert.equal(result.baseSetsPerExercise, 4);
    assert.equal(result.targets.chest, 16);
    assert.match(result.reasons.chest, /주 2회.*총 4종목.*평균 4본세트/);
    assert.ok(result.dayEstimates.every(day => day.withinBudget && day.minutes <= 60));
});

test('automatic targets respond to time, frequency and daily exercise count without exceeding the budget', () => {
    const short = fourDayUpperPlan(30, 4), long = fourDayUpperPlan(60, 7), impossible = fourDayUpperPlan(20, 12);
    const shortResult = recommendWeeklyTargets(short.plan, short);
    const longResult = recommendWeeklyTargets(long.plan, long);
    const impossibleResult = recommendWeeklyTargets(impossible.plan, impossible);
    assert.ok(shortResult.targets.chest < longResult.targets.chest);
    assert.ok(longResult.exerciseSlots.chest > shortResult.exerciseSlots.chest);
    assert.ok(shortResult.dayEstimates.every(day => day.minutes <= 30));
    assert.ok(longResult.dayEstimates.every(day => day.minutes <= 60));
    assert.ok(impossibleResult.dayEstimates.every(day => day.withinBudget && day.minutes <= 20));
    assert.ok(impossibleResult.dayEstimates.some(day => day.exercises < day.requestedExercises));
});

test('legacy unchanged targets migrate to auto while past user adjustments stay manual', () => {
    const untouched = validateSettings({ plan: { weeklyTargets: clone(DEFAULT_SETTINGS.plan.weeklyTargets) } });
    const adjusted = validateSettings({ plan: { weeklyTargets: { ...clone(DEFAULT_SETTINGS.plan.weeklyTargets), chest: 13 } } });
    assert.equal(untouched.plan.weeklyTargetModes.chest, 'auto');
    assert.equal(adjusted.plan.weeklyTargetModes.chest, 'manual');
    const s = fourDayUpperPlan();
    s.plan.weeklyTargets.chest = 13;
    s.plan.weeklyTargetModes.chest = 'manual';
    assert.equal(resolveWeeklyTargets(s.plan, s).targets.chest, 13);
});

test('stopping the current exercise keeps completed sets and skips only its remaining sets', () => {
    const { runner, advance } = runnerFixture();
    runner.beginSet();
    runner.finishSet(8);
    runner.recordReview('manual');
    runner.advance();
    runner.beginSet();
    runner.finishSet(7);
    assert.ok(runner.reviewAuto);
    assert.equal(runner.stopCurrentExercise(), true);
    assert.equal(runner.entry.name, '다음 운동');
    assert.equal(runner.state, 'ready');
    assert.equal(runner.session.entries[0].sets[0].done, true);
    assert.equal(runner.session.entries[0].sets[1].skipped, true);
    assert.equal(runner.session.entries[1].sets[0].skipped, false);
    advance(10_000);
    assert.equal(runner.session.entries[0].sets[1].done, false);
});

test('stopping today emits a partial session with completed work preserved', () => {
    const { runner } = runnerFixture();
    let finished = null;
    runner.on('done', session => { finished = session; });
    runner.beginSet();
    runner.finishSet(8);
    runner.recordReview('manual');
    runner.abort('사용자가 오늘 운동 종료');
    assert.equal(finished.status, 'partial');
    assert.equal(finished.stopReason, '사용자가 오늘 운동 종료');
    assert.equal(finished.entries[0].sets[0].done, true);
    assert.equal(finished.entries[0].sets[1].done, false);
    assert.ok(finished.endedAt >= finished.startedAt);
});

test('mobile history rows omit verbose status copy and navigation keeps accessible vector targets', async () => {
    const [history, app, css] = await Promise.all([
        readFile(new URL('../js/views/history.js', import.meta.url), 'utf8'),
        readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
        readFile(new URL('../css/app.css', import.meta.url), 'utf8'),
    ]);
    assert.doesNotMatch(history, /5초 후 자동 기록|실제 기록 확인됨|실제 기록 확인 필요/);
    assert.match(history, /auto-badge/);
    assert.doesNotMatch(app, /🗂️|🏋️|📖|📈|⚙️/);
    assert.match(app, /createElementNS/);
    assert.match(app, /'aria-label': label/);
    assert.match(css, /\.tabbar button\{[^}]*min-width:44px[^}]*height:var\(--tab-h\)/);
    assert.match(css, /\.history-set-fields\{[^}]*grid-template-columns/);
    assert.match(css, /\.history-set-fields input[^}]*min-height:44px/);
    assert.match(css, /@media\(max-width:380px\).*history-set-fields\{grid-template-columns:1fr 1fr\}/s);
});
