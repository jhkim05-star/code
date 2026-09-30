import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { Vault, token, digest, equal } from './vault.mjs';
import { FamilyAccess, AppError } from './family.mjs';
import { analyze, reviews, validateAnalysis, reviewInput, checkConnection, modelName } from './providers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (status, code, message) => { throw new AppError(status, code, message); };
export function makeServer(env = process.env, fetcher = fetch, clock = Date.now) {
  const origin = env.SIP_PUBLIC_ORIGIN || 'http://localhost:8134';
  const url = new URL(origin), secure = url.protocol === 'https:';
  if (origin !== url.origin || url.username || url.password) throw new Error('SIP_PUBLIC_ORIGIN에는 경로 없는 정확한 출처를 지정하세요.');
  const enabled = Boolean(env.SIP_MASTER_KEY && env.SIP_PUBLIC_ORIGIN && env.SIP_FAMILY_CODE);
  if (enabled && !secure && !(env.SIP_ALLOW_HTTP_DEV === '1' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('인증 서버는 HTTPS가 필요합니다.');
  if (env.SIP_FAMILY_CODE && (env.SIP_FAMILY_CODE.length < 24 || env.SIP_FAMILY_CODE.length > 200)) throw new Error('가족 코드는 무작위 24~200자로 설정하세요.');
  const vault = enabled ? new Vault(path.join(env.SIP_DATA_DIR || path.join(os.homedir(), '.sip-journal'), 'family-v1.enc'), env.SIP_MASTER_KEY) : null;
  const family = enabled ? new FamilyAccess(vault, env, clock) : null;
  modelName(env);
  // Separate from v1 credential cookies; a shared code is never stored in a browser or a record.
  const names = { session: secure ? '__Host-sip_family' : 'sip_family_dev', csrf: secure ? '__Host-sip_csrf_v2' : 'sip_csrf_dev' };
  const rates = new Map();
  const cookieJar = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(a => a.length === 2));
  function cookie(res, name, value, maxAge) {
    const list = res.getHeader('Set-Cookie') || [];
    res.setHeader('Set-Cookie', [...list, `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`]);
  }
  function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  function throttle(key, max) {
    const now = clock();
    for (const [k, v] of rates) if (v.until < now) rates.delete(k);
    if (rates.size > 3000) fail(429, 'BUSY', '요청이 많아요. 잠시 후 다시 시도해 주세요.');
    const r = rates.get(key) || { n: 0, until: now + 60000 }; rates.set(key, r);
    if (++r.n > max) fail(429, 'RATE_LIMIT', '요청이 많아요. 1분 뒤 다시 시도해 주세요.');
  }
  async function status(req, res) {
    const jar = cookieJar(req); let csrf = jar[names.csrf];
    if (!csrf || !/^[-\w]{43}$/.test(csrf)) { csrf = token(); cookie(res, names.csrf, csrf, 86400 * 90); }
    const device = family ? await family.session(jar[names.session], true) : null;
    if (device) cookie(res, names.session, jar[names.session], family.limits.idleDays * 86400);
    const apiConfigured = enabled && Boolean(env.OPENAI_API_KEY);
    return { mode: 'shared-openai', configured: enabled, authorized: Boolean(device), user: device?.label || null, csrf,
      apiConfigured, connected: { openai: apiConfigured && Boolean(device) },
      state: !enabled ? 'server-not-configured' : !device ? 'approval-required' : !apiConfigured ? 'api-key-missing' : 'ready',
      ...(device ? await family.status(device) : {}) };
  }
  async function readBody(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'CONTENT_TYPE', 'JSON 형식으로 요청해 주세요.');
    if (Number(req.headers['content-length']) > 10700000) fail(413, 'TOO_LARGE', '사진은 최대 3장으로 나눠 주세요.');
    const chunks = []; let total = 0;
    for await (const chunk of req) { total += chunk.length; if (total > 10700000) fail(413, 'TOO_LARGE', '요청이 너무 큽니다.'); chunks.push(chunk); }
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'BAD_JSON', '요청 형식을 확인해 주세요.'); }
    if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, 'BAD_JSON', '요청 형식을 확인해 주세요.');
    return body;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    let pathname = '';
    try {
      const reqUrl = new URL(req.url, origin);
      pathname = reqUrl.pathname.replace(/^\/(?:code\/)?sip\//, '/');
      if (pathname === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true });
      if (pathname.startsWith('/api/')) {
        const route = pathname.slice(5), jar = cookieJar(req);
        if (route.startsWith('oauth/') || ['keys', 'login', 'disconnect'].includes(route)) fail(410, 'REMOVED', '개인별 AI 연결은 제거됐어요. 가족 이용 승인을 사용해 주세요.');
        if (route === 'session' && req.method === 'GET') return json(res, 200, await status(req, res));
        if (!enabled) fail(503, 'SERVER_NOT_CONFIGURED', '가족 AI 서버가 아직 활성화되지 않았어요. 기록과 검색은 계속 사용할 수 있습니다.');
        if (req.method !== 'POST') fail(405, 'METHOD', '허용하지 않는 요청입니다.');
        if (req.headers.origin !== origin || !jar[names.csrf] || !equal(req.headers['x-sip-csrf'] || '', jar[names.csrf])) fail(403, 'CSRF', '앱을 다시 열어 요청해 주세요.');
        // Rate limit before buffering request bodies. Forwarded addresses are not trusted.
        throttle('requests:' + req.socket.remoteAddress, 60);
        const body = await readBody(req);
        if (route === 'approve') {
          throttle('approve:' + req.socket.remoteAddress, 8);
          const approved = await family.approve(body.code, body.name, jar[names.session]);
          cookie(res, names.session, approved, family.limits.idleDays * 86400);
          req.headers.cookie = `${names.csrf}=${jar[names.csrf]}; ${names.session}=${approved}`;
          return json(res, 200, await status(req, res));
        }
        const device = await family.session(jar[names.session]);
        if (!device) fail(401, 'APPROVAL_REQUIRED', '가족 이용 승인이 필요해요. 입력은 남겨두었습니다.');
        if (route === 'logout') { await family.logout(jar[names.session]); cookie(res, names.session, '', 0); return json(res, 200, { ok: true }); }
        if (!['analyze', 'reviews', 'check'].includes(route)) fail(404, 'NOT_FOUND', '지원하지 않는 요청입니다.');
        if (!env.OPENAI_API_KEY) fail(503, 'API_NOT_CONFIGURED', '운영자가 서버에 OpenAI API 키를 등록해야 해요. 가족은 키를 입력하지 않습니다.');
        const allowed = route === 'analyze' ? ['requestId', 'mode', 'images', 'text'] : route === 'reviews' ? ['requestId', 'bottle'] : ['requestId'];
        if (Object.keys(body).some(k => !allowed.includes(k))) fail(400, 'UNSUPPORTED_FIELDS', '이 앱에서 지원하지 않는 요청 옵션입니다. 새로고침 후 다시 시도해 주세요.');
        const input = route === 'analyze' ? validateAnalysis(body) : route === 'reviews' ? { bottle: reviewInput(body.bottle) } : {};
        const cacheKey = route === 'reviews' ? digest(modelName(env) + '|review-v1|' + JSON.stringify(input.bottle)) : '';
        if (cacheKey) { const cached = await family.cachedReview(cacheKey, device); if (cached) return json(res, 200, { ...cached, cached: true }); }
        await family.reserve(device, route, body.requestId);
        let succeeded = false, result;
        try {
          result = route === 'analyze' ? await analyze(input, env, fetcher) : route === 'reviews' ? await reviews(input, env, fetcher) : await checkConnection(env, fetcher);
          // Do not return results after access has been revoked; never replay paid calls automatically.
          if (!await family.session(jar[names.session])) fail(401, 'APPROVAL_REQUIRED', '이 기기의 이용 승인이 해제되어 결과를 적용하지 않았어요.');
          succeeded = true;
          if (cacheKey) await family.cacheReview(cacheKey, result, device);
        } finally { await family.finish(device, body.requestId, succeeded).catch(() => {}); }
        return json(res, 200, result);
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      if (req.url === '/' || req.url === '/sip') { res.writeHead(302, { Location: '/sip/' }); return res.end(); }
      const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
      if (!/^(index\.html|manifest\.webmanifest|sw\.js|version\.json|README\.md|assets\/[\w.-]+)$/.test(relative)) { res.writeHead(404); return res.end('Not found'); }
      const data = await readFile(path.join(ROOT, relative)), ext = path.extname(relative);
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': relative === 'sw.js' ? 'no-store' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      if (pathname.startsWith('/api/')) return json(res, e.status || 503, { error: e instanceof AppError ? e.message : '서버 저장소 또는 설정을 확인해야 해요. 초기화나 자동 재시도는 하지 않았습니다.', code: e.code || 'SERVER_STORAGE_ERROR' });
      res.writeHead(e.code === 'ENOENT' ? 404 : 500); res.end('요청한 파일을 열지 못했습니다.');
    }
  });
  server.requestTimeout = 90000; server.headersTimeout = 15000;
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  makeServer().listen(Number(process.env.PORT) || 8134, process.env.HOST || '127.0.0.1', () => console.log('Sip Journal server ready'));
}
