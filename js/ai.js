/**
 * AI 운동 계획 생성 — Claude Messages API 를 브라우저에서 직접 호출합니다.
 *
 * API 키는 이 기기에만 저장되고 anthropic.com 외에는 어디로도 전송되지 않습니다.
 * (중간 서버가 없기 때문에 키를 맡길 곳도 없습니다.)
 *
 * 빌드 도구 없이 도는 정적 앱이라 SDK 를 번들할 수 없어 fetch 로 직접 호출합니다.
 */

import { GROUPS, GROUP_NAME, byGroup } from './exercises.js';
import { settings, customExercises, avoidExerciseIds } from './store.js';
import { fmtWeekRange, parseYmd, addDays, ymd, DOW_KO } from './util.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const MODELS = [
  { id: 'claude-opus-5',  name: 'Claude Opus 5',  desc: '가장 똑똑함 · 계획 1회에 100원 안팎', thinking: true },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', desc: '빠르고 저렴 · 계획 1회에 40원 안팎', thinking: true },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', desc: '가장 빠르고 쌈 · 단순한 요청에', thinking: false },
];

/** 계획 JSON 스키마 — 모델이 반드시 이 모양으로 답하도록 강제합니다 */
function planSchema() {
  return {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: '이번 주 계획의 의도를 한국어 2~3문장으로. 왜 이렇게 짰는지.',
      },
      days: {
        type: 'array',
        description: '월요일부터 일요일까지 7개. 쉬는 날도 type "rest" 로 반드시 포함.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
            type: { type: 'string', description: '"rest" 면 휴식일. 그 외엔 아무 값이나(예: "workout").' },
            title: { type: 'string', description: '예: "가슴 · 어깨 전면 · 삼두 (A)"' },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name:  { type: 'string', description: '아래 운동 목록에 있는 이름을 그대로 쓸 것' },
                  group: { type: 'string', enum: GROUPS.map(g => g.id) },
                  sets:  { type: 'integer', description: '1~10' },
                  reps:  { type: 'integer', description: '1~50' },
                  rest:  { type: 'integer', description: '세트 간 휴식(초). 20~300' },
                  note:  { type: 'string', description: '한 줄 코칭 포인트. 없으면 빈 문자열.' },
                },
                required: ['name', 'group', 'sets', 'reps', 'rest', 'note'],
                additionalProperties: false,
              },
            },
          },
          required: ['date', 'type', 'title', 'blocks'],
          additionalProperties: false,
        },
      },
    },
    required: ['note', 'days'],
    additionalProperties: false,
  };
}

/** 모델에게 보여줄 운동 목록 — 이름을 지어내지 않고 이 안에서 고르게 합니다.
 * 가진 기구와 비추천 종목으로 미리 걸러서 애초에 못 쓰는 종목을 보여주지 않습니다. */
function exerciseCatalog() {
  const custom = customExercises();
  const equipment = settings().plan.equipment;
  const avoid = avoidExerciseIds();
  return GROUPS.map(g => {
    const names = byGroup(g.id, custom, equipment, avoid).map(x => x.name);
    return `- ${g.id} (${g.name}): ${names.join(', ') || '(가진 기구로는 후보 없음)'}`;
  }).join('\n');
}

/** 최근 기록 요약 — 무게가 정체됐는지, 어떤 종목을 했는지 모델이 참고합니다 */
function historyDigest(sessions, weeks = 3) {
  const recent = sessions.slice(-weeks * 6);
  if (!recent.length) return '아직 기록이 없습니다. 무난한 강도로 시작해 주세요.';

  const lines = [];
  for (const s of recent.slice(-12)) {
    const parts = [];
    for (const en of s.entries || []) {
      const done = (en.sets || []).filter(x => x.done);
      if (!done.length) continue;
      const top = done.reduce((a, b) => ((b.weight || 0) > (a.weight || 0) ? b : a));
      parts.push(`${en.name} ${top.weight ?? '—'}kg×${top.reps ?? '—'}×${done.length}`);
    }
    if (parts.length) lines.push(`${s.date} ${s.title || ''}: ${parts.join(', ')}`);
  }
  return lines.length ? lines.join('\n') : '완료된 세트 기록이 아직 없습니다.';
}

