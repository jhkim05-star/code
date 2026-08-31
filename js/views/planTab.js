/** 운동계획 탭 — 부위·기구를 고르고 한 주 스케줄을 만듭니다 */

import { h, mount, pageHead, field, toast, modal, confirmSheet } from '../ui.js';
import {
  settings, setSetting, sessions, savePlan, avoidExerciseIds, toggleAvoid,
} from '../store.js';
import { generateWeek, normalizeAiPlan, PRESETS } from '../planner.js';
import { generatePlanWithAi, estimateCostKrw, MODELS, AiError } from '../ai.js';
import { GROUPS, GROUP_NAME, EQUIPMENT, findExercise } from '../exercises.js';
import { pickExercise } from './exercisePicker.js';
import { weekStartOf, ymd, DOW_KO, fmtWeekRange } from '../util.js';
import { go } from '../app.js';

export async function renderPlanTab(root) {
  draw(root);
}

function draw(root) {
  const s = settings();

  mount(root,
    pageHead('운동계획', '부위와 기구를 고르면 스케줄을 만들어 드립니다'),
    presetsCard(root),
    weekCard(root, s),
    equipmentCard(root, s),
    avoidCard(root),
    generateCard(root),
  );
}

// ── 빠른 시작 ────────────────────────────────────────────────
function presetsCard(root) {
  return h('.card', null,
    h('.card-head', null, h('h3', null, '빠른 시작')),
    h('.hint', { style: { marginTop: '-6px', marginBottom: '12px' } },
      '자주 쓰는 배치를 그대로 넣어 둡니다. 넣은 뒤 아래에서 요일별로 자유롭게 고쳐도 됩니다.'),
    h('.btn-row', { style: { flexWrap: 'wrap' } },
      ...PRESETS.map(p => h('button.btn-sm', {
        onclick: () => { setSetting('plan.week', structuredClone(p.week)); draw(root); toast(`"${p.label}" 적용`); },
      }, p.label)),
    ),
  );
}

// ── 요일별 부위 ──────────────────────────────────────────────
function weekCard(root, s) {
  return h('.card', null,
    h('.card-head', null, h('h3', null, '요일별 부위')),
    h('.hint', { style: { marginTop: '-6px', marginBottom: '14px' } },
      '그날 할 부위를 눌러서 고르세요. 아무것도 안 고르면 휴식일이 됩니다.'),

    ...[1, 2, 3, 4, 5, 6, 0].map(dow => dayRow(root, s, dow)),

    h('hr.rule'),
    field('같은 부위가 겹치는 날 종목을 몇 벌로 돌릴지', h('select', {
      onchange: (e) => setSetting('plan.variantsPerGroup', Number(e.target.value)),
    },
      ...[1, 2, 3].map(n => h('option', { value: n, selected: s.plan.variantsPerGroup === n },
        n === 1 ? '항상 같은 종목' : `${n}벌 (A${n > 1 ? '·B' : ''}${n > 2 ? '·C' : ''})`)),
    ), '가슴 날이 주 2회면 2벌로 돌려 두 날의 종목이 겹치지 않게 합니다.'),
  );
}

