/** Standalone recovery entry. It does not initialize or validate the live workout store. */
import { VERSION } from './config.js';
import { readResetMarker, resetWorkoutData, ResetBlockedError } from './reset.js';
import { confirmSheet, h, mount } from './ui.js';

const root = document.getElementById('app');
let running = false;

function intro(message = '') {
    const pending = readResetMarker()?.state === 'pending';
    mount(root,
        h('.page-head', null, h('div', null, h('h1', null, '운동일지 새로 시작'), h('p.sub', null, `운동일지 ${VERSION} · 독립 복구 화면`))),
        h('.card', null,
            h('h3', null, pending ? '중단된 초기화를 다시 시도할 수 있어요' : '기존 운동 데이터를 모두 삭제합니다'),
            h('p.hint.warning', null, message || (pending ? '이전에 확인한 초기화가 완료되지 않았습니다. 자동으로 삭제하지 않았으며, 아래 버튼을 눌러 다시 시도할 수 있습니다.' : '이 작업은 workout 앱의 기록·계획·설정·진행 중 운동·복구 사본을 삭제하며 되돌릴 수 없습니다.')),
            h('p.hint', null, '독서앱 데이터와 캐시, 운동앱 코드·아이콘·녹음 음성 파일은 삭제하지 않습니다. 백업은 선택 사항이며 필수가 아닙니다.'),
            h('button.btn-block.btn-danger.btn-lg', { disabled: running, onclick: start }, pending ? '삭제하고 새로 시작 다시 시도' : '기존 운동 데이터 삭제 후 새로 시작'),
            h('a.btn-link', { href: './index.html#/settings' }, '운동일지로 돌아가기')));
}

async function start() {
    if (running)
        return;
    const confirmed = await confirmSheet({
        title: '기존 운동 데이터를 삭제할까요?',
        body: 'workout의 기록·계획·설정·진행 중 운동·복구 사본과 AI 접속 토큰을 삭제하고 빈 운동일지를 만듭니다. 독서앱과 녹음 파일은 건드리지 않습니다.',
        confirmText: '삭제하고 새로 시작',
        danger: true,
    });
    if (!confirmed)
        return;
    running = true;
    const status = h('p.hint.warning', { role: 'status', 'aria-live': 'polite' }, '초기화를 준비하고 있습니다.');
    mount(root, h('.page-head', null, h('div', null, h('h1', null, '운동일지 새로 시작'), h('p.sub', null, `운동일지 ${VERSION}`))), h('.card', null, h('h3', null, '초기화 진행 중'), status, h('p.hint', null, '다른 운동앱 창 때문에 대기 중이라면 그 창을 닫아 주세요. 완료되기 전에는 성공으로 표시하지 않습니다.')));
    try {
        const result = await resetWorkoutData({ onStatus: state => { status.textContent = state.message; } });
        mount(root,
            h('.page-head', null, h('div', null, h('h1', null, '새로 시작할 준비가 됐어요'), h('p.sub', null, `운동일지 ${VERSION}`))),
            h('.card', null,
                h('h3', null, '빈 운동일지 확인 완료'),
                h('p.hint.good', null, `기록 ${result.data.sessions.length}개 · 계획 ${Object.keys(result.data.plans).length}개 · 진행 중 운동 없음`),
                h('a.btn-link.btn-primary', { href: './index.html#/plan' }, '빈 운동일지 열기')));
    }
    catch (error) {
        running = false;
        const message = error instanceof ResetBlockedError ? error.message : `초기화를 완료하지 못했습니다. ${error.message}`;
        intro(message);
    }
}

intro();
