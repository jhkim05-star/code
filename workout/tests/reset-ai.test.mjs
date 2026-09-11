import test from 'node:test';
import assert from 'node:assert/strict';
import { localStorageStub } from './legacy-fixtures.mjs';

test('reset start clears the workout proxy token from session and memory', async () => {
    const session = localStorageStub();
    const listeners = new Map();
    globalThis.sessionStorage = session.storage;
    globalThis.localStorage = localStorageStub().storage;
    globalThis.addEventListener = (type, listener) => listeners.set(type, listener);

    const ai = await import(`../js/ai.js?reset-ai=${Date.now()}`);
    ai.setProxyToken('temporary-workout-token');
    assert.equal(ai.proxyToken(), 'temporary-workout-token');

    listeners.get('workout:reset-start')();
    assert.equal(ai.proxyToken(), '');
    assert.equal(session.values.has('wl:aiProxyToken'), false);
});
