import { h, mount, pageHead, empty } from '../ui.js';
import { sessions, settings, metadata } from '../store.js';
import { periodBuckets, periodStreak, personalRecordSections, recentGroupWorkSets } from '../stats-model.js';
import { GROUP_NAME } from '../exercises.js';
import { comma, fmtWeight, displayWeight, todayYmd } from '../util.js';
let mode = 'week';
export function renderStats(root) { draw(root); }
function draw(root) {
    const all = sessions();
    if (!all.length) {
        mount(root, pageHead('통계'), empty('실제 운동 기록이 쌓이면 추이를 볼 수 있어요.'));
        return;
    }
    if (metadata().unitReviewRequired) {
        mount(root, pageHead('통계'), empty('기존 kg/lb를 확인한 뒤 무게 통계를 계산해요. 설정의 단위 확인을 먼저 진행해 주세요.'));
        return;
    }
    const buckets = periodBuckets(all, mode), cur = buckets.at(-1), unit = settings().unit, maxActual = Math.max(0, ...buckets.map(b => b.volume)), scale = Math.max(1, maxActual);
    const readout = h('p.hint', { 'aria-live': 'polite' }, `표시 기간 최고 ${comma(displayWeight(maxActual, unit))}${unit} · 막대를 눌러 상세 확인`);
    const recent = recentGroupWorkSets(all), totals = recent.totals, warmups = recent.warmups;
    const rows = [...totals].filter(([, r]) => r.sets).sort((a, b) => b[1].sets - a[1].sets), maxSets = Math.max(1, ...rows.map(([, r]) => r.sets));
    const records = personalRecordSections(all);
    const recordRow = (record, value) => h('.row', { style: { padding: '12px 0', borderBottom: '1px solid var(--rule)' } }, h('span.grow', null, record.name), h('span.num', null, value), h('small', null, record.confirmed ? record.date.slice(5) : '미확인'));
    mount(root, pageHead('통계', '최근 흐름과 종목별 최고 기록을 간단히 봐요'), h('.btn-row', null, h('button', { class: mode === 'week' ? 'btn-primary' : '', 'aria-pressed': mode === 'week', onclick: () => { mode = 'week'; draw(root); } }, '주간'), h('button', { class: mode === 'month' ? 'btn-primary' : '', 'aria-pressed': mode === 'month', onclick: () => { mode = 'month'; draw(root); } }, '월간')), h('.kpis', null, kpi(String(cur.count), mode === 'week' ? '이번 주 기록' : '이번 달 기록'), kpi(String(cur.sets), '본세트'), kpi(String(periodStreak(all, mode)), mode === 'week' ? '연속 주' : '연속 달')), h('.card', null, h('h3', null, `기록 볼륨 (${unit})`), h('p.hint', null, '중량 운동의 표기 중량 × 횟수 추이입니다. 보조중량과 시간 운동은 제외합니다.'), h('.spark', null, ...buckets.map(b => h('button', { 'aria-label': `${b.label}: ${comma(displayWeight(b.volume, unit))}${unit}, ${b.sets}본세트`, onclick: () => readout.textContent = `${b.key} · ${b.count}회 · ${b.sets}본세트 · ${comma(displayWeight(b.volume, unit))}${unit}` }, h('i', { style: { height: `${Math.max(2, b.volume / scale * 100)}%`, opacity: b.volume ? 1 : .2 } })))), h('.spark-x', null, ...buckets.map((b, i) => h('span', null, i % 3 === 0 || i === buckets.length - 1 ? b.label : ''))), readout, h('details', null, h('summary', null, '숫자로 보기'), h('.table-wrap', null, h('table', null, h('thead', null, h('tr', null, h('th', null, '기간'), h('th', null, '기록'), h('th', null, '본세트'), h('th', null, '표기 볼륨'))), h('tbody', null, ...buckets.map(b => h('tr', null, h('td', null, b.key), h('td', null, b.count), h('td', null, b.sets), h('td', null, comma(displayWeight(b.volume, unit)))))))))), h('.card', null, h('h3', null, '최근 7일 부위별 본세트'), rows.length ? rows.map(([g, r]) => h('.bar', null, h('span', null, GROUP_NAME[g] || g), h('span.bar-track', null, h('i', { style: { width: `${r.sets / maxSets * 100}%` } })), h('span.bar-value', null, `${r.sets}세트`))) : h('p.hint', null, '최근 7일 동안 기록한 중량·횟수 운동의 본세트가 없어요.'), h('p.hint', null, `오늘 포함 최근 7일 기준입니다. 웜업 ${warmups}세트와 시간 운동은 합산하지 않았어요.`)), h('.card', null, h('h3', null, '종목별 최고 기록'), h('p.hint', null, '중량 운동은 최고 무게×횟수, 시간 운동은 가장 오래 유지한 시간을 보여줘요. 웜업·보조중량은 제외합니다.'), records.loads.length ? h('h4', null, '중량 최고') : null, ...records.loads.map(p => recordRow(p, `${fmtWeight(p.weight, unit)} × ${p.reps}`)), records.durations.length ? h('h4', null, '시간 최고') : null, ...records.durations.map(p => recordRow(p, formatHoldTime(p.seconds)))));
}
const kpi = (v, k) => h('.kpi', null, h('.v', null, v), h('.k', null, k));
function formatHoldTime(seconds) {
    const value = Math.max(0, Math.round(seconds)), minutes = Math.floor(value / 60), rest = value % 60;
    return minutes ? `${minutes}분${rest ? ` ${rest}초` : ''}` : `${rest}초`;
}
