/** 운동 실행 화면 — 오늘의 계획을 차례로 진행합니다 */

import { h, mount, modal, dial, confirmSheet, field } from '../ui.js';
import { getPlan, saveSession, settings } from '../store.js';
import { Runner, sessionVolume, sessionSetCount } from '../runner.js';
import { unlockAudio } from '../voice.js';
import { GROUP_NAME } from '../exercises.js';
import { weekStartOf, parseYmd, ymd, mmss, fmtWeight, comma } from '../util.js';
import { go } from '../app.js';

export async function renderRun(root, [date]) {
  const weekStart = ymd(weekStartOf(parseYmd(date)));
  const plan = getPlan(weekStart);
  const day = plan?.days.find(d => d.date === date);

  if (!day || !day.blocks?.length) {
    mount(root, h('.card', null,
      h('h2', null, '그날의 계획이 없습니다'),
      h('button.btn-block.btn-primary', { style: { marginTop: '14px' }, onclick: () => go('/plan') }, '계획으로 돌아가기'),
    ));
    return null;
  }

  // iOS 는 사용자가 화면을 누른 뒤에야 소리를 낼 수 있습니다
  unlockAudio();

  const runner = new Runner(day, { weekStart });
  runner.start();

  const ui = buildUi(root, runner);
  const offTick = runner.on('tick', ui.sync);
  const offState = runner.on('state', ui.rebuild);
  const offDone = runner.on('done', (session) => {
    saveSession(session);
    ui.showSummary(session);
  });

  ui.rebuild();

  return () => { offTick(); offState(); offDone(); runner.stop(); };
}

function buildUi(root, runner) {
  const s = settings();

  const bar = h('i');
  const big = h('.big');
  const of = h('.of');
  const counter = h('.counter', null, big, of);
  const exBox = h('.run-ex');
  const pips = h('.setgrid');
  const actions = h('.run-actions');
  const dials = h('div');

  const top = h('.run-top', null,
    h('button.btn-sm.btn-ghost', { onclick: () => quit(runner) }, '‹ 그만'),
    h('div', { style: { textAlign: 'center', flex: 1, minWidth: 0 } },
      h('.eyebrow', null, runner.day.title)),
    h('button.btn-sm.btn-ghost', { onclick: () => openList(runner) }, '목록'),
  );

  mount(root, h('.run', null,
    top,
    h('.run-progress', null, bar),
    exBox,
    counter,
    pips,
    // 다이얼과 버튼은 아래쪽에 몰아 둡니다 — 운동 중에 한 손으로 닿는 자리입니다
    h('.run-bottom', null, dials, actions),
  ));

  // ── 속도 · 휴식 다이얼 (언제나 실시간으로 조절 가능) ──────
  mount(dials,
    dial({
      label: '카운트 속도', value: runner.tempo,
      min: s.tempoMin, max: s.tempoMax, step: 0.1,
      format: v => `${v.toFixed(1)}초`,
      onchange: v => runner.setTempo(v),
    }),
    dial({
      label: '휴식', value: runner.rest,
      min: 15, max: 300, step: 5,
      format: v => mmss(v),
      onchange: v => runner.setRest(v),
    }),
  );

  /** 값만 갱신 — 매 100ms 호출되므로 DOM 을 다시 만들지 않습니다 */
  const sync = () => {
    bar.style.width = `${(runner.progress * 100).toFixed(1)}%`;

    if (runner.state === 'resting') {
      counter.className = 'counter resting';
      big.textContent = mmss(runner.restLeft);
      of.textContent = `다음: ${nextLabel(runner)}`;
    } else if (runner.state === 'countdown') {
      counter.className = 'counter ready';
      big.textContent = String(Math.ceil(runner.countdownLeft));
      of.textContent = '준비';
    } else if (runner.state === 'counting') {
      counter.className = 'counter';
      big.textContent = String(runner.rep);
      of.textContent = `/ ${runner.targetReps}회`;
    } else if (runner.state === 'done') {
      counter.className = 'counter';
    } else {
      counter.className = 'counter ready';
      big.textContent = String(runner.targetReps);
      of.textContent = '회 준비';
    }
  };

  runner.on('rep', () => {
    big.classList.add('pulse');
    setTimeout(() => big.classList.remove('pulse'), 110);
  });

  /** 상태가 바뀔 때만 버튼과 헤더를 다시 그립니다 */
  const rebuild = () => {
    const b = runner.block;
    const rec = runner.setRec;
    if (!b) return;

    mount(exBox,
      h('.grp', null, GROUP_NAME[b.group] || ''),
      h('h2', null, b.name),
      h('.meta', null,
        `${runner.setIndex + 1} / ${runner.entry.sets.length} 세트`,
        rec?.weight ? ` · ${fmtWeight(rec.weight, s.unit)}` : '',
      ),
      b.note ? h('.hint', { style: { marginTop: '6px' } }, b.note) : null,
    );

    mount(pips, ...runner.entry.sets.map((st, i) =>
      h(`.setpip${st.done ? '.done' : ''}${i === runner.setIndex ? '.cur' : ''}`, {
        onclick: () => runner.jumpTo(runner.exIndex, i),
      }, st.done ? (st.reps ?? '✓') : String(st.targetReps)),
    ));

    mount(actions, ...actionsFor(runner));
    sync();
  };

  const showSummary = (session) => {
    mount(root, summaryView(session));
  };

  return { sync, rebuild, showSummary };
}

