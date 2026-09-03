/**
 * 통계 — 얼마나 했고, 무게가 오르고 있는지. 주간/월간을 전환해서 봅니다.
 *
 * 차트는 전부 한 가지 색조의 단일 계열이라 범례가 필요 없습니다.
 * 대신 값이 필요한 곳(최고치·최근치)에만 직접 숫자를 붙이고,
 * 막대를 누르면 그 기간의 정확한 값을 보여 줍니다.
 */

import { h, mount, pageHead, empty } from '../ui.js';
import { sessions, settings } from '../store.js';
import { sessionVolume, sessionSetCount } from '../runner.js';
import { GROUPS, GROUP_NAME } from '../exercises.js';
import { weekStartOf, ymd, addDays, parseYmd, comma, fmtWeight, fmtDateShort } from '../util.js';

const PERIODS = 12;
let mode = 'week';   // 'week' | 'month'

export async function renderStats(root) {
  const all = sessions();

  if (!all.length) {
    mount(root, pageHead('통계', ''), empty('운동을 기록하면 여기에 추이가 그려집니다.'));
    return;
  }

  draw(root, all);
}

function draw(root, all) {
  const unit = settings().unit;
  const buckets = mode === 'week' ? weekBuckets(all, PERIODS) : monthBuckets(all, PERIODS);
  const cur = buckets.at(-1);
  const groupWindowStart = buckets[Math.max(0, buckets.length - (mode === 'week' ? 4 : 2))].start;

  mount(root,
    pageHead('통계', `기록 ${all.length}회`),

    h('.btn-row', { style: { marginBottom: '14px' } },
      h('button', { class: mode === 'week' ? 'btn-primary' : '', onclick: () => { mode = 'week'; draw(root, all); } }, '주간'),
      h('button', { class: mode === 'month' ? 'btn-primary' : '', onclick: () => { mode = 'month'; draw(root, all); } }, '월간'),
    ),

    h('.kpis', null,
      kpi(String(cur.count), mode === 'week' ? '이번 주 운동' : '이번 달 운동'),
      kpi(comma(cur.volume), `볼륨 ${unit}`),
      kpi(String(streak(buckets)), mode === 'week' ? '연속 주' : '연속 달'),
    ),

    volumeChart(buckets, unit),
    groupChart(all, unit, groupWindowStart),
    prList(all, unit),
  );
}

const kpi = (v, k) => h('.kpi', null, h('.v', null, v), h('.k', null, k));

/** 최근 n주를 주 단위로 묶습니다 (빈 주도 0으로 채웁니다) */
function weekBuckets(all, n) {
  const start = weekStartOf(new Date());
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    const ws = ymd(addDays(start, -7 * i));
    buckets.push({ key: ws, start: ws, label: fmtDateShort(ws), volume: 0, sets: 0, count: 0 });
  }
  const index = new Map(buckets.map(b => [b.key, b]));
  for (const s of all) {
    const ws = ymd(weekStartOf(parseYmd(s.date)));
    const b = index.get(ws);
    if (!b) continue;
    b.volume += sessionVolume(s);
    b.sets += sessionSetCount(s);
    b.count += 1;
  }
  return buckets;
}

/** 최근 n개월을 월 단위로 묶습니다 */
function monthBuckets(all, n) {
  const now = new Date();
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({ key, start: ymd(d), label: `${d.getMonth() + 1}월`, volume: 0, sets: 0, count: 0 });
  }
  const index = new Map(buckets.map(b => [b.key, b]));
  for (const s of all) {
    const key = s.date.slice(0, 7);
    const b = index.get(key);
    if (!b) continue;
    b.volume += sessionVolume(s);
    b.sets += sessionSetCount(s);
    b.count += 1;
  }
  return buckets;
}

/** 이번 기간을 포함해 거슬러 올라가며 운동한 기간이 몇 번 이어졌는지 */
function streak(buckets) {
  let n = 0;
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (buckets[i].count > 0) n += 1;
    else if (i !== buckets.length - 1) break;   // 이번 기간이 아직 비어 있는 건 끊긴 게 아닙니다
  }
  return n;
}

