import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../js/config.js';
import { RESET_MARKER_KEY, resetWorkoutData } from '../js/reset.js';
import { indexedDbStub, legacyPlan, legacySession, localStorageStub, resetIndexedDbStub } from './legacy-fixtures.mjs';

const STORE_KEY = 'wl:snapshot.v2';

function currentState(resetId = 'current-reset', data = emptyData(), revision = 1) {
    const current = structuredClone(data);
    current.meta.resetId = resetId;
    current.meta.resetAt = 100;
    const marker = { id: resetId, state: 'complete', requestedAt: 90, completedAt: 100 };
    const snapshot = { revision, writer: resetId, updatedAt: 100, data: current };
    return { marker, snapshot };
}

function backupWith(data, resetId) {
    const copy = structuredClone(data);
    if (resetId === undefined) {
        delete copy.meta.resetId;
        delete copy.meta.resetAt;
    }
    else {
        copy.meta.resetId = resetId;
        copy.meta.resetAt = 1;
    }
    return { app: 'workout-log', version: 2, data: copy };
}

function validPlan(weekStart, name = '복구 계획') {
    return legacyPlan(weekStart, {
        exerciseId: 'bench_press', name, group: 'chest',
        sets: [{ reps: 8, weight: 50 }], rest: 90, tempo: 3,
    });
}

async function loadStore(tag, local, indexedDB, navigatorValue = {}) {
    globalThis.localStorage = local;
    globalThis.indexedDB = indexedDB;
    globalThis.addEventListener = () => {};
    Object.defineProperty(globalThis, 'navigator', { value: navigatorValue, configurable: true, writable: true });
    const store = await import(`../js/store.js?${tag}`);
    await store.initStore();
    return store;
}

function delayedWriteIndexedDb(initial = []) {
    const values = new Map(initial);
    const pending = [];
    const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        close() {},
        transaction: (_name, mode) => {
            let aborted = false;
            const tx = {
                oncomplete: null,
                onerror: null,
                onabort: null,
                abort() {
                    aborted = true;
                    queueMicrotask(() => tx.onabort?.());
                },
                objectStore: () => ({
                    get(key) {
                        const request = {};
                        const finish = () => {
                            if (aborted)
                                return;
                            request.result = values.get(key);
                            request.onsuccess?.();
                            if (mode === 'readonly')
                                queueMicrotask(() => !aborted && tx.oncomplete?.());
                        };
                        if (mode === 'readwrite')
                            pending.push(finish);
                        else
                            queueMicrotask(finish);
                        return request;
                    },
                    put(value, key) {
                        values.set(key, structuredClone(value));
                        queueMicrotask(() => !aborted && tx.oncomplete?.());
                    },
                }),
            };
            return tx;
        },
    };
    return {
        values,
        indexedDB: {
            open: () => {
                const request = {};
                queueMicrotask(() => {
                    request.result = db;
                    request.onsuccess?.();
                });
                return request;
            },
        },
        release() {
            for (const finish of pending.splice(0))
                finish();
        },
    };
}

test('completed reset can save new records and then perform an ordinary wipe in the same generation', async () => {
    const { marker, snapshot } = currentState();
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, JSON.stringify(snapshot)],
    ]);
    const idb = indexedDbStub([['snapshot.v2', snapshot]]);
    const store = await loadStore('reset-save-then-wipe', local.storage, idb.indexedDB);

    store.saveSession(legacySession());
    await store.flush();
    assert.equal(store.sessions().length, 1);
    await store.wipeAll();

    assert.equal(store.sessions().length, 0);
    assert.equal(store.metadata().resetId, marker.id);
    assert.equal(JSON.parse(local.values.get(STORE_KEY)).data.meta.resetId, marker.id);
    assert.equal(idb.values.get('snapshot.v2').data.meta.resetId, marker.id);
});

test('replace import of a pre-reset backup survives reload without adopting backup generation metadata', async () => {
    const { marker, snapshot } = currentState('generation-a');
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, JSON.stringify(snapshot)],
    ]);
    const idb = indexedDbStub([['snapshot.v2', snapshot]]);
    const imported = emptyData();
    imported.sessions = [legacySession()];
    const store = await loadStore('replace-pre-reset-backup', local.storage, idb.indexedDB);

    await store.importAll(backupWith(imported), { mode: 'replace' });
    const reloaded = await loadStore('replace-pre-reset-backup-reload', local.storage, idb.indexedDB);

    assert.equal(reloaded.sessions()[0].comment, '보존할 기록');
    assert.equal(reloaded.metadata().resetId, marker.id);
    assert.equal(JSON.parse(local.values.get(STORE_KEY)).data.meta.resetId, marker.id);
});

