/* 통계 화면 · 설정 화면 · 내보내기 */
(function (global) {
  'use strict';

  const $ = U.$, esc = U.esc;
  const state = UI.state;

  /* ================================================================
     통계
     - 추이: 2계열(책·영상) 누적 막대 + 범례 + 값 직접 표기 + 표 보기
     - 분포: 단일 색상 가로 막대(크기 비교) / 2계열 비율 막대
     - 색: 레드(책) · 블루(영상) — 색각이상 분리도 검증을 통과한 조합
     ================================================================ */

  const BAR_AREA = 108; // 막대 영역 높이(px)

  function tile(k, v, unit, sub, color) {
    return '<div class="tile ' + color + '">' +
      '<div class="tile-k">' + esc(k) + '</div>' +
      '<div class="tile-v">' + v + (unit ? '<span class="unit">' + esc(unit) + '</span>' : '') + '</div>' +
      (sub ? '<div class="tile-sub">' + esc(sub) + '</div>' : '') +
      '</div>';
  }

  function trendChart(computed) {
    const series = computed.series;
    let max = 0;
    series.forEach(function (s) { max = Math.max(max, s.bookCount + s.videoCount); });
    if (!max) max = 1;

    const cols = series.map(function (s) {
      const total = s.bookCount + s.videoCount;
      const h = Math.round((total / max) * BAR_AREA);
      const bookH = total ? Math.max(s.bookCount ? 2 : 0, Math.round((s.bookCount / total) * h)) : 0;
      const videoH = total ? Math.max(s.videoCount ? 2 : 0, h - bookH) : 0;
      const sel = state.statsBucket === s.key;
      return '<button class="bar-col' + (sel ? ' is-now' : '') + '" type="button" ' +
        'data-bucket="' + esc(s.key) + '" aria-label="' + esc(s.longLabel) + ' 책 ' +
        s.bookCount + '권, 영상 ' + s.videoCount + '편">' +
        '<div class="bar-val">' + (total || '') + '</div>' +
        '<div class="bar-stack" style="height:' + h + 'px">' +
        (s.bookCount ? '<div class="bar-seg red" style="height:' + bookH + 'px"></div>' : '') +
        (s.videoCount ? '<div class="bar-seg blue" style="height:' + videoH + 'px"></div>' : '') +
        '</div></button>';
    }).join('');

    const labels = series.map(function (s) {
      return '<span>' + esc(s.label) + '</span>';
    }).join('');

    let table = '';
    if (state.statsTable) {
      table = '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>기간</th><th>책(권)</th><th>페이지</th><th>영상(편)</th><th>시청(분)</th></tr></thead><tbody>' +
        series.map(function (s) {
          return '<tr><td>' + esc(s.label) + '</td><td>' + s.bookCount + '</td><td>' + s.pages +
            '</td><td>' + s.videoCount + '</td><td>' + s.minutes + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    }

    return '<div class="chart-card">' +
      '<div class="chart-head"><h3 class="chart-title">' +
      (computed.gran === 'week' ? '주별 추이' : '월별 추이') + '</h3>' +
      '<span class="chart-note">' + esc(computed.range.label) + '</span></div>' +
      '<div class="chart-legend">' +
      '<span class="legend-item"><span class="legend-swatch red"></span>책(완독)</span>' +
      '<span class="legend-item"><span class="legend-swatch blue"></span>영상(시청)</span>' +
      '</div>' +
      '<div class="bars" data-bars>' + cols + '</div>' +
      '<div class="bar-x">' + labels + '</div>' +
      '<button class="table-toggle" type="button" data-act="toggle-table">' +
      (state.statsTable ? '표 접기' : '숫자로 보기') + '</button>' +
      table +
      '</div>';
  }

  function hbarChart(title, note, list, color, unitLabel) {
    if (!list.length) {
      return '<div class="chart-card">' +
        '<div class="chart-head"><h3 class="chart-title">' + esc(title) + '</h3></div>' +
        '<div class="hint" style="margin-top:8px">기록이 없습니다.</div></div>';
    }
    const max = list.reduce(function (m, x) { return Math.max(m, x.value); }, 0) || 1;
    const rows = list.slice(0, 8).map(function (x, i) {
      // 단일 색상 명도 계단 — 크기 비교용(범주 식별용 아님)
      const alpha = 1 - (i * 0.085);
      const bg = color === 'red'
        ? 'linear-gradient(180deg,rgba(255,107,134,' + alpha + '),rgba(209,16,58,' + alpha + '))'
        : 'linear-gradient(180deg,rgba(86,169,255,' + alpha + '),rgba(0,87,207,' + alpha + '))';
      return '<div class="hbar-row">' +
        '<span class="hbar-k">' + esc(x.key) + '</span>' +
        '<span class="hbar-track"><span class="hbar-fill" style="width:' +
        Math.max(4, Math.round((x.value / max) * 100)) + '%;background:' + bg + '"></span></span>' +
        '<span class="hbar-v">' + x.value + (unitLabel || '') + '</span>' +
        '</div>';
    }).join('');

    return '<div class="chart-card">' +
      '<div class="chart-head"><h3 class="chart-title">' + esc(title) + '</h3>' +
      (note ? '<span class="chart-note">' + esc(note) + '</span>' : '') + '</div>' +
      '<div class="hbars">' + rows + '</div></div>';
  }

  function ratioChart(title, list, note) {
    const total = list.reduce(function (s, x) { return s + x.value; }, 0);
    if (!total) {
      return '<div class="chart-card">' +
        '<div class="chart-head"><h3 class="chart-title">' + esc(title) + '</h3></div>' +
        '<div class="hint" style="margin-top:8px">기록이 없습니다.</div></div>';
    }
    const colors = ['red', 'blue', 'red', 'blue'];
    const segs = list.map(function (x, i) {
      return '<span class="ratio-seg ' + colors[i % 2] +
        (i > 1 ? '" style="opacity:.55;width:' : '" style="width:') +
        ((x.value / total) * 100).toFixed(1) + '%"></span>';
    }).join('');
    const legend = list.map(function (x) {
      return '<span>' + esc(x.key) + ' <b style="color:#fff">' + x.value + '</b> · ' +
        Math.round((x.value / total) * 100) + '%</span>';
    }).join('');

    return '<div class="chart-card">' +
      '<div class="chart-head"><h3 class="chart-title">' + esc(title) + '</h3>' +
      (note ? '<span class="chart-note">' + esc(note) + '</span>' : '') + '</div>' +
      '<div class="ratio-bar">' + segs + '</div>' +
      '<div class="ratio-legend">' + legend + '</div></div>';
  }

  UI.renderStats = function () {
    const computed = Stats.compute(state.statsGran, 12);
    const picked = state.statsBucket ? Stats.bucketSummary(computed, state.statsBucket) : null;
    const focus = picked || { label: computed.range.label, summary: computed.range.summary };
    const s = focus.summary;
    const cur = computed.current.summary;

    let html = '';

    // 이번 달 / 이번 주 요약
    html += '<div class="section-head"><h2 class="section-title red"><span class="bar"></span>' +
      esc(computed.current.label) + '</h2></div>';
    html += '<div class="stat-tiles">' +
      tile('완독', cur.bookCount, '권', cur.pages ? cur.pages.toLocaleString() + '쪽' : '', 'red') +
      tile('본 영상', cur.videoCount, '편', cur.minutes ? U.fmtMinutes(cur.minutes) : '', 'blue') +
      tile('평균 별점(책)', cur.bookAvgRating ? cur.bookAvgRating.toFixed(1) : '—', '', '5점 만점', 'red') +
      tile('평균 독서 기간', cur.avgDurationDays ? cur.avgDurationDays.toFixed(1) : '—', '일',
        cur.durationSamples ? cur.durationSamples + '권 기준' : '', 'blue') +
      '</div>';

    // 추이
    html += trendChart(computed);

    // 선택 구간 안내
    html += '<div class="section-head" style="margin-top:18px">' +
      '<h2 class="section-title blue"><span class="bar"></span>' + esc(focus.label) + ' 분석</h2>' +
      (state.statsBucket
        ? '<button class="table-toggle" type="button" data-act="clear-bucket">전체 범위로</button>'
        : '<span class="section-count">막대를 누르면 그 구간만 봅니다</span>') +
      '</div>';

    html += '<div class="stat-tiles">' +
      tile('읽은 페이지', s.pages.toLocaleString(), '쪽',
        s.bookCount ? '완독 ' + s.bookCount + '권' : '', 'red') +
      tile('시청 시간', s.minutes ? Math.round(s.minutes / 60) : 0, '시간',
        s.videoCount ? s.videoCount + '편 · ' + s.episodes + '회차' : '', 'blue') +
      '</div>';

    html += hbarChart('책 장르', s.bookCount + '권', s.bookGenre, 'red', '권');
    html += ratioChart('책 · 한국/외국', s.bookOrigin);
    html += ratioChart('책 · 종이책 여부', s.bookFormat);
    html += hbarChart('영상 장르', s.videoCount + '편', s.videoGenre, 'blue', '편');
    html += ratioChart('영상 · 한국/외국', s.videoOrigin);
    if (s.platforms.length) html += hbarChart('시청 플랫폼', '', s.platforms, 'blue', '편');
    if (s.authors.length > 1) html += hbarChart('많이 읽은 저자', '', s.authors, 'red', '권');

    // 전체 기록
    const all = computed.allTime.summary;
    html += '<div class="section-head" style="margin-top:18px">' +
      '<h2 class="section-title red"><span class="bar"></span>전체 기록</h2>' +
      (computed.allTime.firstRecord
        ? '<span class="section-count">' + U.fmtDate(computed.allTime.firstRecord) + ' 부터</span>' : '') +
      '</div>';
    html += '<div class="stat-tiles">' +
      tile('총 완독', all.bookCount, '권', all.pages.toLocaleString() + '쪽', 'red') +
      tile('총 시청', all.videoCount, '편', U.fmtMinutes(all.minutes), 'blue') +
      tile('읽는 중', computed.allTime.readingNow, '권', '책꽂이', 'red') +
      tile('읽을 예정', computed.allTime.planned, '권', '책꽂이', 'blue') +
      '</div>';

    const body = $('#statsBody');
    body.innerHTML = html;

    body.onclick = function (e) {
      const bar = e.target.closest('[data-bucket]');
      if (bar) {
        state.statsBucket = (state.statsBucket === bar.dataset.bucket) ? null : bar.dataset.bucket;
        UI.renderStats();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'toggle-table') { state.statsTable = !state.statsTable; UI.renderStats(); }
      else if (act.dataset.act === 'clear-bucket') { state.statsBucket = null; UI.renderStats(); }
    };
  };

  /* ================================================================
     내보내기
     ================================================================ */

  const BOOK_COLUMNS = ['상태', '제목', '부제', '저자', '옮긴이', '출판사', '발행일', 'ISBN',
    '페이지', '장르', '한국/외국', '종이책 여부', '별점', '읽기 시작', '완독일', '읽은 기간(일)',
    '한줄평', '독서록', '등록일'];
  const BOOK_WIDTHS = [9, 30, 20, 18, 12, 16, 12, 16, 8, 12, 10, 11, 7, 12, 12, 12, 34, 50, 12];

  const VIDEO_COLUMNS = ['종류', '제목', '감독/제작', '출연', '개봉·방영일', '장르', '제작국가',
    '한국/외국', '러닝타임(분)', '편수', '총 시청시간(분)', '플랫폼', '별점', '본 날짜',
    '한줄평', '감상평', '등록일'];
  const VIDEO_WIDTHS = [9, 30, 18, 22, 13, 12, 11, 10, 12, 8, 14, 12, 7, 12, 34, 50, 12];

  const STATUS_LABEL = { planned: '읽을 예정', reading: '읽는 중', finished: '완독' };

  function bookRows() {
    return Store.books().slice().sort(function (a, b) {
      return (b.finishedAt || b.startedAt || b.createdAt || '')
        .localeCompare(a.finishedAt || a.startedAt || a.createdAt || '');
    }).map(function (b) {
      return [
        STATUS_LABEL[b.status] || b.status,
        b.title, b.subtitle, (b.authors || []).join(', '), b.translator,
        b.publisher, b.publishedDate, b.isbn,
        b.pageCount || '', b.genre,
        Stats.ORIGIN_LABEL[b.origin] || '',
        Stats.FORMAT_LABEL[b.format] || '',
        b.rating || '',
        b.startedAt, b.finishedAt, b.durationDays || '',
        b.oneLiner, b.note,
        (b.createdAt || '').slice(0, 10)
      ];
    });
  }

  function videoRows() {
    return Store.videos().slice().sort(function (a, b) {
      return (b.watchedAt || '').localeCompare(a.watchedAt || '');
    }).map(function (v) {
      return [
        Stats.KIND_LABEL[v.kind] || v.kind,
        v.title, v.director, v.cast, v.releaseDate, v.genre, v.country,
        Stats.ORIGIN_LABEL[v.origin] || '',
        v.runtimeMin || '', v.episodes || '', Stats.videoMinutes(v) || '',
        v.platform, v.rating || '', v.watchedAt,
        v.oneLiner, v.note,
        (v.createdAt || '').slice(0, 10)
      ];
    });
  }

  function periodRows() {
    const rows = [];
    [['월별', 'month'], ['주별', 'week']].forEach(function (pair) {
      const c = Stats.compute(pair[1], 12);
      c.series.forEach(function (s) {
        const cell = c.byBucket[s.key];
        const sum = Stats.summarize(cell.books, cell.videos);
        rows.push([
          pair[0], s.longLabel, s.bookCount, s.pages, s.videoCount, s.minutes,
          sum.bookAvgRating || '', sum.videoAvgRating || '', sum.avgDurationDays || ''
        ]);
      });
    });
    return rows;
  }

  function distributionRows() {
    const c = Stats.compute('month', 12);
    const s = c.allTime.summary;
    const rows = [];
    function push(group, list, unit) {
      list.forEach(function (x) { rows.push([group, x.key, x.value, unit]); });
    }
    push('책 · 장르', s.bookGenre, '권');
    push('책 · 한국/외국', s.bookOrigin, '권');
    push('책 · 종이책 여부', s.bookFormat, '권');
    push('책 · 저자', s.authors, '권');
    push('영상 · 장르', s.videoGenre, '편');
    push('영상 · 한국/외국', s.videoOrigin, '편');
    push('영상 · 종류', s.videoKind, '편');
    push('영상 · 플랫폼', s.platforms, '편');
    return rows;
  }

  UI.exportXlsx = function () {
    try {
      const blob = XLSXWriter.build([
        { name: '책', columns: BOOK_COLUMNS, rows: bookRows(), widths: BOOK_WIDTHS },
        { name: '비디오장', columns: VIDEO_COLUMNS, rows: videoRows(), widths: VIDEO_WIDTHS },
        {
          name: '기간별 통계',
          columns: ['구분', '기간', '완독(권)', '읽은 페이지', '시청(편)', '시청시간(분)',
            '평균 별점(책)', '평균 별점(영상)', '평균 독서기간(일)'],
          rows: periodRows(),
          widths: [8, 26, 11, 13, 10, 13, 14, 15, 16]
        },
        {
          name: '분포',
          columns: ['구분', '항목', '개수', '단위'],
          rows: distributionRows(),
          widths: [18, 22, 8, 6]
        }
      ]);
      U.download(blob, '독서영상기록_' + U.stamp() + '.xlsx');
      UI.toast('엑셀 파일을 내보냈습니다.');
    } catch (e) {
      console.error(e);
      UI.toast('내보내기에 실패했습니다: ' + e.message, 'warn');
    }
  };

  UI.exportCsv = function (which) {
    const isBook = which === 'book';
    const csv = XLSXWriter.toCsv(
      isBook ? BOOK_COLUMNS : VIDEO_COLUMNS,
      isBook ? bookRows() : videoRows()
    );
    U.download(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      (isBook ? '독서기록_' : '영상기록_') + U.stamp() + '.csv');
    UI.toast('CSV 파일을 내보냈습니다.');
  };

  UI.exportJson = function () {
    U.download(new Blob([Store.exportJson()], { type: 'application/json' }),
      '기록백업_' + U.stamp() + '.json');
    Store.setSetting('lastBackupAt', U.nowIso());
    if (UI.state.tab === 'settings') UI.renderSettings();
    UI.toast('백업 파일을 내보냈습니다.');
  };

  /* ================================================================
     설정
     ================================================================ */

  function listItem(icon, color, title, desc, act) {
    return '<button class="list-item" type="button" data-act="' + act + '">' +
      '<span class="list-icon ' + color + '">' + icon + '</span>' +
      '<span class="list-text"><span class="list-title">' + esc(title) + '</span>' +
      (desc ? '<span class="list-desc">' + esc(desc) + '</span>' : '') + '</span>' +
      '<span class="list-chevron">›</span></button>';
  }

  const ICON = {
    excel: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9.5 12l5 5M14.5 12l-5 5"/></svg>',
    csv: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h4"/></svg>',
    backup: '<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    restore: '<svg viewBox="0 0 24 24"><path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20l-2 2.5"/><path d="M16 12v3"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7l1 12a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2l1-12"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3.5l7 2.5v5.5c0 4-2.9 7.4-7 8.5-4.1-1.1-7-4.5-7-8.5V6z"/><path d="M9 12l2 2 4-4"/></svg>'
  };

  // 입력칸의 예시(placeholder) 문구를 실제 키로 착각해 그대로 타이핑/붙여넣기 한
  // 경우를 걸러낸다. 지금까지 이 필드에 썼던 예시 문자열 전부와, 'x'가 6개
  // 이상 이어지는 자리표시 패턴을 함께 본다.
  const KNOWN_PLACEHOLDER_KEYS = ['ttbxxxxxxxxxx1234', 'ttbkim05271234001'];
  function isPlaceholderLikeKey(key) {
    if (!key) return false;
    if (KNOWN_PLACEHOLDER_KEYS.indexOf(key) !== -1) return true;
    return /x{6,}/i.test(key);
  }

  // 마지막 백업 이후 경과일. 30일이 넘으면 경고색으로 알린다.
  function backupStatusHtml() {
    const last = Store.settings.lastBackupAt;
    const days = last ? U.daysBetween(last.slice(0, 10), new Date()) - 1 : null;
    const stale = (days === null || days > 30);
    const text = last
      ? U.fmtDate(last) + ' (' + (days <= 0 ? '오늘' : days + '일 전') + ')'
      : '아직 백업한 적이 없습니다';
    return '<button class="list-item" type="button" data-act="json-out">' +
      '<span class="list-icon ' + (stale ? 'red' : 'blue') + '">' + ICON.backup + '</span>' +
      '<span class="list-text"><span class="list-title">마지막 백업</span>' +
      '<span class="list-desc"' + (stale ? ' style="color:var(--red-soft)"' : '') + '>' +
      esc(text) + (stale ? ' · 지금 내보내는 것을 권합니다' : '') + '</span></span>' +
      '<span class="list-chevron">›</span></button>';
  }

  // 브라우저가 저장소를 임의로 비우지 않도록 허가받은 상태인지
  function storageStatusHtml() {
    const p = Store.settings.persistent;
    let desc;
    if (p === true) desc = '브라우저가 이 앱의 저장소를 임의로 비우지 않습니다';
    else if (p === false) desc = '브라우저가 공간 확보를 위해 기록을 지울 수 있습니다. 백업을 자주 받아주세요';
    else desc = '이 브라우저는 저장소 보호 상태를 알려주지 않습니다';
    return '<div class="list-item" style="cursor:default">' +
      '<span class="list-icon ' + (p === true ? 'blue' : 'grey') + '">' + ICON.shield + '</span>' +
      '<span class="list-text"><span class="list-title">저장소 보호 ' +
      (p === true ? '적용됨' : p === false ? '미적용' : '알 수 없음') + '</span>' +
      '<span class="list-desc">' + esc(desc) + '</span></span></div>';
  }

  UI.renderSettings = function () {
    const st = Store.state;
    const cols = Store.settings.cols === 3 ? 3 : 4;

    let html = '';

    html += '<p class="settings-group-title">보기</p><div class="list-card">' +
      '<div class="list-item" style="cursor:default">' +
      '<span class="list-icon grey">' + ICON.grid + '</span>' +
      '<span class="list-text"><span class="list-title">썸네일 크기</span>' +
      '<span class="list-desc">한 줄에 몇 권을 보여줄지 정합니다</span></span>' +
      '</div>' +
      '<div style="padding:0 14px 14px">' +
      UI._internals.chipsHtml('cols', [
        { value: '4', label: '가로 4개 (기본)' }, { value: '3', label: '가로 3개 (크게)' }
      ], String(cols)) + '</div>' +
      '</div>';

    html += '<p class="settings-group-title">내보내기</p><div class="list-card">' +
      listItem(ICON.excel, 'red', '엑셀(.xlsx)로 내보내기',
        '책 · 비디오장 · 기간별 통계 · 분포 4개 시트', 'xlsx') +
      listItem(ICON.csv, 'blue', '독서 기록 CSV', '엑셀·구글 시트에서 바로 열림', 'csv-book') +
      listItem(ICON.csv, 'blue', '영상 기록 CSV', '엑셀·구글 시트에서 바로 열림', 'csv-video') +
      '</div>';

    html += '<p class="settings-group-title">백업</p><div class="list-card">' +
      listItem(ICON.backup, 'blue', 'JSON 백업 내보내기', '표지·별점·감상까지 전부 저장', 'json-out') +
      listItem(ICON.restore, 'blue', 'JSON 백업 불러오기', '기존 기록에 합치거나 덮어쓰기', 'json-in') +
      '</div>';

    html += '<p class="settings-group-title">자동 조회</p><div class="list-card">' +
      '<div class="list-item" style="cursor:default;align-items:flex-start">' +
      '<span class="list-icon red">' + ICON.key + '</span>' +
      '<span class="list-text"><span class="list-title">카카오 책 검색 프록시 (국내서 · 우선 사용)</span>' +
      '<span class="list-desc">' + (Store.settings.kakaoProxyUrl
        ? '프록시가 등록되어 있습니다. 국내서는 카카오를 가장 먼저 조회합니다.'
        : '카카오 책 검색은 브라우저에서 직접 부를 수 없어, API 키를 대신 들고 있는 ' +
          '작은 중계 서버(프록시) 주소가 필요합니다. 직접 만들어 두는 방법은 ' +
          'reading/proxy/README.md 를 참고하세요(무료, Cloudflare Workers).') +
      '</span></span></div>' +
      '<div style="padding:0 14px 14px">' +
      '<input class="input" id="setKakaoProxy" placeholder="예: https://내프록시이름.내계정.workers.dev" value="' +
      esc(Store.settings.kakaoProxyUrl || '') + '" autocomplete="off" spellcheck="false">' +
      '<div class="btn-row">' +
      '<button class="btn sm" type="button" data-act="save-kakao">저장</button>' +
      '<button class="btn sm ghost" type="button" data-act="test-kakao">연결 확인</button>' +
      '</div></div>' +
      '<div class="list-item" style="cursor:default;align-items:flex-start">' +
      '<span class="list-icon grey">' + ICON.key + '</span>' +
      '<span class="list-text"><span class="list-title">알라딘 TTB 키 (선택 · 보조 경로)</span>' +
      '<span class="list-desc" style="color:var(--red-soft)">알라딘 OpenAPI 는 2026. 10. 30. 서비스가 종료될 예정이라 ' +
      '더 이상 권하지 않습니다. 카카오가 없거나 결과가 없을 때만 보조로 쓰입니다.</span>' +
      '<span class="list-desc">' + (Store.settings.aladinKey
        ? '키가 등록되어 있어 카카오 다음 순서로 조회됩니다.'
        : '등록되어 있지 않습니다. 위 카카오만으로 충분합니다.') +
      '</span></span></div>' +
      '<div style="padding:0 14px 14px">' +
      '<input class="input" id="setAladin" placeholder="예: ttbkim05271234001 (알라딘에서 발급받은 값)" value="' +
      esc(Store.settings.aladinKey || '') + '" autocomplete="off" spellcheck="false">' +
      '<div class="hint">입력칸 안의 회색 글씨는 예시일 뿐 실제 값이 아닙니다 — 직접 타이핑해야 저장됩니다.</div>' +
      '<div class="btn-row">' +
      '<button class="btn sm" type="button" data-act="save-aladin">저장</button>' +
      '<button class="btn sm ghost" type="button" data-act="test-aladin">연결 확인</button>' +
      '</div></div>' +
      '<div class="list-item" style="cursor:default;align-items:flex-start">' +
      '<span class="list-icon blue">' + ICON.key + '</span>' +
      '<span class="list-text"><span class="list-title">TMDB API 키 (선택 · 영상)</span>' +
      '<span class="list-desc">비워두면 iTunes 검색을 씁니다. 키를 넣으면 한글 제목·장르가 더 정확해집니다.</span>' +
      '</span></div>' +
      '<div style="padding:0 14px 14px">' +
      '<input class="input" id="setTmdb" placeholder="TMDB API Key (v3 auth)" value="' +
      esc(Store.settings.tmdbKey || '') + '" autocomplete="off" spellcheck="false">' +
      '<div class="btn-row"><button class="btn sm" type="button" data-act="save-tmdb">저장</button></div>' +
      '</div></div>';

    html += '<p class="settings-group-title">데이터</p><div class="list-card">' +
      '<div class="list-item" style="cursor:default">' +
      '<span class="list-text"><span class="list-title">저장된 기록</span>' +
      '<span class="list-desc">책 ' + st.books.length + '권 · 영상 ' + st.videos.length + '편' +
      (st.updatedAt ? ' · 마지막 저장 ' + U.fmtDateTime(st.updatedAt) : '') + '</span></span></div>' +
      backupStatusHtml() +
      storageStatusHtml() +
      listItem(ICON.trash, 'red', '모든 기록 삭제', '되돌릴 수 없습니다', 'wipe') +
      '</div>';

    html += '<div class="hint" style="text-align:center;padding:4px 8px 20px;line-height:1.6">' +
      '기록은 이 기기의 브라우저(localStorage)에만 저장됩니다.<br>' +
      '기기를 바꾸거나 사파리 데이터를 지우기 전에 JSON 백업을 내보내 두세요.</div>';

    html += '<input type="file" accept="application/json,.json" id="jsonFile" style="display:none">';

    const body = $('#settingsBody');
    body.innerHTML = html;
    UI._internals.bindChips(body);

    body.querySelector('[data-chips="cols"]').addEventListener('chipchange', function (e) {
      Store.setSetting('cols', parseInt(e.detail, 10));
      UI.render();
    });

    body.onclick = function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'xlsx') UI.exportXlsx();
      else if (act === 'csv-book') UI.exportCsv('book');
      else if (act === 'csv-video') UI.exportCsv('video');
      else if (act === 'json-out') UI.exportJson();
      else if (act === 'json-in') body.querySelector('#jsonFile').click();
      else if (act === 'save-tmdb') {
        Store.setSetting('tmdbKey', body.querySelector('#setTmdb').value.trim());
        UI.toast('저장했습니다.');
      } else if (act === 'save-aladin') {
        const key = body.querySelector('#setAladin').value.trim();
        if (isPlaceholderLikeKey(key)) {
          UI.toast('입력칸의 회색 글씨는 예시입니다. 알라딘에서 직접 발급받은 값을 넣어 주세요.', 'warn');
          return;
        }
        Store.setSetting('aladinKey', key);
        UI.toast('저장했습니다.');
        UI.renderSettings();
      } else if (act === 'test-aladin') {
        const key = body.querySelector('#setAladin').value.trim();
        if (!key) { UI.toast('먼저 TTB 키를 입력해 주세요.', 'warn'); return; }
        if (isPlaceholderLikeKey(key)) {
          UI.toast('입력칸의 회색 글씨는 예시입니다. 알라딘에서 직접 발급받은 값을 넣어 주세요.', 'warn');
          return;
        }
        Store.setSetting('aladinKey', key);
        btn.disabled = true;
        btn.textContent = '확인 중…';
        // 검색 우선순위(카카오가 먼저)와 무관하게 알라딘 자체만 직접 확인한다.
        API.testAladinKey(key).then(function (list) {
          if (list.length) UI.toast('알라딘 연결 정상 — ' + list.length + '건 조회됨');
          else UI.toast('알라딘 응답이 없습니다. 키를 확인해 주세요.', 'warn');
        }).catch(function (err) {
          console.warn('[책꽂이] 알라딘 연결 확인 실패:', err);
          UI.toast('조회에 실패했습니다. 키와 네트워크를 확인해 주세요.', 'warn');
        }).then(function () {
          btn.disabled = false;
          btn.textContent = '연결 확인';
        });
      } else if (act === 'save-kakao') {
        const url = body.querySelector('#setKakaoProxy').value.trim();
        if (url && !/^https:\/\//.test(url)) {
          UI.toast('https:// 로 시작하는 프록시 주소를 넣어 주세요.', 'warn');
          return;
        }
        Store.setSetting('kakaoProxyUrl', url);
        UI.toast('저장했습니다.');
        UI.renderSettings();
      } else if (act === 'test-kakao') {
        const url = body.querySelector('#setKakaoProxy').value.trim();
        if (!url) { UI.toast('먼저 프록시 주소를 입력해 주세요.', 'warn'); return; }
        if (!/^https:\/\//.test(url)) {
          UI.toast('https:// 로 시작하는 프록시 주소를 넣어 주세요.', 'warn');
          return;
        }
        Store.setSetting('kakaoProxyUrl', url);
        btn.disabled = true;
        btn.textContent = '확인 중…';
        API.testKakaoProxy(url).then(function (list) {
          if (list.length) UI.toast('카카오 프록시 연결 정상 — ' + list.length + '건 조회됨');
          else UI.toast('프록시는 응답했지만 결과가 없습니다. 워커 로그를 확인해 주세요.', 'warn');
        }).catch(function (err) {
          console.warn('[책꽂이] 카카오 프록시 연결 확인 실패:', err);
          UI.toast('연결에 실패했습니다. 프록시 주소와 워커 배포 상태를 확인해 주세요.', 'warn');
        }).then(function () {
          btn.disabled = false;
          btn.textContent = '연결 확인';
        });
      } else if (act === 'wipe') {
        if (confirm('모든 기록을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?') &&
            confirm('정말 삭제할까요? 먼저 JSON 백업을 받아두는 것을 권합니다.')) {
          Store.clearAll();
          UI.render();
          UI.toast('모두 삭제했습니다.', 'warn');
        }
      }
    };

    body.querySelector('#jsonFile').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const mode = confirm('확인 = 기존 기록에 합치기\n취소 = 기존 기록을 지우고 덮어쓰기')
            ? 'merge' : 'replace';
          const res = Store.importJson(reader.result, mode);
          UI.render();
          UI.toast('불러왔습니다 — 책 ' + res.books + '권, 영상 ' + res.videos + '편');
        } catch (err) {
          console.error(err);
          UI.toast('파일을 읽지 못했습니다.', 'warn');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  };

})(window);
