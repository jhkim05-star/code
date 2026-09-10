import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDbStub, legacyBlock, legacyData, legacyPlan, localStorageStub } from './legacy-fixtures.mjs';

const legacy = legacyData();
legacy.plans = {
    '2026-08-31': legacyPlan('2026-08-31'),
    '2026-09-07': legacyPlan('2026-09-07', legacyBlock({ sets: { unexpected: true } })),
};
const collections = ['settings', 'plans', 'sessions', 'customExercises', 'meta'];
const originals = new Map(collections.map(key => [key, structuredClone(legacy[key])]));
const { indexedDB, values } = indexedDbStub(originals);
globalThis.indexedDB = indexedDB;
globalThis.localStorage = localStorageStub().storage;
globalThis.addEventListener = () => {};
const store = await import('../js/store.js?legacy-idb-failure');
await store.initStore();

test('failed IndexedDB legacy migration does not create a v2 snapshot', () => {
    assert.equal(values.has('snapshot.v2'), false);
    assert.equal(store.storageStatus().state, 'error');
    assert.equal(store.storageStatus().readOnly, true);
});

test('failed IndexedDB legacy migration preserves every source collection', async () => {
    for (const [key, value] of originals)
        assert.deepEqual(values.get(key), value, key);
    const recovery = await store.exportRecoveryCopies();
    assert.deepEqual(recovery.database.plans, originals.get('plans'));
    assert.equal(recovery.memory.data.sessions[0].comment, '보존할 기록');
});
