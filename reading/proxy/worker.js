/**
 * 카카오 책 검색 API 프록시 (Cloudflare Workers)
 *
 * 왜 필요한가
 * ----------
 * 카카오 책 검색 API(dapi.kakao.com/v3/search/book)는 REST API 키를
 * Authorization 헤더로 요구하는데, 이 헤더는 CORS 사전 요청(preflight)을
 * 유발하고 카카오 서버가 그 사전 요청을 허용하지 않아 브라우저에서
 * 직접 호출할 수 없다. 이 워커가 그 사이에 서서, 요청을 그대로
 * 카카오에 전달하고 CORS 헤더를 붙여 돌려준다.
 *
 * REST API 키는 이 워커의 비밀 환경변수(KAKAO_REST_API_KEY)에만 있고
 * 브라우저(책꽂이 앱)로는 절대 전달되지 않는다.
 *
 * 배포 방법은 reading/proxy/README.md 참고.
 */

const KAKAO_URL = 'https://dapi.kakao.com/v3/search/book';

// 남용 방지: ALLOWED_ORIGIN 환경변수를 설정해 두면 그 출처의 요청만 받는다.
// 비워 두면(설정 안 하면) 모든 출처를 허용한다 — 우선 동작 확인이 급하면
// 비워 두고, 실제로 쓰기 시작하면 자신의 GitHub Pages 주소로 좁혀 두길 권한다.
function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').trim();
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = !allowed ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'GET 요청만 지원합니다.' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (!env.KAKAO_REST_API_KEY) {
      return new Response(JSON.stringify({ error: '워커에 KAKAO_REST_API_KEY 가 설정되지 않았습니다.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    const reqUrl = new URL(request.url);
    const query = reqUrl.searchParams.get('query');
    if (!query) {
      return new Response(JSON.stringify({ error: 'query 파라미터가 필요합니다.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    const upstream = new URL(KAKAO_URL);
    upstream.searchParams.set('query', query);
    // 카카오가 지원하는 파라미터만 그대로 전달한다.
    ['sort', 'page', 'size', 'target'].forEach(function (key) {
      const v = reqUrl.searchParams.get(key);
      if (v) upstream.searchParams.set(key, v);
    });

    let upstreamRes;
    try {
      upstreamRes = await fetch(upstream.toString(), {
        headers: { Authorization: 'KakaoAK ' + env.KAKAO_REST_API_KEY }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: '카카오 API 호출에 실패했습니다.', detail: String(err) }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    const body = await upstreamRes.text();
    return new Response(body, {
      status: upstreamRes.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors }
    });
  }
};