function systemPrompt() {
  const p = settings().plan;
  const weekDesc = [1, 2, 3, 4, 5, 6, 0]
    .map(d => `${DOW_KO[d]}: ${(p.week[d] || []).length ? p.week[d].map(g => GROUP_NAME[g] || g).join('+') : '휴식'}`)
    .join(', ');
  const equipDesc = p.equipment?.length ? p.equipment.join(', ') : '전부 (기구 제한 없음)';

  return `당신은 혼자 웨이트 트레이닝을 하는 사람의 전담 코치입니다. 한국어로 답합니다.

이 사람이 운동계획 탭에서 정해 둔 요일별 부위 배치: ${weekDesc}
가진 기구: ${equipDesc}
같은 부위 조합이 한 주에 여러 번 나오면(예: 가슴 날이 두 번) 두 날의 종목 구성을 서로 다르게 하고, 제목 끝에 (A) (B) 로 표시합니다.

계획을 짤 때 지킬 것:
- 위 요일별 부위 배치를 기본으로 따르되, 사용자의 특별 요청이 있으면 그에 맞게 요일이나 부위를 바꿔도 됩니다.
- 운동 이름은 아래 "사용 가능한 운동" 목록에 있는 것을 글자 그대로 씁니다. 목록에 없는 종목은 꼭 필요할 때만 쓰고, group 은 반드시 목록의 부위 코드 중 하나로 지정합니다.
- 하루 운동은 5~8종목, 전체 60~80분 안에 끝나는 분량으로 합니다.
- 복합관절 운동을 앞에, 고립 운동을 뒤에 배치합니다.
- 세트 간 휴식(rest)은 종목 성격에 맞게 정합니다. 무거운 복합관절 120~180초, 중간 90초, 고립 45~75초.
- 최근 기록에서 같은 무게가 3주 넘게 반복되면 자극 방식을 바꾸거나(종목 교체, 횟수 범위 변경) 한 단계 올릴 것을 note 에 적어 줍니다.
- note 는 이번 주를 왜 이렇게 짰는지 2~3문장으로 씁니다. 인사말이나 서론 없이 바로 본론만 씁니다.
- 사용자가 특별한 요청을 했다면 위 고정 규칙보다 그 요청을 우선합니다.

사용 가능한 운동 (부위코드 (부위명): 종목들):
${exerciseCatalog()}`;
}

function userPrompt(weekStart, request, sessions) {
  const start = parseYmd(weekStart);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return `${ymd(d)} (${DOW_KO[d.getDay()]})`;
  }).join('\n');

  return `이번 주(${fmtWeekRange(weekStart)}) 운동 계획을 짜 주세요.

계획에 넣을 날짜 (이 7일을 모두 days 에 포함, 쉬는 날은 type "rest" 에 blocks 빈 배열):
${dates}

최근 운동 기록:
${historyDigest(sessions)}

${request?.trim() ? `이번 주 특별 요청:\n${request.trim()}` : '특별한 요청은 없습니다. 평소 루틴대로 짜 주세요.'}`;
}

export class AiError extends Error {
  constructor(message, kind = 'unknown') {
    super(message);
    this.kind = kind;
  }
}

/**
 * 주간 계획을 생성합니다.
 * @returns {{plan: object, usage: object, model: string}}
 */
export async function generatePlanWithAi(weekStart, request, sessions = []) {
  const s = settings();
  const key = (s.apiKey || '').trim();
  if (!key) throw new AiError('API 키가 없습니다. 설정에서 먼저 등록해 주세요.', 'no_key');

  const model = MODELS.find(m => m.id === s.aiModel) || MODELS[0];

  const body = {
    model: model.id,
    max_tokens: 8000,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt(weekStart, request, sessions) }],
    output_config: { format: { type: 'json_schema', schema: planSchema() } },
  };
  // 적응형 사고와 effort 는 5세대 모델에서만 받습니다. Haiku 4.5 에 보내면 거부당합니다.
  if (model.thinking) {
    body.thinking = { type: 'adaptive' };
    body.output_config.effort = 'medium';
  }

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        // 브라우저에서 직접 호출하려면 이 헤더가 필요합니다
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.', 'network');
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* 본문 없음 */ }
    if (res.status === 401) throw new AiError('API 키가 올바르지 않습니다. 설정에서 다시 확인해 주세요.', 'auth');
    if (res.status === 429) throw new AiError('요청이 너무 잦거나 사용 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.', 'rate');
    if (res.status === 400) throw new AiError(`요청이 거부됐습니다. ${detail}`, 'bad_request');
    if (res.status >= 500) throw new AiError('Anthropic 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.', 'server');
    throw new AiError(`오류가 발생했습니다 (${res.status}). ${detail}`, 'http');
  }

  const data = await res.json();

  if (data.stop_reason === 'refusal') {
    throw new AiError('모델이 이 요청에 답하지 않았습니다. 요청 내용을 바꿔서 다시 시도해 주세요.', 'refusal');
  }
  if (data.stop_reason === 'max_tokens') {
    throw new AiError('계획이 너무 길어 중간에 잘렸습니다. 요청을 조금 줄여서 다시 시도해 주세요.', 'truncated');
  }

  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiError('계획을 읽는 데 실패했습니다. 다시 시도해 주세요.', 'parse');
  }

  return { plan: raw, usage: data.usage || {}, model: data.model || model.id };
}

/** 대략적인 비용(원). 환율은 어림값이라 참고용입니다. */
export function estimateCostKrw(usage, modelId) {
  const price = {
    'claude-opus-5':   { in: 5,  out: 25 },
    'claude-sonnet-5': { in: 2,  out: 10 },
    'claude-haiku-4-5': { in: 1, out: 5 },
  }[modelId] || { in: 5, out: 25 };
  const usd = ((usage.input_tokens || 0) * price.in + (usage.output_tokens || 0) * price.out) / 1e6;
  return Math.round(usd * 1400);
}

/** 설정 화면에서 키가 살아 있는지 확인 */
export async function testApiKey(key) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key.trim(),
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, message: '키가 올바르지 않습니다.' };
    const detail = await res.json().catch(() => null);
    return { ok: false, message: detail?.error?.message || `오류 ${res.status}` };
  } catch {
    return { ok: false, message: '연결에 실패했습니다.' };
  }
}
