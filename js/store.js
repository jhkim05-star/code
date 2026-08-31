/**
 * 저장소 — 모든 데이터는 이 기기 안에만 있습니다 (IndexedDB, localStorage 폴백).
 *
 * 부팅할 때 전부 메모리로 읽어와서 읽기는 동기, 쓰기는 디바운스해서 비동기로 내려씁니다.
 * 데이터 양이 작기 때문에(1년치 기록 ≈ 수백 KB) 이 방식이 가장 단순하고 안전합니다.
 */

const DB_NAME = 'workout-log';
const DB_VER = 1;
const STORE = 'kv';
const LS_PREFIX = 'wl:';

const KEYS = ['settings', 'plans', 'sessions', 'customExercises', 'meta'];

export const DEFAULT_SETTINGS = {
  // 카운트
  tempo: 3.0,             // 1회에 걸리는 초
  tempoMin: 1.0,
  tempoMax: 8.0,
  countdownSec: 3,        // 세트 시작 전 "셋 둘 하나"
  announceLastReps: 2,    // 마지막 n회 남았을 때 알림
  // 휴식
  restDefault: 90,        // 초
  restWarnSec: 10,        // 휴식 종료 n초 전 알림
  autoStartRest: true,    // 세트 끝나면 휴식 자동 시작
  autoAdvance: true,      // 휴식 끝나면 다음 세트로 자동 이동
  // 음성
  voiceEnabled: true,
  voiceURI: '',           // 비우면 자동으로 한국어 여성 음성 선택
  voiceRate: 1.0,
  voicePitch: 1.25,       // 밝은 톤
  voiceVolume: 1.0,
  countStyle: 'native',   // native = 하나·둘·셋, sino = 일·이·삼
  beepEnabled: true,
  // 기타
  keepAwake: true,
  unit: 'kg',
  // AI
  apiKey: '',
  aiModel: 'claude-opus-5',
  // 운동 계획 설정 (운동계획 탭에서 편집)
  plan: {
    equipment: [],               // 가진 기구. 빈 배열 = 전부 허용
    variantsPerGroup: 2,         // 같은 부위 조합이 겹치는 날엔 종목을 서로 다르게
    // 요일별로 그날 할 부위 목록. 0=일 … 6=토. 빈 배열/없음 = 휴식
    week: {
      1: ['chest', 'delt_f', 'triceps'],   // 월 — 가슴 · 어깨 전면 · 삼두
      2: ['back', 'delt_sr', 'biceps'],    // 화 — 등 · 어깨 측후면 · 이두
      3: [],                               // 수 — 휴식
      4: ['chest', 'delt_f', 'triceps'],   // 목
      5: ['back', 'delt_sr', 'biceps'],    // 금
      6: [],                               // 토 — 휴식
      0: ['thighs', 'glutes', 'calves'],   // 일 — 하체
    },
  },
  // 비추천(피하고 싶은) 종목 id 목록 — 계획 생성 때 후보에서 빠집니다
  avoidExerciseIds: [],
};

const mem = {
  settings: null,
  plans: {},           // { 'YYYY-MM-DD'(월요일): WeeklyPlan }
  sessions: [],        // Session[] — 최신이 뒤
  customExercises: [],
  meta: { rotation: {} },  // 부위별로 최근에 쓴 종목 인덱스
};

let db = null;
let ready = false;

function openDB() {
  return new Promise((resolve) => {
    if (!('indexedDB' in globalThis)) return resolve(null);
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VER); } catch { return resolve(null); }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // Safari 프라이빗 모드 등에서 영영 안 열리는 경우 대비
    setTimeout(() => resolve(req.readyState === 'done' ? req.result : null), 2500);
  });
}

