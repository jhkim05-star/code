/** Plans are edited as drafts. Dismissing a sheet never mutates the stored plan. */
import { h, mount, modal, toast, field, pageHead, confirmSheet, stepper, weightInput } from '../ui.js';
import { getPlan, savePlan, deletePlan, settings, sessions, flush, draft } from '../store.js';
import { makeBlock, analyzePlan, estimateDayMinutes } from '../planner.js';
import { warmupSets } from '../weights.js';
import { pickExercise } from './exercisePicker.js';
import { openDayEditor } from './dayEditor.js';
import { GROUP_NAME, LOAD_LABELS, isAssistanceExercise } from '../exercises.js';
import { weekStartOf, ymd, addDays, parseYmd, todayYmd, fmtWeekRange, DOW_KO, mmss, fmtWeight, finite, readWeightInput, uid } from '../util.js';
import { go } from '../app.js';
const expanded = new Set();
export const workSets = b => (b.sets || []).filter(s => !s.warmup);
export const warmSets = b => (b.sets || []).filter(s => s.warmup);
export function renderExec(root, [param]) { const weekStart = ymd(weekStartOf(parseYmd(param || todayYmd()))); expanded.add(todayYmd()); draw(root, weekStart); }
function draw(root, weekStart) {
    const plan = getPlan(weekStart), pending = draft();
    mount(root, pageHead('운동실행', fmtWeekRange(weekStart), h('button.btn-sm', { 'aria-label': '지난주', onclick: () => go('/exec/' + ymd(addDays(parseYmd(weekStart), -7))) }, '‹'), h('button.btn-sm', { 'aria-label': '다음주', onclick: () => go('/exec/' + ymd(addDays(parseYmd(weekStart), 7))) }, '›')), pending ? h('.card', null, h('h3', null, '진행 중인 운동'), h('p.hint', null, pending.session.title), h('button.btn-block.btn-primary', { onclick: () => go('/run/' + (pending.session.plannedDate || pending.session.date)) }, '이어하기·기록 복구')) : null, plan ? planBody(root, weekStart, plan) : h('.card', null, h('h3', null, '이 주의 계획이 없어요'), h('p.hint', null, '운동계획에서 주간 계획을 만들거나 오늘 자유운동을 시작해 주세요.'), h('.stack', null, h('button.btn-primary', { onclick: () => go('/plan') }, '운동계획으로'), h('button', { onclick: () => go('/run/' + todayYmd()) }, '오늘 자유운동'))));
}
function planBody(root, key, plan) {
    const report = analyzePlan(plan);
    return h('div', null, plan.note ? h('.card', null, h('p.hint', null, plan.note)) : null, report.warnings.length ? h('details', null, h('summary', null, `계획 점검 · 확인 사항 ${report.warnings.length}개`), ...report.warnings.map(w => h('p.hint.warning', null, w))) : null, ...plan.days.map(day => dayCard(root, key, plan, day)), h('button.btn-block.btn-ghost', { onclick: async () => {
            if (await confirmSheet({ title: '이 주의 계획을 지울까요?', body: '완료한 실제 운동 기록은 유지됩니다.', confirmText: '계획 삭제', danger: true })) {
                deletePlan(key);
                await flush();
                draw(root, key);
            }
        } }, '이 주의 계획 삭제'));
}
function dayCard(root, key, plan, day) {
    const d = parseYmd(day.date), isToday = day.date === todayYmd();
    const related = sessions().filter(s => s.dayId === day.id), done = related.some(s => s.status === 'completed'), partial = related.some(s => s.status !== 'completed' && s.entries.some(e => e.sets.some(st => st.done)));
    const body = h('div', { hidden: !expanded.has(day.date) });
    const badge = done ? '실행 완료' : partial ? '일부 진행' : isToday ? '오늘' : '';
    const header = h('button.day-head', { 'aria-expanded': !body.hidden, onclick: e => { body.hidden = !body.hidden; e.currentTarget.setAttribute('aria-expanded', String(!body.hidden)); body.hidden ? expanded.delete(day.date) : expanded.add(day.date); } }, h('.day-date', null, h('.d', null, d.getDate()), h('.w', null, DOW_KO[d.getDay()])), h('.day-title', null, h('.t', null, day.blocks.length ? day.title : '휴식'), day.blocks.length ? h('.m', null, `${day.blocks.length}종목 · ${day.blocks.reduce((n, b) => n + workSets(b).length, 0)}본세트 · 약 ${estimateDayMinutes(day)}분`) : h('.m', null, '필요하면 종목을 추가할 수 있어요.')), badge ? h('.day-badge', { class: done ? 'done' : '' }, badge) : null);
    mount(body, h('ul.exlist', null, ...day.blocks.map((b, i) => h('li', null, h('button', { onclick: () => editBlock(root, key, plan, day, i) }, h('.idx', null, i + 1), h('.nm', null, b.name, h('small', null, GROUP_NAME[b.group]), h('.sr', null, setSummary(b))))))), h('.day-actions', null, h('button.btn-block', { onclick: () => editWholeDay(root, key, plan, day, isToday) }, isToday ? '오늘 계획 편집' : '이 날 계획 편집'), h('.btn-row', { style: { marginTop: '8px' } }, h('button.btn-sm', { onclick: () => addBlock(root, key, plan, day) }, '빠르게 종목 추가'), h('button.btn-sm.btn-primary', { onclick: () => go('/run/' + day.date) }, day.blocks.length ? (isToday ? '운동 시작' : '이 계획으로 오늘 운동') : '자유운동 시작'))));
    if (!day.blocks.length)
        body.hidden = false;
    return h('.day', { class: (isToday ? 'today ' : '') + (!day.blocks.length ? 'rest' : '') }, header, body);
}
function editWholeDay(root, key, plan, day, isToday) {
    const baseline = JSON.stringify(plan), active = draft()?.session?.plannedDate === day.date;
    openDayEditor(day, { title: isToday ? '오늘 계획 편집' : '이 날 계획 편집', activeSession: active, onSave: async edited => {
        if (JSON.stringify(getPlan(key)) !== baseline)
            throw new Error('편집 중 저장된 계획이 바뀌었어요. 최신 계획을 다시 열어 주세요.');
        const copy = structuredClone(plan), index = copy.days.findIndex(item => item.id === day.id || item.date === day.date);
        if (index < 0)
            throw new Error('편집할 날짜를 찾지 못했어요.');
        copy.days[index] = edited;
        copy.analysis = analyzePlan(copy);
        savePlan(copy);
        await flush();
        expanded.add(day.date);
        draw(root, key);
        toast(active ? '저장된 날짜 계획만 바꿨어요. 진행 중 운동은 그대로입니다.' : '이 날짜 계획을 저장했어요.', 5000);
    } });
}
function setSummary(b) {
    const work = workSets(b), warm = warmSets(b), unit = settings().unit;
    const rows = work.map(s => `${fmtWeight(s.weight, unit)} × ${s.reps}${b.measure === 'duration' ? '초' : '회'}`);
    const same = rows.every(x => x === rows[0]);
    const basis = isAssistanceExercise(b) ? '보조중량' : LOAD_LABELS[b.loadBasis] || '';
    return `${warm.length ? '웜업 ' + warm.length + ' + ' : ''}${work.length}본세트 · ${same ? rows[0] || '' : rows.join(' / ')}${basis ? ` · ${basis}` : ''} · 휴식 ${mmss(b.rest)}`;
}
function planEditor(key, plan, day) {
    const baseline = JSON.stringify(plan), copy = structuredClone(plan), draftDay = copy.days.find(d => d.id === day.id);
    const commit = async () => {
        if (JSON.stringify(getPlan(key)) !== baseline)
            throw new Error('편집 중 계획이 바뀌었어요. 다시 열어 주세요.');
        draftDay.groupIds = [...new Set(draftDay.blocks.map(b => b.group))];
        draftDay.title = draftDay.groupIds.length ? draftDay.groupIds.map(g => GROUP_NAME[g]).join(' · ') : '휴식';
        const minutes = estimateDayMinutes(draftDay);
        if (minutes > settings().plan.sessionMinutes && !await confirmSheet({ title: `예상 ${minutes}분으로 시간 예산을 넘어요`, body: '세트나 종목을 줄이거나 이 분량으로 저장할 수 있어요.', confirmText: '초과를 확인하고 저장' }))
            return false;
        if (JSON.stringify(getPlan(key)) !== baseline)
            throw new Error('확인 중 기존 계획이 변경됐어요. 다시 열어 주세요.');
        copy.analysis = analyzePlan(copy);
        savePlan(copy);
        await flush();
        return true;
    };
    return { copy, draftDay, commit };
}
function editBlock(root, key, plan, day, index) {
    const { draftDay, commit } = planEditor(key, plan, day), b = draftDay.blocks[index], s = settings();
    modal(close => {
        const box = h('div');
        const paint = () => mount(box, ...b.sets.map((st, i) => {
            const weight = weightInput(st.weight, s.unit), original = st.weight;
            weight.setAttribute('aria-label', `${isAssistanceExercise(b) ? '보조중량' : '무게'} (${s.unit}) · ${i + 1}세트`);
            weight.addEventListener('change', () => {
                try {
                    st.weight = readWeightInput(weight, original, s.unit);
                }
                catch (e) {
                    toast(e.message);
                }
            });
            const reps = h('input', { type: 'number', min: 1, max: 600, value: st.reps, 'aria-label': `${i + 1}세트 목표`, onchange: e => { st.reps = finite(e.target.value, 1, 600, '목표', { integer: true }); } });
            return h('.set-row', null, h('span', null, st.warmup ? '웜업' : `본 ${b.sets.slice(0, i + 1).filter(x => !x.warmup).length}`), weight, reps, h('button.btn-sm', { 'aria-label': `${i + 1}세트 삭제`, disabled: b.sets.length <= 1, onclick: () => { b.sets.splice(i, 1); paint(); } }, '✕'));
        }));
        paint();
        async function save() {
            if (await commit()) {
                close();
                draw(root, key);
                toast('계획을 저장했어요.');
            }
        }
        return h('div', null, h('h3', null, b.name), h('p.hint', null, LOAD_LABELS[isAssistanceExercise(b) ? 'assistance' : b.loadBasis] || '목표 무게·횟수예요. 닫거나 취소하면 원래 계획은 바뀌지 않습니다.'), h('.set-row', null, h('span', null, '구분'), h('span', null, `${isAssistanceExercise(b) ? '보조중량' : '무게'}(${s.unit})`), h('span', null, b.measure === 'duration' ? '초' : '회'), h('span')), box, h('.stack', null, h('button', { onclick: () => {
                if (b.sets.length >= 50)
                    throw new Error('세트는 최대 50개예요.');
                const last = workSets(b).at(-1);
                b.sets.push({ id: uid('set'), reps: last?.reps ?? 10, weight: last?.weight ?? null, warmup: false });
                paint();
            } }, '본세트 추가'), h('button', { onclick: () => {
                const first = workSets(b)[0];
                if (!first)
                    return;
                workSets(b).slice(1).forEach(st => { st.weight = first.weight; st.reps = first.reps; });
                paint();
            } }, '첫 본세트 값으로 이후 본세트 맞추기'), h('button', { onclick: () => {
                const first = workSets(b)[0];
                if (!first)
                    throw new Error('본세트가 필요해요.');
                b.sets = [...warmupSets(first.weight, first.reps, b.equip, { plan: s.plan, warmupRest: s.warmupRest }), ...workSets(b)];
                paint();
            } }, '본세트 기준으로 웜업 다시 계산')), h('hr.rule'), field('본세트 사이 휴식', stepper({ value: b.rest, min: 0, max: 900, step: 15, format: mmss, onchange: v => { b.rest = v; } })), b.measure !== 'duration' ? field('1회 카운트 간격', stepper({ value: b.tempo, min: s.tempoMin, max: s.tempoMax, step: .1, format: v => v.toFixed(1) + '초', onchange: v => { b.tempo = v; } })) : null, h('.btn-row', null, h('button', { onclick: () => pickExercise(b.group, ex => { const fresh = makeBlock(ex, { sessions: sessions(), sets: Math.max(1, workSets(b).length) }); draftDay.blocks[index] = fresh; save(); }) }, '종목 바꾸기'), h('button.btn-danger', { onclick: () => { draftDay.blocks.splice(index, 1); save(); } }, '종목 빼기')), h('.btn-row', null, h('button', { disabled: index === 0, onclick: () => { [draftDay.blocks[index - 1], draftDay.blocks[index]] = [draftDay.blocks[index], draftDay.blocks[index - 1]]; save(); } }, '위로 이동'), h('button', { disabled: index === draftDay.blocks.length - 1, onclick: () => { [draftDay.blocks[index + 1], draftDay.blocks[index]] = [draftDay.blocks[index], draftDay.blocks[index + 1]]; save(); } }, '아래로 이동')), h('button.btn-block.btn-primary', { style: { marginTop: '14px' }, onclick: save }, '변경 저장'));
    });
}
function addBlock(root, key, plan, day) {
    const edit = planEditor(key, plan, day);
    pickExercise(day.groupIds?.[0], async (ex) => {
        const block = makeBlock(ex, { sessions: sessions() });
        if (!block)
            return;
        edit.draftDay.blocks.push(block);
        if (await edit.commit()) {
            expanded.add(day.date);
            draw(root, key);
            toast('종목을 추가했어요.');
        }
    });
}
