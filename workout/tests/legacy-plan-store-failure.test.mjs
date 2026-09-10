import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyBlock, legacyData, legacyPlan, legacyStorageEntries, localStorageStub } from './legacy-fixtures.mjs';

const legacy = legacyData();
legacy.plans = {
    '2026-08-31': legacyPlan('2026-08-31'),
    '2026-09-07': legacyPlan('2026-09-07', legacyBlock({ sets: { count: 3 } })),
};
const initialEntries = legacyStorageEntries(legacy);
const original = new Map(initialEntries);
const { values, storage } = localStorageStub(initialEntries);
globalThis.localStorage = storage;
globalThis.addEventListener = () => {};
const store = await import('../js/store.js?legacy-failure');
await store.initStore();

test('failed legacy plan migration never creates a v2 snapshot', () => {
    assert.equal(values.has('wl:snapshot.v2'), false);
    assert.equal(store.storageStatus().state, 'error');
    assert.equal(store.storageStatus().readOnly, true);
    assert.match(store.storageStatus().message, /자동 초기화하지 않았습니다/);
    assert.match(store.storageStatus().message, /복구 원본 내보내기/);
});

test('failed migration leaves every v1 source collection unchanged', () => {
    for (const [key, raw] of original)
        assert.equal(values.get(key), raw, key);
});

test('failed plan does not hide valid records, settings, custom exercises, or weeks', () => {
    assert.equal(store.sessions()[0].comment, '보존할 기록');
    assert.equal(store.settings().tempo, 4);
    assert.equal(store.customExercises()[0].name, '사용자 로우');
    assert.deepEqual(Object.keys(store.plans()), ['2026-08-31']);
    assert.deepEqual(store.metadata().legacyPlanRecovery.invalidWeeks.map(error => error.weekStart), ['2026-09-07']);
});

test('raw recovery export includes the untouched invalid plan source', async () => {
    const recovery = await store.exportRecoveryCopies();
    assert.equal(recovery.local['wl:plans'], original.get('wl:plans'));
    assert.deepEqual(JSON.parse(recovery.local['wl:plans'])['2026-09-07'].days[0].blocks[0].sets, { count: 3 });
});
