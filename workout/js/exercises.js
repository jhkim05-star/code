/**
 * 운동 종목 데이터베이스.
 *
 * 계획 생성기는 여기서 부위별로 종목을 골라 루틴을 짭니다.
 * 설정 > 운동 종목에서 직접 추가한 종목은 store 에 저장되어 이 목록과 합쳐집니다.
 *
 * tier  1 = 그 부위의 메인(복합관절) 종목, 2 = 보조, 3 = 마무리/고립
 * tempo = 1회에 걸리는 기본 초. 세션 화면에서 언제든 바꿀 수 있습니다.
 * equip = 이 종목에 필요한 기구. 운동계획에서 "가진 기구"를 고르면 이 값으로 걸러집니다.
 */

export const GROUPS = [
  { id: 'chest',    name: '가슴',        short: '가슴' },
  { id: 'back',     name: '등',          short: '등'   },
  { id: 'delt_f',   name: '어깨 전면',   short: '전면'  },
  { id: 'delt_sr',  name: '어깨 측후면', short: '측후면' },
  { id: 'biceps',   name: '이두',        short: '이두'  },
  { id: 'triceps',  name: '삼두',        short: '삼두'  },
  { id: 'thighs',   name: '허벅지',      short: '허벅지' },
  { id: 'glutes',   name: '엉덩이',      short: '엉덩이' },
  { id: 'calves',   name: '종아리',      short: '종아리' },
  { id: 'core',     name: '코어',        short: '코어'  },
];

export const GROUP_NAME = Object.fromEntries(GROUPS.map(g => [g.id, g.name]));

export const EQUIPMENT = [
  '바벨', '덤벨', '머신', '케이블', '스미스머신', '철봉', '맨몸', '원판', '기타',
];

/** e(id, 이름, 부위, tier, 세트, 횟수, 휴식초, 장비, 1회초) */
const e = (id, name, group, tier, sets, reps, rest, equip, tempo = 3) =>
  ({ id, name, group, tier, sets, reps, rest, equip, tempo });

