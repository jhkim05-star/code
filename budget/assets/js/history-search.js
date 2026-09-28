const normalize=value=>String(value??'').normalize('NFKC').trim().toLowerCase();
const monthIndex=value=>{const match=String(value||'').match(/^(\d{4})-(\d{2})$/);if(!match)return null;const year=Number(match[1]),month=Number(match[2]);if(month<1||month>12)return null;return year*12+month-1;};
const monthFromIndex=index=>`${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`;

export function historySearchMonths(endMonth,count=12){
  const end=monthIndex(endMonth),length=Math.max(1,Math.min(24,Number(count)||12));
  if(end===null)return[];
  return Array.from({length},(_,i)=>monthFromIndex(end-length+1+i));
}
export function historySearchText(tx,{categories=[],cards=[]}={}){
  const category=categories.find(item=>item.id===tx.categoryId)?.name||'';
  const card=cards.find(item=>item.id===tx.cardId)?.name||'';
  const amount=Number(tx.amount||0);
  return [tx.merchant,tx.memo,category,card,tx.paymentMethod,String(Math.round(amount)),amount.toLocaleString('ko-KR')]
    .map(normalize).join(' ');
}
export function historySearchResult(transactions,{endMonth,type='all',query='',categories=[],cards=[],months=12}={}){
  const normalizedQuery=normalize(query),range=normalizedQuery?historySearchMonths(endMonth,months):[endMonth],startMonth=range[0]||endMonth;
  const rows=(transactions||[]).filter(tx=>{
    const month=String(tx.date||'').slice(0,7);
    if(tx.type==='income'||!range.includes(month))return false;
    if(type!=='all'&&tx.type!==type)return false;
    return !normalizedQuery||historySearchText(tx,{categories,cards}).includes(normalizedQuery);
  }).sort((a,b)=>`${b.date||''}T${b.time||''}`.localeCompare(`${a.date||''}T${a.time||''}`));
  return {rows,query:normalizedQuery,startMonth,endMonth,months:range};
}
export function historySearchTrend(rows){
  const map=new Map();
  for(const tx of rows||[]){
    const month=String(tx.date||'').slice(0,7);if(!month)continue;
    const current=map.get(month)||{month,total:0,count:0};
    const amount=Number(tx.amount||0);
    current.total+=(tx.cancelled?-1:1)*amount;
    current.count+=1;map.set(month,current);
  }
  return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month));
}
