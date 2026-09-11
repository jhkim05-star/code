/** Actual records: manual entry never promotes a recommended weight into a completed set. */
import { h, mount, pageHead, empty, modal, confirmSheet, toast, field, weightInput, numberInput } from '../ui.js';
import { sessions, getSession, saveSession, deleteSession, settings, flush, customExercises } from '../store.js';
import { sessionVolume, sessionSetCount } from '../runner.js';
import { pickExercise } from './exercisePicker.js';
import { fmtDate, comma, parseYmd, ymd, todayYmd, DOW_KO, groupBy, uid, finite, readWeightInput, fmtWeight } from '../util.js';
import { LOAD_LABELS, isAssistanceExercise } from '../exercises.js';
import { go } from '../app.js';
let calendarDate = new Date();
export function renderHistory(root) { draw(root); }
function draw(root) {
    const all = [...sessions()].sort((a, b) => b.startedAt - a.startedAt), byMonth = groupBy(all, s => s.date.slice(0, 7));
    mount(root, pageHead('기록', `${all.length}회`, h('button.btn-sm', { onclick: () => addManualRecord() }, '기록 추가')), !all.length ? empty('첫 운동을 기록하면 여기에 쌓여요.') : calendarCard(root, all), ...[...byMonth].map(([month, list]) => h('.card', null, h('.card-head', null, h('h3', null, month.replace('-', '년 ') + '월'), h('small', null, `${list.length}회`)), ...list.map(s => sessionRow(s)))));
}
function calendarCard(root, all) {
    const y = calendarDate.getFullYear(), m = calendarDate.getMonth(), byDate = groupBy(all, s => s.date), cells = [];
    for (let i = 0; i < new Date(y, m, 1).getDay(); i++)
        cells.push(h('span', { 'aria-hidden': 'true' }));
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
        const date = ymd(new Date(y, m, d)), list = byDate.get(date) || [];
        cells.push(h('button.cal-cell', { class: [list.length ? 'has' : '', date === todayYmd() ? 'today' : ''].join(' '), disabled: !list.length, 'aria-label': `${fmtDate(date)} · 운동 기록 ${list.length}개`, onclick: () => {
                if (list.length === 1) {
                    go('/session/' + list[0].id);
                    return;
                }
                modal(close => h('div', null, h('h3', null, fmtDate(date)), h('ul.picker', null, ...list.map(s => h('li', null, h('button', { onclick: () => { close(); go('/session/' + s.id); } }, s.title, h('small', null, `${sessionSetCount(s)}본세트`)))))));
            } }, String(d), list.length ? h('span.cal-dot', { 'aria-hidden': 'true' }) : null));
    }
    return h('.card', null, h('.card-head', null, h('button.btn-sm', { 'aria-label': '지난달', onclick: () => { calendarDate = new Date(y, m - 1, 1); draw(root); } }, '‹'), h('h3', null, `${y}년 ${m + 1}월`), h('button.btn-sm', { 'aria-label': '다음달', onclick: () => { calendarDate = new Date(y, m + 1, 1); draw(root); } }, '›')), h('.cal-grid', null, ...DOW_KO.map(w => h('div.cal-dow', null, w)), ...cells));
}
function sessionRow(s) { return h('button.hrow', { onclick: () => go('/session/' + s.id) }, h('.hd', null, s.date.slice(5).replace('-', '/')), h('.hb', null, h('.ht', null, s.title), h('.hm', null, `${sessionSetCount(s)}본세트 · ${s.status === 'completed' ? '전체 실행 완료' : s.status === 'manual' ? '직접 기록' : s.status === 'legacy' ? '이전 기록' : '일부 진행'}`), h('.hm', null, s.entries.filter(e => e.sets.some(st => st.done)).map(e => e.name).slice(0, 4).join(' · ')))); }
function addManualRecord() {
    const chosen = [], list = h('div'), dateInput = h('input', { type: 'date', value: todayYmd(), max: todayYmd() }), titleInput = h('input', { type: 'text', maxLength: 300, placeholder: '비워두면 종목 이름 사용' });
    const paint = () => mount(list, ...chosen.map((row, i) => h('.card', null, h('.card-head', null, h('h3', null, row.ex.name), h('button.btn-sm', { 'aria-label': `${row.ex.name} 제거`, onclick: () => { chosen.splice(i, 1); paint(); } }, '삭제')), row.fields)));
    modal(close => h('div', null, h('h3', null, '지난 운동 직접 기록'), h('p.hint', null, '실제로 한 횟수와 중량을 입력해 주세요. 추천값은 자동으로 채우지 않습니다. 시간은 모르면 미기록으로 남겨요.'), field('운동 날짜', dateInput), field('기록 제목', titleInput), list, h('button.btn-block', { onclick: () => pickExercise(null, ex => {
            const setCount = numberInput(3, { min: 1, max: 20, label: '실제로 한 세트 수' }), reps = numberInput(null, { min: 0, max: 600, label: '각 세트의 실제 횟수/초' }), weight = weightInput(null, settings().unit);
            const row = { ex, setCount, reps, weight };
            const loadName = isAssistanceExercise(ex) ? '보조중량' : '실제 중량';
            weight.setAttribute('aria-label', `${loadName} (${settings().unit})`);
            row.fields = h('div', null, field('실제로 한 세트 수', setCount), field(ex.measure === 'duration' ? '각 세트 실제 유지(초)' : '각 세트 실제 횟수', reps), field(`${loadName} (${settings().unit}) · 맨몸은 비워두기`, weight), h('p.hint', null, LOAD_LABELS[ex.loadBasis] || '세트마다 값이 달랐다면 저장 후 기록 상세에서 각각 고쳐 주세요.'));
            chosen.push(row);
            paint();
        }, { equipmentOnly: false, includeAvoided: true }) }, '종목 추가'), h('button.btn-block.btn-primary', { style: { marginTop: '12px' }, onclick: async () => {
            parseYmd(dateInput.value);
            if (dateInput.value > todayYmd())
                throw new Error('실제 기록에는 미래 날짜를 넣을 수 없어요.');
            if (!chosen.length)
                throw new Error('종목을 하나 이상 추가해 주세요.');
            const date = dateInput.value, startedAt = new Date(date + 'T12:00:00').getTime();
            const entries = chosen.map(row => {
                const count = finite(row.setCount.value, 1, 20, '실제 세트 수', { integer: true }), reps = finite(row.reps.value, 0, 600, '실제 횟수/초', { integer: true }), weight = readWeightInput(row.weight, null, settings().unit);
                return { id: uid('entry'), exerciseId: row.ex.id, name: row.ex.name, group: row.ex.group, equip: row.ex.equip, measure: row.ex.measure, loadBasis: row.ex.loadBasis,
                    sets: Array.from({ length: count }, () => ({ id: uid('set'), targetReps: Math.max(1, reps), targetKnown: false, reps, weight, done: true, confirmed: true, confirmationSource: 'manual', rir: null, warmup: false, at: startedAt, tempo: row.ex.tempo, unit: 'kg' })) };
            });
            const record = { id: uid('ses'), date, title: titleInput.value.trim() || chosen.map(x => x.ex.name).slice(0, 2).join(' · '), startedAt, endedAt: null, comment: '', status: 'manual', entries };
            saveSession(record);
            await flush();
            close();
            go('/session/' + record.id);
        } }, '실제 입력값으로 기록 저장')));
}
export function renderSessionDetail(root, [id]) {
    let undo = null;
    const draw = () => {
        const record = getSession(id);
        if (!record) {
            mount(root, pageHead('기록'), empty('그 기록을 찾을 수 없어요.'));
            return;
        }
        const s = structuredClone(record), unit = settings().unit;
        async function commit(next) { undo = structuredClone(getSession(id)); next.updatedAt = Date.now(); saveSession(next); await flush(); draw(); }
        const unconfirmed = s.entries.flatMap(e => e.sets).filter(st => st.done && !st.confirmed).length;
        mount(root, pageHead(s.title, fmtDate(s.date), h('button.btn-sm', { onclick: () => go('/history') }, '목록')), h('.kpis', null, kpi(String(sessionSetCount(s)), '본세트'), kpi(s.endedAt ? String(Math.round((s.endedAt - s.startedAt) / 60000)) : '—', '분'), kpi(comma(sessionVolume(s)), '기록 볼륨')), h('p.hint', null, '볼륨은 일반 중량 × 횟수의 참고값이에요. 웜업·시간 운동과 낮을수록 실제 부하가 커지는 보조중량은 제외합니다.'), undo ? h('button.btn-block', { onclick: async () => { const previous = undo; undo = null; saveSession(previous); await flush(); draw(); } }, '방금 수정 되돌리기') : null, unconfirmed ? h('.card', null, h('p.hint.warning', null, `${unconfirmed}세트가 이전 버전 또는 미확인 기록이에요. 아래 실제 수치를 검토한 뒤 확인해 주세요. 미확인 값은 증량 근거로 사용하지 않습니다.`), h('button', { onclick: async () => {
                if (!await confirmSheet({ title: '표시된 실제 수행값이 맞나요?', body: '맞는 값만 확인하세요. 알 수 없는 값은 먼저 수정해 주세요.', confirmText: '검토한 실제 기록 확인' }))
                    return;
                s.entries.forEach(e => e.sets.forEach(st => {
                    if (st.done && st.reps != null)
                        Object.assign(st, { confirmed: true, confirmationSource: 'manual' });
                }));
                await commit(s);
            } }, '검토한 실제 기록 확인')) : null, h('.card', null, field('운동 메모', h('textarea', { value: s.comment || '', maxLength: 20000, onchange: e => { s.comment = e.target.value; return commit(s); } }))), ...s.entries.map((entry, ei) => h('.card', null, h('.card-head', null, h('h3', null, entry.name), h('small', null, `${entry.sets.filter(st => st.done && !st.warmup).length}본세트`)), ...entry.sets.map((st, si) => {
            const weight = weightInput(st.weight, unit), reps = numberInput(st.reps, { min: 0, max: 600, label: `${si + 1}세트 실제 횟수/초` });
            weight.addEventListener('change', async () => {
                try {
                    st.weight = readWeightInput(weight, st.weight, unit);
                    st.confirmed = false;
                    await commit(s);
                }
                catch (e) {
                    toast(e.message);
                }
            });
            reps.addEventListener('change', async () => {
                try {
                    st.reps = finite(reps.value, 0, 600, '실제 수행', { nullable: true, integer: true });
                    st.confirmed = false;
                    await commit(s);
                }
                catch (e) {
                    toast(e.message);
                }
            });
            const rir = h('select', { 'aria-label': `${si + 1}세트 RIR`, onchange: e => { st.rir = e.target.value === '' ? null : Number(e.target.value); return commit(s); } }, h('option', { value: '', selected: st.rir == null }, 'RIR 미기록'), ...[0, 1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: st.rir === n }, `RIR ${n}`)));
            return h('div', null, h('.set-row', null, h('span', null, st.warmup ? '웜업' : `본 ${entry.sets.slice(0, si + 1).filter(x => !x.warmup).length}`), weight, reps, h('button.btn-sm', { 'aria-label': `${si + 1}세트 삭제`, onclick: async () => {
                    if (!await confirmSheet({ title: '이 세트를 기록에서 지울까요?', confirmText: '삭제', danger: true }))
                        return;
                    entry.sets.splice(si, 1);
                    await commit(s);
                } }, '✕')), h('.row', null, h('small.grow', null, st.done ? (st.confirmed ? '실제 기록 확인됨' : st.confirmationSource === 'auto' ? '5초 후 자동 기록 · 확인 필요' : '실제 기록 확인 필요') : '미완료·건너뜀'), rir, h('button.btn-sm', { onclick: async () => {
                    if (st.reps == null)
                        throw new Error('실제 횟수나 시간을 먼저 입력해 주세요.');
                    st.done = true;
                    st.skipped = false;
                    st.confirmed = true;
                    st.confirmationSource = 'manual';
                    await commit(s);
                } }, '확인')));
        }), h('p.hint', null, LOAD_LABELS[isAssistanceExercise(entry) ? 'assistance' : entry.loadBasis] || ''), h('.btn-row', null, h('button.btn-sm', { onclick: () => manualSetSheet(entry, s, commit) }, '실제 세트 추가'), h('button.btn-sm.btn-danger', { onclick: async () => {
                if (await confirmSheet({ title: `${entry.name} 기록을 삭제할까요?`, confirmText: '삭제', danger: true })) {
                    s.entries.splice(ei, 1);
                    await commit(s);
                }
            } }, '종목 기록 삭제')))), h('button.btn-block.btn-danger', { onclick: async () => {
                if (await confirmSheet({ title: '이 운동 기록을 삭제할까요?', confirmText: '전체 기록 삭제', danger: true })) {
                    deleteSession(id);
                    await flush();
                    go('/history');
                }
            } }, '이 운동 기록 전체 삭제'));
    };
    draw();
}
function manualSetSheet(entry, session, commit) {
    modal(close => {
        const weight = weightInput(null, settings().unit), reps = numberInput(null, { min: 0, max: 600, label: '실제 수행' });
        const loadName = isAssistanceExercise(entry) ? '보조중량' : '실제 중량';
        weight.setAttribute('aria-label', `${loadName} (${settings().unit})`);
        return h('div', null, h('h3', null, '실제로 한 세트 추가'), field(`${loadName} (${settings().unit})`, weight, LOAD_LABELS[isAssistanceExercise(entry) ? 'assistance' : entry.loadBasis]), field(entry.measure === 'duration' ? '실제 유지(초)' : '실제 횟수', reps), h('button.btn-block.btn-primary', { onclick: async () => {
                const count = finite(reps.value, 0, 600, '실제 수행', { integer: true });
                entry.sets.push({ id: uid('set'), targetReps: Math.max(1, count), targetKnown: false, reps: count, weight: readWeightInput(weight, null, settings().unit), rir: null, done: true, confirmed: true, confirmationSource: 'manual', warmup: false, at: session.startedAt });
                await commit(session);
                close();
            } }, '실제 세트로 저장'));
    });
}
const kpi = (v, k) => h('.kpi', null, h('.v', null, v), h('.k', null, k));
