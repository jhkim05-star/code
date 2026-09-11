import { h, mount, modal } from '../ui.js';
import { MACHINE_CATALOG, MACHINE_GROUPS } from '../exercises.js';

/** A dismissible draft picker. Only Apply exposes the new selection. */
export function pickMachines(currentIds, onApply) {
    const selected = new Set(currentIds || []);
    return modal(close => {
        const list = h('div.machine-list');
        const search = h('input', { type: 'search', placeholder: '머신 이름 검색', 'aria-label': '머신 검색', oninput: paint });
        const count = h('p.hint', { 'aria-live': 'polite' });
        function paint() {
            const query = search.value.trim().toLocaleLowerCase('ko');
            count.textContent = `${selected.size}개 선택`;
            mount(list, ...MACHINE_GROUPS.map(group => {
                const items = MACHINE_CATALOG.filter(x => x.group === group && (!query || x.name.toLocaleLowerCase('ko').includes(query)));
                if (!items.length)
                    return null;
                return h('section.machine-group', null, h('h4', null, group), h('.machine-options', null, ...items.map(machine => h('button.machine-option', {
                    'aria-pressed': selected.has(machine.id),
                    onclick: () => { selected.has(machine.id) ? selected.delete(machine.id) : selected.add(machine.id); paint(); },
                }, h('span', { 'aria-hidden': 'true' }, selected.has(machine.id) ? '✓' : '+'), machine.name))));
            }));
        }
        paint();
        return h('div', null, h('h3', null, '헬스장 머신 선택'), h('p.hint', null, '실제로 사용할 수 있는 머신만 골라 주세요. 케이블 선택만으로 랫풀다운·로우 머신을 허용하지 않습니다.'), search, count, list,
            h('.btn-row', null, h('button', { onclick: close }, '취소'), h('button.btn-primary', { onclick: () => { onApply([...selected]); close(); } }, '선택 적용')));
    });
}

export function machineNames(ids) {
    const names = new Map(MACHINE_CATALOG.map(x => [x.id, x.name]));
    return (ids || []).map(id => names.get(id)).filter(Boolean);
}
