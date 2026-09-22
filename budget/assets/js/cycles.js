/** Billing-month summaries. Pure functions; never infer a bank's real statement. */
import {addDays,cardCycleEntries,cardCycleForBillingMonth,inRange,monthBounds,parseDate,shiftMonths,signedAmount,zonedDate} from './domain.js?v=1.6.6';

export const FIRST_MONTH='1900-01';
export function validMonth(month){return typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&month>=FIRST_MONTH&&month<='2199-12';}
export function checkMonth(month){if(!validMonth(month))throw new Error('결제월을 확인해 주세요.');return month;}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;

/** Reject new invalid rules, while leaving old source records untouched. */
export function validateCycleRule(rule,{cash=false}={}){
  if(!object(rule))throw new Error('사용기간 설정을 확인해 주세요.');
  if(cash&&rule.type==='calendar-month')return rule;
  if(cash&&rule.type!=='previous-current')throw new Error('현금 기간은 달력월 또는 전월~당월 기준을 선택해 주세요.');
  if(['previous-current','monthly-range'].includes(rule.type)){
    if(!integer(rule.startDay,1,31)||!integer(rule.endDay,1,31))throw new Error('시작일과 종료일은 1~31일로 입력해 주세요.');
    if(rule.type==='monthly-range'&&!integer(rule.dueMonthOffset??1,0,3))throw new Error('결제월 간격을 확인해 주세요.');
  }else if(rule.type==='billing-offsets'&&!cash){
    if(!integer(rule.startOffset,-90,0)||!integer(rule.endOffset,-90,0)||rule.startOffset>rule.endOffset)throw new Error('사용기간 offset을 확인해 주세요.');
  }else throw new Error('지원하지 않는 사용기간 설정이에요.');
  return rule;
}
function historyRows(rows,kind){
  if(!Array.isArray(rows)||rows.length>1200)throw new Error('사용기간 변경 이력이 올바르지 않아요.');
  const seen=new Set();
  for(const row of rows){
    if(!object(row)||!validMonth(row.fromMonth)||seen.has(row.fromMonth))throw new Error('사용기간 적용월이 올바르지 않아요.');
    seen.add(row.fromMonth);validateCycleRule(row.rule,{cash:kind==='cash'});
    if(kind==='card'&&!integer(row.billingDay,1,31))throw new Error('카드 결제일을 확인해 주세요.');
  }
  return rows;
}
export function validateCycleExtras(state){
  if(!object(state.settings)||!object(state.meta))throw new Error('설정과 메타데이터 형식을 확인해 주세요.');
  if(state.settings.installmentsEnabled!==undefined&&typeof state.settings.installmentsEnabled!=='boolean')throw new Error('카드할부 사용 설정은 켜짐/꺼짐이어야 해요.');
  if(state.settings.cashCycleHistory!==undefined)historyRows(state.settings.cashCycleHistory,'cash');
  for(const card of state.cards){if(card.cycleHistory!==undefined)historyRows(card.cycleHistory,'card');}
  const notes=state.meta.cycleNotes;
  if(notes!==undefined){
    if(!object(notes)||Object.keys(notes).length>3600)throw new Error('주기 특이사항 형식이 올바르지 않아요.');
    for(const [month,note] of Object.entries(notes))if(!validMonth(month)||!object(note)||typeof note.text!=='string'||note.text.length>10000||typeof note.updatedAt!=='string')throw new Error('주기 특이사항을 확인해 주세요.');
  }
  return state;
}
const selectHistory=(rows,month)=>[...(rows||[])].filter(row=>row.fromMonth<=month).sort((a,b)=>b.fromMonth.localeCompare(a.fromMonth))[0];
export function resolvedCard(card,month){
  checkMonth(month);
  const row=selectHistory(card.cycleHistory,month);
  return row?{...card,billingDay:row.billingDay,cycleRule:row.rule}:card;
}
export function cardUsagePeriod(card,month){
  const value=resolvedCard(card,month);
  if(!integer(+value.billingDay,1,31))throw new Error('카드 결제일 미설정');
  validateCycleRule(value.cycleRule);
  const period=cardCycleForBillingMonth(checkMonth(month),value);
  if(!parseDate(period.start)||!parseDate(period.end)||period.start>period.end)throw new Error('카드 사용기간을 확인해 주세요.');
  return period;
}
export function cashRuleForMonth(settings,month){checkMonth(month);return selectHistory(settings.cashCycleHistory,month)?.rule||{type:'calendar-month'};}
export function cashUsagePeriod(settings,month){
  const rule=cashRuleForMonth(settings,month);validateCycleRule(rule,{cash:true});
  if(rule.type==='calendar-month'){const p=monthBounds(month);return {start:p.from,end:p.to,ruleType:rule.type};}
  return cardCycleForBillingMonth(month,{billingDay:1,cycleRule:rule});
}
const insertHistory=(rows,next)=>[...rows.filter(row=>row.fromMonth!==next.fromMonth),structuredClone(next)].sort((a,b)=>a.fromMonth.localeCompare(b.fromMonth));
/** Save a change from a selected month, not retroactively for every month. */
export function changedCard(previous,value,fromMonth,currentMonth){
  checkMonth(fromMonth);checkMonth(currentMonth);
  if(fromMonth>currentMonth)throw new Error('카드 기간은 이번 결제월 또는 이전 결제월부터 적용해 주세요.');
  validateCycleRule(value.cycleRule);
  if(!integer(value.billingDay,1,31))throw new Error('카드 결제일을 확인해 주세요.');
  if(!previous)return {...value};
  const atFrom=resolvedCard(previous,fromMonth);
  if(JSON.stringify(atFrom.cycleRule)===JSON.stringify(value.cycleRule)&&Number(atFrom.billingDay)===value.billingDay)return {...previous,...value,cycleRule:previous.cycleRule,billingDay:previous.billingDay};
  // Freeze the old rule only on the first explicit edit, not on application startup.
  const rows=previous.cycleHistory?.length?previous.cycleHistory:[{fromMonth:FIRST_MONTH,rule:previous.cycleRule,billingDay:previous.billingDay}];
  const history=insertHistory(rows,{fromMonth,rule:value.cycleRule,billingDay:value.billingDay});
  historyRows(history,'card');
  const active=selectHistory(history,currentMonth);
  return {...previous,...value,cycleRule:structuredClone(active.rule),billingDay:active.billingDay,cycleHistory:history};
}
export function changedCashHistory(settings,rule,fromMonth){
  checkMonth(fromMonth);validateCycleRule(rule,{cash:true});
  const rows=settings.cashCycleHistory?.length?settings.cashCycleHistory:[{fromMonth:FIRST_MONTH,rule:{type:'calendar-month'}}];
  return insertHistory(rows,{fromMonth,rule});
}