function nextLabel(runner) {
  if (runner.setIndex + 1 < runner.entry.sets.length) return `${runner.setIndex + 2}세트`;
  const nb = runner.day.blocks[runner.exIndex + 1];
  return nb ? nb.name : '마무리';
}

function actionsFor(runner) {
  if (runner.state === 'ready') {
    return [
      h('button.btn-block.btn-primary.btn-lg', { onclick: () => runner.beginSet() }, '세트 시작'),
      h('.btn-row', null,
        h('button.btn-sm', { onclick: () => openSetEditor(runner) }, '무게 · 횟수'),
        h('button.btn-sm', { onclick: () => runner.beginRest() }, '먼저 쉬기'),
        h('button.btn-sm', { onclick: () => runner.skipSet() }, '건너뛰기'),
      ),
      h('.btn-row', null,
        h('button.btn-sm.btn-ghost', { onclick: () => runner.goBack() }, '‹ 앞 세트'),
        h('button.btn-sm.btn-ghost', { onclick: () => runner.skipExercise() }, '다음 운동 ›'),
      ),
    ];
  }

  if (runner.state === 'countdown' || runner.state === 'counting') {
    return [
      h('button.btn-block.btn-primary.btn-lg', {
        onclick: () => runner.finishSet(),
      }, runner.state === 'counting' ? `여기까지 (${runner.rep}회)` : '바로 시작'),
      h('button.btn-block.btn-ghost', {
        onclick: () => { runner.state = 'ready'; runner.rep = 0; runner.emit('state', 'ready'); },
      }, '취소'),
    ];
  }

  if (runner.state === 'setdone') {
    return [
      h('button.btn-block.btn-primary.btn-lg', { onclick: () => runner.beginRest() }, '휴식 시작'),
      h('button.btn-block', { onclick: () => runner.advance() }, '바로 다음 세트'),
    ];
  }

  if (runner.state === 'resting') {
    return [
      h('.btn-row', null,
        h('button', { onclick: () => runner.adjustRest(-15) }, '− 15초'),
        h('button', { onclick: () => runner.adjustRest(15) }, '＋ 15초'),
      ),
      h('button.btn-block.btn-primary.btn-lg', { onclick: () => runner.skipRest() }, '건너뛰고 시작'),
      h('button.btn-block.btn-ghost', { onclick: () => openSetEditor(runner) }, '다음 세트 무게 바꾸기'),
    ];
  }

  return [];
}

