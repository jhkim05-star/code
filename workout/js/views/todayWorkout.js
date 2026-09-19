/** A small, explicit one-day builder. It never changes long-term settings. */
import { h, mount, pageHead, modal, field, stepper, switchRow, weightInput, numberInput, confirmSheet, toast } from '../ui.js';
import { getPlan, savePlan, settings, sessions, flush } from '../store.js';
import { makeBlock } from '../planner.js';
import { buildTodayWeekPlan, workSetsOf, warmupSetsOf } from '../today-plan.js';
import { pickExercise } from './exercisePicker.js';
import { GROUP_NAME, LOAD_LABELS, isAssistanceExercise } from '../exercises.js';
import { weekStartOf, parseYmd, ymd, todayYmd, uid, fmtWeight, mmss, finite, readWeightInput } from '../util.js';
import { go } from '../app.js';

export function renderTodayWorkout(root) {
    const date = todayYmd(), weekStart = ymd(weekStartOf(parseYmd(date))), stored = getPlan(weekStart);
    const storedDay = stored?.days.find(day => day.date === date);
    const blocks = structuredClone(storedDay?.blocks || []);
    const list = h('div.today-workout-list'), summary = h('p.today-workout-summary', { 'aria-live': 'polite' });
    function paint() {
        const workSets = blocks.reduce((total, block) => total + workSetsOf(block).length, 0);
        summary.textContent = `${blocks.length}종목 · 본세트 ${workSets}세트${blocks.some(block => warmupSetsOf(block).length) ? ' · 웜업 포함' : ''}`;
        mount(list, blocks.length ? blocks.map((block, index) => {
            const work = workSetsOf(block), warmups = warmupSetsOf(block), first = work[0];
            return h('.card.today-exercise-card', null,
                h('.card-head', null, h('div', null, h('h3', null, block.name), h('p.hint', null, `${GROUP_NAME[block.group] || block.group} · 휴식 ${mmss(block.rest)}`)), h('button.btn-sm.btn-danger', { 'aria-label': `${block.name} 삭제`, onclick: () => { blocks.splice(index, 1); paint(); } }, '삭제')),
                h('p.today-exercise-main', null, `${fmtWeight(first?.weight, settings().unit)} × ${first?.reps || '—'}${block.measure === 'duration' ? '초' : '회'} · 본세트 ${work.length}`),
                warmups.length ? h('p.hint', null, `본세트 무게 기준 자동 웜업 ${warmups.length}세트`) : h('p.hint', null, '웜업 없음'),
                h('button.btn-block', { onclick: () => editExercise(block, next => { blocks[index] = next; paint(); }) }, '무게·세트 수정'));
        }) : h('.card.empty', null, '오늘 할 종목을 하나씩 추가해 주세요.'));
    }
    async function saveAndStart() {
        if (!blocks.length)
            throw new Error('운동을 하나 이상 골라 주세요.');
        const changedExisting = storedDay?.blocks?.length && JSON.stringify(storedDay.blocks) !== JSON.stringify(blocks);
        if (changedExisting && !await confirmSheet({ title: '오늘 저장된 계획을 바꿀까요?', body: '과거 운동 기록과 진행 중 운동은 바꾸지 않고 오늘 계획만 교체합니다.', confirmText: '오늘 계획 교체' }))
            return;
        savePlan(buildTodayWeekPlan(stored, date, blocks));
        await flush();
        toast('오늘 운동을 저장했어요.');
        go('/run/' + date);
    }
    mount(root,
        pageHead('오늘의 운동 만들기', '종목·본세트 무게·세트 수만 빠르게 정해요', h('button.btn-sm', { onclick: () => go('/plan') }, '돌아가기')),
        h('.card.today-builder-intro', null, h('h3', null, '오늘만 하는 운동'), h('p.hint', null, '장기 프로그램 설정은 바꾸지 않습니다. 휴식은 종목에 맞춰 자동 적용되고, 웜업은 선택한 본세트 무게를 기준으로 계산됩니다.')),
        summary, list,
        h('button.btn-block.btn-lg', { onclick: () => pickExercise(null, exercise => {
            if (blocks.some(block => block.exerciseId === exercise.id))
                return toast('이미 오늘 운동에 넣은 종목이에요. 해당 카드에서 수정해 주세요.');
            editExercise(exercise, block => { blocks.push(block); paint(); });
        }, { equipmentOnly: false, includeAvoided: true, manual: true }) }, '＋ 운동 선택'),
        h('button.btn-block.btn-primary.btn-lg', { style: { marginTop: '10px' }, onclick: saveAndStart }, '저장하고 운동 시작'));
    paint();
}

function editExercise(source, onSave) {
    const isBlock = !!source.exerciseId, exercise = isBlock ? source : source;
    const existingWork = isBlock ? workSetsOf(source) : [];
    const originalWeight = existingWork[0]?.weight ?? null;
    const preview = isBlock ? source : makeBlock(exercise, { sessions: sessions(), sets: 4, warmup: false });
    const suggestedWeight = originalWeight ?? workSetsOf(preview)[0]?.weight ?? null;
    return modal(close => {
        let setCount = existingWork.length || 4, includeWarmup = isBlock ? warmupSetsOf(source).length > 0 : false;
        const weight = weightInput(suggestedWeight, settings().unit);
        const reps = numberInput(existingWork[0]?.reps ?? exercise.reps ?? 10, { min: 1, max: 600, label: exercise.measure === 'duration' ? '본세트 시간' : '본세트 횟수' });
        const warmupSwitch = switchRow('웜업 자동 만들기', '본세트 무게를 기준으로 준비 세트를 계산해요.', includeWarmup, value => { includeWarmup = value; });
        if (exercise.warmupEligible === false) {
            warmupSwitch.querySelector('button')?.setAttribute('disabled', '');
            warmupSwitch.querySelector('.hint').textContent = '이 종목은 별도 자동 웜업을 만들지 않아요.';
            includeWarmup = false;
        }
        const rest = source.rest ?? exercise.rest ?? settings().restDefault;
        return h('div', null,
            h('h3', null, source.name),
            h('p.hint', null, `${GROUP_NAME[source.group] || source.group} · 세트당 휴식 ${mmss(rest)} 자동 적용`),
            field(`${isAssistanceExercise(source) ? '보조중량' : '본세트 무게'} (${settings().unit})`, weight, LOAD_LABELS[isAssistanceExercise(source) ? 'assistance' : source.loadBasis] || '맨몸 운동은 비워둘 수 있어요.'),
            field(source.measure === 'duration' ? '본세트 시간' : '본세트 횟수', reps),
            field('본세트 수', stepper({ value: setCount, min: 1, max: 20, step: 1, label: '본세트', format: value => `${value}세트`, onchange: value => { setCount = value; } }), '기본 4세트이며 −/+로 조절합니다.'),
            warmupSwitch,
            h('button.btn-block.btn-primary', { onclick: () => {
                const workingWeight = readWeightInput(weight, suggestedWeight, settings().unit);
                const target = finite(reps.value, 1, 600, '본세트 목표', { integer: true });
                const block = makeBlock(source.exerciseId || source.id, { sessions: sessions(), sets: setCount, reps: target, weight: workingWeight, warmup: includeWarmup, rest });
                if (!block)
                    throw new Error('운동 정보를 찾지 못했어요.');
                block.id = isBlock ? source.id : uid('block');
                onSave(block);
                close();
            } }, isBlock ? '수정 적용' : '오늘 운동에 추가'));
    });
}
