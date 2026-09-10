import { h, mount, pageHead, empty } from '../ui.js';
import { sessions, settings, metadata } from '../store.js';
import { periodBuckets, periodStreak, personalRecords, totalTimedSeconds } from '../stats-model.js';
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
    const since = buckets[buckets.length - (mode === 'week' ? 4 : 2)].start, totals = new Map();
    let warmups = 0;
    for (const s of all) {
        if (s.date < since || s.date > todayYmd())
            continue;
        for (const e of s.entries) {
            const row = totals.get(e.group) || { sets: 0, volume: 0 };
            for (const st of e.sets) {
                if (!st.done)
                    continue;
                if (st.warmup) {
                    warmups++;
                    continue;
                }
                row.sets++;
                if (e.measure !== 'duration' && e.exerciseId !== 'plank')
                    row.volume += (st.weight || 0) * (st.reps || 0);
            }
            totals.set(e.group, row);
        }
    }
    const rows = [...totals].filter(([, r]) => r.sets).sort((a, b) => b[1].sets - a[1].sets), maxSets = Math.max(1, ...rows.map(([, r]) => r.sets));
    mount(root, pageHead('통계', '본세트·웜업·시간 운동을 구분해서 봐요'), h('.btn-row', null, h('button', { class: mode === 'week' ? 'btn-primary' : '', 'aria-pressed': mode === 'week', onclick: () => { mode = 'week'; draw(root); } }, '주간'), h('button', { class: mode === 'month' ? 'btn-primary' : '', 'aria-pressed': mode === 'month', onclick: () => { mode = 'month'; draw(root); } }, '월간')), h('.kpis', null, kpi(String(cur.count), mode === 'week' ? '이번 주 기록' : '이번 달 기록'), kpi(String(cur.sets), '본세트'), kpi(String(periodStreak(all, mode)), mode === 'week' ? '연속 주' : '연속 달')), h('.card', null, h('h3', null, `기록 볼륨 (${unit})`), h('p.hint', null, '입력 표기 중량 × 횟수의 참고 추이입니다. 덤벨 한쪽·머신 표기·맨몸은 서로 같은 실제 부하가 아니에요.'), h('.spark', null, ...buckets.map(b => h('button', { 'aria-label': `${b.label}: ${comma(displayWeight(b.volume, unit))}${unit}, ${b.sets}본세트`, onclick: () => readout.textContent = `${b.key} · ${b.count}회 · ${b.sets}본세트 · ${comma(displayWeight(b.volume, unit))}${unit}` }, h('i', { style: { height: `${Math.max(2, b.volume / scale * 100)}%`, opacity: b.volume ? 1 : .2 } })))), h('.spark-x', null, ...buckets.map((b, i) => h('span', null, i % 3 === 0 || i === buckets.length - 1 ? b.label : ''))), readout, h('details', null, h('summary', null, '숫자로 보기'), h('.table-wrap', null, h('table', null, h('thead', null, h('tr', null, h('th', null, '기간'), h('th', null, '기록'), h('th', null, '본세트'), h('th', null, '표기 볼륨'))), h('tbody', null, ...buckets.map(b => h('tr', null, h('td', null, b.key), h('td', null, b.count), h('td', null, b.sets), h('td', null, comma(displayWeight(b.volume, unit)))))))))), h('.card', null, h('h3', null, mode === 'week' ? '최근 4주 부위별 본세트' : '최근 2개월 부위별 본세트'), ...rows.map(([g, r]) => h('.bar', null, h('span', null, GROUP_NAME[g] || g), h('span.bar-track', null, h('i', { style: { width: `${r.sets / maxSets * 100}%` } })), h('span.bar-value', null, `${r.sets}세트`))), h('p.hint', null, `같은 기간 웜업 ${warmups}세트는 위 본세트에 합산하지 않았어요. 부위별 적정량을 자동 진단하는 그래프는 아닙니다.`)), h('.card', null, h('h3', null, '시간 운동'), h('p', null, `전체 본세트 유지 시간 ${Math.round(totalTimedSeconds(all) / 60)}분`), h('p.hint', null, '플랭크 같은 운동은 초로 기록하고 중량 볼륨과 섞지 않아요.')), h('.card', null, h('h3', null, '종목별 최고 기록'), h('p.hint', null, '웜업 제외, 기록 중량 우선입니다. 미확인 표시 값은 추천 근거로 사용하지 않아요.'), ...personalRecords(all).slice(0, 20).map(p => h('.row', { style: { padding: '12px 0', borderBottom: '1px solid var(--rule)' } }, h('span.grow', null, p.name), h('span.num', null, `${fmtWeight(p.weight, unit)} × ${p.reps}`), h('small', null, p.confirmed ? p.date.slice(5) : '미확인')))));
}
const kpi = (v, k) => h('.kpi', null, h('.v', null, v), h('.k', null, k));
