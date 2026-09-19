import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findExercise } from '../js/exercises.js';
import { makeBlock } from '../js/planner.js';
import { buildTodayWeekPlan, workSetsOf, warmupSetsOf } from '../js/today-plan.js';
import { freeDaySummary } from '../js/free-summary.js';
import { personalRecords, recentGroupWorkSets, workSetCount } from '../js/stats-model.js';

const doneSet = (id, patch = {}) => ({ id, done: true, confirmed: true, warmup: false, reps: 10, weight: 40, ...patch });
const session = (date, entries, patch = {}) => ({ id: `session-${date}-${Math.random()}`, date, title: '운동', startedAt: 1_000, endedAt: 61_000, status: 'completed', entries, ...patch });

test('today workout uses the chosen weight for four default work sets and optional automatic warmups', () => {
    const exercise = findExercise('bb_bench');
    const block = makeBlock(exercise, { sessions: [], sets: 4, reps: 8, weight: 80, warmup: true });
    assert.equal(workSetsOf(block).length, 4);
    assert.deepEqual(workSetsOf(block).map(set => set.weight), [80, 80, 80, 80]);
    assert.ok(warmupSetsOf(block).length > 0);
    assert.ok(warmupSetsOf(block).every(set => set.weight < 80));
    assert.equal(block.rest, exercise.rest);
    assert.equal(block.recommendation.source, 'manual');
});

test('a today-only week keeps six free days and replacing today preserves other stored days', () => {
    const chest = makeBlock('bb_bench', { sessions: [], sets: 4, reps: 8, weight: 70, warmup: false });
    const back = makeBlock('lat_pulldown', { sessions: [], sets: 3, reps: 10, weight: 50, warmup: false });
    const first = buildTodayWeekPlan(null, '2026-09-18', [chest]);
    assert.equal(first.source, 'today');
    assert.equal(first.days.length, 7);
    assert.equal(first.days.find(day => day.date === '2026-09-18').blocks.length, 1);
    assert.equal(first.days.filter(day => !day.blocks.length).length, 6);
    const monday = first.days.find(day => day.date === '2026-09-14');
    monday.blocks = [back];
    monday.groupIds = ['back'];
    monday.title = '등';
    const next = buildTodayWeekPlan(first, '2026-09-18', [back]);
    assert.equal(next.days.find(day => day.date === '2026-09-14').blocks[0].exerciseId, 'lat_pulldown');
    assert.equal(next.days.find(day => day.date === '2026-09-18').blocks[0].exerciseId, 'lat_pulldown');
});

test('free workout summary reports body parts, work sets and total elapsed time', () => {
    const records = [
        session('2026-09-18', [{ exerciseId: 'bb_bench', name: '벤치', group: 'chest', sets: [doneSet('a'), doneSet('b'), doneSet('warm', { warmup: true })] }]),
        session('2026-09-18', [{ exerciseId: 'lat_pulldown', name: '풀다운', group: 'back', sets: [doneSet('c')] }], { id: 'second', startedAt: 100_000, endedAt: 220_000 }),
        session('2026-09-17', [{ exerciseId: 'squat', name: '스쿼트', group: 'thighs', sets: [doneSet('d')] }]),
    ];
    const result = freeDaySummary('2026-09-18', records);
    assert.deepEqual(result.groups, ['chest', 'back']);
    assert.equal(result.sets, 3);
    assert.equal(result.seconds, 180);
});

test('recent body-part work sets use a rolling seven-day window and exclude timed exercise', () => {
    const records = [
        session('2026-09-12', [{ exerciseId: 'old', name: '제외', group: 'chest', sets: [doneSet('old')] }]),
        session('2026-09-13', [{ exerciseId: 'bb_bench', name: '벤치', group: 'chest', sets: [doneSet('a'), doneSet('b')] }]),
        session('2026-09-19', [{ exerciseId: 'plank', name: '플랭크', group: 'core', measure: 'duration', sets: [doneSet('t', { reps: 90, weight: null })] }]),
    ];
    const report = recentGroupWorkSets(records, '2026-09-19');
    assert.equal(report.since, '2026-09-13');
    assert.equal(report.totals.get('chest').sets, 2);
    assert.equal(report.totals.has('core'), false);
    assert.equal(workSetCount(records[2]), 0);
});

test('timed exercise appears only as a duration personal record', () => {
    const timed = session('2026-09-19', [{ exerciseId: 'plank', name: '플랭크', group: 'core', measure: 'duration', sets: [doneSet('one', { reps: 60, weight: null }), doneSet('two', { reps: 95, weight: null })] }]);
    const loaded = session('2026-09-18', [{ exerciseId: 'bb_bench', name: '벤치프레스', group: 'chest', measure: 'reps', sets: [doneSet('load', { reps: 8, weight: 80 })] }]);
    const records = personalRecords([timed, loaded]);
    assert.deepEqual(records.find(row => row.name === '플랭크'), { kind: 'duration', name: '플랭크', seconds: 95, weight: null, reps: 95, date: '2026-09-19', confirmed: true });
    assert.equal(records.find(row => row.name === '벤치프레스').kind, 'load');
});

test('plan and settings screens expose the simplified entry points and separate update actions', async () => {
    const [plan, settings, stats, app, serviceWorker] = await Promise.all([
        readFile(new URL('../js/views/planTab.js', import.meta.url), 'utf8'),
        readFile(new URL('../js/views/settings.js', import.meta.url), 'utf8'),
        readFile(new URL('../js/views/stats.js', import.meta.url), 'utf8'),
        readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
        readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    ]);
    assert.match(plan, /내 프로그램/);
    assert.match(plan, /장기 프로그램 만들기/);
    assert.match(plan, /오늘의 운동 만들기/);
    assert.match(app, /long-term\|today/);
    assert.match(settings, /새 버전 확인/);
    assert.match(settings, /새 버전 적용/);
    assert.match(settings, /disabled: !updateReady/);
    assert.match(settings, /waitForServiceWorker/);
    assert.doesNotMatch(settings, /onclick: refreshApp/);
    assert.match(settings, /details\.settings-group\.card/);
    assert.match(stats, /최근 7일 부위별 본세트/);
    assert.doesNotMatch(stats, /h\('h3', null, '시간 운동'\)/);
    assert.match(serviceWorker, /todayWorkout\.js/);
    assert.match(serviceWorker, /today-plan\.js/);
    assert.match(serviceWorker, /free-summary\.js/);
});
