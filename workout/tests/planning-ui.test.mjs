import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../js/config.js';
import { validateSettings, validateSession } from '../js/validation.js';
import { byGroup, findExercise, exerciseAllowed } from '../js/exercises.js';
import { generateWeek, analyzePlan } from '../js/planner.js';
import { Runner } from '../js/runner.js';
import { normalizeEditedDay, dayEditSummary, moveDayBlock, removeDayBlock, appendDayBlock } from '../js/views/dayEditor.js';
import { suggestFromHistory } from '../js/weights.js';

const clone = value => structuredClone(value);
const silentAudio = { stop() {}, speakCount() {}, beep() {}, cue: new Proxy({}, { get: () => () => {} }) };
function testDay(sets = 2) {
    return { id: 'day-test', date: '2026-09-10', title: '가슴', blocks: [{ id: 'block-test', exerciseId: 'bb_bench', name: '바벨 벤치프레스', group: 'chest', equip: '바벨', pattern: 'press_h', compound: true, measure: 'reps', loadBasis: 'total', rest: 90, tempo: 1,
        sets: Array.from({ length: sets }, (_, index) => ({ id: `plan-set-${index}`, reps: 8, weight: 60, warmup: false })) }] };
}
function runnerFixture({ sets = 2, config = {}, start = 1_000 } = {}) {
    let now = start;
    const settings = { ...clone(DEFAULT_SETTINGS), countdownSec: 0, autoStartRest: false, ...config };
    const runner = new Runner(testDay(sets), { settings, now: () => now, noTimer: true, audio: silentAudio });
    runner.start();
    return { runner, advance(ms) { now += ms; runner.tick(); }, now: () => now };
}

test('new planning settings default to automatic daily count and review auto advance', () => {
    const settings = validateSettings({});
    assert.equal(settings.plan.dailyExerciseCount, null);
    assert.equal(settings.reviewAutoAdvance, true);
    assert.equal(settings.reviewAutoAdvanceSec, 5);
});

test('legacy broad machine setting is preserved as an explicit review requirement, not guessed', () => {
    const settings = validateSettings({ plan: { equipment: ['바벨', '머신', '원판'] } });
    assert.deepEqual(settings.plan.equipment, ['바벨']);
    assert.deepEqual(settings.plan.machineIds, []);
    assert.equal(settings.plan.equipmentReviewRequired, true);
});

test('equipment predicate separates cable, selected machines, and manual-only bodyweight', () => {
    const none = { equipment: [], machineIds: [] };
    assert.equal(exerciseAllowed(findExercise('bb_bench'), none), false);
    assert.equal(exerciseAllowed(findExercise('pushup'), none), false);
    assert.equal(exerciseAllowed(findExercise('pushup'), none, { manual: true }), true);
    const cable = { equipment: ['케이블'], machineIds: [] };
    assert.equal(exerciseAllowed(findExercise('cable_cross'), cable), true);
    assert.equal(exerciseAllowed(findExercise('lat_pulldown'), cable), false);
    const latMachine = { equipment: [], machineIds: ['lat_pulldown'] };
    assert.equal(exerciseAllowed(findExercise('lat_pulldown'), latMachine), true);
    assert.equal(exerciseAllowed(findExercise('machine_press'), latMachine), false);
    assert.ok(byGroup('back', [], latMachine, []).some(exercise => exercise.id === 'lat_pulldown'));
});

test('a multifunction machine can enable multiple mapped exercises without enabling unrelated machines', () => {
    const plan = { equipment: [], machineIds: ['assist_pullup_dip'] };
    assert.equal(exerciseAllowed(findExercise('assist_pullup'), plan), true);
    assert.equal(exerciseAllowed(findExercise('assist_dip'), plan), true);
    assert.equal(exerciseAllowed(findExercise('machine_dip'), plan), false);
    const custom = { id: 'custom-machine', name: '내 머신 운동', group: 'chest', equip: '머신', machineIds: ['chest_press'], sets: 3, reps: 10, rest: 60, tier: 2 };
    assert.equal(exerciseAllowed(custom, { equipment: [], machineIds: ['chest_press'] }), true);
    assert.equal(exerciseAllowed(custom, plan), false);
    const pecDeck = { equipment: [], machineIds: ['pec_deck'] };
    assert.equal(exerciseAllowed(findExercise('pec_deck'), pecDeck), true);
    assert.equal(exerciseAllowed(findExercise('rear_pec_deck'), pecDeck), true);
    assert.equal(exerciseAllowed(findExercise('machine_side'), pecDeck), false);
    assert.equal(exerciseAllowed(findExercise('seated_leg_curl'), { equipment: [], machineIds: ['seated_leg_curl'] }), true);
    assert.equal(exerciseAllowed(findExercise('leg_curl'), { equipment: [], machineIds: ['lying_leg_curl'] }), true);
    assert.equal(exerciseAllowed(findExercise('leg_curl'), { equipment: [], machineIds: ['seated_leg_curl'] }), false);
});

