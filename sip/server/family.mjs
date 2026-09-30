// Device approval and durable cost controls. One Node process / one persistent volume.
import { createHmac } from 'node:crypto';
import { token, digest, equal } from './vault.mjs';

export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (code, message, status = 429) => { throw new AppError(status, code, message); };
function integer(value, fallback, max) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error('AI 한도 환경변수는 범위 내 양의 정수여야 합니다.');
  return n;
}
export function limitsFrom(env) {
  return {
    dailyAnalysis: integer(env.SIP_DAILY_ANALYSES, 10, 100),
    monthlyAnalysis: integer(env.SIP_MONTHLY_ANALYSES, 200, 2000),
    dailyReviews: integer(env.SIP_DAILY_REVIEWS, 3, 30),
    monthlyReviews: integer(env.SIP_MONTHLY_REVIEWS, 30, 300),
    devices: integer(env.SIP_MAX_DEVICES, 20, 100),
    idleDays: integer(env.SIP_SESSION_DAYS, 90, 180)
  };
}
export class FamilyAccess {
  constructor(vault, env, clock = Date.now) {
    this.vault = vault; this.clock = clock; this.limits = limitsFrom(env);
    this.code = env.SIP_FAMILY_CODE;
    // Changing the family code or epoch revokes previously approved devices.
    this.epoch = createHmac('sha256', Buffer.from(env.SIP_MASTER_KEY, 'base64'))
      .update(this.code + '|' + (env.SIP_FAMILY_EPOCH || '1')).digest('hex');
  }
  clean(s) {
    s.family ??= { sessions: {}, usage: {}, requests: {}, reviews: {}, lastSuccessAt: null };
    const f = s.family, now = this.clock(), month = new Date(now).toISOString().slice(0, 7);
    for (const [k, v] of Object.entries(f.sessions)) if (v.expires <= now || v.epoch !== this.epoch) delete f.sessions[k];
    for (const [k, v] of Object.entries(f.requests)) if (v.expires <= now) delete f.requests[k];
    for (const [k, v] of Object.entries(f.reviews)) if (v.expires <= now) delete f.reviews[k];
    for (const k of Object.keys(f.usage)) if (!k.startsWith(month)) delete f.usage[k];
    return f;
  }
  async approve(code, label, previousToken) {
    if (typeof code !== 'string' || !equal(code, this.code)) fail('BAD_CODE', '가족 이용 코드를 확인해 주세요.', 403);
    if (typeof label !== 'string' || !label.trim() || label.length > 40) fail('BAD_NAME', '이 기기의 이름을 1~40자로 입력해 주세요.', 400);
    const sessionToken = token();
    await this.vault.transaction(s => {
      const f = this.clean(s);
      // Only discard a previous valid session after the new approval is known to be valid.
      delete f.sessions[digest(previousToken || '')];
      if (Object.keys(f.sessions).length >= this.limits.devices) fail('DEVICE_LIMIT', '가족 기기 수 한도입니다. 운영자에게 문의해 주세요.');
      f.sessions[digest(sessionToken)] = { id: token(), label: label.trim(), epoch: this.epoch, expires: this.clock() + this.limits.idleDays * 86400000 };
    });
    return sessionToken;
  }
  async session(sessionToken, renew = false) {
    if (!sessionToken) return null;
    const key = digest(sessionToken), now = this.clock();
    if (!renew) {
      const f = this.clean(await this.vault.load()), r = f.sessions[key];
      return r && r.expires > now ? { ...r, key } : null;
    }
    return this.vault.transaction(s => {
      const r = this.clean(s).sessions[key];
      if (!r) return null;
      r.expires = now + this.limits.idleDays * 86400000;
      return { ...r, key };
    });
  }
  logout(sessionToken) { return this.vault.transaction(s => { delete this.clean(s).sessions[digest(sessionToken || '')]; }); }
  require(f, device) {
    if (!f.sessions[device.key] || f.sessions[device.key].id !== device.id) fail('APPROVAL_REQUIRED', '가족 이용 승인을 다시 받아 주세요.', 401);
  }
  async reserve(device, route, requestId) {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) fail('BAD_REQUEST_ID', '요청 식별자가 올바르지 않아요.', 400);
    const now = this.clock(), date = new Date(now).toISOString().slice(0, 10), kind = route === 'reviews' ? 'reviews' : 'analysis';
    await this.vault.transaction(s => {
      const f = this.clean(s); this.require(f, device);
      const id = digest(device.id + '|' + requestId);
      if (f.requests[id]) fail('DUPLICATE_REQUEST', '이미 접수한 요청입니다. 중복 결제를 막기 위해 다시 전송하지 않았어요.', 409);
      // Reservations persist before an upstream request. A timeout may already have incurred cost.
      const pending = Object.values(f.requests).filter(r => r.pendingUntil > now);
      if (pending.some(r => r.device === device.id) || pending.length >= 2) fail('AI_BUSY', '다른 분석이 진행 중이에요. 잠시 후 다시 시도해 주세요.');
      const daily = date + ':' + device.id + ':' + kind, monthly = date.slice(0, 7) + ':all:' + kind;
      const dl = kind === 'reviews' ? this.limits.dailyReviews : this.limits.dailyAnalysis;
      const ml = kind === 'reviews' ? this.limits.monthlyReviews : this.limits.monthlyAnalysis;
      if ((f.usage[daily] || 0) >= dl) fail('DAILY_LIMIT', '이 기기의 오늘 AI 사용 한도에 도달했어요. 기록과 검색은 계속 사용할 수 있습니다.');
      if ((f.usage[monthly] || 0) >= ml) fail('MONTHLY_LIMIT', '가족 전체의 이번 달 AI 한도에 도달했어요. 운영자에게 문의해 주세요.');
      f.usage[daily] = (f.usage[daily] || 0) + 1;
      f.usage[monthly] = (f.usage[monthly] || 0) + 1;
      f.requests[id] = { device: device.id, pendingUntil: now + 120000, expires: now + 2 * 86400000 };
    });
  }
  async finish(device, requestId, succeeded) {
    await this.vault.transaction(s => {
      const f = this.clean(s), r = f.requests[digest(device.id + '|' + requestId)];
      if (r) r.pendingUntil = 0;
      if (succeeded) f.lastSuccessAt = new Date(this.clock()).toISOString();
    });
  }
  async status(device) {
    const f = this.clean(await this.vault.load()); this.require(f, device);
    const d = new Date(this.clock()).toISOString().slice(0, 10), m = d.slice(0, 7);
    return { lastSuccessAt: f.lastSuccessAt, limits: this.limits, usage: {
      dailyAnalysis: f.usage[d + ':' + device.id + ':analysis'] || 0,
      dailyReviews: f.usage[d + ':' + device.id + ':reviews'] || 0,
      monthlyAnalysis: f.usage[m + ':all:analysis'] || 0,
      monthlyReviews: f.usage[m + ':all:reviews'] || 0
    }};
  }
  async cachedReview(key, device) {
    const f = this.clean(await this.vault.load()); this.require(f, device);
    return f.reviews[key]?.data || null;
  }
  async cacheReview(key, data, device) {
    await this.vault.transaction(s => {
      const f = this.clean(s); this.require(f, device);
      if (Object.keys(f.reviews).length >= 200) delete f.reviews[Object.keys(f.reviews)[0]];
      f.reviews[key] = { expires: this.clock() + 30 * 86400000, data };
    });
  }
}
