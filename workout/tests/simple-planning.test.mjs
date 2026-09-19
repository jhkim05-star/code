import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findExercise } from '../js/exercises.js';
import { makeBlock } from '../js/planner.js';
import { buildTodayWeekPlan, canBuildTodayExercise, canStartTodayWorkout, hasValidWorkingWeight, initialTodayBlocks, workSetsOf, warmupSetsOf } from '../js/today-plan.js';
import { freeDaySummary } from '../js/free-summary.js';
import { periodBuckets, periodStreak, personalRecordSections, personalRecords, recentGroupWorkSets, recordedVolume, workSetCount } from '../js/stats-model.js';

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

test('multiple same-day free workouts combine body parts, work sets and total elapsed time', () => {
    const records = [
        session('2026-09-18', [{ exerciseId: 'bb_bench', name: '벤치', group: 'chest', sets: [doneSet('a'), doneSet('b'), doneSet('warm', { warmup: true })] }]),
        session('2026-09-18', [{ exerciseId: 'lat_pulldown', name: '풀다운', group: 'back', sets: [doneSet('c')] }], { id: 'second', startedAt: 100_000, endedAt: 220_000 }),
        session('2026-09-17', [{ exerciseId: 'squat', name: '스쿼트', group: 'thighs', sets: [doneSet('d')] }]),
    ];
    const result = freeDaySummary('2026-09-18', records);
    assert.equal(result.records.length, 2);
    assert.deepEqual(result.groups, ['chest', 'back']);
    assert.equal(result.sets, 3);
    assert.equal(result.seconds, 180);
});

test('completed-day additional workout starts empty and runs only newly selected exercises', () => {
    const completedBlock = makeBlock('bb_bench', { sessions: [], sets: 4, reps: 8, weight: 70, warmup: false });
    const addedBlock = makeBlock('lat_pulldown', { sessions: [], sets: 4, reps: 10, weight: 50, warmup: false });
    const stored = buildTodayWeekPlan(null, '2026-09-18', [completedBlock]);
    const storedDay = stored.days.find(day => day.date === '2026-09-18');
    assert.equal(initialTodayBlocks(storedDay).length, 1);
    assert.deepEqual(initialTodayBlocks(storedDay, { fresh: true }), []);
    const additional = buildTodayWeekPlan(stored, '2026-09-18', [addedBlock]);
    assert.deepEqual(additional.days.find(day => day.date === '2026-09-18').blocks.map(block => block.exerciseId), ['lat_pulldown']);
});

test('today workout weight validation distinguishes required and optional load bases', () => {
    for (const loadBasis of ['total', 'per_hand', 'stack', 'assistance']) {
        assert.equal(hasValidWorkingWeight({ loadBasis }, ''), false, `${loadBasis} blank`);
        assert.equal(hasValidWorkingWeight({ loadBasis }, null), false, `${loadBasis} null`);
        assert.equal(hasValidWorkingWeight({ loadBasis }, 0), true, `${loadBasis} zero`);
    }
    for (const loadBasis of ['bodyweight', 'added']) {
        assert.equal(hasValidWorkingWeight({ loadBasis }, ''), true, `${loadBasis} blank`);
        assert.equal(hasValidWorkingWeight({ loadBasis }, null), true, `${loadBasis} null`);
    }
    assert.equal(canBuildTodayExercise({ loadBasis: 'bodyweight' }, '', { warmup: true }), false, 'warmup still needs a working weight');
});

test('today workout cannot start with an empty exercise list', () => {
    assert.equal(canStartTodayWorkout([]), false);
    assert.equal(canStartTodayWorkout([makeBlock('bb_bench', { sessions: [], sets: 4, reps: 8, weight: 60, warmup: false })]), true);
    assert.equal(canStartTodayWorkout([{ loadBasis: 'stack', sets: [{ warmup: false, reps: 10, weight: null }] }]), false);
    assert.equal(canStartTodayWorkout([{ loadBasis: 'bodyweight', sets: [{ warmup: false, reps: 10, weight: null }] }]), true);
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
    assert.equal(recordedVolume(records[2]), 0);
    assert.equal(periodBuckets([records[2]], 'week', 1, '2026-09-19')[0].count, 0);
    assert.equal(periodStreak([records[2]], 'week', '2026-09-19'), 0);
});

test('timed exercise appears only as a duration personal record', () => {
    const timed = session('2026-09-19', [{ exerciseId: 'plank', name: '플랭크', group: 'core', measure: 'duration', sets: [doneSet('one', { reps: 60, weight: null }), doneSet('two', { reps: 95, weight: null })] }]);
    const loaded = session('2026-09-18', [{ exerciseId: 'bb_bench', name: '벤치프레스', group: 'chest', measure: 'reps', sets: [doneSet('load', { reps: 8, weight: 80 })] }]);
    const records = personalRecords([timed, loaded]);
    assert.deepEqual(records.find(row => row.name === '플랭크'), { kind: 'duration', name: '플랭크', seconds: 95, weight: null, reps: 95, date: '2026-09-19', confirmed: true });
    assert.equal(records.find(row => row.name === '벤치프레스').kind, 'load');
});

test('duration personal records remain visible after the twenty-load display limit', () => {
    const loads = Array.from({ length: 21 }, (_, index) => session('2026-09-18', [{ exerciseId: `load-${index}`, name: `중량 ${index}`, group: 'chest', measure: 'reps', sets: [doneSet(`set-${index}`, { reps: 8, weight: 100 - index })] }], { id: `loaded-${index}` }));
    const timed = session('2026-09-19', [{ exerciseId: 'plank', name: '플랭크', group: 'core', measure: 'duration', sets: [doneSet('timed', { reps: 125, weight: null })] }]);
    const sections = personalRecordSections([...loads, timed], { loadLimit: 20 });
    assert.equal(sections.loads.length, 20);
    assert.equal(sections.durations.length, 1);
    assert.equal(sections.durations[0].name, '플랭크');
    assert.equal(sections.durations[0].seconds, 125);
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
    assert.match(app, /\(new\)/);
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
    assert.match(serviceWorker, /workout-log-v25-simple-planning-review/);
});

test('every service worker core file exists in the workout app shell', async () => {
    const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
    const core = source.match(/const CORE = \[([\s\S]*?)\];/)?.[1];
    assert.ok(core, 'CORE list');
    const paths = [...core.matchAll(/'\.\/([^']+)'/g)].map(match => match[1]).filter(Boolean);
    assert.ok(paths.length > 20);
    await Promise.all(paths.map(path => readFile(new URL(`../${path}`, import.meta.url))));
});
