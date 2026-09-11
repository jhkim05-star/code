import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../js/config.js';
import { RESET_MARKER_KEY } from '../js/reset.js';
import { indexedDbStub, legacyPlan, localStorageStub } from './legacy-fixtures.mjs';

const resetId = 'current-reset';
const fresh = emptyData();
fresh.meta.resetId = resetId;
fresh.meta.resetAt = 100;
const currentSnapshot = { revision: 1, writer: resetId, updatedAt: 100, data: fresh };
const lateOld = emptyData();
lateOld.plans['2026-08-24'] = legacyPlan('2026-08-24', {
    exerciseId: 'old', name: '옛 계획', group: 'chest', sets: [{ reps: 10, weight: 40 }], rest: 90, tempo: 3,
});
const local = localStorageStub([
    [RESET_MARKER_KEY, JSON.stringify({ id: resetId, state: 'complete', completedAt: 100 })],
    ['wl:snapshot.v2', JSON.stringify({ revision: 999, writer: 'old-tab', updatedAt: 999, data: lateOld })],
]);
const idb = indexedDbStub([['snapshot.v2', currentSnapshot]]);
globalThis.localStorage = local.storage;
globalThis.indexedDB = idb.indexedDB;
globalThis.addEventListener = () => {};
const store = await import('../js/store.js?reset-generation-fence');
await store.initStore();

test('reload ignores late old-tab snapshot and keeps verified empty reset generation', () => {
    assert.equal(store.metadata().resetId, resetId);
    assert.equal(store.sessions().length, 0);
    assert.equal(Object.keys(store.plans()).length, 0);
    assert.equal(store.draft(), null);
});

test('pending reset marker blocks new writes from a stale tab', () => {
    local.storage.setItem(RESET_MARKER_KEY, JSON.stringify({ id: 'next-reset', state: 'pending' }));
    assert.throws(() => store.savePlan(legacyPlan('2026-08-24', {
        exerciseId: 'bench_press', name: '벤치프레스', group: 'chest', sets: [{ reps: 10, weight: 40 }], rest: 90, tempo: 3,
    })), /새로 시작/);
});
