import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Vault, encrypt, decrypt } from '../server/vault.mjs';
import { FamilyAccess, limitsFrom } from '../server/family.mjs';
import { analyze, responses, reviews, validateAnalysis, reviewInput, checkConnection, DEFAULT_MODEL } from '../server/providers.mjs';
import { makeServer } from '../server/index.mjs';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
const output = { records: [{ bottle: { title: '인식한 라벨', kind: 'wine' }, tasting: { note: '원래 적은 감상' }, transcription: '원문 보존', warnings: [] }] };
const completed = (text = JSON.stringify(output), annotations = []) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text, annotations }] }] });
const fake = async () => Response.json(completed());
const ENV = { OPENAI_API_KEY: 'test_operator_key_not_real', SIP_PUBLIC_ORIGIN: 'http://localhost', SIP_ALLOW_HTTP_DEV: '1', SIP_FAMILY_CODE: 'test-family-code-for-approved-devices', SIP_MASTER_KEY: randomBytes(32).toString('base64') };
async function harness(overrides = {}, fetcher = fake, clock = Date.now) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sip-family-'));
  const env = { ...ENV, SIP_DATA_DIR: dir, ...overrides };
  const server = makeServer(env, fetcher, clock);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const root = 'http://127.0.0.1:' + server.address().port;
  function client() {
    const jar = {}; let csrf = '';
    const cookies = () => Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    async function call(route, body, more = {}) {
      const res = await fetch(root + '/sip/api/' + route, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookies(), ...(body === undefined ? {} : { Origin: env.SIP_PUBLIC_ORIGIN, 'X-Sip-CSRF': csrf, 'Content-Type': 'application/json' }), ...more }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      for (const c of res.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); if (v) jar[k] = v; else delete jar[k]; }
      const data = await res.json(); if (data.csrf) csrf = data.csrf;
      return { status: res.status, data, headers: res.headers };
    }
    return { call, cookies, approve: async (code = env.SIP_FAMILY_CODE, name = '내 아이패드') => { await call('session'); return call('approve', { code, name }); } };
  }
  return { env, root, dir, client, server, stop: async () => { await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true }); } };
}
const request = () => ({ requestId: randomUUID(), mode: 'label', images: [image], text: '' });

