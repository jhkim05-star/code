/** 앱 진입점 — 부팅, 라우팅, 탭바 */

import { initStore } from './store.js';
import { initVoice, unlockAudio } from './voice.js';
import { h, mount, clear } from './ui.js';

import { renderPlan } from './views/plan.js';
import { renderRun } from './views/run.js';
import { renderHistory, renderSessionDetail } from './views/history.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';

const TABS = [
  { path: '/plan',     label: '계획', icon: '📋' },
  { path: '/history',  label: '기록', icon: '📖' },
  { path: '/stats',    label: '통계', icon: '📈' },
  { path: '/settings', label: '설정', icon: '⚙️' },
];

const ROUTES = [
  { re: /^\/plan(?:\/(\d{4}-\d{2}-\d{2}))?$/, view: renderPlan },
  { re: /^\/run\/(\d{4}-\d{2}-\d{2})$/,       view: renderRun, fullscreen: true },
  { re: /^\/history$/,                        view: renderHistory },
  { re: /^\/session\/([\w]+)$/,               view: renderSessionDetail },
  { re: /^\/stats$/,                          view: renderStats },
  { re: /^\/settings$/,                       view: renderSettings },
];

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

let cleanup = null;

export function go(path, { replace = false } = {}) {
  if (replace) location.replace('#' + path);
  else location.hash = path;
}

function currentPath() {
  const p = location.hash.replace(/^#/, '');
  return p.startsWith('/') ? p : '/plan';
}

async function route() {
  const path = currentPath();

  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* 무시 */ } }
  cleanup = null;

  const match = ROUTES.map(r => ({ r, m: r.re.exec(path) })).find(x => x.m);
  if (!match) return go('/plan', { replace: true });

  document.body.classList.toggle('no-tabs', !!match.r.fullscreen);
  tabbar.hidden = !!match.r.fullscreen;
  renderTabs(path);

  clear(app);
  scrollTo(0, 0);
  cleanup = await match.r.view(app, match.m.slice(1)) || null;
}

function renderTabs(path) {
  mount(tabbar, ...TABS.map(t =>
    h('button', {
      onclick: () => go(t.path),
      'aria-current': path.startsWith(t.path) ? 'page' : null,
    }, h('span.ic', null, t.icon), h('span', null, t.label)),
  ));
}

async function boot() {
  await initStore();
  await initVoice();

  addEventListener('hashchange', route);
  // 첫 탭에서 오디오 권한을 확보해 둡니다 (iOS 는 사용자 동작 없이 소리를 못 냅니다)
  const unlock = () => unlockAudio();
  addEventListener('pointerdown', unlock, { once: true, capture: true });

  await route();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 오프라인 캐시 없이도 동작 */ });
  }
}

boot().catch((err) => {
  mount(app, h('.card', null,
    h('h2', null, '앱을 시작하지 못했습니다'),
    h('p.hint', null, String(err?.message || err)),
  ));
});
