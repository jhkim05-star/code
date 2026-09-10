import { h, modal, confirmSheet, toast } from '../ui.js';
import { settings, getPlan, savePlan, flush } from '../store.js';
import { analyzePlan } from '../planner.js';
import { GROUP_NAME } from '../exercises.js';
import { fmtDate, fmtWeight, fmtWeekRange } from '../util.js';
import { go } from '../app.js';
export function planSummary(plan) {
    const report = analyzePlan(plan);
    return h('div', null, h('p.hint', null, plan.note || ''), report.warnings.length ? h('details', { open: true }, h('summary', null, `확인할 사항 ${report.warnings.length}개`), ...report.warnings.map(t => h('p.hint.warning', null, t))) : h('p.hint.good', null, '설정한 기구·종목·시간 조건에 큰 충돌이 없어요. 개인 적합성은 직접 확인해 주세요.'), h('.table-wrap', null, h('table', null, h('thead', null, h('tr', null, h('th', null, '부위'), h('th', null, '본세트'), h('th', null, '설정 목표'), h('th', null, '보조 자극'))), h('tbody', null, ...Object.entries(report.direct).filter(([g, n]) => n || report.overlap[g]).map(([g, n]) => h('tr', null, h('td', null, GROUP_NAME[g]), h('td', null, n), h('td', null, settings().plan.weeklyTargets[g]), h('td', null, report.overlap[g])))))), h('p.hint', null, report.note), ...plan.days.map(d => h('details', null, h('summary', null, `${fmtDate(d.date)} · ${d.title} · ${report.days.find(x => x.date === d.date)?.minutes || 0}분`), ...d.blocks.map(b => h('p.hint', null, `${b.name} · ${b.sets.filter(s => !s.warmup).length}본세트${b.sets.some(s => s.warmup) ? ' + 웜업 ' + b.sets.filter(s => s.warmup).length : ''} · ${fmtWeight(b.sets.find(s => !s.warmup)?.weight, settings().unit)} × ${b.sets.find(s => !s.warmup)?.reps}${b.measure === 'duration' ? '초' : '회'}`)))));
}
export function showPlanPreview(plan, { baseline = JSON.stringify(getPlan(plan.weekStart)), guard = () => true } = {}) {
    modal(close => h('div', null, h('h3', null, '적용 전 계획 확인'), h('p.hint', null, fmtWeekRange(plan.weekStart)), planSummary(plan), h('button.btn-block.btn-primary', { onclick: async () => {
            if (!guard())
                throw new Error('생성 후 설정이나 운동 기록이 바뀌었어요. 새 조건으로 다시 생성해 주세요.');
            if (JSON.stringify(getPlan(plan.weekStart)) !== baseline)
                throw new Error('이 주의 계획이 변경됐어요. 기존 계획을 확인하고 다시 생성해 주세요.');
            if (getPlan(plan.weekStart) && !await confirmSheet({ title: '기존 주간 계획을 교체할까요?', body: '이미 완료한 실제 운동 기록은 그대로 남아요.', confirmText: '이 계획 적용' }))
                return;
            if (!guard() || JSON.stringify(getPlan(plan.weekStart)) !== baseline)
                throw new Error('확인 중 조건이 바뀌었습니다. 다시 생성해 주세요.');
            savePlan(plan);
            await flush();
            close();
            toast('검토한 계획을 저장했어요.');
            go('/exec/' + plan.weekStart);
        } }, '이 계획 적용')));
}