test('bodyweight and added-load metadata stays manual-only for automatic planning', () => {
    const added = { id: 'weighted-dip', name: '중량 딥스', group: 'triceps', equip: '바벨', loadBasis: 'added', sets: 3, reps: 8, rest: 90, tier: 2 };
    assert.equal(exerciseAllowed(added, { equipment: ['바벨'], machineIds: [] }), false);
    assert.equal(exerciseAllowed(added, { equipment: ['바벨'], machineIds: [] }, { manual: true }), true);
    const bodyweightDay = { date: '2026-09-10', blocks: [{ ...findExercise('pushup'), exerciseId: 'pushup', sets: [{ reps: 15, warmup: false }] }] };
    const report = analyzePlan({ days: [bodyweightDay] }, { ...clone(DEFAULT_SETTINGS), plan: { ...clone(DEFAULT_SETTINGS.plan), equipment: [], machineIds: [] } });
    assert.equal(report.warnings.some(message => message.includes('기구/제외 설정')), false);
});

test('rule planner refuses incomplete equipment instead of treating no selection as unlimited', () => {
    assert.throws(() => generateWeek('2026-09-07', { plan: { ...clone(DEFAULT_SETTINGS.plan), equipment: [], machineIds: [] } }), /기구|머신/);
});

test('rule planner honors explicit daily count without duplicates and reports any shortfall', () => {
    const planSettings = { ...clone(DEFAULT_SETTINGS.plan), equipment: ['바벨', '덤벨', '케이블', '스미스머신'], machineIds: [], dailyExerciseCount: 4, equipmentReviewRequired: false };
    const plan = generateWeek('2026-09-07', { plan: planSettings, sessions: [] });
    for (const day of plan.days.filter(day => day.groupIds.length)) {
        assert.ok(day.blocks.length <= 4);
        assert.equal(new Set(day.blocks.map(block => block.exerciseId)).size, day.blocks.length);
    }
    assert.ok(plan.days.some(day => day.blocks.length === 4));
});

test('day editor model updates only the draft day and supports a completely empty day', () => {
    const source = testDay(2), draft = clone(source);
    draft.blocks = [];
    const normalized = normalizeEditedDay(draft), report = dayEditSummary(normalized);
    assert.equal(source.blocks.length, 1);
    assert.equal(normalized.title, '휴식');
    assert.deepEqual(normalized.groupIds, []);
    assert.deepEqual(report, { exercises: 0, workSets: 0, minutes: 0, groups: [] });
});

test('day editor can batch reorder, remove the last item, and add again without touching source data', () => {
    const source = testDay(2), otherDay = clone(testDay(1)), completed = { id: 'past', entries: [{ exerciseId: 'bb_bench' }] };
    source.blocks.push({ ...clone(source.blocks[0]), id: 'block-second', exerciseId: 'db_bench', name: '덤벨 벤치프레스' });
    const draftDay = clone(source);
    assert.equal(moveDayBlock(draftDay, 1, -1), true);
    assert.deepEqual(draftDay.blocks.map(block => block.exerciseId), ['db_bench', 'bb_bench']);
    assert.equal(removeDayBlock(draftDay, 1), true);
    assert.equal(removeDayBlock(draftDay, 0), true);
    assert.equal(normalizeEditedDay(draftDay).title, '휴식');
    assert.equal(appendDayBlock(draftDay, clone(source.blocks[0])), true);
    assert.equal(appendDayBlock(draftDay, clone(source.blocks[0])), false);
    assert.deepEqual(source.blocks.map(block => block.exerciseId), ['bb_bench', 'db_bench']);
    assert.equal(otherDay.blocks.length, 1);
    assert.equal(completed.entries[0].exerciseId, 'bb_bench');
});

