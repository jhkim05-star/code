/** 운동실행 탭 — 이번 주 계획을 일자별로 보고 그 자리에서 운동을 시작합니다 */

import { h, mount, modal, toast, field, pageHead, confirmSheet, stepper } from '../ui.js';
import { getPlan, savePlan, deletePlan, settings, sessions, sessionsOn } from '../store.js';
import { makeBlock } from '../planner.js';
import { warmupSets } from '../weights.js';
import { pickExercise } from './exercisePicker.js';
import { GROUP_NAME } from '../exercises.js';
import {
  weekStartOf, ymd, addDays, parseYmd, todayYmd, fmtWeekRange,
  DOW_KO, mmss, fmtWeight, sum,
} from '../util.js';
import { go } from '../app.js';

/** 펼쳐 둔 날짜. 처음 들어올 때 오늘 하루만 펼쳐 둡니다. */
const expanded = new Set();
let seeded = false;

export async function renderExec(root, [weekParam]) {
  const weekStart = weekParam || ymd(weekStartOf(new Date()));
  if (!seeded) { expanded.add(todayYmd()); seeded = true; }
  draw(root, weekStart);
}

function draw(root, weekStart) {
  const plan = getPlan(weekStart);
  const isThisWeek = weekStart === ymd(weekStartOf(new Date()));

  mount(root,
    pageHead(
      isThisWeek ? '이번 주' : fmtWeekRange(weekStart).split('–')[0].trim(),
      fmtWeekRange(weekStart),
      h('button.btn-sm', { onclick: () => go('/exec/' + ymd(addDays(parseYmd(weekStart), -7))) }, '‹'),
      h('button.btn-sm', { onclick: () => go('/exec/' + ymd(addDays(parseYmd(weekStart), 7))) }, '›'),
    ),

    plan ? planBody(root, weekStart, plan) : emptyWeek(weekStart),
  );
}

function emptyWeek(weekStart) {
  return h('.card', null,
    h('.eyebrow', null, '이 주는 아직 계획이 없습니다'),
    h('p', { style: { marginTop: '8px', marginBottom: '16px', fontSize: '14.5px', lineHeight: '1.6' } },
      '운동계획 탭에서 부위와 기구를 고르고 스케줄을 만들면 여기 나타납니다.'),
    h('.btn-row', null,
      h('button.btn-primary', { onclick: () => go('/plan') }, '운동계획 탭으로'),
      h('button', { onclick: () => go('/run/' + todayYmd()) }, '오늘 자유운동 시작'),
    ),
  );
}

function planBody(root, weekStart, plan) {
  const today = todayYmd();
  const workDays = plan.days.filter(d => d.blocks.length);
  const totalSets = sum(workDays, d => sum(d.blocks, b => workSets(b).length));
  const totalWarm = sum(workDays, d => sum(d.blocks, b => warmSets(b).length));

  return h('div', null,
    plan.note ? h('.card', null,
      h('.eyebrow', null, plan.source === 'ai' ? '✨ AI 코치' : '메모'),
      h('p', { style: { marginTop: '8px', marginBottom: 0, fontSize: '14.5px', lineHeight: '1.65' } }, plan.note),
    ) : null,

    h('.card.flat', {
      style: { display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--ink-3)',
               paddingLeft: 0, paddingRight: 0, paddingTop: 0 },
    },
      h('span', null, `운동 ${workDays.length}일`),
      h('span', null, `${sum(workDays, d => d.blocks.length)}종목`),
      h('span', null, `${totalSets}세트${totalWarm ? ` (+웜업 ${totalWarm})` : ''}`),
    ),

    h('.daylist', null, ...plan.days.map(d => dayCard(root, weekStart, plan, d, today))),

    h('button.btn-block.btn-ghost', {
      style: { marginTop: '14px' },
      onclick: async () => {
        if (await confirmSheet({
          title: '이번 주 계획을 지울까요?',
          body: '이미 마친 운동 기록은 남습니다.',
          confirmText: '지우기', danger: true,
        })) {
          deletePlan(weekStart);
          draw(root, weekStart);
        }
      },
    }, '이번 주 계획 지우기'),
  );
}

