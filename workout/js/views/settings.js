import { restoreProtectedBackup } from '../store.js';
/** Timing, sound, credentials and data recovery are independently configurable. */
import { h, mount, pageHead, field, switchRow, stepper, toast, modal, confirmSheet, chooseImportMode } from '../ui.js';
import { settings, setSetting, exportAll, importAll, wipeAll, customExercises, addCustomExercise, removeCustomExercise, sessions, plans, flush, metadata, resolveLegacyUnits, resolveLegacyConflict, exportRecoveryCopies, storageStatus } from '../store.js';
import { speakCount, koreanVoices, listVoices, reselectVoice, unlockAudio, hasClips, CUSTOM_VOICE_ID, customVoiceName, diagnose, stopSpeaking } from '../voice.js';
import { proxyToken, setProxyToken, testAiConnection } from '../ai.js';
import { GROUPS, EQUIPMENT } from '../exercises.js';
import { VERSION } from '../config.js';
import { parseBackup } from '../validation.js';
import { mmss, download, pickFile, uid, finite, todayYmd, dayDistance, ymd } from '../util.js';
export function renderSettings(root, params, { signal } = {}) {
    let previewTimer = null, closed = false, checkController = null;
    const draw = () => {
        if (closed)
            return;
        const s = settings();
        mount(root, pageHead('설정', `운동일지 ${VERSION}`), recoveryCard(), timingCard(s), countCard(s), voiceCard(s), aiCard(s), customCard(), dataCard(s), h('.card.flat', null, h('p.hint', null, '이 페이지의 버전은 캐시 이름이 아니라 실제 코드 버전이에요. 이전 버전으로 돌아갈 때는 수정 전 백업을 사용해 주세요.'), h('button.btn-block', { onclick: refreshApp }, '앱 파일 업데이트 확인')));
    };
    function recoveryCard() {
        const meta = metadata(), state = storageStatus();
        if (!meta.unitReviewRequired && !meta.legacyConflict && !state.readOnly)
            return null;
        return h('.card', null, h('h3', null, '기존 자료 확인'), h('p.hint.warning', null, state.readOnly ? state.message : '기존 버전의 lb 표시는 실제 변환 없이 라벨만 바뀌었어요. 원래 숫자가 어떤 단위였는지 확인해야 합니다.'), meta.unitReviewRequired ? h('div', null, h('p.hint', null, '아래 선택은 모든 기존 중량에 적용합니다. kg와 lb 기록이 섞였다면 일괄 선택하지 말고 원본 백업에서 개별 정정해 주세요.'), h('.btn-row', null, ...['kg', 'lb'].map(unit => h('button', { onclick: async () => {
                if (await confirmSheet({ title: `기존 숫자가 전부 ${unit}였나요?`, body: '변경 전 사본을 보관한 뒤 단위를 명시합니다.', confirmText: `${unit} 기준으로 확인` })) {
                    await resolveLegacyUnits(unit);
                    draw();
                }
            } }, `기존 숫자는 ${unit}`)))) : null, meta.legacyConflict ? h('div', null, h('p.hint', null, '최신 기록이 들어 있는 원본을 골라 주세요. 두 사본은 그대로 보관합니다.'), h('.btn-row', null, ...[['local', 'localStorage'], ['database', 'IndexedDB']].map(([which, label]) => h('button', { onclick: async () => {
                if (await confirmSheet({ title: `${label} 자료를 사용할까요?`, body: '복구용 원본 내보내기로 두 자료를 먼저 비교하는 것을 권해요.', confirmText: '이 원본으로 복구' })) {
                    await resolveLegacyConflict(which);
                    draw();
                }
            } }, label)))) : null, h('button.btn-block', { onclick: async () => download('운동일지-복구원본-개인보관.json', JSON.stringify(await exportRecoveryCopies(), null, 2)) }, '복구용 원본 내보내기 · 민감 정보 포함'));
    }
    function timingCard(s) {
        const timeField = (label, key, hint) => field(label, stepper({ value: s[key], min: 0, max: 900, step: 15, format: mmss, onchange: v => setSetting(key, v) }), hint);
        return h('.card', null, h('h3', null, '휴식·준비시간'), h('p.hint', null, '운동 사이 휴식은 본세트 휴식을 대체합니다. 기구 준비시간만 그 뒤에 따로 더해요.'), timeField('기본 본세트 사이 휴식', 'restDefault', '종목별 휴식이 있으면 그 값이 우선해요.'), timeField('웜업 사이 휴식', 'warmupRest'), timeField('마지막 웜업 → 첫 본세트', 'warmupToWorkRest'), timeField('운동 사이 휴식', 'exerciseRest'), timeField('다음 운동 기구 준비', 'exerciseSetup', '원판·벤치·자리 이동 시간입니다. 준비 완료로 일찍 끝낼 수 있어요.'), field('휴식 끝 알림', stepper({ value: s.restWarnSec, min: 0, max: 60, step: 5, format: v => v ? `${v}초 전` : '꺼짐', onchange: v => setSetting('restWarnSec', v) })), switchRow('기록 확인 후 휴식 자동 시작', null, s.autoStartRest, v => setSetting('autoStartRest', v)), switchRow('같은 운동의 다음 세트 자동 시작', null, s.autoAdvance, v => setSetting('autoAdvance', v)), switchRow('다음 운동도 자동 시작', '꺼두면 새 기구 준비 후 직접 시작해요.', s.autoNextExercise, v => setSetting('autoNextExercise', v)), switchRow('운동 중 화면 켜두기', '지원되는 기기에서 요청합니다. 화면을 벗어나면 일시정지해요.', s.keepAwake, v => setSetting('keepAwake', v)));
    }
    function countCard(s) {
        return h('.card', null, h('h3', null, '카운트'), field('기본 방식', select(s.countMode, [['auto', '자동 카운트'], ['manual', '버튼으로 수동 카운트']], v => setSetting('countMode', v))), field('기본 카운트 간격', stepper({ value: s.tempo, min: s.tempoMin, max: s.tempoMax, step: .1, format: v => v.toFixed(1) + '초', onchange: v => setSetting('tempo', v) }), '종목별 설정이 우선이며 운동 중에도 조절할 수 있어요.'), h('.btn-row', null, field('최소 간격(초)', h('input', { type: 'number', min: .2, max: 12, step: .1, value: s.tempoMin, onchange: e => { setSetting('tempoMin', finite(e.target.value, .2, 12, '최소 간격')); draw(); } })), field('최대 간격(초)', h('input', { type: 'number', min: .2, max: 12, step: .1, value: s.tempoMax, onchange: e => { setSetting('tempoMax', finite(e.target.value, .2, 12, '최대 간격')); draw(); } }))), field('실제 세트 시작 전 카운트다운', stepper({ value: s.countdownSec, min: 0, max: 15, step: 1, format: v => v ? `${v}초` : '없음', onchange: v => setSetting('countdownSec', v) })), field('마지막 횟수 알림', stepper({ value: s.announceLastReps, min: 0, max: 10, step: 1, format: v => v ? `${v}회 남을 때` : '없음', onchange: v => setSetting('announceLastReps', v) })), h('p.hint', null, '0초 속도는 쓰지 않아요. 플랭크는 횟수가 아니라 실제 초로 측정합니다.'));
    }
    function voiceCard(s) {
        const available = koreanVoices().length ? koreanVoices() : listVoices();
        const voices = select(s.voiceURI, [[hasClips() ? CUSTOM_VOICE_ID : '', hasClips() ? `녹음 · ${customVoiceName()}` : '자동 한국어 음성'], ...available.map(v => [v.voiceURI, v.name])], v => { setSetting('voiceURI', v); reselectVoice(); });
        if (!s.voiceURI && hasClips())
            voices.value = CUSTOM_VOICE_ID;
        const range = (label, key, min, max, step) => field(label, h('input', { type: 'range', min, max, step, value: s[key], 'aria-label': label, oninput: e => setSetting(key, Number(e.target.value)) }));
        return h('.card', null, h('h3', null, '음성'), switchRow('음성 카운트', null, s.voiceEnabled, v => setSetting('voiceEnabled', v)), switchRow('신호음', null, s.beepEnabled, v => setSetting('beepEnabled', v)), field('목소리', voices), range('음량', 'voiceVolume', 0, 1, .05), range('내장 음성 말하기 속도', 'voiceRate', .5, 2, .05), range('내장 음성 높이', 'voicePitch', .5, 2, .05), field('내장 음성 숫자 읽기', select(s.countStyle, [['native', '하나 · 둘 · 셋'], ['sino', '일 · 이 · 삼']], v => setSetting('countStyle', v))), h('p.hint', null, '녹음된 숫자의 읽기 방식과 음 높이는 파일 그대로예요. 해당 파일이 없거나 재생에 실패하면 내장 음성으로 전환합니다.'), h('.btn-row', null, h('button', { onclick: () => {
                clearInterval(previewTimer);
                stopSpeaking();
                unlockAudio();
                let n = 1;
                speakCount(n++);
                previewTimer = setInterval(() => {
                    if (closed || n > 3) {
                        clearInterval(previewTimer);
                        return;
                    }
                    speakCount(n++);
                }, Math.max(.5, settings().tempo) * 1000);
            } }, '음성 들어보기'), h('button', { onclick: async () => {
                const report = await diagnose();
                if (!closed)
                    modal(() => h('div', null, h('h3', null, '음성 진단'), ...Object.entries(report).map(([k, v]) => h('p.hint', null, `${k}: ${v}`))));
            } }, '소리 진단')));
    }
    function aiCard(s) {
        const url = h('input', { type: 'url', value: s.aiProxyUrl || s.openaiProxyUrl, placeholder: 'https://내워커.workers.dev', onchange: e => setSetting('aiProxyUrl', e.target.value.trim()) });
        const token = h('input', { type: 'password', value: proxyToken(), autocomplete: 'off', placeholder: '프록시 접속 토큰 · API 키 아님', onchange: e => setProxyToken(e.target.value) });
        const result = h('p.hint', { 'aria-live': 'polite' });
        return h('.card', null, h('h3', null, 'AI 계획'), field('AI 제공자', select(s.aiProvider, [['openai', 'OpenAI · ChatGPT 계열'], ['claude', 'Claude']], v => { setSetting('aiProvider', v); draw(); })), h('div', null, field('AI Worker 주소', url), field('프록시 접속 토큰', token, 'OpenAI/Claude API 키가 아닙니다. 이 탭의 sessionStorage에만 보관하고 JSON 백업에는 넣지 않아요.'), h('p.hint', null, '제공자 API 키와 모델 ID는 Worker에만 설정합니다. 브라우저에서 제공자 API를 직접 호출하지 않아요.')), h('button.btn-block', { onclick: async (e) => {
                checkController?.abort();
                checkController = new AbortController();
                e.currentTarget.disabled = true;
                const button = e.currentTarget;
                result.textContent = '연결 확인 중';
                try {
                    const r = await testAiConnection(checkController.signal);
                    if (!closed)
                        result.textContent = `${r.model} · ${r.note || '연결 확인됨'}`;
                }
                catch (err) {
                    if (!closed)
                        result.textContent = err.message;
                }
                finally {
                    button.disabled = false;
                }
            } }, '프록시 연결 확인'), result, h('p.hint', null, '계획 생성은 사용자가 버튼을 누를 때만 실행됩니다. 자동 재시도·자동 적용은 없어요. 비용은 제공자 사용량 화면에서 확인해 주세요.'));
    }
    function customCard() {
        return h('.card', null, h('.card-head', null, h('h3', null, '내가 추가한 종목'), h('button.btn-sm', { onclick: () => addCustomSheet(draw) }, '추가')), customExercises().length ? customExercises().map(ex => h('.row', null, h('span.grow', null, ex.name), h('small', null, GROUPS.find(g => g.id === ex.group)?.name), h('button.btn-sm', { 'aria-label': `${ex.name} 삭제`, onclick: async () => {
                if (await confirmSheet({ title: '사용자 종목을 목록에서 삭제할까요?', body: '기존 실제 기록은 유지합니다.', confirmText: '목록에서 삭제', danger: true })) {
                    removeCustomExercise(ex.id);
                    await flush();
                    draw();
                }
            } }, '삭제'))) : h('p.hint', null, '기본 종목 외에 하는 운동을 등록해 주세요. 시간 운동·중량 표기 방식도 지정할 수 있어요.'));
    }
    function dataCard(s) {
        const days = s.lastBackupAt ? dayDistance(ymd(new Date(s.lastBackupAt))) : null;
        const state = storageStatus();
        const backupButton = state.readOnly
            ? h('button', { onclick: async () => download('운동일지-복구원본-개인보관.json', JSON.stringify(await exportRecoveryCopies(), null, 2)) }, '복구 원본 내보내기 · 민감 정보 포함')
            : h('button', { onclick: () => { download(`운동일지-백업-${todayYmd()}.json`, JSON.stringify(exportAll(), null, 2)); setSetting('lastBackupAt', new Date().toISOString()); toast('백업 다운로드를 요청했어요. 파일이 저장됐는지 확인해 주세요.'); draw(); } }, '백업 내보내기');
        return h('.card', null, h('h3', null, '데이터·백업'), h('p.hint', null, `기록 ${sessions().length}회 · 계획 ${Object.keys(plans()).length}주 · 저장 중량 기준 kg`), field('화면 표시·입력 단위', select(s.unit, [['kg', 'kg'], ['lb', 'lb']], v => { setSetting('unit', v); draw(); }), '기록은 내부 kg로 유지하고 표시·입력 때 변환해요.'), h('p.hint', { class: days == null || days > 30 ? 'warning' : '' }, days == null ? '아직 백업 내보내기를 요청한 적이 없어요.' : `마지막 내보내기 요청: ${days}일 전. 파일 저장 완료 여부는 기기의 파일 앱에서 확인해 주세요.`), h('.btn-row', null, backupButton, h('button', { onclick: () => doImport(draw, () => !closed) }, '백업 불러오기')), h('p.hint', null, state.readOnly ? '현재 화면은 읽기 전용입니다. 일반 백업 대신 IndexedDB/localStorage 원본을 함께 내보냅니다.' : '제공자 API 키는 브라우저에 입력·저장하지 않아요. 프록시 접속 토큰도 이 탭을 닫으면 사라지고 JSON 백업에 넣지 않습니다.'), !state.readOnly ? h('button.btn-block.btn-ghost', { onclick: async () => download('운동일지-복구원본-개인보관.json', JSON.stringify(await exportRecoveryCopies(), null, 2)) }, '복구용 원본 내보내기') : null, h('button.btn-block.btn-ghost', { onclick: async () => {
                if (!navigator.storage?.persist)
                    return toast('이 브라우저는 저장소 보호 요청을 지원하지 않아요.');
                const ok = await navigator.storage.persist();
                toast(ok ? '자동 공간 정리에 대한 보호 요청이 허용됐어요. 수동 데이터 삭제는 막지 못합니다.' : '보호 요청이 허용되지 않았어요. 외부 백업을 유지해 주세요.', 6000);
            } }, '저장소 보호 요청'), !state.readOnly ? h('button.btn-block.btn-danger', { onclick: async () => {
                if (await confirmSheet({ title: '활성 기록·설정을 초기화할까요?', body: '현재 사용하는 기록과 설정을 비웁니다. 복구 사본과 구버전 저장소는 남아 있으므로 완전 삭제 기능은 아닙니다.', confirmText: '활성 데이터 초기화', danger: true })) {
                    await wipeAll();
                    setProxyToken('');
                    draw();
                }
            } }, '기록·설정 초기화 · 복구 사본 보존') : null);
    }
    draw();
    signal?.addEventListener('abort', () => { closed = true; checkController?.abort(); }, { once: true });
    return () => { closed = true; clearInterval(previewTimer); checkController?.abort(); stopSpeaking(); };
}
function select(current, items, onchange) { return h('select', { onchange: e => onchange(e.target.value) }, ...items.map(([value, label]) => h('option', { value, selected: String(current) === String(value) }, label))); }
async function doImport(redraw, isAlive) {
    const file = await pickFile();
    if (!file || !isAlive())
        return;
    if (file.size > 15 * 1024 * 1024)
        throw new Error('백업 파일은 15MB 이내로 골라 주세요.');
    let data;
    try {
        data = JSON.parse(await file.text());
        parseBackup(data);
    }
    catch (e) {
        throw new Error('백업 검증 실패 · ' + e.message);
    }
    if (!isAlive())
        return;
    const mode = await chooseImportMode();
    if (mode === 'cancel' || !isAlive())
        return;
    if (mode === 'replace' && !await confirmSheet({ title: '백업으로 전체 교체할까요?', body: '현재 기록을 바꾸기 전 기기에 안전 사본을 보관합니다. 별도 파일 백업도 권해요.', confirmText: '덮어쓰기 실행', danger: true }))
        return;
    if (!isAlive())
        return;
    if (storageStatus().readOnly && storageStatus().state === 'error') {
        if (mode !== 'replace')
            throw new Error('손상된 저장소 복구는 검증한 백업으로 전체 교체만 가능합니다.');
        await restoreProtectedBackup(data);
    }
    else
        await importAll(data, { mode });
    if (isAlive()) {
        redraw();
        toast('검증한 백업을 불러왔어요.');
    }
}
function addCustomSheet(redraw) {
    modal(close => {
        const name = h('input', { type: 'text', maxLength: 160, placeholder: '운동 이름' }), group = select('chest', GROUPS.map(g => [g.id, g.name]), () => { }), equip = select('덤벨', EQUIPMENT.map(e => [e, e]), () => { }), tier = select('2', [['1', '주요 종목'], ['2', '보조 종목'], ['3', '고립·마무리']], () => { }), measure = select('reps', [['reps', '횟수(회)'], ['duration', '유지시간(초)']], () => { }), loadBasis = select('total', [['total', '전체 표기 중량'], ['per_hand', '한쪽 덤벨'], ['stack', '머신·케이블 표시'], ['bodyweight', '맨몸'], ['added', '추가 중량']], () => { }), sets = h('input', { type: 'number', min: 1, max: 20, value: 3 }), reps = h('input', { type: 'number', min: 1, max: 600, value: 12 }), rest = h('input', { type: 'number', min: 0, max: 900, value: 90 });
        return h('div', null, h('h3', null, '사용자 종목 추가'), field('이름', name), field('부위', group), field('기구', equip), field('분류', tier), field('측정 방식', measure), field('중량 표기 방식', loadBasis), h('.btn-row', null, field('세트', sets), field('횟수·초', reps)), field('본세트 휴식(초)', rest), h('button.btn-block.btn-primary', { onclick: async () => {
                if (!name.value.trim())
                    throw new Error('이름을 입력해 주세요.');
                addCustomExercise({ id: uid('cx'), name: name.value.trim(), group: group.value, equip: equip.value, tier: Number(tier.value), measure: measure.value, loadBasis: loadBasis.value, sets: finite(sets.value, 1, 20, '세트', { integer: true }), reps: finite(reps.value, 1, 600, '목표', { integer: true }), rest: finite(rest.value, 0, 900, '휴식', { integer: true }), tempo: measure.value === 'duration' ? 1 : 3, compound: false, warmupEligible: false });
                await flush();
                close();
                redraw();
            } }, '종목 추가'));
    });
}
async function refreshApp() {
    if (!navigator.onLine)
        return toast('오프라인에서는 저장된 앱 파일을 지우지 않아요.');
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    toast('업데이트를 확인했어요. 열린 입력 내용을 보존한 뒤 새로고침해 주세요.');
    if (await confirmSheet({ title: '지금 앱을 새로고침할까요?', body: '기록 저장소는 지우지 않으며, 상대 앱 캐시도 건드리지 않아요.', confirmText: '새로고침' }))
        location.reload();
}
