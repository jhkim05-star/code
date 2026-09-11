/** Shared OpenAI / Claude contract. Proxy credentials are not vendor API keys. */
import { settings, sessions, customExercises, avoidExerciseIds, metadata } from './store.js';
import { GROUPS, byGroup, findExercise, isAssistanceExercise } from './exercises.js';
import { validateCatalog, validatePlan, weekDates } from './ai-contract.js';
import { resolveWeeklyTargets } from './planner.js';
const TOKEN_KEY = 'wl:aiProxyToken';
let memoryToken = '';
export function proxyToken() {
    try {
        return sessionStorage.getItem(TOKEN_KEY) || memoryToken;
    }
    catch {
        return memoryToken;
    }
}
export function setProxyToken(value) {
    memoryToken = String(value || '').trim();
    try {
        if (memoryToken)
            sessionStorage.setItem(TOKEN_KEY, memoryToken);
        else
            sessionStorage.removeItem(TOKEN_KEY);
    }
    catch { }
}
globalThis.addEventListener?.('workout:reset-start', () => setProxyToken(''));
export function allowedCatalog() { const s = settings(); return validateCatalog(GROUPS.flatMap(g => byGroup(g.id, customExercises(), s.plan, avoidExerciseIds())).map(ex => ({ id: ex.id, name: ex.name, group: ex.group, equip: ex.equip, loadBasis: ex.loadBasis }))); }
export function serializeHistory(rawSessions, custom = []) {
    return [...rawSessions].sort((a, b) => a.startedAt - b.startedAt).slice(-12).map(session => ({
        date: session.date, status: session.status, stopReason: session.stopReason || '',
        entries: session.entries.map(entry => {
            const exercise = findExercise(entry.exerciseId, custom) || entry;
            return { exerciseId: entry.exerciseId, name: entry.name,
                loadBasis: isAssistanceExercise(entry) || isAssistanceExercise(exercise) ? 'assistance' : entry.loadBasis || exercise.loadBasis || '',
                sets: entry.sets.filter(set => set.done && !set.warmup && set.confirmed).map(set => ({ weight: set.weight, reps: set.reps, targetReps: set.targetReps, rir: set.rir, confirmed: true })) };
        }).filter(entry => entry.sets.length),
    }));
}
export function requestContext(weekStart, request) {
    weekDates(weekStart);
    if (metadata().unitReviewRequired)
        throw new Error('기존 기록의 단위를 먼저 확인해 주세요.');
    const s = settings(), history = serializeHistory(sessions(), customExercises());
    const resolved = resolveWeeklyTargets(s.plan, s);
    return { provider: s.aiProvider, weekStart, request: String(request || '').trim().slice(0, 3000), catalog: allowedCatalog(),
        profile: { ...structuredClone(s.plan), weeklyTargets: resolved.targets, weeklyTargetRecommendation: resolved.recommendation, unit: 'kg', timing: { countdownSec: s.countdownSec, exerciseRest: s.exerciseRest, exerciseSetup: s.exerciseSetup, warmupRest: s.warmupRest, warmupToWorkRest: s.warmupToWorkRest } }, history };
}
export function contextFingerprint() { const s = settings(); return JSON.stringify({ plan: s.plan, avoid: s.avoidExerciseIds, history: sessions(), provider: s.aiProvider }); }
export class AiError extends Error {
    constructor(message, kind = 'unknown') { super(message); this.kind = kind; }
}
async function withTimeout(signal, task, ms = 95000) {
    const abort = new AbortController(), cancel = () => abort.abort(signal?.reason);
    if (signal?.aborted)
        cancel();
    else
        signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => abort.abort(), ms);
    try {
        return await task(abort.signal);
    }
    catch (e) {
        if (abort.signal.aborted) {
            if (signal?.aborted)
                throw new DOMException('요청 취소', 'AbortError');
            throw new AiError('응답 시간이 초과됐어요. 자동 재요청하지 않았습니다.', 'timeout');
        }
        throw e;
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
    }
}
async function jsonResponse(res) {
    let data;
    try {
        data = await res.json();
    }
    catch {
        throw new AiError('JSON 응답이 아닙니다. 프록시 주소와 배포 상태를 확인해 주세요.', 'format');
    }
    if (!res.ok)
        throw new AiError(typeof data.error === 'string' ? data.error : data.error?.message || `연결 오류 (${res.status})`, 'http');
    return data;
}
export function proxyEndpoint(path) {
    let url;
    try {
        url = new URL(settings().aiProxyUrl || settings().openaiProxyUrl);
    }
    catch {
        throw new AiError('설정에서 AI 프록시 주소를 입력해 주세요.', 'configuration');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        throw new Error('사용자정보·쿼리·해시가 없는 HTTPS 프록시 주소를 입력해 주세요.');
    return url.href.replace(/\/$/, '') + path;
}
async function callProxy(path, body, signal) {
    const token = proxyToken();
    if (!token)
        throw new Error('AI 프록시 접속 토큰이 필요해요. 제공자의 API 키를 넣지 마세요.');
    const endpoint = proxyEndpoint(path);
    return withTimeout(signal, async (signal) => jsonResponse(await fetch(endpoint, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Workout-Token': token }, body: body ? JSON.stringify(body) : undefined, signal, cache: 'no-store', credentials: 'omit' })));
}
export async function generatePlanWithAi(weekStart, request, historyIgnored = [], { signal } = {}) {
    const context = requestContext(weekStart, request);
    const result = await callProxy('/plan', context, signal);
    if (signal?.aborted)
        throw new DOMException('요청 취소', 'AbortError');
    return { ...result, plan: validatePlan(result.plan, allowedCatalog(), weekStart), context };
}
export function testAiConnection(signal) {
    const s = settings();
    return callProxy('/health?provider=' + encodeURIComponent(s.aiProvider), null, signal);
}
// Do not estimate using guessed model prices or a stale exchange rate.
export function estimateCostKrw() { return null; }
export const MODELS = [];
