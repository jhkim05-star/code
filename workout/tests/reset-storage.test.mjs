import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../js/config.js';
import { RESET_MARKER_KEY, ResetBlockedError, ResetFailedError, resetWorkoutData, snapshotMatchesReset } from '../js/reset.js';
import { localStorageStub, resetIndexedDbStub } from './legacy-fixtures.mjs';

test('confirmed reset removes workout-owned raw data without parsing and preserves reading data', async () => {
    const local = localStorageStub([
        ['wl:settings', '{not json'],
        ['wl:plans', JSON.stringify({ old: true })],
        ['wl:snapshot.v2', '{also broken'],
        ['wl:before-import.v2', 'old recovery'],
        ['reading:snapshot', 'keep-reading'],
        ['bookshelf-reading-state', 'keep-reading-too'],
    ]);
    const session = localStorageStub([
        ['wl:aiProxyToken', 'temporary-token'],
        ['wl:draft', 'temporary-state'],
        ['reading:temporary', 'keep-session'],
    ]);
    const idb = resetIndexedDbStub([
        ['settings', { old: true }],
        ['plans', { old: true }],
        ['snapshot.v2', { revision: 99, data: { old: true } }],
        ['corrupt-before-restore.v2', { old: true }],
    ]);
    const messages = [];
    const result = await resetWorkoutData({
        local: local.storage,
        session: session.storage,
        databaseFactory: idb.factory,
        locks: null,
        broadcastFactory: () => ({ postMessage: value => messages.push(value), close() {} }),
        peerWaitMs: 0,
        resetId: 'reset-test',
        now: 123456,
    });

    assert.deepEqual(idb.deleteCalls, ['workout-log']);
    assert.deepEqual([...idb.values().keys()], ['snapshot.v2']);
    assert.equal(local.values.get('reading:snapshot'), 'keep-reading');
    assert.equal(local.values.get('bookshelf-reading-state'), 'keep-reading-too');
    assert.equal(session.values.get('reading:temporary'), 'keep-session');
    assert.equal(session.values.has('wl:aiProxyToken'), false);
    assert.equal([...local.values.keys()].filter(key => key.startsWith('wl:')).sort().join(','), 'wl:reset.v1,wl:snapshot.v2');
    assert.equal(JSON.parse(local.values.get(RESET_MARKER_KEY)).state, 'complete');
    assert.equal(result.data.sessions.length, 0);
    assert.equal(Object.keys(result.data.plans).length, 0);
    assert.equal(result.data.draft, null);
    assert.deepEqual(messages.map(message => message.type), ['reset-request', 'reset-complete']);
});

test('writer lock contention reports blocked and never claims success or deletes originals', async () => {
    const local = localStorageStub([['wl:plans', 'original']]);
    const idb = resetIndexedDbStub([['plans', { original: true }]]);
    const locks = { request: (_name, _options, callback) => callback(null) };
    await assert.rejects(
        resetWorkoutData({ local: local.storage, session: localStorageStub().storage, databaseFactory: idb.factory, locks, broadcastFactory: null, peerWaitMs: 0, resetId: 'blocked' }),
        ResetBlockedError,
    );
    assert.equal(local.values.get('wl:plans'), 'original');
    assert.equal(JSON.parse(local.values.get(RESET_MARKER_KEY)).state, 'pending');
    assert.deepEqual(idb.deleteCalls, []);
    assert.deepEqual(idb.values().get('plans'), { original: true });
});

test('a pending reset can be retried and completes with the same fenced generation', async () => {
    const local = localStorageStub([['wl:plans', 'original']]);
    const session = localStorageStub([['wl:temporary', 'old']]);
    const idb = resetIndexedDbStub([['plans', { original: true }]]);
    await assert.rejects(
        resetWorkoutData({
            local: local.storage,
            session: session.storage,
            databaseFactory: idb.factory,
            locks: { request: (_name, _options, callback) => callback(null) },
            broadcastFactory: null,
            peerWaitMs: 0,
            resetId: 'interrupted-generation',
        }),
        ResetBlockedError,
    );
    const pending = JSON.parse(local.values.get(RESET_MARKER_KEY));
    assert.equal(pending.id, 'interrupted-generation');
    assert.equal(pending.state, 'pending');

    const result = await resetWorkoutData({
        local: local.storage,
        session: session.storage,
        databaseFactory: idb.factory,
        locks: null,
        broadcastFactory: null,
        peerWaitMs: 0,
        resetId: 'should-not-replace-pending-id',
    });
    const complete = JSON.parse(local.values.get(RESET_MARKER_KEY));
    assert.equal(result.resetId, 'interrupted-generation');
    assert.equal(complete.id, 'interrupted-generation');
    assert.equal(complete.state, 'complete');
    assert.equal(session.values.has('wl:temporary'), false);
});

test('IndexedDB blocked then failed never removes local originals or reports completion', async () => {
    const local = localStorageStub([['wl:plans', 'original']]);
    const idb = resetIndexedDbStub([['plans', { original: true }]], { deleteMode: 'blocked-error' });
    const phases = [];
    await assert.rejects(
        resetWorkoutData({ local: local.storage, session: localStorageStub().storage, databaseFactory: idb.factory, locks: null, broadcastFactory: null, peerWaitMs: 0, resetId: 'idb-failed', onStatus: state => phases.push(state.phase) }),
        ResetFailedError,
    );
    assert.ok(phases.includes('blocked'));
    assert.equal(local.values.get('wl:plans'), 'original');
    assert.equal(JSON.parse(local.values.get(RESET_MARKER_KEY)).state, 'pending');
    assert.equal(idb.values().has('snapshot.v2'), false);
});

test('completed reset generation rejects a late old snapshot even with a larger revision', () => {
    const marker = { id: 'new-generation', state: 'complete' };
    const fresh = emptyData();
    fresh.meta.resetId = marker.id;
    const oldLate = { revision: 999, data: emptyData() };
    const current = { revision: 1, data: fresh };
    assert.equal(snapshotMatchesReset(oldLate, marker), false);
    assert.equal(snapshotMatchesReset(current, marker), true);
});
