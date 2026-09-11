/** Backward-compatible storage with a single, revisioned v2 snapshot and explicit errors. */
import { DEFAULT_SETTINGS, emptyData } from './config.js';
import { clone, uid, finite, LB_PER_KG } from './util.js';
import { validateData, validateSettings, validateSession, validateWeeklyPlan, validateDraft, validateLegacyDataForRecovery, parseBackup } from './validation.js';
import { SnapshotWriter } from './persistence.js';
import { CONTROL_CHANNEL, RESET_MARKER_KEY, blankResetData, readResetMarker, snapshotMatchesReset } from './reset.js';
export { DEFAULT_SETTINGS };
const SNAPSHOT_KEY = 'wl:snapshot.v2';
const DB_SNAPSHOT = 'snapshot.v2';
const LEGACY_KEYS = ['settings', 'plans', 'sessions', 'customExercises', 'meta'];
const providerCredential = /^(apiKey|proxyToken|openaiKey|anthropicKey|apiToken|openaiApiKey|anthropicApiKey|openaiProxyToken|clientToken)$/i;
let mem = emptyData(), db = null, writer = null, ready = false, lastSave = Promise.resolve(), resetting = false;
let status = { state: 'loading', message: '저장소 확인 중', readOnly: false, dirty: false, revision: 0 };
const listeners = new Set();
let releaseWriterLock = null, ownsWriterLock = false, controlChannel = null, lifecycleInstalled = false;
let dbOpenFailed = false, storeGeneration = null;
export const storageStatus = () => ({ ...status });
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() {
    for (const fn of listeners) {
        try {
            fn(storageStatus());
        }
        catch (e) {
            console.error(e);
        }
    }
}
function openDB() {
    return new Promise(resolve => {
        dbOpenFailed = false;
        if (!globalThis.indexedDB)
            return resolve(null);
        let req, settled = false;
        const finish = value => {
            if (settled) {
                value?.close?.();
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        const fail = () => {
            dbOpenFailed = true;
            finish(null);
        };
        const timer = setTimeout(fail, 2500);
        try {
            req = indexedDB.open('workout-log', 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('kv'))
                    req.result.createObjectStore('kv');
            };
            req.onsuccess = () => finish(req.result);
            req.onerror = fail;
            req.onblocked = fail;
        }
        catch {
            fail();
        }
    });
}
function idbGet(key) {
    return new Promise(resolve => {
        if (!db)
            return resolve(undefined);
        let settled = false;
        const finish = value => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        const timer = setTimeout(() => finish(undefined), 2500);
        try {
            const tx = db.transaction('kv', 'readonly');
            const r = tx.objectStore('kv').get(key);
            r.onsuccess = () => finish(r.result);
            r.onerror = () => finish(undefined);
            tx.onabort = () => finish(undefined);
        }
        catch {
            finish(undefined);
        }
    });
}
function idbGetStrict(key) {
    return new Promise((resolve, reject) => {
        if (!db)
            return dbOpenFailed ? reject(new Error('IndexedDB를 열지 못했습니다.')) : resolve(undefined);
        let settled = false;
        const finish = (error, value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            error ? reject(error) : resolve(value);
        };
        const timer = setTimeout(() => finish(new Error('IndexedDB 읽기 시간이 초과됐습니다.')), 2500);
        try {
            const tx = db.transaction('kv', 'readonly');
            const r = tx.objectStore('kv').get(key);
            r.onsuccess = () => finish(null, r.result);
            r.onerror = () => finish(new Error('IndexedDB 저장본을 읽지 못했습니다.'));
            tx.onabort = () => finish(new Error('IndexedDB 읽기가 중단됐습니다.'));
        }
        catch {
            finish(new Error('IndexedDB 저장본을 읽지 못했습니다.'));
        }
    });
}
function idbWrite(snapshot) {
    return new Promise(resolve => {
        if (!db)
            return resolve(false);
        let tx, settled = false;
        const finish = ok => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(ok);
        };
        const timer = setTimeout(() => {
            try {
                tx?.abort();
            }
            catch { }
            finish(false);
        }, 5000);
        try {
            tx = db.transaction('kv', 'readwrite');
            const store = tx.objectStore('kv');
            const r = store.get(DB_SNAPSHOT);
            r.onsuccess = () => {
                const current = r.result;
                const marker = readResetMarker();
                const snapshotResetId = snapshot?.data?.meta?.resetId;
                const currentResetId = current?.data?.meta?.resetId;
                if (marker?.state === 'pending' || (marker?.state === 'complete' && snapshotResetId !== marker.id)) {
                    tx.abort();
                    return;
                }
                const sameGeneration = marker?.state !== 'complete' || currentResetId === snapshotResetId;
                if (sameGeneration && current && current.revision > snapshot.revision) {
                    tx.abort();
                    return;
                }
                store.put(snapshot, DB_SNAPSHOT);
            };
            tx.oncomplete = () => finish(true);
            tx.onerror = () => finish(false);
            tx.onabort = () => finish(false);
        }
        catch {
            finish(false);
        }
    });
}
function idbPut(key, value) {
    return new Promise(resolve => {
        if (!db)
            return resolve(false);
        let tx, settled = false;
        const finish = ok => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(ok);
        };
        const timer = setTimeout(() => {
            try {
                tx?.abort();
            }
            catch { }
            finish(false);
        }, 5000);
        try {
            tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(value, key);
            tx.oncomplete = () => finish(true);
            tx.onerror = () => finish(false);
            tx.onabort = () => finish(false);
        }
        catch {
            finish(false);
        }
    });
}
function localRaw(key) {
    try {
        return localStorage.getItem(key);
    }
    catch {
        return null;
    }
}
function localGet(key) { const raw = localStorage.getItem(key); return raw == null ? undefined : JSON.parse(raw); }
function localSet(key, value) { localStorage.setItem(key, JSON.stringify(value)); return true; }
function scrubProviderCredentials(value) {
    if (!value || typeof value !== 'object')
        return false;
    let changed = false;
    for (const key of Object.keys(value)) {
        if (providerCredential.test(key)) {
            delete value[key];
            changed = true;
        }
        else
            changed = scrubProviderCredentials(value[key]) || changed;
    }
    return changed;
}
async function purgeStoredProviderCredentials() {
    const localKeys = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('wl:'))
                localKeys.push(key);
        }
    }
    catch { }
    for (const key of localKeys) {
        const raw = localRaw(key);
        if (raw == null)
            continue;
        let value;
        try {
            value = JSON.parse(raw);
        }
        catch {
            // Corrupt storage is handled by the normal recovery path below.
            continue;
        }
        if (scrubProviderCredentials(value)) {
            try {
                localSet(key, value);
            }
            catch {
                throw new Error('기존 제공자 API 키를 localStorage에서 제거하지 못했습니다.');
            }
        }
    }
    for (const key of [DB_SNAPSHOT, 'settings']) {
        const value = await idbGet(key);
        if (value !== undefined && scrubProviderCredentials(value) && !await idbPut(key, value))
            throw new Error('기존 제공자 API 키를 IndexedDB에서 제거하지 못했습니다.');
    }
}
async function acquireWriter() {
    if (!globalThis.navigator?.locks)
        return true;
    return new Promise(resolve => {
        navigator.locks.request('workout-log-writer-v2', { ifAvailable: true }, async (lock) => {
            if (!lock) {
                resolve(false);
                return;
            }
            resolve(true);
            await new Promise(r => { releaseWriterLock = r; });
        }).catch(() => resolve(false));
    });
}
function closeConnections() {
    try {
        db?.close?.();
    }
    catch { }
    db = null;
    releaseWriterLock?.();
    releaseWriterLock = null;
    ownsWriterLock = false;
}
async function quiesceForReset(resetId) {
    if (resetting)
        return;
    resetting = true;
    status = { ...status, state: 'resetting', readOnly: true, dirty: false, message: '다른 화면에서 운동 데이터 새로 시작을 진행 중입니다. 이 창은 저장을 중단했습니다.' };
    notify();
    try {
        globalThis.dispatchEvent?.(new Event('workout:reset-start'));
    }
    catch { }
    await lastSave.catch(() => { });
    closeConnections();
    if (resetId)
        mem.meta.pendingResetId = resetId;
}
function installLifecycleListeners() {
    if (lifecycleInstalled || !globalThis.addEventListener)
        return;
    lifecycleInstalled = true;
    addEventListener('storage', e => {
        if (e.key === RESET_MARKER_KEY && e.newValue) {
            let marker = null;
            try {
                marker = JSON.parse(e.newValue);
            }
            catch { }
            if (marker?.id && (marker.state === 'pending' || marker.id !== storeGeneration?.id))
                quiesceForReset(marker.id);
            return;
        }
        if (e.key !== SNAPSHOT_KEY || !e.newValue)
            return;
        try {
            const incoming = JSON.parse(e.newValue);
            if (incoming.writer !== writer?.writer && incoming.revision >= writer?.revision && !status.readOnly) {
                status = { ...status, readOnly: true, state: 'conflict', message: '다른 창에서 새 기록을 저장했습니다. 백업 후 이 창을 새로고침해 주세요.' };
                notify();
            }
        }
        catch { }
    });
    if (globalThis.document && globalThis.BroadcastChannel) {
        try {
            controlChannel = new BroadcastChannel(CONTROL_CHANNEL);
            controlChannel.onmessage = event => {
                if (event.data?.type === 'reset-request')
                    quiesceForReset(event.data.resetId);
            };
        }
        catch { }
    }
    addEventListener('pagehide', () => {
        closeConnections();
        controlChannel?.close?.();
        controlChannel = null;
    });
    addEventListener('pageshow', async (e) => {
        if (!e.persisted)
            return;
        if (readResetMarker()) {
            status = { ...status, readOnly: true, state: 'resetting', message: '저장 상태가 바뀌었습니다. 최신 빈 운동일지를 열려면 새로고침해 주세요.' };
            notify();
            return;
        }
        const owns = await acquireWriter();
        status.readOnly = !owns;
        status.message = '화면 복원 후 최신 저장값 확인을 위해 새로고침해 주세요.';
        status.readOnly = true;
        notify();
    });
}
export async function initStore() {
    const resetMarker = readResetMarker();
    storeGeneration = resetMarker?.state === 'complete'
        ? { id: resetMarker.id, resetAt: resetMarker.completedAt || Date.now() }
        : null;
    if (resetMarker?.state === 'pending') {
        resetting = true;
        mem = emptyData();
        mem.meta.pendingResetId = resetMarker.id;
        status = { ...status, state: 'resetting', readOnly: true, dirty: false, message: '확인한 운동 데이터 초기화가 완료되지 않았습니다. 기존 운동 데이터 삭제 후 새로 시작에서 다시 시도해 주세요.' };
        ready = true;
        installLifecycleListeners();
        notify();
        return mem;
    }
    const ownsLock = await acquireWriter();
    ownsWriterLock = ownsLock;
    db = await openDB();
    if (ownsLock)
        await purgeStoredProviderCredentials();
    const snapshotReads = {
        local: 'unread',
        database: globalThis.indexedDB ? (dbOpenFailed ? 'error' : 'unread') : 'unavailable',
    };
    const acceptGeneration = (value, source) => {
        if (value === undefined) {
            snapshotReads[source] = 'missing';
            return undefined;
        }
        if (resetMarker?.state === 'complete' && !snapshotMatchesReset(value, resetMarker)) {
            snapshotReads[source] = 'mismatch';
            return undefined;
        }
        snapshotReads[source] = 'current';
        return value;
    };
    writer = new SnapshotWriter({
        writer: uid('window'),
        local: {
            read: async () => {
                try {
                    return acceptGeneration(localGet(SNAPSHOT_KEY), 'local');
                }
                catch (error) {
                    snapshotReads.local = 'error';
                    throw error;
                }
            },
            writeSync: value => localSet(SNAPSHOT_KEY, value),
        },
        database: {
            read: async () => {
                try {
                    return acceptGeneration(await idbGetStrict(DB_SNAPSHOT), 'database');
                }
                catch (error) {
                    snapshotReads.database = 'error';
                    throw error;
                }
            },
            write: idbWrite,
        },
    });
    let validatedLegacy = null;
    try {
        const latest = await writer.load();
        if (writer.readErrors.length)
            throw new Error('저장소 사본을 읽지 못했습니다. 오래된 사본으로 자동 교체하지 않습니다. 원본 복구 파일을 먼저 내보내 주세요.');
        if (latest) {
            mem = validateData(latest.data);
            if (storeGeneration)
                storeGeneration.resetAt = mem.meta.resetAt || storeGeneration.resetAt;
        }
        else if (resetMarker?.state === 'complete') {
            mem = blankResetData(resetMarker.id, resetMarker.completedAt || Date.now());
            const details = Object.entries(snapshotReads)
                .filter(([, state]) => !['unavailable', 'unread'].includes(state))
                .map(([source, state]) => `${source === 'local' ? 'localStorage' : 'IndexedDB'}: ${state === 'missing' ? '저장본 없음' : state === 'mismatch' ? '세대 불일치' : '읽기 실패'}`)
                .join(', ');
            status = {
                ...status,
                state: 'error',
                readOnly: true,
                dirty: false,
                message: `현재 초기화 세대의 정상 저장본을 확보하지 못했습니다${details ? ` (${details})` : ''}. 자동으로 빈 스냅샷을 만들거나 원본을 덮어쓰지 않았습니다. 복구 원본을 내보낸 뒤 보호된 백업을 복구하거나, 사용자가 확인한 새로 시작을 다시 실행하세요.`,
            };
        }
        else {
            // Legacy copies carry no common revision. Keep both unchanged and surface a conflict rather than guessing.
            const legacy = {}, localLegacy = {}, dbLegacy = {};
            let conflict = false, found = false;
            for (const k of LEGACY_KEYS) {
                const a = await idbGet(k), b = localGet('wl:' + k);
                if (a !== undefined)
                    dbLegacy[k] = a;
                if (b !== undefined)
                    localLegacy[k] = b;
                if (a !== undefined && b !== undefined && JSON.stringify(a) !== JSON.stringify(b))
                    conflict = true;
                legacy[k] = a ?? b;
                if (legacy[k] !== undefined)
                    found = true;
            }
            if (localRaw(SNAPSHOT_KEY) != null || await idbGet(DB_SNAPSHOT))
                throw new Error('저장된 스냅샷을 해석하지 못했습니다. 원본은 그대로 보존됩니다.');
            if (found) {
                const candidate = { ...emptyData(), ...Object.fromEntries(Object.entries(legacy).filter(([, v]) => v !== undefined)) };
                try {
                    mem = validateData(candidate, { legacy: true });
                    validatedLegacy = mem;
                }
                catch (error) {
                    let recovery;
                    try {
                        recovery = validateLegacyDataForRecovery(candidate);
                    }
                    catch {
                        throw error;
                    }
                    if (!recovery.errors.length)
                        throw error;
                    mem = recovery.data;
                    validatedLegacy = mem;
                    const weeks = recovery.errors.map(x => x.weekStart).join(', ');
                    status = {
                        ...status,
                        state: 'error',
                        readOnly: true,
                        dirty: false,
                        message: `자동 초기화하지 않았습니다. ${error.message} 기존 기록·설정과 검증된 계획은 읽기 전용으로 표시합니다. 문제 계획: ${weeks}. 구버전 원본은 그대로 보존되며 복구 원본 내보내기로 저장할 수 있습니다.`,
                    };
                }
            }
            else
                mem = emptyData();
            if (conflict) {
                mem.meta.legacyConflict = { local: localLegacy, database: dbLegacy };
                status = { ...status, readOnly: true, state: 'conflict', message: '이전 IndexedDB와 localStorage가 다릅니다. 설정에서 복구 원본을 선택해 주세요.' };
            }
            else if (found && !status.readOnly && ownsLock) {
                // Commit the canonical v2 snapshot only after every legacy
                // collection and every stored week validates successfully.
                const result = await writer.save(mem);
                status = {
                    ...status,
                    state: 'saved',
                    dirty: false,
                    revision: result.revision,
                    message: result.database ? '기존 자료를 v2로 변환해 기기에 저장함' : '기존 자료를 v2로 변환함 · localStorage만 사용 중',
                };
            }
        }
        if (!status.readOnly && !ownsLock)
            status = { ...status, readOnly: true, state: 'readonly', message: '다른 창에서 사용 중입니다. 이 창은 읽기 전용이에요.' };
        else if (!status.readOnly && status.state !== 'saved')
            status = { ...status, state: 'saved', message: '기기 저장소 준비됨', revision: writer.revision };
    }
    catch (err) {
        // A validated legacy model remains useful if the new snapshot write
        // itself fails. Its source copies are never removed or replaced.
        mem = validatedLegacy || (storeGeneration ? blankResetData(storeGeneration.id, storeGeneration.resetAt) : emptyData());
        status = { ...status, state: 'error', readOnly: true, dirty: false, message: `자동 초기화하지 않았습니다. ${err.message} 저장소 원본은 그대로 보존되며 복구 원본 내보내기로 저장할 수 있습니다.` };
    }
    ready = true;
    notify();
    installLifecycleListeners();
    return mem;
}
function ensureGenerationCurrent() {
    if (resetting)
        throw new Error('운동 데이터 새로 시작을 진행 중이어서 이 창에서는 저장할 수 없습니다.');
    const marker = readResetMarker();
    const generationChanged = marker?.state === 'pending'
        || (marker?.state === 'complete' && marker.id !== storeGeneration?.id)
        || (storeGeneration && marker?.state !== 'complete');
    if (generationChanged) {
        quiesceForReset(marker?.id);
        throw new Error('다른 화면에서 운동 데이터를 새로 시작했습니다. 이 창을 새로고침해 주세요.');
    }
}
function ensureWritable({ allowReadOnly = false } = {}) {
    ensureGenerationCurrent();
    if (status.readOnly && !allowReadOnly)
        throw new Error(status.message);
    if (!ownsWriterLock)
        throw new Error('다른 창을 먼저 닫고 이 창을 새로고침해 주세요.');
}
function saveData(data) {
    if (!writer)
        return Promise.reject(new Error('저장소가 아직 준비되지 않았습니다.'));
    const requestedRevision = writer.revision + 1;
    status = { ...status, state: 'saving', dirty: true, message: '기기에 저장 중' };
    notify();
    lastSave = writer.save(data).then(result => {
        if (!resetting && requestedRevision === writer.revision)
            status = { ...status, state: 'saved', dirty: false, revision: result.revision, message: result.database ? '기기에 저장됨' : '기기에 저장됨 · localStorage만 사용 중' };
        notify();
        return result;
    }).catch(err => { if (!resetting) status = { ...status, state: 'error', dirty: true, message: err.message }; notify(); throw err; });
    // UI can await flush(); the event handler also reports the failure prominently.
    lastSave.catch(() => { });
    return lastSave;
}
function persist() {
    ensureWritable();
    return saveData(mem);
}
function replacementForCurrentGeneration(value) {
    const next = validateData(value);
    delete next.meta.resetId;
    delete next.meta.resetAt;
    delete next.meta.pendingResetId;
    if (storeGeneration) {
        next.meta.resetId = storeGeneration.id;
        next.meta.resetAt = storeGeneration.resetAt;
    }
    return next;
}
async function replaceMem(value, { allowReadOnly = false } = {}) {
    ensureWritable({ allowReadOnly });
    const next = replacementForCurrentGeneration(value);
    const priorStatus = { ...status };
    await lastSave;
    ensureWritable({ allowReadOnly });
    try {
        const result = await saveData(next);
        mem = next;
        if (allowReadOnly) {
            status = { ...status, readOnly: false, state: 'saved', dirty: false, revision: result.revision };
        }
        notify();
        return result;
    }
    catch (error) {
        status = { ...priorStatus, state: 'error', dirty: false, message: error.message };
        notify();
        throw error;
    }
}
export async function flush() { await lastSave; return !status.dirty; }
export async function retrySave() { ensureWritable(); return persist(); }
export const settings = () => mem.settings;
export const plans = () => mem.plans;
export const sessions = () => mem.sessions;
export const customExercises = () => mem.customExercises;
export const rotation = () => mem.meta.rotation;
export const getPlan = key => mem.plans[key] || null;
export const getSession = id => mem.sessions.find(s => s.id === id) || null;
export const sessionsOn = date => mem.sessions.filter(s => s.date === date);
export const draft = () => mem.draft;
export const metadata = () => mem.meta;
export const isReady = () => ready;
export const avoidExerciseIds = () => mem.settings.avoidExerciseIds;
export const isAvoided = id => avoidExerciseIds().includes(id);
export function setSetting(path, value) {
    ensureWritable();
    const pathParts = path.split('.');
    if (pathParts.some(k => ['__proto__', 'constructor', 'prototype'].includes(k)))
        throw new Error('허용되지 않은 설정 경로입니다.');
    if (pathParts.some(k => providerCredential.test(k)))
        throw new Error('제공자 API 키는 브라우저 저장소에 저장할 수 없습니다.');
    const next = clone(mem.settings), parts = pathParts;
    let node = next;
    for (const k of parts.slice(0, -1)) {
        if (!node[k] || typeof node[k] !== 'object')
            throw new Error('설정 경로가 올바르지 않습니다.');
        node = node[k];
    }
    node[parts.at(-1)] = value;
    mem.settings = validateSettings(next);
    persist();
    return mem.settings;
}
export function replaceSettings(next) { ensureWritable(); mem.settings = validateSettings(next); persist(); return mem.settings; }
export function savePlan(plan) { ensureWritable(); const value = validateWeeklyPlan(plan, plan.weekStart); mem.plans[value.weekStart] = value; persist(); return value; }
export function deletePlan(key) { ensureWritable(); delete mem.plans[key]; persist(); }
export function saveSession(session) {
    ensureWritable();
    const s = validateSession(session), i = mem.sessions.findIndex(x => x.id === s.id);
    if (i < 0)
        mem.sessions.push(s);
    else
        mem.sessions[i] = s;
    mem.sessions.sort((a, b) => a.startedAt - b.startedAt);
    persist();
    return s;
}
export function deleteSession(id) { ensureWritable(); mem.sessions = mem.sessions.filter(s => s.id !== id); persist(); }
export function saveDraft(value) {
    ensureWritable();
    const copy = validateDraft(value);
    mem.draft = copy;
    return persist();
}
export function clearDraft() { ensureWritable(); mem.draft = null; return persist(); }
export async function finalizeSession(session) {
    ensureWritable();
    const next = clone(mem), s = validateSession(session), i = next.sessions.findIndex(x => x.id === s.id);
    if (i < 0)
        next.sessions.push(s);
    else
        next.sessions[i] = s;
    next.sessions.sort((a, b) => a.startedAt - b.startedAt);
    next.draft = null;
    return replaceMem(next); // One snapshot commits history + removes the draft together.
}
export function addCustomExercise(ex) {
    ensureWritable();
    const next = validateData({ ...mem, customExercises: [...mem.customExercises, ex] });
    mem = next;
    persist();
    return ex;
}
export function removeCustomExercise(id) { ensureWritable(); mem.customExercises = mem.customExercises.filter(x => x.id !== id); mem.settings.avoidExerciseIds = mem.settings.avoidExerciseIds.filter(x => x !== id); persist(); }
export function toggleAvoid(id) {
    const list = [...avoidExerciseIds()];
    const i = list.indexOf(id);
    if (i >= 0)
        list.splice(i, 1);
    else
        list.push(id);
    setSetting('avoidExerciseIds', list);
    return list.includes(id);
}
export function bumpRotation(groupId = 'global', by = 1) { ensureWritable(); mem.meta.rotation[groupId] = (mem.meta.rotation[groupId] || 0) + by; persist(); }
export function exportAll() {
    const data = clone(mem);
    delete data.meta.legacyConflict;
    return { app: 'workout-log', version: 2, exportedAt: new Date().toISOString(), data };
}
function importCandidate(data, mode) {
    const next = parseBackup(data).data;
    if (mode === 'replace')
        return next;
    if (mode !== 'merge')
        throw new Error('불러오기 방식은 합치기 또는 덮어쓰기입니다.');
    if (next.meta.unitReviewRequired || mem.meta.unitReviewRequired)
        throw new Error('단위가 확인되지 않은 기록은 합칠 수 없습니다. 기존 kg/lb 단위를 먼저 확인하고, 가져올 백업도 단위를 확인한 뒤 다시 내보내 주세요.');
    const merged = clone(mem);
    // Keep existing records on conflict. Import never silently replaces a newer local record.
    const mergeById = (current, incoming) => { const ids = new Set(current.map(x => x.id)); return [...current, ...incoming.filter(x => !ids.has(x.id))]; };
    merged.sessions = mergeById(merged.sessions, next.sessions);
    merged.customExercises = mergeById(merged.customExercises, next.customExercises);
    merged.plans = { ...next.plans, ...merged.plans };
    merged.meta.unitReviewRequired ||= !!next.meta.unitReviewRequired;
    return validateData(merged);
}
export async function importAll(data, { mode, merge: oldMerge } = {}) {
    if (mode === 'cancel')
        return { cancelled: true };
    const resolved = mode || (oldMerge === true ? 'merge' : oldMerge === false ? 'replace' : null);
    if (!resolved)
        throw new Error('불러오기 방식을 명시해 주세요.');
    ensureWritable();
    const next = importCandidate(data, resolved);
    try {
        localSet('wl:before-import.v2', exportAll());
    }
    catch {
        throw new Error('복원 전 안전 사본을 만들지 못했습니다. 현재 백업을 먼저 내려받아 주세요.');
    }
    await replaceMem(next);
    return { cancelled: false };
}
export async function wipeAll() {
    ensureWritable();
    try {
        localSet('wl:before-wipe.v2', exportAll());
    }
    catch {
        throw new Error('초기화 전 안전 사본을 만들지 못했습니다. 먼저 백업해 주세요.');
    }
    await replaceMem(emptyData());
}
export async function resolveLegacyConflict(which) {
    if (!ownsWriterLock)
        throw new Error('다른 창을 먼저 닫고 이 창을 새로고침해 주세요.');
    const c = mem.meta.legacyConflict;
    if (!c || !['local', 'database'].includes(which))
        throw new Error('복구 원본이 없습니다.');
    const next = validateData({ ...emptyData(), ...c[which] }, { legacy: true });
    localSet('wl:legacy-copies.v1', c);
    await replaceMem(next, { allowReadOnly: true });
}
export async function resolveLegacyUnits(unit) {
    ensureWritable();
    if (!['kg', 'lb'].includes(unit))
        throw new Error('기존 숫자의 단위를 골라 주세요.');
    const next = clone(mem);
    if (unit === 'lb') {
        const convert = s => {
            if (s.weight != null)
                s.weight /= LB_PER_KG;
        };
        next.sessions.forEach(s => s.entries.forEach(e => e.sets.forEach(convert)));
        Object.values(next.plans).forEach(p => p.days.forEach(d => d.blocks.forEach(b => b.sets.forEach(convert))));
        next.draft?.session.entries.forEach(e => e.sets.forEach(convert));
        next.draft?.planSnapshot?.blocks?.forEach(b => b.sets.forEach(convert));
        for (const k of Object.keys(next.settings.plan.benchmarks))
            if (next.settings.plan.benchmarks[k] != null)
                next.settings.plan.benchmarks[k] /= LB_PER_KG;
    }
    next.meta.unitReviewRequired = false;
    next.meta.unitResolvedAt = Date.now();
    localSet('wl:before-unit-resolution.v2', exportAll());
    await replaceMem(next);
}
/** Emergency raw export: may contain credentials; keep private, do not share as a bug report. */
export async function exportRecoveryCopies() {
    const local = {}, database = {};
    for (const key of [SNAPSHOT_KEY, ...LEGACY_KEYS.map(k => 'wl:' + k), 'wl:before-import.v2', 'wl:before-wipe.v2', 'wl:before-unit-resolution.v2']) {
        const raw = localRaw(key);
        if (raw != null)
            local[key] = raw;
    }
    for (const key of [DB_SNAPSHOT, ...LEGACY_KEYS]) {
        const value = await idbGet(key);
        if (value !== undefined)
            database[key] = value;
    }
    return { app: 'workout-recovery-raw', exportedAt: new Date().toISOString(), warning: '개인 보관용. 운동 기록과 설정 등 민감한 개인 정보가 포함됩니다.', local, database, memory: exportAll() };
}
/** Explicit recovery from corrupt storage. Caller must show replacement confirmation. */
export async function restoreProtectedBackup(raw) {
    if (!ownsWriterLock || !status.readOnly || status.state !== 'error')
        throw new Error('손상 복구는 이 창이 저장소를 단독 사용 중일 때만 가능합니다.');
    const next = parseBackup(raw).data;
    const originals = await exportRecoveryCopies();
    try {
        localSet('wl:corrupt-before-restore.v2', originals);
    }
    catch {
        throw new Error('손상 원본 안전 사본을 만들 수 없습니다. 기기의 공간을 확보한 뒤 다시 시도해 주세요.');
    }
    await replaceMem(next, { allowReadOnly: true });
}
