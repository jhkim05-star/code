/** Product defaults, not individualized training prescriptions. Existing choices are migrated. */
export const VERSION = '2.3.2-counter-audio-resume';
export const GROUP_IDS = ['chest', 'back', 'delt_f', 'delt_sr', 'biceps', 'triceps', 'thighs', 'glutes', 'calves', 'core'];
export const LEGACY_WEEKLY_TARGETS = Object.freeze({ chest: 8, back: 8, delt_f: 4, delt_sr: 6, biceps: 6, triceps: 6, thighs: 8, glutes: 6, calves: 6, core: 4 });
export const DEFAULT_SETTINGS = {
    tempo: 3, tempoMin: 0.5, tempoMax: 6, countdownSec: 3, announceLastReps: 2,
    countMode: 'auto', phaseTempo: null,
    restDefault: 90, warmupRest: 45, warmupToWorkRest: 90,
    exerciseRest: 120, exerciseSetup: 30, restWarnSec: 10,
    autoStartRest: true, autoAdvance: true, autoNextExercise: false,
    reviewAutoAdvance: true, reviewAutoAdvanceSec: 5,
    voiceEnabled: true, voiceURI: '', voiceRate: 1, voicePitch: 1.25, voiceVolume: 1,
    countStyle: 'native', beepEnabled: true, keepAwake: true, unit: 'kg',
    aiProvider: 'claude', aiTransport: 'proxy',
    aiProxyUrl: '', openaiProxyUrl: '', lastBackupAt: '',
    plan: {
        equipment: [], machineIds: [], equipmentReviewRequired: false,
        dailyExerciseCount: null, variantsPerGroup: 2, sessionMinutes: 60, warmup: false,
        rotationMode: 'stable', stableWeeks: 4, blockAnchor: '2024-01-01',
        goal: 'general', experience: 'unknown', targetRir: 2,
        weeklyTargets: { ...LEGACY_WEEKLY_TARGETS },
        weeklyTargetModes: Object.fromEntries(GROUP_IDS.map(group => [group, 'auto'])),
        benchmarks: { bench: null, pulldown: null, squat: null, ohp: null },
        weightSteps: { '바벨': 2.5, '스미스머신': 2.5, '덤벨': 1, '머신': 5, '케이블': 2.5, '원판': 1.25, '기타': 1 },
        minimumLoads: { '바벨': 0, '스미스머신': 0, '덤벨': 0, '머신': 0, '케이블': 0, '원판': 0, '기타': 0 },
        maxIncreasePercent: 10, staleDays: 42, estimateScale: 0.8,
        week: { 1: ['chest', 'delt_f', 'triceps'], 2: ['back', 'delt_sr', 'biceps'], 3: [], 4: ['chest', 'delt_f', 'triceps'], 5: ['back', 'delt_sr', 'biceps'], 6: [], 0: ['thighs', 'glutes', 'calves'] },
    },
    avoidExerciseIds: [],
};
export const emptyData = () => ({ settings: structuredClone(DEFAULT_SETTINGS), plans: {}, sessions: [], customExercises: [], meta: { rotation: {}, schema: 2 }, draft: null });
