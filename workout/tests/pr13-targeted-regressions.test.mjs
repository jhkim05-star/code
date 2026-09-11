import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../js/config.js';
import { findExercise } from '../js/exercises.js';
import { generateWeek } from '../js/planner.js';
import { suggestFromHistory } from '../js/weights.js';
import { personalRecords, recordedVolume } from '../js/stats-model.js';
import { sessionVolume } from '../js/runner.js';
import { validateSession, validateWeeklyPlan } from '../js/validation.js';
import { validateCatalog } from '../js/ai-contract.js';
import { displayWeight, inputWeight } from '../js/util.js';
import { serializeHistory } from '../js/ai.js';

const clone = value => structuredClone(value);
const targets = patch => Object.fromEntries(Object.keys(DEFAULT_SETTINGS.plan.weeklyTargets).map(group => [group, patch[group] || 0]));
function plan(patch = {}) {
    return {
        ...clone(DEFAULT_SETTINGS.plan),
        equipment: ['바벨', '덤벨', '케이블', '스미스머신'],
        machineIds: ['assist_pullup_dip', 'hip_adduction', 'glute_kickback'],
        equipmentReviewRequired: false,
        warmup: false,
        sessionMinutes: 60,
        week: { 0: [], 1: ['chest'], 2: [], 3: [], 4: [], 5: [], 6: [] },
        weeklyTargets: targets({ chest: 12 }),
        ...patch,
    };
}

test('direct six-exercise chest day distributes twelve sets across six exercises', () => {
    const weekly = generateWeek('2026-09-07', { plan: plan({ dailyExerciseCount: 6 }) });
    const monday = weekly.days[0];
    assert.equal(monday.blocks.length, 6);
    assert.equal(monday.blocks.reduce((sum, block) => sum + block.sets.filter(set => !set.warmup).length, 0), 12);
    assert.equal(new Set(monday.blocks.map(block => block.exerciseId)).size, 6);
});

test('direct count first gives each selected group one exercise when the counts match', () => {
    const p = plan({
        dailyExerciseCount: 3,
        week: { 0: [], 1: ['chest', 'delt_f', 'triceps'], 2: [], 3: [], 4: [], 5: [], 6: [] },
        weeklyTargets: targets({ chest: 8, delt_f: 4, triceps: 6 }),
    });
    const monday = generateWeek('2026-09-07', { plan: p }).days[0];
    assert.equal(monday.blocks.length, 3);
    assert.deepEqual(new Set(monday.blocks.map(block => block.group)), new Set(['chest', 'delt_f', 'triceps']));
});

test('assistance load is recorded as assistance and never uses ordinary upward progression', () => {
    const exercise = findExercise('assist_pullup');
    assert.equal(exercise.loadBasis, 'assistance');
    const session = { id: 'assist-session', date: '2026-09-10', startedAt: 1, endedAt: 2, status: 'completed', entries: [{ id: 'assist-entry', exerciseId: exercise.id, name: exercise.name, group: exercise.group, loadBasis: 'assistance', sets: [0, 1, 2].map(index => ({ id: `assist-set-${index}`, done: true, confirmed: true, warmup: false, targetReps: 10, reps: 10, weight: 50, rir: 3 })) }] };
    assert.equal(suggestFromHistory(exercise, [session], { plan: plan(), today: '2026-09-10', targetReps: 10 }), null);
    assert.equal(recordedVolume(session), 0);
    assert.equal(sessionVolume(session), 0);
    assert.deepEqual(personalRecords([session]), []);
    const legacyRecord = clone(session);
    legacyRecord.entries[0].loadBasis = 'stack';
    legacyRecord.entries[0].recommendation = { source: 'progression', weight: 55, note: '잘못된 일반 증량' };
    legacyRecord.entries[0].sets[0].recommendation = { source: 'progression', weight: 55, note: '잘못된 일반 증량' };
    const validated = validateSession(legacyRecord);
    assert.equal(validated.entries[0].loadBasis, 'assistance');
    assert.deepEqual(validated.entries[0].sets.map(set => set.weight), [50, 50, 50]);
    assert.equal(validated.entries[0].recommendation, null);
    assert.equal(validated.entries[0].sets[0].recommendation, null);
    const pounds = displayWeight(50, 'lb');
    assert.ok(Math.abs(inputWeight(pounds, 'lb') - 50) < 1e-9);
    assert.equal(validateCatalog([{ id: exercise.id, name: exercise.name, group: exercise.group, equip: exercise.equip, loadBasis: exercise.loadBasis }])[0].loadBasis, 'assistance');
    assert.equal(serializeHistory([legacyRecord])[0].entries[0].loadBasis, 'assistance');
    const planned = validateWeeklyPlan({ weekStart: '2026-09-07', days: [{ id: 'assist-day', date: '2026-09-07', title: '등', blocks: [{ id: 'assist-block', exerciseId: exercise.id, name: exercise.name, group: exercise.group, equip: exercise.equip, loadBasis: 'stack', rest: 90, tempo: 3, recommendation: { source: 'progression', weight: 55 }, overloadNote: '55kg 증량', sets: [{ id: 'assist-plan-set', reps: 10, weight: 50, warmup: false, recommendation: { source: 'progression', weight: 55 } }] }] }] }, '2026-09-07');
    assert.equal(planned.days[0].blocks[0].loadBasis, 'assistance');
    assert.equal(planned.days[0].blocks[0].sets[0].weight, 50);
    assert.equal(planned.days[0].blocks[0].recommendation, null);
    assert.equal(planned.days[0].blocks[0].sets[0].recommendation, null);
    const ordinary = { ...session, entries: [{ ...session.entries[0], exerciseId: 'bb_bench', name: '바벨 벤치프레스', group: 'chest', loadBasis: 'total' }] };
    assert.equal(recordedVolume(ordinary), 1500);
    assert.equal(suggestFromHistory(findExercise('bb_bench'), [ordinary], { plan: plan(), today: '2026-09-10', targetReps: 10 })?.source, 'progression');
});

test('new machine exercises have explicit movement and load semantics', () => {
    const expected = {
        assist_pullup: ['pull_v', true, false, 'assistance'],
        assist_dip: ['press_h', true, false, 'assistance'],
        machine_incline_press: ['press_h', true, true, 'stack'],
        machine_seated_row: ['pull_h', true, true, 'stack'],
        high_row: ['pull_h', true, true, 'stack'],
        machine_biceps: ['curl', false, false, 'stack'],
        machine_triceps: ['ext', false, false, 'stack'],
        seated_leg_curl: ['knee_flexion', false, false, 'stack'],
        hip_adduction: ['adduction', false, false, 'stack'],
        machine_hip_thrust: ['hinge', true, true, 'stack'],
        machine_glute_kickback: ['kickback', false, false, 'stack'],
        machine_ab_crunch: ['trunk_flexion', false, false, 'stack'],
        machine_back_extension: ['trunk_extension', false, false, 'stack'],
    };
    for (const [id, [pattern, compound, warmupEligible, loadBasis]] of Object.entries(expected)) {
        const exercise = findExercise(id);
        assert.ok(exercise, id);
        assert.equal(exercise.pattern, pattern, `${id} pattern`);
        assert.equal(exercise.compound, compound, `${id} compound`);
        assert.equal(exercise.warmupEligible, warmupEligible, `${id} warmup`);
        assert.equal(exercise.loadBasis, loadBasis, `${id} load`);
    }
    assert.deepEqual(findExercise('machine_seated_row').secondary, ['biceps', 'delt_sr']);
    assert.deepEqual(findExercise('machine_back_extension').secondary, ['glutes', 'thighs']);
});
