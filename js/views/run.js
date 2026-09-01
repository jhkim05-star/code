/** 운동 실행 화면 — 오늘의 계획을 차례로 진행합니다 */

import { h, mount, modal, toast, dial, confirmSheet, field } from '../ui.js';
import { getPlan, savePlan, saveSession, sessions, settings } from '../store.js';
import { Runner, sessionVolume, sessionSetCount } from '../runner.js';
import { unlockAudio } from '../voice.js';
import { GROUP_NAME } from '../exercises.js';
import { buildFreeDay, makeBlock } from '../planner.js';
import { pickExercise } from './exercisePicker.js';
import { weekStartOf, parseYmd, ymd, mmss, fmtWeight, comma } from '../util.js';
import { go } from '../app.js';

export async function renderRun(root, [date]) {
  const weekStart = ymd(weekStartOf(parseYmd(date)));
  const plan = getPlan(weekStart);
  let day = plan?.days.find(d => d.date === date);

  // 계획이 없는 날(휴식일 또는 계획 자체가 없음) → 자유운동으로 시작할 수 있게 합니다
  if (!day) day = buildFreeDay(date);

  // 화면을 벗어날 때 러너를 반드시 세우기 위한 고리입니다.
  // 자유운동은 종목을 고른 뒤에야 러너가 생기기 때문에, 라우터에는 이 함수를
  // 넘겨 두고 안에서 현재 러너를 갈아 끼웁니다. (예전에는 자유운동으로 만든
  // 러너가 정리되지 않아, 화면을 나가도 뒤에서 계속 돌면서 카운트를 세는
  // — 다른 화면에서 갑자기 "하나 둘 셋" 소리가 나는 — 문제가 있었습니다.)
  let stopRunner = null;
  const cleanup = () => { const stop = stopRunner; stopRunner = null; stop?.(); };

  if (!day.blocks?.length) {
    mount(root, h('.card', null,
      h('h2', null, day.free ? '자유운동' : '오늘은 쉬는 날이에요'),
      h('p.hint', { style: { marginBottom: '16px' } },
        '종목을 하나씩 추가해서 그 자리에서 운동을 만들 수 있습니다.'),
      h('button.btn-block.btn-primary', {
        onclick: () => pickExercise(null, (ex) => {
          day.blocks.push(freeBlock(ex));
          if (plan) savePlan(plan);
          cleanup();
          stopRunner = startRun(root, day, weekStart, plan);
        }),
      }, '＋ 첫 종목 고르기'),
      h('button.btn-block.btn-ghost', { style: { marginTop: '8px' }, onclick: () => go('/exec') }, '‹ 뒤로'),
    ));
    return cleanup;
  }

  stopRunner = startRun(root, day, weekStart, plan);
  return cleanup;
}

function freeBlock(ex) {
  return makeBlock(ex, { sessions: sessions() })
    || {
      exerciseId: ex.id, name: ex.name, group: ex.group, equip: ex.equip,
      rest: ex.rest, tempo: ex.tempo ?? 3,
      sets: Array.from({ length: ex.sets }, () => ({ reps: ex.reps, weight: null })),
    };
}