export const EXERCISES = [
  // ── 가슴 ────────────────────────────────────────────────
  e('bb_bench',      '바벨 벤치프레스',        'chest', 1, 4, 8,  150, '바벨'),
  e('bb_incline',    '인클라인 바벨프레스',    'chest', 1, 4, 8,  150, '바벨'),
  e('db_bench',      '덤벨 벤치프레스',        'chest', 1, 4, 10, 120, '덤벨'),
  e('db_incline',    '인클라인 덤벨프레스',    'chest', 1, 4, 10, 120, '덤벨'),
  e('smith_bench',   '스미스머신 벤치프레스',  'chest', 1, 4, 10, 120, '스미스머신'),
  e('smith_incline', '스미스머신 인클라인 프레스', 'chest', 1, 4, 10, 120, '스미스머신'),
  e('machine_press', '체스트프레스 머신',      'chest', 2, 3, 12, 90,  '머신'),
  e('dips_chest',    '딥스 (가슴)',            'chest', 1, 3, 10, 120, '맨몸'),
  e('db_fly',        '덤벨 플라이',            'chest', 3, 3, 12, 75,  '덤벨'),
  e('incline_fly',   '인클라인 덤벨 플라이',   'chest', 3, 3, 12, 75,  '덤벨'),
  e('cable_cross',   '케이블 크로스오버',      'chest', 3, 3, 15, 60,  '케이블', 2.5),
  e('pec_deck',      '펙덱 플라이',            'chest', 3, 3, 15, 60,  '머신',  2.5),
  e('pushup',        '푸시업',                 'chest', 2, 3, 15, 60,  '맨몸',  2.5),

  // ── 등 ──────────────────────────────────────────────────
  e('deadlift',      '데드리프트',             'back', 1, 4, 5,  210, '바벨', 4),
  e('bb_row',        '바벨 로우',              'back', 1, 4, 8,  150, '바벨'),
  e('pendlay',       '펜들레이 로우',          'back', 1, 4, 6,  150, '바벨'),
  e('tbar_row',      '티바 로우',              'back', 1, 4, 10, 120, '바벨'),
  e('smith_row',     '스미스머신 바벨로우',    'back', 1, 4, 10, 120, '스미스머신'),
  e('smith_deadlift','스미스머신 데드리프트',  'back', 1, 4, 8,  180, '스미스머신', 3.5),
  e('pullup',        '풀업',                   'back', 1, 4, 8,  150, '철봉', 3.5),
  e('chinup',        '친업',                   'back', 1, 4, 8,  150, '철봉', 3.5),
  e('lat_pulldown',  '랫풀다운',               'back', 2, 4, 12, 90,  '케이블'),
  e('lat_close',     '클로즈그립 랫풀다운',    'back', 2, 4, 12, 90,  '케이블'),
  e('db_row',        '덤벨 원암 로우',         'back', 2, 3, 12, 90,  '덤벨'),
  e('seated_row',    '시티드 케이블 로우',     'back', 2, 4, 12, 90,  '케이블'),
  e('chest_sup_row', '체스트 서포티드 로우',   'back', 2, 3, 12, 90,  '머신'),
  e('straight_pull', '스트레이트암 풀다운',    'back', 3, 3, 15, 60,  '케이블', 2.5),
  e('db_pullover',   '덤벨 풀오버',            'back', 3, 3, 12, 75,  '덤벨'),
  e('cable_row_1arm','케이블 원암 로우',       'back', 3, 3, 12, 60,  '케이블'),

  // ── 어깨 전면 ───────────────────────────────────────────
  e('ohp',           '오버헤드 프레스',        'delt_f', 1, 4, 8,  150, '바벨'),
  e('db_shoulder',   '덤벨 숄더프레스',        'delt_f', 1, 4, 10, 120, '덤벨'),
  e('smith_ohp',     '스미스머신 숄더프레스',  'delt_f', 1, 4, 10, 120, '스미스머신'),
  e('arnold',        '아놀드 프레스',          'delt_f', 2, 3, 12, 90,  '덤벨'),
  e('machine_sp',    '머신 숄더프레스',        'delt_f', 2, 3, 12, 90,  '머신'),
  e('front_raise',   '프론트 레이즈',          'delt_f', 3, 3, 15, 60,  '덤벨', 2.5),
  e('cable_front',   '케이블 프론트 레이즈',   'delt_f', 3, 3, 15, 60,  '케이블', 2.5),
  e('plate_front',   '플레이트 프론트 레이즈', 'delt_f', 3, 3, 15, 60,  '원판', 2.5),

  // ── 어깨 측후면 ─────────────────────────────────────────
  e('side_raise',    '사이드 레터럴 레이즈',   'delt_sr', 2, 4, 15, 60, '덤벨', 2.5),
  e('cable_side',    '케이블 사이드 레이즈',   'delt_sr', 2, 4, 15, 60, '케이블', 2.5),
  e('machine_side',  '머신 레터럴 레이즈',     'delt_sr', 2, 3, 15, 60, '머신', 2.5),
  e('bent_lateral',  '벤트오버 레터럴 레이즈', 'delt_sr', 2, 4, 15, 60, '덤벨', 2.5),
  e('rear_pec_deck', '리어델트 펙덱',          'delt_sr', 3, 3, 15, 60, '머신', 2.5),
  e('face_pull',     '페이스풀',               'delt_sr', 3, 3, 15, 60, '케이블', 2.5),
  e('upright_row',   '업라이트 로우',          'delt_sr', 3, 3, 12, 75, '바벨'),
  e('smith_upright', '스미스머신 업라이트 로우', 'delt_sr', 3, 3, 12, 75, '스미스머신'),

  // ── 이두 ────────────────────────────────────────────────
  e('bb_curl',       '바벨 컬',                'biceps', 2, 4, 10, 75, '바벨'),
  e('ez_curl',       'EZ바 컬',                'biceps', 2, 4, 10, 75, '바벨'),
  e('db_curl',       '덤벨 컬',                'biceps', 2, 3, 12, 60, '덤벨'),
  e('hammer_curl',   '해머 컬',                'biceps', 2, 3, 12, 60, '덤벨'),
  e('incline_curl',  '인클라인 덤벨 컬',       'biceps', 3, 3, 12, 60, '덤벨'),
  e('preacher',      '프리처 컬',              'biceps', 3, 3, 12, 60, '머신'),
  e('cable_curl',    '케이블 컬',              'biceps', 3, 3, 15, 60, '케이블', 2.5),
  e('conc_curl',     '컨센트레이션 컬',        'biceps', 3, 3, 12, 60, '덤벨'),
  e('smith_drag_curl','스미스머신 드래그 컬',  'biceps', 3, 3, 12, 60, '스미스머신'),

  // ── 삼두 ────────────────────────────────────────────────
  e('cg_bench',      '클로즈그립 벤치프레스',  'triceps', 1, 4, 10, 120, '바벨'),
  e('smith_cg_bench','스미스머신 클로즈그립 벤치프레스', 'triceps', 1, 4, 10, 120, '스미스머신'),
  e('dips_tri',      '딥스 (삼두)',            'triceps', 1, 3, 10, 120, '맨몸'),
  e('skullcrusher',  '라잉 익스텐션 (스컬)',   'triceps', 2, 4, 12, 75,  '바벨'),
  e('smith_skull',   '스미스머신 라잉 익스텐션', 'triceps', 2, 4, 12, 75, '스미스머신'),
  e('oh_ext',        '오버헤드 익스텐션',      'triceps', 2, 3, 12, 75,  '덤벨'),
  e('pushdown',      '케이블 푸시다운',        'triceps', 2, 4, 15, 60,  '케이블', 2.5),
  e('rope_pushdown', '로프 푸시다운',          'triceps', 2, 4, 15, 60,  '케이블', 2.5),
  e('kickback',      '덤벨 킥백',              'triceps', 3, 3, 15, 60,  '덤벨', 2.5),
  e('machine_dip',   '머신 딥스',              'triceps', 2, 3, 12, 75,  '머신'),
  e('cable_oh_ext',  '케이블 오버헤드 익스텐션', 'triceps', 3, 3, 15, 60, '케이블', 2.5),
  e('bench_dip',     '벤치 딥스',              'triceps', 3, 3, 15, 60,  '맨몸', 2.5),

  // ── 허벅지 ──────────────────────────────────────────────
  e('back_squat',    '백스쿼트',               'thighs', 1, 5, 6,  180, '바벨', 3.5),
  e('front_squat',   '프론트 스쿼트',          'thighs', 1, 4, 8,  180, '바벨', 3.5),
  e('smith_squat',   '스미스머신 스쿼트',      'thighs', 1, 4, 8,  180, '스미스머신', 3.5),
  e('smith_front_squat', '스미스머신 프론트 스쿼트', 'thighs', 1, 4, 8, 150, '스미스머신', 3.5),
  e('smith_rdl',     '스미스머신 루마니안 데드리프트', 'thighs', 1, 4, 10, 150, '스미스머신', 3.5),
  e('leg_press',     '레그프레스',             'thighs', 1, 4, 12, 120, '머신'),
  e('hack_squat',    '핵 스쿼트',              'thighs', 1, 4, 10, 150, '머신'),
  e('rdl',           '루마니안 데드리프트',    'thighs', 1, 4, 10, 150, '바벨', 3.5),
  e('stiff_dl',      '스티프레그 데드리프트',  'thighs', 2, 3, 12, 120, '바벨', 3.5),
  e('bulgarian',     '불가리안 스플릿 스쿼트', 'thighs', 2, 3, 12, 105, '덤벨'),
  e('lunge',         '워킹 런지',              'thighs', 2, 3, 12, 105, '덤벨'),
  e('smith_lunge',   '스미스머신 런지',        'thighs', 2, 3, 12, 105, '스미스머신'),
  e('smith_split',   '스미스머신 불가리안 스플릿 스쿼트', 'thighs', 2, 3, 12, 105, '스미스머신'),
  e('leg_ext',       '레그 익스텐션',          'thighs', 3, 3, 15, 60,  '머신', 2.5),
  e('leg_curl',      '레그 컬',                'thighs', 2, 4, 12, 75,  '머신'),
  e('goblet_squat',  '고블릿 스쿼트',          'thighs', 2, 3, 12, 90,  '덤벨'),

  // ── 엉덩이 ──────────────────────────────────────────────
  e('hip_thrust',    '힙 스러스트',            'glutes', 1, 4, 10, 120, '바벨'),
  e('smith_thrust',  '스미스머신 힙 스러스트', 'glutes', 1, 4, 10, 120, '스미스머신'),
  e('glute_bridge',  '글루트 브릿지',          'glutes', 2, 3, 15, 75,  '맨몸', 2.5),
  e('cable_kickback','케이블 킥백',            'glutes', 2, 4, 15, 60,  '케이블', 2.5),
  e('hip_abduction', '힙 어브덕션 머신',       'glutes', 2, 4, 15, 60,  '머신', 2.5),
  e('sumo_dl',       '스모 데드리프트',        'glutes', 1, 4, 8,  180, '바벨', 3.5),
  e('smith_sumo',    '스미스머신 스모 데드리프트', 'glutes', 1, 4, 8, 180, '스미스머신', 3.5),
  e('step_up',       '덤벨 스텝업',            'glutes', 3, 3, 12, 90,  '덤벨'),

  // ── 종아리 ──────────────────────────────────────────────
  e('calf_raise',    '스탠딩 카프 레이즈',     'calves', 1, 4, 15, 45, '머신', 2),
  e('seated_calf',   '시티드 카프 레이즈',     'calves', 1, 4, 15, 45, '머신', 2),
  e('smith_calf',    '스미스머신 카프 레이즈', 'calves', 2, 4, 15, 45, '스미스머신', 2),
  e('db_calf_raise', '덤벨 카프 레이즈',       'calves', 2, 4, 15, 45, '덤벨', 2),
  e('leg_press_calf','레그프레스 카프 레이즈', 'calves', 3, 3, 15, 45, '머신', 2),

  // ── 코어 ────────────────────────────────────────────────
  e('hang_leg',      '행잉 레그레이즈',        'core', 2, 3, 12, 60, '철봉'),
  e('cable_crunch',  '케이블 크런치',          'core', 2, 3, 15, 60, '케이블', 2.5),
  e('crunch',        '크런치',                 'core', 3, 3, 20, 45, '맨몸', 2),
  e('ab_rollout',    '앱 롤아웃',              'core', 2, 3, 10, 60, '기타', 3.5),
  e('russian',       '러시안 트위스트',        'core', 3, 3, 20, 45, '맨몸', 2),
  e('plank',         '플랭크',                 'core', 3, 3, 40, 45, '맨몸', 1),
];

