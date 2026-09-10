import { STATUSES,FORMATS,readingsFor,displayDate,durationOf,cleanExport,summary } from './domain.js';
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
    {name:'독서 이력',columns:['책','회차','상태','형식','시작일','완독일','기간(달력 일수)','별점','한줄평','읽으려는 이유','중단 이유'],rows:state.readings.map(r=>[books.get(r.bookId)?.title,[...readingsFor(state,r.bookId)].reverse().findIndex(x=>x.id===r.id)+1,STATUSES[r.status],FORMATS[r.format],r.startedAt,r.finishedAt,r.status==='finished'?durationOf(r):null,r.rating,r.oneLiner,r.why,r.stopReason])},
    {name:'노트',columns:['책','구분','상태','제목','핵심 내용','내 생각','나에게 남은 것','질문','해볼 일','메모·인용','위치','인용에 대한 생각','기존 독서록 원문','태그','수정일'],rows:state.notes.map(n=>[books.get(n.bookId)?.title,n.kind==='review'?'감상평':'메모',n.stage==='complete'?'정리 완료':'초안',n.title,n.summary,n.reflection,n.takeaway,n.questions,n.actions,n.text,n.locator,n.comment,n.legacyText,n.tags.join(', '),n.updatedAt])},
    {name:'요약',columns:['항목','값'],rows:Object.entries(summary(state)).map(([key,v])=>[({count:'완독 회수',unique:'서로 다른 책',year:'올해 완독',month:'이번 달 완독',notes:'내용 있는 노트',avgDays:'평균 기간(일)',undated:'완독일 미상',durationSamples:'기간 산출 표본'})[key],v])}
  ];
}
export function csv(columns,rows){
  const cell=v=>{if(v==null)return '';let t=String(v);if(typeof v==='string'&&/^[\s]*[=+@-]|^[\t\r\n]/.test(t))t="'"+t;return /[",\r\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  return '\ufeff'+[columns,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
}
// Small store-only ZIP/OOXML exporter. All user strings are inline text, never formulas.
const enc=new TextEncoder();
const xml=s=>String(s??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const col=i=>{let s='';for(;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
function crc(bytes){let c=0xffffffff;for(const x of bytes){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function xlsx(state){
  const sheets=tables(state);
  for(const s of sheets)for(const row of s.rows)for(const v of row)if(typeof v==='string'&&v.length>32767)throw new Error('긴 노트가 있어 Excel 셀 한도를 넘어요. JSON 또는 Markdown으로 내보내 주세요. 원문은 줄이지 않았어요.');
  const relNS='http://schemas.openxmlformats.org/package/2006/relationships';
  const files=[['[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],['_rels/.rels',`<Relationships xmlns="${relNS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],['xl/workbook.xml',`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],['xl/_rels/workbook.xml.rels',`<Relationships xmlns="${relNS}">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`]];
  sheets.forEach((s,i)=>{files.push([`xl/worksheets/sheet${i+1}.xml`,`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols>${s.columns.map((v,j)=>`<col min="${j+1}" max="${j+1}" width="24" customWidth="1"/>`).join('')}</cols><sheetData>${[s.columns,...s.rows].map((row,ri)=>`<row r="${ri+1}">${row.map((v,ci)=>`<c r="${col(ci+1)}${ri+1}"${typeof v==='number'?'':' t="inlineStr"'}>${typeof v==='number'?`<v>${v}</v>`:`<is><t xml:space="preserve">${xml(v)}</t></is>`}</c>`).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${col(s.columns.length)}${s.rows.length+1}"/></worksheet>`]);});
  let offset=0;const chunks=[],central=[];
  for(const [name,value]of files){const n=enc.encode(name),d=enc.encode('<?xml version="1.0" encoding="UTF-8"?>'+value),c=crc(d),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,c,true);v.setUint32(18,d.length,true);v.setUint32(22,d.length,true);v.setUint16(26,n.length,true);h.set(n,30);chunks.push(h,d);const ch=new Uint8Array(46+n.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,c,true);cv.setUint32(20,d.length,true);cv.setUint32(24,d.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);ch.set(n,46);central.push(ch);offset+=h.length+d.length;}
  const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,central.reduce((a,b)=>a+b.length,0),true);ev.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
