/** 설정 — 음성, 카운트, 휴식, 루틴, AI, 데이터 */

import {
  h, mount, pageHead, field, switchRow, stepper, toast, modal, confirmSheet,
} from '../ui.js';
import {
  settings, setSetting, exportAll, importAll, wipeAll,
  customExercises, addCustomExercise, removeCustomExercise, sessions, plans,
} from '../store.js';
import {
  speakCount, koreanVoices, listVoices, reselectVoice, unlockAudio, hasClips, cue,
  CUSTOM_VOICE_ID, customVoiceName,
} from '../voice.js';
import { MODELS, testApiKey } from '../ai.js';
import { GROUPS } from '../exercises.js';
import { DOW_KO, mmss, download, pickFile, uid } from '../util.js';

export async function renderSettings(root) {
  draw(root);
}

function draw(root) {
  const s = settings();

  mount(root,
    pageHead('설정', ''),
    voiceCard(root, s),
    countCard(s),
    restCard(s),
    routineCard(root, s),
    aiCard(root, s),
    exercisesCard(root, s),
    dataCard(root, s),
    aboutCard(),
  );
}

// ── 음성 ─────────────────────────────────────────────────────
function voiceCard(root, s) {
  const voices = koreanVoices();
  const all = listVoices();

  const usingCustom = s.voiceURI === '' || s.voiceURI === CUSTOM_VOICE_ID;
  const select = h('select', {
    onchange: (e) => { setSetting('voiceURI', e.target.value); reselectVoice(); },
  },
    hasClips()
      ? h('option', { value: CUSTOM_VOICE_ID, selected: usingCustom }, `🎙 ${customVoiceName()} (추천)`)
      : h('option', { value: '', selected: s.voiceURI === '' }, '자동 (한국어 여성 우선)'),
    ...(voices.length ? voices : all).map(v =>
      h('option', { value: v.voiceURI, selected: v.voiceURI === s.voiceURI }, `${v.name} (${v.lang})`)),
  );

  // 하나 · 둘 · 셋 을 실제 카운트 속도로 들려주고 "세트 완료" 로 마무리
  const preview = () => {
    unlockAudio();
    speakCount(1);
    let n = 2;
    const t = setInterval(() => {
      if (n > 3) { clearInterval(t); setTimeout(() => cue.setDone(), 400); return; }
      speakCount(n++);
    }, s.tempo * 1000);
  };

  return h('.card', null,
    h('.card-head', null, h('h3', null, '음성')),

    switchRow('횟수를 음성으로 세기', null, s.voiceEnabled, v => setSetting('voiceEnabled', v)),
    switchRow('신호음', '세트 시작·종료·휴식 끝에 짧게', s.beepEnabled, v => setSetting('beepEnabled', v)),

    h('hr.rule'),
    field('목소리', select,
      hasClips()
        ? `직접 등록한 "${customVoiceName()}"이 기본으로 재생됩니다. 목록의 다른 항목을 고르면 그 대신 기기 내장 음성을 씁니다.`
        : (voices.length
            ? '기기에 설치된 한국어 음성입니다. 아이폰은 유나(Yuna)가 기본이고, 설정 › 손쉬운 사용 › 음성 콘텐츠에서 다른 한국어 음성을 더 내려받을 수 있습니다.'
            : '한국어 음성이 아직 준비되지 않았습니다. 잠시 후 이 화면을 다시 열어 보세요.')),

    field('음 높이 (밝기)', slider(s.voicePitch, 0.6, 1.8, 0.05, v => `${v.toFixed(2)}`, v => setSetting('voicePitch', v)),
      (usingCustom ? '내장 음성으로 전환했을 때만 적용됩니다. ' : '') + '높일수록 밝고 경쾌한 톤이 됩니다. 기본값 1.25.'),
    field('말하기 속도', slider(s.voiceRate, 0.6, 1.8, 0.05, v => `${v.toFixed(2)}`, v => setSetting('voiceRate', v)),
      usingCustom ? '내장 음성으로 전환했을 때만 적용됩니다.' : null),
    field('음량', slider(s.voiceVolume, 0, 1, 0.05, v => `${Math.round(v * 100)}%`, v => setSetting('voiceVolume', v))),

    field('숫자 읽는 방식', h('select', {
      onchange: (e) => setSetting('countStyle', e.target.value),
    },
      h('option', { value: 'native', selected: s.countStyle === 'native' }, '하나 · 둘 · 셋 (순우리말)'),
      h('option', { value: 'sino', selected: s.countStyle === 'sino' }, '일 · 이 · 삼 (한자어)'),
    ), usingCustom ? `녹음된 "${customVoiceName()}"은 순우리말로 녹음돼 있어 이 설정과 무관하게 그대로 재생됩니다. 내장 음성으로 전환했을 때만 적용됩니다.` : null),

    h('button.btn-block', { onclick: preview }, '🔊 들어보기'),

    !hasClips()
      ? h('.hint', { style: { marginTop: '10px' } },
          '마음에 드는 목소리로 녹음한 파일을 audio/ 폴더에 넣고 manifest.json 에 등록하면 그 목소리로 바뀝니다.')
      : null,
  );
}

