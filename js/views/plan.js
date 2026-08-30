/** 주간 계획 화면 — 계획을 만들고, 고치고, 운동을 시작하는 곳 */

import { h, mount, modal, toast, field, pageHead, confirmSheet, stepper } from '../ui.js';
import { getPlan, savePlan, deletePlan, sessions, settings, customExercises, sessionsOn } from '../store.js';
import { generateWeek, normalizeAiPlan } from '../planner.js';
import { generatePlanWithAi, estimateCostKrw, MODELS, AiError } from '../ai.js';
import { GROUPS, GROUP_NAME, byGroup } from '../exercises.js';
import {
  weekStartOf, ymd, addDays, parseYmd, todayYmd, fmtWeekRange,
  DOW_KO, mmss, fmtWeight, sum,
} from '../util.js';
import { go } from '../app.js';

/**
 * 펼쳐 둔 날짜. 종목을 고치면 화면을 다시 그리는데, 이게 없으면 카드가 접혀
 * 보던 자리를 잃어버립니다. 처음 들어올 때 오늘 하루만 펼쳐 둡니다.
 */
const expanded = new Set();
let seeded = false;

export async function renderPlan(root, [weekParam]) {
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
      h('button.btn-sm', { onclick: () => go('/plan/' + ymd(addDays(parseYmd(weekStart), -7))) }, '‹'),
      h('button.btn-sm', { onclick: () => go('/plan/' + ymd(addDays(parseYmd(weekStart), 7))) }, '›'),
    ),

    plan ? planBody(root, weekStart, plan) : emptyWeek(root, weekStart),
  );
}

// ── 계획이 없을 때 ────────────────────────────────────────────
function emptyWeek(root, weekStart) {
  return h('div', null,
    h('.card', null,
      h('.eyebrow', null, '아직 계획이 없습니다'),
      h('p', { style: { marginTop: '8px', marginBottom: '16px', fontSize: '14.5px', lineHeight: '1.6' } },
        '설정해 둔 루틴(가슴/등 2분할 + 일요일 하체)에 맞춰 바로 만들거나, ',
        'AI에게 이번 주 사정을 이야기하고 맞춰 달라고 할 수 있습니다.'),
      h('.btn-row', null,
        h('button.btn-primary', { onclick: () => makeRuleWeek(root, weekStart) }, '자동으로 만들기'),
        h('button', { onclick: () => openAiSheet(root, weekStart) }, '✨ AI로 만들기'),
      ),
    ),
    routinePeek(),
  );
}

function routinePeek() {
  const r = settings().routine;
  return h('.card.flat', null,
    h('.eyebrow', { style: { marginBottom: '10px' } }, '지금 설정된 루틴'),
    ...[1, 2, 3, 4, 5, 6, 0].map(d => {
      const slot = r.week[d];
      return h('div', {
        style: { display: 'flex', gap: '12px', padding: '6px 0', fontSize: '14px',
                 borderBottom: '1px solid var(--rule)' },
      },
        h('span', { style: { flex: '0 0 30px', color: d === 0 ? 'var(--accent)' : 'var(--ink-3)' } }, DOW_KO[d]),
        h('span', null, slot ? `${labelForType(slot.type)} (${slot.variant})` : '휴식'),
      );
    }),
    h('.hint', { style: { marginTop: '10px' } }, '설정 › 루틴에서 요일 배치를 바꿀 수 있습니다.'),
  );
}

const labelForType = (t) => ({ push: '가슴 · 어깨 전면 · 삼두', pull: '등 · 어깨 측후면 · 이두', legs: '하체' }[t] || t);

function makeRuleWeek(root, weekStart, reroll = 0) {
  const plan = generateWeek(weekStart, { sessions: sessions(), reroll });
  savePlan(plan);
  toast('계획을 만들었습니다');
  draw(root, weekStart);
}

