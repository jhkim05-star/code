/** One cancellable queue for recorded clips, TTS and completion announcements. */
import { settings } from './store.js';
const NATIVE_ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const SINO = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
export function nativeNumber(n) { return n <= 0 || n >= 100 ? String(n) : NATIVE_TENS[Math.floor(n / 10)] + NATIVE_ONES[n % 10]; }
export function sinoNumber(n) {
    if (n <= 0 || n >= 100)
        return String(n);
    const t = Math.floor(n / 10), o = n % 10;
    return (t === 0 ? '' : t === 1 ? '십' : SINO[t] + '십') + SINO[o];
}
export const countWord = n => settings().countStyle === 'sino' ? sinoNumber(n) : nativeNumber(n);
export const CUSTOM_VOICE_ID = '__custom__';
const synth = globalThis.speechSynthesis || null;
let clips = {}, voiceName = '', voices = [], chosenVoice = null, context = null, unlocked = false, generation = 0;
let queue = Promise.resolve();
const buffers = new Map(), sources = new Set(), stoppers = new Set();
export const hasClips = () => Object.keys(clips).length > 0;
export const customVoiceName = () => voiceName || '내가 등록한 목소리';
export const listVoices = () => voices;
export const koreanVoices = () => voices.filter(v => (v.lang || '').toLowerCase().startsWith('ko'));
export const currentVoice = () => chosenVoice;
export const isUnlocked = () => unlocked;
export function reselectVoice() { const want = settings().voiceURI; chosenVoice = voices.find(v => v.voiceURI === want) || koreanVoices().find(v => /yuna|유나|sora|소라|heami|female/i.test(v.name)) || koreanVoices()[0] || null; return chosenVoice; }
function refreshVoices() { voices = synth?.getVoices?.() || []; reselectVoice(); }
function audioContext() {
    if (!context) {
        const C = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (C)
            context = new C();
    }
    return context;
}
/** iOS Safari also uses 'interrupted' (calls, other apps) alongside the standard 'suspended'. */
async function resumeIfNeeded(c) {
    if (!c)
        return false;
    if (c.state === 'suspended' || c.state === 'interrupted') {
        try {
            await c.resume();
        }
        catch { /* checked by the caller via c.state below */ }
    }
    return c.state === 'running';
}
export function unlockAudio() {
    const c = audioContext();
    if (c?.state === 'suspended' || c?.state === 'interrupted')
        c.resume().then(() => { unlocked = c.state === 'running'; }).catch(() => { });
    else
        unlocked = !!c;
    if (synth) {
        try {
            const u = new SpeechSynthesisUtterance(' ');
            u.volume = 0;
            synth.speak(u);
        }
        catch { }
    }
    return unlocked;
}
export async function loadClipManifest() {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 1800);
    try {
        const r = await fetch('./audio/manifest.json', { cache: 'no-store', signal: abort.signal });
        if (!r.ok)
            throw new Error('manifest');
        const data = await r.json();
        clips = {};
        if (data?.clips && typeof data.clips === 'object')
            for (const [key, path] of Object.entries(data.clips).slice(0, 200)) {
                if (typeof path !== 'string')
                    continue;
                const u = new URL(path, document.baseURI), base = new URL('./audio/', document.baseURI);
                if (u.origin === base.origin && u.pathname.startsWith(base.pathname) && /\.(mp3|m4a|wav|ogg)$/i.test(u.pathname))
                    clips[key] = u.href;
            }
        voiceName = typeof data.voice === 'string' ? data.voice.slice(0, 100) : '';
    }
    catch {
        clips = {};
        voiceName = '';
    }
    finally {
        clearTimeout(timer);
    }
    return clips;
}
async function clipBuffer(key) {
    const url = clips[key], c = audioContext();
    if (!url || !c)
        return null;
    if (buffers.has(url))
        return buffers.get(url);
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 2500);
    try {
        const r = await fetch(url, { signal: abort.signal });
        if (!r.ok)
            throw new Error('clip unavailable');
        const bytes = await r.arrayBuffer();
        if (bytes.byteLength > 2 * 1024 * 1024)
            throw new Error('clip too large');
        const b = await c.decodeAudioData(bytes);
        buffers.set(url, b);
        return b;
    }
    finally {
        clearTimeout(timer);
    }
}
function useClips() { return hasClips() && (!settings().voiceURI || settings().voiceURI === CUSTOM_VOICE_ID); }
async function playRecorded(key, epoch) {
    const c = audioContext();
    // Resume before fetch/decode: a suspended or interrupted context can otherwise
    // sit idle through the whole download and never get a chance to recover.
    await resumeIfNeeded(c);
    const buffer = await clipBuffer(key);
    if (!buffer || epoch !== generation)
        return false;
    // Re-check right before playback: decoding takes time, and mobile browsers can
    // re-suspend the context (background return, other audio) while we waited.
    if (!(await resumeIfNeeded(c)))
        throw new Error('audio locked');
    await new Promise(resolve => {
        if (epoch !== generation)
            return resolve();
        const source = c.createBufferSource(), gain = c.createGain();
        source.buffer = buffer;
        gain.gain.value = settings().voiceVolume;
        source.connect(gain).connect(c.destination);
        sources.add(source);
        source.onended = () => { sources.delete(source); resolve(); };
        source.start();
    });
    return true;
}
function playTTS(text, epoch) {
    return new Promise(resolve => {
        if (epoch !== generation || !synth || !text)
            return resolve();
        const u = new SpeechSynthesisUtterance(text);
        refreshVoices();
        if (chosenVoice)
            u.voice = chosenVoice;
        u.lang = chosenVoice?.lang || 'ko-KR';
        const s = settings();
        u.rate = s.voiceRate;
        u.pitch = s.voicePitch;
        u.volume = s.voiceVolume;
        let done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            stoppers.delete(finish);
            resolve();
        };
        const timer = setTimeout(finish, 10000);
        stoppers.add(finish);
        u.onend = finish;
        u.onerror = finish;
        try {
            if (synth.paused)
                synth.resume();
            synth.speak(u);
        }
        catch {
            finish();
        }
    });
}
export function stopSpeaking() {
    generation++;
    try {
        synth?.cancel();
    }
    catch { }
    for (const source of sources) {
        try {
            source.stop();
        }
        catch { }
    }
    sources.clear();
    for (const stop of stoppers)
        stop();
    stoppers.clear();
    queue = Promise.resolve();
}
export function speak(text, opt = {}) {
    if (!settings().voiceEnabled)
        return Promise.resolve();
    if (opt.interrupt)
        stopSpeaking();
    const epoch = generation;
    const task = async () => {
        if (epoch !== generation || !settings().voiceEnabled)
            return;
        if (opt.key && useClips() && clips[opt.key]) {
            try {
                if (await playRecorded(opt.key, epoch))
                    return;
            }
            catch { /* Failed playback falls back only if the request is still current. */ }
        }
        if (epoch === generation)
            await playTTS(String(text), epoch);
    };
    const result = queue.then(task, task);
    queue = result.catch(() => { });
    return result;
}
export const speakCount = n => speak(countWord(n), { key: `count.${n}`, interrupt: true });
export function beep(freq = 880, ms = 100, gain = .1) {
    if (!settings().beepEnabled)
        return;
    try {
        const c = audioContext();
        if (!c || c.state !== 'running')
            return;
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(gain, c.currentTime);
        g.gain.exponentialRampToValueAtTime(.001, c.currentTime + ms / 1000);
        o.connect(g).connect(c.destination);
        o.start();
        o.stop(c.currentTime + ms / 1000);
    }
    catch { }
}
export const cue = {
    ready: () => speak('준비', { key: 'cue.ready' }), start: () => speak('시작', { key: 'cue.start', interrupt: true }),
    lastRep: () => speak('마지막', { key: 'cue.last' }), setDone: () => speak('세트 완료. 실제 횟수를 확인해 주세요.', { key: 'cue.set_done' }),
    restStart: () => speak('휴식', { key: 'cue.rest_start' }), restSoon: (seconds = 10) => speak(`${sinoNumber(seconds)} 초 남았습니다`, { key: seconds === 10 ? 'cue.rest_soon' : null }),
    restDone: () => speak('준비되면 시작해 주세요', { key: 'cue.rest_done' }), nextEx: name => speak(`다음 운동, ${name}. 기구를 준비해 주세요.`, { key: 'cue.next_exercise' }),
    allDone: () => speak('오늘 운동 완료. 수고하셨습니다', { key: 'cue.workout_done' }),
};
export async function initVoice() { refreshVoices(); synth?.addEventListener?.('voiceschanged', refreshVoices); return loadClipManifest(); }
export async function diagnose() {
    unlockAudio();
    let clipResult = '클립 없음';
    try {
        if (clips['count.1']) {
            await speakCount(1);
            clipResult = '재생 요청 처리됨 (실제 청취 확인 필요)';
        }
    }
    catch (e) {
        clipResult = e.message;
    }
    return { voiceEnabled: settings().voiceEnabled, volume: settings().voiceVolume, unlocked, hasSpeechSynthesis: !!synth, voiceCount: voices.length, hasClips: hasClips(), clipKeys: Object.keys(clips).length, customVoice: customVoiceName(), selectedVoiceURI: settings().voiceURI || '(자동)', audioContext: context?.state || '미생성', playClip: clipResult };
}
