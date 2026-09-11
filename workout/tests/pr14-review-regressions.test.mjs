import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../js/config.js';
import { applyWeeklyTargetChoice, generateWeek, recommendWeeklyTargets, resolveWeeklyTargets, syncAutomaticWeeklyTargets } from '../js/planner.js';
import { navigationTab } from '../js/util.js';

const clone = value => structuredClone(value);
function upperSettings(minutes = 60, dailyExerciseCount = 4) {
    const settings = clone(DEFAULT_SETTINGS);
    settings.plan.sessionMinutes = minutes;
    settings.plan.dailyExerciseCount = dailyExerciseCount;
    settings.plan.equipment = ['바벨', '덤벨', '케이블', '스미스머신'];
    settings.plan.machineIds = ['chest_press', 'incline_press', 'pec_deck'];
    settings.plan.week = { 0: [], 1: ['chest', 'delt_f', 'triceps'], 2: ['back', 'delt_sr', 'biceps'], 3: [], 4: ['chest', 'delt_f', 'triceps'], 5: ['back', 'delt_sr', 'biceps'], 6: [] };
    return settings;
}
function chestOnlySettings(minutes = 150, dailyExerciseCount = 10) {
    const settings = upperSettings(minutes, dailyExerciseCount);
    settings.plan.week = { 0: [], 1: ['chest'], 2: [], 3: [], 4: [], 5: [], 6: [] };
    return settings;
}

test('automatic targets start at four sets per exercise without filling spare time', () => {
    const sixty = recommendWeeklyTargets(upperSettings(60, 4).plan, upperSettings(60, 4));
    const fiftyFive = recommendWeeklyTargets(upperSettings(55, 4).plan, upperSettings(55, 4));
    const long = recommendWeeklyTargets(chestOnlySettings().plan, chestOnlySettings());
    assert.equal(sixty.baseSetsPerExercise, 4);
    assert.equal(sixty.exerciseSlots.chest, 4);
    assert.equal(sixty.targets.chest, 16);
    assert.equal(fiftyFive.targets.chest <= sixty.targets.chest, true);
    assert.equal(long.baseSetsPerExercise, 4);
    assert.equal(long.exerciseSlots.chest, 10);
    assert.equal(long.targets.chest, 20);
    assert.match(long.reasons.chest, /앱 자동 추천 상한 20/);
});

test('shorter budgets reduce sets and daily exercise count recalculates the same target model', () => {
    const short = upperSettings(20, 4), three = upperSettings(60, 3), four = upperSettings(60, 4);
    const shortResult = recommendWeeklyTargets(short.plan, short);
    const threeResult = recommendWeeklyTargets(three.plan, three);
    const fourResult = recommendWeeklyTargets(four.plan, four);
    assert.ok(shortResult.targets.chest < fourResult.targets.chest);
    assert.ok(shortResult.dayEstimates.every(day => day.withinBudget && day.minutes <= 20));
    assert.equal(threeResult.targets.chest, 8);
    assert.equal(fourResult.targets.chest, 16);
});

test('recommendation text, effective target and generated direct sets stay aligned', () => {
    const settings = upperSettings(60, 4);
    const recommendation = recommendWeeklyTargets(settings.plan, settings);
    const generated = generateWeek('2026-09-07', { plan: settings.plan });
    assert.match(recommendation.reasons.chest, /주 2회.*총 4종목.*평균 4본세트/);
    assert.equal(generated.analysis.targets.chest, recommendation.targets.chest);
    assert.equal(generated.analysis.direct.chest, recommendation.targets.chest);
});

test('automatic and manual weekly target choices have explicit stable transitions', () => {
    const context = { custom: [], avoid: [] };
    let settings = syncAutomaticWeeklyTargets(upperSettings(60, 4), context);
    assert.equal(settings.plan.weeklyTargetModes.chest, 'auto');
    assert.equal(settings.plan.weeklyTargets.chest, 16);
    settings = applyWeeklyTargetChoice(settings, 'chest', 'manual', 14, context);
    assert.equal(settings.plan.weeklyTargetModes.chest, 'manual');
    assert.equal(settings.plan.weeklyTargets.chest, 14);
    settings.plan.sessionMinutes = 55;
    settings = syncAutomaticWeeklyTargets(settings, context);
    const manual = resolveWeeklyTargets(settings.plan, settings, context);
    assert.equal(manual.targets.chest, 14);
    assert.notEqual(manual.recommendation.targets.chest, null);
    settings = applyWeeklyTargetChoice(settings, 'chest', 'auto', null, context);
    assert.equal(settings.plan.weeklyTargetModes.chest, 'auto');
    assert.equal(settings.plan.weeklyTargets.chest, manual.recommendation.targets.chest);
});

test('session detail routes activate the history navigation meaning', () => {
    assert.equal(navigationTab('/history'), '/history');
    assert.equal(navigationTab('/session/session-2026-09-11'), '/history');
    assert.equal(navigationTab('/plan'), '/plan');
    assert.equal(navigationTab('/settings'), '/settings');
});
