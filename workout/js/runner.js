/** One session is the source of truth. No delayed callbacks can complete a different set. */
import { settings, sessions } from './store.js';
import { makeBlock } from './planner.js';
import { speakCount, cue, beep, stopSpeaking } from './voice.js';
import { uid, todayYmd, clone, clamp, finite, displayWeight, inputWeight } from './util.js';
import { transitionTiming } from './timing.js';
import { validateSession, validateDraft } from './validation.js';
import { isAssistanceExercise } from './exercises.js';
let activeRunner = null;
const REST_STATES = new Set(['resting', 'exercise_rest', 'exercise_setup']);
export class Runner {
    constructor(day, opt = {}) {
        this.options = opt;
        this.config = clone(opt.settings || settings());
        this.clock = opt.now || (() => Date.now());
        this.audio = opt.audio || { speakCount, cue, beep, stop: stopSpeaking };
        this.blockFactory = opt.makeBlock || ((ex, extra) => makeBlock(ex, { sessions: sessions(), ...extra }));
        this.planSnapshot = clone(day); // Never mutate the plan supplied by the caller.
        this.listeners = new Map();
        this.state = 'ready';
        this.exIndex = 0;
        this.setIndex = 0;
        this.rep = 0;
        this.epoch = 0;
        this.timer = null;
        this.running = false;
        this.wakeLock = null;
        this.wakeGeneration = 0;
        this.nextRepAt = 0;
        this.lastRepAt = 0;
        this.deadline = 0;
        this.completeAt = null;
        this.lastCountdown = null;
        this.transition = null;
        this.pausedInfo = null;
        this.restWarned = false;
        this.reviewGeneration = 0;
        this.reviewAuto = null;
        this.reviewDraft = null;
        this.session = { id: uid('ses'), date: todayYmd(), plannedDate: day.date, weekStart: opt.weekStart || null, dayId: day.id || null,
            title: day.title || '운동', startedAt: this.clock(), endedAt: null, pausedMs: 0, comment: '', status: 'draft', schema: 2,
            entries: (day.blocks || []).map(b => this.entryFromBlock(b)) };
        this.syncCurrent();
    }
    entryFromBlock(b) {
        return { ...clone(b), id: uid('entry'), sets: (b.sets || []).map(st => ({
                ...clone(st), id: uid('set'), targetReps: st.reps, reps: null, weight: st.weight ?? null,
                planRest: st.rest ?? null, rest: st.rest ?? b.rest ?? this.config.restDefault,
                warmup: !!st.warmup, done: false, confirmed: false, confirmationSource: null, skipped: false, rir: null, at: null,
                tempo: b.tempo ?? this.config.tempo, unit: 'kg',
            })) };
    }
    static fromDraft(draft, opt = {}) {
        draft = validateDraft(draft);
        const runner = new Runner(draft.planSnapshot || { title: draft.session.title, blocks: [] }, opt);
        runner.session = validateSession(draft.session, { draft: true });
        const saved = draft.runtime || {};
        const target = runner.findSet(saved.entryId, saved.setId) || runner.firstPending();
        if (target) {
            runner.exIndex = target.exIndex;
            runner.setIndex = target.setIndex;
        }
        runner.syncCurrent();
        runner.rep = saved.rep || 0;
        runner.tempo = saved.tempo || runner.tempo;
        runner.countMode = saved.countMode || runner.config.countMode;
        runner.transition = clone(saved.transition || null);
        runner.reviewDraft = clone(saved.reviewDraft || null);
        runner.reviewAuto = null;
        runner.reviewGeneration++;
        const restoredState = saved.state === 'paused' ? saved.pausedInfo?.state : saved.state;
        runner.session.pausedMs = (runner.session.pausedMs || 0) + Math.max(0, runner.clock() - (saved.state === 'paused' ? (saved.pausedInfo?.pausedAt || saved.savedAt) : (saved.savedAt || runner.clock())));
        runner.pausedInfo = { ...(saved.state === 'paused' ? saved.pausedInfo : saved), state: ['done', 'paused'].includes(restoredState) ? 'ready' : restoredState || 'ready', pausedAt: runner.clock() };
        runner.state = 'paused'; // Never play or resume timers without user interaction.
        return runner;
    }
    on(event, fn) {
        if (!this.listeners.has(event))
            this.listeners.set(event, new Set());
        this.listeners.get(event).add(fn);
        return () => this.listeners.get(event)?.delete(fn);
    }
    emit(event, payload) {
        for (const fn of this.listeners.get(event) || [])
            fn(payload);
    }
    changed() { this.emit('change', this.snapshot()); }
    setState(next, { silence = true } = {}) {
        if (this.state === 'review' && next !== 'review') {
            this.reviewGeneration++;
            this.reviewAuto = null;
        }
        this.epoch++;
        this.completeAt = null;
        if (silence)
            this.audio.stop();
        this.state = next;
        this.emit('state', next);
        this.emit('tick', this);
        this.changed();
    }
    get entry() { return this.session.entries[this.exIndex] || null; }
    get block() { return this.entry; }
    get setRec() { return this.entry?.sets[this.setIndex] || null; }
    get day() { return { ...this.planSnapshot, blocks: this.session.entries.map(e => ({ ...e, sets: e.sets.map(s => ({ ...s, reps: s.targetReps })) })) }; }
    get targetReps() { return this.setRec?.targetReps ?? 10; }
    get doneSets() { return this.session.entries.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0); }
    get totalSets() { return this.session.entries.reduce((n, e) => n + e.sets.length, 0); }
    get progress() { return this.totalSets ? this.doneSets / this.totalSets : 0; }
    get elapsedSec() { return Math.max(0, ((this.session.endedAt ?? this.clock()) - this.session.startedAt) / 1000); }
    get activeElapsedSec() { const pausedNow = this.state === 'paused' ? this.clock() - (this.pausedInfo?.pausedAt || this.clock()) : 0; return Math.max(0, this.elapsedSec - ((this.session.pausedMs || 0) + pausedNow) / 1000); }
    get restLeft() { return REST_STATES.has(this.state) ? Math.max(0, (this.deadline - this.clock()) / 1000) : 0; }
    get countdownLeft() { return this.state === 'countdown' ? Math.max(0, (this.deadline - this.clock()) / 1000) : 0; }
    get reviewAutoLeft() { return this.reviewAuto && this.reviewAutoMatches() ? Math.max(0, (this.reviewAuto.deadline - this.clock()) / 1000) : 0; }
    get isResting() { return REST_STATES.has(this.state); }
    get measure() { return this.entry?.measure || 'reps'; }
    get phaseLabel() {
        if (this.measure === 'duration')
            return '유지';
        const phases = this.phaseTempo;
        if (!phases || this.state !== 'counting')
            return '';
        const progress = ((this.clock() - this.lastRepAt) / 1000) % this.tempo;
        return progress < phases[0] ? '내리기' : progress < phases[0] + phases[1] ? '정지' : '올리기';
    }
    syncCurrent() {
        this.tempo = this.entry?.measure === 'duration' ? 1 : (this.entry?.tempo ?? this.config.tempo);
        this.tempo = clamp(this.tempo, 0.2, 12);
        this.rest = this.entry?.rest ?? this.config.restDefault;
        this.countMode = this.entry?.countMode || this.config.countMode;
        this.phaseTempo = this.entry?.phaseTempo || this.config.phaseTempo;
        if (this.phaseTempo && this.measure !== 'duration')
            this.tempo = this.phaseTempo.reduce((a, b) => a + b, 0);
    }
    findSet(entryId, setId) {
        const exIndex = this.session.entries.findIndex(e => e.id === entryId);
        if (exIndex < 0)
            return null;
        const setIndex = this.session.entries[exIndex].sets.findIndex(s => s.id === setId);
        if (setIndex < 0)
            return null;
        return { entryId, setId, exIndex, setIndex, rec: this.session.entries[exIndex].sets[setIndex], entry: this.session.entries[exIndex] };
    }
    currentTarget() { return this.entry && this.setRec ? { entryId: this.entry.id, setId: this.setRec.id, exIndex: this.exIndex, setIndex: this.setIndex, rec: this.setRec, entry: this.entry } : null; }
    firstPending() {
        for (let i = 0; i < this.session.entries.length; i++) {
            const j = this.session.entries[i].sets.findIndex(s => !s.done && !s.skipped);
            if (j >= 0) {
                const e = this.session.entries[i];
                return this.findSet(e.id, e.sets[j].id);
            }
        }
        return null;
    }
    peekNext() {
        for (let i = this.exIndex; i < this.session.entries.length; i++) {
            const e = this.session.entries[i];
            for (let j = i === this.exIndex ? this.setIndex + 1 : 0; j < e.sets.length; j++)
                if (!e.sets[j].done && !e.sets[j].skipped)
                    return this.findSet(e.id, e.sets[j].id);
        }
        return null;
    }
    hasMore() { return !!this.peekNext(); }
    start() {
        if (this.running)
            return;
        if (activeRunner && activeRunner !== this)
            activeRunner.stop();
        activeRunner = this;
        this.running = true;
        if (!this.options.noTimer)
            this.timer = setInterval(() => this.tick(), 100);
        globalThis.document?.addEventListener('visibilitychange', this.onVisible);
        this.requestWakeLock();
        this.changed();
    }
    stop({ silence = true } = {}) {
        this.running = false;
        clearInterval(this.timer);
        this.timer = null;
        this.epoch++;
        this.reviewGeneration++;
        this.reviewAuto = null;
        this.completeAt = null;
        if (silence)
            this.audio.stop();
        this.releaseWakeLock();
        globalThis.document?.removeEventListener('visibilitychange', this.onVisible);
        if (activeRunner === this)
            activeRunner = null;
    }
    onVisible = () => {
        if (document.visibilityState === 'hidden' && this.state !== 'done')
            this.pause('화면이 가려져 일시정지했어요.');
        else if (document.visibilityState === 'visible')
            this.requestWakeLock();
    };
    async requestWakeLock() {
        if (!this.running || !this.config.keepAwake || this.wakeLock || !globalThis.navigator?.wakeLock)
            return;
        const generation = ++this.wakeGeneration;
        try {
            const lock = await navigator.wakeLock.request('screen');
            if (!this.running || generation !== this.wakeGeneration) {
                await lock.release();
                return;
            }
            this.wakeLock = lock;
            lock.addEventListener('release', () => {
                if (this.wakeLock === lock)
                    this.wakeLock = null;
            });
        }
        catch { /* optional capability */ }
    }
    releaseWakeLock() {
        this.wakeGeneration++;
        const lock = this.wakeLock;
        this.wakeLock = null;
        try {
            Promise.resolve(lock?.release()).catch(() => { });
        }
        catch { }
    }
    snapshot() {
        const runtime = { state: this.state, entryId: this.entry?.id, setId: this.setRec?.id, rep: this.rep, tempo: this.tempo, countMode: this.countMode,
            remaining: Math.max(0, this.deadline - this.clock()), nextRepRemaining: Math.max(0, this.nextRepAt - this.clock()),
            completionRemaining: this.completeAt == null ? null : Math.max(0, this.completeAt - this.clock()),
            transition: clone(this.transition), pausedInfo: clone(this.pausedInfo), reviewDraft: clone(this.reviewDraft), savedAt: this.clock() };
        return { schema: 2, session: clone(this.session), planSnapshot: clone(this.planSnapshot), runtime };
    }
    tick() {
        if (!this.running || this.state === 'paused' || this.state === 'done')
            return;
        const now = this.clock();
        if (this.state === 'countdown') {
            const left = Math.ceil((this.deadline - now) / 1000);
            if (left > 0 && left !== this.lastCountdown) {
                this.lastCountdown = left;
                this.audio.speakCount(left);
            }
            if (now >= this.deadline)
                this.beginCounting();
        }
        else if (this.state === 'counting') {
            if (this.countMode !== 'manual' || this.measure === 'duration') {
                let advanced = false;
                while (now >= this.nextRepAt && this.rep < this.targetReps) {
                    this.rep++;
                    this.lastRepAt = this.nextRepAt;
                    this.nextRepAt += this.tempo * 1000;
                    advanced = true;
                }
                if (advanced) {
                    if (this.measure !== 'duration' || this.targetReps - this.rep <= 5)
                        this.audio.speakCount(this.rep);
                    this.emit('rep', this.rep);
                    this.changed();
                    if (this.config.announceLastReps > 0 && this.targetReps - this.rep === this.config.announceLastReps)
                        this.audio.cue.lastRep();
                }
                if (this.rep >= this.targetReps) {
                    if (this.completeAt == null)
                        this.completeAt = now + 800;
                    else if (now >= this.completeAt)
                        this.finishSet();
                }
            }
        }
        else if (REST_STATES.has(this.state)) {
            const left = this.restLeft;
            if (!this.restWarned && this.state !== 'exercise_setup' && this.config.restWarnSec > 0 && left <= this.config.restWarnSec && left > 0) {
                this.restWarned = true;
                this.audio.cue.restSoon(Math.ceil(left));
            }
            if (now >= this.deadline)
                this.finishRest();
        }
        else if (this.state === 'review' && this.reviewAuto && this.reviewAutoMatches() && now >= this.reviewAuto.deadline)
            this.recordReview('auto');
        this.emit('tick', this);
    }
    beginSet() {
        if (this.state !== 'ready' || !this.setRec || this.setRec.done || this.setRec.skipped)
            return false;
        this.rep = 0;
        this.restWarned = false;
        if (this.config.countdownSec > 0) {
            this.deadline = this.clock() + this.config.countdownSec * 1000;
            this.lastCountdown = null;
            this.setState('countdown');
            this.audio.cue.ready();
        }
        else
            this.beginCounting();
        return true;
    }
    beginCounting() {
        if (!['ready', 'countdown'].includes(this.state) || !this.setRec || this.setRec.done)
            return false;
        this.rep = 0;
        this.lastRepAt = this.clock();
        this.nextRepAt = this.clock() + this.tempo * 1000;
        this.setState('counting');
        this.audio.cue.start();
        return true;
    }
    cancelSet() {
        if (!['countdown', 'counting', 'review'].includes(this.state))
            return;
        this.rep = 0;
        this.reviewDraft = null;
        this.setState('ready');
    }
    finishSet(actualReps = null) {
        if (this.state !== 'counting')
            return false;
        this.rep = actualReps == null ? this.rep : finite(actualReps, 0, 600, '실제 수행', { integer: true });
        // Counting is not sensing: actual performance is confirmed on the review screen.
        this.reviewDraft = { entryId: this.entry.id, setId: this.setRec.id, reps: String(this.rep),
            weight: this.setRec.weight == null ? '' : String(Number(displayWeight(this.setRec.weight, this.config.unit).toFixed(2))), weightTouched: false, rir: '' };
        this.setState('review');
        this.startReviewAuto();
        this.audio.cue.setDone();
        return true;
    }
    reviewAutoMatches() {
        return this.state === 'review' && this.reviewAuto?.generation === this.reviewGeneration && this.reviewAuto.entryId === this.entry?.id && this.reviewAuto.setId === this.setRec?.id;
    }
    reviewValues() {
        const d = this.reviewDraft;
        if (!d || d.entryId !== this.entry?.id || d.setId !== this.setRec?.id)
            throw new Error('확인 중인 세트가 바뀌었어요. 다시 확인해 주세요.');
        return { reps: finite(d.reps, 0, 600, '실제 수행', { integer: true }), weight: d.weightTouched ? inputWeight(d.weight, this.config.unit) : this.setRec.weight,
            rir: finite(d.rir, 0, 10, '여유 횟수', { nullable: true, integer: true }) };
    }
    updateReviewDraft(patch, { interaction = true } = {}) {
        if (this.state !== 'review' || !this.reviewDraft)
            return false;
        Object.assign(this.reviewDraft, patch);
        if (interaction)
            this.cancelReviewAuto();
        this.changed();
        return true;
    }
    cancelReviewAuto() {
        if (!this.reviewAuto)
            return false;
        this.reviewGeneration++;
        this.reviewAuto = null;
        this.emit('tick', this);
        this.changed();
        return true;
    }
    startReviewAuto() {
        if (this.state !== 'review' || !this.config.reviewAutoAdvance)
            return false;
        this.reviewValues(); // Invalid or incomplete edits are never auto-recorded.
        const generation = ++this.reviewGeneration;
        this.reviewAuto = { generation, entryId: this.entry.id, setId: this.setRec.id, deadline: this.clock() + this.config.reviewAutoAdvanceSec * 1000 };
        this.emit('tick', this);
        this.changed();
        return true;
    }
    recordReview(source = 'manual') {
        if (!['manual', 'auto'].includes(source))
            throw new Error('세트 확인 방식이 올바르지 않습니다.');
        return this.recordSet({ ...this.reviewValues(), confirmationSource: source });
    }
    recordSet({ reps = this.rep, rir = null, weight = this.setRec?.weight ?? null, confirmationSource = 'manual' } = {}) {
        if (this.state !== 'review' || !this.setRec || this.setRec.done)
            return false;
        if (!['manual', 'auto'].includes(confirmationSource))
            throw new Error('세트 확인 방식이 올바르지 않습니다.');
        const clean = { reps: finite(reps, 0, 600, '실제 수행', { integer: true }), rir: finite(rir, 0, 10, '여유 횟수', { nullable: true, integer: true }), weight: finite(weight, 0, 1500, '실제 무게', { nullable: true }) };
        const rec = this.setRec;
        Object.assign(rec, clean);
        rec.done = true;
        rec.confirmed = confirmationSource === 'manual';
        rec.confirmationSource = confirmationSource;
        rec.at = this.clock();
        rec.tempo = this.tempo;
        rec.rest = this.rest;
        rec.skipped = false;
        this.reviewDraft = null;
        this.changed();
        if (!this.peekNext())
            this.finishWorkout();
        else {
            this.setState('setdone');
            if (this.config.autoStartRest)
                this.beginRest();
        }
        return true;
    }
    manualCount(delta) {
        if (this.state !== 'counting' || this.countMode !== 'manual')
            return;
        this.rep = clamp(this.rep + delta, 0, 600);
        if (delta > 0)
            this.audio.speakCount(this.rep);
        this.emit('tick', this);
        this.changed();
    }
    beginRest(seconds = null) {
        if (!['ready', 'setdone'].includes(this.state))
            return false;
        const current = this.currentTarget(), next = this.state === 'ready' ? current : this.peekNext();
        if (!next) {
            this.finishWorkout();
            return false;
        }
        const descriptor = x => ({ entryId: x.entryId, setId: x.setId, warmup: x.rec.warmup, planRest: x.rec.planRest });
        const policy = this.state === 'ready' ? { reason: 'pre', rest: this.rest, setup: 0, target: current.setId } :
            transitionTiming(descriptor(current), descriptor(next), { settings: this.config, blockRest: this.rest });
        this.transition = { ...policy, targetEntryId: next.entryId, targetSetId: next.setId };
        const duration = seconds == null ? policy.rest : finite(seconds, 0, 900, '휴식 시간');
        this.deadline = this.clock() + duration * 1000;
        this.restWarned = false;
        this.setState(policy.reason === 'exercise' ? 'exercise_rest' : 'resting');
        this.audio.cue.restStart();
        if (duration === 0)
            this.finishRest();
        return true;
    }
    finishRest() {
        if (!REST_STATES.has(this.state) || !this.transition)
            return;
        const t = this.transition;
        if (this.state === 'exercise_rest' && t.setup > 0) {
            this.deadline = this.clock() + t.setup * 1000;
            this.setState('exercise_setup');
            this.audio.cue.nextEx(this.findSet(t.targetEntryId, t.targetSetId)?.entry.name || '');
            return;
        }
        const target = this.findSet(t.targetEntryId, t.targetSetId);
        if (!target || target.rec.done || target.rec.skipped) {
            this.transition = null;
            this.advance();
            return;
        }
        this.exIndex = target.exIndex;
        this.setIndex = target.setIndex;
        this.rep = 0;
        this.syncCurrent();
        this.transition = null;
        this.setState('ready');
        const auto = t.reason === 'pre' ? false : t.reason === 'exercise' ? this.config.autoNextExercise : this.config.autoAdvance;
        if (auto)
            this.beginSet();
        else
            this.audio.cue.restDone();
    }
    skipRest() { this.finishRest(); }
    adjustRest(delta) {
        if (!this.isResting)
            return;
        finite(delta, -900, 900, '시간 조정');
        this.deadline = Math.max(this.clock(), Math.min(this.clock() + 900000, this.deadline + delta * 1000));
        this.restWarned = false;
        this.emit('tick', this);
        this.changed();
    }
    setRest(seconds) {
        this.rest = finite(seconds, 0, 900, '이 운동 본세트 휴식');
        if (this.entry)
            this.entry.rest = this.rest;
        this.changed();
        this.emit('tick', this);
    }
    setTempo(seconds) {
        if (this.measure === 'duration')
            throw new Error('시간 운동은 실제 1초 간격으로 측정해요.');
        this.tempo = finite(seconds, this.config.tempoMin, this.config.tempoMax, '카운트 간격');
        this.phaseTempo = null;
        if (this.entry) {
            this.entry.tempo = this.tempo;
            this.entry.phaseTempo = null;
        }
        if (this.state === 'counting')
            this.nextRepAt = this.lastRepAt + this.tempo * 1000;
        this.changed();
        this.emit('tick', this);
    }
    setCountMode(mode) {
        if (!['auto', 'manual'].includes(mode))
            throw new Error('카운트 방식 오류');
        if (!['ready', 'paused'].includes(this.state))
            throw new Error('준비 또는 일시정지 상태에서 바꿔 주세요.');
        this.countMode = mode;
        if (this.entry)
            this.entry.countMode = mode;
        this.changed();
        this.emit('state', this.state);
    }
    setPhaseTempo(phases) {
        if (!Array.isArray(phases) || phases.length !== 3)
            throw new Error('내리기·정지·올리기 세 값을 넣어 주세요.');
        phases = phases.map(x => finite(x, 0, 8, '동작 구간'));
        const total = phases.reduce((a, b) => a + b, 0);
        finite(total, 0.4, 12, '전체 동작 시간');
        if (phases[0] + phases[2] < 0.4)
            throw new Error('움직이는 시간은 0.4초 이상이어야 해요.');
        this.phaseTempo = phases;
        this.tempo = total;
        this.entry.phaseTempo = phases;
        this.entry.tempo = total;
        if (this.state === 'counting')
            this.nextRepAt = this.lastRepAt + total * 1000;
        this.changed();
        this.emit('state', this.state);
    }
    pause(reason = '일시정지') {
        if (this.state === 'paused' || this.state === 'done')
            return false;
        const snapshot = this.snapshot().runtime;
        this.pausedInfo = { ...snapshot, state: this.state, pausedAt: this.clock(), reason };
        this.setState('paused');
        return true;
    }
    resume() {
        if (this.state !== 'paused' || !this.pausedInfo)
            return false;
        const info = this.pausedInfo;
        this.session.pausedMs = (this.session.pausedMs || 0) + Math.max(0, this.clock() - info.pausedAt);
        this.deadline = this.clock() + (info.remaining || 0);
        this.nextRepAt = this.clock() + (info.nextRepRemaining ?? this.tempo * 1000);
        this.lastRepAt = this.nextRepAt - this.tempo * 1000;
        this.pausedInfo = null;
        this.setState(info.state || 'ready');
        if (info.completionRemaining != null && this.state === 'counting')
            this.completeAt = this.clock() + info.completionRemaining;
        return true;
    }
    advance() {
        const next = this.peekNext();
        if (!next) {
            this.finishWorkout();
            return;
        }
        this.exIndex = next.exIndex;
        this.setIndex = next.setIndex;
        this.rep = 0;
        this.reviewDraft = null;
        this.transition = null;
        this.syncCurrent();
        this.setState('ready');
    }
    skipSet() {
        if (!['ready', 'paused'].includes(this.state))
            return false;
        const rec = this.setRec;
        if (!rec || rec.done)
            return false;
        rec.skipped = true;
        rec.done = false;
        this.pausedInfo = null;
        this.reviewDraft = null;
        this.advance();
        return true;
    }
    skipExercise() {
        if (!['ready', 'paused'].includes(this.state))
            return false;
        this.entry?.sets.forEach(s => {
            if (!s.done)
                s.skipped = true;
        });
        this.pausedInfo = null;
        this.reviewDraft = null;
        this.advance();
        return true;
    }
    jumpTo(exIndex, setIndex = 0) {
        const entry = this.session.entries[exIndex], rec = entry?.sets[setIndex];
        if (!rec)
            throw new Error('세트가 없습니다.');
        if (rec.done)
            throw new Error('완료 기록은 기록 탭에서 수정해 주세요.');
        this.exIndex = exIndex;
        this.setIndex = setIndex;
        rec.skipped = false;
        this.rep = 0;
        this.reviewDraft = null;
        this.transition = null;
        this.pausedInfo = null;
        this.syncCurrent();
        this.setState('ready');
    }
    goBack() {
        for (let i = this.exIndex; i >= 0; i--) {
            for (let j = i === this.exIndex ? this.setIndex - 1 : this.session.entries[i].sets.length - 1; j >= 0; j--) {
                if (!this.session.entries[i].sets[j].done) {
                    this.jumpTo(i, j);
                    return;
                }
            }
        }
        throw new Error('앞에 미완료 세트가 없어요. 완료 기록은 기록 탭에서 수정해 주세요.');
    }
    editSet(entryId, setId, patch, scope = 'one') {
        const target = this.findSet(entryId, setId);
        if (!target)
            throw new Error('수정할 세트가 없습니다.');
        if (target.rec.done)
            throw new Error('이미 완료한 세트는 여기서 덮어쓰지 않습니다.');
        if (!['one', 'same-kind'].includes(scope))
            throw new Error('적용 범위가 올바르지 않습니다.');
        const clean = {};
        if (Object.hasOwn(patch, 'weight'))
            clean.weight = finite(patch.weight, 0, 1500, '무게', { nullable: true });
        if (Object.hasOwn(patch, 'targetReps'))
            clean.targetReps = finite(patch.targetReps, 1, 600, '목표', { integer: true });
        const targets = scope === 'one' ? [target.rec] : target.entry.sets.slice(target.setIndex).filter(s => !s.done && !s.skipped && s.warmup === target.rec.warmup);
        targets.forEach(s => Object.assign(s, clean, { recommendation: { source: 'manual', requiresConfirmation: false, note: '직접 입력한 목표' } }));
        this.changed();
        this.emit('state', this.state);
        return targets.map(s => s.id);
    }
    setWeight(kg) {
        const t = this.currentTarget();
        if (t)
            this.editSet(t.entryId, t.setId, { weight: kg }, 'same-kind');
    }
    setTargetReps(n) {
        const t = this.currentTarget();
        if (t)
            this.editSet(t.entryId, t.setId, { targetReps: n }, 'same-kind');
    }
    setNextWeight(kg) {
        const t = this.peekNext();
        if (t)
            this.editSet(t.entryId, t.setId, { weight: kg }, 'same-kind');
    }
    setNextTargetReps(n) {
        const t = this.peekNext();
        if (t)
            this.editSet(t.entryId, t.setId, { targetReps: n }, 'same-kind');
    }
    addSetAfter(entryId, setId) {
        // Public operations use stable IDs; legacy numeric indices remain supported for callers.
        if (typeof entryId === 'number') {
            const e = this.session.entries[entryId];
            setId = e?.sets[setId]?.id;
            entryId = e?.id;
        }
        const t = this.findSet(entryId, setId);
        if (!t)
            throw new Error('복사할 세트가 없습니다.');
        if (t.entry.sets.length >= 50)
            throw new Error('한 종목에 최대 50세트까지 추가할 수 있어요.');
        const rec = { ...clone(t.rec), id: uid('set'), reps: null, done: false, confirmed: false, confirmationSource: null, skipped: false, rir: null, at: null };
        t.entry.sets.splice(t.setIndex + 1, 0, rec);
        if (t.exIndex === this.exIndex && t.setIndex < this.setIndex)
            this.setIndex++;
        this.changed();
        this.emit('state', this.state);
        return rec.id;
    }
    moveExercise(from, to) {
        if (!['ready', 'paused'].includes(this.state))
            throw new Error('준비 또는 일시정지 상태에서 순서를 바꿔 주세요.');
        const n = this.session.entries.length;
        if (from === to || from < 0 || from >= n || to < 0 || to >= n)
            return false;
        const currentId = this.entry?.id || null;
        const [entry] = this.session.entries.splice(from, 1);
        this.session.entries.splice(to, 0, entry);
        if (Array.isArray(this.planSnapshot?.blocks) && this.planSnapshot.blocks.length === n) {
            const [block] = this.planSnapshot.blocks.splice(from, 1);
            this.planSnapshot.blocks.splice(to, 0, block);
        }
        const moved = currentId ? this.session.entries.findIndex(e => e.id === currentId) : -1;
        this.exIndex = moved >= 0 ? moved : clamp(to, 0, n - 1);
        this.transition = null;
        this.changed();
        this.emit('state', this.state);
        this.emit('tick', this);
        return true;
    }
    removeSetAt(entryId, setId) {
        if (typeof entryId === 'number') {
            const e = this.session.entries[entryId];
            setId = e?.sets[setId]?.id;
            entryId = e?.id;
        }
        const t = this.findSet(entryId, setId);
        if (!t || t.entry.sets.length <= 1 || t.rec.done)
            return false;
        t.entry.sets.splice(t.setIndex, 1);
        if (t.exIndex === this.exIndex) {
            if (t.setIndex < this.setIndex)
                this.setIndex--;
            this.setIndex = Math.min(this.setIndex, t.entry.sets.length - 1);
        }
        this.rep = 0;
        this.reviewDraft = null;
        this.pausedInfo = null;
        this.transition = null;
        if (this.setRec?.done || this.setRec?.skipped) {
            const next = this.firstPending();
            if (next) {
                this.exIndex = next.exIndex;
                this.setIndex = next.setIndex;
                this.syncCurrent();
            }
            else {
                this.finishWorkout();
                return true;
            }
        }
        this.setState('ready');
        return true;
    }
    preparedPatterns() { return new Set(this.session.entries.filter(e => e.sets.some(s => s.done)).map(e => e.pattern).filter(Boolean)); }
    addExercise(ex, opt = {}) {
        const b = this.blockFactory(ex, { ...opt, preparedPatterns: this.preparedPatterns() });
        if (!b)
            throw new Error('추가할 종목이 없습니다.');
        const entry = this.entryFromBlock(b), at = this.session.entries.length ? this.exIndex + 1 : 0;
        this.session.entries.splice(at, 0, entry);
        if (this.session.entries.length === 1)
            this.syncCurrent();
        this.changed();
        this.emit('state', this.state);
        return entry.id;
    }
    substituteExercise(ex) {
        if (!['ready', 'paused'].includes(this.state) || !this.entry)
            throw new Error('준비 또는 일시정지 상태에서 바꿔 주세요.');
        const old = this.entry, completed = old.sets.filter(s => s.done || s.skipped), pending = old.sets.filter(s => !s.done && !s.skipped);
        const workCount = Math.max(1, pending.filter(s => !s.warmup).length);
        const b = this.blockFactory(ex, { sets: workCount, preparedPatterns: this.preparedPatterns() });
        if (!b)
            throw new Error('대체 종목을 만들지 못했습니다.');
        const fresh = this.entryFromBlock(b);
        if (completed.length) {
            old.sets = completed;
            this.session.entries.splice(this.exIndex + 1, 0, fresh);
            this.exIndex++;
        }
        else
            this.session.entries[this.exIndex] = fresh;
        this.setIndex = 0;
        this.rep = 0;
        this.reviewDraft = null;
        this.transition = null;
        this.pausedInfo = null;
        this.syncCurrent();
        this.setState('ready');
    }
    finishWorkout() {
        if (this.state === 'done')
            return;
        if (this.state === 'paused' && this.pausedInfo)
            this.session.pausedMs = (this.session.pausedMs || 0) + Math.max(0, this.clock() - this.pausedInfo.pausedAt);
        this.session.endedAt = this.clock();
        this.reviewDraft = null;
        this.session.status = !this.session.stopReason && this.session.entries.every(e => e.sets.every(s => s.done)) ? 'completed' : 'partial';
        this.setState('done');
        this.stop();
        this.audio.cue.allDone();
        this.emit('done', clone(this.session));
    }
    abort(reason = '직접 종료') {
        if (this.state === 'done')
            return;
        this.session.stopReason = reason;
        this.finishWorkout();
        this.session.status = 'partial';
    }
}
// The reset flow dispatches this before deleting workout-owned storage. A live
// execution page must not retain a timer capable of confirming an old set.
globalThis.addEventListener?.('workout:reset-start', () => activeRunner?.stop());
/** Recorded-load volume, not physiological workload; warmups and timed sets excluded by default. */
export function sessionVolume(session, { includeWarmup = false, confirmedOnly = false } = {}) {
    let volume = 0;
    for (const e of session.entries || []) {
        if (e.measure === 'duration' || e.exerciseId === 'plank' || isAssistanceExercise(e))
            continue;
        for (const st of e.sets || []) {
            if (st.done && (includeWarmup || !st.warmup) && (!confirmedOnly || st.confirmed) && Number.isFinite(st.weight) && Number.isFinite(st.reps))
                volume += st.weight * st.reps;
        }
    }
    return volume;
}
export function sessionSetCount(session, { includeWarmup = false } = {}) { return (session.entries || []).reduce((n, e) => n + (e.sets || []).filter(s => s.done && (includeWarmup || !s.warmup)).length, 0); }