function slider(value, min, max, step, format, onchange) {
  const out = h('span.num', { style: { flex: '0 0 58px', textAlign: 'right', fontSize: '14px' } }, format(value));
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
    h('input', {
      type: 'range', min, max, step, value,
      oninput: (e) => { const v = Number(e.target.value); out.textContent = format(v); onchange(v); },
    }),
    out,
  );
}

// ── 카운트 ───────────────────────────────────────────────────
function countCard(s) {
  return h('.card', null,
    h('.card-head', null, h('h3', null, '횟수 세기')),

    field('기본 속도 (1회에 걸리는 시간)', stepper({
      value: s.tempo, min: s.tempoMin, max: s.tempoMax, step: 0.1,
      format: v => `${v.toFixed(1)}초`, onchange: v => setSetting('tempo', v),
    }), '운동 중에도 화면의 슬라이더로 언제든 바꿀 수 있습니다. 종목마다 따로 정해 둔 값이 있으면 그게 우선입니다.'),

    field('속도 조절 범위', h('div', { style: { display: 'flex', gap: '8px' } },
      stepper({ value: s.tempoMin, min: 0.5, max: 4, step: 0.5, format: v => `${v.toFixed(1)}초`, onchange: v => setSetting('tempoMin', v) }),
      stepper({ value: s.tempoMax, min: 3, max: 15, step: 0.5, format: v => `${v.toFixed(1)}초`, onchange: v => setSetting('tempoMax', v) }),
    ), '운동 중 슬라이더가 움직이는 최소·최대 범위입니다.'),

    field('세트 시작 전 카운트다운', stepper({
      value: s.countdownSec, min: 0, max: 10, step: 1,
      format: v => (v ? `${v}초` : '없음'), onchange: v => setSetting('countdownSec', v),
    })),

    field('"마지막" 알림', stepper({
      value: s.announceLastReps, min: 0, max: 5, step: 1,
      format: v => (v ? `${v}회 남았을 때` : '안 함'), onchange: v => setSetting('announceLastReps', v),
    })),
  );
}

// ── 휴식 ─────────────────────────────────────────────────────
function restCard(s) {
  return h('.card', null,
    h('.card-head', null, h('h3', null, '휴식')),

    field('기본 휴식 시간', stepper({
      value: s.restDefault, min: 15, max: 300, step: 15,
      format: v => mmss(v), onchange: v => setSetting('restDefault', v),
    }), '종목마다 따로 정해 둔 값이 있으면 그게 우선입니다.'),

    field('휴식 끝 알림', stepper({
      value: s.restWarnSec, min: 0, max: 30, step: 5,
      format: v => (v ? `${v}초 전` : '안 함'), onchange: v => setSetting('restWarnSec', v),
    })),

    switchRow('세트가 끝나면 휴식 자동 시작', null, s.autoStartRest, v => setSetting('autoStartRest', v)),
    switchRow('화면 꺼짐 방지', '운동 중에는 화면을 켜 둡니다', s.keepAwake, v => setSetting('keepAwake', v)),
  );
}

// ── 루틴 ─────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { v: '', label: '휴식' },
  { v: 'push', label: '가슴 · 어깨 전면 · 삼두' },
  { v: 'pull', label: '등 · 어깨 측후면 · 이두' },
  { v: 'legs', label: '하체' },
];

