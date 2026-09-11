/** Explicit, workout-scoped destructive reset. This module never imports the live store. */
import { emptyData } from './config.js';
import { validateData } from './validation.js';

export const WORKOUT_DB = 'workout-log';
export const WORKOUT_STORE = 'kv';
export const SNAPSHOT_KEY = 'wl:snapshot.v2';
export const DB_SNAPSHOT_KEY = 'snapshot.v2';
export const RESET_MARKER_KEY = 'wl:reset.v1';
export const WRITER_LOCK = 'workout-log-writer-v2';
export const CONTROL_CHANNEL = 'workout-log-control-v1';

export class ResetBlockedError extends Error {
    constructor(message = '다른 운동앱 창이 저장소를 사용 중입니다. 다른 운동앱 창을 모두 닫으면 이 화면에서 계속 진행하거나 다시 시도할 수 있습니다.') {
        super(message);
        this.name = 'ResetBlockedError';
        this.code = 'blocked';
    }
}

export class ResetFailedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ResetFailedError';
        this.code = 'failed';
    }
}

export function readResetMarker(storage = globalThis.localStorage) {
    try {
        const value = JSON.parse(storage?.getItem(RESET_MARKER_KEY) || 'null');
        return value && typeof value.id === 'string' && ['pending', 'complete'].includes(value.state) ? value : null;
    }
    catch {
        return null;
    }
}

export function snapshotMatchesReset(snapshot, marker) {
    if (!marker || marker.state !== 'complete')
        return true;
    return snapshot?.data?.meta?.resetId === marker.id;
}

export function blankResetData(resetId, resetAt = Date.now()) {
    const data = emptyData();
    data.meta.resetId = resetId;
    data.meta.resetAt = resetAt;
    return validateData(data);
}

export function ownedKeys(storage) {
    const keys = [];
    if (!storage)
        return keys;
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith('wl:'))
            keys.push(key);
    }
    return keys;
}

export function removeOwnedKeys(storage) {
    const keys = ownedKeys(storage);
    for (const key of keys)
        storage.removeItem(key);
    return keys;
}

function postControl(factory, message) {
    if (!factory)
        return;
    let channel;
    try {
        channel = factory(CONTROL_CHANNEL);
        channel.postMessage(message);
    }
    catch { }
    finally {
        channel?.close?.();
    }
}

function deleteDatabase(factory, onStatus) {
    if (!factory?.deleteDatabase)
        return Promise.resolve(false);
    return new Promise((resolve, reject) => {
        let request;
        try {
            request = factory.deleteDatabase(WORKOUT_DB);
        }
        catch {
            reject(new ResetFailedError('운동 저장소 삭제를 시작하지 못했습니다. 이 화면에서 다시 시도해 주세요.'));
            return;
        }
        request.onblocked = () => onStatus({ phase: 'blocked', message: '다른 운동앱 창이 저장소를 사용 중입니다. 그 창을 닫으면 이 화면이 자동으로 계속 진행합니다.' });
        request.onerror = () => reject(new ResetFailedError('운동 IndexedDB를 삭제하지 못했습니다. 다른 운동앱 창을 닫은 뒤 다시 시도해 주세요.'));
        request.onsuccess = () => resolve(true);
    });
}

function openDatabase(factory) {
    if (!factory?.open)
        return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        let request;
        try {
            request = factory.open(WORKOUT_DB, 1);
        }
        catch {
            reject(new ResetFailedError('빈 운동 저장소를 만들지 못했습니다.'));
            return;
        }
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(WORKOUT_STORE))
                request.result.createObjectStore(WORKOUT_STORE);
        };
        request.onblocked = () => reject(new ResetBlockedError());
        request.onerror = () => reject(new ResetFailedError('빈 운동 저장소를 열지 못했습니다.'));
        request.onsuccess = () => resolve(request.result);
    });
}

function putSnapshot(database, snapshot) {
    if (!database)
        return Promise.resolve(false);
    return new Promise((resolve, reject) => {
        try {
            const tx = database.transaction(WORKOUT_STORE, 'readwrite');
            tx.objectStore(WORKOUT_STORE).put(snapshot, DB_SNAPSHOT_KEY);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(new ResetFailedError('빈 운동 저장소를 저장하지 못했습니다.'));
            tx.onabort = () => reject(new ResetFailedError('빈 운동 저장소 저장이 중단됐습니다.'));
        }
        catch {
            reject(new ResetFailedError('빈 운동 저장소를 저장하지 못했습니다.'));
        }
    });
}

