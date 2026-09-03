/* 앱 시작 · 이벤트 연결 */
(function (global) {
  'use strict';

  const $ = U.$, $$ = U.$$;
  const state = UI.state;

  // 통계·설정 탭에서는 검색을 쓰지 않는다
  function applyTabChrome(tab) {
    const listTab = (tab === 'shelf' || tab === 'library' || tab === 'video');
    $('#btnFilterToggle').hidden = !listTab;
    if (!listTab) {
      $('#filterRow').hidden = true;
      if (state.query) { state.query = ''; $('#filterInput').value = ''; }
    }
  }

  function switchTab(tab) {
    state.tab = tab;
    state.statsBucket = null;
    Store.settings.lastTab = tab;
    Store.commit();
    applyTabChrome(tab);
    UI.render();
    $('#main').scrollTop = 0;
  }

  function bindSeg(selector, attr, key, after) {
    const box = $(selector);
    if (!box) return;
    box.addEventListener('click', function (e) {
      const btn = e.target.closest('.seg-item');
      if (!btn) return;
      $$('.seg-item', box).forEach(function (b) { b.classList.toggle('is-on', b === btn); });
      state[key] = btn.dataset[attr];
      if (after) after();
      UI.render();
    });
  }

  /* 브라우저가 공간 확보를 위해 저장소를 비우는 일을 막도록 요청한다.
   * 사파리는 홈 화면에 추가된 웹앱에 대해 대체로 허용한다.
   * 거부되더라도 앱은 그대로 동작하며, 설정 화면에 상태만 표시한다. */
  function requestPersistence() {
    function mark(v) {
      if (Store.settings.persistent === v) return;
      Store.setSetting('persistent', v);
      if (state.tab === 'settings') UI.renderSettings();
    }
    if (!navigator.storage || !navigator.storage.persist) { mark(null); return; }
    navigator.storage.persisted().then(function (already) {
      if (already) { mark(true); return; }
      return navigator.storage.persist().then(function (granted) { mark(!!granted); });
    }).catch(function () { mark(null); });
  }

  function init() {
    Store.init();
    state.tab = Store.settings.lastTab || 'shelf';

    // 탭바
    $('#tabbar').addEventListener('click', function (e) {
      const btn = e.target.closest('.tab');
      if (btn) switchTab(btn.dataset.tab);
    });

    // 세그먼트 컨트롤
    bindSeg('#shelfSeg', 'shelf', 'shelfFilter');
    bindSeg('#librarySort', 'sort', 'librarySort');
    bindSeg('#videoFilter', 'kind', 'videoFilter');
    bindSeg('#statsGran', 'gran', 'statsGran', function () { state.statsBucket = null; });

    // 검색
    const filterRow = $('#filterRow'), filterInput = $('#filterInput');
    $('#btnFilterToggle').addEventListener('click', function () {
      filterRow.hidden = !filterRow.hidden;
      if (!filterRow.hidden) filterInput.focus();
      else if (state.query) { state.query = ''; filterInput.value = ''; UI.render(); }
    });
    filterInput.addEventListener('input', U.debounce(function () {
      state.query = filterInput.value;
      UI.render();
    }, 180));
    $('#btnFilterClear').addEventListener('click', function () {
      filterInput.value = ''; state.query = ''; filterInput.focus(); UI.render();
    });

    // 추가
    $('#btnAdd').addEventListener('click', function () { UI.openAddChooser(); });

    // 썸네일 탭 → 상세
    $('#main').addEventListener('click', function (e) {
      const card = e.target.closest('[data-open]');
      if (card) UI.openItem(card.dataset.open);
    });

    // 바텀시트
    $('#sheetClose').addEventListener('click', UI.closeSheet);
    $('#sheetScrim').addEventListener('click', UI.closeSheet);
    $('#sheetAction').addEventListener('click', UI.runSheetAction);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#sheetHost').hidden) UI.closeSheet();
    });

    // 첫 실행 안내
    if (!Store.state.books.length && !Store.state.videos.length) {
      state.tab = 'shelf';
    }

    applyTabChrome(state.tab);
    UI.render();
    requestPersistence();

    // 홈 화면 추가(PWA) 지원
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (err) {
          console.warn('서비스워커 등록 실패(오프라인 기능만 비활성화됩니다)', err);
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