/**
 * 동작 패턴 — 같은 부위 안에서도 "미는 동작"과 "당기는 동작"처럼 결이 다른 종목을
 * 섞어 주기 위한 분류입니다. 계획 생성기가 하루 안에서 같은 부위 종목을 여러 개
 * 고를 때, 되도록 서로 다른 패턴이 나오도록 씁니다.
 */
const PATTERN_IDS = {
  press_h: ['bb_bench', 'bb_incline', 'db_bench', 'db_incline', 'smith_bench', 'smith_incline',
            'machine_press', 'dips_chest', 'pushup', 'cg_bench', 'smith_cg_bench',
            'dips_tri', 'machine_dip', 'bench_dip'],
  press_v: ['ohp', 'db_shoulder', 'smith_ohp', 'arnold', 'machine_sp'],
  fly:     ['db_fly', 'incline_fly', 'cable_cross', 'pec_deck'],
  pull_v:  ['pullup', 'chinup', 'lat_pulldown', 'lat_close', 'straight_pull', 'db_pullover'],
  pull_h:  ['bb_row', 'pendlay', 'tbar_row', 'smith_row', 'db_row', 'seated_row',
            'chest_sup_row', 'cable_row_1arm', 'face_pull', 'upright_row', 'smith_upright'],
  hinge:   ['deadlift', 'smith_deadlift', 'rdl', 'smith_rdl', 'stiff_dl', 'sumo_dl', 'smith_sumo',
            'hip_thrust', 'smith_thrust', 'glute_bridge', 'leg_curl'],
  squat:   ['back_squat', 'front_squat', 'smith_squat', 'smith_front_squat',
            'leg_press', 'hack_squat', 'goblet_squat'],
  lunge:   ['bulgarian', 'lunge', 'smith_lunge', 'smith_split', 'step_up'],
  raise:   ['front_raise', 'cable_front', 'plate_front', 'side_raise', 'cable_side',
            'machine_side', 'bent_lateral', 'rear_pec_deck', 'cable_kickback', 'hip_abduction'],
  curl:    ['bb_curl', 'ez_curl', 'db_curl', 'hammer_curl', 'incline_curl', 'preacher',
            'cable_curl', 'conc_curl', 'smith_drag_curl'],
  ext:     ['skullcrusher', 'smith_skull', 'oh_ext', 'pushdown', 'rope_pushdown',
            'kickback', 'cable_oh_ext', 'leg_ext'],
  calf:    ['calf_raise', 'seated_calf', 'smith_calf', 'db_calf_raise', 'leg_press_calf'],
  core:    ['hang_leg', 'cable_crunch', 'crunch', 'ab_rollout', 'russian', 'plank'],
};