function routineCard(root, s) {
  const r = s.routine;

  return h('.card', null,
    h('.card-head', null, h('h3', null, '루틴')),
    h('.hint', { style: { marginTop: '-6px', marginBottom: '14px' } },
      '자동 생성과 AI 생성 모두 이 배치를 기준으로 계획을 짭니다.'),

    ...[1, 2, 3, 4, 5, 6, 0].map(dow => {
      const slot = r.week[dow];
      const typeSel = h('select', {
        style: { flex: 1 },
        onchange: (e) => {
          const v = e.target.value;
          setSetting(`routine.week.${dow}`, v ? { type: v, variant: slot?.variant || 'A' } : null);
          draw(root);
        },
      }, ...TYPE_OPTIONS.map(o =>
        h('option', { value: o.v, selected: (slot?.type || '') === o.v }, o.label)));

      const varSel = h('select', {
        style: { flex: '0 0 74px' },
        disabled: !slot,
        onchange: (e) => setSetting(`routine.week.${dow}`, { type: slot.type, variant: e.target.value }),
      }, ...['A', 'B'].map(v =>
        h('option', { value: v, selected: slot?.variant === v }, v)));

      return h('div', {
        style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' },
      },
        h('span', {
          style: { flex: '0 0 22px', fontWeight: '700',
                   color: dow === 0 ? 'var(--accent)' : 'var(--ink-2)' },
        }, DOW_KO[dow]),
        typeSel, varSel,
      );
    }),

    h('.hint', { style: { marginTop: '4px' } },
      'A와 B는 같은 부위를 서로 다른 종목 구성으로 하는 두 벌입니다. 한 부위를 주 2회 한다면 한 번은 A, 한 번은 B로 두세요.'),

    h('hr.rule'),
    switchRow('코어 운동 넣기', '하체 날과 등 날 끝에 붙입니다', r.includeCore,
      v => setSetting('routine.includeCore', v)),
  );
}

// ── AI ───────────────────────────────────────────────────────
function aiCard(root, s) {
  const keyInput = h('input', {
    type: 'password', value: s.apiKey, placeholder: 'sk-ant-...',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: false,
    oninput: (e) => setSetting('apiKey', e.target.value.trim()),
  });
  const status = h('.hint', { style: { minHeight: '18px' } });

  const test = h('button.btn-block', { style: { marginTop: '4px' } }, '키 확인하기');
  test.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) return mount(status, '키를 먼저 넣어 주세요.');
    test.disabled = true;
    mount(status, h('span.spin'), ' 확인 중…');
    const r = await testApiKey(key);
    test.disabled = false;
    mount(status, r.ok
      ? h('span', { style: { color: 'var(--good)' } }, '✓ 정상입니다. 이제 AI로 계획을 만들 수 있습니다.')
      : h('span', { style: { color: 'var(--accent)' } }, r.message));
  });

  return h('.card', null,
    h('.card-head', null, h('h3', null, 'AI 계획')),

    field('Anthropic API 키', keyInput,
      'console.anthropic.com › API Keys 에서 만듭니다. 이 기기에만 저장되고, 계획을 만들 때 anthropic.com 으로만 전송됩니다.'),
    test,
    status,

    h('hr.rule'),
    field('모델', h('select', { onchange: (e) => setSetting('aiModel', e.target.value) },
      ...MODELS.map(m => h('option', { value: m.id, selected: m.id === s.aiModel }, m.name)),
    ), MODELS.find(m => m.id === s.aiModel)?.desc || ''),
  );
}

// ── 내 운동 종목 ─────────────────────────────────────────────
function exercisesCard(root, s) {
  const custom = customExercises();

  return h('.card', null,
    h('.card-head', null,
      h('h3', null, '내가 추가한 종목'),
      h('button.btn-sm', { onclick: () => addExerciseSheet(root) }, '＋ 추가'),
    ),
    custom.length
      ? h('div', null, ...custom.map(x => h('div', {
          style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 0',
                   borderBottom: '1px solid var(--rule)', fontSize: '14px' },
        },
          h('span', { style: { flex: 1 } }, x.name),
          h('small', { style: { color: 'var(--ink-3)' } }, GROUPS.find(g => g.id === x.group)?.name || ''),
          h('button.btn-sm.btn-ghost', {
            onclick: () => { removeCustomExercise(x.id); draw(root); },
          }, '✕'),
        )))
      : h('.hint', null, '기본 종목 70여 개 외에 하는 운동이 있으면 추가해 두세요. 자동 생성과 AI 생성 모두 이 종목을 후보로 씁니다.'),
  );
}

