/** Execution UI: stable edit targets, explicit performance confirmation and resumable drafts. */
import { h, mount, modal, toast, field, weightInput, numberInput, confirmSheet, dial, stepper } from '../ui.js';
import { getPlan, savePlan, settings, sessions, draft, saveDraft, clearDraft, finalizeSession, metadata, storageStatus, exportAll } from '../store.js';
import { Runner, sessionVolume, sessionSetCount } from '../runner.js';
import { buildFreeDay, makeBlock } from '../planner.js';
import { GROUP_NAME, LOAD_LABELS } from '../exercises.js';
import { unlockAudio } from '../voice.js';
import { pickExercise } from './exercisePicker.js';
import { weekStartOf, parseYmd, ymd, fmtDate, mmss, fmtWeight, comma, finite, readWeightInput, download } from '../util.js';
import { go } from '../app.js';
export function renderRun(root, [date]) {
    parseYmd(date);
    if (storageStatus().readOnly)
        throw new Error(storageStatus().message);
    if (metadata().unitReviewRequired)
        throw new Error('설정에서 기존 기록의 단위를 먼저 확인해 주세요.');
    const weekStart = ymd(weekStartOf(parseYmd(date))), plan = getPlan(weekStart);
    let day = structuredClone(plan?.days.find(d => d.date === date) || buildFreeDay(date));
    let runner = null, dispose = null, alive = true;
    function start(restored = null) {
        if (!alive)
            return;
        unlockAudio();
        runner = restored ? Runner.fromDraft(restored, { weekStart }) : new Runner(day, { weekStart });
        const persistPlanOrder = () => {
            if (!plan) return;
            const targetDay = plan.days.find(d => d.date === date);
            if (!targetDay || !Array.isArray(runner.planSnapshot?.blocks)) return;
            if (targetDay.blocks.length !== runner.planSnapshot.blocks.length) return;
            targetDay.blocks = structuredClone(runner.planSnapshot.blocks);
            savePlan(plan);
        };
        const ui = buildUi(root, runner, () => alive, persistPlanOrder);
        let finishing = false;
        const offChange = runner.on('change', value => {
            if (finishing || runner.state === 'done')
                return;
            try {
                saveDraft(value).catch(() => { });
            }
            catch (e) {
                runner.pause('저장소를 확인해 주세요.');
                toast(e.message, 6000);
            }
        });
        const offTick = runner.on('tick', ui.sync), offState = runner.on('state', ui.rebuild);
        const offDone = runner.on('done', async (session) => {
            if (finishing)
                return;
            finishing = true;
            if (!sessionSetCount(session, { includeWarmup: true })) {
                await clearDraft().catch(() => { });
                if (alive)
                    go('/exec');
                return;
            }
            try {
                await finalizeSession(session);
                if (alive)
                    ui.summary(session, true);
            }
            catch {
                if (alive)
                    ui.summary(session, false);
            }
        });
        dispose = () => {
            if (runner.state !== 'done') {
                runner.pause('화면을 이동했어요. 다음에 이어할 수 있어요.');
                try {
                    saveDraft(runner.snapshot()).catch(() => { });
                }
                catch { }
            }
            offChange();
            offTick();
            offState();
            offDone();
            runner.stop();
        };
        runner.start();
        ui.rebuild();
    }
    function chooseFirst() {
        mount(root, h('.card', null, h('h2', null, day.blocks.length ? day.title : '자유운동'), h('p.hint', null, `${fmtDate(date)} 계획을 참고해 오늘 운동합니다. 실제 기록 날짜는 시작한 날이에요.`), day.blocks.length ? h('button.btn-block.btn-primary', { onclick: () => start() }, '운동 준비') : h('button.btn-block.btn-primary', { onclick: () => pickExercise(null, ex => {
                if (!alive)
                    return;
                day.blocks.push(makeBlock(ex, { sessions: sessions() }));
                day.title = '자유운동';
                start();
            }) }, '첫 종목 고르기'), h('button.btn-block.btn-ghost', { onclick: () => go('/exec') }, '운동실행으로')));
    }
    const pending = draft();
    if (pending) {
        mount(root, h('.card', null, h('h2', null, '진행 중인 운동이 있어요'), h('p', null, pending.session.title), h('p.hint', null, `${pending.session.date} · 완료 ${sessionSetCount(pending.session, { includeWarmup: true })}세트. 자동으로 타이머를 재개하지 않아요.`), h('.stack', null, h('button.btn-primary', { onclick: () => start(pending) }, '이어하기'), h('button', { onclick: async () => {
                const s = structuredClone(pending.session);
                if (!sessionSetCount(s, { includeWarmup: true }))
                    return toast('완료된 세트가 없어요. 폐기로 정리해 주세요.');
                s.endedAt = Math.max(s.startedAt, pending.runtime?.savedAt || Date.now());
                s.status = 'partial';
                s.stopReason = '진행 기록 복구';
                await finalizeSession(s);
                if (alive)
                    go('/session/' + s.id);
            } }, '여기까지 기록으로 저장'), h('button.btn-danger', { onclick: async () => {
                if (!await confirmSheet({ title: '진행 중인 운동을 폐기할까요?', body: '이미 저장된 과거 운동 기록은 지우지 않습니다.', confirmText: '진행 기록 폐기', danger: true }))
                    return;
                await clearDraft();
                if (alive)
                    chooseFirst();
            } }, '진행 기록 폐기'))));
    }
    else if (day.blocks.length)
        start();
    else
        chooseFirst();
    return () => { alive = false; dispose?.(); };
}
function setName(entry, rec) {
    const index = entry.sets.indexOf(rec), same = entry.sets.filter(s => s.warmup === rec.warmup), n = entry.sets.slice(0, index + 1).filter(s => s.warmup === rec.warmup).length;
    return `${rec.warmup ? '웜업' : '본세트'} ${n} / ${same.length}`;
}
function nextTarget(r) { return r.transition && r.transition.reason !== 'pre' ? r.findSet(r.transition.targetEntryId, r.transition.targetSetId) : r.peekNext(); }
function buildUi(root, r, alive, persistPlanOrder = () => {}) {
    const bar = h('i'), exBox = h('.run-ex'), big = h('span.big'), of = h('.of'), phase = h('.phase');
    const counter = h('.counter', null, big, of, phase), pips = h('.setgrid'), elapsed = h('.run-elapsed'), actions = h('.run-actions');
    const tools = h('.run-tools');
    const stopActions = h('.run-stop-actions', null,
        h('button.btn-stop-exercise', { onclick: () => stopExercise(r) }, '이 운동 그만하기'),
        h('button.btn-stop-workout', { onclick: () => quit(r) }, '오늘 운동 그만하기'));
    let finishButton = null, reviewButton = null, reviewRestart = null, reviewHint = null;
    mount(root, h('.run', null, h('.run-top', null, h('span.eyebrow', null, '운동 실행'), h('button.btn-sm', { onclick: () => openList(r, persistPlanOrder) }, '목록·추가')), h('.run-progress', { 'aria-hidden': 'true' }, bar), exBox, counter, pips, elapsed, tools, actions, stopActions));
    function sync() {
        if (!alive() || r.state === 'done')
            return;
        bar.style.width = `${Math.round(r.progress * 100)}%`;
        elapsed.textContent = `전체 ${mmss(r.elapsedSec)} · 일시정지 제외 ${mmss(r.activeElapsedSec)}`;
        phase.textContent = r.phaseLabel;
        counter.className = 'counter';
        if (r.isResting) {
            counter.classList.add('resting');
            big.textContent = mmss(r.restLeft);
            const names = { resting: r.transition?.reason === 'pre' ? '시작 전 휴식' : r.transition?.reason === 'warmup' ? '웜업 사이 휴식' : r.transition?.reason === 'warmup-to-work' ? '본세트 전 휴식' : '본세트 사이 휴식', exercise_rest: '운동 사이 휴식', exercise_setup: '다음 운동 기구 준비' };
            of.textContent = names[r.state];
        }
        else if (r.state === 'countdown') {
            big.textContent = String(Math.ceil(r.countdownLeft));
            of.textContent = '준비 카운트다운';
        }
        else if (r.state === 'counting') {
            big.textContent = String(r.rep);
            of.textContent = `/ ${r.targetReps}${r.measure === 'duration' ? '초' : '회'} · ${r.countMode === 'manual' && r.measure !== 'duration' ? '수동 카운트' : '자동 카운트'}`;
            if (finishButton)
                finishButton.textContent = `여기까지 · ${r.rep}${r.measure === 'duration' ? '초' : '회'}`;
        }
        else if (r.state === 'paused') {
            counter.classList.add('paused');
            big.textContent = '일시정지';
            of.textContent = r.pausedInfo?.reason || '준비되면 이어가 주세요.';
        }
        else if (r.state === 'review') {
            counter.classList.add('review');
            big.textContent = '실제 수행 확인';
            of.textContent = '카운터의 숫자는 실제 수행을 감지한 값이 아니에요.';
            if (reviewButton)
                reviewButton.textContent = reviewLabel(r, !!r.reviewAuto);
            if (reviewRestart)
                reviewRestart.hidden = !!r.reviewAuto;
            if (reviewHint)
                reviewHint.textContent = r.reviewAuto ? '입력란을 누르거나 값을 바꾸면 이 세트의 자동 기록이 멈춥니다.' : '자동 기록이 멈췄어요. 직접 확인하거나 다시 5초를 시작할 수 있어요.';
        }
        else if (r.state === 'setdone') {
            counter.classList.add('paused');
            big.textContent = '기록 확인됨';
            of.textContent = '휴식 또는 다음 세트로 이동해 주세요.';
        }
        else {
            big.textContent = String(r.targetReps);
            of.textContent = `${r.measure === 'duration' ? '초 유지' : '회'} 목표 · 준비되면 시작`;
        }
    }
    function rebuild() {
        if (!alive() || !r.entry)
            return;
        const e = r.entry, rec = r.setRec, next = nextTarget(r), s = settings();
        mount(exBox, h('.set-context', null, h('span.pill', { class: rec.warmup ? 'warm' : '' }, setName(e, rec)), h('span.eyebrow', null, GROUP_NAME[e.group] || '')), h('h2', null, e.name), h('.run-load', null, `${fmtWeight(rec.weight, s.unit)} × ${rec.targetReps}${r.measure === 'duration' ? '초' : '회'}`), h('p.hint', null, LOAD_LABELS[e.loadBasis] || '기록 표기 중량'), r.state === 'ready' && (rec.recommendation?.note || e.recommendation?.note) ? h('p.hint', null, rec.recommendation?.note || e.recommendation.note) : null, next ? h('.run-next', null, `다음 · ${next.entry.name} · ${setName(next.entry, next.rec)} · ${fmtWeight(next.rec.weight, s.unit)} × ${next.rec.targetReps}${next.entry.measure === 'duration' ? '초' : '회'}`) : h('.run-next', null, '마지막 세트예요.'));
        mount(pips, ...e.sets.map((st, i) => h('button.setpip', { class: [st.done ? 'done' : '', st.warmup ? 'warm' : '', st.skipped ? 'skipped' : '', i === r.setIndex ? 'cur' : ''].join(' '), disabled: st.done, 'aria-label': `${setName(e, st)} ${st.done ? '완료' : st.skipped ? '건너뜀' : '이동'}`, onclick: () => { r.pause('세트 이동'); r.jumpTo(r.exIndex, i); } }, st.done ? '✓' : st.warmup ? 'W' : String(e.sets.slice(0, i + 1).filter(x => !x.warmup).length))));
        finishButton = null;
        reviewButton = null;
        reviewRestart = null;
        reviewHint = null;
        mount(actions, ...actionsFor(r, button => { finishButton = button; }, (button, restart, hint) => { reviewButton = button; reviewRestart = restart; reviewHint = hint; }));
        const editNext = (r.isResting || (r.state === 'paused' && ['resting', 'exercise_rest', 'exercise_setup'].includes(r.pausedInfo?.state))) && r.transition?.reason !== 'pre';
        mount(tools, r.state === 'review' ? null : h('.btn-row', null, h('button.btn-sm', { onclick: () => editSet(r, editNext ? nextTarget(r) : r.currentTarget()) }, editNext ? '다음 세트 수정' : '무게·목표'), h('button.btn-sm', { onclick: () => controlSheet(r) }, '속도·휴식')));
        sync();
    }
    async function summary(session, saved) {
        mount(root, h('div', null, h('h1', null, '수고하셨어요'), h('p.hint', null, session.title), h('p', { class: saved ? 'good' : 'danger' }, saved ? '운동 기록이 기기에 저장됐어요.' : '저장되지 않았어요. 이 화면을 닫기 전에 재시도하거나 백업해 주세요.'), h('.kpis', null, kpi(String(sessionSetCount(session)), '본세트'), kpi(String(Math.round(((session.endedAt || Date.now()) - session.startedAt) / 60000)), '분'), kpi(comma(sessionVolume(session)), '기록 볼륨')), ...session.entries.filter(e => e.sets.some(st => st.done)).map(e => h('.card', null, h('h3', null, e.name), h('p.hint', null, e.sets.filter(st => st.done).map(st => `${st.warmup ? '웜업 ' : ''}${fmtWeight(st.weight, settings().unit)} × ${st.reps}${e.measure === 'duration' ? '초' : '회'}`).join(' · ')))), !saved ? h('.stack', null, h('button.btn-primary', { onclick: async () => { await finalizeSession(session); summary(session, true); } }, '저장 재시도'), h('button', { onclick: () => download('운동일지-미저장포함.json', JSON.stringify(exportAll(), null, 2)) }, '현재 기록 포함 백업')) : null, h('button.btn-block.btn-primary', { onclick: () => go('/session/' + session.id) }, '기록 확인·메모'), h('button.btn-block.btn-ghost', { onclick: () => go('/exec') }, '운동실행으로')));
    }
    return { sync, rebuild, summary };
}
const kpi = (v, label) => h('.kpi', null, h('.v', null, v), h('.k', null, label));
function actionsFor(r, setFinishButton, setReviewButton) {
    if (r.state === 'ready')
        return [
            h('button.btn-block.btn-primary.btn-lg', { onclick: () => r.beginSet() }, '세트 시작'),
            h('.btn-row', null, h('button', { onclick: () => r.beginRest() }, '먼저 쉬기'), h('button', { onclick: () => r.skipSet() }, '이 세트 건너뛰기'))
        ];
    if (r.state === 'countdown')
        return [h('button.btn-primary.btn-lg', { onclick: () => r.beginCounting() }, '지금 카운트 시작'), h('.btn-row', null, h('button', { onclick: () => r.pause() }, '일시정지'), h('button', { onclick: () => r.cancelSet() }, '시작 취소'))];
    if (r.state === 'counting') {
        const done = h('button.btn-primary.btn-lg', { onclick: () => r.finishSet() }, '여기까지');
        setFinishButton(done);
        return [r.countMode === 'manual' && r.measure !== 'duration' ? h('.btn-row', null, h('button', { onclick: () => r.manualCount(-1) }, '− 1회'), h('button.btn-primary', { onclick: () => r.manualCount(1) }, '＋ 1회')) : null, done, h('button', { onclick: () => r.pause() }, '일시정지')];
    }
    if (r.state === 'review')
        return [reviewForm(r, setReviewButton)];
    if (r.state === 'paused')
        return [h('button.btn-primary.btn-lg', { onclick: () => r.resume() }, '이어하기'), ['countdown', 'counting', 'review'].includes(r.pausedInfo?.state) ? h('button', { onclick: () => { r.resume(); r.cancelSet(); } }, '현재 세트 시작 취소') : null];
    if (r.state === 'setdone')
        return [h('button.btn-primary.btn-lg', { onclick: () => r.beginRest() }, '휴식 시작'), h('button', { onclick: () => r.advance() }, '바로 다음 세트')];
    if (r.isResting)
        return [
            h('.btn-row', null, h('button', { onclick: () => r.adjustRest(-15) }, '현재 −15초'), h('button', { onclick: () => r.adjustRest(15) }, '현재 +15초')),
            h('button.btn-primary.btn-lg', { onclick: () => r.skipRest() }, r.state === 'exercise_setup' ? '기구 준비 완료' : r.state === 'exercise_rest' ? '휴식 끝내고 기구 준비' : '휴식 끝내기'),
            h('button', { onclick: () => r.pause() }, '일시정지')
        ];
    return [];
}
function reviewLabel(r, automatic = false) {
    const manual = r.peekNext() ? (r.config.autoStartRest ? '확인하고 휴식' : '기록 확인') : '확인하고 운동 마치기';
    return automatic ? `${manual} · ${Math.max(0, Math.ceil(r.reviewAutoLeft || r.config.reviewAutoAdvanceSec))}초` : manual;
}
function reviewForm(r, setReviewButton) {
    const rec = r.setRec, s = settings(), d = r.reviewDraft || { reps: String(r.rep), weight: '', rir: '' };
    const reps = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 600, value: d.reps, 'aria-label': '실제 수행 횟수/초' });
    const weight = weightInput(rec.weight, s.unit);
    weight.value = d.weight ?? weight.value;
    const rir = h('select', { 'aria-label': '여유 횟수 RIR' }, h('option', { value: '', selected: d.rir === '' || d.rir == null }, '모르겠어요 · 증량 보류'), ...[0, 1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: String(d.rir) === String(n) }, `${n}${n === 5 ? '회 이상' : '회'} 더 가능`)));
    const bind = (input, key) => {
        input.addEventListener('focus', () => r.cancelReviewAuto());
        const patch = () => key === 'weight' ? { weight: input.value, weightTouched: true } : { [key]: input.value };
        input.addEventListener('input', () => r.updateReviewDraft(patch()));
        input.addEventListener('change', () => r.updateReviewDraft(patch()));
    };
    bind(reps, 'reps');
    bind(weight, 'weight');
    bind(rir, 'rir');
    const expectedAuto = !!r.reviewAuto || r.config.reviewAutoAdvance;
    const primary = h('button.btn-block.btn-primary.btn-lg', { onclick: () => r.recordReview('manual') }, reviewLabel(r, expectedAuto));
    const restart = h('button.btn-block', { hidden: expectedAuto, onclick: () => r.startReviewAuto() }, `${r.config.reviewAutoAdvanceSec}초 자동 기록 다시 시작`);
    const hint = h('p.hint', null, expectedAuto ? '입력란을 누르거나 값을 바꾸면 이 세트의 자동 기록이 멈춥니다.' : '자동 기록이 멈췄어요. 직접 확인하거나 다시 5초를 시작할 수 있어요.');
    setReviewButton(primary, restart, hint);
    return h('.review-card', null, hint, h('.btn-row', null, field(r.measure === 'duration' ? '실제 유지(초)' : '실제 수행(회)', reps), field(`실제 무게 (${s.unit})`, weight)), field('여유 횟수(RIR) · 선택', rir), primary,
        r.config.reviewAutoAdvance ? restart : null,
        h('button.btn-block.btn-ghost', { onclick: () => r.cancelSet() }, '완료 취소 · 다시 하기'));
}
function editSet(r, target) {
    if (!target || target.rec.done)
        return toast('수정할 미완료 세트가 없어요.');
    const entryId = target.entryId, setId = target.setId;
    r.pause('세트 수정 중에는 자동으로 넘어가지 않아요.');
    const before = structuredClone(target.rec), s = settings();
    modal(close => {
        const weight = weightInput(before.weight, s.unit), reps = numberInput(before.targetReps, { min: 1, max: 600, label: '목표 횟수/초' });
        const scope = h('select', null, h('option', { value: 'one' }, '이 세트만'), h('option', { value: 'same-kind' }, before.warmup ? '이후 미완료 웜업에도' : '이후 미완료 본세트에도'));
        return h('div', null, h('h3', null, target.entry.name), h('p.hint', null, `${setName(target.entry, target.rec)}을 수정합니다. 완료 기록과 다른 종류의 세트는 보존돼요.`), field(`무게 (${s.unit})`, weight), field(target.entry.measure === 'duration' ? '목표 유지(초)' : '목표 횟수', reps), field('적용 범위', scope), h('button.btn-block.btn-primary', { onclick: () => { r.editSet(entryId, setId, { weight: readWeightInput(weight, before.weight, s.unit), targetReps: finite(reps.value, 1, 600, '목표', { integer: true }) }, scope.value); close(); toast('적용했어요. 이어하기를 눌러 진행해 주세요.'); } }, '적용'), h('.btn-row', null, h('button', { onclick: () => { r.addSetAfter(entryId, setId); close(); } }, '이 세트 복사'), h('button.btn-danger', { disabled: target.entry.sets.length <= 1, onclick: () => {
                if (r.removeSetAt(entryId, setId))
                    close();
            } }, '이 세트 삭제')));
    });
}
function controlSheet(r) {
    r.pause('속도·휴식 설정 중이에요.');
    modal(close => {
        const speed = h('div'), quick = h('.btn-row');
        const paintSpeed = () => mount(speed, dial({ label: '카운트 간격', value: r.tempo, min: r.config.tempoMin, max: r.config.tempoMax, step: .1, format: v => v.toFixed(1) + '초', onchange: v => r.setTempo(v) }));
        if (r.measure !== 'duration')
            paintSpeed();
        mount(quick, ...[2, 2.5, 3, 4].filter(n => n >= r.config.tempoMin && n <= r.config.tempoMax).map(n => h('button.btn-sm', { onclick: () => { r.setTempo(n); paintSpeed(); } }, `${n}초`)));
        const phases = [2, 0, 1].map((n, i) => numberInput(r.phaseTempo?.[i] ?? n, { min: 0, max: 8, step: .1, label: ['내리기', '정지', '올리기'][i] }));
        return h('div', null, h('h3', null, '속도·휴식'), r.measure === 'duration' ? h('p.hint', null, '시간 운동은 실제 1초 간격으로 측정합니다.') : h('div', null, speed, h('.btn-row', null, h('button', { onclick: () => { r.setTempo(Math.max(r.config.tempoMin, Number((r.tempo - .1).toFixed(1)))); paintSpeed(); } }, '−0.1초'), h('button', { onclick: () => { r.setTempo(Math.min(r.config.tempoMax, Number((r.tempo + .1).toFixed(1)))); paintSpeed(); } }, '+0.1초')), h('div', { style: { marginTop: '8px' } }, quick), h('details', null, h('summary', null, '동작 구간별 세부 설정'), h('.btn-row', null, ...phases.map((x, i) => field(['내리기', '정지', '올리기'][i], x))), h('button', { onclick: () => { r.setPhaseTempo(phases.map(x => Number(x.value))); paintSpeed(); toast('세 구간을 적용했어요.'); } }, '구간 시간 적용')), h('.btn-row', null, h('button', { 'aria-pressed': r.countMode === 'auto', onclick: () => { r.setCountMode('auto'); toast('자동 카운트'); } }, '자동 카운트'), h('button', { 'aria-pressed': r.countMode === 'manual', onclick: () => { r.setCountMode('manual'); toast('버튼으로 한 번씩 세는 수동 모드예요.'); } }, '수동 카운트'))), h('hr.rule'), field('이 운동의 이후 본세트 휴식', stepper({ value: r.rest, min: 0, max: 900, step: 15, format: mmss, onchange: v => r.setRest(v) }), '현재 남은 휴식은 바꾸지 않습니다. 웜업·운동 사이 휴식은 설정의 별도 값을 사용해요.'), h('p.hint', null, `운동 사이 ${r.config.exerciseRest}초 + 기구 준비 ${r.config.exerciseSetup}초. 이 기본값은 설정에서 변경해요.`), h('button.btn-block.btn-primary', { onclick: close }, '설정 닫기 · 일시정지 유지'));
    });
}
function openList(r, persistPlanOrder = () => {}) {
    r.pause('목록을 보는 동안 일시정지했어요.');
    modal(close => {
        const list = h('div');
        const paint = () => mount(list, ...r.session.entries.map((e, i) => {
            const done = e.sets.filter(st => st.done).length;
            const pendingIndex = e.sets.findIndex(st => !st.done && !st.skipped);
            const finished = pendingIndex < 0;
            const last = e.sets.at(-1);
            return h('.card', { style: { padding: '10px', marginBottom: '8px' } },
                h('button.btn-block.btn-ghost', {
                    disabled: finished,
                    onclick: () => { r.jumpTo(i, Math.max(0, pendingIndex)); close(); },
                }, h('span', { style: { flex: 1, textAlign: 'left' } }, `${i + 1}. ${e.name}`),
                   h('small', null, `${done}/${e.sets.length}세트${finished ? ' ✓' : ''}`)),
                h('.btn-row', { style: { marginTop: '6px' } },
                    h('button.btn-sm.btn-ghost', {
                        disabled: i === 0,
                        onclick: () => { if (r.moveExercise(i, i - 1)) { persistPlanOrder(); paint(); } },
                    }, '↑ 앞으로'),
                    h('button.btn-sm.btn-ghost', {
                        disabled: i === r.session.entries.length - 1,
                        onclick: () => { if (r.moveExercise(i, i + 1)) { persistPlanOrder(); paint(); } },
                    }, '↓ 뒤로'),
                    h('button.btn-sm', {
                        onclick: () => {
                            if (!last) return;
                            const setId = r.addSetAfter(e.id, last.id);
                            const target = r.findSet(e.id, setId);
                            if (finished && target) {
                                r.jumpTo(target.exIndex, target.setIndex);
                                close();
                                toast(`${e.name} 한 세트 더`);
                                return;
                            }
                            paint();
                            toast('세트를 늘렸어요.');
                        },
                    }, '＋ 세트'),
                ),
            );
        }));
        paint();
        return h('div', null,
            h('h3', null, '오늘의 운동'),
            field('오늘 메모', h('textarea', { value: r.session.comment || '', oninput: e => { r.session.comment = e.target.value; r.changed(); } })),
            list,
            h('.stack', null,
                h('button', { onclick: () => { close(); pickExercise(null, ex => { r.addExercise(ex); toast('종목을 추가했어요.'); }); } }, '종목 추가'),
                h('button', { onclick: () => { close(); pickExercise(r.entry?.group, ex => { r.substituteExercise(ex); toast('완료 기록을 보존하고 남은 운동만 대체했어요.'); }); } }, '현재 운동의 남은 세트 대체'),
                h('button.btn-danger', { onclick: () => { r.stopCurrentExercise(); close(); } }, '현재 운동의 남은 세트 건너뛰기')),
        );
    });
}

async function stopExercise(r) {
    r.pause('현재 운동 종료 확인 중이에요.');
    const name = r.entry?.name || '현재 운동';
    if (!await confirmSheet({ title: `${name}을 그만할까요?`, body: '이 종목의 남은 미완료 세트만 건너뛰고 다음 종목으로 이동합니다. 완료한 세트는 그대로 남아요.', confirmText: '이 운동 그만하기', danger: true }))
        return;
    r.stopCurrentExercise();
}

async function quit(r) {
    r.pause('종료 확인 중이에요.');
    if (!await confirmSheet({ title: '오늘 운동을 여기서 마칠까요?', body: '현재까지 완료한 세트는 일부 진행 기록으로 안전하게 저장합니다. 남은 세트는 수행하지 않은 상태로 남고, 취소하면 일시정지 상태를 유지해요.', confirmText: '오늘 운동 그만하기', danger: true }))
        return;
    r.abort('사용자가 오늘 운동 종료');
}
