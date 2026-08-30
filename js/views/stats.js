/**
 * 통계 — 얼마나 했고, 무게가 오르고 있는지.
 *
 * 차트는 전부 한 가지 색조의 단일 계열이라 범례가 필요 없습니다.
 * 대신 값이 필요한 곳(최고치·최근치)에만 직접 숫자를 붙이고,
 * 막대를 누르면 그 주의 정확한 값을 보여 줍니다.
 */

import { h, mount, pageHead, empty } from '../ui.js';
import { sessions, settings } from '../store.js';
import { sessionVolume, sessionSetCount } from '../runner.js';
import { GROUPS, GROUP_NAME } from '../exercises.js';
import { weekStartOf, ymd, addDays, parseYmd, comma, fmtWeight, fmtDateShort } from '../util.js';

const WEEKS = 12;

export async function renderStats(root) {
  const all = sessions();
  const unit = settings().unit;

  if (!all.length) {
    mount(root, pageHead('통계', ''), empty('운동을 기록하면 여기에 추이가 그려집니다.'));
    return;
  }

  const weeks = weekBuckets(all, WEEKS);
  const cur = weeks.at(-1);

  mount(root,
    pageHead('통계', `기록 ${all.length}회`),

    h('.kpis', null,
      kpi(String(cur.count), '이번 주 운동'),
      kpi(comma(cur.volume), `이번 주 볼륨 ${unit}`),
      kpi(String(streakWeeks(weeks)), '연속 주'),
    ),

    volumeChart(weeks, unit),
    groupChart(all, unit),
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
    buckets.push({ weekStart: ws, volume: 0, sets: 0, count: 0 });
  }
  const index = new Map(buckets.map(b => [b.weekStart, b]));
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

/** 이번 주를 포함해 거슬러 올라가며 운동한 주가 몇 주 이어졌는지 */
function streakWeeks(weeks) {
  let n = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].count > 0) n += 1;
    else if (i !== weeks.length - 1) break;   // 이번 주가 아직 비어 있는 건 끊긴 게 아닙니다
  }
  return n;
}

// ── 주간 볼륨 추이 ───────────────────────────────────────────
function volumeChart(weeks, unit) {
  const max = Math.max(1, ...weeks.map(w => w.volume));
  const maxIdx = weeks.findIndex(w => w.volume === max);
  const readout = h('.hint', { style: { minHeight: '18px', marginTop: '2px' } },
    `가장 높은 주 ${comma(max)}${unit} · 막대를 누르면 그 주의 값이 보입니다`);

  const bars = weeks.map((w, i) => h('i', {
    style: { height: `${Math.max(2, (w.volume / max) * 100)}%`, opacity: w.volume ? '0.78' : '0.18' },
    role: 'button',
    'aria-label': `${w.weekStart} 주 ${Math.round(w.volume)}${unit}`,
    onclick: () => {
      mount(readout, `${fmtDateShort(w.weekStart)} 주 · ${comma(w.volume)}${unit} · ${w.count}회 · ${w.sets}세트`);
    },
  }));

  return h('.card', null,
    h('.card-head', null,
      h('h3', null, `주간 볼륨 (${unit})`),
      h('.num', { style: { fontSize: '12px', color: 'var(--ink-3)' } }, `최근 ${WEEKS}주`),
    ),
    h('.spark', null, ...bars),
    h('.spark-x', null, ...weeks.map((w, i) =>
      h('span', null, i === 0 || i === weeks.length - 1 || i === maxIdx ? fmtDateShort(w.weekStart) : ''))),
    readout,
  );
}

// ── 부위별 볼륨 (최근 4주) ───────────────────────────────────
function groupChart(all, unit) {
  const since = ymd(addDays(weekStartOf(new Date()), -21));
  const totals = new Map(GROUPS.map(g => [g.id, 0]));

  for (const s of all) {
    if (s.date < since) continue;
    for (const e of s.entries || []) {
      for (const st of e.sets || []) {
        if (!st.done) continue;
        totals.set(e.group, (totals.get(e.group) || 0) + (st.weight || 0) * (st.reps || 0));
      }
    }
  }

  const rows = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  const max = rows[0][1];

  return h('.card', null,
    h('.card-head', null,
      h('h3', null, '부위별 볼륨'),
      h('.num', { style: { fontSize: '12px', color: 'var(--ink-3)' } }, '최근 4주'),
    ),
    h('.bars', null, ...rows.map(([g, v]) =>
      h('.bar', null,
        h('.bl', null, GROUP_NAME[g] || g),
        h('.bt', null, h('i', { style: { width: `${(v / max) * 100}%` } })),
        h('.bv', null, comma(v)),
      ),
    )),
    h('.hint', { style: { marginTop: '10px' } },
      '한쪽으로 크게 치우쳐 있으면 계획을 만들 때 AI에게 말해 주세요.'),
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
