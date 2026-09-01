/** 운동 기록 — 지난 세션 목록과 상세 */

import { h, mount, pageHead, empty, modal, confirmSheet, toast, field } from '../ui.js';
import { sessions, getSession, saveSession, deleteSession, settings } from '../store.js';
import { sessionVolume, sessionSetCount } from '../runner.js';
import { recommendWeight } from '../planner.js';
import { pickExercise } from './exercisePicker.js';
import { fmtDate, fmtDateShort, comma, parseYmd, ymd, todayYmd, DOW_KO, groupBy, uid } from '../util.js';
import { go } from '../app.js';

const now = new Date();
let calYear = now.getFullYear();
let calMonth = now.getMonth();   // 0-based

export async function renderHistory(root) {
  const all = [...sessions()].reverse();   // 최신이 위로

  if (!all.length) {
    mount(root,
      pageHead('기록', '아직 비어 있습니다'),
      empty('첫 운동을 마치면 여기에 쌓입니다.'),
      h('button.btn-block.btn-primary', { onclick: () => addManualRecord() }, '＋ 지난 운동 기록 추가'),
    );
    return;
  }

  draw(root, all);
}

function draw(root, all) {
  const byMonth = groupBy(all, s => s.date.slice(0, 7));

  mount(root,
    pageHead('기록', `${all.length}회`,
      h('button.btn-sm', { onclick: () => addManualRecord() }, '＋ 기록 추가')),
    calendarCard(root, all),
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

// ── 달력 ─────────────────────────────────────────────────────
function calendarCard(root, all) {
  const byDate = groupBy(all, s => s.date);
  const today = todayYmd();

  const first = new Date(calYear, calMonth, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const grid = h('.cal-grid', null,
    ...DOW_KO.map((w, i) => h('.cal-dow', { style: i === 0 ? { color: 'var(--accent)' } : null }, w)),
    ...cells.map((d) => {
      if (!d) return h('.cal-cell.blank');   // 1일 앞의 빈 칸 (자리만 차지)
      const date = ymd(new Date(calYear, calMonth, d));
      const list = byDate.get(date) || [];
      const isToday = date === today;
      const isSun = new Date(calYear, calMonth, d).getDay() === 0;
      return h(`.cal-cell${list.length ? '.has' : ''}${isToday ? '.today' : ''}`, {
        onclick: () => {
          if (!list.length) return;
          if (list.length === 1) go('/session/' + list[0].id);
          else openDayPicker(date, list);
        },
      },
        h('span', { style: isSun ? { color: 'var(--accent)' } : null }, String(d)),
        list.length ? h('i.cal-dot') : null,
      );
    }),
  );

  return h('.card', null,
    h('.card-head', null,
      h('button.btn-sm', { onclick: () => { shiftMonth(-1); draw(root, all); } }, '‹'),
      h('h3', null, `${calYear}년 ${calMonth + 1}월`),
      h('button.btn-sm', { onclick: () => { shiftMonth(1); draw(root, all); } }, '›'),
    ),
    grid,
  );
}

function shiftMonth(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear -= 1; }
  if (calMonth > 11) { calMonth = 0; calYear += 1; }
}

/**
 * 앱으로 실행하지 않은 운동도 기록으로 남길 수 있게 합니다 — 헬스장에서 종이에
 * 적었거나 나중에 생각난 지난 운동, 또는 계획/실행 없이 쉬는 날 갑자기 한
 * 운동도 날짜만 골라서 그대로 넣을 수 있습니다. 저장 후엔 세트별 무게·횟수를
 * 바로 다듬을 수 있도록 기록 상세(후편집) 화면으로 넘어갑니다.
 */
function addManualRecord() {
  const chosen = [];   // { ex, sets, reps }
  const dateInput = h('input', { type: 'date', value: todayYmd() });
  const titleInput = h('input', { type: 'text', placeholder: '예: 가슴 · 삼두 (안 적으면 종목명으로)' });
  const list = h('div');

  const paintList = () => {
    mount(list, chosen.length
      ? chosen.map((c, i) => h('.switch', { style: { alignItems: 'center' } },
          h('div', null,
            h('.lbl', null, c.ex.name),
            h('.sub', null, `${c.sets}세트 × ${c.reps}회`)),
          h('button.btn-sm.btn-ghost', { onclick: () => { chosen.splice(i, 1); paintList(); } }, '✕'),
        ))
      : h('.hint', null, '아직 추가한 종목이 없습니다.'));
  };
  paintList();

  modal((close) => h('div', null,
    h('h3', null, '지난 운동 기록 추가'),
    h('.hint', { style: { marginTop: '-10px', marginBottom: '14px' } },
      '앱으로 실행하지 않은 운동도 날짜를 골라 그대로 기록해 둘 수 있습니다. 계획이 없던 날도 상관없습니다.'),
    field('날짜', dateInput),
    field('제목 (선택)', titleInput),
    h('.lbl', { style: { fontSize: '12px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: '6px', marginBottom: '8px' } }, '종목'),
    list,
    h('button.btn-sm', {
      style: { marginTop: '8px' },
      onclick: () => pickExercise(null, (ex) => {
        chosen.push({ ex, sets: ex.sets || 3, reps: ex.reps || 10 });
        paintList();
      }),
    }, '＋ 종목 추가'),
    h('button.btn-block.btn-primary', {
      style: { marginTop: '16px' },
      onclick: () => {
        if (!dateInput.value) return toast('날짜를 골라 주세요');
        if (!chosen.length) return toast('종목을 하나 이상 추가해 주세요');

        const date = dateInput.value;
        const startedAt = new Date(`${date}T12:00:00`).getTime();
        const session = {
          id: uid('ses'),
          date,
          title: titleInput.value.trim() || chosen.map(c => c.ex.name).slice(0, 2).join(' · '),
          startedAt,
          endedAt: startedAt + 60000,
          comment: '',
          entries: chosen.map((c) => {
            const suggestion = recommendWeight(c.ex, { sessions: sessions() });
            return {
              exerciseId: c.ex.id, name: c.ex.name, group: c.ex.group, note: '',
              sets: Array.from({ length: c.sets }, () => ({
                targetReps: c.reps, reps: c.reps, weight: suggestion?.weight ?? null,
                done: true, at: startedAt, tempo: c.ex.tempo ?? 3,
              })),
            };
          }),
        };
        saveSession(session);
        close();
        toast('기록을 추가했습니다. 세트별 무게·횟수를 다듬어 보세요');
        go('/session/' + session.id);
      },
    }, '기록 만들기'),
  ));
}

function openDayPicker(date, list) {
  modal(() => h('div', null,
    h('h3', null, fmtDate(date)),
    h('ul.picker', null, ...list.map(s => h('li', { onclick: () => go('/session/' + s.id) },
      h('span', null, s.title || '운동'),
      h('small', null, `${sessionSetCount(s)}세트`),
    ))),
  ));
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
  drawSession(root, s);
}

/** 기록 후편집 — 무게·횟수를 잘못 눌렀거나 깜빡한 세트를 지난 기록에서 바로 고칩니다 */
function drawSession(root, s) {
  const unit = settings().unit;
  const mins = Math.round(((s.endedAt || s.startedAt) - s.startedAt) / 60000);
  const redraw = () => drawSession(root, s);
  const persist = () => { saveSession(s); redraw(); };

  mount(root,
    pageHead(s.title || '운동', fmtDate(s.date),
      h('button.btn-sm', { onclick: () => history.back() }, '‹ 뒤로')),

    h('.kpis', null,
      h('.kpi', null, h('.v', null, String(mins)), h('.k', null, '분')),
      h('.kpi', null, h('.v', null, String(sessionSetCount(s))), h('.k', null, '세트')),
      h('.kpi', null, h('.v', null, comma(sessionVolume(s))), h('.k', null, `볼륨 ${unit}`)),
    ),

    h('.card', null,
      h('.eyebrow', null, '메모'),
      h('textarea', {
        style: { marginTop: '8px' },
        value: s.comment || '',
        placeholder: '컨디션, 특이사항 등을 적어 두세요',
        rows: 2,
        onchange: (e) => { s.comment = e.target.value; saveSession(s); },
      }),
    ),

    ...s.entries.map((e, ei) => {
      const done = e.sets.filter(x => x.done);
      if (!done.length) return null;
      return h('.card', null,
        h('.card-head', null,
          h('h3', null, e.name),
          h('.num', { style: { fontSize: '12px', color: 'var(--ink-3)' } },
            `${comma(done.reduce((a, x) => a + (x.weight || 0) * (x.reps || 0), 0))}${unit}`),
        ),
        ...done.map((x) => {
          const i = e.sets.indexOf(x);   // e.sets 안 실제 자리 — 지울 때 여기를 씁니다
          return h('.switch', { style: { alignItems: 'center', padding: '6px 0' } },
            h('span.num', { style: { flex: '0 0 24px', color: 'var(--ink-3)', fontSize: '12px' } },
              `${done.indexOf(x) + 1}`),
            h('div', { style: { flex: 1, display: 'flex', gap: '8px' } },
              h('input', {
                type: 'number', inputmode: 'decimal', step: '0.5', value: x.weight ?? '',
                placeholder: '무게', style: { flex: 1 },
                onchange: (ev) => { x.weight = ev.target.value === '' ? null : Number(ev.target.value); persist(); },
              }),
              h('input', {
                type: 'number', inputmode: 'numeric', value: x.reps ?? '',
                placeholder: '횟수', style: { flex: 1 },
                onchange: (ev) => { x.reps = ev.target.value === '' ? null : Number(ev.target.value); persist(); },
              }),
            ),
            h('button.btn-sm.btn-ghost', {
              onclick: () => { e.sets.splice(i, 1); persist(); },
            }, '✕'),
          );
        }),
        h('.btn-row', { style: { marginTop: '8px' } },
          h('button.btn-sm', {
            onclick: () => {
              const last = done.at(-1);
              e.sets.push({
                weight: last?.weight ?? null, reps: last?.reps ?? 8,
                targetReps: last?.targetReps ?? last?.reps ?? 8,
                done: true, at: Date.now(), tempo: last?.tempo,
              });
              persist();
            },
          }, '＋ 세트 추가'),
          h('button.btn-sm.btn-danger', {
            onclick: async () => {
              if (await confirmSheet({ title: `${e.name} 기록을 지울까요?`, confirmText: '지우기', danger: true })) {
                s.entries.splice(ei, 1);
                persist();
              }
            },
          }, '이 종목 기록 삭제'),
        ),
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
    }, '이 기록 전체 지우기'),
  );
}