function getSnapshot(database) {
    if (!database)
        return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        try {
            const tx = database.transaction(WORKOUT_STORE, 'readonly');
            const request = tx.objectStore(WORKOUT_STORE).get(DB_SNAPSHOT_KEY);
            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => reject(new ResetFailedError('새 운동 저장소를 확인하지 못했습니다.'));
            tx.onabort = () => reject(new ResetFailedError('새 운동 저장소 확인이 중단됐습니다.'));
        }
        catch {
            reject(new ResetFailedError('새 운동 저장소를 확인하지 못했습니다.'));
        }
    });
}

function makeResetId(now) {
    return `reset_${now}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

async function withWriterLock(locks, task) {
    if (!locks?.request)
        return task();
    return locks.request(WRITER_LOCK, { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock)
            throw new ResetBlockedError();
        return task();
    });
}

/**
 * Deletes only workout-owned storage and installs a verified empty v2 state.
 * A pending marker is durable so an interrupted attempt can be retried without
 * allowing old snapshots or legacy collections to become active again.
 */
export async function resetWorkoutData({
    local = globalThis.localStorage,
    session = globalThis.sessionStorage,
    databaseFactory = globalThis.indexedDB,
    locks = globalThis.navigator?.locks,
    broadcastFactory = globalThis.BroadcastChannel ? name => new BroadcastChannel(name) : null,
    onStatus = () => {},
    peerWaitMs = 180,
    now = Date.now(),
    resetId = makeResetId(now),
} = {}) {
    const prior = readResetMarker(local);
    if (prior?.state === 'pending')
        resetId = prior.id;
    const pending = { id: resetId, state: 'pending', requestedAt: prior?.requestedAt || now };
    try {
        local.setItem(RESET_MARKER_KEY, JSON.stringify(pending));
    }
    catch {
        throw new ResetFailedError('초기화 진행 상태를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');
    }
    postControl(broadcastFactory, { type: 'reset-request', resetId });
    onStatus({ phase: 'stopping', message: '운동 타이머와 저장 작업을 중단하고 있습니다.' });
    if (peerWaitMs > 0)
        await new Promise(resolve => setTimeout(resolve, peerWaitMs));

    return withWriterLock(locks, async () => {
        onStatus({ phase: 'deleting', message: 'workout 기록·계획·설정과 복구 사본을 삭제하고 있습니다.' });
        const databaseDeleted = await deleteDatabase(databaseFactory, onStatus);

        removeOwnedKeys(local);
        removeOwnedKeys(session);

        const data = blankResetData(resetId, now);
        const snapshot = { revision: 1, writer: resetId, updatedAt: now, data };
        try {
            // Keep the reset fence in place across the asynchronous IndexedDB
            // rebuild. If this page closes midway, the next launch offers a
            // retry instead of treating a partially reset store as ordinary
            // legacy data.
            local.setItem(RESET_MARKER_KEY, JSON.stringify(pending));
            local.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
        }
        catch {
            throw new ResetFailedError('빈 운동일지를 localStorage에 저장하지 못했습니다. 이 화면에서 다시 시도해 주세요.');
        }

        let database = null;
        let databaseSaved = false;
        try {
            database = await openDatabase(databaseFactory);
            databaseSaved = await putSnapshot(database, snapshot);
            const stored = await getSnapshot(database);
            if (databaseSaved && (!snapshotMatchesReset(stored, { id: resetId, state: 'complete' }) || stored.revision !== 1))
                throw new ResetFailedError('새 IndexedDB 확인에 실패했습니다.');
        }
        finally {
            database?.close?.();
        }

        let localSnapshot;
        try {
            localSnapshot = JSON.parse(local.getItem(SNAPSHOT_KEY));
            validateData(localSnapshot.data);
        }
        catch {
            throw new ResetFailedError('새 운동일지 검증에 실패했습니다. 이 화면에서 다시 시도해 주세요.');
        }
        if (!snapshotMatchesReset(localSnapshot, { id: resetId, state: 'complete' }) || localSnapshot.revision !== 1)
            throw new ResetFailedError('새 운동일지 세대 확인에 실패했습니다.');
        if (localSnapshot.data.sessions.length || Object.keys(localSnapshot.data.plans).length || localSnapshot.data.draft)
            throw new ResetFailedError('빈 운동일지 확인에 실패했습니다.');

        const complete = { ...pending, state: 'complete', completedAt: Date.now() };
        try {
            local.setItem(RESET_MARKER_KEY, JSON.stringify(complete));
        }
        catch {
            throw new ResetFailedError('초기화 완료 상태를 저장하지 못했습니다. 이 화면에서 다시 시도해 주세요.');
        }
        if (readResetMarker(local)?.id !== resetId || readResetMarker(local)?.state !== 'complete')
            throw new ResetFailedError('초기화 완료 상태를 저장하지 못했습니다.');
        postControl(broadcastFactory, { type: 'reset-complete', resetId });
        onStatus({ phase: 'complete', message: '빈 운동일지를 확인했습니다.' });
        return { resetId, databaseDeleted, databaseSaved, data };
    });
}
