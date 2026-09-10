import { h, mount, modal } from '../ui.js';
import { customExercises, avoidExerciseIds, settings } from '../store.js';
import { GROUPS, byGroup } from '../exercises.js';
export function pickExercise(initialGroup, onPick, opt = {}) {
    return modal(close => {
        let group = initialGroup || GROUPS[0].id;
        const chips = h('.chips'), list = h('ul.picker');
        const search = h('input', { type: 'search', placeholder: '종목 이름 검색', 'aria-label': '종목 검색', oninput: () => paint() });
        function paint() {
            mount(chips, ...GROUPS.map(g => h('button.chip', { 'aria-pressed': g.id === group, onclick: () => { group = g.id; paint(); } }, g.name)));
            const items = byGroup(group, customExercises(), opt.equipmentOnly === false ? null : settings().plan.equipment, opt.includeAvoided ? [] : avoidExerciseIds()).filter(e => e.name.includes(search.value.trim()));
            mount(list, items.length ? items.map(ex => h('li', null, h('button', { onclick: () => { close(); return onPick(ex); } }, h('span', null, ex.name), h('small', null, `${ex.equip} · ${ex.measure === 'duration' ? ex.reps + '초' : ex.reps + '회'}`)))) : h('li.empty', null, '가능한 종목이 없어요. 기구·제외 설정을 확인해 주세요.'));
        }
        paint();
        return h('div', null, h('h3', null, '운동 고르기'), search, h('div', { style: { marginTop: '12px' } }, chips), list);
    }, { onDismiss: opt.onDismiss });
}
