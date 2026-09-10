/** Existing fc9981a exercise IDs, names and default prescriptions are retained. */
export const GROUPS = [
    ['chest', '가슴', '가슴'], ['back', '등', '등'], ['delt_f', '어깨 전면', '전면'],
    ['delt_sr', '어깨 측후면', '측후면'], ['biceps', '이두', '이두'], ['triceps', '삼두', '삼두'],
    ['thighs', '허벅지', '허벅지'], ['glutes', '엉덩이', '엉덩이'], ['calves', '종아리', '종아리'], ['core', '코어', '코어'],
].map(([id, name, short]) => ({ id, name, short }));
export const GROUP_NAME = Object.fromEntries(GROUPS.map(g => [g.id, g.name]));
export const EQUIPMENT = ['바벨', '덤벨', '머신', '케이블', '스미스머신', '철봉', '맨몸', '원판', '기타'];
// id | name | group | tier | sets | reps | rest | equipment | seconds per rep
const ROWS = `
bb_bench|바벨 벤치프레스|chest|1|4|8|150|바벨|3
bb_incline|인클라인 바벨프레스|chest|1|4|8|150|바벨|3
db_bench|덤벨 벤치프레스|chest|1|4|10|120|덤벨|3
db_incline|인클라인 덤벨프레스|chest|1|4|10|120|덤벨|3
smith_bench|스미스머신 벤치프레스|chest|1|4|10|120|스미스머신|3
smith_incline|스미스머신 인클라인 프레스|chest|1|4|10|120|스미스머신|3
machine_press|체스트프레스 머신|chest|2|3|12|90|머신|3
dips_chest|딥스 (가슴)|chest|1|3|10|120|맨몸|3
db_fly|덤벨 플라이|chest|3|3|12|75|덤벨|3
incline_fly|인클라인 덤벨 플라이|chest|3|3|12|75|덤벨|3
cable_cross|케이블 크로스오버|chest|3|3|15|60|케이블|2.5
pec_deck|펙덱 플라이|chest|3|3|15|60|머신|2.5
pushup|푸시업|chest|2|3|15|60|맨몸|2.5
deadlift|데드리프트|back|1|4|5|210|바벨|4
bb_row|바벨 로우|back|1|4|8|150|바벨|3
pendlay|펜들레이 로우|back|1|4|6|150|바벨|3
tbar_row|티바 로우|back|1|4|10|120|바벨|3
smith_row|스미스머신 바벨로우|back|1|4|10|120|스미스머신|3
smith_deadlift|스미스머신 데드리프트|back|1|4|8|180|스미스머신|3.5
pullup|풀업|back|1|4|8|150|철봉|3.5
chinup|친업|back|1|4|8|150|철봉|3.5
lat_pulldown|랫풀다운|back|2|4|12|90|케이블|3
lat_close|클로즈그립 랫풀다운|back|2|4|12|90|케이블|3
db_row|덤벨 원암 로우|back|2|3|12|90|덤벨|3
seated_row|시티드 케이블 로우|back|2|4|12|90|케이블|3
chest_sup_row|체스트 서포티드 로우|back|2|3|12|90|머신|3
straight_pull|스트레이트암 풀다운|back|3|3|15|60|케이블|2.5
db_pullover|덤벨 풀오버|back|3|3|12|75|덤벨|3
cable_row_1arm|케이블 원암 로우|back|3|3|12|60|케이블|3
ohp|오버헤드 프레스|delt_f|1|4|8|150|바벨|3
db_shoulder|덤벨 숄더프레스|delt_f|1|4|10|120|덤벨|3
smith_ohp|스미스머신 숄더프레스|delt_f|1|4|10|120|스미스머신|3
arnold|아놀드 프레스|delt_f|2|3|12|90|덤벨|3
machine_sp|머신 숄더프레스|delt_f|2|3|12|90|머신|3
front_raise|프론트 레이즈|delt_f|3|3|15|60|덤벨|2.5
cable_front|케이블 프론트 레이즈|delt_f|3|3|15|60|케이블|2.5
plate_front|플레이트 프론트 레이즈|delt_f|3|3|15|60|원판|2.5
side_raise|사이드 레터럴 레이즈|delt_sr|2|4|15|60|덤벨|2.5
cable_side|케이블 사이드 레이즈|delt_sr|2|4|15|60|케이블|2.5
machine_side|머신 레터럴 레이즈|delt_sr|2|3|15|60|머신|2.5
bent_lateral|벤트오버 레터럴 레이즈|delt_sr|2|4|15|60|덤벨|2.5
rear_pec_deck|리어델트 펙덱|delt_sr|3|3|15|60|머신|2.5
face_pull|페이스풀|delt_sr|3|3|15|60|케이블|2.5
upright_row|업라이트 로우|delt_sr|3|3|12|75|바벨|3
smith_upright|스미스머신 업라이트 로우|delt_sr|3|3|12|75|스미스머신|3
bb_curl|바벨 컬|biceps|2|4|10|75|바벨|3
ez_curl|EZ바 컬|biceps|2|4|10|75|바벨|3
db_curl|덤벨 컬|biceps|2|3|12|60|덤벨|3
hammer_curl|해머 컬|biceps|2|3|12|60|덤벨|3
incline_curl|인클라인 덤벨 컬|biceps|3|3|12|60|덤벨|3
preacher|프리처 컬|biceps|3|3|12|60|머신|3
cable_curl|케이블 컬|biceps|3|3|15|60|케이블|2.5
conc_curl|컨센트레이션 컬|biceps|3|3|12|60|덤벨|3
smith_drag_curl|스미스머신 드래그 컬|biceps|3|3|12|60|스미스머신|3
cg_bench|클로즈그립 벤치프레스|triceps|1|4|10|120|바벨|3
smith_cg_bench|스미스머신 클로즈그립 벤치프레스|triceps|1|4|10|120|스미스머신|3
dips_tri|딥스 (삼두)|triceps|1|3|10|120|맨몸|3
skullcrusher|라잉 익스텐션 (스컬)|triceps|2|4|12|75|바벨|3
smith_skull|스미스머신 라잉 익스텐션|triceps|2|4|12|75|스미스머신|3
oh_ext|오버헤드 익스텐션|triceps|2|3|12|75|덤벨|3
pushdown|케이블 푸시다운|triceps|2|4|15|60|케이블|2.5
rope_pushdown|로프 푸시다운|triceps|2|4|15|60|케이블|2.5
kickback|덤벨 킥백|triceps|3|3|15|60|덤벨|2.5
machine_dip|머신 딥스|triceps|2|3|12|75|머신|3
cable_oh_ext|케이블 오버헤드 익스텐션|triceps|3|3|15|60|케이블|2.5
bench_dip|벤치 딥스|triceps|3|3|15|60|맨몸|2.5
back_squat|백스쿼트|thighs|1|5|6|180|바벨|3.5
front_squat|프론트 스쿼트|thighs|1|4|8|180|바벨|3.5
smith_squat|스미스머신 스쿼트|thighs|1|4|8|180|스미스머신|3.5
smith_front_squat|스미스머신 프론트 스쿼트|thighs|1|4|8|150|스미스머신|3.5
smith_rdl|스미스머신 루마니안 데드리프트|thighs|1|4|10|150|스미스머신|3.5
leg_press|레그프레스|thighs|1|4|12|120|머신|3
hack_squat|핵 스쿼트|thighs|1|4|10|150|머신|3
rdl|루마니안 데드리프트|thighs|1|4|10|150|바벨|3.5
stiff_dl|스티프레그 데드리프트|thighs|2|3|12|120|바벨|3.5
bulgarian|불가리안 스플릿 스쿼트|thighs|2|3|12|105|덤벨|3
lunge|워킹 런지|thighs|2|3|12|105|덤벨|3
smith_lunge|스미스머신 런지|thighs|2|3|12|105|스미스머신|3
smith_split|스미스머신 불가리안 스플릿 스쿼트|thighs|2|3|12|105|스미스머신|3
leg_ext|레그 익스텐션|thighs|3|3|15|60|머신|2.5
leg_curl|레그 컬|thighs|2|4|12|75|머신|3
goblet_squat|고블릿 스쿼트|thighs|2|3|12|90|덤벨|3
hip_thrust|힙 스러스트|glutes|1|4|10|120|바벨|3
smith_thrust|스미스머신 힙 스러스트|glutes|1|4|10|120|스미스머신|3
glute_bridge|글루트 브릿지|glutes|2|3|15|75|맨몸|2.5
cable_kickback|케이블 킥백|glutes|2|4|15|60|케이블|2.5
hip_abduction|힙 어브덕션 머신|glutes|2|4|15|60|머신|2.5
sumo_dl|스모 데드리프트|glutes|1|4|8|180|바벨|3.5
smith_sumo|스미스머신 스모 데드리프트|glutes|1|4|8|180|스미스머신|3.5
step_up|덤벨 스텝업|glutes|3|3|12|90|덤벨|3
calf_raise|스탠딩 카프 레이즈|calves|1|4|15|45|머신|2
seated_calf|시티드 카프 레이즈|calves|1|4|15|45|머신|2
smith_calf|스미스머신 카프 레이즈|calves|2|4|15|45|스미스머신|2
db_calf_raise|덤벨 카프 레이즈|calves|2|4|15|45|덤벨|2
leg_press_calf|레그프레스 카프 레이즈|calves|3|3|15|45|머신|2
hang_leg|행잉 레그레이즈|core|2|3|12|60|철봉|3
cable_crunch|케이블 크런치|core|2|3|15|60|케이블|2.5
crunch|크런치|core|3|3|20|45|맨몸|2
ab_rollout|앱 롤아웃|core|2|3|10|60|기타|3.5
russian|러시안 트위스트|core|3|3|20|45|맨몸|2
plank|플랭크|core|3|3|40|45|맨몸|1
`;
const PATTERNS = {
    press_h: 'bb_bench bb_incline db_bench db_incline smith_bench smith_incline machine_press dips_chest pushup cg_bench smith_cg_bench dips_tri machine_dip bench_dip',
    press_v: 'ohp db_shoulder smith_ohp arnold machine_sp',
    fly: 'db_fly incline_fly cable_cross pec_deck',
    pull_v: 'pullup chinup lat_pulldown lat_close straight_pull db_pullover',
    pull_h: 'bb_row pendlay tbar_row smith_row db_row seated_row chest_sup_row cable_row_1arm face_pull upright_row smith_upright',
    hinge: 'deadlift smith_deadlift rdl smith_rdl stiff_dl sumo_dl smith_sumo hip_thrust smith_thrust glute_bridge',
    squat: 'back_squat front_squat smith_squat smith_front_squat leg_press hack_squat goblet_squat',
    lunge: 'bulgarian lunge smith_lunge smith_split step_up',
    raise: 'front_raise cable_front plate_front side_raise cable_side machine_side bent_lateral rear_pec_deck cable_kickback hip_abduction',
    curl: 'bb_curl ez_curl db_curl hammer_curl incline_curl preacher cable_curl conc_curl smith_drag_curl leg_curl',
    ext: 'skullcrusher smith_skull oh_ext pushdown rope_pushdown kickback cable_oh_ext leg_ext',
    calf: 'calf_raise seated_calf smith_calf db_calf_raise leg_press_calf',
    core: 'hang_leg cable_crunch crunch ab_rollout russian plank',
};
const patternMap = Object.fromEntries(Object.entries(PATTERNS).flatMap(([p, ids]) => ids.split(' ').map(id => [id, p])));
const groupPattern = { chest: 'press_h', back: 'pull_h', delt_f: 'press_v', delt_sr: 'raise', biceps: 'curl', triceps: 'ext', thighs: 'squat', glutes: 'hinge', calves: 'calf', core: 'core' };
export const patternOf = ex => ex?.pattern || patternMap[ex?.id] || groupPattern[ex?.group] || 'other';
const isolationPull = new Set(['straight_pull', 'db_pullover', 'face_pull', 'upright_row', 'smith_upright']);
export function enrichExercise(ex) {
    const pattern = patternOf(ex);
    const compound = ex.compound ?? (['press_h', 'press_v', 'pull_h', 'pull_v', 'hinge', 'squat', 'lunge'].includes(pattern) && !isolationPull.has(ex.id));
    const bodyweight = ['맨몸', '철봉'].includes(ex.equip) || ex.id === 'ab_rollout';
    const secondary = ex.secondary || (pattern === 'press_h' ? ['delt_f', 'triceps'] : pattern === 'press_v' ? ['triceps'] : ['pull_h', 'pull_v'].includes(pattern) ? ['biceps'] : ['squat', 'lunge'].includes(pattern) ? ['glutes'] : pattern === 'hinge' ? ['thighs', 'glutes'] : []).filter(g => g !== ex.group);
    const singleDumbbell = ['goblet_squat', 'oh_ext', 'db_pullover'].includes(ex.id);
    const loadBasis = ex.loadBasis || (bodyweight ? 'bodyweight' : ex.equip === '덤벨' && !singleDumbbell ? 'per_hand' : ['케이블', '머신'].includes(ex.equip) ? 'stack' : 'total');
    return { ...ex, pattern, compound, secondary, bodyweight, loadBasis, measure: ex.measure || (ex.id === 'plank' ? 'duration' : 'reps'), warmupEligible: ex.warmupEligible ?? (compound && !bodyweight) };
}
export const EXERCISES = ROWS.trim().split('\n').map(line => {
    const [id, name, group, tier, sets, reps, rest, equip, tempo] = line.split('|');
    return enrichExercise({ id, name, group, tier: +tier, sets: +sets, reps: +reps, rest: +rest, equip, tempo: +tempo });
});
const byId = new Map(EXERCISES.map(x => [x.id, x]));
export function allExercises(custom = []) { return [...EXERCISES, ...custom.filter(x => !byId.has(x.id)).map(enrichExercise)]; }
export function findExercise(id, custom = []) { return byId.get(id) || (custom.find(x => x.id === id) ? enrichExercise(custom.find(x => x.id === id)) : null); }
export const exerciseName = (id, custom = []) => findExercise(id, custom)?.name || id;
export function byGroup(group, custom = [], equipment = null, avoid = []) { return allExercises(custom).filter(x => x.group === group && (!equipment?.length || equipment.includes(x.equip)) && !avoid.includes(x.id)).sort((a, b) => a.tier - b.tier); }
export const LOAD_LABELS = { per_hand: '한쪽 덤벨', total: '기록 총중량', stack: '머신·케이블 표기', bodyweight: '맨몸·추가 중량 없음', added: '추가 중량' };
