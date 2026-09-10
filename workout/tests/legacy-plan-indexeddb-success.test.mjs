import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDbStub, legacyData, legacyPlan, localStorageStub } from './legacy-fixtures.mjs';

const legacy = legacyData();
legacy.plans = { '2026-08-31': legacyPlan('2026-08-31') };
const collections = ['settings', 'plans', 'sessions', 'customExercises', 'meta'];
const originals = new Map(collections.map(key => [key, structuredClone(legacy[key])]));
const { indexedDB, values } = indexedDbStub(originals);
const local = localStorageStub();
globalThis.indexedDB = indexedDB;
globalThis.localStorage = local.storage;
globalThis.addEventListener = () => {};
const store = await import('../js/store.js?legacy-idb-success');
await store.initStore();

test('successful IndexedDB legacy migration writes v2 only after validation', () => {
    assert.equal(values.get('snapshot.v2').revision, 1);
    assert.equal(values.get('snapshot.v2').data.plans['2026-08-31'].days[0].blocks[0].sets.length, 3);
    assert.equal(JSON.parse(local.values.get('wl:snapshot.v2')).revision, 1);
    assert.equal(store.storageStatus().state, 'saved');
});

test('successful IndexedDB migration retains every v1 source collection', () => {
    for (const [key, value] of originals)
        assert.deepEqual(values.get(key), value, key);
});
