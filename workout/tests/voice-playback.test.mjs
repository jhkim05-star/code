import test from 'node:test';
import assert from 'node:assert/strict';

/** Minimal AudioContext double that models the iOS Safari states this bug depends on. */
function fakeAudioContext({ resumeReaches = 'running' } = {}) {
    const events = { resumeCalls: 0, started: 0 };
    const ctx = {
        state: 'suspended',
        currentTime: 0,
        destination: {},
        async resume() {
            events.resumeCalls++;
            ctx.state = resumeReaches;
        },
        async decodeAudioData(bytes) {
            // Mobile browsers can re-suspend the context while a clip decodes
            // (app backgrounded and returned, a call arriving, etc).
            ctx.state = 'interrupted';
            return { byteLength: bytes.byteLength };
        },
        createBufferSource() {
            const node = { buffer: null, onended: null, connect: target => target, start: () => { events.started++; queueMicrotask(() => node.onended && node.onended()); } };
            return node;
        },
        createGain() {
            return { gain: { value: 0 }, connect: target => target };
        },
    };
    return { ctx, events };
}

async function loadVoice(tag, { ctx, manifest, clipBytes } = {}) {
    globalThis.document = { baseURI: 'https://example.test/workout/' };
    globalThis.AudioContext = function AudioContext() { return ctx; };
    globalThis.speechSynthesis = null;
    globalThis.fetch = async url => {
        const path = String(url);
        if (path.endsWith('/audio/manifest.json'))
            return { ok: true, json: async () => manifest };
        return { ok: true, arrayBuffer: async () => clipBytes };
    };
    const voice = await import(`../js/voice.js?${tag}`);
    await voice.loadClipManifest();
    return voice;
}

test('counter audio resumes a suspended/interrupted context and plays the recorded clip', async () => {
    const { ctx, events } = fakeAudioContext();
    const voice = await loadVoice('resume-and-play', {
        ctx,
        manifest: { clips: { 'count.1': './audio/count-1.mp3' }, voice: 'test' },
        clipBytes: new Uint8Array([1, 2, 3]).buffer,
    });

    await voice.speakCount(1);

    // Resumed once before the fetch/decode and once more right before playback,
    // because decodeAudioData() simulated the context dropping to 'interrupted' again.
    assert.equal(events.resumeCalls, 2);
    assert.equal(ctx.state, 'running');
    assert.equal(events.started, 1);
});

test('a context that never actually reaches running does not report success', async () => {
    const { ctx, events } = fakeAudioContext({ resumeReaches: 'suspended' });
    const voice = await loadVoice('resume-fails', {
        ctx,
        manifest: { clips: { 'count.1': './audio/count-1.mp3' }, voice: 'test' },
        clipBytes: new Uint8Array([1, 2, 3]).buffer,
    });

    // speak() swallows the internal "audio locked" error and falls back to TTS
    // (a no-op here, since speechSynthesis is unavailable), so it must not throw
    // — but the recorded clip must never have actually started playing.
    await assert.doesNotReject(voice.speakCount(1));
    assert.equal(events.started, 0);
});

test('unlockAudio resumes an interrupted context, not just a suspended one', async () => {
    const { ctx } = fakeAudioContext();
    ctx.state = 'interrupted';
    const voice = await loadVoice('unlock-interrupted', {
        ctx,
        manifest: { clips: {}, voice: '' },
        clipBytes: new Uint8Array().buffer,
    });

    voice.unlockAudio();
    // resume() is fired without being awaited by unlockAudio(), so give its
    // microtask a turn to land before checking.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ctx.state, 'running');
});