function idbGet(key) {
  return new Promise((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

function idbSet(key, val) {
  return new Promise((resolve) => {
    if (!db) return resolve(false);
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

function lsSet(key, val) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch { /* 용량 초과 무시 */ }
}

/** 깊은 병합 — 새 버전에서 설정 항목이 늘어나도 기존 값은 유지 */
function merge(base, over) {
  if (over === undefined || over === null) return structuredClone(base);
  if (typeof base !== 'object' || Array.isArray(base) || base === null) return over;
  const out = structuredClone(base);
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
}

export async function initStore() {
  db = await openDB();
  for (const k of KEYS) {
    const v = (await idbGet(k)) ?? lsGet(k);
    if (v === undefined) continue;
    if (k === 'settings') mem.settings = v;
    else mem[k] = v;
  }
  mem.settings = merge(DEFAULT_SETTINGS, mem.settings);
  if (!Array.isArray(mem.sessions)) mem.sessions = [];
  if (!Array.isArray(mem.customExercises)) mem.customExercises = [];
  if (!mem.plans || typeof mem.plans !== 'object') mem.plans = {};
  if (!mem.meta) mem.meta = { rotation: {} };
  ready = true;
  return mem;
}

const pending = new Set();
let flushTimer = null;

function scheduleFlush(key) {
  pending.add(key);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 250);
}

export async function flush() {
  clearTimeout(flushTimer);
  const keys = [...pending];
  pending.clear();
  for (const k of keys) {
    const val = k === 'settings' ? mem.settings : mem[k];
    lsSet(k, val);
    await idbSet(k, val);
  }
}
// 앱을 닫기 직전에 남은 쓰기를 마저 내려보냄
addEventListener('pagehide', () => { for (const k of pending) lsSet(k, k === 'settings' ? mem.settings : mem[k]); });
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

// ── 설정 ────────────────────────────────────────────────────
export const settings = () => mem.settings;

export function setSetting(path, value) {
  const parts = path.split('.');
  let node = mem.settings;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
  node[parts.at(-1)] = value;
  scheduleFlush('settings');
  return mem.settings;
}

export function replaceSettings(next) {
  mem.settings = merge(DEFAULT_SETTINGS, next);
  scheduleFlush('settings');
  return mem.settings;
}

// ── 주간 계획 ───────────────────────────────────────────────
export const plans = () => mem.plans;
export const getPlan = (weekStart) => mem.plans[weekStart] || null;

export function savePlan(plan) {
  mem.plans[plan.weekStart] = plan;
  scheduleFlush('plans');
  return plan;
}

export function deletePlan(weekStart) {
  delete mem.plans[weekStart];
  scheduleFlush('plans');
}

// ── 운동 기록 ───────────────────────────────────────────────
export const sessions = () => mem.sessions;

export function saveSession(session) {
  const i = mem.sessions.findIndex(s => s.id === session.id);
  if (i >= 0) mem.sessions[i] = session;
  else mem.sessions.push(session);
  mem.sessions.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  scheduleFlush('sessions');
  return session;
}

export function deleteSession(id) {
  mem.sessions = mem.sessions.filter(s => s.id !== id);
  scheduleFlush('sessions');
}

export const getSession = (id) => mem.sessions.find(s => s.id === id) || null;

/** 해당 날짜(YYYY-MM-DD)에 완료된 세션 */
export const sessionsOn = (date) => mem.sessions.filter(s => s.date === date);

// ── 사용자 추가 종목 ────────────────────────────────────────
export const customExercises = () => mem.customExercises;

export function addCustomExercise(ex) {
  mem.customExercises.push(ex);
  scheduleFlush('customExercises');
  return ex;
}

export function removeCustomExercise(id) {
  mem.customExercises = mem.customExercises.filter(x => x.id !== id);
  scheduleFlush('customExercises');
}

// ── 비추천 종목 ──────────────────────────────────────────────
export const avoidExerciseIds = () => mem.settings.avoidExerciseIds;
export const isAvoided = (id) => mem.settings.avoidExerciseIds.includes(id);

export function toggleAvoid(id) {
  const list = mem.settings.avoidExerciseIds;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  scheduleFlush('settings');
  return list.includes(id);
}

// ── 종목 로테이션 상태 (부위마다 매주 다른 종목이 나오도록) ──
export const rotation = () => mem.meta.rotation;

export function bumpRotation(groupId, by = 1) {
  mem.meta.rotation[groupId] = (mem.meta.rotation[groupId] || 0) + by;
  scheduleFlush('meta');
}

// ── 백업 / 복원 ─────────────────────────────────────────────
export function exportAll() {
  return {
    app: 'workout-log',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: mem.settings,
    plans: mem.plans,
    sessions: mem.sessions,
    customExercises: mem.customExercises,
    meta: mem.meta,
  };
}

export async function importAll(data, { merge: doMerge = false } = {}) {
  if (!data || data.app !== 'workout-log') throw new Error('이 앱의 백업 파일이 아닙니다.');
  if (doMerge) {
    const byId = new Map(mem.sessions.map(s => [s.id, s]));
    for (const s of data.sessions || []) byId.set(s.id, s);
    mem.sessions = [...byId.values()].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    mem.plans = { ...mem.plans, ...(data.plans || {}) };
    const cx = new Map(mem.customExercises.map(x => [x.id, x]));
    for (const x of data.customExercises || []) cx.set(x.id, x);
    mem.customExercises = [...cx.values()];
  } else {
    mem.sessions = data.sessions || [];
    mem.plans = data.plans || {};
    mem.customExercises = data.customExercises || [];
    mem.settings = merge(DEFAULT_SETTINGS, data.settings);
    mem.meta = data.meta || { rotation: {} };
  }
  for (const k of KEYS) scheduleFlush(k);
  await flush();
}

export async function wipeAll() {
  mem.settings = structuredClone(DEFAULT_SETTINGS);
  mem.plans = {};
  mem.sessions = [];
  mem.customExercises = [];
  mem.meta = { rotation: {} };
  for (const k of KEYS) scheduleFlush(k);
  await flush();
}

export const isReady = () => ready;
