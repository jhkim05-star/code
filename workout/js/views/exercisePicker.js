/** 부위 탭이 달린 종목 선택 시트 — 계획 편집과 실행 화면(자유운동/즉흥 추가)에서 함께 씁니다 */

import { h, mount, modal } from '../ui.js';
import { customExercises, avoidExerciseIds, settings } from '../store.js';
import { GROUPS, byGroup } from '../exercises.js';

/**
 * @param {string} initialGroup   처음 보여줄 부위 탭
 * @param {(ex: object) => void} onPick
 * @param {{ equipmentOnly?: boolean, includeAvoided?: boolean }} [opt]
 *   equipmentOnly: true 면 설정에 등록한 "가진 기구"로만 후보를 좁힙니다.
 *   includeAvoided: true 면 비추천으로 표시한 종목도 후보에 보여줍니다(기본은 숨김).
 */
export function pickExercise(initialGroup, onPick, opt = {}) {
  modal((close) => {
    let group = initialGroup || GROUPS[0].id;
    const list = h('ul.picker');
    const chips = h('.chips');
    const equipment = opt.equipmentOnly ? settings().plan.equipment : null;
    const avoid = opt.includeAvoided ? [] : avoidExerciseIds();

    const paint = () => {
      mount(chips, ...GROUPS.map(g =>
        h('button.chip', {
          type: 'button',
          'aria-pressed': String(g.id === group),
          onclick: () => { group = g.id; paint(); },
        }, g.name),
      ));
      const items = byGroup(group, customExercises(), equipment, avoid);
      mount(list,
        items.length ? items.map(ex =>
          h('li', { onclick: () => { close(); onPick(ex); } },
            h('span', null, ex.name),
            h('small', null, `${ex.equip || ''} · ${ex.sets}×${ex.reps}`),
          ),
        ) : h('.empty', { style: { padding: '20px 0' } }, '이 부위에 후보가 없습니다. 기구 설정을 넓혀 보세요.'),
      );
    };
    paint();

    return h('div', null,
      h('h3', null, '운동 고르기'),
      chips,
      h('div', { style: { marginTop: '14px' } }, list),
    );
  });
}
