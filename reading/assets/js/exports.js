import { STATUSES,FORMATS,readingsFor,displayDate,durationOf,cleanExport,summary } from './domain.js';
import { bookmoryXlsx } from './bookmory.js';
export const jsonBackup=s=>JSON.stringify(cleanExport(s),null,2);
export function noteMarkdown(n,b,r){
  const parts=[`# ${b?.title||'독서 노트'}`,b?.authors?.length?b.authors.join(', '):'',r?`읽은 기간: ${displayDate(r.startedAt)} ~ ${displayDate(r.finishedAt)}\n한줄평: ${r.oneLiner||'없음'}`:'',`노트: ${n.title|| (n.kind==='memo'?'읽으며 남긴 메모':'감상평')}`];
  for(const [key,label]of [['summary','핵심 내용'],['reflection','내 생각'],['takeaway','나에게 남은 것'],['questions','남은 질문'],['actions','해볼 일'],['text',n.memoType==='quote'?'인상 깊은 문장':'메모'],['locator','페이지 · 위치'],['comment','내 생각'],['legacyText','기존 독서록 (원문)']])if(n[key])parts.push(`## ${label}\n\n${n[key]}`);
  if(n.tags?.length)parts.push('태그: '+n.tags.join(', '));
  return parts.filter(Boolean).join('\n\n')+'\n';
}
export function allMarkdown(state){return state.notes.map(n=>noteMarkdown(n,state.books.find(b=>b.id===n.bookId),state.readings.find(r=>r.id===n.readingId))).join('\n---\n\n');}
export function tables(state){
  const books=new Map(state.books.map(b=>[b.id,b]));
  return[
    {name:'책',columns:['제목','부제','저자','옮긴이','출판사','발행일','ISBN','페이지','장르','작품 출처','등록일'],rows:state.books.map(b=>[b.title,b.subtitle,b.authors.join(', '),b.translator,b.publisher,b.publishedDate,b.isbn,b.pageCount,b.genre,b.origin,b.createdAt])},
    {name:'독서 이력',columns:['책','회차','상태','형식','시작일','완독일','읽은 기간(일)','별점','한줄평','읽으려는 이유','중단 이유'],rows:state.readings.map(r=>[books.get(r.bookId)?.title,[...readingsFor(state,r.bookId)].reverse().findIndex(x=>x.id===r.id)+1,STATUSES[r.status],FORMATS[r.format],r.startedAt,r.finishedAt,r.status==='finished'?durationOf(r):null,r.rating,r.oneLiner,r.why,r.stopReason])},
    {name:'노트',columns:['책','구분','상태','제목','핵심 내용','내 생각','나에게 남은 것','질문','해볼 일','메모·인용','위치','인용에 대한 생각','기존 독서록 원문','태그','수정일'],rows:state.notes.map(n=>[books.get(n.bookId)?.title,n.kind==='review'?'감상평':'메모',n.stage==='complete'?'정리 완료':'초안',n.title,n.summary,n.reflection,n.takeaway,n.questions,n.actions,n.text,n.locator,n.comment,n.legacyText,n.tags.join(', '),n.updatedAt])},
    {name:'요약',columns:['항목','값'],rows:Object.entries(summary(state)).map(([key,v])=>[({count:'완독 회수',unique:'서로 다른 책',year:'올해 완독',month:'이번 달 완독',notes:'내용 있는 노트',avgDays:'평균 기간(일)',undated:'완독일 미상',durationSamples:'기간 산출 표본'})[key],v])}
  ];
}
export function csv(columns,rows){
  const cell=v=>{if(v==null)return '';let t=String(v);if(typeof v==='string'&&/^[\s]*[=+@-]|^[\t\r\n]/.test(t))t="'"+t;return /[",\r\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  return '\ufeff'+[columns,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
}
export const xlsx=bookmoryXlsx;