function dayCard(root, weekStart, plan, day, today) {
  const d = parseYmd(day.date);
  const done = sessionsOn(day.date).length > 0;
  const isToday = day.date === today;
  const isRest = !day.blocks.length;

  const body = h('div', { hidden: isRest || !expanded.has(day.date) });

  const head = h('.day-head', {
    onclick: () => {
      if (isRest) return;
      body.hidden = !body.hidden;
      if (body.hidden) expanded.delete(day.date);
      else expanded.add(day.date);
    },
  },
    h(`.day-date${d.getDay() === 0 ? '.sun' : ''}`, null,
      h('.d', null, String(d.getDate())),
      h('.w', null, DOW_KO[d.getDay()]),
    ),
    h('.day-title', null,
      h('.t', null, isRest ? '휴식' : day.title),
      isRest ? null : h('.m', null,
        `${day.blocks.length}종목 · ${sum(day.blocks, b => workSets(b).length)}세트`
        + (sum(day.blocks, b => warmSets(b).length) ? ` (+웜업 ${sum(day.blocks, b => warmSets(b).length)})` : '')
        + ` · 약 ${estimateMinutes(day)}분`),
    ),
    !isRest && (done || isToday)
      ? h(`.day-badge.${done ? 'done' : 'todo'}`, null, done ? '완료' : '오늘')
      : null,
  );

  if (isRest) {
    mount(body); // 접혀 있는 채로 두되, 휴식일에도 자유운동을 바로 시작할 수 있게
    return h('.day.rest', null, head,
      h('div', { style: { padding: '0 14px 12px' } },
        h('button.btn-sm', { onclick: () => go('/run/' + day.date) }, '＋ 이 날 자유운동')),
    );
  }

  mount(body,
    h('ul.exlist', null, ...day.blocks.map((b, i) =>
      h('li', { onclick: () => editBlock(root, weekStart, plan, day, i) },
        h('.idx', null, String(i + 1)),
        h('.nm', null, b.name,
          b.note ? h('small', null, b.note) : h('small', null, GROUP_NAME[b.group] || '')),
        h('.sr', null, setSummary(b)),
      ),
    )),
    h('div', { style: { padding: '12px 14px', display: 'flex', gap: '8px' } },
      h('button.btn-sm', { style: { flex: '0 0 auto' }, onclick: () => addBlock(root, weekStart, plan, day) }, '＋ 종목'),
      h('button.btn-sm.btn-primary', {
        style: { flex: 1 },
        onclick: () => go('/run/' + day.date),
      }, done ? '한 번 더 하기' : '운동 시작'),
    ),
  );

  return h(`.day${isToday ? '.today' : ''}`, null, head, body);
}

export const workSets = (b) => (b.sets || []).filter(s => !s.warmup);
export const warmSets = (b) => (b.sets || []).filter(s => s.warmup);

/** "10kg×12, 12kg×13" 처럼 세트별 무게·횟수를 요약합니다. 전부 같으면 "3×10" 으로 줄입니다. */
function setSummary(b) {
  const unit = settings().unit;
  const work = workSets(b);
  const warm = warmSets(b);
  const prefix = warm.length ? `웜업 ${warm.length} · ` : '';
  if (!work.length) return prefix.replace(/ · $/, '');

  const uniform = work.every(s => s.reps === work[0].reps && s.weight === work[0].weight);
  if (uniform) {
    const s0 = work[0];
    return prefix + `${work.length}×${s0.reps}`
      + (s0.weight ? ` · ${fmtWeight(s0.weight, unit)}` : '') + ` · ${mmss(b.rest)}`;
  }
  return prefix + work.map(s => `${s.weight ? fmtWeight(s.weight, unit) : '—'}×${s.reps}`).join(', ');
}

function estimateMinutes(day) {
  const avgTempo = day.tempo || 3;
  const sec = sum(day.blocks, b =>
    sum(b.sets, s => s.reps * (b.tempo || avgTempo) + (s.rest ?? b.rest)) + 60);
  return Math.round(sec / 60);
}