/** 무게와 목표 횟수를 그 자리에서 고칩니다 */
function openSetEditor(runner) {
  const s = settings();
  const rec = runner.setRec;
  if (!rec) return;

  modal((close) => {
    const w = h('input', {
      type: 'number', inputmode: 'decimal', step: '0.5',
      value: rec.weight ?? '', placeholder: '0',
    });
    const r = h('input', { type: 'number', inputmode: 'numeric', value: rec.targetReps });
    return h('div', null,
      h('h3', null, runner.block.name),
      h('.hint', { style: { marginTop: '-10px', marginBottom: '14px' } },
        `${runner.setIndex + 1}세트`),
      field(`무게 (${s.unit})`, w, '이 세트부터 남은 세트에 함께 적용됩니다.'),
      field('목표 횟수', r),
      h('button.btn-block.btn-primary', {
        style: { marginTop: '6px' },
        onclick: () => {
          runner.setWeight(w.value === '' ? null : Number(w.value));
          runner.setTargetReps(Number(r.value) || rec.targetReps);
          close();
          runner.emit('state', runner.state);
        },
      }, '적용'),
    );
  });
}

/** 오늘 종목 전체 목록 — 원하는 곳으로 바로 이동 */
function openList(runner) {
  modal((close) => h('div', null,
    h('h3', null, '오늘의 운동'),
    h('ul.picker', null, ...runner.day.blocks.map((b, i) => {
      const entry = runner.session.entries[i];
      const done = entry.sets.filter(x => x.done).length;
      return h('li', {
        style: i === runner.exIndex ? { color: 'var(--accent)', fontWeight: '700' } : null,
        onclick: () => { close(); runner.jumpTo(i, 0); },
      },
        h('span', null, `${i + 1}. ${b.name}`),
        h('small', null, `${done} / ${entry.sets.length}세트`),
      );
    })),
  ));
}

async function quit(runner) {
  const anyDone = sessionSetCount(runner.session) > 0;
  const ok = await confirmSheet({
    title: '운동을 그만둘까요?',
    body: anyDone ? '여기까지 한 세트는 기록에 남습니다.' : '아직 완료한 세트가 없어 기록은 남지 않습니다.',
    confirmText: '그만하기',
    danger: true,
  });
  if (!ok) return;
  if (anyDone) {
    runner.abort();
  } else {
    runner.stop();
    go('/plan');
  }
}

// ── 마무리 요약 ──────────────────────────────────────────────
function summaryView(session) {
  const s = settings();
  const mins = Math.round(((session.endedAt || Date.now()) - session.startedAt) / 60000);
  const vol = sessionVolume(session);
  const sets = sessionSetCount(session);

  return h('div', null,
    h('.page-head', null, h('div', null,
      h('h1', null, '수고하셨습니다'),
      h('.sub', null, session.title))),

    h('.kpis', null,
      h('.kpi', null, h('.v', null, String(mins)), h('.k', null, '분')),
      h('.kpi', null, h('.v', null, String(sets)), h('.k', null, '세트')),
      h('.kpi', null, h('.v', null, comma(vol)), h('.k', null, `총 볼륨 ${s.unit}`)),
    ),

    h('.card', null,
      ...session.entries.filter(e => e.sets.some(x => x.done)).map(e =>
        h('div', { style: { padding: '9px 0', borderBottom: '1px solid var(--rule)' } },
          h('div', { style: { fontWeight: '600', fontSize: '15px' } }, e.name),
          h('.num', { style: { fontSize: '13px', color: 'var(--ink-3)', marginTop: '3px' } },
            e.sets.filter(x => x.done)
              .map(x => `${x.weight ? fmtWeight(x.weight, s.unit) + '×' : ''}${x.reps}`)
              .join('  ·  ')),
        ),
      ),
    ),

    h('button.btn-block.btn-primary', { onclick: () => go('/plan') }, '계획으로'),
    h('button.btn-block.btn-ghost', { style: { marginTop: '8px' }, onclick: () => go('/history') }, '기록 보기'),
  );
}