function dayRow(root, s, dow) {
  const selected = new Set(s.plan.week[dow] || []);
  const chips = h('.chips', { style: { marginTop: '6px' } });

  const paint = () => {
    mount(chips, ...GROUPS.map(g =>
      h('button.chip', {
        type: 'button',
        'aria-pressed': String(selected.has(g.id)),
        onclick: () => {
          if (selected.has(g.id)) selected.delete(g.id); else selected.add(g.id);
          setSetting(`plan.week.${dow}`, [...selected]);
          paint();
        },
      }, g.short),
    ));
  };
  paint();

  return h('div', { style: { padding: '10px 0', borderBottom: '1px solid var(--rule)' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      h('span', {
        style: { fontWeight: '700', fontSize: '14px', color: dow === 0 ? 'var(--accent)' : 'var(--ink)' },
      }, `${DOW_KO[dow]}요일`),
      selected.size === 0 ? h('span.hint', null, '휴식') : null,
    ),
    chips,
  );
}

// ── 기구 ─────────────────────────────────────────────────────
function equipmentCard(root, s) {
  const selected = new Set(s.plan.equipment || []);
  const chips = h('.chips');

  const paint = () => {
    mount(chips, ...EQUIPMENT.map(eq =>
      h('button.chip', {
        type: 'button',
        'aria-pressed': String(selected.has(eq)),
        onclick: () => {
          if (selected.has(eq)) selected.delete(eq); else selected.add(eq);
          setSetting('plan.equipment', [...selected]);
          paint();
        },
      }, eq),
    ));
  };
  paint();

  return h('.card', null,
    h('.card-head', null, h('h3', null, '가진 기구')),
    h('.hint', { style: { marginTop: '-6px', marginBottom: '12px' } },
      '아무것도 안 고르면 전부 허용됩니다. 고른 기구로 할 수 있는 종목만 계획에 들어갑니다.'),
    chips,
  );
}

// ── 비추천 종목 ──────────────────────────────────────────────
function avoidCard(root) {
  const ids = avoidExerciseIds();

  return h('.card', null,
    h('.card-head', null,
      h('h3', null, '비추천 종목'),
      h('button.btn-sm', {
        onclick: () => pickExercise(null, (ex) => {
          toggleAvoid(ex.id);
          draw(root);
        }, { includeAvoided: false }),
      }, '＋ 추가'),
    ),
    h('.hint', { style: { marginTop: '-6px', marginBottom: '12px' } },
      '부상이나 취향으로 피하고 싶은 종목을 표시해 두면, 계획을 만들 때(자동·AI 모두) 후보에서 빠집니다.'),
    ids.length
      ? h('div', null, ...ids.map(id => {
          const ex = findExercise(id);
          if (!ex) return null;
          return h('div', {
            style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0',
                     borderBottom: '1px solid var(--rule)', fontSize: '14px' },
          },
            h('span', { style: { flex: 1 } }, ex.name),
            h('small', { style: { color: 'var(--ink-3)' } }, GROUP_NAME[ex.group] || ''),
            h('button.btn-sm.btn-ghost', { onclick: () => { toggleAvoid(id); draw(root); } }, '취소'),
          );
        }))
      : h('.hint', null, '아직 표시한 종목이 없습니다.'),
  );
}

// ── 생성 ─────────────────────────────────────────────────────
function generateCard(root) {
  const weekStart = ymd(weekStartOf(new Date()));

  return h('.card', null,
    h('.card-head', null, h('h3', null, '이번 주 스케줄 만들기')),
    h('.hint', { style: { marginTop: '-6px', marginBottom: '14px' } },
      `${fmtWeekRange(weekStart)} · 위 설정대로 만듭니다. 이미 계획이 있으면 새로 덮어씁니다.`),
    h('.btn-row', null,
      h('button.btn-primary', { onclick: () => generateRuleWeek(root, weekStart) }, '운동계획 생성'),
      h('button', { onclick: () => openAiSheet(root, weekStart) }, '✨ AI로 만들기'),
    ),
  );
}

function generateRuleWeek(root, weekStart) {
  const hasAny = Object.values(settings().plan.week).some(g => (g || []).length);
  if (!hasAny) return toast('요일별 부위를 하나 이상 골라 주세요');

  const plan = generateWeek(weekStart, { sessions: sessions() });
  savePlan(plan);
  toast('스케줄을 만들었습니다');
  go('/exec');
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
        go('/exec');
      } catch (err) {
        btn.disabled = false;
        const msg = err instanceof AiError ? err.message : '알 수 없는 오류가 발생했습니다.';
        mount(status, h('span', { style: { color: 'var(--accent)' } }, msg));
      }
    });

    return h('div', null,
      h('h3', null, '✨ AI에게 맡기기'),
      h('.hint', { style: { marginTop: '-10px', marginBottom: '14px' } },
        `${model.name} · ${fmtWeekRange(weekStart)} · 위에서 고른 요일별 부위·기구와 최근 기록을 함께 보냅니다.`),
      field('이번 주에 반영할 점 (없으면 비워 두세요)', ta),
      btn,
      status,
    );
  });
}
