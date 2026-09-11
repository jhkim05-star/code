/** Hash navigation with route-scoped cleanup and a persistent save-status surface. */
import { initStore, subscribe, storageStatus, retrySave, exportAll, exportRecoveryCopies } from './store.js';
import { initVoice, unlockAudio, stopSpeaking } from './voice.js';
import { h, mount, closeAllModals } from './ui.js';
import { download } from './util.js';
import { renderPlanTab } from './views/planTab.js';
import { renderExec } from './views/execTab.js';
import { renderRun } from './views/run.js';
import { renderHistory, renderSessionDetail } from './views/history.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
export function go(path, { replace = false } = {}) {
    if (replace)
        location.replace('#' + path);
    else
        location.hash = path;
}
const tabs = [['/plan', '운동계획', '🗂️'], ['/exec', '운동실행', '🏋️'], ['/history', '기록', '📖'], ['/stats', '통계', '📈'], ['/settings', '설정', '⚙️']];
const routes = [[/^\/plan$/, renderPlanTab], [/^\/exec(?:\/(\d{4}-\d{2}-\d{2}))?$/, renderExec], [/^\/run\/(\d{4}-\d{2}-\d{2})$/, renderRun, true], [/^\/history$/, renderHistory], [/^\/session\/([\w-]+)$/, renderSessionDetail], [/^\/stats$/, renderStats], [/^\/settings$/, renderSettings]];
let cleanup = null, controller = null, generation = 0;
async function route() {
    const epoch = ++generation;
    controller?.abort();
    controller = new AbortController();
    closeAllModals();
    if (cleanup) {
        try {
            cleanup();
        }
        catch (e) {
            console.error(e);
        }
        cleanup = null;
    }
    stopSpeaking();
    const root = document.getElementById('app'), bar = document.getElementById('tabbar');
    const path = location.hash.slice(1) || '/exec', match = routes.map(([re, view, fullscreen]) => ({ m: re.exec(path), view, fullscreen })).find(x => x.m);
    if (!match) {
        go('/exec', { replace: true });
        return;
    }
    document.body.classList.toggle('no-tabs', !!match.fullscreen);
    bar.hidden = !!match.fullscreen;
    mount(bar, ...tabs.map(([p, label, icon]) => h('button', { 'aria-current': path.startsWith(p) ? 'page' : null, onclick: () => go(p) }, h('span.ic', { 'aria-hidden': 'true' }, icon), h('span', null, label))));
    mount(root);
    scrollTo(0, 0);
    try {
        const next = await match.view(root, match.m.slice(1), { signal: controller.signal });
        if (epoch !== generation) {
            next?.();
            return;
        }
        cleanup = next || null;
    }
    catch (e) {
        if (epoch === generation)
            mount(root, h('.card', null, h('h2', null, '화면을 열지 못했어요'), h('p.hint', null, e.message), h('button', { onclick: () => go('/settings') }, '설정·복구로')));
    }
}
function paintStorage() {
    const s = storageStatus(), el = document.getElementById('storageStatus');
    el.dataset.state = s.state;
    const backup = s.readOnly
        ? h('button', { onclick: async () => download('운동일지-복구원본-개인보관.json', JSON.stringify(await exportRecoveryCopies(), null, 2)) }, '복구 원본 내보내기 · 민감 정보 포함')
        : s.dirty ? h('button', { onclick: () => download('운동일지-복구용.json', JSON.stringify(exportAll(), null, 2)) }, '백업 내보내기') : null;
    const reset = s.readOnly ? h('button.btn-danger', { onclick: () => location.assign('./reset.html') }, '기존 운동 데이터 삭제 후 새로 시작') : null;
    mount(el, s.message, s.dirty && !s.readOnly ? h('button', { onclick: () => retrySave() }, '저장 재시도') : null, backup, reset);
}
function stopForReset() {
    generation++;
    controller?.abort();
    closeAllModals();
    const dispose = cleanup;
    cleanup = null;
    try {
        dispose?.();
    }
    catch (error) {
        console.error(error);
    }
    stopSpeaking();
}
async function boot() {
    await initStore();
    subscribe(paintStorage);
    paintStorage();
    initVoice().catch(() => { });
    addEventListener('pointerdown', () => unlockAudio(), { capture: true, once: true });
    addEventListener('hashchange', route);
    await route();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => { });
    }
}
addEventListener('workout:reset-start', stopForReset);
boot().catch(e => mount(document.getElementById('app'), h('.card', null, h('h2', null, '앱을 시작하지 못했어요'), h('p', null, e.message))));