test('replace import rewrites a different backup resetId to the active store generation', async () => {
    const { marker, snapshot } = currentState('active-generation');
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, JSON.stringify(snapshot)],
    ]);
    const idb = indexedDbStub([['snapshot.v2', snapshot]]);
    const imported = emptyData();
    imported.plans['2026-09-07'] = validPlan('2026-09-07');
    const store = await loadStore('replace-other-reset-id', local.storage, idb.indexedDB);

    await store.importAll(backupWith(imported, 'backup-generation'), { mode: 'replace' });

    assert.equal(store.getPlan('2026-09-07').days[0].blocks[0].name, '복구 계획');
    assert.equal(store.metadata().resetId, 'active-generation');
    assert.equal(idb.values.get('snapshot.v2').data.meta.resetId, 'active-generation');
});

test('protected backup restore uses the active reset generation and becomes writable', async () => {
    const { marker } = currentState('protected-generation');
    const corrupt = '{broken snapshot';
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, corrupt],
    ]);
    const restored = emptyData();
    restored.sessions = [legacySession()];
    const store = await loadStore('protected-backup-restore', local.storage, undefined);
    assert.equal(store.storageStatus().readOnly, true);

    await store.restoreProtectedBackup(backupWith(restored, 'old-generation'));

    assert.equal(store.storageStatus().readOnly, false);
    assert.equal(store.sessions().length, 1);
    assert.equal(store.metadata().resetId, marker.id);
    assert.equal(JSON.parse(local.values.get(STORE_KEY)).data.meta.resetId, marker.id);
    assert.equal(local.values.get('wl:corrupt-before-restore.v2').includes(corrupt), true);
});

test('a window without the writer lock cannot restore over protected storage', async () => {
    const { marker } = currentState('locked-generation');
    const corrupt = '{locked-corrupt-snapshot';
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, corrupt],
    ]);
    const noLock = { locks: { request: (_name, _options, callback) => Promise.resolve(callback(null)) } };
    const store = await loadStore('protected-backup-without-lock', local.storage, undefined, noLock);

    await assert.rejects(store.restoreProtectedBackup(backupWith(emptyData())), /단독 사용/);
    assert.equal(local.values.get(STORE_KEY), corrupt);
    assert.equal(store.storageStatus().readOnly, true);
});

test('failed replace keeps both live memory and persisted snapshots unchanged', async () => {
    const original = emptyData();
    original.plans['2026-09-07'] = validPlan('2026-09-07', '기존 계획');
    const { marker, snapshot } = currentState('failure-generation', original, 4);
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, JSON.stringify(snapshot)],
    ]);
    const idb = indexedDbStub([['snapshot.v2', snapshot]], { writeMode: 'failure' });
    const originalLocalSet = local.storage.setItem;
    let failSnapshotWrites = false;
    local.storage.setItem = (key, value) => {
        if (failSnapshotWrites && key === STORE_KEY)
            throw new Error('local write failed');
        originalLocalSet(key, value);
    };
    const store = await loadStore('failed-replace-rollback', local.storage, idb.indexedDB);
    const replacement = emptyData();
    replacement.plans['2026-09-07'] = validPlan('2026-09-07', '새 계획');
    failSnapshotWrites = true;

    await assert.rejects(store.importAll(backupWith(replacement), { mode: 'replace' }), /저장하지 못했습니다/);

    assert.equal(store.getPlan('2026-09-07').days[0].blocks[0].name, '기존 계획');
    assert.deepEqual(JSON.parse(local.values.get(STORE_KEY)), snapshot);
    assert.deepEqual(idb.values.get('snapshot.v2'), snapshot);
});

test('a pending newer reset generation blocks an already queued IndexedDB write and later stale writes', async () => {
    const { marker, snapshot } = currentState('old-tab-generation');
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, JSON.stringify(snapshot)],
    ]);
    const idb = delayedWriteIndexedDb([['snapshot.v2', snapshot]]);
    const store = await loadStore('delayed-old-generation-write', local.storage, idb.indexedDB);

    store.savePlan(validPlan('2026-09-07', '지연 저장'));
    await new Promise(resolve => setTimeout(resolve, 0));
    local.storage.setItem(RESET_MARKER_KEY, JSON.stringify({ id: 'new-generation', state: 'pending' }));
    idb.release();
    await store.flush();

    assert.deepEqual(idb.values.get('snapshot.v2'), snapshot);
    assert.throws(() => store.savePlan(validPlan('2026-09-14')), /새로 시작/);
});

