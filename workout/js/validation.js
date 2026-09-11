/** All imports are validated in a temporary copy before live state is replaced. */
import { DEFAULT_SETTINGS, GROUP_IDS, LEGACY_WEEKLY_TARGETS } from './config.js';
import { parseYmd, finite, uid, clone } from './util.js';
import { EQUIPMENT, MACHINE_CATALOG, LOAD_BASES, isAssistanceExercise } from './exercises.js';
const dangerous = new Set(['__proto__', 'constructor', 'prototype']);
const providerCredential = /^(apiKey|proxyToken|openaiKey|anthropicKey|apiToken|openaiApiKey|anthropicApiKey|openaiProxyToken|clientToken)$/i;
function dropProviderCredentials(value) {
    if (!value || typeof value !== 'object')
        return;
    for (const key of Object.keys(value)) {
        if (providerCredential.test(key))
            delete value[key];
        else
            dropProviderCredentials(value[key]);
    }
}
export function assertSafeTree(value, depth = 0, budget = { count: 0 }) {
    if (depth > 24 || ++budget.count > 500000)
        throw new Error('데이터 구조가 너무 크거나 깊습니다.');
    if (value && typeof value === 'object') {
        for (const [key, v] of Object.entries(value)) {
            if (dangerous.has(key))
                throw new Error('허용되지 않은 데이터 키입니다.');
            assertSafeTree(v, depth + 1, budget);
        }
    }
}
export function mergeDefaults(base, over) {
    if (over == null)
        return clone(base);
    if (base == null || typeof base !== 'object' || Array.isArray(base))
        return clone(over);
    if (typeof over !== 'object' || Array.isArray(over))
        throw new Error('설정 구조가 올바르지 않습니다.');
    const out = clone(base);
    for (const [k, v] of Object.entries(over)) {
        if (dangerous.has(k))
            throw new Error('허용되지 않은 설정 키입니다.');
        out[k] = Object.hasOwn(base, k) ? mergeDefaults(base[k], v) : clone(v);
    }
    return out;
}
function object(v, label) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw new Error(`${label} 형식이 올바르지 않습니다.`);
    return v;
}
function array(v, label, max) {
    if (!Array.isArray(v) || v.length > max)
        throw new Error(`${label} 배열이 올바르지 않습니다.`);
    return v;
}
function text(v, label, max = 300, optional = false) {
    if (optional && v == null)
        return '';
    if (typeof v !== 'string' || v.length > max)
        throw new Error(`${label}이 올바르지 않습니다.`);
    return v;
}
const id = (v, prefix) => v == null ? uid(prefix) : text(v, 'ID', 160);
function unique(list, label) {
    const ids = new Set();
    for (const x of list) {
        if (!x.id || ids.has(x.id))
            throw new Error(`${label} ID가 비어 있거나 중복됩니다.`);
        ids.add(x.id);
    }
}
export function validateSettings(raw, { legacy = false } = {}) {
    assertSafeTree(raw);
    const s = mergeDefaults(DEFAULT_SETTINGS, raw);
    // 2.1 stored only numeric targets. Values that differ from the former
    // defaults were user choices and become manual overrides; untouched
    // defaults move to the new time-aware automatic mode.
    if (!raw?.plan?.weeklyTargetModes) {
        for (const g of GROUP_IDS)
            s.plan.weeklyTargetModes[g] = raw?.plan?.weeklyTargets?.[g] != null && raw.plan.weeklyTargets[g] !== LEGACY_WEEKLY_TARGETS[g] ? 'manual' : 'auto';
    }
    if (legacy) {
        if (s.tempoMin <= 0)
            s.tempoMin = 0.5;
        if (s.tempo <= 0) {
            s.countMode = 'manual';
            s.tempo = 3;
        }
        s.tempoMax = Math.max(s.tempoMax, s.tempoMin, s.tempo);
        if (!raw?.plan?.rotationMode)
            s.plan.rotationMode = 'rotation';
    }
    dropProviderCredentials(s);
    delete s.aiModel;
    s.aiTransport = 'proxy';
    if (!s.aiProxyUrl && s.openaiProxyUrl)
        s.aiProxyUrl = s.openaiProxyUrl;
    for (const k of ['tempo', 'tempoMin', 'tempoMax'])
        s[k] = finite(s[k], 0.2, 12, k);
    if (s.tempoMin > s.tempoMax)
        throw new Error('최소 속도는 최대 속도보다 클 수 없습니다.');
    s.tempo = Math.min(s.tempoMax, Math.max(s.tempoMin, s.tempo));
    for (const k of ['restDefault', 'warmupRest', 'warmupToWorkRest', 'exerciseRest', 'exerciseSetup'])
        s[k] = finite(s[k], 0, 900, k, { integer: true });
    s.countdownSec = finite(s.countdownSec, 0, 15, '준비 카운트다운', { integer: true });
    s.restWarnSec = finite(s.restWarnSec, 0, 60, '휴식 알림', { integer: true });
    s.announceLastReps = finite(s.announceLastReps, 0, 10, '마지막 횟수 알림', { integer: true });
    for (const k of ['autoStartRest', 'autoAdvance', 'autoNextExercise', 'reviewAutoAdvance', 'voiceEnabled', 'beepEnabled', 'keepAwake'])
        if (typeof s[k] !== 'boolean')
            throw new Error(`${k} 설정은 켜짐/꺼짐이어야 합니다.`);
    s.reviewAutoAdvanceSec = finite(s.reviewAutoAdvanceSec, 1, 15, '세트 확인 자동 기록 시간', { integer: true });
    for (const [k, min, max] of [['voiceRate', 0.5, 2], ['voicePitch', 0.5, 2], ['voiceVolume', 0, 1]])
        s[k] = finite(s[k], min, max, k);
    if (!['kg', 'lb'].includes(s.unit) || !['auto', 'manual'].includes(s.countMode))
        throw new Error('단위 또는 카운트 방식이 올바르지 않습니다.');
    if (s.phaseTempo != null) {
        array(s.phaseTempo, '동작별 시간', 3);
        if (s.phaseTempo.length !== 3)
            throw new Error('동작 시간은 세 값이 필요합니다.');
        s.phaseTempo = s.phaseTempo.map(x => finite(x, 0, 8, '동작 시간'));
        if (s.phaseTempo[0] + s.phaseTempo[2] < 0.4 || s.phaseTempo.reduce((a, b) => a + b, 0) > 12)
            throw new Error('움직이는 구간 합은 0.4초 이상, 전체는 12초 이내로 정해 주세요.');
    }
    s.plan.sessionMinutes = finite(s.plan.sessionMinutes, 20, 150, '운동시간', { integer: true });
    s.plan.dailyExerciseCount = s.plan.dailyExerciseCount == null ? null : finite(s.plan.dailyExerciseCount, 1, 12, '하루 종목 수', { integer: true });
    s.plan.variantsPerGroup = finite(s.plan.variantsPerGroup, 1, 3, '종목 구성 수', { integer: true });
    s.plan.stableWeeks = finite(s.plan.stableWeeks, 1, 12, '주요 종목 유지 기간', { integer: true });
    parseYmd(s.plan.blockAnchor);
    if (!['rotation', 'stable'].includes(s.plan.rotationMode))
        throw new Error('로테이션 방식이 올바르지 않습니다.');
    if (!['general', 'strength', 'hypertrophy'].includes(s.plan.goal) || !['unknown', 'beginner', 'intermediate', 'advanced'].includes(s.plan.experience))
        throw new Error('목표/경험 설정이 올바르지 않습니다.');
    s.plan.targetRir = finite(s.plan.targetRir, 0, 5, '목표 여유 횟수', { integer: true });
    s.plan.maxIncreasePercent = finite(s.plan.maxIncreasePercent, 1, 20, '최대 증량률');
    s.plan.staleDays = finite(s.plan.staleDays, 7, 365, '기록 참고 기간', { integer: true });
    s.plan.estimateScale = finite(s.plan.estimateScale, 0.3, 1, '환산 보수 계수');
    for (const g of GROUP_IDS) {
        s.plan.weeklyTargets[g] = finite(s.plan.weeklyTargets[g], 0, 30, '주간 본세트 목표', { integer: true });
        if (!['auto', 'manual'].includes(s.plan.weeklyTargetModes[g]))
            throw new Error('주간 본세트 목표 방식이 올바르지 않습니다.');
    }
    for (let d = 0; d < 7; d++) {
        array(s.plan.week[d], '요일별 부위', 10);
        if (s.plan.week[d].some(g => !GROUP_IDS.includes(g)) || new Set(s.plan.week[d]).size !== s.plan.week[d].length)
            throw new Error('요일 부위가 잘못됐거나 중복됩니다.');
    }
    for (const k of ['bench', 'pulldown', 'squat', 'ohp'])
        s.plan.benchmarks[k] = finite(s.plan.benchmarks[k], 0, 1500, '기준 무게', { nullable: true });
    for (const v of Object.values(s.plan.weightSteps))
        finite(v, 0.1, 50, '기구 증량 단위');
    for (const v of Object.values(s.plan.minimumLoads))
        finite(v, 0, 100, '기구 최소 무게');
    const rawEquipment = array(s.plan.equipment, '기구 목록', 20).map(x => text(x, '기구', 40));
    const oldBroadEquipment = rawEquipment.filter(x => !EQUIPMENT.includes(x));
    s.plan.equipment = [...new Set(rawEquipment.filter(x => EQUIPMENT.includes(x)))];
    if (oldBroadEquipment.some(x => ['머신', '원판', '기타'].includes(x)))
        s.plan.equipmentReviewRequired = true;
    if (typeof s.plan.equipmentReviewRequired !== 'boolean')
        throw new Error('기구 확인 상태가 올바르지 않습니다.');
    const machineIds = new Set(MACHINE_CATALOG.map(x => x.id));
    s.plan.machineIds = [...new Set(array(s.plan.machineIds, '머신 목록', 100).map(x => text(x, '머신 ID', 80)))];
    if (s.plan.machineIds.some(x => !machineIds.has(x)))
        throw new Error('알 수 없는 머신이 선택돼 있습니다.');
    if (s.plan.machineIds.length)
        s.plan.equipmentReviewRequired = false;
    array(s.avoidExerciseIds, '제외 종목', 500).forEach(x => text(x, '종목 ID', 160));
    for (const k of ['aiProxyUrl', 'openaiProxyUrl', 'voiceURI'])
        text(s[k], k, 2048);
    if (!['claude', 'openai'].includes(s.aiProvider) || s.aiTransport !== 'proxy')
        throw new Error('AI 제공자/연결 방식이 올바르지 않습니다.');
    if (s.lastBackupAt) {
        if (!Number.isFinite(Date.parse(s.lastBackupAt)))
            throw new Error('백업 날짜가 올바르지 않습니다.');
    }
    return s;
}
function validateExecutionFields(entry) {
    if (entry.tempo != null)
        entry.tempo = finite(entry.tempo, 0.2, 12, '카운트 간격');
    if (entry.rest != null)
        entry.rest = finite(entry.rest, 0, 900, '종목 휴식');
    if (entry.countMode != null && !['auto', 'manual'].includes(entry.countMode))
        throw new Error('카운트 방식이 올바르지 않습니다.');
    if (entry.measure != null && !['reps', 'duration'].includes(entry.measure))
        throw new Error('운동 측정 방식이 올바르지 않습니다.');
    if (entry.phaseTempo != null) {
        array(entry.phaseTempo, '구간별 시간', 3);
        if (entry.phaseTempo.length !== 3)
            throw new Error('구간별 시간은 세 값입니다.');
        entry.phaseTempo = entry.phaseTempo.map(v => finite(v, 0, 8, '구간별 시간'));
        const [lower, hold, lift] = entry.phaseTempo;
        if (lower + lift < 0.4 || lower + hold + lift > 12)
            throw new Error('구간별 시간의 합을 확인해 주세요.');
    }
    if (entry.equip != null)
        text(entry.equip, '기구', 40);
    if (isAssistanceExercise(entry)) {
        entry.loadBasis = 'assistance';
        // Recommendations are derived data. Drop a previously generated
        // ordinary-load recommendation while preserving every recorded value.
        if (entry.recommendation != null && entry.recommendation?.source !== 'manual')
            entry.recommendation = null;
        if (entry.overloadNote)
            entry.overloadNote = '';
    }
    else if (entry.loadBasis != null && !LOAD_BASES.includes(entry.loadBasis))
        throw new Error('중량 기록 방식이 올바르지 않습니다.');
    if (entry.secondary != null)
        array(entry.secondary, '보조 부위', 10).forEach(g => {
            if (!GROUP_IDS.includes(g))
                throw new Error('보조 부위가 올바르지 않습니다.');
        });
    return entry;
}
function validateSet(raw, session = false, legacy = false) {
    const st = clone(object(raw, '세트'));
    st.id = id(st.id, 'set');
    st.warmup = !!st.warmup;
    st.weight = finite(st.weight, 0, 1500, '세트 무게', { nullable: true });
    if (session) {
        st.targetReps = finite(st.targetReps ?? st.reps ?? 10, 1, 600, '목표 횟수/초', { integer: true });
        st.reps = finite(st.reps, 0, 600, '실제 횟수/초', { nullable: true, integer: true });
        st.done = !!st.done;
        st.confirmed = st.confirmed === true;
        if (legacy && st.done && !Object.hasOwn(raw, 'confirmed'))
            st.confirmed = false;
        if (st.done && st.confirmed && st.reps == null)
            throw new Error('확인한 완료 세트에는 실제 수행값이 필요합니다.');
        if (st.confirmationSource != null && !['manual', 'auto'].includes(st.confirmationSource))
            throw new Error('세트 확인 방식이 올바르지 않습니다.');
        if (st.confirmationSource === 'auto')
            st.confirmed = false;
        st.rir = finite(st.rir, 0, 10, '여유 횟수', { nullable: true, integer: true });
        st.unit = 'kg';
    }
    else
        st.reps = finite(st.reps, 1, 600, '목표 횟수/초', { integer: true });
    if (st.rest != null)
        st.rest = finite(st.rest, 0, 900, '휴식');
    if (st.planRest != null)
        st.planRest = finite(st.planRest, 0, 900, '세트별 휴식');
    if (st.tempo != null)
        st.tempo = finite(st.tempo <= 0 && legacy ? 3 : st.tempo, 0.2, 12, '카운트 간격');
    if (st.at != null)
        finite(st.at, 0, 1e14, '완료 시각');
    return st;
}
export function validateSession(raw, { legacy = false, draft = false } = {}) {
    assertSafeTree(raw);
    const s = clone(object(raw, '운동 기록'));
    s.id = id(s.id, 'ses');
    parseYmd(s.date);
    s.title = text(s.title ?? '운동', '기록 제목', 300);
    s.comment = text(s.comment || '', '메모', 20000);
    finite(s.startedAt, 0, 1e14, '시작 시각');
    if (s.endedAt != null) {
        finite(s.endedAt, s.startedAt, 1e14, '종료 시각');
    }
    s.entries = array(s.entries, '운동 종목', 80).map(rawEntry => {
        const e = validateExecutionFields(clone(object(rawEntry, '운동 종목')));
        e.id = id(e.id, 'entry');
        e.exerciseId = text(e.exerciseId, '종목 ID', 160);
        e.name = text(e.name, '종목명', 200);
        if (!GROUP_IDS.includes(e.group))
            throw new Error('기록의 운동 부위가 올바르지 않습니다.');
        e.measure = e.measure || (e.exerciseId === 'plank' ? 'duration' : 'reps');
        if (!['reps', 'duration'].includes(e.measure))
            throw new Error('운동 측정 방식이 올바르지 않습니다.');
        e.sets = array(e.sets, '기록 세트', 50).map(st => validateSet(st, true, legacy));
        if (isAssistanceExercise(e))
            e.sets.forEach(st => {
                if (st.recommendation != null && st.recommendation?.source !== 'manual')
                    st.recommendation = null;
            });
        unique(e.sets, '세트');
        return e;
    });
    unique(s.entries, '종목');
    const allIds = s.entries.flatMap(e => e.sets);
    unique(allIds, '세트');
    if (s.pausedMs != null)
        s.pausedMs = finite(s.pausedMs, 0, 1e14, '일시정지 시간');
    if (s.status != null && !['draft', 'manual', 'legacy', 'partial', 'completed'].includes(s.status))
        throw new Error('운동 기록 상태가 올바르지 않습니다.');
    if (!draft && !s.status)
        s.status = s.endedAt ? 'legacy' : 'partial';
    return s;
}
function validatePlanSets(rawBlock, { legacy = false } = {}) {
    if (Array.isArray(rawBlock.sets))
        return array(rawBlock.sets, '계획 세트', 50).map(st => validateSet(st, false, legacy));
    // The first workout release stored rule, AI, and user-edited plans as a
    // block-level set count plus shared reps/weight. Only that documented
    // legacy shape is expanded; unknown/corrupt shapes still fail closed.
    if (!legacy || typeof rawBlock.sets !== 'number')
        return array(rawBlock.sets, '계획 세트', 50);
    const count = finite(rawBlock.sets, 1, 50, '계획 세트 수', { integer: true });
    const reps = finite(rawBlock.reps, 1, 600, '계획 목표 횟수/초', { integer: true });
    const weight = finite(rawBlock.weight, 0, 1500, '계획 세트 무게', { nullable: true });
    return Array.from({ length: count }, () => validateSet({ reps, weight }, false, true));
}
export function validateWeeklyPlan(raw, key, { legacy = false } = {}) {
    const p = clone(object(raw, '주간 계획'));
    parseYmd(p.weekStart);
    if (key && p.weekStart !== key)
        throw new Error('계획의 주 시작일과 키가 다릅니다.');
    p.days = array(p.days, '계획 일자', 7).map(rawDay => {
        const d = clone(object(rawDay, '하루 계획'));
        parseYmd(d.date);
        d.id = id(d.id, 'day');
        d.title = text(d.title ?? '운동', '하루 제목', 300);
        d.blocks = array(d.blocks, '계획 종목', 30).map(rawBlock => {
            const b = clone(object(rawBlock, '계획 종목'));
            b.name = text(b.name, '종목명', 200);
            b.exerciseId = text(b.exerciseId, '종목 ID', 160);
            if (!GROUP_IDS.includes(b.group))
                throw new Error('계획의 부위가 올바르지 않습니다.');
            b.rest = finite(b.rest ?? 90, 0, 900, '휴식');
            b.tempo = finite(b.tempo === 0 ? 3 : b.tempo ?? 3, 0.2, 12, '카운트 간격');
            validateExecutionFields(b);
            const numericLegacySets = legacy && typeof rawBlock.sets === 'number';
            b.sets = validatePlanSets(rawBlock, { legacy });
            if (isAssistanceExercise(b))
                b.sets.forEach(st => {
                    if (st.recommendation != null && st.recommendation?.source !== 'manual')
                        st.recommendation = null;
                });
            if (numericLegacySets) {
                delete b.reps;
                delete b.weight;
            }
            if (!b.sets.length)
                throw new Error('운동마다 세트가 한 개 이상 필요합니다.');
            return b;
        });
        return d;
    });
    if (new Set(p.days.map(d => d.date)).size !== p.days.length)
        throw new Error('계획 날짜가 중복됩니다.');
    return p;
}
export function validateData(raw, { legacy = false } = {}) {
    assertSafeTree(raw);
    object(raw, '백업');
    const data = clone(raw);
    data.settings = validateSettings(data.settings, { legacy });
    data.sessions = array(data.sessions ?? [], '기록', 10000).map(s => validateSession(s, { legacy }));
    unique(data.sessions, '기록');
    data.sessions.sort((a, b) => a.startedAt - b.startedAt);
    object(data.plans ?? {}, '계획');
    data.plans = Object.fromEntries(Object.entries(data.plans || {}).map(([key, p]) => [key, validateWeeklyPlan(p, key, { legacy })]));
    data.customExercises = array(data.customExercises ?? [], '사용자 종목', 400).map(rawEx => {
        const e = clone(object(rawEx, '사용자 종목'));
        e.id = text(e.id, 'ID', 160);
        e.name = text(e.name, '종목명', 200);
        if (!GROUP_IDS.includes(e.group))
            throw new Error('사용자 종목 부위가 올바르지 않습니다.');
        e.equip = text(e.equip || '기타', '기구', 40);
        e.loadBasis = e.loadBasis == null ? null : text(e.loadBasis, '중량 기록 방식', 40);
        if (e.loadBasis != null && !LOAD_BASES.includes(e.loadBasis))
            throw new Error('사용자 종목의 중량 기록 방식이 올바르지 않습니다.');
        e.requiredEquipment = e.requiredEquipment == null ? [] : array(e.requiredEquipment, '사용자 종목 필요 기구', 10).map(x => text(x, '필요 기구', 40));
        e.machineIds = e.machineIds == null ? [] : array(e.machineIds, '사용자 종목 필요 머신', 20).map(x => text(x, '머신 ID', 80));
        if (e.requiredEquipment.some(x => !EQUIPMENT.includes(x)) || e.machineIds.some(x => !MACHINE_CATALOG.some(m => m.id === x)))
            throw new Error('사용자 종목의 필요 기구가 올바르지 않습니다.');
        for (const [k, min, max] of [['sets', 1, 20], ['reps', 1, 600], ['rest', 0, 900], ['tier', 1, 3]])
            e[k] = finite(e[k] ?? (k === 'tier' ? 2 : 10), min, max, k, { integer: true });
        e.tempo = finite(e.tempo ?? 3, 0.2, 12, '카운트 간격');
        return e;
    });
    unique(data.customExercises, '사용자 종목');
    data.meta = object(data.meta ?? { rotation: {} }, '메타데이터');
    data.meta.rotation ??= {};
    data.meta.schema = 2;
    if (legacy && raw.settings?.unit === 'lb')
        data.meta.unitReviewRequired = true;
    data.draft = data.draft == null ? null : clone(object(data.draft, '진행 중 운동'));
    if (data.draft)
        data.draft = validateDraft(data.draft, { legacy });
    return data;
}
/**
 * Read-only recovery view for a legacy store with one or more invalid plans.
 * Records, settings, custom exercises, and plans that validate independently
 * remain visible; invalid raw plans are never guessed at or written back.
 */
