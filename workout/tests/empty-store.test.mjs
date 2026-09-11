import test from 'node:test';
import assert from 'node:assert/strict';
import { localStorageStub } from './legacy-fixtures.mjs';

const local = localStorageStub();
globalThis.localStorage = local.storage;
globalThis.addEventListener = () => {};
const store = await import('../js/store.js?empty-first-run');
await store.initStore();

test('first run with an empty store remains writable and empty', () => {
    assert.equal(store.storageStatus().state, 'saved');
    assert.equal(store.storageStatus().readOnly, false);
    assert.equal(store.sessions().length, 0);
    assert.equal(Object.keys(store.plans()).length, 0);
    assert.equal(store.draft(), null);
});