function addExerciseSheet(root) {
  modal((close) => {
    const name = h('input', { type: 'text', placeholder: '예) 케이블 풀오버' });
    const group = h('select', null, ...GROUPS.map(g => h('option', { value: g.id }, g.name)));
    const tier = h('select', null,
      h('option', { value: '1' }, '메인 (복합관절)'),
      h('option', { value: '2', selected: true }, '보조'),
      h('option', { value: '3' }, '마무리 (고립)'),
    );
    const sets = h('input', { type: 'number', inputmode: 'numeric', value: 3 });
    const reps = h('input', { type: 'number', inputmode: 'numeric', value: 12 });
    const rest = h('input', { type: 'number', inputmode: 'numeric', value: 90 });

    return h('div', null,
      h('h3', null, '종목 추가'),
      field('이름', name),
      field('부위', group),
      field('종류', tier, '메인은 하루의 앞쪽에, 마무리는 뒤쪽에 배치됩니다.'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('div', { style: { flex: 1 } }, field('세트', sets)),
        h('div', { style: { flex: 1 } }, field('횟수', reps)),
        h('div', { style: { flex: 1 } }, field('휴식(초)', rest)),
      ),
      h('button.btn-block.btn-primary', {
        onclick: () => {
          if (!name.value.trim()) return toast('이름을 넣어 주세요');
          addCustomExercise({
            id: uid('cx'),
            name: name.value.trim(),
            group: group.value,
            tier: Number(tier.value),
            sets: Number(sets.value) || 3,
            reps: Number(reps.value) || 12,
            rest: Number(rest.value) || 90,
            tempo: 3,
            equip: '직접 추가',
          });
          close();
          toast('추가했습니다');
          draw(root);
        },
      }, '추가'),
    );
  });
}

// ── 데이터 ───────────────────────────────────────────────────
function dataCard(root, s) {
  const stat = `기록 ${sessions().length}회 · 계획 ${Object.keys(plans()).length}주`;

  return h('.card', null,
    h('.card-head', null, h('h3', null, '데이터'), h('.num', { style: { fontSize: '12px', color: 'var(--ink-3)' } }, stat)),
    h('.hint', { style: { marginTop: '-6px', marginBottom: '14px' } },
      '모든 기록은 이 기기 안에만 있습니다. 폰을 바꾸거나 브라우저 데이터를 지우면 사라지니, 가끔 백업 파일을 내려받아 두세요.'),

    field('단위', h('select', { onchange: (e) => setSetting('unit', e.target.value) },
      h('option', { value: 'kg', selected: s.unit === 'kg' }, 'kg'),
      h('option', { value: 'lb', selected: s.unit === 'lb' }, 'lb'),
    )),

    h('.btn-row', null,
      h('button', {
        onclick: () => {
          const today = new Date().toISOString().slice(0, 10);
          download(`운동일지-백업-${today}.json`, JSON.stringify(exportAll(), null, 2));
          toast('백업 파일을 내려받았습니다');
        },
      }, '⬇ 백업 내보내기'),
      h('button', { onclick: () => doImport(root) }, '⬆ 불러오기'),
    ),

    h('button.btn-block.btn-danger', {
      style: { marginTop: '10px' },
      onclick: async () => {
        if (await confirmSheet({
          title: '모든 데이터를 지울까요?',
          body: '기록, 계획, 설정이 전부 사라집니다. 되돌릴 수 없습니다.',
          confirmText: '전부 지우기', danger: true,
        })) {
          await wipeAll();
          toast('초기화했습니다');
          draw(root);
        }
      },
    }, '전부 지우기'),
  );
}

async function doImport(root) {
  const file = await pickFile();
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('파일을 읽지 못했습니다');
  }

  const mergeIt = await confirmSheet({
    title: '어떻게 불러올까요?',
    body: '"합치기"는 지금 기록에 백업을 더합니다. "덮어쓰기"는 지금 데이터를 백업으로 바꿉니다.',
    confirmText: '합치기',
  });

  try {
    await importAll(data, { merge: mergeIt });
    toast('불러왔습니다');
    draw(root);
  } catch (err) {
    toast(err.message || '불러오지 못했습니다');
  }
}

function aboutCard() {
  return h('.card.flat', null,
    h('.hint', { style: { textAlign: 'center', lineHeight: '1.7' } },
      '운동일지 · 혼자 하는 웨이트를 위한 기록과 계획', h('br'),
      '홈 화면에 추가하면 앱처럼 전체 화면으로 열립니다.'),
  );
}
