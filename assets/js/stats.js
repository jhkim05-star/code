/* 월별·주별 통계 계산 (렌더링은 ui.js 담당) */
(function (global) {
  'use strict';

  const Stats = {};

  const ORIGIN_LABEL = { domestic: '한국', foreign: '외국' };
  const FORMAT_LABEL = { paper: '종이책', ebook: '전자책', audio: '오디오북' };
  const KIND_LABEL = { movie: '영화', series: '시리즈' };

  Stats.ORIGIN_LABEL = ORIGIN_LABEL;
  Stats.FORMAT_LABEL = FORMAT_LABEL;
  Stats.KIND_LABEL = KIND_LABEL;

  // 영상 1편의 총 시청 시간(분)
  Stats.videoMinutes = function (v) {
    const per = U.num(v.runtimeMin, 0) || 0;
    if (v.kind === 'series') {
      const eps = U.num(v.episodes, 0) || 0;
      return per * (eps || 1);
    }
    return per;
  };

  function bucketKey(dateStr, gran) {
    return gran === 'week' ? U.weekKey(dateStr) : U.monthKey(dateStr);
  }

  // 기간 구간 정의 (오래된 것부터). month: 12개월, week: 12주
  Stats.buckets = function (gran, n) {
    return gran === 'week' ? U.recentWeekKeys(n || 12) : U.recentMonthKeys(n || 12);
  };

  function tally(map, key) {
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
  }

  function toSortedList(map) {
    return Object.keys(map).map(function (k) {
      return { key: k, value: map[k] };
    }).sort(function (a, b) { return b.value - a.value || a.key.localeCompare(b.key); });
  }

  /* 주어진 책/영상 묶음에 대한 요약 */
  Stats.summarize = function (books, videos) {
    let pages = 0, bookRatingSum = 0, bookRated = 0, durSum = 0, durCount = 0;
    const bookGenre = {}, bookOrigin = {}, bookFormat = {}, authors = {};

    books.forEach(function (b) {
      pages += U.num(b.pageCount, 0) || 0;
      if (b.rating > 0) { bookRatingSum += b.rating; bookRated++; }
      if (b.durationDays > 0) { durSum += b.durationDays; durCount++; }
      tally(bookGenre, b.genre || '미분류');
      tally(bookOrigin, ORIGIN_LABEL[b.origin] || '미분류');
      tally(bookFormat, FORMAT_LABEL[b.format] || '기타');
      (b.authors || []).slice(0, 1).forEach(function (a) { tally(authors, a); });
    });

    let minutes = 0, vRatingSum = 0, vRated = 0, episodes = 0;
    const videoGenre = {}, videoOrigin = {}, videoKind = {}, platforms = {};

    videos.forEach(function (v) {
      minutes += Stats.videoMinutes(v);
      if (v.rating > 0) { vRatingSum += v.rating; vRated++; }
      episodes += (v.kind === 'series') ? (U.num(v.episodes, 1) || 1) : 1;
      tally(videoGenre, v.genre || '미분류');
      tally(videoOrigin, ORIGIN_LABEL[v.origin] || '미분류');
      tally(videoKind, KIND_LABEL[v.kind] || '기타');
      if (v.platform) tally(platforms, v.platform);
    });

    return {
      bookCount: books.length,
      videoCount: videos.length,
      pages: pages,
      minutes: minutes,
      episodes: episodes,
      bookAvgRating: bookRated ? U.round1(bookRatingSum / bookRated) : 0,
      videoAvgRating: vRated ? U.round1(vRatingSum / vRated) : 0,
      avgDurationDays: durCount ? U.round1(durSum / durCount) : 0,
      durationSamples: durCount,
      bookGenre: toSortedList(bookGenre),
      bookOrigin: toSortedList(bookOrigin),
      bookFormat: toSortedList(bookFormat),
      videoGenre: toSortedList(videoGenre),
      videoOrigin: toSortedList(videoOrigin),
      videoKind: toSortedList(videoKind),
      platforms: toSortedList(platforms),
      authors: toSortedList(authors)
    };
  };

  /* 전체 계산 결과 */
  Stats.compute = function (gran, bucketCount) {
    const finished = Store.books('finished').filter(function (b) { return b.finishedAt; });
    const watched = Store.videos().filter(function (v) { return v.watchedAt; });

    const buckets = Stats.buckets(gran, bucketCount || 12);
    const index = {};
    buckets.forEach(function (b) {
      index[b.key] = { key: b.key, label: b.label, longLabel: b.longLabel, books: [], videos: [] };
    });

    finished.forEach(function (b) {
      const k = bucketKey(b.finishedAt, gran);
      if (index[k]) index[k].books.push(b);
    });
    watched.forEach(function (v) {
      const k = bucketKey(v.watchedAt, gran);
      if (index[k]) index[k].videos.push(v);
    });

    const series = buckets.map(function (b) {
      const cell = index[b.key];
      return {
        key: b.key,
        label: b.label,
        longLabel: b.longLabel,
        bookCount: cell.books.length,
        videoCount: cell.videos.length,
        pages: cell.books.reduce(function (s, x) { return s + (U.num(x.pageCount, 0) || 0); }, 0),
        minutes: cell.videos.reduce(function (s, x) { return s + Stats.videoMinutes(x); }, 0)
      };
    });

    const rangeBooks = [], rangeVideos = [];
    buckets.forEach(function (b) {
      rangeBooks.push.apply(rangeBooks, index[b.key].books);
      rangeVideos.push.apply(rangeVideos, index[b.key].videos);
    });

    const currentKey = buckets[buckets.length - 1].key;

    return {
      gran: gran,
      buckets: buckets,
      series: series,
      byBucket: index,
      current: {
        key: currentKey,
        label: buckets[buckets.length - 1].longLabel,
        summary: Stats.summarize(index[currentKey].books, index[currentKey].videos)
      },
      range: {
        label: gran === 'week' ? '최근 12주' : '최근 12개월',
        summary: Stats.summarize(rangeBooks, rangeVideos)
      },
      allTime: {
        summary: Stats.summarize(finished, watched),
        readingNow: Store.books('reading').length,
        planned: Store.books('planned').length,
        firstRecord: (function () {
          const dates = finished.map(function (b) { return b.finishedAt; })
            .concat(watched.map(function (v) { return v.watchedAt; }))
            .filter(Boolean).sort();
          return dates[0] || '';
        })()
      }
    };
  };

  /* 특정 구간만 요약 (막대 선택 시) */
  Stats.bucketSummary = function (computed, key) {
    const cell = computed.byBucket[key];
    if (!cell) return null;
    return {
      label: cell.longLabel,
      summary: Stats.summarize(cell.books, cell.videos)
    };
  };

  global.Stats = Stats;
})(window);
