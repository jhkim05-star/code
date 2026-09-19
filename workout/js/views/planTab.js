import { h, mount, pageHead, field, toast, modal, stepper, switchRow, weightInput } from '../ui.js';
import { settings, setSetting, replaceSettings, sessions, getPlan, avoidExerciseIds, customExercises } from '../store.js';
import { generateWeek, normalizeAiPlan, PRESETS, recommendWeight, resolveWeeklyTargets, syncAutomaticWeeklyTargets, applyWeeklyTargetChoice } from '../planner.js';
import { BENCHMARKS, resolveBenchmarks } from '../weights.js';
import { GROUPS, GROUP_NAME, EQUIPMENT, findExercise, equipmentReadiness } from '../exercises.js';
import { generatePlanWithAi, contextFingerprint } from '../ai.js';
import { pickExercise } from './exercisePicker.js';
import { showPlanPreview } from './planPreview.js';
import { pickMachines, machineNames } from './machinePicker.js';
import { renderTodayWorkout } from './todayWorkout.js';
import { weekStartOf, ymd, parseYmd, DOW_KO, fmtWeight, readWeightInput, finite } from '../util.js';
import { go } from '../app.js';
export function renderPlanTab(root, params, opt = {}) {
    const page = params?.[0] || 'home';
    if (page === 'today')
        return renderTodayWorkout(root);
    if (page !== 'long-term')
        return renderPlanHome(root);
    let chosenWeek = ymd(weekStartOf());
    const recommendationContext = () => ({ custom: customExercises(), avoid: avoidExerciseIds() });
    const updateRecommended = mutate => {
        let next = structuredClone(settings());
        mutate(next);
        next = syncAutomaticWeeklyTargets(next, { custom: customExercises(), avoid: next.avoidExerciseIds });
        replaceSettings(next);
        draw();
    };
    function draw() {
        const s = settings();
        mount(root, pageHead('장기 프로그램 만들기', '요일·부위·운동량을 정해 주간 계획을 만들어요', h('button.btn-sm', { onclick: () => go('/plan') }, '돌아가기')), h('.card', null, h('h3', null, '빠른 시작'), h('p.hint', null, '요일 배치만 바꿉니다. 내 목표량과 기구 설정은 유지해요.'), h('.stack', null, ...PRESETS.map(p => h('button', { onclick: () => updateRecommended(next => { next.plan.week = structuredClone(p.week); }) }, p.label)))), weekCard(s), sessionCard(s), volumeCard(s), benchmarkCard(s), equipmentCard(s), avoidCard(), h('.card', null, h('h3', null, '계획 생성'), field('계획을 만들 주 (어느 날짜든 선택)', h('input', { type: 'date', value: chosenWeek, onchange: e => { chosenWeek = ymd(weekStartOf(parseYmd(e.target.value))); e.target.value = chosenWeek; } })), h('p.hint', null, '생성만으로 기존 계획을 덮어쓰지 않아요. 결과를 확인한 뒤 적용합니다.'), h('.btn-row', null, h('button.btn-primary', { onclick: () => {
                if (!Object.values(settings().plan.week).some(a => a.length))
                    throw new Error('요일별 부위를 먼저 선택해 주세요.');
                const fingerprint = contextFingerprint();
                const plan = generateWeek(chosenWeek, { sessions: sessions() });
                showPlanPreview(plan, { guard: () => contextFingerprint() === fingerprint });
            } }, '규칙으로 생성'), h('button', { onclick: () => openAiSheet(chosenWeek, opt.signal) }, 'AI로 생성'))));
    }
    function weekCard(s) {
        return h('.card', null, h('h3', null, '요일별 부위'), h('p.hint', null, '선택하지 않은 날은 휴식입니다. 앞에 고른 부위가 주 부위예요.'), ...[1, 2, 3, 4, 5, 6, 0].map(d => {
            const row = h('div', { style: { marginTop: '14px' } }), choices = new Set(s.plan.week[d]), label = h('.lbl'), chips = h('.chips');
            const paint = () => { label.textContent = `${DOW_KO[d]}요일${choices.size ? '' : ' · 휴식'}`; mount(chips, ...GROUPS.map(g => h('button.chip', { 'aria-pressed': choices.has(g.id), onclick: () => { choices.has(g.id) ? choices.delete(g.id) : choices.add(g.id); updateRecommended(next => { next.plan.week[d] = [...choices]; }); } }, g.short))); };
            paint();
            mount(row, label, chips);
            return row;
        }), h('hr.rule'), field('같은 부위 조합의 종목 구성', select(s.plan.variantsPerGroup, [[1, '항상 같은 종목'], [2, '2벌 · A/B'], [3, '3벌 · A/B/C']], v => setSetting('plan.variantsPerGroup', Number(v)))), field('주간 종목 변화', select(s.plan.rotationMode, [['rotation', '기존 방식 · 매주 로테이션'], ['stable', '주요 종목 유지 + 보조 종목 교체']], v => setSetting('plan.rotationMode', v))), field('주요 종목 유지 기간', stepper({ value: s.plan.stableWeeks, min: 1, max: 12, step: 1, format: v => `${v}주`, onchange: v => setSetting('plan.stableWeeks', v) }), '자동 증량 주기가 아니라 같은 종목을 비교하는 기간입니다.'));
    }
    function sessionCard(s) {
        const direct = s.plan.dailyExerciseCount != null;
        return h('.card', null, h('h3', null, '운동시간과 목표'), field('하루 운동시간', stepper({ value: s.plan.sessionMinutes, min: 20, max: 150, step: 5, format: v => `${v}분`, onchange: v => updateRecommended(next => { next.plan.sessionMinutes = v; }) }), '운동량을 채우는 목표가 아니라 넘지 않을 최대 시간입니다. 웜업·휴식·기구 준비·카운트다운을 포함합니다.'), switchRow('하루 종목 수 직접 지정', '끄면 시간·부위별 목표에 맞춰 자동으로 정해요.', direct, v => updateRecommended(next => { next.plan.dailyExerciseCount = v ? 6 : null; })), direct ? field('운동일마다 요청할 종목 수', stepper({ value: s.plan.dailyExerciseCount, min: 1, max: 12, step: 1, format: v => `${v}종목`, onchange: v => updateRecommended(next => { next.plan.dailyExerciseCount = v; }) }), '규칙·AI 계획 모두에 적용합니다. 조건상 부족하면 실제 생성 수와 이유를 보여줘요.') : h('p.hint', null, '하루 종목 수 · 자동'), field('목표', select(s.plan.goal, [['general', '꾸준한 일반 운동'], ['strength', '근력 중심'], ['hypertrophy', '근비대 중심']], v => updateRecommended(next => { next.plan.goal = v; }))), field('경험 수준', select(s.plan.experience, [['unknown', '아직 설정하지 않음'], ['beginner', '입문'], ['intermediate', '중급'], ['advanced', '숙련']], v => updateRecommended(next => { next.plan.experience = v; }))), switchRow('웜업 세트 포함', '기구와 준비한 동작을 구분합니다. 추정 중량은 확인이 필요해요.', s.plan.warmup, v => updateRecommended(next => { next.plan.warmup = v; })), field('증량 판단에 필요한 여유 횟수', stepper({ value: s.plan.targetRir, min: 0, max: 5, step: 1, format: v => `RIR ${v}`, onchange: v => setSetting('plan.targetRir', v) }), '본세트 전체가 목표를 채우고 이 여유가 확인된 경우에만 다음 기구 단계를 제안해요.'));
    }
    function volumeCard(s) {
        const { targets, recommendation } = resolveWeeklyTargets(s.plan, s, recommendationContext());
        const maxMinutes = Math.max(0, ...recommendation.dayEstimates.map(day => day.minutes));
        return h('.card', null,
            h('h3', null, '부위별 주간 본세트 목표'),
            h('p.hint', null, `${recommendation.summary} · 가장 긴 날 약 ${maxMinutes}분. 카운트·휴식·기구 전환을 포함해 시간 안에서 계산한 편집 가능한 출발값이에요.`),
            h('details', { open: true }, h('summary', null, '추천 근거와 목표량 조절'),
                ...GROUPS.map(g => {
                    const manual = s.plan.weeklyTargetModes[g.id] === 'manual';
                    const change = v => { replaceSettings(applyWeeklyTargetChoice(settings(), g.id, 'manual', v, recommendationContext())); draw(); };
                    return h('.target-row', null,
                        h('.target-copy', null, h('.lbl', null, g.name, h('span.target-mode', { class: manual ? 'manual' : '' }, manual ? '수동' : '자동')), h('p.hint', null, manual ? `수동 ${targets[g.id]}세트 · 현재 자동 추천 ${recommendation.targets[g.id]}세트 · ${recommendation.reasons[g.id]}` : `자동 ${targets[g.id]}세트 · ${recommendation.reasons[g.id]}`)),
                        stepper({ value: targets[g.id], min: 0, max: 30, step: 1, format: v => `${v}세트`, onchange: change }),
                        manual ? h('button.btn-sm.btn-ghost', { onclick: () => { replaceSettings(applyWeeklyTargetChoice(settings(), g.id, 'auto', null, recommendationContext())); draw(); } }, '자동 추천으로') : null);
                })),
            h('p.hint', null, '프레스 등에서 함께 쓰이는 보조 부위는 결과에서 따로 표시합니다. 자동 추천은 개인 맞춤 처방이 아니므로 회복과 실제 수행에 맞춰 수동 조정해 주세요.'));
    }
    function benchmarkCard(s) {
        const preview = h('p.hint');
        const paintPreview = () => {
            const marks = resolveBenchmarks(settings().plan.benchmarks, sessions());
            const rows = ['db_bench', 'lat_pulldown', 'leg_press', 'side_raise'].map(id => ({ ex: findExercise(id), suggestion: recommendWeight(id, { sessions: [], marks }) })).filter(x => x.suggestion);
            preview.textContent = rows.length ? '입력값 기준 미리보기 · ' + rows.map(({ ex, suggestion }) => `${ex.name} ${fmtWeight(suggestion.weight, settings().unit)} (${suggestion.source === 'estimate' ? '추정' : '기준'})`).join(' · ') : '대응하는 기준 무게가 있는 종목만 추정해요. 모르는 종목은 빈칸으로 남깁니다.';
        };
        const fields = BENCHMARKS.map(b => {
            const original = s.plan.benchmarks[b.id], input = weightInput(original, s.unit);
            input.addEventListener('change', () => {
                try {
                    setSetting(`plan.benchmarks.${b.id}`, readWeightInput(input, original, s.unit));
                    paintPreview();
                }
                catch (e) {
                    toast(e.message);
                }
            });
            return field(`${b.name} (${s.unit})`, input, b.hint);
        });
        paintPreview();
        return h('.card', null, h('h3', null, '기준 무게'), h('p.hint', null, '확인된 같은 종목 기록이 우선이에요. 다른 종목에서 환산한 값은 보수적인 추정값으로 표시합니다.'), ...fields, preview, h('details', null, h('summary', null, '기구별 증량 단계·최소 중량'), h('p.hint', null, '내부 기준은 kg입니다. 실제 기구 단계와 맞춰 주세요. 최소 0은 미지정입니다.'), ...Object.keys(s.plan.weightSteps).map(eq => h('div', null, h('.lbl', null, eq), h('.btn-row', null, field('증량 단계 (kg)', h('input', { type: 'number', min: .1, max: 50, step: .1, value: s.plan.weightSteps[eq], onchange: e => setSetting(`plan.weightSteps.${eq}`, finite(e.target.value, .1, 50, '증량 단계')) })), field('최소 중량 (kg)', h('input', { type: 'number', min: 0, max: 100, step: .5, value: s.plan.minimumLoads[eq] || 0, onchange: e => setSetting(`plan.minimumLoads.${eq}`, finite(e.target.value, 0, 100, '최소 중량')) }))))), field('한 번에 허용할 최대 증량률', stepper({ value: s.plan.maxIncreasePercent, min: 1, max: 20, step: 1, format: v => `${v}%`, onchange: v => setSetting('plan.maxIncreasePercent', v) }))));
    }
    function equipmentCard(s) {
        const readiness = equipmentReadiness(s.plan), selectedMachines = machineNames(s.plan.machineIds);
        return h('.card', null, h('h3', null, '사용 가능한 기구'), h('p.hint', { class: readiness.ready && !readiness.needsMachineReview ? '' : 'warning' }, readiness.ready && !readiness.needsMachineReview ? '선택한 기구와 머신만 규칙·AI 계획에 사용합니다. 맨몸은 수동 추가 전용입니다.' : readiness.message),
            h('.chips', null, ...EQUIPMENT.map(eq => h('button.chip', { 'aria-pressed': s.plan.equipment.includes(eq), onclick: () => updateRecommended(next => { const selected = new Set(next.plan.equipment); selected.has(eq) ? selected.delete(eq) : selected.add(eq); next.plan.equipment = [...selected]; }) }, eq))),
            h('hr.rule'), h('.card-head', null, h('div', null, h('.lbl', null, '헬스장'), h('p.hint', null, '헬스장에서 사용할 머신을 선택합니다.'), h('p.hint', null, selectedMachines.length ? `${selectedMachines.length}개 선택 · ${selectedMachines.join(', ')}` : '선택한 머신이 없어요. 머신 운동은 자동 계획에서 제외됩니다.')), h('button.btn-sm', { onclick: () => pickMachines(s.plan.machineIds, ids => updateRecommended(next => { next.plan.machineIds = ids; next.plan.equipmentReviewRequired = false; })) }, '머신 추가')));
    }
    function avoidCard() {
        const changeAvoid = id => updateRecommended(next => { const selected = new Set(next.avoidExerciseIds); selected.has(id) ? selected.delete(id) : selected.add(id); next.avoidExerciseIds = [...selected]; });
        return h('.card', null, h('.card-head', null, h('h3', null, '피할 종목'), h('button.btn-sm', { onclick: () => pickExercise(null, ex => changeAvoid(ex.id), { equipmentOnly: false }) }, '추가')), ...avoidExerciseIds().map(id => h('.row', null, h('span.grow', null, findExercise(id, customExercises())?.name || id), h('button.btn-sm', { onclick: () => changeAvoid(id) }, '제외 해제'))), !avoidExerciseIds().length ? h('p.hint', null, '등록한 종목이 없어요. 자동·AI 생성 모두 이 목록을 지킵니다.') : null);
    }
    draw();
}
function renderPlanHome(root) {
    const weekStart = ymd(weekStartOf()), current = getPlan(weekStart);
    const longTerm = current && current.source !== 'today';
    const trainingDays = longTerm ? current.days.filter(day => day.blocks.length).length : 0;
    const exercises = longTerm ? current.days.reduce((sum, day) => sum + day.blocks.length, 0) : 0;
    mount(root,
        pageHead('운동계획', '장기 프로그램과 오늘 운동을 나눠 간단하게 만들어요'),
        h('.card.plan-entry-card', null,
            h('p.eyebrow', null, '내 프로그램'),
            h('h2', null, longTerm ? '이번 주 프로그램' : '아직 만든 장기 프로그램이 없어요'),
            h('p.hint', null, longTerm ? `${trainingDays}일 · ${exercises}종목이 저장돼 있어요. 세부 설정과 자동 계획은 안쪽에서 관리합니다.` : '요일별 반복 계획이 필요할 때만 만들면 됩니다. 없어도 자유운동을 바로 기록할 수 있어요.'),
            longTerm ? h('button.btn-block', { onclick: () => go('/exec/' + weekStart) }, '이번 주 프로그램 보기') : null,
            h('button.btn-block.btn-primary', { onclick: () => go('/plan/long-term') }, longTerm ? '장기 프로그램 설정·다시 만들기' : '장기 프로그램 만들기')),
        h('.card.plan-entry-card.today-entry', null,
            h('p.eyebrow', null, '오늘 운동'),
            h('h2', null, '오늘의 운동 만들기'),
            h('p.hint', null, '운동을 하나씩 고르고 본세트 무게와 세트 수만 정합니다. 휴식과 선택한 웜업은 자동으로 준비해요.'),
            h('button.btn-block.btn-primary.btn-lg', { onclick: () => go('/plan/today') }, '오늘의 운동 만들기')));
}
function select(current, choices, onchange) { return h('select', { onchange: e => onchange(e.target.value) }, ...choices.map(([value, label]) => h('option', { value, selected: String(current) === String(value) }, label))); }
function openAiSheet(weekStart, routeSignal) {
    const fingerprint = contextFingerprint(), baseline = JSON.stringify(getPlan(weekStart));
    const controller = new AbortController();
    let closed = false;
    const abort = () => controller.abort();
    routeSignal?.addEventListener('abort', abort, { once: true });
    modal(close => {
        const request = h('textarea', { maxLength: 3000, placeholder: '이번 주 일정, 피할 동작, 계획에서 바꾸고 싶은 점' }), status = h('p.hint', { 'aria-live': 'polite' }), button = h('button.btn-block.btn-primary', null, '검토용 계획 생성');
        button.addEventListener('click', async () => {
            button.disabled = true;
            request.disabled = true;
            status.textContent = 'AI에 요청했어요. 취소해도 기존 계획은 유지됩니다.';
            try {
                const result = await generatePlanWithAi(weekStart, request.value, [], { signal: controller.signal });
                if (closed || controller.signal.aborted)
                    return;
                if (contextFingerprint() !== fingerprint)
                    throw new Error('요청 중 설정이나 기록이 바뀌었어요. 새 조건으로 다시 생성해 주세요.');
                const plan = normalizeAiPlan(result.plan, weekStart, sessions());
                plan.ai = { model: result.model, usage: result.usage };
                close();
                toast(`초안 생성 · ${result.model} · 입력 ${result.usage?.input_tokens || 0} / 출력 ${result.usage?.output_tokens || 0} 토큰`, 6000);
                showPlanPreview(plan, { baseline, guard: () => contextFingerprint() === fingerprint });
            }
            catch (e) {
                if (!closed) {
                    status.textContent = e.name === 'AbortError' ? '요청을 취소했어요.' : e.message;
                    button.disabled = false;
                    request.disabled = false;
                }
            }
        });
        return h('div', null, h('h3', null, settings().aiProvider === 'openai' ? 'OpenAI로 계획 생성' : 'Claude로 계획 생성'), h('p.hint', null, '요일·기구·주간 목표·기준 무게와 최근 12회 중 확인된 본세트를 선택한 AI 제공자에게 전송합니다. API 사용료는 해당 계정에 별도로 부과돼요.'), field('이번 주 요청', request), button, status, h('button.btn-block.btn-ghost', { onclick: close }, '요청 취소·닫기'));
    }, { onClose: () => { closed = true; controller.abort(); routeSignal?.removeEventListener('abort', abort); } });
}
