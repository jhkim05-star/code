import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyBlock, legacyData, legacyPlan, legacyStorageEntries, localStorageStub } from './legacy-fixtures.mjs';

const legacy = legacyData();
legacy.plans = {
    '2026-08-31': legacyPlan('2026-08-31'),
    '2026-09-07': legacyPlan('2026-09-07', legacyBlock({ sets: [{ reps: 8, weight: 55 }] }), 'ai'),
};
const initialEntries = legacyStorageEntries(legacy);
const original = new Map(initialEntries);
const { values, storage } = localStorageStub(initialEntries);
globalThis.localStorage = storage;
globalThis.addEventListener = () => {};
const store = await import('../js/store.js?legacy-success');
await store.initStore();

test('successful legacy migration creates a revisioned v2 snapshot', () => {
    const snapshot = JSON.parse(values.get('wl:snapshot.v2'));
    assert.equal(snapshot.revision, 1);
    assert.equal(snapshot.data.meta.schema, 2);
    assert.equal(snapshot.data.plans['2026-08-31'].days[0].blocks[0].sets.length, 3);
    assert.equal(store.storageStatus().state, 'saved');
});

test('successful migration snapshot preserves records, settings, and custom exercises', () => {
    const snapshot = JSON.parse(values.get('wl:snapshot.v2'));
    assert.equal(snapshot.data.sessions[0].comment, '보존할 기록');
    assert.equal(snapshot.data.settings.tempo, 4);
    assert.equal(snapshot.data.customExercises[0].name, '사용자 로우');
});

test('successful migration does not delete or rewrite v1 source collections', () => {
    for (const [key, raw] of original)
        assert.equal(values.get(key), raw, key);
});
