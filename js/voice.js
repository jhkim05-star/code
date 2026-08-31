/**
 * 음성 엔진.
 *
 * 두 겹 구조입니다:
 *   1) audio/manifest.json 에 해당 키의 오디오 파일이 등록돼 있으면 그 파일을 재생하고,
 *   2) 없으면 기기 내장 음성(Web Speech API)으로 읽습니다.
 *
 * 그래서 나중에 밝은 여성 목소리로 녹음/생성한 파일을 audio/ 에 넣고
 * manifest.json 에만 등록하면, 코드를 고치지 않고 목소리를 통째로 바꿀 수 있습니다.
 * 키 이름 규칙은 audio/README.md 에 정리해 두었습니다.
 */

import { settings } from './store.js';

// ── 한국어 수사 ──────────────────────────────────────────────
const NATIVE_ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const SINO_ONES = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

/** 순우리말 수사: 1→하나, 21→스물하나, 99→아흔아홉 */
export function nativeNumber(n) {
  if (n <= 0) return String(n);
  if (n >= 100) return String(n);
  return (NATIVE_TENS[Math.floor(n / 10)] || '') + (NATIVE_ONES[n % 10] || '');
}

/** 한자어 수사: 1→일, 21→이십일 */
export function sinoNumber(n) {
  if (n <= 0) return String(n);
  if (n >= 100) return String(n);
  const t = Math.floor(n / 10), o = n % 10;
  if (t === 0) return SINO_ONES[o];
  return (t === 1 ? '십' : SINO_ONES[t] + '십') + (o ? SINO_ONES[o] : '');
}

/** 설정된 카운트 방식으로 읽은 숫자 */
export function countWord(n) {
  return settings().countStyle === 'sino' ? sinoNumber(n) : nativeNumber(n);
}

// ── 오디오 클립 ──────────────────────────────────────────────
let clipManifest = null;         // { "count.1": "audio/ko-f/count-1.mp3", ... }
let clipVoiceName = '';          // manifest.json 의 "voice" 이름표 (예: "내사랑")
const clipCache = new Map();

export const CUSTOM_VOICE_ID = '__custom__';