// ── 종목 편집 (세트마다 무게·횟수 따로) ───────────────────────
function editBlock(root, weekStart, plan, day, index) {
  const b = day.blocks[index];
  const s = settings();

  modal((close) => {
    const save = () => { savePlan(plan); close(); draw(root, weekStart); };
    const setsBox = h('div');

    /** 본 운동 무게가 바뀌면 웜업(40·60·80%)도 다시 계산합니다 */
    const resyncWarmups = () => {
      const warm = warmSets(b);
      if (!warm.length) return false;
      const first = workSets(b)[0];
      if (!first?.weight) return false;
      const next = warmupSets(first.weight, first.reps, b.equip);
      warm.forEach((st, i) => { if (next[i]) st.weight = next[i].weight; });
      return true;
    };

    const paintSets = () => {
      mount(setsBox, ...b.sets.map((st, i) => h('.switch', { style: { alignItems: 'center' } },
        h('span', {
          style: { flex: '0 0 44px', fontWeight: '700', fontSize: '13px',
                   color: st.warmup ? 'var(--warn)' : 'var(--ink-3)' },
        }, st.warmup
          ? `웜업 ${b.sets.slice(0, i).filter(x => x.warmup).length + 1}`
          : `${b.sets.slice(0, i).filter(x => !x.warmup).length + 1}세트`),
        h('div', { style: { flex: 1, display: 'flex', gap: '8px' } },
          h('input', {
            type: 'number', inputmode: 'numeric', value: st.reps, placeholder: '횟수',
            style: { flex: 1 },
            oninput: (e) => { st.reps = Number(e.target.value) || st.reps; },
          }),
          h('input', {
            type: 'number', inputmode: 'decimal', step: '0.5', value: st.weight ?? '',
            placeholder: '추천 없음', style: { flex: 1 },
            oninput: (e) => { st.weight = e.target.value === '' ? null : Number(e.target.value); },
            onchange: () => {
              if (st.weight == null) return;
              // 입력을 마쳤을 때(포커스를 벗어날 때) 뒤에 남은 본 세트에 이어서 채웁니다
              let changed = false;
              if (!st.warmup) {
                for (let j = i + 1; j < b.sets.length; j++) {
                  if (b.sets[j].warmup) continue;
                  b.sets[j].weight = st.weight;
                  changed = true;
                }
                if (resyncWarmups()) changed = true;
              }
              if (changed) paintSets();
            },
          }),
        ),
        h('button.btn-sm.btn-ghost', {
          disabled: b.sets.length <= 1,
          onclick: () => { b.sets.splice(i, 1); paintSets(); },
        }, '✕'),
      )));
    };
    paintSets();

    return h('div', null,
      h('h3', null, b.name),
      h('.hint', { style: { marginTop: '-10px', marginBottom: '16px' } }, `${GROUP_NAME[b.group] || ''} · ${b.equip || ''}`),
      b.overloadNote ? h('.hint', { style: { color: 'var(--good)', marginTop: '-10px', marginBottom: '14px' } }, `📈 ${b.overloadNote}`) : null,

      h('.lbl', { style: { fontSize: '12px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '8px' } },
        '세트별 목표 (횟수 · 무게)'),
      setsBox,
      h('button.btn-sm', {
        style: { marginTop: '4px' },
        onclick: () => {
          const last = b.sets.at(-1);
          b.sets.push({ reps: last?.reps ?? 10, weight: last?.weight ?? null });
          paintSets();
        },
      }, '＋ 세트 추가'),

      h('hr.rule'),
      field('세트 간 휴식', stepper({
        value: b.rest, min: 15, max: 300, step: 15,
        format: v => mmss(v), onchange: v => { b.rest = v; },
      })),
      field('1회에 걸리는 시간', stepper({
        value: b.tempo ?? s.tempo, min: s.tempoMin, max: s.tempoMax, step: 0.5,
        format: v => `${v.toFixed(1)}초`, onchange: v => { b.tempo = v; },
      }), '음성이 이 간격으로 횟수를 셉니다. 운동 중에도 바꿀 수 있습니다.'),

      h('hr.rule'),
      h('.btn-row', null,
        h('button', { onclick: () => { close(); swapBlock(root, weekStart, plan, day, index); } }, '🔄 종목 바꾸기'),
        h('button.btn-danger', { onclick: () => { day.blocks.splice(index, 1); save(); } }, '빼기'),
      ),
      h('.btn-row', { style: { marginTop: '8px' } },
        h('button', {
          disabled: index === 0,
          onclick: () => { const [x] = day.blocks.splice(index, 1); day.blocks.splice(index - 1, 0, x); save(); },
        }, '↑ 위로'),
        h('button', {
          disabled: index === day.blocks.length - 1,
          onclick: () => { const [x] = day.blocks.splice(index, 1); day.blocks.splice(index + 1, 0, x); save(); },
        }, '↓ 아래로'),
      ),
      h('button.btn-block.btn-primary', { style: { marginTop: '14px' }, onclick: save }, '저장'),
    );
  });
}

function swapBlock(root, weekStart, plan, day, index) {
  const cur = day.blocks[index];
  pickExercise(cur.group, (ex) => {
    // 무게는 새 종목 기준으로 다시 잡되(기록 → 기준 무게), 세트 수는 원래대로 둡니다
    const fresh = makeBlock(ex, { sessions: sessions() });
    const weight = fresh?.sets.find(s => !s.warmup)?.weight ?? null;
    day.blocks[index] = {
      ...fresh,
      rest: ex.rest, tempo: ex.tempo ?? 3,
      sets: [
        ...(fresh?.sets || []).filter(s => s.warmup),
        ...workSets(cur).map(st => ({ reps: st.reps, weight })),
      ],
    };
    savePlan(plan);
    toast(`${ex.name}(으)로 바꿨습니다`);
    draw(root, weekStart);
  });
}

function addBlock(root, weekStart, plan, day) {
  const preferred = day.blocks.at(-1)?.group || day.groupIds?.[0] || 'chest';
  pickExercise(preferred, (ex) => {
    const block = makeBlock(ex, { sessions: sessions() });
    if (!block) return;
    day.blocks.push(block);
    savePlan(plan);
    toast(`${ex.name} 추가`);
    draw(root, weekStart);
  });
}