test('review automatically records after five seconds with an unconfirmed auto source', () => {
    const { runner, advance } = runnerFixture();
    runner.beginSet();
    runner.finishSet(8);
    assert.equal(runner.state, 'review');
    advance(4_999);
    assert.equal(runner.setRec.done, false);
    advance(1);
    const recorded = runner.session.entries[0].sets[0];
    assert.equal(recorded.done, true);
    assert.equal(recorded.confirmed, false);
    assert.equal(recorded.confirmationSource, 'auto');
    assert.equal(runner.state, 'setdone');
});

test('manual review action records immediately as confirmed and cannot duplicate', () => {
    const { runner, advance } = runnerFixture();
    runner.beginSet();
    runner.finishSet(7);
    assert.equal(runner.recordReview('manual'), true);
    assert.equal(runner.session.entries[0].sets[0].confirmationSource, 'manual');
    assert.equal(runner.session.entries[0].sets[0].confirmed, true);
    advance(10_000);
    assert.equal(runner.doneSets, 1);
});

test('automatic review respects rest preference and final-set completion labels/state', () => {
    const withRest = runnerFixture({ config: { autoStartRest: true } });
    withRest.runner.beginSet();
    withRest.runner.finishSet(8);
    withRest.advance(5_000);
    assert.equal(withRest.runner.state, 'resting');
    const final = runnerFixture({ sets: 1 });
    final.runner.beginSet();
    final.runner.finishSet(8);
    final.advance(5_000);
    assert.equal(final.runner.state, 'done');
    assert.equal(final.runner.session.status, 'completed');
});

test('disabled automatic review never starts and canceling a review invalidates its generation', () => {
    const disabled = runnerFixture({ config: { reviewAutoAdvance: false } });
    disabled.runner.beginSet();
    disabled.runner.finishSet(8);
    assert.equal(disabled.runner.reviewAuto, null);
    disabled.advance(30_000);
    assert.equal(disabled.runner.setRec.done, false);
    const active = runnerFixture();
    active.runner.beginSet();
    active.runner.finishSet(8);
    active.runner.cancelSet();
    active.advance(10_000);
    assert.equal(active.runner.state, 'ready');
    assert.equal(active.runner.setRec.done, false);
});

test('stopping an active runner invalidates a pending review timer', () => {
    const { runner, advance } = runnerFixture();
    runner.beginSet();
    runner.finishSet(8);
    runner.stop();
    advance(10_000);
    assert.equal(runner.setRec.done, false);
    assert.equal(runner.reviewAuto, null);
});

test('review input interaction cancels auto action and invalid input cannot restart it', () => {
    const { runner, advance } = runnerFixture();
    runner.beginSet();
    runner.finishSet(8);
    runner.updateReviewDraft({ reps: '' });
    assert.equal(runner.reviewAuto, null);
    assert.throws(() => runner.startReviewAuto(), /입력/);
    advance(10_000);
    assert.equal(runner.setRec.done, false);
    runner.updateReviewDraft({ reps: '6' });
    assert.equal(runner.startReviewAuto(), true);
    advance(5_000);
    assert.equal(runner.session.entries[0].sets[0].reps, 6);
});

test('pause and restored draft keep review values but never resume auto confirmation', () => {
    const { runner, advance } = runnerFixture();
    runner.beginSet();
    runner.finishSet(8);
    runner.updateReviewDraft({ reps: '7' });
    runner.startReviewAuto();
    runner.pause('모달');
    advance(10_000);
    assert.equal(runner.setRec.done, false);
    const restored = Runner.fromDraft(runner.snapshot(), { settings: runner.config, now: runner.clock, noTimer: true, audio: silentAudio });
    assert.equal(restored.state, 'paused');
    assert.equal(restored.reviewDraft.reps, '7');
    restored.resume();
    assert.equal(restored.state, 'review');
    assert.equal(restored.reviewAuto, null);
});

test('auto-only history stays visible but is excluded from progression evidence', () => {
    const session = validateSession({ id: 'session-auto', date: '2026-09-10', title: '자동 기록', startedAt: 1, endedAt: 2, status: 'completed', entries: [{ id: 'entry-auto', exerciseId: 'bb_bench', name: '바벨 벤치프레스', group: 'chest', equip: '바벨', sets: [{ id: 'set-auto', targetReps: 8, reps: 8, weight: 60, done: true, confirmed: false, confirmationSource: 'auto', warmup: false }] }] });
    assert.equal(session.entries[0].sets[0].done, true);
    assert.equal(suggestFromHistory(findExercise('bb_bench'), [session], { today: '2026-09-10' }), null);
});
