/** 운동 기록 — 지난 세션 목록과 상세 */

import { h, mount, pageHead, empty, confirmSheet, toast } from '../ui.js';
import { sessions, getSession, deleteSession, settings } from '../store.js';
import { sessionVolume, sessionSetCount } from '../runner.js';
import { fmtDate, fmtDateShort, fmtWeight, comma, parseYmd, DOW_KO, groupBy } from '../util.js';
import { go } from '../app.js';

export async function renderHistory(root) {
  const all = [...sessions()].reverse();   // 최신이 위로

  if (!all.length) {
    mount(root,
      pageHead('기록', '아직 비어 있습니다'),
      empty('첫 운동을 마치면 여기에 쌓입니다.'),
    );
    return;
  }

  const byMonth = groupBy(all, s => s.date.slice(0, 7));

  mount(root,
    pageHead('기록', `${all.length}회`),
    ...[...byMonth.entries()].map(([month, list]) => {
      const [y, m] = month.split('-');
      return h('.card', null,
        h('.card-head', null,
          h('.eyebrow', null, `${y}년 ${Number(m)}월`),
          h('.num', { style: { fontSize: '12px', color: 'var(--ink-3)' } },
            `${list.length}회 · ${comma(list.reduce((a, s) => a + sessionVolume(s), 0))}${settings().unit}`),
        ),
        ...list.map(s => sessionRow(s)),
      );
    }),
  );
}

function sessionRow(s) {
  const d = parseYmd(s.date);
  const mins = Math.round(((s.endedAt || s.startedAt) - s.startedAt) / 60000);
  const vol = sessionVolume(s);
  const names = s.entries.filter(e => e.sets.some(x => x.done)).map(e => e.name);

  return h('.hrow', { onclick: () => go('/session/' + s.id) },
    h('.hd', null, `${d.getMonth() + 1}/${d.getDate()}`, h('div', { style: { fontSize: '10px' } }, DOW_KO[d.getDay()])),
    h('.hb', null,
      h('.ht', null, s.title || '운동'),
      h('.hm', null,
        `${sessionSetCount(s)}세트`,
        mins ? ` · ${mins}분` : '',
        vol ? ` · ${comma(vol)}${settings().unit}` : '',
      ),
      names.length ? h('.hm', { style: { marginTop: '3px' } }, names.slice(0, 4).join(', ') + (names.length > 4 ? ` 외 ${names.length - 4}` : '')) : null,
    ),
  );
}

export async function renderSessionDetail(root, [id]) {
  const s = getSession(id);
  if (!s) {
    mount(root, pageHead('기록', ''), empty('그 기록을 찾을 수 없습니다.'));
    return;
  }

  const unit = settings().unit;
  const mins = Math.round(((s.endedAt || s.startedAt) - s.startedAt) / 60000);

  mount(root,
    pageHead(s.title || '운동', fmtDate(s.date),
      h('button.btn-sm', { onclick: () => history.back() }, '‹ 뒤로')),

    h('.kpis', null,
      h('.kpi', null, h('.v', null, String(mins)), h('.k', null, '분')),
      h('.kpi', null, h('.v', null, String(sessionSetCount(s))), h('.k', null, '세트')),
      h('.kpi', null, h('.v', null, comma(sessionVolume(s))), h('.k', null, `볼륨 ${unit}`)),
    ),

    ...s.entries.map(e => {
      const done = e.sets.filter(x => x.done);
      if (!done.length) return null;
      return h('.card', null,
        h('.card-head', null,
          h('h3', null, e.name),
          h('.num', { style: { fontSize: '12px', color: 'var(--ink-3)' } },
            `${comma(done.reduce((a, x) => a + (x.weight || 0) * (x.reps || 0), 0))}${unit}`),
        ),
        ...done.map((x, i) => h('div', {
          style: { display: 'flex', gap: '12px', padding: '7px 0', fontSize: '14px',
                   borderBottom: i < done.length - 1 ? '1px solid var(--rule)' : 'none' },
        },
          h('span.num', { style: { flex: '0 0 28px', color: 'var(--ink-3)', fontSize: '12px' } }, `${i + 1}`),
          h('span.num', { style: { flex: 1 } }, `${fmtWeight(x.weight, unit)} × ${x.reps}회`),
          h('span.num', { style: { flex: '0 0 auto', color: 'var(--ink-3)', fontSize: '12px' } },
            `${x.tempo ? x.tempo.toFixed(1) + '초/회' : ''}`),
        )),
      );
    }),

    h('button.btn-block.btn-danger', {
      style: { marginTop: '10px' },
      onclick: async () => {
        if (await confirmSheet({ title: '이 기록을 지울까요?', confirmText: '지우기', danger: true })) {
          deleteSession(s.id);
          toast('기록을 지웠습니다');
          go('/history');
        }
      },
    }, '이 기록 지우기'),
  );
}