/** Entries are the single source for the hero, subtotals and drill-down views. */
export function cycleSummary(state,month){
  checkMonth(month);
  const actual=state.transactions.filter(tx=>tx.type==='expense'&&!tx.projected);
  const cardIds=new Set(state.cards.map(card=>card.id)),unresolved=[],warnings=[],cardRows=[],allEntries=[];
  for(const card of state.cards){
    try{
      const period=cardUsagePeriod(card,month),entries=cardCycleEntries(actual,card,period).map(entry=>({...entry,group:`card:${card.id}`,label:card.name,period}));
      if(card.active===false&&!entries.length)continue;
      const total=entries.reduce((n,entry)=>n+entry.amount,0);
      cardRows.push({card,period,entries,total});allEntries.push(...entries);
      // Irregular monthly windows are legal, but their gaps/overlap must be visible.
      const prevMonth=shiftMonths(`${month}-01`,-1,1).slice(0,7);
      if(validMonth(prevMonth)){
        const prev=cardUsagePeriod(card,prevMonth);
        if(addDays(prev.end,1)!==period.start)warnings.push(`${card.name}: 전 주기와 사용기간이 이어지지 않아요. 겹침 또는 빈 날짜를 확인해 주세요.`);
      }
    }catch(error){warnings.push(`${card.name||'카드'}: ${error.message}`);unresolved.push(...actual.filter(tx=>tx.cardId===card.id));}
  }
  unresolved.push(...actual.filter(tx=>(tx.paymentMethod==='card'||tx.cardId)&&!cardIds.has(tx.cardId)));
  // Unmapped cards have no reliable billing window. Show all for review, not a guessed total.
  const unknown=[...new Map(unresolved.map(tx=>[tx.id,tx])).values()];
  let cashPeriod;
  try{
    cashPeriod=cashUsagePeriod(state.settings,month);
    const prevMonth=shiftMonths(`${month}-01`,-1,1).slice(0,7);
    if(validMonth(prevMonth)&&addDays(cashUsagePeriod(state.settings,prevMonth).end,1)!==cashPeriod.start)warnings.push('현금·계좌: 전 주기와 겹침 또는 빈 날짜가 있어요. 적용 시작월과 기간을 확인해 주세요.');
  }catch(error){warnings.push(error.message);}
  const categoryMap=new Map(state.categories.map(category=>[category.id,category]));
  const cashEntries=cashPeriod?actual.filter(tx=>!tx.cardId&&tx.paymentMethod!=='card'&&inRange(tx.date,cashPeriod.start,cashPeriod.end)).map(tx=>({transaction:tx,effectiveDate:tx.date,amount:signedAmount(tx),kind:tx.cancelled?'cancellation':'purchase',group:tx.recurringExpenseId||categoryMap.get(tx.categoryId)?.fixed?'cashFixed':'cashExpense',label:tx.recurringExpenseId||categoryMap.get(tx.categoryId)?.fixed?'현금·계좌 고정지출':'현금·계좌 일반지출',period:cashPeriod})):[];
  allEntries.push(...cashEntries);
  const cashFixed=cashEntries.filter(e=>e.group==='cashFixed').reduce((n,e)=>n+e.amount,0),cashExpense=cashEntries.filter(e=>e.group==='cashExpense').reduce((n,e)=>n+e.amount,0);
  const cardTotal=cardRows.reduce((n,row)=>n+row.total,0),cashTotal=cashFixed+cashExpense;
  const periods=[...cardRows.map(row=>row.period),...(cashPeriod?[cashPeriod]:[])];
  const samePeriod=periods.length>0&&periods.every(p=>p.start===periods[0].start&&p.end===periods[0].end)?periods[0]:null;
  return {month,cardRows,cardTotal,cashPeriod,cashFixed,cashExpense,cashTotal,total:cardTotal+cashTotal,entries:allEntries,unresolved:unknown,warnings,samePeriod,note:state.meta.cycleNotes?.[month]?.text||''};
}
export function categoryOrder(state,type='expense',today=zonedDate(new Date(),state.settings.timeZone||'Asia/Seoul')){
  const rows=state.categories.filter(category=>category.kind===type||category.kind==='all'),scores=new Map(rows.map((c,i)=>[c.id,{count:0,last:'',index:i}]));
  for(const tx of state.transactions){
    const score=scores.get(tx.categoryId);
    if(!score||tx.type!==type||tx.cancelled||tx.projected||tx.date>today)continue;
    score.count++;score.last=score.last>tx.date?score.last:tx.date;
  }
  return rows.sort((a,b)=>{const x=scores.get(a.id),y=scores.get(b.id);return y.count-x.count||y.last.localeCompare(x.last)||x.index-y.index;});
}
export function quickInstallment(settings,type,payment,months){
  if(settings.installmentsEnabled!==true||type!=='expense'||!String(payment).startsWith('card:'))return null;
  const count=Number(months||1);if(!integer(count,1,36))throw new Error('할부 개월은 1~36으로 입력해 주세요.');
  return count>1?{months:count}:null;
}
export function entryTime(timeZone='Asia/Seoul',now=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),get=key=>parts.find(p=>p.type===key).value;
  return `${get('hour')}:${get('minute')}`;
}
/** Disabling new installment input must never erase an existing contract. */
export function editedInstallment(settings,original,type,payment,months){
  const existing=Number(original.installment?.months||1)>1;
  if(existing&&(type!=='expense'||payment!==`card:${original.cardId}`))throw new Error('기존 할부 내역의 거래 유형과 카드는 유지해 주세요.');
  if(existing&&settings.installmentsEnabled!==true)return structuredClone(original.installment);
  return quickInstallment(settings,type,payment,months);
}