const PATTERN_BY_ID = {};
for (const [pattern, ids] of Object.entries(PATTERN_IDS)) {
  for (const id of ids) PATTERN_BY_ID[id] = pattern;
}

/** 부위만 아는 종목(사용자가 직접 추가한 것 등)의 기본 패턴 */
const GROUP_PATTERN = {
  chest: 'press_h', back: 'pull_h', delt_f: 'press_v', delt_sr: 'raise',
  biceps: 'curl', triceps: 'ext', thighs: 'squat', glutes: 'hinge',
  calves: 'calf', core: 'core',
};

export const patternOf = (ex) =>
  (ex && (PATTERN_BY_ID[ex.id] || GROUP_PATTERN[ex.group])) || 'other';

const BASE_BY_ID = Object.fromEntries(EXERCISES.map(x => [x.id, x]));

/** 기본 DB + 사용자가 추가한 종목 */
export function allExercises(custom = []) {
  return [...EXERCISES, ...custom];
}

export function findExercise(id, custom = []) {
  return BASE_BY_ID[id] || custom.find(x => x.id === id) || null;
}

export function exerciseName(id, custom = []) {
  return findExercise(id, custom)?.name || id;
}

/**
 * 부위별 종목을 tier 순으로.
 * @param {string[]} [equipment]  가진 기구 목록. 비어 있으면(또는 생략하면) 전부 허용.
 * @param {string[]} [avoid]      제외할 종목 id 목록 (비추천으로 표시한 것들)
 */
export function byGroup(groupId, custom = [], equipment = null, avoid = []) {
  let list = allExercises(custom).filter(x => x.group === groupId);
  if (equipment && equipment.length) list = list.filter(x => equipment.includes(x.equip));
  if (avoid && avoid.length) list = list.filter(x => !avoid.includes(x.id));
  return list.sort((a, b) => a.tier - b.tier);
}
