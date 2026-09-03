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
      aladinKey: '',        // 선택: 알라딘 TTB 키(국내서 정확도 향상)
      tmdbKey: '',          // 선택: TMDB API 키(영상 정보 정확도 향상)
      lastTab: 'shelf',
      lastBackupAt: '',     // 마지막 JSON 백업 시각(ISO)
      persistent: null      // 브라우저가 저장소 삭제를 막아주는 상태인지
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

  // 알라딘 categoryName("국내도서>소설/시/희곡>한국소설") → 한글 장르
  // 앞쪽 항목이 먼저 매칭되므로 좁은 분류를 위에 둔다.
  // ('소설/시/희곡' 처럼 여러 장르가 묶인 상위 분류는 대표값인 소설로 본다)
  const ALADIN_CATEGORY_MAP = [
    // 다른 항목의 부분 문자열과 겹치는 합성어를 먼저 걸러낸다
    // ('성공학'은 '공학', '요리에세이'는 '에세이'에 걸리므로 위에 둔다)
    ['성공학', '자기계발'], ['요리에세이', '요리/취미'], ['여행에세이', '여행'],
    ['에세이', '시/에세이'], ['한국시', '시/에세이'], ['외국시', '시/에세이'],
    ['시집', '시/에세이'],
    ['소설', '소설'], ['희곡', '시/에세이'], ['시/희곡', '시/에세이'],
    ['만화', '만화'], ['라이트노벨', '소설'],
    ['어린이', '아동/청소년'], ['청소년', '아동/청소년'], ['유아', '아동/청소년'],
    ['컴퓨터/모바일', 'IT/컴퓨터'], ['컴퓨터공학', 'IT/컴퓨터'],
    ['공학', '공학/기술'], ['기술', '공학/기술'],
    ['경제경영', '경제/경영'], ['경영', '경제/경영'],
    ['자기계발', '자기계발'],
    ['인문학', '인문'], ['철학', '철학'], ['심리학', '인문'],
    ['역사', '역사'], ['종교', '종교'], ['역학', '종교'],
    ['사회과학', '사회/정치'], ['정치', '사회/정치'], ['법학', '사회/정치'],
    ['과학', '과학'], ['수학', '과학'],
    ['의학', '의학/건강'], ['간호', '의학/건강'], ['건강', '의학/건강'],
    ['요리', '요리/취미'], ['살림', '요리/취미'], ['취미', '요리/취미'],
    ['스포츠', '요리/취미'], ['반려동물', '요리/취미'],
    ['여행', '여행'],
    ['예술', '예술/대중문화'], ['대중문화', '예술/대중문화'], ['사진', '예술/대중문화'],
    ['건축', '예술/대중문화'], ['디자인', '예술/대중문화'], ['음악', '예술/대중문화'],
    ['외국어', '외국어'], ['수험서', '교육/학습'], ['자격증', '교육/학습'],
    ['대학교재', '교육/학습'], ['참고서', '교육/학습'], ['교육', '교육/학습'],
    ['좋은부모', '인문'], ['가정', '인문'], ['잡지', '기타'], ['전집', '기타']
  ];

  // 가장 구체적인 분류(뒤쪽 단계)부터 거슬러 올라가며 찾는다.
  // "국내도서>소설/시/희곡>한국소설" 은 '한국소설'에서 먼저 걸려 '소설'이 된다.
  function mapAladinCategory(categoryName) {
    const name = String(categoryName || '');
    if (!name) return '';
    const parts = name.split('>').map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s !== '국내도서' && s !== '외국도서'; });
    for (let p = parts.length - 1; p >= 0; p--) {
      for (let i = 0; i < ALADIN_CATEGORY_MAP.length; i++) {
        if (parts[p].indexOf(ALADIN_CATEGORY_MAP[i][0]) !== -1) return ALADIN_CATEGORY_MAP[i][1];
      }
    }
    // 외국도서는 분류명이 영문으로 오므로 호출부에서 영문 매핑으로 넘긴다
    return '';
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
    mapAladinCategory: mapAladinCategory,
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