test('corrupt localStorage after reset is not replaced with an automatic empty snapshot', async () => {
    const { marker } = currentState('corrupt-local-generation');
    const corrupt = '{not-json';
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, corrupt],
        ['reading:snapshot', 'keep-reading'],
    ]);
    const store = await loadStore('corrupt-local-no-overwrite', local.storage, undefined);

    assert.equal(store.storageStatus().state, 'error');
    assert.equal(store.storageStatus().readOnly, true);
    assert.equal(local.values.get(STORE_KEY), corrupt);
    assert.equal(local.values.get('reading:snapshot'), 'keep-reading');
});

test('IndexedDB read failure after reset is not treated as an empty store', async () => {
    const { marker, snapshot } = currentState('idb-read-failure-generation');
    const local = localStorageStub([[RESET_MARKER_KEY, JSON.stringify(marker)]]);
    const idb = indexedDbStub([['snapshot.v2', snapshot]], { readMode: 'failure' });
    const store = await loadStore('idb-read-failure-no-overwrite', local.storage, idb.indexedDB);

    assert.equal(store.storageStatus().state, 'error');
    assert.equal(store.storageStatus().readOnly, true);
    assert.equal(local.values.has(STORE_KEY), false);
    assert.deepEqual(idb.values.get('snapshot.v2'), snapshot);
});

test('a complete reset marker alone never causes an automatic empty snapshot write', async () => {
    const { marker } = currentState('marker-only-generation');
    const local = localStorageStub([[RESET_MARKER_KEY, JSON.stringify(marker)]]);
    const store = await loadStore('marker-only-no-write', local.storage, undefined);

    assert.equal(store.storageStatus().state, 'error');
    assert.equal(store.storageStatus().readOnly, true);
    assert.equal(local.values.has(STORE_KEY), false);
});

test('an older generation snapshot is preserved but never adopted automatically', async () => {
    const { marker } = currentState('newer-generation');
    const oldData = emptyData();
    oldData.meta.resetId = 'older-generation';
    oldData.meta.resetAt = 1;
    oldData.sessions = [legacySession()];
    const oldSnapshot = { revision: 99, writer: 'old-tab', updatedAt: 999, data: oldData };
    const rawOldSnapshot = JSON.stringify(oldSnapshot);
    const local = localStorageStub([
        [RESET_MARKER_KEY, JSON.stringify(marker)],
        [STORE_KEY, rawOldSnapshot],
    ]);
    const store = await loadStore('old-generation-not-adopted', local.storage, undefined);

    assert.equal(store.storageStatus().state, 'error');
    assert.equal(store.storageStatus().readOnly, true);
    assert.equal(store.sessions().length, 0);
    assert.equal(local.values.get(STORE_KEY), rawOldSnapshot);
});

test('confirmed reset creates blank v2, then new plan save and reload remain healthy', async () => {
    const local = localStorageStub([
        ['wl:old-workout', 'remove'],
        ['reading:snapshot', 'keep-reading'],
    ]);
    const session = localStorageStub([['reading:cache', 'keep-cache']]);
    const idb = resetIndexedDbStub([['plans', { old: true }]]);
    await resetWorkoutData({
        local: local.storage,
        session: session.storage,
        databaseFactory: idb.factory,
        locks: null,
        broadcastFactory: null,
        peerWaitMs: 0,
        resetId: 'confirmed-generation',
        now: 100,
    });
    const store = await loadStore('confirmed-reset-new-plan', local.storage, idb.factory);
    store.savePlan(validPlan('2026-09-07', '새 운동'));
    await store.flush();
    const reloaded = await loadStore('confirmed-reset-new-plan-reload', local.storage, idb.factory);

    assert.equal(reloaded.storageStatus().readOnly, false);
    assert.equal(reloaded.getPlan('2026-09-07').days[0].blocks[0].name, '새 운동');
    assert.equal(reloaded.metadata().resetId, 'confirmed-generation');
    assert.equal(local.values.get('reading:snapshot'), 'keep-reading');
    assert.equal(session.values.get('reading:cache'), 'keep-cache');
});
