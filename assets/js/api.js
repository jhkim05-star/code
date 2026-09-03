/* 표지·서지정보 자동 조회
 * 책  : Google Books API (키 불필요) → 실패 시 Open Library
 * 영상: iTunes Search API (키 불필요) → 설정에 TMDB 키가 있으면 TMDB 우선
 * 브라우저에서 직접 호출하며, 서버·중계 없이 동작합니다.
 */
(function (global) {
  'use strict';

  const API = {};

  /* ---------- 공통 ---------- */

  function timeout(ms) {
    return new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, ms);
    });
  }

  function getJson(url, ms) {
    return Promise.race([
      fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }),
      timeout(ms || 9000)
    ]);
  }

  // file:// 등 CORS가 막히는 환경을 위한 JSONP 대체 경로
  let jsonpSeq = 0;
  function jsonp(url, ms) {
    return new Promise(function (resolve, reject) {
      const cb = '__bs_cb_' + (++jsonpSeq) + '_' + Date.now().toString(36);
      const script = document.createElement('script');
      const timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, ms || 9000);
      function cleanup() {
        clearTimeout(timer);
        try { delete global[cb]; } catch (e) { global[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      global[cb] = function (data) { cleanup(); resolve(data); };
      script.onerror = function () { cleanup(); reject(new Error('network')); };
      script.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + cb;
      document.head.appendChild(script);
    });
  }

  function fetchWithFallback(url) {
    return getJson(url).catch(function () { return jsonp(url); });
  }

  /* ---------- 책 ---------- */

  // Google Books 썸네일은 작고 http 인 경우가 있어 보정
  function upgradeGoogleCover(url) {
    if (!url) return '';
    let u = U.https(url);
    u = u.replace(/&edge=curl/g, '');
    u = u.replace(/zoom=\d/, 'zoom=2');
    return u;
  }

  function pickIsbn(ids) {
    if (!ids || !ids.length) return '';
    let isbn13 = '', isbn10 = '';
    ids.forEach(function (i) {
      if (i.type === 'ISBN_13') isbn13 = i.identifier;
      else if (i.type === 'ISBN_10') isbn10 = i.identifier;
    });
    return isbn13 || isbn10 || '';
  }

  function normalizeGoogleVolume(item) {
    const v = item.volumeInfo || {};
    const lang = v.language || '';
    return {
      source: 'google',
      sourceId: item.id,
      title: v.title || '',
      subtitle: v.subtitle || '',
      authors: v.authors || [],
      publisher: v.publisher || '',
      publishedDate: v.publishedDate || '',
      isbn: pickIsbn(v.industryIdentifiers),
      pageCount: v.pageCount || null,
      language: lang,
      origin: lang === 'ko' ? 'domestic' : (lang ? 'foreign' : ''),
      genre: Store.mapBookCategory(v.categories, true),
      coverUrl: upgradeGoogleCover(v.imageLinks &&
        (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)),
      description: (v.description || '').slice(0, 1200)
    };
  }

  function searchGoogleBooks(q) {
    const base = 'https://www.googleapis.com/books/v1/volumes?q=' +
      encodeURIComponent(q) + '&maxResults=16&printType=books&orderBy=relevance';
    return fetchWithFallback(base).then(function (data) {
      if (!data || !data.items) return [];
      return data.items.map(normalizeGoogleVolume).filter(function (b) { return b.title; });
    });
  }

  function searchOpenLibrary(q) {
    const url = 'https://openlibrary.org/search.json?limit=14&q=' + encodeURIComponent(q) +
      '&fields=key,title,subtitle,author_name,first_publish_year,publisher,isbn,cover_i,' +
      'number_of_pages_median,language,subject';
    return getJson(url).then(function (data) {
      const docs = (data && data.docs) || [];
      return docs.map(function (d) {
        const langs = d.language || [];
        const isKo = langs.indexOf('kor') !== -1;
        return {
          source: 'openlibrary',
          sourceId: d.key || '',
          title: d.title || '',
          subtitle: d.subtitle || '',
          authors: d.author_name || [],
          publisher: (d.publisher && d.publisher[0]) || '',
          publishedDate: d.first_publish_year ? String(d.first_publish_year) : '',
          isbn: (d.isbn && d.isbn[0]) || '',
          pageCount: d.number_of_pages_median || null,
          language: isKo ? 'ko' : (langs[0] || ''),
          origin: isKo ? 'domestic' : (langs.length ? 'foreign' : ''),
          genre: Store.mapBookCategory(d.subject, true),
          coverUrl: d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg' : '',
          description: ''
        };
      }).filter(function (b) { return b.title; });
    });
  }

  // 제목(또는 ISBN)으로 책 검색
  API.searchBooks = function (q) {
    const query = String(q || '').trim();
    if (!query) return Promise.resolve([]);
    const isIsbn = /^[\d-]{10,17}$/.test(query);
    const gq = isIsbn ? 'isbn:' + query.replace(/-/g, '') : query;

    return searchGoogleBooks(gq).then(function (list) {
      if (list.length) return list;
      return searchOpenLibrary(query);
    }).catch(function () {
      return searchOpenLibrary(query).catch(function () { return []; });
    });
  };

  /* ---------- 영상 ---------- */

  const TMDB_GENRES = {
    28: '액션', 12: '어드벤처', 16: '애니메이션', 35: '코미디', 80: '범죄',
    99: '다큐멘터리', 18: '드라마', 10751: '가족', 14: '판타지', 36: '역사',
    27: '공포', 10402: '음악', 9648: '미스터리', 10749: '로맨스', 878: 'SF',
    10770: '드라마', 53: '스릴러', 10752: '전쟁', 37: '어드벤처',
    10759: '액션', 10762: '가족', 10763: '다큐멘터리', 10764: '기타',
    10765: 'SF', 10766: '드라마', 10767: '기타', 10768: '전쟁'
  };

  function originFromCountry(code) {
    if (!code) return '';
    const c = String(code).toUpperCase();
    return (c === 'KR' || c === 'KOR' || c === '대한민국' || c === '한국') ? 'domestic' : 'foreign';
  }

  function bigArtwork(url) {
    if (!url) return '';
    return U.https(url).replace(/\/\d+x\d+bb\./, '/600x600bb.');
  }

  function searchItunes(q, kind) {
    const isSeries = kind === 'series';
    const url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(q) +
      (isSeries ? '&media=tvShow&entity=tvSeason' : '&media=movie&entity=movie') +
      '&limit=12&country=KR&lang=ko_kr';
    return fetchWithFallback(url).then(function (data) {
      const results = (data && data.results) || [];
      return results.map(function (r) {
        const mins = r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : null;
        return {
          source: 'itunes',
          sourceId: String(r.trackId || r.collectionId || ''),
          title: isSeries ? (r.collectionName || r.trackName || '') : (r.trackName || ''),
          kind: isSeries ? 'series' : 'movie',
          director: r.artistName || '',
          releaseDate: (r.releaseDate || '').slice(0, 10),
          genre: Store.mapVideoGenre(r.primaryGenreName),
          country: r.country || '',
          origin: originFromCountry(r.country),
          runtimeMin: isSeries ? null : mins,
          episodes: isSeries ? (r.trackCount || null) : null,
          posterUrl: bigArtwork(r.artworkUrl100),
          description: (r.longDescription || r.shortDescription || '').slice(0, 1200)
        };
      }).filter(function (v) { return v.title; });
    });
  }

  function searchTmdb(q, key) {
    const url = 'https://api.themoviedb.org/3/search/multi?api_key=' + encodeURIComponent(key) +
      '&language=ko-KR&include_adult=false&query=' + encodeURIComponent(q);
    return getJson(url).then(function (data) {
      const results = (data && data.results) || [];
      return results.filter(function (r) {
        return r.media_type === 'movie' || r.media_type === 'tv';
      }).map(function (r) {
        const isTv = r.media_type === 'tv';
        const countries = r.origin_country || [];
        const genreName = (r.genre_ids || []).map(function (g) { return TMDB_GENRES[g]; })
          .filter(Boolean)[0] || '';
        return {
          source: 'tmdb',
          sourceId: String(r.id),
          title: (isTv ? r.name : r.title) || r.original_name || r.original_title || '',
          kind: isTv ? 'series' : 'movie',
          director: '',
          releaseDate: (isTv ? r.first_air_date : r.release_date) || '',
          genre: genreName,
          country: countries[0] || (r.original_language === 'ko' ? 'KR' : ''),
          origin: countries.length ? originFromCountry(countries[0])
            : (r.original_language === 'ko' ? 'domestic' : 'foreign'),
          runtimeMin: null,
          episodes: null,
          posterUrl: r.poster_path ? 'https://image.tmdb.org/t/p/w500' + r.poster_path : '',
          description: (r.overview || '').slice(0, 1200)
        };
      }).filter(function (v) { return v.title; });
    });
  }

  // 영화/시리즈 검색. kind: 'movie' | 'series'
  API.searchVideos = function (q, kind) {
    const query = String(q || '').trim();
    if (!query) return Promise.resolve([]);
    const key = (Store.settings && Store.settings.tmdbKey || '').trim();

    const primary = key ? searchTmdb(query, key) : searchItunes(query, kind);
    return primary.then(function (list) {
      if (list.length) return list;
      return key ? searchItunes(query, kind) : [];
    }).catch(function () {
      return key ? searchItunes(query, kind).catch(function () { return []; })
                 : [];
    });
  };

  global.API = API;
})(window);
