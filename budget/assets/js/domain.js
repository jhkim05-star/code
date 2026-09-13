export const TYPES=['expense','income','transfer'];
export const SOURCES=['manual','notion','kakao','paste','import','recurring'];
export const DEFAULT_CATEGORIES=[
  {id:'food',name:'식비',kind:'expense',fixed:false},{id:'cafe',name:'카페·간식',kind:'expense',fixed:false},
  {id:'transport',name:'교통',kind:'expense',fixed:false},{id:'living',name:'생활',kind:'expense',fixed:false},
  {id:'housing',name:'주거·통신',kind:'expense',fixed:true},{id:'health',name:'건강',kind:'expense',fixed:false},
  {id:'culture',name:'문화·여가',kind:'expense',fixed:false},{id:'subscription',name:'구독',kind:'expense',fixed:true},
  {id:'other',name:'기타',kind:'all',fixed:false}
];

const pad=n=>String(n).padStart(2,'0');
export const isoDate=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
export function parseDate(value){
  const m=String(value||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  const y=+m[1],mo=+m[2],d=+m[3],date=new Date(Date.UTC(y,mo-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d?{y,m:mo,d}:null;
}
export const daysInMonth=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
export const clampDay=(y,m,d)=>Math.max(1,Math.min(+d||1,daysInMonth(y,m)));
export function shiftMonths(value,count,dayOverride){
  const p=typeof value==='string'?parseDate(value):value;if(!p)throw new Error('날짜 형식이 올바르지 않아요.');
  const serial=p.y*12+p.m-1+count,y=Math.floor(serial/12),m=((serial%12)+12)%12+1,d=clampDay(y,m,dayOverride??p.d);
  return isoDate(y,m,d);
}
export function addDays(value,count){
  const p=parseDate(value);if(!p)throw new Error('날짜 형식이 올바르지 않아요.');
  const date=new Date(Date.UTC(p.y,p.m-1,p.d+Number(count||0)));
  return isoDate(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());
}
export const compareDate=(a,b)=>String(a).slice(0,10).localeCompare(String(b).slice(0,10));
export const inRange=(date,start,end)=>compareDate(date,start)>=0&&compareDate(date,end)<=0;
export function zonedDate(now=new Date(),timeZone='Asia/Seoul'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=type=>parts.find(p=>p.type===type)?.value;return `${get('year')}-${get('month')}-${get('day')}`;
}

function dueInMonth(y,m,billingDay){return isoDate(y,m,clampDay(y,m,billingDay));}
export function cardCycleForBillingMonth(month,card){
  const bounds=monthBounds(month),due=parseDate(bounds.from),billingDate=dueInMonth(due.y,due.m,card.billingDay),rule=card?.cycleRule||{type:'billing-offsets',startOffset:-45,endOffset:-16};
  if(rule.type==='previous-current'){
    const previous=parseDate(shiftMonths(bounds.from,-1,1));
    return {start:isoDate(previous.y,previous.m,clampDay(previous.y,previous.m,rule.startDay)),end:isoDate(due.y,due.m,clampDay(due.y,due.m,rule.endDay)),billingDate,ruleType:rule.type};
  }
  if(rule.type==='monthly-range'){
    const endBase=shiftMonths(bounds.from,-Number(rule.dueMonthOffset??1),1),endMonth=parseDate(endBase),spansMonths=Number(rule.endDay)<Number(rule.startDay),startBase=spansMonths?shiftMonths(endBase,-1,1):endBase,startMonth=parseDate(startBase);
    return {start:isoDate(startMonth.y,startMonth.m,clampDay(startMonth.y,startMonth.m,rule.startDay)),end:isoDate(endMonth.y,endMonth.m,clampDay(endMonth.y,endMonth.m,rule.endDay)),billingDate,ruleType:rule.type};
  }
  const startOffset=Number(rule.startOffset??-45),endOffset=Number(rule.endOffset??-16);
  if(startOffset>endOffset)throw new Error('주기 시작 offset은 종료 offset보다 작아야 해요.');
  return {start:addDays(billingDate,startOffset),end:addDays(billingDate,endOffset),billingDate,ruleType:'billing-offsets'};
}
export function cardCycle(referenceDate,card){
  const ref=String(referenceDate).slice(0,10),p=parseDate(ref);if(!p)throw new Error('기준 날짜가 올바르지 않아요.');
  const rule=card?.cycleRule||{type:'billing-offsets',startOffset:-45,endOffset:-16};
  if(rule.type==='previous-current'){
    for(let offset=-2;offset<=2;offset++){
      const dueBase=shiftMonths(isoDate(p.y,p.m,1),offset,1),due=parseDate(dueBase),startBase=shiftMonths(dueBase,-1,1),startMonth=parseDate(startBase);
      const start=isoDate(startMonth.y,startMonth.m,clampDay(startMonth.y,startMonth.m,rule.startDay)),end=isoDate(due.y,due.m,clampDay(due.y,due.m,rule.endDay));
      if(inRange(ref,start,end)){const billingDate=dueInMonth(due.y,due.m,card.billingDay);return{start,end,billingDate,nextBillingDate:compareDate(billingDate,ref)>=0?billingDate:shiftMonths(billingDate,1,card.billingDay),ruleType:rule.type};}
    }
  }else if(rule.type==='monthly-range'){
    for(let offset=-2;offset<=2;offset++){
      const anchor=shiftMonths(isoDate(p.y,p.m,1),offset),a=parseDate(anchor);
      const start=isoDate(a.y,a.m,clampDay(a.y,a.m,rule.startDay));
      const endBase=rule.endDay>=rule.startDay?anchor:shiftMonths(anchor,1,1),e=parseDate(endBase);
      const end=isoDate(e.y,e.m,clampDay(e.y,e.m,rule.endDay));
      if(inRange(ref,start,end)){
        const dueBase=shiftMonths(end,Number(rule.dueMonthOffset??1),1),d=parseDate(dueBase);
        const billingDate=dueInMonth(d.y,d.m,card.billingDay);
        return {start,end,billingDate,nextBillingDate:compareDate(billingDate,ref)>=0?billingDate:shiftMonths(billingDate,1,card.billingDay),ruleType:rule.type};
      }
    }
  }else{
    const startOffset=Number(rule.startOffset??-45),endOffset=Number(rule.endOffset??-16);
    if(startOffset>endOffset)throw new Error('주기 시작 offset은 종료 offset보다 작아야 해요.');
    for(let offset=-2;offset<=4;offset++){
      const dueBase=shiftMonths(isoDate(p.y,p.m,1),offset,1),d=parseDate(dueBase),billingDate=dueInMonth(d.y,d.m,card.billingDay);
      const start=addDays(billingDate,startOffset),end=addDays(billingDate,endOffset);
      if(inRange(ref,start,end))return {start,end,billingDate,nextBillingDate:billingDate,ruleType:'billing-offsets'};
    }
  }
  throw new Error('현재 날짜에 해당하는 카드 주기를 계산하지 못했어요.');
}

export const normalizeText=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[^0-9a-z가-힣]/g,'').trim();
export const normalizeAmount=value=>Math.round(Math.abs(Number(String(value??'').replace(/[^0-9.-]/g,''))||0));
export function transactionFingerprint(tx){
  return [String(tx.date||'').slice(0,10),normalizeAmount(tx.amount),normalizeText(tx.merchant),normalizeText(tx.cardId||tx.paymentMethod),tx.cancelled?'cancel':'approval'].join('|');
}
export function duplicateCandidates(incoming,existing){
  const fp=transactionFingerprint(incoming),sourceId=String(incoming.sourceId||'');
  return existing.filter(tx=>(sourceId&&tx.source===incoming.source&&String(tx.sourceId||'')===sourceId)||transactionFingerprint(tx)===fp);
}
export function validateTransaction(input){
  const tx={...input};const errors=[];
  if(!tx.id)errors.push('id');if(!parseDate(tx.date))errors.push('date');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(tx.time||''))errors.push('time');
  if(tx.billingDate&&!parseDate(tx.billingDate))errors.push('billingDate');
  if(!TYPES.includes(tx.type))errors.push('type');if(!Number.isFinite(Number(tx.amount))||Number(tx.amount)<=0)errors.push('amount');
  if(!SOURCES.includes(tx.source))errors.push('source');if(tx.cardId&&!tx.paymentMethod)tx.paymentMethod='card';
  if(tx.installment&&(!Number.isInteger(+tx.installment.months)||+tx.installment.months<1))errors.push('installment');
  if(errors.length)throw new Error(`거래 항목을 확인해 주세요: ${errors.join(', ')}`);return tx;
}
export function validateState(state){
  const keys=['transactions','cards','categories','budgets','imports','settings','meta'];
  for(const key of keys)if(!(key in(state||{})))throw new Error(`데이터에 ${key} 항목이 없어요.`);
  if(!('recurringExpenses'in state))state.recurringExpenses=[];
  if(!Array.isArray(state.transactions)||!Array.isArray(state.cards)||!Array.isArray(state.categories)||!Array.isArray(state.budgets)||!Array.isArray(state.imports))throw new Error('목록 데이터 형식이 올바르지 않아요.');
  if(!Array.isArray(state.recurringExpenses))throw new Error('고정지출 데이터 형식이 올바르지 않아요.');
  for(const rule of state.recurringExpenses){if(!rule.id||!rule.name||!Number.isFinite(+rule.amount)||+rule.amount<=0||!Number.isInteger(+rule.day)||+rule.day<1||+rule.day>31||!parseDate(`${rule.startMonth}-01`)||!Array.isArray(rule.generatedMonths||[]))throw new Error('고정지출 항목을 확인해 주세요.');}
  state.transactions.forEach(validateTransaction);return state;
}
export function defaultState(){return {schemaVersion:1,revision:0,transactions:[],cards:[],categories:structuredClone(DEFAULT_CATEGORIES),budgets:[],imports:[],recurringExpenses:[],settings:{theme:'blue',background:'white',timeZone:'Asia/Seoul',notion:{proxyUrl:'',dataSourceId:'',mapping:{}},notificationCursor:null},meta:{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),lastNotionSync:null}};}
export function uid(prefix='id'){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;}

