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
      timeout(ms || 5000)
    ]);
  }

  // CORS 응답 헤더를 주지 않는 API(알라딘) 및 file:// 환경을 위한 JSONP 경로
  let jsonpSeq = 0;
  function jsonp(url, ms, paramName) {
    return new Promise(function (resolve, reject) {
      const cb = '__bs_cb_' + (++jsonpSeq) + '_' + Date.now().toString(36);
      const script = document.createElement('script');
      const timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, ms || 5000);
      function cleanup() {
        clearTimeout(timer);
        try { delete global[cb]; } catch (e) { global[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      global[cb] = function (data) { cleanup(); resolve(data); };
      script.onerror = function () { cleanup(); reject(new Error('network')); };
      script.src = url + (url.indexOf('?') === -1 ? '?' : '&') +
        (paramName || 'callback') + '=' + cb;
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

  /* ---------- 알라딘 (국내서, TTB 키 필요) ----------
   * CORS 헤더를 주지 않으므로 output=js + Callback 파라미터(JSONP)로 호출합니다.
   * 국내 신간·번역서의 표지와 서지가 Google Books 보다 정확합니다.
   */

  // "한강 (지은이), 김철수 (옮긴이)" -> {authors:['한강'], translator:'김철수'}
  function parseAladinAuthor(raw) {
    const out = { authors: [], translator: '' };
    String(raw || '').split(',').forEach(function (part) {
      const s = part.trim();
      if (!s) return;
      const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s);
      const name = (m ? m[1] : s).trim();
      const role = m ? m[2] : '';
      if (!name) return;
      if (/옮긴이|번역|역자/.test(role)) {
        out.translator = out.translator ? out.translator + ', ' + name : name;
      } else if (/그림|사진|엮은이|감수|기획/.test(role)) {
        // 부가 참여자는 저자로 넣지 않는다
      } else {
        out.authors.push(name);
      }
    });
    if (!out.authors.length && raw) out.authors = [String(raw).trim()];
    return out;
  }

  // 알라딘 표지는 coversum(작은 판)으로 오는 경우가 많아 큰 판으로 올린다
  function upgradeAladinCover(url) {
    if (!url) return '';
    return U.https(url).replace(/\/cover(sum|small|mb)\//, '/cover500/');
  }

  function searchAladin(q, key) {
    const isIsbn = /^[\d-]{10,17}$/.test(q);
    const url = 'https://www.aladin.co.kr/ttb/api/ItemSearch.aspx' +
      '?ttbkey=' + encodeURIComponent(key) +
      '&Query=' + encodeURIComponent(isIsbn ? q.replace(/-/g, '') : q) +
      '&QueryType=' + (isIsbn ? 'ISBN' : 'Keyword') +
      '&MaxResults=16&start=1&SearchTarget=Book&Cover=Big' +
      '&OptResult=itemPage&Version=20131101&output=js';

    // 알라딘 문서상 콜백 파라미터 이름은 Callback
    return jsonp(url, 5000, 'Callback').then(function (data) {
      if (!data || data.errorCode) {
        throw new Error(data && data.errorMessage ? data.errorMessage : 'aladin error');
      }
      const items = data.item || [];
      return items.map(function (it) {
        const who = parseAladinAuthor(it.author);
        const cat = it.categoryName || '';
        const sub = it.subInfo || {};
        return {
          source: 'aladin',
          sourceId: String(it.itemId || ''),
          title: (it.title || '').replace(/^\[.*?\]\s*/, ''),
          subtitle: '',
          authors: who.authors,
          translator: who.translator,
          publisher: it.publisher || '',
          publishedDate: it.pubDate || '',
          isbn: it.isbn13 || it.isbn || '',
          pageCount: U.num(sub.itemPage, null),
          language: cat.indexOf('외국도서') === 0 ? '' : 'ko',
          origin: cat.indexOf('외국도서') === 0 ? 'foreign' : 'domestic',
          // 국내도서는 한글 분류, 외국도서는 영문 분류로 오므로 순서대로 시도
          genre: Store.mapAladinCategory(cat) || Store.mapBookCategory([cat], !!cat),
          coverUrl: upgradeAladinCover(it.cover),
          description: (it.description || '').slice(0, 1200)
        };
      }).filter(function (b) { return b.title; });
    });
  }

  /* ---------- 카카오 (국내서, 프록시 필요) ----------
   * 카카오 책 검색 API는 Authorization 헤더를 요구해 브라우저에서 직접
   * 호출할 수 없다(CORS 사전 요청을 카카오가 허용하지 않음). 그래서
   * REST API 키를 보관하고 대신 호출해 주는 아주 작은 중계 서버(프록시)가
   * 필요하다 — reading/proxy/ 에 Cloudflare Workers 용 코드를 뒀다.
   * 설정에 그 프록시 주소(kakaoProxyUrl)를 넣으면 쓸 수 있다.
   */

  function searchKakao(q, proxyUrl) {
    const isIsbn = /^[\d-]{10,17}$/.test(q);
    const base = proxyUrl.replace(/\/$/, '') + '/?query=' + encodeURIComponent(q) +
      (isIsbn ? '&target=isbn' : '') + '&size=16';
    return getJson(base).then(function (data) {
      if (!data || data.error) throw new Error(data && data.error ? data.error : 'kakao proxy error');
      const docs = data.documents || [];
      return docs.map(function (d) {
        // isbn 필드에 "8965188256 9788965188256" 처럼 10/13자리가 공백으로
        // 병기되어 오므로 13자리를 우선 취한다.
        const isbns = String(d.isbn || '').split(' ').filter(Boolean);
        const isbn13 = isbns.filter(function (i) { return i.length === 13; })[0];
        return {
          source: 'kakao',
          sourceId: d.isbn || d.url || '',
          title: d.title || '',
          subtitle: '',
          authors: d.authors || [],
          translator: (d.translators || []).join(', '),
          publisher: d.publisher || '',
          publishedDate: (d.datetime || '').slice(0, 10),
          isbn: isbn13 || isbns[0] || '',
          pageCount: null,
          language: 'ko',
          origin: 'domestic',
          genre: '',
          coverUrl: U.https(d.thumbnail || ''),
          description: (d.contents || '').slice(0, 1200)
        };
      }).filter(function (b) { return b.title; });
    });
  }

  // 제목(또는 ISBN)으로 책 검색
  // 국내서는 카카오(프록시)를 가장 먼저 씁니다. 알라딘은 2026.10.30 서비스가
  // 종료될 예정이라 새로 추천하지 않지만, 종료 전까지는 카카오가 없거나
  // 실패했을 때의 보조 경로로 남겨 둡니다. 둘 다 없거나 결과가 없으면
  // Google Books → Open Library 로 넘어갑니다.
  //
  // 모든 경로가 실패하면(네트워크 차단 등) 에러를 그대로 위(UI)로 던집니다.
  // 여기서 실패를 삼켜 빈 배열을 돌려주면, 호출 쪽이 "검색 결과 없음"과
  // "조회 자체가 안 됨"을 구분하지 못해 사용자에게 원인을 알려줄 수 없습니다.
  API.searchBooks = function (q) {
    const query = String(q || '').trim();
    if (!query) return Promise.resolve([]);
    const isIsbn = /^[\d-]{10,17}$/.test(query);
    const gq = isIsbn ? 'isbn:' + query.replace(/-/g, '') : query;
    const aladinKey = (Store.settings && Store.settings.aladinKey || '').trim();
    const kakaoProxyUrl = (Store.settings && Store.settings.kakaoProxyUrl || '').trim();

    function google() {
      return searchGoogleBooks(gq).then(function (list) {
        if (list.length) return list;
        return searchOpenLibrary(query).catch(function (err) {
          console.warn('[책꽂이] Open Library 조회 실패:', err);
          throw err;
        });
      }).catch(function (err) {
        console.warn('[책꽂이] Google Books 조회 실패, Open Library 로 재시도:', err);
        return searchOpenLibrary(query).catch(function (err2) {
          console.warn('[책꽂이] Open Library 조회도 실패:', err2);
          throw err2;
        });
      });
    }

    function aladinThenGoogle() {
      if (!aladinKey) return google();
      return searchAladin(query, aladinKey).then(function (list) {
        return list.length ? list : google();
      }).catch(function (err) {
        console.warn('[책꽂이] 알라딘 조회 실패, 다른 경로로 재시도:', err);
        return google();
      });
    }

    if (!kakaoProxyUrl) return aladinThenGoogle();

    return searchKakao(query, kakaoProxyUrl).then(function (list) {
      return list.length ? list : aladinThenGoogle();
    }).catch(function (err) {
      console.warn('[책꽂이] 카카오(프록시) 조회 실패 — 다른 경로로 재시도합니다:', err);
      return aladinThenGoogle();
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
  // 두 경로가 전부 실패하면 에러를 그대로 위로 던집니다(이유는 searchBooks 주석 참고).
  API.searchVideos = function (q, kind) {
    const query = String(q || '').trim();
    if (!query) return Promise.resolve([]);
    const key = (Store.settings && Store.settings.tmdbKey || '').trim();

    const primary = key ? searchTmdb(query, key) : searchItunes(query, kind);
    return primary.then(function (list) {
      if (list.length) return list;
      if (!key) return [];
      return searchItunes(query, kind).catch(function (err) {
        console.warn('[책꽂이] iTunes 조회 실패:', err);
        throw err;
      });
    }).catch(function (err) {
      if (!key) {
        console.warn('[책꽂이] iTunes 조회 실패:', err);
        throw err;
      }
      console.warn('[책꽂이] TMDB 조회 실패, iTunes 로 재시도:', err);
      return searchItunes(query, kind).catch(function (err2) {
        console.warn('[책꽂이] iTunes 조회도 실패:', err2);
        throw err2;
      });
    });
  };

  // 설정 화면의 "연결 확인" 버튼에서 씀 — 검색 우선순위와 무관하게
  // 그 서비스 자체가 살아있는지만 직접 확인한다.
  API.testKakaoProxy = function (proxyUrl) {
    return searchKakao('해리포터', proxyUrl);
  };
  API.testAladinKey = function (key) {
    return searchAladin('해리포터', key);
  };

  global.API = API;
})(window);
