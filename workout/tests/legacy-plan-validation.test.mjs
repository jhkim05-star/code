import test from 'node:test';
import assert from 'node:assert/strict';
import { validateData, validateLegacyDataForRecovery, validateWeeklyPlan } from '../js/validation.js';
import { legacyBlock, legacyData, legacyPlan } from './legacy-fixtures.mjs';

test('legacy rule plan expands numeric sets without performed results', () => {
    const plan = validateWeeklyPlan(legacyPlan('2026-08-31'), '2026-08-31', { legacy: true });
    const block = plan.days[0].blocks[0];
    assert.equal(block.sets.length, 3);
    assert.deepEqual(block.sets.map(set => [set.reps, set.weight]), [[10, 40], [10, 40], [10, 40]]);
    assert.equal(block.rest, 90);
    assert.ok(block.sets.every(set => !Object.hasOwn(set, 'done') && !Object.hasOwn(set, 'confirmed')));
    assert.ok(block.sets.every(set => set.warmup === false && !Object.hasOwn(set, 'rest')));
    assert.equal(Object.hasOwn(block, 'reps'), false);
    assert.equal(Object.hasOwn(block, 'weight'), false);
});

test('legacy AI plan uses its stored block count, reps, weight, and rest', () => {
    const raw = legacyPlan('2026-09-07', legacyBlock({ sets: 4, reps: 8, weight: 52.5, rest: 120 }), 'ai');
    const block = validateWeeklyPlan(raw, '2026-09-07', { legacy: true }).days[0].blocks[0];
    assert.equal(block.sets.length, 4);
    assert.ok(block.sets.every(set => set.reps === 8 && set.weight === 52.5));
    assert.equal(block.rest, 120);
});

test('legacy array-form plans remain array-form and preserve warmup metadata', () => {
    const sets = [
        { id: 'warmup', reps: 10, weight: 20, warmup: true, rest: 45 },
        { id: 'work', reps: 8, weight: 50, warmup: false, planRest: 120 },
    ];
    const raw = legacyPlan('2026-08-31', legacyBlock({ sets }));
    const actual = validateWeeklyPlan(raw, '2026-08-31', { legacy: true }).days[0].blocks[0].sets;
    assert.deepEqual(actual, sets);
});

test('all saved weeks migrate independently in one legacy data set', () => {
    const data = legacyData();
    data.plans = {
        '2026-08-31': legacyPlan('2026-08-31', legacyBlock({ sets: 2 })),
        '2026-09-07': legacyPlan('2026-09-07', legacyBlock({ sets: [{ reps: 6, weight: 60 }] }), 'ai'),
    };
    const migrated = validateData(data, { legacy: true });
    assert.deepEqual(Object.keys(migrated.plans), ['2026-08-31', '2026-09-07']);
    assert.equal(migrated.plans['2026-08-31'].days[0].blocks[0].sets.length, 2);
    assert.equal(migrated.plans['2026-09-07'].days[0].blocks[0].sets[0].reps, 6);
});

test('sessions, settings, and custom exercises survive plan migration', () => {
    const data = legacyData();
    data.plans = { '2026-08-31': legacyPlan('2026-08-31') };
    const migrated = validateData(data, { legacy: true });
    assert.equal(migrated.settings.tempo, 4);
    assert.equal(migrated.sessions[0].comment, '보존할 기록');
    assert.equal(migrated.sessions[0].entries[0].sets[0].weight, 50);
    assert.equal(migrated.customExercises[0].name, '사용자 로우');
});

test('unknown legacy sets structure fails closed without mutating raw data', () => {
    const raw = legacyPlan('2026-08-31', legacyBlock({ sets: { count: 3 } }));
    const before = JSON.stringify(raw);
    assert.throws(() => validateWeeklyPlan(raw, '2026-08-31', { legacy: true }), /계획 세트 배열/);
    assert.equal(JSON.stringify(raw), before);
});

test('numeric sets are accepted only in explicit legacy mode', () => {
    const raw = legacyPlan('2026-08-31');
    assert.throws(() => validateWeeklyPlan(raw, '2026-08-31'), /계획 세트 배열/);
});

test('recovery view preserves non-plan data and excludes only invalid weeks', () => {
    const data = legacyData();
    data.plans = {
        '2026-08-31': legacyPlan('2026-08-31'),
        '2026-09-07': legacyPlan('2026-09-07', legacyBlock({ sets: 'three' })),
    };
    const { data: recovered, errors } = validateLegacyDataForRecovery(data);
    assert.equal(recovered.sessions.length, 1);
    assert.equal(recovered.settings.tempo, 4);
    assert.equal(recovered.customExercises.length, 1);
    assert.deepEqual(Object.keys(recovered.plans), ['2026-08-31']);
    assert.deepEqual(errors.map(error => error.weekStart), ['2026-09-07']);
});