// ── 계획이 있을 때 ────────────────────────────────────────────
function planBody(root, weekStart, plan) {
  const today = todayYmd();
  const workDays = plan.days.filter(d => d.type !== 'rest');
  const totalSets = sum(workDays, d => sum(d.blocks, b => b.sets));

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
      h('span', null, `${totalSets}세트`),
    ),

    h('.daylist', null, ...plan.days.map(d => dayCard(root, weekStart, plan, d, today))),

    h('.btn-row', { style: { marginTop: '18px' } },
      h('button', { onclick: () => makeRuleWeek(root, weekStart, Date.now() % 7 + 1) }, '🔀 종목 다시 뽑기'),
      h('button', { onclick: () => openAiSheet(root, weekStart) }, '✨ AI로 다시'),
    ),
    h('button.btn-block.btn-ghost', {
      style: { marginTop: '8px' },
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
    }, '계획 지우기'),
  );
}

function dayCard(root, weekStart, plan, day, today) {
  const d = parseYmd(day.date);
  const done = sessionsOn(day.date).length > 0;
  const isToday = day.date === today;
  const isRest = day.type === 'rest';

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
        `${day.blocks.length}종목 · ${sum(day.blocks, b => b.sets)}세트 · 약 ${estimateMinutes(day)}분`),
    ),
    !isRest && (done || isToday)
      ? h(`.day-badge.${done ? 'done' : 'todo'}`, null, done ? '완료' : '오늘')
      : null,
  );

  if (!isRest) {
    mount(body,
      h('ul.exlist', null, ...day.blocks.map((b, i) =>
        h('li', { onclick: () => editBlock(root, weekStart, plan, day, i) },
          h('.idx', null, String(i + 1)),
          h('.nm', null, b.name,
            b.note ? h('small', null, b.note) : h('small', null, GROUP_NAME[b.group] || '')),
          h('.sr', null,
            `${b.sets}×${b.reps}`,
            b.weight ? ` · ${fmtWeight(b.weight, settings().unit)}` : '',
            ` · ${mmss(b.rest)}`),
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
  }

  return h(`.day${isRest ? '.rest' : ''}${isToday ? '.today' : ''}`, null, head, body);
}

function estimateMinutes(day) {
  // 세트 수행시간(횟수×템포) + 세트 간 휴식 + 종목 전환 1분
  const sec = sum(day.blocks, b => b.sets * (b.reps * (b.tempo || 3) + b.rest) + 60);
  return Math.round(sec / 60);
}

// ── 종목 편집 ────────────────────────────────────────────────
function editBlock(root, weekStart, plan, day, index) {
  const b = day.blocks[index];
  const s = settings();

  modal((close) => {
    const save = () => { savePlan(plan); close(); draw(root, weekStart); };

    return h('div', null,
      h('h3', null, b.name),
      h('.hint', { style: { marginTop: '-10px', marginBottom: '16px' } }, GROUP_NAME[b.group] || ''),

      field('세트', stepper({
        value: b.sets, min: 1, max: 10,
        format: v => `${v}세트`, onchange: v => { b.sets = v; },
      })),
      field('횟수', stepper({
        value: b.reps, min: 1, max: 50,
        format: v => `${v}회`, onchange: v => { b.reps = v; },
      })),
      field('세트 간 휴식', stepper({
        value: b.rest, min: 15, max: 300, step: 15,
        format: v => mmss(v), onchange: v => { b.rest = v; },
      })),
      field('1회에 걸리는 시간', stepper({
        value: b.tempo ?? s.tempo, min: s.tempoMin, max: s.tempoMax, step: 0.5,
        format: v => `${v.toFixed(1)}초`, onchange: v => { b.tempo = v; },
      }), '음성이 이 간격으로 횟수를 셉니다. 운동 중에도 바꿀 수 있습니다.'),
      field(`무게 (${s.unit})`, h('input', {
        type: 'number', inputmode: 'decimal', step: '0.5',
        value: b.weight ?? '',
        placeholder: '지난 기록에서 자동으로 채워집니다',
        oninput: (e) => { b.weight = e.target.value === '' ? null : Number(e.target.value); },
      })),

      h('hr.rule'),
      h('.btn-row', null,
        h('button', { onclick: () => { close(); swapBlock(root, weekStart, plan, day, index); } }, '🔄 종목 바꾸기'),
        h('button.btn-danger', {
          onclick: () => { day.blocks.splice(index, 1); save(); },
        }, '빼기'),
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
    day.blocks[index] = {
      exerciseId: ex.id, name: ex.name, group: ex.group,
      sets: cur.sets, reps: ex.reps, rest: ex.rest, tempo: ex.tempo ?? 3,
      weight: null,
    };
    savePlan(plan);
    toast(`${ex.name}(으)로 바꿨습니다`);
    draw(root, weekStart);
  });
}

function addBlock(root, weekStart, plan, day) {
  const preferred = day.blocks.at(-1)?.group || 'chest';
  pickExercise(preferred, (ex) => {
    day.blocks.push({
      exerciseId: ex.id, name: ex.name, group: ex.group,
      sets: ex.sets, reps: ex.reps, rest: ex.rest, tempo: ex.tempo ?? 3, weight: null,
    });
    savePlan(plan);
    toast(`${ex.name} 추가`);
    draw(root, weekStart);
  });
}

/** 부위 탭이 달린 종목 선택 시트 */
export function pickExercise(initialGroup, onPick) {
  modal((close) => {
    let group = initialGroup;
    const list = h('ul.picker');
    const chips = h('.chips');

    const paint = () => {
      mount(chips, ...GROUPS.map(g =>
        h('button.chip', {
          type: 'button',
          'aria-pressed': String(g.id === group),
          onclick: () => { group = g.id; paint(); },
        }, g.name),
      ));
      mount(list, ...byGroup(group, customExercises()).map(ex =>
        h('li', { onclick: () => { close(); onPick(ex); } },
          h('span', null, ex.name),
          h('small', null, `${ex.equip || ''} · ${ex.sets}×${ex.reps}`),
        ),
      ));
    };
    paint();

    return h('div', null,
      h('h3', null, '운동 고르기'),
      chips,
      h('div', { style: { marginTop: '14px' } }, list),
    );
  });
}

// ── AI 계획 생성 ─────────────────────────────────────────────
function openAiSheet(root, weekStart) {
  const s = settings();

  modal((close) => {
    if (!s.apiKey?.trim()) {
      return h('div', null,
        h('h3', null, 'AI 계획을 쓰려면 키가 필요합니다'),
        h('p', { style: { fontSize: '14px', lineHeight: '1.65', color: 'var(--ink-2)' } },
          'console.anthropic.com 에서 API 키를 만들어 설정에 넣어 주세요. ',
          '키는 이 기기에만 저장되고, 계획을 만들 때만 Anthropic 서버로 갑니다.'),
        h('button.btn-block.btn-primary', {
          style: { marginTop: '14px' },
          onclick: () => { close(); go('/settings'); },
        }, '설정으로 가기'),
      );
    }

    const model = MODELS.find(m => m.id === s.aiModel) || MODELS[0];
    const ta = h('textarea', {
      placeholder: '예) 이번 주는 어깨가 좀 아파서 프레스 계열은 빼 주세요.\n예) 목요일에 약속이 있어서 그날은 쉬고 금요일로 옮겨 주세요.\n예) 벤치 무게가 3주째 안 올라가요.',
    });
    const status = h('.hint', { style: { marginTop: '10px', minHeight: '18px' } });
    const btn = h('button.btn-block.btn-primary', { style: { marginTop: '4px' } }, '계획 만들기');

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      mount(status, h('span.spin'), ' 계획을 짜는 중입니다. 30초쯤 걸립니다…');
      const t0 = Date.now();
      try {
        const { plan: raw, usage, model: usedModel } =
          await generatePlanWithAi(weekStart, ta.value, sessions());
        const plan = normalizeAiPlan(raw, weekStart, sessions());
        savePlan(plan);
        close();
        toast(`계획 완성 · ${Math.round((Date.now() - t0) / 1000)}초 · 약 ${estimateCostKrw(usage, usedModel)}원`, 3400);
        draw(root, weekStart);
      } catch (err) {
        btn.disabled = false;
        const msg = err instanceof AiError ? err.message : '알 수 없는 오류가 발생했습니다.';
        mount(status, h('span', { style: { color: 'var(--accent)' } }, msg));
      }
    });

    return h('div', null,
      h('h3', null, '✨ AI에게 맡기기'),
      h('.hint', { style: { marginTop: '-10px', marginBottom: '14px' } },
        `${model.name} · ${fmtWeekRange(weekStart)} · 고정 루틴(2분할 + 일요일 하체)과 최근 기록을 함께 보냅니다.`),
      field('이번 주에 반영할 점 (없으면 비워 두세요)', ta),
      btn,
      status,
    );
  });
}
