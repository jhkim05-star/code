import test from'node:test';import assert from'node:assert/strict';import{historySearchMonths,historySearchResult,historySearchText,historySearchTrend}from'../assets/js/history-search.js';

const categories=[{id:'living',name:'생활'},{id:'food',name:'식비'}],cards=[{id:'samsung',name:'삼성카드'}];
const tx=(overrides={})=>({id:Math.random().toString(36),date:'2026-09-20',time:'12:00',type:'expense',amount:350000,merchant:'한빛관리비',memo:'아파트',categoryId:'living',paymentMethod:'card',cardId:'samsung',cancelled:false,...overrides});

test('empty query keeps history on the selected month only',()=>{
  const result=historySearchResult([tx(),tx({date:'2026-08-20'})],{endMonth:'2026-09',query:'',categories,cards});
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].date,'2026-09-20');assert.deepEqual(result.months,['2026-09']);
});
test('query searches selected month plus previous eleven months',()=>{
  const rows=[tx(),tx({date:'2025-10-20',amount:330000}),tx({date:'2025-09-20',amount:320000}),tx({date:'2026-10-01',amount:310000})];
  const result=historySearchResult(rows,{endMonth:'2026-09',query:'한빛',categories,cards});
  assert.deepEqual(historySearchMonths('2026-09'),['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']);
  assert.deepEqual(result.rows.map(row=>row.date),['2026-09-20','2025-10-20']);
});
test('twelve month search crosses year boundaries correctly',()=>{
  const result=historySearchResult([tx({date:'2025-01-03'}),tx({date:'2024-02-03'}),tx({date:'2024-01-03'})],{endMonth:'2025-01',query:'한빛',categories,cards});
  assert.deepEqual(result.rows.map(row=>row.date),['2025-01-03','2024-02-03']);
});
test('search matches Korean merchant memo category card and both amount formats',()=>{
  const row=tx();
  for(const query of['한빛관리비','아파트','생활','삼성카드','350000','350,000'])assert.ok(historySearchText(row,{categories,cards}).includes(query.normalize('NFKC').toLowerCase()));
});
test('type filter applies to twelve month search results',()=>{
  const rows=[tx(),tx({date:'2026-08-01',type:'transfer',merchant:'한빛관리비 이체'})];
  assert.equal(historySearchResult(rows,{endMonth:'2026-09',query:'한빛',type:'expense',categories,cards}).rows.length,1);
  assert.equal(historySearchResult(rows,{endMonth:'2026-09',query:'한빛',type:'transfer',categories,cards}).rows.length,1);
});
test('trend returns only matching months with net totals and counts',()=>{
  const rows=[tx({date:'2026-07-01',amount:100000}),tx({date:'2026-07-02',amount:50000}),tx({date:'2026-08-01',amount:80000}),tx({date:'2026-08-02',amount:10000,cancelled:true})];
  assert.deepEqual(historySearchTrend(rows),[{month:'2026-07',total:150000,count:2},{month:'2026-08',total:70000,count:2}]);
});