export function signedAmount(tx){if(tx.type==='transfer')return 0;const amount=normalizeAmount(tx.amount);if(tx.type==='income')return amount;return tx.cancelled?-amount:amount;}
export function netTransactions(transactions,{from='0000-01-01',to='9999-12-31',excludeTransfers=true}={}){
  return transactions.filter(tx=>inRange(tx.date,from,to)&&(!excludeTransfers||tx.type!=='transfer'));
}
export function installmentAmountForPeriod(tx,start,end){
  if(tx.type!=='expense'||tx.cancelled)return 0;const months=Math.max(1,Number(tx.installment?.months||1)),amount=normalizeAmount(tx.amount);
  if(months===1)return inRange(tx.date,start,end)?amount:0;
  const base=Math.floor(amount/months),remainder=amount-base*months;let sum=0;
  for(let i=0;i<months;i++){const date=shiftMonths(tx.date,i);if(inRange(date,start,end))sum+=base+(i<remainder?1:0);}return sum;
}
export function cardCycleTotal(transactions,card,cycle){
  const regular=transactions.filter(tx=>tx.cardId===card.id&&!tx.cancelled).reduce((sum,tx)=>sum+installmentAmountForPeriod(tx,cycle.start,cycle.end),0);
  const cancellations=transactions.filter(tx=>tx.cardId===card.id&&tx.cancelled&&inRange(tx.date,cycle.start,cycle.end)).reduce((sum,tx)=>sum+normalizeAmount(tx.amount),0);
  return Math.max(0,regular-cancellations);
}
export function cardPaymentForecast(transactions,cards,today){
  const current=parseDate(String(today).slice(0,10));if(!current)throw new Error('기준 날짜가 올바르지 않아요.');
  const currentMonth=String(today).slice(0,7),nextMonth=shiftMonths(`${currentMonth}-01`,1,1).slice(0,7),active=cards.filter(card=>card.active);
  const rowsFor=(month,zeroAfterDue)=>active.map(card=>{const cycle=cardCycleForBillingMonth(month,card),duePassed=zeroAfterDue&&compareDate(today,cycle.billingDate)>0;return {card,cycle,total:duePassed?0:cardCycleTotal(transactions,card,cycle),duePassed};});
  return {currentMonth,nextMonth,current:rowsFor(currentMonth,true),next:rowsFor(nextMonth,false)};
}
export function monthBounds(month){const p=String(month).match(/^(\d{4})-(\d{2})$/);if(!p)throw new Error('월 형식이 올바르지 않아요.');return {from:`${month}-01`,to:isoDate(+p[1],+p[2],daysInMonth(+p[1],+p[2]))};}
export function summarize(transactions,{month,categories=[]}={}){
  const {from,to}=monthBounds(month),rows=netTransactions(transactions,{from,to}),catMap=new Map(categories.map(c=>[c.id,c]));
  const out={expense:0,income:0,byCategory:{},byCard:{},byMerchant:{},fixed:0,variable:0};
  for(const tx of rows){const value=signedAmount(tx);if(tx.type==='income')out.income+=value;else if(tx.type==='expense'){
    out.expense+=value;out.byCategory[tx.categoryId]=(out.byCategory[tx.categoryId]||0)+value;out.byCard[tx.cardId||tx.paymentMethod]=(out.byCard[tx.cardId||tx.paymentMethod]||0)+value;
    out.byMerchant[tx.merchant||'미입력']=(out.byMerchant[tx.merchant||'미입력']||0)+value;if(catMap.get(tx.categoryId)?.fixed)out.fixed+=value;else out.variable+=value;
  }}return out;
}
export function summarizeYear(transactions,year,categories=[]){
  const months=Array.from({length:12},(_,i)=>summarize(transactions,{month:`${year}-${String(i+1).padStart(2,'0')}`,categories}));
  return {expense:months.reduce((sum,row)=>sum+row.expense,0),income:months.reduce((sum,row)=>sum+row.income,0),months};
}
export function usageBreakdown(transactions,{month,cards=[],categories=[]}={}){
  const {from,to}=monthBounds(month),rows=netTransactions(transactions,{from,to}).filter(tx=>tx.type==='expense'),cardNames=new Map(cards.map(card=>[card.id,card.name])),categoryMap=new Map(categories.map(category=>[category.id,category])),byCard={};let cashFixed=0,cashExpense=0;
  for(const tx of rows){const value=signedAmount(tx),isCard=tx.paymentMethod==='card'||Boolean(tx.cardId);if(isCard){const name=cardNames.get(tx.cardId)||tx.cardAlias||'미연결 카드';byCard[name]=(byCard[name]||0)+value;}else if(tx.recurringExpenseId||categoryMap.get(tx.categoryId)?.fixed)cashFixed+=value;else cashExpense+=value;}
  const cardRows=Object.entries(byCard).sort((a,b)=>b[1]-a[1]),cardTotal=cardRows.reduce((sum,row)=>sum+row[1],0),cashTotal=cashFixed+cashExpense;
  return {cardRows,cardTotal,cashFixed,cashExpense,cashTotal,total:cardTotal+cashTotal};
}
export function recurringTransactionsDue(state,referenceDate,now=new Date().toISOString()){
  const ref=String(referenceDate).slice(0,10),parsed=parseDate(ref);if(!parsed)throw new Error('기준 날짜가 올바르지 않아요.');const currentMonth=ref.slice(0,7),due=[];
  for(const rule of state.recurringExpenses||[]){if(rule.active===false||rule.startMonth>currentMonth)continue;const generated=new Set(rule.generatedMonths||[]);let month=rule.startMonth,guard=0;while(month<=currentMonth&&guard++<1200){const p=parseDate(`${month}-01`),date=isoDate(p.y,p.m,clampDay(p.y,p.m,rule.day));if(compareDate(date,ref)<=0&&!generated.has(month))due.push({id:`recurring:${rule.id}:${month}`,date,time:'00:00',type:'expense',amount:Number(rule.amount),merchant:rule.name,categoryId:rule.categoryId||'other',paymentMethod:'cash',cardId:null,source:'recurring',sourceId:`recurring:${rule.id}:${month}`,memo:rule.memo||'매월 자동 고정지출',installment:null,cancelled:false,linkedOriginal:null,recurringExpenseId:rule.id,recurringMonth:month,createdAt:now,updatedAt:now});month=shiftMonths(`${month}-01`,1,1).slice(0,7);}}
  return due;
}
export function merchantTopAcrossPreviousAndCurrentMonth(transactions,month,categories=[],limit=5){
  const previousMonth=shiftMonths(`${month}-01`,-1).slice(0,7),totals={};
  for(const targetMonth of[previousMonth,month]){
    const stats=summarize(transactions,{month:targetMonth,categories});
    for(const [merchant,amount] of Object.entries(stats.byMerchant))totals[merchant]=(totals[merchant]||0)+amount;
  }
  return {previousMonth,currentMonth:month,merchants:Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,limit)};
}
export function budgetProgress(state,month){
  const stats=summarize(state.transactions,{month,categories:state.categories}),rows=state.budgets.filter(b=>b.month===month),total=rows.find(b=>!b.categoryId)?.amount||0;
  return {spent:stats.expense,total,remaining:total?total-stats.expense:null,ratio:total?stats.expense/total:0,categories:rows.filter(b=>b.categoryId).map(b=>({ ...b,spent:stats.byCategory[b.categoryId]||0,remaining:b.amount-(stats.byCategory[b.categoryId]||0),ratio:b.amount?(stats.byCategory[b.categoryId]||0)/b.amount:0}))};
}