export function validateLegacyDataForRecovery(raw) {
    assertSafeTree(raw);
    object(raw, '백업');
    const rawPlans = object(raw.plans ?? {}, '계획');
    const data = validateData({ ...clone(raw), plans: {} }, { legacy: true });
    const errors = [];
    for (const [key, plan] of Object.entries(rawPlans)) {
        try {
            data.plans[key] = validateWeeklyPlan(plan, key, { legacy: true });
        }
        catch (error) {
            errors.push({ weekStart: key, message: error.message });
        }
    }
    if (errors.length)
        data.meta.legacyPlanRecovery = { invalidWeeks: errors };
    return { data, errors };
}
export function parseBackup(input) {
    const raw = typeof input === 'string' ? JSON.parse(input) : input;
    if (raw?.app !== 'workout-log' || ![1, 2].includes(raw.version))
        throw new Error('지원하는 운동일지 백업(v1/v2)이 아닙니다.');
    const data = validateData(raw.data || raw, { legacy: raw.version === 1 });
    return { data, version: raw.version };
}
export function validateDraft(raw, { legacy = false } = {}) {
    assertSafeTree(raw);
    const draft = clone(object(raw, '진행 중 운동'));
    draft.session = validateSession(draft.session, { legacy, draft: true });
    if (!draft.session.entries.length)
        throw new Error('진행 중 운동에 종목이 없습니다.');
    const runtime = object(draft.runtime, '진행 상태');
    const states = ['ready', 'countdown', 'counting', 'review', 'setdone', 'resting', 'exercise_rest', 'exercise_setup', 'paused', 'done'];
    const check = (r) => {
        if (!states.includes(r.state))
            throw new Error('진행 상태를 읽을 수 없습니다.');
        if (r.rep != null)
            finite(r.rep, 0, 600, '진행 카운트', { integer: true });
        if (r.tempo != null)
            finite(r.tempo, 0.2, 12, '카운트 간격');
        for (const key of ['remaining', 'nextRepRemaining', 'completionRemaining'])
            if (r[key] != null)
                finite(r[key], 0, 900000, key);
        if (r.reviewDraft != null) {
            const d = object(r.reviewDraft, '세트 확인 입력');
            for (const key of ['entryId', 'setId'])
                text(d[key], '세트 확인 대상', 160);
            for (const key of ['reps', 'weight', 'rir'])
                if (d[key] != null && typeof d[key] !== 'string' && typeof d[key] !== 'number')
                    throw new Error('세트 확인 입력이 올바르지 않습니다.');
            if (d.weightTouched != null && typeof d.weightTouched !== 'boolean')
                throw new Error('세트 무게 편집 상태가 올바르지 않습니다.');
        }
        if (r.countMode != null && !['auto', 'manual'].includes(r.countMode))
            throw new Error('진행 중 카운트 방식 오류');
        for (const key of ['savedAt', 'pausedAt'])
            if (r[key] != null)
                finite(r[key], 0, 1e14, key);
    };
    check(runtime);
    if (runtime.pausedInfo)
        check(runtime.pausedInfo);
    if (runtime.state === 'paused' && !runtime.pausedInfo)
        throw new Error('일시정지 복원 정보가 없습니다.');
    if (draft.planSnapshot) {
        const day = object(draft.planSnapshot, '원래 계획');
        parseYmd(day.date);
        array(day.blocks, '원래 계획 종목', 80);
        day.blocks.forEach(b => { validateExecutionFields(b); array(b.sets, '원래 계획 세트', 50).forEach(st => validateSet(st)); });
    }
    return draft;
}