function startRun(root, day, weekStart, plan) {
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
  const elapsed = h('.run-elapsed', null,
    h('span', null, '전체 시간'), h('span.num', null, elapsedText(runner)));

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
    // 세트 목록과 하단 조작부 사이의 빈 공간을 채워서, 화면이 남을 때
    // 전체 시간이 눈에 잘 띄는 자리에 오게 합니다
    h('.run-mid', null, elapsed),
    // 다이얼과 버튼은 아래쪽에 몰아 둡니다 — 운동 중에 한 손으로 닿는 자리입니다
    h('.run-bottom', null, dials, actions),
  ));

  // ── 속도 · 휴식 다이얼 (언제나 실시간으로 조절 가능) ──────
  // 종목·세트가 바뀌면 기본값도 바뀌므로(웜업은 휴식이 짧습니다) 그때마다 다시 그립니다
  const paintDials = () => {
    mount(dials,
      dial({
        label: '카운트 속도', value: runner.tempo,
        min: s.tempoMin, max: s.tempoMax, step: 0.1,
        format: v => `${v.toFixed(1)}초`,
        onchange: v => runner.setTempo(v),
      }),
      dial({
        label: '휴식', value: Math.round(runner.rest),
        min: 15, max: 300, step: 5,
        format: v => mmss(v),
        onchange: v => runner.setRest(v),
      }),
    );
  };
  paintDials();

  /** 값만 갱신 — 매 100ms 호출되므로 DOM 을 다시 만들지 않습니다 */
  const sync = () => {
    bar.style.width = `${(runner.progress * 100).toFixed(1)}%`;
    elapsed.lastChild.textContent = elapsedText(runner);

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
        setLabel(runner),
        rec?.weight ? ` · ${fmtWeight(rec.weight, s.unit)}` : '',
      ),
      // 휴식 중엔 카운터 쪽에 이미 다음 세트 안내가 나오니 여기선 중복하지 않습니다
      (runner.state !== 'resting' && nextWeightLabel(runner))
        ? h('.meta.meta-next', null, nextWeightLabel(runner))
        : null,
      b.note ? h('.hint', { style: { marginTop: '6px' } }, b.note) : null,
      (runner.state === 'ready' && b.overloadNote)
        ? h('.hint', { style: { marginTop: '6px', color: 'var(--good)' } }, `📈 ${b.overloadNote}`)
        : null,
    );

    mount(pips, ...runner.entry.sets.map((st, i) =>
      h(`.setpip${st.done ? '.done' : ''}${i === runner.setIndex ? '.cur' : ''}${st.warmup ? '.warm' : ''}`, {
        onclick: () => runner.jumpTo(runner.exIndex, i),
        title: st.warmup ? '웜업 세트' : null,
      }, st.done ? (st.reps ?? '✓') : String(st.targetReps)),
    ));

    mount(actions, ...actionsFor(runner));
    // 휴식 중에 다시 그리면 사용자가 조절하던 슬라이더가 튕기므로 그때는 두고 봅니다
    if (runner.state !== 'resting') paintDials();
    sync();
  };

  const showSummary = (session) => {
    mount(root, summaryView(session));
  };

  return { sync, rebuild, showSummary };
}

/** 그 자리의 세트 이름 — "웜업 2" 또는 "3세트" (웜업은 본 세트 번호에 안 끼웁니다) */
function setNameAt(entry, index) {
  const sets = entry?.sets || [];
  const before = sets.slice(0, index);
  return sets[index]?.warmup
    ? `웜업 ${before.filter(x => x.warmup).length + 1}`
    : `${before.filter(x => !x.warmup).length + 1}세트`;
}

/** "웜업 2 / 3" 또는 "2 / 4 세트" */
function setLabel(runner) {
  const sets = runner.entry?.sets || [];
  const warm = runner.setRec?.warmup;
  const total = sets.filter(x => !!x.warmup === !!warm).length;
  const name = setNameAt(runner.entry, runner.setIndex);
  return warm ? `${name} / ${total}` : `${name.replace('세트', '')} / ${total} 세트`;
}

function elapsedText(runner) {
  const sec = Math.round(runner.elapsedSec);
  const h2 = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
  const mm = String(m).padStart(h2 ? 2 : 1, '0');
  return h2 ? `${h2}:${mm}:${String(s2).padStart(2, '0')}` : `${mm}:${String(s2).padStart(2, '0')}`;
}

function nextLabel(runner) {
  const s = settings();
  const next = runner.peekNext();
  if (!next?.rec) return '마무리';
  const name = next.exIndex === runner.exIndex
    ? setNameAt(runner.entry, next.setIndex)
    : runner.day.blocks[next.exIndex]?.name;
  const w = next.rec.weight ? ` · ${fmtWeight(next.rec.weight, s.unit)}` : '';
  return `${name}${w}`;
}

/** 지금 세트 옆에 함께 보여줄 "다음 세트 무게" — 무게가 정해져 있을 때만 표시 */
function nextWeightLabel(runner) {
  const next = runner.peekNext();
  if (!next?.rec?.weight) return '';
  const s = settings();
  const otherExercise = next.exIndex !== runner.exIndex;
  const prefix = otherExercise ? `다음(${runner.day.blocks[next.exIndex]?.name})` : '다음';
  return `${prefix} ${fmtWeight(next.rec.weight, s.unit)}`;
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
        h('button.btn-sm.btn-ghost', { onclick: () => openSwap(runner) }, '🔄 대체운동'),
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
      h('button.btn-block.btn-ghost', { onclick: () => openSetEditor(runner, { next: true }) }, '다음 세트 무게 바꾸기'),
    ];
  }

  return [];
}

