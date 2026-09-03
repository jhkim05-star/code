/* 화면 렌더링 · 상호작용 */
(function (global) {
  'use strict';

  const UI = {};
  const $ = U.$, $$ = U.$$, esc = U.esc;

  const VIEW_TITLE = {
    shelf: '책꽂이', library: '책장', video: '비디오장', stats: '통계', settings: '설정'
  };

  const state = {
    tab: 'shelf',
    shelfFilter: 'all',
    librarySort: 'finished',
    videoFilter: 'all',
    statsGran: 'month',
    statsBucket: null,     // 통계에서 선택한 구간(null = 범위 전체)
    statsTable: false,
    query: ''
  };
  UI.state = state;

  /* ================= 공통 조각 ================= */

  UI.toast = function (msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' ' + kind : ' ok');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 2600);
  };

  function starsHtml(rating, size) {
    const r = Math.max(0, Math.min(5, U.num(rating, 0) || 0));
    const pct = (r / 5) * 100;
    return '<span class="stars ' + (size || 'sm') + '" role="img" aria-label="별점 ' + r + '점 / 5점">' +
      '<span class="base" aria-hidden="true">★★★★★</span>' +
      '<span class="fill" aria-hidden="true" style="width:' + pct + '%">★★★★★</span></span>';
  }
  UI.starsHtml = starsHtml;

  function authorText(b) {
    const a = b.authors || [];
    if (!a.length) return '';
    return a.length > 2 ? a[0] + ' 외 ' + (a.length - 1) + '명' : a.join(', ');
  }

  function coverInner(url, title) {
    if (url) {
      return '<img src="' + esc(url) + '" alt="" loading="lazy" decoding="async" ' +
        'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="cover-fallback" style="display:none">' + esc(title) + '</div>';
    }
    return '<div class="cover-fallback">' + esc(title) + '</div>';
  }

  /* 썸네일 카드 (책꽂이 · 책장 · 비디오장 공통) */
  function cardHtml(item) {
    const isBook = item.type === 'book';
    const url = isBook ? item.coverUrl : item.posterUrl;
    let badge = '';
    if (isBook && item.status === 'reading') {
      const d = U.daysSince(item.startedAt);
      badge = '<span class="cover-badge reading">읽는중' + (d ? ' D+' + (d - 1) : '') + '</span>';
    } else if (isBook && item.status === 'planned') {
      badge = '<span class="cover-badge planned">예정</span>';
    } else if (!isBook && item.kind === 'series') {
      badge = '<span class="cover-badge planned">시리즈</span>';
    }

    const rating = item.rating > 0
      ? '<div class="cover-rating">' + starsHtml(item.rating, 'sm') +
        '<span class="num">' + item.rating.toFixed(1) + '</span></div>'
      : '';

    const sub = isBook
      ? (item.status === 'finished' ? shortDate(item.finishedAt) : authorText(item))
      : shortDate(item.watchedAt);

    return '<button class="card" type="button" data-open="' + esc(item.id) + '">' +
      '<div class="cover' + (isBook ? '' : ' video') + '">' + badge + coverInner(url, item.title) + rating + '</div>' +
      '<div class="card-title">' + esc(item.title) + '</div>' +
      (sub ? '<div class="card-sub">' + esc(sub) + '</div>' : '') +
      '</button>';
  }

  function shortDate(s) {
    const d = U.parseDate(s);
    if (!d) return '';
    return (d.getMonth() + 1) + '.' + d.getDate();
  }

  function gridHtml(items) {
    return '<div class="grid">' + items.map(cardHtml).join('') + '</div>';
  }

  function emptyHtml(title, desc) {
    return '<div class="empty"><strong>' + esc(title) + '</strong><span>' + esc(desc) + '</span></div>';
  }

  function sectionHtml(title, color, items, emptyTitle, emptyDesc) {
    return '<div class="section">' +
      '<div class="section-head">' +
      '<h2 class="section-title ' + color + '"><span class="bar"></span>' + esc(title) + '</h2>' +
      '<span class="section-count">' + items.length + '</span>' +
      '</div>' +
      (items.length ? gridHtml(items) : emptyHtml(emptyTitle, emptyDesc)) +
      '</div>';
  }

  function matchesQuery(item) {
    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = [item.title, item.subtitle, (item.authors || []).join(' '), item.director,
      item.publisher, item.genre, item.platform, item.oneLiner]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  /* ================= 탭별 렌더링 ================= */

  UI.render = function () {
    $('#viewTitle').textContent = VIEW_TITLE[state.tab] || '';
    $$('.view').forEach(function (v) { v.hidden = v.dataset.view !== state.tab; });
    $$('.tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.tab === state.tab); });
    document.body.className = 'cols-' + (Store.settings.cols === 3 ? 3 : 4);

    if (state.tab === 'shelf') renderShelf();
    else if (state.tab === 'library') renderLibrary();
    else if (state.tab === 'video') renderVideo();
    else if (state.tab === 'stats') UI.renderStats();
    else if (state.tab === 'settings') UI.renderSettings();
  };

  function renderShelf() {
    const reading = Store.books('reading').filter(matchesQuery)
      .sort(function (a, b) { return (a.startedAt || '').localeCompare(b.startedAt || ''); });
    const planned = Store.books('planned').filter(matchesQuery)
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });

    let html = '';
    if (state.shelfFilter === 'all' || state.shelfFilter === 'reading') {
      html += sectionHtml('읽는 중', 'red', reading,
        '지금 읽는 책이 없습니다', '읽을 예정인 책의 썸네일을 눌러 “읽기 시작”을 누르세요.');
    }
    if (state.shelfFilter === 'all' || state.shelfFilter === 'planned') {
      html += sectionHtml('읽을 예정', 'blue', planned,
        '대기 중인 책이 없습니다', '오른쪽 위 + 버튼으로 읽을 책을 담아두세요.');
    }
    $('#shelfBody').innerHTML = html;
  }

  function renderLibrary() {
    let items = Store.books('finished').filter(matchesQuery);
    if (state.librarySort === 'rating') {
      items.sort(function (a, b) { return (b.rating || 0) - (a.rating || 0) ||
        (b.finishedAt || '').localeCompare(a.finishedAt || ''); });
    } else if (state.librarySort === 'title') {
      items.sort(function (a, b) { return a.title.localeCompare(b.title, 'ko'); });
    } else {
      items.sort(function (a, b) { return (b.finishedAt || '').localeCompare(a.finishedAt || ''); });
    }

    let html = '';
    if (!items.length) {
      html = emptyHtml('아직 다 읽은 책이 없습니다',
        '책꽂이에서 “다 읽음”을 누르면 이곳으로 옮겨집니다.');
    } else if (state.librarySort === 'finished') {
      // 연도별로 묶어서 보여주기
      const groups = {};
      items.forEach(function (b) {
        const y = (b.finishedAt || '').slice(0, 4) || '날짜 없음';
        (groups[y] = groups[y] || []).push(b);
      });
      Object.keys(groups).sort().reverse().forEach(function (y) {
        html += sectionHtml(y === '날짜 없음' ? y : y + '년', 'red', groups[y], '', '');
      });
    } else {
      html = '<div class="section"><div class="section-head">' +
        '<h2 class="section-title red"><span class="bar"></span>완독</h2>' +
        '<span class="section-count">' + items.length + '</span></div>' +
        gridHtml(items) + '</div>';
    }
    $('#libraryBody').innerHTML = html;
  }

  function renderVideo() {
    let items = Store.videos().filter(matchesQuery);
    if (state.videoFilter !== 'all') {
      items = items.filter(function (v) { return v.kind === state.videoFilter; });
    }
    items.sort(function (a, b) { return (b.watchedAt || '').localeCompare(a.watchedAt || ''); });

    let html = '';
    if (!items.length) {
      html = emptyHtml('기록된 영상이 없습니다', '오른쪽 위 + 버튼으로 본 영화나 시리즈를 남겨보세요.');
    } else {
      const groups = {};
      items.forEach(function (v) {
        const m = (v.watchedAt || '').slice(0, 7) || '날짜 없음';
        (groups[m] = groups[m] || []).push(v);
      });
      Object.keys(groups).sort().reverse().forEach(function (m) {
        const label = m === '날짜 없음' ? m : (+m.slice(0, 4)) + '년 ' + (+m.slice(5, 7)) + '월';
        html += sectionHtml(label, 'blue', groups[m], '', '');
      });
    }
    $('#videoBody').innerHTML = html;
  }

  /* ================= 상세 보기 ================= */

  function metaCell(k, v, full, cls) {
    return '<div class="meta-cell' + (full ? ' full' : '') + '">' +
      '<div class="meta-k">' + esc(k) + '</div>' +
      '<div class="meta-v">' + (cls ? '<span class="' + cls + '">' : '') + v +
      (cls ? '</span>' : '') + '</div></div>';
  }

  function noteBlock(label, text, placeholder) {
    return '<div class="note-block"><div class="field-label">' + esc(label) + '</div>' +
      '<div class="note-body' + (text ? '' : ' muted') + '">' +
      (text ? esc(text) : esc(placeholder)) + '</div></div>';
  }

  UI.openBookDetail = function (book) {
    const b = book;
    const statusLabel = { planned: '읽을 예정', reading: '읽는 중', finished: '완독' }[b.status];
    const readingDays = b.status === 'reading' ? U.daysSince(b.startedAt) : null;

    let period = '—';
    if (b.status === 'finished') {
      period = U.fmtDate(b.startedAt) + ' ~ ' + U.fmtDate(b.finishedAt);
    } else if (b.status === 'reading') {
      period = U.fmtDate(b.startedAt) + ' ~ 읽는 중';
    }

    let duration = '—';
    if (b.status === 'finished' && b.durationDays) duration = '<span class="accent-red">' + b.durationDays + '일</span>';
    else if (readingDays) duration = '<span class="accent-blue">' + readingDays + '일째</span>';

    let html = '';
    html += '<div class="detail-head">' +
      '<div class="detail-cover">' + coverInner(b.coverUrl, b.title) + '</div>' +
      '<div class="detail-main">' +
      '<h3 class="detail-title">' + esc(b.title) + '</h3>' +
      (b.subtitle ? '<div class="detail-sub">' + esc(b.subtitle) + '</div>' : '') +
      '<div class="detail-author">' + esc((b.authors || []).join(', ') || '저자 미상') +
      (b.translator ? ' · ' + esc(b.translator) + ' 옮김' : '') + '</div>' +
      '<div class="detail-sub">' + esc([b.publisher, b.publishedDate].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="detail-rating">' + starsHtml(b.rating, 'md') +
      '<span class="num">' + (b.rating > 0 ? b.rating.toFixed(1) : '평가 전') + '</span></div>' +
      '</div></div>';

    if (b.oneLiner) html += '<div class="oneliner">' + esc(b.oneLiner) + '</div>';

    html += '<div class="meta-grid">' +
      metaCell('상태', esc(statusLabel), false, b.status === 'reading' ? 'accent-red' : '') +
      metaCell('읽은 기간', duration) +
      metaCell('읽은 날짜', esc(period), true) +
      metaCell('종이책 여부', esc(Stats.FORMAT_LABEL[b.format] || '—')) +
      metaCell('장르', esc(b.genre || '—')) +
      metaCell('한국/외국', esc(Stats.ORIGIN_LABEL[b.origin] || '—')) +
      metaCell('페이지', b.pageCount ? b.pageCount + '쪽' : '—') +
      (b.isbn ? metaCell('ISBN', esc(b.isbn), true) : '') +
      (b.startedTime ? metaCell('읽기 시작 시각', esc(U.fmtDateTime(b.startedTime)), true) : '') +
      '</div>';

    html += noteBlock('한줄평', b.oneLiner, '아직 한줄평이 없습니다.');
    html += noteBlock('독서록', b.note, '아직 기록이 없습니다. 수정에서 남겨보세요.');

    // 상태 전환 버튼
    html += '<div class="btn-row">';
    if (b.status === 'planned') {
      html += '<button class="btn red" type="button" data-act="start">' +
        '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>읽기 시작</button>';
    } else if (b.status === 'reading') {
      html += '<button class="btn blue" type="button" data-act="finish">' +
        '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg>다 읽음</button>';
    } else {
      html += '<button class="btn ghost" type="button" data-act="reopen">다시 읽기</button>';
    }
    html += '</div>';
    html += '<div class="btn-row">' +
      '<button class="btn ghost danger" type="button" data-act="delete">삭제</button>' +
      '</div>';

    UI.openSheet({
      title: '책 정보',
      body: html,
      action: { label: '수정', fn: function () { UI.openBookForm(b); } },
      onMount: function (root) {
        root.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-act]');
          if (!btn) return;
          const act = btn.dataset.act;
          if (act === 'start') {
            Store.startReading(b.id);
            UI.closeSheet();
            state.tab = 'shelf'; state.shelfFilter = 'all';
            UI.render();
            UI.toast('읽기 시작 — ' + U.fmtDateTime(Store.byId(b.id).startedTime));
          } else if (act === 'finish') {
            const done = Store.finishReading(b.id);
            UI.closeSheet();
            state.tab = 'library';
            UI.render();
            UI.openFinishSheet(done);
          } else if (act === 'reopen') {
            Store.reopen(b.id);
            UI.closeSheet();
            state.tab = 'shelf';
            UI.render();
            UI.toast('책꽂이로 되돌렸습니다.');
          } else if (act === 'delete') {
            if (confirm('“' + b.title + '” 기록을 삭제할까요? 되돌릴 수 없습니다.')) {
              Store.removeBook(b.id);
              UI.closeSheet();
              UI.render();
              UI.toast('삭제했습니다.', 'warn');
            }
          }
        });
      }
    });
  };

  UI.openVideoDetail = function (v) {
    const total = Stats.videoMinutes(v);
    let html = '';
    html += '<div class="detail-head">' +
      '<div class="detail-cover">' + coverInner(v.posterUrl, v.title) + '</div>' +
      '<div class="detail-main">' +
      '<h3 class="detail-title">' + esc(v.title) + '</h3>' +
      '<div class="detail-author">' + esc(Stats.KIND_LABEL[v.kind] || '') +
      (v.director ? ' · ' + esc(v.director) : '') + '</div>' +
      '<div class="detail-sub">' + esc([v.releaseDate, v.genre].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="detail-rating">' + starsHtml(v.rating, 'md') +
      '<span class="num">' + (v.rating > 0 ? v.rating.toFixed(1) : '평가 전') + '</span></div>' +
      '</div></div>';

    if (v.oneLiner) html += '<div class="oneliner">' + esc(v.oneLiner) + '</div>';

    html += '<div class="meta-grid">' +
      metaCell('본 날짜', esc(U.fmtDate(v.watchedAt)), false, 'accent-blue') +
      metaCell('종류', esc(Stats.KIND_LABEL[v.kind] || '—')) +
      metaCell('장르', esc(v.genre || '—')) +
      metaCell('한국/외국', esc(Stats.ORIGIN_LABEL[v.origin] || '—')) +
      metaCell('러닝타임', v.runtimeMin ? v.runtimeMin + '분' + (v.kind === 'series' ? ' / 편' : '') : '—') +
      metaCell(v.kind === 'series' ? '시청 편수' : '시즌', v.kind === 'series'
        ? (v.episodes ? v.episodes + '편' : '—')
        : (v.seasons ? v.seasons : '—')) +
      metaCell('총 시청 시간', total ? '<span class="accent-red">' + U.fmtMinutes(total) + '</span>' : '—', true) +
      (v.platform ? metaCell('플랫폼', esc(v.platform)) : '') +
      (v.country ? metaCell('제작 국가', esc(v.country)) : '') +
      '</div>';

    html += noteBlock('한줄평', v.oneLiner, '아직 한줄평이 없습니다.');
    html += noteBlock('감상평', v.note, '아직 기록이 없습니다.');

    html += '<div class="btn-row">' +
      '<button class="btn ghost danger" type="button" data-act="delete">삭제</button></div>';

    UI.openSheet({
      title: '영상 정보',
      body: html,
      action: { label: '수정', fn: function () { UI.openVideoForm(v); } },
      onMount: function (root) {
        root.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-act="delete"]');
          if (!btn) return;
          if (confirm('“' + v.title + '” 기록을 삭제할까요?')) {
            Store.removeVideo(v.id);
            UI.closeSheet();
            UI.render();
            UI.toast('삭제했습니다.', 'warn');
          }
        });
      }
    });
  };

  /* 완독 직후 별점·한줄평 남기기 */
  UI.openFinishSheet = function (b) {
    const html =
      '<div class="empty" style="padding:20px 16px;margin-bottom:18px;border-style:solid;">' +
      '<strong>완독을 축하합니다</strong>' +
      '<span>' + esc(b.title) + '<br>' +
      U.fmtDate(b.startedAt) + ' ~ ' + U.fmtDate(b.finishedAt) +
      ' · <b style="color:var(--red-soft)">' + (b.durationDays || 1) + '일</b> 걸렸습니다.</span></div>' +
      '<div class="field"><span class="field-label">별점</span>' + rateInputHtml(b.rating) + '</div>' +
      '<div class="field"><label for="fsOne">한줄평</label>' +
      '<input class="input" id="fsOne" maxlength="120" placeholder="한 문장으로 남겨보세요" value="' +
      esc(b.oneLiner) + '"></div>' +
      '<div class="field"><label for="fsNote">독서록</label>' +
      '<textarea class="textarea" id="fsNote" placeholder="기억하고 싶은 문장이나 생각">' +
      esc(b.note) + '</textarea></div>' +
      '<div class="btn-row"><button class="btn red" type="button" data-act="save">저장</button></div>';

    UI.openSheet({
      title: '완독 기록',
      body: html,
      onMount: function (root) {
        bindRateInput(root);
        root.querySelector('[data-act="save"]').addEventListener('click', function () {
          Store.updateBook(b.id, {
            rating: U.num(root.querySelector('.rate-input').dataset.value, 0) || 0,
            oneLiner: root.querySelector('#fsOne').value.trim(),
            note: root.querySelector('#fsNote').value
          });
          UI.closeSheet();
          UI.render();
          UI.toast('책장에 저장했습니다.');
        });
      }
    });
  };

  /* ================= 별점 입력 ================= */

  function rateInputHtml(value) {
    const v = U.num(value, 0) || 0;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      const filled = Math.max(0, Math.min(1, v - (i - 1))) * 100;
      stars += '<div class="rate-star">★' +
        '<span class="lit" style="width:' + filled + '%">★</span>' +
        '<button class="half" type="button" data-rate="' + (i - 0.5) + '" aria-label="' + (i - 0.5) + '점"></button>' +
        '<button class="full" type="button" data-rate="' + i + '" aria-label="' + i + '점"></button>' +
        '</div>';
    }
    return '<div class="rate-input" data-value="' + v + '">' +
      '<div class="rate-stars">' + stars + '</div>' +
      '<span class="rate-value">' + (v ? v.toFixed(1) : '—') + '</span>' +
      '<button class="text-btn" type="button" data-rate="0">지우기</button>' +
      '</div>';
  }
  UI.rateInputHtml = rateInputHtml;

  function paintRate(wrap, v) {
    wrap.dataset.value = v;
    U.$$('.rate-star', wrap).forEach(function (star, i) {
      const filled = Math.max(0, Math.min(1, v - i)) * 100;
      star.querySelector('.lit').style.width = filled + '%';
    });
    wrap.querySelector('.rate-value').textContent = v ? v.toFixed(1) : '—';
  }

  function bindRateInput(root) {
    U.$$('.rate-input', root).forEach(function (wrap) {
      wrap.addEventListener('click', function (e) {
        const t = e.target.closest('[data-rate]');
        if (!t) return;
        e.preventDefault();
        paintRate(wrap, parseFloat(t.dataset.rate));
      });
    });
  }
  UI.bindRateInput = bindRateInput;

  /* ================= 칩 선택 ================= */

  function chipsHtml(name, options, current, red) {
    return '<div class="chips" data-chips="' + name + '" data-value="' + esc(current || '') + '">' +
      options.map(function (o) {
        const on = o.value === current;
        return '<button class="chip' + (on ? ' is-on' + (red ? ' red' : '') : '') +
          '" type="button" data-chip="' + esc(o.value) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div>';
  }

  function bindChips(root) {
    U.$$('[data-chips]', root).forEach(function (group) {
      const red = group.dataset.red === '1';
      group.addEventListener('click', function (e) {
        const chip = e.target.closest('[data-chip]');
        if (!chip) return;
        group.dataset.value = chip.dataset.chip;
        U.$$('.chip', group).forEach(function (c) {
          c.classList.toggle('is-on', c === chip);
          if (red) c.classList.toggle('red', c === chip);
        });
        group.dispatchEvent(new CustomEvent('chipchange', { detail: chip.dataset.chip }));
      });
    });
  }

  function chipValue(root, name) {
    const g = root.querySelector('[data-chips="' + name + '"]');
    return g ? g.dataset.value : '';
  }

  /* ================= 자동 조회 섹션 ================= */

  function lookupSectionHtml(kind, defaultQuery, expanded) {
    return '<div class="field" data-lookup="' + kind + '">' +
      '<span class="field-label">' + (kind === 'book' ? '표지 · 서지정보 자동 조회' : '포스터 · 작품정보 자동 조회') + '</span>' +
      '<div class="lookup-row">' +
      '<input class="input" data-lk-q placeholder="' +
      (kind === 'book' ? '책 제목 또는 ISBN' : '영화 · 시리즈 제목') +
      '" value="' + esc(defaultQuery || '') + '" enterkeyhint="search" autocomplete="off">' +
      '<button class="btn blue" type="button" data-lk-go>찾기</button>' +
      '</div>' +
      '<div class="hint">' + (kind === 'book'
        ? 'Google Books · Open Library 에서 표지와 저자 · 출판사 · 발행일을 가져옵니다. 가져온 뒤 아래에서 자유롭게 고칠 수 있습니다.'
        : 'iTunes(설정에 TMDB 키가 있으면 TMDB)에서 포스터와 장르 · 개봉일을 가져옵니다.') + '</div>' +
      '<div data-lk-results class="result-list"' + (expanded ? '' : '') + '></div>' +
      '</div>';
  }

  function bindLookup(root, kind, onPick) {
    const box = root.querySelector('[data-lookup]');
    if (!box) return;
    const input = box.querySelector('[data-lk-q]');
    const results = box.querySelector('[data-lk-results]');

    function run() {
      const q = input.value.trim();
      if (!q) { UI.toast('검색어를 입력해 주세요.', 'warn'); return; }
      results.innerHTML = '<div class="loading"><span class="spinner"></span>찾는 중…</div>';
      const kindHint = kind === 'video'
        ? (chipValue(root, 'kind') || 'movie') : null;
      const p = kind === 'book' ? API.searchBooks(q) : API.searchVideos(q, kindHint);
      p.then(function (list) {
        if (!list.length) {
          results.innerHTML = '<div class="hint">검색 결과가 없습니다. 제목을 바꿔보거나 아래에 직접 입력해 주세요.</div>';
          return;
        }
        results.innerHTML = list.slice(0, 12).map(function (r, i) {
          const cover = kind === 'book' ? r.coverUrl : r.posterUrl;
          const meta = kind === 'book'
            ? [(r.authors || []).join(', '), r.publisher, (r.publishedDate || '').slice(0, 4)]
            : [Stats.KIND_LABEL[r.kind], r.director, (r.releaseDate || '').slice(0, 4), r.genre];
          return '<button class="result" type="button" data-pick="' + i + '">' +
            '<div class="result-thumb">' + (cover
              ? '<img src="' + esc(cover) + '" alt="" loading="lazy">' : '') + '</div>' +
            '<div class="result-info"><div class="result-title">' + esc(r.title) + '</div>' +
            '<div class="result-meta">' + esc(meta.filter(Boolean).join(' · ')) + '</div></div>' +
            '</button>';
        }).join('');
        results.onclick = function (e) {
          const b = e.target.closest('[data-pick]');
          if (!b) return;
          onPick(list[+b.dataset.pick]);
          results.innerHTML = '<div class="hint" style="color:var(--blue-soft)">정보를 채웠습니다. 아래에서 확인·수정하세요.</div>';
        };
      }).catch(function (err) {
        console.warn(err);
        results.innerHTML = '<div class="hint">조회에 실패했습니다(네트워크 또는 일일 조회 한도). ' +
          '잠시 후 다시 시도하거나 아래에 직접 입력해 주세요.</div>';
      });
    }

    box.querySelector('[data-lk-go]').addEventListener('click', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); run(); }
    });

    // 제목을 입력하고 잠시 멈추면 자동으로 조회한다
    let lastAuto = '';
    input.addEventListener('input', U.debounce(function () {
      const q = input.value.trim();
      if (q.length < 2 || q === lastAuto) return;
      lastAuto = q;
      run();
    }, 800));

    return { run: run, input: input };
  }

  /* ================= 책 입력/수정 폼 ================= */

  const GENRE_OPTIONS = function (list, current) {
    let opts = '<option value="">선택 안 함</option>';
    let found = false;
    list.forEach(function (g) {
      if (g === current) found = true;
      opts += '<option value="' + esc(g) + '"' + (g === current ? ' selected' : '') + '>' + esc(g) + '</option>';
    });
    if (current && !found) {
      opts += '<option value="' + esc(current) + '" selected>' + esc(current) + '</option>';
    }
    return opts;
  };

  UI.openBookForm = function (book) {
    const isNew = !book;
    const b = book || Store.normalizeBook({ status: 'planned' });

    let html = '';
    html += lookupSectionHtml('book', isNew ? '' : b.title, isNew);

    html += '<div class="field"><label for="fTitle">제목 *</label>' +
      '<input class="input" id="fTitle" value="' + esc(b.title) + '" placeholder="책 제목"></div>';
    html += '<div class="field-row">' +
      '<div class="field"><label for="fAuthors">저자 <span style="font-weight:400">(쉼표 구분)</span></label>' +
      '<input class="input" id="fAuthors" value="' + esc((b.authors || []).join(', ')) + '"></div>' +
      '<div class="field"><label for="fTranslator">옮긴이</label>' +
      '<input class="input" id="fTranslator" value="' + esc(b.translator) + '"></div>' +
      '</div>';
    html += '<div class="field-row">' +
      '<div class="field"><label for="fPublisher">출판사</label>' +
      '<input class="input" id="fPublisher" value="' + esc(b.publisher) + '"></div>' +
      '<div class="field"><label for="fPubDate">발행일</label>' +
      '<input class="input" id="fPubDate" value="' + esc(b.publishedDate) + '" placeholder="2024-03-01"></div>' +
      '</div>';
    html += '<div class="field-row">' +
      '<div class="field"><label for="fPages">페이지</label>' +
      '<input class="input" id="fPages" type="number" inputmode="numeric" min="0" value="' +
      (b.pageCount || '') + '"></div>' +
      '<div class="field"><label for="fIsbn">ISBN</label>' +
      '<input class="input" id="fIsbn" value="' + esc(b.isbn) + '"></div>' +
      '</div>';
    html += '<div class="field"><label for="fGenre">장르</label>' +
      '<select class="input" id="fGenre">' + GENRE_OPTIONS(Store.BOOK_GENRES, b.genre) + '</select></div>';

    html += '<div class="field"><span class="field-label">한국 / 외국</span>' +
      chipsHtml('origin', [
        { value: 'domestic', label: '한국' }, { value: 'foreign', label: '외국' }
      ], b.origin) + '</div>';

    html += '<div class="field"><span class="field-label">종이책 여부</span>' +
      chipsHtml('format', [
        { value: 'paper', label: '종이책' }, { value: 'ebook', label: '전자책' },
        { value: 'audio', label: '오디오북' }
      ], b.format || 'paper') + '</div>';

    html += '<div class="field"><span class="field-label">상태</span>' +
      chipsHtml('status', [
        { value: 'planned', label: '읽을 예정' }, { value: 'reading', label: '읽는 중' },
        { value: 'finished', label: '다 읽음' }
      ], b.status) + '</div>';

    html += '<div class="field-row" data-dates>' +
      '<div class="field"><label for="fStart">읽기 시작</label>' +
      '<input class="input" id="fStart" type="date" value="' + esc(b.startedAt) + '"></div>' +
      '<div class="field"><label for="fFinish">완독</label>' +
      '<input class="input" id="fFinish" type="date" value="' + esc(b.finishedAt) + '"></div>' +
      '</div>';

    html += '<div class="field"><span class="field-label">별점</span>' + rateInputHtml(b.rating) + '</div>';
    html += '<div class="field"><label for="fOne">한줄평</label>' +
      '<input class="input" id="fOne" maxlength="120" value="' + esc(b.oneLiner) + '"></div>';
    html += '<div class="field"><label for="fNote">독서록</label>' +
      '<textarea class="textarea" id="fNote" placeholder="줄거리, 인상 깊은 문장, 생각">' +
      esc(b.note) + '</textarea></div>';

    html += '<div class="field"><label for="fCover">표지 이미지 주소</label>' +
      '<input class="input" id="fCover" value="' + esc(b.coverUrl) + '" placeholder="https://…"></div>' +
      '<div class="btn-row"><button class="btn sm ghost" type="button" data-act="pickfile">사진에서 표지 고르기</button></div>' +
      '<input type="file" accept="image/*" id="fCoverFile" style="display:none">';

    UI.openSheet({
      title: isNew ? '책 추가' : '책 수정',
      body: html,
      action: { label: '저장', fn: null },
      onMount: function (root, sheetApi) {
        bindRateInput(root);
        bindChips(root);
        bindLookup(root, 'book', function (r) {
          if (r.title) root.querySelector('#fTitle').value = r.title;
          if (r.authors && r.authors.length) root.querySelector('#fAuthors').value = r.authors.join(', ');
          if (r.translator) root.querySelector('#fTranslator').value = r.translator;
          if (r.publisher) root.querySelector('#fPublisher').value = r.publisher;
          if (r.publishedDate) root.querySelector('#fPubDate').value = r.publishedDate;
          if (r.pageCount) root.querySelector('#fPages').value = r.pageCount;
          if (r.isbn) root.querySelector('#fIsbn').value = r.isbn;
          if (r.coverUrl) root.querySelector('#fCover').value = r.coverUrl;
          if (r.genre) {
            const sel = root.querySelector('#fGenre');
            if (!Array.prototype.some.call(sel.options, function (o) { return o.value === r.genre; })) {
              sel.add(new Option(r.genre, r.genre));
            }
            sel.value = r.genre;
          }
          if (r.origin) {
            const g = root.querySelector('[data-chips="origin"]');
            g.dataset.value = r.origin;
            U.$$('.chip', g).forEach(function (c) {
              c.classList.toggle('is-on', c.dataset.chip === r.origin);
            });
          }
        });

        root.querySelector('[data-act="pickfile"]').addEventListener('click', function () {
          root.querySelector('#fCoverFile').click();
        });
        root.querySelector('#fCoverFile').addEventListener('change', function (e) {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          shrinkImage(file, 420).then(function (dataUrl) {
            root.querySelector('#fCover').value = dataUrl;
            UI.toast('표지를 넣었습니다.');
          }).catch(function () { UI.toast('이미지를 읽지 못했습니다.', 'warn'); });
        });

        sheetApi.setAction(function () {
          const title = root.querySelector('#fTitle').value.trim();
          if (!title) { UI.toast('제목을 입력해 주세요.', 'warn'); return; }

          const status = chipValue(root, 'status') || 'planned';
          const patch = {
            title: title,
            authors: root.querySelector('#fAuthors').value.split(',')
              .map(function (s) { return s.trim(); }).filter(Boolean),
            translator: root.querySelector('#fTranslator').value.trim(),
            publisher: root.querySelector('#fPublisher').value.trim(),
            publishedDate: root.querySelector('#fPubDate').value.trim(),
            pageCount: U.num(root.querySelector('#fPages').value, null),
            isbn: root.querySelector('#fIsbn').value.trim(),
            genre: root.querySelector('#fGenre').value,
            origin: chipValue(root, 'origin'),
            format: chipValue(root, 'format') || 'paper',
            status: status,
            startedAt: root.querySelector('#fStart').value,
            finishedAt: root.querySelector('#fFinish').value,
            rating: U.num(root.querySelector('.rate-input').dataset.value, 0) || 0,
            oneLiner: root.querySelector('#fOne').value.trim(),
            note: root.querySelector('#fNote').value,
            coverUrl: root.querySelector('#fCover').value.trim()
          };

          if (status === 'finished' && !patch.finishedAt) patch.finishedAt = U.todayStr();
          if (status !== 'planned' && !patch.startedAt) patch.startedAt = U.todayStr();
          if (status === 'reading' && !b.startedTime) patch.startedTime = U.nowIso();
          if (status === 'finished' && !b.finishedTime) patch.finishedTime = U.nowIso();

          if (isNew) {
            Store.addBook(patch);
            state.tab = status === 'finished' ? 'library' : 'shelf';
          } else {
            Store.updateBook(b.id, patch);
          }
          UI.closeSheet();
          UI.render();
          UI.toast(isNew ? '추가했습니다.' : '수정했습니다.');
        });
      }
    });
  };

  /* ================= 영상 입력/수정 폼 ================= */

  UI.openVideoForm = function (video) {
    const isNew = !video;
    const v = video || Store.normalizeVideo({ kind: 'movie', watchedAt: U.todayStr() });

    let html = '';
    html += '<div class="field"><span class="field-label">종류</span>' +
      chipsHtml('kind', [
        { value: 'movie', label: '영화' }, { value: 'series', label: '드라마 · 시리즈' }
      ], v.kind) + '</div>';

    html += lookupSectionHtml('video', isNew ? '' : v.title, isNew);

    html += '<div class="field"><label for="vTitle">제목 *</label>' +
      '<input class="input" id="vTitle" value="' + esc(v.title) + '"></div>';
    html += '<div class="field-row">' +
      '<div class="field"><label for="vDirector">감독 · 제작</label>' +
      '<input class="input" id="vDirector" value="' + esc(v.director) + '"></div>' +
      '<div class="field"><label for="vRelease">개봉 · 방영일</label>' +
      '<input class="input" id="vRelease" value="' + esc(v.releaseDate) + '" placeholder="2024-03-01"></div>' +
      '</div>';
    html += '<div class="field"><label for="vCast">출연</label>' +
      '<input class="input" id="vCast" value="' + esc(v.cast) + '"></div>';
    html += '<div class="field"><label for="vGenre">장르</label>' +
      '<select class="input" id="vGenre">' + GENRE_OPTIONS(Store.VIDEO_GENRES, v.genre) + '</select></div>';

    html += '<div class="field"><span class="field-label">한국 / 외국</span>' +
      chipsHtml('origin', [
        { value: 'domestic', label: '한국' }, { value: 'foreign', label: '외국' }
      ], v.origin) + '</div>';

    html += '<div class="field-row">' +
      '<div class="field"><label for="vRuntime">러닝타임(분, 편당)</label>' +
      '<input class="input" id="vRuntime" type="number" inputmode="numeric" min="0" value="' +
      (v.runtimeMin || '') + '"></div>' +
      '<div class="field"><label for="vEpisodes">시청 편수</label>' +
      '<input class="input" id="vEpisodes" type="number" inputmode="numeric" min="0" value="' +
      (v.episodes || '') + '"></div>' +
      '</div>';
    html += '<div class="hint" style="margin:-8px 0 14px">시리즈는 “편당 러닝타임 × 시청 편수”로 총 시청 시간을 계산합니다.</div>';

    html += '<div class="field-row">' +
      '<div class="field"><label for="vPlatform">플랫폼</label>' +
      '<input class="input" id="vPlatform" value="' + esc(v.platform) + '" placeholder="넷플릭스, 극장 …"></div>' +
      '<div class="field"><label for="vWatched">본 날짜</label>' +
      '<input class="input" id="vWatched" type="date" value="' + esc(v.watchedAt || U.todayStr()) + '"></div>' +
      '</div>';

    html += '<div class="field"><span class="field-label">별점</span>' + rateInputHtml(v.rating) + '</div>';
    html += '<div class="field"><label for="vOne">한줄평</label>' +
      '<input class="input" id="vOne" maxlength="120" value="' + esc(v.oneLiner) + '"></div>';
    html += '<div class="field"><label for="vNote">감상평</label>' +
      '<textarea class="textarea" id="vNote">' + esc(v.note) + '</textarea></div>';
    html += '<div class="field"><label for="vPoster">포스터 이미지 주소</label>' +
      '<input class="input" id="vPoster" value="' + esc(v.posterUrl) + '" placeholder="https://…"></div>' +
      '<div class="btn-row"><button class="btn sm ghost" type="button" data-act="pickfile">사진에서 포스터 고르기</button></div>' +
      '<input type="file" accept="image/*" id="vPosterFile" style="display:none">';

    UI.openSheet({
      title: isNew ? '영상 추가' : '영상 수정',
      body: html,
      action: { label: '저장', fn: null },
      onMount: function (root, sheetApi) {
        bindRateInput(root);
        bindChips(root);
        bindLookup(root, 'video', function (r) {
          if (r.title) root.querySelector('#vTitle').value = r.title;
          if (r.director) root.querySelector('#vDirector').value = r.director;
          if (r.releaseDate) root.querySelector('#vRelease').value = r.releaseDate;
          if (r.runtimeMin) root.querySelector('#vRuntime').value = r.runtimeMin;
          if (r.episodes) root.querySelector('#vEpisodes').value = r.episodes;
          if (r.posterUrl) root.querySelector('#vPoster').value = r.posterUrl;
          if (r.genre) {
            const sel = root.querySelector('#vGenre');
            if (!Array.prototype.some.call(sel.options, function (o) { return o.value === r.genre; })) {
              sel.add(new Option(r.genre, r.genre));
            }
            sel.value = r.genre;
          }
          ['origin', 'kind'].forEach(function (name) {
            if (!r[name]) return;
            const g = root.querySelector('[data-chips="' + name + '"]');
            if (!g) return;
            g.dataset.value = r[name];
            U.$$('.chip', g).forEach(function (c) {
              c.classList.toggle('is-on', c.dataset.chip === r[name]);
            });
          });
        });

        root.querySelector('[data-act="pickfile"]').addEventListener('click', function () {
          root.querySelector('#vPosterFile').click();
        });
        root.querySelector('#vPosterFile').addEventListener('change', function (e) {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          shrinkImage(file, 420).then(function (dataUrl) {
            root.querySelector('#vPoster').value = dataUrl;
            UI.toast('포스터를 넣었습니다.');
          }).catch(function () { UI.toast('이미지를 읽지 못했습니다.', 'warn'); });
        });

        sheetApi.setAction(function () {
          const title = root.querySelector('#vTitle').value.trim();
          if (!title) { UI.toast('제목을 입력해 주세요.', 'warn'); return; }
          const patch = {
            title: title,
            kind: chipValue(root, 'kind') || 'movie',
            director: root.querySelector('#vDirector').value.trim(),
            cast: root.querySelector('#vCast').value.trim(),
            releaseDate: root.querySelector('#vRelease').value.trim(),
            genre: root.querySelector('#vGenre').value,
            origin: chipValue(root, 'origin'),
            runtimeMin: U.num(root.querySelector('#vRuntime').value, null),
            episodes: U.num(root.querySelector('#vEpisodes').value, null),
            platform: root.querySelector('#vPlatform').value.trim(),
            watchedAt: root.querySelector('#vWatched').value || U.todayStr(),
            rating: U.num(root.querySelector('.rate-input').dataset.value, 0) || 0,
            oneLiner: root.querySelector('#vOne').value.trim(),
            note: root.querySelector('#vNote').value,
            posterUrl: root.querySelector('#vPoster').value.trim()
          };
          if (isNew) { Store.addVideo(patch); state.tab = 'video'; }
          else Store.updateVideo(v.id, patch);
          UI.closeSheet();
          UI.render();
          UI.toast(isNew ? '추가했습니다.' : '수정했습니다.');
        });
      }
    });
  };

  /* 사진 파일을 작게 줄여 dataURL 로 (localStorage 용량 절약) */
  function shrinkImage(file, maxW) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        const img = new Image();
        img.onerror = reject;
        img.onload = function () {
          const scale = Math.min(1, maxW / img.width);
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ================= 추가 선택 ================= */

  UI.openAddChooser = function () {
    const html =
      '<div class="btn-row" style="flex-direction:column;gap:10px">' +
      '<button class="btn red" type="button" data-act="book">' +
      '<svg viewBox="0 0 24 24"><path d="M5 4.5h9a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z"/><path d="M16 6.5h3v13H7"/></svg>' +
      '책 추가</button>' +
      '<button class="btn blue" type="button" data-act="video">' +
      '<svg viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M10 9.5l5 2.5-5 2.5z"/></svg>' +
      '영상 추가</button>' +
      '</div>' +
      '<div class="hint" style="text-align:center;margin-top:14px">제목만 입력하면 표지와 기본 정보를 인터넷에서 찾아옵니다.</div>';

    UI.openSheet({
      title: '무엇을 기록할까요?',
      body: html,
      onMount: function (root) {
        root.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-act]');
          if (!btn) return;
          UI.closeSheet();
          setTimeout(function () {
            if (btn.dataset.act === 'book') UI.openBookForm(null);
            else UI.openVideoForm(null);
          }, 180);
        });
      }
    });
  };

  /* ================= 바텀시트 ================= */

  let sheetActionFn = null;

  UI.openSheet = function (opts) {
    const host = $('#sheetHost'), body = $('#sheetBody'), action = $('#sheetAction');
    $('#sheetTitle').textContent = opts.title || '';

    // 시트를 열 때마다 새 컨테이너를 만든다.
    // (innerHTML 만 갈아끼우면 컨테이너에 붙은 이전 시트의 클릭 핸들러가 살아남아
    //  다른 책에 "다 읽음"이 적용되는 문제가 생긴다.)
    body.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'sheet-content';
    root.innerHTML = opts.body || '';
    body.appendChild(root);
    body.scrollTop = 0;

    sheetActionFn = (opts.action && opts.action.fn) || null;
    if (opts.action) {
      action.hidden = false;
      action.textContent = opts.action.label || '완료';
    } else {
      action.hidden = true;
    }

    host.hidden = false;
    document.body.style.overflow = 'hidden';

    if (opts.onMount) {
      opts.onMount(root, {
        setAction: function (fn) { sheetActionFn = fn; },
        close: UI.closeSheet
      });
    }
  };

  UI.closeSheet = function () {
    $('#sheetHost').hidden = true;
    $('#sheetBody').innerHTML = '';
    sheetActionFn = null;
    document.body.style.overflow = '';
  };

  UI.runSheetAction = function () { if (sheetActionFn) sheetActionFn(); };

  UI.openItem = function (id) {
    const item = Store.byId(id);
    if (!item) return;
    if (item.type === 'book') UI.openBookDetail(item);
    else UI.openVideoDetail(item);
  };

  global.UI = UI;
  global.UI._internals = {
    renderShelf: renderShelf, renderLibrary: renderLibrary, renderVideo: renderVideo,
    chipsHtml: chipsHtml, bindChips: bindChips, chipValue: chipValue,
    emptyHtml: emptyHtml, shrinkImage: shrinkImage
  };
})(window);
