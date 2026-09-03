/* 데이터 저장소 — localStorage 기반, 외부 서버 없음 */
(function (global) {
  'use strict';

  const KEY = 'bookshelf.data.v1';

  const DEFAULTS = {
    version: 1,
    books: [],
    videos: [],
    settings: {
      cols: 4,              // 썸네일 가로 개수 (3 또는 4)
      tmdbKey: '',          // 선택: TMDB API 키(영상 정보 정확도 향상)
      lastTab: 'shelf'
    },
    updatedAt: null
  };

  /* ---------- 분류 체계 ---------- */

  // 책 장르 (국내 서점 분류를 참고한 실용 목록)
  const BOOK_GENRES = [
    '소설', '시/에세이', '인문', '역사', '철학', '종교', '사회/정치', '경제/경영',
    '자기계발', '과학', 'IT/컴퓨터', '공학/기술', '의학/건강', '예술/대중문화',
    '여행', '요리/취미', '아동/청소년', '만화', '외국어', '교육/학습', '기타'
  ];

  // 영상 장르
  const VIDEO_GENRES = [
    '드라마', '액션', '코미디', '스릴러', '공포', 'SF', '판타지', '로맨스',
    '애니메이션', '다큐멘터리', '범죄', '미스터리', '전쟁', '역사', '음악',
    '가족', '스포츠', '어드벤처', '기타'
  ];

  // Google Books 영문 카테고리 → 한글 장르
  const CATEGORY_MAP = [
    ['juvenile', '아동/청소년'], ['young adult', '아동/청소년'],
    ['comics', '만화'], ['graphic novel', '만화'],
    ['business', '경제/경영'], ['economic', '경제/경영'], ['management', '경제/경영'],
    ['self-help', '자기계발'], ['self help', '자기계발'], ['personal growth', '자기계발'],
    ['computer', 'IT/컴퓨터'], ['programming', 'IT/컴퓨터'], ['data', 'IT/컴퓨터'],
    ['technology', '공학/기술'], ['engineering', '공학/기술'],
    ['science', '과학'], ['mathematics', '과학'], ['nature', '과학'],
    ['medical', '의학/건강'], ['health', '의학/건강'], ['fitness', '의학/건강'],
    ['history', '역사'], ['biography', '인문'], ['autobiography', '인문'],
    ['philosophy', '철학'], ['psychology', '인문'],
    ['religion', '종교'], ['bible', '종교'],
    ['political', '사회/정치'], ['social science', '사회/정치'], ['law', '사회/정치'],
    ['education', '교육/학습'], ['study aids', '교육/학습'],
    ['foreign language', '외국어'], ['language arts', '외국어'],
    ['poetry', '시/에세이'], ['essay', '시/에세이'],
    ['travel', '여행'], ['cooking', '요리/취미'], ['crafts', '요리/취미'],
    ['games', '요리/취미'], ['gardening', '요리/취미'], ['pets', '요리/취미'],
    ['sports', '요리/취미'], ['photography', '예술/대중문화'], ['art', '예술/대중문화'],
    ['music', '예술/대중문화'], ['performing arts', '예술/대중문화'],
    ['design', '예술/대중문화'], ['architecture', '예술/대중문화'],
    ['literary criticism', '인문'], ['literary collections', '시/에세이'],
    ['fiction', '소설'], ['drama', '소설'], ['humor', '시/에세이'],
    ['family', '인문'], ['reference', '기타'], ['true crime', '인문']
  ];

  // iTunes primaryGenreName → 한글 장르
  const VIDEO_GENRE_MAP = {
    'Action & Adventure': '액션', 'Action': '액션', 'Adventure': '어드벤처',
    'Comedy': '코미디', 'Drama': '드라마', 'Thriller': '스릴러',
    'Horror': '공포', 'Sci-Fi & Fantasy': 'SF', 'Science Fiction': 'SF',
    'Fantasy': '판타지', 'Romance': '로맨스', 'Animation': '애니메이션',
    'Anime': '애니메이션', 'Documentary': '다큐멘터리', 'Crime': '범죄',
    'Mystery': '미스터리', 'Mystery & Thriller': '스릴러', 'War': '전쟁',
    'History': '역사', 'Music': '음악', 'Musicals': '음악',
    'Kids & Family': '가족', 'Family': '가족', 'Sports': '스포츠',
    'Western': '어드벤처', 'Nonfiction': '다큐멘터리', 'Reality TV': '기타',
    'Classics': '드라마', 'Independent': '드라마', 'Teens': '가족'
  };

  function mapBookCategory(categories, fallbackLang) {
    const list = Array.isArray(categories) ? categories : (categories ? [categories] : []);
    for (let i = 0; i < list.length; i++) {
      const raw = String(list[i]).toLowerCase();
      // 이미 한글 장르면 그대로
      for (let g = 0; g < BOOK_GENRES.length; g++) {
        if (String(list[i]).indexOf(BOOK_GENRES[g]) === 0) return BOOK_GENRES[g];
      }
      for (let k = 0; k < CATEGORY_MAP.length; k++) {
        if (raw.indexOf(CATEGORY_MAP[k][0]) !== -1) return CATEGORY_MAP[k][1];
      }
    }
    return fallbackLang ? '기타' : '';
  }

  function mapVideoGenre(name) {
    if (!name) return '';
    if (VIDEO_GENRE_MAP[name]) return VIDEO_GENRE_MAP[name];
    for (let i = 0; i < VIDEO_GENRES.length; i++) {
      if (String(name).indexOf(VIDEO_GENRES[i]) !== -1) return VIDEO_GENRES[i];
    }
    return '기타';
  }

  /* ---------- 상태 ---------- */

  let state = null;
  const listeners = [];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) { state = clone(DEFAULTS); return state; }
    try {
      const parsed = JSON.parse(raw);
      state = Object.assign(clone(DEFAULTS), parsed);
      state.settings = Object.assign(clone(DEFAULTS.settings), parsed.settings || {});
      state.books = (parsed.books || []).map(normalizeBook);
      state.videos = (parsed.videos || []).map(normalizeVideo);
    } catch (e) {
      console.warn('저장된 데이터를 읽지 못했습니다. 새로 시작합니다.', e);
      state = clone(DEFAULTS);
    }
    return state;
  }

  function save() {
    state.updatedAt = U.nowIso();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('저장 실패', e);
      if (global.UI && UI.toast) UI.toast('저장 공간이 부족합니다. 표지 이미지를 줄여보세요.', 'warn');
      return false;
    }
    return true;
  }

  function emit() {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } });
  }

  function commit() { save(); emit(); }

  /* ---------- 정규화 ---------- */

  function normalizeBook(b) {
    b = b || {};
    return {
      id: b.id || U.uid(),
      type: 'book',
      title: b.title || '',
      subtitle: b.subtitle || '',
      authors: Array.isArray(b.authors) ? b.authors : (b.authors ? [b.authors] : []),
      translator: b.translator || '',
      publisher: b.publisher || '',
      publishedDate: b.publishedDate || '',
      isbn: b.isbn || '',
      pageCount: U.num(b.pageCount, null),
      genre: b.genre || '',
      language: b.language || '',
      origin: b.origin || '',            // 'domestic' | 'foreign'
      format: b.format || 'paper',       // 'paper' | 'ebook' | 'audio'
      coverUrl: b.coverUrl || '',
      description: b.description || '',
      source: b.source || '',
      status: b.status || 'planned',     // planned | reading | finished
      startedAt: b.startedAt || '',      // YYYY-MM-DD
      startedTime: b.startedTime || '',  // ISO (읽기 시작 버튼을 누른 시각)
      finishedAt: b.finishedAt || '',
      finishedTime: b.finishedTime || '',
      durationDays: U.num(b.durationDays, null),
      rating: U.num(b.rating, 0) || 0,
      oneLiner: b.oneLiner || '',
      note: b.note || '',
      createdAt: b.createdAt || U.nowIso(),
      updatedAt: b.updatedAt || U.nowIso()
    };
  }

  function normalizeVideo(v) {
    v = v || {};
    return {
      id: v.id || U.uid(),
      type: 'video',
      title: v.title || '',
      kind: v.kind || 'movie',           // movie | series
      director: v.director || '',
      cast: v.cast || '',
      releaseDate: v.releaseDate || '',
      genre: v.genre || '',
      country: v.country || '',
      origin: v.origin || '',            // domestic | foreign
      runtimeMin: U.num(v.runtimeMin, null),   // 편당 러닝타임(분)
      episodes: U.num(v.episodes, null),       // 시리즈: 시청 편수
      seasons: U.num(v.seasons, null),
      platform: v.platform || '',
      posterUrl: v.posterUrl || '',
      description: v.description || '',
      source: v.source || '',
      watchedAt: v.watchedAt || '',      // 시청 완료일
      watchedFrom: v.watchedFrom || '',  // 시청 시작일(선택)
      rating: U.num(v.rating, 0) || 0,
      oneLiner: v.oneLiner || '',
      note: v.note || '',
      createdAt: v.createdAt || U.nowIso(),
      updatedAt: v.updatedAt || U.nowIso()
    };
  }

  /* ---------- 조회 ---------- */

  const Store = {
    BOOK_GENRES: BOOK_GENRES,
    VIDEO_GENRES: VIDEO_GENRES,
    mapBookCategory: mapBookCategory,
    mapVideoGenre: mapVideoGenre,
    normalizeBook: normalizeBook,
    normalizeVideo: normalizeVideo,

    init: function () { return load(); },
    get state() { return state; },
    get settings() { return state.settings; },
    subscribe: function (fn) { listeners.push(fn); },
    commit: commit,

    books: function (status) {
      if (!status) return state.books.slice();
      return state.books.filter(function (b) { return b.status === status; });
    },
    videos: function () { return state.videos.slice(); },

    byId: function (id) {
      return state.books.filter(function (b) { return b.id === id; })[0] ||
             state.videos.filter(function (v) { return v.id === id; })[0] || null;
    },

    /* ---------- 변경 ---------- */

    addBook: function (data) {
      const b = normalizeBook(data);
      b.createdAt = U.nowIso(); b.updatedAt = b.createdAt;
      // 완독 상태로 바로 추가하는 경우 소요일 산출
      if (b.status === 'finished') Store.recalcDuration(b);
      state.books.unshift(b);
      commit();
      return b;
    },

    updateBook: function (id, patch) {
      const b = state.books.filter(function (x) { return x.id === id; })[0];
      if (!b) return null;
      Object.assign(b, patch);
      Store.recalcDuration(b);
      b.updatedAt = U.nowIso();
      commit();
      return b;
    },

    removeBook: function (id) {
      state.books = state.books.filter(function (x) { return x.id !== id; });
      commit();
    },

    // 읽기 시작 — 시작 시각 기록 후 '읽는 중'
    startReading: function (id) {
      const b = state.books.filter(function (x) { return x.id === id; })[0];
      if (!b) return null;
      b.status = 'reading';
      if (!b.startedAt) b.startedAt = U.todayStr();
      if (!b.startedTime) b.startedTime = U.nowIso();
      b.finishedAt = ''; b.finishedTime = ''; b.durationDays = null;
      b.updatedAt = U.nowIso();
      commit();
      return b;
    },

    // 다 읽음 — 완독일 기록, 읽은 기간 산출, 책장으로 이동
    finishReading: function (id) {
      const b = state.books.filter(function (x) { return x.id === id; })[0];
      if (!b) return null;
      b.status = 'finished';
      if (!b.startedAt) b.startedAt = U.todayStr();
      if (!b.finishedAt) b.finishedAt = U.todayStr();
      if (!b.finishedTime) b.finishedTime = U.nowIso();
      Store.recalcDuration(b);
      b.updatedAt = U.nowIso();
      commit();
      return b;
    },

    // 책장 -> 책꽂이(다시 읽는 중)로 되돌리기
    reopen: function (id) {
      const b = state.books.filter(function (x) { return x.id === id; })[0];
      if (!b) return null;
      b.status = 'reading';
      b.finishedAt = ''; b.finishedTime = ''; b.durationDays = null;
      b.updatedAt = U.nowIso();
      commit();
      return b;
    },

    recalcDuration: function (b) {
      if (b.status === 'finished' && b.startedAt && b.finishedAt) {
        b.durationDays = U.daysBetween(b.startedAt, b.finishedAt);
      } else if (b.status !== 'finished') {
        b.durationDays = null;
      }
      return b.durationDays;
    },

    addVideo: function (data) {
      const v = normalizeVideo(data);
      v.createdAt = U.nowIso(); v.updatedAt = v.createdAt;
      if (!v.watchedAt) v.watchedAt = U.todayStr();
      state.videos.unshift(v);
      commit();
      return v;
    },

    updateVideo: function (id, patch) {
      const v = state.videos.filter(function (x) { return x.id === id; })[0];
      if (!v) return null;
      Object.assign(v, patch);
      v.updatedAt = U.nowIso();
      commit();
      return v;
    },

    removeVideo: function (id) {
      state.videos = state.videos.filter(function (x) { return x.id !== id; });
      commit();
    },

    setSetting: function (k, v) {
      state.settings[k] = v;
      commit();
    },

    /* ---------- 백업 ---------- */

    exportJson: function () {
      return JSON.stringify(state, null, 2);
    },

    importJson: function (text, mode) {
      const data = JSON.parse(text);
      const books = (data.books || []).map(normalizeBook);
      const videos = (data.videos || []).map(normalizeVideo);
      if (mode === 'replace') {
        state.books = books;
        state.videos = videos;
        if (data.settings) state.settings = Object.assign(state.settings, data.settings);
      } else {
        const bookIds = {}, videoIds = {};
        state.books.forEach(function (b) { bookIds[b.id] = 1; });
        state.videos.forEach(function (v) { videoIds[v.id] = 1; });
        books.forEach(function (b) { if (!bookIds[b.id]) state.books.push(b); });
        videos.forEach(function (v) { if (!videoIds[v.id]) state.videos.push(v); });
      }
      commit();
      return { books: books.length, videos: videos.length };
    },

    clearAll: function () {
      state.books = []; state.videos = [];
      commit();
    }
  };

  global.Store = Store;
})(window);