/**
 * 무게와 목표 횟수를 그 자리에서 고칩니다.
 * @param {{next?: boolean}} opt  next:true 면 지금 세트가 아니라 "다음 세트"를 고칩니다
 *   (휴식 화면에서 씁니다 — 그 시점엔 runner.setRec 이 아직 방금 끝낸 세트를 가리키고 있어서,
 *   여기서 잘못 그걸 고치면 "다음 세트를 바꿨는데 이전 세트가 바뀌는" 것처럼 보입니다).
 */
function openSetEditor(runner, opt = {}) {
  const s = settings();
  const target = opt.next ? runner.peekNext() : { exIndex: runner.exIndex, setIndex: runner.setIndex, rec: runner.setRec };
  const rec = target?.rec;
  if (!rec) return;
  const exName = opt.next ? (runner.day.blocks[target.exIndex]?.name || runner.block.name) : runner.block.name;

  modal((close) => {
    const w = h('input', {
      type: 'number', inputmode: 'decimal', step: '0.5',
      value: rec.weight ?? '', placeholder: '추천 없음',
    });
    const r = h('input', { type: 'number', inputmode: 'numeric', value: rec.targetReps });
    return h('div', null,
      h('h3', null, exName),
      h('.hint', { style: { marginTop: '-10px', marginBottom: '14px' } },
        `${opt.next ? '다음 · ' : ''}${target.setIndex + 1}세트`),
      field(`무게 (${s.unit})`, w, '이 종목의 아직 하지 않은 뒤 세트들에도 그대로 이어서 적용됩니다.'),
      field('목표 횟수', r),
      h('button.btn-block.btn-primary', {
        style: { marginTop: '6px' },
        onclick: () => {
          const kg = w.value === '' ? null : Number(w.value);
          const reps = Number(r.value) || rec.targetReps;
          if (opt.next) { runner.setNextWeight(kg); runner.setNextTargetReps(reps); }
          else { runner.setWeight(kg); runner.setTargetReps(reps); }
          close();
          runner.emit('state', runner.state);
        },
      }, '적용'),
    );
  });
}

/** 오늘 종목 전체 목록 — 원하는 곳으로 바로 이동, 종목 즉흥 추가, 오늘 메모 */
function openList(runner) {
  const close = modal(() => h('div', null,
    h('h3', null, '오늘의 운동'),
    field('오늘 메모', h('textarea', {
      value: runner.session.comment || '',
      placeholder: '컨디션, 특이사항 등을 적어 두세요',
      rows: 2,
      oninput: (e) => { runner.session.comment = e.target.value; },
    })),
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
    h('button.btn-block', {
      style: { marginTop: '10px' },
      onclick: () => {
        close();
        pickExercise(null, (ex) => {
          runner.addExercise(ex);
          toast(`${ex.name} 추가`);
        });
      },
    }, '＋ 종목 추가'),
  ));
}

/** 지금 하는 운동을 다른 종목으로 바꿉니다 — 오늘만 적용되고 다음에 생성될 계획엔 영향 없음 */
function openSwap(runner) {
  pickExercise(runner.block?.group, (ex) => {
    runner.substituteExercise(ex);
    toast(`${ex.name}(으)로 대체 · 오늘만 적용됩니다`);
  }, { equipmentOnly: true });
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
    go('/exec');
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

    field('오늘 메모', h('textarea', {
      value: session.comment || '',
      placeholder: '컨디션, 특이사항 등을 적어 두세요',
      rows: 2,
      oninput: (e) => { session.comment = e.target.value; saveSession(session); },
    })),

    h('button.btn-block.btn-primary', { onclick: () => go('/exec') }, '운동실행으로'),
    h('button.btn-block.btn-ghost', { style: { marginTop: '8px' }, onclick: () => go('/history') }, '기록 보기'),
  );
}
