import { emptyData } from '../js/config.js';

export function legacyBlock(overrides = {}) {
    return {
        exerciseId: 'bench_press',
        name: '벤치프레스',
        group: 'chest',
        sets: 3,
        reps: 10,
        weight: 40,
        rest: 90,
        tempo: 3,
        ...overrides,
    };
}

export function legacyPlan(weekStart, block = legacyBlock(), source = 'rule') {
    return {
        weekStart,
        source,
        note: '',
        days: [{
            date: weekStart,
            title: '가슴',
            blocks: [block],
        }],
    };
}

export function legacySession() {
    return {
        id: 'legacy-session',
        date: '2026-08-31',
        title: '기존 운동',
        comment: '보존할 기록',
        startedAt: 1788145200000,
        endedAt: 1788148800000,
        entries: [{
            id: 'legacy-entry',
            exerciseId: 'bench_press',
            name: '벤치프레스',
            group: 'chest',
            sets: [{ id: 'legacy-set', reps: 8, weight: 50, done: true }],
        }],
    };
}

export function legacyData() {
    const data = emptyData();
    data.settings.tempo = 4;
    data.sessions = [legacySession()];
    data.customExercises = [{
        id: 'custom-row',
        name: '사용자 로우',
        group: 'back',
        equip: '케이블',
        sets: 3,
        reps: 12,
        rest: 75,
        tier: 2,
        tempo: 3,
    }];
    return data;
}

export function localStorageStub(initial = []) {
    const values = new Map(initial);
    return {
        values,
        storage: {
            get length() { return values.size; },
            key: index => [...values.keys()][index] ?? null,
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: key => values.delete(key),
        },
    };
}

export function legacyStorageEntries(data) {
    return ['settings', 'plans', 'sessions', 'customExercises', 'meta']
        .map(key => [`wl:${key}`, JSON.stringify(data[key])]);
}

export function indexedDbStub(initial = [], { readMode = 'success', writeMode = 'success' } = {}) {
    const values = new Map(initial);
    const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        close: () => {},
        transaction: (_name, mode) => {
            let pending = 0;
            let aborted = false, failed = false;
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
                        pending++;
                        queueMicrotask(() => {
                            if (aborted)
                                return;
                            if (mode === 'readonly' && readMode === 'failure') {
                                failed = true;
                                request.onerror?.();
                                tx.onerror?.();
                                return;
                            }
                            request.result = values.get(key);
                            request.onsuccess?.();
                            if (--pending === 0)
                                queueMicrotask(() => !aborted && !failed && tx.oncomplete?.());
                        });
                        return request;
                    },
                    put(value, key) {
                        if (mode !== 'readwrite')
                            throw new Error('readonly transaction');
                        pending++;
                        queueMicrotask(() => {
                            if (aborted)
                                return;
                            if (writeMode === 'failure') {
                                failed = true;
                                tx.onerror?.();
                                return;
                            }
                            values.set(key, structuredClone(value));
                            if (--pending === 0)
                                queueMicrotask(() => !aborted && !failed && tx.oncomplete?.());
                        });
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
    };
}

export function resetIndexedDbStub(initial = [], { deleteMode = 'success' } = {}) {
    let values = new Map(initial);
    const deleteCalls = [];
    const makeDb = () => ({
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        close: () => {},
        transaction: (_name, mode) => {
            let pending = 0;
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
                        pending++;
                        queueMicrotask(() => {
                            if (aborted)
                                return;
                            request.result = values.get(key);
                            request.onsuccess?.();
                            if (--pending === 0)
                                queueMicrotask(() => !aborted && tx.oncomplete?.());
                        });
                        return request;
                    },
                    put(value, key) {
                        if (mode !== 'readwrite')
                            throw new Error('readonly transaction');
                        pending++;
                        queueMicrotask(() => {
                            if (aborted)
                                return;
                            values.set(key, structuredClone(value));
                            if (--pending === 0)
                                queueMicrotask(() => !aborted && tx.oncomplete?.());
                        });
                    },
                }),
            };
            return tx;
        },
    });
    const factory = {
        deleteDatabase(name) {
            deleteCalls.push(name);
            const request = {};
            queueMicrotask(() => {
                if (deleteMode === 'failure') {
                    request.onerror?.();
                    return;
                }
                if (deleteMode === 'blocked-error') {
                    request.onblocked?.();
                    queueMicrotask(() => request.onerror?.());
                    return;
                }
                values = new Map();
                request.onsuccess?.();
            });
            return request;
        },
        open() {
            const request = {};
            queueMicrotask(() => {
                request.result = makeDb();
                request.onsuccess?.();
            });
            return request;
        },
    };
    return { factory, deleteCalls, values: () => values };
}
