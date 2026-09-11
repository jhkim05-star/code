import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyBlock, legacyData, legacyPlan, legacyStorageEntries, localStorageStub } from './legacy-fixtures.mjs';

const legacy = legacyData();
legacy.plans = {
    '2026-08-24': legacyPlan('2026-08-24', legacyBlock({ group: 'unknown-old-group' })),
};
const original = legacyStorageEntries(legacy);
const local = localStorageStub(original);
globalThis.localStorage = local.storage;
globalThis.addEventListener = () => {};
const store = await import('../js/store.js?unknown-group-reset-entry');
await store.initStore();

test('unknown 2026-08-24 plan group reproduces read-only migration error', () => {
    assert.equal(store.storageStatus().state, 'error');
    assert.equal(store.storageStatus().readOnly, true);
    assert.match(store.storageStatus().message, /계획의 부위가 올바르지 않습니다/);
    assert.match(store.storageStatus().message, /2026-08-24/);
});

test('migration error does not automatically delete or replace source data', () => {
    assert.equal(local.values.has('wl:snapshot.v2'), false);
    for (const [key, value] of original)
        assert.equal(local.values.get(key), value);
});
