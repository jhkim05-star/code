/** Small views for the billing-month page. No second store or automatic imports. */
import {shiftMonths,zonedDate,validateState} from './domain.js?v=1.6.6';
import {FIRST_MONTH,cashRuleForMonth,cashUsagePeriod,checkMonth,cycleSummary,validMonth,validateCycleExtras} from './cycles.js?v=1.7.0';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=value=>`${Math.round(value||0).toLocaleString('ko-KR')}원`;
const range=p=>p?`${p.start.replaceAll('-','. ')} ~ ${p.end.replaceAll('-','. ')}`:'기간 미설정';
const monthName=m=>`${m.slice(0,4)}년 ${Number(m.slice(5))}월`;
export const activeCycleMonth=(view,s)=>view.cycleMonth||zonedDate(new Date(),s.settings.timeZone).slice(0,7);
function monthNav(month){return `<div class="cycle-month-nav"><button type="button" class="quiet icon-button" data-cycle-step="-1" aria-label="이전 결제월" ${month===FIRST_MONTH?'disabled':''}>‹</button><label class="cycle-month-field"><span class="sr-only">결제 기준월</span><input type="month" data-cycle-month value="${esc(month)}" min="1900-01" max="2199-12"></label><button type="button" class="quiet icon-button" data-cycle-step="1" aria-label="다음 결제월" ${month==='2199-12'?'disabled':''}>›</button></div>`;}
function periodCaption(summary){return summary.samePeriod?`사용기간 ${range(summary.samePeriod)}`:'카드별 사용기간 · 현금·계좌 별도 기간';}
export function cycleHeroHtml(s,month){
  const sum=cycleSummary(s,month);
  return `<section class="card hero-balance cycle-hero"><div class="row"><h2>이번 주기 사용내역</h2><button type="button" class="link-button" data-cycle-period>기간 설정</button></div>${monthNav(month)}<p class="cycle-caption">${esc(monthName(month))} 결제 기준</p><p class="cycle-caption">${esc(periodCaption(sum))}</p><button type="button" class="cycle-total-link" data-cycle-detail aria-label="이번 주기 지출 ${won(sum.total)}, 상세 보기"><span>이번 주기 지출</span><strong class="num">${won(sum.total)}</strong><span aria-hidden="true">›</span></button><p class="cycle-caption">카드 ${won(sum.cardTotal)} · 현금·계좌 ${won(sum.cashTotal)}</p>${sum.unresolved.length?`<p class="cycle-warning">기간 확인이 필요한 카드 내역 ${sum.unresolved.length}건 · 합계에서 제외</p>`:''}${sum.warnings.length?'<p class="cycle-warning">사용기간 설정 확인이 필요해요. 상세에서 확인해 주세요.</p>':''}${sum.note?'<p class="cycle-caption">특이사항 있음</p>':''}</section>`;
}
function moneyRow(title,amount,group,sub=''){return `<button type="button" class="cycle-money-row" data-cycle-group="${esc(group)}"><span><strong>${esc(title)}</strong>${sub?`<small>${esc(sub)}</small>`:''}</span><span class="num">${won(amount)} <span aria-hidden="true">›</span></span></button>`;}
function entryHtml(entry,s){
  const tx=entry.transaction,cat=s.categories.find(c=>c.id===tx.categoryId)?.name||'미분류';
  const inst=entry.kind==='installment'?` · 할부 ${entry.installmentIndex}/${entry.installmentMonths}회 · 원거래 ${tx.date}`:'';
  return `<article class="payment-detail-row cycle-entry"><div><p class="row-title">${esc(tx.merchant||'내용 없음')}</p><p class="row-meta">${esc(entry.effectiveDate)} · ${esc(cat)} · ${esc(entry.label)}${esc(inst)}${entry.kind==='cancellation'?' · 승인취소':''}</p></div><div class="transaction-side"><strong class="amount num">${won(entry.amount)}</strong><button type="button" class="quiet small" data-cycle-edit="${esc(tx.id)}" aria-label="${esc(tx.merchant)} 내역 수정">수정</button></div></article>`;
}
export function cycleDetailHtml(s,month,group=null){
  const sum=cycleSummary(s,month),back=`<button type="button" class="quiet" data-cycle-back>${group?'‹ 주기 요약':'‹ 홈'}</button>`;
  const title=group==='all'?'전체 포함 내역':group==='unresolved'?'기간 확인이 필요한 카드':group==='cashFixed'?'현금·계좌 고정지출':group==='cashExpense'?'현금·계좌 일반지출':sum.cardRows.find(row=>`card:${row.card.id}`===group)?.card.name||'주기 사용내역';
  const head=`${back}<header class="page-head"><div><p class="eyebrow">${esc(monthName(month))} 결제 기준</p><h1>${esc(title)}</h1><p class="sub">${esc(periodCaption(sum))}</p></div></header>${monthNav(month)}`;
  if(group){
    const entries=group==='unresolved'?sum.unresolved.map(tx=>({transaction:tx,effectiveDate:tx.date,amount:tx.cancelled?-Number(tx.amount):Number(tx.amount),label:tx.cardAlias||'카드 미연결',kind:tx.cancelled?'cancellation':'purchase'})):sum.entries.filter(entry=>group==='all'||entry.group===group);
    const sorted=[...entries].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||a.transaction.id.localeCompare(b.transaction.id));
    const period=group.startsWith('card:')?sum.cardRows.find(row=>`card:${row.card.id}`===group)?.period:group.startsWith('cash')?sum.cashPeriod:null;
    return head+`<section class="card">${period?`<p class="notice">사용기간 ${esc(range(period))}</p>`:''}${group==='unresolved'?'<p class="notice warning">사용기간을 알 수 없는 전체 카드 내역입니다. 선택 결제월의 사용액으로 추정하지 않았어요. 거래 수정에서 카드를 연결해 주세요.</p>':`<div class="payment-detail-total"><span>포함 내역 합계</span><strong class="num">${won(entries.reduce((n,e)=>n+e.amount,0))}</strong></div>`}${sorted.map(entry=>entryHtml(entry,s)).join('')||'<p class="empty">이 주기에 포함된 내역이 없어요.</p>'}</section>`;
  }
  return head+`<section class="card cycle-detail"><div class="payment-detail-total"><span>이번 주기 지출</span><strong class="num">${won(sum.total)}</strong></div><h2>카드</h2>${sum.cardRows.map(row=>moneyRow(row.card.name,row.total,`card:${row.card.id}`,`${range(row.period)}${row.card.active===false?' · 이전 카드':''}`)).join('')||'<p class="hint">등록된 카드가 없어요.</p>'}<div class="cycle-subtotal"><span>카드 합계</span><strong class="num">${won(sum.cardTotal)}</strong></div><h2>현금·계좌</h2><p class="hint">${esc(range(sum.cashPeriod))}${sum.cashPeriod?.ruleType==='calendar-month'?' · 달력월 기본':''}</p>${moneyRow('고정지출',sum.cashFixed,'cashFixed')}${moneyRow('일반지출',sum.cashExpense,'cashExpense')}<div class="cycle-subtotal"><span>현금·계좌 합계</span><strong class="num">${won(sum.cashTotal)}</strong></div><div class="section-head"><h2>이번 주기 특이사항</h2><button type="button" class="link-button" data-cycle-note>${sum.note?'수정':'추가'}</button></div><p class="cycle-note">${esc(sum.note||'이 기간에 기억할 일을 남겨보세요.')}</p><button type="button" class="secondary wide" data-cycle-group="all">전체 포함 내역 보기</button><button type="button" class="quiet wide" data-cycle-period>기간 설정</button>${sum.unresolved.length?`<button type="button" class="quiet wide danger" data-cycle-group="unresolved">기간 확인 필요 · ${sum.unresolved.length}건 (전체)</button>`:''}${sum.warnings.map(w=>`<p class="notice warning">${esc(w)}</p>`).join('')}<p class="hint">입력된 거래와 사용기간에 따른 집계이며 카드사 청구서가 아닙니다. 예상 고정지출·이체는 포함하지 않아요. 할부는 해당 기간 회차만, 취소는 등록된 날짜에 차감합니다.</p></section>`;
}
function openDialog(title,body,opener,canClose=()=>true){
  const dialog=document.createElement('dialog'),titleId=`cycle-dialog-${Math.random().toString(36).slice(2)}`;
  dialog.setAttribute('aria-labelledby',titleId);
  dialog.innerHTML=`<div class="dialog-head"><h2 id="${titleId}">${esc(title)}</h2><button type="button" class="quiet icon-button" data-close aria-label="닫기">×</button></div><div class="dialog-body">${body}</div>`;
  const requestClose=()=>{if(canClose())dialog.close();};
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=requestClose);
  dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)requestClose();});
  dialog.onclose=()=>{dialog.remove();if(opener?.isConnected)opener.focus();else document.querySelector('[data-cycle-detail], [data-cycle-note], [data-tab="home"]')?.focus();};
  document.body.append(dialog);dialog.showModal();return dialog;
}
function showNote(ctx,opener){
  const month=activeCycleMonth(ctx.view,ctx.repo.state),before=ctx.repo.state.meta.cycleNotes?.[month]?.text||'';let saved=false,dialog;
  dialog=openDialog(`${monthName(month)} 특이사항`,`<form><label class="field"><span class="label">이번 주기 특이사항</span><textarea name="note" maxlength="10000" rows="7" placeholder="큰 지출의 이유나 기억할 일을 남겨보세요.">${esc(before)}</textarea></label><p class="hint">메모에 금액을 적어도 지출 합계는 바뀌지 않아요.</p><p class="error" role="alert"></p><div class="button-row"><button type="button" class="secondary" data-close>취소</button><button type="submit" class="primary">특이사항 저장</button></div></form>`,opener,()=>saved||dialog.querySelector('textarea').value===before||confirm('저장하지 않은 특이사항을 닫을까요?'));
  const form=dialog.querySelector('form');
  form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type="submit"]');if(button.disabled)return;button.disabled=true;try{await ctx.repo.setCycleNote(month,form.elements.note.value,before);saved=true;ctx.render();dialog.close();ctx.toast('특이사항을 저장했어요.');}catch(error){form.querySelector('.error').textContent=error.message;button.disabled=false;}};
  form.elements.note.focus();
}
function showPeriod(ctx,opener){
  const s=ctx.repo.state,month=activeCycleMonth(ctx.view,s),currentRule=cashRuleForMonth(s.settings,month),expected=JSON.stringify(s.settings.cashCycleHistory||[]);
  const dialog=openDialog('주기 사용기간 설정',`<p class="hint">카드는 기존 ‘카드와 결제주기’ 설정을 사용합니다. 현금·계좌 집계기간만 별도로 정해요.</p><button type="button" class="secondary wide" data-cards>카드별 사용기간 설정</button><hr><form><h3>현금·계좌 집계기간</h3><label class="field"><span class="label">기간 기준</span><select name="kind"><option value="calendar-month" ${currentRule.type==='calendar-month'?'selected':''}>해당 결제월 1일 ~ 말일</option><option value="previous-current" ${currentRule.type!=='calendar-month'?'selected':''}>전월 시작일 ~ 당월 종료일</option></select></label><div class="form-grid" data-day-fields><label class="field"><span class="label">전월 시작일</span><input type="number" name="start" min="1" max="31" value="${currentRule.startDay||11}"></label><label class="field"><span class="label">당월 종료일</span><input type="number" name="end" min="1" max="31" value="${currentRule.endDay||10}"></label></div><label class="field"><span class="label">적용 시작 결제월</span><input type="month" name="fromMonth" min="1900-01" max="2199-12" required value="${month}"></label><p class="notice" data-preview aria-live="polite"></p><p class="hint">이 결제월부터 적용하며 이전 주기는 유지합니다. 거래 날짜와 특이사항은 바꾸지 않아요. 없는 날짜는 해당 월 말일로 맞춥니다.</p><p class="error" role="alert"></p><div class="button-row"><button type="button" class="secondary" data-close>취소</button><button type="submit" class="primary">기간 저장</button></div></form>`,opener);
  dialog.querySelector('[data-cards]').onclick=()=>{dialog.close();ctx.view.tab='settings';ctx.render();const details=document.querySelector('#card-details');if(details){details.open=true;details.scrollIntoView({block:'start'});}};
  const form=dialog.querySelector('form'),rule=()=>form.elements.kind.value==='calendar-month'?{type:'calendar-month'}:{type:'previous-current',startDay:Number(form.elements.start.value),endDay:Number(form.elements.end.value)};
  const preview=()=>{form.querySelector('[data-day-fields]').hidden=form.elements.kind.value==='calendar-month';try{const from=checkMonth(form.elements.fromMonth.value),period=cashUsagePeriod({cashCycleHistory:[{fromMonth:FIRST_MONTH,rule:rule()}]},from);form.querySelector('[data-preview]').textContent=`${monthName(from)} 적용기간 · ${range(period)}`;}catch(error){form.querySelector('[data-preview]').textContent=error.message;}};
  form.addEventListener('input',preview);form.addEventListener('change',preview);preview();
  form.onsubmit=async event=>{event.preventDefault();const submit=form.querySelector('[type="submit"]');if(submit.disabled)return;submit.disabled=true;try{await ctx.repo.setCashCycle(rule(),form.elements.fromMonth.value,expected);ctx.render();dialog.close();ctx.toast('주기 사용기간을 저장했어요.');}catch(error){form.querySelector('.error').textContent=error.message;submit.disabled=false;}};
}
export function installmentSettingHtml(s){return `<label class="installment-setting"><input type="checkbox" id="installments-enabled" ${s.settings.installmentsEnabled===true?'checked':''}><span><strong>카드할부 사용</strong><small>기본은 꺼짐. 켜면 카드 지출의 빠른 입력에서만 할부를 선택해요. 기존 할부 내역과 회차 계산은 유지합니다.</small></span></label><p class="error" role="alert" id="installments-setting-error"></p>`;}
export function syncInstallmentField(form,s){
  const field=form.querySelector('[data-quick-installment]');if(!field)return;
  const enabled=s.settings.installmentsEnabled===true&&form.elements.type.value==='expense'&&form.elements.payment.value.startsWith('card:');
  field.hidden=!enabled;const control=field.querySelector('input');control.disabled=!enabled;if(!enabled)control.value='1';
}
export function bindCycleUI(ctx){
  const root=ctx.app,month=()=>activeCycleMonth(ctx.view,ctx.repo.state);
  root.querySelectorAll('[data-cycle-step]').forEach(b=>b.onclick=()=>{try{ctx.view.cycleMonth=checkMonth(shiftMonths(`${month()}-01`,Number(b.dataset.cycleStep),1).slice(0,7));ctx.render();}catch(error){ctx.toast(error.message);}});
  root.querySelectorAll('[data-cycle-month]').forEach(el=>el.onchange=()=>{if(!validMonth(el.value)){el.value=month();return;}ctx.view.cycleMonth=el.value;ctx.render();});
  root.querySelectorAll('[data-cycle-detail]').forEach(b=>b.onclick=()=>{ctx.view.tab='cycle';ctx.view.cycleGroup=null;ctx.render();});
  root.querySelectorAll('[data-cycle-back]').forEach(b=>b.onclick=()=>{if(ctx.view.cycleGroup)ctx.view.cycleGroup=null;else ctx.view.tab='home';ctx.render();});
  root.querySelectorAll('[data-cycle-group]').forEach(b=>b.onclick=()=>{ctx.view.tab='cycle';ctx.view.cycleGroup=b.dataset.cycleGroup;ctx.render();});
  root.querySelectorAll('[data-cycle-note]').forEach(b=>b.onclick=()=>showNote(ctx,b));
  root.querySelectorAll('[data-cycle-period]').forEach(b=>b.onclick=()=>showPeriod(ctx,b));
  root.querySelectorAll('[data-cycle-edit]').forEach(b=>b.onclick=()=>ctx.editTransaction(b.dataset.cycleEdit,b));
  const toggle=root.querySelector('#installments-enabled');
  if(toggle)toggle.onchange=async()=>{const before=ctx.repo.state.settings.installmentsEnabled===true,next=toggle.checked;toggle.disabled=true;try{await ctx.repo.setting({installmentsEnabled:next});ctx.toast(next?'카드할부 입력을 켰어요.':'카드할부 입력을 숨겼어요. 기존 내역은 그대로예요.');}catch(error){toggle.checked=before;root.querySelector('#installments-setting-error').textContent=error.message;}finally{toggle.disabled=false;}};
}
export function showFullBackupRestore(data,ctx){
  if(data?.schemaVersion!==1)throw new Error('지원하지 않는 가계부 백업 버전이에요.');
  const copy=validateCycleExtras(validateState(structuredClone(data)));
  const dialog=openDialog('가계부 전체 백업 복원',`<p class="notice">거래 ${copy.transactions.length}건 · 카드 ${copy.cards.length}개 · 주기 특이사항 ${Object.keys(copy.meta.cycleNotes||{}).length}개월</p><p class="hint">거래·카드·예산·설정·사용기간·특이사항을 함께 복원합니다. 현재 기록은 복원 전 사본으로 보관하며, 다른 앱은 건드리지 않아요.</p><p class="error" role="alert"></p><div class="button-row"><button type="button" class="secondary" data-close>취소</button><button type="button" class="danger" data-restore>백업으로 전체 교체</button></div>`,document.activeElement);
  dialog.querySelector('[data-restore]').onclick=async event=>{if(!confirm('현재 가계부 전체를 선택한 백업으로 교체할까요?'))return;const button=event.currentTarget;button.disabled=true;try{await ctx.repo.restoreFullBackup(copy);ctx.view.tab='home';ctx.render();dialog.close();ctx.toast('주기 설정과 특이사항까지 복원했어요.');}catch(error){dialog.querySelector('.error').textContent=error.message;button.disabled=false;}};
}
