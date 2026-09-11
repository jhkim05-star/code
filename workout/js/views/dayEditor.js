import { h, mount, modal, toast } from '../ui.js';
import { settings, sessions } from '../store.js';
import { makeBlock, estimateDayMinutes } from '../planner.js';
import { GROUP_NAME } from '../exercises.js';
import { pickExercise } from './exercisePicker.js';

export function normalizeEditedDay(rawDay) {
    const day = structuredClone(rawDay);
    day.groupIds = [...new Set(day.blocks.map(block => block.group))];
    day.title = day.groupIds.length ? day.groupIds.map(id => GROUP_NAME[id] || id).join(' · ') : '휴식';
    return day;
}

export function dayEditSummary(day) {
    const normalized = normalizeEditedDay(day);
    return {
        exercises: normalized.blocks.length,
        workSets: normalized.blocks.reduce((sum, block) => sum + block.sets.filter(set => !set.warmup).length, 0),
        minutes: estimateDayMinutes(normalized),
        groups: normalized.groupIds.map(id => GROUP_NAME[id] || id),
    };
}

export function moveDayBlock(day, index, delta) {
    const target = index + delta;
    if (!Number.isInteger(index) || ![-1, 1].includes(delta) || index < 0 || target < 0 || index >= day.blocks.length || target >= day.blocks.length)
        return false;
    [day.blocks[target], day.blocks[index]] = [day.blocks[index], day.blocks[target]];
    return true;
}

export function removeDayBlock(day, index) {
    if (!Number.isInteger(index) || index < 0 || index >= day.blocks.length)
        return false;
    day.blocks.splice(index, 1);
    return true;
}

export function appendDayBlock(day, block) {
    if (!block || day.blocks.some(item => item.exerciseId === block.exerciseId))
        return false;
    day.blocks.push(block);
    return true;
}

/** Changes remain inside a draft until the one batch Save action succeeds. */
export function openDayEditor(sourceDay, { title = '이 날 계획 편집', onSave, activeSession = false } = {}) {
    const draftDay = structuredClone(sourceDay);
    return modal(close => {
        const summary = h('p.day-edit-summary', { 'aria-live': 'polite' });
        const list = h('div.day-edit-list');
        const save = h('button.btn-block.btn-primary.btn-lg', null, '변경 저장');
        function paint() {
            const report = dayEditSummary(draftDay);
            summary.textContent = `${report.exercises}종목 · ${report.workSets}본세트 · 약 ${report.minutes}분 · ${report.groups.join(', ') || '부위 없음'}`;
            mount(list, draftDay.blocks.length ? draftDay.blocks.map((block, index) => h('.day-edit-row', null,
                h('.day-edit-index', null, String(index + 1)), h('.grow', null, h('strong', null, block.name), h('small', null, `${GROUP_NAME[block.group] || block.group} · ${block.sets.filter(set => !set.warmup).length}본세트`)),
                h('.day-edit-actions', null,
                    h('button.btn-sm', { disabled: index === 0, 'aria-label': `${block.name} 위로`, onclick: () => { moveDayBlock(draftDay, index, -1); paint(); } }, '↑'),
                    h('button.btn-sm', { disabled: index === draftDay.blocks.length - 1, 'aria-label': `${block.name} 아래로`, onclick: () => { moveDayBlock(draftDay, index, 1); paint(); } }, '↓'),
                    h('button.btn-sm.btn-danger', { 'aria-label': `${block.name} 삭제`, onclick: () => { removeDayBlock(draftDay, index); paint(); } }, '삭제')))) : h('.empty', null, '이 날은 비어 있어요. 종목을 추가해 나중에 운동할 수 있습니다.'));
        }
        save.addEventListener('click', async () => {
            if (save.disabled)
                return;
            save.disabled = true;
            try {
                const normalized = normalizeEditedDay(draftDay);
                const minutes = estimateDayMinutes(normalized);
                if (minutes > settings().plan.sessionMinutes)
                    toast(`예상 ${minutes}분 · 설정한 ${settings().plan.sessionMinutes}분을 초과합니다. 저장 후 계획 점검에도 표시돼요.`, 6000);
                await onSave(normalized);
                close();
            }
            catch (error) {
                toast(error.message || '계획을 저장하지 못했어요.', 6000);
            }
            finally {
                save.disabled = false;
            }
        });
        paint();
        return h('div', null, h('h3', null, title), h('p.hint', null, '종목 순서와 구성을 한 번에 바꿉니다. 취소·바깥 영역·Escape로 닫으면 저장되지 않습니다.'),
            activeSession ? h('p.hint.warning', null, '현재 진행 중인 운동은 바꾸지 않고, 저장된 이 날짜 계획만 수정합니다.') : null,
            summary, list, h('button.btn-block', { onclick: () => pickExercise(draftDay.groupIds?.[0], exercise => {
                if (draftDay.blocks.some(block => block.exerciseId === exercise.id))
                    return toast('이 날 계획에 이미 있는 종목이에요.');
                const block = makeBlock(exercise, { sessions: sessions() });
                if (appendDayBlock(draftDay, block))
                    paint();
            }, { manual: true }) }, '＋ 종목 추가'), save, h('button.btn-block.btn-ghost', { onclick: close }, '취소'));
    });
}