export async function loadClipManifest() {
  try {
    const res = await fetch('./audio/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('no manifest');
    const json = await res.json();
    clipManifest = json && typeof json.clips === 'object' ? json.clips : {};
    clipVoiceName = (json && json.voice) || '';
  } catch {
    clipManifest = {};   // 파일이 없으면 그냥 전부 TTS 로 갑니다
    clipVoiceName = '';
  }
  return clipManifest;
}

export const hasClips = () => !!clipManifest && Object.keys(clipManifest).length > 0;
export const customVoiceName = () => clipVoiceName || '내가 등록한 목소리';

function clipFor(key) {
  if (!clipManifest || !key) return null;
  const path = clipManifest[key];
  if (!path) return null;
  let a = clipCache.get(key);
  if (!a) {
    a = new Audio(path);
    a.preload = 'auto';
    clipCache.set(key, a);
  }
  return a;
}

/**
 * key 에 해당하는 클립이 없으면 null. 있으면 실제 재생을 시도하고 그 결과(Promise)를
 * 돌려줍니다 — 호출부가 재생 성공 여부를 보고 TTS 로 넘어갈지 판단해야 하기 때문에,
 * 클립이 "있다"는 사실과 "재생에 성공했다"는 사실을 절대 섞으면 안 됩니다.
 * (섞으면 재생이 막혔을 때 아무 소리도 안 나고 조용히 실패합니다.)
 */
function playClip(key) {
  const a = clipFor(key);
  if (!a) return null;
  try {
    a.currentTime = 0;
    a.volume = settings().voiceVolume;
    return a.play();
  } catch (e) { return Promise.reject(e); }
}

/** 지금 설정 기준으로 클립을 써야 하는지 (자동이거나 명시적으로 고른 경우) */
function shouldUseClips() {
  if (!hasClips()) return false;
  const want = settings().voiceURI;
  return want === '' || want === CUSTOM_VOICE_ID;
}

// ── Web Speech ───────────────────────────────────────────────
const synth = globalThis.speechSynthesis || null;
let voices = [];
let chosenVoice = null;
let unlocked = false;

const FEMALE_HINTS = /yuna|유나|sora|소라|heami|ji-?woo|서현|female|여성|woman/i;

export function listVoices() {
  return voices;
}

export function koreanVoices() {
  return voices.filter(v => (v.lang || '').toLowerCase().startsWith('ko'));
}

function refreshVoices() {
  if (!synth) return;
  voices = synth.getVoices() || [];
  chosenVoice = pickVoice();
}

function pickVoice() {
  const want = settings().voiceURI;
  if (want) {
    const exact = voices.find(v => v.voiceURI === want);
    if (exact) return exact;
  }
  const ko = koreanVoices();
  return ko.find(v => FEMALE_HINTS.test(v.name)) || ko[0] || voices[0] || null;
}

/** 설정에서 음성을 바꿨을 때 다시 고르게 함 */
export function reselectVoice() {
  chosenVoice = pickVoice();
  return chosenVoice;
}

export const currentVoice = () => chosenVoice;

// ── WebAudio (짧은 신호음) ─────────────────────────────────────
let ac = null;

function audioCtx() {
  if (!ac) {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return null;
    ac = new Ctx();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

export function beep(freq = 880, ms = 110, gain = 0.14) {
  if (!settings().beepEnabled) return;
  const ctx = audioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + ms / 1000 + 0.02);
}

/**
 * iOS/Safari 는 사용자가 화면을 한 번 눌러야 음성과 오디오를 허용합니다.
 * 반드시 탭 핸들러 안에서 호출해야 합니다.
 */
export function unlockAudio() {
  if (unlocked) return true;
  audioCtx();
  if (synth) {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    } catch { /* 무시 */ }
  }
  // 등록된 클립을 전부 한 번씩 건드려 둡니다. iOS 는 오디오 엘리먼트마다
  // 따로 "허용" 상태를 매기기 때문에, 나중에(타이머 안에서) 처음 재생을
  // 시도하는 클립은 이 사용자 동작 없이는 조용히 막힐 수 있습니다.
  // 주의: iOS Safari 는 <audio>.volume 을 무시하므로 volume=0 으로는 안 들리게
  // 할 수 없습니다 (실제로 30개 카운트 클립이 전부 들리게 재생되는 버그가 있었음).
  // muted 속성은 iOS 도 존중하므로 이걸로 소리를 죽여야 합니다.
  for (const key of Object.keys(clipManifest || {})) {
    const a = clipFor(key);
    if (a) { a.muted = true; a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; }); }
  }
  unlocked = true;
  return true;
}

export const isUnlocked = () => unlocked;

// ── 말하기 ───────────────────────────────────────────────────
/**
 * @param {string} text  읽을 문장
 * @param {object} opt   { key: 오디오 클립 키, interrupt: 진행 중인 말을 끊을지 }
 */
export function speak(text, opt = {}) {
  const s = settings();
  if (!s.voiceEnabled) return;

  if (opt.key && shouldUseClips()) {
    const p = playClip(opt.key);
    if (p) {
      // 재생이 실제로 실패했을 때만(막힘·디코드 오류 등) 기기 음성으로 넘어갑니다.
      p.catch(() => speakWithTTS(text, opt, s));
      return;
    }
    // 이 키에 해당하는 클립이 없으면 바로 기기 음성으로
  }
  speakWithTTS(text, opt, s);
}

function speakWithTTS(text, opt, s) {
  if (!synth || !text) return;
  try {
    if (opt.interrupt) synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    if (!chosenVoice) refreshVoices();
    if (chosenVoice) { u.voice = chosenVoice; u.lang = chosenVoice.lang; }
    else u.lang = 'ko-KR';
    u.rate = s.voiceRate;
    u.pitch = s.voicePitch;
    u.volume = s.voiceVolume;
    synth.speak(u);
  } catch { /* 음성 미지원 기기 — 조용히 넘어감 */ }
}

/** 횟수 세기 — 클립 우선, 없으면 TTS */
export function speakCount(n) {
  speak(countWord(n), { key: `count.${n}`, interrupt: true });
}

export function stopSpeaking() {
  try { synth?.cancel(); } catch { /* 무시 */ }
}