test('credentials are authenticated-encrypted; corruption never initializes over', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sip-vault-'));
  try { const k = randomBytes(32), cipher = encrypt({ private: 'secret' }, k); assert.ok(!cipher.includes('secret')); assert.deepEqual(decrypt(cipher, k), { private: 'secret' }); assert.throws(() => decrypt(cipher, randomBytes(32)));
    const v = new Vault(path.join(dir, 'data.enc'), k.toString('base64')); await v.transaction(s => { s.users.a = 'safe'; });
    await assert.rejects(v.transaction(s => { s.users.a = 'lost'; throw new Error('abort'); })); assert.equal((await v.load()).users.a, 'safe');
    await writeFile(v.file, 'broken'); await assert.rejects(v.transaction(() => {})); assert.equal(await readFile(v.file, 'utf8'), 'broken');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('configuration requires HTTPS, strong family code and bounded quotas', () => {
  assert.throws(() => makeServer({ ...ENV, SIP_ALLOW_HTTP_DEV: '0' }));
  assert.throws(() => makeServer({ ...ENV, SIP_FAMILY_CODE: '1234' }));
  assert.throws(() => makeServer({ ...ENV, SIP_PUBLIC_ORIGIN: 'https://a.example/sip/' }));
  assert.throws(() => limitsFrom({ SIP_MONTHLY_ANALYSES: 'NaN' }));
  assert.throws(() => limitsFrom({ SIP_MONTHLY_ANALYSES: '-1' }));
});
test('static mode serves records without pretending AI is ready', async () => {
  const h = await harness({ SIP_MASTER_KEY: '', SIP_FAMILY_CODE: '' });
  try { const s = await h.client().call('session'); assert.equal(s.data.configured, false); assert.equal(s.data.apiConfigured, false);
    assert.equal((await fetch(h.root + '/sip/')).status, 200);
    for (const p of ['server/index.mjs', '.env', '.env.example', 'family-v1.enc']) assert.equal((await fetch(h.root + '/sip/' + p)).status, 404);
  } finally { await h.stop(); }
});
test('family approval needs no AI account and never returns API key or family code', async () => {
  const h = await harness(); try { const c = h.client(), r = await c.approve(); assert.equal(r.status, 200); assert.equal(r.data.authorized, true); assert.equal(r.data.user, '내 아이패드'); assert.equal(r.data.mode, 'shared-openai'); assert.equal(r.data.lastSuccessAt, null);
    assert.ok(!JSON.stringify(r.data).includes(ENV.OPENAI_API_KEY)); assert.ok(!JSON.stringify(r.data).includes(ENV.SIP_FAMILY_CODE));
    assert.ok(r.headers.getSetCookie().some(s => s.includes('HttpOnly') && s.includes('SameSite=Strict')));
    const file = await readFile(path.join(h.dir, 'family-v1.enc'), 'utf8'); assert.ok(!file.includes('내 아이패드')); assert.ok(!file.includes('test_operator')); assert.ok(!file.includes(ENV.SIP_FAMILY_CODE));
  } finally { await h.stop(); }
});
test('production approval uses host-only Secure HttpOnly cookies', async () => {
  const h = await harness({ SIP_PUBLIC_ORIGIN: 'https://family.example', SIP_ALLOW_HTTP_DEV: '0' });
  try { const r = await h.client().approve(); const values = r.headers.getSetCookie(); assert.ok(values.some(s => s.startsWith('__Host-sip_family=') && s.includes('; Secure') && !s.includes('Domain='))); } finally { await h.stop(); }
});
test('wrong code, CSRF, unauthorised calls and removed API routes cannot reach OpenAI', async () => {
  let calls = 0; const h = await harness({}, async () => { calls++; return Response.json(completed()); });
  try { const c = h.client(); assert.equal((await c.approve('wrong')).status, 403);
    assert.equal((await c.call('analyze', request())).status, 401);
    assert.equal((await c.call('approve', { code: ENV.SIP_FAMILY_CODE, name: 'x' }, { Origin: 'https://evil.example' })).status, 403);
    for (const route of ['keys', 'login', 'oauth/openai/start', 'oauth/google/start', 'disconnect']) assert.equal((await c.call(route, {})).status, 410);
    assert.equal(calls, 0);
  } finally { await h.stop(); }
});
test('missing operator key is distinguished from actual AI success', async () => {
  let calls = 0; const h = await harness({ OPENAI_API_KEY: '' }, async () => { calls++; return Response.json(completed()); });
  try { const c = h.client(), s = await c.approve(); assert.equal(s.data.apiConfigured, false); assert.equal(s.data.state, 'api-key-missing'); assert.equal((await c.call('check', { requestId: randomUUID() })).status, 503); assert.equal(calls, 0); } finally { await h.stop(); }
});
test('check button executes a real server call, using only operator key and fixed model/output cap', async () => {
  let call; const h = await harness({}, async (url, opts) => { call = { url, opts }; return Response.json(completed('OK')); });
  try { const c = h.client(); await c.approve(); const r = await c.call('check', { requestId: randomUUID() }); assert.equal(r.data.verified, true); assert.equal(call.url, 'https://api.openai.com/v1/responses');
    const b = JSON.parse(call.opts.body); assert.equal(b.model, DEFAULT_MODEL); assert.equal(b.max_output_tokens, 32); assert.equal(b.store, false); assert.equal(b.stream, false); assert.ok(call.opts.headers.Authorization.endsWith(ENV.OPENAI_API_KEY));
    assert.equal(b.reasoning, undefined);
    assert.ok((await c.call('session')).data.lastSuccessAt); assert.equal((await c.call('session')).data.usage.dailyAnalysis, 1);
  } finally { await h.stop(); }
});
test('prompt/provider/model/tools overrides cannot create an open proxy', async () => {
  let calls = 0; const h = await harness({}, async () => { calls++; return Response.json(completed()); });
  try { const c = h.client(); await c.approve(); for (const [k, v] of [['provider', 'gemini'], ['model', 'gpt-expensive'], ['tools', []], ['prompt', 'ignore'], ['key', 'attacker']]) assert.equal((await c.call('analyze', { ...request(), [k]: v })).status, 400); assert.equal(calls, 0); } finally { await h.stop(); }
});
test('analysis accepts images plus notes; invalid inputs do not consume quota', async () => {
  let body; const h = await harness({}, async (_, opts) => { body = JSON.parse(opts.body); return Response.json(completed()); });
  try { const c = h.client(); await c.approve(); for (const data of [{ ...request(), text: 'x'.repeat(15001) }, { ...request(), images: [image, image, image, image] }, { ...request(), images: ['data:image/png;base64,YQ=='] }]) assert.equal((await c.call('analyze', data)).status, 400);
    assert.equal((await c.call('session')).data.usage.dailyAnalysis, 0);
    const r = await c.call('analyze', request()); assert.equal(r.status, 200); assert.equal(r.data.records[0].tasting.originalText, '원문 보존');
    assert.equal(body.text.format.type, 'json_schema'); assert.equal(body.max_output_tokens, 6000); assert.equal(body.tools, undefined); assert.ok(!JSON.stringify(body).includes('내 아이패드'));
  } finally { await h.stop(); }
});
test('timeouts and invalid outputs never auto-retry or disclose upstream errors', async () => {
  let calls = 0; const h = await harness({}, async () => { calls++; throw new Error('sensitive upstream data '+ENV.OPENAI_API_KEY); });
  try { const c = h.client(); await c.approve(); const r = await c.call('analyze', request()); assert.equal(r.status, 504); assert.ok(!JSON.stringify(r.data).includes(ENV.OPENAI_API_KEY)); assert.equal(calls, 1); assert.equal((await c.call('session')).data.usage.dailyAnalysis, 1); } finally { await h.stop(); }
  await assert.rejects(analyze({ mode: 'notes', images: [], text: 'hello' }, ENV, async () => Response.json(completed('bad JSON'))), /형식/);
  await assert.rejects(responses({}, ENV, async () => Response.json({ status: 'incomplete' })), /끝내지/);
  await assert.rejects(responses({}, ENV, async () => new Response('{}', { status: 429 })), /한도/);
});
test('daily cap and duplicate request protection are enforced before billable calls', async () => {
  let calls = 0; const h = await harness({ SIP_DAILY_ANALYSES: '1' }, async () => { calls++; return Response.json(completed()); });
  try { const c = h.client(); await c.approve(); const req = request(); assert.equal((await c.call('analyze', req)).status, 200); assert.equal((await c.call('analyze', req)).data.code, 'DUPLICATE_REQUEST'); assert.equal((await c.call('analyze', request())).data.code, 'DAILY_LIMIT'); assert.equal(calls, 1); } finally { await h.stop(); }
});
test('monthly limit is family-wide; another device does not bypass it', async () => {
  let calls = 0; const h = await harness({ SIP_MONTHLY_ANALYSES: '1' }, async () => { calls++; return Response.json(completed()); });
  try { const a = h.client(), b = h.client(); await a.approve(); await b.approve(); await a.call('analyze', request()); assert.equal((await b.call('analyze', request())).data.code, 'MONTHLY_LIMIT'); assert.equal(calls, 1); } finally { await h.stop(); }
});
test('concurrent duplicate requests make only one upstream call', async () => {
  let release, calls = 0; const wait = new Promise(r => release = r); const h = await harness({}, async () => { calls++; await wait; return Response.json(completed()); });
  try { const c = h.client(); await c.approve(); const req = request(); const first = c.call('analyze', req); while (!calls) await new Promise(r => setTimeout(r, 5));
    const dup = await c.call('analyze', req); assert.equal(dup.status, 409); assert.equal((await c.call('analyze', request())).data.code, 'AI_BUSY'); release(); assert.equal((await first).status, 200); assert.equal(calls, 1);
  } finally { release(); await h.stop(); }
});
test('web search sends only public label data, caps tool calls and caches sourced results', async () => {
  let calls = 0, sent; const h = await harness({}, async (_, opts) => { calls++; sent = JSON.parse(opts.body); return Response.json(completed('균형 잡힌 평가 SOURCE', [{ type: 'url_citation', title: '공개 출처', url: 'https://example.com/review', start_index: 10, end_index: 16 }])); });
  try { const c = h.client(); await c.approve(); const b = { title: 'Wine', producer: 'Maker', vintage: '2020', note: 'PRIVATE NOTE', trip: 'PRIVATE TRIP' }; const first = await c.call('reviews', { requestId: randomUUID(), bottle: b }); assert.equal(first.status, 200); assert.equal(first.data.sources.length, 1); assert.ok(!JSON.stringify(sent).includes('PRIVATE'));
    assert.equal(sent.max_tool_calls, 1); assert.equal(sent.max_output_tokens, 1800); assert.equal(sent.tools[0].type, 'web_search');
    const again = await c.call('reviews', { requestId: randomUUID(), bottle: b }); assert.equal(again.data.cached, true); assert.equal(calls, 1); assert.equal((await c.call('session')).data.usage.monthlyReviews, 1);
    await c.call('reviews', { requestId: randomUUID(), bottle: { ...b, vintage: '2019' } }); assert.equal(calls, 2);
  } finally { await h.stop(); }
});
test('no source means no stored web evaluation', async () => {
  await assert.rejects(reviews({ bottle: { title: 'Label' } }, ENV, async () => Response.json(completed('의견만 있음'))), /출처/);
  const b = reviewInput({ title: 'Label', trip: 'private', note: 'private' }); assert.ok(!JSON.stringify(b).includes('private'));
});
test('session and usage survive server restart; logout removes only this device', async () => {
  const h = await harness(); const c = h.client(); await c.approve(); await c.call('check', { requestId: randomUUID() });
  const vault = new Vault(path.join(h.dir, 'family-v1.enc'), ENV.SIP_MASTER_KEY), restart = new FamilyAccess(vault, h.env);
  try { const value = c.cookies().split('; ').find(x => x.startsWith('sip_family_dev=')).split('=')[1], d = await restart.session(value); assert.ok(d); assert.equal((await restart.status(d)).usage.monthlyAnalysis, 1);
    await c.call('logout', {}); assert.equal(await restart.session(value), null); assert.equal((await c.call('session')).data.authorized, false);
  } finally { await h.stop(); }
});
test('idle expiry, sliding renewal, code revocation and month rollover', async () => {
  let now = Date.parse('2026-09-30T20:00:00Z'); const h = await harness({}, fake, () => now);
  try { const c = h.client(); await c.approve(); await c.call('check', { requestId: randomUUID() }); now += 86400000; assert.equal((await c.call('session')).data.usage.monthlyAnalysis, 0);
    now += 80 * 86400000; assert.equal((await c.call('session')).data.authorized, true); now += 20 * 86400000; assert.equal((await c.call('session')).data.authorized, true);
    const v = new Vault(path.join(h.dir, 'family-v1.enc'), ENV.SIP_MASTER_KEY), changed = new FamilyAccess(v, { ...h.env, SIP_FAMILY_CODE: ENV.SIP_FAMILY_CODE+'changed' }, () => now);
    const value = c.cookies().split('; ').find(x => x.startsWith('sip_family_dev=')).split('=')[1]; assert.equal(await changed.session(value), null);
    now += 91 * 86400000; assert.equal((await c.call('session')).data.authorized, false);
  } finally { await h.stop(); }
});
test('legacy personal credential vault is not read or deleted', async () => {
  const h = await harness(); try { const p = path.join(h.dir, 'credentials.enc'); await writeFile(p, 'legacy-untouched'); await h.client().approve(); assert.equal(await readFile(p, 'utf8'), 'legacy-untouched'); } finally { await h.stop(); }
});