// ── 볼륨 추이 ────────────────────────────────────────────────
function volumeChart(buckets, unit) {
  const max = Math.max(1, ...buckets.map(b => b.volume));
  const maxIdx = buckets.findIndex(b => b.volume === max);
  const readout = h('.hint', { style: { minHeight: '18px', marginTop: '2px' } },
    `가장 높은 ${mode === 'week' ? '주' : '달'} ${comma(max)}${unit} · 막대를 누르면 정확한 값이 보입니다`);

  const bars = buckets.map((b) => h('i', {
    style: { height: `${Math.max(2, (b.volume / max) * 100)}%`, opacity: b.volume ? '0.78' : '0.18' },
    role: 'button',
    'aria-label': `${b.label} ${Math.round(b.volume)}${unit}`,
    onclick: () => {
      mount(readout, `${b.label} · ${comma(b.volume)}${unit} · ${b.count}회 · ${b.sets}세트`);
    },
  }));

  return h('.card', null,
    h('.card-head', null,
      h('h3', null, `${mode === 'week' ? '주간' : '월간'} 볼륨 (${unit})`),
      h('.num', { style: { fontSize: '12px', color: 'var(--ink-3)' } }, `최근 ${PERIODS}${mode === 'week' ? '주' : '개월'}`),
    ),
    h('.spark', null, ...bars),
    h('.spark-x', null, ...buckets.map((b, i) =>
      h('span', null, i === 0 || i === buckets.length - 1 || i === maxIdx ? b.label : ''))),
    readout,
  );
}

// ── 부위별 운동 횟수 · 볼륨 ───────────────────────────────────
function groupChart(all, unit, since) {
  const totals = new Map(GROUPS.map(g => [g.id, { volume: 0, sets: 0 }]));

  for (const s of all) {
    if (s.date < since) continue;
    for (const e of s.entries || []) {
      const row = totals.get(e.group);
      if (!row) continue;
      for (const st of e.sets || []) {
        if (!st.done) continue;
        row.sets += 1;
        row.volume += (st.weight || 0) * (st.reps || 0);
      }
    }
  }

  const rows = [...totals.entries()].filter(([, v]) => v.sets > 0).sort((a, b) => b[1].volume - a[1].volume);
  if (!rows.length) return null;
  const max = rows[0][1].volume || 1;

  return h('.card', null,
    h('.card-head', null,
      h('h3', null, '부위별 세트수 · 볼륨'),
      h('.num', { style: { fontSize: '12px', color: 'var(--ink-3)' } }, mode === 'week' ? '최근 4주' : '최근 2개월'),
    ),
    h('.bars', null, ...rows.map(([g, v]) =>
      h('.bar', null,
        h('.bl', null, GROUP_NAME[g] || g),
        h('.bt', null, h('i', { style: { width: `${(v.volume / max) * 100}%` } })),
        h('.bv', null, `${v.sets}세트 · ${comma(v.volume)}${unit}`),
      ),
    )),
    h('.hint', { style: { marginTop: '10px' } },
      '한쪽으로 크게 치우쳐 있으면 운동계획 탭에서 요일별 부위를 다시 맞춰 보세요.'),
  );
}

// ── 종목별 최고 기록 ─────────────────────────────────────────
function prList(all, unit) {
  const best = new Map();   // exerciseId → { name, weight, reps, date }

  for (const s of all) {
    for (const e of s.entries || []) {
      for (const st of e.sets || []) {
        if (!st.done || !st.weight || !st.reps) continue;
        const prev = best.get(e.exerciseId);
        // 무게 우선, 같은 무게면 횟수가 많은 쪽
        if (!prev || st.weight > prev.weight || (st.weight === prev.weight && st.reps > prev.reps)) {
          best.set(e.exerciseId, { name: e.name, weight: st.weight, reps: st.reps, date: s.date });
        }
      }
    }
  }

  const rows = [...best.values()].sort((a, b) => b.weight - a.weight).slice(0, 12);
  if (!rows.length) return null;

  return h('.card', null,
    h('.card-head', null, h('h3', null, '최고 기록')),
    ...rows.map((r, i) => h('div', {
      style: { display: 'flex', gap: '10px', alignItems: 'baseline', padding: '8px 0',
               fontSize: '14px', borderBottom: i < rows.length - 1 ? '1px solid var(--rule)' : 'none' },
    },
      h('span', { style: { flex: 1, minWidth: 0 } }, r.name),
      h('span.num', { style: { flex: '0 0 auto', fontWeight: '700' } }, `${fmtWeight(r.weight, unit)} × ${r.reps}`),
      h('span.num', { style: { flex: '0 0 44px', textAlign: 'right', fontSize: '11px', color: 'var(--ink-3)' } },
        fmtDateShort(r.date)),
    )),
  );
}