// 자주 쓰는 안내 문구 (클립 키를 함께 넘겨 나중에 교체 가능하게)
export const cue = {
  ready:      () => speak('준비',            { key: 'cue.ready' }),
  start:      () => speak('시작',            { key: 'cue.start', interrupt: true }),
  lastRep:    () => speak('마지막',          { key: 'cue.last' }),
  setDone:    () => speak('세트 완료',       { key: 'cue.set_done', interrupt: true }),
  restStart:  () => speak('휴식',            { key: 'cue.rest_start', interrupt: true }),
  restSoon:   () => speak('십 초 남았습니다', { key: 'cue.rest_soon' }),
  restDone:   () => speak('휴식 끝',         { key: 'cue.rest_done', interrupt: true }),
  nextEx:     (name) => speak(`다음 운동, ${name}`, { key: 'cue.next_exercise' }),
  allDone:    () => speak('오늘 운동 완료. 수고하셨습니다', { key: 'cue.workout_done' }),
};

export async function initVoice() {
  await loadClipManifest();
  if (synth) {
    refreshVoices();
    synth.addEventListener?.('voiceschanged', refreshVoices);
    // iOS 는 첫 getVoices() 가 비어 있는 경우가 잦아 한 번 더 확인
    setTimeout(refreshVoices, 400);
    setTimeout(refreshVoices, 1500);
  }
}

// ── 진단 ─────────────────────────────────────────────────────
/**
 * 소리가 안 날 때 무엇이 막혔는지 화면에서 바로 확인하기 위한 도구.
 * 반드시 탭 핸들러 안에서 호출해야 실제 기기 상태를 반영합니다.
 */
export async function diagnose() {
  const report = {
    unlocked,
    voiceEnabled: settings().voiceEnabled,
    volume: settings().voiceVolume,
    hasSpeechSynthesis: !!synth,
    voiceCount: voices.length,
    hasClips: hasClips(),
    clipKeys: clipManifest ? Object.keys(clipManifest).length : 0,
    customVoice: customVoiceName(),
    selectedVoiceURI: settings().voiceURI || '(자동)',
  };

  // WebAudio 컨텍스트 상태
  try {
    const ctx = audioCtx();
    report.audioContext = ctx ? ctx.state : '지원 안 함';
  } catch (e) {
    report.audioContext = `오류: ${e.message}`;
  }

  // 클립 파일이 실제로 받아와지는지 (네트워크·경로 문제 확인)
  try {
    const url = clipManifest?.['count.1'];
    if (url) {
      const res = await fetch(url, { cache: 'no-cache' });
      report.fetchClip = `${res.status} ${res.ok ? 'OK' : ''} (${res.headers.get('content-type') || '?'})`;
    } else {
      report.fetchClip = '등록된 count.1 클립 없음';
    }
  } catch (e) {
    report.fetchClip = `실패: ${e.message}`;
  }

  // 실제로 재생을 시도해서 진짜 소리가 나는지 확인
  try {
    const a = clipFor('count.1');
    if (!a) {
      report.playClip = '클립 객체 생성 실패';
    } else {
      a.currentTime = 0;
      a.volume = 1;
      await a.play();
      report.playClip = `성공 (readyState=${a.readyState}, duration=${a.duration?.toFixed(2)}s, paused=${a.paused})`;
      setTimeout(() => a.pause(), 400);
    }
  } catch (e) {
    report.playClip = `실패: ${e.name} — ${e.message}`;
  }

  // 기기 음성(TTS) 자체가 살아있는지
  report.ttsResult = await new Promise((resolve) => {
    if (!synth) return resolve('speechSynthesis 없음');
    try {
      const u = new SpeechSynthesisUtterance('테스트');
      u.volume = 1;
      const timer = setTimeout(() => resolve('응답 없음(시간초과)'), 2000);
      u.onstart = () => { clearTimeout(timer); resolve('시작됨(정상)'); };
      u.onerror = (e) => { clearTimeout(timer); resolve(`오류: ${e.error}`); };
      synth.speak(u);
    } catch (e) {
      resolve(`예외: ${e.message}`);
    }
  });

  return report;
}
